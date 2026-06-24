---
name: EDC post-merge schema sync & drizzle push quirk
description: Why task-agent schema changes don't reach the main DB on merge, and why the post-merge drizzle push must stay non-fatal and never use --force.
---

# Post-merge schema sync (EDC)

## Task agents apply schema via direct SQL — it does NOT reach the main DB on merge
By project convention, task agents create new tables via direct SQL in their
*own isolated* DB, not via a migration the platform replays. When their code
merges, the schema TS and app code arrive in main, but the table does **not**
exist in the main DB. The post-merge `drizzle-kit push` can't reliably create it
(see phantom-diff below), so the running server then errors at runtime
(e.g. `relation "edc_v2.portfolio_rollups" does not exist`).

**How to apply:** After merging any task that adds tables/columns, verify the
object exists in the main DB (`SELECT tablename FROM pg_tables WHERE schemaname=...`)
and, if missing, create it via direct SQL matching `lib/db/src/schema/*`. A green
typecheck does NOT prove the DB is in sync.

## drizzle-kit push phantom-diff on `deals_account_deal_unique`
`pnpm --filter @workspace/db run push` always re-proposes adding the
`deals_account_deal_unique` unique constraint even though the constraint already
exists and the data is unique (0 dup account+deal pairs). That triggers an
interactive "truncate enterprise_deals?" prompt; with stdin closed in post-merge
it EOFs and the command aborts.

**Why it matters / How to apply:**
- The post-merge script runs `... run push || echo ...` so this spurious abort is
  **non-fatal**. Keep it that way.
- **Never** switch post-merge to `push --force`: --force auto-confirms the
  truncate prompt and can wipe the 4 existing deals. Real schema changes go in via
  direct SQL, not force-push.
- Post-merge timeout is set to 180000ms because `pnpm install` can hit transient
  package-firewall 502 retries (~1min each) that blow a short timeout even though
  the install ultimately succeeds.
