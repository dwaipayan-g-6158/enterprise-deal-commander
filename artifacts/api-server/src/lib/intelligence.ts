import { and, asc, desc, eq } from "drizzle-orm";
import {
  db,
  enterpriseDeals,
  pipelineStages,
  pricingModels,
  servicesTiers,
  productCatalog,
  blockerSeverities,
  blockerCategories,
  gateDefinitions,
  dealTechnicalGates,
  dealCrossSells,
  dealProductInterests,
  dealComplianceDrivers,
  dealBlockers,
  dealAlertDispositions,
  dealAuditLog,
  interventionChecklists,
  engineThresholds,
  fxRates,
  competitors,
  complianceDrivers,
  competitorBattlecards,
  dealCompetitors,
  stakeholders,
  velocityBenchmarks,
} from "@workspace/db";
import {
  processDealIntelligence,
  calculateOwnMomentum,
  riskPatterns,
  COMPLIANCE_PRODUCTS,
  type EngineThresholds,
  type RawDeal,
  type RawGate,
  type IntelligenceOutput,
  type StakeholderInput,
  type CompetitorInput,
} from "@workspace/engine";
import { cache, CacheKeys, CacheTtl } from "./cache";
import { competitorWinRates } from "./competitive";
import { deriveRiskWeights, deriveRiskBoundaries, deriveHealthWeights, derivePortfolioConfig } from "./engine-config";

export const DEFAULT_THRESHOLDS: EngineThresholds = {
  elephant_tcv_threshold: 250000,
  mega_deal_tcv_threshold: 1000000,
  stale_stage_days: 21,
  ghost_pipeline_days: 14,
  phantom_champion_days: 30,
  close_date_warning_days: 30,
  gate_completion_warn_pct: 50,
  reporting_currency: "USD",
  momentum_drop_pct: 40,
  momentum_window_days: 30,
  momentum_min_gate_pct: 60,
  low_attach_rate_threshold: 0.34,
  competitive_stall_days: 21,
  suite_bundle_min_components: 3,
  poc_max_validation_days: 30,
  siem_high_volume_log_sources: 500,
};

const WEIGHT_MAP: Record<string, number> = Object.fromEntries(
  riskPatterns.map((p) => [p.code, p.weight]),
);

export function toISO(value: Date | string | null | undefined): string | null {
  if (value == null) return null;
  if (typeof value === "string") return value;
  return value.toISOString();
}

/**
 * Map a stored stakeholder sentiment to the engine literal. The stored values
 * (per the stakeholders-panel SENTIMENTS list and the schema's "Neutral"
 * default) already equal the engine literals, so the canonical five pass
 * through unchanged; anything unexpected degrades to "Neutral".
 */
const SENTIMENT_LITERALS = new Set([
  "Champion",
  "Supportive",
  "Neutral",
  "Skeptical",
  "Hostile",
]);
function mapSentiment(stored: string): string {
  return SENTIMENT_LITERALS.has(stored) ? stored : "Neutral";
}

/**
 * Engine thresholds are lookup data: read on every intelligence assembly and on
 * the portfolio summary, but they change only via the `/lookups/` config routes.
 * Cache them under the long-TTL `lookup:` tier; the cache-invalidation
 * middleware drops the whole `lookup:` prefix whenever a config route mutates,
 * so a threshold change is reflected immediately on the next read.
 */
export async function getThresholds(): Promise<{
  thresholds: EngineThresholds;
  seededDefaults: EngineThresholds;
}> {
  return cache.wrap(
    `${CacheKeys.lookupPrefix}thresholds`,
    CacheTtl.lookup,
    async () => {
      const rows = await db.select().from(engineThresholds);
      const thresholds: EngineThresholds = { ...DEFAULT_THRESHOLDS };
      for (const row of rows) {
        if (row.dataType === "string") {
          thresholds[row.parameterKey] = row.parameterValue;
        } else {
          const num = Number(row.parameterValue);
          thresholds[row.parameterKey] = Number.isNaN(num)
            ? row.parameterValue
            : num;
        }
      }
      return { thresholds, seededDefaults: { ...DEFAULT_THRESHOLDS } };
    },
  );
}

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

/** Portfolio Risk Analysis constants, derived from the same cached thresholds. */
export async function getPortfolioConfig() {
  const { thresholds } = await getThresholds();
  return derivePortfolioConfig(thresholds);
}

export async function getFxRate(
  base: string,
  quote: string,
): Promise<number | null> {
  if (base === quote) return 1;
  // FX rates are lookup data keyed by currency pair; invalidated with the rest
  // of the `lookup:` tier whenever a config route mutates.
  return cache.wrap(
    `${CacheKeys.lookupPrefix}fx:${base}:${quote}`,
    CacheTtl.lookup,
    async () => {
      const rows = await db
        .select()
        .from(fxRates)
        .where(
          and(eq(fxRates.baseCurrency, base), eq(fxRates.quoteCurrency, quote)),
        )
        .orderBy(desc(fxRates.asOf))
        .limit(1);
      if (rows.length === 0) return null;
      return Number(rows[0].rate);
    },
  );
}

interface GateView {
  gateCode: string;
  label: string;
  gateGroup: number;
  description: string | null;
  sortOrder: number;
  isCompleted: boolean;
  completedAt: string | null;
  completedBy: string | null;
  notes: string | null;
  prerequisiteGateCodes: string[];
}

export async function getDealGates(dealId: string): Promise<GateView[]> {
  const defs = await db
    .select()
    .from(gateDefinitions)
    .where(eq(gateDefinitions.isActive, true))
    .orderBy(asc(gateDefinitions.sortOrder));
  const rows = await db
    .select()
    .from(dealTechnicalGates)
    .where(eq(dealTechnicalGates.dealId, dealId));
  const rowMap = new Map(rows.map((r) => [r.gateCode, r]));

  return defs.map((def) => {
    const row = rowMap.get(def.gateCode);
    return {
      gateCode: def.gateCode,
      label: def.label,
      gateGroup: def.gateGroup,
      description: def.description ?? null,
      sortOrder: def.sortOrder,
      isCompleted: row?.isCompleted ?? false,
      completedAt: toISO(row?.completedAt ?? null),
      completedBy: row?.completedBy ?? null,
      notes: row?.notes ?? null,
      prerequisiteGateCodes: def.prerequisiteGateCodes ?? [],
    };
  });
}

interface DealWithLookups {
  deal: typeof enterpriseDeals.$inferSelect;
  salesStage: string;
  pricingModel: string;
  servicesTier: string;
  competitorName: string | null;
  complianceDriverName: string | null;
}

export async function getDealWithLookups(
  dealId: string,
): Promise<DealWithLookups | null> {
  const rows = await db
    .select({
      deal: enterpriseDeals,
      salesStage: pipelineStages.stageName,
      pricingModel: pricingModels.modelName,
      servicesTier: servicesTiers.tierName,
      competitorName: competitors.name,
      complianceDriverName: complianceDrivers.name,
    })
    .from(enterpriseDeals)
    .innerJoin(pipelineStages, eq(enterpriseDeals.salesStageId, pipelineStages.id))
    .innerJoin(pricingModels, eq(enterpriseDeals.pricingModelId, pricingModels.id))
    .innerJoin(servicesTiers, eq(enterpriseDeals.servicesTierId, servicesTiers.id))
    .leftJoin(competitors, eq(enterpriseDeals.competitorId, competitors.id))
    .leftJoin(
      complianceDrivers,
      eq(enterpriseDeals.complianceDriverId, complianceDrivers.id),
    )
    .where(eq(enterpriseDeals.id, dealId))
    .limit(1);
  return rows[0] ?? null;
}

/** Products the customer landed for / is initially evaluating (anchor set). */
export async function getProductsOfInterest(dealId: string) {
  const rows = await db
    .select({ product: productCatalog })
    .from(dealProductInterests)
    .innerJoin(
      productCatalog,
      eq(dealProductInterests.productId, productCatalog.id),
    )
    .where(eq(dealProductInterests.dealId, dealId));
  return rows.map(({ product }) => ({
    productId: product.id,
    productName: product.productName,
    productCategory: product.productCategory ?? null,
    code: product.code,
    suite: product.suite ?? null,
    isPitched: false,
  }));
}

/** Additional compliance drivers (beyond the deal's primary driver). */
export async function getExtraComplianceDrivers(dealId: string) {
  const rows = await db
    .select({ id: complianceDrivers.id, name: complianceDrivers.name })
    .from(dealComplianceDrivers)
    .innerJoin(
      complianceDrivers,
      eq(dealComplianceDrivers.complianceDriverId, complianceDrivers.id),
    )
    .where(eq(dealComplianceDrivers.dealId, dealId));
  return rows;
}

function enrichAlert(alert: IntelligenceOutput["governance"]["alerts"][number], interventionMap: Map<string, { checklistId: number; name: string }>) {
  return {
    ...alert,
    weight: WEIGHT_MAP[alert.code],
    intervention: interventionMap.get(alert.code) ?? null,
  };
}

export type AssembledIntelligence = ReturnType<typeof shapeIntelligence>;

interface ProductRef {
  productId: string;
  productName: string;
  productCategory: string | null;
  code: string | null;
  suite: string | null;
  isPitched: boolean;
}

interface IntelligenceExtras {
  recommendations: (IntelligenceOutput["recommendations"][number] & {
    products: ProductRef[];
  })[];
  battlecard: { competitor: string; talkingPoints: string[] } | null;
  complianceGuidance: {
    driver: string;
    deadline: string | null;
    daysToDeadline: number | null;
    recommendedProductCodes: string[];
  } | null;
}

function shapeIntelligence(
  output: IntelligenceOutput,
  gates: GateView[],
  whitespace: ProductRef[],
  interventionMap: Map<string, { checklistId: number; name: string }>,
  extras: IntelligenceExtras,
) {
  return {
    ...output,
    // Risk Engine v2 composite — pass straight through, no transform (route zod
    // surfacing is handled in Task B6, but the value must already flow now).
    risk: output.risk,
    stageEnteredAt: toISO(output.stageEnteredAt),
    financials: {
      ...output.financials,
      crossSell: {
        ...output.financials.crossSell,
        attachRate: output.financials.crossSell.attachRate ?? 0,
        whitespace,
      },
    },
    technicalTrack: {
      ...output.technicalTrack,
      gates,
    },
    governance: {
      ...output.governance,
      alerts: output.governance.alerts.map((a) =>
        enrichAlert(a, interventionMap),
      ),
      managedAlerts: output.governance.managedAlerts.map((a) =>
        enrichAlert(a, interventionMap),
      ),
    },
    recommendations: extras.recommendations,
    battlecard: extras.battlecard,
    complianceGuidance: extras.complianceGuidance,
  };
}

export async function assembleDealIntelligence(dealId: string) {
  const dealRow = await getDealWithLookups(dealId);
  if (!dealRow) return null;
  const { deal, salesStage, pricingModel, servicesTier } = dealRow;

  const gates = await getDealGates(dealId);

  const catalog = await db
    .select()
    .from(productCatalog)
    .where(eq(productCatalog.isActive, true));
  const pitched = await db
    .select()
    .from(dealCrossSells)
    .where(eq(dealCrossSells.dealId, dealId));
  const catalogById = new Map(catalog.map((c) => [c.id, c]));
  const pitchedIds = new Set(pitched.map((p) => p.productId));

  const crossSells = pitched
    .filter((p) => catalogById.has(p.productId))
    .map((p) => {
      const product = catalogById.get(p.productId)!;
      return {
        productId: p.productId,
        productName: product.productName,
        productCategory: product.productCategory ?? null,
        code: product.code,
        suite: product.suite ?? null,
        isPitched: p.isPitched,
      };
    });
  const whitespace = catalog
    .filter((c) => !pitchedIds.has(c.id))
    .map((c) => ({
      productId: c.id,
      productName: c.productName,
      productCategory: c.productCategory ?? null,
      code: c.code,
      suite: c.suite ?? null,
      isPitched: false,
    }));

  const productsOfInterest = await getProductsOfInterest(dealId);
  const extraDrivers = await getExtraComplianceDrivers(dealId);
  const complianceDriverNames = [
    ...(dealRow.complianceDriverName ? [dealRow.complianceDriverName] : []),
    ...extraDrivers.map((d) => d.name),
  ].filter((v, i, arr) => arr.indexOf(v) === i);

  const blockerRows = await db
    .select({
      isResolved: dealBlockers.isResolved,
      severityName: blockerSeverities.severityName,
    })
    .from(dealBlockers)
    .innerJoin(
      blockerSeverities,
      eq(dealBlockers.severityId, blockerSeverities.id),
    )
    .where(eq(dealBlockers.dealId, dealId));
  const activeBlockers = blockerRows
    .filter((b) => !b.isResolved)
    .map((b) => ({ severity_name: b.severityName }));

  const dispositionRows = await db
    .select()
    .from(dealAlertDispositions)
    .where(eq(dealAlertDispositions.dealId, dealId));
  const dispositions = dispositionRows.map((d) => ({
    pattern_code: d.patternCode,
    disposition: d.disposition as "acknowledge" | "accept" | "snooze",
    rationale: d.rationale,
    snooze_until_field_change: d.snoozeUntilFieldChange,
  }));

  const auditRows = await db
    .select({
      entityType: dealAuditLog.entityType,
      fieldChanged: dealAuditLog.fieldChanged,
      newValue: dealAuditLog.newValue,
      changedAt: dealAuditLog.changedAt,
    })
    .from(dealAuditLog)
    .where(eq(dealAuditLog.dealId, dealId));
  const auditForMomentum = auditRows.map((a) => ({
    entity_type: a.entityType,
    field_changed: a.fieldChanged,
    new_value: a.newValue,
    changed_at: a.changedAt,
  }));

  const interventionRows = await db
    .select()
    .from(interventionChecklists)
    .where(eq(interventionChecklists.isActive, true));
  const interventionMap = new Map<
    string,
    { checklistId: number; name: string }
  >();
  for (const ic of interventionRows) {
    if (!interventionMap.has(ic.triggerPatternCode)) {
      interventionMap.set(ic.triggerPatternCode, {
        checklistId: ic.id,
        name: ic.name,
      });
    }
  }

  const { thresholds, seededDefaults } = await getThresholds();
  const reportingCurrency = String(
    thresholds.reporting_currency || "USD",
  );
  const fxRate = await getFxRate(deal.dealCurrency, reportingCurrency);

  const ownMomentum = calculateOwnMomentum(
    { created_at: deal.createdAt },
    auditForMomentum,
    thresholds,
  );

  // ── Risk Engine v2 inputs ──────────────────────────────────────────────
  // Stakeholders for this deal. Stored `sentiment` values already match the
  // engine literals (Champion/Supportive/Neutral/Skeptical/Hostile — see the
  // stakeholders-panel SENTIMENTS list + schema default "Neutral"); we still
  // map through an allowlist so any stray value degrades to "Neutral".
  const stakeholderRows = await db
    .select({
      name: stakeholders.name,
      sentiment: stakeholders.sentiment,
      isDecisionMaker: stakeholders.isDecisionMaker,
    })
    .from(stakeholders)
    .where(eq(stakeholders.dealId, dealId));
  const engineStakeholders: StakeholderInput[] = stakeholderRows.map((s) => ({
    name: s.name,
    sentiment: mapSentiment(s.sentiment),
    isDecisionMaker: s.isDecisionMaker,
  }));

  // Competitors linked to this deal. Stored `status` already matches the engine
  // (it only checks === "Active"); winRate (0–1) comes from the shared cached
  // global tally, null when this competitor has no Won/Lost history.
  const winRates = await competitorWinRates();
  const competitorRows = await db
    .select({
      competitorId: dealCompetitors.competitorId,
      name: competitors.name,
      status: dealCompetitors.status,
    })
    .from(dealCompetitors)
    .leftJoin(competitors, eq(dealCompetitors.competitorId, competitors.id))
    .where(eq(dealCompetitors.dealId, dealId));
  const engineCompetitors: CompetitorInput[] = competitorRows.map((c) => ({
    name: c.name ?? "Unknown",
    status: c.status,
    winRate: winRates.get(c.competitorId)?.winRate ?? null,
  }));

  // Median days for this deal's current stage from the velocity benchmark rollup.
  const benchmarkRows = await db
    .select({ medianDays: velocityBenchmarks.medianDays })
    .from(velocityBenchmarks)
    .where(eq(velocityBenchmarks.stageName, salesStage))
    .limit(1);
  const velocityBenchmarkDays =
    benchmarkRows[0]?.medianDays != null
      ? Number(benchmarkRows[0].medianDays)
      : null;

  const riskWeights = deriveRiskWeights(thresholds);
  const riskBoundaries = deriveRiskBoundaries(thresholds);

  const rawDeal: RawDeal = {
    id: deal.id,
    deal_name: deal.dealName,
    account_name: deal.accountName,
    crm_record_url: deal.crmRecordUrl,
    account_manager: deal.accountManager,
    technical_lead: deal.technicalLead,
    sales_stage: salesStage,
    stage_entered_at: deal.stageEnteredAt,
    product_revenue: deal.productRevenue,
    pricing_model: pricingModel,
    contract_term_years: deal.contractTermYears,
    deal_currency: deal.dealCurrency,
    expected_close_date: deal.expectedCloseDate,
    win_probability_pct: deal.winProbabilityPct,
    services_revenue: deal.servicesRevenue,
    services_tier: servicesTier,
    manager_strategic_blueprint: deal.managerStrategicBlueprint,
    created_at: deal.createdAt,
    landed_at: deal.landedAt,
    updated_at: deal.updatedAt,
    cross_sells: crossSells,
    competitor: dealRow.competitorName,
    compliance_driver: dealRow.complianceDriverName,
    compliance_drivers: complianceDriverNames,
    estimated_log_sources: deal.estimatedLogSources,
    anchor_products: productsOfInterest.map((p) => ({
      code: p.code ?? "",
      productName: p.productName,
      suite: p.suite,
    })),
  };

  const engineGates: RawGate[] = gates.map((g) => ({
    gate_code: g.gateCode,
    gate_group: g.gateGroup,
    label: g.label,
    is_completed: g.isCompleted,
    completed_at: g.completedAt,
    prerequisite_gate_codes: g.prerequisiteGateCodes,
  }));

  const output = processDealIntelligence(
    rawDeal,
    engineGates,
    activeBlockers,
    thresholds,
    {
      fxRate,
      reportingCurrency,
      catalogCount: catalog.length,
      ownMomentum,
      dispositions,
      seededDefaults: seededDefaults as Record<string, string | number>,
      stakeholders: engineStakeholders,
      competitors: engineCompetitors,
      velocityBenchmarkDays,
      riskWeights,
      riskBoundaries,
    },
  );

  // Enrich engine recommendations (codes only) with display-ready products.
  const catalogByCode = new Map(catalog.map((c) => [c.code, c]));
  const recommendations = output.recommendations.map((r) => ({
    ...r,
    products: r.productCodes
      .map((code) => catalogByCode.get(code))
      .filter((c): c is NonNullable<typeof c> => !!c)
      .map((c) => ({
        productId: c.id,
        productName: c.productName,
        productCategory: c.productCategory ?? null,
        code: c.code,
        suite: c.suite ?? null,
        isPitched: false,
      })),
  }));

  // Competitor battlecard (editable content keyed by competitor).
  let battlecard: IntelligenceExtras["battlecard"] = null;
  if (deal.competitorId && dealRow.competitorName) {
    const bcRows = await db
      .select()
      .from(competitorBattlecards)
      .where(
        and(
          eq(competitorBattlecards.competitorId, deal.competitorId),
          eq(competitorBattlecards.isActive, true),
        ),
      )
      .limit(1);
    if (bcRows.length > 0) {
      battlecard = {
        competitor: dealRow.competitorName,
        talkingPoints: bcRows[0].talkingPoints,
      };
    }
  }

  // Compliance guidance: deadline countdown + the products that carry the story.
  let complianceGuidance: IntelligenceExtras["complianceGuidance"] = null;
  if (dealRow.complianceDriverName) {
    const daysToDeadline = deal.complianceDeadline
      ? Math.max(
          0,
          Math.floor(
            (new Date(deal.complianceDeadline).getTime() - Date.now()) /
              86400000,
          ),
        )
      : null;
    complianceGuidance = {
      driver: dealRow.complianceDriverName,
      deadline: deal.complianceDeadline,
      daysToDeadline,
      recommendedProductCodes:
        COMPLIANCE_PRODUCTS[dealRow.complianceDriverName] ?? [],
    };
  }

  return shapeIntelligence(output, gates, whitespace, interventionMap, {
    recommendations,
    battlecard,
    complianceGuidance,
  });
}

export async function serializeDeal(dealId: string) {
  const dealRow = await getDealWithLookups(dealId);
  if (!dealRow) return null;
  const intel = await assembleDealIntelligence(dealId);
  const productsOfInterest = await getProductsOfInterest(dealId);
  const extraDrivers = await getExtraComplianceDrivers(dealId);
  const { deal, salesStage, pricingModel, servicesTier } = dealRow;
  const complianceDriverList = [
    ...(deal.complianceDriverId && dealRow.complianceDriverName
      ? [{ id: deal.complianceDriverId, name: dealRow.complianceDriverName }]
      : []),
    ...extraDrivers,
  ].filter((d, i, arr) => arr.findIndex((x) => x.id === d.id) === i);
  return {
    id: deal.id,
    dealName: deal.dealName,
    accountName: deal.accountName,
    crmRecordUrl: deal.crmRecordUrl,
    accountManager: deal.accountManager,
    technicalLead: deal.technicalLead,
    salesStageId: deal.salesStageId,
    salesStage,
    stageEnteredAt: toISO(deal.stageEnteredAt) ?? undefined,
    productRevenue: Number(deal.productRevenue),
    pricingModelId: deal.pricingModelId,
    pricingModel,
    contractTermYears: deal.contractTermYears,
    dealCurrency: deal.dealCurrency,
    expectedCloseDate: deal.expectedCloseDate,
    landedAt: deal.landedAt,
    winProbabilityPct: deal.winProbabilityPct,
    committed: deal.committed,
    servicesRevenue: Number(deal.servicesRevenue),
    servicesTierId: deal.servicesTierId,
    servicesTier,
    managerStrategicBlueprint: deal.managerStrategicBlueprint,
    speakerNotes: deal.speakerNotes,
    lossReason: deal.lossReason,
    lossArchetypeId: deal.lossArchetypeId,
    competitorId: deal.competitorId,
    competitorName: dealRow.competitorName,
    complianceDriverId: deal.complianceDriverId,
    complianceDriverName: dealRow.complianceDriverName,
    complianceDeadline: deal.complianceDeadline,
    estimatedLogSources: deal.estimatedLogSources,
    productsOfInterest,
    complianceDrivers: complianceDriverList,
    calculatedTCV: intel?.financials.calculatedTCV ?? 0,
    normalizedTCV: intel?.financials.normalizedTCV ?? 0,
    healthStatus: intel?.governance.healthStatus ?? "GREEN",
    archivedAt: toISO(deal.archivedAt),
    deletedAt: toISO(deal.deletedAt),
    createdAt: toISO(deal.createdAt) ?? undefined,
    updatedAt: toISO(deal.updatedAt) ?? undefined,
  };
}

export { WEIGHT_MAP };
