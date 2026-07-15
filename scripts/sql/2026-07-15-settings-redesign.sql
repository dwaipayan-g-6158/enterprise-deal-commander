-- Settings module redesign: audit log + automation scaffolding + entity lookups
-- Applied directly (never via drizzle-kit push-force).
-- 2026-07-15

CREATE TABLE IF NOT EXISTS edc_v2.settings_change_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  module varchar(40) NOT NULL,
  setting_key varchar(120) NOT NULL,
  entity_id varchar(100),
  action varchar(20) NOT NULL,
  old_value jsonb,
  new_value jsonb,
  data_type varchar(20),
  actor varchar(255) NOT NULL,
  reason text,
  rollback_of uuid REFERENCES edc_v2.settings_change_log(id),
  changed_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS settings_change_log_module_idx ON edc_v2.settings_change_log (module, changed_at DESC);
CREATE INDEX IF NOT EXISTS settings_change_log_changed_at_idx ON edc_v2.settings_change_log (changed_at DESC);
CREATE INDEX IF NOT EXISTS settings_change_log_key_idx ON edc_v2.settings_change_log (setting_key);

CREATE TABLE IF NOT EXISTS edc_v2.automation_rules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  rule_name varchar(255) NOT NULL,
  description text,
  trigger_event varchar(50) NOT NULL,
  conditions jsonb NOT NULL,
  is_active boolean NOT NULL DEFAULT true,
  template_id uuid,
  created_by varchar(255) NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  last_fired_at timestamptz,
  fire_count integer NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS edc_v2.automation_actions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  rule_id uuid NOT NULL REFERENCES edc_v2.automation_rules(id) ON DELETE CASCADE,
  action_type varchar(30) NOT NULL,
  config jsonb NOT NULL,
  sort_order smallint NOT NULL,
  CONSTRAINT automation_actions_rule_sort_uq UNIQUE (rule_id, sort_order)
);

CREATE TABLE IF NOT EXISTS edc_v2.automation_rule_templates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name varchar(255) NOT NULL,
  description text,
  category varchar(40),
  trigger_event varchar(50) NOT NULL,
  conditions jsonb NOT NULL,
  actions jsonb NOT NULL,
  is_builtin boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS edc_v2.automation_execution_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  rule_id uuid REFERENCES edc_v2.automation_rules(id) ON DELETE SET NULL,
  deal_id uuid,
  trigger_event varchar(50) NOT NULL,
  matched boolean NOT NULL,
  actions_run jsonb NOT NULL,
  status varchar(20) NOT NULL,
  error text,
  executed_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS automation_execution_log_rule_idx ON edc_v2.automation_execution_log (rule_id, executed_at DESC);
CREATE INDEX IF NOT EXISTS automation_execution_log_executed_at_idx ON edc_v2.automation_execution_log (executed_at DESC);

CREATE TABLE IF NOT EXISTS segments (
  id SERIAL PRIMARY KEY,
  name varchar(80) NOT NULL UNIQUE,
  description text,
  sort_order smallint NOT NULL DEFAULT 0,
  is_active boolean NOT NULL DEFAULT true
);

CREATE TABLE IF NOT EXISTS deal_types (
  id SERIAL PRIMARY KEY,
  name varchar(80) NOT NULL UNIQUE,
  description text,
  sort_order smallint NOT NULL DEFAULT 0,
  is_active boolean NOT NULL DEFAULT true
);
