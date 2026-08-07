import { describe, it, expect } from "vitest";
import {
  resolveIframeThemeTokens,
  buildIframeThemeCss,
  verifyIframeTheme,
  type IframeThemeSource,
  type IframeThemeTokens,
} from "./catalyst-iframe-theme";

/** Stands in for the `CSSStyleDeclaration` the resolver is duck-typed on. */
function fakeTokens(map: Record<string, string>): IframeThemeSource["tokens"] {
  return { getPropertyValue: (name) => map[name] ?? "" };
}

function source(map: Record<string, string>, isDark = true): IframeThemeSource {
  return { tokens: fakeTokens(map), fontStack: "Geist, sans-serif", isDark };
}

// The four palettes that actually reach /login. Values copied from
// src/index.css (desktop) and src/mobile/mobile.css (.m-shell); the point of
// the table is that they genuinely differ, so a hard-coded stylesheet could
// not serve all four.
const DESKTOP_DARK = {
  "--radius": ".25rem",
  "--card": "220 10% 12%",
  "--card-foreground": "210 20% 98%",
  "--foreground": "210 20% 98%",
  "--muted-foreground": "210 10% 60%",
  "--input": "220 10% 20%",
  "--ring": "222 90% 67%",
  "--primary": "222 90% 67%",
  "--primary-foreground": "220 10% 10%",
  "--destructive": "0 60% 50%",
};
const DESKTOP_LIGHT = { ...DESKTOP_DARK, "--card": "0 0% 100%", "--card-foreground": "220 10% 10%", "--primary-foreground": "0 0% 100%" };
const MOBILE_LIGHT = { ...DESKTOP_LIGHT, "--radius": "0.875rem", "--primary": "227 67% 55%", "--input": "212 7% 89%", "--muted-foreground": "221 13% 33%" };
const MOBILE_DARK = { ...DESKTOP_DARK, "--radius": "0.875rem", "--card": "218 17% 9%", "--primary": "223 100% 75%", "--input": "220 8% 15%" };

const ALL = [
  ["desktop dark", DESKTOP_DARK, true],
  ["desktop light", DESKTOP_LIGHT, false],
  ["mobile light", MOBILE_LIGHT, false],
  ["mobile dark", MOBILE_DARK, true],
] as const;

/** Every `prop: value` pair inside every rule body. */
function declarations(css: string): Array<{ prop: string; value: string }> {
  const out: Array<{ prop: string; value: string }> = [];
  for (const block of css.match(/\{[^}]*\}/g) ?? []) {
    for (const decl of block.slice(1, -1).split(";")) {
      const idx = decl.indexOf(":");
      if (idx < 0) continue;
      const prop = decl.slice(0, idx).trim();
      const value = decl.slice(idx + 1).trim();
      if (prop && value) out.push({ prop, value });
    }
  }
  return out;
}

describe("resolveIframeThemeTokens", () => {
  it("wraps HSL triplets as colours and passes the radius through raw", () => {
    const t = resolveIframeThemeTokens(source(DESKTOP_DARK));
    expect(t.primary).toBe("hsl(222 90% 67%)");
    expect(t.cardForeground).toBe("hsl(210 20% 98%)");
    expect(t.radius).toBe(".25rem");
    expect(t.colorScheme).toBe("dark");
  });

  it("trims the leading space Chrome can return for a custom property", () => {
    const t = resolveIframeThemeTokens(source({ ...DESKTOP_DARK, "--primary": "  222 90% 67%  " }));
    expect(t.primary).toBe("hsl(222 90% 67%)");
  });

  it("falls back rather than emitting an empty hsl() for a missing token", () => {
    const t = resolveIframeThemeTokens(source({}));
    expect(t.primary).toBe("hsl(222 90% 67%)");
    expect(t.radius).toBe("0.25rem");
    expect(buildIframeThemeCss(t)).not.toContain("hsl()");
  });

  it("drops a token value that could break out of its declaration", () => {
    // A value carrying `;` or `{}` would otherwise end the declaration and let
    // the rest be parsed as new rules.
    const t = resolveIframeThemeTokens(source({ ...DESKTOP_DARK, "--primary": "red; } body { display: none" }));
    expect(t.primary).toBe("hsl(222 90% 67%)");
    expect(buildIframeThemeCss(t)).not.toContain("display: none");
  });

  it("reports light when the parent is not dark", () => {
    expect(resolveIframeThemeTokens(source(DESKTOP_LIGHT, false)).colorScheme).toBe("light");
  });

  it("produces materially different output for each of the four real palettes", () => {
    const built = ALL.map(([, map, isDark]) => buildIframeThemeCss(resolveIframeThemeTokens(source(map, isDark))));
    expect(new Set(built).size).toBe(4);
    // The two that would collide under a single hard-coded sheet: mobile uses a
    // 14px radius and its own primary.
    const mobileLight = buildIframeThemeCss(resolveIframeThemeTokens(source(MOBILE_LIGHT, false)));
    expect(mobileLight).toContain("0.875rem");
    expect(mobileLight).toContain("hsl(227 67% 55%)");
  });
});

describe("buildIframeThemeCss", () => {
  it.each(ALL.map(([name, map, isDark]) => [name, map, isDark] as const))(
    "%s: balances braces and emits no undefined/NaN",
    (_name, map, isDark) => {
      const css = buildIframeThemeCss(resolveIframeThemeTokens(source(map, isDark)));
      expect((css.match(/\{/g) ?? []).length).toBe((css.match(/\}/g) ?? []).length);
      expect(css).not.toMatch(/undefined|NaN/);
      expect(css).not.toMatch(/hsl\(\s*\)/);
    },
  );

  it("marks every declaration !important", () => {
    // Zoho appends step-specific sheets after ours and may use inline styles;
    // a declaration that loses this loses outright.
    const css = buildIframeThemeCss(resolveIframeThemeTokens(source(DESKTOP_DARK)));
    const decls = declarations(css);
    expect(decls.length).toBeGreaterThan(20);
    expect(decls.filter((d) => !/!important$/.test(d.value))).toEqual([]);
  });

  it("hard-codes no colour in any declaration value", () => {
    // The whole point of resolving at runtime: a literal colour would desync
    // from the theme, the time-band, and the mobile palette. Checked on VALUES
    // only — `#headtitle` and friends are legitimate id selectors.
    for (const [, map, isDark] of ALL) {
      const css = buildIframeThemeCss(resolveIframeThemeTokens(source(map, isDark)));
      for (const { prop, value } of declarations(css)) {
        expect(value, `${prop}: ${value}`).not.toMatch(/#[0-9a-fA-F]{3,8}\b/);
        expect(value, `${prop}: ${value}`).not.toMatch(/\brgba?\(/);
        expect(value, `${prop}: ${value}`).not.toMatch(/\b(white|black|red|blue|green|grey|gray)\b/);
      }
    }
  });

  it("uses every resolved token at least once", () => {
    const t = resolveIframeThemeTokens(source(DESKTOP_DARK));
    const css = buildIframeThemeCss(t);
    const used: Array<keyof IframeThemeTokens> = [
      "card", "cardForeground", "foreground", "mutedForeground",
      "input", "ring", "primary", "primaryForeground", "destructive", "radius", "fontStack",
    ];
    for (const key of used) expect(css, `${key} unused`).toContain(String(t[key]));
  });

  it("keeps the Tier-1 structural floor, so a Zoho rename degrades to legible", () => {
    const css = buildIframeThemeCss(resolveIframeThemeTokens(source(DESKTOP_DARK)));
    expect(css).toMatch(/body \*:not\(button\)/);
    expect(css).toContain("html, body { background: transparent !important; }");
    expect(css).toMatch(/input\[type="password"\]/);
  });

  it("kills the white box-shadow Zoho paints under its button", () => {
    // Zoho ships `box-shadow: 0px 2px 2px #fff`, which `border: 0` leaves
    // alone; it renders as a pale band under the Next button.
    const css = buildIframeThemeCss(resolveIframeThemeTokens(source(DESKTOP_DARK)));
    expect(css).toMatch(/box-shadow: none !important/);
  });

  it("colours the field error Zoho actually uses, not just .Alert", () => {
    // The live error is `.fielderror.errorlabel`; `.Alert`/`.Errormsg` stay
    // empty and off-screen. Without this the blanket body colour would render
    // the error as ordinary text.
    const css = buildIframeThemeCss(resolveIframeThemeTokens(source(DESKTOP_DARK)));
    expect(css).toContain(".fielderror");
    expect(css).toContain(".errorlabel");
  });
});

describe("verifyIframeTheme", () => {
  const tokens = resolveIframeThemeTokens(source(DESKTOP_DARK));

  it("passes when the panel is transparent, the font is Geist and the button moved", () => {
    expect(
      verifyIframeTheme(
        { panelBackground: "rgba(0, 0, 0, 0)", bodyFont: "Geist, sans-serif", buttonBackground: "rgb(95, 141, 247)" },
        tokens,
      ),
    ).toEqual({ ok: true, missed: [] });
  });

  it("catches the white panel surviving — the symptom of a renamed selector", () => {
    const v = verifyIframeTheme({ panelBackground: "rgb(255, 255, 255)" }, tokens);
    expect(v.ok).toBe(false);
    expect(v.missed).toContain("panel-background");
  });

  it("catches Zoho's blue button surviving", () => {
    const v = verifyIframeTheme({ panelBackground: "transparent", buttonBackground: "rgb(21, 154, 255)" }, tokens);
    expect(v.ok).toBe(false);
    expect(v.missed).toContain("button-background");
  });

  it("catches the font not applying", () => {
    const v = verifyIframeTheme({ panelBackground: "transparent", bodyFont: "Roboto, sans-serif" }, tokens);
    expect(v.ok).toBe(false);
    expect(v.missed).toContain("body-font");
  });
});
