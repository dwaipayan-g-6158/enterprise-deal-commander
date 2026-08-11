import type { ReactNode } from "react";
import { Link } from "wouter";
import { ChevronLeft } from "lucide-react";
import { cn } from "@/lib/utils";
import { MLiveCapsule } from "@/mobile/shell/m-live-capsule";

export interface MNavBarProps {
  title: ReactNode;
  /** One line of context under the title — a count, a total, an account name. */
  subtitle?: ReactNode;
  /** Href for a back chevron. Omit on tab roots. */
  backHref?: string;
  backLabel?: string;
  /**
   * Leading slot ahead of the title. Ignored when `backHref` is set: the chevron
   * owns that position, and two things competing for the top-left corner is how
   * a nav bar starts to read as a toolbar.
   */
  leading?: ReactNode;
  /** Trailing slot — the avatar on a tab root, at most one action elsewhere. */
  right?: ReactNode;
  /** Full-width row below the title — filter chips, a segmented control. */
  children?: ReactNode;
  /**
   * Hold the compact title back until the screen has scrolled, for screens whose
   * large title says the same words immediately below the bar.
   *
   * Opt-in per render rather than derived from `backHref`, because a detail
   * screen's error and unseeded loading states use the same chevron and have no
   * large title to defer to — there the compact one is the only title there is.
   */
  collapseTitle?: boolean;
  className?: string;
}

/**
 * Sticky nav bar. Frosted rather than opaque, so content scrolling under it
 * stays faintly visible — which is what keeps a phone screen from reading as a
 * stack of disconnected cards.
 *
 * `pt-safe` is kept even though iOS's status-bar style is now `default` (which
 * collapses the top inset to 0): Android draws edge-to-edge, and iOS in
 * landscape still reports one. `pl-safe`/`pr-safe` keep the chevron out from
 * under the notch in landscape.
 */
export function MNavBar({
  title,
  subtitle,
  backHref,
  backLabel = "Back",
  leading,
  right,
  children,
  collapseTitle = false,
  className,
}: MNavBarProps) {
  return (
    <header
      className={cn(
        // m-vt-navbar lifts the bar out of the route transition's root snapshot,
        // so it cross-fades in place while content slides underneath — an iOS
        // nav bar does not travel with its screen.
        // m-navbar-lift deepens the shadow over the first 72px of scroll, so the
        // bar reads as lifting off content that has gone under it.
        "m-glass m-glass-top m-navbar-lift m-vt-navbar sticky top-0 z-30 border-b border-border pt-safe pl-safe pr-safe",
        className,
      )}
    >
      <div className="flex min-h-11 items-center gap-2 px-4 py-2">
        {backHref ? (
          <Link
            href={backHref}
            aria-label={backLabel}
            className="m-press -ml-2 flex h-12 w-12 shrink-0 items-center justify-center rounded-full"
          >
            <ChevronLeft className="h-6 w-6" aria-hidden="true" />
          </Link>
        ) : leading ? (
          <span className="flex shrink-0 items-center">{leading}</span>
        ) : null}

        {/* Only the text fades. The chevron and any trailing control stay put,
            because a back button that appears on scroll is a back button you
            cannot find. The <h1> is never removed from the tree either — it is
            invisible, not absent, so a screen reader still gets the title. */}
        <div className={cn("min-w-0 flex-1", collapseTitle && "m-navbar-title")}>
          <h1 className="m-title truncate">{title}</h1>
          {subtitle ? <p className="m-caption m-muted mt-0.5 truncate">{subtitle}</p> : null}
        </div>

        {right ? <div className="shrink-0">{right}</div> : null}
      </div>
      {children}
      {/* Last, so it sits on the bar's bottom edge with content starting
          directly beneath it. Renders nothing when there is nothing to say. */}
      <MLiveCapsule />
    </header>
  );
}
