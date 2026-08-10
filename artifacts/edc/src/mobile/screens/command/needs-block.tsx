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
        <div className="space-y-3">
          <Shimmer className="h-10" />
          <Shimmer className="h-10" />
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
