// Enterprise Deal Commander — Intelligence Engine (F9: pure, isomorphic)
//
// This module performs NO database / network calls. All external data
// (thresholds, fx rate, catalog size, own-momentum context, dispositions) is
// passed in via arguments, so the identical function runs on the server and in
// the browser (the Risk Simulator) with no code divergence.

export type Severity = "RED" | "YELLOW" | "GREEN";
export type DispositionState = "acknowledge" | "accept" | "snooze";

export interface EngineThresholds {
  elephant_tcv_threshold: number;
  mega_deal_tcv_threshold: number;
  stale_stage_days: number;
  ghost_pipeline_days: number;
  phantom_champion_days: number;
  close_date_warning_days: number;
  gate_completion_warn_pct: number;
  reporting_currency: string;
  momentum_drop_pct: number;
  momentum_window_days: number;
  momentum_min_gate_pct: number;
  low_attach_rate_threshold: number;
  // IAM/SIEM sales additions
  competitive_stall_days: number;
  compliance_deadline_warning_days: number;
  compliance_min_gate_pct: number;
  suite_bundle_min_components: number;
  poc_max_validation_days: number;
  siem_high_volume_log_sources: number;
  [key: string]: number | string;
}

export interface RawCrossSell {
  productId: string;
  productName: string;
  productCategory: string | null;
  isPitched: boolean;
  // Stable code + suite let the engine reason about product mix (optional so
  // existing callers/tests that omit them keep compiling).
  code?: string;
  suite?: string | null;
}

export interface RawProductRef {
  code: string;
  productName?: string;
  suite?: string | null;
}

export interface RawDeal {
  id: string;
  deal_name: string;
  account_name: string;
  crm_record_url: string | null;
  account_manager: string;
  technical_lead: string;
  sales_stage: string;
  stage_entered_at: string | Date;
  product_revenue: string | number;
  pricing_model: string;
  contract_term_years: string | number;
  deal_currency: string;
  expected_close_date: string | null;
  win_probability_pct: number | null;
  services_revenue: string | number;
  services_tier: string;
  manager_strategic_blueprint: string | null;
  created_at: string | Date;
  updated_at: string | Date;
  cross_sells?: RawCrossSell[];
  // IAM/SIEM sales context (all optional)
  competitor?: string | null;
  compliance_driver?: string | null;
  compliance_drivers?: string[];
  compliance_deadline?: string | null;
  estimated_log_sources?: number | null;
  anchor_products?: RawProductRef[];
}

export interface RawGate {
  gate_code: string;
  gate_group: number;
  label: string;
  is_completed: boolean;
  completed_at: string | Date | null;
  prerequisite_gate_codes: string[] | null;
}

export interface RawBlocker {
  severity_name: string;
}

export interface RawDisposition {
  pattern_code: string;
  disposition: DispositionState;
  rationale?: string | null;
  snooze_until_field_change?: string | null;
}

export interface OwnMomentum {
  recentRate: number;
  earlierRate: number;
  dropPct: number;
}

export interface AuditRow {
  entity_type: string;
  field_changed: string;
  new_value: string | boolean | null;
  changed_at: string | Date;
}

export interface ProcessContext {
  fxRate?: number | null;
  reportingCurrency?: string;
  catalogCount?: number;
  ownMomentum?: OwnMomentum | null;
  dispositions?: RawDisposition[];
  whitespace?: { productId: string; productName: string }[];
  seededDefaults?: Record<string, string | number>;
}

export interface ExplanationInput {
  label: string;
  value: string | number | boolean;
}
export interface ThresholdUsed {
  key: string;
  value: number | string;
  source: "default" | "tuned";
}
export interface Explanation {
  inputs: ExplanationInput[];
  thresholdsUsed: ThresholdUsed[];
  clearsWhen: string;
}

export interface Alert {
  code: string;
  severity: Severity;
  message: string;
  explanation: Explanation | null;
  disposition: {
    state: DispositionState;
    rationale: string | null;
    snoozeUntilFieldChange: string | null;
  } | null;
}

interface DealContext {
  salesStage: string;
  calculatedTCV: number;
  normalizedTCV: number;
  reportingCurrency: string;
  servicesRevenue: number;
  servicesTier: string;
  pricingModel: string;
  termYears: number;
  expectedCloseDate: string | null;
  blueprintNotes: string | null;
  daysSinceCreation: number;
  daysSinceLastUpdate: number;
  daysInStage: number;
  daysToClose: number | null;
  technicalProgressPct: number;
  attachRate: number | null;
  gateMap: Record<string, boolean>;
  competitor: string | null;
  complianceDriver: string | null;
  daysToComplianceDeadline: number | null;
  estimatedLogSources: number | null;
  hasLog360: boolean;
}

interface BlockersContext {
  active: RawBlocker[];
  highSeverityCount: number;
}

type ProvenanceFn = (key: string) => "default" | "tuned";

interface RiskPattern {
  code: string;
  severity: Severity;
  weight: number;
  evaluate: (
    deal: DealContext,
    blockers: BlockersContext,
    thresholds: EngineThresholds,
    context: { ownMomentum: OwnMomentum | null },
  ) => boolean;
  formatMessage: (
    deal: DealContext,
    thresholds: EngineThresholds,
    blockers: BlockersContext,
    context: { ownMomentum: OwnMomentum | null },
  ) => string;
  explain: (
    deal: DealContext,
    thresholds: EngineThresholds,
    blockers: BlockersContext,
    provenance: ProvenanceFn,
  ) => Explanation;
}

const fmt = (n: number) => Math.round(n).toLocaleString("en-US");

// ---------------------------------------------------------------------------
// IAM/SIEM product intelligence — domain constants (pure, isomorphic).
// Keyed by stable product `code`, never UUID or display name.
// ---------------------------------------------------------------------------

/** Suite membership for bundle-upsell detection (primary assignment, no overlap). */
export const SUITE_MEMBERS: Record<"AD360" | "LOG360", string[]> = {
  AD360: [
    "ADMANAGER_PLUS",
    "ADAUDIT_PLUS",
    "ADSELFSERVICE_PLUS",
    "M365_MANAGER_PLUS",
    "SHAREPOINT_MANAGER_PLUS",
    "EXCHANGE_REPORTER_PLUS",
    "RECOVERYMANAGER_PLUS",
  ],
  LOG360: ["EVENTLOG_ANALYZER", "DATA_SECURITY_PLUS", "CLOUD_SECURITY_PLUS"],
};

/** Next-best-product affinity: real AD360/Log360 land-and-expand paths. */
export const PRODUCT_AFFINITY: Record<string, string[]> = {
  ADMANAGER_PLUS: ["ADAUDIT_PLUS", "ADSELFSERVICE_PLUS", "RECOVERYMANAGER_PLUS"],
  ADAUDIT_PLUS: ["ADMANAGER_PLUS", "DATA_SECURITY_PLUS", "EVENTLOG_ANALYZER"],
  ADSELFSERVICE_PLUS: ["ADMANAGER_PLUS", "M365_MANAGER_PLUS"],
  M365_MANAGER_PLUS: [
    "EXCHANGE_REPORTER_PLUS",
    "ADSELFSERVICE_PLUS",
    "RECOVERYMANAGER_PLUS",
  ],
  SHAREPOINT_MANAGER_PLUS: ["M365_MANAGER_PLUS", "DATA_SECURITY_PLUS"],
  EXCHANGE_REPORTER_PLUS: ["M365_MANAGER_PLUS", "ADAUDIT_PLUS"],
  RECOVERYMANAGER_PLUS: ["ADMANAGER_PLUS", "ADAUDIT_PLUS"],
  EVENTLOG_ANALYZER: ["ADAUDIT_PLUS", "DATA_SECURITY_PLUS", "CLOUD_SECURITY_PLUS"],
  DATA_SECURITY_PLUS: ["EVENTLOG_ANALYZER", "CLOUD_SECURITY_PLUS"],
  CLOUD_SECURITY_PLUS: ["EVENTLOG_ANALYZER", "DATA_SECURITY_PLUS"],
};

/** Compliance driver -> products that carry the strongest story (keyed by driver name). */
export const COMPLIANCE_PRODUCTS: Record<string, string[]> = {
  SOX: ["ADAUDIT_PLUS", "EVENTLOG_ANALYZER"],
  HIPAA: ["DATA_SECURITY_PLUS", "EVENTLOG_ANALYZER", "ADAUDIT_PLUS"],
  "PCI-DSS": ["EVENTLOG_ANALYZER", "DATA_SECURITY_PLUS"],
  GDPR: ["DATA_SECURITY_PLUS", "CLOUD_SECURITY_PLUS"],
  NIS2: ["EVENTLOG_ANALYZER", "ADAUDIT_PLUS", "CLOUD_SECURITY_PLUS"],
  "ISO 27001": ["ADAUDIT_PLUS", "EVENTLOG_ANALYZER", "DATA_SECURITY_PLUS"],
  "Ransomware/Recovery": ["RECOVERYMANAGER_PLUS", "ADAUDIT_PLUS"],
};

export type RecommendationType =
  | "NEXT_BEST_PRODUCT"
  | "SUITE_BUNDLE"
  | "RECOVERY_GAP";

export interface Recommendation {
  type: RecommendationType;
  productCodes: string[];
  suite: string | null;
  rationale: string;
}

/**
 * Opportunity engine (NOT risk): derives next-best-product, recovery-gap, and
 * suite-bundle recommendations from the deal's anchor + pitched product mix.
 * Pure — emitted alongside (never folded into) governance health.
 */
export function generateRecommendations(
  anchorCodes: string[],
  pitchedCodes: string[],
  complianceDrivers: string[],
  thresholds: EngineThresholds,
): Recommendation[] {
  const owned = new Set(
    [...anchorCodes, ...pitchedCodes].filter((c): c is string => !!c),
  );
  const drivers = (complianceDrivers || []).filter(Boolean);
  const recs: Recommendation[] = [];

  // Next-best-product: affinity of owned products + compliance-driven picks.
  const nbp = new Set<string>();
  for (const code of owned) {
    for (const rec of PRODUCT_AFFINITY[code] || []) {
      if (!owned.has(rec)) nbp.add(rec);
    }
  }
  for (const driver of drivers) {
    for (const rec of COMPLIANCE_PRODUCTS[driver] || []) {
      if (!owned.has(rec)) nbp.add(rec);
    }
  }
  if (nbp.size > 0) {
    recs.push({
      type: "NEXT_BEST_PRODUCT",
      productCodes: [...nbp],
      suite: null,
      rationale: drivers.length
        ? `Natural expansion from the current footprint, including components that strengthen the ${drivers.join(" / ")} compliance story.`
        : `Natural expansion from the current footprint — these components are commonly deployed alongside what the customer is evaluating.`,
    });
  }

  // Recovery gap: AD/M365 footprint with no backup & recovery line.
  const adFootprint = [...owned].some(
    (c) => SUITE_MEMBERS.AD360.includes(c) && c !== "RECOVERYMANAGER_PLUS",
  );
  if (adFootprint && !owned.has("RECOVERYMANAGER_PLUS")) {
    recs.push({
      type: "RECOVERY_GAP",
      productCodes: ["RECOVERYMANAGER_PLUS"],
      suite: "AD360",
      rationale:
        "AD/M365 deal with no backup & recovery line. RecoveryManager Plus pre-empts the common ransomware / accidental-deletion objection and protects the deployment.",
    });
  }

  // Suite-bundle upsell: enough à-la-carte components to justify the bundle.
  const minComp = Number(thresholds.suite_bundle_min_components) || 3;
  for (const suite of ["AD360", "LOG360"] as const) {
    const display = suite === "LOG360" ? "Log360" : "AD360";
    const ownedInSuite = SUITE_MEMBERS[suite].filter((c) => owned.has(c));
    if (ownedInSuite.length >= minComp) {
      recs.push({
        type: "SUITE_BUNDLE",
        productCodes: ownedInSuite,
        suite: display,
        rationale: `${ownedInSuite.length} ${display} components are being taken à la carte — position the ${display} bundle for better economics and a unified console.`,
      });
    }
  }

  return recs;
}

export const riskPatterns: RiskPattern[] = [
  {
    code: "PREMATURE_COMMERCIAL",
    severity: "RED",
    weight: 100,
    evaluate: (deal) =>
      ["Commercial", "Procurement"].includes(deal.salesStage) &&
      !deal.gateMap["G3_PERFORMANCE_PASSED"],
    formatMessage: (deal) =>
      `PREMATURE COMMERCIAL DISCONNECT: Sales line has moved to ${deal.salesStage} ` +
      `stage before completing Gate 3 (Scalability/Performance validation). ` +
      `High risk of deep margin discounts or late-stage technical disqualification.`,
    explain: (deal) => ({
      inputs: [
        { label: "Sales Stage", value: deal.salesStage },
        {
          label: "Gate 3 (Performance) passed",
          value: !!deal.gateMap["G3_PERFORMANCE_PASSED"],
        },
      ],
      thresholdsUsed: [],
      clearsWhen:
        "Complete Gate 3 (Load/Performance Stress Passed), or move the deal back out of Commercial/Procurement.",
    }),
  },
  {
    code: "UNPROTECTED_ELEPHANT",
    severity: "YELLOW",
    weight: 70,
    evaluate: (deal, _b, thresholds) =>
      deal.normalizedTCV >= thresholds.elephant_tcv_threshold &&
      deal.servicesTier === "None",
    formatMessage: (deal, thresholds) =>
      `UNPROTECTED ELEPHANT RUN: Deal TCV (${deal.reportingCurrency} ${fmt(deal.normalizedTCV)}) ` +
      `exceeds ${fmt(thresholds.elephant_tcv_threshold)} but lacks an attached ` +
      `Professional Services SOW or Premium Support infrastructure. High risk of post-sale ` +
      `implementation friction and deployment failure.`,
    explain: (deal, thresholds, _b, provenance) => ({
      inputs: [
        { label: "Normalized TCV", value: deal.normalizedTCV },
        { label: "Services Tier", value: deal.servicesTier },
      ],
      thresholdsUsed: [
        {
          key: "elephant_tcv_threshold",
          value: thresholds.elephant_tcv_threshold,
          source: provenance("elephant_tcv_threshold"),
        },
      ],
      clearsWhen:
        "Attach a Professional Services SOW or Premium Support tier, or the normalized TCV falls below the elephant threshold.",
    }),
  },
  {
    code: "MISSING_STRUCTURAL_ANCHOR",
    severity: "RED",
    weight: 90,
    evaluate: (deal) =>
      deal.salesStage !== "Discovery" && !deal.gateMap["G1_CRITERIA_LOCKED"],
    formatMessage: () =>
      `MISSING STRUCTURAL ANCHOR: Deal has transitioned past initial Discovery but ` +
      `minimum technical success criteria remain unverified and unlocked. The ` +
      `evaluation is running on assumptions.`,
    explain: (deal) => ({
      inputs: [
        { label: "Sales Stage", value: deal.salesStage },
        {
          label: "Gate 1 Criteria Locked",
          value: !!deal.gateMap["G1_CRITERIA_LOCKED"],
        },
      ],
      thresholdsUsed: [],
      clearsWhen: "Complete Gate 1 (Minimum Viable Requirements Locked).",
    }),
  },
  {
    code: "PHANTOM_CHAMPION",
    severity: "YELLOW",
    weight: 60,
    evaluate: (deal, _b, thresholds) =>
      deal.salesStage !== "Discovery" &&
      !deal.gateMap["G1_EXECUTIVE_AGREED"] &&
      deal.daysSinceCreation > thresholds.phantom_champion_days,
    formatMessage: (deal) =>
      `PHANTOM CHAMPION: Deal has been active for ${deal.daysSinceCreation} days ` +
      `without executive alignment on evaluation criteria. The current point of contact ` +
      `may lack decision-making authority. Risk of silent deal death.`,
    explain: (deal, thresholds, _b, provenance) => ({
      inputs: [
        { label: "Days Since Creation", value: deal.daysSinceCreation },
        {
          label: "Gate 1 Executive Agreed",
          value: !!deal.gateMap["G1_EXECUTIVE_AGREED"],
        },
      ],
      thresholdsUsed: [
        {
          key: "phantom_champion_days",
          value: thresholds.phantom_champion_days,
          source: provenance("phantom_champion_days"),
        },
      ],
      clearsWhen:
        "Complete Gate 1 Executive Champion Agreement, or confirm the executive sponsor.",
    }),
  },
  {
    code: "GHOST_PIPELINE",
    severity: "YELLOW",
    weight: 50,
    evaluate: (deal, blockers, thresholds) => {
      const hasNotes = !!(
        deal.blueprintNotes && deal.blueprintNotes.trim().length >= 20
      );
      return (
        blockers.active.length === 0 &&
        !hasNotes &&
        deal.daysSinceLastUpdate > thresholds.ghost_pipeline_days
      );
    },
    formatMessage: (deal) =>
      `GHOST PIPELINE: No blockers logged, no strategic notes, and no updates in ` +
      `${deal.daysSinceLastUpdate} days. This deal may be running on autopilot ` +
      `without active oversight.`,
    explain: (deal, thresholds, blockers, provenance) => ({
      inputs: [
        { label: "Active Blockers", value: blockers.active.length },
        {
          label: "Has Strategic Notes",
          value: !!(
            deal.blueprintNotes && deal.blueprintNotes.trim().length >= 20
          ),
        },
        { label: "Days Since Last Update", value: deal.daysSinceLastUpdate },
      ],
      thresholdsUsed: [
        {
          key: "ghost_pipeline_days",
          value: thresholds.ghost_pipeline_days,
          source: provenance("ghost_pipeline_days"),
        },
      ],
      clearsWhen:
        "Log a blocker, add strategic notes, or make any deal update to refresh activity.",
    }),
  },
  {
    code: "DISCOUNT_TRAP",
    severity: "RED",
    weight: 85,
    evaluate: (deal, _b, thresholds) =>
      deal.normalizedTCV >= thresholds.mega_deal_tcv_threshold &&
      deal.servicesRevenue === 0 &&
      deal.servicesTier === "None" &&
      deal.salesStage === "Commercial",
    formatMessage: (deal) =>
      `DISCOUNT TRAP: Mega-deal (${deal.reportingCurrency} ${fmt(deal.normalizedTCV)}) in Commercial ` +
      `stage with zero services attachment. Likely indicates aggressive pricing cuts to ` +
      `hit a number. Post-sale implementation risk is extreme — customer will underdeploy ` +
      `and churn within 18 months.`,
    explain: (deal, thresholds, _b, provenance) => ({
      inputs: [
        { label: "Normalized TCV", value: deal.normalizedTCV },
        { label: "Services Revenue", value: deal.servicesRevenue },
        { label: "Services Tier", value: deal.servicesTier },
        { label: "Sales Stage", value: deal.salesStage },
      ],
      thresholdsUsed: [
        {
          key: "mega_deal_tcv_threshold",
          value: thresholds.mega_deal_tcv_threshold,
          source: provenance("mega_deal_tcv_threshold"),
        },
      ],
      clearsWhen:
        "Attach services revenue/tier, or the normalized TCV falls below the mega-deal threshold, or move out of Commercial.",
    }),
  },
  {
    code: "STALLED_VALIDATION",
    severity: "YELLOW",
    weight: 55,
    evaluate: (deal, _b, thresholds) =>
      deal.daysInStage > thresholds.stale_stage_days &&
      deal.technicalProgressPct < 100,
    formatMessage: (deal) =>
      `STALLED VALIDATION: Technical validation has not reached completion in ` +
      `${deal.daysInStage} days while in ${deal.salesStage} stage ` +
      `(${deal.technicalProgressPct}% gates complete). Recommend a forced ` +
      `escalation review.`,
    explain: (deal, thresholds, _b, provenance) => ({
      inputs: [
        { label: "Days In Stage", value: deal.daysInStage },
        { label: "Technical Progress %", value: deal.technicalProgressPct },
      ],
      thresholdsUsed: [
        {
          key: "stale_stage_days",
          value: thresholds.stale_stage_days,
          source: provenance("stale_stage_days"),
        },
      ],
      clearsWhen:
        "Advance gate completion to 100%, or progress the deal to the next stage.",
    }),
  },
  {
    code: "CLOSE_DATE_PRESSURE",
    severity: "YELLOW",
    weight: 65,
    evaluate: (deal, _b, thresholds) => {
      if (deal.daysToClose == null) return false;
      return (
        deal.daysToClose <= thresholds.close_date_warning_days &&
        deal.technicalProgressPct < thresholds.gate_completion_warn_pct
      );
    },
    formatMessage: (deal, thresholds) =>
      `CLOSE DATE PRESSURE: Expected close date is ${deal.daysToClose} days away ` +
      `but only ${deal.technicalProgressPct}% of technical gates are complete ` +
      `(expected: >=${thresholds.gate_completion_warn_pct}%). High risk of close ` +
      `date slip or premature forced closure.`,
    explain: (deal, thresholds, _b, provenance) => ({
      inputs: [
        { label: "Days To Close", value: deal.daysToClose ?? "(none)" },
        { label: "Technical Progress %", value: deal.technicalProgressPct },
      ],
      thresholdsUsed: [
        {
          key: "close_date_warning_days",
          value: thresholds.close_date_warning_days,
          source: provenance("close_date_warning_days"),
        },
        {
          key: "gate_completion_warn_pct",
          value: thresholds.gate_completion_warn_pct,
          source: provenance("gate_completion_warn_pct"),
        },
      ],
      clearsWhen:
        "Raise gate completion above the warning percentage, or extend the expected close date.",
    }),
  },
  {
    code: "UNRESOLVED_CRITICAL_BLOCKERS",
    severity: "YELLOW",
    weight: 40,
    evaluate: (_deal, blockers) => blockers.highSeverityCount > 0,
    formatMessage: (_deal, _thresholds, blockers) =>
      `UNRESOLVED CRITICAL BLOCKERS: ${blockers.highSeverityCount} high-severity ` +
      `blocker(s) remain unresolved. Executive review recommended to clear path.`,
    explain: (_deal, _thresholds, blockers) => ({
      inputs: [
        { label: "High-Severity Blockers", value: blockers.highSeverityCount },
      ],
      thresholdsUsed: [],
      clearsWhen: "Resolve all high-severity blockers on the deal.",
    }),
  },
  {
    code: "NO_CLOSE_DATE",
    severity: "YELLOW",
    weight: 30,
    evaluate: (deal) =>
      deal.salesStage !== "Discovery" &&
      deal.salesStage !== "Closed-Won" &&
      deal.salesStage !== "Closed-Lost" &&
      !deal.expectedCloseDate,
    formatMessage: () =>
      `NO CLOSE DATE SET: Deal has advanced past Discovery without an expected ` +
      `close date. Without a target date, pipeline forecasting is unreliable.`,
    explain: (deal) => ({
      inputs: [
        { label: "Sales Stage", value: deal.salesStage },
        {
          label: "Expected Close Date",
          value: deal.expectedCloseDate || "(none)",
        },
      ],
      thresholdsUsed: [],
      clearsWhen: "Set an expected close date on the deal.",
    }),
  },
  {
    // F8 — self-referential momentum, NO cohort benchmark
    code: "SLOW_MOTION_COLLISION",
    severity: "YELLOW",
    weight: 75,
    evaluate: (deal, _b, thresholds, context) => {
      const m = context?.ownMomentum || null;
      if (!m) return false;
      if (deal.daysToClose == null) return false;
      const decelerating = m.dropPct >= thresholds.momentum_drop_pct;
      const nearClose = deal.daysToClose <= thresholds.close_date_warning_days;
      const underGated =
        deal.technicalProgressPct < thresholds.momentum_min_gate_pct;
      return decelerating && nearClose && underGated;
    },
    formatMessage: (deal, _thresholds, _b, context) => {
      const m = context?.ownMomentum;
      return (
        `SLOW-MOTION COLLISION: This deal's own gate-completion velocity has ` +
        `dropped ~${Math.round(m?.dropPct ?? 0)}% (recent vs earlier window) while the close ` +
        `date is ${deal.daysToClose} days away and only ${deal.technicalProgressPct}% of ` +
        `gates are complete. On its current self-trajectory it will not finish validation in time.`
      );
    },
    explain: (deal, thresholds, _b, provenance) => ({
      inputs: [
        { label: "Days To Close", value: deal.daysToClose ?? "(none)" },
        { label: "Technical Progress %", value: deal.technicalProgressPct },
      ],
      thresholdsUsed: [
        {
          key: "momentum_drop_pct",
          value: thresholds.momentum_drop_pct,
          source: provenance("momentum_drop_pct"),
        },
        {
          key: "momentum_window_days",
          value: thresholds.momentum_window_days,
          source: provenance("momentum_window_days"),
        },
        {
          key: "momentum_min_gate_pct",
          value: thresholds.momentum_min_gate_pct,
          source: provenance("momentum_min_gate_pct"),
        },
      ],
      clearsWhen:
        "Re-accelerate gate completion (close gates this week), or extend the close date to match the deal's own pace.",
    }),
  },
  {
    // F13 — large normalized TCV with a low cross-sell attach rate
    code: "LOW_ATTACH_ELEPHANT",
    severity: "YELLOW",
    weight: 45,
    evaluate: (deal, _b, thresholds) => {
      if (deal.normalizedTCV < thresholds.elephant_tcv_threshold) return false;
      if (deal.attachRate == null) return false;
      return deal.attachRate <= thresholds.low_attach_rate_threshold;
    },
    formatMessage: (deal, thresholds) =>
      `LOW-ATTACH ELEPHANT: A large deal (${deal.reportingCurrency} ${fmt(deal.normalizedTCV)}) ` +
      `has a cross-sell attach rate of only ${Math.round((deal.attachRate ?? 0) * 100)}% ` +
      `(<= ${Math.round(thresholds.low_attach_rate_threshold * 100)}%). Significant whitespace ` +
      `is being left on the table on a strategic account.`,
    explain: (deal, thresholds, _b, provenance) => ({
      inputs: [
        { label: "Normalized TCV", value: deal.normalizedTCV },
        { label: "Attach Rate", value: deal.attachRate ?? "(n/a)" },
      ],
      thresholdsUsed: [
        {
          key: "elephant_tcv_threshold",
          value: thresholds.elephant_tcv_threshold,
          source: provenance("elephant_tcv_threshold"),
        },
        {
          key: "low_attach_rate_threshold",
          value: thresholds.low_attach_rate_threshold,
          source: provenance("low_attach_rate_threshold"),
        },
      ],
      clearsWhen:
        "Pitch additional catalog products to raise the attach rate above the threshold.",
    }),
  },
  {
    // IAM/SIEM — a displacement deal stalling in evaluation snaps back to the incumbent
    code: "COMPETITIVE_DISPLACEMENT_STALL",
    severity: "YELLOW",
    weight: 80,
    evaluate: (deal, _b, thresholds) =>
      !!deal.competitor &&
      ["Validation", "Commercial"].includes(deal.salesStage) &&
      deal.daysInStage > thresholds.competitive_stall_days,
    formatMessage: (deal) =>
      `COMPETITIVE DISPLACEMENT STALL: This is a displacement play against ${deal.competitor}, ` +
      `and it has sat in ${deal.salesStage} for ${deal.daysInStage} days. Stalled displacement deals ` +
      `snap back to the incumbent — the longer the evaluation drags, the more the status quo wins.`,
    explain: (deal, thresholds, _b, provenance) => ({
      inputs: [
        { label: "Incumbent / Competitor", value: deal.competitor ?? "(none)" },
        { label: "Sales Stage", value: deal.salesStage },
        { label: "Days In Stage", value: deal.daysInStage },
      ],
      thresholdsUsed: [
        {
          key: "competitive_stall_days",
          value: thresholds.competitive_stall_days,
          source: provenance("competitive_stall_days"),
        },
      ],
      clearsWhen:
        "Advance the deal to the next stage, or lock a differentiated win-criteria gate the incumbent cannot meet.",
    }),
  },
  {
    // IAM/SIEM — a hard compliance deadline is both the risk and the leverage
    code: "COMPLIANCE_DEADLINE_RISK",
    severity: "YELLOW",
    weight: 82,
    evaluate: (deal, _b, thresholds) => {
      if (deal.daysToComplianceDeadline == null) return false;
      return (
        deal.daysToComplianceDeadline <=
          thresholds.compliance_deadline_warning_days &&
        deal.technicalProgressPct < thresholds.compliance_min_gate_pct
      );
    },
    formatMessage: (deal) =>
      `COMPLIANCE DEADLINE RISK: A ${deal.complianceDriver ?? "compliance"} mandate is due in ` +
      `${deal.daysToComplianceDeadline} days, but only ${deal.technicalProgressPct}% of technical gates ` +
      `are complete. The deal risks slipping the audit window — the very leverage that should be ` +
      `accelerating it.`,
    explain: (deal, thresholds, _b, provenance) => ({
      inputs: [
        { label: "Compliance Driver", value: deal.complianceDriver ?? "(none)" },
        {
          label: "Days To Compliance Deadline",
          value: deal.daysToComplianceDeadline ?? "(none)",
        },
        { label: "Technical Progress %", value: deal.technicalProgressPct },
      ],
      thresholdsUsed: [
        {
          key: "compliance_deadline_warning_days",
          value: thresholds.compliance_deadline_warning_days,
          source: provenance("compliance_deadline_warning_days"),
        },
        {
          key: "compliance_min_gate_pct",
          value: thresholds.compliance_min_gate_pct,
          source: provenance("compliance_min_gate_pct"),
        },
      ],
      clearsWhen:
        "Raise gate completion above the compliance threshold, or re-baseline the compliance deadline with the customer.",
    }),
  },
  {
    // IAM/SIEM — a PoC dragging in Validation with no locked success criteria
    code: "POC_DEATH_MARCH",
    severity: "YELLOW",
    weight: 58,
    evaluate: (deal, _b, thresholds) =>
      deal.salesStage === "Validation" &&
      deal.daysInStage > thresholds.poc_max_validation_days &&
      !deal.gateMap["G1_CRITERIA_LOCKED"],
    formatMessage: (deal) =>
      `POC DEATH MARCH: The proof-of-concept has run ${deal.daysInStage} days in Validation ` +
      `without locked success criteria (Gate 1). Open-ended PoCs without agreed exit criteria ` +
      `rarely convert — the customer cannot say yes to a target that was never defined.`,
    explain: (deal, thresholds, _b, provenance) => ({
      inputs: [
        { label: "Sales Stage", value: deal.salesStage },
        { label: "Days In Stage", value: deal.daysInStage },
        {
          label: "Gate 1 Criteria Locked",
          value: !!deal.gateMap["G1_CRITERIA_LOCKED"],
        },
      ],
      thresholdsUsed: [
        {
          key: "poc_max_validation_days",
          value: thresholds.poc_max_validation_days,
          source: provenance("poc_max_validation_days"),
        },
      ],
      clearsWhen:
        "Lock Gate 1 success criteria with the customer, or exit Validation with a go/no-go decision.",
    }),
  },
  {
    // SIEM — a large log environment paired with an undersized deal = mis-licensing
    code: "SIEM_UNDERSCOPED",
    severity: "YELLOW",
    weight: 48,
    evaluate: (deal, _b, thresholds) =>
      deal.hasLog360 &&
      deal.estimatedLogSources != null &&
      deal.estimatedLogSources >= thresholds.siem_high_volume_log_sources &&
      deal.normalizedTCV < thresholds.elephant_tcv_threshold,
    formatMessage: (deal) =>
      `SIEM UNDER-SCOPED: A Log360/SIEM deal sized at ${deal.reportingCurrency} ${fmt(deal.normalizedTCV)} ` +
      `is being scoped against ~${deal.estimatedLogSources} log sources. The environment looks larger than ` +
      `the deal — high risk of under-licensing, ingestion overruns, and a painful true-up at renewal.`,
    explain: (deal, thresholds, _b, provenance) => ({
      inputs: [
        { label: "Estimated Log Sources", value: deal.estimatedLogSources ?? "(none)" },
        { label: "Normalized TCV", value: deal.normalizedTCV },
        { label: "Has Log360 Product", value: deal.hasLog360 },
      ],
      thresholdsUsed: [
        {
          key: "siem_high_volume_log_sources",
          value: thresholds.siem_high_volume_log_sources,
          source: provenance("siem_high_volume_log_sources"),
        },
        {
          key: "elephant_tcv_threshold",
          value: thresholds.elephant_tcv_threshold,
          source: provenance("elephant_tcv_threshold"),
        },
      ],
      clearsWhen:
        "Re-scope the licensing to the log-source/EPS volume, or confirm the environment is smaller than estimated.",
    }),
  },
];

/**
 * F8 — computes the deal's own recent gate-completion rate vs its earlier rate
 * from its OWN audit rows. NO cohort data.
 */
export function calculateOwnMomentum(
  deal: { created_at: string | Date },
  auditRows: AuditRow[],
  thresholds: EngineThresholds,
): OwnMomentum {
  const windowDays = thresholds.momentum_window_days || 30;
  const now = Date.now();
  const windowStart = now - windowDays * 86400000;

  const completions = (auditRows || [])
    .filter(
      (r) =>
        r.entity_type === "gate" &&
        r.field_changed === "is_completed" &&
        (r.new_value === "true" || r.new_value === true),
    )
    .map((r) => new Date(r.changed_at).getTime());

  const recentCount = completions.filter((t) => t >= windowStart).length;
  const earlierCount = completions.filter((t) => t < windowStart).length;

  const earlierSpanDays = Math.max(
    windowDays,
    (windowStart - new Date(deal.created_at).getTime()) / 86400000,
  );
  const earlierRate = earlierCount / Math.max(1, earlierSpanDays / windowDays);
  const recentRate = recentCount;

  const dropPct =
    earlierRate > 0 ? Math.max(0, (1 - recentRate / earlierRate) * 100) : 0;

  return { recentRate, earlierRate, dropPct };
}

export interface IntelligenceOutput {
  id: string;
  accountName: string;
  dealName: string;
  crmRecordUrl: string | null;
  team: { accountManager: string; technicalLead: string };
  salesStage: string;
  stageEnteredAt: string | Date;
  daysInStage: number;
  financials: {
    calculatedTCV: number;
    normalizedTCV: number;
    reportingCurrency: string;
    fxRateApplied: number | null;
    productRevenue: number;
    servicesRevenue: number;
    pricingModel: string;
    termYears: number;
    dealCurrency: string;
    expectedCloseDate: string | null;
    daysToClose: number | null;
    winProbability: number | null;
    servicesTier: string;
    crossSells: RawCrossSell[];
    crossSell: {
      pitchedCount: number;
      catalogCount: number;
      attachRate: number | null;
      whitespace: { productId: string; productName: string }[];
    };
  };
  technicalTrack: {
    progressPercentage: number;
    currentMilestone: string;
    stepsCompleted: number;
    totalSteps: number;
    gates: {
      gateCode: string;
      gateGroup: number;
      label: string;
      isCompleted: boolean;
      completedAt: string | Date | null;
      prerequisiteGateCodes: string[];
    }[];
    integrityWarnings: { gateCode: string; type: string; message: string }[];
  };
  governance: {
    healthStatus: Severity;
    alerts: Alert[];
    managedAlerts: Alert[];
    unmanagedAlertCount: number;
    activeBlockerCount: number;
    highSeverityBlockerCount: number;
    blueprintNotes: string | null;
    dataQualityNotes: { code: string; message: string }[];
  };
  // Opportunity recommendations (separate channel from risk — do not affect health).
  recommendations: Recommendation[];
}

/**
 * Processes a raw deal record through the full intelligence pipeline. PURE (F9).
 */
export function processDealIntelligence(
  deal: RawDeal,
  gates: RawGate[],
  activeBlockers: RawBlocker[],
  thresholds: EngineThresholds,
  ctx: ProcessContext = {},
): IntelligenceOutput {
  const baseProductRevenue = parseFloat(String(deal.product_revenue || 0));
  const termYears = parseInt(String(deal.contract_term_years || 1), 10);
  const attachedServicesRevenue = parseFloat(
    String(deal.services_revenue || 0),
  );

  let calculatedTCV: number;
  if (deal.pricing_model === "Multi-Year Committed") {
    calculatedTCV = baseProductRevenue * termYears + attachedServicesRevenue;
  } else {
    calculatedTCV = baseProductRevenue + attachedServicesRevenue;
  }

  // F1: currency normalization
  const reportingCurrency =
    ctx.reportingCurrency || thresholds.reporting_currency || "USD";
  const fxRate =
    deal.deal_currency === reportingCurrency
      ? 1
      : ctx.fxRate != null
        ? ctx.fxRate
        : null;
  const dataQualityNotes: { code: string; message: string }[] = [];
  let normalizedTCV: number;
  if (fxRate == null) {
    normalizedTCV = calculatedTCV;
    dataQualityNotes.push({
      code: "MISSING_FX_RATE",
      message: `No FX rate found for ${deal.deal_currency} -> ${reportingCurrency}; showing native value.`,
    });
  } else {
    normalizedTCV = calculatedTCV * fxRate;
  }

  // gate progression
  const gateMap: Record<string, boolean> = {};
  for (const gate of gates) gateMap[gate.gate_code] = gate.is_completed;

  const stepsCompleted = gates.filter((g) => g.is_completed).length;
  const totalSteps = gates.length;
  const technicalProgressPct =
    totalSteps > 0 ? Math.round((stepsCompleted / totalSteps) * 100) : 0;

  const gateGroups: Record<string, RawGate[]> = {};
  for (const gate of gates) {
    const group = String(gate.gate_group);
    if (!gateGroups[group]) gateGroups[group] = [];
    gateGroups[group].push(gate);
  }

  let highestCompletedGroup = 0;
  for (const [group, groupGates] of Object.entries(gateGroups)) {
    if (groupGates.every((g) => g.is_completed)) {
      highestCompletedGroup = Math.max(highestCompletedGroup, parseInt(group, 10));
    }
  }

  const milestoneLabels: Record<number, string> = {
    0: "Gate 1: Success Criteria Pending",
    1: "Gate 1: Success Criteria Frozen",
    2: "Gate 2: Core MVP Validated",
    3: "Gate 3: Scalability Confirmed",
    4: "Gate 4: InfoSec Cleared",
    5: "Gate 5: Technical Win Signed",
  };
  const currentMilestone =
    milestoneLabels[highestCompletedGroup] || milestoneLabels[0];

  // F4: gate integrity warnings (data-driven prerequisites)
  const integrityWarnings: {
    gateCode: string;
    type: string;
    message: string;
  }[] = [];
  for (const gate of gates) {
    if (gate.is_completed && Array.isArray(gate.prerequisite_gate_codes)) {
      for (const prereq of gate.prerequisite_gate_codes) {
        if (!gateMap[prereq]) {
          integrityWarnings.push({
            gateCode: gate.gate_code,
            type: "out_of_order",
            message: `${gate.gate_code} is complete but prerequisite ${prereq} is not.`,
          });
        }
      }
    }
  }

  // temporal calculations
  const now = new Date();
  const createdAt = new Date(deal.created_at);
  const updatedAt = new Date(deal.updated_at);
  const stageEnteredAt = new Date(deal.stage_entered_at);
  const DAY = 1000 * 60 * 60 * 24;

  const daysSinceCreation = Math.floor((now.getTime() - createdAt.getTime()) / DAY);
  const daysSinceLastUpdate = Math.floor((now.getTime() - updatedAt.getTime()) / DAY);
  const daysInStage = Math.floor((now.getTime() - stageEnteredAt.getTime()) / DAY);

  let daysToClose: number | null = null;
  if (deal.expected_close_date) {
    daysToClose = Math.floor(
      (new Date(deal.expected_close_date).getTime() - now.getTime()) / DAY,
    );
    if (daysToClose < 0) daysToClose = 0;
  }

  let daysToComplianceDeadline: number | null = null;
  if (deal.compliance_deadline) {
    daysToComplianceDeadline = Math.floor(
      (new Date(deal.compliance_deadline).getTime() - now.getTime()) / DAY,
    );
    if (daysToComplianceDeadline < 0) daysToComplianceDeadline = 0;
  }

  // F13: cross-sell whitespace + attach rate
  const crossSells = deal.cross_sells || [];
  const pitchedCount = crossSells.filter((c) => c.isPitched).length;
  const catalogCount = ctx.catalogCount || 0;
  const attachRate = catalogCount > 0 ? pitchedCount / catalogCount : null;

  // SIEM context: does the deal touch any Log360 product (anchor or pitched)?
  const anchorProducts = deal.anchor_products || [];
  const hasLog360 =
    crossSells.some((c) => c.isPitched && c.suite === "Log360") ||
    anchorProducts.some((a) => a.suite === "Log360");
  const estimatedLogSources =
    deal.estimated_log_sources == null
      ? null
      : Number(deal.estimated_log_sources);

  // blocker analysis
  const highSeverityBlockers = activeBlockers.filter(
    (b) => b.severity_name === "High",
  );
  const blockersContext: BlockersContext = {
    active: activeBlockers,
    highSeverityCount: highSeverityBlockers.length,
  };

  const dealContext: DealContext = {
    salesStage: deal.sales_stage,
    calculatedTCV,
    normalizedTCV,
    reportingCurrency,
    servicesRevenue: attachedServicesRevenue,
    servicesTier: deal.services_tier,
    pricingModel: deal.pricing_model,
    termYears,
    expectedCloseDate: deal.expected_close_date,
    blueprintNotes: deal.manager_strategic_blueprint,
    daysSinceCreation,
    daysSinceLastUpdate,
    daysInStage,
    daysToClose,
    technicalProgressPct,
    attachRate,
    gateMap,
    competitor: deal.competitor ?? null,
    complianceDriver: deal.compliance_driver ?? null,
    daysToComplianceDeadline,
    estimatedLogSources,
    hasLog360,
  };

  // F2 provenance: default vs tuned
  const SEEDED = ctx.seededDefaults || {};
  const provenance: ProvenanceFn = (key) =>
    SEEDED[key] !== undefined && String(SEEDED[key]) !== String(thresholds[key])
      ? "tuned"
      : "default";

  const evalContext = { ownMomentum: ctx.ownMomentum || null };

  const triggered = riskPatterns
    .filter((pattern) =>
      pattern.evaluate(dealContext, blockersContext, thresholds, evalContext),
    )
    .map((pattern) => {
      let severity = pattern.severity;
      if (
        pattern.code === "SLOW_MOTION_COLLISION" &&
        dealContext.daysToClose != null &&
        dealContext.daysToClose <=
          Math.round(thresholds.close_date_warning_days / 2)
      ) {
        severity = "RED";
      }
      // Compliance deadline inside half the warning window is critical.
      if (
        pattern.code === "COMPLIANCE_DEADLINE_RISK" &&
        dealContext.daysToComplianceDeadline != null &&
        dealContext.daysToComplianceDeadline <=
          Math.round(thresholds.compliance_deadline_warning_days / 2)
      ) {
        severity = "RED";
      }
      // Displacement stall with collapsing momentum is critical.
      if (
        pattern.code === "COMPETITIVE_DISPLACEMENT_STALL" &&
        evalContext.ownMomentum != null &&
        evalContext.ownMomentum.dropPct >= thresholds.momentum_drop_pct
      ) {
        severity = "RED";
      }
      return { pattern, severity };
    })
    .sort((a, b) => {
      const severityOrder: Record<Severity, number> = {
        RED: 0,
        YELLOW: 1,
        GREEN: 2,
      };
      const severityDiff = severityOrder[a.severity] - severityOrder[b.severity];
      if (severityDiff !== 0) return severityDiff;
      return b.pattern.weight - a.pattern.weight;
    });

  // F3: apply dispositions (managed vs unmanaged)
  const dispositions = ctx.dispositions || [];
  const dispMap: Record<string, RawDisposition> = {};
  for (const d of dispositions) dispMap[d.pattern_code] = d;

  const buildAlert = ({
    pattern,
    severity,
  }: {
    pattern: RiskPattern;
    severity: Severity;
  }): Alert => {
    const disp = dispMap[pattern.code] || null;
    return {
      code: pattern.code,
      severity,
      message: pattern.formatMessage(
        dealContext,
        thresholds,
        blockersContext,
        evalContext,
      ),
      explanation: pattern.explain(
        dealContext,
        thresholds,
        blockersContext,
        provenance,
      ),
      disposition: disp
        ? {
            state: disp.disposition,
            rationale: disp.rationale || null,
            snoozeUntilFieldChange: disp.snooze_until_field_change || null,
          }
        : null,
    };
  };

  const allAlerts = triggered.map(buildAlert);
  const managedAlerts = allAlerts.filter((a) => a.disposition !== null);
  const unmanagedAlerts = allAlerts.filter((a) => a.disposition === null);

  const healthStatus: Severity = unmanagedAlerts.some(
    (a) => a.severity === "RED",
  )
    ? "RED"
    : unmanagedAlerts.length > 0
      ? "YELLOW"
      : "GREEN";

  // Opportunity recommendations from the anchor + pitched product mix.
  const anchorCodes = (deal.anchor_products || [])
    .map((a) => a.code)
    .filter((c): c is string => !!c);
  const pitchedCodes = crossSells
    .filter((c) => c.isPitched)
    .map((c) => c.code)
    .filter((c): c is string => !!c);
  const complianceDriverList =
    deal.compliance_drivers && deal.compliance_drivers.length > 0
      ? deal.compliance_drivers
      : deal.compliance_driver
        ? [deal.compliance_driver]
        : [];
  const recommendations = generateRecommendations(
    anchorCodes,
    pitchedCodes,
    complianceDriverList,
    thresholds,
  );

  return {
    id: deal.id,
    accountName: deal.account_name,
    dealName: deal.deal_name,
    crmRecordUrl: deal.crm_record_url,
    team: {
      accountManager: deal.account_manager,
      technicalLead: deal.technical_lead,
    },
    salesStage: deal.sales_stage,
    stageEnteredAt: deal.stage_entered_at,
    daysInStage,
    financials: {
      calculatedTCV,
      normalizedTCV,
      reportingCurrency,
      fxRateApplied: fxRate,
      productRevenue: baseProductRevenue,
      servicesRevenue: attachedServicesRevenue,
      pricingModel: deal.pricing_model,
      termYears,
      dealCurrency: deal.deal_currency,
      expectedCloseDate: deal.expected_close_date,
      daysToClose,
      winProbability: deal.win_probability_pct,
      servicesTier: deal.services_tier,
      crossSells,
      crossSell: {
        pitchedCount,
        catalogCount,
        attachRate,
        whitespace: ctx.whitespace || [],
      },
    },
    technicalTrack: {
      progressPercentage: technicalProgressPct,
      currentMilestone,
      stepsCompleted,
      totalSteps,
      gates: gates.map((g) => ({
        gateCode: g.gate_code,
        gateGroup: g.gate_group,
        label: g.label,
        isCompleted: g.is_completed,
        completedAt: g.completed_at,
        prerequisiteGateCodes: g.prerequisite_gate_codes || [],
      })),
      integrityWarnings,
    },
    governance: {
      healthStatus,
      alerts: unmanagedAlerts,
      managedAlerts,
      unmanagedAlertCount: unmanagedAlerts.length,
      activeBlockerCount: activeBlockers.length,
      highSeverityBlockerCount: highSeverityBlockers.length,
      blueprintNotes: deal.manager_strategic_blueprint,
      dataQualityNotes,
    },
    recommendations,
  };
}

export const PATTERN_CODES = riskPatterns.map((p) => p.code);

// ---------------------------------------------------------------------------
// V2 Sovereign Intelligence — pure modules (scoring, simulation, custom
// patterns, ramp pricing, natural-language command parsing).
export * from "./scoring";
export * from "./simulation";
export * from "./custom-patterns";
export * from "./ramp";
export * from "./nlc";

export * from "./contextual-patterns";
