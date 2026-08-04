import type { ActivityEvent } from "@workspace/api-client-react";
import { relativeTime } from "@/lib/format";
import { activityTitle } from "@/lib/activity-title";
import { CollapsibleSection } from "@/mobile/components/collapsible-section";

/** How many entries the expanded timeline shows before it stops. */
const VISIBLE_ENTRIES = 12;

/**
 * What has happened to this deal lately. Titles come from the shared
 * activityTitle helper, so a phone phrases an event exactly the way the
 * cockpit timeline and the dashboard feed do.
 */
export function HistorySection({ events }: { events: ActivityEvent[] }) {
  const latest = events[0];

  const verdict = (
    <p className="m-data m-muted">
      {latest
        ? `${activityTitle(latest)} · ${relativeTime(latest.occurredAt)}`
        : "Nothing recorded yet"}
    </p>
  );

  return (
    <CollapsibleSection anchorId="history" label="History" verdict={verdict}>
      {events.length > 0 ? (
        <ol className="space-y-3">
          {events.slice(0, VISIBLE_ENTRIES).map((event) => (
            <li key={event.id}>
              <div className="flex items-baseline justify-between gap-3">
                <p className="min-w-0 flex-1 text-sm">{activityTitle(event)}</p>
                <span className="m-data m-muted shrink-0">{relativeTime(event.occurredAt)}</span>
              </div>
              <p className="m-data m-muted mt-0.5">by {event.actor}</p>
            </li>
          ))}
        </ol>
      ) : undefined}
    </CollapsibleSection>
  );
}
