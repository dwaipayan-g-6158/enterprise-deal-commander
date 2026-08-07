# Design: Catalyst Doc Sync, Changelog, User Manual & Push

**Date:** 2026-08-07
**Status:** Approved (pending final spec review)

## Problem

The Zoho Catalyst migration (Postgres/Drizzle → Catalyst Data Store) shipped across ~25 commits
between 2026-08-06 and 2026-08-07 (merge commit `8e96b05`, closed out by `37028d2`). `git status`
is clean and local `main` already matches `origin/main` — there is nothing pending to push right
now. The actual gap is that the documentation never caught up with the migration:

- **16 "living" reference docs** still describe Postgres/Drizzle as the current stack, or
  describe the Catalyst migration as a "planned future step" (false — it's done). Verified by a
  read-only audit; see the per-file list below.
- `CHANGELOG.md` has no entry at all for the migration.
- There's no `docs/changes/*.md` write-up for it, breaking the established one-doc-per-feature
  pattern used for every other major change.
- Separately, the existing user-facing docs (`overview.md`, `quickstart.md`, `usage.md`) are
  scattered across three files, screenshots are placeholders, and there's no dedicated admin
  section (Settings/config, RBAC role management) — short of what a "user manual" should be.

## Goals

1. Every living doc accurately reflects the Catalyst-based system as it exists today.
2. The migration is recorded in `CHANGELOG.md` and `docs/changes/`, matching existing conventions.
3. A single, polished `docs/user-manual.md` exists for end users + admins, with real screenshots.
4. All of the above is committed (one commit per phase) and pushed to `origin/main`.

## Non-goals

- Rewriting historical/point-in-time docs: `docs/superpowers/plans/*`, `docs/superpowers/specs/*`,
  `docs/changes/*` (existing entries), `docs/product/*` (original PRDs), or already-versioned
  `CHANGELOG.md` sections. These are records of what was true *at the time* — changing them
  falsifies history.
- Restructuring the doc-review/PR process. This repo's actual convention (confirmed via `git log`)
  is direct commits to `main`; that continues.
- Any code changes. This is a documentation-only effort.

## Phase 1 — Documentation accuracy sweep

Source of truth for "what's actually true now": `CLAUDE.md` (root), `docs/CATALYST_SCHEMA.md`,
`docs/catalyst-datastore-constraints.md`. These three are already correct and untouched.

Per-file fixes (from the read-only audit — exact stale lines already identified, to be applied
directly rather than re-discovered):

| File | Fix |
|---|---|
| `README.md` | PostgreSQL badge, architecture diagram, tech-stack table, prerequisites, quick-start env/push steps, repo-tree `db/` description, "planned migration" closing note — all → Catalyst facts. |
| `CONTRIBUTING.md` | Dev-setup prerequisites/env/push steps, "Database:" convention bullet, testing note about needing `DATABASE_URL` (false — in-memory fake, no DB needed). |
| `docs/quickstart.md` | `.env` step and `db run push` step. |
| `docs/installation.md` | Drop "Provision PostgreSQL" section/TOC entry entirely; drop `drizzle-orm` dependency row; replace `.env` example and schema-push steps with the real Catalyst local-run flow (see `[[edc-local-windows-run]]` pattern — portable setup, no external DB to provision). |
| `docs/architecture.md` | Diagrams and package table currently show Drizzle/Postgres and omit Catalyst entirely — add `@workspace/db`'s real role (Catalyst Data Store access layer, SDK init, repositories, Stratus overflow) per `CLAUDE.md`. |
| `docs/directory-structure.md` | `lib/db` tree entries (`schema/`, `drizzle.config.ts`, `sql/`) → real structure (`catalyst/sdk.ts`, `catalyst/repositories/*.ts`, `catalyst/stratus.ts`). |
| `docs/data-model.md` | Wholesale reframe from "Postgres via Drizzle, two schemas" to Catalyst Data Store; drop the `drizzle-kit push` / migrations-directory claims; point to `docs/CATALYST_SCHEMA.md` for the authoritative 71-table schema. Keep the one already-correct line (`portfolio_rollups` unused-since note). |
| `docs/configuration.md` | Env var table: drop `DATABASE_URL`, add `EDC_JOB_SECRET` (gates scheduled-job routes per `CLAUDE.md`); drop the `drizzle.config.ts` row; add `catalyst.json` / AppSail config. |
| `docs/cli-and-scripts.md` | Drop `push` / `push-force` script rows; add `pnpm --filter @workspace/scripts run build-appsail`; correct the "maintenance scripts" section — seeding and backfill are `POST /admin/seed` / `POST /admin/backfill-transitions` HTTP calls against the deployed app, not CLI scripts. |
| `docs/build-and-deploy.md` | Replace the generic Postgres deployment walkthrough and the "Planned: Zoho Catalyst" section with the real flow: `pnpm --filter @workspace/scripts run build-appsail` (PowerShell only) → deploy the zip via Catalyst Console → Overview → Create Deployment. |
| `docs/development.md` | Dev-setup summary, DB-needs-`DATABASE_URL` testing claim, and "Working with the database" section (Drizzle schema edit + push) → Catalyst equivalents (schema changes via Console/MCP tools, no migration-tool step). |
| `docs/troubleshooting.md` | Drop the `drizzle-kit push` hang / `push-force` section and the "no migrations directory" FAQ answer; add Catalyst-relevant troubleshooting (Row API quirks, concurrency limiter, `EDC_JOB_SECRET`-gated routes) per `docs/catalyst-datastore-constraints.md`. |
| `docs/security.md` | Swap the `DATABASE_URL`-is-a-secret line for `EDC_JOB_SECRET`; rest of the file is already stack-agnostic and stays as-is. |
| `docs/performance-and-limitations.md` | Fix the two lines that still claim "no deploy pipeline, you wire up Postgres yourself" and "DB-dependent tests need `DATABASE_URL`" — both contradicted by the rest of the file, which is already correctly Catalyst-flavored in other sections. |
| `docs/release-process.md` | "Schema: ... Postgres schema. Apply with `db run push`" line, and the whole "Planned: migration to Zoho Catalyst" section → rewritten as a completed-migration record (what changed, when, pointer to the new `docs/changes/2026-08-07-catalyst-migration.md`). |
| `docs/roadmap.md` | Same treatment: "Planned: Zoho Catalyst migration" section → shipped-status entry, matching the fixed `build-and-deploy.md`/`release-process.md` sections it currently cross-links to. |
| `artifacts/api-server/.env.example` | Remove `DATABASE_URL`; add `EDC_JOB_SECRET`; align with `CLAUDE.md`'s "Required env" list. |

**Explicitly untouched:** `docs/README.md`, `docs/overview.md`, `docs/usage.md` (no stale stack
claims found in the audit — `docs/README.md`'s index links get updated in Phase 3 instead, and
`overview.md`/`usage.md` are superseded, not stack-fixed, in Phase 3), `docs/CATALYST_SCHEMA.md`,
`docs/catalyst-datastore-constraints.md` (already correct).

## Phase 2 — Changelog & migration record

- **`CHANGELOG.md`**: new `[Unreleased]` bullets (Added/Changed/Removed) covering: Catalyst Data
  Store as the datastore, Catalyst embedded auth replacing JWT-only login, Job Scheduling for the
  periodic snapshot job, the durable webhook retry + Stratus overflow tier, retirement of Drizzle
  and the whole Postgres dependency, and the route-test suite now running against an in-memory
  Data Store fake (no DB required). Style matches the existing entries (bold lead terms, grouped
  by change type).
- **`docs/changes/2026-08-07-catalyst-migration.md`**: new dated write-up following the same
  structure as the existing files in that folder (e.g. `2026-08-06-mobile-design-system.md`) —
  what changed, why, what broke and got fixed along the way (the transitions-backfill
  idempotency bug), and pointers to `docs/CATALYST_SCHEMA.md` / `docs/catalyst-datastore-constraints.md`
  for the durable reference material.
- **`docs/roadmap.md`**'s "Planned: Zoho Catalyst migration" section flip is sequenced here since
  it's the changelog-adjacent status flag (mechanically it's a Phase 1 fix, but lands in the same
  commit as the changelog work since they're describing the same event).

## Phase 3 — Consolidated User Manual

- New **`docs/user-manual.md`**, audience = end users + admins. Structure:
  1. What EDC is (from `overview.md`)
  2. Getting started / first login (from `quickstart.md`, trimmed to just the "using it" parts —
     install/setup steps stay in `installation.md`/`quickstart.md` for the dev audience)
  3. Screen-by-screen guide (from `usage.md`: Dashboard, Roster/Kanban, Deal Cockpit, Risk
     Simulator, Briefing/War Room, Portfolio, Autopsy, Analytics, Deal Memory)
  4. **New Admin section**: Settings/config (thresholds, weights, automation), the audit/change
     log + rollback flow, RBAC role management (admin vs. reader, what each can do)
  5. Common workflows table (from `usage.md`)
  6. FAQ / troubleshooting pointer (link to `docs/troubleshooting.md`)
- `overview.md`, `quickstart.md`, `usage.md` become short stub pages: a sentence of context plus
  "this content now lives in [the User Manual](./user-manual.md)". Files are kept (not deleted)
  so existing links don't break.
- `docs/README.md`'s "Getting started" table gets a new top row pointing at `docs/user-manual.md`
  as the primary entry point; the three superseded rows stay but note they're now covered by it.
- **Screenshots**: stand up the local stack per the established local-run pattern, seed via
  `POST /admin/seed`, log in with the seeded admin account, drive each major screen with a
  browser-automation tool, save real `.png` files to `docs/assets/`, and reference them in the
  manual in place of the current placeholder list.

## Phase 4 — Commit & push

Land each phase as its own commit on `main` (matches this repo's actual history — direct commits,
not long-lived branches for doc work), then `git push origin main`.

## Verification

- Grep sweep over the touched files confirms no remaining `DATABASE_URL` / `drizzle-kit` /
  "planned Zoho Catalyst" stale claims.
- Every internal doc link (`docs/README.md` index, cross-references inside the fixed files)
  resolves to an existing file — no orphaned links after stubbing `overview.md`/`quickstart.md`/`usage.md`.
- `docs/assets/*.png` referenced in the manual actually exist as captured files, not placeholders.
- `git status` clean, `git log origin/main..main` empty after the final push.

## Risks / open considerations

- The screenshot capture depends on successfully standing up the local stack. The portable-Postgres
  local-run setup used before the migration no longer applies; local dev now depends on Catalyst
  tooling instead, so the run steps need a quick currency check immediately before this phase.
- 16-file sweep is mechanical but voluminous; will be executed with the three source-of-truth docs
  pinned as ground truth to avoid introducing *new* inaccuracies while fixing old ones.
