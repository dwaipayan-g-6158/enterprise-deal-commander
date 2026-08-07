# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

Enterprise Deal Commander (EDC) — a "Deal Commander" cockpit for enterprise software deals. It tracks deal economics, technical validation gates, blockers, and cross-sell whitespace, then runs a 12-pattern intelligence engine to surface risk alerts, governance health, and an Executive Briefing Mode. RBAC (admin + read-only reader) lets a team see the whole pipeline; there is still no per-deal ownership or data scoping — the split is verb-level only.

This is a **pnpm workspace monorepo** (Node 24). Use `pnpm` only — `preinstall` rejects npm/yarn.

**The datastore is Zoho Catalyst Data Store, not Postgres.** The app is deployed as a Catalyst
AppSail app; there is no Drizzle and no `DATABASE_URL` anywhere in the tree. See
`docs/CATALYST_SCHEMA.md` and `docs/catalyst-datastore-constraints.md` before touching the data
layer — the Row API has no WHERE clause, and several of its behaviours (second-granularity
datetimes, plain-object rejections, a hard concurrency limit) will surprise you.

## Commands

Run from the repo root unless noted:

- `pnpm --filter @workspace/api-server run dev` — build + run the API server (port 5000). Re-run after route/schema edits.
- `pnpm --filter @workspace/edc run dev` — run the frontend (Vite).
- `pnpm run typecheck` — typecheck all packages (`typecheck:libs` via `tsc --build`, then per-artifact `tsc --noEmit`). Run this before claiming work compiles.
- `pnpm run build` — typecheck + recursive build.
- `pnpm --filter @workspace/api-spec run codegen` — regenerate Zod schemas + React Query hooks from `lib/api-spec/openapi.yaml` (Orval). Run after any API contract change.
- `pnpm --filter @workspace/scripts run build-appsail` — build the deployable AppSail bundle. **Run from PowerShell, not Git-Bash.** Deploy the resulting zip via the Catalyst **Console** (the app → Overview → Create Deployment) — never `catalyst deploy appsail`, and never the AppSail list's "Deploy from Console" button (that one is first-time-creation only).

Schema changes are made against the Data Store (Console or the Catalyst MCP tools), not by a
migration tool. Seeding is `POST /admin/seed` against the deployed app, and reconstructing
pipeline-transition history is `POST /admin/backfill-transitions` — both need a real request to
derive a `catalystApp` from, which is why neither is a CLI script.

Tests use **Vitest**. Run a package's suite with `pnpm --filter <pkg> run test`; a single file with `pnpm --filter @workspace/api-server exec vitest run src/lib/cache.test.ts`; one test with `... -t "name"`. Test files live next to source as `*.test.ts`. The whole suite runs with **no database** — everything is exercised against the in-memory Data Store fake in `artifacts/api-server/src/test-support/catalyst-test-app.ts`.

Required env: `SESSION_SECRET` (JWT signing). On the deployed app, `EDC_JOB_SECRET` additionally gates the scheduled-job routes.

## Architecture

Packages (`pnpm-workspace.yaml`: `artifacts/*`, `lib/*`, `scripts`) wire together as a **contract-first, isomorphic-engine** system:

- **`lib/engine`** (`@workspace/engine`) — the pure, isomorphic intelligence engine (12 risk patterns + momentum). Performs **no DB/network calls**; all inputs (thresholds, fx rate, catalog size, dispositions, momentum context) are passed as arguments. This is deliberate: the *identical* logic runs server-side and in the browser Risk Simulator / historical Briefing replay, so risk results never diverge. Exported directly from `src/index.ts` (no build step).
- **`lib/api-spec`** (`@workspace/api-spec`) — `openapi.yaml` is the source-of-truth API contract. Orval generates from it. **Do not change `info.title`** — it drives codegen filenames.
- **`lib/api-zod`** + **`lib/api-client-react`** — *generated* output (Zod validators used by the server; typed React Query hooks used by the client). Don't hand-edit `src/generated/**`; change the spec and re-run codegen.
- **`lib/db`** (`@workspace/db`) — the Catalyst Data Store access layer, and nothing else. `src/catalyst/sdk.ts` holds SDK init, the per-request read cache and the concurrency limiter; `src/catalyst/repositories/*.ts` are the per-table repositories every route uses; `src/catalyst/stratus.ts` is the object-storage overflow tier for oversized snapshot payloads. There is no ORM: the Row API has no WHERE clause, so a repository reads its whole table and filters in memory. Uniqueness is enforced by synthesized `natural_key` columns — see `docs/CATALYST_SCHEMA.md`.
- **`artifacts/api-server`** (`@workspace/api-server`) — Express 5 API. Routes in `src/routes/*.ts` (+ `routes/v2`); `src/lib/intelligence.ts` assembles engine input from the DB. Phase 2 adds an **event bus** (`src/lib/events.ts`) with subscribers (`src/lib/subscribers/*`) for durable history, cache invalidation, activity logging, and health tracking. Bundled with **esbuild** to a single CJS file in `dist/` — workspace deps are inlined, so the dev script always rebuilds before start.
- **`artifacts/edc`** (`@workspace/edc`) — React 19 + Vite + Tailwind v4 + shadcn/ui frontend. Pages in `src/pages/*`, cockpit features in `src/components/cockpit/*`, generated UI primitives in `src/components/ui/*`. Routing via `wouter`, data via `@tanstack/react-query`.
- **`artifacts/mockup-sandbox`** — isolated UI mockup playground (not part of the product).

Data flow: client (generated hooks) → `/api/v1` & `/api/v2` Express routes → `lib/catalyst/intelligence.ts` builds engine input from the Data Store repositories → `@workspace/engine` computes risk → response validated against generated Zod.

### Key behaviors to preserve

- **Auth** is cookie-session: HS256 JWT signed with `SESSION_SECRET` + bcrypt password hash. The login field is `email` but maps to `commanders.username` (case-insensitively). The JWT proves identity only — `commanders.role`/`is_active` are re-read from the DB on every request (`requireAuth`), never trusted from the token, so a demotion/deactivation takes effect on the very next request instead of waiting out the 7-day cookie.
- **RBAC** is a single centralized deny-by-default gate: `requireWriteRole` (`artifacts/api-server/src/lib/rbac.ts`), mounted once in `routes/index.ts` right after `requireAuth`. Admins pass every method; readers pass only GET/HEAD/OPTIONS or an exact hit on the small `READER_WRITE_METHOD_ALLOWLIST`. Do not add per-router auth/role checks — the whole point is one gate, not one per file. `routes/index.rbac.test.ts` exhaustively walks every registered route and will fail if a new mutation route is accidentally left open to readers.
- **Stage advancement is gated server-side**: advancing past an active RED risk pattern returns `409 STAGE_GUARDRAIL` unless an `override_reason` is supplied (persisted to `deal_stage_overrides` + audited). Which RED alerts block is decided solely by `isBlockingRedAlert` (`lib/intelligence.ts`): a disposition of `accept` — which carries its own mandatory rationale — clears the guardrail, while `acknowledge`/`snooze` and undispositioned alerts do not. Contextual V2 alerts (e.g. a hostile decision-maker) count alongside `governance.alerts` and `managedAlerts`.
- **Audit log** carries `entity_id` (e.g. gate code) so point-in-time snapshots reconstruct historical gate state. Snapshots reconstruct **gates only** — economics/stage stay current.
- Express **route ordering**: literal paths (`/gates/batch`) must be registered before param paths (`/gates/:gateCode`).
- The deal update handler is registered on both PUT and PATCH; the generated client uses PUT.

## Supply-chain policy

`pnpm-workspace.yaml` enforces `minimumReleaseAge: 1440` (packages must be ≥1 day old before install). **Do not disable or lower this.** Add to `minimumReleaseAgeExclude` only for impeccably-trusted publishers, and remove once the window passes.

## Further context

- `.agents/memory/MEMORY.md` — index of hard-won gotchas (esbuild build/run, post-merge schema sync, cache generation guard, briefing export/privacy, snapshot payload). **Read the relevant memory file before touching those areas.**
- The two `Enterprise Deal Commander … PRD` markdown files (repo parent dir) and `attached_assets/` are the Phase 1 / Phase 2 product requirements.
