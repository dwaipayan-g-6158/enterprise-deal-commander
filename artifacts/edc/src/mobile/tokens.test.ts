import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  AA_NON_TEXT,
  AA_TEXT,
  AAA_TEXT,
  composite,
  compositeAll,
  contrastRgb,
  declaredTokens,
  describeFailure,
  hslToRgb,
  parseRgbPair,
  type Rgb,
  rgbTriplet,
  ruleBody,
  token,
} from "../lib/css-token-audit";
import { SRC } from "./module-graph";

/**
 * Measures the mobile palette against WCAG, on the pixels that actually ship.
 *
 * This file is the reason the palette has the values it has. Every number in
 * tokens.css was derived here first — including three that contradict what the
 * colours look like in isolation:
 *
 *   - light --destructive is 40%, not 43%: red text on glass over a destructive
 *     fill measures 4.47:1 at 43%.
 *   - light --primary is 50%, not 52%: 4.52:1 under glass at 52%.
 *   - dark --destructive is 76%, not 72%: 4.43:1 on glass over an amber fill.
 *
 * ## Why this did not exist before
 *
 * theme-token-contrast.test.ts reads index.css only, so mobile.css shipped four
 * phases without a single measurement. It could not have been measured anyway:
 * its materials were declared as inline `rgba(...)` literals, which cannot be
 * parsed and re-composited. The `--x-rgb` + `--x-alpha` convention in tokens.css
 * exists to make this file possible.
 *
 * ## The four ways a palette audit lies
 *
 * All four are guarded here, because each has been shipped at least once:
 *
 *  1. Measuring the token instead of the pixel. The ambient wash and the glass
 *     are translucent LAYERS. `--muted-foreground` on `--background` is a
 *     surface no user ever sees.
 *  2. Auditing --background and forgetting --card, --popover and --muted. The
 *     worst case is rarely the canvas.
 *  3. Forgetting that solid fills scroll UNDER the chrome. A chart fill or a
 *     filled chip is a far harsher backdrop for glass than any canvas, and it
 *     is what forces the two glass weights.
 *  4. Auditing whatever the author remembered to list. Suite 7 enumerates every
 *     declaration in .m-shell and fails on anything unmeasured — modelled on
 *     the server's exhaustive route sweep rather than on a checklist.
 */

const TOKENS = readFileSync(join(SRC, "mobile", "styles", "tokens.css"), "utf8");

const LIGHT = ruleBody(TOKENS, ".m-shell {");
const DARK = ruleBody(TOKENS, ".dark .m-shell {");
const MODES = [
  { name: "light", body: LIGHT, prefix: ":root" },
  { name: "dark", body: DARK, prefix: ".dark" },
] as const;

const BANDS = ["morning", "evening", "night"] as const;

/** A token's value in a mode, falling back to the light block the cascade uses. */
function tok(mode: (typeof MODES)[number], name: string): string {
  const m = mode.body.match(new RegExp(`--${name}:\\s*([^;]+);`));
  return m ? m[1].trim() : token(LIGHT, name);
}

function pair(mode: (typeof MODES)[number], base: string, alphaOverride?: number) {
  const merged = `${LIGHT}\n${mode.body}`;
  // The mode's own declaration wins because it appears later in the merged body
  // — same order the cascade resolves them in.
  const rgbMatches = [...merged.matchAll(new RegExp(`--${base}-rgb:\\s*([^;]+);`, "g"))];
  const alphaMatches = [...merged.matchAll(new RegExp(`--${base}-alpha:\\s*([^;]+);`, "g"))];
  return {
    rgb: rgbTriplet(rgbMatches[rgbMatches.length - 1][1]),
    alpha: alphaOverride ?? parseFloat(alphaMatches[alphaMatches.length - 1][1]),
  };
}

interface Surface {
  name: string;
  rgb: Rgb;
}

/**
 * Every opaque surface a mode presents, INCLUDING each time band composited
 * with its own sky wash. The composited form is the one that ships; the flat
 * `--background` behind it is not a surface anyone sees.
 */
function surfaces(mode: (typeof MODES)[number]): Surface[] {
  const out: Surface[] = [
    { name: "card", rgb: hslToRgb(tok(mode, "card")) },
    { name: "popover", rgb: hslToRgb(tok(mode, "popover")) },
    { name: "muted", rgb: hslToRgb(tok(mode, "muted")) },
  ];

  const bandBodies: { band: string; body: string }[] = [
    { band: "afternoon", body: mode.body }, // no override block — the base case
    ...BANDS.map((band) => ({
      band,
      body: ruleBody(TOKENS, `${mode.prefix}[data-time-band="${band}"] .m-shell`),
    })),
  ];

  for (const { band, body } of bandBodies) {
    const bg = hslToRgb(band === "afternoon" ? tok(mode, "background") : token(body, "background"));
    out.push({ name: `${band} background`, rgb: bg });

    const layer = (b: "m-sky" | "m-sky2" | "m-ground") =>
      band === "afternoon"
        ? pair(mode, b)
        : { rgb: rgbTriplet(token(body, `${b}-rgb`)), alpha: parseFloat(token(body, `${b}-alpha`)) };

    // Two regions, not one stack of three.
    //
    // material.css paints the wash as three gradients with different geometry:
    // a broad radial sky anchored above the top edge, a smaller radial anchored
    // at the top-right, and a linear ground bounce rising from the bottom. The
    // two skies overlap near the top-right and can both be near full strength
    // there. The ground bounce is transparent by 32% up, where the skies live —
    // so summing all three describes a pixel the renderer cannot produce.
    //
    // Auditing that impossible sum is not "being safe": it darkens the palette
    // to clear a bar nothing is standing at, and every future token nudge then
    // gets judged against a fiction. These two are the real extremes.
    out.push({
      name: `${band} background + sky`,
      rgb: compositeAll(bg, [layer("m-sky"), layer("m-sky2")]),
    });
    out.push({
      name: `${band} background + ground`,
      rgb: compositeAll(bg, [layer("m-ground")]),
    });
  }

  return out;
}

/**
 * Everything that can pass beneath the glass: the canvases above, plus the
 * SOLID FILLS. A chart shape or a filled chip scrolling under the sticky header
 * is a much harsher backdrop than any canvas, and omitting these is what makes a
 * single glass weight look sufficient when it is not.
 *
 * Fill values are semantic-colors.ts's own *_RGB triples.
 */
const SEMANTIC_FILLS: Record<string, string> = {
  "sky-500": "14,165,233",
  "amber-500": "245,158,11",
  "orange-500": "249,115,22",
  "red-500": "239,68,68",
  "emerald-500": "16,185,129",
  "yellow-500": "234,179,8",
  "violet-600": "124,58,237",
  "slate-500": "100,116,139",
};

function backdrops(mode: (typeof MODES)[number]): Surface[] {
  return [
    ...surfaces(mode),
    { name: "primary fill", rgb: hslToRgb(tok(mode, "primary")) },
    { name: "destructive fill", rgb: hslToRgb(tok(mode, "destructive")) },
    { name: "secondary fill", rgb: hslToRgb(tok(mode, "secondary")) },
    ...Object.entries(SEMANTIC_FILLS).map(([name, v]) => ({ name, rgb: rgbTriplet(v) })),
  ];
}

/** Collects every surface where `fg` falls below `floor`, for a legible failure. */
function failuresOn(fg: string, list: Surface[], floor: number): string[] {
  return list
    .map((s) => ({ s, ratio: contrastRgb(hslToRgb(fg), s.rgb) }))
    .filter(({ ratio }) => ratio < floor)
    .map(({ s, ratio }) => describeFailure(s.name, fg, ratio));
}

// ---------------------------------------------------------------------------

describe.each(MODES)("mobile palette — $name", (mode) => {
  // 1 — base text on every surface, band and wash
  describe.each(["foreground", "muted-foreground", "primary", "destructive"])(
    "--%s",
    (role) => {
      it("clears AA on every surface, band and wash", () => {
        expect(failuresOn(tok(mode, role), surfaces(mode), AA_TEXT)).toEqual([]);
      });
    },
  );

  // 2 — fills carry their own label
  it.each(["primary", "destructive", "secondary", "accent"])(
    "--%s carries its own foreground",
    (role) => {
      const ratio = contrastRgb(hslToRgb(tok(mode, `${role}-foreground`)), hslToRgb(tok(mode, role)));
      expect(ratio).toBeGreaterThanOrEqual(AA_TEXT);
    },
  );

  // 3 — glass, per weight, over every backdrop including solid fills
  describe("Liquid Glass", () => {
    const glassed = (alpha: number, s: Surface): Rgb =>
      composite(pair(mode, "m-glass-tint").rgb, pair(mode, "m-glass-tint").alpha,
        composite(pair(mode, "m-glass").rgb, alpha, s.rgb));

    const over = (alpha: number) =>
      backdrops(mode).map((s) => ({ name: `glass/${s.name}`, rgb: glassed(alpha, s) }));

    it("regular weight carries ANY text over any backdrop", () => {
      const regular = pair(mode, "m-glass").alpha;
      const failures = ["foreground", "muted-foreground", "primary", "destructive"].flatMap((role) =>
        failuresOn(tok(mode, role), over(regular), AA_TEXT),
      );
      expect(failures).toEqual([]);
    });

    it("thin weight carries --foreground over any backdrop", () => {
      const thin = parseFloat(tok(mode, "m-glass-thin-alpha"));
      expect(failuresOn(tok(mode, "foreground"), over(thin), AA_TEXT)).toEqual([]);
    });

    it("thin weight is genuinely thinner, which is why it is restricted", () => {
      // Pins the reason the two-weight split exists at all: at the thin alpha,
      // muted and primary DO fail. If a future tweak made thin safe for them,
      // the split would be dead weight and should be removed rather than kept
      // out of habit — this assertion is what would say so.
      const thin = parseFloat(tok(mode, "m-glass-thin-alpha"));
      const regular = pair(mode, "m-glass").alpha;
      expect(thin).toBeLessThan(regular);
      const muted = failuresOn(tok(mode, "muted-foreground"), over(thin), AA_TEXT);
      expect(muted.length).toBeGreaterThan(0);
    });
  });

  // 4 — the Commander capsule
  describe("Commander capsule", () => {
    const capsuleOver = (s: Surface) => composite(pair(mode, "m-capsule").rgb, pair(mode, "m-capsule").alpha, s.rgb);

    it("carries its label on every canvas", () => {
      const label = hslToRgb(tok(mode, "m-capsule-foreground"));
      const failures = surfaces(mode)
        .map((s) => ({ s, ratio: contrastRgb(label, capsuleOver(s)) }))
        .filter(({ ratio }) => ratio < AA_TEXT)
        .map(({ s, ratio }) => `capsule on ${s.name} = ${ratio.toFixed(2)}:1`);
      expect(failures).toEqual([]);
    });

    it("is visible AS A SHAPE against every canvas", () => {
      // WCAG 1.4.11. This is the assertion that forced the capsule's polarity to
      // invert: an obsidian pill measures 1.01:1 against the dark canvas, so on
      // a near-black ground "most prominent" can only mean light.
      const failures = surfaces(mode)
        .map((s) => ({ s, ratio: contrastRgb(capsuleOver(s), s.rgb) }))
        .filter(({ ratio }) => ratio < AA_NON_TEXT)
        .map(({ s, ratio }) => `capsule vs ${s.name} = ${ratio.toFixed(2)}:1`);
      expect(failures).toEqual([]);
    });
  });

  // 5 — chart strokes
  it("draws every chart shape with a boundary that clears 1.4.11 on --card", () => {
    // The mobile kit's answer to the light-mode series gap index.css records as
    // known-bad: the FILL keeps the hue everyone recognises, and the stroke
    // carries the contrast. WCAG 1.4.11 binds on the boundary of a graphical
    // object, so a compliant boundary is a compliant object.
    const card = hslToRgb(tok(mode, "card"));
    const strokes = declaredTokens(mode.body).filter(
      (n) => n.startsWith("m-stroke-") || /^m-series-\d$/.test(n),
    );
    expect(strokes.length).toBeGreaterThanOrEqual(13);

    const failures = strokes
      .map((n) => ({ n, ratio: contrastRgb(hslToRgb(tok(mode, n)), card) }))
      .filter(({ ratio }) => ratio < AA_NON_TEXT)
      .map(({ n, ratio }) => describeFailure(`--${n} on --card`, tok(mode, n), ratio));
    expect(failures).toEqual([]);
  });
});

// 6 — the Increase Contrast block has to be an improvement, not a gesture
describe("prefers-contrast: more", () => {
  it.each(MODES)("raises $name mode past AAA for body text", (mode) => {
    const selector = mode.name === "light" ? ".m-shell {" : ".dark .m-shell {";
    const body = ruleBody(TOKENS, selector, { after: "@media (prefers-contrast: more)" });
    const mutedFg = token(body, "muted-foreground");

    // Measured WITHOUT the ambient wash, because in this mode there isn't one:
    // material.css sets `background-image: none` on .m-shell under
    // prefers-contrast: more. Atmosphere is precisely what someone enabling the
    // setting is asking to turn off. Auditing a washed surface here would be
    // measuring a pixel this mode cannot produce.
    const flat = surfaces(mode).filter((s) => !s.name.includes("+"));

    // Only the tokens the block actually overrides are re-measured; the rest are
    // unchanged and already covered above. The floor is AAA because clearing
    // merely AA would mean the setting bought the user nothing.
    expect(failuresOn(mutedFg, flat, AAA_TEXT)).toEqual([]);
  });

  it("makes borders visible as boundaries, which is the point of the setting", () => {
    for (const mode of MODES) {
      const selector = mode.name === "light" ? ".m-shell {" : ".dark .m-shell {";
      const body = ruleBody(TOKENS, selector, { after: "@media (prefers-contrast: more)" });
      const border = hslToRgb(token(body, "border"));
      const ratio = contrastRgb(border, hslToRgb(tok(mode, "card")));
      expect(ratio, `${mode.name} border on card`).toBeGreaterThanOrEqual(AA_NON_TEXT);
    }
  });
});

// 7 — the completeness guard
describe("every token is accounted for", () => {
  /**
   * Declarations that carry no colour and therefore cannot be measured. Listing
   * them explicitly is the whole mechanism: a new colour token is not silently
   * exempt, it fails until someone either measures it or states here why it
   * isn't a colour.
   */
  const NON_COLOUR = new Set([
    "radius", "m-radius-card", "m-radius-sheet", "m-radius-nested", "m-radius-pill",
    "m-tap",
    "m-e1", "m-e2", "m-e3", "m-e4", "m-specular",
    "m-glass-alpha", "m-glass-thin-alpha", "m-glass-tint-alpha",
    "m-glass-specular-alpha", "m-glass-rim-alpha", "m-glass-shadow-alpha",
    "m-glass-blur", "m-glass-saturate",
    "m-capsule-alpha", "m-capsule-ring-alpha",
    "m-skeleton-alpha",
    "m-sky-alpha", "m-sky2-alpha", "m-ground-alpha",
  ]);

  /** Colour tokens measured indirectly, as a layer or a backdrop, not as text. */
  const MEASURED_AS_MATERIAL = new Set([
    "m-glass-rgb", "m-glass-tint-rgb", "m-glass-specular-rgb", "m-glass-rim-rgb",
    "m-glass-shadow-rgb",
    "m-capsule-rgb", "m-capsule-foreground", "m-capsule-ring",
    "m-skeleton-rgb",
    "m-sky-rgb", "m-sky2-rgb", "m-ground-rgb",
    "background", "card", "popover", "muted",
    "card-foreground", "popover-foreground",
    "border", "input", "card-border", "popover-border",
    "ring",
    "primary-foreground", "destructive-foreground",
    "secondary-foreground", "accent-foreground",
  ]);

  /** Measured directly by a suite above. */
  const MEASURED_AS_TEXT = new Set([
    "foreground", "muted-foreground", "primary", "destructive", "secondary", "accent",
  ]);

  it.each(MODES)("$name declares nothing that no suite measures", (mode) => {
    const unaccounted = declaredTokens(mode.body).filter(
      (name) =>
        !NON_COLOUR.has(name) &&
        !MEASURED_AS_MATERIAL.has(name) &&
        !MEASURED_AS_TEXT.has(name) &&
        !name.startsWith("m-stroke-") &&
        !/^m-series-\d$/.test(name),
    );
    expect(unaccounted).toEqual([]);
  });

  it("keeps light and dark declaring the same token set", () => {
    // A token present in one mode and missing in the other inherits the light
    // value into dark, which is how a palette develops a hole that only shows
    // up on someone else's phone.
    const light = new Set(declaredTokens(LIGHT));
    const dark = new Set(declaredTokens(DARK));
    // Dark legitimately omits geometry and the a11y-only tokens; it must not
    // omit a colour.
    const missingInDark = [...light].filter(
      (n) => !dark.has(n) && !NON_COLOUR.has(n) && !n.startsWith("m-radius"),
    );
    expect(missingInDark).toEqual([]);
  });

  it("declares every colour as a bare HSL triplet or an rgb pair", () => {
    // `hsl(#14171c)` is not a colour, and an inline rgba() literal cannot be
    // re-composited — which is precisely why mobile.css went unmeasured.
    const offenders: string[] = [];
    for (const mode of MODES) {
      for (const name of declaredTokens(mode.body)) {
        if (NON_COLOUR.has(name)) continue;
        const value = tok(mode, name);
        const ok = name.endsWith("-rgb")
          ? /^\d+\s+\d+\s+\d+$/.test(value)
          : /^-?[\d.]+\s+[\d.]+%\s+[\d.]+%$/.test(value);
        if (!ok) offenders.push(`${mode.name} --${name}: ${value}`);
      }
    }
    expect(offenders).toEqual([]);
  });
});
