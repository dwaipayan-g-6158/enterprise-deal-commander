-- MEDDPICC Auto-Scoring (2026-07-24)
--
-- Adds the 43-question MEDDPICC catalog, per-deal answers, and score
-- snapshots. Mirrors the Drizzle schema in lib/db/src/schema/edc_v2_intel.ts
-- (meddpiccQuestions, dealMeddpiccAnswers, dealMeddpiccScores).
--
-- Safe to re-run (idempotent): CREATE TABLE / INDEX use IF NOT EXISTS.
--
--   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f lib/db/sql/2026-07-24-meddpicc-scoring.sql

BEGIN;

CREATE TABLE IF NOT EXISTS edc_v2.meddpicc_questions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  question_order smallint NOT NULL UNIQUE,
  pillar varchar(30) NOT NULL,
  stage_tag varchar(1) NOT NULL,
  question_text text NOT NULL,
  help_text text
);

CREATE TABLE IF NOT EXISTS edc_v2.deal_meddpicc_answers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  deal_id uuid NOT NULL REFERENCES public.enterprise_deals(id) ON DELETE CASCADE,
  question_id uuid NOT NULL REFERENCES edc_v2.meddpicc_questions(id),
  score smallint,
  is_auto_suggested boolean NOT NULL DEFAULT false,
  suggested_score smallint,
  note text,
  answered_at timestamptz,
  answered_by varchar(255),
  CONSTRAINT deal_meddpicc_answer_uq UNIQUE (deal_id, question_id)
);

CREATE TABLE IF NOT EXISTS edc_v2.deal_meddpicc_scores (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  deal_id uuid NOT NULL REFERENCES public.enterprise_deals(id) ON DELETE CASCADE,
  overall_score integer NOT NULL,
  overall_pct numeric(5,2) NOT NULL,
  stage_pct numeric(5,2),
  rag_status varchar(10) NOT NULL,
  pillar_breakdown jsonb NOT NULL,
  strong_no_count smallint NOT NULL,
  unknown_count smallint NOT NULL,
  computed_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS deal_meddpicc_score_deal_time_idx
  ON edc_v2.deal_meddpicc_scores (deal_id, computed_at DESC);

COMMIT;
