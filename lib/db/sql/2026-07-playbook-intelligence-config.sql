-- Playbook Intelligence config (2026-07)
--
-- Two tuning changes that make playbook execution feed the intelligence engine:
--  1. A new engine_threshold `playbook_overdue_grace_days` (grace before a step
--     counts overdue) — feeds the PLAYBOOK_EXECUTION_GAP risk pattern and the
--     playbook_adherence score factor. Auto-appears in Settings → Thresholds.
--  2. Rebalanced predictive-score weights to make room for the new 9th factor
--     `playbook_adherence` (all fractions of 1.0, sum = 1.0000).
--
-- Mirrors seed.ts (seedThresholds + scoringWeightDefaults) for already-seeded DBs.
-- Safe to re-run: threshold insert is ON CONFLICT DO NOTHING; the weights are a
-- deterministic clean rebuild (append-only history is reset to the new defaults).
--
--   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f lib/db/sql/2026-07-playbook-intelligence-config.sql

BEGIN;

INSERT INTO public.engine_thresholds (parameter_key, parameter_value, data_type, description)
VALUES (
  'playbook_overdue_grace_days', '3', 'number',
  'Grace days added to a playbook step''s expected-duration deadline before it counts as overdue (feeds PLAYBOOK_EXECUTION_GAP + the playbook_adherence score factor)'
)
ON CONFLICT (parameter_key) DO NOTHING;

DELETE FROM edc_v2.scoring_model_weights;
INSERT INTO edc_v2.scoring_model_weights (feature_id, calibrated_weight, sample_size, calibration_date) VALUES
  ('gate_momentum',        0.2200, 0, CURRENT_DATE),
  ('stage_velocity',       0.1300, 0, CURRENT_DATE),
  ('services_attachment',  0.1000, 0, CURRENT_DATE),
  ('executive_alignment',  0.1300, 0, CURRENT_DATE),
  ('blocker_load',         0.0900, 0, CURRENT_DATE),
  ('deal_size_confidence', 0.0500, 0, CURRENT_DATE),
  ('close_pressure',       0.1000, 0, CURRENT_DATE),
  ('historical_win_rate',  0.0800, 0, CURRENT_DATE),
  ('playbook_adherence',   0.1000, 0, CURRENT_DATE);

COMMIT;
