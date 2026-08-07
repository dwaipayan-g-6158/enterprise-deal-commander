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

- **Snapshot service** — hourly point-in-time `deal_snapshots`. On Catalyst this runs through Job
  Scheduling (`POST /api/v1/jobs/snapshots`), not the in-process timer: AppSail recycles an idle
  instance after five minutes, so a wall-clock `setInterval` never fires there.

The materialized-view refresh and the portfolio-rollup warm-up were **removed in 2026-08**. The
aggregates they precomputed (`computeSummary`, `computePortfolioAnalysis`) measure 10ms and 156ms
respectively, so every read simply computes them live behind the 15s `summary:` cache tier. That
also removes the eventual-consistency caveat that used to apply here: aggregates no longer lag the
underlying data by a refresh interval.

## Scale expectations

EDC is explicitly designed around a **single operator managing ~15–20 active deals** (the stated
bottleneck that motivates Phase 2 multi-commander support), and the Deal Roster is tuned for one
person triaging **10–50 deals**. It is not designed as a high-concurrency, many-tenant CRM. Within
that envelope, performance is dominated by database round-trips, not the engine.

## Limitations

- **Single-user core.** Phase 1 assumes one Commander; true multi-actor access, delegation, and
  territory scoping are Phase 2 features (partially shipped — see [roadmap.md](./roadmap.md)).
- **No formal migrations.** Schema changes are made directly against Zoho Catalyst Data Store
  (Console or MCP tools), not versioned migration files — fine for this project's workflow, but
  something to plan around for strict production change control. See
  [CATALYST_SCHEMA.md](./CATALYST_SCHEMA.md).
- **No CI-driven deploy pipeline.** Deploys are manually triggered from the Catalyst Console. The
  app runs as a single AppSail instance; see [build-and-deploy.md](./build-and-deploy.md).
- **Platform-specific native binaries.** Only linux-x64 and win32-x64 are enabled out of the box.
- **Dimensional risk degrades gracefully but partially.** Competitive Exposure is `assessable: false`
  when no competitors are tracked, so it contributes nothing to the composite (Stakeholder Coverage
  scores an empty roster as a real finding instead); some spec signals (ramp backloading,
  decision-log activity) are intentionally dropped where the data isn't available.
- **No test needs a database.** The whole suite runs against the in-memory Data Store fake
  (`artifacts/api-server/src/test-support/catalyst-test-app.ts`).

## Known issues & doc-vs-code notes

These are documentation/consistency notes surfaced while writing these docs — verify against the
code before relying on either side:

1. **Pattern count.** `CLAUDE.md` describes a "12-pattern" engine; the code (`lib/engine/src/index.ts`)
   defines **15** named patterns plus Risk Engine v2. This docs set follows the code.
2. **Health source.** Governance health is derived from the Risk Engine v2 **composite level**,
   not the older pattern-weight roll-up. RED patterns still gate stage advancement independently.
3. **Pending working-tree edit.** At the time this documentation was authored, one component
   (`deal-trajectory.tsx`) had an in-progress edit; it was committed as part of publishing.

If you find a discrepancy, treat the **source of truth** as authoritative: `openapi.yaml` for the
API, `lib/engine` for risk logic, and [CATALYST_SCHEMA.md](./CATALYST_SCHEMA.md) for the data model
(there is no schema file in the repo — Data Store is the schema).
