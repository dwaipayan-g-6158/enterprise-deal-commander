-- Human Touch Phase 3 (Engagement): achievement-earned ledger (2026-07)
--
-- Records which achievements have been permanently earned and when.
-- Mirrors the Drizzle schema in lib/db/src/schema/edc_v2_intel.ts
-- (commanderAchievements). Achievement criteria are evaluated live on each
-- GET /v2/analytics/engagement call; a row is inserted here the first time
-- a criterion is found true and stays forever afterward.
--
-- Safe to re-run (idempotent): CREATE TABLE uses IF NOT EXISTS.
--
--   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f lib/db/sql/2026-07-23-commander-achievements.sql

BEGIN;

CREATE TABLE IF NOT EXISTS edc_v2.commander_achievements (
  achievement_code varchar(60) PRIMARY KEY,
  earned_at timestamptz NOT NULL DEFAULT now()
);

COMMIT;
