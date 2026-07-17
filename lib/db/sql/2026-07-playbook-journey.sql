-- Playbook Journey (2026-07)
--
-- Fixes the stage-change bug where a deal's playbook never updated after its
-- first assignment: both auto-assign paths guarded on "does this deal have
-- ANY active assignment", not "does this deal have an assignment for THIS
-- playbook". The model shifts to one assignment per (deal, playbook), ever —
-- a deal rightfully holds multiple concurrent assignments as it moves through
-- stages, and the Playbook tab becomes a full 5-stage journey view instead of
-- showing only one playbook at a time.
--
-- This migration adds the enforcing unique constraint. No data surgery: the
-- dev DB has zero duplicate (deal_id, playbook_id) pairs today (verified),
-- and any deal with a stale single assignment (e.g. wrong-stage) is valid
-- as-is under the new model — the fixed auto-assign backfills the deal's
-- *current*-stage playbook as an additional row the next time it's read.
--
-- Safe to re-run (idempotent).
--
--   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f lib/db/sql/2026-07-playbook-journey.sql

BEGIN;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'deal_playbook_assignment_uq'
  ) THEN
    ALTER TABLE edc_v2.deal_playbook_assignments
      ADD CONSTRAINT deal_playbook_assignment_uq UNIQUE (deal_id, playbook_id);
  END IF;
END $$;

COMMIT;
