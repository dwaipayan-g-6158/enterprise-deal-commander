import {
  pgTable,
  serial,
  smallint,
  varchar,
  text,
  boolean,
  uuid,
  timestamp,
  numeric,
  date,
  jsonb,
  unique,
  check,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";

export const pipelineStages = pgTable("pipeline_stages", {
  id: serial("id").primaryKey(),
  stageName: varchar("stage_name", { length: 50 }).notNull().unique(),
  sortOrder: smallint("sort_order").notNull(),
  description: text("description"),
  isActive: boolean("is_active").notNull().default(true),
});

export const pricingModels = pgTable("pricing_models", {
  id: serial("id").primaryKey(),
  modelName: varchar("model_name", { length: 50 }).notNull().unique(),
  isActive: boolean("is_active").notNull().default(true),
});

export const servicesTiers = pgTable("services_tiers", {
  id: serial("id").primaryKey(),
  tierName: varchar("tier_name", { length: 60 }).notNull().unique(),
  isActive: boolean("is_active").notNull().default(true),
});

export const productCatalog = pgTable("product_catalog", {
  id: uuid("id").primaryKey().defaultRandom(),
  productName: varchar("product_name", { length: 255 }).notNull().unique(),
  productCategory: varchar("product_category", { length: 100 }),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const blockerCategories = pgTable("blocker_categories", {
  id: serial("id").primaryKey(),
  categoryName: varchar("category_name", { length: 30 }).notNull().unique(),
  isActive: boolean("is_active").notNull().default(true),
});

export const blockerSeverities = pgTable("blocker_severities", {
  id: serial("id").primaryKey(),
  severityName: varchar("severity_name", { length: 10 }).notNull().unique(),
  sortOrder: smallint("sort_order").notNull(),
});

export const lossArchetypes = pgTable("loss_archetypes", {
  id: serial("id").primaryKey(),
  archetypeName: varchar("archetype_name", { length: 80 }).notNull().unique(),
  isActive: boolean("is_active").notNull().default(true),
});

export const gateDefinitions = pgTable(
  "gate_definitions",
  {
    id: serial("id").primaryKey(),
    gateGroup: smallint("gate_group").notNull(),
    gateCode: varchar("gate_code", { length: 30 }).notNull().unique(),
    label: varchar("label", { length: 150 }).notNull(),
    description: text("description"),
    sortOrder: smallint("sort_order").notNull(),
    prerequisiteGateCodes: text("prerequisite_gate_codes")
      .array()
      .notNull()
      .default(sql`'{}'`),
    isActive: boolean("is_active").notNull().default(true),
  },
  (t) => [check("gate_group_range", sql`${t.gateGroup} BETWEEN 1 AND 5`)],
);

export const engineThresholds = pgTable("engine_thresholds", {
  id: serial("id").primaryKey(),
  parameterKey: varchar("parameter_key", { length: 100 }).notNull().unique(),
  parameterValue: text("parameter_value").notNull(),
  dataType: varchar("data_type", { length: 20 }).notNull().default("number"),
  description: text("description"),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
});

export const fxRates = pgTable(
  "fx_rates",
  {
    id: serial("id").primaryKey(),
    baseCurrency: varchar("base_currency", { length: 3 }).notNull(),
    quoteCurrency: varchar("quote_currency", { length: 3 }).notNull(),
    rate: numeric("rate", { precision: 18, scale: 8 }).notNull(),
    asOf: date("as_of", { mode: "string" }).notNull(),
  },
  (t) => [
    unique("fx_rates_unique").on(t.baseCurrency, t.quoteCurrency, t.asOf),
    check("fx_rate_positive", sql`${t.rate} > 0`),
  ],
);

export const interventionChecklists = pgTable(
  "intervention_checklists",
  {
    id: serial("id").primaryKey(),
    triggerPatternCode: varchar("trigger_pattern_code", {
      length: 50,
    }).notNull(),
    name: varchar("name", { length: 150 }).notNull(),
    steps: jsonb("steps").notNull().$type<string[]>(),
    isActive: boolean("is_active").notNull().default(true),
  },
  (t) => [unique("intervention_unique").on(t.triggerPatternCode, t.name)],
);
