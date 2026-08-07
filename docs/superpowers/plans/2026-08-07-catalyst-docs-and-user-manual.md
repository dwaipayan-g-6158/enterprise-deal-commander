# Catalyst Docs Sync, Changelog, User Manual & Push — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Bring every "living" reference doc up to date with the completed Zoho Catalyst migration, record the migration in the changelog, ship one consolidated user manual with real screenshots, and push everything to `origin/main`.

**Architecture:** Documentation-only change set, executed as 8 self-contained tasks across 4 phases (doc-accuracy sweep → changelog/migration record → user manual → verification/push), each landing as its own commit on `main`.

**Tech Stack:** Markdown docs, Mermaid diagrams, git. Screenshot capture uses a browser-automation tool (chrome-devtools MCP or Playwright MCP) driving the locally-running app.

## Global Constraints

- **No code changes.** Every task in this plan touches only `.md`/`.env.example` files and `docs/assets/*.png`. If a task tempts you to "just fix" a code comment or dependency, don't — flag it in the task's commit message body instead and move on.
- **Do not edit historical/point-in-time docs**: `docs/superpowers/plans/*`, `docs/superpowers/specs/*`, `docs/changes/*` (existing entries — only the new one is added), `docs/product/*` (original PRDs), or any already-versioned section of `CHANGELOG.md` (only the `[Unreleased]` section is edited).
- **Ground truth for every fact in this plan is source-verified**, not inferred from other docs — see "Ground Truth Reference" below. Where a task's instructions cite a fact from that section, use it verbatim; don't re-derive it differently.
- **Commit directly to `main`** after each task (matches this repo's actual history — no feature branches for doc work). Push once, in Task 8, after everything is committed and verified.
- **`docs/quickstart.md` is NOT fixed in Task 2.** It's fully superseded and stubbed in Task 6 — fixing its stale Postgres lines first would be wasted work that gets overwritten. Skip it until Task 6.

## Ground Truth Reference

These facts were verified directly against source during planning (not copied from another doc) and are the single source of truth for every task below.

**Datastore:** Zoho Catalyst Data Store. No `DATABASE_URL`, no Drizzle, no SQL migrations anywhere in the tree. `lib/db/src/catalyst/sdk.ts` holds SDK init + per-request read cache + concurrency limiter; `lib/db/src/catalyst/repositories/*.ts` are the per-table repositories every route uses; `lib/db/src/catalyst/stratus.ts` is the Stratus object-storage overflow tier for oversized snapshot payloads. Schema changes are made directly against the Data Store (Catalyst Console or Catalyst MCP tools) — there is no schema file in the repo to edit. Full 71-table manifest: `docs/CATALYST_SCHEMA.md`. Row API constraints (no WHERE clause, second-granularity datetimes, etc.): `docs/catalyst-datastore-constraints.md`. Catalyst project: **EDC**, id `31210000000639013`, org `60066539659`, India DC, single Development environment (this *is* production for this app). AppSail app `edc`, deployed at `https://edc-50044704196.development.catalystappsail.in`.

**Auth (verified from `artifacts/api-server/src/lib/auth.ts` and `src/routes/auth.ts`):** Login/logout are **not server routes at all**. Catalyst embedded auth's Web SDK widget (`artifacts/edc/src/pages/login.tsx`) talks directly to Zoho's identity servers to establish and end a session — there is no password to check and no cookie for this server to issue. `bcryptjs` and `jsonwebtoken` are retired from the login flow (`jsonwebtoken` is gone from `package.json` entirely; `bcryptjs` is still listed as a dependency but is dead — unused by any source file — a leftover worth flagging, not fixing, in this docs-only plan). `requireAuth` (the one centralized 401 gate, registered once path-less in `routes/index.ts`) calls `getCurrentCatalystUser(req)` to read the Catalyst-authenticated identity off the request, then `resolveCommander()` maps it to (or auto-provisions) a row in the `commanders` Data Store table. **Role is still never trusted from the auth layer** — same principle as before the migration, just a different identity source: `commanders.role`/`is_active` are re-read from Data Store on every request, so a demotion/deactivation takes effect on the very next request. Auto-provisioning rule: first-ever commander → admin; email matches `SUPER_ADMIN_EMAIL` → admin; Catalyst's own platform-admin role → admin; otherwise reader. An outstanding invite (by email) is claimed on first sign-in instead of creating a new row.

**Bat-Signal share links (verified from `artifacts/api-server/src/routes/batsignal.ts`):** **Not a JWT.** `POST /deals/:id/bat-signal` creates an opaque `token` row in the Data Store (`createBatSignalsRepo(...).create({dealId, createdBy, expiresAt})`) with a 48-hour `expiresAt`; the public `GET /share/:token` route looks it up and checks the expiry server-side. There is no cryptographic signature to verify — the token's unguessability plus server-side expiry checking is the whole mechanism.

**Environment variables actually read by `artifacts/api-server/src` (verified by grepping every `process.env.*` reference in that tree — this list is exhaustive, not illustrative):**

| Var | Required? | Used in | Behavior |
|---|---|---|---|
| `EDC_JOB_SECRET` | **Required on the deployed app** (fails closed if unset) | `routes/jobs.ts` | Compared in constant time against the `X-EDC-Job-Secret` header on scheduled-job routes (`POST /api/v1/jobs/:jobName`), mounted above `requireAuth` since a cron has no Catalyst session. Unset/empty → every job route 503s rather than running unauthenticated. |
| `SUPER_ADMIN_EMAIL` | Optional | `lib/auth.ts` | Whichever Catalyst-authenticated email matches this becomes admin on first sign-in, even before a `commanders` row exists. No default — an unset var never grants admin to a guessable address. |
| `APP_ORIGIN` | Optional | `routes/batsignal.ts`, `routes/users.ts` | Full public origin (scheme+host) used to build absolute Bat-Signal share links and invite links. Bat-Signal falls back to a relative `/share/:token` path when unset; invite links fall back to the request's own host. |
| `NODE_ENV` | Optional | `lib/logger.ts` | `"development"` \| `"production"` — logging behavior only. There is no server-issued session cookie anymore for it to mark `Secure`. |
| `LOG_LEVEL` | Optional (default `"info"`) | `lib/logger.ts` | Structured logger level. |
| `PORT` | Optional (default `5000`) | server bootstrap | API server listen port. |
| `SMTP_URL` | Optional | `lib/mail.ts` | Outbound mail transport. Unset → `sendMail` no-ops and logs the intent (`"Mail suppressed (no SMTP_URL configured)"`); in-app notifications and `notification_log` work regardless. |

**`DATABASE_URL` and `SESSION_SECRET` are both dead** — zero references anywhere in `artifacts/api-server/src`. Every doc that lists either as required (including `CLAUDE.md` itself) is wrong and gets fixed in this plan.

**Test suite:** runs with **no database at all** — every test exercises the in-memory Data Store fake in `artifacts/api-server/src/test-support/catalyst-test-app.ts`. No `DATABASE_URL`, no live Catalyst connection, needed to run tests.

---

## Task 1: Root-level ground-truth docs

**Files:**
- Modify: `README.md`
- Modify: `CONTRIBUTING.md`
- Modify: `CLAUDE.md`
- Modify: `artifacts/api-server/.env.example`

**Interfaces:**
- Consumes: the Ground Truth Reference above.
- Produces: nothing later tasks import structurally, but Tasks 2–4 should match this task's env-var framing (no `DATABASE_URL`/`SESSION_SECRET`, `EDC_JOB_SECRET` required-on-deploy) rather than re-deriving it.

- [ ] **Step 1: Rewrite `artifacts/api-server/.env.example` in full**

Replace the entire file content with:

```
# ============================================================================
# Enterprise Deal Commander — API server environment
# ============================================================================
# Copy this file to `.env` in the same directory and fill in real values.
# `.env` is git-ignored and must never be committed.
#
# The datastore is Zoho Catalyst Data Store (hosted) — there is no
# DATABASE_URL or any local database to configure. Local dev and the
# deployed AppSail app talk to the same Catalyst project (see
# docs/CATALYST_SCHEMA.md). Nothing below is required to run the app
# locally; EDC_JOB_SECRET is required only on the deployed app.

# Shared secret gating the scheduled-job routes (POST /api/v1/jobs/:jobName),
# checked in constant time against the X-EDC-Job-Secret header. A cron has no
# Catalyst user session, so these routes carry their own auth instead of
# going through requireAuth. Required on the deployed app — if unset, every
# job route refuses with 503 rather than running unauthenticated.
EDC_JOB_SECRET=change-me-to-a-long-random-string

# Bootstraps the very first admin: whichever Catalyst-authenticated email
# matches this becomes an admin the first time it signs in, even before any
# commanders row exists. Optional — with this unset, the very first person
# ever to sign in becomes admin automatically.
SUPER_ADMIN_EMAIL=

# Node environment: "development" | "production". Affects logging only —
# there is no server-issued session cookie to mark Secure anymore (Catalyst
# embedded auth owns the session).
NODE_ENV=development

# Log level for the server's structured logger (default: "info").
LOG_LEVEL=info

# Port the API server listens on (defaults to 5000 if unset).
PORT=5000

# Full public origin (scheme + host) users hit in their browser — used to
# build absolute links (Bat-Signal share links, user-invite emails). NOT the
# API server's own port: in local dev the frontend runs on :5173 and proxies
# /api to this server on :5000, so the origin to share links from is :5173.
# Bat-Signal falls back to a relative /share/:token path when unset; invite
# links fall back to the request's own host.
#   Local dev:   APP_ORIGIN=http://localhost:5173
#   Production:  APP_ORIGIN=https://edc-50044704196.development.catalystappsail.in
APP_ORIGIN=http://localhost:5173

# SMTP connection string for outbound email (user invites, digest emails).
# Optional — features that send email no-op (logged, not sent) when unset.
SMTP_URL=
```

- [ ] **Step 2: Fix `README.md`**

Apply these changes (locate each by the described content, then replace):

1. The PostgreSQL badge in the badge row near the top of the file — delete it (no replacement badge needed).
2. The architecture Mermaid diagram's datastore node (currently `DB[("PostgreSQL 16<br/>edc + edc_v2 schemas")]`) — replace with: `DB[("Zoho Catalyst<br/>Data Store (71 tables)")]`
3. The tech-stack table's database row (currently describes "PostgreSQL 16 via Drizzle ORM ... `pg`") — replace with a row stating: **Zoho Catalyst Data Store** — hosted, schemaless Row API (no ORM, no SQL); `@workspace/db`'s Catalyst SDK wrapper (`lib/db/src/catalyst/`) is the only access layer.
4. The prerequisites line ("Prerequisites: **Node 24**, **pnpm**, and **PostgreSQL 16**.") — replace with: "Prerequisites: **Node 24** and **pnpm**. No local database to provision — the datastore is Zoho Catalyst Data Store (hosted); local dev talks to the same Catalyst project as the deployed app."
5. The quick-start code block's `# → set DATABASE_URL and SESSION_SECRET` comment — replace with `# → see the file's comments; nothing is required for local dev`.
6. The quick-start code block's `pnpm --filter @workspace/db run push` line — delete it entirely (no schema-push step exists).
7. The repo-tree listing's `db/` line (currently "Drizzle schema + client (@workspace/db)") — replace with: "Catalyst Data Store SDK + repositories (@workspace/db)".
8. The closing note "A migration to **Zoho Catalyst** is a planned future step." — replace with: "The full stack runs on **Zoho Catalyst** (Data Store + AppSail + embedded auth + Job Scheduling) — migrated off Postgres/Drizzle in August 2026. See [`docs/changes/2026-08-07-catalyst-migration.md`](./docs/changes/2026-08-07-catalyst-migration.md)."

- [ ] **Step 3: Fix `CONTRIBUTING.md`**

1. Replace the "Development setup" code block:

```bash
# Prerequisites: Node 24, pnpm, PostgreSQL 16
pnpm install

# API server env
cp artifacts/api-server/.env.example artifacts/api-server/.env   # set DATABASE_URL, SESSION_SECRET

# Schema + seed
pnpm --filter @workspace/db run push
pnpm --filter @workspace/api-server run seed

# Run (two terminals)
pnpm --filter @workspace/api-server run dev     # API on :5000
pnpm --filter @workspace/edc run dev            # Vite frontend
```

with:

```bash
# Prerequisites: Node 24, pnpm (no local database to provision)
pnpm install

# API server env
cp artifacts/api-server/.env.example artifacts/api-server/.env

# Run (two terminals)
pnpm --filter @workspace/api-server run dev     # API on :5000
pnpm --filter @workspace/edc run dev            # Vite frontend
```

2. Replace the "**Database:**" bullet in "Project conventions" (currently: "edit Drizzle schema in `lib/db/src/schema/*.ts`, then apply with `pnpm --filter @workspace/db run push`. Phase 2 durable-history tables live in the `edc_v2` Postgres schema.") with:

   "**Database:** the schema lives in Zoho Catalyst Data Store, not in this repo. Schema changes are made directly against the Data Store (Catalyst Console or the Catalyst MCP tools) — see [`docs/CATALYST_SCHEMA.md`](./docs/CATALYST_SCHEMA.md) for the full 71-table manifest and naming conventions, and [`docs/catalyst-datastore-constraints.md`](./docs/catalyst-datastore-constraints.md) for the Row API's constraints (no `WHERE` clause, second-granularity datetimes, etc.)."

3. Replace the Testing section's line "The engine has isomorphic parity tests ensuring server and browser produce identical risk output. API-server tests that need a database expect a reachable `DATABASE_URL`." with:

   "The engine has isomorphic parity tests ensuring server and browser produce identical risk output. The whole suite runs with **no database** — every test exercises the in-memory Data Store fake in `artifacts/api-server/src/test-support/catalyst-test-app.ts`; no `DATABASE_URL` or live Catalyst connection is needed."

- [ ] **Step 4: Fix `CLAUDE.md`**

1. Replace the "**Auth**" bullet under "Key behaviors to preserve" (currently describes HS256 JWT + bcrypt) with:

   "- **Auth** is Catalyst embedded auth — login/logout are not server routes at all; the Web SDK widget (`artifacts/edc/src/pages/login.tsx`) talks directly to Zoho's identity servers. `requireAuth` (`artifacts/api-server/src/lib/auth.ts`, registered once path-less in `routes/index.ts`) reads the Catalyst-authenticated identity off the request and maps it to a `commanders` Data Store row (`resolveCommander`), auto-provisioning one on first sign-in (admin if it's the first commander ever, the email matches `SUPER_ADMIN_EMAIL`, or Catalyst's own platform-admin role applies; reader otherwise) or claiming a pending invite by email. `commanders.role`/`is_active` are re-read from Data Store on every request — never trusted from Catalyst's own claims about the signed-in user — so a demotion/deactivation takes effect on the very next request rather than waiting out however long the Catalyst session lives."

2. Replace the "Required env" line (currently: "Required env: `SESSION_SECRET` (JWT signing). On the deployed app, `EDC_JOB_SECRET` additionally gates the scheduled-job routes.") with:

   "Required env: `EDC_JOB_SECRET` on the deployed app (gates the scheduled-job routes; fails closed if unset). Everything else (`SUPER_ADMIN_EMAIL`, `APP_ORIGIN`, `SMTP_URL`, `LOG_LEVEL`, `NODE_ENV`, `PORT`) is optional — see `artifacts/api-server/.env.example` for what each one does. There is no `DATABASE_URL` or `SESSION_SECRET` — both are dead, unused by any source file."

- [ ] **Step 5: Commit**

```bash
git add README.md CONTRIBUTING.md CLAUDE.md artifacts/api-server/.env.example
git commit -m "docs: fix root-level Postgres/Drizzle/auth staleness post-Catalyst-migration"
```

---

## Task 2: Setup/dev docs

**Files:**
- Modify: `docs/installation.md`
- Modify: `docs/development.md`
- Modify: `docs/configuration.md`
- Modify: `docs/cli-and-scripts.md`

**Interfaces:**
- Consumes: Ground Truth Reference (env var table, datastore facts).
- Produces: nothing consumed by later tasks structurally, but Task 6's user-manual "Getting started" section should not contradict this task's installation.md content.

- [ ] **Step 1: Fix `docs/installation.md`**

1. Remove the "4. Provision PostgreSQL" entry from the table of contents; renumber subsequent TOC entries down by one.
2. Remove the PostgreSQL row from the requirements table entirely (keep Node/pnpm rows).
3. Replace the "no Docker/compose... you run Postgres and Node processes directly" paragraph with: "There is no Docker/compose setup. The datastore is hosted Zoho Catalyst Data Store — there is nothing to provision locally beyond Node and pnpm; local dev talks to the same Catalyst project as the deployed app."
4. Remove the `drizzle-orm` row from the dependency table (the package no longer exists in the tree).
5. Delete the entire "Provision PostgreSQL" section (the one with `CREATE DATABASE edc;`, the portable-Postgres note, and the `drizzle-kit push` schema-creation claim). Replace it with a short "Catalyst access" section: "Local dev and the deployed app share the same Catalyst project (**EDC**, id `31210000000639013`, org `60066539659`, India DC) — there is no separate local datastore to provision. See [`docs/CATALYST_SCHEMA.md`](./CATALYST_SCHEMA.md) for the schema reference." Renumber the remaining sections.
6. In the `.env` example, remove the `DATABASE_URL=...` line entirely; keep/update the rest to match Task 1's new `.env.example` (`EDC_JOB_SECRET`, `SUPER_ADMIN_EMAIL`, etc.).
7. Remove the "# Push the Drizzle schema into the database (dev)" comment and the `pnpm --filter @workspace/db run push` line.
8. Remove the `drizzle-kit push` interactive-prompt note and the `push-force` truncate-risk warning.
9. If a seeding step exists further in the file referencing a CLI seed script, replace it with: "Seeding is `POST /api/v1/admin/seed?phase=all` against a running instance (admin-only, RBAC-gated) — not a CLI script, because deriving a Catalyst app handle needs a real request. Start the API server, sign in as an admin, then call that endpoint once (e.g. via the browser devtools console or curl with your session cookie)."

- [ ] **Step 2: Fix `docs/development.md`**

1. Replace "See installation.md. In brief: Node 24 + pnpm + PostgreSQL 16, then `pnpm install`, copy the `.env.example` files, push the schema, and seed." with: "See installation.md. In brief: Node 24 + pnpm, then `pnpm install`, copy the `.env.example` files, and run the two dev servers — no schema to push and no local database to provision."
2. Replace "`pnpm --filter @workspace/api-server run test` # needs a reachable `DATABASE_URL`" with: "`pnpm --filter @workspace/api-server run test` — no database needed; the suite runs entirely against the in-memory Data Store fake (`artifacts/api-server/src/test-support/catalyst-test-app.ts`)."
3. Replace the "Working with the database" section (Drizzle schema edit + push instructions) with: "**Working with the datastore.** Schema changes are made directly against Zoho Catalyst Data Store (Console or the Catalyst MCP tools), not by editing files in this repo — see [`docs/CATALYST_SCHEMA.md`](./CATALYST_SCHEMA.md) for the 71-table manifest and [`docs/catalyst-datastore-constraints.md`](./catalyst-datastore-constraints.md) for the Row API's constraints. `lib/db/src/catalyst/repositories/*.ts` holds the per-table repositories every route uses; add a method there when a route needs a new query shape."

- [ ] **Step 3: Fix `docs/configuration.md`**

1. Remove the `DATABASE_URL` row from the env-var table.
2. Add these rows to the env-var table (values from the Ground Truth Reference table above): `EDC_JOB_SECRET` (✅ required on deploy), `SUPER_ADMIN_EMAIL` (optional), `APP_ORIGIN` (optional), `SMTP_URL` (optional), `LOG_LEVEL` (optional, default `info`). Use the exact "Used in" / "Behavior" descriptions from the Ground Truth Reference table for each.
3. Remove the `lib/db/drizzle.config.ts` row from wherever config files are listed.
4. Add a new subsection "Catalyst configuration": "`catalyst.json` (repo root) declares the AppSail app (`{"appsail":[{"source":".","name":"edc"}]}`). The real Catalyst project/org identifiers and the full 71-table Data Store schema manifest live in [`docs/CATALYST_SCHEMA.md`](./CATALYST_SCHEMA.md)."

- [ ] **Step 4: Fix `docs/cli-and-scripts.md`**

1. Remove the `@workspace/db` `push` and `push-force` script rows entirely.
2. Add a row for `@workspace/scripts`: `build-appsail` — "Builds the deployable AppSail bundle. **Run from PowerShell, not Git Bash.** Deploy the resulting zip via the Catalyst Console (app → Overview → Create Deployment) — never `catalyst deploy appsail` (it nests the entry file and 500s), and never the AppSail list's 'Deploy from Console' button (first-time creation only)."
3. Rewrite the "Maintenance scripts" section: remove any `backfill:transitions` CLI/tsx script reference. Replace with: "Seeding (`POST /api/v1/admin/seed?phase=lookups|config|deals|all`) and reconstructing pipeline-transition history (`POST /api/v1/admin/backfill-transitions`) are both HTTP endpoints against a running instance, admin-only via the RBAC gate — not CLI scripts, because deriving a Catalyst app handle needs a real request to come from."

- [ ] **Step 5: Commit**

```bash
git add docs/installation.md docs/development.md docs/configuration.md docs/cli-and-scripts.md
git commit -m "docs: fix setup/dev docs' Postgres/Drizzle staleness post-Catalyst-migration"
```

---

## Task 3: Architecture/data docs

**Files:**
- Modify: `docs/architecture.md`
- Modify: `docs/directory-structure.md`
- Modify: `docs/data-model.md`

**Interfaces:**
- Consumes: Ground Truth Reference (datastore + auth facts).

- [ ] **Step 1: Fix `docs/architecture.md`**

1. In the main component diagram (Mermaid), replace the node `DB["@workspace/db<br/>Drizzle schema + client"]` with `DB["@workspace/db<br/>Catalyst Data Store SDK + repositories"]`.
2. In the package table, replace the `@workspace/db` row's description (Drizzle ORM schema, `pg` pool client, two Postgres schemas) with: "the Catalyst Data Store access layer. `src/catalyst/sdk.ts` holds SDK init, the per-request read cache, and the concurrency limiter; `src/catalyst/repositories/*.ts` are the per-table repositories every route uses; `src/catalyst/stratus.ts` is the object-storage overflow tier for oversized snapshot payloads. No ORM — the Row API has no `WHERE` clause, so a repository reads its whole table and filters in memory."
3. In the sequence diagram (Mermaid), replace "assembles a plain-data input from Drizzle" with "assembles a plain-data input from the Catalyst repositories", and `participant DB as PostgreSQL (Drizzle)` with `participant DB as Zoho Catalyst Data Store`.
4. Replace the auth-flow paragraph (the one describing resolving `commanders.role`/`is_active` from "the DB" in a way that implies a SQL database) with the full auth mechanism from the Ground Truth Reference's "Auth" paragraph above (same text used in Task 1 Step 4.1 for `CLAUDE.md`).
5. Add a new short "Datastore" subsection if the file has no dedicated section on Catalyst at all (per the audit, it currently omits Catalyst entirely despite being the primary architecture doc): summarize that the whole stack is deployed as a single Catalyst AppSail app, the datastore is a hosted, schemaless Row API with no migrations, and auth is Catalyst embedded auth (link to `docs/CATALYST_SCHEMA.md` and `docs/catalyst-datastore-constraints.md`).

- [ ] **Step 2: Fix `docs/directory-structure.md`**

Replace the `db/` (i.e. `lib/db/`) subtree listing — currently showing `schema/`, `drizzle.config.ts`, `drizzle.local.config.ts`, `sql/` — with the real structure: `catalyst/sdk.ts` (SDK init + cache + limiter), `catalyst/repositories/*.ts` (per-table repos), `catalyst/stratus.ts` (Stratus overflow tier). Also fix the quick-reference table's "The database schema" row (currently pointing at `lib/db/src/schema/*.ts`) to instead say: schema changes are made directly against Data Store (Console/MCP tools), not in a repo file — point to `docs/CATALYST_SCHEMA.md` instead.

- [ ] **Step 3: Fix `docs/data-model.md`**

1. Replace the opening framing ("EDC uses **PostgreSQL 16** via **Drizzle ORM**... two Postgres schemas...") with: "EDC uses **Zoho Catalyst Data Store** — a hosted, schemaless Row API, not a SQL database. All 71 tables live in one flat namespace (Phase 2 tables carry a `v2_` prefix instead of a separate schema). See [`docs/CATALYST_SCHEMA.md`](./CATALYST_SCHEMA.md) for the authoritative table-by-table manifest and type mapping, and [`docs/catalyst-datastore-constraints.md`](./catalyst-datastore-constraints.md) for the Row API's real constraints (no `WHERE` clause, no native FK cascade, second-granularity datetimes)."
2. Remove the "no formal migrations directory... applied with `drizzle-kit push`" line — there is no migration mechanism at all now; schema changes go through the Data Store Console/MCP tools directly.
3. Note that ID fields described as `uuid` in this doc's ER diagram are `varchar(36)` in the real Data Store schema (per `docs/CATALYST_SCHEMA.md`) — add a short callout rather than rewriting the whole diagram.
4. Keep the existing correct line about `portfolio_rollups` being unused since 2026-08 — it's already accurate.
5. Remove the "Post-merge schema sync gotcha" section (obsolete — no more `drizzle-kit push` mechanism to sync) and the "Applying schema: `pnpm --filter @workspace/db run push`" line.

- [ ] **Step 4: Commit**

```bash
git add docs/architecture.md docs/directory-structure.md docs/data-model.md
git commit -m "docs: fix architecture/data-model docs' Postgres/Drizzle staleness post-Catalyst-migration"
```

---

## Task 4: Deploy/ops/security docs

**Files:**
- Modify: `docs/build-and-deploy.md`
- Modify: `docs/troubleshooting.md`
- Modify: `docs/security.md`
- Modify: `docs/performance-and-limitations.md`

**Interfaces:**
- Consumes: Ground Truth Reference (auth + Bat-Signal + env-var facts — this task has the largest security-relevant rewrite in the plan).

- [ ] **Step 1: Fix `docs/build-and-deploy.md`**

Replace the "Deployment" section's generic Postgres-based walkthrough ("no Dockerfile or CI-driven deploy... historically hosted on Replit... 1. Provision PostgreSQL 16... 4. Apply the schema...") and the "Planned: Zoho Catalyst" section (which claims "no Catalyst deployment configuration exists in the repo yet") with the real, current deploy flow:

"The app deploys as a single **Zoho Catalyst AppSail** app (`catalyst.json` declares it). To deploy:
1. `pnpm --filter @workspace/scripts run build-appsail` — **run from PowerShell, not Git Bash** (Git Bash mangles `BASE_PATH` via MSYS path conversion, producing a broken build).
2. Deploy the resulting zip via the Catalyst **Console** — the app → Overview → **Create Deployment**. Never `catalyst deploy appsail` (the CLI nests the entry file and 500s), and never the AppSail list's 'Deploy from Console' button (that one is first-time-creation only).
3. Set `EDC_JOB_SECRET` (required) and any optional env vars (see `docs/configuration.md`) in the Console's environment-variables panel before or after the first deploy.

There is still no CI-driven deploy pipeline — deploys are manually triggered from the Console."

- [ ] **Step 2: Fix `docs/troubleshooting.md`**

1. Remove the "`drizzle-kit push` hangs" section (interactive TTY prompt workaround, `push-force` warning) — obsolete, no such command exists.
2. Fix the "Can't log in" entry: remove any reference to inspecting `src/seed.ts` or a DB-backed password check. Replace with: "Login is Catalyst embedded auth (see `docs/security.md`) — if the sign-in widget doesn't load or hangs, check the browser console for service-worker interference (a Workbox `navigateFallback` can eat the auth iframe's navigation) and verify `EDC_JOB_SECRET`/Catalyst project config aren't blocking the request. There's no local password store to inspect."
3. Remove the "Where's the migration history?" FAQ answer's "drizzle-kit push" claim. Replace with: "There is no migration history — schema changes are made directly against Zoho Catalyst Data Store (Console or MCP tools). See `docs/CATALYST_SCHEMA.md`."
4. Add a short new subsection covering Catalyst-specific gotchas from `docs/catalyst-datastore-constraints.md`: the Row API's concurrency limiter (whole-table reads can 429/500 without per-request memoization), and that `EDC_JOB_SECRET`-gated routes 503 loudly rather than silently if unconfigured.

- [ ] **Step 3: Fix `docs/security.md`** (the largest rewrite in this task)

Replace the entire **"Authentication & sessions"** section with:

```markdown
## Authentication & sessions

- **No server-side password storage.** Login/logout are not server routes at all — the Catalyst
  embedded auth Web SDK widget (`artifacts/edc/src/pages/login.tsx`) talks directly to Zoho's
  identity servers to establish and end a session. `bcryptjs`/`jsonwebtoken`-based login is
  retired along with the old `POST /api/v1/auth/login` and `/logout` routes.
- **Enforcement:** `requireAuth` (`artifacts/api-server/src/lib/auth.ts`) is registered **once**,
  centrally, path-less in `routes/index.ts`, and covers everything below it. It reads the
  Catalyst-authenticated identity off the request (`getCurrentCatalystUser`) and maps it to a
  `commanders` Data Store row (`resolveCommander`), auto-provisioning one on first sign-in.
- **Public endpoints (no auth):** `GET /api/healthz` and `GET /api/v1/share/{token}` (Bat-Signal).
- **Role is never trusted from the Catalyst session.** `commanders.role`/`is_active` are re-read
  from Data Store on every request, so demoting or deactivating an account takes effect on that
  account's *next* request — not after however long the Catalyst session itself lives.
- **Auto-provisioning:** the first commander ever, or an email matching `SUPER_ADMIN_EMAIL`, or a
  Catalyst platform-admin, becomes an EDC admin automatically on first sign-in; everyone else
  becomes a reader unless an admin's pending invite (matched by email) claims a specific role.
```

Replace the **"Bat-Signal share links"** section's "48-hour, signed-JWT" framing with: "The Bat-Signal (F7) is a **48-hour, read-only** public link to a *single deal's risk card* (`GET /api/v1/share/{token}`). The token is an opaque value stored in Data Store with a 48-hour `expiresAt`, checked server-side on lookup — not a self-contained cryptographic signature. Treat the URL itself as the credential: anyone with the link can view that one risk card until it expires."

In the **"Secrets"** section, replace "`DATABASE_URL` contains database credentials — treat it as a secret." with: "`EDC_JOB_SECRET` gates the scheduled-job routes — treat it as a secret; an unset value fails the routes closed rather than exposing them, but a leaked value lets anyone trigger jobs." Also remove the `SESSION_SECRET`-is-required-in-production line if present elsewhere in this section (it's dead — unused by any source file).

- [ ] **Step 4: Fix `docs/performance-and-limitations.md`**

1. Replace "No Docker/compose or committed deploy pipeline. You wire up Postgres and process management yourself (historically Replit)." with: "No CI-driven deploy pipeline — deploys are manually triggered from the Catalyst Console. The app runs as a single AppSail instance; see `docs/build-and-deploy.md`."
2. Replace "DB-dependent tests need a database. The API-server suite expects a reachable `DATABASE_URL`..." with: "No test needs a database. The whole suite runs against the in-memory Data Store fake (`artifacts/api-server/src/test-support/catalyst-test-app.ts`)."
3. Leave the already-correct Catalyst-specific sections (Job Scheduling snapshot note, materialized-view removal note) untouched.

- [ ] **Step 5: Commit**

```bash
git add docs/build-and-deploy.md docs/troubleshooting.md docs/security.md docs/performance-and-limitations.md
git commit -m "docs: fix deploy/ops/security docs' auth and Postgres/Drizzle staleness post-Catalyst-migration"
```

---

## Task 5: Changelog & migration record

**Files:**
- Modify: `CHANGELOG.md`
- Create: `docs/changes/2026-08-07-catalyst-migration.md`
- Modify: `docs/roadmap.md`
- Modify: `docs/release-process.md`

**Interfaces:**
- Consumes: Ground Truth Reference; verified commit range `5c0fd66^..37028d2` (197 files changed, +20,651/−14,768, 2026-08-06 to 2026-08-07); final test count 1,339 (engine 232 + frontend 618 + api-server 489), 0 skipped.
- Produces: `docs/changes/2026-08-07-catalyst-migration.md` — referenced by `docs/release-process.md` (this task) and available for `docs/user-manual.md`'s FAQ section (Task 6) to link if useful.

- [ ] **Step 1: Add a `CHANGELOG.md` `[Unreleased]` entry**

Insert these bullets into the existing `## [Unreleased]` section (add new `### Added` / `### Changed` / `### Removed` groups as needed, alongside the existing Playbook/Roster entries already there — don't remove those):

```markdown
### Added
- **Zoho Catalyst migration.** The full stack now runs on Zoho Catalyst: **Data Store** (hosted,
  schemaless Row API) replaces Postgres/Drizzle entirely; **Catalyst embedded auth** replaces the
  bcrypt/JWT login; the periodic snapshot job and webhook retries run on **Catalyst Job
  Scheduling** instead of in-process timers; oversized snapshot payloads offload to **Stratus**
  object storage. See [`docs/changes/2026-08-07-catalyst-migration.md`](./docs/changes/2026-08-07-catalyst-migration.md).
- `POST /api/v1/admin/seed` and `POST /api/v1/admin/backfill-transitions` (admin-only, RBAC-gated)
  replace the old CLI seed/backfill scripts — both need a real request to derive a Catalyst app
  handle from.

### Changed
- The full test suite (1,339 tests) now runs against an in-memory Data Store fake with **no
  database required at all** — previously it needed a reachable `DATABASE_URL`.

### Removed
- Drizzle, `pg`, and every Postgres schema/migration file. `DATABASE_URL` and `SESSION_SECRET`
  are no longer read anywhere in the server.
- The in-process portfolio-rollup precompute (its write path silently failed against Catalyst on
  every mutation and every cold start; nothing reads the rollup, so it was deleted rather than
  ported).

### Fixed
- **Pipeline transitions were missing for every pre-migration deal**, leaving the Flow tab's value
  bridge reading effectively $0 — `POST /admin/backfill-transitions` reconstructs them from the
  audit log and stage history.
- `routes/intelligence.ts` (the deal Intelligence panel, dashboard summary, Portfolio Overview,
  product-mix, and Closed-Lost Autopsy) had been silently 500ing since an earlier migration slice
  missed it.
```

- [ ] **Step 2: Write `docs/changes/2026-08-07-catalyst-migration.md`**

Create the file with this exact content (matches the established `docs/changes/*.md` format — header block, numbered sections, `_Files:_` footers, closing "Invariants & migrations" section):

```markdown
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

_Files:_ `artifacts/api-server/src/lib/auth.ts`, `src/routes/auth.ts`, `artifacts/edc/src/pages/login.tsx`

## 3. Job Scheduling

The periodic snapshot job and webhook retries moved off in-process `setInterval`/`setTimeout`
chains (which AppSail never reliably fires) onto Catalyst Job Scheduling: a cron-triggered job is
an ordinary HTTP request, so `POST /api/v1/jobs/:jobName` (gated by the `EDC_JOB_SECRET` shared
secret, mounted above `requireAuth`) just works. Webhook retry is now durable: a failed delivery
writes its own `next_attempt_at` on the `v2_webhook_delivery_log` row — the row IS the queue — and
a `*/10` cron drains it.

_Files:_ `artifacts/api-server/src/routes/jobs.ts`, `lib/subscribers/webhook-dispatcher.ts`, `lib/catalyst/snapshot-service.ts`

## 4. Stratus offload

Snapshot payloads over 9,800 characters offload to a Stratus bucket (`edc-deal-snapshots`,
Authenticated) instead of failing the write; hydration lives inside the repository's read methods,
not a helper callers must remember. Threshold-triggered only — inline storage is the default path.

_Files:_ `lib/db/src/catalyst/stratus.ts`, `lib/catalyst/repositories/intel-core.ts`

## 5. Test suite

All 30 previously "Data Store isn't reachable from localhost"-skipped test files were converted to
run against a new in-memory Data Store fake (`artifacts/api-server/src/test-support/catalyst-test-app.ts`).
**0 skipped, 1,339 tests passing** (engine 232, frontend 618, api-server 489) — no database
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
- Verified: clean typecheck; 1,339 tests passing, 0 skipped; RBAC verified live as both admin and
  reader on the deployed app; a full click-through of every page and every deal-detail tab against
  real Data Store data.
```

- [ ] **Step 3: Fix `docs/roadmap.md`**

Replace the "Planned: Zoho Catalyst migration" section (TOC entry + body, currently claiming "no Catalyst configuration exists in the repository yet") with a shipped-status entry:

```markdown
## Zoho Catalyst migration — shipped

The full stack migrated off Postgres/Drizzle onto **Zoho Catalyst** (Data Store + AppSail +
embedded auth + Job Scheduling) in August 2026. See
[`docs/changes/2026-08-07-catalyst-migration.md`](./changes/2026-08-07-catalyst-migration.md) for
the full record, [`build-and-deploy.md`](./build-and-deploy.md) for the current deploy flow, and
[`release-process.md`](./release-process.md) for how it's reflected in the changelog.
```

Update the TOC anchor accordingly (`#zoho-catalyst-migration--shipped` instead of `#planned-zoho-catalyst-migration`).

- [ ] **Step 4: Fix `docs/release-process.md`**

1. Replace the "Schema: Phase 2 tables live in the separate `edc_v2` Postgres schema... Apply with `pnpm --filter @workspace/db run push`." line (in the Phase 1 → Phase 2 migration guide) with: "Schema: Phase 2 tables carry a `v2_` prefix in the same flat Data Store namespace as Phase 1 tables (no separate schema — Data Store has no schema concept). Applied directly against Data Store via Console/MCP tools; see `docs/CATALYST_SCHEMA.md`."
2. Replace the entire "Planned: migration to Zoho Catalyst" section with:

```markdown
### Postgres/Drizzle → Zoho Catalyst (shipped 2026-08-06/07)

The migration described as "planned" here shipped in August 2026 — see
[`docs/changes/2026-08-07-catalyst-migration.md`](../changes/2026-08-07-catalyst-migration.md) for
the full record. No further migration guide is needed: the app has run on Catalyst exclusively
since, and Postgres/Drizzle no longer exist anywhere in the tree.
```

- [ ] **Step 5: Commit**

```bash
git add CHANGELOG.md "docs/changes/2026-08-07-catalyst-migration.md" docs/roadmap.md docs/release-process.md
git commit -m "docs: record the Catalyst migration in the changelog and roadmap"
```

---

## Task 6: Consolidated user manual

**Files:**
- Create: `docs/user-manual.md`
- Modify: `docs/overview.md` (→ stub)
- Modify: `docs/quickstart.md` (→ stub)
- Modify: `docs/usage.md` (→ stub)
- Modify: `docs/README.md` (index update)

**Interfaces:**
- Consumes: current full content of `docs/overview.md`, `docs/quickstart.md`, `docs/usage.md` (read each in full before starting — this task merges their content, it doesn't invent new prose for those sections). Consumes Ground Truth Reference for the new Admin section's login/RBAC facts.
- Produces: the `./assets/<file>.png` image references embedded in `docs/user-manual.md` (exact filenames given in Step 1, points 4–5 below) — Task 7 must produce PNGs at exactly those paths.

- [ ] **Step 1: Write `docs/user-manual.md`**

Structure (in this order), each section's content sourced as described:

1. **Title + intro** — one paragraph: what EDC is, who this manual is for (end users and admins; developers should read `docs/development.md` instead).
2. **"What EDC is"** — copy the feature-catalog / "why it exists" content from `docs/overview.md` verbatim (read the file first; it was audited as already-accurate, no fact changes needed).
3. **"Getting started"** — a *rewritten* (not copied) short getting-started narrative: sign in via the Catalyst embedded-auth widget on `/login` (no separate signup — an admin invites you, or the very first person to ever sign in becomes admin automatically), land on the Dashboard, and a one-line pointer to `docs/installation.md` for anyone setting up a local dev environment instead of just using the app. Do NOT copy `docs/quickstart.md`'s stale `.env`/db-push content — write this fresh using the Ground Truth Reference's auth facts.
4. **"Screen-by-screen guide"** — copy the full screen-by-screen content from `docs/usage.md` verbatim (Navigation map through Common workflows; it was audited as already-accurate). Replace the old bunched placeholder screenshot list at the bottom with a real `![...](./assets/<file>.png)` embed placed contextually inside each corresponding subsection (not bunched at the end), using exactly these filenames — Task 7 will create the actual PNGs at these paths, so get the paths right now: `./assets/dashboard.png` (Dashboard section), `./assets/roster-kanban.png` (Deals list & Roster section), `./assets/deal-cockpit.png` (Deal Cockpit section), `./assets/risk-simulator.png` (Risk governance & the Simulator section), `./assets/briefing-mode.png` (Executive Briefing / War Room section), `./assets/portfolio.png` (Portfolio section), `./assets/autopsy.png` (Autopsy section), `./assets/analytics-flow.png` (Analytics section), `./assets/deal-memory.png` (Deal Memory section). The image will not render until Task 7 runs — that's expected, not a bug to fix now.
5. **New "Admin" section** — write fresh, using the Ground Truth Reference. Include the tenth image embed here: `![Settings / Admin](./assets/settings-admin.png)` (Task 7 creates the file; not a bug that it doesn't render yet).
   - **Settings & configuration**: engine thresholds and dimension/model weights, automation rules, integrations — with an auditable change log (list/get/rollback/export). Link to `docs/configuration.md`.
   - **User management & RBAC**: two roles, `admin` (full access) and `reader` (every read, zero writes, no per-deal scoping). Admins invite users by email (`POST /v1/users`); the invited person claims the pending invite on first Catalyst sign-in. The server independently enforces: you cannot act on your own account (demote/deactivate/delete-self rejected), and the last active admin cannot be demoted/deactivated/deleted. Link to `docs/security.md#authorization-rbac`.
   - **Job Scheduling & maintenance**: seeding and pipeline-transition backfill are admin-only HTTP endpoints, not something a day-to-day admin runs — mention briefly with a pointer to `docs/cli-and-scripts.md`, not full instructions (this is an operator task, not a daily-admin one).
6. **Common workflows** — copy the existing table from `docs/usage.md` verbatim (already covered in step 4's copy, so this may already be included — don't duplicate it; just confirm it made it in).
7. **FAQ / troubleshooting pointer** — one line linking to `docs/troubleshooting.md`.

- [ ] **Step 2: Stub the three superseded docs**

Replace the full content of each with a short pointer (keep the file, don't delete it, so existing links don't break):

`docs/overview.md`:
```markdown
# Overview

This content now lives in the [User Manual](./user-manual.md#what-edc-is).
```

`docs/quickstart.md`:
```markdown
# Quick Start

The "using the app" walkthrough now lives in the [User Manual](./user-manual.md#getting-started).
For setting up a local development environment, see [installation.md](./installation.md) and
[development.md](./development.md) instead.
```

`docs/usage.md`:
```markdown
# Usage Guide

This content now lives in the [User Manual](./user-manual.md#screen-by-screen-guide).
```

- [ ] **Step 3: Update `docs/README.md`'s index**

In the "Getting started" table, add a new first row: `1 | [User Manual](./user-manual.md) | The complete guide for end users and admins — what EDC is, getting started, every screen, and admin tasks`. Renumber the existing Overview/Installation/Quick start/Usage rows down by one, and edit their "What it covers" column to note they're now covered by the User Manual where applicable (Overview and Usage fully; Installation and Quick start partially — installation stays developer-focused).

- [ ] **Step 4: Commit**

```bash
git add docs/user-manual.md docs/overview.md docs/quickstart.md docs/usage.md docs/README.md
git commit -m "docs: consolidate overview/quickstart/usage into one user manual"
```

---

## Task 7: Capture real screenshots

**Files:**
- Create: `docs/assets/dashboard.png`
- Create: `docs/assets/roster-kanban.png`
- Create: `docs/assets/deal-cockpit.png`
- Create: `docs/assets/risk-simulator.png`
- Create: `docs/assets/briefing-mode.png`
- Create: `docs/assets/portfolio.png`
- Create: `docs/assets/autopsy.png`
- Create: `docs/assets/analytics-flow.png`
- Create: `docs/assets/deal-memory.png`
- Create: `docs/assets/settings-admin.png`

**Interfaces:**
- Consumes: the exact `./assets/<file>.png` paths Task 6 already embedded in `docs/user-manual.md` — this task only has to produce files at those paths, not edit any markdown.
- Produces: the 10 PNG files Task 8's verification checks for.

- [ ] **Step 1: Stand up the local stack**

Run (per `CLAUDE.md`'s documented dev commands):
```bash
pnpm --filter @workspace/api-server run dev     # API on :5000
pnpm --filter @workspace/edc run dev            # Vite frontend on :5173
```
Confirm both start cleanly (check for a listening-port log line from each). If either command's actual behavior has drifted from what `CLAUDE.md` describes, stop and report — don't guess at a fix; this plan is documentation-only.

- [ ] **Step 2: Manual login checkpoint (cannot be automated)**

Post-migration, sign-in is Catalyst embedded auth against the real Zoho identity servers — there is no test password to script. Open the app in a browser-automation tool (chrome-devtools MCP or Playwright MCP), navigate to `/login`, and **pause here**: ask the user to complete sign-in interactively in that browser session (their real `@zohocorp.com` Catalyst identity). Do not attempt to script or guess credentials. Once `/api/v1/auth/me` returns `200` with a role, proceed — the same browser session's cookies carry the authenticated session for every subsequent screenshot.

- [ ] **Step 3: Capture each screen**

For each row below, navigate to the route, wait for the page's primary content to render (not just the shell), and take a full-page or primary-content screenshot saved to the given path:

| Route | Screen | Save as |
|---|---|---|
| `/` | Dashboard | `docs/assets/dashboard.png` |
| `/deals` | Roster / Kanban board | `docs/assets/roster-kanban.png` |
| `/deals/:id` (pick any open deal) | Deal Cockpit | `docs/assets/deal-cockpit.png` |
| `/deals/:id` → open the Risk Simulator | Risk Simulator | `docs/assets/risk-simulator.png` |
| Executive Briefing / War Room mode | Briefing mode | `docs/assets/briefing-mode.png` |
| `/portfolio` | Portfolio | `docs/assets/portfolio.png` |
| `/autopsy` | Closed-Lost Autopsy | `docs/assets/autopsy.png` |
| `/analytics` → Flow tab | Analytics (Flow) | `docs/assets/analytics-flow.png` |
| `/memory` | Deal Memory | `docs/assets/deal-memory.png` |
| `/settings` | Settings / Admin | `docs/assets/settings-admin.png` |

If a route requires data that doesn't exist yet (e.g. no deals seeded), run `POST /api/v1/admin/seed?phase=all` once (admin session required — reuse the authenticated browser session) before capturing.

- [ ] **Step 4: Verify the embeds now render**

Open `docs/user-manual.md` (or a Markdown preview) and confirm all 10 images render — Task 6 already placed the `![...](./assets/<file>.png)` embeds contextually in each section; this step is just confirming the paths line up with what got captured, not editing markdown.

- [ ] **Step 5: Commit**

```bash
git add docs/assets/*.png
git commit -m "docs: add real screenshots to the user manual"
```

---

## Task 8: Final verification and push

**Files:** none created/modified — verification only.

**Interfaces:**
- Consumes: everything committed in Tasks 1–7.

- [ ] **Step 1: Grep sweep for remaining staleness**

```bash
grep -rniE "DATABASE_URL|drizzle-kit|drizzle-orm|drizzle\.config" README.md CONTRIBUTING.md CLAUDE.md docs/ --include="*.md" \
  --exclude-dir=superpowers --exclude-dir=product --exclude-dir=changes
```
Expected: no matches outside `docs/CATALYST_SCHEMA.md` (which intentionally references the old schema as a mapping source) and outside the excluded historical directories. If anything else matches, fix it before proceeding.

```bash
grep -rniE "planned.{0,20}(zoho )?catalyst|no catalyst config" README.md docs/ --include="*.md" \
  --exclude-dir=superpowers --exclude-dir=product --exclude-dir=changes
```
Expected: no matches.

- [ ] **Step 2: Link-check the docs index**

Open `docs/README.md` and manually confirm every linked path exists (`ls` each one). Then grep for any other doc referencing `overview.md`, `quickstart.md`, or `usage.md` and confirm those links still resolve (they do — the files still exist, just stubbed).

```bash
grep -rl "overview.md\|quickstart.md\|usage.md" README.md CONTRIBUTING.md docs/ --include="*.md" \
  --exclude-dir=superpowers --exclude-dir=product --exclude-dir=changes
```

- [ ] **Step 3: Confirm screenshots exist and aren't placeholders**

```bash
ls -la docs/assets/*.png
```
Expected: 10 files, each with a non-trivial size (a few KB minimum — a 0-byte or ~100-byte file means the capture failed silently).

- [ ] **Step 4: Full status check**

```bash
git status
git log --oneline -8
```
Expected: clean working tree, and the 6 commits from Tasks 1–7 (Task 8 makes no commits of its own until Step 5) sitting on top of `37028d2`.

- [ ] **Step 5: Push**

```bash
git push origin main
```

- [ ] **Step 6: Confirm the push landed**

```bash
git fetch origin --quiet
git rev-list --left-right --count origin/main...HEAD
```
Expected: `0	0` (local and remote match exactly).
