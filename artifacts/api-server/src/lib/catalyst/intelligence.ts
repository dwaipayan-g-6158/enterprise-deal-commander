// Catalyst-backed reimplementation of ../intelligence.ts, for the routes
// already migrated off Drizzle (see docs/CATALYST_SCHEMA.md /
// docs/catalyst-datastore-constraints.md / the Catalyst migration plan).
//
// Deliberately a PARALLEL file, not an in-place rewrite of ../intelligence.ts:
// that file is still imported, unmodified, by routes/v2/analytics.ts,
// routes/v2/crud.ts, routes/intelligence.ts, lib/portfolio.ts,
// lib/portfolio-rollups.ts, and 3 lib/subscribers/* files — none of which are
// migrated yet. Every exported function here takes an explicit `catalystApp`
// (per-request-scoped — see lib/db/src/catalyst/sdk.ts), which the original
// Drizzle version has no equivalent of. Keep this file's logic in lockstep
// with ../intelligence.ts's until the day the Drizzle version's last caller
// migrates and it can be deleted.
import {
  type CatalystApp,
  createPipelineStagesRepo,
  createPricingModelsRepo,
  createServicesTiersRepo,
  createProductCatalogRepo,
  createBlockerSeveritiesRepo,
  createGateDefinitionsRepo,
  createAd360FeaturesRepo,
  createComplianceDriversRepo,
  createCompetitorsRepo,
  createCompetitorBattlecardsRepo,
  createInterventionChecklistsRepo,
  createEngineThresholdsRepo,
  createFxRatesRepo,
  createEnterpriseDealsRepo,
  createDealTechnicalGatesRepo,
  createDealCrossSellsRepo,
  createDealProductInterestsRepo,
  createDealAd360FeaturesRepo,
  createDealComplianceDriversRepo,
  createDealBlockersRepo,
  createDealAlertDispositionsRepo,
  createDealAuditLogRepo,
  createDealCompetitorsRepo,
  createStakeholdersRepo,
  createVelocityBenchmarksRepo,
  type EnterpriseDeal,
} from "@workspace/db/catalyst";
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
  type Alert,
} from "@workspace/engine";
import { cache, CacheKeys, CacheTtl } from "../cache";
import { competitorWinRates } from "./competitive";
import { deriveRiskWeights, deriveRiskBoundaries, deriveHealthWeights, derivePortfolioConfig } from "../engine-config";
import { getPlaybookSignals } from "./playbook-signals";
import { snapshotFieldValue } from "../snooze-fields";

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
export async function getThresholds(catalystApp: CatalystApp): Promise<{
  thresholds: EngineThresholds;
  seededDefaults: EngineThresholds;
}> {
  return cache.wrap(
    `${CacheKeys.lookupPrefix}thresholds`,
    CacheTtl.lookup,
    async () => {
      const rows = await createEngineThresholdsRepo(catalystApp).listAll();
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
export async function getHealthWeights(catalystApp: CatalystApp) {
  const { thresholds } = await getThresholds(catalystApp);
  return deriveHealthWeights(thresholds);
}

/** Portfolio Risk Analysis constants, derived from the same cached thresholds. */
export async function getPortfolioConfig(catalystApp: CatalystApp) {
  const { thresholds } = await getThresholds(catalystApp);
  return derivePortfolioConfig(thresholds);
}

export async function getFxRate(
  catalystApp: CatalystApp,
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
      const rows = await createFxRatesRepo(catalystApp).listAll();
      const matches = rows
        .filter((r) => r.baseCurrency === base && r.quoteCurrency === quote)
        .sort((a, b) => b.asOf.localeCompare(a.asOf)); // desc(asOf) — asOf is an ISO date string
      return matches.length > 0 ? matches[0].rate : null;
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

export async function getDealGates(catalystApp: CatalystApp, dealId: string): Promise<GateView[]> {
  const defs = await createGateDefinitionsRepo(catalystApp).listActive();
  const rows = await createDealTechnicalGatesRepo(catalystApp).list(dealId);
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
  deal: EnterpriseDeal;
  salesStage: string;
  pricingModel: string;
  servicesTier: string;
  competitorName: string | null;
  complianceDriverName: string | null;
}

export async function getDealWithLookups(
  catalystApp: CatalystApp,
  dealId: string,
): Promise<DealWithLookups | null> {
  const deal = await createEnterpriseDealsRepo(catalystApp).getById(dealId);
  if (!deal) return null;

  const [stages, pricingModels, servicesTiers, competitors, complianceDrivers] = await Promise.all([
    createPipelineStagesRepo(catalystApp).listAll(),
    createPricingModelsRepo(catalystApp).listAll(),
    createServicesTiersRepo(catalystApp).listAll(),
    createCompetitorsRepo(catalystApp).listAll(),
    createComplianceDriversRepo(catalystApp).listAll(),
  ]);

  const stage = stages.find((s) => s.id === deal.salesStageId);
  const pricingModel = pricingModels.find((p) => p.id === deal.pricingModelId);
  const servicesTier = servicesTiers.find((s) => s.id === deal.servicesTierId);
  // Mirrors the original Drizzle innerJoin semantics: these three are required
  // matches, not optional — a dangling id means the row doesn't resolve.
  if (!stage || !pricingModel || !servicesTier) return null;

  const competitorName =
    deal.competitorId != null ? competitors.find((c) => c.id === deal.competitorId)?.name ?? null : null;
  const complianceDriverName =
    deal.complianceDriverId != null
      ? complianceDrivers.find((c) => c.id === deal.complianceDriverId)?.name ?? null
      : null;

  return {
    deal,
    salesStage: stage.stageName,
    pricingModel: pricingModel.modelName,
    servicesTier: servicesTier.tierName,
    competitorName,
    complianceDriverName,
  };
}

/** Products the customer landed for / is initially evaluating (anchor set). */
export async function getProductsOfInterest(catalystApp: CatalystApp, dealId: string) {
  const links = await createDealProductInterestsRepo(catalystApp).list(dealId);
  const catalog = await createProductCatalogRepo(catalystApp).listAll();
  const catalogById = new Map(catalog.map((c) => [c.id, c]));
  return links
    .map((l) => catalogById.get(l.productId))
    .filter((product): product is NonNullable<typeof product> => !!product)
    .map((product) => ({
      productId: product.id,
      productName: product.productName,
      productCategory: product.productCategory ?? null,
      code: product.code,
      suite: product.suite ?? null,
      isPitched: false,
    }));
}

/**
 * Selected AD360 Enterprise platform-customization features for a deal
 * (informational only — not consumed by the engine; see PRODUCT_AFFINITY /
 * generateRecommendations in @workspace/engine for how the product itself,
 * by code, participates in recommendations).
 */
export async function getAd360Features(catalystApp: CatalystApp, dealId: string) {
  const links = await createDealAd360FeaturesRepo(catalystApp).list(dealId);
  const features = await createAd360FeaturesRepo(catalystApp).listAll();
  const byId = new Map(features.map((f) => [f.id, f]));
  return links
    .map((l) => byId.get(l.featureId))
    .filter((f): f is NonNullable<typeof f> => !!f)
    .map((f) => ({ id: f.id, code: f.code, label: f.label, description: f.description ?? null }));
}

/** Additional compliance drivers (beyond the deal's primary driver). */
export async function getExtraComplianceDrivers(catalystApp: CatalystApp, dealId: string) {
  const links = await createDealComplianceDriversRepo(catalystApp).list(dealId);
  const drivers = await createComplianceDriversRepo(catalystApp).listAll();
  const byId = new Map(drivers.map((d) => [d.id, d]));
  return links
    .map((l) => byId.get(l.complianceDriverId))
    .filter((d): d is NonNullable<typeof d> => !!d);
}

/**
 * Whether a RED alert should still block stage advancement (the PATCH/PUT
 * /deals/:id guardrail — see CLAUDE.md: "advancing past an active RED risk
 * pattern returns 409 STAGE_GUARDRAIL unless an override_reason is
 * supplied"). Only the `accept` disposition legitimately clears a RED alert:
 * it carries its own mandatory rationale (enforced by
 * routes/dispositions.ts), an independent audit trail equivalent to the
 * override_reason itself. `acknowledge` (no rationale required) and
 * `snooze` (only a duration) carry no equivalent accountability, so a RED
 * alert bearing either of those — or no disposition at all (unmanaged) —
 * must still block. Shared by the write-path guardrail in routes/deals.ts so
 * the predicate can't drift between call sites again.
 */
export function isBlockingRedAlert(
  alert: Pick<Alert, "severity" | "disposition">,
): boolean {
  return alert.severity === "RED" && alert.disposition?.state !== "accept";
}

/** The deal shape `snapshotFieldValue` reads — only the five watched fields. */
type SnoozeWatchedDeal = Parameters<typeof snapshotFieldValue>[1];

/**
 * A deal's dispositions with lapsed snoozes already dropped.
 *
 * Lazy snooze expiry (no cron/subscriber): a snooze lapses when the duration
 * elapses OR the watched field's value no longer matches the snapshot taken at
 * snooze time — whichever comes first. Expired rows are dropped from this read
 * so the pattern reappears in `alerts` immediately, and best-effort deleted so
 * they don't linger; if the delete fails, the same lapsed row is simply
 * re-evaluated (and re-deleted) next read.
 *
 * Exported because the contextual V2 alerts (competitive + stakeholder) are
 * merged into the response outside the engine, and they have to answer "is this
 * dispositioned?" with the *same* notion of live that the engine patterns use.
 * When this logic lived inline in `assembleDealIntelligence`, they could not
 * reach it, so every contextual alert was hardcoded undispositioned and a
 * disposition written against one silently did nothing on the next read.
 */
export async function getLiveDispositions(
  catalystApp: CatalystApp,
  dealId: string,
  deal: SnoozeWatchedDeal,
) {
  const dispositionsRepo = createDealAlertDispositionsRepo(catalystApp);
  const dispositionRows = await dispositionsRepo.list(dealId);

  const now = new Date();
  const expiredIds: string[] = [];
  const liveDispositionRows = dispositionRows.filter((d) => {
    if (d.disposition !== "snooze") return true;
    const pastDuration = d.snoozeUntil != null && now >= d.snoozeUntil;
    const fieldChanged =
      d.snoozeFieldBaseline != null &&
      d.snoozeUntilFieldChange != null &&
      snapshotFieldValue(d.snoozeUntilFieldChange, deal) !== d.snoozeFieldBaseline;
    const expired = pastDuration || fieldChanged;
    if (expired) expiredIds.push(d.id);
    return !expired;
  });
  if (expiredIds.length > 0) {
    dispositionsRepo.deleteByIds(expiredIds).catch(() => {});
  }

  return liveDispositionRows.map((d) => ({
    pattern_code: d.patternCode,
    disposition: d.disposition as "acknowledge" | "accept" | "snooze",
    rationale: d.rationale,
    snooze_until_field_change: d.snoozeUntilFieldChange,
    snooze_until: toISO(d.snoozeUntil),
    created_by: d.createdBy,
    created_at: toISO(d.createdAt),
  }));
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

export async function assembleDealIntelligence(catalystApp: CatalystApp, dealId: string) {
  const dealRow = await getDealWithLookups(catalystApp, dealId);
  if (!dealRow) return null;
  const { deal, salesStage, pricingModel, servicesTier } = dealRow;

  const gates = await getDealGates(catalystApp, dealId);

  const catalog = await createProductCatalogRepo(catalystApp).listActive();
  const pitched = await createDealCrossSellsRepo(catalystApp).list(dealId);
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

  const productsOfInterest = await getProductsOfInterest(catalystApp, dealId);
  const extraDrivers = await getExtraComplianceDrivers(catalystApp, dealId);
  const complianceDriverNames = [
    ...(dealRow.complianceDriverName ? [dealRow.complianceDriverName] : []),
    ...extraDrivers.map((d) => d.name),
  ].filter((v, i, arr) => arr.indexOf(v) === i);

  const blockers = await createDealBlockersRepo(catalystApp).list(dealId);
  const severities = await createBlockerSeveritiesRepo(catalystApp).listAll();
  const severityNameById = new Map(severities.map((s) => [s.id, s.severityName]));
  const activeBlockers = blockers
    .filter((b) => !b.isResolved && severityNameById.has(b.severityId))
    .map((b) => ({ severity_name: severityNameById.get(b.severityId)! }));

  const dispositions = await getLiveDispositions(catalystApp, dealId, deal);

  const auditRows = await createDealAuditLogRepo(catalystApp).list(dealId);
  const auditForMomentum = auditRows.map((a) => ({
    entity_type: a.entityType,
    field_changed: a.fieldChanged,
    new_value: a.newValue,
    changed_at: a.changedAt,
  }));

  const interventionRows = await createInterventionChecklistsRepo(catalystApp).listActive();
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

  const { thresholds, seededDefaults } = await getThresholds(catalystApp);
  const reportingCurrency = String(
    thresholds.reporting_currency || "USD",
  );
  const fxRate = await getFxRate(catalystApp, deal.dealCurrency, reportingCurrency);

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
  const stakeholderRows = await createStakeholdersRepo(catalystApp).list(dealId);
  const engineStakeholders: StakeholderInput[] = stakeholderRows.map((s) => ({
    name: s.name,
    sentiment: mapSentiment(s.sentiment),
    isDecisionMaker: s.isDecisionMaker,
  }));

  // Competitors linked to this deal. Stored `status` already matches the engine
  // (it only checks === "Active"); winRate (0–1) comes from the shared cached
  // global tally, null when this competitor has no Won/Lost history.
  const winRates = await competitorWinRates(catalystApp);
  const competitorLinks = await createDealCompetitorsRepo(catalystApp).list(dealId);
  const allCompetitors = await createCompetitorsRepo(catalystApp).listAll();
  const competitorNameById = new Map(allCompetitors.map((c) => [c.id, c.name]));
  const engineCompetitors: CompetitorInput[] = competitorLinks.map((c) => ({
    name: competitorNameById.get(c.competitorId) ?? "Unknown",
    status: c.status,
    winRate: winRates.get(c.competitorId)?.winRate ?? null,
  }));

  // Median days for this deal's current stage from the velocity benchmark rollup.
  const velocityBenchmarkDays = await createVelocityBenchmarksRepo(catalystApp).getMedianDaysForStage(salesStage);

  const riskWeights = deriveRiskWeights(thresholds);
  const riskBoundaries = deriveRiskBoundaries(thresholds);

  // Playbook execution signals feed the PLAYBOOK_EXECUTION_GAP risk pattern.
  const playbookSignals = await getPlaybookSignals(catalystApp, deal.id);

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
    is_perpetual_term: deal.isPerpetualTerm,
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
      playbookCriticalGaps: playbookSignals.criticalGaps,
      playbookOverdueCount: playbookSignals.overdueCount,
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
    const battlecards = await createCompetitorBattlecardsRepo(catalystApp).listActive();
    const bc = battlecards.find((b) => b.competitorId === deal.competitorId);
    if (bc) {
      battlecard = {
        competitor: dealRow.competitorName,
        talkingPoints: bc.talkingPoints,
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

/**
 * `loadIntel` is injected rather than chosen here so this module keeps knowing
 * nothing about the cache: portfolio.ts already imports from this file, so
 * importing `cachedIntel` back would be a cycle. Read paths (the deal LIST)
 * pass `cachedIntel`; write paths keep the default uncached assembler, because
 * a mutation response must reflect the write that just happened rather than a
 * pre-mutation cache entry — see cachedIntel's own contract in portfolio.ts.
 */
export async function serializeDeal(
  catalystApp: CatalystApp,
  dealId: string,
  loadIntel: (
    catalystApp: CatalystApp,
    id: string,
  ) => Promise<Awaited<ReturnType<typeof assembleDealIntelligence>>> = assembleDealIntelligence,
) {
  const dealRow = await getDealWithLookups(catalystApp, dealId);
  if (!dealRow) return null;
  const intel = await loadIntel(catalystApp, dealId);
  const productsOfInterest = await getProductsOfInterest(catalystApp, dealId);
  const selectedAd360Features = await getAd360Features(catalystApp, dealId);
  const extraDrivers = await getExtraComplianceDrivers(catalystApp, dealId);
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
    isPerpetualTerm: deal.isPerpetualTerm,
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
    ad360SeatCount: deal.ad360SeatCount,
    ad360FeatureNotes: deal.ad360FeatureNotes,
    ad360Features: selectedAd360Features,
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
