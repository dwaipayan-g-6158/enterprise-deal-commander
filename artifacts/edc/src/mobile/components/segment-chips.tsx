import { cn } from "@/lib/utils";

export interface Segment<T extends string> {
  id: T;
  label: string;
  /** Shown after the label — usually how many rows the segment holds. */
  count?: number;
}

/**
 * A single-select row of filter chips. Scrolls horizontally rather than
 * wrapping, so the header keeps a fixed height however many segments there
 * are and the list below never shifts.
 *
 * Rendered as a tablist: chips filter the list in place, they don't navigate.
 */
export function SegmentChips<T extends string>({
  segments,
  value,
  onChange,
  label,
}: {
  segments: Segment<T>[];
  value: T;
  onChange: (id: T) => void;
  label: string;
}) {
  return (
    <div
      role="tablist"
      aria-label={label}
      // Edge-to-edge scroll with inset padding, so the first and last chip sit
      // on the screen margin but can still scroll clear of it.
      className="flex gap-2 overflow-x-auto px-4 pb-3 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
    >
      {segments.map((segment) => {
        const selected = segment.id === value;
        return (
          <button
            key={segment.id}
            type="button"
            role="tab"
            aria-selected={selected}
            onClick={() => onChange(segment.id)}
            className={cn(
              // h-12 is the 48dp floor every target in the shell holds to; the
              // gap-2 between chips clears the 8dp separation minimum.
              "m-press flex h-12 shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full border px-4 text-sm font-medium",
              selected
                ? "border-transparent bg-secondary text-secondary-foreground"
                : "border-border m-muted",
            )}
          >
            {segment.label}
            {segment.count != null ? (
              <span className={cn("font-mono text-xs", !selected && "opacity-70")}>
                {segment.count}
              </span>
            ) : null}
          </button>
        );
      })}
    </div>
  );
}
