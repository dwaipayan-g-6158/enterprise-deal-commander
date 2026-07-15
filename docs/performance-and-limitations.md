# Performance, Limitations & Known Issues

- [Performance design](#performance-design)
- [Caching](#caching)
- [Durable history & background jobs](#durable-history--background-jobs)
- [Scale expectations](#scale-expectations)
- [Limitations](#limitations)
- [Known issues & doc-vs-code notes](#known-issues--doc-vs-code-notes)

## Performance design

- **Pure engine, cheap to run.** Risk computation is in-memory and deterministic; it can run on
  every request and in the browser without a service dependency.
- **Request/response Phase 1.** By design Phase 1 has *no* event bus, queue, Redis, or
  materialized views — it favors correctness and simplicity over throughput.
- **Phase 2 adds asynchronicity** via an in-process event bus so write requests return quickly
  while subscribers build history in the background.

## Caching

Phase 2 introduces a server-side cache (`src/lib/cache.ts` + `cache-middleware.ts`):

- Reads are cached; a **cache-invalidation subscriber** clears affected entries on the event bus
  after mutations.
- A **generation guard** (`wrap()`) prevents stale writes from clobbering fresher data — but it
  only protects keys that are already tracked (see `edc-cache-generation-guard.md`).
- The frontend PWA additionally caches `/api/v[12]/` GETs with a `StaleWhileRevalidate` strategy
  (auth is never cached), enabling offline reads.

## Durable history & background jobs

The API server runs periodic work:

- **Snapshot service** — hourly point-in-time `deal_snapshots`.
- **Materialized-view refresh** — roughly every 15 minutes.
- **Portfolio-rollup warm-up** — precomputes `portfolio_rollups`.

These keep expensive aggregate reads fast at the cost of eventual consistency (aggregates can lag
the underlying data by up to the refresh interval).

## Scale expectations

EDC is explicitly designed around a **single operator managing ~15–20 active deals** (the stated
bottleneck that motivates Phase 2 multi-commander support), and the Deal Roster is tuned for one
person triaging **10–50 deals**. It is not designed as a high-concurrency, many-tenant CRM. Within
that envelope, performance is dominated by database round-trips, not the engine.

## Limitations

- **Single-user core.** Phase 1 assumes one Commander; true multi-actor access, delegation, and
  territory scoping are Phase 2 features (partially shipped — see [roadmap.md](./roadmap.md)).
- **No formal migrations.** Schema changes are applied with `drizzle-kit push`, not versioned
  migration files — fine for this project's workflow, but something to plan around for strict
  production change control.
- **No Docker/compose or committed deploy pipeline.** You wire up Postgres and process management
  yourself (historically Replit). The included CI is starter scaffolding.
- **Platform-specific native binaries.** Only linux-x64 and win32-x64 are enabled out of the box.
- **Dimensional risk degrades gracefully but partially.** Stakeholder Coverage and Competitive
  Exposure are `assessable: false` when their inputs are absent; some spec signals (ramp
  backloading, decision-log activity) are intentionally dropped where the data isn't available.
- **DB-dependent tests need a database.** The API-server suite expects a reachable `DATABASE_URL`;
  the pure engine suite does not.

## Known issues & doc-vs-code notes

These are documentation/consistency notes surfaced while writing these docs — verify against the
code before relying on either side:

1. **Pattern count.** `CLAUDE.md` describes a "12-pattern" engine; the code (`lib/engine/src/index.ts`)
   defines **15** named patterns plus Risk Engine v2. This docs set follows the code.
2. **Health source.** Governance health is derived from the Risk Engine v2 **composite level**,
   not the older pattern-weight roll-up. RED patterns still gate stage advancement independently.
3. **Post-merge schema drift.** Tables created via direct SQL by an agent may not reach the main
   database on merge; a post-merge `push` is expected. Never `push-force`.
4. **Pending working-tree edit.** At the time this documentation was authored, one component
   (`deal-trajectory.tsx`) had an in-progress edit; it was committed as part of publishing.

If you find a discrepancy, treat the **source of truth** as authoritative: `openapi.yaml` for the
API, `lib/engine` for risk logic, and `lib/db/src/schema` for the data model.
