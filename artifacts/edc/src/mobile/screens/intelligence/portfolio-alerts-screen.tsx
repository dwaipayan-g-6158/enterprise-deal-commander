import { humanizeCode } from "@/lib/format";
import type { AlertCorrelation } from "@workspace/api-client-react";
import { useGetPortfolioAnalysis } from "@workspace/api-client-react";
import { MNavBar } from "@/mobile/shell/m-nav-bar";
import { MobileCard, CardHeader } from "@/mobile/components/mobile-card";
import { Shimmer } from "@/mobile/components/shimmer";
import { EmptyState } from "@/mobile/components/states";
import { PullToRefresh } from "@/mobile/components/pull-to-refresh";
import { MSegmented } from "@/mobile/ui/m-segmented";
import { useState } from "react";

type Scope = "manager" | "lead" | "product";

/** Below this, a "correlation" is one deal and a coincidence. */
const MIN_DEALS = 2;

/**
 * Which alert patterns cluster around which owners and products.
 *
 * ## Lift is the number, and share is the sanity check
 *
 * A pattern firing on 100% of somebody's deals is alarming or meaningless
 * depending on how many deals they have, and lift — how many times the portfolio
 * rate this is — is the figure that distinguishes them. Both are shown, with the
 * deal count beside the name, because lift on a base of one is arithmetic rather
 * than evidence.
 *
 * The segmented control here filters this list in place rather than navigating,
 * which is the one thing a pushed screen's segmented control is permitted to do.
 */
export function PortfolioAlertsScreen() {
  const query = useGetPortfolioAnalysis();
  const [scope, setScope] = useState<Scope>("manager");
  const analysis = query.data?.data;

  const groups = rowsFor(analysis, scope);

  return (
    <>
      <MNavBar
        title="Alert correlations"
        backHref="/portfolio"
        backLabel="Back to Intelligence"
      />

      <div className="px-4 pt-3">
        <MSegmented
          segments={[
            { id: "manager", label: "Managers" },
            { id: "lead", label: "Leads" },
            { id: "product", label: "Products" },
          ]}
          activeId={scope}
          onSelect={(id) => setScope(id as Scope)}
          label="Correlation scope"
        />
      </div>

      <PullToRefresh onRefresh={query.refetch}>
        <div className="space-y-3 p-4">
          {query.isLoading ? (
            <Shimmer className="h-40 rounded-xl" />
          ) : groups.length === 0 ? (
            <EmptyState
              title="Nothing correlates yet"
              body={`A pattern needs to fire across at least ${MIN_DEALS} deals before it says anything about an owner.`}
            />
          ) : (
            groups.map((group) => (
              <MobileCard key={group.name}>
                <CardHeader
                  label={group.name}
                  action={
                    <span className="m-caption m-muted m-num">
                      {group.dealCount} {group.dealCount === 1 ? "deal" : "deals"}
                    </span>
                  }
                />
                {group.note ? <p className="m-caption m-muted mb-2">{group.note}</p> : null}
                <ul className="space-y-2.5">
                  {group.correlations.map((correlation) => (
                    <li key={correlation.code}>
                      <div className="m-caption flex items-baseline justify-between gap-3">
                        <span className="min-w-0 flex-1 truncate">
                          {humanizeCode(correlation.code)}
                        </span>
                        <span className="m-muted m-num shrink-0">
                          {Math.round(correlation.share * 100)}% ·{" "}
                          {correlation.lift.toFixed(1)}×
                        </span>
                      </div>
                      <div
                        className="mt-1 h-1.5 overflow-hidden rounded-full bg-muted"
                        aria-hidden="true"
                      >
                        <div
                          className="h-full rounded-full bg-destructive"
                          style={{ width: `${Math.max(0, Math.min(100, correlation.share * 100))}%` }}
                        />
                      </div>
                    </li>
                  ))}
                </ul>
              </MobileCard>
            ))
          )}
        </div>
      </PullToRefresh>
    </>
  );
}

interface CorrelationGroup {
  name: string;
  dealCount: number;
  note?: string;
  correlations: AlertCorrelation[];
}

/**
 * The three scopes, normalized to one shape.
 *
 * Each carries a different extra fact — managers and leads have an average cycle
 * time, products have a share of stalled deals — so the note line differs rather
 * than being dropped to make the shapes match.
 */
function rowsFor(
  analysis:
    | {
        byAccountManager?: { accountManager: string; dealCount: number; alertCorrelations: AlertCorrelation[]; avgCycleTimeDays: number }[];
        byTechnicalLead?: { technicalLead: string; dealCount: number; alertCorrelations: AlertCorrelation[]; avgCycleTimeDays: number }[];
        byProduct?: { productName: string; dealCount: number; alertCorrelations: AlertCorrelation[]; presentInStalledShare: number }[];
      }
    | undefined,
  scope: Scope,
): CorrelationGroup[] {
  if (!analysis) return [];

  const raw: CorrelationGroup[] =
    scope === "manager"
      ? (analysis.byAccountManager ?? []).map((m) => ({
          name: m.accountManager,
          dealCount: m.dealCount,
          note: `${Math.round(m.avgCycleTimeDays)}d average cycle`,
          correlations: m.alertCorrelations,
        }))
      : scope === "lead"
        ? (analysis.byTechnicalLead ?? []).map((l) => ({
            name: l.technicalLead,
            dealCount: l.dealCount,
            note: `${Math.round(l.avgCycleTimeDays)}d average cycle`,
            correlations: l.alertCorrelations,
          }))
        : (analysis.byProduct ?? []).map((p) => ({
            name: p.productName,
            dealCount: p.dealCount,
            note: `in ${Math.round(p.presentInStalledShare * 100)}% of stalled deals`,
            correlations: p.alertCorrelations,
          }));

  return raw
    .filter((group) => group.dealCount >= MIN_DEALS && group.correlations.length > 0)
    .map((group) => ({
      ...group,
      correlations: [...group.correlations].sort((a, b) => b.lift - a.lift),
    }))
    // Loudest cluster first, so the screen opens on the thing worth knowing.
    .sort((a, b) => (b.correlations[0]?.lift ?? 0) - (a.correlations[0]?.lift ?? 0));
}
