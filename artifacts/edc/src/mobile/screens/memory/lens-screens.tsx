import { Link } from "wouter";
import { cn } from "@/lib/utils";
import { compactCurrency, formatDate, humanizeCode } from "@/lib/format";
import {
  useGetCompetitorIntel,
  useGetMemoryHealth,
  useGetPlaybookEffectiveness,
  useGetPricingBenchmarks,
  useListRevivalCandidates,
} from "@workspace/api-client-react";
import { HEALTH_CLASS, OUTCOME_CLASS } from "@/lib/semantic-colors";
import { MNavBar } from "@/mobile/shell/m-nav-bar";
import { MobileCard, CardHeader } from "@/mobile/components/mobile-card";
import { MetaChip } from "@/mobile/components/badges";
import { Shimmer } from "@/mobile/components/shimmer";
import { EmptyState, ErrorState } from "@/mobile/components/states";
import { PullToRefresh } from "@/mobile/components/pull-to-refresh";
import { MRing } from "@/mobile/charts/m-ring";
import { OUTCOME_PAINT } from "@/mobile/charts/chart-colors";

/** Shared chrome: a pushed screen under Memory with a back chevron and nothing else. */
function LensFrame({
  title,
  onRefresh,
  children,
}: {
  title: string;
  onRefresh: () => Promise<unknown> | unknown;
  children: React.ReactNode;
}) {
  return (
    <>
      <MNavBar title={title} backHref="/memory" backLabel="Back to memory" />
      <PullToRefresh onRefresh={onRefresh}>
        <div className="space-y-3 p-4">{children}</div>
      </PullToRefresh>
    </>
  );
}

interface MemoryHealthData {
  totalArchived: number;
  archiveCompletenessPct: number;
  knowledgeDensity: number;
  freshnessPct: number;
  coverage: { dimension: string; value: string; count: number }[];
  decayCount: number;
}

/**
 * How much the archive actually knows.
 *
 * A memory tab is only worth trusting to the extent it is complete, and this is
 * the screen that says so out loud — including the decay count, which is the
 * number nobody wants to look at and the reason the rest of the figures drift.
 */
export function MemoryHealthScreen() {
  const query = useGetMemoryHealth();
  const health = query.data?.data as MemoryHealthData | undefined;

  return (
    <LensFrame title="Archive health" onRefresh={query.refetch}>
      {query.isError ? (
        <ErrorState
          title="Couldn't load archive health"
          body="Pull down to try again, or check your connection."
        />
      ) : !health ? (
        <Shimmer className="h-40 rounded-xl" />
      ) : (
        <>
          <MobileCard>
            <CardHeader label="Archived" />
            <p className="m-hero m-num">{health.totalArchived}</p>
            <p className="m-caption m-muted mt-1">
              {Math.round(health.archiveCompletenessPct)}% carry a full autopsy
            </p>
          </MobileCard>

          <MobileCard>
            <CardHeader label="Quality" />
            <dl className="grid grid-cols-2 gap-x-3 gap-y-3">
              <Stat
                label="Knowledge density"
                value={health.knowledgeDensity.toFixed(1)}
                detail="lessons per record"
              />
              <Stat
                label="Freshness"
                value={`${Math.round(health.freshnessPct)}%`}
                detail="archived in the last year"
              />
            </dl>
            {health.decayCount > 0 ? (
              <p className={cn("m-caption mt-3 text-pretty", HEALTH_CLASS.YELLOW.text)}>
                {health.decayCount} {health.decayCount === 1 ? "record is" : "records are"} old
                enough that their lessons may no longer hold.
              </p>
            ) : null}
          </MobileCard>

          {health.coverage.length > 0 ? (
            <MobileCard>
              <CardHeader label="Coverage" />
              <ul className="space-y-2.5">
                {health.coverage.map((row) => (
                  <li
                    key={`${row.dimension}-${row.value}`}
                    className="flex items-baseline justify-between gap-3"
                  >
                    <span className="m-body min-w-0 flex-1 truncate">
                      {row.value}
                      <span className="m-muted"> · {humanizeCode(row.dimension)}</span>
                    </span>
                    <span className="m-caption m-muted m-num shrink-0">{row.count}</span>
                  </li>
                ))}
              </ul>
            </MobileCard>
          ) : null}
        </>
      )}
    </LensFrame>
  );
}

/**
 * Lost deals worth another approach.
 *
 * Ranked by win-back potential rather than by value: a large deal lost on price
 * to an incumbent on a five-year contract is not a revival candidate, and a
 * modest one lost on a capability that has since shipped is. The reasons are
 * listed because a revival list without them is a list of deals somebody already
 * knows they lost.
 */
export function RevivalScreen() {
  const query = useListRevivalCandidates();
  const candidates = [...(query.data?.data ?? [])].sort(
    (a, b) => (b.winBackPotential ?? 0) - (a.winBackPotential ?? 0),
  );

  return (
    <LensFrame title="Revival candidates" onRefresh={query.refetch}>
      {query.isError ? (
        <ErrorState
          title="Couldn't load revival candidates"
          body="Pull down to try again, or check your connection."
        />
      ) : query.isLoading ? (
        <Shimmer className="h-40 rounded-xl" />
      ) : candidates.length === 0 ? (
        <EmptyState
          title="Nothing to revive"
          body="No archived loss currently meets the bar for another approach."
        />
      ) : (
        candidates.map((candidate) => (
          <MobileCard key={candidate.memoryId}>
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0 flex-1">
                <p className="m-label m-muted truncate">{candidate.accountName}</p>
                <Link
                  href={`/memory/${candidate.memoryId}`}
                  className="m-title m-press mt-0.5 block truncate"
                >
                  {candidate.dealName}
                </Link>
              </div>
              {candidate.winBackPotential != null ? (
                <span className="m-headline m-num shrink-0">
                  {Math.round(candidate.winBackPotential)}
                </span>
              ) : null}
            </div>

            <div className="m-caption m-muted mt-2 flex flex-wrap items-center gap-x-3 gap-y-1">
              {candidate.finalTcv != null ? (
                <span className="m-num text-foreground">
                  {compactCurrency(Number(candidate.finalTcv))}
                </span>
              ) : null}
              <span>{candidate.ageDays}d ago</span>
              {candidate.winBackTimeline ? <span>{candidate.winBackTimeline}</span> : null}
              {candidate.primaryLossCategory ? (
                <MetaChip>{humanizeCode(candidate.primaryLossCategory)}</MetaChip>
              ) : null}
            </div>

            {candidate.reasons.length > 0 ? (
              <ul className="mt-2.5 space-y-1">
                {candidate.reasons.map((reason, i) => (
                  <li key={i} className="m-body flex gap-2 text-pretty">
                    <span aria-hidden="true" className="m-muted">
                      ·
                    </span>
                    {reason}
                  </li>
                ))}
              </ul>
            ) : null}
          </MobileCard>
        ))
      )}
    </LensFrame>
  );
}

interface CompetitorIntel {
  name: string;
  encounterCount: number;
  winRatePct: number;
  topLossCategory: string | null;
  avgTcv: number;
  lowConfidence: boolean;
}

/**
 * Who we meet and how we do against them.
 *
 * Sorted by how often we meet them, not by win rate: a 0% record against
 * somebody encountered once is noise, and putting it at the top would make the
 * screen open on its least reliable row. `lowConfidence` is surfaced for the
 * same reason rather than being filtered away — the reader should be able to see
 * a thin sample and decide.
 */
export function CompetitorIntelScreen() {
  const query = useGetCompetitorIntel();
  const competitors = [...((query.data?.data as CompetitorIntel[] | undefined) ?? [])].sort(
    (a, b) => b.encounterCount - a.encounterCount,
  );

  return (
    <LensFrame title="Competitor intel" onRefresh={query.refetch}>
      {query.isError ? (
        <ErrorState
          title="Couldn't load competitor intel"
          body="Pull down to try again, or check your connection."
        />
      ) : query.isLoading ? (
        <Shimmer className="h-40 rounded-xl" />
      ) : competitors.length === 0 ? (
        <EmptyState
          title="No competitors recorded"
          body="Competitors are named on the deal and carried into the archive when it closes."
        />
      ) : (
        competitors.map((competitor) => (
          <MobileCard key={competitor.name}>
            <CardHeader
              label={competitor.name}
              action={
                <span className="m-caption m-muted m-num">
                  {competitor.encounterCount}{" "}
                  {competitor.encounterCount === 1 ? "deal" : "deals"}
                </span>
              }
            />
            <MRing
              data={[
                {
                  label: "Won",
                  value: Math.round((competitor.winRatePct / 100) * competitor.encounterCount),
                  paint: OUTCOME_PAINT.won,
                },
                {
                  label: "Lost",
                  value:
                    competitor.encounterCount -
                    Math.round((competitor.winRatePct / 100) * competitor.encounterCount),
                  paint: OUTCOME_PAINT.lost,
                },
              ]}
              centreValue={`${Math.round(competitor.winRatePct)}%`}
              centreLabel="we win"
              size={104}
              thickness={12}
            />
            <p className="m-caption m-muted mt-3">
              Average deal {compactCurrency(competitor.avgTcv)}
              {competitor.topLossCategory
                ? ` · usually beats us on ${humanizeCode(competitor.topLossCategory).toLowerCase()}`
                : ""}
            </p>
            {competitor.lowConfidence ? (
              <p className="m-caption m-muted mt-1">Thin sample — read with caution.</p>
            ) : null}
          </MobileCard>
        ))
      )}
    </LensFrame>
  );
}

interface Percentiles {
  p25: number;
  median: number;
  p75: number;
  p90: number;
}

interface PricingBenchmarks {
  sampleSize: number;
  tcvSampleSize: number;
  cycleSampleSize: number;
  tcv: Percentiles;
  cycleDays: Percentiles;
}

interface PlaybookEffectiveness {
  withPlaybookCount: number;
  withoutPlaybookCount: number;
  withPlaybookWinRatePct: number | null;
  withoutPlaybookWinRatePct: number | null;
}

/**
 * What deals like this one actually closed at, and how long they took.
 *
 * Percentiles rather than an average, because closed value is a long-tailed
 * distribution and one enormous deal moves a mean far enough to make it useless
 * as a benchmark. The sample size sits beside each set: a median off four deals
 * is a number, not a benchmark, and the reader deserves to know which they have.
 */
export function PricingBenchmarksScreen() {
  const benchmarksQuery = useGetPricingBenchmarks();
  const playbookQuery = useGetPlaybookEffectiveness();

  const benchmarks = benchmarksQuery.data?.data as PricingBenchmarks | undefined;
  const playbook = playbookQuery.data?.data as PlaybookEffectiveness | undefined;

  const refresh = () => Promise.all([benchmarksQuery.refetch(), playbookQuery.refetch()]);

  return (
    <LensFrame title="Pricing benchmarks" onRefresh={refresh}>
      {benchmarksQuery.isError ? (
        <ErrorState
          title="Couldn't load benchmarks"
          body="Pull down to try again, or check your connection."
        />
      ) : !benchmarks ? (
        <Shimmer className="h-40 rounded-xl" />
      ) : benchmarks.sampleSize === 0 ? (
        <EmptyState
          title="Not enough closed deals"
          body="Benchmarks need a handful of archived deals before they say anything."
        />
      ) : (
        <>
          <PercentileCard
            label="Closed value"
            percentiles={benchmarks.tcv}
            sampleSize={benchmarks.tcvSampleSize}
            totalSampleSize={benchmarks.sampleSize}
            format={(n) => compactCurrency(n)}
          />
          <PercentileCard
            label="Cycle length"
            percentiles={benchmarks.cycleDays}
            sampleSize={benchmarks.cycleSampleSize}
            totalSampleSize={benchmarks.sampleSize}
            format={(n) => `${Math.round(n)}d`}
          />

          {playbook ? (
            <MobileCard>
              <CardHeader label="Does running the play help?" />
              <ul className="space-y-2.5">
                <PlaybookRow
                  label="With a playbook"
                  count={playbook.withPlaybookCount}
                  rate={playbook.withPlaybookWinRatePct}
                />
                <PlaybookRow
                  label="Without"
                  count={playbook.withoutPlaybookCount}
                  rate={playbook.withoutPlaybookWinRatePct}
                />
              </ul>
            </MobileCard>
          ) : null}
        </>
      )}
    </LensFrame>
  );
}

function PercentileCard({
  label,
  percentiles,
  sampleSize,
  totalSampleSize,
  format,
}: {
  label: string;
  percentiles: Percentiles;
  sampleSize: number;
  totalSampleSize: number;
  format: (n: number) => string;
}) {
  return (
    <MobileCard>
      <CardHeader
        label={label}
        action={
          <span className="m-caption m-muted m-num">
            {sampleSize} of {totalSampleSize}
          </span>
        }
      />
      <dl className="grid grid-cols-4 gap-2">
        {(
          [
            ["p25", "P25"],
            ["median", "Median"],
            ["p75", "P75"],
            ["p90", "P90"],
          ] as const
        ).map(([key, caption]) => (
          <div key={key} className="min-w-0">
            <dt className="m-caption m-muted">{caption}</dt>
            <dd className={cn("m-num mt-0.5 truncate", key === "median" ? "m-headline" : "m-body")}>
              {format(percentiles[key])}
            </dd>
          </div>
        ))}
      </dl>
      {sampleSize < 5 ? (
        <p className="m-caption m-muted mt-2">
          A median off {sampleSize} {sampleSize === 1 ? "deal" : "deals"} is a number, not a
          benchmark.
        </p>
      ) : null}
    </MobileCard>
  );
}

function PlaybookRow({
  label,
  count,
  rate,
}: {
  label: string;
  count: number;
  rate: number | null;
}) {
  return (
    <li>
      <div className="flex items-baseline justify-between gap-3">
        <span className="m-body min-w-0 flex-1 truncate">{label}</span>
        <span className="m-caption m-muted m-num shrink-0">
          {rate != null ? `${Math.round(rate)}%` : "—"} of {count}
        </span>
      </div>
      <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-muted" aria-hidden="true">
        <div
          className={cn("h-full rounded-full", OUTCOME_CLASS.won.fill)}
          style={{ width: `${Math.max(0, Math.min(100, rate ?? 0))}%` }}
        />
      </div>
    </li>
  );
}

function Stat({ label, value, detail }: { label: string; value: string; detail?: string }) {
  return (
    <div className="min-w-0">
      <dt className="m-label m-muted truncate">{label}</dt>
      <dd className="m-headline m-num mt-0.5 truncate">{value}</dd>
      {detail ? <p className="m-caption m-muted text-pretty">{detail}</p> : null}
    </div>
  );
}
