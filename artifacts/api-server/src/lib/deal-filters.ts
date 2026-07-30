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
// Previously duplicated as a local const in routes/v2/analytics.ts and
// routes/v2/exports.ts, and absent entirely from routes/intelligence.ts —
// consolidated here so every route that counts/aggregates deals (including
// the Closed-Lost Autopsy tabs) excludes soft-deleted rows the same way.
export const notDeletedFilter = isNull(enterpriseDeals.deletedAt);

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
 * disagreed across tabs whenever it was a multi-year deal.
 */
export function termAwareTcv(row: TcvInput): number {
  return calculateFlatTCV({
    productRevenue: Number(row.productRevenue) || 0,
    servicesRevenue: Number(row.servicesRevenue) || 0,
    contractTermYears: Number(row.contractTermYears) || 1,
    pricingModel: row.pricingModel ?? "",
  });
}
