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
const THEME_COLOR = {
  light: "#f8f9fb",
  dark: "#15171a",
} as const;

export function ThemeColorSync() {
  const { resolvedTheme } = useTheme();

  useEffect(() => {
    if (resolvedTheme !== "light" && resolvedTheme !== "dark") return;

    // The media-scoped pair stays in place for first paint on a fresh load;
    // this unscoped tag is appended once and then updated, and being last in
    // the document it wins over both.
    let tag = document.querySelector<HTMLMetaElement>('meta[name="theme-color"]:not([media])');
    if (!tag) {
      tag = document.createElement("meta");
      tag.name = "theme-color";
      document.head.appendChild(tag);
    }
    tag.content = THEME_COLOR[resolvedTheme];
  }, [resolvedTheme]);

  return null;
}
