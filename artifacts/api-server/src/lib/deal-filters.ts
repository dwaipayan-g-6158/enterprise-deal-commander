import { isNull } from "drizzle-orm";
import { enterpriseDeals } from "@workspace/db";
import { calculateFlatTCV } from "@workspace/engine";

// Just "not soft-deleted" — archived deals are real, historical deals that
// still count in every analytics number below — that's the whole point of
// archiving vs. deleting. See
// docs/superpowers/plans/2026-07-27-archive-lifecycle-and-semantics.md.
// Named notDeletedFilter (not activeFilter) precisely because it does NOT
// exclude archived deals — contrast with lib/scoring.ts and
// lib/subscribers/index.ts, which each define their OWN separate
// activeFilter/activeDealIds that DO exclude archived deals on purpose (a
// closed deal's score/snapshot is frozen).
//
// Previously duplicated as a local const in routes/v2/analytics.ts (which
// also independently re-declared CLOSED_STAGES three times below it) and in
// routes/v2/exports.ts, and absent entirely from routes/intelligence.ts —
// consolidated here so every route that counts/aggregates deals (including
// the Closed-Lost Autopsy tabs) excludes soft-deleted rows the same way.
export const notDeletedFilter = isNull(enterpriseDeals.deletedAt);

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
