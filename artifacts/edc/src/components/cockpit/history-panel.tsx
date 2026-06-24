import {
  useListDealActivity,
  useListDealHealthHistory,
} from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

const HEALTH_COLORS: Record<string, string> = {
  GREEN: "text-emerald-500",
  YELLOW: "text-amber-500",
  AMBER: "text-amber-500",
  RED: "text-red-500",
};

function healthClass(status: string | null | undefined) {
  if (!status) return "text-muted-foreground";
  return HEALTH_COLORS[status] ?? "text-muted-foreground";
}

/**
 * Phase 2 durable history view. Reads the event-sourced activity stream and
 * health-transition timeline from the `/api/v2` endpoints (edc_v2 schema).
 * This is intentionally separate from the Phase 1 audit `ActivityFeed`.
 */
export function HistoryPanel({ dealId }: { dealId: string }) {
  const { data: activity } = useListDealActivity(dealId, { limit: 50 });
  const { data: health } = useListDealHealthHistory(dealId, { limit: 50 });

  const events = activity?.data ?? [];
  const transitions = health?.data ?? [];

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Activity Stream</CardTitle>
        </CardHeader>
        <CardContent>
          {events.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No activity recorded yet.
            </p>
          ) : (
            <ul className="space-y-3">
              {events.map((e) => (
                <li
                  key={e.id}
                  className="text-sm border-l-2 border-primary/40 pl-3"
                >
                  <div className="flex justify-between gap-2">
                    <span className="font-medium">{e.summary}</span>
                    <span className="text-xs text-muted-foreground whitespace-nowrap">
                      {new Date(e.occurredAt).toLocaleString()}
                    </span>
                  </div>
                  <p className="text-xs text-muted-foreground font-mono">
                    {e.eventType}
                    {e.entityId ? ` · ${e.entityId}` : ""}
                  </p>
                  <p className="text-xs text-muted-foreground">by {e.actor}</p>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Health Timeline</CardTitle>
        </CardHeader>
        <CardContent>
          {transitions.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No health transitions recorded yet.
            </p>
          ) : (
            <ul className="space-y-3">
              {transitions.map((t) => (
                <li key={t.id} className="text-sm">
                  <div className="flex justify-between gap-2">
                    <span className="font-mono font-medium">
                      <span className={healthClass(t.fromStatus)}>
                        {t.fromStatus ?? "—"}
                      </span>
                      {" → "}
                      <span className={healthClass(t.toStatus)}>
                        {t.toStatus}
                      </span>
                    </span>
                    <span className="text-xs text-muted-foreground whitespace-nowrap">
                      {new Date(t.changedAt).toLocaleString()}
                    </span>
                  </div>
                  {t.reason ? (
                    <p className="text-xs text-muted-foreground">{t.reason}</p>
                  ) : null}
                  <p className="text-xs text-muted-foreground">by {t.actor}</p>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
