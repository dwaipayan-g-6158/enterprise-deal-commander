// Enterprise Deal Commander — V2 "Sovereign Intelligence" durable state.
//
// All tables live in the existing `edc_v2` Postgres schema (see ./edc_v2.ts).
// PRD references to `commander_profiles` are intentionally collapsed to a
// `created_by` / `actor` varchar here: Multi-Commander RBAC is out of scope, so
// the single commander's username is stored as a string (mirrors the existing
// `dealActivityLog.actor` convention).
//
// The `deal_memory.searchable_vector` tsvector column, its trigger, and GIN
// index are created in raw SQL (not modeled here) — Drizzle never reads it
// directly; full-text search uses raw SQL in the route layer. Apply
// lib/db/sql/deal_memory_searchable_vector.sql after `db run push` on any
// environment (including a fresh clone) — without it, /v2/memory/search and
// /v2/memory/ask fail with "column searchable_vector does not exist".

import {
  uuid,
  varchar,
  text,
  integer,
  smallint,
  numeric,
  boolean,
  timestamp,
  date,
  jsonb,
  index,
  unique,
} from "drizzle-orm/pg-core";
import { edcV2 } from "./edc_v2";
import { enterpriseDeals } from "./deals";
import { competitors } from "./lookups";

/* ------------------------------------------------------------------ F1 Webhooks */

export const webhooks = edcV2.table("webhooks", {
  id: uuid("id").primaryKey().defaultRandom(),
  webhookName: varchar("webhook_name", { length: 255 }).notNull(),
  targetUrl: text("target_url").notNull(),
  secretKey: varchar("secret_key", { length: 255 }).notNull(),
  events: text("events").array().notNull(),
  isActive: boolean("is_active").notNull().default(true),
  createdBy: varchar("created_by", { length: 255 }).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  lastTriggeredAt: timestamp("last_triggered_at", { withTimezone: true }),
  failureCount: integer("failure_count").notNull().default(0),
});

export const webhookDeliveryLog = edcV2.table(
  "webhook_delivery_log",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    webhookId: uuid("webhook_id")
      .notNull()
      .references(() => webhooks.id, { onDelete: "cascade" }),
    eventType: varchar("event_type", { length: 50 }).notNull(),
    payload: jsonb("payload").notNull().$type<Record<string, unknown>>(),
    responseStatus: integer("response_status"),
    responseBody: text("response_body"),
    success: boolean("success").notNull().default(false),
    deliveredAt: timestamp("delivered_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("webhook_delivery_idx").on(t.webhookId, t.deliveredAt.desc())],
);

/* ----------------------------------------------------- F2 Competitive Intelligence */

export const dealCompetitors = edcV2.table(
  "deal_competitors",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    dealId: uuid("deal_id")
      .notNull()
      .references(() => enterpriseDeals.id, { onDelete: "cascade" }),
    competitorId: integer("competitor_id")
      .notNull()
      .references(() => competitors.id),
    status: varchar("status", { length: 30 }).notNull().default("Active"),
    displacementStrategy: text("displacement_strategy"),
    outcomeNotes: text("outcome_notes"),
    loggedAt: timestamp("logged_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    unique("deal_competitor_uq").on(t.dealId, t.competitorId),
    index("deal_competitor_deal_idx").on(t.dealId),
  ],
);

/* --------------------------------------------------- F3 Predictive Deal Scoring */

export const dealScores = edcV2.table(
  "deal_scores",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    dealId: uuid("deal_id")
      .notNull()
      .references(() => enterpriseDeals.id, { onDelete: "cascade" }),
    score: integer("score").notNull(),
    confidence: varchar("confidence", { length: 10 }).notNull(),
    breakdown: jsonb("breakdown").notNull().$type<unknown[]>(),
    computedAt: timestamp("computed_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("deal_score_deal_time_idx").on(t.dealId, t.computedAt.desc())],
);

export const scoringModelWeights = edcV2.table("scoring_model_weights", {
  id: uuid("id").primaryKey().defaultRandom(),
  featureId: varchar("feature_id", { length: 50 }).notNull(),
  calibratedWeight: numeric("calibrated_weight", { precision: 5, scale: 4 }).notNull(),
  sampleSize: integer("sample_size").notNull(),
  calibrationDate: date("calibration_date").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

/* --------------------------------------------------- F4 Velocity Benchmarks */

// Maintained rollup (not a SQL materialized view) — recomputed from snapshots.
export const velocityBenchmarks = edcV2.table("velocity_benchmarks", {
  stageName: varchar("stage_name", { length: 50 }).primaryKey(),
  p25Days: numeric("p25_days", { precision: 10, scale: 2 }),
  medianDays: numeric("median_days", { precision: 10, scale: 2 }),
  p75Days: numeric("p75_days", { precision: 10, scale: 2 }),
  p90Days: numeric("p90_days", { precision: 10, scale: 2 }),
  sampleSize: integer("sample_size").notNull().default(0),
  computedAt: timestamp("computed_at", { withTimezone: true }).notNull().defaultNow(),
});

/* ---------------------------------------- F5/F6 Win-Loss Post-Mortem / Deal Memory */

export const dealMemory = edcV2.table(
  "deal_memory",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    dealId: uuid("deal_id").notNull(),
    accountName: varchar("account_name", { length: 255 }).notNull(),
    dealName: varchar("deal_name", { length: 255 }).notNull(),
    outcome: varchar("outcome", { length: 20 }).notNull(),
    finalTcv: numeric("final_tcv", { precision: 18, scale: 2 }),
    pricingModel: varchar("pricing_model", { length: 50 }),
    servicesTier: varchar("services_tier", { length: 60 }),
    totalGatesCompleted: integer("total_gates_completed"),
    totalBlockersEncountered: integer("total_blockers_encountered"),
    totalDaysActive: integer("total_days_active"),
    stageDurations: jsonb("stage_durations").$type<Record<string, number>>(),
    competitorsFaced: text("competitors_faced").array(),
    winLossNarrative: text("win_loss_narrative"),
    keyLessons: text("key_lessons").array(),
    recommendedPlaybookId: uuid("recommended_playbook_id"),
    tags: text("tags").array(),
    archivedAt: timestamp("archived_at", { withTimezone: true }).notNull().defaultNow(),

    // Closed-Lost Autopsy structured capture (curated by hand — the fields
    // above this point are auto-populated by the post-mortem subscriber and
    // must never be overwritten by an autopsy save). Lost-outcome-only in
    // practice, but left nullable for any outcome.
    primaryLossCategory: varchar("primary_loss_category", { length: 20 }),
    lossSubcategory: varchar("loss_subcategory", { length: 80 }),
    lossNarrative: text("loss_narrative"),
    winningCompetitorId: integer("winning_competitor_id").references(() => competitors.id),
    winBackPotential: smallint("win_back_potential"),
    winBackTimeline: varchar("win_back_timeline", { length: 20 }),
    causalChain: jsonb("causal_chain").$type<string[]>(),
    decisionMakerEngaged: boolean("decision_maker_engaged"),
    championIdentified: boolean("champion_identified"),
    productGaps: jsonb("product_gaps").$type<string[]>(),
    qualityScore: smallint("quality_score"),
    autopsyCompletedAt: timestamp("autopsy_completed_at", { withTimezone: true }),
  },
  (t) => [
    unique("deal_memory_deal_uq").on(t.dealId),
    index("deal_memory_outcome_idx").on(t.outcome),
  ],
);

/* --------------------------------------------------- F8 Stakeholder Mapping */

export const stakeholders = edcV2.table(
  "stakeholders",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    dealId: uuid("deal_id")
      .notNull()
      .references(() => enterpriseDeals.id, { onDelete: "cascade" }),
    name: varchar("name", { length: 255 }).notNull(),
    title: varchar("title", { length: 255 }),
    company: varchar("company", { length: 255 }),
    roleType: varchar("role_type", { length: 50 }).notNull(),
    influenceLevel: varchar("influence_level", { length: 20 }).notNull(),
    sentiment: varchar("sentiment", { length: 20 }).notNull().default("Neutral"),
    email: varchar("email", { length: 255 }),
    phone: varchar("phone", { length: 50 }),
    notes: text("notes"),
    reportsToId: uuid("reports_to_id"),
    isDecisionMaker: boolean("is_decision_maker").notNull().default(false),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("stakeholder_deal_idx").on(t.dealId)],
);

/* --------------------------------------------------- F9 Decision Log */

export const meetingSessions = edcV2.table("meeting_sessions", {
  id: uuid("id").primaryKey().defaultRandom(),
  sessionType: varchar("session_type", { length: 30 }).notNull(),
  title: varchar("title", { length: 255 }),
  occurredAt: timestamp("occurred_at", { withTimezone: true }).notNull(),
  durationMinutes: integer("duration_minutes"),
  attendees: text("attendees").array(),
  notes: text("notes"),
  commanderId: varchar("commander_id", { length: 255 }).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const dealDecisions = edcV2.table(
  "deal_decisions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    dealId: uuid("deal_id")
      .notNull()
      .references(() => enterpriseDeals.id, { onDelete: "cascade" }),
    meetingSessionId: uuid("meeting_session_id").references(() => meetingSessions.id),
    decisionText: text("decision_text").notNull(),
    rationale: text("rationale"),
    owner: varchar("owner", { length: 255 }).notNull(),
    status: varchar("status", { length: 20 }).notNull().default("Pending"),
    decidedAt: timestamp("decided_at", { withTimezone: true }).notNull(),
    dueDate: date("due_date"),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    commanderId: varchar("commander_id", { length: 255 }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("decision_deal_idx").on(t.dealId, t.decidedAt.desc())],
);

/* --------------------------------------------------- F10 Custom Risk Patterns */

export const customRiskPatterns = edcV2.table("custom_risk_patterns", {
  id: uuid("id").primaryKey().defaultRandom(),
  patternName: varchar("pattern_name", { length: 100 }).notNull(),
  description: text("description"),
  severity: varchar("severity", { length: 10 }).notNull(),
  weight: smallint("weight").notNull().default(50),
  alertMessageTemplate: text("alert_message_template").notNull(),
  isActive: boolean("is_active").notNull().default(true),
  createdBy: varchar("created_by", { length: 255 }).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  lastTriggeredAt: timestamp("last_triggered_at", { withTimezone: true }),
  triggerCount: integer("trigger_count").notNull().default(0),
});

export const customPatternConditions = edcV2.table(
  "custom_pattern_conditions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    patternId: uuid("pattern_id")
      .notNull()
      .references(() => customRiskPatterns.id, { onDelete: "cascade" }),
    fieldPath: varchar("field_path", { length: 100 }).notNull(),
    operator: varchar("operator", { length: 20 }).notNull(),
    comparisonValue: text("comparison_value").notNull(),
    sortOrder: smallint("sort_order").notNull(),
  },
  (t) => [unique("custom_condition_order_uq").on(t.patternId, t.sortOrder)],
);

/* --------------------------------------------------- F11 Playbook Engine */

export const playbooks = edcV2.table("playbooks", {
  id: uuid("id").primaryKey().defaultRandom(),
  playbookName: varchar("playbook_name", { length: 255 }).notNull(),
  description: text("description"),
  applicableStage: varchar("applicable_stage", { length: 50 }),
  applicableDealProfile: jsonb("applicable_deal_profile").$type<Record<string, unknown>>(),
  isActive: boolean("is_active").notNull().default(true),
  createdBy: varchar("created_by", { length: 255 }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const playbookSteps = edcV2.table(
  "playbook_steps",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    playbookId: uuid("playbook_id")
      .notNull()
      .references(() => playbooks.id, { onDelete: "cascade" }),
    stepOrder: smallint("step_order").notNull(),
    stepName: varchar("step_name", { length: 255 }).notNull(),
    description: text("description"),
    triggerCondition: text("trigger_condition"),
    recommendedAction: text("recommended_action").notNull(),
    expectedDurationDays: integer("expected_duration_days"),
    isCritical: boolean("is_critical").notNull().default(false),
  },
  (t) => [unique("playbook_step_order_uq").on(t.playbookId, t.stepOrder)],
);

// One assignment per (deal, playbook), ever — a deal's "journey" is the set of
// stage playbooks it has touched, each tracked by its own assignment row. The
// auto-assign paths (subscribers/playbook-engine.ts, autoAssignPlaybookIfMissing
// in routes/v2/config.ts) guard against re-creating an existing (deal,
// playbook) pair; this constraint makes that an enforced DB invariant too.
export const dealPlaybookAssignments = edcV2.table(
  "deal_playbook_assignments",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    dealId: uuid("deal_id")
      .notNull()
      .references(() => enterpriseDeals.id, { onDelete: "cascade" }),
    playbookId: uuid("playbook_id")
      .notNull()
      .references(() => playbooks.id),
    currentStepId: uuid("current_step_id").references(() => playbookSteps.id),
    status: varchar("status", { length: 20 }).notNull().default("Active"),
    assignedAt: timestamp("assigned_at", { withTimezone: true }).notNull().defaultNow(),
    completedAt: timestamp("completed_at", { withTimezone: true }),
  },
  (t) => [unique("deal_playbook_assignment_uq").on(t.dealId, t.playbookId)],
);

export const playbookStepCompletions = edcV2.table("playbook_step_completions", {
  id: uuid("id").primaryKey().defaultRandom(),
  assignmentId: uuid("assignment_id")
    .notNull()
    .references(() => dealPlaybookAssignments.id, { onDelete: "cascade" }),
  stepId: uuid("step_id")
    .notNull()
    .references(() => playbookSteps.id),
  completedAt: timestamp("completed_at", { withTimezone: true }).notNull().defaultNow(),
  notes: text("notes"),
  skipped: boolean("skipped").notNull().default(false),
  skipReason: text("skip_reason"),
  // Explicit action state. "skipped" boolean is kept in sync (status="skipped" ⇒ skipped=true)
  // for back-compat; new code reads status. "blocked" is a step the rep flagged as stuck — it is
  // NOT a terminal completion (excluded from progress) and feeds the risk engine as an execution gap.
  status: varchar("status", { length: 20 }).notNull().default("completed"),
});

/* ----------------------------------------- F13 Ramp Pricing & Financial Scenarios */

export const dealPricingSchedule = edcV2.table(
  "deal_pricing_schedule",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    dealId: uuid("deal_id")
      .notNull()
      .references(() => enterpriseDeals.id, { onDelete: "cascade" }),
    yearNumber: smallint("year_number").notNull(),
    productRevenue: numeric("product_revenue", { precision: 15, scale: 2 }).notNull(),
    servicesRevenue: numeric("services_revenue", { precision: 15, scale: 2 }).notNull().default("0"),
    discountPct: numeric("discount_pct", { precision: 5, scale: 2 }).default("0"),
    notes: text("notes"),
  },
  (t) => [unique("pricing_year_uq").on(t.dealId, t.yearNumber)],
);

export const financialScenarios = edcV2.table("financial_scenarios", {
  id: uuid("id").primaryKey().defaultRandom(),
  scenarioName: varchar("scenario_name", { length: 255 }).notNull(),
  description: text("description"),
  dealId: uuid("deal_id").references(() => enterpriseDeals.id, { onDelete: "cascade" }),
  isGlobal: boolean("is_global").notNull().default(false),
  modifications: jsonb("modifications").notNull().$type<unknown[]>(),
  computedResults: jsonb("computed_results").$type<Record<string, unknown>>(),
  createdBy: varchar("created_by", { length: 255 }).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

/* --------------------------------------------------- F12 Smart Alerts / Notifications */

export const notificationRules = edcV2.table("notification_rules", {
  id: uuid("id").primaryKey().defaultRandom(),
  commanderId: varchar("commander_id", { length: 255 }).notNull(),
  ruleName: varchar("rule_name", { length: 255 }).notNull(),
  triggerEvent: varchar("trigger_event", { length: 50 }).notNull(),
  triggerConditions: jsonb("trigger_conditions").$type<Record<string, unknown>>(),
  channel: varchar("channel", { length: 20 }).notNull().default("in_app"),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const notificationLog = edcV2.table(
  "notification_log",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    ruleId: uuid("rule_id").references(() => notificationRules.id, { onDelete: "set null" }),
    dealId: uuid("deal_id").references(() => enterpriseDeals.id, { onDelete: "cascade" }),
    channel: varchar("channel", { length: 20 }).notNull(),
    recipient: varchar("recipient", { length: 255 }),
    subject: text("subject"),
    message: text("message").notNull(),
    sentAt: timestamp("sent_at", { withTimezone: true }).notNull().defaultNow(),
    acknowledgedAt: timestamp("acknowledged_at", { withTimezone: true }),
  },
  (t) => [index("notification_sent_idx").on(t.sentAt.desc())],
);

/* --------------------------------------------------- F16 Custom Fields & Tags */

export const customFieldDefinitions = edcV2.table("custom_field_definitions", {
  id: uuid("id").primaryKey().defaultRandom(),
  fieldName: varchar("field_name", { length: 100 }).notNull(),
  fieldKey: varchar("field_key", { length: 100 }).notNull().unique(),
  fieldType: varchar("field_type", { length: 20 }).notNull(),
  options: jsonb("options").$type<string[]>(),
  isRequired: boolean("is_required").notNull().default(false),
  displayOrder: smallint("display_order").notNull().default(0),
  createdBy: varchar("created_by", { length: 255 }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const customFieldValues = edcV2.table(
  "custom_field_values",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    dealId: uuid("deal_id")
      .notNull()
      .references(() => enterpriseDeals.id, { onDelete: "cascade" }),
    fieldId: uuid("field_id")
      .notNull()
      .references(() => customFieldDefinitions.id, { onDelete: "cascade" }),
    valueText: text("value_text"),
    valueNumber: numeric("value_number", { precision: 15, scale: 2 }),
    valueDate: date("value_date"),
    valueSelect: text("value_select"),
    valueMultiSelect: text("value_multi_select").array(),
  },
  (t) => [unique("custom_field_value_uq").on(t.dealId, t.fieldId)],
);

export const tagDefinitions = edcV2.table("tag_definitions", {
  id: uuid("id").primaryKey().defaultRandom(),
  tagName: varchar("tag_name", { length: 50 }).notNull().unique(),
  color: varchar("color", { length: 7 }).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const dealTags = edcV2.table(
  "deal_tags",
  {
    dealId: uuid("deal_id")
      .notNull()
      .references(() => enterpriseDeals.id, { onDelete: "cascade" }),
    tagId: uuid("tag_id")
      .notNull()
      .references(() => tagDefinitions.id, { onDelete: "cascade" }),
    appliedAt: timestamp("applied_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [unique("deal_tag_pk").on(t.dealId, t.tagId)],
);

/* ------------------------------------------- Phase 3 Engagement — Achievements */

/**
 * Permanent ledger of earned achievements. Achievement criteria are
 * evaluated live on every GET /v2/analytics/engagement call; a row is
 * inserted here the first time a criterion is found true and stays forever
 * afterward, even if the underlying metric later dips back below threshold
 * (e.g. a reopened playbook step reduces the "completed" count). No FK to
 * `commanders` — single-commander app, same reasoning as every other
 * `edc_v2` durable table not needing one.
 */
export const commanderAchievements = edcV2.table("commander_achievements", {
  achievementCode: varchar("achievement_code", { length: 60 }).primaryKey(),
  earnedAt: timestamp("earned_at", { withTimezone: true }).notNull().defaultNow(),
});
