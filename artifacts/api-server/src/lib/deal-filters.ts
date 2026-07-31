import { isNull } from "drizzle-orm";
import { enterpriseDeals } from "@workspace/db";

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
// also independently re-declared CLOSED_STAGES three times below it).
// Consolidated here so every route that counts/aggregates deals excludes
// soft-deleted rows and defines "closed" the same way.
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
}

/**
 * Flat TCV — productRevenue + servicesRevenue. This is the formula every
 * OTHER analytics route on this branch already uses (/analytics/pipeline,
 * /analytics/simulation, /analytics/vital-signs, ...), so it's what
 * synthetic pipeline_transitions rows use too — a deal's own current
 * revenue fields, always available, rather than a snapshot lookup that may
 * not exist yet for a just-created or seed-inserted deal.
 *
 * NOT term-aware (doesn't multiply by contractTermYears for Multi-Year
 * Committed deals) — that richer formula exists as `calculateFlatTCV` in
 * @workspace/engine and is used by `processDealIntelligence`'s own
 * `calculatedTCV`, but adopting it HERE, selectively, would make
 * pipeline_transitions disagree with every other analytics figure on a
 * multi-year deal instead of agreeing with all of them.
 */
export function flatTcv(row: TcvInput): number {
  return (Number(row.productRevenue) || 0) + (Number(row.servicesRevenue) || 0);
}
