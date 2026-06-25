# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

Enterprise Deal Commander (EDC) — a single-user "Deal Commander" cockpit for enterprise software deals. It tracks deal economics, technical validation gates, blockers, and cross-sell whitespace, then runs a 12-pattern intelligence engine to surface risk alerts, governance health, and an Executive Briefing Mode.

This is a **pnpm workspace monorepo** (Node 24, PostgreSQL 16). Use `pnpm` only — `preinstall` rejects npm/yarn.

## Commands

Run from the repo root unless noted:

- `pnpm --filter @workspace/api-server run dev` — build + run the API server (port 5000). Re-run after route/schema edits.
- `pnpm --filter @workspace/edc run dev` — run the frontend (Vite).
- `pnpm run typecheck` — typecheck all packages (`typecheck:libs` via `tsc --build`, then per-artifact `tsc --noEmit`). Run this before claiming work compiles.
- `pnpm run build` — typecheck + recursive build.
- `pnpm --filter @workspace/api-spec run codegen` — regenerate Zod schemas + React Query hooks from `lib/api-spec/openapi.yaml` (Orval). Run after any API contract change.
- `pnpm --filter @workspace/db run push` — push Drizzle schema to the DB (dev only; can hit an interactive TTY prompt — for additive nullable columns apply via direct SQL). **Never** use `push-force` (truncate risk).
- `pnpm --filter @workspace/api-server run seed` — seed the database.

Tests use **Vitest**. Run a package's suite with `pnpm --filter <pkg> run test`; a single file with `pnpm --filter @workspace/api-server exec vitest run src/lib/cache.test.ts`; one test with `... -t "name"`. Test files live next to source as `*.test.ts`.

Required env: `DATABASE_URL` (Postgres), `SESSION_SECRET` (JWT signing).

## Architecture

Packages (`pnpm-workspace.yaml`: `artifacts/*`, `lib/*`, `scripts`) wire together as a **contract-first, isomorphic-engine** system:

- **`lib/engine`** (`@workspace/engine`) — the pure, isomorphic intelligence engine (12 risk patterns + momentum). Performs **no DB/network calls**; all inputs (thresholds, fx rate, catalog size, dispositions, momentum context) are passed as arguments. This is deliberate: the *identical* logic runs server-side and in the browser Risk Simulator / historical Briefing replay, so risk results never diverge. Exported directly from `src/index.ts` (no build step).
- **`lib/api-spec`** (`@workspace/api-spec`) — `openapi.yaml` is the source-of-truth API contract. Orval generates from it. **Do not change `info.title`** — it drives codegen filenames.
- **`lib/api-zod`** + **`lib/api-client-react`** — *generated* output (Zod validators used by the server; typed React Query hooks used by the client). Don't hand-edit `src/generated/**`; change the spec and re-run codegen.
- **`lib/db`** (`@workspace/db`) — Drizzle schema + client. Schema in `src/schema/{auth,deals,edc_v2,lookups}.ts`. `edc_v2` holds the Phase 2 durable-history backbone.
- **`artifacts/api-server`** (`@workspace/api-server`) — Express 5 API. Routes in `src/routes/*.ts` (+ `routes/v2`); `src/lib/intelligence.ts` assembles engine input from the DB. Phase 2 adds an **event bus** (`src/lib/events.ts`) with subscribers (`src/lib/subscribers/*`) for durable history, cache invalidation, activity logging, and health tracking. Bundled with **esbuild** to a single CJS file in `dist/` — workspace deps are inlined, so the dev script always rebuilds before start.
- **`artifacts/edc`** (`@workspace/edc`) — React 19 + Vite + Tailwind v4 + shadcn/ui frontend. Pages in `src/pages/*`, cockpit features in `src/components/cockpit/*`, generated UI primitives in `src/components/ui/*`. Routing via `wouter`, data via `@tanstack/react-query`.
- **`artifacts/mockup-sandbox`** — isolated UI mockup playground (not part of the product).

Data flow: client (generated hooks) → `/api/v1` & `/api/v2` Express routes → `intelligence.ts` builds engine input from Drizzle → `@workspace/engine` computes risk → response validated against generated Zod.

### Key behaviors to preserve

- **Auth** is cookie-session: HS256 JWT signed with `SESSION_SECRET` + bcrypt password hash. The login field is `email` but maps to `commanders.username`.
- **Stage advancement is gated server-side**: advancing past an active RED risk pattern returns `409 STAGE_GUARDRAIL` unless an `override_reason` is supplied (persisted to `deal_stage_overrides` + audited).
- **Audit log** carries `entity_id` (e.g. gate code) so point-in-time snapshots reconstruct historical gate state. Snapshots reconstruct **gates only** — economics/stage stay current.
- Express **route ordering**: literal paths (`/gates/batch`) must be registered before param paths (`/gates/:gateCode`).
- The deal update handler is registered on both PUT and PATCH; the generated client uses PUT.

## Supply-chain policy

`pnpm-workspace.yaml` enforces `minimumReleaseAge: 1440` (packages must be ≥1 day old before install). **Do not disable or lower this.** Add to `minimumReleaseAgeExclude` only for impeccably-trusted publishers, and remove once the window passes.

## Further context

- `.agents/memory/MEMORY.md` — index of hard-won gotchas (esbuild build/run, post-merge schema sync, cache generation guard, briefing export/privacy, snapshot payload). **Read the relevant memory file before touching those areas.**
- The two `Enterprise Deal Commander … PRD` markdown files (repo parent dir) and `attached_assets/` are the Phase 1 / Phase 2 product requirements.
