import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { stripCodeComments } from "./mobile/class-scan";

/**
 * Keyboard and touch affordances that live in the shells rather than in any one
 * screen, and that no screen-level test would ever look for.
 *
 * Both shells are covered here on purpose. `ShellGate` picks one at runtime, so
 * a skip link in only one of them is a skip link that half the users never get —
 * and it was mobile-only for exactly one deploy before this file existed.
 */

const SRC = import.meta.dirname;

const SHELLS = [
  {
    name: "mobile shell",
    file: join(SRC, "mobile", "shell", "m-shell.tsx"),
    anchor: "m-main",
  },
  {
    name: "desktop layout",
    file: join(SRC, "components", "layout.tsx"),
    anchor: "main",
  },
] as const;

describe("skip link", () => {
  for (const shell of SHELLS) {
    describe(shell.name, () => {
      /**
       * Comments stripped before every assertion below.
       *
       * Both shells explain their skip link in prose that quotes the very class
       * names being checked — `focus:not-sr-only` appears in layout.tsx's own
       * comment. Scanning the raw file made the "becomes visible when focused"
       * assertion pass after that class had been deleted from the className,
       * which is the exact regression it exists to catch.
       */
      const source = stripCodeComments(readFileSync(shell.file, "utf8"));

      it("offers one, pointing at this shell's own main", () => {
        expect(source).toContain(`href="#${shell.anchor}"`);
        expect(source).toContain(`id="${shell.anchor}"`);
      });

      it("becomes visible when focused", () => {
        /**
         * The half that is easy to leave out and that makes the rest useless.
         *
         * `sr-only` alone hides the link from sight even while it holds focus,
         * so a sighted keyboard user tabs once and the focus ring vanishes with
         * no indication of where it went — worse than having no skip link,
         * because the first Tab now appears to do nothing.
         */
        expect(source).toContain("focus:not-sr-only");
      });

      it("can actually receive focus at the target", () => {
        // Without tabIndex={-1} the browser moves the URL fragment but leaves
        // focus where it was, so the next Tab continues from the nav anyway and
        // the link silently accomplishes nothing.
        expect(source).toMatch(/tabIndex=\{-1\}/);
      });
    });
  }

  it("gives the two shells different anchors", () => {
    // They never mount together, but a shared id would make the assertions
    // above pass while one shell's link pointed into the other's markup.
    const anchors = new Set(SHELLS.map((s) => s.anchor));
    expect(anchors.size).toBe(SHELLS.length);
  });
});

describe("touch targets", () => {
  const MATERIAL = readFileSync(join(SRC, "mobile", "styles", "material.css"), "utf8");

  it("removes the double-tap delay on every tap target", () => {
    // `manipulation`, never `none`: none would also kill panning, and anything
    // reaching the left edge must leave horizontal drags to the iOS back
    // gesture (see .m-edge-guard).
    expect(MATERIAL).toMatch(/\.m-tap\s*\{[^}]*touch-action:\s*manipulation/s);
    expect(MATERIAL).not.toMatch(/\.m-tap\s*\{[^}]*touch-action:\s*none/s);
  });
});
