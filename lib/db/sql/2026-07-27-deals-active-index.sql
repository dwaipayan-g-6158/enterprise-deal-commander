-- Partial index for the active-deal predicate (2026-07-27)
--
-- GET /deals?state=active|all is the hot path shared by the deal-switcher
-- strip, the roster default view, and every dashboard tile — all filtering
-- on deleted_at IS NULL (and, for state=active, archived_at IS NULL too).
-- The Phase 1 PRD specified this index but it was never created. Mirrors no
-- Drizzle schema change — this is a pure index, not a column.
--
-- WHERE deleted_at IS NULL makes this a genuine partial index scoped to
-- exactly the rows state=active/state=all ever touch. Without it, this would
-- be a full composite index over a table where almost every row has both
-- columns NULL — near-zero selectivity, and the planner would likely never
-- use it.
--
-- Safe to re-run (idempotent end-to-end): the DROP below means changing this
-- index's definition doesn't require a separate manual step first — CREATE
-- INDEX IF NOT EXISTS alone is NOT enough for that, since it only skips
-- creation when an index of the same name already exists with an IDENTICAL
-- definition; it won't alter one that differs.
--
--   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f lib/db/sql/2026-07-27-deals-active-index.sql

BEGIN;
DROP INDEX IF EXISTS idx_deals_active;
CREATE INDEX IF NOT EXISTS idx_deals_active
  ON public.enterprise_deals (deleted_at, archived_at)
  WHERE deleted_at IS NULL;
COMMIT;
