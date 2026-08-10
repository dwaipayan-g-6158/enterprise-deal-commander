import { useMemo } from "react";
import { Link } from "wouter";
import { ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";
import { compactCurrency, humanizeCode } from "@/lib/format";
import {
  useGetPortfolioAnalysis,
  useGetProductMix,
  type RiskCell,
} from "@workspace/api-client-react";
import { riskBand } from "@/components/cockpit/portfolio-presentation";
import { MobileCard, CardHeader } from "@/mobile/components/mobile-card";
import { Shimmer } from "@/mobile/components/shimmer";
import { EmptyState } from "@/mobile/components/states";
import { LensScreen } from "@/mobile/screens/intelligence/lens-screen";

/** People shown per rail before it stops being a shortlist. */
const RAIL_SHOWN = 6;

/**
 * The Portfolio lens: concentration, and who is carrying the risk.
 *
 * ## The heatmap became two ranked lists, and that is the answer to "needs desktop"
 *
 * Desktop draws risk as a person × product grid. A grid needs width to compare
 * across, which is exactly why this area was a "needs desktop" stub for four
 * phases. But a heatmap is read by finding the hottest cells, and a list sorted
 * by the thing the heatmap encodes puts those at the top with room to name them
 * — no scrolling in two axes, no four-pixel cells, and the alert codes behind
 * each one spelled out rather than hidden in a tooltip.
 *
 * The full person × product cross-section is one push away, for the times the
 * ranking is not enough.
 */
export function PortfolioScreen() {
  const analysisQuery = useGetPortfolioAnalysis();
  const mixQuery = useGetProductMix();

  const analysis = analysisQuery.data?.data;
  const summary = analysis?.summary;
  const matrix = analysis?.riskMatrix;
  const mix = mixQuery.data?.data;

  const byManager = useMemo(() => rankCells(matrix?.byAccountManager ?? []), [matrix]);
  const byLead = useMemo(() => rankCells(matrix?.byTechnicalLead ?? []), [matrix]);

  const refresh = () => Promise.all([analysisQuery.refetch(), mixQuery.refetch()]);
  const currency = summary?.reportingCurrency ?? "USD";

  return (
    <LensScreen
      subtitle={
        summary ? `${summary.redDealCount} of ${summary.totalDealCount} deals red` : undefined
      }
      onRefresh={refresh}
    >
      {analysisQuery.isLoading ? (
        <Shimmer className="h-40 rounded-xl" />
      ) : !analysis ? (
        <EmptyState
          title="No portfolio analysis yet"
          body="Concentration needs a few deals across a few owners before it means anything."
        />
      ) : (
        <>
          {summary ? (
            <MobileCard>
              <CardHeader label="Concentration" />
              <dl className="grid grid-cols-2 gap-x-3 gap-y-3">
                <Figure
                  label="Diversification"
                  value={summary.diversificationIndex.toFixed(2)}
                  detail="1.00 is perfectly spread"
                />
                <Figure
                  label="Correlated exposure"
                  value={compactCurrency(summary.correlatedExposureTcv, currency)}
                  detail="value behind one shared pattern"
                />
              </dl>
              {summary.highestCorrelationCluster ? (
                <p className="m-body mt-3 text-pretty">
                  <span className="m-muted">Tightest cluster: </span>
                  {summary.highestCorrelationCluster.name} ·{" "}
                  {humanizeCode(summary.highestCorrelationCluster.code)} —{" "}
                  {Math.round(summary.highestCorrelationCluster.share * 100)}% of their deals,{" "}
                  {summary.highestCorrelationCluster.lift.toFixed(1)}× the portfolio rate.
                </p>
              ) : null}
            </MobileCard>
          ) : null}

          <RiskRail title="Risk by account manager" cells={byManager} currency={currency} />
          <RiskRail title="Risk by technical lead" cells={byLead} currency={currency} />

          {mix && mix.pipelineBySuite.length > 0 ? (
            <MobileCard>
              <CardHeader label="Pipeline by suite" />
              <ul className="space-y-2.5">
                {[...mix.pipelineBySuite]
                  .sort((a, b) => b.totalTCV - a.totalTCV)
                  .map((suite) => (
                    <li key={suite.suite}>
                      <div className="m-caption flex items-baseline justify-between gap-3">
                        <span className="min-w-0 flex-1 truncate">{suite.suite}</span>
                        <span className="m-muted m-num shrink-0">
                          {suite.dealCount} · {compactCurrency(suite.totalTCV, currency)}
                        </span>
                      </div>
                      <div
                        className="mt-1 h-1.5 overflow-hidden rounded-full bg-muted"
                        aria-hidden="true"
                      >
                        <div
                          className="h-full rounded-full bg-primary"
                          style={{
                            width: `${shareOf(suite.totalTCV, mix.pipelineBySuite.map((s) => s.totalTCV))}%`,
                          }}
                        />
                      </div>
                    </li>
                  ))}
              </ul>
            </MobileCard>
          ) : null}

          <Link href="/portfolio/alerts" className="m-card m-press m-reveal block p-4">
            <div className="flex items-center gap-3">
              <div className="min-w-0 flex-1">
                <p className="m-headline">Alert correlations</p>
                <p className="m-caption m-muted mt-0.5 text-pretty">
                  Which patterns cluster around which owners and products, and by how much.
                </p>
              </div>
              <ChevronRight className="m-muted h-4 w-4 shrink-0" aria-hidden="true" />
            </div>
          </Link>
        </>
      )}
    </LensScreen>
  );
}

/**
 * One person, one bar, and the alert codes behind it.
 *
 * The bar is share of the WORST cell rather than of 100: a portfolio where the
 * top score is 42 would otherwise render as six barely-visible stubs, and the
 * question this list answers is comparative — who is carrying the most — not
 * absolute.
 */
function RiskRail({
  title,
  cells,
  currency,
}: {
  title: string;
  cells: RiskCell[];
  currency: string;
}) {
  if (cells.length === 0) return null;
  const peak = Math.max(...cells.map((c) => c.riskScore), 1);

  return (
    <MobileCard>
      <CardHeader label={title} />
      <ul className="space-y-3">
        {cells.map((cell) => {
          const band = riskBand(cell.riskScore);
          return (
            <li key={`${cell.person}-${cell.product}`}>
              <div className="flex items-baseline justify-between gap-3">
                <span className="m-headline min-w-0 flex-1 truncate">{cell.person}</span>
                <span className="m-caption m-muted m-num shrink-0">
                  {cell.dealCount} · {compactCurrency(cell.tcv, currency)}
                </span>
              </div>
              <div className="mt-1.5 flex items-center gap-2">
                <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-muted" aria-hidden="true">
                  <div
                    className="h-full rounded-full bg-destructive"
                    style={{ width: `${(cell.riskScore / peak) * 100}%` }}
                  />
                </div>
                <span className="m-caption m-num shrink-0">{Math.round(cell.riskScore)}</span>
                <span className="m-caption m-muted shrink-0">{band.label}</span>
              </div>
              {cell.topAlertCodes.length > 0 ? (
                <p className="m-caption m-muted mt-1 truncate">
                  {cell.topAlertCodes.map(humanizeCode).join(" · ")}
                </p>
              ) : null}
              {cell.lowConfidence ? (
                <p className="m-caption m-muted mt-0.5">Few deals — read with caution.</p>
              ) : null}
            </li>
          );
        })}
      </ul>
    </MobileCard>
  );
}

/**
 * The hottest cells, one per person.
 *
 * The matrix is person × product, so one manager appears once per product they
 * carry. Collapsing to each person's worst cell is what turns a grid into a
 * ranking without averaging away the thing that matters — an owner with one
 * catastrophic product and four clean ones is a problem, and a mean would hide
 * it.
 */
function rankCells(cells: RiskCell[]): RiskCell[] {
  const worst = new Map<string, RiskCell>();
  for (const cell of cells) {
    const current = worst.get(cell.person);
    if (!current || cell.riskScore > current.riskScore) worst.set(cell.person, cell);
  }
  return [...worst.values()].sort((a, b) => b.riskScore - a.riskScore).slice(0, RAIL_SHOWN);
}

function shareOf(value: number, all: number[]): number {
  const peak = Math.max(...all, 1);
  return Math.max(0, Math.min(100, (value / peak) * 100));
}

function Figure({ label, value, detail }: { label: string; value: string; detail?: string }) {
  return (
    <div className="min-w-0">
      <dt className="m-label m-muted truncate">{label}</dt>
      <dd className={cn("m-headline m-num mt-0.5 truncate")}>{value}</dd>
      {detail ? <p className="m-caption m-muted text-pretty">{detail}</p> : null}
    </div>
  );
}
