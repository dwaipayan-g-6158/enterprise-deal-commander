import { useEffect, useMemo, useState } from "react";
import {
  useListDealActivity,
  useListAudit,
  useGetDeal,
  useListPipelineStages,
  useListPricingModels,
  useListServicesTiers,
  useGetDealIntelligence,
} from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { FileEdit, History } from "lucide-react";
import { TimelineList } from "./history/timeline-list";
import { activityToRows, auditToRows, type AuditLookups } from "./history/adapters";

// Phase 2 durable history view, plus the Phase 1 field-level audit trail that
// used to live in a separate "Activity" sub-tab.
//
// Those were two adjacent sub-tabs both showing reverse-chronological lists of
// things that changed, so you had to guess which one held your answer — and
// neither was complete: the audit log records cross-sell/disposition/
// intervention/blocker-delete but NOT MEDDPICC/playbook/autopsy/health, while
// the activity log records the reverse. They're a narrative layer and its
// field-level evidence, so they're one destination with two view modes rather
// than peers. They are deliberately NOT interleaved: audit rows are timestamped
// by Postgres now() in the request handler and activity rows by a Node Date in
// an async subscriber, so the two clocks can't be ordered against each other
// reliably.
//
// The old "Health Timeline" card is gone: the activity-logger writes a row for
// every event type including health.changed, so each transition was already in
// the stream — its from/to and reason are folded into those rows from the same
// event's metadata (see adapters.readHealthMeta).
//
// SNAPSHOTS ARE INTENTIONALLY NOT SURFACED HERE. Capture is untouched and fully
// intact server-side (lib/subscribers/snapshot-service.ts and the /api/v2
// snapshot endpoints), and snapshot data still reaches the UI — just not as a
// list: deal-trajectory.tsx charts it above the tab strip, and Briefing Mode
// replays deal state by DATE, which is how people actually ask the question.
// A per-instant snapshot list asked users to navigate by capture timestamp, an
// axis nobody thinks in, and the hourly job made it ~3:1 noise. The read-only
// point-in-time viewer that used to open from it has been removed; recover it
// from git history if a forensic view is ever wanted (see the payload privacy
// rule in .agents/memory/edc-snapshot-payload.md before rendering one).

const PAGE = 50;
const MAX_PAGE = 200; // server clamp (clampLimit in routes/v2/index.ts)

export function HistoryPanel({ dealId }: { dealId: string }) {
  const [mode, setMode] = useState<"timeline" | "changes">("timeline");
  const [limit, setLimit] = useState(PAGE);

  // This panel is re-rendered with a new dealId (cockpit arrow-key nav
  // navigates between /deals/:id without unmounting), so per-deal UI state has
  // to be reset explicitly rather than relying on a remount.
  useEffect(() => {
    setLimit(PAGE);
  }, [dealId]);

  const activity = useListDealActivity(dealId, { limit });
  // limit: 200 deliberately — the generated query key includes params, so this
  // shares one cache entry with engine-recompute.ts's useListAudit(id, {limit:
  // 200}) instead of adding a third key for the same endpoint, and it lifts the
  // 50-row default at the same time.
  const audit = useListAudit(dealId, { limit: MAX_PAGE });

  const { data: dealRes } = useGetDeal(dealId);
  const { data: intelRes } = useGetDealIntelligence(dealId);
  const { data: stages } = useListPipelineStages();
  const { data: models } = useListPricingModels();
  const { data: tiers } = useListServicesTiers();

  const lookups: AuditLookups = useMemo(
    () => ({
      stages: stages?.data,
      pricingModels: models?.data,
      servicesTiers: tiers?.data,
      currency: dealRes?.data?.dealCurrency ?? "USD",
      gateLabels: Object.fromEntries(
        (intelRes?.data?.technicalTrack.gates ?? []).map((g) => [g.gateCode, g.label]),
      ),
    }),
    [stages, models, tiers, dealRes, intelRes],
  );

  const timelineRows = useMemo(
    () => activityToRows(activity.data?.data ?? []),
    [activity.data],
  );
  const changeRows = useMemo(
    () => auditToRows(audit.data?.data ?? [], lookups),
    [audit.data, lookups],
  );

  const active = mode === "timeline" ? activity : audit;
  const state = active.isLoading ? "loading" : active.isError ? "error" : "ready";

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="pb-3">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <CardTitle className="text-lg">History</CardTitle>
            {/* Narrative vs field-level evidence — a refinement within one
                destination, not two places to look. */}
            <div className="flex items-center gap-1 rounded-md border p-0.5">
              <Button
                variant={mode === "timeline" ? "secondary" : "ghost"}
                size="sm"
                className="h-7 gap-1.5 px-2.5 text-xs"
                onClick={() => setMode("timeline")}
              >
                <History className="h-3.5 w-3.5" /> Timeline
              </Button>
              <Button
                variant={mode === "changes" ? "secondary" : "ghost"}
                size="sm"
                className="h-7 gap-1.5 px-2.5 text-xs"
                onClick={() => setMode("changes")}
              >
                <FileEdit className="h-3.5 w-3.5" /> Field changes
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {mode === "timeline" ? (
            <TimelineList
              rows={timelineRows}
              state={state}
              onRetry={() => activity.refetch()}
              total={activity.data?.meta?.total}
              onShowAll={limit < MAX_PAGE ? () => setLimit(MAX_PAGE) : undefined}
              label="Deal timeline"
              empty={{
                icon: History,
                title: "Nothing has happened yet",
                description:
                  "Stage moves, gate sign-offs, blockers and health changes will show up here as this deal progresses.",
              }}
            />
          ) : (
            <TimelineList
              rows={changeRows}
              state={state}
              onRetry={() => audit.refetch()}
              total={audit.data?.meta?.total}
              label="Field changes"
              empty={{
                icon: FileEdit,
                title: "No field edits recorded",
                description:
                  "Every saved edit to this deal's values lands here, grouped by save. Not every field is tracked, so the Timeline may show activity this list doesn't.",
              }}
            />
          )}
        </CardContent>
      </Card>
    </div>
  );
}
