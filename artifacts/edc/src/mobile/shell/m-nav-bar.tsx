import { useEffect, useRef, type ReactNode } from "react";
import { Link } from "wouter";
import { ChevronLeft } from "lucide-react";
import { cn } from "@/lib/utils";
import { MLiveCapsule } from "@/mobile/shell/m-live-capsule";
import { canPopWithinApp } from "@/mobile/lib/history-index";

/**
 * Publish the bar's real height as --m-navbar-h, for anything that has to sit
 * below it: a sticky group header, a scroll-margin on a jump target.
 *
 * Measured rather than declared because the height is not a property of the nav
 * bar, it is a property of the screen — a reserved subtitle adds 20px, a chips
 * row 60px, and the live capsule animates its own height open and shut while
 * the reader watches. The Deals group header is the cautionary tale: it assumed
 * 3.5rem, the bar was standing at ~7.7rem, and the header spent its life parked
 * behind the bar instead of below it. Nothing caught it because a constant that
 * is only wrong relative to another constant still typechecks and still renders.
 *
 * Written to the SHELL element, not the header and not documentElement. A custom
 * property inherits down, and every consumer is a sibling or a cousin — but
 * `--m-navbar-h` is declared in tokens.css on `.m-shell`, which sits between
 * documentElement and every consumer. A value set on the root is therefore
 * shadowed by that declaration and never seen: driving the deployed app, the
 * Deals group header resolved `top` to the 61px fallback while the root
 * correctly reported 125px. Setting it inline on `.m-shell` itself beats the
 * stylesheet rule on the same element, which is what makes it take effect.
 */
function usePublishedNavBarHeight(ref: React.RefObject<HTMLElement | null>) {
  useEffect(() => {
    const el = ref.current;
    if (!el || typeof ResizeObserver === "undefined") return;

    // Fall back to the root only if the bar somehow renders outside the shell,
    // so the property always lands somewhere rather than silently nowhere.
    const target = el.closest<HTMLElement>(".m-shell") ?? document.documentElement;

    const publish = () => {
      target.style.setProperty("--m-navbar-h", `${el.getBoundingClientRect().height}px`);
    };
    publish();

    const observer = new ResizeObserver(publish);
    observer.observe(el);
    return () => {
      observer.disconnect();
      // Fall back to the token's own value rather than leaving the last
      // screen's height behind for a screen that has no nav bar at all.
      target.style.removeProperty("--m-navbar-h");
    };
  }, [ref]);
}

export interface MNavBarProps {
  title: ReactNode;
  /** One line of context under the title — a count, a total, an account name. */
  subtitle?: ReactNode;
  /**
   * Reserve the subtitle's line before it arrives.
   *
   * Set this on any screen whose `subtitle` is derived from data, which is nearly
   * all of them. Without it the bar is one line tall on the first paint and two
   * once the query lands, and since the bar is above everything that 20px moves
   * the whole screen — measured on the deployed Command screen.
   *
   * Opt-in rather than inferred: `subtitle === undefined` cannot tell "not yet"
   * from "never", and reserving unconditionally would leave a dead line in the bar
   * of every screen that has no subtitle at all.
   */
  reserveSubtitle?: boolean;
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
  reserveSubtitle = false,
  backHref,
  backLabel = "Back",
  leading,
  right,
  children,
  collapseTitle = false,
  className,
}: MNavBarProps) {
  const ref = useRef<HTMLElement>(null);
  usePublishedNavBarHeight(ref);

  return (
    <header
      ref={ref}
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
          <MBackLink href={backHref} label={backLabel} />
        ) : leading ? (
          <span className="flex shrink-0 items-center">{leading}</span>
        ) : null}

        {/* Only the text fades. The chevron and any trailing control stay put,
            because a back button that appears on scroll is a back button you
            cannot find. The <h1> is never removed from the tree either — it is
            invisible, not absent, so a screen reader still gets the title. */}
        {/* `min-h-[46px]` when a subtitle is expected, and it is a layout-stability
            fix rather than styling.

            Nearly every screen derives its subtitle from data —
            `subtitle={data ? \`${n} deals monitored\` : undefined}` on Command,
            Memory, Deals, Pipeline and Portfolio — so the line is absent on the
            first paint and appears when the query lands. Measured on the deployed
            Command screen at 390px: this block goes 26px to 46px, and because the
            nav bar sits above everything, that 20px pushes the whole screen down.

            Reserving the two-line height when the caller says one is coming means
            the subtitle fills a box that already exists. `reserveSubtitle` is opt-in
            rather than derived, because `subtitle === undefined` cannot distinguish
            "not yet" from "never" — and screens that genuinely have no subtitle must
            not carry 20px of dead space in their bar. 46px is measured, not
            computed from line-heights, so a type-scale change will show up as a
            small shift rather than as a silently wrong constant. */}
        <div
          className={cn(
            "min-w-0 flex-1",
            reserveSubtitle && "min-h-[46px]",
            collapseTitle && "m-navbar-title",
          )}
        >
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

/**
 * The back chevron, which POPS rather than pushing.
 *
 * It was a plain `<Link>`, and that was wrong in two compounding ways. wouter
 * forwards a Link to pushState, so `aroundNav` saw index+1 and animated the
 * journey back to a list as a forward push — the screen you were leaving slid
 * out to the left and the list arrived from the right, which is the choreography
 * for going deeper. And the pushed entry meant the OS back button then returned
 * you INTO the detail screen you had just left, so hardware back and the chevron
 * walked in opposite directions forever.
 *
 * Popping fixes both at once and costs nothing else: `history.back()` fires a
 * real popstate, which back-gesture.ts already animates correctly and which now
 * also arms the reverse card morph. The chevron and the edge swipe become the
 * same code path, which is the point — they are the same intent.
 *
 * `href` is kept rather than replaced with a button. It is the fallback when
 * there is nothing in-app to pop to (a deep link, a home-screen shortcut, a
 * shared URL), and it is what makes the control a real link: focusable,
 * middle-clickable, and announced with a destination.
 */
function MBackLink({ href, label }: { href: string; label: string }) {
  return (
    <Link
      href={href}
      aria-label={label}
      onClick={(event: React.MouseEvent<HTMLAnchorElement>) => {
        // Leave modified clicks to the browser — they open a tab, and hijacking
        // them into a pop would navigate this one instead.
        if (event.defaultPrevented || event.metaKey || event.ctrlKey || event.shiftKey) return;
        if (!canPopWithinApp()) return;
        event.preventDefault();
        history.back();
      }}
      className="m-press -ml-2 flex h-12 w-12 shrink-0 items-center justify-center rounded-full"
    >
      <ChevronLeft className="h-6 w-6" aria-hidden="true" />
    </Link>
  );
}
