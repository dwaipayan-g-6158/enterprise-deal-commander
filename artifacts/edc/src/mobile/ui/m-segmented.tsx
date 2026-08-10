import { useLocation } from "wouter";
import { cn } from "@/lib/utils";
import { haptic } from "@/mobile/lib/haptics";

export interface MSegment {
  id: string;
  label: string;
  /** Navigating segments carry an href; in-place filters do not. */
  href?: string;
}

/**
 * A segmented control: two to four peer views of one subject.
 *
 * ## The rule this exists to enforce
 *
 * A screen may hold AT MOST ONE of these, and only if it is a tab root. Nesting
 * segments inside segments is how a phone app becomes a tab-inside-a-tab-inside-
 * a-tab and the reader stops being able to say where they are. Depth comes from
 * pushes; this is for lateral movement only.
 *
 * ## Navigating segments replace rather than push
 *
 * The Intelligence lenses are three real URLs (/analytics, /portfolio,
 * /autopsy), which keeps deep-link parity with desktop for free. They navigate
 * with `replace: true` so all three share ONE back-stack entry: backing out of
 * Intelligence returns you to wherever you came from, rather than walking you
 * back through lenses you merely glanced at. The equal history index also makes
 * nav-transition read the move as lateral, so it cross-fades instead of pushing.
 *
 * ## Not a tablist
 *
 * `role="tablist"` requires tabpanels with matching ids and aria-controls, and
 * an arrow-key model. The navigating variant has no panels — it changes the
 * route — so it is a plain group of links, and a screen reader gets an honest
 * description rather than a promise the DOM does not keep. The in-place variant
 * uses radio semantics, which is what "pick one of these" actually is.
 */
export function MSegmented({
  segments,
  activeId,
  onSelect,
  label,
  className,
}: {
  segments: MSegment[];
  activeId: string | undefined;
  /** Required for in-place filtering; ignored when segments carry hrefs. */
  onSelect?: (id: string) => void;
  label: string;
  className?: string;
}) {
  const [, navigate] = useLocation();
  const navigating = segments.some((s) => s.href);

  return (
    <div
      role={navigating ? "group" : "radiogroup"}
      aria-label={label}
      className={cn(
        // An OPAQUE track, not glass. The first draft used .m-glass-thin, which
        // would have put .m-muted labels on thin glass — measured at ~3.3:1 and
        // explicitly not permitted (tokens.css states the rule; thin glass may
        // carry --foreground only). An iOS segmented control is an opaque tinted
        // track regardless, so there was nothing to trade away.
        "flex gap-1 rounded-full border border-border bg-muted p-1",
        className,
      )}
    >
      {segments.map((segment) => {
        const isActive = segment.id === activeId;
        return (
          <button
            key={segment.id}
            type="button"
            role={navigating ? undefined : "radio"}
            aria-checked={navigating ? undefined : isActive}
            aria-current={navigating && isActive ? "page" : undefined}
            onClick={() => {
              if (isActive) return;
              haptic();
              if (segment.href) navigate(segment.href, { replace: true });
              else onSelect?.(segment.id);
            }}
            className={cn(
              "m-label m-press flex-1 rounded-full px-3 py-2 transition-colors",
              "duration-[var(--m-dur-quick)] ease-[var(--m-ease-standard)]",
              isActive
                ? "bg-primary text-primary-foreground"
                : "m-muted",
            )}
          >
            {segment.label}
          </button>
        );
      })}
    </div>
  );
}
