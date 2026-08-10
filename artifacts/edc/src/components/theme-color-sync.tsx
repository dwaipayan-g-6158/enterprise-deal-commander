import { useEffect } from "react";
import { useTheme } from "next-themes";

/**
 * The colour the OS paints around the app — the iOS status bar, the Android
 * task-switcher header, the PWA window chrome.
 *
 * index.html ships a light/dark pair of theme-color meta tags keyed to
 * prefers-color-scheme, which is correct on first paint. But the in-app theme
 * is a class on <html>, so a user who overrides the OS (dark app on a light
 * phone) would keep the OS-matched chrome and get a pale strip above a dark
 * screen. This re-points the active tag at whatever is actually rendered.
 *
 * Values track the --background token in index.css for each mode.
 */
export const THEME_COLOR = {
  light: "#f8f9fb",
  dark: "#15171a",
} as const;

/**
 * The one unscoped tag both syncs write to, created on first use.
 *
 * Exported because the mobile shell overrides these values with its OWN canvas
 * (`.m-shell` re-points `--background`, and the ambient band shifts it again),
 * and the two must write the same element or they would fight — the last one
 * appended would win at random.
 */
export function themeColorTag(): HTMLMetaElement {
  let tag = document.querySelector<HTMLMetaElement>('meta[name="theme-color"]:not([media])');
  if (!tag) {
    tag = document.createElement("meta");
    tag.name = "theme-color";
    document.head.appendChild(tag);
  }
  return tag;
}

/**
 * Writes the colour the OS should paint, and makes sure it is the one the OS
 * actually reads.
 *
 * ## Why this is not just `themeColorTag().content = hex`
 *
 * index.html ships a media-scoped pair (`prefers-color-scheme: light` / `dark`)
 * so first paint is right before any JS runs. Both syncs used to write only the
 * unscoped tag, on the belief — stated in this file's own comment — that "being
 * last in the document it wins over both". **It does not.** The HTML spec walks
 * the candidate `theme-color` elements in TREE ORDER and returns the first whose
 * media matches, so the earlier scoped tag wins and the unscoped one is never
 * reached. The two scoped tags cover light and dark exhaustively, so one of them
 * always matches: the unscoped tag could never win, and both syncs were inert.
 *
 * Measured on the deployed app, dark theme, night band: the mobile shell had
 * correctly computed and written `#0b0c14`, while the tag the browser would
 * resolve to was index.html's static `#15171a`.
 *
 * The fix does not depend on that reading of the spec. Removing the scoped pair
 * once JS is running leaves exactly ONE candidate, so it wins under a
 * first-match rule and a last-match rule alike. They have already done their job
 * by then — they exist for the frames before hydration, and a live measurement
 * of the rendered canvas beats a static media query. A reload re-parses them
 * from the HTML, so first paint keeps its fallback.
 */
export function setThemeColor(hex: string): void {
  for (const stale of document.querySelectorAll('meta[name="theme-color"][media]')) {
    stale.remove();
  }
  themeColorTag().content = hex;
}

export function ThemeColorSync() {
  const { resolvedTheme } = useTheme();

  useEffect(() => {
    if (resolvedTheme !== "light" && resolvedTheme !== "dark") return;
    setThemeColor(THEME_COLOR[resolvedTheme]);
  }, [resolvedTheme]);

  return null;
}
