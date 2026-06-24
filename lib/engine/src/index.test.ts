import { describe, it, expect } from "vitest";
import {
  processDealIntelligence,
  calculateOwnMomentum,
  PATTERN_CODES,
  type EngineThresholds,
  type RawDeal,
  type RawGate,
  type RawBlocker,
  type RawDisposition,
  type OwnMomentum,
  type AuditRow,
} from "./index";

const DAY = 1000 * 60 * 60 * 24;
const daysFromNow = (n: number) => new Date(Date.now() + n * DAY).toISOString();
const daysAgo = (n: number) => daysFromNow(-n);

// Mirrors the seeded defaults in artifacts/api-server/src/seed.ts.
const DEFAULTS: EngineThresholds = {
  elephant_tcv_threshold: 500000,
  mega_deal_tcv_threshold: 1000000,
  stale_stage_days: 21,
  ghost_pipeline_days: 14,
  phantom_champion_days: 30,
  close_date_warning_days: 30,
  gate_completion_warn_pct: 50,
  reporting_currency: "USD",
  momentum_drop_pct: 50,
  momentum_window_days: 30,
  momentum_min_gate_pct: 60,
  low_attach_rate_threshold: 0.34,
};

// A deal that, on its own with no gates/blockers, fires zero risk patterns.
function makeDeal(overrides: Partial<RawDeal> = {}): RawDeal {
  return {
    id: "deal-1",
    deal_name: "Test Deal",
    account_name: "Acme Corp",
    crm_record_url: null,
    account_manager: "Alice",
    technical_lead: "Bob",
    sales_stage: "Discovery",
    stage_entered_at: daysAgo(1),
    product_revenue: 100000,
    pricing_model: "Annual",
    contract_term_years: 1,
    deal_currency: "USD",
    expected_close_date: daysFromNow(90),
    win_probability_pct: 50,
    services_revenue: 50000,
    services_tier: "Premium",
    manager_strategic_blueprint:
      "Strategic blueprint notes that are comfortably longer than twenty characters.",
    created_at: daysAgo(2),
    updated_at: daysAgo(1),
    cross_sells: [],
    ...overrides,
  };
}

function makeGate(
  gateCode: string,
  isCompleted: boolean,
  overrides: Partial<RawGate> = {},
): RawGate {
  return {
    gate_code: gateCode,
    gate_group: 1,
    label: gateCode,
    is_completed: isCompleted,
    completed_at: isCompleted ? daysAgo(1) : null,
    prerequisite_gate_codes: null,
    ...overrides,
  };
}

function triggeredCodes(
  deal: RawDeal,
  gates: RawGate[] = [],
  blockers: RawBlocker[] = [],
  thresholds: EngineThresholds = DEFAULTS,
  ctx: Parameters<typeof processDealIntelligence>[4] = {},
): string[] {
  const out = processDealIntelligence(deal, gates, blockers, thresholds, ctx);
  return [...out.governance.alerts, ...out.governance.managedAlerts].map(
    (a) => a.code,
  );
}

describe("intelligence engine — clean baseline", () => {
  it("fires zero patterns and reports GREEN health for a healthy deal", () => {
    const out = processDealIntelligence(makeDeal(), [], [], DEFAULTS);
    expect(out.governance.alerts).toHaveLength(0);
    expect(out.governance.managedAlerts).toHaveLength(0);
    expect(out.governance.healthStatus).toBe("GREEN");
  });
});

describe("intelligence engine — 12 risk patterns", () => {
  it("PREMATURE_COMMERCIAL fires in Commercial without Gate 3, clears once Gate 3 passes", () => {
    const deal = makeDeal({ sales_stage: "Commercial" });
    expect(triggeredCodes(deal, [])).toContain("PREMATURE_COMMERCIAL");
    expect(
      triggeredCodes(deal, [makeGate("G3_PERFORMANCE_PASSED", true)]),
    ).not.toContain("PREMATURE_COMMERCIAL");
  });

  it("UNPROTECTED_ELEPHANT fires for a large deal with no services tier", () => {
    const fire = makeDeal({ product_revenue: 600000, services_tier: "None" });
    expect(triggeredCodes(fire)).toContain("UNPROTECTED_ELEPHANT");
    const clear = makeDeal({
      product_revenue: 600000,
      services_tier: "Premium",
    });
    expect(triggeredCodes(clear)).not.toContain("UNPROTECTED_ELEPHANT");
  });

  it("MISSING_STRUCTURAL_ANCHOR fires past Discovery without Gate 1 locked", () => {
    const deal = makeDeal({ sales_stage: "Technical Validation" });
    expect(triggeredCodes(deal, [])).toContain("MISSING_STRUCTURAL_ANCHOR");
    expect(
      triggeredCodes(deal, [makeGate("G1_CRITERIA_LOCKED", true)]),
    ).not.toContain("MISSING_STRUCTURAL_ANCHOR");
  });

  it("PHANTOM_CHAMPION fires for an old deal without executive agreement", () => {
    const deal = makeDeal({
      sales_stage: "Technical Validation",
      created_at: daysAgo(40),
    });
    expect(triggeredCodes(deal, [])).toContain("PHANTOM_CHAMPION");
    expect(
      triggeredCodes(deal, [makeGate("G1_EXECUTIVE_AGREED", true)]),
    ).not.toContain("PHANTOM_CHAMPION");
  });

  it("GHOST_PIPELINE fires with no blockers, no notes, and stale updates", () => {
    const fire = makeDeal({
      manager_strategic_blueprint: null,
      updated_at: daysAgo(20),
    });
    expect(triggeredCodes(fire, [], [])).toContain("GHOST_PIPELINE");
    const fresh = makeDeal({
      manager_strategic_blueprint: null,
      updated_at: daysAgo(1),
    });
    expect(triggeredCodes(fresh, [], [])).not.toContain("GHOST_PIPELINE");
  });

  it("DISCOUNT_TRAP fires for a mega-deal in Commercial with zero services", () => {
    const fire = makeDeal({
      product_revenue: 1200000,
      services_revenue: 0,
      services_tier: "None",
      sales_stage: "Commercial",
    });
    expect(triggeredCodes(fire)).toContain("DISCOUNT_TRAP");
    const clear = makeDeal({
      product_revenue: 1200000,
      services_revenue: 50000,
      services_tier: "None",
      sales_stage: "Commercial",
    });
    expect(triggeredCodes(clear)).not.toContain("DISCOUNT_TRAP");
  });

  it("STALLED_VALIDATION fires when stuck in stage with incomplete gates", () => {
    const deal = makeDeal({ stage_entered_at: daysAgo(30) });
    expect(triggeredCodes(deal, [makeGate("G1_CRITERIA_LOCKED", false)])).toContain(
      "STALLED_VALIDATION",
    );
    const fresh = makeDeal({ stage_entered_at: daysAgo(1) });
    expect(
      triggeredCodes(fresh, [makeGate("G1_CRITERIA_LOCKED", false)]),
    ).not.toContain("STALLED_VALIDATION");
  });

  it("CLOSE_DATE_PRESSURE fires when close is near and gates are behind", () => {
    const fire = makeDeal({ expected_close_date: daysFromNow(10) });
    expect(
      triggeredCodes(fire, [
        makeGate("G1", true),
        makeGate("G2", false),
        makeGate("G3", false),
      ]),
    ).toContain("CLOSE_DATE_PRESSURE");
    const clear = makeDeal({ expected_close_date: daysFromNow(90) });
    expect(
      triggeredCodes(clear, [
        makeGate("G1", true),
        makeGate("G2", false),
        makeGate("G3", false),
      ]),
    ).not.toContain("CLOSE_DATE_PRESSURE");
  });

  it("UNRESOLVED_CRITICAL_BLOCKERS fires when a high-severity blocker exists", () => {
    const deal = makeDeal();
    const high: RawBlocker[] = [{ severity_name: "High" }];
    expect(triggeredCodes(deal, [], high)).toContain(
      "UNRESOLVED_CRITICAL_BLOCKERS",
    );
    const low: RawBlocker[] = [{ severity_name: "Low" }];
    expect(triggeredCodes(deal, [], low)).not.toContain(
      "UNRESOLVED_CRITICAL_BLOCKERS",
    );
  });

  it("NO_CLOSE_DATE fires past Discovery without an expected close date", () => {
    const fire = makeDeal({
      sales_stage: "Technical Validation",
      expected_close_date: null,
    });
    expect(triggeredCodes(fire, [makeGate("G1_CRITERIA_LOCKED", true)])).toContain(
      "NO_CLOSE_DATE",
    );
    const clear = makeDeal({
      sales_stage: "Technical Validation",
      expected_close_date: daysFromNow(90),
    });
    expect(
      triggeredCodes(clear, [makeGate("G1_CRITERIA_LOCKED", true)]),
    ).not.toContain("NO_CLOSE_DATE");
  });

  it("SLOW_MOTION_COLLISION fires for a decelerating deal nearing close", () => {
    const deal = makeDeal({ expected_close_date: daysFromNow(20) });
    const gates = [
      makeGate("G1", true),
      makeGate("G2", false),
      makeGate("G3", false),
    ];
    const momentum: OwnMomentum = {
      recentRate: 0,
      earlierRate: 2,
      dropPct: 100,
    };
    expect(
      triggeredCodes(deal, gates, [], DEFAULTS, { ownMomentum: momentum }),
    ).toContain("SLOW_MOTION_COLLISION");
    // Without momentum context the pattern cannot evaluate.
    expect(triggeredCodes(deal, gates, [], DEFAULTS, {})).not.toContain(
      "SLOW_MOTION_COLLISION",
    );
  });

  it("LOW_ATTACH_ELEPHANT fires for a large deal with low cross-sell attach", () => {
    const deal = makeDeal({
      product_revenue: 600000,
      cross_sells: [
        {
          productId: "p1",
          productName: "Pitched",
          productCategory: null,
          isPitched: true,
        },
        {
          productId: "p2",
          productName: "Pitched 2",
          productCategory: null,
          isPitched: true,
        },
      ],
    });
    expect(
      triggeredCodes(deal, [], [], DEFAULTS, { catalogCount: 10 }),
    ).toContain("LOW_ATTACH_ELEPHANT");
    // Attach rate above the threshold clears it.
    const highAttach = makeDeal({
      product_revenue: 600000,
      cross_sells: Array.from({ length: 5 }, (_, i) => ({
        productId: `p${i}`,
        productName: `Pitched ${i}`,
        productCategory: null,
        isPitched: true,
      })),
    });
    expect(
      triggeredCodes(highAttach, [], [], DEFAULTS, { catalogCount: 10 }),
    ).not.toContain("LOW_ATTACH_ELEPHANT");
  });

  it("exports exactly the 12 pattern codes", () => {
    expect(PATTERN_CODES).toHaveLength(12);
    expect(new Set(PATTERN_CODES).size).toBe(12);
  });
});

describe("calculateOwnMomentum", () => {
  const completionRow = (changedAt: string): AuditRow => ({
    entity_type: "gate",
    field_changed: "is_completed",
    new_value: "true",
    changed_at: changedAt,
  });

  it("reports a 100% drop when all completions are in the earlier window", () => {
    const deal = { created_at: daysAgo(90) };
    const rows = [
      completionRow(daysAgo(80)),
      completionRow(daysAgo(70)),
      completionRow(daysAgo(60)),
    ];
    const m = calculateOwnMomentum(deal, rows, DEFAULTS);
    expect(m.recentRate).toBe(0);
    expect(m.earlierRate).toBeCloseTo(1.5, 5);
    expect(m.dropPct).toBe(100);
  });

  it("reports no drop when there is no earlier activity", () => {
    const deal = { created_at: daysAgo(90) };
    const rows = [completionRow(daysAgo(5)), completionRow(daysAgo(10))];
    const m = calculateOwnMomentum(deal, rows, DEFAULTS);
    expect(m.recentRate).toBe(2);
    expect(m.earlierRate).toBe(0);
    expect(m.dropPct).toBe(0);
  });

  it("clamps acceleration to a zero drop", () => {
    const deal = { created_at: daysAgo(90) };
    const rows = [
      completionRow(daysAgo(80)),
      completionRow(daysAgo(70)),
      completionRow(daysAgo(5)),
      completionRow(daysAgo(10)),
    ];
    const m = calculateOwnMomentum(deal, rows, DEFAULTS);
    expect(m.recentRate).toBe(2);
    expect(m.dropPct).toBe(0);
  });

  it("ignores non-gate-completion audit rows", () => {
    const deal = { created_at: daysAgo(90) };
    const rows: AuditRow[] = [
      {
        entity_type: "deal",
        field_changed: "sales_stage",
        new_value: "Commercial",
        changed_at: daysAgo(5),
      },
      {
        entity_type: "gate",
        field_changed: "is_completed",
        new_value: false,
        changed_at: daysAgo(5),
      },
    ];
    const m = calculateOwnMomentum(deal, rows, DEFAULTS);
    expect(m.recentRate).toBe(0);
    expect(m.earlierRate).toBe(0);
    expect(m.dropPct).toBe(0);
  });
});

describe("intelligence engine — TCV calculation", () => {
  it("multiplies product revenue by term years for Multi-Year Committed deals", () => {
    const deal = makeDeal({
      pricing_model: "Multi-Year Committed",
      product_revenue: 100000,
      contract_term_years: 3,
      services_revenue: 50000,
    });
    const out = processDealIntelligence(deal, [], [], DEFAULTS);
    // 100000 * 3 + 50000
    expect(out.financials.calculatedTCV).toBe(350000);
    expect(out.financials.productRevenue).toBe(100000);
    expect(out.financials.servicesRevenue).toBe(50000);
    expect(out.financials.termYears).toBe(3);
  });

  it("adds product and services revenue for non-committed pricing models", () => {
    const deal = makeDeal({
      pricing_model: "Annual",
      product_revenue: 100000,
      contract_term_years: 3,
      services_revenue: 50000,
    });
    const out = processDealIntelligence(deal, [], [], DEFAULTS);
    // term years are ignored for additive pricing: 100000 + 50000
    expect(out.financials.calculatedTCV).toBe(150000);
  });

  it("coerces string revenue/term inputs and defaults missing values", () => {
    const deal = makeDeal({
      pricing_model: "Multi-Year Committed",
      product_revenue: "200000",
      contract_term_years: "2",
      services_revenue: "25000",
    });
    const out = processDealIntelligence(deal, [], [], DEFAULTS);
    // 200000 * 2 + 25000
    expect(out.financials.calculatedTCV).toBe(425000);
  });
});

describe("intelligence engine — currency normalization", () => {
  it("applies an fx rate of 1 and emits no data-quality note when currencies match", () => {
    const deal = makeDeal({
      deal_currency: "USD",
      pricing_model: "Annual",
      product_revenue: 100000,
      services_revenue: 50000,
    });
    const out = processDealIntelligence(deal, [], [], DEFAULTS);
    expect(out.financials.reportingCurrency).toBe("USD");
    expect(out.financials.fxRateApplied).toBe(1);
    expect(out.financials.normalizedTCV).toBe(150000);
    expect(out.financials.normalizedTCV).toBe(out.financials.calculatedTCV);
    expect(
      out.governance.dataQualityNotes.some((n) => n.code === "MISSING_FX_RATE"),
    ).toBe(false);
  });

  it("applies a supplied fx rate when the deal currency differs", () => {
    const deal = makeDeal({
      deal_currency: "EUR",
      pricing_model: "Annual",
      product_revenue: 100000,
      services_revenue: 50000,
    });
    const out = processDealIntelligence(deal, [], [], DEFAULTS, { fxRate: 1.1 });
    expect(out.financials.reportingCurrency).toBe("USD");
    expect(out.financials.fxRateApplied).toBe(1.1);
    // 150000 * 1.1
    expect(out.financials.normalizedTCV).toBeCloseTo(165000, 5);
    expect(
      out.governance.dataQualityNotes.some((n) => n.code === "MISSING_FX_RATE"),
    ).toBe(false);
  });

  it("falls back to native value and emits MISSING_FX_RATE when no rate is supplied", () => {
    const deal = makeDeal({
      deal_currency: "EUR",
      pricing_model: "Annual",
      product_revenue: 100000,
      services_revenue: 50000,
    });
    const out = processDealIntelligence(deal, [], [], DEFAULTS);
    expect(out.financials.fxRateApplied).toBeNull();
    // native value preserved (no conversion applied)
    expect(out.financials.normalizedTCV).toBe(150000);
    expect(out.financials.normalizedTCV).toBe(out.financials.calculatedTCV);
    const note = out.governance.dataQualityNotes.find(
      (n) => n.code === "MISSING_FX_RATE",
    );
    expect(note).toBeDefined();
    expect(note?.message).toContain("EUR");
    expect(note?.message).toContain("USD");
  });

  it("uses the reporting currency from context to decide whether a rate is needed", () => {
    const deal = makeDeal({
      deal_currency: "EUR",
      pricing_model: "Annual",
      product_revenue: 100000,
      services_revenue: 50000,
    });
    const out = processDealIntelligence(deal, [], [], DEFAULTS, {
      reportingCurrency: "EUR",
    });
    expect(out.financials.reportingCurrency).toBe("EUR");
    expect(out.financials.fxRateApplied).toBe(1);
    expect(out.financials.normalizedTCV).toBe(150000);
    expect(
      out.governance.dataQualityNotes.some((n) => n.code === "MISSING_FX_RATE"),
    ).toBe(false);
  });
});

describe("intelligence engine — technical track roll-up", () => {
  it("computes progress, steps completed, and total steps", () => {
    const gates = [
      makeGate("G1", true),
      makeGate("G2", true),
      makeGate("G3", false),
      makeGate("G4", false),
    ];
    const out = processDealIntelligence(makeDeal(), gates, [], DEFAULTS);
    expect(out.technicalTrack.stepsCompleted).toBe(2);
    expect(out.technicalTrack.totalSteps).toBe(4);
    expect(out.technicalTrack.progressPercentage).toBe(50);
  });

  it("rounds the progress percentage", () => {
    const gates = [
      makeGate("G1", true),
      makeGate("G2", false),
      makeGate("G3", false),
    ];
    const out = processDealIntelligence(makeDeal(), gates, [], DEFAULTS);
    // 1 / 3 = 33.33 -> 33
    expect(out.technicalTrack.progressPercentage).toBe(33);
  });

  it("reports zero progress and the pending milestone when there are no gates", () => {
    const out = processDealIntelligence(makeDeal(), [], [], DEFAULTS);
    expect(out.technicalTrack.totalSteps).toBe(0);
    expect(out.technicalTrack.stepsCompleted).toBe(0);
    expect(out.technicalTrack.progressPercentage).toBe(0);
    expect(out.technicalTrack.currentMilestone).toBe(
      "Gate 1: Success Criteria Pending",
    );
  });

  it("derives the current milestone from the highest fully-completed gate group", () => {
    const gates = [
      makeGate("G1a", true, { gate_group: 1 }),
      makeGate("G1b", true, { gate_group: 1 }),
      makeGate("G2a", true, { gate_group: 2 }),
      makeGate("G2b", true, { gate_group: 2 }),
      makeGate("G3a", false, { gate_group: 3 }),
    ];
    const out = processDealIntelligence(makeDeal(), gates, [], DEFAULTS);
    expect(out.technicalTrack.currentMilestone).toBe(
      "Gate 2: Core MVP Validated",
    );
  });

  it("requires every gate in a group to be complete before crediting that milestone", () => {
    const gates = [
      makeGate("G1a", true, { gate_group: 1 }),
      makeGate("G1b", false, { gate_group: 1 }),
      makeGate("G2a", true, { gate_group: 2 }),
      makeGate("G2b", true, { gate_group: 2 }),
    ];
    // Group 1 is incomplete; only the fully-complete group 2 counts.
    const out = processDealIntelligence(makeDeal(), gates, [], DEFAULTS);
    expect(out.technicalTrack.currentMilestone).toBe(
      "Gate 2: Core MVP Validated",
    );
  });

  it("flags an out-of-order integrity warning when a completed gate has an incomplete prerequisite", () => {
    const gates = [
      makeGate("G1", false),
      makeGate("G2", true, { prerequisite_gate_codes: ["G1"] }),
    ];
    const out = processDealIntelligence(makeDeal(), gates, [], DEFAULTS);
    expect(out.technicalTrack.integrityWarnings).toHaveLength(1);
    expect(out.technicalTrack.integrityWarnings[0]).toMatchObject({
      gateCode: "G2",
      type: "out_of_order",
    });
    expect(out.technicalTrack.integrityWarnings[0].message).toContain("G1");
  });

  it("emits no integrity warning when prerequisites are satisfied", () => {
    const gates = [
      makeGate("G1", true),
      makeGate("G2", true, { prerequisite_gate_codes: ["G1"] }),
    ];
    const out = processDealIntelligence(makeDeal(), gates, [], DEFAULTS);
    expect(out.technicalTrack.integrityWarnings).toHaveLength(0);
  });
});

describe("intelligence engine — health roll-up", () => {
  it("rolls up to RED when an unmanaged RED pattern fires", () => {
    const deal = makeDeal({ sales_stage: "Commercial" });
    const out = processDealIntelligence(deal, [], [], DEFAULTS);
    expect(out.governance.alerts.some((a) => a.code === "PREMATURE_COMMERCIAL")).toBe(
      true,
    );
    expect(out.governance.healthStatus).toBe("RED");
  });

  it("rolls up to YELLOW when only unmanaged YELLOW patterns fire", () => {
    const deal = makeDeal();
    const out = processDealIntelligence(
      deal,
      [],
      [{ severity_name: "High" }],
      DEFAULTS,
    );
    expect(out.governance.alerts.map((a) => a.code)).toEqual([
      "UNRESOLVED_CRITICAL_BLOCKERS",
    ]);
    expect(out.governance.healthStatus).toBe("YELLOW");
  });

  it("excludes managed (dispositioned) alerts from the health roll-up", () => {
    // This deal fires exactly one pattern: PREMATURE_COMMERCIAL (RED).
    const deal = makeDeal({ sales_stage: "Commercial" });
    const gates = [
      makeGate("G1_CRITERIA_LOCKED", true),
      makeGate("G1_EXECUTIVE_AGREED", true),
      makeGate("G3_PERFORMANCE_PASSED", false),
    ];
    const baseline = processDealIntelligence(deal, gates, [], DEFAULTS);
    expect(baseline.governance.alerts.map((a) => a.code)).toEqual([
      "PREMATURE_COMMERCIAL",
    ]);
    expect(baseline.governance.healthStatus).toBe("RED");

    const dispositions: RawDisposition[] = [
      { pattern_code: "PREMATURE_COMMERCIAL", disposition: "acknowledge" },
    ];
    const managed = processDealIntelligence(deal, gates, [], DEFAULTS, {
      dispositions,
    });
    expect(managed.governance.alerts).toHaveLength(0);
    expect(managed.governance.managedAlerts.map((a) => a.code)).toEqual([
      "PREMATURE_COMMERCIAL",
    ]);
    expect(managed.governance.unmanagedAlertCount).toBe(0);
    expect(managed.governance.healthStatus).toBe("GREEN");
  });
});
