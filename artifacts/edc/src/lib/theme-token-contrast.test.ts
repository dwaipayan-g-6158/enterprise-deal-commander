import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  AA_NON_TEXT,
  AA_TEXT,
  contrast,
  describeFailure,
  ruleBody,
  token,
} from "./css-token-audit";

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
 *
 * The measurement helpers now live in css-token-audit.ts so the mobile shell's
 * palette is audited by the same code rather than a second copy of it. Desktop's
 * time bands are opaque token swaps, so what is measured here is already the
 * shipped pixel; the module's compositing helpers exist for the mobile shell,
 * whose bands and glass are translucent layers over these tokens.
 */

const CSS = readFileSync(path.join(__dirname, "..", "index.css"), "utf8");

const BANDS = ["morning", "evening", "night"] as const;

/** Every surface a mode can present: its base background/card plus each band's. */
function surfaces(mode: "light" | "dark"): { name: string; value: string }[] {
  const body = ruleBody(CSS, mode === "light" ? ":root {" : ".dark {");
  const out = [
    { name: `${mode} base background`, value: token(body, "background") },
    { name: `${mode} base card`, value: token(body, "card") },
  ];
  for (const band of BANDS) {
    const sel = mode === "light" ? `:root[data-time-band="${band}"]` : `.dark[data-time-band="${band}"]`;
    const b = ruleBody(CSS, sel);
    out.push({ name: `${mode} ${band} background`, value: token(b, "background") });
    out.push({ name: `${mode} ${band} card`, value: token(b, "card") });
  }
  return out;
}

describe.each(["light", "dark"] as const)("index.css accent contrast — %s mode", (mode) => {
  const body = ruleBody(CSS, mode === "light" ? ":root {" : ".dark {");

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
        .map((s) => describeFailure(s.name, s.value, s.ratio));
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
 *
 * The mobile shell resolves this rather than inheriting it: its chart shapes are
 * drawn with a stroke measured against --card, and WCAG 1.4.11 binds on the
 * boundary of a graphical object. See mobile/tokens.test.ts.
 */
describe("index.css chart series contrast — dark mode only (see index.css known gap)", () => {
  const body = ruleBody(CSS, ".dark {");

  it.each([1, 2, 3, 4, 5])("holds the 3:1 non-text floor for --chart-%i", (n) => {
    const value = token(body, `chart-${n}`);
    const worst = Math.min(...surfaces("dark").map((s) => contrast(value, s.value)));
    expect(worst).toBeGreaterThanOrEqual(AA_NON_TEXT);
  });
});
