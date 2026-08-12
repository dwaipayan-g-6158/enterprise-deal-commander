import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { SRC } from "./module-graph";

/**
 * Nothing in the mobile shell may rubber-band.
 *
 * The bottom bars bouncing on iOS took several passes because two different
 * mechanisms can move them and only the second is the bounce:
 *
 *   1. The dock taking a copy of the pull transform (removed — pull-physics.ts).
 *   2. The dock being `position: fixed` inside the scroller, which WebKit
 *      composites with the list (removed — m-dock.tsx).
 *   3. **The document itself rubber-banding.** iOS translates the whole web view
 *      to do it, so every bottom-anchored bar moves regardless of how it is
 *      positioned or which subtree it is in. This is the one that survived 1 and 2.
 *
 * On Deals it fires on every drag, because a typical pipeline underfills the
 * viewport and `main` has no scroll range, so no drag there is ever a scroll.
 *
 * Both halves are asserted: the document must not bounce, and the inner scroller
 * must not bounce on its own either (`none`, not `contain` — `contain` blocks only
 * the chaining).
 */

const MOBILE = join(SRC, "mobile");
const read = (rel: string) => readFileSync(join(MOBILE, rel), "utf8");
const strip = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

describe("the document cannot rubber-band", () => {
  const sheets = ["styles/material.css", "styles/tokens.css", "styles/motion.css", "styles/type.css"]
    .map((f) => strip(read(f)))
    .join("\n");

  it("sets overscroll-behavior: none on html and body", () => {
    // Matched on the declaration rather than a specific selector shape, so
    // reformatting the rule does not fail the test — but losing it does.
    expect(sheets).toMatch(/html\s*,\s*body\s*\{[^}]*overscroll-behavior:\s*none/);
  });

  it("keeps that rule in a MOBILE stylesheet, which is what scopes it", () => {
    /**
     * These sheets are imported at the lazy mobile chunk's entry, so they only
     * load on a phone viewport. That is the entire scoping mechanism for a rule
     * that targets `html` — move it to index.css and it would take desktop's
     * elastic scrolling with it.
     */
    expect(strip(read("styles/material.css"))).toMatch(
      /html\s*,\s*body\s*\{[^}]*overscroll-behavior:\s*none/,
    );
    const eager = readFileSync(join(SRC, "index.css"), "utf8");
    expect(eager).not.toMatch(/overscroll-behavior:\s*none/);
  });

  it("does not reach for the pre-iOS-16 body lock", () => {
    // `position: fixed` + `overflow: hidden` on body would also lock /login,
    // which loads this same chunk and manages its own height.
    const material = strip(read("styles/material.css"));
    const htmlBody = material.slice(material.indexOf("html,"), material.indexOf("}", material.indexOf("html,")));
    expect(htmlBody).not.toMatch(/position:\s*fixed/);
    expect(htmlBody).not.toMatch(/overflow:\s*hidden/);
  });
});

describe("the shell's scroller cannot rubber-band either", () => {
  const shell = strip(read("shell/m-shell.tsx"));

  it("uses overscroll-y-none, not overscroll-y-contain", () => {
    expect(shell).toContain("overscroll-y-none");
    expect(shell, "contain blocks chaining but still bounces locally").not.toContain(
      "overscroll-y-contain",
    );
  });

  it("still scrolls", () => {
    // Suppressing the bounce must not suppress the scrolling.
    expect(shell).toMatch(/overflow-y-auto[^"]*overscroll-y-none/);
  });
});

describe("pull-to-refresh survives the change", () => {
  const pull = strip(read("components/pull-to-refresh.tsx"));

  it("drives itself from touchmove with its own preventDefault", () => {
    // This is why `overscroll-behavior: none` costs the gesture nothing: it never
    // used the native overscroll in the first place.
    expect(pull).toContain("preventDefault");
    expect(pull).toMatch(/addEventListener\("touchmove"[^)]*passive:\s*false/);
  });
});
