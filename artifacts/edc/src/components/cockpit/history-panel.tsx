import { useState } from "react";
import {
  useListDealActivity,
  useListDealHealthHistory,
  useListDealSnapshots,
} from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Camera, ChevronRight } from "lucide-react";
import { SnapshotViewer } from "./snapshot-viewer";

const compactNumber = new Intl.NumberFormat("en-US", {
  notation: "compact",
  maximumFractionDigits: 1,
});

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

function snapshotLabel(reason: string, triggerEvent: string | null | undefined) {
  if (reason === "periodic") return "Periodic snapshot";
  if (triggerEvent) return triggerEvent.replace(/[._]/g, " ");
  return reason.replace(/^event:/, "").replace(/[._]/g, " ");
}

/**
 * Phase 2 durable history view. Reads the event-sourced activity stream, the
 * health-transition timeline, and the durable point-in-time snapshots from the
 * `/api/v2` endpoints (edc_v2 schema). Snapshots are openable as a full
 * read-only "time machine" view. This is intentionally separate from the
 * Phase 1 audit `ActivityFeed`.
 */
export function HistoryPanel({ dealId }: { dealId: string }) {
  const { data: activity } = useListDealActivity(dealId, { limit: 50 });
  const { data: health } = useListDealHealthHistory(dealId, { limit: 50 });
  const { data: snapshots } = useListDealSnapshots(dealId, { limit: 50 });

  const [selectedSnapshot, setSelectedSnapshot] = useState<string | null>(null);

  const events = activity?.data ?? [];
  const transitions = health?.data ?? [];
  const snaps = snapshots?.data ?? [];

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="text-lg flex items-center gap-2">
            <Camera className="h-5 w-5 text-muted-foreground" />
            Snapshots
          </CardTitle>
        </CardHeader>
        <CardContent>
          {snaps.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No snapshots captured yet.
            </p>
          ) : (
            <ul className="divide-y">
              {snaps.map((s) => (
                <li key={s.id}>
                  <button
                    type="button"
                    onClick={() => setSelectedSnapshot(s.id)}
                    className="w-full flex items-center gap-3 py-2.5 text-left hover:bg-muted/40 rounded-md px-2 -mx-2 transition-colors"
                  >
                    <Badge
                      variant={s.healthStatus === "RED" ? "destructive" : "secondary"}
                      className="shrink-0 w-16 justify-center"
                    >
                      {s.healthStatus}
                    </Badge>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium capitalize truncate">
                        {snapshotLabel(s.reason, s.triggerEvent)}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {new Date(s.snapshotAt).toLocaleString()}
                        {s.salesStage ? ` · ${s.salesStage}` : ""}
                      </p>
                    </div>
                    {s.calculatedTcv != null && (
                      <span className="text-sm font-mono text-muted-foreground whitespace-nowrap hidden sm:block">
                        TCV {compactNumber.format(Number(s.calculatedTcv))}
                      </span>
                    )}
                    <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0" />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

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

      <SnapshotViewer
        snapshotId={selectedSnapshot}
        open={selectedSnapshot !== null}
        onOpenChange={(open) => {
          if (!open) setSelectedSnapshot(null);
        }}
      />
    </div>
  );
}
