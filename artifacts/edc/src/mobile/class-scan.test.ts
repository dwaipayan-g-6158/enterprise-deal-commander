import { describe, expect, it } from "vitest";
import {
  classNameExpressions,
  classWorlds,
  expandTernaries,
  findTypeCollisions,
  stripCodeComments,
} from "./class-scan";

/**
 * The type-ladder guard is only as good as this scanner, so these are the tests
 * that matter most in the pair.
 *
 * An over-eager expander invents class combinations that never render; a blind
 * one reports mutually exclusive branches as stacked. Either way the next person
 * to hit a false positive deletes the suite rather than the bug, and every real
 * finding goes with it.
 */

const tidy = (s: string) => s.replace(/\s+/g, " ").trim();

describe("classNameExpressions", () => {
  it("reads both the quoted and the braced form", () => {
    expect(classNameExpressions(`<p className="m-body m-muted">x</p>`)).toEqual(["m-body m-muted"]);
    expect(classNameExpressions(`<p className={cn("m-body", x)}>x</p>`)).toEqual([`cn("m-body", x)`]);
  });

  it("returns a braced expression whole, across lines", () => {
    // A per-string-literal scan would miss `cn("m-caption", dense && "text-xs")`
    // entirely — the split form is the one authors write without noticing.
    const src = `<p\n  className={cn(\n    "m-caption",\n    dense && "text-xs",\n  )}\n/>`;
    expect(tidy(classNameExpressions(src)[0])).toBe(`cn( "m-caption", dense && "text-xs", )`);
  });

  it("does not stop at a brace inside a string literal", () => {
    const src = `<p className={cn("after:content-['{']", "m-body")} />`;
    expect(classNameExpressions(src)[0]).toBe(`cn("after:content-['{']", "m-body")`);
  });

  it("does not let one className swallow the next", () => {
    const src = `<p className={cn("m-title")}>{v}</p>\n<p className="m-headline" />`;
    expect(classNameExpressions(src)).toEqual([`cn("m-title")`, "m-headline"]);
  });

  it("survives an apostrophe in ordinary JSX prose", () => {
    // Regression, and the nastiest one here. Tracking quote state across the
    // whole file reads the apostrophe in "Here's" as opening a string literal,
    // which misclassifies every brace after it — so one className swallowed the
    // next two hundred lines and reported collisions between classes sitting on
    // entirely different elements.
    const src = [
      `<p className="m-body">Here's what needs you</p>`,
      `<p className={cn("m-caption")}>{count}</p>`,
      `<p className="m-title">Don't panic</p>`,
    ].join("\n");
    expect(classNameExpressions(src)).toEqual(["m-body", `cn("m-caption")`, "m-title"]);
    expect(findTypeCollisions(src)).toEqual([]);
  });

  it("survives an apostrophe inside a comment within the expression", () => {
    // Same failure, one level down and harder to see: the comment is INSIDE the
    // cn(), so the fake string opens after brace depth is already 1 and the
    // closing brace is never recognised. This is the form that actually shipped
    // in mobile-header.tsx.
    const src = [
      `<div className={cn(`,
      `  // lifts the bar out of the route transition's root snapshot`,
      `  "min-w-0", collapsed && "m-nav-title",`,
      `)}>`,
      `  <h1 className="m-title">{title}</h1>`,
      `  <p className="m-caption m-muted">{subtitle}</p>`,
      `</div>`,
    ].join("\n");

    expect(classNameExpressions(src).map((e) => e.replace(/\s+/g, " ").trim())).toEqual([
      `cn( "min-w-0", collapsed && "m-nav-title", )`,
      "m-title",
      "m-caption m-muted",
    ]);
    expect(findTypeCollisions(src)).toEqual([]);
  });
});

describe("stripCodeComments", () => {
  it("removes line and block comments but keeps the code", () => {
    expect(stripCodeComments(`cn("a") // it's fine`).trim()).toBe(`cn("a")`);
    expect(stripCodeComments(`cn(/* don't */ "a")`).replace(/\s+/g, " ")).toBe(`cn( "a")`);
  });

  it("leaves comment-like text inside a string alone", () => {
    // A Tailwind arbitrary value can legitimately contain a slash.
    expect(stripCodeComments(`cn("w-1/2", "bg-black/40")`)).toBe(`cn("w-1/2", "bg-black/40")`);
  });
});

describe("expandTernaries", () => {
  const worlds = (e: string) => expandTernaries(e).map(tidy);

  it("splits a conditional into its two branches, keeping what surrounds it", () => {
    expect(worlds(`cn("mt-1", big ? "m-title" : "m-headline m-muted")`)).toEqual([
      `cn("mt-1", big "m-title" )`,
      `cn("mt-1", big "m-headline m-muted")`,
    ]);
  });

  it("leaves a non-conditional expression alone", () => {
    expect(worlds(`cn("m-caption", dense && "text-xs")`)).toEqual([`cn("m-caption", dense && "text-xs")`]);
  });

  it("expands nested conditionals into every reachable world", () => {
    expect(worlds(`a ? "m-title" : b ? "m-headline" : "m-body"`)).toEqual([
      `a "m-title"`,
      `a b "m-headline"`,
      `a b "m-body"`,
    ]);
  });

  it("is not fooled by ?. / ?? or by a colon inside a string", () => {
    expect(worlds(`cn(x?.y ?? "m-body")`)).toEqual([`cn(x?.y ?? "m-body")`]);
    expect(worlds(`cn("m-body after:content-['x:y']")`)).toEqual([`cn("m-body after:content-['x:y']")`]);
  });
});

describe("classWorlds", () => {
  it("expands every expression, not just the first few", () => {
    // Regression: `.flatMap(expandTernaries)` passes (element, index, array),
    // so the array INDEX arrived as the recursion-depth argument and every
    // expression past index 6 silently returned unexpanded. The guard stayed
    // green on the files it had already stopped reading properly.
    const src = Array.from(
      { length: 12 },
      (_, i) => `<p className={cn("p-${i}", f ? "m-title" : "m-headline")} />`,
    ).join("\n");

    const stacked = classWorlds(src).filter(
      (w) => w.includes("m-title") && w.includes("m-headline"),
    );
    expect(stacked).toEqual([]);
    expect(classWorlds(src)).toHaveLength(24); // 12 expressions × 2 branches
  });
});

describe("findTypeCollisions", () => {
  it("reports a rung paired with a utility that sets the same property", () => {
    const findings = findTypeCollisions(`<p className="m-caption font-normal" />`);
    expect(findings).toHaveLength(1);
    expect(findings[0].message).toMatch(/"m-caption" already sets font-weight, so "font-normal"/);
  });

  it("reports a collision split across arguments of one cn()", () => {
    const findings = findTypeCollisions(`<p className={cn("m-caption", dense && "text-xs")} />`);
    expect(findings[0].message).toMatch(/font-size/);
  });

  it("reports two rungs stacked in one literal", () => {
    const findings = findTypeCollisions(`<p className="m-title m-headline" />`);
    expect(findings[0].message).toBe("stacks m-title + m-headline on one element");
  });

  it("stays silent on the forms that are correct", () => {
    // Exclusive branches; colour beside a rung; a rung alone.
    expect(findTypeCollisions(`<p className={cn(big ? "m-title" : "m-headline m-muted")} />`)).toEqual([]);
    expect(findTypeCollisions(`<p className="m-body text-destructive" />`)).toEqual([]);
    expect(findTypeCollisions(`<p className="m-label m-muted mt-1 px-2" />`)).toEqual([]);
    // A utility with no rung present is not this suite's business.
    expect(findTypeCollisions(`<p className="text-xs font-medium" />`)).toEqual([]);
  });
});
