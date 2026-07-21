-- Human Touch Homepage: last-dashboard-visit cursor (2026-07)
--
-- Adds one nullable column to commanders so the dashboard can compute
-- "Welcome Back Memory" (what happened since your last visit) without a
-- separate session table. NULL means "never visited" (first-ever load).
-- Mirrors the Drizzle schema in lib/db/src/schema/auth.ts (commanders).
--
-- Safe to re-run (idempotent): ADD COLUMN uses IF NOT EXISTS.
--
--   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f lib/db/sql/2026-07-21-commander-last-visit.sql

BEGIN;

ALTER TABLE public.commanders
  ADD COLUMN IF NOT EXISTS last_dashboard_visit_at timestamptz;

COMMIT;
