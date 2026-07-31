import { and, eq, isNull, gt, notInArray } from "drizzle-orm";
import {
  db,
  enterpriseDeals,
  pipelineStages,
  dealReviewMarkers,
  dealAuditLog,
} from "@workspace/db";
import { assembleDealIntelligence, getThresholds, getPortfolioConfig } from "./intelligence";
import { cache, CacheKeys, CacheTtl } from "./cache";
import {
  buildRiskCells,
  correlatedExposureTcv,
  diversificationIndex,
  pickHighestCorrelationCluster,
  recurringActiveCodes,
  normalizePerson,
  UNASSIGNED,
  type GroupCorrelation,
  type MetricsRecord,
} from "./portfolio-metrics";

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

async function loadActiveIntel(): Promise<Intel[]> {
  const ids = await activeDealIds();
  const results = await Promise.all(ids.map((id) => cachedIntel(id)));
  return results.filter((r): r is Intel => r !== null);
}

export async function computeSummary() {
  const { thresholds } = await getThresholds();
  const reportingCurrency = String(thresholds.reporting_currency || "USD");
  const staleStageDays = Number(thresholds.stale_stage_days) || 21;
  const deals = await loadActiveIntel();

  const dealsByHealth = { GREEN: 0, YELLOW: 0, RED: 0 };
  const dealsByStage: Record<string, number> = {};
  let totalTCV = 0;
  const criticalAlerts: {
    dealId: string;
    dealName: string;
    accountName: string;
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
    for (const alert of d.governance.alerts) {
      if (alert.severity === "RED") {
        criticalAlerts.push({
          dealId: d.id,
          dealName: d.dealName,
          accountName: d.accountName,
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

  const markers = await db.select().from(dealReviewMarkers);
  const markerMap = new Map(markers.map((m) => [m.dealId, m.lastReviewedAt]));
  let dealsWithChanges = 0;
  const movers: { dealId: string; dealName: string; changeCount: number }[] = [];
  for (const d of deals) {
    const since = markerMap.get(d.id);
    if (!since) continue;
    const changes = await db
      .select({ id: dealAuditLog.id })
      .from(dealAuditLog)
      .where(
        and(eq(dealAuditLog.dealId, d.id), gt(dealAuditLog.changedAt, since)),
      );
    if (changes.length > 0) {
      dealsWithChanges += 1;
      movers.push({
        dealId: d.id,
        dealName: d.dealName,
        changeCount: changes.length,
      });
    }
  }
  movers.sort((a, b) => b.changeCount - a.changeCount);

  return {
    totalDealsMonitored: deals.length,
    totalTCV,
    reportingCurrency,
    dealsByHealth,
    dealsByStage,
    criticalAlerts: criticalAlerts.slice(0, 10),
    staleDeals: staleDeals.slice(0, 10),
    changesSinceLastReview: {
      dealsWithChanges,
      topMovers: movers.slice(0, 5),
    },
  };
}

type PortfolioRecord = MetricsRecord;

/** Which alert set a correlation is computed over. */
type CodeBasis = "alertCodes" | "activeAlertCodes";

/** Portfolio-wide share of deals carrying each code, on the given basis. */
function codeShares(
  records: PortfolioRecord[],
  basis: CodeBasis,
): Map<string, number> {
  const counts = new Map<string, number>();
  for (const r of records) {
    for (const code of new Set(r[basis])) {
      counts.set(code, (counts.get(code) ?? 0) + 1);
    }
  }
  const shares = new Map<string, number>();
  for (const [code, count] of counts) {
    shares.set(code, records.length > 0 ? count / records.length : 0);
  }
  return shares;
}

function correlations(
  records: PortfolioRecord[],
  globalShares: Map<string, number>,
  basis: CodeBasis = "alertCodes",
): { code: string; share: number; lift: number }[] {
  const codeCounts = new Map<string, number>();
  for (const r of records) {
    for (const code of new Set(r[basis])) {
      codeCounts.set(code, (codeCounts.get(code) ?? 0) + 1);
    }
  }
  const out: { code: string; share: number; lift: number }[] = [];
  for (const [code, count] of codeCounts) {
    const share = records.length > 0 ? count / records.length : 0;
    const global = globalShares.get(code) ?? 0;
    const lift = global > 0 ? share / global : 0;
    out.push({ code, share, lift });
  }
  out.sort((a, b) => b.share - a.share);
  return out;
}

export async function computePortfolioAnalysis() {
  const { thresholds } = await getThresholds();
  const portfolioConfig = await getPortfolioConfig();
  const reportingCurrency = String(thresholds.reporting_currency || "USD");
  const deals = await loadActiveIntel();
  const records: PortfolioRecord[] = deals.map((d) => ({
    dealId: d.id,
    dealName: d.dealName,
    accountName: d.accountName,
    salesStage: d.salesStage,
    accountManager: normalizePerson(d.team.accountManager),
    technicalLead: normalizePerson(d.team.technicalLead),
    daysInStage: d.daysInStage,
    tcv: d.financials.normalizedTCV,
    healthStatus: d.governance.healthStatus,
    maxActiveAlertWeight: d.governance.alerts.reduce(
      (max, a) => Math.max(max, a.weight ?? 0),
      0,
    ),
    activeAlertCodes: d.governance.alerts.map((a) => a.code),
    alertCodes: [...d.governance.alerts, ...d.governance.managedAlerts].map(
      (a) => a.code,
    ),
    hasActiveRedAlert: d.governance.alerts.some((a) => a.severity === "RED"),
    products: d.financials.crossSells.map((c) => c.productName),
    stalled: d.governance.alerts.some((a) => a.code === "STALLED_VALIDATION"),
  }));

  // Tables keep the active+managed basis (shipped behavior, documented parity).
  const globalShares = codeShares(records, "alertCodes");
  // The Top Correlation Cluster card must agree with Correlated Exposure, which
  // only ever sums ACTIVE (undispositioned) alerts — so the cluster is detected
  // on an active-only basis. Same groups, different alert set.
  const activeGlobalShares = codeShares(records, "activeAlertCodes");

  const groupBy = (key: "accountManager" | "technicalLead") => {
    const groups = new Map<string, PortfolioRecord[]>();
    for (const r of records) {
      const k = normalizePerson(r[key]);
      if (!groups.has(k)) groups.set(k, []);
      groups.get(k)!.push(r);
    }
    return groups;
  };

  const amGroups = groupBy("accountManager");
  const byAccountManager = [...amGroups.entries()].map(([am, recs]) => ({
    accountManager: am,
    dealCount: recs.length,
    alertCorrelations: correlations(recs, globalShares),
    avgCycleTimeDays: round2(
      recs.reduce((s, r) => s + r.daysInStage, 0) / Math.max(1, recs.length),
    ),
  }));

  const tlGroups = groupBy("technicalLead");
  const byTechnicalLead = [...tlGroups.entries()]
    .filter(([tl]) => tl !== UNASSIGNED)
    .map(([tl, recs]) => ({
      technicalLead: tl,
      dealCount: recs.length,
      alertCorrelations: correlations(recs, globalShares),
      avgCycleTimeDays: round2(
        recs.reduce((s, r) => s + r.daysInStage, 0) / Math.max(1, recs.length),
      ),
    }));

  const noTlRecs = tlGroups.get(UNASSIGNED) ?? [];
  const noTechnicalLeadCycleTimeDays =
    noTlRecs.length > 0
      ? round2(noTlRecs.reduce((s, r) => s + r.daysInStage, 0) / noTlRecs.length)
      : null;

  const productGroups = new Map<string, PortfolioRecord[]>();
  for (const r of records) {
    for (const product of new Set(r.products)) {
      if (!productGroups.has(product)) productGroups.set(product, []);
      productGroups.get(product)!.push(r);
    }
  }
  const totalStalled = records.filter((r) => r.stalled).length;
  const byProduct = [...productGroups.entries()].map(([product, recs]) => ({
    productName: product,
    dealCount: recs.length,
    presentInStalledShare:
      totalStalled > 0
        ? recs.filter((r) => r.stalled).length / totalStalled
        : 0,
    alertCorrelations: correlations(recs, globalShares),
  }));

  // --- Heatmap + summary metrics (pure, in portfolio-metrics.ts) -----------
  const amCells = buildRiskCells(records, "accountManager", portfolioConfig);
  const tlCells = buildRiskCells(records, "technicalLead", portfolioConfig);
  const productAxis = [...productGroups.keys()].sort();
  // Derive each row axis from the cells themselves so the axis labels and the
  // cell keys are always normalized identically — otherwise an axis built from a
  // differently-filtered/normalized source (e.g. excluding "Unassigned") leaves
  // orphan cells that silently vanish from the grid.
  const riskMatrix = {
    byAccountManager: amCells,
    byTechnicalLead: tlCells,
    products: productAxis,
    accountManagers: [...new Set(amCells.map((c) => c.person))].sort(),
    technicalLeads: [...new Set(tlCells.map((c) => c.person))].sort(),
  };

  const activeCorr = (
    entries: Iterable<[string, PortfolioRecord[]]>,
  ): GroupCorrelation[] =>
    [...entries].map(([name, recs]) => ({
      name,
      dealCount: recs.length,
      alertCorrelations: correlations(recs, activeGlobalShares, "activeAlertCodes"),
    }));

  const activeManagerCorr = activeCorr(amGroups);
  // Mirror the table's exclusion: an "Unassigned" bucket is not a team member.
  const activeLeadCorr = activeCorr(
    [...tlGroups].filter(([tl]) => tl !== UNASSIGNED),
  );
  const activeProductCorr = activeCorr(productGroups);
  const sigCodes = recurringActiveCodes(records, portfolioConfig);
  const summary = {
    diversificationIndex: diversificationIndex(amCells),
    highestCorrelationCluster: pickHighestCorrelationCluster(
      { manager: activeManagerCorr, lead: activeLeadCorr, product: activeProductCorr },
      portfolioConfig,
      sigCodes,
    ),
    correlatedExposureTcv: correlatedExposureTcv(records, sigCodes),
    redDealCount: records.filter((r) => r.hasActiveRedAlert).length,
    totalDealCount: records.length,
    reportingCurrency,
  };

  return {
    byAccountManager,
    byTechnicalLead,
    byProduct,
    noTechnicalLeadCycleTimeDays,
    riskMatrix,
    summary,
  };
}
