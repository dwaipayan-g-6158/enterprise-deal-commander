import { and, eq, isNull, gt, notInArray, inArray, sql } from "drizzle-orm";
import {
  db,
  enterpriseDeals,
  pipelineStages,
  dealReviewMarkers,
  dealAuditLog,
} from "@workspace/db";
import { assembleDealIntelligence, getThresholds, getPortfolioConfig } from "./intelligence";
import { cache, CacheKeys, CacheTtl } from "./cache";
import { buildPortfolioAnalysis, toPortfolioRecords } from "./portfolio-analysis";

/** Round to at most 2 decimal places (e.g. 23.6667 -> 23.67). */
function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

/**
 * Shared portfolio/summary compute used by both the read endpoints (live
 * fallback) and the precomputed rollup refresher. Keeping the logic here means
 * the rollup table and the live fallback can never diverge.
 */

export type Intel = NonNullable<
  Awaited<ReturnType<typeof assembleDealIntelligence>>
>;

/**
 * Cached read of assembled intelligence. Reads are served from the in-process
 * cache (TTL) and dropped immediately by the event bus on any deal mutation,
 * so stale data never outlives a write. Write paths call the uncached
 * assembler directly, so Phase 1 mutation responses are always fresh.
 */
export function cachedIntel(dealId: string) {
  return cache.wrap(CacheKeys.intelligence(dealId), CacheTtl.intelligence, () =>
    assembleDealIntelligence(dealId),
  );
}

async function activeDealIds(): Promise<string[]> {
  const rows = await db
    .select({ id: enterpriseDeals.id })
    .from(enterpriseDeals)
    .innerJoin(pipelineStages, eq(enterpriseDeals.salesStageId, pipelineStages.id))
    .where(
      and(
        isNull(enterpriseDeals.deletedAt),
        isNull(enterpriseDeals.archivedAt),
        notInArray(pipelineStages.stageName, ["Closed-Won", "Closed-Lost"]),
      ),
    );
  return rows.map((r) => r.id);
}

/**
 * Max concurrent per-deal intelligence assemblies.
 *
 * `assembleDealIntelligence` issues ~15 sequential queries per deal against a
 * pool created as `new Pool({ connectionString })` with no `max`
 * (lib/db/src/index.ts:13) — i.e. node-postgres' default of 10 connections. An
 * unbounded `Promise.all` over every active deal therefore doesn't go faster;
 * it queues on the pool and starves concurrent request handlers of connections
 * (this path runs on GET /intelligence/summary, GET
 * /intelligence/portfolio-analysis, GET /api/v2/analytics/engagement AND the
 * background rollup refresh). 8 saturates the pool while leaving headroom.
 */
export const INTEL_CONCURRENCY = 8;

/** Order-preserving bounded-concurrency map (no such helper exists in-repo). */
export async function mapWithConcurrency<T, R>(
  items: T[],
  limit: number,
  fn: (item: T) => Promise<R>,
): Promise<R[]> {
  const results = new Array<R>(items.length);
  let next = 0;
  const workers = Array.from(
    { length: Math.min(limit, items.length) },
    async () => {
      for (let i = next++; i < items.length; i = next++) {
        results[i] = await fn(items[i]);
      }
    },
  );
  await Promise.all(workers);
  return results;
}

async function loadActiveIntel(): Promise<Intel[]> {
  const ids = await activeDealIds();
  // Index-keyed writes keep input order, which `computeSummary`'s stable
  // topMovers sort and criticalAlerts/staleDeals slicing rely on for
  // deterministic tie-breaks.
  const results = await mapWithConcurrency(ids, INTEL_CONCURRENCY, cachedIntel);
  return results.filter((r): r is Intel => r !== null);
}

/**
 * Audit-log change counts per deal since that deal's review marker, in ONE
 * query instead of one SELECT per deal.
 *
 * Semantics preserved exactly: the INNER JOIN on deal_review_markers drops
 * deals with no marker, so they are absent from the map and skipped by the
 * caller — NOT reported with changeCount 0. Deals that have a marker but no
 * newer audit rows are likewise absent (count 0), matching the old
 * `if (changes.length > 0)` gate.
 */
async function changeCountsSinceReview(
  dealIds: string[],
): Promise<Map<string, number>> {
  if (dealIds.length === 0) return new Map();
  const rows = await db
    .select({
      dealId: dealAuditLog.dealId,
      changeCount: sql<number>`count(*)::int`,
    })
    .from(dealAuditLog)
    .innerJoin(
      dealReviewMarkers,
      eq(dealReviewMarkers.dealId, dealAuditLog.dealId),
    )
    .where(
      and(
        inArray(dealAuditLog.dealId, dealIds),
        gt(dealAuditLog.changedAt, dealReviewMarkers.lastReviewedAt),
      ),
    )
    .groupBy(dealAuditLog.dealId);
  return new Map(rows.map((r) => [r.dealId, Number(r.changeCount)]));
}

/**
 * How many rows the summary's `criticalAlerts` / `staleDeals` detail lists carry.
 * Was 10, which the "View all" dialogs presented as the complete set. 50 keeps
 * the response bounded while making those dialogs honest at realistic portfolio
 * size; the accompanying `*Total` counts stay exact regardless.
 */
const DETAIL_LIST_LIMIT = 50;

export async function computeSummary() {
  const { thresholds } = await getThresholds();
  const reportingCurrency = String(thresholds.reporting_currency || "USD");
  const staleStageDays = Number(thresholds.stale_stage_days) || 21;
  const deals = await loadActiveIntel();

  const dealsByHealth = { GREEN: 0, YELLOW: 0, RED: 0 };
  const dealsByStage: Record<string, number> = {};
  let totalTCV = 0;
  // Σ normalizedTCV of RED-HEALTH deals. Computed here, over the full cohort,
  // because the dashboard used to derive it client-side from a separate
  // `GET /deals?health=RED&limit=200` call — which capped at 200 deals and cost
  // an extra full-portfolio serialization per dashboard load.
  let tcvAtRiskRed = 0;
  const criticalAlerts: {
    dealId: string;
    dealName: string;
    accountName: string;
    /**
     * The alerted deal's normalizedTCV. Carried per alert because a RED-severity
     * alert can fire on a deal whose HEALTH is not RED, so the client cannot
     * recover this from a RED-health deal list (it previously tried, and those
     * alert cards silently rendered with no money on them).
     */
    tcv: number;
    alert: Intel["governance"]["alerts"][number];
  }[] = [];
  const staleDeals: {
    dealId: string;
    dealName: string;
    daysInStage: number;
  }[] = [];

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
      staleDeals.push({
        dealId: d.id,
        dealName: d.dealName,
        daysInStage: d.daysInStage,
      });
    }
  }

  criticalAlerts.sort((a, b) => (b.alert.weight ?? 0) - (a.alert.weight ?? 0));
  staleDeals.sort((a, b) => b.daysInStage - a.daysInStage);

  const changeCounts = await changeCountsSinceReview(deals.map((d) => d.id));
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
    // The `*Total` fields are the TRUE counts, before the slice. The UI renders
    // these ("Critical Alerts (N)", "N stale →"); rendering the sliced array's
    // own `.length` silently pinned both readouts at the slice size, so a
    // portfolio with 47 RED alerts reported 10 and the "View all" dialogs could
    // never reach row 11.
    criticalAlerts: criticalAlerts.slice(0, DETAIL_LIST_LIMIT),
    criticalAlertsTotal: criticalAlerts.length,
    staleDeals: staleDeals.slice(0, DETAIL_LIST_LIMIT),
    staleDealsTotal: staleDeals.length,
    changesSinceLastReview: {
      dealsWithChanges,
      topMovers: movers.slice(0, 5),
    },
  };
}

export async function computePortfolioAnalysis() {
  const { thresholds } = await getThresholds();
  const portfolioConfig = await getPortfolioConfig();
  const reportingCurrency = String(thresholds.reporting_currency || "USD");
  const deals = await loadActiveIntel();
  return buildPortfolioAnalysis(
    toPortfolioRecords(deals),
    portfolioConfig,
    reportingCurrency,
  );
}
