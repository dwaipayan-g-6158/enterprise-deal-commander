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
when present AND fresh, falling back to the live `summary:` cache tier compute
otherwise — a rollup older than `ROLLUP_MAX_AGE_MS` (~17 min,
`portfolio-rollup-coordinator.ts`) is treated as a cache MISS even though the
row is still physically present, not only when the row is absent outright.
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
`registerPortfolioRollupView()` — the startup call in `registerSubscribers()`
is `purgeAndWarmPortfolioRollups()`, not a plain warm: it DELETEs any row left
by a previous process before recomputing, because an older binary's row can
encode a different formula (e.g. the pre-normalization diversification index)
or a payload shape the current route's Zod parse would reject. The purge is
load-bearing, not incidental — see the "startup purge" section below for
exactly how far that guarantee reaches (it's narrower than it sounds).

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

## Rollup reads enforce a max age; refreshes are single-flighted with an epoch guard
**Rule:** `readRollup` treats a row older than `ROLLUP_MAX_AGE_MS` (~17 min) as
a miss (see above). Refreshes go through `RefreshCoordinator`
(`portfolio-rollup-coordinator.ts`): concurrent callers (the periodic MV job vs.
a mutation's debounced refresh) join a single in-flight run instead of
duplicating the compute, and an invalidation bumps an epoch so a refresh that
started before a mutation can never resurrect pre-mutation numbers after that
mutation's DELETE — it detects it's superseded and discards its snapshot
instead of upserting.
**Why:** Mirrors the existing `cache.wrap` generation-guard pattern in
`lib/cache.ts` (see "cache.wrap has a generation guard" above): without the
epoch check, a slow refresh straddling a mutation could write stale data back
AFTER the invalidating DELETE, making "stale never outlives a write" false for
rollups even though it's already guaranteed for the cache tier.
**Caveat — the startup purge is narrower than it sounds:**
`purgeAndWarmPortfolioRollups()` runs inside the `app.listen` callback in
`index.ts`, i.e. AFTER the server has already begun accepting HTTP
connections, and it's fire-and-forget (`void ...catch(...)` in
`registerSubscribers()`), not awaited. On a normal restart this closes the gap
within a short (typically sub-second) window — a request landing in that
window can still read a pre-restart rollup row — but since a rollup HIT
bypasses the 15s `cache.wrap` tier entirely, that stale read is never cached
forward: the very next request after the purge lands gets corrected data. It
self-heals; it just isn't instantaneous. It is NOT a guarantee against a
previous instance of the process still running concurrently in a
multi-instance deployment and re-upserting old values after this instance's
purge completes — that scenario is outside what a single process's startup
purge can fix.
