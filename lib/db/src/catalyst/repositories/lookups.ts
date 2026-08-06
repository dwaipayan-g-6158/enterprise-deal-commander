// Repository for the 18 lookup tables (lib/db/src/schema/lookups.ts), ported
// onto Catalyst Data Store. See docs/CATALYST_SCHEMA.md for the full type
// mapping and the Identity section explaining why serial-PK tables carry an
// explicit app-managed `id` int column (via nextAppId()) rather than
// exposing Data Store's own ROWID.
//
// Pattern: one `create<Table>Repo(catalystApp)` factory per table (or a
// small cluster of related tables), matching the sibling
// Customer-Insight-Engine project's repo.ts. Every list() does a full-table
// fetchAllRows() + in-memory filter/sort — no ZCQL — per the architecture
// decision in docs/catalyst-datastore-constraints.md.

import {
  fetchAllRows,
  insertRow,
  updateRow,
  nextAppId,
  parseBoolean,
  formatBoolean,
  formatCatalystDateTime,
  fromJson,
  isDuplicateValueError,
  type CatalystApp,
  type RawRow,
} from "../sdk";

const TABLE = {
  pipelineStages: "pipeline_stages",
  pricingModels: "pricing_models",
  servicesTiers: "services_tiers",
  productCatalog: "product_catalog",
  ad360Features: "ad360_features",
  competitors: "competitors",
  complianceDrivers: "compliance_drivers",
  competitorBattlecards: "competitor_battlecards",
  blockerCategories: "blocker_categories",
  blockerSeverities: "blocker_severities",
  lossArchetypes: "loss_archetypes",
  gateDefinitions: "gate_definitions",
  engineThresholds: "engine_thresholds",
  fxRates: "fx_rates",
  interventionChecklists: "intervention_checklists",
  teamMembers: "team_members",
  segments: "segments",
  dealTypes: "deal_types",
} as const;

export class DuplicateNameError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "DuplicateNameError";
  }
}


// ---------------------------------------------------------------- Pipeline stages

export interface PipelineStage {
  id: number;
  stageName: string;
  sortOrder: number;
  description: string | null;
}

function rowToPipelineStage(row: RawRow): PipelineStage {
  return {
    id: Number(row["id"]),
    stageName: row["stage_name"],
    sortOrder: Number(row["sort_order"]),
    description: row["description"] || null,
  };
}

export function createPipelineStagesRepo(catalystApp: CatalystApp) {
  return {
    async listActive(): Promise<PipelineStage[]> {
      const rows = await fetchAllRows(catalystApp, TABLE.pipelineStages);
      return rows
        .filter((r) => parseBoolean(r["is_active"]))
        .map(rowToPipelineStage)
        .sort((a, b) => a.sortOrder - b.sortOrder);
    },
    /**
     * Every stage, active or not — a deal created while a stage was active
     * still needs that stage's name to resolve after the stage is later
     * deactivated. Mirrors the original Drizzle `getDealWithLookups` join,
     * which never filtered on `is_active`.
     */
    async listAll(): Promise<PipelineStage[]> {
      const rows = await fetchAllRows(catalystApp, TABLE.pipelineStages);
      return rows.map(rowToPipelineStage).sort((a, b) => a.sortOrder - b.sortOrder);
    },
  };
}

// ---------------------------------------------------------------- Pricing models

export interface PricingModel {
  id: number;
  modelName: string;
}

export function createPricingModelsRepo(catalystApp: CatalystApp) {
  return {
    async listActive(): Promise<PricingModel[]> {
      const rows = await fetchAllRows(catalystApp, TABLE.pricingModels);
      return rows
        .filter((r) => parseBoolean(r["is_active"]))
        .map((r) => ({ id: Number(r["id"]), modelName: r["model_name"] }))
        .sort((a, b) => a.id - b.id);
    },
    /** Every model, active or not — see PipelineStage.listAll for why. */
    async listAll(): Promise<PricingModel[]> {
      const rows = await fetchAllRows(catalystApp, TABLE.pricingModels);
      return rows
        .map((r) => ({ id: Number(r["id"]), modelName: r["model_name"] }))
        .sort((a, b) => a.id - b.id);
    },
  };
}

// ---------------------------------------------------------------- Services tiers

export interface ServicesTier {
  id: number;
  tierName: string;
}

export function createServicesTiersRepo(catalystApp: CatalystApp) {
  return {
    async listActive(): Promise<ServicesTier[]> {
      const rows = await fetchAllRows(catalystApp, TABLE.servicesTiers);
      return rows
        .filter((r) => parseBoolean(r["is_active"]))
        .map((r) => ({ id: Number(r["id"]), tierName: r["tier_name"] }))
        .sort((a, b) => a.id - b.id);
    },
    /** Every tier, active or not — see PipelineStage.listAll for why. */
    async listAll(): Promise<ServicesTier[]> {
      const rows = await fetchAllRows(catalystApp, TABLE.servicesTiers);
      return rows
        .map((r) => ({ id: Number(r["id"]), tierName: r["tier_name"] }))
        .sort((a, b) => a.id - b.id);
    },
  };
}

// ---------------------------------------------------------------- Product catalog

export interface ProductCatalogItem {
  id: string;
  code: string;
  productName: string;
  productCategory: string | null;
  suite: string | null;
}

function rowToProductCatalogItem(r: RawRow): ProductCatalogItem {
  return {
    id: r["id"],
    code: r["code"],
    productName: r["product_name"],
    productCategory: r["product_category"] || null,
    suite: r["suite"] || null,
  };
}

export function createProductCatalogRepo(catalystApp: CatalystApp) {
  return {
    async listActive(): Promise<ProductCatalogItem[]> {
      const rows = await fetchAllRows(catalystApp, TABLE.productCatalog);
      return rows
        .filter((r) => parseBoolean(r["is_active"]))
        .map(rowToProductCatalogItem)
        .sort((a, b) => a.productName.localeCompare(b.productName));
    },
    /**
     * Every product, active or not — a deal's cross-sell/product-of-interest
     * links join by id with no `is_active` filter in the original Drizzle
     * queries (routes/crosssells.ts, getProductsOfInterest), so a since-
     * deactivated product must still resolve on an existing deal.
     */
    async listAll(): Promise<ProductCatalogItem[]> {
      const rows = await fetchAllRows(catalystApp, TABLE.productCatalog);
      return rows.map(rowToProductCatalogItem).sort((a, b) => a.productName.localeCompare(b.productName));
    },
  };
}

// ---------------------------------------------------------------- AD360 features

export interface Ad360Feature {
  id: number;
  code: string;
  label: string;
  description: string | null;
}

function rowToAd360Feature(r: RawRow): Ad360Feature {
  return {
    id: Number(r["id"]),
    code: r["code"],
    label: r["label"],
    description: r["description"] || null,
  };
}

export function createAd360FeaturesRepo(catalystApp: CatalystApp) {
  return {
    async listActive(): Promise<Ad360Feature[]> {
      const rows = await fetchAllRows(catalystApp, TABLE.ad360Features);
      return rows
        .filter((r) => parseBoolean(r["is_active"]))
        .map(rowToAd360Feature)
        .sort(
          (a, b) => Number(a.id) - Number(b.id) || a.label.localeCompare(b.label),
        );
    },
    /** Every feature, active or not — see ProductCatalog.listAll for why. */
    async listAll(): Promise<Ad360Feature[]> {
      const rows = await fetchAllRows(catalystApp, TABLE.ad360Features);
      return rows
        .map(rowToAd360Feature)
        .sort((a, b) => Number(a.id) - Number(b.id) || a.label.localeCompare(b.label));
    },
  };
}

// ---------------------------------------------------------------- Competitors

export interface Competitor {
  id: number;
  name: string;
  category: string;
}

export function createCompetitorsRepo(catalystApp: CatalystApp) {
  return {
    async listActive(): Promise<Competitor[]> {
      const rows = await fetchAllRows(catalystApp, TABLE.competitors);
      return rows
        .filter((r) => parseBoolean(r["is_active"]))
        .map((r) => ({ id: Number(r["id"]), name: r["name"], category: r["category"] }))
        .sort((a, b) => a.name.localeCompare(b.name));
    },
    async create(input: { name: string; category?: string }): Promise<Competitor> {
      const all = await fetchAllRows(catalystApp, TABLE.competitors);
      const id = nextAppId(all);
      try {
        const created = await insertRow(catalystApp, TABLE.competitors, {
          id,
          name: input.name,
          category: input.category ?? "IAM",
          is_active: formatBoolean(true),
        });
        return { id: Number(created["id"]), name: created["name"], category: created["category"] };
      } catch (err) {
        if (isDuplicateValueError(err)) {
          throw new DuplicateNameError("A competitor with this name already exists");
        }
        throw err;
      }
    },
    /** Every competitor, active or not — see PipelineStage.listAll for why. */
    async listAll(): Promise<Competitor[]> {
      const rows = await fetchAllRows(catalystApp, TABLE.competitors);
      return rows
        .map((r) => ({ id: Number(r["id"]), name: r["name"], category: r["category"] }))
        .sort((a, b) => a.name.localeCompare(b.name));
    },
  };
}

// ---------------------------------------------------------------- Compliance drivers

export interface ComplianceDriver {
  id: number;
  name: string;
}

export function createComplianceDriversRepo(catalystApp: CatalystApp) {
  return {
    async listActive(): Promise<ComplianceDriver[]> {
      const rows = await fetchAllRows(catalystApp, TABLE.complianceDrivers);
      return rows
        .filter((r) => parseBoolean(r["is_active"]))
        .map((r) => ({ id: Number(r["id"]), name: r["name"] }))
        .sort((a, b) => a.name.localeCompare(b.name));
    },
    async create(input: { name: string }): Promise<ComplianceDriver> {
      const all = await fetchAllRows(catalystApp, TABLE.complianceDrivers);
      const id = nextAppId(all);
      try {
        const created = await insertRow(catalystApp, TABLE.complianceDrivers, {
          id,
          name: input.name,
          is_active: formatBoolean(true),
        });
        return { id: Number(created["id"]), name: created["name"] };
      } catch (err) {
        if (isDuplicateValueError(err)) {
          throw new DuplicateNameError("A compliance driver with this name already exists");
        }
        throw err;
      }
    },
    /** Every driver, active or not — see PipelineStage.listAll for why. */
    async listAll(): Promise<ComplianceDriver[]> {
      const rows = await fetchAllRows(catalystApp, TABLE.complianceDrivers);
      return rows
        .map((r) => ({ id: Number(r["id"]), name: r["name"] }))
        .sort((a, b) => a.name.localeCompare(b.name));
    },
  };
}

// ---------------------------------------------------------------- Team members

export interface TeamMember {
  id: number;
  name: string;
  canBeAm: boolean;
  canBeTl: boolean;
}

export function createTeamMembersRepo(catalystApp: CatalystApp) {
  return {
    async listActive(): Promise<TeamMember[]> {
      const rows = await fetchAllRows(catalystApp, TABLE.teamMembers);
      return rows
        .filter((r) => parseBoolean(r["is_active"]))
        .map((r) => ({
          id: Number(r["id"]),
          name: r["name"],
          canBeAm: parseBoolean(r["can_be_am"]),
          canBeTl: parseBoolean(r["can_be_tl"]),
        }))
        .sort((a, b) => a.name.localeCompare(b.name));
    },
    async create(input: { name: string; canBeAm?: boolean; canBeTl?: boolean }): Promise<TeamMember> {
      const all = await fetchAllRows(catalystApp, TABLE.teamMembers);
      const id = nextAppId(all);
      try {
        const created = await insertRow(catalystApp, TABLE.teamMembers, {
          id,
          name: input.name,
          can_be_am: formatBoolean(input.canBeAm ?? true),
          can_be_tl: formatBoolean(input.canBeTl ?? false),
          is_active: formatBoolean(true),
        });
        return {
          id: Number(created["id"]),
          name: created["name"],
          canBeAm: parseBoolean(created["can_be_am"]),
          canBeTl: parseBoolean(created["can_be_tl"]),
        };
      } catch (err) {
        if (isDuplicateValueError(err)) {
          throw new DuplicateNameError("A team member with this name already exists");
        }
        throw err;
      }
    },
    /** Soft-delete: sets is_active=false. Returns the deactivated row, or null if not found. */
    async deactivate(id: number): Promise<{ id: number; name: string } | null> {
      const rows = await fetchAllRows(catalystApp, TABLE.teamMembers);
      const row = rows.find((r) => Number(r["id"]) === id);
      if (!row) return null;
      await updateRow(catalystApp, TABLE.teamMembers, row["ROWID"], {
        is_active: formatBoolean(false),
      });
      return { id, name: row["name"] };
    },
  };
}

// ---------------------------------------------------------------- Competitor battlecards

export interface CompetitorBattlecard {
  competitorId: number;
  competitorName: string;
  talkingPoints: string[];
}

export function createCompetitorBattlecardsRepo(catalystApp: CatalystApp) {
  return {
    async listActive(): Promise<CompetitorBattlecard[]> {
      const [battlecards, competitors] = await Promise.all([
        fetchAllRows(catalystApp, TABLE.competitorBattlecards),
        fetchAllRows(catalystApp, TABLE.competitors),
      ]);
      const nameById = new Map(competitors.map((c) => [Number(c["id"]), c["name"]]));
      return battlecards
        .filter((r) => parseBoolean(r["is_active"]))
        .map((r) => ({
          competitorId: Number(r["competitor_id"]),
          competitorName: nameById.get(Number(r["competitor_id"])) ?? "Unknown",
          talkingPoints: fromJson<string[]>(r["talking_points"], []),
        }))
        .sort((a, b) => a.competitorName.localeCompare(b.competitorName));
    },
  };
}

// ---------------------------------------------------------------- Gate definitions

export interface GateDefinition {
  gateGroup: number;
  gateCode: string;
  label: string;
  description: string | null;
  sortOrder: number;
  prerequisiteGateCodes: string[];
}

export function createGateDefinitionsRepo(catalystApp: CatalystApp) {
  return {
    async listActive(): Promise<GateDefinition[]> {
      const rows = await fetchAllRows(catalystApp, TABLE.gateDefinitions);
      return rows
        .filter((r) => parseBoolean(r["is_active"]))
        .map((r) => ({
          gateGroup: Number(r["gate_group"]),
          gateCode: r["gate_code"],
          label: r["label"],
          description: r["description"] || null,
          sortOrder: Number(r["sort_order"]),
          prerequisiteGateCodes: fromJson<string[]>(r["prerequisite_gate_codes"], []),
        }))
        .sort((a, b) => a.sortOrder - b.sortOrder);
    },
  };
}

// ---------------------------------------------------------------- Blocker categories / severities

export interface BlockerCategory {
  id: number;
  categoryName: string;
}

export function createBlockerCategoriesRepo(catalystApp: CatalystApp) {
  return {
    async listActive(): Promise<BlockerCategory[]> {
      const rows = await fetchAllRows(catalystApp, TABLE.blockerCategories);
      return rows
        .filter((r) => parseBoolean(r["is_active"]))
        .map((r) => ({ id: Number(r["id"]), categoryName: r["category_name"] }))
        .sort((a, b) => a.id - b.id);
    },
    /** Every category, active or not — see ProductCatalog.listAll for why. */
    async listAll(): Promise<BlockerCategory[]> {
      const rows = await fetchAllRows(catalystApp, TABLE.blockerCategories);
      return rows
        .map((r) => ({ id: Number(r["id"]), categoryName: r["category_name"] }))
        .sort((a, b) => a.id - b.id);
    },
  };
}

export interface BlockerSeverity {
  id: number;
  severityName: string;
  sortOrder: number;
}

export function createBlockerSeveritiesRepo(catalystApp: CatalystApp) {
  return {
    async listAll(): Promise<BlockerSeverity[]> {
      const rows = await fetchAllRows(catalystApp, TABLE.blockerSeverities);
      return rows
        .map((r) => ({
          id: Number(r["id"]),
          severityName: r["severity_name"],
          sortOrder: Number(r["sort_order"]),
        }))
        .sort((a, b) => a.sortOrder - b.sortOrder);
    },
  };
}

// ---------------------------------------------------------------- Loss archetypes

export interface LossArchetype {
  id: number;
  archetypeName: string;
}

export function createLossArchetypesRepo(catalystApp: CatalystApp) {
  return {
    async listActive(): Promise<LossArchetype[]> {
      const rows = await fetchAllRows(catalystApp, TABLE.lossArchetypes);
      return rows
        .filter((r) => parseBoolean(r["is_active"]))
        .map((r) => ({ id: Number(r["id"]), archetypeName: r["archetype_name"] }))
        .sort((a, b) => a.id - b.id);
    },
    /**
     * Every archetype, active or not — the original Drizzle read in
     * routes/v2/analytics.ts's /analytics/competitive-loss never filtered on
     * `is_active` (it looks up a name for whatever archetype id a deal
     * recorded, even if that archetype has since been deactivated).
     */
    async listAll(): Promise<LossArchetype[]> {
      const rows = await fetchAllRows(catalystApp, TABLE.lossArchetypes);
      return rows.map((r) => ({ id: Number(r["id"]), archetypeName: r["archetype_name"] })).sort((a, b) => a.id - b.id);
    },
  };
}

// ---------------------------------------------------------------- Intervention checklists

export interface InterventionChecklist {
  id: number;
  triggerPatternCode: string;
  name: string;
  steps: string[];
}

function rowToInterventionChecklist(r: RawRow): InterventionChecklist {
  return {
    id: Number(r["id"]),
    triggerPatternCode: r["trigger_pattern_code"],
    name: r["name"],
    steps: fromJson<string[]>(r["steps"], []),
  };
}

export function createInterventionChecklistsRepo(catalystApp: CatalystApp) {
  return {
    async listActive(): Promise<InterventionChecklist[]> {
      const rows = await fetchAllRows(catalystApp, TABLE.interventionChecklists);
      return rows
        .filter((r) => parseBoolean(r["is_active"]))
        .map(rowToInterventionChecklist)
        .sort((a, b) => a.id - b.id);
    },
    /**
     * Every checklist, active or not — the original Drizzle existence check
     * in routes/interventions.ts (`eq(interventionChecklists.id, ...)`)
     * never filtered on `is_active`, so a since-deactivated checklist can
     * still be launched against a deal.
     */
    async getById(id: number): Promise<InterventionChecklist | null> {
      const rows = await fetchAllRows(catalystApp, TABLE.interventionChecklists);
      const row = rows.find((r) => Number(r["id"]) === id);
      return row ? rowToInterventionChecklist(row) : null;
    },
  };
}

// ---------------------------------------------------------------- Engine thresholds

export interface EngineThreshold {
  parameterKey: string;
  parameterValue: string;
  dataType: string;
  description: string | null;
}

export function createEngineThresholdsRepo(catalystApp: CatalystApp) {
  return {
    async listAll(): Promise<EngineThreshold[]> {
      const rows = await fetchAllRows(catalystApp, TABLE.engineThresholds);
      return rows
        .map((r) => ({
          parameterKey: r["parameter_key"],
          parameterValue: r["parameter_value"],
          // Column is named "data_type_" in Data Store — "data_type" is a reserved word there.
          dataType: r["data_type_"],
          description: r["description"] || null,
        }))
        .sort((a, b) => a.parameterKey.localeCompare(b.parameterKey));
    },
    /** Returns a Map keyed by parameterKey, mirroring the route's `beforeByKey` lookup. */
    async mapByKey(): Promise<Map<string, EngineThreshold>> {
      const all = await this.listAll();
      return new Map(all.map((t) => [t.parameterKey, t]));
    },
    async upsertOne(parameterKey: string, parameterValue: string): Promise<void> {
      // Hand-rolled upsert (not the shared upsert() helper): `id` is this
      // table's app-managed int identity (see docs/CATALYST_SCHEMA.md), and
      // must only be assigned on insert — reusing the generic helper would
      // overwrite an existing row's id with a fresh nextAppId() on every
      // update, corrupting the identity of an unrelated row down the line.
      const rows = await fetchAllRows(catalystApp, TABLE.engineThresholds);
      const existing = rows.find((r) => r["parameter_key"] === parameterKey);
      const updatedAt = formatCatalystDateTime(new Date());
      if (existing) {
        await updateRow(catalystApp, TABLE.engineThresholds, existing["ROWID"], {
          parameter_value: parameterValue,
          updated_at: updatedAt,
        });
      } else {
        await insertRow(catalystApp, TABLE.engineThresholds, {
          id: nextAppId(rows),
          parameter_key: parameterKey,
          parameter_value: parameterValue,
          data_type_: "number",
          updated_at: updatedAt,
        });
      }
    },
  };
}

// ---------------------------------------------------------------- FX rates

export interface FxRate {
  baseCurrency: string;
  quoteCurrency: string;
  rate: number;
  asOf: string;
}

export function createFxRatesRepo(catalystApp: CatalystApp) {
  return {
    async listAll(): Promise<FxRate[]> {
      const rows = await fetchAllRows(catalystApp, TABLE.fxRates);
      return rows
        .map((r) => ({
          baseCurrency: r["base_currency"],
          quoteCurrency: r["quote_currency"],
          rate: Number(r["rate"]),
          asOf: r["as_of"],
        }))
        .sort((a, b) => a.baseCurrency.localeCompare(b.baseCurrency));
    },
    async mapByKey(): Promise<Map<string, FxRate>> {
      const all = await this.listAll();
      return new Map(all.map((r) => [`${r.baseCurrency}:${r.quoteCurrency}:${r.asOf}`, r]));
    },
    async upsertOne(baseCurrency: string, quoteCurrency: string, asOf: string, rate: number): Promise<void> {
      // Hand-rolled upsert — same reasoning as engineThresholds.upsertOne
      // above: `id` is an app-managed int identity, assigned only on insert.
      const naturalKey = `${baseCurrency}:${quoteCurrency}:${asOf}`;
      const rows = await fetchAllRows(catalystApp, TABLE.fxRates);
      const existing = rows.find((r) => r["natural_key"] === naturalKey);
      if (existing) {
        await updateRow(catalystApp, TABLE.fxRates, existing["ROWID"], {
          rate: String(rate),
        });
      } else {
        await insertRow(catalystApp, TABLE.fxRates, {
          id: nextAppId(rows),
          natural_key: naturalKey,
          base_currency: baseCurrency,
          quote_currency: quoteCurrency,
          as_of: asOf,
          rate: String(rate),
        });
      }
    },
  };
}
