# Zoho Catalyst migration — Postgres/Drizzle is gone

**Date:** 2026-08-07
**Merged to `main`:** commit `8e96b05` ("Merge the Zoho Catalyst migration"), closed out by `37028d2`
**Scope:** `197 files changed, +20,651 / −14,768` (full range `5c0fd66^..37028d2`, 2026-08-06 to 2026-08-07)
**Areas:** `lib/db`, `artifacts/api-server` (every route + all 11 subscribers), `artifacts/edc` (login), `scripts` (new `build-appsail`), `catalyst.json` (new)

The entire stack now runs on **Zoho Catalyst**: Data Store replaces Postgres/Drizzle, Catalyst
embedded auth replaces the app's own bcrypt/JWT login, Catalyst Job Scheduling replaces the
in-process periodic-snapshot timer, and Stratus object storage backs an overflow tier for
oversized snapshot payloads. The migration ran in 6 slices (deploy shell → schema → repository
layer → auth → job scheduling → seed), each verified live against the real deployed app before
moving on.

---

## 1. Datastore

Zoho Catalyst Data Store: a hosted, schemaless Row API with **no `WHERE` clause** — repositories
read a whole table and filter in memory — and no native FK cascade, so cascading deletes are
explicit JS, not a database constraint. All 71 tables live in one flat namespace (Phase 2 tables
carry a `v2_` prefix instead of a separate Postgres schema). Full manifest and type mapping:
[`docs/CATALYST_SCHEMA.md`](../CATALYST_SCHEMA.md). Real platform constraints found empirically
during the port (max 2 unique `varchar` columns per table, `double.decimal_digits` clamped to 4,
second-granularity datetimes, plain-object rejections instead of `Error` instances, a hard
concurrency limit): [`docs/catalyst-datastore-constraints.md`](../catalyst-datastore-constraints.md).

_Files:_ `lib/db/src/catalyst/sdk.ts`, `lib/db/src/catalyst/repositories/*.ts`, `lib/db/src/catalyst/stratus.ts`

## 2. Auth

Login/logout are no longer server routes — the Catalyst embedded auth Web SDK widget
(`artifacts/edc/src/pages/login.tsx`) talks directly to Zoho's identity servers. `requireAuth`
(`artifacts/api-server/src/lib/auth.ts`) reads the Catalyst-authenticated identity off the request
and maps it to a `commanders` Data Store row, auto-provisioning one on first sign-in. Role is still
never trusted from the auth layer — `commanders.role`/`is_active` are re-read from Data Store on
every request, exactly the same anti-staleness principle as the old JWT-claim design, just with a
different identity source.

_Files:_ `artifacts/api-server/src/lib/auth.ts`, `artifacts/api-server/src/routes/auth.ts`, `artifacts/edc/src/pages/login.tsx`

## 3. Job Scheduling

The periodic snapshot job and webhook retries moved off in-process `setInterval`/`setTimeout`
chains (which AppSail never reliably fires) onto Catalyst Job Scheduling: a cron-triggered job is
an ordinary HTTP request, so `POST /api/v1/jobs/:jobName` (gated by the `EDC_JOB_SECRET` shared
secret, mounted above `requireAuth`) just works. Webhook retry is now durable: a failed delivery
writes its own `next_attempt_at` on the `v2_webhook_delivery_log` row — the row IS the queue — and
a `*/10` cron drains it.

_Files:_ `artifacts/api-server/src/routes/jobs.ts`, `artifacts/api-server/src/lib/subscribers/webhook-dispatcher.ts`, `artifacts/api-server/src/lib/subscribers/snapshot-service.ts`

## 4. Stratus offload

Snapshot payloads over 9,800 characters offload to a Stratus bucket (`edc-deal-snapshots`,
Authenticated) instead of failing the write; hydration lives inside the repository's read methods,
not a helper callers must remember. Threshold-triggered only — inline storage is the default path.

_Files:_ `lib/db/src/catalyst/stratus.ts`, `lib/db/src/catalyst/repositories/intel-core.ts`

## 5. Test suite

All 30 previously "Data Store isn't reachable from localhost"-skipped test files were converted to
run against a new in-memory Data Store fake (`artifacts/api-server/src/test-support/catalyst-test-app.ts`).
**0 skipped, 1,356 tests passing** (engine 232, frontend 618, api-server 506) — no database
required to run the suite at all.

_Files:_ `artifacts/api-server/src/test-support/catalyst-test-app.ts`

## Bugs found and fixed along the way

- **Pipeline transitions were missing for every pre-migration deal** — the Flow tab's value bridge
  read effectively $0 because `v2_pipeline_transitions` held a single row for twelve deals.
  `POST /admin/backfill-transitions` reconstructs them from the audit log and stage history.
- **`routes/intelligence.ts` had been silently 500ing** since an earlier migration slice missed it
  — the deal Intelligence panel, dashboard summary, Portfolio Overview, product-mix, and
  Closed-Lost Autopsy were all affected.
- **`v2_deal_memory.key_lessons` never existed in Data Store** — every autopsy save 500'd until it
  was added; all 71 tables were then diffed column-by-column against the old Drizzle schema to
  confirm it was the only omission.
- **The Data Store concurrency limiter was re-issuing whole-table reads ~25x per deal**, causing
  429s that presented as a *fast* 500 on the deal list and dashboard — fixed with per-request
  memoization plus a process-wide limiter.

## Invariants & migrations

- No schema-migration mechanism exists anymore — schema changes are made directly against Data
  Store (Catalyst Console or the Catalyst MCP tools). `docs/CATALYST_SCHEMA.md` is the durable
  reference, not a repo file.
- Seeding and transition backfill are both admin-only HTTP endpoints
  (`POST /api/v1/admin/seed?phase=...`, `POST /api/v1/admin/backfill-transitions`), not CLI
  scripts — both need a real request to derive a Catalyst app handle from.
- Verified: clean typecheck; 1,356 tests passing, 0 skipped; RBAC verified live as both admin and
  reader on the deployed app; a full click-through of every page and every deal-detail tab against
  real Data Store data.
