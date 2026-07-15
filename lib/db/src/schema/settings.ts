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
  AnyPgColumn,
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
    rollbackOf: uuid("rollback_of").references((): AnyPgColumn => settingsChangeLog.id),
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
