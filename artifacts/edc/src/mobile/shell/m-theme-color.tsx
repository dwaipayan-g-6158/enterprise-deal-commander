import { useEffect, type RefObject } from "react";
import { useTheme } from "next-themes";
import { useTimeBand } from "@/hooks/use-time-band";
import { THEME_COLOR, setThemeColor } from "@/components/theme-color-sync";
import { hslToRgb } from "@/lib/css-token-audit";

/**
 * Points the OS chrome at the shell's ACTUAL canvas.
 *
 * ## Why the shared sync is not enough on a phone
 *
 * `ThemeColorSync` writes one of two constants tracking `index.css`'s
 * `--background`. Inside `.m-shell` that token is re-pointed to a different
 * value, and the ambient time band shifts it again four times a day — so on a
 * phone the status bar and the task-switcher header were painted a colour the
 * app stopped using two slices ago. On the near-black night band that is a pale
 * strip above a dark screen, which is the exact mismatch the desktop sync was
 * written to prevent.
 *
 * ## It reads the TOKEN, not the element's background-color
 *
 * The obvious implementation — `getComputedStyle(el).backgroundColor` — is
 * wrong, and wrong in a way only a browser will tell you. `.m-shell` transitions
 * its background, so during a theme switch the computed value is the INTERPOLATED
 * in-flight colour rather than the destination. Measured two frames after adding
 * `.dark`: the token had already flipped to `231 28% 6%` while the resolved
 * background still read `rgb(240, 241, 248)` — near-white. Writing that to
 * theme-color paints a white status bar over an app that is turning black, which
 * is precisely the bug this component exists to fix.
 *
 * Custom properties are not transitioned, so the token is correct the instant
 * the class lands. `hslToRgb` is the same converter `tokens.test.ts` measures
 * contrast with, so the audit and the runtime cannot disagree about what a
 * token's colour is.
 */
export function MThemeColor({ shellRef }: { shellRef: RefObject<HTMLElement | null> }) {
  const { resolvedTheme } = useTheme();
  const band = useTimeBand();

  useEffect(() => {
    const el = shellRef.current;
    if (!el) return;

    const triplet = getComputedStyle(el).getPropertyValue("--background").trim();
    const hex = tripletToHex(triplet);
    // setThemeColor, not a bare tag write: index.html's media-scoped pair
    // precedes the unscoped tag and would otherwise win the spec's
    // first-match-in-tree-order resolution, leaving this value unread. See
    // theme-color-sync.tsx.
    if (hex) setThemeColor(hex);

    return () => {
      // The shell unmounts when the viewport crosses into desktop. Handing the
      // tag back stops a phone-tinted chrome persisting on a resized window,
      // where ThemeColorSync would not correct it until the theme next changed.
      if (resolvedTheme === "light" || resolvedTheme === "dark") {
        setThemeColor(THEME_COLOR[resolvedTheme]);
      }
    };
  }, [shellRef, resolvedTheme, band]);

  return null;
}

/**
 * `"232 36% 96%"` → `"#f1f2f8"`.
 *
 * Hex rather than `hsl(...)`: theme-color is parsed by the OS shell rather than
 * by the page's CSS engine, and the space-separated `hsl()` form is the newer
 * syntax. Hex is the form every platform has always accepted.
 *
 * Returns null for anything unparseable, so a missing token leaves the previous
 * value in place instead of painting the chrome black.
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
