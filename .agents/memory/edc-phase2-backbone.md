---
name: EDC Phase 2 durable backbone
description: Event bus + durable history + cache invalidation rules for the EDC Phase 2 backbone; non-obvious correctness constraints.
---

# EDC Phase 2 durable backbone

Event-driven layer: typed in-process event bus -> subscribers (activity log,
snapshots, health history, cache invalidation). New durable tables live in the
`edc_v2` pgSchema (distinct from Phase 1 `deal_audit_log`). v2 reads are served
from `/api/v2/*` (contract-first OpenAPI -> Orval, same as v1).

## Three cache tiers (intel / lookup / summary), all READ-path only
**Rule:** Caching wraps READ paths only; write paths use uncached assemblers so
Phase 1 mutation responses stay fresh.
- `intel:` — per-deal assembled intelligence (`cachedIntel`), 30s.
- `lookup:` — engine thresholds (`getThresholds`) + FX rates (`getFxRate`) in
  `lib/intelligence.ts`, 10m. These are read on EVERY assembly + the summary.
- `summary:` — portfolio summary + portfolio-analysis responses, 15s. Both
  endpoints are refactored so the handler only calls `cache.wrap(...)` around a
  `compute*()` function; the response shaping/parse stays in the handler.

## Cache invalidation must NOT rely solely on emitted events
**Rule:** Cache invalidation is guaranteed by `lib/cache-middleware.ts`
(`cacheInvalidationMiddleware`), which invalidates on EVERY successful non-GET
request — not by the event subscriber alone. Per-deal mutations drop that deal's
`intel:` key + the whole `summary:` prefix; `/lookups/*` config mutations drop
the `lookup:` + `intel:` + `summary:` prefixes (thresholds/FX reshape every
deal).
**Why:** The event bus only fires for routes that emit (deals/gates/blockers).
Routes that mutate intelligence inputs but emit nothing (blocker DELETE,
cross-sells, dispositions, interventions) would otherwise serve stale cached
intelligence for the TTL window — a Phase 1 behavior regression. Global config
(lookups: thresholds/FX) reshapes EVERY deal's intelligence, so those mutations
clear the whole `intel:`/`summary:` prefix.
**How to apply:** When adding any new mutating route, the middleware already
covers it if the path is `/deals/:id/...` (per-deal) or `/lookups/...` (global).
If you add a global-config route under a different path, extend the middleware's
global-invalidation match.

## cache.wrap has a generation guard — keep it
**Rule:** `InProcessCache.wrap()` captures a per-key generation before running
its producer and only writes the result back if the generation didn't advance.
**Why:** Without it, a read that started before a concurrent mutation can finish
after the mutation invalidated the key and repopulate a stale value for the full
TTL. The guard makes "stale never outlives a write" actually true.

## Health reconciliation is serialized per deal
**Rule:** `health-tracker.ts` runs `reconcileHealth` through a per-deal promise
chain (`runSerialPerDeal`).
**Why:** A single stage change emits BOTH `deal.updated` and `deal.stage_changed`;
each is dispatched async. Concurrent reconciliations would both read the same
prior health and both insert -> duplicate `deal_health_history` rows + duplicate
`health.changed` cascades (which fan out to activity + snapshot). Serializing per
deal makes the read-then-insert atomic so the second run no-ops.

## Portfolio/summary rollups — REMOVED (2026-08-07). Do not reinstate.
**Rule:** There is no rollup precompute any more. `edc_v2.portfolio_rollups` is
never read and never written; `/intelligence/summary` and
`/intelligence/portfolio-analysis` always live-compute through
`lib/catalyst/portfolio.ts` and the 15s `summary:` cache tier.
**Why:** The read side went first, when `routes/intelligence.ts` moved to Data
Store — the fast path fronted the same compute and the table is permanently
empty on Catalyst, so serving from it was unreachable. What was NOT removed
then was the write side, which kept maintaining a table nobody consulted. On
Catalyst that meant a Drizzle DELETE + recompute against a Postgres that does
not exist, fired on **every mutation** (`cache-middleware.ts`'s finish handler
and the `cache-invalidation.ts` subscriber) and on **every cold start**
(`purgeAndWarmPortfolioRollups`). All of it caught and logged, so the app
behaved correctly while quietly failing several times per write — the same
"swallowed error that looks like nothing" shape as the `key_lessons` bug.
**How to apply:** Deleted outright: `lib/portfolio-rollups.ts`,
`lib/portfolio-rollup-coordinator.ts`, `lib/materialized-views.ts`,
`lib/refresh-cadence.ts` and their tests, plus the MV timer in
`subscribers/index.ts`. The Drizzle `portfolioRollups` table definition and the
Data Store `v2_portfolio_rollups` table are both left in place — unused, and
dropping either buys nothing. **Do not reinstate**: the compute it fronted
measures 10ms (`computeSummary`) and 156ms (`computePortfolioAnalysis`). If a
future portfolio ever makes that hurt, the precompute belongs in Catalyst Job
Scheduling next to the snapshot job (`routes/jobs.ts`), not on a wall-clock
`setInterval` AppSail never runs.

## diversificationIndex is normalized, not the PRD's raw Gini-Simpson formula
**Rule:** `diversificationIndex` = `(1 - Σw²) × n/(n-1)`, a NORMALIZED
Gini-Simpson index — a deliberate deviation from the PRD's raw `1 - Σw²`.
**Why:** The raw form is bounded above by `1 - 1/n`, unreachable past 0.5 for a
2-cell portfolio — a perfectly-even small portfolio used to read as
"concentrated" even though there was nothing more even it could be. Do NOT
"restore" the raw PRD formula; the frontend's diversification color bands
(`diversificationBand` in `portfolio-presentation.ts`) were re-thresholded
(0.85/0.6, up from the old 0.66/0.4) specifically to match this normalized
[0,1] scale.

## Correlation tables and the cluster card intentionally use different alert bases
**Rule:** The `byAccountManager`/`byTechnicalLead`/`byProduct` correlation
TABLES use the active+managed alert basis — unchanged, historical behavior,
kept for parity with the existing correlation tables. The "Top Correlation
Cluster" SUMMARY CARD (`highestCorrelationCluster`) uses a different,
active-only alert basis, further gated to codes that clear
`recurringActiveCodes`'s recurrence bar.
**Why:** So the cluster card can never name a code with zero Correlated
Exposure (`correlatedExposureTcv`, also active-only) behind it. Two different
bases on the same page, on purpose — don't "fix" this into one basis.

## The rollup epoch guard is gone with the rollups — the cache guard is not
**Rule:** `RefreshCoordinator`, `ROLLUP_MAX_AGE_MS` and the startup-purge
caveat all died with the rollup subsystem above. The equivalent protection for
the in-process cache — `cache.wrap`'s generation guard — is untouched and
still load-bearing (see "cache.wrap has a generation guard" above).
**Why it's worth recording:** the two were deliberately parallel designs, so a
future reader finding the cache guard may go looking for the rollup one. It
was correct, it just has nothing left to protect: with no precomputed row,
"stale never outlives a write" is trivially true for aggregates — every read
recomputes.
