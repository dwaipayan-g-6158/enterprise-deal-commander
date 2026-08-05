import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
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
 * A `ToggleGroup`, not a tablist. These chips filter a list in place; they do
 * not switch panels, and the `role="tablist"` this used to declare had no
 * `tabpanel` anywhere to point at — a screen reader was told to expect tabs
 * and then handed a list. ToggleGroup is the honest primitive, and it brings
 * roving focus and `aria-pressed` with it. Where a control genuinely does
 * switch panels — Analytics' Forecast/Flow — that one uses `Tabs`.
 *
 * The selected tint is `data-[state=on]:bg-accent`, straight out of
 * `toggleVariants`. It lands on the right colour because `.m-shell` re-points
 * `--accent`, which is the token remap doing its job rather than an override.
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
    <ToggleGroup
      type="single"
      variant="outline"
      // Radix gives single-select items `role="radio"` but leaves the root as
      // a plain group, so the radios have no owning container to be counted
      // in. Naming it correctly is what makes a screen reader say "1 of 4".
      role="radiogroup"
      value={value}
      // Radix clears the value when you press the item that is already on. A
      // filter always has a state, so an empty payload means "tapped the one
      // already selected" and the correct response is to do nothing.
      onValueChange={(next) => {
        if (next) onChange(next as T);
      }}
      aria-label={label}
      // Edge-to-edge scroll with inset padding, so the first and last chip sit
      // on the screen margin but can still scroll clear of it.
      className="justify-start gap-2 overflow-x-auto px-4 pb-3 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
    >
      {segments.map((segment) => {
        const selected = segment.id === value;
        return (
          <ToggleGroupItem
            key={segment.id}
            value={segment.id}
            // Roving focus moves the focus ring without moving the scroller,
            // so arrowing to the last chip left it half off the screen edge —
            // measured, not assumed. Radix focuses with preventScroll, and a
            // scroller has to bring its own focused child back into view.
            onFocus={(e) =>
              e.currentTarget.scrollIntoView({ block: "nearest", inline: "nearest" })
            }
            // h-12 is the 48dp floor every target in the shell holds to; the
            // gap-2 between chips clears the 8dp separation minimum.
            className={cn(
              "m-label m-press h-12 shrink-0 gap-1.5 whitespace-nowrap rounded-full px-4 shadow-none",
              selected ? "border-transparent" : "text-muted-foreground",
            )}
          >
            {segment.label}
            {segment.count != null ? (
              <span className={cn(!selected && "opacity-70")}>{segment.count}</span>
            ) : null}
          </ToggleGroupItem>
        );
      })}
    </ToggleGroup>
  );
}
