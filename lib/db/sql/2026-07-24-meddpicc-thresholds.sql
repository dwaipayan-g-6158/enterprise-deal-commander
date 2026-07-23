-- MEDDPICC Auto-Scoring (2026-07-24) — RAG threshold defaults.
--
-- Adds the two tunable thresholds the MEDDPICC scoring engine reads
-- (meddpicc_red_max, meddpicc_green_min). Safe to re-run: ON CONFLICT DO NOTHING.
--
--   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f lib/db/sql/2026-07-24-meddpicc-thresholds.sql

BEGIN;

INSERT INTO public.engine_thresholds (parameter_key, parameter_value, data_type, description)
VALUES
  ('meddpicc_red_max', '40', 'number', 'MEDDPICC overall % below which the qualification RAG badge shows Red'),
  ('meddpicc_green_min', '75', 'number', 'MEDDPICC overall % above which the qualification RAG badge shows Green')
ON CONFLICT (parameter_key) DO NOTHING;

COMMIT;
