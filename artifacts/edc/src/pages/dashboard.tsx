import { Fragment, useEffect, useRef, useState, type ReactNode } from "react";
import {
  useGetIntelligenceSummary,
  useGetVitalSigns,
  useListPortfolioActivity,
  useDashboardVisit,
} from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { useLocation } from "wouter";
import { CriticalAlertsDialog } from "@/components/dashboard/critical-alerts-dialog";
import { NextActionsDialog } from "@/components/dashboard/next-actions-dialog";
import { StaleDealsDialog } from "@/components/dashboard/stale-deals-dialog";
import { HealthStatusDialog } from "@/components/dashboard/health-status-dialog";
import { TotalTcvDialog } from "@/components/dashboard/total-tcv-dialog";
import { WeightedPipelineDialog } from "@/components/dashboard/weighted-pipeline-dialog";
import { AvgScoreDialog } from "@/components/dashboard/avg-score-dialog";
import { StageDealsDialog } from "@/components/dashboard/stage-deals-dialog";
import { VitalSignsBar } from "@/components/dashboard/widgets/vital-signs-bar";
import { HealthDistribution } from "@/components/dashboard/widgets/health-distribution";
import { CriticalAlertsFeed } from "@/components/dashboard/widgets/critical-alerts-feed";
import { StageFunnel } from "@/components/dashboard/widgets/stage-funnel";
import { ForecastSnapshot } from "@/components/dashboard/widgets/forecast-snapshot";
import { NextActions } from "@/components/dashboard/widgets/next-actions";
import { DealRoster } from "@/components/dashboard/widgets/deal-roster";
import { CloseTimeline } from "@/components/dashboard/widgets/close-timeline";
import { VelocitySummary } from "@/components/dashboard/widgets/velocity-summary";
import { CompetitiveSummary } from "@/components/dashboard/widgets/competitive-summary";
import { GateFunnel } from "@/components/dashboard/widgets/gate-funnel";
import { SimulationBand } from "@/components/dashboard/widgets/simulation-band";
import { MemoryInsights } from "@/components/dashboard/widgets/memory-insights";
import { PipelineRiskOverview } from "@/components/dashboard/widgets/pipeline-risk-overview";
import { relativeTime, type Health } from "@/components/dashboard/widgets/_shared";
import { activityTitle } from "@/lib/activity-title";
import { DashboardHero } from "@/components/dashboard/dashboard-hero";
import { CelebrationWatcher } from "@/components/dashboard/celebration-watcher";
import { DailyBar } from "@/components/dashboard/daily-bar/daily-bar";
import { CustomizeLayoutControl } from "@/components/dashboard/customize-layout-control";
import { getRowOrder, saveRowOrder, resetRowOrder } from "@/lib/dashboard-layout/row-order";
import { defaultStore } from "@/lib/storage";

type OpenDialog =
  | null
  | "tcv"
  | "alerts"
  | "stale"
  | "health"
  | "stage"
  | "weightedPipeline"
  | "avgScore"
  | "actions";

export default function Dashboard() {
  const { data: summaryWrapper, isLoading } = useGetIntelligenceSummary();
  const { data: vitalSignsWrapper } = useGetVitalSigns();
  const [, navigate] = useLocation();

  const [openDialog, setOpenDialog] = useState<OpenDialog>(null);
  const [healthInitial, setHealthInitial] = useState<Health>("RED");
  const [stageSelected, setStageSelected] = useState<string | null>(null);

  const summary = summaryWrapper?.data;

  // Live portfolio-wide activity feed (every mutation flows into
  // edc_v2.deal_activity_log via the event bus).
  const { data: activityWrapper } = useListPortfolioActivity({ limit: 8 });
  const activity = activityWrapper?.data ?? [];

  // TCV-at-risk and each alert's own TCV now come from the summary itself
  // (`tcvAtRiskRed`, and `tcv` on every criticalAlerts entry). This used to be
  // a separate `useListDeals({ health: "RED", limit: 200 })` fetch, which was
  // wrong twice over: it capped at 200 deals, and it keyed alert TCV to
  // RED-HEALTH deals when `criticalAlerts` holds RED-SEVERITY alerts — an alert
  // on a YELLOW/GREEN deal found no entry and rendered with no money on it.
  // Dropping it also removes one full-portfolio serialization per page load.

  const openHealth = (band: Health) => {
    setHealthInitial(band);
    setOpenDialog("health");
  };
  const openStage = (stage: string) => {
    setStageSelected(stage);
    setOpenDialog("stage");
  };

  // Readers are explicitly allowed to call this (routes/index rbac allowlist
  // — it only ever touches the caller's OWN last_dashboard_visit_at). The
  // suppress flag is cheap insurance: if that allowlist ever regresses, a
  // reader would otherwise get a destructive "read-only" toast on every
  // single dashboard load instead of just losing the welcome-back diff.
  const dashboardVisit = useDashboardVisit({
    mutation: { meta: { suppressForbiddenToast: true } },
  });
  const dashboardVisitTouched = useRef(false);
  const [previousVisitAt, setPreviousVisitAt] = useState<string | null | undefined>(undefined);

  useEffect(() => {
    if (dashboardVisitTouched.current) return;
    dashboardVisitTouched.current = true;
    dashboardVisit.mutateAsync().then(
      (res) => setPreviousVisitAt(res.previousVisitAt),
      () => setPreviousVisitAt(null),
    );
    // Intentionally fires exactly once per mount, not on every dep identity churn.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const [rowOrder, setRowOrder] = useState<string[]>(() => getRowOrder(defaultStore));

  function handleReorder(next: string[]) {
    setRowOrder(next);
    saveRowOrder(defaultStore, next);
  }
  function handleResetLayout() {
    resetRowOrder(defaultStore);
    setRowOrder(getRowOrder(defaultStore));
  }

  if (isLoading) {
    return (
      <div className="p-8 space-y-6">
        <Skeleton className="h-10 w-[260px]" />
        <div className="grid grid-cols-2 @4xl:grid-cols-5 gap-6">
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-32 rounded-xl" />
          ))}
        </div>
        <div className="grid grid-cols-1 @3xl:grid-cols-2 gap-6">
          <Skeleton className="h-64 rounded-xl" />
          <Skeleton className="h-64 rounded-xl" />
        </div>
      </div>
    );
  }

  const counts = {
    GREEN: summary?.dealsByHealth?.GREEN ?? 0,
    YELLOW: summary?.dealsByHealth?.YELLOW ?? 0,
    RED: summary?.dealsByHealth?.RED ?? 0,
  };
  const reportingCurrency = summary?.reportingCurrency || "USD";
  const totalTCV = summary?.totalTCV ?? 0;
  const activeDeals = summary?.totalDealsMonitored ?? 0;
  // The TRUE counts, not the capped detail lists' `.length` — see
  // DETAIL_LIST_LIMIT in the server's computeSummary.
  const staleCount = summary?.staleDealsTotal ?? 0;
  const criticalAlertCount = summary?.criticalAlertsTotal ?? 0;
  const tcvAtRisk = summary?.tcvAtRiskRed ?? 0;
  const criticalAlerts = summary?.criticalAlerts ?? [];
  const vitalSigns = vitalSignsWrapper?.data as
    | { weightedPipeline: number; avgScore: number | null }
    | undefined;
  const weightedPipeline = vitalSigns?.weightedPipeline ?? 0;
  const avgScore = vitalSigns?.avgScore ?? null;

  return (
    /**
     * `slide-in-from-bottom-4` is gone, and the fade is shorter.
     *
     * The slide fired when the intelligence-summary query flipped — one of fifteen
     * on this page — so the whole dashboard travelled 16px upward while the other
     * fourteen were still landing. It read as the page arriving and then failing to
     * settle, which is the single most "unpolished" thing a refresh did here.
     *
     * The entrance belongs to AppReveal now: it holds an opaque canvas over the
     * app until the shell, the session, the fonts and this page's first data wave
     * are all quiet, then cross-fades once. A second, longer entrance underneath
     * that is the "full page restart" feel this work exists to remove — two
     * animations for one arrival, the inner one starting before the content it is
     * animating exists.
     *
     * A short fade is kept rather than nothing at all, for the case AppReveal
     * cannot cover: its 1200ms ceiling can lift the mask while this page is still
     * on its skeleton, and a hard cut from skeleton to content is worth softening.
     * No transform, so it cannot move anything.
     */
    <div className="p-8 max-w-[1600px] mx-auto space-y-6 animate-in fade-in duration-200">
      <DashboardHero reportingCurrency={reportingCurrency} />
      <CelebrationWatcher previousVisitAt={previousVisitAt} />
      <DailyBar previousVisitAt={previousVisitAt} reportingCurrency={reportingCurrency} />

      {(() => {
        const rowsById: Record<string, ReactNode> = {
          "vital-signs": (
            <VitalSignsBar
              totalTCV={totalTCV}
              activeDeals={activeDeals}
              // The count of RED-severity ALERTS, so this tile agrees with the
              // "Critical Alerts (N)" card beside it. It used to be
              // `counts.RED` — the number of RED-HEALTH DEALS — which read as a
              // flat contradiction whenever an alert fired on a deal whose
              // health wasn't RED ("Red Alerts: 0" next to "Critical Alerts
              // (1)"). Opens the alerts dialog to match.
              redAlerts={criticalAlertCount}
              staleCount={staleCount}
              reportingCurrency={reportingCurrency}
              onOpenTcv={() => setOpenDialog("tcv")}
              onOpenRed={() => setOpenDialog("alerts")}
              onOpenStale={() => setOpenDialog("stale")}
              onOpenWeightedPipeline={() => setOpenDialog("weightedPipeline")}
              onOpenAvgScore={() => setOpenDialog("avgScore")}
            />
          ),
          "health-risk-alerts": (
            <div className="grid grid-cols-1 @3xl:grid-cols-2 @5xl:grid-cols-3 gap-6">
              <HealthDistribution
                counts={counts}
                tcvAtRisk={tcvAtRisk}
                reportingCurrency={reportingCurrency}
                onSelect={openHealth}
              />
              <PipelineRiskOverview reportingCurrency={reportingCurrency} />
              <CriticalAlertsFeed
                alerts={criticalAlerts}
                totalCount={criticalAlertCount}
                reportingCurrency={reportingCurrency}
                onViewAll={() => setOpenDialog("alerts")}
                onSelect={(dealId) => navigate(`/deals/${dealId}`)}
              />
            </div>
          ),
          "actions-forecast": (
            <div className="grid grid-cols-1 @3xl:grid-cols-2 gap-6">
              <NextActions onViewAll={() => setOpenDialog("actions")} />
              <ForecastSnapshot reportingCurrency={reportingCurrency} />
            </div>
          ),
          "stage-gate-funnel": (
            <div className="grid grid-cols-1 @3xl:grid-cols-2 gap-6">
              <StageFunnel reportingCurrency={reportingCurrency} onSelectStage={openStage} />
              <GateFunnel />
            </div>
          ),
          "deal-roster": <DealRoster reportingCurrency={reportingCurrency} />,
          "close-timeline-activity": (
            <div className="grid grid-cols-1 @3xl:grid-cols-2 gap-6">
              <CloseTimeline reportingCurrency={reportingCurrency} />
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-base">Recent Activity</CardTitle>
                </CardHeader>
                <CardContent>
                  {activity.length > 0 ? (
                    <ul className="space-y-3">
                      {activity.map((e) => (
                        <li key={e.id} className="text-sm border-l-2 border-primary/40 pl-3">
                          <div className="flex justify-between gap-2">
                            <button
                              type="button"
                              onClick={() => navigate(`/deals/${e.dealId}`)}
                              className="font-medium text-left hover:underline cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded-sm"
                            >
                              {/* Not e.summary: for deal.updated the server
                                  writes a raw camelCase key dump. Terminal row
                                  with nothing to expand into, so name up to
                                  three fields before falling back to a count. */}
                              {activityTitle(e, { maxNamedFields: 3 })}
                            </button>
                            <span className="text-xs text-muted-foreground whitespace-nowrap">
                              {relativeTime(e.occurredAt)}
                            </span>
                          </div>
                          <p className="text-xs text-muted-foreground">
                            {e.dealName ?? "Deal"} · by {e.actor}
                          </p>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="text-sm text-muted-foreground">It's quiet in here. Let's change that.</p>
                  )}
                </CardContent>
              </Card>
            </div>
          ),
          "velocity-competitive": (
            <div className="grid grid-cols-1 @3xl:grid-cols-2 gap-6">
              <VelocitySummary />
              <CompetitiveSummary />
            </div>
          ),
          "simulation-band": <SimulationBand reportingCurrency={reportingCurrency} />,
          "memory-insights": <MemoryInsights />,
        };

        return (
          <>
            <div className="flex justify-end">
              <CustomizeLayoutControl
                rowOrder={rowOrder}
                onReorder={handleReorder}
                onReset={handleResetLayout}
              />
            </div>
            {rowOrder.map((id) => (
              <Fragment key={id}>{rowsById[id]}</Fragment>
            ))}
          </>
        );
      })()}

      <TotalTcvDialog
        open={openDialog === "tcv"}
        onOpenChange={(o) => setOpenDialog(o ? "tcv" : null)}
        totalTCV={totalTCV}
        totalDeals={activeDeals}
        reportingCurrency={reportingCurrency}
      />
      <CriticalAlertsDialog
        open={openDialog === "alerts"}
        onOpenChange={(o) => setOpenDialog(o ? "alerts" : null)}
        alerts={criticalAlerts}
        totalCount={criticalAlertCount}
      />
      <StaleDealsDialog
        open={openDialog === "stale"}
        onOpenChange={(o) => setOpenDialog(o ? "stale" : null)}
        staleDeals={summary?.staleDeals ?? []}
        totalCount={staleCount}
      />
      <HealthStatusDialog
        open={openDialog === "health"}
        onOpenChange={(o) => setOpenDialog(o ? "health" : null)}
        counts={counts}
        initialHealth={healthInitial}
      />
      <StageDealsDialog
        open={openDialog === "stage"}
        onOpenChange={(o) => setOpenDialog(o ? "stage" : null)}
        stage={stageSelected}
      />
      <WeightedPipelineDialog
        open={openDialog === "weightedPipeline"}
        onOpenChange={(o) => setOpenDialog(o ? "weightedPipeline" : null)}
        weightedPipeline={weightedPipeline}
        totalTCV={totalTCV}
        reportingCurrency={reportingCurrency}
      />
      <AvgScoreDialog
        open={openDialog === "avgScore"}
        onOpenChange={(o) => setOpenDialog(o ? "avgScore" : null)}
        avgScore={avgScore}
      />
      <NextActionsDialog
        open={openDialog === "actions"}
        onOpenChange={(o) => setOpenDialog(o ? "actions" : null)}
      />
    </div>
  );
}
