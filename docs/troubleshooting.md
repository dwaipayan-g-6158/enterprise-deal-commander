# Troubleshooting, FAQ & Error Reference

- [Common problems](#common-problems)
- [Error reference](#error-reference)
- [Logging & debugging](#logging--debugging)
- [FAQ](#faq)
- [Known gotchas (from the engineering memory)](#known-gotchas-from-the-engineering-memory)

## Common problems

### `Use pnpm instead` on install
You ran `npm install` or `yarn`. This project is pnpm-only (enforced by the `preinstall` hook).
Install pnpm (`corepack enable && corepack prepare pnpm@latest --activate`) and run `pnpm install`.

### API server changes aren't taking effect
The API server bundles workspace dependencies with esbuild at build time, so a running process
does **not** pick up edits to routes, the engine, or the schema. **Re-run the dev script:**
```bash
pnpm --filter @workspace/api-server run dev
```

### Frontend can't reach the API / 401 everywhere
- Confirm the API server is up on port 5000 (`curl http://localhost:5000/api/healthz`).
- The dev server proxies `/api` to `API_PROXY_TARGET` (default `http://localhost:5000`) — check
  `artifacts/edc/.env`.
- There's no bearer token or cookie you attach yourself; sign-in is Catalyst embedded auth (see
  [security.md](./security.md)). Confirm you're actually signed in through the login widget.

### Can't log in
Login is Catalyst embedded auth (see [security.md](./security.md)) — if the sign-in widget
doesn't load or hangs, check the browser console for service-worker interference (a Workbox
`navigateFallback` can eat the auth iframe's navigation) and verify `EDC_JOB_SECRET`/Catalyst
project config aren't blocking the request. There's no local password store to inspect.

### Data Store reads intermittently 429 or a fast 500
The Row API's concurrency limiter (`lib/db/src/catalyst/sdk.ts`) can reject a burst of whole-table
reads issued within the same request — a 429 that presents as a *fast* 500 to the caller. New code
must reuse the existing per-request memoized repository/`fetchAllRows` calls rather than re-fetching
the same table multiple times per request; see [catalyst-datastore-constraints.md](./catalyst-datastore-constraints.md).

### Scheduled-job routes (`POST /api/v1/jobs/:jobName`) return 503
This is by design, not a bug: these routes are mounted above `requireAuth` (a cron carries no
Catalyst session) and instead check `EDC_JOB_SECRET` in constant time. If the secret is unset or
empty, every job route refuses with `503` rather than running unauthenticated — set
`EDC_JOB_SECRET` and send it as the `X-EDC-Job-Secret` header.

### Missing FX rate / TCV looks wrong
If a deal's currency differs from the reporting currency and no FX rate exists, the engine shows
the **native** value and attaches a `MISSING_FX_RATE` data-quality note. Add the rate via
`PUT /api/v1/lookups/fx-rates`.

### Build fails on macOS / non-linux-x64
Native binaries for platforms other than linux-x64 (and win32-x64) are stripped in
`pnpm-workspace.yaml` `overrides`. Re-enable the relevant `@esbuild/*`, `rollup`, `lightningcss`,
and `@tailwindcss/oxide` packages for your platform, or build inside a linux-x64 container.

### Flow analytics look empty for old deals
`pipeline_transitions` are recorded going forward by an event subscriber. Backfill history for
pre-existing deals with `POST /api/v1/admin/backfill-transitions` (admin-only; not a CLI script —
it needs a real request to derive a Catalyst app handle from, same as `/admin/seed`). It's
idempotent, so it's safe to call more than once.

## Error reference

| Status | Code | Cause | Fix |
|---|---|---|---|
| `409` | `STAGE_GUARDRAIL` | Advancing a deal's stage past an active RED risk pattern. | Resolve the risk, or resend the stage change with an `override_reason` (it's recorded to `deal_stage_overrides` + audited). |
| `401` | — | No/invalid Catalyst-authenticated session. | Sign in again via the login widget. |
| `404` | — | Unknown route or resource id. | Check the path and id; remember all routes are under `/api`. |
| `400` | — | Request failed Zod validation. | Match the request body to the OpenAPI schema. |
| `500` | — | Unhandled server error. | Check server logs (pino). |

## Logging & debugging

- **Server logs** use [pino](https://getpino.io) via `pino-http` — structured JSON, one line per
  request/event. Pipe through `pino-pretty` for readable local output.
- **Subscriber errors are swallowed** by `emitDealEvent` so they can't break requests — check the
  logs for subscriber failures; they won't surface as HTTP errors.
- **Frontend:** React Query has `retry: false`, so failed requests surface immediately in the
  browser console/network tab rather than silently retrying.
- **Engine parity:** because the engine is pure, you can reproduce any risk verdict deterministically
  in a unit test by feeding the same inputs — no DB needed.

## FAQ

**Is EDC multi-user?**
Phase 1 is single-user by design ("one Commander, one authenticated session"). Multi-commander
delegation is a Phase 2 capability.

**Do Account Managers / Technical Leads log in?**
No. They're referenced on deals but are not EDC users. The C-suite is the *audience* for briefings,
not a user either.

**Why are there 15 patterns when `CLAUDE.md` says 12?**
`CLAUDE.md`'s "12-pattern" phrasing predates the current code. The engine defines 15 named
patterns plus the 7-dimension Risk Engine v2. See [risk-engine.md](./risk-engine.md).

**Where's the migration history?**
There is no migration history — schema changes are made directly against Zoho Catalyst Data Store
(Console or MCP tools). See [CATALYST_SCHEMA.md](./CATALYST_SCHEMA.md).

**Can I run everything on one port?**
Yes — build the SPA into the API server (single-origin). See [build-and-deploy.md](./build-and-deploy.md).

**Is there a CLI?**
No end-user CLI — only the developer pnpm/maintenance scripts in
[cli-and-scripts.md](./cli-and-scripts.md).

## Known gotchas (from the engineering memory)

`.agents/memory/MEMORY.md` indexes hard-won notes. Read the relevant one before touching that area:

| Note | Area |
|---|---|
| `api-server-build.md` | esbuild bundling; restart after edits; run one-off scripts via a dist build. |
| `edc-auth-client.md` | Generated hooks (`@workspace/api-zod`/`api-client-react`) and `/api/v1/*` routing are still current; its login-field notes predate Catalyst embedded auth (see [security.md](./security.md)). |
| `edc-server-gotchas.md` | Express route ordering, deal update on PUT+PATCH, the 409 guardrail, audit `entity_id`. |
| `edc-client-engine-recompute.md` | Simulator + historical Briefing re-run the pure engine; audit caps at 200 rows; snapshots reconstruct gates only. |
| `edc-post-merge-schema-sync.md` | Historical, pre-Catalyst-migration — described a Drizzle/direct-SQL post-merge push gotcha; no such push mechanism exists anymore (see the FAQ above). |
| `edc-phase2-backbone.md` | Event bus + `edc_v2` history + `/api/v2` reads; cache invalidation; generation guard. |
| `briefing-export-privacy.md` | Two export paths; presenter-private content must be outside the content ref **and** print-hidden. |
| `edc-snapshot-payload.md` | Snapshot payload shape; the UI must whitelist fields (deal includes speaker notes). |
| `edc-cache-generation-guard.md` | The cache `wrap()` guard only protects already-tracked keys. |
