import type { ReactNode } from "react";
import { Link } from "wouter";
import { ChevronLeft } from "lucide-react";
import { cn } from "@/lib/utils";

interface MobileHeaderProps {
  title: ReactNode;
  /** One line of context under the title — a count, a total, an account name. */
  subtitle?: ReactNode;
  /** Href for a back chevron. Omit on top-level tab screens. */
  backHref?: string;
  backLabel?: string;
  /**
   * Leading slot ahead of the title — the brand mark on the Command Center.
   * Ignored when `backHref` is set: the chevron owns that position, and two
   * things competing for the top-left corner is how a nav bar starts to read
   * as a toolbar.
   */
  leading?: ReactNode;
  /** Trailing slot, e.g. a status chip. */
  right?: ReactNode;
  /** Rendered full-width below the title row — filter chips, a segmented control. */
  children?: ReactNode;
  className?: string;
}

/**
 * Sticky screen header. Frosted rather than opaque so the content scrolling
 * under it stays faintly visible, which is what keeps a phone screen from
 * feeling like a stack of disconnected cards.
 *
 * `pt-safe` is load-bearing: the installed PWA declares a translucent status
 * bar, so without it the title renders under the clock.
 */
export function MobileHeader({
  title,
  subtitle,
  backHref,
  backLabel = "Back",
  leading,
  right,
  children,
  className,
}: MobileHeaderProps) {
  return (
    <header
      className={cn(
        // m-vt-header lifts the bar out of the route transition's root
        // snapshot, so it cross-fades in place while the content slides
        // underneath it — an iOS nav bar does not travel with its screen.
        // m-header-lift deepens the shadow over the first 72px of scroll, so
        // the bar reads as lifting off content that has gone under it.
        "m-glass m-glass-top m-header-lift m-vt-header sticky top-0 z-30 border-b border-[var(--m-keyline)] pt-safe",
        className,
      )}
    >
      <div className="flex min-h-14 items-center gap-2 px-4 py-2">
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
        <div className="min-w-0 flex-1">
          <h1 className="m-h2 truncate">{title}</h1>
          {subtitle ? <p className="m-data m-muted mt-0.5 truncate">{subtitle}</p> : null}
        </div>
        {right ? <div className="shrink-0">{right}</div> : null}
      </div>
      {children}
    </header>
  );
}
