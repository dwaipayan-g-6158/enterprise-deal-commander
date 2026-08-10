import type { ReactNode } from "react";
import { cn } from "@/lib/utils";
import { MNavBar, type MNavBarProps } from "@/mobile/shell/m-nav-bar";

export interface MScreenProps extends Omit<MNavBarProps, "children" | "collapseTitle"> {
  /**
   * Show the title as a large title in the scroll flow, collapsing into the bar
   * on scroll. The iOS pattern, and the default for a tab root.
   *
   * Off for pushed screens: a large title there competes with the back chevron
   * for the same corner of attention, and the reader already knows where they
   * are because they just tapped to get here.
   */
  largeTitle?: boolean;
  /** Row pinned under the nav bar — filter chips, a segmented control. */
  toolbar?: ReactNode;
  children: ReactNode;
  contentClassName?: string;
}

/**
 * The screen contract: a nav bar, an optional large title, and content.
 *
 * The large title lives IN THE SCROLL FLOW rather than inside the header, which
 * is how iOS actually does it and is what lets the whole collapse be pure CSS —
 * one element scrolls away while the other fades in, both driven by
 * `animation-timeline: scroll()` with no scroll listener anywhere.
 *
 * The pair only installs when the screen can actually scroll, gated on
 * `[data-m-scrollable]` which MShell measures. On a short screen neither
 * animation applies and the compact title simply shows — see motion.css for why
 * neither polarity works without that gate.
 */
export function MScreen({
  largeTitle = false,
  toolbar,
  children,
  contentClassName,
  ...navBar
}: MScreenProps) {
  return (
    <>
      <MNavBar {...navBar} collapseTitle={largeTitle}>
        {toolbar}
      </MNavBar>

      {largeTitle ? (
        <div className="px-4 pb-1 pt-3">
          {/* aria-hidden because the nav bar's <h1> is the real accessible
              title and is never removed from the tree. Two headings saying the
              same words is a duplicate to a screen reader, not emphasis. */}
          <p className="m-largetitle m-display truncate" aria-hidden="true">
            {navBar.title}
          </p>
          {navBar.subtitle ? (
            <p className="m-largetitle m-body m-muted mt-0.5 truncate" aria-hidden="true">
              {navBar.subtitle}
            </p>
          ) : null}
        </div>
      ) : null}

      <div className={cn("px-4 pb-6", largeTitle ? "pt-2" : "pt-3", contentClassName)}>
        {children}
      </div>
    </>
  );
}
