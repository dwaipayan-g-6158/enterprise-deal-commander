import { Link } from "wouter";
import { ChevronRight } from "lucide-react";
import { compactCurrency, humanizeCode } from "@/lib/format";
import { useGetCompetitiveLoss, useGetLossDashboard } from "@workspace/api-client-react";
import { MobileCard, CardHeader } from "@/mobile/components/mobile-card";
import { Shimmer } from "@/mobile/components/shimmer";
import { EmptyState } from "@/mobile/components/states";
import { MRing } from "@/mobile/charts/m-ring";
import { OUTCOME_PAINT, seriesPaint } from "@/mobile/charts/chart-colors";
import { LOSS_SUBS } from "@/mobile/nav/routes";
import { LensScreen } from "@/mobile/screens/intelligence/lens-screen";

const COMPETITORS_SHOWN = 5;

/**
 * The Losses lens: how much is being lost, in what shape, and to whom.
 *
 * ## Two of desktop's five tabs are folded in here
 *
 * The loss dashboard and the competitive matrix both answer "how are we losing",
 * which is the question the lens root exists to answer. Keeping them as separate
 * destinations would have made the root a menu of five things with nothing on
 * it. The three that ask genuinely different questions — which live deals are at
 * risk, how each archetype played out, which products keep appearing — each get a
 * screen.
 *
 * The competitive matrix itself (suite × competitor) becomes a ranked list of
 * competitors for the same reason the portfolio heatmap did: the cells that
 * matter are the hot ones, and a ranking puts them first with room to name them.
 */
export function LossesScreen() {
  const dashboardQuery = useGetLossDashboard();
  const competitiveQuery = useGetCompetitiveLoss();

  const dashboard = dashboardQuery.data?.data;
  const competitors = [...(competitiveQuery.data?.data?.byCompetitor ?? [])]
    .sort((a, b) => b.lossTcv - a.lossTcv)
    .slice(0, COMPETITORS_SHOWN);

  const refresh = () => Promise.all([dashboardQuery.refetch(), competitiveQuery.refetch()]);
  const lossCount = dashboard?.volume.lossCount ?? 0;

  return (
    <LensScreen
      subtitle={
        dashboard ? `${lossCount} lost · ${compactCurrency(dashboard.volume.lossValue)}` : undefined
      }
      onRefresh={refresh}
    >
      {dashboardQuery.isLoading ? (
        <Shimmer className="h-40 rounded-xl" />
      ) : !dashboard || lossCount === 0 ? (
        <EmptyState
          title="Nothing lost yet"
          body="Closed-Lost deals land here with their autopsy, and the patterns build from there."
        />
      ) : (
        <>
          <MobileCard>
            <CardHeader label="Loss pulse" />
            <p className="m-hero m-num">
              {dashboard.lossPulse != null ? Math.round(dashboard.lossPulse) : "—"}
              <span className="m-caption m-muted ml-1.5">/ 100</span>
            </p>
            <ul className="mt-3 space-y-1.5">
              <PulseRow
                label="Autopsies completed"
                value={`${Math.round(dashboard.lossPulseComponents.autopsyCompletenessPct)}%`}
              />
              <PulseRow
                label="Average quality"
                value={
                  dashboard.lossPulseComponents.avgQualityScore != null
                    ? Math.round(dashboard.lossPulseComponents.avgQualityScore).toString()
                    : "—"
                }
              />
              <PulseRow
                label="Loss rate"
                value={
                  dashboard.lossPulseComponents.lossRatePct != null
                    ? `${Math.round(dashboard.lossPulseComponents.lossRatePct)}%`
                    : "—"
                }
              />
            </ul>
          </MobileCard>

          {dashboard.compositionByCategory.length > 0 ? (
            <MobileCard>
              <CardHeader label="Why we lost" />
              <MRing
                data={dashboard.compositionByCategory.map((row, i) => ({
                  label: row.category,
                  value: row.value,
                  paint: seriesPaint(i),
                }))}
                centreValue={compactCurrency(dashboard.volume.lossValue)}
                centreLabel="lost"
                size={116}
                thickness={13}
              />
            </MobileCard>
          ) : null}

          {dashboard.topPatterns.length > 0 ? (
            <MobileCard>
              <CardHeader label="Patterns that fired" />
              <ul className="space-y-2.5">
                {dashboard.topPatterns.map((pattern) => (
                  <li key={pattern.code}>
                    <div className="m-caption flex items-baseline justify-between gap-3">
                      <span className="min-w-0 flex-1 truncate">{humanizeCode(pattern.code)}</span>
                      <span className="m-muted m-num shrink-0">
                        {Math.round(pattern.share * 100)}%
                      </span>
                    </div>
                    <div
                      className="mt-1 h-1.5 overflow-hidden rounded-full bg-muted"
                      aria-hidden="true"
                    >
                      <div
                        className="h-full rounded-full"
                        style={{
                          width: `${Math.max(0, Math.min(100, pattern.share * 100))}%`,
                          backgroundColor: OUTCOME_PAINT.lost.stroke,
                        }}
                      />
                    </div>
                  </li>
                ))}
              </ul>
            </MobileCard>
          ) : null}

          {competitors.length > 0 ? (
            <MobileCard>
              <CardHeader label="Lost to" />
              <ul className="space-y-3">
                {competitors.map((competitor) => (
                  <li key={competitor.competitorId}>
                    <div className="flex items-baseline justify-between gap-3">
                      <span className="m-headline min-w-0 flex-1 truncate">{competitor.name}</span>
                      <span className="m-caption m-muted m-num shrink-0">
                        {competitor.lossCount} · {compactCurrency(competitor.lossTcv)}
                      </span>
                    </div>
                    {competitor.topArchetype ? (
                      <p className="m-caption m-muted mt-0.5 truncate">
                        Usually {competitor.topArchetype.toLowerCase()}
                      </p>
                    ) : null}
                  </li>
                ))}
              </ul>
            </MobileCard>
          ) : null}
        </>
      )}

      <nav aria-label="Loss analysis">
        <ul className="m-card overflow-hidden">
          {LOSS_SUBS.map((sub, i) => (
            <li key={sub.id} className={i > 0 ? "border-t border-border" : undefined}>
              <Link
                href={`/autopsy/${sub.id}`}
                className="m-tap m-press flex items-center gap-3 px-4 py-3.5"
              >
                <span className="min-w-0 flex-1">
                  <span className="m-headline block truncate">{sub.title}</span>
                  <span className="m-caption m-muted block text-pretty">{sub.blurb}</span>
                </span>
                <ChevronRight className="m-muted h-4 w-4 shrink-0" aria-hidden="true" />
              </Link>
            </li>
          ))}
        </ul>
      </nav>
    </LensScreen>
  );
}

function PulseRow({ label, value }: { label: string; value: string }) {
  return (
    <li className="m-caption flex items-baseline justify-between gap-3">
      <span className="min-w-0 flex-1 truncate">{label}</span>
      <span className="m-muted m-num shrink-0">{value}</span>
    </li>
  );
}
