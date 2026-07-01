-- edc_v2.deal_memory full-text search infrastructure.
--
-- This repo has no migrations directory; schema changes are applied via
-- `drizzle-kit push` for anything Drizzle can model, plus hand-applied raw
-- SQL (like this file) for anything it can't — tsvector columns, trigger
-- functions, and weighted full-text indexes aren't representable in the
-- Drizzle schema DSL. See the comment above `dealMemory` in
-- lib/db/src/schema/edc_v2_intel.ts.
--
-- Apply after `pnpm --filter @workspace/db run push` has created the
-- `deal_memory` table. Safe to re-run (idempotent): column/index use
-- IF NOT EXISTS, the function uses CREATE OR REPLACE, and the trigger is
-- dropped and recreated.
--
--   psql "$DATABASE_URL" -f lib/db/sql/deal_memory_searchable_vector.sql

ALTER TABLE edc_v2.deal_memory
  ADD COLUMN IF NOT EXISTS searchable_vector tsvector;

CREATE OR REPLACE FUNCTION edc_v2.deal_memory_searchable_vector_trigger()
RETURNS trigger
LANGUAGE plpgsql
AS $function$
BEGIN
  NEW.searchable_vector :=
    setweight(to_tsvector('english', coalesce(NEW.account_name,'') || ' ' || coalesce(NEW.deal_name,'')), 'A') ||
    setweight(to_tsvector('english', coalesce(NEW.win_loss_narrative,'')), 'B') ||
    setweight(to_tsvector('english', coalesce(array_to_string(NEW.key_lessons,' '),'')), 'C') ||
    setweight(to_tsvector('english', coalesce(array_to_string(NEW.tags,' '),'')), 'D');
  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS deal_memory_searchable_vector_update ON edc_v2.deal_memory;

CREATE TRIGGER deal_memory_searchable_vector_update
  BEFORE INSERT OR UPDATE ON edc_v2.deal_memory
  FOR EACH ROW EXECUTE FUNCTION edc_v2.deal_memory_searchable_vector_trigger();

CREATE INDEX IF NOT EXISTS deal_memory_searchable_vector_idx
  ON edc_v2.deal_memory USING gin (searchable_vector);

-- Backfill any rows that existed before the trigger did (a no-op UPDATE
-- still fires a BEFORE UPDATE trigger, so this populates searchable_vector
-- for every pre-existing row without touching any other column).
UPDATE edc_v2.deal_memory SET id = id;
