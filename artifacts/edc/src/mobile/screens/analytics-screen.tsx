import { useState } from "react";
import { Link } from "wouter";
import {
  useGetPipelineSimulation,
  useGetWinLossAnalytics,
  useGetVelocityAnalytics,
} from "@workspace/api-client-react";
import { useFlowFunnel, useFlowHealthScore } from "@/components/cockpit/flow/use-flow";
import type { FunnelRow } from "@workspace/engine";
import { compactCurrency, humanizeCode } from "@/lib/format";
import { cn } from "@/lib/utils";
import { OUTCOME_CLASS } from "@/lib/semantic-colors";
import { MobileHeader } from "@/mobile/shell/mobile-header";
import { MobileCard, CardHeader } from "@/mobile/components/mobile-card";
import { SegmentChips, type Segment } from "@/mobile/components/segment-chips";
import { Shimmer } from "@/mobile/components/shimmer";
import { PullToRefresh } from "@/mobile/components/pull-to-refresh";

type TabId = "forecast" | "flow";

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

interface HealthScoreData {
  score: number;
  subScores: Record<string, number | null>;
}

const TABS: Segment<TabId>[] = [
  { id: "forecast", label: "Forecast" },
  { id: "flow", label: "Flow" },
];

/**
 * Analytics, re-cut for one column.
 *
 * The desktop page puts a Monte Carlo fan, a donut, a Sankey and a conversion
 * matrix side by side. None of those survive being shrunk to 358px, so each
 * becomes the reading it was there to support: the forecast is three
 * percentile figures, win/loss is a rate plus its bands, the funnel is a set
 * of proportional bars. The Sankey and the matrix are not ported — a
 * two-dimensional flow diagram at thumb scale is decoration, and the funnel
 * carries the same story.
 */
export function AnalyticsScreen() {
  const [tab, setTab] = useState<TabId>("forecast");

  const simQuery = useGetPipelineSimulation();
  const winLossQuery = useGetWinLossAnalytics();
  const velocityQuery = useGetVelocityAnalytics();
  const funnelQuery = useFlowFunnel();
  const healthQuery = useFlowHealthScore();

  const refresh = () =>
    Promise.all([
      simQuery.refetch(),
      winLossQuery.refetch(),
      velocityQuery.refetch(),
      funnelQuery.refetch(),
      healthQuery.refetch(),
    ]);

  return (
    <>
      <MobileHeader title="Analytics">
        <SegmentChips segments={TABS} value={tab} onChange={(id) => setTab(id)} label="Analytics view" />
      </MobileHeader>

      <PullToRefresh onRefresh={refresh}>
        <div className="space-y-3 p-4">
          {tab === "forecast" ? (
            <>
              <ForecastCard data={simQuery.data?.data as SimulationData | undefined} />
              <WinLossCard data={winLossQuery.data?.data as WinLossData | undefined} />
              <VelocityCard
                deals={
                  (velocityQuery.data?.data as { deals?: VelocityDeal[] } | undefined)?.deals ?? []
                }
                loading={velocityQuery.isLoading}
              />
            </>
          ) : (
            <>
              <PipelineHealthCard data={healthQuery.data?.data as HealthScoreData | undefined} />
              <FunnelCard rows={(funnelQuery.data?.data as FunnelRow[] | undefined) ?? []} loading={funnelQuery.isLoading} />
            </>
          )}
        </div>
      </PullToRefresh>
    </>
  );
}

/** Monte Carlo, as the three numbers anyone actually quotes. */
function ForecastCard({ data }: { data: SimulationData | undefined }) {
  return (
    <MobileCard>
      <CardHeader label="Probabilistic forecast" />
      {!data ? (
        <Shimmer className="h-20" />
      ) : (
        <>
          <div className="grid grid-cols-3 gap-2">
            <Percentile label="Bear" sub="P10" value={data.percentiles.p10} />
            <Percentile label="Median" sub="P50" value={data.percentiles.p50} emphasis />
            <Percentile label="Bull" sub="P90" value={data.percentiles.p90} />
          </div>
          <p className="m-data m-muted mt-3">
            Traditional weighted: {compactCurrency(data.traditionalWeightedPipeline)}
          </p>
        </>
      )}
    </MobileCard>
  );
}

function Percentile({
  label,
  sub,
  value,
  emphasis = false,
}: {
  label: string;
  sub: string;
  value: number | undefined;
  emphasis?: boolean;
}) {
  return (
    <div>
      <p className="m-eyebrow">{label}</p>
      <p
        className={cn(
          "mt-1 font-mono tracking-[-0.03em]",
          emphasis ? "text-xl font-semibold" : "text-base font-medium",
        )}
      >
        {value != null ? compactCurrency(value) : "—"}
      </p>
      <p className="m-data m-muted">{sub}</p>
    </div>
  );
}

function WinLossCard({ data }: { data: WinLossData | undefined }) {
  if (!data) {
    return (
      <MobileCard>
        <CardHeader label="Win / loss" />
        <Shimmer className="h-20" />
      </MobileCard>
    );
  }

  const decided = data.won + data.lost;
  const wonPct = decided > 0 ? (data.won / decided) * 100 : 0;

  return (
    <MobileCard>
      <CardHeader label="Win / loss" />
      <p className="m-h2">
        {data.winRatePct != null ? `${Math.round(data.winRatePct)}%` : "—"}
        <span className="m-muted ml-2 text-base font-medium">win rate</span>
      </p>
      <p className="m-data m-muted mt-1">
        {data.won} won · {data.lost} lost
      </p>
      {decided > 0 ? (
        <div className="mt-3 flex h-1.5 overflow-hidden rounded-full">
          <div className={OUTCOME_CLASS.won.fill} style={{ width: `${wonPct}%` }} />
          <div className={OUTCOME_CLASS.lost.fill} style={{ width: `${100 - wonPct}%` }} />
        </div>
      ) : null}

      {data.byTcvRange.length > 0 ? (
        <ul className="mt-4 space-y-2">
          {data.byTcvRange.map((band) => (
            <li key={band.range} className="m-data flex items-baseline justify-between gap-3">
              <span className="min-w-0 flex-1 truncate">{band.range}</span>
              <span className="m-muted shrink-0">
                {band.winRatePct != null ? `${Math.round(band.winRatePct)}%` : "—"} of {band.total}
              </span>
            </li>
          ))}
        </ul>
      ) : null}
    </MobileCard>
  );
}

/** Most overdue first — the list is the triage. */
function VelocityCard({ deals, loading }: { deals: VelocityDeal[]; loading: boolean }) {
  const overdue = [...deals]
    .filter((d) => d.deltaDays != null && d.deltaDays > 0)
    .sort((a, b) => (b.deltaDays ?? 0) - (a.deltaDays ?? 0))
    .slice(0, 5);

  return (
    <MobileCard>
      <CardHeader label="Slowest against benchmark" />
      {loading ? (
        <Shimmer className="h-20" />
      ) : overdue.length === 0 ? (
        <p className="m-body m-muted text-sm">Every deal is at or ahead of its stage benchmark.</p>
      ) : (
        <ul className="space-y-2">
          {overdue.map((deal) => (
            <li key={deal.id}>
              <Link
                href={`/deals/${deal.id}`}
                className="m-press flex items-baseline justify-between gap-3 py-1"
              >
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm">{deal.dealName}</span>
                  <span className="m-data m-muted">{deal.stage}</span>
                </span>
                <span className="m-data shrink-0 text-orange-600 dark:text-orange-400">
                  +{deal.deltaDays}d
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </MobileCard>
  );
}

function PipelineHealthCard({ data }: { data: HealthScoreData | undefined }) {
  return (
    <MobileCard>
      <CardHeader label="Pipeline pulse" />
      {!data ? (
        <Shimmer className="h-24" />
      ) : (
        <>
          <p className="m-h2">
            <span className="font-mono">{Math.round(data.score)}</span>
            <span className="m-muted ml-2 text-base font-medium">/ 100</span>
          </p>
          <ul className="mt-3 space-y-2">
            {Object.entries(data.subScores).map(([key, value]) => (
              <li key={key}>
                <div className="m-data flex items-baseline justify-between gap-3">
                  <span>{humanizeCode(key)}</span>
                  <span className="m-muted">{value != null ? Math.round(value) : "—"}</span>
                </div>
                <div className="mt-1 h-1 overflow-hidden rounded-full bg-[var(--m-skeleton)]">
                  <div
                    className="h-full rounded-full bg-[var(--m-primary)]"
                    style={{ width: `${value ?? 0}%` }}
                  />
                </div>
              </li>
            ))}
          </ul>
        </>
      )}
    </MobileCard>
  );
}

/** The funnel as proportional bars — the shape reads at a glance. */
function FunnelCard({ rows, loading }: { rows: FunnelRow[]; loading: boolean }) {
  const peak = Math.max(...rows.map((r) => r.totalValue), 1);

  return (
    <MobileCard>
      <CardHeader label="Pipeline by stage" />
      {loading ? (
        <Shimmer className="h-32" />
      ) : rows.length === 0 ? (
        <p className="m-body m-muted text-sm">No stage movement recorded yet.</p>
      ) : (
        <ul className="space-y-3">
          {rows.map((row) => (
            <li key={row.stageId}>
              <div className="m-data flex items-baseline justify-between gap-3">
                <span className="min-w-0 flex-1 truncate">{row.stageName}</span>
                <span className="m-muted shrink-0">
                  {row.dealCount} · {compactCurrency(row.totalValue)}
                </span>
              </div>
              <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-[var(--m-skeleton)]">
                <div
                  className="h-full rounded-full bg-[var(--m-primary)]"
                  style={{ width: `${(row.totalValue / peak) * 100}%` }}
                />
              </div>
              {row.convToNextPct != null ? (
                <p className="m-data m-muted mt-1">{Math.round(row.convToNextPct)}% convert onward</p>
              ) : null}
            </li>
          ))}
        </ul>
      )}
    </MobileCard>
  );
}
