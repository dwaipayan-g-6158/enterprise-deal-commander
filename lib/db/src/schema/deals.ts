import {
  pgTable,
  uuid,
  varchar,
  text,
  integer,
  smallint,
  numeric,
  timestamp,
  date,
  boolean,
  unique,
  check,
  primaryKey,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import {
  pipelineStages,
  pricingModels,
  servicesTiers,
  productCatalog,
  blockerCategories,
  blockerSeverities,
  lossArchetypes,
  interventionChecklists,
} from "./lookups";

export const enterpriseDeals = pgTable(
  "enterprise_deals",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    dealName: varchar("deal_name", { length: 255 }).notNull(),
    accountName: varchar("account_name", { length: 255 }).notNull(),
    crmRecordUrl: text("crm_record_url"),
    accountManager: varchar("account_manager", { length: 255 }).notNull(),
    technicalLead: varchar("technical_lead", { length: 255 }).notNull(),
    salesStageId: integer("sales_stage_id")
      .notNull()
      .references(() => pipelineStages.id),
    stageEnteredAt: timestamp("stage_entered_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    productRevenue: numeric("product_revenue", { precision: 15, scale: 2 })
      .notNull()
      .default("0"),
    pricingModelId: integer("pricing_model_id")
      .notNull()
      .references(() => pricingModels.id),
    contractTermYears: integer("contract_term_years").notNull().default(1),
    dealCurrency: varchar("deal_currency", { length: 3 })
      .notNull()
      .default("USD"),
    expectedCloseDate: date("expected_close_date", { mode: "string" }),
    winProbabilityPct: smallint("win_probability_pct"),
    servicesRevenue: numeric("services_revenue", { precision: 15, scale: 2 })
      .notNull()
      .default("0"),
    servicesTierId: integer("services_tier_id")
      .notNull()
      .references(() => servicesTiers.id),
    managerStrategicBlueprint: text("manager_strategic_blueprint"),
    lossReason: text("loss_reason"),
    speakerNotes: text("speaker_notes"),
    lossArchetypeId: integer("loss_archetype_id").references(
      () => lossArchetypes.id,
    ),
    archivedAt: timestamp("archived_at", { withTimezone: true }),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (t) => [
    unique("deals_account_deal_unique").on(t.accountName, t.dealName),
    check("product_revenue_nonneg", sql`${t.productRevenue} >= 0`),
    check("services_revenue_nonneg", sql`${t.servicesRevenue} >= 0`),
    check("contract_term_min", sql`${t.contractTermYears} >= 1`),
    check(
      "win_probability_range",
      sql`${t.winProbabilityPct} IS NULL OR ${t.winProbabilityPct} BETWEEN 0 AND 100`,
    ),
  ],
);

export const dealTechnicalGates = pgTable(
  "deal_technical_gates",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    dealId: uuid("deal_id")
      .notNull()
      .references(() => enterpriseDeals.id, { onDelete: "cascade" }),
    gateCode: varchar("gate_code", { length: 30 }).notNull(),
    isCompleted: boolean("is_completed").notNull().default(false),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    completedBy: varchar("completed_by", { length: 255 }),
    notes: text("notes"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (t) => [unique("gates_deal_gate_unique").on(t.dealId, t.gateCode)],
);

export const dealCrossSells = pgTable(
  "deal_cross_sells",
  {
    dealId: uuid("deal_id")
      .notNull()
      .references(() => enterpriseDeals.id, { onDelete: "cascade" }),
    productId: uuid("product_id")
      .notNull()
      .references(() => productCatalog.id),
    isPitched: boolean("is_pitched").notNull().default(true),
    pitchedAt: timestamp("pitched_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    notes: text("notes"),
  },
  (t) => [primaryKey({ columns: [t.dealId, t.productId] })],
);

export const dealBlockers = pgTable("deal_blockers", {
  id: uuid("id").primaryKey().defaultRandom(),
  dealId: uuid("deal_id")
    .notNull()
    .references(() => enterpriseDeals.id, { onDelete: "cascade" }),
  categoryId: integer("category_id")
    .notNull()
    .references(() => blockerCategories.id),
  severityId: integer("severity_id")
    .notNull()
    .references(() => blockerSeverities.id),
  description: text("description").notNull(),
  isResolved: boolean("is_resolved").notNull().default(false),
  resolvedAt: timestamp("resolved_at", { withTimezone: true }),
  resolutionNotes: text("resolution_notes"),
  loggedAt: timestamp("logged_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
});

export const dealAuditLog = pgTable("deal_audit_log", {
  id: uuid("id").primaryKey().defaultRandom(),
  dealId: uuid("deal_id")
    .notNull()
    .references(() => enterpriseDeals.id, { onDelete: "cascade" }),
  entityType: varchar("entity_type", { length: 50 }).notNull(),
  entityId: varchar("entity_id", { length: 100 }),
  fieldChanged: varchar("field_changed", { length: 100 }).notNull(),
  oldValue: text("old_value"),
  newValue: text("new_value"),
  changedBy: varchar("changed_by", { length: 255 }).notNull(),
  changedAt: timestamp("changed_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const dealAlertDispositions = pgTable(
  "deal_alert_dispositions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    dealId: uuid("deal_id")
      .notNull()
      .references(() => enterpriseDeals.id, { onDelete: "cascade" }),
    patternCode: varchar("pattern_code", { length: 50 }).notNull(),
    disposition: varchar("disposition", { length: 20 }).notNull(),
    rationale: text("rationale"),
    snoozeUntilFieldChange: text("snooze_until_field_change"),
    createdBy: varchar("created_by", { length: 255 }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (t) => [
    unique("dispositions_deal_pattern_unique").on(t.dealId, t.patternCode),
    check(
      "disposition_state",
      sql`${t.disposition} IN ('acknowledge','accept','snooze')`,
    ),
  ],
);

export const dealReviewMarkers = pgTable("deal_review_markers", {
  dealId: uuid("deal_id")
    .primaryKey()
    .references(() => enterpriseDeals.id, { onDelete: "cascade" }),
  lastReviewedAt: timestamp("last_reviewed_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  reviewedBy: varchar("reviewed_by", { length: 255 }).notNull(),
});

export const dealInterventions = pgTable("deal_interventions", {
  id: uuid("id").primaryKey().defaultRandom(),
  dealId: uuid("deal_id")
    .notNull()
    .references(() => enterpriseDeals.id, { onDelete: "cascade" }),
  patternCode: varchar("pattern_code", { length: 50 }).notNull(),
  checklistId: integer("checklist_id")
    .notNull()
    .references(() => interventionChecklists.id),
  launchedBy: varchar("launched_by", { length: 255 }).notNull(),
  launchedAt: timestamp("launched_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const dealStageOverrides = pgTable("deal_stage_overrides", {
  id: uuid("id").primaryKey().defaultRandom(),
  dealId: uuid("deal_id")
    .notNull()
    .references(() => enterpriseDeals.id, { onDelete: "cascade" }),
  fromStage: integer("from_stage")
    .notNull()
    .references(() => pipelineStages.id),
  toStage: integer("to_stage")
    .notNull()
    .references(() => pipelineStages.id),
  patternCodes: text("pattern_codes")
    .array()
    .notNull()
    .default(sql`'{}'`),
  overrideReason: text("override_reason").notNull(),
  createdBy: varchar("created_by", { length: 255 }).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const batSignals = pgTable("bat_signals", {
  token: uuid("token").primaryKey().defaultRandom(),
  dealId: uuid("deal_id")
    .notNull()
    .references(() => enterpriseDeals.id, { onDelete: "cascade" }),
  createdBy: varchar("created_by", { length: 255 }).notNull(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});
