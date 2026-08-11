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

      {loading ? (
        /**
         * Three row-shaped placeholders at the row's real height, because this
         * block was the largest single layout shift on the mobile Command screen.
         *
         * MEASURED on the deployed app at 390px: a resolved row is 112px (a
         * two-line clamped title plus its body line, which is the normal case here
         * — see titleLines below), and the resolved <ul> is 336px for the three
         * rows this block is designed around. The old placeholder was two 40px bars
         * in a space-y-3, i.e. 92px, so the block GREW 244px when the data landed
         * and shoved everything below it down the screen. The trace attributed
         * 0.107 to that push directly and another 0.100 to the Pulse card being
         * carried 224px down by it — together most of a 0.242 CLS.
         *
         * h-28 is exactly 112px, so three of them reproduce the 336px the list
         * settles at. Shaped like a row rather than one tall grey slab: the bars
         * mirror the two title lines and the body line, so the swap is a change of
         * content inside a box that does not move.
         *
         * This is a reservation, not a promise. A run of one-line titles settles
         * shorter and gives back a little height; that is a small upward
         * correction, against a 244px downward shove.
         */
        <div aria-hidden="true">
          {[0, 1, 2].map((i) => (
            <div key={i} className="flex h-28 flex-col justify-center gap-1.5 py-2">
              <Shimmer className="h-4 w-full" />
              <Shimmer className="h-4 w-4/5" />
              <Shimmer className="h-3 w-1/3" />
            </div>
          ))}
        </div>
      ) : rows.length === 0 ? (
        <p className="m-body m-muted">
          Nothing is waiting on you. The engine re-checks the pipeline on every change.
        </p>
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
    </MobileCard>
  );
}
