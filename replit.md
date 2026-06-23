# Enterprise Deal Commander (EDC)

A single-user "Deal Commander" cockpit for enterprise software deals: it tracks deal economics, technical validation gates, blockers, and cross-sell whitespace, then runs a 12-pattern intelligence engine to surface risk alerts, governance health, and an Executive Briefing Mode.

## Run & Operate

- `pnpm --filter @workspace/api-server run dev` — run the API server (port 5000)
- `pnpm run typecheck` — full typecheck across all packages
- `pnpm run build` — typecheck + build all packages
- `pnpm --filter @workspace/api-spec run codegen` — regenerate API hooks and Zod schemas from the OpenAPI spec
- `pnpm --filter @workspace/db run push` — push DB schema changes (dev only)
- Required env: `DATABASE_URL` — Postgres connection string

## Stack

- pnpm workspaces, Node.js 24, TypeScript 5.9
- API: Express 5
- DB: PostgreSQL + Drizzle ORM
- Validation: Zod (`zod/v4`), `drizzle-zod`
- API codegen: Orval (from OpenAPI spec)
- Build: esbuild (CJS bundle)

## Where things live

- `lib/api-spec/openapi.yaml` — source-of-truth API contract (do not change `info.title`; it drives codegen filenames).
- `lib/db/src/schema/*.ts` — Drizzle schema (deals, gates, audit log, dispositions, interventions, stage overrides, bat signals, lookups).
- `lib/engine/src/index.ts` — pure, isomorphic intelligence engine (12 risk patterns, momentum). No DB/network; runs on server and in the browser Risk Simulator.
- `lib/api-zod` / `lib/api-client-react` — generated Zod schemas and React Query hooks (Orval).
- `artifacts/api-server/src/routes/*.ts` — Express routes; `src/lib/intelligence.ts` assembles engine input from the DB.
- `artifacts/edc/src/pages/*` + `src/components/cockpit/*` — frontend (deal cockpit, portfolio, autopsy, settings, share/briefing).

## Architecture decisions

- Intelligence engine is a standalone pure lib so the identical risk logic runs server-side and in the browser simulator with zero divergence.
- Contract-first: OpenAPI → Orval generates Zod validators (used by the server) and typed React Query hooks (used by the client).
- Auth is cookie-session (HS256 JWT signed with `SESSION_SECRET`, bcrypt password hash); login field is `email` but maps to `commanders.username`.
- Stage advancement is gated server-side: advancing past active RED risk patterns returns 409 `STAGE_GUARDRAIL` unless an `override_reason` is supplied (persisted to `deal_stage_overrides` + audited).
- Audit log carries `entity_id` (e.g. gate code) so point-in-time snapshots can reconstruct historical gate state.

## Product

- Deal cockpit with tabs: Risk/Governance, Technical Gates, Blockers, Cross-Sell, Activity; plus Edit Deal, Bat-Signal share, and Executive Briefing Mode.
- Portfolio roster, loss autopsy, settings (tunable thresholds), and shareable briefing links.

## User preferences

_Populate as you build — explicit user instructions worth remembering across sessions._

## Gotchas

- Express route ordering: literal paths (`/gates/batch`) must be registered before param paths (`/gates/:gateCode`).
- Deal update handler is registered on both PUT and PATCH; the generated client uses PUT.
- `pnpm --filter @workspace/db run push` can hit an interactive TTY prompt; for additive nullable columns, apply via direct SQL.
- Restart the `artifacts/api-server: API Server` workflow after route/schema edits.

## Pointers

- See the `pnpm-workspace` skill for workspace structure, TypeScript setup, and package details
