import { useMemo } from "react";
import {
  processDealIntelligence,
  calculateOwnMomentum,
  type RawDeal,
  type RawGate,
  type RawBlocker,
  type EngineThresholds,
  type RawDisposition,
  type OwnMomentum,
  type IntelligenceOutput,
} from "@workspace/engine";
import {
  useListAudit,
  useListEngineThresholds,
  type Deal,
  type Intelligence,
} from "@workspace/api-client-react";

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

export interface EngineOverrides {
  salesStage?: string;
  productRevenue?: number;
  servicesRevenue?: number;
  servicesTier?: string;
  pricingModel?: string;
  termYears?: number;
  expectedCloseDate?: string | null;
  /** Map of gateCode -> isCompleted overriding the live gate state. */
  gates?: Record<string, boolean>;
}

export interface EngineContext {
  thresholds: EngineThresholds;
  ownMomentum: OwnMomentum | null;
  dispositions: RawDisposition[];
}

/**
 * Loads everything the pure engine needs (tuned thresholds, own-momentum from
 * the audit trail, and existing alert dispositions) so the identical engine can
 * be re-run client-side. NOTE: the audit list endpoint caps at 200 rows, so for
 * extremely active deals own-momentum may use fewer rows than the server; the
 * momentum windows are time-bounded so this is faithful for realistic volumes.
 */
export function useEngineContext(deal: Deal, intel: Intelligence): EngineContext {
  const { data: thresholdRes } = useListEngineThresholds();
  const { data: auditRes } = useListAudit(deal.id, { limit: 200 });

  const thresholds = useMemo<EngineThresholds>(() => {
    const t: EngineThresholds = { ...DEFAULT_THRESHOLDS };
    for (const row of thresholdRes?.data ?? []) {
      const num = Number(row.parameterValue);
      t[row.parameterKey] =
        row.dataType === "string" || Number.isNaN(num) ? row.parameterValue : num;
    }
    return t;
  }, [thresholdRes]);

  const ownMomentum = useMemo(() => {
    const rows = (auditRes?.data ?? []).map((a) => ({
      entity_type: a.entityType,
      field_changed: a.fieldChanged,
      new_value: a.newValue ?? null,
      changed_at: a.changedAt,
    }));
    return calculateOwnMomentum(
      { created_at: deal.createdAt ?? new Date().toISOString() },
      rows,
      thresholds,
    );
  }, [auditRes, deal.createdAt, thresholds]);

  const dispositions = useMemo<RawDisposition[]>(() => {
    const all = [...intel.governance.alerts, ...(intel.governance.managedAlerts ?? [])];
    return all
      .filter((a) => a.disposition)
      .map((a) => ({
        pattern_code: a.code,
        disposition: a.disposition!.state,
        rationale: a.disposition!.rationale ?? null,
        snooze_until_field_change: a.disposition!.snoozeUntilFieldChange ?? null,
      }));
  }, [intel]);

  return { thresholds, ownMomentum, dispositions };
}

/** Re-runs the pure intelligence engine with the given overrides. */
export function recomputeIntelligence(
  deal: Deal,
  intel: Intelligence,
  overrides: EngineOverrides,
  ctx: EngineContext,
): IntelligenceOutput {
  const rawDeal: RawDeal = {
    id: deal.id,
    deal_name: deal.dealName,
    account_name: deal.accountName,
    crm_record_url: deal.crmRecordUrl ?? null,
    account_manager: deal.accountManager,
    technical_lead: deal.technicalLead,
    sales_stage: overrides.salesStage ?? deal.salesStage,
    stage_entered_at: deal.stageEnteredAt ?? deal.createdAt ?? new Date().toISOString(),
    product_revenue: overrides.productRevenue ?? deal.productRevenue,
    pricing_model: overrides.pricingModel ?? deal.pricingModel ?? intel.financials.pricingModel,
    contract_term_years: overrides.termYears ?? deal.contractTermYears ?? 1,
    deal_currency: deal.dealCurrency,
    expected_close_date:
      overrides.expectedCloseDate !== undefined
        ? overrides.expectedCloseDate
        : (deal.expectedCloseDate ?? null),
    win_probability_pct: deal.winProbabilityPct ?? null,
    services_revenue: overrides.servicesRevenue ?? deal.servicesRevenue,
    services_tier: overrides.servicesTier ?? deal.servicesTier ?? intel.financials.servicesTier,
    manager_strategic_blueprint: deal.managerStrategicBlueprint ?? null,
    created_at: deal.createdAt ?? new Date().toISOString(),
    updated_at: deal.updatedAt ?? new Date().toISOString(),
    cross_sells: intel.financials.crossSells.map((c) => ({
      productId: c.productId,
      productName: c.productName,
      productCategory: c.productCategory ?? null,
      isPitched: c.isPitched,
    })),
  };

  const gates: RawGate[] = intel.technicalTrack.gates.map((g) => ({
    gate_code: g.gateCode,
    gate_group: g.gateGroup,
    label: g.label,
    is_completed: overrides.gates?.[g.gateCode] ?? g.isCompleted,
    completed_at: g.completedAt ?? null,
    prerequisite_gate_codes: g.prerequisiteGateCodes ?? [],
  }));

  const highSev = intel.governance.highSeverityBlockerCount;
  const active = intel.governance.activeBlockerCount;
  const blockers: RawBlocker[] = [
    ...Array.from({ length: highSev }, () => ({ severity_name: "High" })),
    ...Array.from({ length: Math.max(active - highSev, 0) }, () => ({
      severity_name: "Medium",
    })),
  ];

  return processDealIntelligence(rawDeal, gates, blockers, ctx.thresholds, {
    fxRate: intel.financials.fxRateApplied ?? null,
    reportingCurrency: intel.financials.reportingCurrency,
    catalogCount: intel.financials.crossSell.catalogCount,
    ownMomentum: ctx.ownMomentum,
    dispositions: ctx.dispositions,
    seededDefaults: ctx.thresholds as Record<string, string | number>,
  });
}
