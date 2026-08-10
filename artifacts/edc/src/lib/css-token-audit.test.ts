import { describe, expect, it } from "vitest";
import {
  composite,
  compositeAll,
  contrast,
  contrastRgb,
  declaredTokens,
  hslToRgb,
  parseRgbPair,
  relativeLuminance,
  rgbTriplet,
  ruleBody,
  stripComments,
  token,
  tokenOr,
} from "./css-token-audit";

/**
 * The palette suites are only as trustworthy as this module. A `composite()`
 * that blended in the wrong colour space, or a `ruleBody()` that silently
 * returned the wrong block, would produce a confidently green audit of a palette
 * that fails on a phone — which is exactly how the mobile shell went four
 * phases without anyone noticing it had never been measured.
 *
 * So these are known-value tests, not round-trips: every expectation below is
 * a number that can be checked by hand.
 */

const near = (a: number, b: number, eps = 1e-4) => Math.abs(a - b) < eps;

describe("hslToRgb", () => {
  it("converts the achromatic ends and a saturated primary", () => {
    expect(hslToRgb("0 0% 100%")).toEqual([1, 1, 1]);
    expect(hslToRgb("0 0% 0%")).toEqual([0, 0, 0]);
    expect(hslToRgb("0 100% 50%")).toEqual([1, 0, 0]);
    expect(hslToRgb("120 100% 50%")).toEqual([0, 1, 0]);
    expect(hslToRgb("240 100% 50%")).toEqual([0, 0, 1]);
  });

  it("wraps hue at 360 so a full turn lands back on the same colour", () => {
    // Guards the `% 6` segment index: an unwrapped hue of 360 indexes past the
    // table and yields undefined channels rather than red.
    expect(hslToRgb("360 100% 50%")).toEqual(hslToRgb("0 100% 50%"));
  });

  it("ignores an alpha suffix rather than folding it into a channel", () => {
    expect(hslToRgb("0 0% 100% / 0.5")).toEqual([1, 1, 1]);
  });
});

describe("relativeLuminance and contrast", () => {
  it("anchors on the WCAG reference values", () => {
    expect(relativeLuminance([1, 1, 1])).toBe(1);
    expect(relativeLuminance([0, 0, 0])).toBe(0);
    // The canonical maximum: (1 + 0.05) / (0 + 0.05).
    expect(contrast("0 0% 100%", "0 0% 0%")).toBe(21);
  });

  it("is symmetric, and bottoms out at 1 against itself", () => {
    expect(contrast("226 78% 52%", "0 0% 100%")).toBeCloseTo(contrast("0 0% 100%", "226 78% 52%"), 10);
    expect(contrast("226 78% 52%", "226 78% 52%")).toBe(1);
  });
});

describe("composite", () => {
  it("blends source-over in sRGB, not linear light", () => {
    // 80% white over black is 0.8 per channel in sRGB. In linear light it would
    // land near 0.906 after re-encoding — a materially different number, and the
    // wrong one, since CSS composites plain colour layers in sRGB.
    const out = composite([1, 1, 1], 0.8, [0, 0, 0]);
    expect(out.every((c) => near(c, 0.8))).toBe(true);
  });

  it("is a no-op at alpha 0 and total at alpha 1", () => {
    const over: [number, number, number] = [0.2, 0.4, 0.6];
    expect(composite([1, 0, 0], 0, over)).toEqual(over);
    expect(composite([1, 0, 0], 1, over)).toEqual([1, 0, 0]);
  });

  it("clamps out-of-range alpha instead of extrapolating", () => {
    const over: [number, number, number] = [0, 0, 0];
    expect(composite([1, 1, 1], 1.4, over)).toEqual([1, 1, 1]);
    expect(composite([1, 1, 1], -0.3, over)).toEqual(over);
  });

  it("stacks layers bottom-up", () => {
    // Two 50% white layers over black: 0.5, then 0.75.
    const out = compositeAll([0, 0, 0], [
      { rgb: [1, 1, 1], alpha: 0.5 },
      { rgb: [1, 1, 1], alpha: 0.5 },
    ]);
    expect(out.every((c) => near(c, 0.75))).toBe(true);
  });

  it("lowers measured contrast when a light layer covers a dark backdrop", () => {
    // The property the glass audit depends on: white text over glass over a dark
    // card reads *worse* than white text on the dark card alone.
    const onCard = contrastRgb([1, 1, 1], [0.05, 0.05, 0.06]);
    const onGlass = contrastRgb([1, 1, 1], composite([1, 1, 1], 0.62, [0.05, 0.05, 0.06]));
    expect(onGlass).toBeLessThan(onCard);
  });
});

describe("rgbTriplet and parseRgbPair", () => {
  const body = `
    --m-glass-rgb: 255 255 255;
    --m-glass-alpha: 0.8;
  `;

  it("reads the channel form used by every --*-rgb token", () => {
    expect(rgbTriplet("255 255 255")).toEqual([1, 1, 1]);
    expect(rgbTriplet("0, 128, 255")[1]).toBeCloseTo(128 / 255, 10);
  });

  it("rejects a value that isn't three channels", () => {
    expect(() => rgbTriplet("255 255")).toThrow(/not an rgb triplet/);
    expect(() => rgbTriplet("white")).toThrow(/not an rgb triplet/);
  });

  it("pairs the rgb and alpha declarations", () => {
    expect(parseRgbPair(body, "m-glass")).toEqual({ rgb: [1, 1, 1], alpha: 0.8 });
  });

  it("accepts an alpha override so one material can be measured at another's weight", () => {
    expect(parseRgbPair(body, "m-glass", 0.62).alpha).toBe(0.62);
  });
});

describe("ruleBody", () => {
  const css = `
    :root { --background: 0 0% 100%; }
    :root[data-time-band="night"] { --background: 225 22% 96%; }
    .dark { --background: 0 0% 4%; }
    @media (prefers-contrast: more) {
      :root { --background: 0 0% 100%; --border: 0 0% 40%; }
    }
  `;

  it("matches the selector literally, so punctuation disambiguates", () => {
    // ":root {" must find the bare rule, not the attribute-qualified one that
    // also starts with ":root".
    expect(token(ruleBody(css, ":root {"), "background")).toBe("0 0% 100%");
    expect(token(ruleBody(css, `:root[data-time-band="night"]`), "background")).toBe("225 22% 96%");
  });

  it("reaches a selector that repeats inside an at-rule via `after`", () => {
    const inMedia = ruleBody(css, ":root {", { after: "@media (prefers-contrast: more)" });
    expect(token(inMedia, "border")).toBe("0 0% 40%");
  });

  it("brace-matches rather than stopping at the first close brace", () => {
    const nested = `@media x { .a { --p: 1; } .b { --q: 2; } }`;
    expect(ruleBody(nested, "@media x")).toContain("--q: 2");
  });

  it("throws a named error rather than returning an empty block", () => {
    // A silent empty return is how an audit passes vacuously.
    expect(() => ruleBody(css, ".nope")).toThrow(/selector not found/);
    expect(() => ruleBody(css, ":root {", { after: "@media (nope)" })).toThrow(/anchor not found/);
    expect(() => ruleBody(".a { --p: 1;", ".a")).toThrow(/unbalanced braces/);
  });
});

describe("token", () => {
  it("ignores a commented-out declaration", () => {
    const body = `/* --primary: 0 0% 0%; */ --primary: 226 78% 52%;`;
    expect(token(body, "primary")).toBe("226 78% 52%");
  });

  it("throws on an absent token, and tokenOr reports null", () => {
    expect(() => token("--a: 1;", "b")).toThrow(/--b not declared/);
    expect(tokenOr("--a: 1;", "b")).toBeNull();
  });

  it("strips comments without eating the surrounding declarations", () => {
    expect(stripComments("--a: 1; /* x */ --b: 2;")).toBe("--a: 1;  --b: 2;");
  });
});

describe("declaredTokens", () => {
  it("enumerates only the body's own declarations, not a nested block's", () => {
    // The completeness guard depends on this: counting a nested block's tokens
    // would demand assertions for properties that aren't part of the palette.
    const body = `
      --background: 0 0% 100%;
      --card: 0 0% 99%;
      /* --retired: 0 0% 50%; */
      &:hover { --hovered: 0 0% 90%; }
    `;
    expect(declaredTokens(body)).toEqual(["background", "card"]);
  });
});
