import { useState } from "react";
import {
  useGetIntelligenceSummary,
  useGetVitalSigns,
  useListPortfolioActivity,
  useListDeals,
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
import { DashboardHero } from "@/components/dashboard/dashboard-hero";

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

  // RED-health deals, used for TCV-at-risk and to attach TCV to alert cards.
  const { data: redDealsWrapper } = useListDeals({
    health: "RED",
    state: "active",
    limit: 200,
  });
  const redDeals = redDealsWrapper?.data ?? [];
  const tcvAtRisk = redDeals.reduce(
    (sum, d) => sum + (d.normalizedTCV ?? d.calculatedTCV ?? 0),
    0,
  );
  const tcvByDealId: Record<string, number> = Object.fromEntries(
    redDeals.map((d) => [d.id, d.normalizedTCV ?? d.calculatedTCV ?? 0]),
  );

  const openHealth = (band: Health) => {
    setHealthInitial(band);
    setOpenDialog("health");
  };
  const openStage = (stage: string) => {
    setStageSelected(stage);
    setOpenDialog("stage");
  };

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
  const staleCount = summary?.staleDeals?.length ?? 0;
  const vitalSigns = vitalSignsWrapper?.data as
    | { weightedPipeline: number; avgScore: number | null }
    | undefined;
  const weightedPipeline = vitalSigns?.weightedPipeline ?? 0;
  const avgScore = vitalSigns?.avgScore ?? null;

  return (
    <div className="p-8 max-w-[1600px] mx-auto space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <DashboardHero />

      {/* Row 1 — Pipeline Vital Signs */}
      <VitalSignsBar
        totalTCV={totalTCV}
        activeDeals={activeDeals}
        redAlerts={counts.RED}
        staleCount={staleCount}
        reportingCurrency={reportingCurrency}
        onOpenTcv={() => setOpenDialog("tcv")}
        onOpenRed={() => openHealth("RED")}
        onOpenStale={() => setOpenDialog("stale")}
        onOpenWeightedPipeline={() => setOpenDialog("weightedPipeline")}
        onOpenAvgScore={() => setOpenDialog("avgScore")}
      />

      {/* Row 2 — Health Distribution + Pipeline Risk Overview + Critical Alerts */}
      <div className="grid grid-cols-1 @3xl:grid-cols-2 @5xl:grid-cols-3 gap-6">
        <HealthDistribution
          counts={counts}
          tcvAtRisk={tcvAtRisk}
          reportingCurrency={reportingCurrency}
          onSelect={openHealth}
        />
        <PipelineRiskOverview reportingCurrency={reportingCurrency} />
        <CriticalAlertsFeed
          alerts={summary?.criticalAlerts ?? []}
          tcvByDealId={tcvByDealId}
          reportingCurrency={reportingCurrency}
          onViewAll={() => setOpenDialog("alerts")}
          onSelect={(dealId) => navigate(`/deals/${dealId}`)}
        />
      </div>

      {/* Row 3 — Next Actions + Forecast */}
      <div className="grid grid-cols-1 @3xl:grid-cols-2 gap-6">
        <NextActions onViewAll={() => setOpenDialog("actions")} />
        <ForecastSnapshot reportingCurrency={reportingCurrency} />
      </div>

      {/* Row 4 — Stage Funnel + Gate Funnel */}
      <div className="grid grid-cols-1 @3xl:grid-cols-2 gap-6">
        <StageFunnel reportingCurrency={reportingCurrency} onSelectStage={openStage} />
        <GateFunnel />
      </div>

      {/* Row 5 — Deal Roster */}
      <DealRoster reportingCurrency={reportingCurrency} />

      {/* Row 6 — Close Timeline + Recent Activity */}
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
                        {e.summary}
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

      {/* Row 7 — Velocity + Competitive */}
      <div className="grid grid-cols-1 @3xl:grid-cols-2 gap-6">
        <VelocitySummary />
        <CompetitiveSummary />
      </div>

      {/* Row 8 — Simulation Band */}
      <SimulationBand reportingCurrency={reportingCurrency} />

      {/* Row 9 — Deal Memory Insights */}
      <MemoryInsights />

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
        alerts={summary?.criticalAlerts ?? []}
      />
      <StaleDealsDialog
        open={openDialog === "stale"}
        onOpenChange={(o) => setOpenDialog(o ? "stale" : null)}
        staleDeals={summary?.staleDeals ?? []}
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
