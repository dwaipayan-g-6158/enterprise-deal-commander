-- Playbook step action state (2026-07)
--
-- Adds an explicit `status` to the playbook step-action ledger so a Skipped or
-- Blocked step is distinguishable from a Completed one (previously everything in
-- the ledger rendered as a green checkmark). Mirrors the Drizzle schema in
-- lib/db/src/schema/edc_v2_intel.ts (playbookStepCompletions).
--
-- `blocked` is a non-terminal state (a step flagged as stuck): excluded from
-- completion progress and surfaced to the risk engine as an execution gap.
-- The legacy `skipped` boolean is retained and kept in sync (status='skipped'
-- ⇔ skipped=true) so any older reader keeps working.
--
-- Safe to re-run (idempotent): column add uses IF NOT EXISTS; the check
-- constraint is dropped and recreated; the backfill is a no-op once applied.
--
--   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f lib/db/sql/2026-07-playbook-step-status.sql

BEGIN;

ALTER TABLE edc_v2.playbook_step_completions
  ADD COLUMN IF NOT EXISTS status varchar(20) NOT NULL DEFAULT 'completed';

-- Backfill existing rows from the legacy boolean (only touches rows still at the default).
UPDATE edc_v2.playbook_step_completions
  SET status = 'skipped'
  WHERE skipped = true AND status = 'completed';

ALTER TABLE edc_v2.playbook_step_completions
  DROP CONSTRAINT IF EXISTS playbook_step_completions_status_valid;
ALTER TABLE edc_v2.playbook_step_completions
  ADD CONSTRAINT playbook_step_completions_status_valid
  CHECK (status IN ('completed', 'skipped', 'blocked'));

COMMIT;
