-- Managed Risks: self-expiring snooze (2026-07)
--
-- Adds two nullable columns to deal_alert_dispositions so a "snooze" can
-- auto-expire instead of staying managed forever:
--   - snooze_until — absolute expiry timestamp (duration-based).
--   - snooze_field_baseline — stringified value of the watched field,
--     captured at snooze time, so the read path (intelligence.ts) can detect
--     "the field changed" without a subscriber/cron. Paired with the existing
--     snooze_until_field_change column as "whichever comes first".
-- Mirrors the Drizzle schema in lib/db/src/schema/deals.ts (dealAlertDispositions).
--
-- Safe to re-run (idempotent): ADD COLUMN uses IF NOT EXISTS.
--
--   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f lib/db/sql/2026-07-managed-risk-snooze.sql

BEGIN;

ALTER TABLE public.deal_alert_dispositions
  ADD COLUMN IF NOT EXISTS snooze_until timestamptz;
ALTER TABLE public.deal_alert_dispositions
  ADD COLUMN IF NOT EXISTS snooze_field_baseline text;

COMMIT;
