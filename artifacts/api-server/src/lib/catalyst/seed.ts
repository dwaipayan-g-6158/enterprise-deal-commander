// Catalyst Data Store seed — the port of ../../seed.ts (the Drizzle/Postgres
// seed), which stays the behavioural reference for ordering, guards, and how
// names/day-offsets resolve to ids and Dates.
//
// Why this is a library module driven by an HTTP route rather than a CLI
// script: the Data Store SDK initialises from the AppSail gateway's own
// request headers (`initCatalystApp(req)`), so it is simply not reachable from
// localhost. The seed therefore has to run *inside* the deployed app, which
// means it must behave like request code, not like a script:
//
//   * NO `process.exit` anywhere — this runs in a live HTTP handler.
//   * Every phase must finish inside AppSail's 30-second request timeout, so
//     writes go through `insertRows` (one bulk call per table) rather than one
//     `insertRow` per row. All 108 deal_technical_gates rows are ONE call.
//   * Every phase is independently re-runnable and safe to run twice: Data
//     Store has no transactions, so a mid-way failure leaves earlier chunks
//     written and the operator just re-runs the phase.
//
// Deliberately NOT ported: `seedCommander`. Authentication is now Catalyst
// embedded auth (see lib/auth.ts's resolveCommander) — commander rows are
// provisioned from a real Catalyst identity on first sign-in. A seeded row
// carrying a bcrypt hash and no `catalyst_user_id` would be dead data that
// nothing can ever sign into, and worse, it would sit in the same table role
// resolution reads from. The first admin is bootstrapped by
// SUPER_ADMIN_EMAIL / first-commander-ever instead.
//
// Predictive scores are also not computed here (seed.ts ends with
// `rescoreActiveDeals`): that is a separate, already-migrated endpoint
// (`POST /api/v2/scores/recalculate`, routes/v2/analytics.ts) and keeping it
// out of the seed keeps each phase comfortably inside the request timeout.

import {
  fetchAllRows,
  insertRows,
  updateRow,
  deleteRow,
  nextAppId,
  formatBoolean,
  formatCatalystDateTime,
  toJson,
  type CatalystApp,
  type RawRow,
} from "@workspace/db/catalyst";
import { QUESTION_CATALOG } from "@workspace/engine";
import { logger } from "../logger";
import {
  PIPELINE_STAGES,
  PRICING_MODELS,
  SERVICES_TIERS,
  TEAM_MEMBERS,
  TAG_DEFINITIONS,
  PRODUCT_CATALOG,
  AD360_FEATURES,
  COMPETITORS,
  COMPLIANCE_DRIVERS,
  BLOCKER_CATEGORIES,
  BLOCKER_SEVERITIES,
  LOSS_ARCHETYPES,
  GATE_DEFINITIONS,
  ALL_GATE_CODES,
  INTERVENTION_CHECKLISTS,
  COMPETITOR_BATTLECARDS,
  ENGINE_THRESHOLDS,
  FX_RATES,
  SCORING_MODEL_WEIGHTS,
  SEGMENTS,
  DEAL_TYPES,
  AUTOMATION_RULE_TEMPLATES,
  PLAYBOOK_SEEDS,
  DEAL_SEEDS,
} from "../../seed-data";

/**
 * Per-table rows written by one phase.
 *
 * Every table the phase is responsible for is always present as a key, so a
 * value of 0 is the explicit "already seeded, nothing written" signal — that
 * is what a re-run of an already-complete phase returns, mirroring
 * seed.ts's `onConflictDoNothing` / presence-probe guards.
 */
export type SeedSummary = Record<string, number>;

// Data Store table names. The `edc_v2.*` Postgres schema is flattened to a
// `v2_` prefix (docs/CATALYST_SCHEMA.md) — everything from lookups.ts /
// deals.ts keeps its original name.
const TABLE = {
  pipelineStages: "pipeline_stages",
  pricingModels: "pricing_models",
  servicesTiers: "services_tiers",
  teamMembers: "team_members",
  tagDefinitions: "v2_tag_definitions",
  productCatalog: "product_catalog",
  ad360Features: "ad360_features",
  competitors: "competitors",
  complianceDrivers: "compliance_drivers",
  blockerCategories: "blocker_categories",
  blockerSeverities: "blocker_severities",
  lossArchetypes: "loss_archetypes",
  gateDefinitions: "gate_definitions",
  interventionChecklists: "intervention_checklists",
  competitorBattlecards: "competitor_battlecards",
  engineThresholds: "engine_thresholds",
  fxRates: "fx_rates",
  scoringModelWeights: "v2_scoring_model_weights",
  segments: "segments",
  dealTypes: "deal_types",
  automationRuleTemplates: "v2_automation_rule_templates",

  playbooks: "v2_playbooks",
  playbookSteps: "v2_playbook_steps",
  meddpiccQuestions: "v2_meddpicc_questions",
  dealMeddpiccAnswers: "v2_deal_meddpicc_answers",
  dealMeddpiccScores: "v2_deal_meddpicc_scores",

  enterpriseDeals: "enterprise_deals",
  dealTechnicalGates: "deal_technical_gates",
  dealProductInterests: "deal_product_interests",
  dealCrossSells: "deal_cross_sells",
  dealComplianceDrivers: "deal_compliance_drivers",
  dealBlockers: "deal_blockers",
  dealMemory: "v2_deal_memory",
  dealCompetitors: "v2_deal_competitors",
  dealDecisions: "v2_deal_decisions",
} as const;

/* ------------------------------------------------------------------ Helpers */

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

/** `stage_entered_at` etc. — now minus N days. Same as seed.ts's daysAgo. */
function daysAgo(n: number): Date {
  return new Date(Date.now() - n * 24 * 60 * 60 * 1000);
}

/** A `date` column value N days from today (negative = past). Same as seed.ts's dateInDays. */
function dateInDays(n: number): string {
  return new Date(Date.now() + n * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
}

/**
 * seed.ts resolves every lookup with a non-null assertion (`.find(...)!`),
 * which is fine for a script that dies loudly. Over HTTP a phase can be run
 * out of order, so turn the same failure into an actionable message instead of
 * a bare "cannot read property id of undefined".
 */
function must<T>(value: T | undefined, what: string): T {
  if (value === undefined) {
    throw new Error(`Seed could not resolve ${what} — run the "lookups" phase first.`);
  }
  return value;
}

interface MissingRowSpec<T> {
  table: string;
  seeds: readonly T[];
  /** Column holding this table's business-unique value, read off an existing row. */
  keyColumn: string;
  /** The same value derived from a seed literal. */
  keyOfSeed: (seed: T) => string;
  /**
   * How this table's primary identity is minted:
   *   "serial" — app-managed int `id`, allocated with the established
   *              nextAppId() max+1 scheme (docs/CATALYST_SCHEMA.md's Identity
   *              section: Data Store's own ROWID is a bigint that exceeds
   *              Number.MAX_SAFE_INTEGER and must never be exposed as the id).
   *   "uuid"   — `crypto.randomUUID()`, pre-minted in JS.
   */
  identity: "serial" | "uuid";
  /** Column payload for a seed row, excluding `id`. */
  values: (seed: T) => Record<string, unknown>;
}

/**
 * Insert only the seed rows that aren't in the table yet, in ONE bulk call.
 *
 * This is the Catalyst equivalent of `onConflictDoNothing`: Data Store has no
 * ON CONFLICT, so the "already there?" test is an in-memory set built from a
 * single full-table read (the same read/filter-in-JS pattern the whole
 * repository layer uses — see docs/catalyst-datastore-constraints.md).
 *
 * `nextAppId()` is designed for one insert at a time, so for a bulk insert it
 * is called once for the first id and then incremented locally — a contiguous
 * block, not a second id-allocation scheme.
 */
async function seedMissingRows<T>(
  catalystApp: CatalystApp,
  summary: SeedSummary,
  spec: MissingRowSpec<T>,
): Promise<void> {
  const existing = await fetchAllRows(catalystApp, spec.table);
  const present = new Set(existing.map((r) => r[spec.keyColumn]));
  const missing = spec.seeds.filter((s) => !present.has(spec.keyOfSeed(s)));
  summary[spec.table] = 0;
  if (missing.length === 0) return;

  let nextId = spec.identity === "serial" ? nextAppId(existing) : 0;
  const rows = missing.map((seed) => {
    const id = spec.identity === "serial" ? nextId++ : crypto.randomUUID();
    return { id, ...spec.values(seed) };
  });
  await insertRows(catalystApp, spec.table, rows);
  summary[spec.table] = rows.length;
}

/** Deactivate a retired lookup row if a legacy copy of it still exists. */
async function deactivateIfPresent(
  catalystApp: CatalystApp,
  table: string,
  keyColumn: string,
  keyValue: string,
): Promise<void> {
  const rows = await fetchAllRows(catalystApp, table);
  for (const row of rows.filter((r) => r[keyColumn] === keyValue)) {
    await updateRow(catalystApp, table, row["ROWID"], { is_active: formatBoolean(false) });
  }
}

/* ------------------------------------------------------------- Phase: lookups */

/**
 * The 21 reference-data tables (~194 rows).
 *
 * Row-level idempotent throughout: a re-run writes only rows that are missing,
 * so a partially-failed run heals itself and a complete one reports all zeros.
 */
export async function seedLookupsCatalyst(catalystApp: CatalystApp): Promise<SeedSummary> {
  const summary: SeedSummary = {};
  const now = formatCatalystDateTime(new Date());
  const asOf = today();

  await seedMissingRows(catalystApp, summary, {
    table: TABLE.pipelineStages,
    seeds: PIPELINE_STAGES,
    keyColumn: "stage_name",
    keyOfSeed: (s) => s.stageName,
    identity: "serial",
    values: (s) => ({
      stage_name: s.stageName,
      sort_order: s.sortOrder,
      description: s.description,
      is_active: formatBoolean(true),
    }),
  });

  await seedMissingRows(catalystApp, summary, {
    table: TABLE.pricingModels,
    seeds: PRICING_MODELS,
    keyColumn: "model_name",
    keyOfSeed: (s) => s.modelName,
    identity: "serial",
    values: (s) => ({ model_name: s.modelName, is_active: formatBoolean(true) }),
  });
  // B1: "Hybrid" retired — deactivate any pre-existing row so listActive() hides it.
  await deactivateIfPresent(catalystApp, TABLE.pricingModels, "model_name", "Hybrid");

  await seedMissingRows(catalystApp, summary, {
    table: TABLE.servicesTiers,
    seeds: SERVICES_TIERS,
    keyColumn: "tier_name",
    keyOfSeed: (s) => s.tierName,
    identity: "serial",
    values: (s) => ({ tier_name: s.tierName, is_active: formatBoolean(true) }),
  });
  // B3: "Managed Services Contract" retired — same reasoning as "Hybrid" above.
  await deactivateIfPresent(catalystApp, TABLE.servicesTiers, "tier_name", "Managed Services Contract");

  await seedMissingRows(catalystApp, summary, {
    table: TABLE.teamMembers,
    seeds: TEAM_MEMBERS,
    keyColumn: "name",
    keyOfSeed: (s) => s.name,
    identity: "serial",
    values: (s) => ({
      name: s.name,
      can_be_am: formatBoolean(s.canBeAm),
      can_be_tl: formatBoolean(s.canBeTl),
      is_active: formatBoolean(true),
    }),
  });

  await seedMissingRows(catalystApp, summary, {
    table: TABLE.tagDefinitions,
    seeds: TAG_DEFINITIONS,
    keyColumn: "tag_name",
    keyOfSeed: (s) => s.tagName,
    identity: "uuid",
    values: (s) => ({ tag_name: s.tagName, color: s.color, created_at: now }),
  });

  await seedMissingRows(catalystApp, summary, {
    table: TABLE.productCatalog,
    seeds: PRODUCT_CATALOG,
    keyColumn: "code",
    keyOfSeed: (s) => s.code,
    identity: "uuid",
    values: (s) => ({
      code: s.code,
      product_name: s.productName,
      product_category: s.productCategory,
      suite: s.suite,
      is_active: formatBoolean(true),
      created_at: now,
    }),
  });

  await seedMissingRows(catalystApp, summary, {
    table: TABLE.ad360Features,
    seeds: AD360_FEATURES,
    keyColumn: "code",
    keyOfSeed: (s) => s.code,
    identity: "serial",
    values: (s) => ({
      code: s.code,
      label: s.label,
      sort_order: s.sortOrder,
      is_active: formatBoolean(true),
    }),
  });

  await seedMissingRows(catalystApp, summary, {
    table: TABLE.competitors,
    seeds: COMPETITORS,
    keyColumn: "name",
    keyOfSeed: (s) => s.name,
    identity: "serial",
    values: (s) => ({ name: s.name, category: s.category, is_active: formatBoolean(true) }),
  });

  await seedMissingRows(catalystApp, summary, {
    table: TABLE.complianceDrivers,
    seeds: COMPLIANCE_DRIVERS,
    keyColumn: "name",
    keyOfSeed: (s) => s.name,
    identity: "serial",
    values: (s) => ({ name: s.name, is_active: formatBoolean(true) }),
  });

  await seedMissingRows(catalystApp, summary, {
    table: TABLE.blockerCategories,
    seeds: BLOCKER_CATEGORIES,
    keyColumn: "category_name",
    keyOfSeed: (s) => s.categoryName,
    identity: "serial",
    values: (s) => ({ category_name: s.categoryName, is_active: formatBoolean(true) }),
  });

  // blocker_severities is the one lookup table with no `is_active` column.
  await seedMissingRows(catalystApp, summary, {
    table: TABLE.blockerSeverities,
    seeds: BLOCKER_SEVERITIES,
    keyColumn: "severity_name",
    keyOfSeed: (s) => s.severityName,
    identity: "serial",
    values: (s) => ({ severity_name: s.severityName, sort_order: s.sortOrder }),
  });

  await seedMissingRows(catalystApp, summary, {
    table: TABLE.lossArchetypes,
    seeds: LOSS_ARCHETYPES,
    keyColumn: "archetype_name",
    keyOfSeed: (s) => s.archetypeName,
    identity: "serial",
    values: (s) => ({ archetype_name: s.archetypeName, is_active: formatBoolean(true) }),
  });

  await seedMissingRows(catalystApp, summary, {
    table: TABLE.gateDefinitions,
    seeds: GATE_DEFINITIONS,
    keyColumn: "gate_code",
    keyOfSeed: (s) => s.gateCode,
    identity: "serial",
    values: (s) => ({
      gate_group: s.gateGroup,
      gate_code: s.gateCode,
      label: s.label,
      description: s.description,
      sort_order: s.sortOrder,
      // Postgres text[] -> a JSON-serialized `text` column (CATALYST_SCHEMA.md).
      prerequisite_gate_codes: toJson(s.prerequisiteGateCodes),
      is_active: formatBoolean(true),
    }),
  });

  await seedMissingRows(catalystApp, summary, {
    table: TABLE.interventionChecklists,
    seeds: INTERVENTION_CHECKLISTS,
    keyColumn: "natural_key",
    keyOfSeed: (s) => `${s.triggerPatternCode}:${s.name}`,
    identity: "serial",
    values: (s) => ({
      trigger_pattern_code: s.triggerPatternCode,
      name: s.name,
      steps: toJson(s.steps),
      is_active: formatBoolean(true),
      natural_key: `${s.triggerPatternCode}:${s.name}`,
    }),
  });

  // Competitor battlecards (talking points in the Next-Best-Action panel).
  //
  // BUG FIX vs. seed.ts: in Postgres this insert is
  // `.onConflictDoNothing()` with no conflict target, and competitor_battlecards
  // has no unique constraint at all — so the arbiter never matches and a
  // re-seed silently appends 6 duplicate rows every time. Here the presence
  // probe is competitor_id, which is the table's real (if undeclared) natural
  // key: one battlecard per competitor. Data Store has no unique constraint on
  // that column either, so the guarantee is enforced by this filter rather than
  // by the store — hence the read-then-filter rather than a bare insert.
  const competitorRows = await fetchAllRows(catalystApp, TABLE.competitors);
  const competitorIdByName = new Map(competitorRows.map((c) => [c["name"], Number(c["id"])]));
  await seedMissingRows(catalystApp, summary, {
    table: TABLE.competitorBattlecards,
    // Drop battlecards whose competitor isn't in the catalog, exactly as
    // seed.ts's `.filter(v => v !== null)` does.
    seeds: COMPETITOR_BATTLECARDS.filter((b) => competitorIdByName.has(b.competitorName)),
    keyColumn: "competitor_id",
    keyOfSeed: (b) => String(competitorIdByName.get(b.competitorName)),
    identity: "serial",
    values: (b) => ({
      competitor_id: String(competitorIdByName.get(b.competitorName)),
      talking_points: toJson(b.talkingPoints),
      is_active: formatBoolean(true),
    }),
  });

  await seedMissingRows(catalystApp, summary, {
    table: TABLE.engineThresholds,
    seeds: ENGINE_THRESHOLDS,
    keyColumn: "parameter_key",
    keyOfSeed: (s) => s.parameterKey,
    identity: "serial",
    values: (s) => ({
      parameter_key: s.parameterKey,
      parameter_value: s.parameterValue,
      // "data_type" is a reserved word in Data Store — the column is data_type_.
      data_type_: s.dataType,
      description: s.description,
      updated_at: now,
    }),
  });

  await seedMissingRows(catalystApp, summary, {
    table: TABLE.fxRates,
    seeds: FX_RATES,
    keyColumn: "natural_key",
    keyOfSeed: (s) => `${s.baseCurrency}:${s.quoteCurrency}:${asOf}`,
    identity: "serial",
    values: (s) => ({
      base_currency: s.baseCurrency,
      quote_currency: s.quoteCurrency,
      rate: s.rate,
      as_of: asOf,
      natural_key: `${s.baseCurrency}:${s.quoteCurrency}:${asOf}`,
    }),
  });

  // Predictive scoring model calibrated weights. Append-only calibration
  // history with no unique key on feature_id (the newest row per feature
  // wins on read), so this is a whole-table presence probe, exactly as
  // seed.ts guards it.
  const existingWeights = await fetchAllRows(catalystApp, TABLE.scoringModelWeights);
  summary[TABLE.scoringModelWeights] = 0;
  if (existingWeights.length === 0) {
    const weightRows = SCORING_MODEL_WEIGHTS.map((w) => ({
      id: crypto.randomUUID(),
      feature_id: w.featureId,
      calibrated_weight: w.calibratedWeight,
      sample_size: 0,
      calibration_date: asOf,
      created_at: now,
    }));
    await insertRows(catalystApp, TABLE.scoringModelWeights, weightRows);
    summary[TABLE.scoringModelWeights] = weightRows.length;
  } else {
    logger.info("Scoring model weights already present — skipping");
  }

  await seedMissingRows(catalystApp, summary, {
    table: TABLE.segments,
    seeds: SEGMENTS,
    keyColumn: "name",
    keyOfSeed: (s) => s.name,
    identity: "serial",
    values: (s) => ({ name: s.name, sort_order: s.sortOrder, is_active: formatBoolean(true) }),
  });

  await seedMissingRows(catalystApp, summary, {
    table: TABLE.dealTypes,
    seeds: DEAL_TYPES,
    keyColumn: "name",
    keyOfSeed: (s) => s.name,
    identity: "serial",
    values: (s) => ({ name: s.name, sort_order: s.sortOrder, is_active: formatBoolean(true) }),
  });

  // Built-in automation rule template. Same reasoning as scoring weights:
  // template names are not unique, so seed.ts guards this with a whole-table
  // presence probe rather than a per-row conflict target.
  const existingTemplates = await fetchAllRows(catalystApp, TABLE.automationRuleTemplates);
  summary[TABLE.automationRuleTemplates] = 0;
  if (existingTemplates.length === 0) {
    const templateRows = AUTOMATION_RULE_TEMPLATES.map((t) => ({
      id: crypto.randomUUID(),
      name: t.name,
      description: t.description,
      category: t.category,
      trigger_event: t.triggerEvent,
      conditions: toJson(t.conditions),
      actions: toJson(t.actions),
      is_builtin: formatBoolean(t.isBuiltin),
      created_at: now,
    }));
    await insertRows(catalystApp, TABLE.automationRuleTemplates, templateRows);
    summary[TABLE.automationRuleTemplates] = templateRows.length;
  } else {
    logger.info("Automation rule templates already present — skipping");
  }

  return summary;
}

/* -------------------------------------------------------------- Phase: config */

/**
 * Stage-keyed playbooks (5) + their ordered steps (26) + the MEDDPICC question
 * catalog (8).
 */
export async function seedConfigCatalyst(catalystApp: CatalystApp): Promise<SeedSummary> {
  const summary: SeedSummary = {
    [TABLE.playbooks]: 0,
    [TABLE.playbookSteps]: 0,
    [TABLE.meddpiccQuestions]: 0,
  };
  const now = formatCatalystDateTime(new Date());

  // C4: playbooks have no unique name column, so this is a presence probe on
  // the whole table (matching seed.ts) rather than per-row dedupe.
  const existingPlaybooks = await fetchAllRows(catalystApp, TABLE.playbooks);
  if (existingPlaybooks.length > 0) {
    logger.info("Playbooks already present — skipping playbook seed");
  } else {
    // Pre-mint the parent uuids so steps can be written without a read-back
    // round-trip — this is what replaces Drizzle's `.returning({ id })`.
    const withIds = PLAYBOOK_SEEDS.map((pb) => ({ id: crypto.randomUUID(), pb }));
    await insertRows(
      catalystApp,
      TABLE.playbooks,
      withIds.map(({ id, pb }) => ({
        id,
        playbook_name: pb.playbookName,
        description: pb.description,
        applicable_stage: pb.applicableStage,
        is_active: formatBoolean(true),
        created_by: "seed",
        created_at: now,
      })),
    );
    summary[TABLE.playbooks] = withIds.length;

    // All 26 steps across all 5 playbooks in ONE call, not 5.
    const stepRows = withIds.flatMap(({ id, pb }) =>
      pb.steps.map((s) => ({
        id: crypto.randomUUID(),
        playbook_id: id,
        step_order: s.stepOrder,
        step_name: s.stepName,
        recommended_action: s.recommendedAction,
        expected_duration_days: s.expectedDurationDays,
        is_critical: formatBoolean(s.isCritical),
        natural_key: `${id}:${s.stepOrder}`,
      })),
    );
    await insertRows(catalystApp, TABLE.playbookSteps, stepRows);
    summary[TABLE.playbookSteps] = stepRows.length;
    logger.info({ count: withIds.length, steps: stepRows.length }, "Seeded stage-keyed playbooks");
  }

  // MEDDPICC catalog. Self-healing reseed: if the stored catalog no longer
  // matches QUESTION_CATALOG, wipe answers + scores + questions and rewrite —
  // answers reference question ids, so a changed catalog would otherwise leave
  // dangling per-deal answers.
  const existingQuestions = await fetchAllRows(catalystApp, TABLE.meddpiccQuestions);
  const existingOrders = new Set(existingQuestions.map((r) => Number(r["question_order"])));
  const matches =
    existingQuestions.length === QUESTION_CATALOG.length &&
    QUESTION_CATALOG.every((q) => existingOrders.has(q.questionOrder));

  if (matches) {
    logger.info("MEDDPICC questions already present and match the current catalog — skipping");
    return summary;
  }

  if (existingQuestions.length > 0) {
    logger.warn(
      "MEDDPICC question catalog has changed — resetting deal_meddpicc_answers, deal_meddpicc_scores, and meddpicc_questions",
    );
    // Explicit ordered cascade, children first — Data Store has no FK cascade.
    for (const table of [TABLE.dealMeddpiccAnswers, TABLE.dealMeddpiccScores, TABLE.meddpiccQuestions]) {
      const rows = await fetchAllRows(catalystApp, table);
      for (const row of rows) {
        await deleteRow(catalystApp, table, row["ROWID"]);
      }
    }
  }

  const questionRows = QUESTION_CATALOG.map((q) => ({
    id: crypto.randomUUID(),
    question_order: q.questionOrder,
    pillar: q.pillar,
    stage_tag: q.stageTag,
    question_text: q.questionText,
    help_text: q.helpText ?? null,
  }));
  await insertRows(catalystApp, TABLE.meddpiccQuestions, questionRows);
  summary[TABLE.meddpiccQuestions] = questionRows.length;
  logger.info({ count: questionRows.length }, "Seeded MEDDPICC questions");

  return summary;
}

/* --------------------------------------------------------------- Phase: deals */

/**
 * The 12 demo deals and every child row they own (~162 rows).
 *
 * Guarded by a whole-table presence probe on enterprise_deals, exactly as
 * seed.ts is: these are hand-authored demo scenarios, not reference data, and
 * re-running against a live pipeline must never duplicate them.
 */
export async function seedDealsCatalyst(catalystApp: CatalystApp): Promise<SeedSummary> {
  const summary: SeedSummary = {
    [TABLE.enterpriseDeals]: 0,
    [TABLE.dealTechnicalGates]: 0,
    [TABLE.dealProductInterests]: 0,
    [TABLE.dealCrossSells]: 0,
    [TABLE.dealComplianceDrivers]: 0,
    [TABLE.dealBlockers]: 0,
    [TABLE.dealMemory]: 0,
    [TABLE.dealCompetitors]: 0,
    [TABLE.dealDecisions]: 0,
  };

  const existingDeals = await fetchAllRows(catalystApp, TABLE.enterpriseDeals);
  if (existingDeals.length > 0) {
    logger.info("Deals already present — skipping deal seed");
    return summary;
  }

  const [stages, pricing, tiers, products, cats, sevs, archetypes, comps, drivers] = await Promise.all([
    fetchAllRows(catalystApp, TABLE.pipelineStages),
    fetchAllRows(catalystApp, TABLE.pricingModels),
    fetchAllRows(catalystApp, TABLE.servicesTiers),
    fetchAllRows(catalystApp, TABLE.productCatalog),
    fetchAllRows(catalystApp, TABLE.blockerCategories),
    fetchAllRows(catalystApp, TABLE.blockerSeverities),
    fetchAllRows(catalystApp, TABLE.lossArchetypes),
    fetchAllRows(catalystApp, TABLE.competitors),
    fetchAllRows(catalystApp, TABLE.complianceDrivers),
  ]);

  // Every FK on a seeded deal resolves by NAME/CODE against the rows above —
  // the same contract seed-data.ts documents, just against Data Store instead
  // of Postgres. Serial-PK lookups hand back their app-managed int `id`
  // (stringified, because the FK columns are varchar(36)); product_catalog
  // hands back its uuid `id`.
  const intIdBy = (rows: RawRow[], column: string) =>
    new Map(rows.map((r) => [r[column], Number(r["id"])]));
  const stageIds = intIdBy(stages, "stage_name");
  const pricingIds = intIdBy(pricing, "model_name");
  const tierIds = intIdBy(tiers, "tier_name");
  const catIds = intIdBy(cats, "category_name");
  const sevIds = intIdBy(sevs, "severity_name");
  const archetypeIds = intIdBy(archetypes, "archetype_name");
  const competitorIds = intIdBy(comps, "name");
  const driverIds = intIdBy(drivers, "name");
  const productIds = new Map(products.map((p) => [p["code"], p["id"]]));

  const stageId = (name: string) => must(stageIds.get(name), `pipeline stage "${name}"`);
  const pricingId = (name: string) => must(pricingIds.get(name), `pricing model "${name}"`);
  const tierId = (name: string) => must(tierIds.get(name), `services tier "${name}"`);
  const productId = (code: string) => must(productIds.get(code), `product "${code}"`);
  const catId = (name: string) => must(catIds.get(name), `blocker category "${name}"`);
  const sevId = (name: string) => must(sevIds.get(name), `blocker severity "${name}"`);
  const archetypeId = (name: string) => must(archetypeIds.get(name), `loss archetype "${name}"`);
  const competitorId = (name: string) => must(competitorIds.get(name), `competitor "${name}"`);
  const driverId = (name: string) => must(driverIds.get(name), `compliance driver "${name}"`);

  const now = formatCatalystDateTime(new Date());
  const gateCompletedAt = formatCatalystDateTime(daysAgo(10));

  // Pre-mint every deal uuid up front so all child rows can be built in memory
  // and written one table at a time (8 bulk calls total) instead of per deal.
  const seeded = DEAL_SEEDS.map((seed) => ({ id: crypto.randomUUID(), seed }));

  const dealRows = seeded.map(({ id, seed }) => ({
    id,
    deal_name: seed.dealName,
    account_name: seed.accountName,
    crm_record_url: seed.crmRecordUrl ?? null,
    account_manager: seed.accountManager,
    technical_lead: seed.technicalLead,
    sales_stage_id: String(stageId(seed.stageName)),
    stage_entered_at: formatCatalystDateTime(daysAgo(seed.stageEnteredDaysAgo)),
    product_revenue: seed.productRevenue,
    pricing_model_id: String(pricingId(seed.pricingModelName)),
    contract_term_years: seed.contractTermYears,
    deal_currency: seed.dealCurrency,
    expected_close_date: dateInDays(seed.expectedCloseInDays),
    // `landed_at` is deliberately left unset, matching seed.ts (which omits it
    // and takes the nullable column's NULL). Consumers fall back to created_at.
    win_probability_pct: seed.winProbabilityPct,
    committed: formatBoolean(false),
    services_revenue: seed.servicesRevenue,
    services_tier_id: String(tierId(seed.servicesTierName)),
    manager_strategic_blueprint: seed.managerStrategicBlueprint,
    speaker_notes: seed.speakerNotes ?? null,
    loss_reason: seed.lossReason ?? null,
    loss_archetype_id: seed.lossArchetypeName ? String(archetypeId(seed.lossArchetypeName)) : null,
    competitor_id: seed.competitorName ? String(competitorId(seed.competitorName)) : null,
    compliance_driver_id: seed.complianceDriverName ? String(driverId(seed.complianceDriverName)) : null,
    compliance_deadline:
      seed.complianceDeadlineInDays === undefined ? null : dateInDays(seed.complianceDeadlineInDays),
    estimated_log_sources: seed.estimatedLogSources ?? null,
    created_at: now,
    updated_at: now,
    natural_key: `${seed.accountName}:${seed.dealName}`,
  }));

  // One deal_technical_gates row per gate code per deal — 9 x 12 = 108 rows,
  // written in a single insertRows call (chunked internally at 100).
  const gateRows = seeded.flatMap(({ id, seed }) =>
    ALL_GATE_CODES.map((gateCode) => {
      const completed = seed.completedGateCodes.includes(gateCode);
      return {
        id: crypto.randomUUID(),
        deal_id: id,
        gate_code: gateCode,
        is_completed: formatBoolean(completed),
        completed_at: completed ? gateCompletedAt : null,
        completed_by: completed ? "Deal Commander" : null,
        created_at: now,
        updated_at: now,
        natural_key: `${id}:${gateCode}`,
      };
    }),
  );

  const interestRows = seeded.flatMap(({ id, seed }) =>
    seed.productInterestCodes.map((code) => ({
      deal_id: id,
      product_id: productId(code),
      noted_at: now,
      natural_key: `${id}:${productId(code)}`,
    })),
  );

  const crossSellRows = seeded.flatMap(({ id, seed }) =>
    (seed.crossSellCodes ?? []).map((code) => ({
      deal_id: id,
      product_id: productId(code),
      is_pitched: formatBoolean(true),
      pitched_at: now,
      natural_key: `${id}:${productId(code)}`,
    })),
  );

  // Multi-driver deals mirror their SECONDARY drivers into the join table; the
  // primary one stays on enterprise_deals.compliance_driver_id.
  const complianceRows = seeded.flatMap(({ id, seed }) =>
    (seed.extraComplianceDriverNames ?? []).map((name) => ({
      deal_id: id,
      compliance_driver_id: String(driverId(name)),
      natural_key: `${id}:${driverId(name)}`,
    })),
  );

  const blockerRows = seeded.flatMap(({ id, seed }) =>
    (seed.blockers ?? []).map((b) => ({
      id: crypto.randomUUID(),
      deal_id: id,
      category_id: String(catId(b.categoryName)),
      severity_id: String(sevId(b.severityName)),
      description: b.description,
      is_resolved: formatBoolean(false),
      logged_at: now,
      updated_at: now,
    })),
  );

  // Decision Log. Nothing else in the app writes this table — the desktop form
  // was its only creator — so without these rows the Decisions panel is empty
  // on freshly seeded data and reads as broken rather than as unused.
  // `commander_id` is null: these are demo rows with no signed-in author, and
  // the column is only used to attribute a decision to the commander who
  // recorded it.
  const decisionRows = seeded.flatMap(({ id, seed }) =>
    (seed.decisions ?? []).map((d) => ({
      id: crypto.randomUUID(),
      deal_id: id,
      meeting_session_id: null,
      decision_text: d.decisionText,
      rationale: d.rationale ?? null,
      owner: d.owner,
      status: d.status ?? "Pending",
      decided_at: formatCatalystDateTime(daysAgo(d.decidedDaysAgo)),
      due_date: d.dueInDays === undefined ? null : dateInDays(d.dueInDays),
      completed_at:
        d.completedDaysAgo === undefined
          ? null
          : formatCatalystDateTime(daysAgo(d.completedDaysAgo)),
      commander_id: null,
      created_at: now,
      updated_at: now,
    })),
  );

  // The post-mortem subscriber (lib/subscribers/post-mortem.ts) only archives
  // to deal_memory on a live `deal.stage_changed` event; direct seed inserts
  // never fire that event, so replicate its archive shape here for seeded
  // losses — same as seed.ts's archiveLostDeal.
  const memoryRows = seeded
    .filter(({ seed }) => seed.archiveAsLost)
    .map(({ id, seed }) => ({
      id: crypto.randomUUID(),
      deal_id: id,
      account_name: seed.accountName,
      deal_name: seed.dealName,
      outcome: "Lost",
      final_tcv: String(Number(seed.productRevenue)),
      pricing_model: seed.pricingModelName,
      services_tier: seed.servicesTierName,
      total_gates_completed: seed.completedGateCodes.length,
      total_blockers_encountered: 0,
      total_days_active: seed.stageEnteredDaysAgo,
      competitors_faced: toJson(seed.competitorName ? [seed.competitorName] : []),
      archived_at: now,
    }));

  // Competitive Landscape links. A lost deal gets its incumbent recorded as
  // "Lost To"; a live deal gets the "Active" row that seedIncumbentCompetitor
  // (routes/deals.ts) would have written on a real create — without it,
  // closing the deal later archives an empty competitorsFaced, because
  // post-mortem.ts only reads deal_competitors.
  const competitorLinkRows = seeded
    .filter(({ seed }) => seed.competitorName !== null)
    .map(({ id, seed }) => {
      const cid = competitorId(seed.competitorName as string);
      return {
        id: crypto.randomUUID(),
        deal_id: id,
        competitor_id: String(cid),
        status: seed.archiveAsLost ? "Lost To" : "Active",
        logged_at: now,
        updated_at: now,
        natural_key: `${id}:${cid}`,
      };
    });

  // Parent first, then children — Data Store has no transactions, so the order
  // is what keeps a partial failure interpretable (deals without children is a
  // recoverable state; orphan children are not).
  const writes: Array<[string, Array<Record<string, unknown>>]> = [
    [TABLE.enterpriseDeals, dealRows],
    [TABLE.dealTechnicalGates, gateRows],
    [TABLE.dealProductInterests, interestRows],
    [TABLE.dealCrossSells, crossSellRows],
    [TABLE.dealComplianceDrivers, complianceRows],
    [TABLE.dealBlockers, blockerRows],
    [TABLE.dealMemory, memoryRows],
    [TABLE.dealCompetitors, competitorLinkRows],
    [TABLE.dealDecisions, decisionRows],
  ];
  for (const [table, rows] of writes) {
    await insertRows(catalystApp, table, rows);
    summary[table] = rows.length;
  }

  logger.info({ count: dealRows.length }, "Seeded demo deals");
  return summary;
}
