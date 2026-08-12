// Catalyst-backed `cachedIntel`, `computeSummary` and `computePortfolioAnalysis`
// — the whole of what the old Drizzle `../portfolio.ts` used to serve. That file
// is gone; its pure concurrency helpers moved to ../concurrency.ts and are
// re-exported here for the callers that reach for them alongside the portfolio
// loop itself.
import {
  type CatalystApp,
  createEnterpriseDealsRepo,
  createPipelineStagesRepo,
  createDealReviewMarkersRepo,
  createDealAuditLogRepo,
} from "@workspace/db/catalyst";
import { cache, CacheKeys, CacheTtl } from "../cache";
import { assembleDealIntelligence, getThresholds, getPortfolioConfig } from "./intelligence";
import { buildPortfolioAnalysis, toPortfolioRecords } from "../portfolio-analysis";
import { CLOSED_STAGES } from "../deal-filters";
import { mapWithConcurrency, INTEL_CONCURRENCY } from "../concurrency";

export { mapWithConcurrency, INTEL_CONCURRENCY };

export type Intel = NonNullable<Awaited<ReturnType<typeof assembleDealIntelligence>>>;

/**
 * Cached read of assembled intelligence. Reads are served from the in-process
 * cache (TTL) and dropped immediately by the event bus on any deal mutation,
 * so stale data never outlives a write. Write paths call the uncached
 * assembler directly, so Phase 1 mutation responses are always fresh.
 */
export function cachedIntel(catalystApp: CatalystApp, dealId: string) {
  return cache.wrap(CacheKeys.intelligence(dealId), CacheTtl.intelligence, () =>
    assembleDealIntelligence(catalystApp, dealId),
  );
}

/** Open (non-deleted, non-archived, non-closed) deal ids — also the periodic snapshot job's work list. */
export async function activeDealIds(catalystApp: CatalystApp): Promise<string[]> {
  const [deals, stages] = await Promise.all([
    createEnterpriseDealsRepo(catalystApp).list(),
    createPipelineStagesRepo(catalystApp).listAll(),
  ]);
  const stageNameById = new Map(stages.map((s) => [s.id, s.stageName]));
  return deals
    .filter((d) => d.deletedAt == null && d.archivedAt == null)
    .filter((d) => !CLOSED_STAGES.includes(stageNameById.get(d.salesStageId) ?? ""))
    .map((d) => d.id);
}

async function loadActiveIntel(catalystApp: CatalystApp): Promise<Intel[]> {
  const ids = await activeDealIds(catalystApp);
  // Index-keyed writes keep input order, which `computeSummary`'s stable
  // topMovers sort and criticalAlerts/staleDeals slicing rely on for
  // deterministic tie-breaks.
  const results = await mapWithConcurrency(ids, INTEL_CONCURRENCY, (id) => cachedIntel(catalystApp, id));
  return results.filter((r): r is Intel => r !== null);
}

/**
 * Audit-log change counts per deal since that deal's review marker, in ONE
 * pass over both tables instead of one lookup per deal.
 *
 * Semantics preserved exactly: a deal with no review marker is absent from
 * the returned map (matching the original INNER JOIN's drop), and a deal
 * with a marker but no newer audit rows is likewise absent (count 0),
 * matching the old `if (changes.length > 0)` gate.
 */
async function changeCountsSinceReview(
  catalystApp: CatalystApp,
  dealIds: string[],
): Promise<Map<string, number>> {
  if (dealIds.length === 0) return new Map();
  const wanted = new Set(dealIds);
  const [markerByDeal, auditRows] = await Promise.all([
    createDealReviewMarkersRepo(catalystApp).mapByDeal(),
    createDealAuditLogRepo(catalystApp).listAll(),
  ]);
  const counts = new Map<string, number>();
  for (const row of auditRows) {
    if (!wanted.has(row.dealId)) continue;
    const lastReviewedAt = markerByDeal.get(row.dealId);
    if (!lastReviewedAt) continue;
    if (row.changedAt.getTime() <= lastReviewedAt.getTime()) continue;
    counts.set(row.dealId, (counts.get(row.dealId) ?? 0) + 1);
  }
  return counts;
}

/**
 * How many rows the summary's `criticalAlerts` / `staleDeals` detail lists
 * carry. The accompanying `*Total` counts stay exact regardless of this cap.
 */
const DETAIL_LIST_LIMIT = 50;

/**
 * Team x Product correlation/heatmap analysis. The arithmetic is shared with
 * the Drizzle path via `../portfolio-analysis`, so only the loading differs.
 */
export async function computePortfolioAnalysis(catalystApp: CatalystApp) {
  const { thresholds } = await getThresholds(catalystApp);
  const portfolioConfig = await getPortfolioConfig(catalystApp);
  const reportingCurrency = String(thresholds.reporting_currency || "USD");
  const deals = await loadActiveIntel(catalystApp);
  return buildPortfolioAnalysis(
    toPortfolioRecords(deals),
    portfolioConfig,
    reportingCurrency,
  );
}

export async function computeSummary(catalystApp: CatalystApp) {
  const { thresholds } = await getThresholds(catalystApp);
  const reportingCurrency = String(thresholds.reporting_currency || "USD");
  const staleStageDays = Number(thresholds.stale_stage_days) || 21;
  const deals = await loadActiveIntel(catalystApp);

  const dealsByHealth = { GREEN: 0, YELLOW: 0, RED: 0 };
  const dealsByStage: Record<string, number> = {};
  let totalTCV = 0;
  let tcvAtRiskRed = 0;
  const criticalAlerts: {
    dealId: string;
    dealName: string;
    accountName: string;
    tcv: number;
    alert: Intel["governance"]["alerts"][number];
  }[] = [];
  const staleDeals: { dealId: string; dealName: string; daysInStage: number }[] = [];

  for (const d of deals) {
    dealsByHealth[d.governance.healthStatus] += 1;
    dealsByStage[d.salesStage] = (dealsByStage[d.salesStage] ?? 0) + 1;
    totalTCV += d.financials.normalizedTCV;
    if (d.governance.healthStatus === "RED") {
      tcvAtRiskRed += d.financials.normalizedTCV;
    }
    for (const alert of d.governance.alerts) {
      if (alert.severity === "RED") {
        criticalAlerts.push({
          dealId: d.id,
          dealName: d.dealName,
          accountName: d.accountName,
          tcv: d.financials.normalizedTCV,
          alert,
        });
      }
    }
    if (d.daysInStage > staleStageDays) {
      staleDeals.push({ dealId: d.id, dealName: d.dealName, daysInStage: d.daysInStage });
    }
  }

  criticalAlerts.sort((a, b) => (b.alert.weight ?? 0) - (a.alert.weight ?? 0));
  staleDeals.sort((a, b) => b.daysInStage - a.daysInStage);

  const changeCounts = await changeCountsSinceReview(catalystApp, deals.map((d) => d.id));
  let dealsWithChanges = 0;
  const movers: { dealId: string; dealName: string; changeCount: number }[] = [];
  for (const d of deals) {
    const changeCount = changeCounts.get(d.id) ?? 0;
    if (changeCount === 0) continue;
    dealsWithChanges += 1;
    movers.push({ dealId: d.id, dealName: d.dealName, changeCount });
  }
  movers.sort((a, b) => b.changeCount - a.changeCount);

  return {
    totalDealsMonitored: deals.length,
    totalTCV,
    tcvAtRiskRed,
    reportingCurrency,
    dealsByHealth,
    dealsByStage,
    criticalAlerts: criticalAlerts.slice(0, DETAIL_LIST_LIMIT),
    criticalAlertsTotal: criticalAlerts.length,
    staleDeals: staleDeals.slice(0, DETAIL_LIST_LIMIT),
    staleDealsTotal: staleDeals.length,
    // Shipped alongside the count so a drill-down can filter on the very
    // threshold the count used, rather than approximating it.
    staleStageDays,
    changesSinceLastReview: {
      dealsWithChanges,
      topMovers: movers.slice(0, 5),
    },
  };
}
