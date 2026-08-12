import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { SRC } from "./module-graph";

/**
 * Chrome that is lifted out of the route transition must give that up while a
 * modal is covering the app.
 *
 * A `view-transition-name` moves an element into its own group, and the whole
 * pseudo tree paints ABOVE the top layer — so a named bar escapes any modal that
 * was covering it. The sheet is captured inside the root snapshot and cannot win,
 * whatever its z-index says.
 *
 * Reported on Deals as "choosing a filter or sort flashes the bottom bar":
 * selecting an option pushes a new query and deliberately leaves the sheet open,
 * so a lateral transition runs underneath it and the dock, tab bar and capsule
 * were all painted over the top of it.
 *
 * The invariant worth a test is not "the rule exists" — it is that the rule covers
 * EVERY name. A new `m-vt-` name that nobody adds here is a flash that no review
 * would catch, because it only appears for ~200ms and only with a sheet open.
 */

const MOBILE = join(SRC, "mobile");
const strip = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, "");
const motion = strip(readFileSync(join(MOBILE, "styles/motion.css"), "utf8"));

/** Every rule that GIVES something a name, as `[selector, name]`. */
function namedRules(css: string): [string, string][] {
  const out: [string, string][] = [];
  const rule = /([^{}]+)\{([^}]*)\}/g;
  let m: RegExpExecArray | null;
  while ((m = rule.exec(css))) {
    const [, selector, body] = m;
    const declared = /view-transition-name:\s*([\w-]+)/.exec(body);
    if (declared && declared[1] !== "none") out.push([selector.trim(), declared[1]]);
  }
  return out;
}

/** The rule that takes the names away, or null. */
function suppressionRule(css: string): string | null {
  const rule = /([^{}]+)\{([^}]*)\}/g;
  let m: RegExpExecArray | null;
  while ((m = rule.exec(css))) {
    if (/view-transition-name:\s*none/.test(m[2])) return m[1].trim();
  }
  return null;
}

describe("view-transition names under a modal", () => {
  it("declares at least the four chrome names, so the check below has teeth", () => {
    // A guard on the guard: if the extraction silently matched nothing, every
    // coverage assertion would pass vacuously.
    const names = namedRules(motion).map(([, name]) => name);
    expect(names).toEqual(expect.arrayContaining(["m-navbar", "m-tabbar", "m-capsule", "m-dock"]));
  });

  it("suppresses every declared name while a dialog is open", () => {
    const suppression = suppressionRule(motion);
    expect(suppression, "no rule sets view-transition-name: none").not.toBeNull();
    for (const [selector] of namedRules(motion)) {
      // The selector that declares the name is a bare class; the suppression rule
      // has to mention that same class.
      const cls = selector.replace(/^\./, "");
      expect(suppression, `${cls} keeps its name under a modal and will paint over it`).toContain(
        cls,
      );
    }
  });

  it("keys on an OPEN dialog, not merely a present one", () => {
    const suppression = suppressionRule(motion) ?? "";
    // Radix leaves the element mounted through its close animation with
    // data-state="closed"; matching on presence alone would suppress the names
    // for a transition that has nothing covering it.
    expect(suppression).toMatch(/\[data-state="open"\]/);
    expect(suppression).toMatch(/role="(dialog|alertdialog)"/);
    expect(suppression).toContain(":has(");
  });

  it("keeps the names themselves in the mobile chunk, which is what scopes them", () => {
    // Same argument as overscroll.test.ts: these sheets only load on a phone
    // viewport, so a rule here cannot reach the desktop shell. A name declared in
    // index.css would apply to both and could not be suppressed by this rule.
    const eager = readFileSync(join(SRC, "index.css"), "utf8");
    expect(eager).not.toMatch(/view-transition-name:/);
  });
});
