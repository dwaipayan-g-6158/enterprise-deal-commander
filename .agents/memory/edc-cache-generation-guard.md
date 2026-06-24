---
name: EDC cache generation guard quirk
description: Why the InProcessCache wrap() generation guard only protects keys that are already tracked
---

`InProcessCache.wrap()` (artifacts/api-server/src/lib/cache.ts) captures a key's
generation before running its async producer and refuses to write the result
back if the generation advanced meanwhile (concurrent invalidation). Generations
are bumped by `delete`, `invalidatePrefix`, and `clear`.

**Quirk:** `invalidatePrefix` only bumps generations for keys that already exist
in `store` OR `generations` at invalidation time. A key that is *only* in-flight
(first-ever `wrap`, never previously set or deleted) has no generation entry, so
a concurrent `invalidatePrefix` will NOT bump it — the stale producer result
then gets cached.

**Why it doesn't bite production:** `invalidateDeal` deletes the exact
`intel:<dealId>` key (explicit `delete` bumps that key directly), so per-deal
intelligence is always protected. The prefix path is used for `summary:` /
`lookup:` tiers, which are populated by long-lived reads and almost always have
a prior generation entry by the time an invalidation races a refresh.

**How to apply:** when unit-testing the prefix-invalidation guard, seed
generation tracking first (e.g. `cache.delete(key)`) before the in-flight
`wrap`, otherwise the guard legitimately won't fire and the test asserts
behavior that never holds.
