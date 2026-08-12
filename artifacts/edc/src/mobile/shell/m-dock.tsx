import { createPortal } from "react-dom";
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";
import { useShellDockHost } from "@/mobile/shell/m-shell";

/**
 * A bar docked to the bottom of the shell: the search fields on Deals and
 * Memory, the composer on Ask.
 *
 * ## Why this exists rather than each screen placing its own bar
 *
 * Because the position is a correctness constraint on iOS, and it is one a screen
 * cannot satisfy on its own. Screens render inside `main`, which is the shell's
 * scroll container; a `position: fixed` bar declared in there is a fixed element
 * *inside a scroller*. Chromium follows the spec and pins it to the viewport.
 * **WebKit composites it into the scroller's layer instead**, so on iOS Safari and
 * in the installed PWA the bar drifted with the list — reported twice, and
 * invisible to any amount of Chromium testing.
 *
 * `MTabBar` never had the bug, and the difference was exactly one thing: it is
 * `absolute` inside the non-scrolling frame, not `fixed` inside the scroller.
 * Same `.m-glass` backdrop, same bottom edge, no drift. So this portals its bar
 * out to the frame (see `useShellDockHost`) and positions it `absolute`, which
 * makes it a peer of the tab bar in every respect that matters.
 *
 * The positioning lives HERE, not in the callers, so that `absolute` cannot be
 * quietly turned back into `fixed` by whoever edits a screen next.
 * `dock-static.test.ts` asserts that too.
 */
export function MDock({
  className,
  children,
}: {
  /**
   * Where the bar sits and how it pads itself — the only part that varies.
   * Deals and Memory sit above the tab bar (`bottom-[var(--m-dock-bottom)]`);
   * Ask is a pushed screen with no tab bar, so it sits on the home-indicator
   * inset instead. Never pass a `position` here.
   */
  className?: string;
  children: ReactNode;
}) {
  const host = useShellDockHost();

  // Null for the first commit, until the frame's slot exists. The bar simply
  // arrives with the shell; there is nothing to place it against before then.
  if (!host) return null;

  return createPortal(
    <div
      className={cn(
        "m-glass m-glass-bottom m-vt-dock absolute inset-x-0 z-30 border-t border-border",
        className,
      )}
    >
      {children}
    </div>,
    host,
  );
}
