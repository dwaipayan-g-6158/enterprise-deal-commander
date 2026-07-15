/**
 * Pure, DB-free portfolio-risk metrics.
 *
 * The Portfolio Overview surfaces a Team x Product risk heatmap and a row of
 * summary cards. All of that math lives here so it can be unit-tested without a
 * database and reused by both the live compute path and the rollup refresher.
 * `portfolio.ts` enriches its per-deal records and calls into these builders.
 *
 * Formulas are deliberately simple and explainable (no ML): the engine already
 * produces an authoritative per-deal health status and weighted alerts, so we
 * blend those rather than inventing a parallel risk model.
 */

export type HealthStatus = "GREEN" | "YELLOW" | "RED";

/** A ProductMix-compatible deal reference used for cell drill-downs. */
export interface MetricsDeal {
  id: string;
  dealName: string;
  accountName: string;
  salesStage: string;
  tcv: number;
}

/** One active deal, enriched with everything the metrics need. */
export interface MetricsRecord {
  dealId: string;
  dealName: string;
  accountName: string;
  salesStage: string;
  accountManager: string;
  technicalLead: string;
  daysInStage: number;
  tcv: number;
  healthStatus: HealthStatus;
  /** Largest weight among the deal's active (unmanaged) alerts; engine weights are 30-100. */
  maxActiveAlertWeight: number;
  /** Active (unmanaged) alert codes only. */
  activeAlertCodes: string[];
  /** Active + managed alert codes (parity with the existing correlation tables). */
  alertCodes: string[];
  products: string[];
  stalled: boolean;
}

export interface RiskCell {
  person: string;
  product: string;
  dealCount: number;
  tcv: number;
  /** Composite risk, 0-100. */
  riskScore: number;
  /** Up to three most-common active alert codes at this intersection. */
  topAlertCodes: string[];
  /** Fewer than MIN_CONFIDENCE_DEALS deals — statistically thin (PRD NFR-7.2.2). */
  lowConfidence: boolean;
  deals: MetricsDeal[];
}

export interface GroupCorrelation {
  name: string;
  dealCount: number;
  alertCorrelations: { code: string; share: number; lift: number }[];
}

export interface HighestCorrelationCluster {
  scope: "manager" | "lead" | "product";
  name: string;
  code: string;
  lift: number;
  share: number;
}

export interface PortfolioMetricsConfig {
  healthBase: Record<HealthStatus, number>;
  alertBumpCap: number;
  alertBumpPerWeight: number;
  minConfidenceDeals: number;
  significantLift: number;
  clusterMinShare: number;
  clusterMinDeals: number;
}

/** The values this module used before config became DB-tunable — unchanged behavior when no config is passed. */
export const DEFAULT_PORTFOLIO_CONFIG: PortfolioMetricsConfig = {
  healthBase: { GREEN: 10, YELLOW: 45, RED: 75 },
  alertBumpCap: 25,
  alertBumpPerWeight: 0.25,
  minConfidenceDeals: 3,
  significantLift: 1.5,
  clusterMinShare: 0.5,
  clusterMinDeals: 3,
};

/** @deprecated kept for any external import; equals DEFAULT_PORTFOLIO_CONFIG.minConfidenceDeals */
export const MIN_CONFIDENCE_DEALS = DEFAULT_PORTFOLIO_CONFIG.minConfidenceDeals;

const UNASSIGNED = "Unassigned";

function clamp(n: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, n));
}

/** Per-deal composite risk in [0, 100]: health base + a capped strongest-alert bump. */
export function computeDealRisk(
  d: { healthStatus: HealthStatus; maxActiveAlertWeight: number },
  config: PortfolioMetricsConfig = DEFAULT_PORTFOLIO_CONFIG,
): number {
  const base = config.healthBase[d.healthStatus];
  const bump = Math.min(config.alertBumpCap, d.maxActiveAlertWeight * config.alertBumpPerWeight);
  return Math.round(clamp(base + bump, 0, 100));
}

function topCodes(records: MetricsRecord[], limit = 3): string[] {
  const counts = new Map<string, number>();
  for (const r of records) {
    for (const code of new Set(r.activeAlertCodes)) {
      counts.set(code, (counts.get(code) ?? 0) + 1);
    }
  }
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
    .map(([code]) => code);
}

/**
 * Build heatmap cells for a given person axis. A deal contributes to one cell
 * per product it involves, mirroring the existing by-product grouping.
 *
 * Person and product strings (which can contain spaces, dots, etc.) are carried
 * in the group value, so they are never reconstructed by parsing the map key.
 */
export function buildRiskCells(
  records: MetricsRecord[],
  axis: "accountManager" | "technicalLead",
  config: PortfolioMetricsConfig = DEFAULT_PORTFOLIO_CONFIG,
): RiskCell[] {
  const groups = new Map<
    string,
    { person: string; product: string; recs: MetricsRecord[] }
  >();
  for (const r of records) {
    const person = (r[axis] || "").trim() || UNASSIGNED;
    for (const product of new Set(r.products)) {
      const key = JSON.stringify([person, product]);
      let group = groups.get(key);
      if (!group) {
        group = { person, product, recs: [] };
        groups.set(key, group);
      }
      group.recs.push(r);
    }
  }

  const cells: RiskCell[] = [];
  for (const { person, product, recs } of groups.values()) {
    const meanRisk =
      recs.reduce((s, r) => s + computeDealRisk(r, config), 0) / recs.length;
    cells.push({
      person,
      product,
      dealCount: recs.length,
      tcv: recs.reduce((s, r) => s + r.tcv, 0),
      riskScore: Math.round(meanRisk),
      topAlertCodes: topCodes(recs),
      lowConfidence: recs.length < config.minConfidenceDeals,
      deals: recs.map((r) => ({
        id: r.dealId,
        dealName: r.dealName,
        accountName: r.accountName,
        salesStage: r.salesStage,
        tcv: r.tcv,
      })),
    });
  }
  return cells;
}

/**
 * Modified Herfindahl-Hirschman diversification index (PRD 10.4):
 * D = 1 - sum(w_i^2), where w_i is a cell's share of total correlated risk
 * (riskScore * dealCount). 1 = evenly spread, 0 = fully concentrated.
 */
export function diversificationIndex(cells: RiskCell[]): number {
  const weights = cells.map((c) => c.riskScore * c.dealCount);
  const total = weights.reduce((s, w) => s + w, 0);
  if (total <= 0) return 1;
  const hhi = weights.reduce((s, w) => {
    const share = w / total;
    return s + share * share;
  }, 0);
  return clamp(1 - hhi, 0, 1);
}

/** Codes that are concentrated in at least one sufficiently large group. */
export function significantCodes(
  groups: GroupCorrelation[],
  config: PortfolioMetricsConfig = DEFAULT_PORTFOLIO_CONFIG,
): Set<string> {
  const codes = new Set<string>();
  for (const g of groups) {
    if (g.dealCount < config.clusterMinDeals) continue;
    for (const c of g.alertCorrelations) {
      if (c.lift >= config.significantLift && c.share >= config.clusterMinShare) {
        codes.add(c.code);
      }
    }
  }
  return codes;
}

/**
 * Total TCV of deals participating in a significant correlation cluster — i.e.
 * carrying at least one active alert code flagged by `significantCodes`. This
 * stands in for the PRD's p-value participation test, which needs richer
 * history than the cockpit currently retains.
 */
export function correlatedExposureTcv(
  records: MetricsRecord[],
  codes: Set<string>,
): number {
  if (codes.size === 0) return 0;
  let total = 0;
  for (const r of records) {
    if (r.activeAlertCodes.some((c) => codes.has(c))) total += r.tcv;
  }
  return total;
}

/** The eligible (group, code) pair with the strongest lift, or null. */
export function pickHighestCorrelationCluster(
  groups: {
    manager: GroupCorrelation[];
    lead: GroupCorrelation[];
    product: GroupCorrelation[];
  },
  config: PortfolioMetricsConfig = DEFAULT_PORTFOLIO_CONFIG,
): HighestCorrelationCluster | null {
  const scopes: [HighestCorrelationCluster["scope"], GroupCorrelation[]][] = [
    ["manager", groups.manager],
    ["lead", groups.lead],
    ["product", groups.product],
  ];
  let best: HighestCorrelationCluster | null = null;
  for (const [scope, list] of scopes) {
    for (const g of list) {
      if (g.dealCount < config.clusterMinDeals) continue;
      for (const c of g.alertCorrelations) {
        if (c.share < config.clusterMinShare) continue;
        // Only a positively-concentrated pattern (lift > baseline) is a
        // meaningful "correlation cluster"; lift <= 1 is at/below the norm.
        if (c.lift <= 1) continue;
        if (!best || c.lift > best.lift) {
          best = { scope, name: g.name, code: c.code, lift: c.lift, share: c.share };
        }
      }
    }
  }
  return best;
}
