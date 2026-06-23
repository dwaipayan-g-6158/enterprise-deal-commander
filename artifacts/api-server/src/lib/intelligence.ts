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
  dealBlockers,
  dealAlertDispositions,
  dealAuditLog,
  interventionChecklists,
  engineThresholds,
  fxRates,
} from "@workspace/db";
import {
  processDealIntelligence,
  calculateOwnMomentum,
  riskPatterns,
  type EngineThresholds,
  type RawDeal,
  type RawGate,
  type IntelligenceOutput,
} from "@workspace/engine";

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
};

const WEIGHT_MAP: Record<string, number> = Object.fromEntries(
  riskPatterns.map((p) => [p.code, p.weight]),
);

export function toISO(value: Date | string | null | undefined): string | null {
  if (value == null) return null;
  if (typeof value === "string") return value;
  return value.toISOString();
}

export async function getThresholds(): Promise<{
  thresholds: EngineThresholds;
  seededDefaults: EngineThresholds;
}> {
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
}

export async function getFxRate(
  base: string,
  quote: string,
): Promise<number | null> {
  if (base === quote) return 1;
  const rows = await db
    .select()
    .from(fxRates)
    .where(and(eq(fxRates.baseCurrency, base), eq(fxRates.quoteCurrency, quote)))
    .orderBy(desc(fxRates.asOf))
    .limit(1);
  if (rows.length === 0) return null;
  return Number(rows[0].rate);
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
    })
    .from(enterpriseDeals)
    .innerJoin(pipelineStages, eq(enterpriseDeals.salesStageId, pipelineStages.id))
    .innerJoin(pricingModels, eq(enterpriseDeals.pricingModelId, pricingModels.id))
    .innerJoin(servicesTiers, eq(enterpriseDeals.servicesTierId, servicesTiers.id))
    .where(eq(enterpriseDeals.id, dealId))
    .limit(1);
  return rows[0] ?? null;
}

function enrichAlert(alert: IntelligenceOutput["governance"]["alerts"][number], interventionMap: Map<string, { checklistId: number; name: string }>) {
  return {
    ...alert,
    weight: WEIGHT_MAP[alert.code],
    intervention: interventionMap.get(alert.code) ?? null,
  };
}

export type AssembledIntelligence = ReturnType<typeof shapeIntelligence>;

function shapeIntelligence(
  output: IntelligenceOutput,
  gates: GateView[],
  whitespace: {
    productId: string;
    productName: string;
    productCategory: string | null;
    isPitched: boolean;
  }[],
  interventionMap: Map<string, { checklistId: number; name: string }>,
) {
  return {
    ...output,
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
        isPitched: p.isPitched,
      };
    });
  const whitespace = catalog
    .filter((c) => !pitchedIds.has(c.id))
    .map((c) => ({
      productId: c.id,
      productName: c.productName,
      productCategory: c.productCategory ?? null,
      isPitched: false,
    }));

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
    updated_at: deal.updatedAt,
    cross_sells: crossSells,
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
    },
  );

  return shapeIntelligence(output, gates, whitespace, interventionMap);
}

export async function serializeDeal(dealId: string) {
  const dealRow = await getDealWithLookups(dealId);
  if (!dealRow) return null;
  const intel = await assembleDealIntelligence(dealId);
  const { deal, salesStage, pricingModel, servicesTier } = dealRow;
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
    winProbabilityPct: deal.winProbabilityPct,
    servicesRevenue: Number(deal.servicesRevenue),
    servicesTierId: deal.servicesTierId,
    servicesTier,
    managerStrategicBlueprint: deal.managerStrategicBlueprint,
    speakerNotes: deal.speakerNotes,
    lossReason: deal.lossReason,
    lossArchetypeId: deal.lossArchetypeId,
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
