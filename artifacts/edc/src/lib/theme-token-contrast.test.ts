import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Pins the WCAG AA contrast floors for the accent tokens in index.css.
 *
 * This complements semantic-colors.test.ts, which can only lock the *shape* of
 * its Tailwind class names (no Tailwind compiler runs under Vitest, so it can't
 * resolve `red-700` to a colour). These tokens are different: they are raw HSL
 * triplets, so the ratios can be computed outright and asserted directly.
 *
 * Why this exists: `--primary` shipped for months at a lightness that put white
 * button labels at 3.18:1, and `--destructive` cleared AA against a white card
 * while failing at 4.23:1 on the tinted `data-time-band` canvases. Both were
 * found by measuring, not by looking. A palette is only "correct" against the
 * surfaces it actually lands on, so every band's --background AND --card counts
 * as a surface here — dark morning's card (13% lightness) is lighter than the
 * base dark card (12%) and is the real worst case in dark mode.
 */

const CSS = readFileSync(path.join(__dirname, "..", "index.css"), "utf8");

/** Extracts a rule body by brace-matching, so comments and nesting can't fool it. */
function ruleBody(selector: string): string {
  const start = CSS.indexOf(selector);
  if (start === -1) throw new Error(`selector not found in index.css: ${selector}`);
  const open = CSS.indexOf("{", start);
  let depth = 0;
  for (let i = open; i < CSS.length; i++) {
    if (CSS[i] === "{") depth++;
    else if (CSS[i] === "}") {
      depth--;
      if (depth === 0) return CSS.slice(open + 1, i);
    }
  }
  throw new Error(`unbalanced braces after ${selector}`);
}

function token(body: string, name: string): string {
  // Skip commented-out declarations by stripping comments first.
  const stripped = body.replace(/\/\*[\s\S]*?\*\//g, "");
  const m = stripped.match(new RegExp(`--${name}:\\s*([^;]+);`));
  if (!m) throw new Error(`--${name} not declared in block`);
  return m[1].trim();
}

function hslToRgb(triplet: string): [number, number, number] {
  const parts = triplet.split(/\s+/);
  const h = parseFloat(parts[0]);
  const s = parseFloat(parts[1]) / 100;
  const l = parseFloat(parts[2]) / 100;
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const hp = h / 60;
  const x = c * (1 - Math.abs((hp % 2) - 1));
  const seg = Math.floor(hp) % 6;
  const base: [number, number, number][] = [
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

function luminance(triplet: string): number {
  const lin = hslToRgb(triplet).map((v) =>
    v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4,
  );
  return 0.2126 * lin[0] + 0.7152 * lin[1] + 0.0722 * lin[2];
}

function contrast(a: string, b: string): number {
  const x = luminance(a) + 0.05;
  const y = luminance(b) + 0.05;
  return Math.max(x, y) / Math.min(x, y);
}

const BANDS = ["morning", "evening", "night"] as const;

/** Every surface a mode can present: its base background/card plus each band's. */
function surfaces(mode: "light" | "dark"): { name: string; value: string }[] {
  const root = mode === "light" ? ":root {" : ".dark {";
  const body = ruleBody(root);
  const out = [
    { name: `${mode} base background`, value: token(body, "background") },
    { name: `${mode} base card`, value: token(body, "card") },
  ];
  for (const band of BANDS) {
    const sel = mode === "light" ? `:root[data-time-band="${band}"]` : `.dark[data-time-band="${band}"]`;
    const b = ruleBody(sel);
    out.push({ name: `${mode} ${band} background`, value: token(b, "background") });
    out.push({ name: `${mode} ${band} card`, value: token(b, "card") });
  }
  return out;
}

const AA_TEXT = 4.5;
const AA_NON_TEXT = 3;

describe.each(["light", "dark"] as const)("index.css accent contrast — %s mode", (mode) => {
  const body = ruleBody(mode === "light" ? ":root {" : ".dark {");

  describe.each(["primary", "destructive"] as const)("--%s", (role) => {
    const fill = token(body, role);
    const label = token(body, `${role}-foreground`);

    it("clears AA for its label on the filled surface (button)", () => {
      // Surface-independent: the label sits on the fill, not on the canvas.
      expect(contrast(label, fill)).toBeGreaterThanOrEqual(AA_TEXT);
    });

    it("clears AA used as text on every surface, including every time band", () => {
      // `text-primary` / `text-destructive` are used directly on the canvas and
      // on cards. The tinted bands are not decorative here — they change the
      // measurement, and one of them is always the real worst case.
      const failures = surfaces(mode)
        .map((s) => ({ ...s, ratio: contrast(fill, s.value) }))
        .filter((s) => s.ratio < AA_TEXT)
        .map((s) => `${s.name} [${s.value}] = ${s.ratio.toFixed(2)}:1`);
      expect(failures).toEqual([]);
    });
  });

});

/**
 * Series colours are graphical objects, so WCAG 1.4.11's 3:1 binds rather than
 * 4.5:1 — and only dark mode currently clears it. Light mode reuses the dark
 * palette unchanged and four of its five series fail (emerald 1.74:1, amber
 * 1.94:1, sky 2.19:1, indigo 2.88:1; violet passes at 3.04:1), which is
 * recorded as a known gap against --chart-1 in index.css. Asserting the light
 * side here would mean shipping a red suite, and loosening the floor to make it
 * green would bless the failure — so this pins the side that passes, which at
 * least stops dark mode from regressing to match.
 */
describe("index.css chart series contrast — dark mode only (see index.css known gap)", () => {
  const body = ruleBody(".dark {");

  it.each([1, 2, 3, 4, 5])("holds the 3:1 non-text floor for --chart-%i", (n) => {
    const value = token(body, `chart-${n}`);
    const worst = Math.min(...surfaces("dark").map((s) => contrast(value, s.value)));
    expect(worst).toBeGreaterThanOrEqual(AA_NON_TEXT);
  });
});
