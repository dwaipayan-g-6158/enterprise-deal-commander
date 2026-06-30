import {
  pgSchema,
  uuid,
  varchar,
  text,
  integer,
  numeric,
  boolean,
  timestamp,
  date,
  jsonb,
  index,
  unique,
} from "drizzle-orm/pg-core";
import { enterpriseDeals } from "./deals";

/**
 * The `edc_v2` namespace holds the Phase 2 durable backbone: an append-only
 * activity stream, point-in-time deal snapshots, and a health-transition
 * history. These are intentionally DISTINCT from the Phase 1 `deal_audit_log`
 * (public schema). The audit log records field-level mutations for compliance
 * and point-in-time reconstruction; the v2 tables below record higher-level,
 * event-shaped history optimized for time-series reads and future analytics.
 *
 * Every row carries an `actor` string for forward-compatibility with a
 * multi-commander model, even though the product is single-commander today.
 */
export const edcV2 = pgSchema("edc_v2");

/**
 * Append-only stream of domain events for a deal (created, updated, stage
 * changed, gate toggled, blocker created/resolved, health changed, ...).
 * Optimized for "what happened to this deal, newest first" reads.
 */
export const dealActivityLog = edcV2.table(
  "deal_activity_log",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    dealId: uuid("deal_id")
      .notNull()
      .references(() => enterpriseDeals.id, { onDelete: "cascade" }),
    eventType: varchar("event_type", { length: 50 }).notNull(),
    entityType: varchar("entity_type", { length: 50 }).notNull(),
    entityId: varchar("entity_id", { length: 100 }),
    summary: text("summary").notNull(),
    metadata: jsonb("metadata").$type<Record<string, unknown>>(),
    actor: varchar("actor", { length: 255 }).notNull(),
    occurredAt: timestamp("occurred_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    index("activity_deal_time_idx").on(t.dealId, t.occurredAt.desc()),
    index("activity_deal_event_idx").on(t.dealId, t.eventType),
  ],
);

/**
 * Point-in-time snapshot of a deal's serialized state + gate state + a compact
 * governance summary. Captured on significant events and by a periodic job so
 * history is durable even if no event fires for a while.
 */
export const dealSnapshots = edcV2.table(
  "deal_snapshots",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    dealId: uuid("deal_id")
      .notNull()
      .references(() => enterpriseDeals.id, { onDelete: "cascade" }),
    reason: varchar("reason", { length: 60 }).notNull(),
    triggerEvent: varchar("trigger_event", { length: 50 }),
    healthStatus: varchar("health_status", { length: 10 }).notNull(),
    salesStageId: integer("sales_stage_id"),
    salesStage: varchar("sales_stage", { length: 50 }),
    calculatedTcv: numeric("calculated_tcv", { precision: 18, scale: 2 }),
    normalizedTcv: numeric("normalized_tcv", { precision: 18, scale: 2 }),
    payload: jsonb("payload").notNull().$type<Record<string, unknown>>(),
    createdBy: varchar("created_by", { length: 255 }).notNull(),
    snapshotAt: timestamp("snapshot_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [index("snapshot_deal_time_idx").on(t.dealId, t.snapshotAt.desc())],
);

/**
 * Transition log of a deal's governance health (RED/AMBER/GREEN). One row per
 * change; the latest row is the current recorded health for the deal.
 */
export const dealHealthHistory = edcV2.table(
  "deal_health_history",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    dealId: uuid("deal_id")
      .notNull()
      .references(() => enterpriseDeals.id, { onDelete: "cascade" }),
    fromStatus: varchar("from_status", { length: 10 }),
    toStatus: varchar("to_status", { length: 10 }).notNull(),
    reason: text("reason"),
    actor: varchar("actor", { length: 255 }).notNull(),
    changedAt: timestamp("changed_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [index("health_deal_time_idx").on(t.dealId, t.changedAt.desc())],
);

/**
 * Precomputed portfolio/summary rollups. Each row is one named aggregate (e.g.
 * `summary`, `portfolio-analysis`) whose `payload` is the fully-assembled
 * response body for the matching read endpoint.
 *
 * These rollups are derived from the JS intelligence engine (health/alerts are
 * computed in-process, not in SQL), so this is a maintained table rather than a
 * Postgres materialized view: the periodic refresh job recomputes and upserts
 * each row, and any deal mutation deletes the rows so reads fall back to live
 * compute until the next refresh repopulates them.
 */
export const portfolioRollups = edcV2.table("portfolio_rollups", {
  name: varchar("name", { length: 60 }).primaryKey(),
  payload: jsonb("payload").notNull().$type<Record<string, unknown>>(),
  computedAt: timestamp("computed_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

/**
 * Append-only log of every deal stage transition (forward, backward, or skip).
 * Captures the pipeline velocity signal used by the Pipeline Flow Analytics
 * engine. `transitioned_at` is the moment the transition took effect (not the
 * row-insert time), and the natural key (deal_id, transitioned_at) prevents
 * duplicate events.
 */
export const pipelineTransitions = edcV2.table(
  "pipeline_transitions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    dealId: uuid("deal_id")
      .notNull()
      .references(() => enterpriseDeals.id, { onDelete: "cascade" }),
    fromStageId: integer("from_stage_id"),
    toStageId: integer("to_stage_id"),
    transitionType: varchar("transition_type", { length: 20 }).notNull(),
    tcvAtTransition: numeric("tcv_at_transition", { precision: 18, scale: 2 }),
    daysInFromStage: integer("days_in_from_stage"),
    overridden: boolean("overridden").notNull().default(false),
    transitionedAt: timestamp("transitioned_at", { withTimezone: true }).notNull(),
    createdBy: varchar("created_by", { length: 255 }).notNull(),
  },
  (t) => [
    index("transitions_deal_time_idx").on(t.dealId, t.transitionedAt.desc()),
    index("transitions_time_idx").on(t.transitionedAt.desc()),
    unique("transitions_natural_key").on(t.dealId, t.transitionedAt),
  ],
);

/**
 * Quarterly (or custom period) pipeline targets. One row per period; the
 * Pipeline Flow Analytics engine uses these to compute attainment metrics.
 */
export const pipelineTargets = edcV2.table(
  "pipeline_targets",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    periodType: varchar("period_type", { length: 10 }).notNull().default("quarter"),
    periodStart: date("period_start", { mode: "string" }).notNull(),
    targetValue: numeric("target_value", { precision: 18, scale: 2 }).notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [unique("targets_period_unique").on(t.periodType, t.periodStart)],
);
