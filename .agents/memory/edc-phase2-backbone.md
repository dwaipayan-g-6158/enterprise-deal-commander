---
name: EDC Phase 2 durable backbone
description: Event bus + durable history + cache invalidation rules for the EDC Phase 2 backbone; non-obvious correctness constraints.
---

# EDC Phase 2 durable backbone

Event-driven layer: typed in-process event bus -> subscribers (activity log,
snapshots, health history, cache invalidation). New durable tables live in the
`edc_v2` pgSchema (distinct from Phase 1 `deal_audit_log`). v2 reads are served
from `/api/v2/*` (contract-first OpenAPI -> Orval, same as v1).

## Cache invalidation must NOT rely solely on emitted events
**Rule:** Intelligence is cached only on the READ path (`routes/intelligence.ts`
`cachedIntel`); write paths use the uncached assembler. Cache invalidation is
guaranteed by `lib/cache-middleware.ts` (`cacheInvalidationMiddleware`), which
invalidates on EVERY successful non-GET request — not by the event subscriber
alone.
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
