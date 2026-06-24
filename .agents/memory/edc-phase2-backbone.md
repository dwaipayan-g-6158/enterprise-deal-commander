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

## Portfolio/summary rollups are a maintained TABLE, not a SQL materialized view
**Rule:** The portfolio summary + portfolio-analysis aggregates are precomputed
into the `edc_v2.portfolio_rollups` table (one row per named rollup, `payload`
JSONB = the endpoint's `data` body). The read endpoints serve the rollup row
when present and fall back to the live `summary:` cache tier compute when absent.
**Why:** Health/alerts come from the in-process intelligence engine (JS), so a
pure Postgres `REFRESH MATERIALIZED VIEW` can't compute them. The MV registry
(`lib/materialized-views.ts`) was therefore generalized to accept a custom
`refresh()` fn; the rollup registers one instead of a SQL view.
**How to apply:** The shared compute lives in `lib/portfolio.ts`
(`computeSummary`/`computePortfolioAnalysis`) — used by BOTH the live fallback
and the rollup refresher so they never diverge. Freshness: the 15-min MV job
repopulates; any mutation calls `invalidatePortfolioRollups()` (DELETE all rows
+ debounced ~2s background refresh). Invalidation is wired in lockstep with the
`summary:` tier — both the event subscriber (`cache-invalidation.ts`) AND the
`cache-middleware.ts` finish handler. If you add a rollup, register it in
`registerPortfolioRollupView()` and warm it in `registerSubscribers()`.
