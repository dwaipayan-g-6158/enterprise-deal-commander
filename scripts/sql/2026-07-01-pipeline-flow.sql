-- Pipeline Flow Analytics: additive schema additions
-- Applied directly (never via drizzle-kit push-force).
-- 2026-07-01

CREATE TABLE IF NOT EXISTS edc_v2.pipeline_transitions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  deal_id uuid NOT NULL REFERENCES enterprise_deals(id) ON DELETE CASCADE,
  from_stage_id integer,
  to_stage_id integer,
  transition_type varchar(20) NOT NULL,
  tcv_at_transition numeric(18,2),
  days_in_from_stage integer,
  overridden boolean NOT NULL DEFAULT false,
  transitioned_at timestamptz NOT NULL,
  created_by varchar(255) NOT NULL,
  CONSTRAINT transitions_natural_key UNIQUE (deal_id, transitioned_at)
);
CREATE INDEX IF NOT EXISTS transitions_deal_time_idx ON edc_v2.pipeline_transitions (deal_id, transitioned_at DESC);
CREATE INDEX IF NOT EXISTS transitions_time_idx ON edc_v2.pipeline_transitions (transitioned_at DESC);

CREATE TABLE IF NOT EXISTS edc_v2.pipeline_targets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  period_type varchar(10) NOT NULL DEFAULT 'quarter',
  period_start date NOT NULL,
  target_value numeric(18,2) NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT targets_period_unique UNIQUE (period_type, period_start)
);
