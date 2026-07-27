-- Partial index for the active-deal predicate (2026-07-27)
--
-- GET /deals?state=active|all is the hot path shared by the deal-switcher
-- strip, the roster default view, and every dashboard tile — all filtering
-- on deleted_at IS NULL (and, for state=active, archived_at IS NULL too).
-- The Phase 1 PRD specified this index but it was never created. Mirrors no
-- Drizzle schema change — this is a pure index, not a column.
--
-- Safe to re-run (idempotent): CREATE INDEX IF NOT EXISTS.
--
--   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f lib/db/sql/2026-07-27-deals-active-index.sql

BEGIN;
CREATE INDEX IF NOT EXISTS idx_deals_active
  ON public.enterprise_deals (deleted_at, archived_at);
COMMIT;
