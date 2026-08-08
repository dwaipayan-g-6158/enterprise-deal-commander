import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Guards the login page's entrance motion.
 *
 * This package has no DOM test environment (vitest.config.ts sets
 * environment: "node" and only collects *.test.ts), so these read the source
 * the same way login-iframe-css.test.ts does. That is enough, because every
 * invariant worth guarding here is textual:
 *
 * - The glow is the page's only infinite animation. index.css's global
 *   reduced-motion rule clamps animation-duration to 0.01ms and iteration
 *   count to 1, which does NOT stop a loop — it collapses it into one
 *   instantaneous jump to scale(1.14) and back. On the screen where someone
 *   asked for less movement that is a visible pop, so the animation has to be
 *   removed outright. That is a one-line fix and a silent regression; hence a
 *   test rather than a comment.
 * - The card wraps Catalyst's cross-origin auth iframe AND collapses from the
 *   340px skeleton reservation to the real frame height. Its entrance must
 *   stay transform-only or those two land on the same property.
 * - The cascade only reads as one gesture if --j is contiguous from 0. A gap
 *   shows up as a stalled beat mid-panel, which is easy to introduce by
 *   reordering the rail and hard to notice in review.
 */

const SRC = path.join(__dirname, "..");
const CSS = readFileSync(path.join(SRC, "index.css"), "utf8");
const LOGIN = readFileSync(path.join(SRC, "pages", "login.tsx"), "utf8");

/** Body text of every `@media (prefers-reduced-motion: reduce)` block. */
function reducedMotionBlocks(css: string): string[] {
  const blocks: string[] = [];
  const re = /@media\s*\(prefers-reduced-motion:\s*reduce\)\s*\{/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(css))) {
    let depth = 1;
    let i = re.lastIndex;
    while (i < css.length && depth > 0) {
      if (css[i] === "{") depth++;
      else if (css[i] === "}") depth--;
      i++;
    }
    blocks.push(css.slice(re.lastIndex, i - 1));
  }
  return blocks;
}

/** The declaration body of a top-level `.selector { ... }` rule. */
function ruleBody(css: string, selector: string): string | null {
  const idx = css.indexOf(selector + " {");
  if (idx === -1) return null;
  const open = css.indexOf("{", idx);
  const close = css.indexOf("}", open);
  return css.slice(open + 1, close);
}

const RM = reducedMotionBlocks(CSS).join("\n");
const ANIMATED_CLASSES = [".login-card-enter", ".login-rise", ".login-wordmark", ".login-glow"];

describe("login entrance — index.css", () => {
  it("defines every class the login page applies", () => {
    for (const cls of ANIMATED_CLASSES) {
      expect(ruleBody(CSS, cls), `${cls} is missing`).not.toBeNull();
    }
  });

  it("gives every animated class a reduced-motion rule", () => {
    for (const cls of ANIMATED_CLASSES) {
      expect(RM, `${cls} has no prefers-reduced-motion rule`).toContain(cls);
    }
  });

  it("has exactly one infinite animation, and it is the glow", () => {
    const infinite = ANIMATED_CLASSES.filter((cls) =>
      (ruleBody(CSS, cls) ?? "").includes("infinite"),
    );
    expect(infinite).toEqual([".login-glow"]);
  });

  it("REMOVES the infinite glow under reduced motion rather than clamping it", () => {
    // The global clamp above cannot do this job: it only overrides
    // animation-duration / iteration-count, so the animation still runs — once,
    // instantly — and the glow visibly jumps. Only animation-name: none stops it.
    const glowRule = ruleBody(RM, ".login-glow");
    expect(glowRule, ".login-glow is not in a reduced-motion block").not.toBeNull();
    expect(glowRule).toMatch(/animation:\s*none/);
  });

  it("keeps the card entrance transform-only", () => {
    // Animating height would collide with the card's 340px skeleton collapse,
    // and with the iframe's own height transition inside it.
    const frames = CSS.slice(CSS.indexOf("@keyframes login-card-enter"));
    const body = frames.slice(0, frames.indexOf("\n}\n") + 2);
    expect(body).not.toMatch(/(^|[^-])height\s*:/m);
    expect(body).not.toMatch(/\b(width|margin|padding|top|left)\s*:/);
  });

  it("keeps the rail's overshoot gentler than the card's", () => {
    // Seven elements bouncing as hard as the card reads as jitter, not
    // choreography. If someone raises this, it should be a deliberate edit.
    const card = ruleBody(CSS, ".login-card-enter") ?? "";
    expect(card).toBeTruthy();
    const cardPeak = Number(/scale\(1\.03\)/.exec(CSS)?.[0].match(/[\d.]+/)?.[0] ?? 0);
    const railPeak = Number(/scale\(1\.006\)/.exec(CSS)?.[0].match(/[\d.]+/)?.[0] ?? 0);
    expect(railPeak).toBeGreaterThan(1);
    expect(railPeak).toBeLessThan(cardPeak);
  });
});

describe("login entrance — login.tsx", () => {
  it("animates the brand mark instead of freezing it", () => {
    // The mark's draw-on lives in EdcLogoMark and was switched off here.
    // Turning it back off would silently remove the only part of the entrance
    // that survives on mobile, where the rail is display:none.
    expect(LOGIN).not.toContain("animated={false}");
    expect(LOGIN).toContain("timeScale={LOGO_TIME_SCALE}");
  });

  it("applies the entrance classes to the right elements", () => {
    expect(LOGIN).toContain("login-glow pointer-events-none");
    expect(LOGIN).toContain("login-card-enter rounded-2xl");
    expect(LOGIN).toMatch(/login-wordmark[\s\S]*login-wordmark/); // rail + mobile lockup
  });

  it("staggers the rail with a contiguous --j sequence starting at 0", () => {
    const literals = [...LOGIN.matchAll(/"--j":\s*(\d+)\s*}/g)].map((m) => Number(m[1]));
    // Three fixed rail elements, then bullets at 3 + i, then the footer.
    expect(literals).toEqual([0, 1, 2]);
    expect(LOGIN).toContain('"--j": 3 + i');
    expect(LOGIN).toContain('"--j": 3 + HIGHLIGHTS.length');

    // The footer must land immediately after the last bullet — deriving it
    // from HIGHLIGHTS.length is what keeps that true if a highlight is added.
    const highlights = LOGIN.slice(LOGIN.indexOf("const HIGHLIGHTS"));
    const count = (highlights.slice(0, highlights.indexOf("];")).match(/\{\s*icon:/g) ?? []).length;
    expect(count).toBeGreaterThan(0);
    const indices = [0, 1, 2, ...Array.from({ length: count }, (_, i) => 3 + i), 3 + count];
    expect(indices).toEqual([...new Set(indices)]);
    expect(indices).toEqual([...indices].sort((a, b) => a - b));
    expect(Math.max(...indices) - Math.min(...indices)).toBe(indices.length - 1);
  });
});
