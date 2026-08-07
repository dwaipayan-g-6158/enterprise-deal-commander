import { calculateFlatTCV } from "@workspace/engine";

// No `@workspace/db` import here, deliberately. This module used to export a
// Drizzle `notDeletedFilter` predicate alongside the pure helpers below, which
// meant every route that wanted `CLOSED_STAGES` or `termAwareTcv` pulled the
// Postgres client in behind it. Nothing consumed the predicate after the
// Data Store migration — `lib/catalyst/portfolio.ts` filters soft-deleted rows
// in memory — so it went with the rest of the Drizzle layer.

// The two terminal pipeline stages. A deal in either of these has no further
// pipeline motion to track — it should never appear in an "active"/"open"
// aggregate (velocity, coverage, weighted pipeline, next-actions, ...).
// Matched by stage *name* (not a terminal flag/id) to mirror how the rest of
// this file and lib/engine/src/flow.ts's StageDef.terminal already identify
// them.
export const CLOSED_STAGES: string[] = ["Closed-Won", "Closed-Lost"];

export interface TcvInput {
  productRevenue: unknown;
  servicesRevenue: unknown;
  contractTermYears: unknown;
  pricingModel: string | null | undefined;
}

/**
 * Term-aware TCV — the SAME formula `processDealIntelligence` uses for a
 * deal's `calculatedTCV` (lib/engine/src/index.ts, via calculateFlatTCV):
 * `productRevenue * contractTermYears + servicesRevenue` under the
 * Multi-Year Committed pricing model, `productRevenue + servicesRevenue`
 * otherwise. Several Closed-Lost Autopsy routes used to compute their own
 * flat `product + services` sum instead, so the same lost deal's value
 * disagreed across tabs whenever it was a multi-year deal. This is now the
 * one TCV formula used everywhere on this codebase (routes/v2/analytics.ts,
 * lib/scoring.ts, routes/intelligence.ts, and the synthetic
 * pipeline_transitions rows below) — see the 2026-07-30 core-logic
 * remediation plan (H1) for the consolidation.
 */
export function termAwareTcv(row: TcvInput): number {
  return calculateFlatTCV({
    productRevenue: Number(row.productRevenue) || 0,
    servicesRevenue: Number(row.servicesRevenue) || 0,
    contractTermYears: Number(row.contractTermYears) || 1,
    pricingModel: row.pricingModel ?? "",
  });
}

/**
 * Convert a native-currency TCV into the reporting currency, mirroring the
 * engine's own F1 normalization EXACTLY (lib/engine/src/index.ts's
 * `normalizedTCV`): multiply by the rate, and when no rate exists for the pair
 * fall back to the native value rather than dropping the deal or zeroing it.
 *
 * Exists so aggregate routes can report the same currency basis as
 * `computeSummary` (which sums the engine's `financials.normalizedTCV`) without
 * paying for a full per-deal intelligence assembly. Mixing the two bases in one
 * comparison is what made the dashboard's "Total TCV" tile subtract an
 * un-normalized baseline from a normalized current value.
 */
export function normalizeTcv(tcv: number, fxRate: number | null | undefined): number {
  return fxRate == null ? tcv : tcv * fxRate;
}
