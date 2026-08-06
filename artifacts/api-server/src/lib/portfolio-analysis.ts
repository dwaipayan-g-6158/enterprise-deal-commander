/**
 * Pure, DB-free portfolio-analysis compute.
 *
 * Extracted from portfolio.ts so the Drizzle path and the Catalyst path can
 * share ONE copy of the correlation/heatmap math instead of each carrying its
 * own. The migration's parallel-sibling pattern (a `lib/catalyst/*.ts` twin per
 * DB-touching module) is right for code that queries, but duplicating ~145
 * lines of arithmetic would mean two implementations of "highest correlation
 * cluster" that can silently disagree — the same reason `computeRollback` was
 * split out to settings-rollback.ts earlier in this migration.
 *
 * Everything here takes already-loaded intelligence and returns plain data.
 * `portfolio.ts` (Drizzle) and `catalyst/portfolio.ts` (Data Store) each do
 * their own loading and then call in here.
 */

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
  type PortfolioMetricsConfig,
} from "./portfolio-metrics";

export type PortfolioRecord = MetricsRecord;

/**
 * The shape this module reads off an assembled deal.
 *
 * Declared structurally rather than importing `Intel` from either portfolio
 * module: the Drizzle and Catalyst assemblers produce identical shapes from
 * different files, so a nominal import would arbitrarily couple this to one of
 * them and force a cast at the other call site.
 */
export interface AnalyzableDeal {
  id: string;
  dealName: string;
  accountName: string;
  salesStage: string;
  daysInStage: number;
  team: { accountManager: string | null; technicalLead: string | null };
  financials: {
    normalizedTCV: number;
    crossSells: { productName: string }[];
  };
  governance: {
    healthStatus: MetricsRecord["healthStatus"];
    alerts: { code: string; severity: string; weight?: number | null }[];
    managedAlerts: { code: string }[];
  };
}

/** Round to at most 2 decimal places (e.g. 23.6667 -> 23.67). */
function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

export function toPortfolioRecords(deals: AnalyzableDeal[]): PortfolioRecord[] {
  return deals.map((d) => ({
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
    alertCodes: [...d.governance.alerts, ...d.governance.managedAlerts].map((a) => a.code),
    hasActiveRedAlert: d.governance.alerts.some((a) => a.severity === "RED"),
    products: d.financials.crossSells.map((c) => c.productName),
    stalled: d.governance.alerts.some((a) => a.code === "STALLED_VALIDATION"),
  }));
}

/** Which alert set a correlation is computed over. */
type CodeBasis = "alertCodes" | "activeAlertCodes";

/** Portfolio-wide share of deals carrying each code, on the given basis. */
function codeShares(records: PortfolioRecord[], basis: CodeBasis): Map<string, number> {
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

export function buildPortfolioAnalysis(
  records: PortfolioRecord[],
  portfolioConfig: PortfolioMetricsConfig,
  reportingCurrency: string,
) {
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
      totalStalled > 0 ? recs.filter((r) => r.stalled).length / totalStalled : 0,
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
  const activeLeadCorr = activeCorr([...tlGroups].filter(([tl]) => tl !== UNASSIGNED));
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
