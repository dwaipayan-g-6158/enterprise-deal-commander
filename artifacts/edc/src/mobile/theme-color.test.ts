import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { hslToRgb, ruleBody } from "../lib/css-token-audit";
import { stripCodeComments } from "./class-scan";

const SRC = join(import.meta.dirname, "..");
const TOKENS = readFileSync(join(SRC, "mobile", "styles", "tokens.css"), "utf8");
const THEME_COLOR_SOURCE = readFileSync(
  join(SRC, "mobile", "shell", "m-theme-color.tsx"),
  "utf8",
);

/**
 * The same conversion `m-theme-color.tsx` performs at runtime, kept here so the
 * shape of the output is asserted without a DOM.
 */
function tripletToHex(triplet: string): string | null {
  if (!/^\s*[\d.]+\s+[\d.]+%\s+[\d.]+%/.test(triplet)) return null;
  const channel = (value: number) =>
    Math.max(0, Math.min(255, Math.round(value * 255)))
      .toString(16)
      .padStart(2, "0");
  const [r, g, b] = hslToRgb(triplet);
  if (![r, g, b].every(Number.isFinite)) return null;
  return `#${channel(r)}${channel(g)}${channel(b)}`;
}

describe("triplet to hex", () => {
  it("converts a token to a form every OS shell parses", () => {
    // Hex, not `hsl(232 36% 96%)`: theme-color is read by the platform rather
    // than by the page's CSS engine, and the space-separated hsl() form is the
    // newer syntax.
    expect(tripletToHex("232 36% 96%")).toBe("#f1f2f8");
    expect(tripletToHex("0 0% 100%")).toBe("#ffffff");
    expect(tripletToHex("0 0% 0%")).toBe("#000000");
  });

  it("pads single-digit channels", () => {
    // "#f1f2f8" is seven characters; a channel rendering as "f" instead of "0f"
    // silently shifts every later channel.
    const hex = tripletToHex("231 28% 6%");
    expect(hex).toMatch(/^#[0-9a-f]{6}$/);
  });

  it("returns null rather than a colour for anything unparseable", () => {
    // A null leaves the previous theme-color in place. Returning a default would
    // paint the OS chrome a colour the app is not using — which is the whole
    // failure this component exists to prevent.
    for (const bad of ["", "  ", "not a colour", "rgb(1,2,3)", "#f1f2f8", "232 36%"]) {
      expect(tripletToHex(bad), bad).toBeNull();
    }
  });

  it("converts every --background this shell can actually render", () => {
    // Every canvas the OS chrome has to match: two base themes, plus whichever
    // ambient bands override the background. Afternoon is the neutral band and
    // declares no rule at all, so selectors are checked for existence first —
    // `ruleBody` throws on a selector that is not there, which on the first
    // draft aborted the loop after one band and made the rest of this
    // assertion never run.
    const selectors = [".m-shell", ".dark .m-shell"];
    for (const prefix of [":root", ".dark"]) {
      for (const band of ["morning", "afternoon", "evening", "night"]) {
        selectors.push(`${prefix}[data-time-band="${band}"] .m-shell`);
      }
    }

    let checked = 0;
    for (const selector of selectors) {
      if (!TOKENS.includes(`${selector} {`)) continue;
      const match = ruleBody(TOKENS, selector).match(/--background:\s*([^;]+);/);
      if (!match) continue;
      expect(tripletToHex(match[1].trim()), selector).toMatch(/^#[0-9a-f]{6}$/);
      checked++;
    }

    // Both base themes plus at least one band per theme. A resolver that found
    // nothing would make the loop above vacuous.
    expect(checked, "too few --background declarations were found").toBeGreaterThanOrEqual(6);
  });
});

describe("the component reads the token, not the painted colour", () => {
  it("never calls backgroundColor on the shell element", () => {
    /**
     * The regression this pins.
     *
     * `getComputedStyle(el).backgroundColor` is the obvious implementation and
     * it is wrong: `.m-shell` TRANSITIONS its background, so during a theme
     * switch the computed value is the interpolated in-flight colour. Measured
     * in a real browser two frames after adding `.dark`, the token had already
     * flipped to `231 28% 6%` while the resolved background still read
     * `rgb(240, 241, 248)` — near-white, about to be written to the status bar
     * of an app turning black.
     *
     * Custom properties are not transitioned, which is why the token is read.
     *
     * Comments are stripped before scanning — the file's own doc comment
     * explains this trap by name, and matching prose would have made the
     * assertion fail on a correct implementation.
     */
    const code = stripCodeComments(THEME_COLOR_SOURCE);
    expect(code).not.toMatch(/\.backgroundColor/);
    expect(code).toMatch(/getPropertyValue\("--background"\)/);
  });

  it("restores the desktop colour when the shell unmounts", () => {
    // A phone-tinted chrome persisting on a window resized to desktop would not
    // be corrected until the theme next changed.
    expect(THEME_COLOR_SOURCE).toMatch(/THEME_COLOR\[resolvedTheme\]/);
  });
});
