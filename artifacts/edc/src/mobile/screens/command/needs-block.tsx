import { AlertTriangle, BookOpen, CalendarClock, ClipboardCheck, type LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { HEALTH_CLASS } from "@/lib/semantic-colors";
import { MobileCard, CardHeader } from "@/mobile/components/mobile-card";
import { ListRow } from "@/mobile/components/list-row";
import { Shimmer } from "@/mobile/components/shimmer";
import type { NeedKind, NeedRow } from "@/mobile/screens/command/needs-you";

const KIND_ICON: Record<NeedKind, LucideIcon> = {
  alert: AlertTriangle,
  decision: ClipboardCheck,
  playbook: BookOpen,
  close: CalendarClock,
};

/** What the row will open, said before it is tapped. */
const KIND_DESTINATION: Record<NeedKind, string> = {
  alert: "Risk alerts",
  decision: "Decisions",
  playbook: "Playbook",
  close: "Stage",
};

/**
 * The three things worth doing right now.
 *
 * Three, and not "top five" or a scroll. This block sits above the fold on every
 * phone the shell targets, and a list that runs past the fold stops being a
 * shortlist and becomes another inbox — which the app already has, in Deals.
 *
 * Each row states its destination in the trailing column. A row that takes you
 * somewhere you did not expect is worse than a row you did not tap, and on a
 * phone the destination is invisible until you are already there.
 */
export function NeedsBlock({ rows, loading }: { rows: NeedRow[]; loading: boolean }) {
  return (
    <MobileCard>
      <CardHeader label="What needs you now" />

      {rows.length === 0 && !loading ? (
        <p className="m-body m-muted">
          Nothing is waiting on you. The engine re-checks the pipeline on every change.
        </p>
      ) : (
        /**
         * A FIXED box, not a min-height, and that distinction is the whole lesson
         * here — it took two measured attempts to get right.
         *
         * MEASURED at 390px: a resolved row is 112px (a two-line clamped title plus
         * its body line — the normal case, see titleLines below), so the three rows
         * this block is designed around settle at 336px. The original placeholder
         * was two 40px bars, 92px, and the block grew 244px on arrival and shoved
         * the whole screen down.
         *
         * Reserving three rows' height fixed that and introduced its mirror image:
         * the row COUNT is unknown until the data lands, so on a run that returned
         * one row the block collapsed 336px to 112px and yanked the cards below it
         * UP by 224px. Measured, on the deployed app: the Pulse card moved -224
         * then +223 and CLS did not improve at all. For a list of unknown length,
         * no placeholder height is correct — reserving the maximum shifts up,
         * reserving the minimum shifts down, and the magnitudes are identical.
         *
         * So the box does not depend on the count. 336px whether one row arrives or
         * three, which costs whitespace on a quiet day and buys zero movement on
         * every day. The empty state opts out above: it is a single sentence and a
         * 336px frame around it would read as a rendering failure.
         *
         * Ordered `rows.length === 0 && !loading` rather than `loading ?` so the
         * loading and populated states share one box — the swap has to happen
         * INSIDE it, or the box itself is what moves.
         */
        <div className="min-h-[336px]">
          {loading ? (
            <div aria-hidden="true">
              {[0, 1, 2].map((i) => (
                <div key={i} className="flex h-28 flex-col justify-center gap-1.5 py-2">
                  <Shimmer className="h-4 w-full" />
                  <Shimmer className="h-4 w-4/5" />
                  <Shimmer className="h-3 w-1/3" />
                </div>
              ))}
            </div>
          ) : (
            <ul>
              {rows.map((row) => {
                const Icon = KIND_ICON[row.kind];
                return (
                  <li key={row.id}>
                    <ListRow
                      href={row.href}
                      media={
                        <Icon
                          className={cn(
                            "h-4 w-4",
                            row.tone === "critical" ? HEALTH_CLASS.RED.text : "m-muted",
                          )}
                          aria-hidden="true"
                        />
                      }
                      title={row.title}
                      // Two lines: the title here is "<deal>: <what is wrong>", and
                      // a one-line clamp cut it at the deal name — spending the row
                      // on the destination hint, which is the least useful text in
                      // it. Measured at 390px: "Project Atlas: Premature …".
                      titleLines={2}
                      body={row.meta}
                      trailing={KIND_DESTINATION[row.kind]}
                      // The visible title already carries the deal name; the label
                      // adds where the row goes, which a screen reader otherwise
                      // gets only as a bare noun in the trailing column.
                      ariaLabel={`${row.title}. Opens ${KIND_DESTINATION[row.kind]}.`}
                    />
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      )}
    </MobileCard>
  );
}
