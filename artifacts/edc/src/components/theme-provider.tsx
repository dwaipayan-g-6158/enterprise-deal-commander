import { ThemeProvider as NextThemesProvider } from "next-themes";
import { type ReactNode } from "react";

/**
 * Follows the operating system until the user picks a side.
 *
 * This was pinned to light with enableSystem off, which is wrong for an
 * installed phone app — a home-screen icon opened at night should not flash a
 * white screen when the whole device is in dark mode. Anyone who has already
 * used the in-app toggle keeps their choice; next-themes persists it and only
 * "system" defers to the OS.
 *
 * Consumers must read `resolvedTheme`, not `theme`, when they need to know
 * which appearance is on screen: `theme` is "system" in the default state.
 * The ambient time-band tints are unaffected — they key off the `.dark` class
 * next-themes still applies, plus an independent data-time-band attribute.
 */
export function ThemeProvider({ children }: { children: ReactNode }) {
  return (
    <NextThemesProvider
      attribute="class"
      defaultTheme="system"
      enableSystem
      disableTransitionOnChange
    >
      {children}
    </NextThemesProvider>
  );
}
