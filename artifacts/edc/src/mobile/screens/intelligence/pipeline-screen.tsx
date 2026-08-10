import { useMemo } from "react";
import { Link } from "wouter";
import { ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";
import { compactCurrency } from "@/lib/format";
import {
  useGetGateFunnel,
  useGetPipelineSimulation,
  useGetVelocityAnalytics,
  useGetWinLossAnalytics,
} from "@workspace/api-client-react";
import { useFlowFunnel } from "@/components/cockpit/flow/use-flow";
import type { FunnelRow as EngineFunnelRow } from "@workspace/engine";
import { TONE_SLIPPING } from "@/mobile/lib/tones";
import { MobileCard, CardHeader } from "@/mobile/components/mobile-card";
import { ListRow } from "@/mobile/components/list-row";
import { Shimmer } from "@/mobile/components/shimmer";
import { MChartFrame } from "@/mobile/charts/m-chart-frame";
import { MForecastBand } from "@/mobile/charts/m-forecast-band";
import { MFunnel } from "@/mobile/charts/m-funnel";
import { MRing } from "@/mobile/charts/m-ring";
import { OUTCOME_PAINT, seriesPaint } from "@/mobile/charts/chart-colors";
import { LensScreen } from "@/mobile/screens/intelligence/lens-screen";

interface SimulationData {
  percentiles: Record<string, number>;
  weightedPipeline: number;
  traditionalWeightedPipeline: number;
}

interface WinLossData {
  won: number;
  lost: number;
  winRatePct: number | null;
  byTcvRange: { range: string; total: number; wins: number; winRatePct: number | null }[];
}

interface VelocityDeal {
  id: string;
  dealName: string;
  stage: string;
  daysInStage: number;
  deltaDays: number | null;
}

/** `/v2/analytics/gate-funnel` is an open payload; this is the slice read here. */
interface GateFunnelGate {
  gateCode: string;
  label: string;
  gateGroup: number;
  completedCount: number;
  totalCount: number;
  pct: number;
}

interface GateFunnelData {
  gates: GateFunnelGate[];
  bottleneck: GateFunnelGate | null;
}

/** How many slow deals the triage list shows before it stops being triage. */
const TRIAGE_SHOWN = 6;

/**
 * The Pipeline lens: what the funnel is worth, how much of it closes, and what
 * has stopped moving.
 *
 * ## The desktop charts became the readings they supported
 *
 * A Monte Carlo fan, a donut, a Sankey and a conversion matrix side by side do
 * not survive 358px. Each is re-cut as the question it answers: the forecast is
 * three percentiles with a band for context, win rate is a proportional ring,
 * the funnel is a stepped cascade that states each drop on the row it belongs
 * to. The Sankey stays off this screen — a two-dimensional flow diagram at thumb
 * scale is decoration, and the funnel carries the same story.
 */
export function PipelineScreen() {
  const simQuery = useGetPipelineSimulation();
  const winLossQuery = useGetWinLossAnalytics();
  const velocityQuery = useGetVelocityAnalytics();
  const funnelQuery = useFlowFunnel();
  const gateFunnelQuery = useGetGateFunnel();

  const sim = simQuery.data?.data as SimulationData | undefined;
  const winLoss = winLossQuery.data?.data as WinLossData | undefined;
  const funnelRows = (funnelQuery.data?.data as EngineFunnelRow[] | undefined) ?? [];
  const gateFunnel = gateFunnelQuery.data?.data as GateFunnelData | undefined;
  // A gate no deal has reached has no pass rate, only a zero that reads as a
  // failure. Filtering them out is what the desktop widget does too.
  const gateRows = (gateFunnel?.gates ?? []).filter((g) => g.totalCount > 0);

  const slowest = useMemo(() => {
    const deals =
      (velocityQuery.data?.data as { deals?: VelocityDeal[] } | undefined)?.deals ?? [];
    return [...deals]
      .filter((d) => d.deltaDays != null && d.deltaDays > 0)
      .sort((a, b) => (b.deltaDays ?? 0) - (a.deltaDays ?? 0))
      .slice(0, TRIAGE_SHOWN);
  }, [velocityQuery.data]);

  const refresh = () =>
    Promise.all([
      simQuery.refetch(),
      winLossQuery.refetch(),
      velocityQuery.refetch(),
      funnelQuery.refetch(),
      gateFunnelQuery.refetch(),
    ]);

  const decided = (winLoss?.won ?? 0) + (winLoss?.lost ?? 0);

  return (
    <LensScreen
      subtitle={sim ? `${compactCurrency(sim.percentiles.p50 ?? 0)} likely` : undefined}
      onRefresh={refresh}
    >
      <MChartFrame
        title="Probabilistic forecast"
        subtitle="Monte Carlo across the open pipeline"
        loading={simQuery.isLoading}
        empty={!simQuery.isLoading && !sim ? "No simulation yet." : undefined}
        data={
          sim
            ? Object.entries(sim.percentiles).map(([k, v]) => ({
                label: k.toUpperCase(),
                value: compactCurrency(v),
              }))
            : undefined
        }
      >
        {sim ? (
          <>
            <MForecastBand
              forecast={{
                p10: sim.percentiles.p10 ?? 0,
                p25: sim.percentiles.p25 ?? 0,
                p50: sim.percentiles.p50 ?? 0,
                p75: sim.percentiles.p75 ?? 0,
                p90: sim.percentiles.p90 ?? 0,
              }}
              format={(n) => compactCurrency(n)}
            />
            <p className="m-caption m-muted mt-3">
              Traditional weighted: {compactCurrency(sim.traditionalWeightedPipeline)}
            </p>
          </>
        ) : (
          <span />
        )}
      </MChartFrame>

      <MChartFrame
        title="Win rate"
        subtitle={decided > 0 ? `${decided} decided deals` : undefined}
        loading={winLossQuery.isLoading}
        empty={!winLossQuery.isLoading && decided === 0 ? "Nothing decided yet." : undefined}
        data={winLoss?.byTcvRange.map((band) => ({
          label: band.range,
          value: band.winRatePct != null ? `${Math.round(band.winRatePct)}%` : "—",
          detail: `${band.wins}/${band.total}`,
        }))}
      >
        {winLoss && decided > 0 ? (
          <MRing
            data={[
              { label: "Won", value: winLoss.won, paint: OUTCOME_PAINT.won },
              { label: "Lost", value: winLoss.lost, paint: OUTCOME_PAINT.lost },
            ]}
            centreValue={winLoss.winRatePct != null ? `${Math.round(winLoss.winRatePct)}%` : "—"}
            centreLabel="win rate"
            size={116}
            thickness={13}
          />
        ) : (
          <span />
        )}
      </MChartFrame>

      <MChartFrame
        title="Pipeline by stage"
        loading={funnelQuery.isLoading}
        empty={!funnelQuery.isLoading && funnelRows.length === 0 ? "No stage movement recorded yet." : undefined}
        data={funnelRows.map((row) => ({
          label: row.stageName,
          value: compactCurrency(row.totalValue),
          detail: `${row.dealCount} deals`,
        }))}
      >
        <MFunnel
          rows={funnelRows.map((row, i) => ({
            label: row.stageName,
            value: row.totalValue,
            paint: seriesPaint(i),
          }))}
          format={(n) => compactCurrency(n)}
        />
      </MChartFrame>

      <MobileCard>
        <CardHeader label="Slowest against benchmark" />
        {velocityQuery.isLoading ? (
          <Shimmer className="h-20" />
        ) : slowest.length === 0 ? (
          <p className="m-body m-muted">Every deal is at or ahead of its stage benchmark.</p>
        ) : (
          <ul>
            {slowest.map((deal) => (
              <li key={deal.id}>
                <ListRow
                  href={`/deals/${deal.id}`}
                  title={deal.dealName}
                  sub={deal.stage}
                  trailing={<span className={TONE_SLIPPING}>+{deal.deltaDays}d</span>}
                />
              </li>
            ))}
          </ul>
        )}
      </MobileCard>

      {gateRows.length > 0 ? (
        <MobileCard>
          <CardHeader
            label="Gate completion"
            action={
              gateFunnel?.bottleneck ? (
                <span className="m-caption text-destructive">
                  {gateFunnel.bottleneck.label} is the bottleneck
                </span>
              ) : undefined
            }
          />
          <ul className="space-y-2.5">
            {gateRows.map((row) => (
              <li key={row.gateCode}>
                <div className="m-caption flex items-baseline justify-between gap-3">
                  <span className="min-w-0 flex-1 truncate">{row.label}</span>
                  <span className="m-muted m-num shrink-0">
                    {Math.round(row.pct)}% of {row.totalCount}
                  </span>
                </div>
                <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-muted" aria-hidden="true">
                  <div
                    className={cn(
                      "h-full rounded-full",
                      // The bottleneck is the one worth spotting from across a
                      // room, so it is the only bar that changes colour.
                      row.gateCode === gateFunnel?.bottleneck?.gateCode
                        ? "bg-destructive"
                        : "bg-primary",
                    )}
                    style={{ width: `${Math.max(0, Math.min(100, row.pct))}%` }}
                  />
                </div>
              </li>
            ))}
          </ul>
        </MobileCard>
      ) : null}

      <Link href="/analytics/flow" className="m-card m-press m-reveal block p-4">
        <div className="flex items-center gap-3">
          <div className="min-w-0 flex-1">
            <p className="m-headline">Flow</p>
            <p className="m-caption m-muted mt-0.5 text-pretty">
              Pipeline health, stage-to-stage conversion, and what is recycling.
            </p>
          </div>
          <ChevronRight className="m-muted h-4 w-4 shrink-0" aria-hidden="true" />
        </div>
      </Link>
    </LensScreen>
  );
}
