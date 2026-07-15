# Settings Backend Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Lay the backend foundation for the Settings module redesign — new schema (audit log + automation scaffolding + segments/deal-types), wire five previously-dead engine parameters (5 risk-dimension weights, 6 health-score weights, 7 portfolio-risk constants, 8 predictive-scoring weights) into real engine consumption, and add a settings-change audit backbone with retrofitted logging on every existing settings mutation route.

**Architecture:** This is Phases 0-1 of the approved Settings redesign plan (`C:\Users\dGiri\.claude\plans\lovely-shimmying-charm.md`) — the backend-only checkpoint, before any frontend work. Config stays in the existing `engine_thresholds` key/value store (rides its current `lookup:` cache tier) wherever possible; only genuinely new concepts (settings audit log, automation scaffolding, segments/deal-types) get new tables. All engine wiring follows the codebase's existing pure/DB-free split: new pure derivation functions in `artifacts/api-server/src/lib/engine-config.ts` (no `@workspace/db` import, directly unit-testable), consumed by the DB-touching orchestration files (`intelligence.ts`, `scoring.ts`, `portfolio.ts`, `routes/v2/analytics.ts`) that already exist. The 16 named risk patterns are untouched — only weights/aggregation config is parameterized.

**Tech Stack:** Node 24, Express 5, Drizzle ORM (Postgres 16), Zod (generated from `lib/api-spec/openapi.yaml` via Orval), Vitest. Windows/PowerShell local dev; Postgres at `postgres://postgres:postgres@localhost:5432/edc`.

## Global Constraints

- **No `drizzle-kit push` / `push-force`** — it hits a phantom-diff TTY truncate prompt on this DB. All new tables are applied via a hand-written, idempotent SQL file under `scripts/sql/`, run directly with `psql`. Drizzle schema TS must stay in lockstep for typecheck, but the SQL file is the source of truth for what actually exists in Postgres.
- **Engine purity is non-negotiable:** no file under `lib/engine/src/` may import `@workspace/db`, and no file under `artifacts/api-server/src/lib/engine-config.ts` may import `@workspace/db` either (it must stay unit-testable without `DATABASE_URL`). Config is always loaded in a DB-touching orchestration file and passed into pure functions as arguments.
- **`engine_thresholds.parameter_value` is `text`** and coerced only as string-vs-number (see `getThresholds()` in `intelligence.ts`). Every new threshold row added in this plan must be `dataType: "number"` with a plain numeric string value — never store JSON/array there.
- **Existing behavior must not change until a value is edited.** Every new "derive X from thresholds" function must default to the exact numbers the engine used before this plan (verified by tests asserting the current hardcoded output).
- **Test convention:** this codebase unit-tests pure, DB-free logic only (see `portfolio-metrics.test.ts`, `cache-middleware.test.ts`, `lib/engine/src/*.test.ts`) — there are no DB-integration tests in the Vitest suite. Every task that touches a DB-importing file must isolate its new *logic* into a pure, tested function, and verify the DB-touching wrapper by manual `psql`/route smoke test instead of an automated test — do not attempt to import a `@workspace/db`-importing module from a `.test.ts` file, it will throw (`DATABASE_URL must be set`) at import time.
- **Rollback scope for this checkpoint:** the settings-audit log records old/new values for **every** settings mutation in this plan (thresholds, fx-rates, competitors, compliance-drivers, team-members, targets, custom-patterns, notification-rules, webhooks). The one-click **rollback apply** endpoint built in Task 11 only knows how to *re-apply* changes for the `engine_thresholds`-backed modules (risk-weights, health-weights, portfolio-config — all stored as `engine_thresholds` rows). Rollback for entity-table modules (webhooks, notification-rules, custom-patterns, targets, competitors, team-members) is explicitly deferred to the Governance & Audit UI phase (master plan Phase 7) and must return a clear `409 Conflict` ("Rollback not yet supported for module X"), not a silent no-op — this is a real, tested branch, not a placeholder.
- Run `pnpm run typecheck` after every task. Run the relevant test file(s) after every task that adds tests. Do not mark a task complete with a failing typecheck or test.

---

### Task 1: Settings & automation schema + segments/deal-types lookups

**Files:**
- Create: `lib/db/src/schema/settings.ts`
- Modify: `lib/db/src/schema/lookups.ts` (add `segments`, `dealTypes` tables)
- Modify: `lib/db/src/schema/index.ts` (register the new schema file)
- Create: `scripts/sql/2026-07-15-settings-redesign.sql`

**Interfaces:**
- Produces: `settingsChangeLog`, `automationRules`, `automationActions`, `automationRuleTemplates`, `automationExecutionLog` (all `edcV2.table(...)`, from `lib/db/src/schema/settings.ts`), and `segments`, `dealTypes` (`pgTable(...)`, from `lib/db/src/schema/lookups.ts`) — all re-exported from `@workspace/db` via `schema/index.ts`'s `export * from "./settings"`.

- [ ] **Step 1: Write the new schema file**

Create `lib/db/src/schema/settings.ts`:

```ts
// Settings module redesign — governance/audit + automation schema (edc_v2).
//
// settings_change_log is the audit backbone for ALL settings mutations
// (thresholds, weights, webhooks, rules, targets, entities). old/new values
// are stored as jsonb (not text) so structured config never hits the
// string<->number coercion engine_thresholds uses for its own values.
//
// automation_rules/automation_actions generalize notification_rules into a
// full trigger -> condition(s) -> multi-action model (Settings Automation
// Studio, a later phase); automation_execution_log records what actually ran.
// These tables are created now (schema-only, no behavior change) so the
// later Automation Studio phase is additive, not a migration.

import {
  uuid,
  varchar,
  text,
  integer,
  smallint,
  boolean,
  timestamp,
  jsonb,
  index,
  unique,
} from "drizzle-orm/pg-core";
import { edcV2 } from "./edc_v2";

export const settingsChangeLog = edcV2.table(
  "settings_change_log",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    module: varchar("module", { length: 40 }).notNull(),
    settingKey: varchar("setting_key", { length: 120 }).notNull(),
    entityId: varchar("entity_id", { length: 100 }),
    action: varchar("action", { length: 20 }).notNull(),
    oldValue: jsonb("old_value"),
    newValue: jsonb("new_value"),
    dataType: varchar("data_type", { length: 20 }),
    actor: varchar("actor", { length: 255 }).notNull(),
    reason: text("reason"),
    rollbackOf: uuid("rollback_of"),
    changedAt: timestamp("changed_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    index("settings_change_log_module_idx").on(t.module, t.changedAt.desc()),
    index("settings_change_log_changed_at_idx").on(t.changedAt.desc()),
    index("settings_change_log_key_idx").on(t.settingKey),
  ],
);

export const automationRules = edcV2.table("automation_rules", {
  id: uuid("id").primaryKey().defaultRandom(),
  ruleName: varchar("rule_name", { length: 255 }).notNull(),
  description: text("description"),
  triggerEvent: varchar("trigger_event", { length: 50 }).notNull(),
  conditions: jsonb("conditions")
    .notNull()
    .$type<{ field: string; operator: string; value: string }[]>(),
  isActive: boolean("is_active").notNull().default(true),
  templateId: uuid("template_id"),
  createdBy: varchar("created_by", { length: 255 }).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  lastFiredAt: timestamp("last_fired_at", { withTimezone: true }),
  fireCount: integer("fire_count").notNull().default(0),
});

export const automationActions = edcV2.table(
  "automation_actions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    ruleId: uuid("rule_id")
      .notNull()
      .references(() => automationRules.id, { onDelete: "cascade" }),
    actionType: varchar("action_type", { length: 30 }).notNull(),
    config: jsonb("config").notNull().$type<Record<string, unknown>>(),
    sortOrder: smallint("sort_order").notNull(),
  },
  (t) => [unique("automation_actions_rule_sort_uq").on(t.ruleId, t.sortOrder)],
);

export const automationRuleTemplates = edcV2.table("automation_rule_templates", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: varchar("name", { length: 255 }).notNull(),
  description: text("description"),
  category: varchar("category", { length: 40 }),
  triggerEvent: varchar("trigger_event", { length: 50 }).notNull(),
  conditions: jsonb("conditions")
    .notNull()
    .$type<{ field: string; operator: string; value: string }[]>(),
  actions: jsonb("actions")
    .notNull()
    .$type<{ actionType: string; config: Record<string, unknown> }[]>(),
  isBuiltin: boolean("is_builtin").notNull().default(false),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const automationExecutionLog = edcV2.table(
  "automation_execution_log",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    ruleId: uuid("rule_id").references(() => automationRules.id, {
      onDelete: "set null",
    }),
    dealId: uuid("deal_id"),
    triggerEvent: varchar("trigger_event", { length: 50 }).notNull(),
    matched: boolean("matched").notNull(),
    actionsRun: jsonb("actions_run").notNull().$type<unknown[]>(),
    status: varchar("status", { length: 20 }).notNull(),
    error: text("error"),
    executedAt: timestamp("executed_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    index("automation_execution_log_rule_idx").on(t.ruleId, t.executedAt.desc()),
    index("automation_execution_log_executed_at_idx").on(t.executedAt.desc()),
  ],
);
```

- [ ] **Step 2: Add segments and deal_types to the lookups schema**

In `lib/db/src/schema/lookups.ts`, add these two tables immediately after the existing `teamMembers` table (after line 47, before `productCatalog`):

```ts
export const segments = pgTable("segments", {
  id: serial("id").primaryKey(),
  name: varchar("name", { length: 80 }).notNull().unique(),
  description: text("description"),
  sortOrder: smallint("sort_order").notNull().default(0),
  isActive: boolean("is_active").notNull().default(true),
});

export const dealTypes = pgTable("deal_types", {
  id: serial("id").primaryKey(),
  name: varchar("name", { length: 80 }).notNull().unique(),
  description: text("description"),
  sortOrder: smallint("sort_order").notNull().default(0),
  isActive: boolean("is_active").notNull().default(true),
});
```

No new imports are needed — `pgTable`, `serial`, `varchar`, `text`, `smallint`, `boolean` are already imported at the top of `lookups.ts`.

- [ ] **Step 3: Register the new schema file**

In `lib/db/src/schema/index.ts`, add a new export line. The file currently reads:

```ts
export * from "./lookups";
export * from "./deals";
export * from "./auth";
export * from "./edc_v2";
export * from "./edc_v2_intel";
```

Change it to:

```ts
export * from "./lookups";
export * from "./deals";
export * from "./auth";
export * from "./edc_v2";
export * from "./edc_v2_intel";
export * from "./settings";
```

- [ ] **Step 4: Typecheck to verify the schema compiles**

Run: `pnpm run typecheck`
Expected: PASS, no errors. (Drizzle schema files have no runtime test — a clean typecheck is the correctness signal for Steps 1-3.)

- [ ] **Step 5: Write the idempotent SQL migration**

Create `scripts/sql/2026-07-15-settings-redesign.sql`, mirroring the existing convention in `scripts/sql/2026-07-01-pipeline-flow.sql` (header comment, `gen_random_uuid()` used directly — no extension setup needed on this Postgres 16 instance, `CREATE TABLE IF NOT EXISTS` / `CREATE INDEX IF NOT EXISTS` throughout):

```sql
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
```

- [ ] **Step 6: Apply the migration and verify**

Run (from the repo root, worktree checkout):

```bash
psql "postgres://postgres:postgres@localhost:5432/edc" -f scripts/sql/2026-07-15-settings-redesign.sql
```

Expected: `CREATE TABLE` / `CREATE INDEX` output lines, no errors (safe to re-run — every statement is `IF NOT EXISTS`).

Then verify the objects exist:

```bash
psql "postgres://postgres:postgres@localhost:5432/edc" -c "SELECT table_schema, table_name FROM information_schema.tables WHERE table_name IN ('settings_change_log','automation_rules','automation_actions','automation_rule_templates','automation_execution_log','segments','deal_types') ORDER BY table_schema, table_name;"
```

Expected: 7 rows — 5 under `edc_v2`, 2 (`segments`, `deal_types`) under `public`.

- [ ] **Step 7: Commit**

```bash
git add lib/db/src/schema/settings.ts lib/db/src/schema/lookups.ts lib/db/src/schema/index.ts scripts/sql/2026-07-15-settings-redesign.sql
git commit -m "feat(settings): add settings audit + automation schema, segments/deal-types lookups"
```

---

### Task 2: Seed data for new thresholds, scoring weights, and sample entities

**Files:**
- Modify: `artifacts/api-server/src/seed.ts`

**Interfaces:**
- Consumes: `engineThresholds`, `segments`, `dealTypes` (from `@workspace/db`, Task 1). `scoringModelWeights` (from `@workspace/db`, already existed pre-plan — see `lib/db/src/schema/edc_v2_intel.ts:107`).
- Produces: seeded rows that Tasks 4-6's default-value tests will assert against.

- [ ] **Step 1: Add health-weight and portfolio-metric threshold rows**

In `artifacts/api-server/src/seed.ts`, the existing `engineThresholds` seed block ends with the `risk_level_elevated_max` row followed by `.onConflictDoNothing();` (around line 303). Insert these 13 new rows into the **same** `.values([...])` array, immediately after the `risk_level_elevated_max` entry and before the closing `])`:

```ts
      // Pipeline Flow health-score weights (Settings redesign — previously hardcoded DEFAULT_HEALTH_WEIGHTS)
      { parameterKey: "health_weight_coverage", parameterValue: "0.1667", dataType: "number", description: "Weight of the coverage component in the pipeline health score" },
      { parameterKey: "health_weight_velocity", parameterValue: "0.1667", dataType: "number", description: "Weight of the velocity component in the pipeline health score" },
      { parameterKey: "health_weight_conversion", parameterValue: "0.1667", dataType: "number", description: "Weight of the conversion component in the pipeline health score" },
      { parameterKey: "health_weight_generation", parameterValue: "0.1667", dataType: "number", description: "Weight of the generation component in the pipeline health score" },
      { parameterKey: "health_weight_age", parameterValue: "0.1667", dataType: "number", description: "Weight of the age component in the pipeline health score" },
      { parameterKey: "health_weight_attrition", parameterValue: "0.1665", dataType: "number", description: "Weight of the attrition component in the pipeline health score" },
      // Portfolio Risk Analysis constants (Settings redesign — previously hardcoded in portfolio-metrics.ts)
      { parameterKey: "portfolio_health_base_green", parameterValue: "10", dataType: "number", description: "Baseline composite risk score for a GREEN-health deal" },
      { parameterKey: "portfolio_health_base_yellow", parameterValue: "45", dataType: "number", description: "Baseline composite risk score for a YELLOW-health deal" },
      { parameterKey: "portfolio_health_base_red", parameterValue: "75", dataType: "number", description: "Baseline composite risk score for a RED-health deal" },
      { parameterKey: "portfolio_alert_bump_cap", parameterValue: "25", dataType: "number", description: "Maximum bump to a deal's composite risk score from its strongest active alert" },
      { parameterKey: "portfolio_alert_bump_per_weight", parameterValue: "0.25", dataType: "number", description: "Multiplier applied to the strongest active alert's weight to compute the risk bump" },
      { parameterKey: "portfolio_min_confidence_deals", parameterValue: "3", dataType: "number", description: "Minimum deals in a heatmap cell before it is flagged low-confidence" },
      { parameterKey: "portfolio_significant_lift", parameterValue: "1.5", dataType: "number", description: "Minimum lift over baseline for an alert-code correlation to be treated as significant" },
      { parameterKey: "portfolio_cluster_min_share", parameterValue: "0.5", dataType: "number", description: "Minimum share of a group's deals carrying a code for it to count toward a correlation cluster" },
      { parameterKey: "portfolio_cluster_min_deals", parameterValue: "3", dataType: "number", description: "Minimum deals in a group before its correlations are considered for clustering" },
```

Note: the six `health_weight_*` values sum to exactly `1.0000` (five at `0.1667` + one at `0.1665` = `1.0000`), matching `1/6` rounded to 4 decimal places with the remainder absorbed by `attrition` — this preserves today's effectively-equal-weight behavior.

- [ ] **Step 2: Seed scoring_model_weights with the 8 predictive-scoring factor defaults**

Still in `artifacts/api-server/src/seed.ts`, add a new block immediately after the `fxRates` seed block (after the `.onConflictDoNothing();` that follows the `fxRates` insert, i.e. right before the `// C4: stage-keyed playbooks...` comment):

```ts
  const scoringWeightDefaults: { featureId: string; calibratedWeight: string }[] = [
    { featureId: "gate_momentum", calibratedWeight: "25.0000" },
    { featureId: "stage_velocity", calibratedWeight: "15.0000" },
    { featureId: "services_attachment", calibratedWeight: "10.0000" },
    { featureId: "executive_alignment", calibratedWeight: "15.0000" },
    { featureId: "blocker_load", calibratedWeight: "10.0000" },
    { featureId: "deal_size_confidence", calibratedWeight: "5.0000" },
    { featureId: "close_pressure", calibratedWeight: "10.0000" },
    { featureId: "historical_win_rate", calibratedWeight: "10.0000" },
  ];
  await db
    .insert(scoringModelWeights)
    .values(
      scoringWeightDefaults.map((w) => ({
        featureId: w.featureId,
        calibratedWeight: w.calibratedWeight,
        sampleSize: 0,
        calibrationDate: today,
      })),
    )
    .onConflictDoNothing();
```

This reuses the `today` constant already defined a few lines above (`const today = new Date().toISOString().slice(0, 10);`, used by the `fxRates` seed). Add `scoringModelWeights` to the existing `@workspace/db` import list at the top of `seed.ts` (find the import block that already includes `engineThresholds, fxRates` and add `scoringModelWeights` alongside them).

Note: `calibratedWeight` is `numeric(precision: 5, scale: 4)` per the schema — that allows up to `9.9999`, but our values (e.g. `25.0000`) exceed a 5-digit-total/4-decimal numeric's integer-part capacity (`numeric(5,4)` allows only 1 integer digit: max `9.9999`). **Before writing this seed, read `lib/db/src/schema/edc_v2_intel.ts:110`** (`calibratedWeight: numeric("calibrated_weight", { precision: 5, scale: 4 })`) and confirm this precision. Since the FACTOR weights sum to 100 (not 1.0), store them as **fractions of 1** instead — i.e. `gate_momentum` = `0.2500` (25/100), `stage_velocity` = `0.1500`, `services_attachment` = `0.1000`, `executive_alignment` = `0.1500`, `blocker_load` = `0.1000`, `deal_size_confidence` = `0.0500`, `close_pressure` = `0.1000`, `historical_win_rate` = `0.1000` — all within `numeric(5,4)`. Use these fraction values instead of the `25.0000`-style values above. Task 6 will read these as fractional weights and scale by 100 (see Task 6, Step 4) so `computePredictiveScore`'s existing 0-100 weight convention is preserved.

- [ ] **Step 3: Seed sample segments and deal types**

Add, in the same area as Step 2 (after the `scoringModelWeights` insert):

```ts
  await db
    .insert(segments)
    .values([
      { name: "Enterprise", sortOrder: 1 },
      { name: "Mid-Market", sortOrder: 2 },
      { name: "Commercial", sortOrder: 3 },
    ])
    .onConflictDoNothing();

  await db
    .insert(dealTypes)
    .values([
      { name: "New Business", sortOrder: 1 },
      { name: "Expansion", sortOrder: 2 },
      { name: "Renewal", sortOrder: 3 },
      { name: "Migration", sortOrder: 4 },
    ])
    .onConflictDoNothing();
```

Add `segments, dealTypes` to the `@workspace/db` import list at the top of `seed.ts`.

- [ ] **Step 4: Seed one built-in automation rule template**

Add, right after the `dealTypes` insert:

```ts
  await db
    .insert(automationRuleTemplates)
    .values([
      {
        name: "Critical anomaly alert",
        description: "Notify the deal owner when a Critical-severity anomaly is detected on a deal above $50K.",
        category: "risk",
        triggerEvent: "health_changed",
        conditions: [{ field: "toStatus", operator: "eq", value: "RED" }],
        actions: [{ actionType: "in_app_notify", config: { message: "Deal health changed to RED — review immediately." } }],
        isBuiltin: true,
      },
    ])
    .onConflictDoNothing();
```

Add `automationRuleTemplates` to the `@workspace/db` import list at the top of `seed.ts`. (This is schema-only seed data — nothing consumes `automation_rule_templates` until the later Automation Studio phase; it exists now so that phase has a real row to build against.)

- [ ] **Step 5: Run the seed script and verify**

Run:

```bash
node --enable-source-maps artifacts/api-server/dist/seed.mjs
```

(If `dist/` is stale, first run `pnpm --filter @workspace/api-server run dev` briefly to rebuild, or check the package's build script — the dev script always rebuilds before start per the project's `CLAUDE.md`.)

Expected: exits 0, no errors (all inserts are `onConflictDoNothing`, safe to re-run).

Verify:

```bash
psql "postgres://postgres:postgres@localhost:5432/edc" -c "SELECT parameter_key, parameter_value FROM engine_thresholds WHERE parameter_key LIKE 'health_weight_%' OR parameter_key LIKE 'portfolio_%' ORDER BY parameter_key;"
psql "postgres://postgres:postgres@localhost:5432/edc" -c "SELECT feature_id, calibrated_weight FROM edc_v2.scoring_model_weights ORDER BY feature_id;"
psql "postgres://postgres:postgres@localhost:5432/edc" -c "SELECT name FROM segments; SELECT name FROM deal_types;"
```

Expected: 13 threshold rows, 8 scoring-weight rows (all `0.0500`-`0.2500` range, summing to `1.0000`), 3 segments, 4 deal types.

- [ ] **Step 6: Commit**

```bash
git add artifacts/api-server/src/seed.ts
git commit -m "feat(settings): seed health/portfolio thresholds, scoring weights, segments, deal types"
```

---

### Task 3: Pure engine-config module + risk-dimension-weight wiring

**Files:**
- Create: `artifacts/api-server/src/lib/engine-config.ts`
- Create: `artifacts/api-server/src/lib/engine-config.test.ts`
- Modify: `artifacts/api-server/src/lib/intelligence.ts:75-97` (remove local `num`/`deriveRiskWeights`/`deriveRiskBoundaries`, import from `engine-config.ts`)

**Interfaces:**
- Produces: `num(thresholds, key, fallback): number`, `deriveRiskWeights(thresholds): RiskV2Weights`, `deriveRiskBoundaries(thresholds): RiskLevelBoundaries` — all exported from `artifacts/api-server/src/lib/engine-config.ts`. Tasks 4-5 add more functions to this same file.
- Consumes: `EngineThresholds`, `RiskV2Weights`, `RiskLevelBoundaries` types from `@workspace/engine` (already exported — confirmed via `lib/engine/src/index.ts` `export * from "./risk-v2"` and `dimensions`).

- [ ] **Step 1: Write the failing test**

Create `artifacts/api-server/src/lib/engine-config.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { num, deriveRiskWeights, deriveRiskBoundaries } from "./engine-config";
import type { EngineThresholds } from "@workspace/engine";

describe("num", () => {
  it("returns the numeric threshold value when present", () => {
    expect(num({ foo: 42 }, "foo", 0)).toBe(42);
  });
  it("coerces a numeric string", () => {
    expect(num({ foo: "42" }, "foo", 0)).toBe(42);
  });
  it("falls back when the key is absent", () => {
    expect(num({}, "foo", 7)).toBe(7);
  });
  it("falls back when the value is non-numeric", () => {
    expect(num({ foo: "not-a-number" }, "foo", 7)).toBe(7);
  });
});

describe("deriveRiskWeights", () => {
  it("reads ALL SEVEN dimension weights from thresholds (not just technical/commercial)", () => {
    const thresholds: EngineThresholds = {
      risk_weight_technical: 0.3,
      risk_weight_commercial: 0.2,
      risk_weight_stakeholder: 0.1,
      risk_weight_temporal: 0.1,
      risk_weight_financial: 0.1,
      risk_weight_competitive: 0.1,
      risk_weight_engagement: 0.1,
    };
    expect(deriveRiskWeights(thresholds)).toEqual({
      technical: 0.3,
      commercial: 0.2,
      stakeholder: 0.1,
      temporal: 0.1,
      financial: 0.1,
      competitive: 0.1,
      engagement: 0.1,
    });
  });

  it("defaults to the seeded PRD values when thresholds are empty", () => {
    expect(deriveRiskWeights({})).toEqual({
      technical: 0.2,
      commercial: 0.15,
      stakeholder: 0.15,
      temporal: 0.15,
      financial: 0.1,
      competitive: 0.1,
      engagement: 0.15,
    });
  });
});

describe("deriveRiskBoundaries", () => {
  it("reads the three level boundaries from thresholds", () => {
    expect(
      deriveRiskBoundaries({
        risk_level_low_max: 20,
        risk_level_moderate_max: 45,
        risk_level_elevated_max: 70,
      }),
    ).toEqual({ lowMax: 20, moderateMax: 45, elevatedMax: 70 });
  });

  it("defaults to 25/50/75 when thresholds are empty", () => {
    expect(deriveRiskBoundaries({})).toEqual({
      lowMax: 25,
      moderateMax: 50,
      elevatedMax: 75,
    });
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm --filter @workspace/api-server exec vitest run src/lib/engine-config.test.ts`
Expected: FAIL — `Cannot find module './engine-config'` (the file doesn't exist yet).

- [ ] **Step 3: Write the implementation**

Create `artifacts/api-server/src/lib/engine-config.ts`:

```ts
// Pure, DB-free derivation of tunable engine parameters from the merged
// `engine_thresholds` object. No file here may import `@workspace/db` — the
// DB-touching orchestration files (intelligence.ts, scoring.ts, portfolio.ts,
// routes/v2/analytics.ts) load thresholds and call into these functions.
import type {
  EngineThresholds,
  RiskV2Weights,
  RiskLevelBoundaries,
} from "@workspace/engine";

/** Read a numeric tunable from the merged thresholds, falling back when absent/non-numeric. */
export function num(
  thresholds: EngineThresholds,
  key: string,
  fallback: number,
): number {
  const v = thresholds[key];
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : fallback;
}

/** Derive the v2 risk dimension weights from the merged thresholds (all 7, DB-backed). */
export function deriveRiskWeights(thresholds: EngineThresholds): RiskV2Weights {
  return {
    technical: num(thresholds, "risk_weight_technical", 0.2),
    commercial: num(thresholds, "risk_weight_commercial", 0.15),
    stakeholder: num(thresholds, "risk_weight_stakeholder", 0.15),
    temporal: num(thresholds, "risk_weight_temporal", 0.15),
    financial: num(thresholds, "risk_weight_financial", 0.1),
    competitive: num(thresholds, "risk_weight_competitive", 0.1),
    engagement: num(thresholds, "risk_weight_engagement", 0.15),
  };
}

/** Derive the v2 risk-level boundaries from the merged thresholds. */
export function deriveRiskBoundaries(thresholds: EngineThresholds): RiskLevelBoundaries {
  return {
    lowMax: num(thresholds, "risk_level_low_max", 25),
    moderateMax: num(thresholds, "risk_level_moderate_max", 50),
    elevatedMax: num(thresholds, "risk_level_elevated_max", 75),
  };
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm --filter @workspace/api-server exec vitest run src/lib/engine-config.test.ts`
Expected: PASS, 6 tests.

- [ ] **Step 5: Wire intelligence.ts to use the new module**

In `artifacts/api-server/src/lib/intelligence.ts`, remove the local `num`, `deriveRiskWeights`, and `deriveRiskBoundaries` function definitions (lines 75-97 and 116-123 in the current file — the block from `/** Read a numeric tunable... */` through the closing `}` of `deriveRiskWeights`, and separately the `/** Derive the v2 risk-level boundaries... */` block through the closing `}` of `deriveRiskBoundaries`). Add an import and keep every call site (`deriveRiskWeights(thresholds)` at line 533, `deriveRiskBoundaries(thresholds)` at line 534) unchanged:

```ts
import { deriveRiskWeights, deriveRiskBoundaries } from "./engine-config";
```

Add this import near the top of `intelligence.ts`, alongside the existing `import { cache, CacheKeys, CacheTtl } from "./cache";` line.

- [ ] **Step 6: Typecheck and run the full engine + api-server test suites**

Run: `pnpm run typecheck`
Expected: PASS.

Run: `pnpm --filter @workspace/api-server run test`
Expected: PASS, all existing suites plus the new `engine-config.test.ts` green.

- [ ] **Step 7: Commit**

```bash
git add artifacts/api-server/src/lib/engine-config.ts artifacts/api-server/src/lib/engine-config.test.ts artifacts/api-server/src/lib/intelligence.ts
git commit -m "feat(settings): wire all 7 risk-dimension weights into the engine (was 2 of 7)"
```

---

### Task 4: Health-score weight wiring

**Files:**
- Modify: `artifacts/api-server/src/lib/engine-config.ts` (add `deriveHealthWeights`)
- Modify: `artifacts/api-server/src/lib/engine-config.test.ts` (add tests)
- Modify: `artifacts/api-server/src/lib/intelligence.ts` (add `getHealthWeights()`, exported)
- Modify: `artifacts/api-server/src/routes/v2/analytics.ts:1203-1234` (pass weights into `computeHealthScore`)

**Interfaces:**
- Consumes: `HealthWeights` type from `@workspace/engine` (exported via `lib/engine/src/index.ts`'s `export * from "./flow"`), `getThresholds()` from `./intelligence` (already exists).
- Produces: `deriveHealthWeights(thresholds): HealthWeights` (engine-config.ts), `getHealthWeights(): Promise<HealthWeights>` (intelligence.ts) — consumed by the analytics route in this task.

- [ ] **Step 1: Write the failing test**

Append to `artifacts/api-server/src/lib/engine-config.test.ts`:

```ts
import type { HealthWeights } from "@workspace/engine";

describe("deriveHealthWeights", () => {
  it("reads all six health-score weights from thresholds", () => {
    const thresholds = {
      health_weight_coverage: 0.3,
      health_weight_velocity: 0.2,
      health_weight_conversion: 0.2,
      health_weight_generation: 0.1,
      health_weight_age: 0.1,
      health_weight_attrition: 0.1,
    };
    const result: HealthWeights = deriveHealthWeights(thresholds);
    expect(result).toEqual({
      coverage: 0.3,
      velocity: 0.2,
      conversion: 0.2,
      generation: 0.1,
      age: 0.1,
      attrition: 0.1,
    });
  });

  it("defaults to equal-sixths (matching the prior hardcoded DEFAULT_HEALTH_WEIGHTS) when thresholds are empty", () => {
    const result = deriveHealthWeights({});
    expect(result.coverage).toBeCloseTo(1 / 6, 6);
    expect(result.velocity).toBeCloseTo(1 / 6, 6);
    expect(result.conversion).toBeCloseTo(1 / 6, 6);
    expect(result.generation).toBeCloseTo(1 / 6, 6);
    expect(result.age).toBeCloseTo(1 / 6, 6);
    expect(result.attrition).toBeCloseTo(1 / 6, 6);
  });
});
```

Add `deriveHealthWeights` to the existing `import { num, deriveRiskWeights, deriveRiskBoundaries } from "./engine-config";` line at the top of the test file.

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm --filter @workspace/api-server exec vitest run src/lib/engine-config.test.ts`
Expected: FAIL — `deriveHealthWeights is not a function` / import error.

- [ ] **Step 3: Implement `deriveHealthWeights`**

In `artifacts/api-server/src/lib/engine-config.ts`, add the import and function:

```ts
import type {
  EngineThresholds,
  RiskV2Weights,
  RiskLevelBoundaries,
  HealthWeights,
} from "@workspace/engine";
```

(replace the existing `import type {...} from "@workspace/engine";` block with this one — just adding `HealthWeights` to the list.)

```ts
/** Derive the Pipeline Flow health-score weights from the merged thresholds. */
export function deriveHealthWeights(thresholds: EngineThresholds): HealthWeights {
  return {
    coverage: num(thresholds, "health_weight_coverage", 1 / 6),
    velocity: num(thresholds, "health_weight_velocity", 1 / 6),
    conversion: num(thresholds, "health_weight_conversion", 1 / 6),
    generation: num(thresholds, "health_weight_generation", 1 / 6),
    age: num(thresholds, "health_weight_age", 1 / 6),
    attrition: num(thresholds, "health_weight_attrition", 1 / 6),
  };
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm --filter @workspace/api-server exec vitest run src/lib/engine-config.test.ts`
Expected: PASS, 8 tests.

- [ ] **Step 5: Add `getHealthWeights()` to intelligence.ts**

In `artifacts/api-server/src/lib/intelligence.ts`, update the `engine-config` import (from Task 3) to include `deriveHealthWeights`:

```ts
import { deriveRiskWeights, deriveRiskBoundaries, deriveHealthWeights } from "./engine-config";
```

Add this new exported function right after `getThresholds()` (after its closing `}`, before `export async function getFxRate`):

```ts
/**
 * Pipeline Flow health-score weights, derived from the same cached thresholds
 * `getThresholds()` already loads — no separate cache entry needed since
 * `getThresholds()` is itself cached under `lookup:thresholds` and this is a
 * cheap, pure, synchronous mapping over its result.
 */
export async function getHealthWeights() {
  const { thresholds } = await getThresholds();
  return deriveHealthWeights(thresholds);
}
```

- [ ] **Step 6: Wire the analytics route to use it**

In `artifacts/api-server/src/routes/v2/analytics.ts`, the `/analytics/flow/health-score` handler (lines 1203-1234) currently ends with:

```ts
  const history = { coverage: [], velocity: [], conversion: [], generation: [], age: [], attrition: [] };
  res.json({ data: { ...computeHealthScore(inputs, history), coverage } });
});
```

Change it to:

```ts
  const history = { coverage: [], velocity: [], conversion: [], generation: [], age: [], attrition: [] };
  const weights = await getHealthWeights();
  res.json({ data: { ...computeHealthScore(inputs, history, weights), coverage } });
});
```

Add `getHealthWeights` to this file's existing import from `../../lib/intelligence` (find the line importing from `"../../lib/intelligence"` near the top of `analytics.ts` and add `getHealthWeights` to its named imports — if no such import line exists yet, add `import { getHealthWeights } from "../../lib/intelligence";` near the other local imports at the top of the file).

- [ ] **Step 7: Typecheck and run tests**

Run: `pnpm run typecheck`
Expected: PASS.

Run: `pnpm --filter @workspace/api-server run test`
Expected: PASS.

- [ ] **Step 8: Manual smoke test (route requires a live DB — not unit-testable per this codebase's convention)**

With the API server running locally (see `[[edc-local-windows-run]]` run commands), hit the route and confirm it still returns a score:

```bash
curl -s -b cookies.txt http://localhost:5000/api/v2/analytics/flow/health-score | head -c 500
```

(Log in first via `POST /api/v1/auth/login` with `commander`/`DealCommander!2026` and `-c cookies.txt` to capture the session cookie, then re-run with `-b cookies.txt`.)
Expected: JSON response with a `score` field, no 500 error — confirms `getHealthWeights()` resolves correctly against the live `engine_thresholds` table seeded in Task 2.

- [ ] **Step 9: Commit**

```bash
git add artifacts/api-server/src/lib/engine-config.ts artifacts/api-server/src/lib/engine-config.test.ts artifacts/api-server/src/lib/intelligence.ts artifacts/api-server/src/routes/v2/analytics.ts
git commit -m "feat(settings): wire pipeline health-score weights into the engine (was hardcoded)"
```

---

### Task 5: Portfolio-metrics config wiring

**Files:**
- Modify: `artifacts/api-server/src/lib/portfolio-metrics.ts` (add `PortfolioMetricsConfig`, `DEFAULT_PORTFOLIO_CONFIG`, optional `config` params on 4 functions)
- Modify: `artifacts/api-server/src/lib/portfolio-metrics.test.ts` (add tests for custom config)
- Modify: `artifacts/api-server/src/lib/engine-config.ts` (add `derivePortfolioConfig`)
- Modify: `artifacts/api-server/src/lib/engine-config.test.ts` (add tests)
- Modify: `artifacts/api-server/src/lib/intelligence.ts` (add `getPortfolioConfig()`, exported)
- Modify: `artifacts/api-server/src/lib/portfolio.ts` (load config, thread into the 4 call sites)

**Interfaces:**
- Produces: `PortfolioMetricsConfig` interface + `DEFAULT_PORTFOLIO_CONFIG` const (portfolio-metrics.ts); `derivePortfolioConfig(thresholds): PortfolioMetricsConfig` (engine-config.ts); `getPortfolioConfig(): Promise<PortfolioMetricsConfig>` (intelligence.ts).
- Consumes: nothing new beyond what already exists in these files.

- [ ] **Step 1: Write the failing tests in portfolio-metrics.test.ts**

Append to `artifacts/api-server/src/lib/portfolio-metrics.test.ts` (add `PortfolioMetricsConfig`, `DEFAULT_PORTFOLIO_CONFIG` to the existing `import {...} from "./portfolio-metrics";` block at the top):

```ts
describe("computeDealRisk with a custom config", () => {
  const customConfig: PortfolioMetricsConfig = {
    healthBase: { GREEN: 0, YELLOW: 50, RED: 100 },
    alertBumpCap: 10,
    alertBumpPerWeight: 0.5,
    minConfidenceDeals: 5,
    significantLift: 2.0,
    clusterMinShare: 0.75,
    clusterMinDeals: 5,
  };

  it("uses the custom health-base and bump values instead of the defaults", () => {
    expect(computeDealRisk({ healthStatus: "GREEN", maxActiveAlertWeight: 0 }, customConfig)).toBe(0);
    // RED base 100 + min(10, 90*0.5=45) => 110 -> clamped to 100
    expect(computeDealRisk({ healthStatus: "RED", maxActiveAlertWeight: 90 }, customConfig)).toBe(100);
  });

  it("defaults to DEFAULT_PORTFOLIO_CONFIG when no config is passed (unchanged behavior)", () => {
    expect(computeDealRisk({ healthStatus: "GREEN", maxActiveAlertWeight: 0 })).toBe(10);
    expect(DEFAULT_PORTFOLIO_CONFIG.healthBase.GREEN).toBe(10);
    expect(DEFAULT_PORTFOLIO_CONFIG.alertBumpCap).toBe(25);
  });

  it("buildRiskCells honors a custom minConfidenceDeals", () => {
    const recs = [rec(), rec(), rec()]; // 3 deals
    const cellsDefault = buildRiskCells(recs, "accountManager");
    expect(cellsDefault[0].lowConfidence).toBe(false); // default minConfidenceDeals=3, 3 >= 3
    const cellsCustom = buildRiskCells(recs, "accountManager", customConfig);
    expect(cellsCustom[0].lowConfidence).toBe(true); // custom minConfidenceDeals=5, 3 < 5
  });

  it("significantCodes honors a custom lift/share/deal-count threshold", () => {
    const groups: GroupCorrelation[] = [
      { name: "Alice", dealCount: 4, alertCorrelations: [{ code: "GHOST_PIPELINE", share: 0.6, lift: 1.8 }] },
    ];
    // Default (lift>=1.5, share>=0.5, dealCount>=3): matches.
    expect(significantCodes(groups).has("GHOST_PIPELINE")).toBe(true);
    // Custom requires lift>=2.0: does not match.
    expect(significantCodes(groups, customConfig).has("GHOST_PIPELINE")).toBe(false);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm --filter @workspace/api-server exec vitest run src/lib/portfolio-metrics.test.ts`
Expected: FAIL — `PortfolioMetricsConfig`/`DEFAULT_PORTFOLIO_CONFIG` not exported, and the 4 functions don't accept a second/third argument yet.

- [ ] **Step 3: Implement the config type + defaults + threaded parameters in portfolio-metrics.ts**

In `artifacts/api-server/src/lib/portfolio-metrics.ts`, replace lines 74-87 (the block from `const HEALTH_BASE: Record<HealthStatus, number> = {` through `const CLUSTER_MIN_DEALS = 3;`) with:

```ts
export interface PortfolioMetricsConfig {
  healthBase: Record<HealthStatus, number>;
  alertBumpCap: number;
  alertBumpPerWeight: number;
  minConfidenceDeals: number;
  significantLift: number;
  clusterMinShare: number;
  clusterMinDeals: number;
}

/** The values this module used before config became DB-tunable — unchanged behavior when no config is passed. */
export const DEFAULT_PORTFOLIO_CONFIG: PortfolioMetricsConfig = {
  healthBase: { GREEN: 10, YELLOW: 45, RED: 75 },
  alertBumpCap: 25,
  alertBumpPerWeight: 0.25,
  minConfidenceDeals: 3,
  significantLift: 1.5,
  clusterMinShare: 0.5,
  clusterMinDeals: 3,
};

/** @deprecated kept for any external import; equals DEFAULT_PORTFOLIO_CONFIG.minConfidenceDeals */
export const MIN_CONFIDENCE_DEALS = DEFAULT_PORTFOLIO_CONFIG.minConfidenceDeals;
```

Then update the 4 functions to accept an optional `config` parameter, defaulting to `DEFAULT_PORTFOLIO_CONFIG`:

`computeDealRisk` (was lines 96-103):

```ts
export function computeDealRisk(
  d: { healthStatus: HealthStatus; maxActiveAlertWeight: number },
  config: PortfolioMetricsConfig = DEFAULT_PORTFOLIO_CONFIG,
): number {
  const base = config.healthBase[d.healthStatus];
  const bump = Math.min(config.alertBumpCap, d.maxActiveAlertWeight * config.alertBumpPerWeight);
  return Math.round(clamp(base + bump, 0, 100));
}
```

`buildRiskCells` (was lines 125-168) — add the `config` parameter and use it in two places (the `computeDealRisk` call and the `lowConfidence` check):

```ts
export function buildRiskCells(
  records: MetricsRecord[],
  axis: "accountManager" | "technicalLead",
  config: PortfolioMetricsConfig = DEFAULT_PORTFOLIO_CONFIG,
): RiskCell[] {
  const groups = new Map<
    string,
    { person: string; product: string; recs: MetricsRecord[] }
  >();
  for (const r of records) {
    const person = (r[axis] || "").trim() || UNASSIGNED;
    for (const product of new Set(r.products)) {
      const key = JSON.stringify([person, product]);
      let group = groups.get(key);
      if (!group) {
        group = { person, product, recs: [] };
        groups.set(key, group);
      }
      group.recs.push(r);
    }
  }

  const cells: RiskCell[] = [];
  for (const { person, product, recs } of groups.values()) {
    const meanRisk =
      recs.reduce((s, r) => s + computeDealRisk(r, config), 0) / recs.length;
    cells.push({
      person,
      product,
      dealCount: recs.length,
      tcv: recs.reduce((s, r) => s + r.tcv, 0),
      riskScore: Math.round(meanRisk),
      topAlertCodes: topCodes(recs),
      lowConfidence: recs.length < config.minConfidenceDeals,
      deals: recs.map((r) => ({
        id: r.dealId,
        dealName: r.dealName,
        accountName: r.accountName,
        salesStage: r.salesStage,
        tcv: r.tcv,
      })),
    });
  }
  return cells;
}
```

`significantCodes` (was lines 187-198):

```ts
export function significantCodes(
  groups: GroupCorrelation[],
  config: PortfolioMetricsConfig = DEFAULT_PORTFOLIO_CONFIG,
): Set<string> {
  const codes = new Set<string>();
  for (const g of groups) {
    if (g.dealCount < config.clusterMinDeals) continue;
    for (const c of g.alertCorrelations) {
      if (c.lift >= config.significantLift && c.share >= config.clusterMinShare) {
        codes.add(c.code);
      }
    }
  }
  return codes;
}
```

`pickHighestCorrelationCluster` (was lines 219-245):

```ts
export function pickHighestCorrelationCluster(
  groups: {
    manager: GroupCorrelation[];
    lead: GroupCorrelation[];
    product: GroupCorrelation[];
  },
  config: PortfolioMetricsConfig = DEFAULT_PORTFOLIO_CONFIG,
): HighestCorrelationCluster | null {
  const scopes: [HighestCorrelationCluster["scope"], GroupCorrelation[]][] = [
    ["manager", groups.manager],
    ["lead", groups.lead],
    ["product", groups.product],
  ];
  let best: HighestCorrelationCluster | null = null;
  for (const [scope, list] of scopes) {
    for (const g of list) {
      if (g.dealCount < config.clusterMinDeals) continue;
      for (const c of g.alertCorrelations) {
        if (c.share < config.clusterMinShare) continue;
        if (c.lift <= 1) continue;
        if (!best || c.lift > best.lift) {
          best = { scope, name: g.name, code: c.code, lift: c.lift, share: c.share };
        }
      }
    }
  }
  return best;
}
```

- [ ] **Step 4: Run the portfolio-metrics tests to verify they pass**

Run: `pnpm --filter @workspace/api-server exec vitest run src/lib/portfolio-metrics.test.ts`
Expected: PASS, all existing tests (unchanged defaults) plus the 4 new tests from Step 1.

- [ ] **Step 5: Write the failing test for `derivePortfolioConfig` in engine-config.test.ts**

Append to `artifacts/api-server/src/lib/engine-config.test.ts` (add `derivePortfolioConfig` to the import from `"./engine-config"`, and import `DEFAULT_PORTFOLIO_CONFIG` from `"./portfolio-metrics"`):

```ts
import { DEFAULT_PORTFOLIO_CONFIG } from "./portfolio-metrics";

describe("derivePortfolioConfig", () => {
  it("reads all 7 portfolio constants from thresholds", () => {
    const thresholds = {
      portfolio_health_base_green: 5,
      portfolio_health_base_yellow: 40,
      portfolio_health_base_red: 80,
      portfolio_alert_bump_cap: 20,
      portfolio_alert_bump_per_weight: 0.3,
      portfolio_min_confidence_deals: 4,
      portfolio_significant_lift: 1.8,
      portfolio_cluster_min_share: 0.6,
      portfolio_cluster_min_deals: 4,
    };
    expect(derivePortfolioConfig(thresholds)).toEqual({
      healthBase: { GREEN: 5, YELLOW: 40, RED: 80 },
      alertBumpCap: 20,
      alertBumpPerWeight: 0.3,
      minConfidenceDeals: 4,
      significantLift: 1.8,
      clusterMinShare: 0.6,
      clusterMinDeals: 4,
    });
  });

  it("defaults to DEFAULT_PORTFOLIO_CONFIG when thresholds are empty", () => {
    expect(derivePortfolioConfig({})).toEqual(DEFAULT_PORTFOLIO_CONFIG);
  });
});
```

- [ ] **Step 6: Run the test to verify it fails**

Run: `pnpm --filter @workspace/api-server exec vitest run src/lib/engine-config.test.ts`
Expected: FAIL — `derivePortfolioConfig is not a function`.

- [ ] **Step 7: Implement `derivePortfolioConfig`**

In `artifacts/api-server/src/lib/engine-config.ts`, add the import and function:

```ts
import { DEFAULT_PORTFOLIO_CONFIG, type PortfolioMetricsConfig } from "./portfolio-metrics";
```

```ts
/** Derive the Portfolio Risk Analysis constants from the merged thresholds. */
export function derivePortfolioConfig(thresholds: EngineThresholds): PortfolioMetricsConfig {
  return {
    healthBase: {
      GREEN: num(thresholds, "portfolio_health_base_green", DEFAULT_PORTFOLIO_CONFIG.healthBase.GREEN),
      YELLOW: num(thresholds, "portfolio_health_base_yellow", DEFAULT_PORTFOLIO_CONFIG.healthBase.YELLOW),
      RED: num(thresholds, "portfolio_health_base_red", DEFAULT_PORTFOLIO_CONFIG.healthBase.RED),
    },
    alertBumpCap: num(thresholds, "portfolio_alert_bump_cap", DEFAULT_PORTFOLIO_CONFIG.alertBumpCap),
    alertBumpPerWeight: num(thresholds, "portfolio_alert_bump_per_weight", DEFAULT_PORTFOLIO_CONFIG.alertBumpPerWeight),
    minConfidenceDeals: num(thresholds, "portfolio_min_confidence_deals", DEFAULT_PORTFOLIO_CONFIG.minConfidenceDeals),
    significantLift: num(thresholds, "portfolio_significant_lift", DEFAULT_PORTFOLIO_CONFIG.significantLift),
    clusterMinShare: num(thresholds, "portfolio_cluster_min_share", DEFAULT_PORTFOLIO_CONFIG.clusterMinShare),
    clusterMinDeals: num(thresholds, "portfolio_cluster_min_deals", DEFAULT_PORTFOLIO_CONFIG.clusterMinDeals),
  };
}
```

- [ ] **Step 8: Run the test to verify it passes**

Run: `pnpm --filter @workspace/api-server exec vitest run src/lib/engine-config.test.ts`
Expected: PASS, all tests including the 2 new ones.

- [ ] **Step 9: Add `getPortfolioConfig()` to intelligence.ts**

Update the `engine-config` import in `artifacts/api-server/src/lib/intelligence.ts` to include `derivePortfolioConfig`:

```ts
import { deriveRiskWeights, deriveRiskBoundaries, deriveHealthWeights, derivePortfolioConfig } from "./engine-config";
```

Add this function right after `getHealthWeights()` (from Task 4):

```ts
/** Portfolio Risk Analysis constants, derived from the same cached thresholds. */
export async function getPortfolioConfig() {
  const { thresholds } = await getThresholds();
  return derivePortfolioConfig(thresholds);
}
```

- [ ] **Step 10: Thread the config through portfolio.ts's 4 call sites**

In `artifacts/api-server/src/lib/portfolio.ts`:

Add `getPortfolioConfig` to the existing import line `import { assembleDealIntelligence, getThresholds } from "./intelligence";`:

```ts
import { assembleDealIntelligence, getThresholds, getPortfolioConfig } from "./intelligence";
```

In `computePortfolioAnalysis()` (the function starting at line 170), immediately after the existing `const { thresholds } = await getThresholds();` line, add:

```ts
  const portfolioConfig = await getPortfolioConfig();
```

Then update the 4 call sites within the same function to pass `portfolioConfig` as the last argument:

- `const amCells = buildRiskCells(records, "accountManager");` → `const amCells = buildRiskCells(records, "accountManager", portfolioConfig);`
- `const tlCells = buildRiskCells(records, "technicalLead");` → `const tlCells = buildRiskCells(records, "technicalLead", portfolioConfig);`
- `const sigCodes = significantCodes([...managerCorr, ...leadCorr, ...productCorr]);` → `const sigCodes = significantCodes([...managerCorr, ...leadCorr, ...productCorr], portfolioConfig);`
- `highestCorrelationCluster: pickHighestCorrelationCluster({ manager: managerCorr, lead: leadCorr, product: productCorr }),` → `highestCorrelationCluster: pickHighestCorrelationCluster({ manager: managerCorr, lead: leadCorr, product: productCorr }, portfolioConfig),`

- [ ] **Step 11: Typecheck and run tests**

Run: `pnpm run typecheck`
Expected: PASS.

Run: `pnpm --filter @workspace/api-server run test`
Expected: PASS, all suites green.

- [ ] **Step 12: Manual smoke test**

With the API server running, hit the portfolio endpoint and confirm it still returns data:

```bash
curl -s -b cookies.txt http://localhost:5000/api/v2/analytics/portfolio | head -c 500
```

(Adjust the path if the portfolio-analysis endpoint has a different route — check `routes/v2/analytics.ts` for the exact path that calls `computePortfolioAnalysis()` before running this.)
Expected: JSON response with `riskMatrix`/`summary` fields, no 500 error.

- [ ] **Step 13: Commit**

```bash
git add artifacts/api-server/src/lib/portfolio-metrics.ts artifacts/api-server/src/lib/portfolio-metrics.test.ts artifacts/api-server/src/lib/engine-config.ts artifacts/api-server/src/lib/engine-config.test.ts artifacts/api-server/src/lib/intelligence.ts artifacts/api-server/src/lib/portfolio.ts
git commit -m "feat(settings): wire portfolio-risk constants into the engine (was hardcoded)"
```

---

### Task 6: Predictive-scoring weight wiring

**Files:**
- Modify: `lib/engine/src/scoring.ts` (export `DEFAULT_SCORING_WEIGHTS`, add optional `weights` param to `computePredictiveScore`)
- Modify: `lib/engine/src/v2.test.ts` (add tests)
- Modify: `artifacts/api-server/src/lib/engine-config.ts` (add `mergeScoringWeights`)
- Modify: `artifacts/api-server/src/lib/engine-config.test.ts` (add tests)
- Modify: `artifacts/api-server/src/lib/scoring.ts` (add `getScoringWeights()`, thread into `scoreDeal`/`rescoreActiveDeals`)

**Interfaces:**
- Produces: `DEFAULT_SCORING_WEIGHTS: Record<string, number>` (scoring.ts, engine), `computePredictiveScore(input, context?, weights?)` (3rd param added, backward compatible), `mergeScoringWeights(rows): Record<string, number>` (engine-config.ts), `getScoringWeights(): Promise<Record<string, number>>` (server scoring.ts).

- [ ] **Step 1: Write the failing engine test**

Append to the existing `describe("predictive scoring", ...)` block in `lib/engine/src/v2.test.ts` (add `DEFAULT_SCORING_WEIGHTS` to the existing `import {...} from "./scoring";` line at the top of the file), right after the `"confidence reflects data completeness"` test and before the closing `});` of the describe block:

```ts
  it("DEFAULT_SCORING_WEIGHTS mirrors the 8 FACTOR defaults and sums to 100", () => {
    expect(DEFAULT_SCORING_WEIGHTS).toEqual({
      gate_momentum: 25,
      stage_velocity: 15,
      services_attachment: 10,
      executive_alignment: 15,
      blocker_load: 10,
      deal_size_confidence: 5,
      close_pressure: 10,
      historical_win_rate: 10,
    });
    expect(Object.values(DEFAULT_SCORING_WEIGHTS).reduce((a, b) => a + b, 0)).toBe(100);
  });

  it("an explicit weights override changes which factor dominates the score", () => {
    // All weight on gate_momentum (progress 95%); every other factor's weight is 0.
    const allOnGateMomentum = { ...DEFAULT_SCORING_WEIGHTS };
    for (const k of Object.keys(allOnGateMomentum)) allOnGateMomentum[k] = 0;
    allOnGateMomentum.gate_momentum = 100;

    const highProgress = computePredictiveScore(
      { ...baseScoringInput, progressPct: 95 },
      {},
      allOnGateMomentum,
    );
    const lowProgress = computePredictiveScore(
      { ...baseScoringInput, progressPct: 5 },
      {},
      allOnGateMomentum,
    );
    expect(highProgress.score).toBeGreaterThan(lowProgress.score);
    // With no weights passed, the default FACTORS weights are used (unchanged behavior).
    const defaultWeighted = computePredictiveScore(baseScoringInput);
    expect(defaultWeighted.breakdown.find((b) => b.featureId === "gate_momentum")?.weight).toBe(25);
  });
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm --filter @workspace/engine run test`
Expected: FAIL — `DEFAULT_SCORING_WEIGHTS` is not exported from `./scoring`.

- [ ] **Step 3: Implement the engine changes**

In `lib/engine/src/scoring.ts`, add this export right after the `FACTORS: Factor[] = [...]` array closes (after the `];` that ends the array, before `function clamp01`):

```ts
/** Default weight per factor id, keyed for override lookups. Sums to 100 — see TOTAL_SCORING_WEIGHT. */
export const DEFAULT_SCORING_WEIGHTS: Record<string, number> = Object.fromEntries(
  FACTORS.map((f) => [f.id, f.weight]),
);
```

Then change `computePredictiveScore`'s signature and body (currently lines 151-184):

```ts
export function computePredictiveScore(
  input: ScoringInput,
  context: ScoringContext = {},
  weights?: Record<string, number>,
): PredictiveScore {
  let weightedSum = 0;
  let totalWeight = 0;
  const breakdown: ScoreFactorResult[] = [];

  for (const f of FACTORS) {
    const w = weights?.[f.id] ?? f.weight;
    const raw = clamp01(f.extract(input, context));
    const contribution = raw * w;
    weightedSum += contribution;
    totalWeight += w;
    breakdown.push({
      featureId: f.id,
      description: f.description,
      rawScore: Math.round(raw * 100),
      weight: w,
      contribution: Math.round(contribution),
    });
  }

  const score = totalWeight > 0 ? Math.round((weightedSum / totalWeight) * 100) : 0;

  const dataPoints = [
    input.daysToClose != null,
    !!context.avgWonTCV,
    !!context.stageBenchmarkDays,
  ].filter(Boolean).length;
  const confidence: ScoreConfidence =
    dataPoints >= 3 ? "HIGH" : dataPoints >= 2 ? "MEDIUM" : "LOW";

  return { score, breakdown, confidence };
}
```

(The only substantive changes: the new `weights` parameter, `const w = weights?.[f.id] ?? f.weight;` replacing the two inline uses of `f.weight`, and the `totalWeight > 0 ? ... : 0` guard added so an all-zero override can't produce `NaN`.)

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm --filter @workspace/engine run test`
Expected: PASS, all existing + 2 new tests, 147 total.

- [ ] **Step 5: Write the failing test for `mergeScoringWeights`**

Append to `artifacts/api-server/src/lib/engine-config.test.ts` (add `mergeScoringWeights` to the `"./engine-config"` import):

```ts
describe("mergeScoringWeights", () => {
  it("overrides only the factors present in the calibrated rows, leaving the rest at default", () => {
    const merged = mergeScoringWeights([
      { featureId: "gate_momentum", calibratedWeight: 0.4 },
      { featureId: "stage_velocity", calibratedWeight: 0.05 },
    ]);
    expect(merged.gate_momentum).toBe(0.4);
    expect(merged.stage_velocity).toBe(0.05);
    // Untouched factors keep their scaled default (fraction-of-1, see Step 7).
    expect(merged.executive_alignment).toBeCloseTo(0.15, 4);
  });

  it("ignores rows with an unknown featureId or a non-finite weight", () => {
    const merged = mergeScoringWeights([
      { featureId: "not_a_real_factor", calibratedWeight: 0.9 },
      { featureId: "blocker_load", calibratedWeight: Number.NaN },
    ]);
    expect(merged.not_a_real_factor).toBeUndefined();
    expect(merged.blocker_load).toBeCloseTo(0.1, 4);
  });

  it("returns the full default set (scaled to fractions of 1) when given no rows", () => {
    const merged = mergeScoringWeights([]);
    expect(Object.values(merged).reduce((a, b) => a + b, 0)).toBeCloseTo(1, 4);
  });
});
```

- [ ] **Step 6: Run the test to verify it fails**

Run: `pnpm --filter @workspace/api-server exec vitest run src/lib/engine-config.test.ts`
Expected: FAIL — `mergeScoringWeights is not a function`.

- [ ] **Step 7: Implement `mergeScoringWeights`**

In `artifacts/api-server/src/lib/engine-config.ts`, add the import and function. Add `DEFAULT_SCORING_WEIGHTS` to a new import from `@workspace/engine`:

```ts
import { DEFAULT_SCORING_WEIGHTS } from "@workspace/engine";
```

```ts
/**
 * Merge calibrated scoring weights (from `scoring_model_weights`, stored as
 * fractions of 1 — see Task 2's seed) over the engine's default weights
 * (which are on a 0-100 scale — see DEFAULT_SCORING_WEIGHTS). Only known
 * factor ids are honored; anything else is ignored so a stray/misspelled row
 * can never silently vanish a factor from scoring.
 */
export function mergeScoringWeights(
  rows: { featureId: string; calibratedWeight: number }[],
): Record<string, number> {
  const scaledDefaults: Record<string, number> = Object.fromEntries(
    Object.entries(DEFAULT_SCORING_WEIGHTS).map(([id, w]) => [id, w / 100]),
  );
  const merged: Record<string, number> = { ...scaledDefaults };
  for (const row of rows) {
    if (row.featureId in merged && Number.isFinite(row.calibratedWeight)) {
      merged[row.featureId] = row.calibratedWeight;
    }
  }
  return merged;
}
```

Note: `computePredictiveScore` re-normalizes by `totalWeight` internally, so passing fraction-of-1 weights (e.g. `0.25`) instead of 0-100 weights (e.g. `25`) produces an identical result — the ratios between factors are what matter, not their absolute scale.

- [ ] **Step 8: Run the test to verify it passes**

Run: `pnpm --filter @workspace/api-server exec vitest run src/lib/engine-config.test.ts`
Expected: PASS, all tests including the 3 new ones.

- [ ] **Step 9: Add `getScoringWeights()` and thread it through scoring.ts**

In `artifacts/api-server/src/lib/scoring.ts`, update imports: add `desc` to the existing `import { and, eq, isNull } from "drizzle-orm";` line, add `scoringModelWeights` to the existing `@workspace/db` import list, and add two new imports:

```ts
import { and, eq, isNull, desc } from "drizzle-orm";
import {
  db,
  enterpriseDeals,
  pipelineStages,
  pricingModels,
  dealTechnicalGates,
  dealBlockers,
  blockerSeverities,
  dealScores,
  dealMemory,
  scoringModelWeights,
} from "@workspace/db";
import {
  computePredictiveScore,
  type ScoringInput,
  type ScoringContext,
} from "@workspace/engine";
import { cache, CacheKeys, CacheTtl } from "./cache";
import { mergeScoringWeights } from "./engine-config";
```

Add this new function right after `historicalContext()` (after its closing `}`, before `buildScoringInput`):

```ts
/**
 * Calibrated scoring weights, latest row per feature, merged over the engine
 * defaults. Cached under the `lookup:` tier like thresholds/FX — the cache
 * middleware drops it on any settings mutation.
 */
export async function getScoringWeights(): Promise<Record<string, number>> {
  return cache.wrap(`${CacheKeys.lookupPrefix}scoring-weights`, CacheTtl.lookup, async () => {
    const rows = await db
      .select({
        featureId: scoringModelWeights.featureId,
        calibratedWeight: scoringModelWeights.calibratedWeight,
        calibrationDate: scoringModelWeights.calibrationDate,
      })
      .from(scoringModelWeights)
      .orderBy(desc(scoringModelWeights.calibrationDate));
    const latest = new Map<string, number>();
    for (const r of rows) {
      if (!latest.has(r.featureId)) latest.set(r.featureId, Number(r.calibratedWeight));
    }
    return mergeScoringWeights(
      [...latest.entries()].map(([featureId, calibratedWeight]) => ({ featureId, calibratedWeight })),
    );
  });
}
```

Update `scoreDeal` to accept and use an optional `weights` parameter:

```ts
export async function scoreDeal(
  dealId: string,
  ctx?: ScoringContext,
  weights?: Record<string, number>,
): Promise<PersistedScore | null> {
  const input = await buildScoringInput(dealId);
  if (!input) return null;
  const context = ctx ?? (await historicalContext());
  const w = weights ?? (await getScoringWeights());
  const score = computePredictiveScore(input, context, w);
  await db.insert(dealScores).values({
    dealId,
    score: score.score,
    confidence: score.confidence,
    breakdown: score.breakdown,
  });
  return { score: score.score, confidence: score.confidence, breakdown: score.breakdown };
}
```

Update `rescoreActiveDeals` to fetch weights once and pass them through the loop (avoids re-fetching per deal, though the cache would make repeated fetches cheap regardless):

```ts
export async function rescoreActiveDeals(): Promise<number> {
  const deals = await db.select({ id: enterpriseDeals.id }).from(enterpriseDeals).where(activeFilter);
  const ctx = await historicalContext();
  const weights = await getScoringWeights();
  let count = 0;
  for (const d of deals) {
    if (await scoreDeal(d.id, ctx, weights)) count++;
  }
  return count;
}
```

- [ ] **Step 10: Typecheck and run all test suites**

Run: `pnpm run typecheck`
Expected: PASS.

Run: `pnpm --filter @workspace/engine run test && pnpm --filter @workspace/api-server run test`
Expected: PASS, all suites green.

- [ ] **Step 11: Manual smoke test**

With the API server running, trigger a rescore and confirm it succeeds (find the exact route — likely `POST /api/v2/scores/recalculate` per the OpenAPI spec's `recalculateScores` operation seen at `lib/api-spec/openapi.yaml:995-1000`):

```bash
curl -s -X POST -b cookies.txt http://localhost:5000/api/v2/scores/recalculate
```

Expected: JSON response (e.g. `{"data": {...}}`), no 500 error — confirms `getScoringWeights()` resolves against the seeded `scoring_model_weights` table from Task 2.

- [ ] **Step 12: Commit**

```bash
git add lib/engine/src/scoring.ts lib/engine/src/v2.test.ts artifacts/api-server/src/lib/engine-config.ts artifacts/api-server/src/lib/engine-config.test.ts artifacts/api-server/src/lib/scoring.ts
git commit -m "feat(settings): wire predictive-scoring factor weights into the engine (was hardcoded)"
```

---

### Task 7: Settings-audit helper

**Files:**
- Create: `artifacts/api-server/src/lib/settings-audit.ts`
- Create: `artifacts/api-server/src/lib/settings-audit.test.ts`

**Interfaces:**
- Produces: `logSettingsChange(input: SettingsChangeInput): Promise<void>` (DB-touching, not unit-tested per convention — verified via Task 8/9's manual smoke tests), `computeRollback(row): RollbackChange` (pure, unit-tested here).
- Consumes: `settingsChangeLog` (from `@workspace/db`, Task 1).

- [ ] **Step 1: Write the failing test for the pure rollback-computation function**

Create `artifacts/api-server/src/lib/settings-audit.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { computeRollback } from "./settings-audit";

describe("computeRollback", () => {
  it("an 'update' rolls back to another 'update' restoring the old value", () => {
    const result = computeRollback({
      module: "engine_thresholds",
      settingKey: "elephant_tcv_threshold",
      entityId: null,
      action: "update",
      oldValue: "250000",
      newValue: "500000",
    });
    expect(result).toEqual({
      module: "engine_thresholds",
      settingKey: "elephant_tcv_threshold",
      entityId: null,
      action: "update",
      valueToRestore: "250000",
    });
  });

  it("a 'create' rolls back to a 'deactivate'", () => {
    const result = computeRollback({
      module: "competitors",
      settingKey: "name",
      entityId: "42",
      action: "create",
      oldValue: null,
      newValue: { name: "Acme Corp" },
    });
    expect(result.action).toBe("deactivate");
    expect(result.entityId).toBe("42");
  });

  it("a 'deactivate' rolls back to a 'reactivate'", () => {
    const result = computeRollback({
      module: "team_members",
      settingKey: "name",
      entityId: "7",
      action: "deactivate",
      oldValue: { isActive: true },
      newValue: { isActive: false },
    });
    expect(result.action).toBe("reactivate");
  });

  it("a 'delete' rolls back to a 'create' restoring the deleted value", () => {
    const result = computeRollback({
      module: "webhooks",
      settingKey: "webhook_name",
      entityId: "abc",
      action: "delete",
      oldValue: { webhookName: "Slack alerts" },
      newValue: null,
    });
    expect(result.action).toBe("create");
    expect(result.valueToRestore).toEqual({ webhookName: "Slack alerts" });
  });

  it("throws for an action it doesn't know how to invert", () => {
    expect(() =>
      computeRollback({
        module: "x",
        settingKey: "y",
        entityId: null,
        action: "rollback",
        oldValue: null,
        newValue: null,
      }),
    ).toThrow(/Cannot compute rollback/);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm --filter @workspace/api-server exec vitest run src/lib/settings-audit.test.ts`
Expected: FAIL — `Cannot find module './settings-audit'`.

- [ ] **Step 3: Write the implementation**

Create `artifacts/api-server/src/lib/settings-audit.ts`:

```ts
import { db, settingsChangeLog } from "@workspace/db";

export type SettingsAction = "create" | "update" | "deactivate" | "reactivate" | "delete" | "rollback";

export interface SettingsChangeInput {
  module: string;
  settingKey: string;
  entityId?: string | null;
  action: SettingsAction;
  oldValue: unknown;
  newValue: unknown;
  dataType?: string | null;
  actor: string;
  reason?: string | null;
  rollbackOf?: string | null;
}

/**
 * Write one row to `settings_change_log`. Every settings mutation route in
 * the app calls this after its write succeeds — see Tasks 8-9. This is a
 * thin DB-touching wrapper with no branching logic, so it is verified via
 * the calling routes' manual smoke tests rather than a unit test (this
 * codebase does not unit-test `@workspace/db`-importing modules — see the
 * Global Constraints section of this plan).
 */
export async function logSettingsChange(input: SettingsChangeInput): Promise<void> {
  await db.insert(settingsChangeLog).values({
    module: input.module,
    settingKey: input.settingKey,
    entityId: input.entityId ?? null,
    action: input.action,
    oldValue: input.oldValue ?? null,
    newValue: input.newValue ?? null,
    dataType: input.dataType ?? null,
    actor: input.actor,
    reason: input.reason ?? null,
    rollbackOf: input.rollbackOf ?? null,
  });
}

export interface ChangeLogRowForRollback {
  module: string;
  settingKey: string;
  entityId: string | null;
  action: string;
  oldValue: unknown;
  newValue: unknown;
}

export interface RollbackChange {
  module: string;
  settingKey: string;
  entityId: string | null;
  action: SettingsAction;
  valueToRestore: unknown;
}

/**
 * Given a change-log row, compute what a rollback of it must write — pure,
 * no DB. The caller (Task 11's rollback route) is responsible for actually
 * applying `valueToRestore` to the right table via a per-module dispatch.
 */
export function computeRollback(row: ChangeLogRowForRollback): RollbackChange {
  switch (row.action) {
    case "update":
      return {
        module: row.module,
        settingKey: row.settingKey,
        entityId: row.entityId,
        action: "update",
        valueToRestore: row.oldValue,
      };
    case "create":
      return {
        module: row.module,
        settingKey: row.settingKey,
        entityId: row.entityId,
        action: "deactivate",
        valueToRestore: null,
      };
    case "deactivate":
      return {
        module: row.module,
        settingKey: row.settingKey,
        entityId: row.entityId,
        action: "reactivate",
        valueToRestore: null,
      };
    case "delete":
      return {
        module: row.module,
        settingKey: row.settingKey,
        entityId: row.entityId,
        action: "create",
        valueToRestore: row.oldValue,
      };
    default:
      throw new Error(`Cannot compute rollback for action "${row.action}"`);
  }
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm --filter @workspace/api-server exec vitest run src/lib/settings-audit.test.ts`
Expected: PASS, 5 tests.

- [ ] **Step 5: Typecheck**

Run: `pnpm run typecheck`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add artifacts/api-server/src/lib/settings-audit.ts artifacts/api-server/src/lib/settings-audit.test.ts
git commit -m "feat(settings): add settings-change audit helper + pure rollback computation"
```

---

### Task 8: Retrofit lookups.ts mutations to log settings changes

**Files:**
- Modify: `artifacts/api-server/src/routes/lookups.ts`

**Interfaces:**
- Consumes: `logSettingsChange` from `./../lib/settings-audit` (Task 7), `getActor` from `../lib/auth` (already used elsewhere in the codebase, e.g. `routes/audit.ts:120`).

- [ ] **Step 1: Add the imports**

At the top of `artifacts/api-server/src/routes/lookups.ts`, add two new import lines after the existing `@workspace/api-zod` import block:

```ts
import { logSettingsChange } from "../lib/settings-audit";
import { getActor } from "../lib/auth";
```

- [ ] **Step 2: Retrofit the engine-thresholds PUT handler**

The current handler (lines 363-394) reads:

```ts
router.put(
  "/lookups/engine-thresholds",
  async (req: Request, res: Response) => {
    const parsed = UpdateEngineThresholdsBody.safeParse(req.body);
    if (!parsed.success) {
      throw badRequest("Invalid thresholds payload", parsed.error.issues);
    }
    for (const update of parsed.data.updates) {
      await db
        .insert(engineThresholds)
        .values({
          parameterKey: update.parameter_key,
          parameterValue: update.parameter_value,
        })
        .onConflictDoUpdate({
          target: engineThresholds.parameterKey,
          set: { parameterValue: update.parameter_value },
        });
    }
    const rows = await db
      .select()
      .from(engineThresholds)
      .orderBy(asc(engineThresholds.parameterKey));
    const data = rows.map((r) => ({
      parameterKey: r.parameterKey,
      parameterValue: r.parameterValue,
      dataType: r.dataType,
      description: r.description,
    }));
    res.json(UpdateEngineThresholdsResponse.parse({ data }));
  },
);
```

Replace it with (reads old values in one query before the loop, logs one row per changed parameter after each upsert):

```ts
router.put(
  "/lookups/engine-thresholds",
  async (req: Request, res: Response) => {
    const parsed = UpdateEngineThresholdsBody.safeParse(req.body);
    if (!parsed.success) {
      throw badRequest("Invalid thresholds payload", parsed.error.issues);
    }
    const actor = getActor(req);
    const before = await db.select().from(engineThresholds);
    const beforeByKey = new Map(before.map((r) => [r.parameterKey, r]));
    for (const update of parsed.data.updates) {
      const prior = beforeByKey.get(update.parameter_key);
      await db
        .insert(engineThresholds)
        .values({
          parameterKey: update.parameter_key,
          parameterValue: update.parameter_value,
        })
        .onConflictDoUpdate({
          target: engineThresholds.parameterKey,
          set: { parameterValue: update.parameter_value },
        });
      await logSettingsChange({
        module: "engine_thresholds",
        settingKey: update.parameter_key,
        action: "update",
        oldValue: prior?.parameterValue ?? null,
        newValue: update.parameter_value,
        dataType: prior?.dataType ?? "number",
        actor: actor.username,
      });
    }
    const rows = await db
      .select()
      .from(engineThresholds)
      .orderBy(asc(engineThresholds.parameterKey));
    const data = rows.map((r) => ({
      parameterKey: r.parameterKey,
      parameterValue: r.parameterValue,
      dataType: r.dataType,
      description: r.description,
    }));
    res.json(UpdateEngineThresholdsResponse.parse({ data }));
  },
);
```

- [ ] **Step 3: Retrofit the fx-rates PUT handler**

The current handler (lines 410-440) reads:

```ts
router.put("/lookups/fx-rates", async (req: Request, res: Response) => {
  const parsed = UpdateFxRatesBody.safeParse(req.body);
  if (!parsed.success) {
    throw badRequest("Invalid fx rates payload", parsed.error.issues);
  }
  for (const update of parsed.data.updates) {
    await db
      .insert(fxRates)
      .values({
        baseCurrency: update.base_currency,
        quoteCurrency: update.quote_currency,
        rate: String(update.rate),
        asOf: update.as_of,
      })
      .onConflictDoUpdate({
        target: [fxRates.baseCurrency, fxRates.quoteCurrency, fxRates.asOf],
        set: { rate: String(update.rate) },
      });
  }
  const rows = await db
    .select()
    .from(fxRates)
    .orderBy(asc(fxRates.baseCurrency));
  const data = rows.map((r) => ({
    baseCurrency: r.baseCurrency,
    quoteCurrency: r.quoteCurrency,
    rate: Number(r.rate),
    asOf: r.asOf,
  }));
  res.json(UpdateFxRatesResponse.parse({ data }));
});
```

Replace it with:

```ts
router.put("/lookups/fx-rates", async (req: Request, res: Response) => {
  const parsed = UpdateFxRatesBody.safeParse(req.body);
  if (!parsed.success) {
    throw badRequest("Invalid fx rates payload", parsed.error.issues);
  }
  const actor = getActor(req);
  const before = await db.select().from(fxRates);
  const beforeByKey = new Map(
    before.map((r) => [`${r.baseCurrency}:${r.quoteCurrency}:${r.asOf}`, r]),
  );
  for (const update of parsed.data.updates) {
    const key = `${update.base_currency}:${update.quote_currency}:${update.as_of}`;
    const prior = beforeByKey.get(key);
    await db
      .insert(fxRates)
      .values({
        baseCurrency: update.base_currency,
        quoteCurrency: update.quote_currency,
        rate: String(update.rate),
        asOf: update.as_of,
      })
      .onConflictDoUpdate({
        target: [fxRates.baseCurrency, fxRates.quoteCurrency, fxRates.asOf],
        set: { rate: String(update.rate) },
      });
    await logSettingsChange({
      module: "fx_rates",
      settingKey: key,
      action: "update",
      oldValue: prior ? Number(prior.rate) : null,
      newValue: update.rate,
      dataType: "number",
      actor: actor.username,
    });
  }
  const rows = await db
    .select()
    .from(fxRates)
    .orderBy(asc(fxRates.baseCurrency));
  const data = rows.map((r) => ({
    baseCurrency: r.baseCurrency,
    quoteCurrency: r.quoteCurrency,
    rate: Number(r.rate),
    asOf: r.asOf,
  }));
  res.json(UpdateFxRatesResponse.parse({ data }));
});
```

- [ ] **Step 4: Retrofit the competitors POST handler**

The current handler (lines 119-145) reads:

```ts
router.post("/lookups/competitors", async (req: Request, res: Response) => {
  const parsed = CreateCompetitorBody.safeParse(req.body);
  if (!parsed.success) {
    throw badRequest("Invalid competitor payload", parsed.error.issues);
  }
  try {
    const [created] = await db
      .insert(competitors)
      .values({
        name: parsed.data.name,
        category: parsed.data.category ?? "IAM",
      })
      .returning();
    res.status(201).json({
      data: { id: created.id, name: created.name, category: created.category },
    });
  } catch (err) {
    if (
      err instanceof Error &&
      "code" in err &&
      (err as { code?: string }).code === "23505"
    ) {
      throw conflict("A competitor with this name already exists");
    }
    throw err;
  }
});
```

Add a `logSettingsChange` call right after the `.returning();` line, before `res.status(201)...`:

```ts
router.post("/lookups/competitors", async (req: Request, res: Response) => {
  const parsed = CreateCompetitorBody.safeParse(req.body);
  if (!parsed.success) {
    throw badRequest("Invalid competitor payload", parsed.error.issues);
  }
  const actor = getActor(req);
  try {
    const [created] = await db
      .insert(competitors)
      .values({
        name: parsed.data.name,
        category: parsed.data.category ?? "IAM",
      })
      .returning();
    await logSettingsChange({
      module: "competitors",
      settingKey: created.name,
      entityId: String(created.id),
      action: "create",
      oldValue: null,
      newValue: { name: created.name, category: created.category },
      actor: actor.username,
    });
    res.status(201).json({
      data: { id: created.id, name: created.name, category: created.category },
    });
  } catch (err) {
    if (
      err instanceof Error &&
      "code" in err &&
      (err as { code?: string }).code === "23505"
    ) {
      throw conflict("A competitor with this name already exists");
    }
    throw err;
  }
});
```

- [ ] **Step 5: Retrofit the compliance-drivers POST handler**

Find `router.post("/lookups/compliance-drivers", ...)` (it follows the same try/catch shape as the competitors handler you just changed, immediately below it). Apply the identical pattern: read `getActor(req)` before the `try`, and add a `logSettingsChange` call right after its `.returning();`, with `module: "compliance_drivers"`, `settingKey: created.name`, `entityId: String(created.id)`, `action: "create"`, `oldValue: null`, `newValue: { name: created.name }`.

- [ ] **Step 6: Retrofit the team-members POST and DELETE handlers**

The current POST handler (lines 204-236) reads:

```ts
router.post("/lookups/team-members", async (req: Request, res: Response) => {
  const parsed = CreateTeamMemberBody.safeParse(req.body);
  if (!parsed.success) {
    throw badRequest("Invalid team member payload", parsed.error.issues);
  }
  try {
    const [created] = await db
      .insert(teamMembers)
      .values({
        name: parsed.data.name,
        canBeAm: parsed.data.can_be_am ?? true,
        canBeTl: parsed.data.can_be_tl ?? false,
      })
      .returning();
    res.status(201).json({
      data: {
        id: created.id,
        name: created.name,
        can_be_am: created.canBeAm,
        can_be_tl: created.canBeTl,
      },
    });
  } catch (err) {
    if (
      err instanceof Error &&
      "code" in err &&
      (err as { code?: string }).code === "23505"
    ) {
      throw conflict("A team member with this name already exists");
    }
    throw err;
  }
});
```

Replace with:

```ts
router.post("/lookups/team-members", async (req: Request, res: Response) => {
  const parsed = CreateTeamMemberBody.safeParse(req.body);
  if (!parsed.success) {
    throw badRequest("Invalid team member payload", parsed.error.issues);
  }
  const actor = getActor(req);
  try {
    const [created] = await db
      .insert(teamMembers)
      .values({
        name: parsed.data.name,
        canBeAm: parsed.data.can_be_am ?? true,
        canBeTl: parsed.data.can_be_tl ?? false,
      })
      .returning();
    await logSettingsChange({
      module: "team_members",
      settingKey: created.name,
      entityId: String(created.id),
      action: "create",
      oldValue: null,
      newValue: { name: created.name, canBeAm: created.canBeAm, canBeTl: created.canBeTl },
      actor: actor.username,
    });
    res.status(201).json({
      data: {
        id: created.id,
        name: created.name,
        can_be_am: created.canBeAm,
        can_be_tl: created.canBeTl,
      },
    });
  } catch (err) {
    if (
      err instanceof Error &&
      "code" in err &&
      (err as { code?: string }).code === "23505"
    ) {
      throw conflict("A team member with this name already exists");
    }
    throw err;
  }
});
```

The current DELETE handler (lines 238-250) reads:

```ts
router.delete(
  "/lookups/team-members/:id",
  async (req: Request, res: Response) => {
    const { id } = DeleteTeamMemberParams.parse(req.params);
    const result = await db
      .update(teamMembers)
      .set({ isActive: false })
      .where(eq(teamMembers.id, id))
      .returning({ id: teamMembers.id });
    if (result.length === 0) throw notFound("Team member not found");
    res.json({ message: "Team member deleted" });
  },
);
```

Replace with (this is a soft-delete via `isActive`, so the correct action is `"deactivate"`):

```ts
router.delete(
  "/lookups/team-members/:id",
  async (req: Request, res: Response) => {
    const { id } = DeleteTeamMemberParams.parse(req.params);
    const actor = getActor(req);
    const result = await db
      .update(teamMembers)
      .set({ isActive: false })
      .where(eq(teamMembers.id, id))
      .returning({ id: teamMembers.id, name: teamMembers.name });
    if (result.length === 0) throw notFound("Team member not found");
    await logSettingsChange({
      module: "team_members",
      settingKey: result[0].name,
      entityId: String(id),
      action: "deactivate",
      oldValue: { isActive: true },
      newValue: { isActive: false },
      actor: actor.username,
    });
    res.json({ message: "Team member deleted" });
  },
);
```

- [ ] **Step 7: Typecheck**

Run: `pnpm run typecheck`
Expected: PASS.

- [ ] **Step 8: Manual smoke test**

With the API server running and logged in (cookie jar from Task 4's smoke test), exercise each retrofitted route and confirm a row lands in `settings_change_log`:

```bash
curl -s -X POST -b cookies.txt -H "Content-Type: application/json" -d '{"name":"Test Co"}' http://localhost:5000/api/v1/lookups/compliance-drivers
psql "postgres://postgres:postgres@localhost:5432/edc" -c "SELECT module, setting_key, action, actor FROM edc_v2.settings_change_log ORDER BY changed_at DESC LIMIT 5;"
```

Expected: the `compliance_drivers` / `create` row (and any other routes you exercised) appear, with `actor = 'commander'`.

- [ ] **Step 9: Commit**

```bash
git add artifacts/api-server/src/routes/lookups.ts
git commit -m "feat(settings): audit-log engine-thresholds, fx-rates, competitors, compliance-drivers, team-members mutations"
```

---

### Task 9: Retrofit v2/config.ts and v2/crud.ts mutations to log settings changes

**Files:**
- Modify: `artifacts/api-server/src/routes/v2/config.ts`
- Modify: `artifacts/api-server/src/routes/v2/crud.ts`

**Interfaces:**
- Consumes: `logSettingsChange` from `../../lib/settings-audit`, `getActor` from `../../lib/auth` (add these imports to both files if not already present — `config.ts`'s custom-patterns POST handler already imports `getActor`, so check before adding a duplicate; `crud.ts`'s webhooks/notification-rules handlers already import `getActor` too, per the code read for this plan).

- [ ] **Step 1: Add the `logSettingsChange` import to both files**

In `artifacts/api-server/src/routes/v2/config.ts`, add near the top (alongside other local imports):

```ts
import { logSettingsChange } from "../../lib/settings-audit";
```

In `artifacts/api-server/src/routes/v2/crud.ts`, add the same import.

- [ ] **Step 2: Retrofit the targets PUT handler in config.ts**

The current handler (lines 649-680) reads:

```ts
// PUT /v2/config/targets — upsert a period target (conflict on periodType + periodStart).
router.put("/config/targets", async (req: Request, res: Response) => {
  const body = UpsertPipelineTargetBody.parse(req.body);
  // body.periodStart is a Date (coerced by Zod's coerce.date() + useDates:true).
  // pipelineTargets.periodStart is a date column with mode:"string" → needs YYYY-MM-DD.
  const periodStartStr = body.periodStart instanceof Date
    ? body.periodStart.toISOString().slice(0, 10)
    : String(body.periodStart);
  const [row] = await db
    .insert(pipelineTargets)
    .values({
      periodType: body.periodType ?? "quarter",
      periodStart: periodStartStr,
      targetValue: String(body.targetValue),
      updatedAt: sql`NOW()`,
    })
    .onConflictDoUpdate({
      target: [pipelineTargets.periodType, pipelineTargets.periodStart],
      set: {
        targetValue: String(body.targetValue),
        updatedAt: sql`NOW()`,
      },
    })
    .returning();
  res.json({
    data: {
      id: row.id,
      periodType: row.periodType,
      periodStart: row.periodStart,
      targetValue: Number(row.targetValue),
    },
  });
});
```

Replace with (reads the prior value before the upsert, using `getActor` — add its import from `"../../lib/auth"` if `config.ts` doesn't already have it):

```ts
// PUT /v2/config/targets — upsert a period target (conflict on periodType + periodStart).
router.put("/config/targets", async (req: Request, res: Response) => {
  const body = UpsertPipelineTargetBody.parse(req.body);
  const actor = getActor(req);
  // body.periodStart is a Date (coerced by Zod's coerce.date() + useDates:true).
  // pipelineTargets.periodStart is a date column with mode:"string" → needs YYYY-MM-DD.
  const periodStartStr = body.periodStart instanceof Date
    ? body.periodStart.toISOString().slice(0, 10)
    : String(body.periodStart);
  const periodType = body.periodType ?? "quarter";
  const [priorRow] = await db
    .select()
    .from(pipelineTargets)
    .where(and(eq(pipelineTargets.periodType, periodType), eq(pipelineTargets.periodStart, periodStartStr)));
  const [row] = await db
    .insert(pipelineTargets)
    .values({
      periodType,
      periodStart: periodStartStr,
      targetValue: String(body.targetValue),
      updatedAt: sql`NOW()`,
    })
    .onConflictDoUpdate({
      target: [pipelineTargets.periodType, pipelineTargets.periodStart],
      set: {
        targetValue: String(body.targetValue),
        updatedAt: sql`NOW()`,
      },
    })
    .returning();
  await logSettingsChange({
    module: "pipeline_targets",
    settingKey: `${periodType}:${periodStartStr}`,
    entityId: String(row.id),
    action: priorRow ? "update" : "create",
    oldValue: priorRow ? Number(priorRow.targetValue) : null,
    newValue: body.targetValue,
    dataType: "number",
    actor: actor.username,
  });
  res.json({
    data: {
      id: row.id,
      periodType: row.periodType,
      periodStart: row.periodStart,
      targetValue: Number(row.targetValue),
    },
  });
});
```

Check the top of `config.ts` for an existing `and` import from `"drizzle-orm"` — if the file's current import is `import { eq, desc, sql } from "drizzle-orm";` (or similar without `and`), add `and` to it. If `getActor` is not already imported in this file, add `import { getActor } from "../../lib/auth";`.

- [ ] **Step 3: Retrofit the custom-patterns POST/PUT/DELETE handlers in config.ts**

The custom-patterns POST handler (lines 492-519) already calls `getActor(req)`. Add a `logSettingsChange` call right after the `res.status(201)` line's data is built — i.e., right before `res.status(201).json(...)`:

```ts
router.post("/custom-patterns", async (req: Request, res: Response) => {
  const b = CreateCustomPatternBody.parse(req.body);
  const actor = getActor(req);
  const [p] = await db
    .insert(customRiskPatterns)
    .values({
      patternName: b.pattern_name,
      description: b.description ?? null,
      severity: b.severity,
      weight: b.weight,
      alertMessageTemplate: b.alert_message_template,
      isActive: b.is_active ?? true,
      createdBy: actor.username,
    })
    .returning();
  if (b.conditions.length) {
    await db.insert(customPatternConditions).values(
      b.conditions.map((c) => ({
        patternId: p.id,
        fieldPath: c.field_path,
        operator: c.operator,
        comparisonValue: c.comparison_value,
        sortOrder: c.sort_order,
      })),
    );
  }
  await logSettingsChange({
    module: "custom_risk_patterns",
    settingKey: b.pattern_name,
    entityId: String(p.id),
    action: "create",
    oldValue: null,
    newValue: { patternName: b.pattern_name, severity: b.severity, weight: b.weight },
    actor: actor.username,
  });
  res.status(201).json({ data: await patternWithConditions(p.id) });
});
```

The PUT handler (lines 521-551) currently has no `actor` variable — add one, read the prior row before the update, and log after:

```ts
router.put("/custom-patterns/:id", async (req: Request, res: Response) => {
  const { id } = UpdateCustomPatternParams.parse(req.params);
  const b = UpdateCustomPatternBody.parse(req.body);
  const actor = getActor(req);
  const [prior] = await db.select().from(customRiskPatterns).where(eq(customRiskPatterns.id, id));
  const [p] = await db
    .update(customRiskPatterns)
    .set({
      patternName: b.pattern_name,
      description: b.description ?? null,
      severity: b.severity,
      weight: b.weight,
      alertMessageTemplate: b.alert_message_template,
      isActive: b.is_active ?? undefined,
      updatedAt: new Date(),
    })
    .where(eq(customRiskPatterns.id, id))
    .returning();
  if (!p) throw notFound("Pattern not found");
  await db.delete(customPatternConditions).where(eq(customPatternConditions.patternId, id));
  if (b.conditions.length) {
    await db.insert(customPatternConditions).values(
      b.conditions.map((c) => ({
        patternId: id,
        fieldPath: c.field_path,
        operator: c.operator,
        comparisonValue: c.comparison_value,
        sortOrder: c.sort_order,
      })),
    );
  }
  await logSettingsChange({
    module: "custom_risk_patterns",
    settingKey: b.pattern_name,
    entityId: String(id),
    action: "update",
    oldValue: prior ? { patternName: prior.patternName, severity: prior.severity, weight: prior.weight } : null,
    newValue: { patternName: b.pattern_name, severity: b.severity, weight: b.weight },
    actor: actor.username,
  });
  res.json({ data: await patternWithConditions(id) });
});
```

The DELETE handler (lines 553-557) currently has no `actor`/logging at all — add both:

```ts
router.delete("/custom-patterns/:id", async (req: Request, res: Response) => {
  const { id } = DeleteCustomPatternParams.parse(req.params);
  const actor = getActor(req);
  const [prior] = await db.select().from(customRiskPatterns).where(eq(customRiskPatterns.id, id));
  await db.delete(customRiskPatterns).where(eq(customRiskPatterns.id, id));
  if (prior) {
    await logSettingsChange({
      module: "custom_risk_patterns",
      settingKey: prior.patternName,
      entityId: String(id),
      action: "delete",
      oldValue: { patternName: prior.patternName, severity: prior.severity, weight: prior.weight },
      newValue: null,
      actor: actor.username,
    });
  }
  res.json({ message: "Pattern deleted" });
});
```

- [ ] **Step 4: Retrofit the notification-rules POST/PUT/DELETE handlers in crud.ts**

The POST handler (lines 404-428) already calls `getActor(req)`. Add logging right after the `.returning();` (before `res.status(201).json(...)`):

```ts
router.post("/notification-rules", async (req: Request, res: Response) => {
  const b = CreateNotificationRuleBody.parse(req.body);
  const actor = getActor(req);
  const [row] = await db
    .insert(notificationRules)
    .values({
      commanderId: actor.username,
      ruleName: b.rule_name,
      triggerEvent: b.trigger_event,
      triggerConditions: (b.trigger_conditions ?? null) as Record<string, unknown> | null,
      channel: b.channel ?? "in_app",
      isActive: b.is_active ?? true,
    })
    .returning();
  await logSettingsChange({
    module: "notification_rules",
    settingKey: b.rule_name,
    entityId: String(row.id),
    action: "create",
    oldValue: null,
    newValue: { ruleName: b.rule_name, triggerEvent: b.trigger_event, channel: row.channel },
    actor: actor.username,
  });
  res.status(201).json({
    data: {
      id: row.id,
      ruleName: row.ruleName,
      triggerEvent: row.triggerEvent,
      triggerConditions: row.triggerConditions,
      channel: row.channel,
      isActive: row.isActive,
    },
  });
});
```

The PUT handler (lines 430-455) currently has no `actor`/logging — add both, reading the prior row first:

```ts
router.put("/notification-rules/:id", async (req: Request, res: Response) => {
  const { id } = UpdateNotificationRuleParams.parse(req.params);
  const b = UpdateNotificationRuleBody.parse(req.body);
  const actor = getActor(req);
  const [prior] = await db.select().from(notificationRules).where(eq(notificationRules.id, id));
  const [row] = await db
    .update(notificationRules)
    .set({
      ruleName: b.rule_name,
      triggerEvent: b.trigger_event,
      triggerConditions: (b.trigger_conditions ?? null) as Record<string, unknown> | null,
      channel: b.channel ?? undefined,
      isActive: b.is_active ?? undefined,
    })
    .where(eq(notificationRules.id, id))
    .returning();
  if (!row) throw notFound("Rule not found");
  await logSettingsChange({
    module: "notification_rules",
    settingKey: b.rule_name,
    entityId: String(id),
    action: "update",
    oldValue: prior ? { ruleName: prior.ruleName, triggerEvent: prior.triggerEvent, channel: prior.channel } : null,
    newValue: { ruleName: row.ruleName, triggerEvent: row.triggerEvent, channel: row.channel },
    actor: actor.username,
  });
  res.json({
    data: {
      id: row.id,
      ruleName: row.ruleName,
      triggerEvent: row.triggerEvent,
      triggerConditions: row.triggerConditions,
      channel: row.channel,
      isActive: row.isActive,
    },
  });
});
```

The DELETE handler (lines 457-461) currently has no `actor`/logging — add both:

```ts
router.delete("/notification-rules/:id", async (req: Request, res: Response) => {
  const { id } = DeleteNotificationRuleParams.parse(req.params);
  const actor = getActor(req);
  const [prior] = await db.select().from(notificationRules).where(eq(notificationRules.id, id));
  await db.delete(notificationRules).where(eq(notificationRules.id, id));
  if (prior) {
    await logSettingsChange({
      module: "notification_rules",
      settingKey: prior.ruleName,
      entityId: String(id),
      action: "delete",
      oldValue: { ruleName: prior.ruleName, triggerEvent: prior.triggerEvent, channel: prior.channel },
      newValue: null,
      actor: actor.username,
    });
  }
  res.json({ message: "Rule deleted" });
});
```

- [ ] **Step 5: Retrofit the webhooks POST/PUT/DELETE handlers in crud.ts**

The POST handler (lines 328-343) already calls `getActor(req)`. Add logging right after `.returning();`:

```ts
router.post("/webhooks", async (req: Request, res: Response) => {
  const b = CreateWebhookBody.parse(req.body);
  const actor = getActor(req);
  const [row] = await db
    .insert(webhooks)
    .values({
      webhookName: b.webhook_name,
      targetUrl: b.target_url,
      secretKey: b.secret_key ?? crypto.randomBytes(24).toString("hex"),
      events: b.events,
      isActive: b.is_active ?? true,
      createdBy: actor.username,
    })
    .returning();
  await logSettingsChange({
    module: "webhooks",
    settingKey: b.webhook_name,
    entityId: String(row.id),
    action: "create",
    oldValue: null,
    newValue: { webhookName: b.webhook_name, targetUrl: b.target_url, events: b.events },
    actor: actor.username,
  });
  res.status(201).json({ data: webhookOut(row) });
});
```

The PUT handler (lines 345-361) currently has no `actor`/logging — add both:

```ts
router.put("/webhooks/:id", async (req: Request, res: Response) => {
  const { id } = UpdateWebhookParams.parse(req.params);
  const b = UpdateWebhookBody.parse(req.body);
  const actor = getActor(req);
  const [prior] = await db.select().from(webhooks).where(eq(webhooks.id, id));
  const [row] = await db
    .update(webhooks)
    .set({
      webhookName: b.webhook_name,
      targetUrl: b.target_url,
      events: b.events,
      isActive: b.is_active ?? undefined,
      ...(b.secret_key ? { secretKey: b.secret_key } : {}),
    })
    .where(eq(webhooks.id, id))
    .returning();
  if (!row) throw notFound("Webhook not found");
  await logSettingsChange({
    module: "webhooks",
    settingKey: b.webhook_name,
    entityId: String(id),
    action: "update",
    oldValue: prior ? { webhookName: prior.webhookName, targetUrl: prior.targetUrl, events: prior.events } : null,
    newValue: { webhookName: row.webhookName, targetUrl: row.targetUrl, events: row.events },
    actor: actor.username,
  });
  res.json({ data: webhookOut(row) });
});
```

The DELETE handler (lines 363-367) currently has no `actor`/logging — add both:

```ts
router.delete("/webhooks/:id", async (req: Request, res: Response) => {
  const { id } = DeleteWebhookParams.parse(req.params);
  const actor = getActor(req);
  const [prior] = await db.select().from(webhooks).where(eq(webhooks.id, id));
  await db.delete(webhooks).where(eq(webhooks.id, id));
  if (prior) {
    await logSettingsChange({
      module: "webhooks",
      settingKey: prior.webhookName,
      entityId: String(id),
      action: "delete",
      oldValue: { webhookName: prior.webhookName, targetUrl: prior.targetUrl, events: prior.events },
      newValue: null,
      actor: actor.username,
    });
  }
  res.json({ message: "Webhook deleted" });
});
```

- [ ] **Step 6: Typecheck**

Run: `pnpm run typecheck`
Expected: PASS. (If `getActor` was not previously imported in `config.ts`, this step will surface it — add `import { getActor } from "../../lib/auth";` there.)

- [ ] **Step 7: Manual smoke test**

With the API server running and logged in:

```bash
curl -s -X POST -b cookies.txt -H "Content-Type: application/json" -d '{"webhook_name":"Test Hook","target_url":"https://example.com/hook","events":["deal.created"]}' http://localhost:5000/api/v2/webhooks
psql "postgres://postgres:postgres@localhost:5432/edc" -c "SELECT module, setting_key, action FROM edc_v2.settings_change_log WHERE module = 'webhooks' ORDER BY changed_at DESC LIMIT 3;"
```

Expected: a `webhooks` / `create` row appears.

- [ ] **Step 8: Commit**

```bash
git add artifacts/api-server/src/routes/v2/config.ts artifacts/api-server/src/routes/v2/crud.ts
git commit -m "feat(settings): audit-log targets, custom-patterns, notification-rules, webhooks mutations"
```

---

### Task 10: Extend cache-middleware for new settings paths

**Files:**
- Modify: `artifacts/api-server/src/lib/cache-middleware.ts`
- Modify: `artifacts/api-server/src/lib/cache-middleware.test.ts`

**Interfaces:**
- No new exports — `GLOBAL_CONFIG_PATH`'s regex is extended so the same cache-invalidation behavior (drop `lookup:`/`intel:`/`summary:` + portfolio rollups) also fires for the new Task 11 settings-audit routes and any future `/v1/settings/` or `/v2/automation/` config route.

- [ ] **Step 1: Write the failing test**

Append to the `describe("cacheInvalidationMiddleware", ...)` block in `artifacts/api-server/src/lib/cache-middleware.test.ts`, right after the existing `"drops caches on an FX-rate change too"` test:

```ts
  it("drops caches on a settings-audit rollback (new /v1/settings/ path)", () => {
    cache.set(`${CacheKeys.lookupPrefix}scoring-weights`, { stale: true });
    run({ method: "POST", url: "/api/v1/settings/change-log/abc-123/rollback" });
    expect(cache.get(`${CacheKeys.lookupPrefix}scoring-weights`)).toBeUndefined();
  });
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm --filter @workspace/api-server exec vitest run src/lib/cache-middleware.test.ts`
Expected: FAIL — the new test's expectation is not met (`/settings/` is not yet matched by `GLOBAL_CONFIG_PATH`).

- [ ] **Step 3: Extend the regex**

In `artifacts/api-server/src/lib/cache-middleware.ts`, change:

```ts
const GLOBAL_CONFIG_PATH = /\/lookups\//;
```

to:

```ts
const GLOBAL_CONFIG_PATH = /\/lookups\/|\/settings\//;
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm --filter @workspace/api-server exec vitest run src/lib/cache-middleware.test.ts`
Expected: PASS, all existing tests plus the new one.

- [ ] **Step 5: Typecheck**

Run: `pnpm run typecheck`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add artifacts/api-server/src/lib/cache-middleware.ts artifacts/api-server/src/lib/cache-middleware.test.ts
git commit -m "feat(settings): extend global-config cache invalidation to /settings/ routes"
```

---

### Task 11: Settings-audit API (OpenAPI + routes + codegen)

**Files:**
- Modify: `lib/api-spec/openapi.yaml` (add paths + schemas)
- Create: `artifacts/api-server/src/routes/settings-audit.ts`
- Modify: `artifacts/api-server/src/routes/index.ts` (mount the new router)

**Interfaces:**
- Produces: `GET /v1/settings/change-log`, `GET /v1/settings/change-log/{id}`, `POST /v1/settings/change-log/{id}/rollback`, `GET /v1/settings/config/export`, `POST /v1/settings/config/import` — all under OpenAPI tag `settingsAudit`, generating hooks `useListSettingsChangeLog`, `useGetSettingsChange`, `useRollbackSettingsChange`, `useExportSettingsConfig`, `useImportSettingsConfig` for the (not-yet-built) frontend.
- Consumes: `settingsChangeLog` (Task 1), `computeRollback` (Task 7), `logSettingsChange` (Task 7), `engineThresholds`/`scoringModelWeights` (existing), `toISO` (from `./intelligence`, existing — reused here instead of a new date-coercion helper).

- [ ] **Step 1: Add the OpenAPI paths**

In `lib/api-spec/openapi.yaml`, find the `/v1/lookups/fx-rates:` path block (ends around line 982, right before the `# ============ V2 SOVEREIGN INTELLIGENCE ============` comment on line 984). Insert this new block immediately after the fx-rates path's closing (after line 982, before line 984):

```yaml
  /v1/settings/change-log:
    get:
      operationId: listSettingsChangeLog
      tags: [settingsAudit]
      parameters:
        - { name: module, in: query, required: false, schema: { type: string } }
        - { name: limit, in: query, required: false, schema: { type: integer, default: 50 } }
      responses:
        "200":
          description: Settings change log
          content:
            application/json:
              schema:
                $ref: "#/components/schemas/SettingsChangeLogListResponse"
  /v1/settings/change-log/{id}:
    get:
      operationId: getSettingsChange
      tags: [settingsAudit]
      parameters:
        - { name: id, in: path, required: true, schema: { type: string } }
      responses:
        "200":
          description: One change-log entry
          content:
            application/json:
              schema:
                $ref: "#/components/schemas/SettingsChangeLogEntryResponse"
  /v1/settings/change-log/{id}/rollback:
    post:
      operationId: rollbackSettingsChange
      tags: [settingsAudit]
      parameters:
        - { name: id, in: path, required: true, schema: { type: string } }
      requestBody:
        required: false
        content:
          application/json:
            schema:
              $ref: "#/components/schemas/RollbackSettingsChangeBody"
      responses:
        "200": { description: Rolled back, content: { application/json: { schema: { $ref: "#/components/schemas/GenericDataResponse" } } } }
        "409": { description: Rollback not supported for this module, content: { application/json: { schema: { $ref: "#/components/schemas/GenericDataResponse" } } } }
  /v1/settings/config/export:
    get:
      operationId: exportSettingsConfig
      tags: [settingsAudit]
      responses:
        "200": { description: Full config snapshot, content: { application/json: { schema: { $ref: "#/components/schemas/GenericDataResponse" } } } }
  /v1/settings/config/import:
    post:
      operationId: importSettingsConfig
      tags: [settingsAudit]
      requestBody:
        required: true
        content:
          application/json:
            schema:
              $ref: "#/components/schemas/ImportSettingsConfigBody"
      responses:
        "200": { description: Imported, content: { application/json: { schema: { $ref: "#/components/schemas/GenericDataResponse" } } } }
```

- [ ] **Step 2: Add the OpenAPI schemas**

Find the `EngineThreshold:` schema block (around line 3011, in the `components/schemas` section). Insert these new schemas immediately after the `ThresholdsUpdate:` schema block (which follows `EngineThresholdListResponse`, ends right before `FxRate:`):

```yaml
    SettingsChangeLogEntry:
      type: object
      properties:
        id: { type: string }
        module: { type: string }
        settingKey: { type: string }
        entityId: { type: ["string", "null"] }
        action: { type: string }
        oldValue: {}
        newValue: {}
        dataType: { type: ["string", "null"] }
        actor: { type: string }
        reason: { type: ["string", "null"] }
        rollbackOf: { type: ["string", "null"] }
        changedAt: { type: string }
      required: [id, module, settingKey, action, actor, changedAt]
    SettingsChangeLogListResponse:
      type: object
      properties:
        data:
          type: array
          items: { $ref: "#/components/schemas/SettingsChangeLogEntry" }
      required: [data]
    SettingsChangeLogEntryResponse:
      type: object
      properties:
        data: { $ref: "#/components/schemas/SettingsChangeLogEntry" }
      required: [data]
    RollbackSettingsChangeBody:
      type: object
      properties:
        reason: { type: string }
    ImportSettingsConfigBody:
      type: object
      properties:
        engineThresholds:
          type: array
          items:
            type: object
            properties:
              parameterKey: { type: string }
              parameterValue: { type: string }
            required: [parameterKey, parameterValue]
        scoringModelWeights:
          type: array
          items:
            type: object
            properties:
              featureId: { type: string }
              calibratedWeight: { type: number }
            required: [featureId, calibratedWeight]
      required: [engineThresholds, scoringModelWeights]
```

`GenericDataResponse` already exists (confirmed in use throughout `v2intel`-tagged paths) — no need to redefine it.

- [ ] **Step 3: Regenerate the Zod client**

Run: `pnpm --filter @workspace/api-spec run codegen`
Expected: exits 0, regenerates files under `lib/api-zod/src/generated/` and `lib/api-client-react/src/generated/` — confirm `ListSettingsChangeLogResponse`-style Zod exports now exist by checking for `SettingsChangeLogEntry` in `lib/api-zod/src/generated/*.ts` (`grep -rn "SettingsChangeLogEntry" lib/api-zod/src/generated/`).

- [ ] **Step 4: Write the route file**

Create `artifacts/api-server/src/routes/settings-audit.ts`:

```ts
import { Router, type IRouter, type Request, type Response } from "express";
import { eq, desc } from "drizzle-orm";
import { db, settingsChangeLog, engineThresholds, scoringModelWeights } from "@workspace/db";
import {
  ListSettingsChangeLogResponse,
  GetSettingsChangeResponse,
  RollbackSettingsChangeBody,
  ImportSettingsConfigBody,
} from "@workspace/api-zod";
import { getActor } from "../lib/auth";
import { badRequest, notFound, conflict } from "../lib/http";
import { computeRollback, logSettingsChange } from "../lib/settings-audit";
import { toISO } from "../lib/intelligence";

const router: IRouter = Router();

function toRow(r: typeof settingsChangeLog.$inferSelect) {
  return {
    id: r.id,
    module: r.module,
    settingKey: r.settingKey,
    entityId: r.entityId,
    action: r.action,
    oldValue: r.oldValue,
    newValue: r.newValue,
    dataType: r.dataType,
    actor: r.actor,
    reason: r.reason,
    rollbackOf: r.rollbackOf,
    // changedAt is a `timestamp` column — reuse the same Date|string coercion
    // the rest of the codebase already applies to timestamp columns (see
    // `toISO` in intelligence.ts and the equivalent inline check in
    // `webhookOut` in routes/v2/crud.ts) rather than assuming the pg driver
    // always hands back a Date instance.
    changedAt: toISO(r.changedAt) ?? new Date(0).toISOString(),
  };
}

router.get("/settings/change-log", async (req: Request, res: Response) => {
  const moduleFilter = typeof req.query.module === "string" ? req.query.module : undefined;
  const limit = Math.max(1, Math.min(200, Number(req.query.limit ?? 50)));
  const rows = await db
    .select()
    .from(settingsChangeLog)
    .where(moduleFilter ? eq(settingsChangeLog.module, moduleFilter) : undefined)
    .orderBy(desc(settingsChangeLog.changedAt))
    .limit(limit);
  res.json(ListSettingsChangeLogResponse.parse({ data: rows.map(toRow) }));
});

router.get("/settings/change-log/:id", async (req: Request, res: Response) => {
  const [row] = await db.select().from(settingsChangeLog).where(eq(settingsChangeLog.id, req.params.id));
  if (!row) throw notFound("Change-log entry not found");
  res.json(GetSettingsChangeResponse.parse({ data: toRow(row) }));
});

// Only engine_thresholds rollback is wired in this checkpoint — its rows are
// a single parameterKey -> parameterValue upsert. fx_rates uses a composite
// (baseCurrency, quoteCurrency, asOf) key encoded into settingKey as
// "EUR:USD:2026-07-15" (see Task 8) and every other module is an entity
// table — both need per-module unpacking that is out of scope here (see this
// plan's Global Constraints: entity-table and fx_rates rollback are
// deferred to the Governance & Audit UI phase).
router.post("/settings/change-log/:id/rollback", async (req: Request, res: Response) => {
  const body = RollbackSettingsChangeBody.safeParse(req.body ?? {});
  const actor = getActor(req);
  const [row] = await db.select().from(settingsChangeLog).where(eq(settingsChangeLog.id, req.params.id));
  if (!row) throw notFound("Change-log entry not found");

  if (row.module !== "engine_thresholds") {
    throw conflict(`Rollback not yet supported for module "${row.module}"`);
  }

  const inverse = computeRollback({
    module: row.module,
    settingKey: row.settingKey,
    entityId: row.entityId,
    action: row.action,
    oldValue: row.oldValue,
    newValue: row.newValue,
  });

  if (inverse.action !== "update" || typeof inverse.valueToRestore !== "string") {
    throw conflict(`Cannot automatically apply a "${inverse.action}" rollback for module "${row.module}"`);
  }

  await db
    .insert(engineThresholds)
    .values({ parameterKey: inverse.settingKey, parameterValue: inverse.valueToRestore })
    .onConflictDoUpdate({
      target: engineThresholds.parameterKey,
      set: { parameterValue: inverse.valueToRestore },
    });

  await logSettingsChange({
    module: row.module,
    settingKey: row.settingKey,
    action: "rollback",
    oldValue: row.newValue,
    newValue: inverse.valueToRestore,
    dataType: row.dataType,
    actor: actor.username,
    reason: body.success ? body.data.reason : undefined,
    rollbackOf: row.id,
  });

  res.json({ data: { restored: inverse.valueToRestore } });
});

router.get("/settings/config/export", async (_req: Request, res: Response) => {
  const thresholds = await db.select().from(engineThresholds);
  const scoringWeights = await db.select().from(scoringModelWeights);
  res.json({
    data: {
      exportedAt: new Date().toISOString(),
      engineThresholds: thresholds.map((t) => ({
        parameterKey: t.parameterKey,
        parameterValue: t.parameterValue,
        dataType: t.dataType,
      })),
      scoringModelWeights: scoringWeights.map((w) => ({
        featureId: w.featureId,
        calibratedWeight: w.calibratedWeight,
      })),
    },
  });
});

// Re-applies a previously exported snapshot. Scoped to the two
// engine_thresholds/scoring_model_weights-backed tables this checkpoint
// covers (same limitation as rollback — see this plan's Global Constraints).
// Each restored row is individually audit-logged with action "import" so the
// change log stays a complete record of what happened, not just that an
// import occurred.
router.post("/settings/config/import", async (req: Request, res: Response) => {
  const parsed = ImportSettingsConfigBody.safeParse(req.body);
  if (!parsed.success) {
    throw badRequest("Invalid config import payload", parsed.error.issues);
  }
  const actor = getActor(req);

  const priorThresholds = await db.select().from(engineThresholds);
  const priorByKey = new Map(priorThresholds.map((t) => [t.parameterKey, t.parameterValue]));
  for (const row of parsed.data.engineThresholds) {
    await db
      .insert(engineThresholds)
      .values({ parameterKey: row.parameterKey, parameterValue: row.parameterValue })
      .onConflictDoUpdate({
        target: engineThresholds.parameterKey,
        set: { parameterValue: row.parameterValue },
      });
    await logSettingsChange({
      module: "engine_thresholds",
      settingKey: row.parameterKey,
      action: "import",
      oldValue: priorByKey.get(row.parameterKey) ?? null,
      newValue: row.parameterValue,
      dataType: "number",
      actor: actor.username,
    });
  }

  const priorWeights = await db.select().from(scoringModelWeights);
  const priorWeightByFeature = new Map(priorWeights.map((w) => [w.featureId, w.calibratedWeight]));
  const importedAt = new Date().toISOString().slice(0, 10);
  for (const row of parsed.data.scoringModelWeights) {
    await db.insert(scoringModelWeights).values({
      featureId: row.featureId,
      calibratedWeight: String(row.calibratedWeight),
      sampleSize: 0,
      calibrationDate: importedAt,
    });
    await logSettingsChange({
      module: "scoring_model_weights",
      settingKey: row.featureId,
      action: "import",
      oldValue: priorWeightByFeature.get(row.featureId) ?? null,
      newValue: row.calibratedWeight,
      dataType: "number",
      actor: actor.username,
    });
  }

  res.json({ data: { importedThresholds: parsed.data.engineThresholds.length, importedWeights: parsed.data.scoringModelWeights.length } });
});

export default router;
```

Note: `scoringModelWeights` has no unique constraint on `featureId` alone (only an implicit uniqueness via "latest by calibrationDate", per `getScoringWeights()` in Task 6) — so importing inserts a new row per weight rather than upserting in place. This matches the table's existing append-only-history design (mirrors `deal_scores`), and `getScoringWeights()` already picks the latest row per `featureId`.

- [ ] **Step 5: Mount the router**

In `artifacts/api-server/src/routes/index.ts`, add the import and mount line. The file currently reads:

```ts
import { Router, type IRouter } from "express";
import healthRouter from "./health";
import authRouter from "./auth";
import dealsRouter from "./deals";
import gatesRouter from "./gates";
import blockersRouter from "./blockers";
import crossSellsRouter from "./crosssells";
import intelligenceRouter from "./intelligence";
import dispositionsRouter from "./dispositions";
import interventionsRouter from "./interventions";
import auditRouter from "./audit";
import batSignalRouter from "./batsignal";
import sharedRouter from "./shared";
import lookupsRouter from "./lookups";
import v2Router from "./v2";
import { cacheInvalidationMiddleware } from "../lib/cache-middleware";

const router: IRouter = Router();

router.use(healthRouter);
router.use(cacheInvalidationMiddleware);

router.use("/v1", authRouter);
router.use("/v1", sharedRouter);
router.use("/v1", dealsRouter);
router.use("/v1", gatesRouter);
router.use("/v1", blockersRouter);
router.use("/v1", crossSellsRouter);
router.use("/v1", intelligenceRouter);
router.use("/v1", dispositionsRouter);
router.use("/v1", interventionsRouter);
router.use("/v1", auditRouter);
router.use("/v1", batSignalRouter);
router.use("/v1", lookupsRouter);
router.use("/v2", v2Router);

export default router;
```

Change it to:

```ts
import { Router, type IRouter } from "express";
import healthRouter from "./health";
import authRouter from "./auth";
import dealsRouter from "./deals";
import gatesRouter from "./gates";
import blockersRouter from "./blockers";
import crossSellsRouter from "./crosssells";
import intelligenceRouter from "./intelligence";
import dispositionsRouter from "./dispositions";
import interventionsRouter from "./interventions";
import auditRouter from "./audit";
import batSignalRouter from "./batsignal";
import sharedRouter from "./shared";
import lookupsRouter from "./lookups";
import settingsAuditRouter from "./settings-audit";
import v2Router from "./v2";
import { cacheInvalidationMiddleware } from "../lib/cache-middleware";

const router: IRouter = Router();

router.use(healthRouter);
router.use(cacheInvalidationMiddleware);

router.use("/v1", authRouter);
router.use("/v1", sharedRouter);
router.use("/v1", dealsRouter);
router.use("/v1", gatesRouter);
router.use("/v1", blockersRouter);
router.use("/v1", crossSellsRouter);
router.use("/v1", intelligenceRouter);
router.use("/v1", dispositionsRouter);
router.use("/v1", interventionsRouter);
router.use("/v1", auditRouter);
router.use("/v1", batSignalRouter);
router.use("/v1", lookupsRouter);
router.use("/v1", settingsAuditRouter);
router.use("/v2", v2Router);

export default router;
```

- [ ] **Step 6: Typecheck**

Run: `pnpm run typecheck`
Expected: PASS. Fix any Zod import-name mismatches against what codegen actually produced (Orval derives names from `operationId` + response schema `$ref` — verify the exact generated names via `grep -rn "SettingsChangeLog\|GetSettingsChange\|RollbackSettingsChange" lib/api-zod/src/generated/*.ts` and adjust the import names in `settings-audit.ts` to match exactly if they differ from this plan's assumed names).

- [ ] **Step 7: Run the full test suite**

Run: `pnpm run build`
Expected: PASS (typecheck + recursive build, confirming the esbuild bundle for `api-server` still produces a valid single-file bundle with the new route wired in).

- [ ] **Step 8: Manual smoke test — the full audit + rollback loop**

With the API server running (rebuild first if needed) and logged in:

```bash
# 1. Change a threshold
curl -s -X PUT -b cookies.txt -H "Content-Type: application/json" \
  -d '{"updates":[{"parameter_key":"stale_stage_days","parameter_value":"25"}]}' \
  http://localhost:5000/api/v1/lookups/engine-thresholds

# 2. Confirm it's in the change log
curl -s -b cookies.txt "http://localhost:5000/api/v1/settings/change-log?module=engine_thresholds&limit=1"

# 3. Grab the id from step 2's response and roll it back
curl -s -X POST -b cookies.txt http://localhost:5000/api/v1/settings/change-log/<id-from-step-2>/rollback

# 4. Confirm the threshold is back to 21
curl -s -b cookies.txt http://localhost:5000/api/v1/lookups/engine-thresholds | grep -A2 stale_stage_days

# 5. Confirm the export endpoint works
curl -s -b cookies.txt http://localhost:5000/api/v1/settings/config/export | head -c 300
```

Expected: step 4 shows `"parameterValue":"21"` (restored), and a `rollback` row now exists in `settings_change_log` with `rollback_of` pointing at the id from step 2.

Also confirm the 409 path for an unsupported module:

```bash
curl -s -X POST -b cookies.txt http://localhost:5000/api/v1/settings/change-log/<id-of-a-webhooks-row>/rollback -w "\n%{http_code}\n"
```

Expected: `409` status with the `"Rollback not yet supported for module..."` message.

Finally, confirm export/import round-trip:

```bash
curl -s -b cookies.txt http://localhost:5000/api/v1/settings/config/export > /tmp/config-snapshot.json
curl -s -X POST -b cookies.txt -H "Content-Type: application/json" -d @/tmp/config-snapshot.json http://localhost:5000/api/v1/settings/config/import
psql "postgres://postgres:postgres@localhost:5432/edc" -c "SELECT module, action, count(*) FROM edc_v2.settings_change_log WHERE action = 'import' GROUP BY module, action;"
```

Expected: the import call returns `{"data":{"importedThresholds":29,"importedWeights":8}}` (29 = the original 16 + the 13 new health/portfolio rows from Task 2) and the change log shows `import` rows for both modules.

- [ ] **Step 9: Commit**

```bash
git add lib/api-spec/openapi.yaml artifacts/api-server/src/routes/settings-audit.ts artifacts/api-server/src/routes/index.ts lib/api-zod lib/api-client-react
git commit -m "feat(settings): add settings-audit API (list/get/rollback/export)"
```

---

## End-of-checkpoint verification

After all 11 tasks are complete and committed:

1. `pnpm run typecheck` — PASS.
2. `pnpm run build` — PASS.
3. `pnpm --filter @workspace/engine run test` — PASS, 147 tests (145 original + 2 from Task 6).
4. `pnpm --filter @workspace/api-server run test` — PASS, all suites including 3 new test files (`engine-config.test.ts`, `settings-audit.test.ts`) and 2 extended files (`portfolio-metrics.test.ts`, `cache-middleware.test.ts`).
5. Re-run the full Task 11 Step 8 smoke-test sequence end-to-end as a final regression check.
6. Confirm the existing Settings UI (`/settings`, all 6 current tabs) still works unchanged — this checkpoint made zero frontend changes, so a quick manual click-through of Thresholds/Custom Patterns/Smart Alerts/Webhooks/Targets/Team confirms no backend change broke the existing contract.

This completes the backend foundation. The next checkpoint (frontend, Phases 2+ of the master plan: sectioned sub-nav shell, migrating the 6 existing tabs, then the new Engine Tuning / Configuration Home / Automation Studio / Data & Entity Management / Governance panels) is a separate plan, written after this one is reviewed.
