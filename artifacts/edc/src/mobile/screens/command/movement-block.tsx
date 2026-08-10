import { useMemo } from "react";
import { Link } from "wouter";
import type { ActivityEvent } from "@workspace/api-client-react";
import { relativeTime } from "@/lib/format";
import { activityTitle } from "@/lib/activity-title";
import { MobileCard, CardHeader } from "@/mobile/components/mobile-card";
import { ListRow } from "@/mobile/components/list-row";
import { Shimmer } from "@/mobile/components/shimmer";

/** Rows shown. Enough to see a pattern, short enough to read standing up. */
const SHOWN = 5;

/**
 * Stage changes lead. Everything else is a detail about a deal; a stage change
 * is the deal itself moving, and it is the only event here that can alter the
 * forecast.
 */
function stageFirst(a: ActivityEvent, b: ActivityEvent): number {
  const rank = (e: ActivityEvent) => (e.eventType === "deal.stage_changed" ? 0 : 1);
  const byKind = rank(a) - rank(b);
  if (byKind !== 0) return byKind;
  return new Date(b.occurredAt).getTime() - new Date(a.occurredAt).getTime();
}

/**
 * What has changed since you were last here.
 *
 * ## The window is the visit, not a fixed period
 *
 * "Last 24 hours" is a period the app chose; "since you were last here" is a
 * period the reader lived through, and it is the only one that makes the list
 * feel addressed to them. The visit ping supplies it — a POST that returns the
 * PREVIOUS timestamp and then stamps a new one, which is why it fires exactly
 * once per mount behind a ref (see use-dashboard-visit.ts; firing it twice
 * collapses the window to nothing, permanently).
 *
 * When there is no previous visit — a first run, or a failed ping — this falls
 * back to the most recent activity rather than rendering empty. An empty
 * "what changed" block on a portfolio that has plainly been changing reads as a
 * broken screen, not as a quiet week.
 */
export function MovementBlock({
  activity,
  previousVisitAt,
  ready,
}: {
  activity: ActivityEvent[];
  previousVisitAt: string | null;
  ready: boolean;
}) {
  const { rows, sinceVisit } = useMemo(() => {
    const floor = previousVisitAt ? new Date(previousVisitAt).getTime() : NaN;
    const scoped = Number.isFinite(floor)
      ? activity.filter((e) => new Date(e.occurredAt).getTime() >= floor)
      : [];
    const usingVisit = scoped.length > 0;
    const source = usingVisit ? scoped : activity;
    return { rows: [...source].sort(stageFirst).slice(0, SHOWN), sinceVisit: usingVisit };
  }, [activity, previousVisitAt]);

  return (
    <MobileCard>
      <CardHeader
        label={sinceVisit ? "Since you were last here" : "Latest movement"}
        action={
          <Link href="/deals" className="m-caption text-primary">
            All deals
          </Link>
        }
      />

      {!ready && rows.length === 0 ? (
        <div className="space-y-3">
          <Shimmer className="h-9" />
          <Shimmer className="h-9" />
        </div>
      ) : rows.length === 0 ? (
        <p className="m-body m-muted">Nothing has moved yet.</p>
      ) : (
        <ul>
          {rows.map((event) => (
            <li key={event.id}>
              <ListRow
                href={`/deals/${event.dealId}`}
                title={activityTitle(event)}
                sub={`${event.dealName ?? "Deal"} · ${event.actor}`}
                trailing={relativeTime(event.occurredAt)}
              />
            </li>
          ))}
        </ul>
      )}
    </MobileCard>
  );
}
