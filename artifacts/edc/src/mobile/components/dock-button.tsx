import { cn } from "@/lib/utils";

/**
 * A 48px control in a docked bottom bar, with an optional count on it.
 *
 * ## Shared because the divergence was the bug
 *
 * Deals and Memory each grew their own version of this, and they drifted: Deals'
 * opened a filter sheet behind a sliders glyph, Memory's opened a filter sheet
 * behind a CHECKMARK. A checkmark sitting immediately right of a search field is
 * read as "submit", so the reported symptom was "I click search and the archive
 * filter opens" — for a screen that has no search button at all, because search
 * there is live-as-you-type.
 *
 * One component means the affordance cannot drift again. If a dock needs a
 * different action, it passes a different icon and label — not a different
 * button.
 */
export function DockButton({
  label,
  badge,
  onPress,
  children,
}: {
  label: string;
  /** Usually how many filters are active. Omitted or 0 renders no badge. */
  badge?: number;
  onPress: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onPress}
      aria-label={badge ? `${label}, ${badge} active` : label}
      className={cn(
        "m-press relative flex h-12 w-12 shrink-0 items-center justify-center rounded-full border border-border bg-card",
        badge ? "text-primary" : "text-foreground",
      )}
    >
      {children}
      {badge ? (
        <span
          aria-hidden="true"
          className="m-micro m-num absolute -right-0.5 -top-0.5 flex h-5 min-w-5 items-center justify-center rounded-full bg-primary px-1 text-primary-foreground"
        >
          {badge}
        </span>
      ) : null}
    </button>
  );
}
