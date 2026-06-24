import {
  pgSchema,
  uuid,
  varchar,
  text,
  integer,
  numeric,
  timestamp,
  jsonb,
  index,
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
