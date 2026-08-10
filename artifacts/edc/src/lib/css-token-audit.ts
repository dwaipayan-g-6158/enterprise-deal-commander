/**
 * Pure helpers for auditing CSS custom-property palettes against WCAG.
 *
 * Design tokens in this app are raw HSL triplets (`--card: 220 24% 97%`) and
 * RGB/alpha pairs (`--m-glass-rgb: 255 255 255` + `--m-glass-alpha: 0.8`), not
 * compiled colours — which means their contrast ratios can be computed outright
 * from source, with no browser and no Tailwind compiler. That is the whole
 * reason a palette can be tested here at all.
 *
 * Extracted from theme-token-contrast.test.ts so the mobile shell's palette can
 * be audited by the same code. Two capabilities were added in the move, both
 * because the desktop test was measuring an idealised surface rather than the
 * one that ships:
 *
 *   - `composite()` — the ambient time-of-day wash and the Liquid Glass material
 *     are translucent layers ON TOP of a token. Measuring the token alone
 *     answers a question nobody asked. A palette is only correct against the
 *     pixels it actually produces.
 *   - `parseRgbPair()` — which is why materials are declared as an `--x-rgb` +
 *     `--x-alpha` pair rather than an inline `rgba(...)` literal. An inline
 *     literal cannot be parsed and re-composited, and that is precisely why
 *     mobile.css went untested for four phases.
 *
 * No React, no DOM, no `@/` imports — vitest runs this config with
 * `environment: "node"` and no alias resolution.
 */

/** Non-linear sRGB, each channel 0..1. */
export type Rgb = [number, number, number];

/** Strips `/* … *\/` comments so a commented-out declaration can't be read as live. */
export function stripComments(css: string): string {
  return css.replace(/\/\*[\s\S]*?\*\//g, "");
}

/**
 * Extracts a rule body by brace-matching rather than by regex, so nested blocks
 * and braces inside comments can't truncate it early.
 *
 * `selector` is matched as a literal substring, so callers disambiguate by
 * including punctuation — `":root {"` finds the bare rule rather than
 * `:root[data-time-band="morning"]`. `after` restarts the search past a marker,
 * which is how a selector that also appears inside an `@media` block is reached.
 */
export function ruleBody(css: string, selector: string, opts: { after?: string } = {}): string {
  let from = 0;
  if (opts.after !== undefined) {
    const anchor = css.indexOf(opts.after);
    if (anchor === -1) throw new Error(`anchor not found: ${opts.after}`);
    from = anchor + opts.after.length;
  }

  const start = css.indexOf(selector, from);
  if (start === -1) {
    throw new Error(`selector not found${opts.after ? ` after ${opts.after}` : ""}: ${selector}`);
  }

  const open = css.indexOf("{", start);
  if (open === -1) throw new Error(`no block opens after ${selector}`);

  let depth = 0;
  for (let i = open; i < css.length; i++) {
    if (css[i] === "{") depth++;
    else if (css[i] === "}") {
      depth--;
      if (depth === 0) return css.slice(open + 1, i);
    }
  }
  throw new Error(`unbalanced braces after ${selector}`);
}

/** The raw value of `--<name>` in a rule body. Throws when absent. */
export function token(body: string, name: string): string {
  const value = tokenOr(body, name);
  if (value === null) throw new Error(`--${name} not declared in block`);
  return value;
}

/** The raw value of `--<name>`, or null when it isn't declared. */
export function tokenOr(body: string, name: string): string | null {
  const stripped = stripComments(body);
  const m = stripped.match(new RegExp(`--${name}:\\s*([^;]+);`));
  return m ? m[1].trim() : null;
}

/**
 * Every custom property declared directly in a rule body, ignoring any nested
 * block. Drives the completeness guard: a token that no assertion measures is a
 * token that can drift, so the suite enumerates rather than trusting a checklist
 * — the same posture as the server's exhaustive route sweep.
 */
export function declaredTokens(body: string): string[] {
  const stripped = stripComments(body);
  let depth = 0;
  let topLevel = "";
  for (const ch of stripped) {
    if (ch === "{") depth++;
    else if (ch === "}") depth--;
    else if (depth === 0) topLevel += ch;
  }
  return [...topLevel.matchAll(/--([a-zA-Z0-9-]+)\s*:/g)].map((m) => m[1]);
}

/** `"220 24% 97%"` → sRGB 0..1. Accepts an optional `/ alpha` suffix, which it ignores. */
export function hslToRgb(triplet: string): Rgb {
  const parts = triplet.split("/")[0].trim().split(/\s+/);
  const h = parseFloat(parts[0]);
  const s = parseFloat(parts[1]) / 100;
  const l = parseFloat(parts[2]) / 100;
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const hp = ((h % 360) + 360) % 360 / 60;
  const x = c * (1 - Math.abs((hp % 2) - 1));
  const seg = Math.floor(hp) % 6;
  const base: Rgb[] = [
    [c, x, 0],
    [x, c, 0],
    [0, c, x],
    [0, x, c],
    [x, 0, c],
    [c, 0, x],
  ];
  const m = l - c / 2;
  const [r, g, b] = base[seg];
  return [r + m, g + m, b + m];
}

/** `"255 196 128"` → sRGB 0..1. The channel form used by every `--*-rgb` token. */
export function rgbTriplet(value: string): Rgb {
  const parts = value.split("/")[0].trim().split(/[\s,]+/).map(Number);
  if (parts.length < 3 || parts.some(Number.isNaN)) {
    throw new Error(`not an rgb triplet: ${value}`);
  }
  return [parts[0] / 255, parts[1] / 255, parts[2] / 255];
}

/**
 * Reads the `--<base>-rgb` / `--<base>-alpha` pair a translucent material is
 * declared as. `alphaOverride` lets a caller measure one material at another's
 * opacity — how the two glass weights are compared against the same backdrops.
 */
export function parseRgbPair(
  body: string,
  base: string,
  alphaOverride?: number,
): { rgb: Rgb; alpha: number } {
  const rgb = rgbTriplet(token(body, `${base}-rgb`));
  const alpha = alphaOverride ?? parseFloat(token(body, `${base}-alpha`));
  if (Number.isNaN(alpha)) throw new Error(`--${base}-alpha is not a number`);
  return { rgb, alpha };
}

/**
 * Source-over compositing of a translucent layer onto an opaque one.
 *
 * Performed in non-linear sRGB because that is what browsers do for ordinary CSS
 * compositing. Doing it in linear light would produce prettier blends and wrong
 * numbers, and wrong numbers are the entire failure mode this file exists to
 * prevent.
 */
export function composite(layer: Rgb, alpha: number, over: Rgb): Rgb {
  const a = Math.min(1, Math.max(0, alpha));
  return [
    layer[0] * a + over[0] * (1 - a),
    layer[1] * a + over[1] * (1 - a),
    layer[2] * a + over[2] * (1 - a),
  ];
}

/** Stacks several translucent layers bottom-up onto an opaque base. */
export function compositeAll(base: Rgb, layers: { rgb: Rgb; alpha: number }[]): Rgb {
  return layers.reduce((acc, l) => composite(l.rgb, l.alpha, acc), base);
}

/** WCAG relative luminance. */
export function relativeLuminance(rgb: Rgb): number {
  const lin = rgb.map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
  return 0.2126 * lin[0] + 0.7152 * lin[1] + 0.0722 * lin[2];
}

/** WCAG contrast ratio between two composited colours. */
export function contrastRgb(a: Rgb, b: Rgb): number {
  const x = relativeLuminance(a) + 0.05;
  const y = relativeLuminance(b) + 0.05;
  return Math.max(x, y) / Math.min(x, y);
}

/** WCAG contrast ratio between two HSL triplets. */
export function contrast(a: string, b: string): number {
  return contrastRgb(hslToRgb(a), hslToRgb(b));
}

/** WCAG floors, named so an assertion reads as its requirement. */
export const AA_TEXT = 4.5;
export const AA_NON_TEXT = 3;
export const AAA_TEXT = 7;

/** Formats a failing pair for an assertion message that says what to change. */
export function describeFailure(name: string, value: string, ratio: number): string {
  return `${name} [${value}] = ${ratio.toFixed(2)}:1`;
}
