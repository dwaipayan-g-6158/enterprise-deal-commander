import { describe, it, expect } from "vitest";
import {
  scoreTechnicalReadiness,
  scoreCommercialAlignment,
  scoreStakeholderCoverage,
  scoreTemporalPressure,
  scoreFinancialStructure,
  scoreCompetitiveExposure,
  scoreEngagementVitality,
} from "./dimensions";
import type { RawGate } from "./index";
import type { StakeholderInput, CompetitorInput } from "./risk-v2-types";

function gate(
  code: string,
  group: number,
  completed: boolean,
  completedAt: string | null = null,
): RawGate {
  return {
    gate_code: code,
    gate_group: group,
    label: code,
    is_completed: completed,
    completed_at: completedAt,
    prerequisite_gate_codes: null,
  };
}

const HEALTHY_GATES: RawGate[] = [
  gate("G1_CRITERIA_LOCKED", 1, true, "2026-06-01"),
  gate("G2_MVP_VALIDATED", 2, true, "2026-06-05"),
  gate("G3_PERFORMANCE_PASSED", 3, true, "2026-06-10"),
  gate("G4_INFOSEC_CLEARED", 4, true, "2026-06-15"),
  gate("G5_CTO_SIGNED_OFF", 5, true, "2026-06-20"),
];

function gateMapFrom(gates: RawGate[]): Record<string, boolean> {
  const m: Record<string, boolean> = {};
  for (const g of gates) m[g.gate_code] = g.is_completed;
  return m;
}

describe("scoreTechnicalReadiness", () => {
  const base = {
    progressPct: 100,
    stepsCompleted: 5,
    totalSteps: 5,
    salesStage: "Commercial",
    gates: HEALTHY_GATES,
    gateMap: gateMapFrom(HEALTHY_GATES),
    daysSinceLastGate: 1,
  };

  it("is deterministic", () => {
    const a = scoreTechnicalReadiness(base);
    const b = scoreTechnicalReadiness(base);
    expect(a).toEqual(b);
  });

  it("a fully-healthy deal scores low", () => {
    expect(scoreTechnicalReadiness(base).score).toBeLessThanOrEqual(10);
  });

  it("is always assessable", () => {
    expect(scoreTechnicalReadiness(base).assessable).toBe(true);
  });

  it("lower progress yields higher risk (monotonic)", () => {
    const low = scoreTechnicalReadiness({
      ...base,
      progressPct: 20,
      stepsCompleted: 1,
      gates: [gate("G1_CRITERIA_LOCKED", 1, true, "2026-06-01")],
      gateMap: { G1_CRITERIA_LOCKED: true },
    });
    const high = scoreTechnicalReadiness({ ...base, progressPct: 80, stepsCompleted: 4 });
    expect(low.score).toBeGreaterThan(high.score);
  });

  it("staleness escalates with daysSinceLastGate", () => {
    const fresh = scoreTechnicalReadiness({ ...base, daysSinceLastGate: 3 });
    const stale = scoreTechnicalReadiness({ ...base, daysSinceLastGate: 40 });
    expect(stale.score).toBeGreaterThan(fresh.score);
  });

  it("penalizes missing critical gates", () => {
    const missing = scoreTechnicalReadiness({
      ...base,
      gateMap: { ...gateMapFrom(HEALTHY_GATES), G3_PERFORMANCE_PASSED: false, G5_CTO_SIGNED_OFF: false },
    });
    expect(missing.score).toBeGreaterThan(scoreTechnicalReadiness(base).score);
  });

  it("no gates completed past Discovery uses the 60 baseline staleness branch", () => {
    const r = scoreTechnicalReadiness({
      progressPct: 0,
      stepsCompleted: 0,
      totalSteps: 5,
      salesStage: "Validation",
      gates: HEALTHY_GATES.map((g) => ({ ...g, is_completed: false, completed_at: null })),
      gateMap: {},
      daysSinceLastGate: null,
    });
    expect(r.score).toBeGreaterThan(0);
  });
});

describe("scoreCommercialAlignment", () => {
  const base = {
    salesStage: "Discovery",
    progressPct: 100,
    normalizedTCV: 100000,
    servicesRevenue: 50000,
    productRevenue: 200000,
    servicesTier: "Standard",
    winProbability: 50,
  };

  it("is deterministic", () => {
    expect(scoreCommercialAlignment(base)).toEqual(scoreCommercialAlignment(base));
  });

  it("commercial stage far ahead of gates is high risk", () => {
    const ahead = scoreCommercialAlignment({
      ...base,
      salesStage: "Procurement",
      progressPct: 10,
    });
    expect(ahead.score).toBeGreaterThan(scoreCommercialAlignment(base).score);
  });

  it("null winProbability contributes 0 optimism risk", () => {
    const withNull = scoreCommercialAlignment({ ...base, winProbability: null });
    const optimismSignal = withNull.signals.find((s) =>
      s.factor.toLowerCase().includes("probability"),
    );
    expect(optimismSignal?.rawScore).toBe(0);
  });

  it("large deal with no services raises risk", () => {
    const risky = scoreCommercialAlignment({
      ...base,
      normalizedTCV: 1500000,
      servicesRevenue: 0,
      servicesTier: "None",
    });
    expect(risky.score).toBeGreaterThan(0);
  });
});

describe("scoreStakeholderCoverage", () => {
  it("empty stakeholders in Discovery → assessable false, score 10", () => {
    const r = scoreStakeholderCoverage({ salesStage: "Discovery", stakeholders: [] });
    expect(r.assessable).toBe(false);
    expect(r.score).toBe(10);
  });

  it("empty stakeholders past Discovery → assessable false, score 60", () => {
    const r = scoreStakeholderCoverage({ salesStage: "Commercial", stakeholders: [] });
    expect(r.assessable).toBe(false);
    expect(r.score).toBe(60);
  });

  it("hostile decision-maker drives the hostile signal to its max", () => {
    const stakeholders: StakeholderInput[] = [
      { name: "A", sentiment: "Champion", isDecisionMaker: false },
      { name: "B", sentiment: "Hostile", isDecisionMaker: true },
    ];
    const r = scoreStakeholderCoverage({ salesStage: "Commercial", stakeholders });
    expect(r.assessable).toBe(true);
    const hostileSignal = r.signals.find((s) => s.factor.toLowerCase().includes("hostile"));
    expect(hostileSignal?.rawScore).toBe(90);
    // ...and a hostile DM scores higher than the same roster with that DM supportive.
    const benign = scoreStakeholderCoverage({
      salesStage: "Commercial",
      stakeholders: [
        { name: "A", sentiment: "Champion", isDecisionMaker: false },
        { name: "B", sentiment: "Supportive", isDecisionMaker: true },
      ],
    });
    expect(r.score).toBeGreaterThan(benign.score);
  });

  it("strong champion coverage scores lower than weak", () => {
    const strong: StakeholderInput[] = [
      { name: "A", sentiment: "Champion", isDecisionMaker: true },
      { name: "B", sentiment: "Champion", isDecisionMaker: false },
    ];
    const weak: StakeholderInput[] = [
      { name: "A", sentiment: "Neutral", isDecisionMaker: false },
      { name: "B", sentiment: "Neutral", isDecisionMaker: false },
    ];
    expect(
      scoreStakeholderCoverage({ salesStage: "Commercial", stakeholders: strong }).score,
    ).toBeLessThan(
      scoreStakeholderCoverage({ salesStage: "Commercial", stakeholders: weak }).score,
    );
  });
});

describe("scoreTemporalPressure", () => {
  const base = {
    salesStage: "Commercial",
    daysInStage: 10,
    daysToClose: 120,
    expectedCloseDate: "2026-10-01",
    progressPct: 90,
    benchmarkMedianDays: 30,
  };

  it("is deterministic", () => {
    expect(scoreTemporalPressure(base)).toEqual(scoreTemporalPressure(base));
  });

  it("past close date with incomplete progress is maximal close-date risk", () => {
    const r = scoreTemporalPressure({ ...base, daysToClose: 0, progressPct: 50 });
    const closeSignal = r.signals.find((s) => s.factor.toLowerCase().includes("close"));
    expect(closeSignal?.rawScore).toBe(100);
  });

  it("no benchmark falls back to absolute-day thresholds", () => {
    const r = scoreTemporalPressure({ ...base, benchmarkMedianDays: null, daysInStage: 90 });
    expect(r.score).toBeGreaterThan(0);
  });

  it("no close date past Discovery adds existence risk", () => {
    const r = scoreTemporalPressure({
      ...base,
      daysToClose: null,
      expectedCloseDate: null,
    });
    const existence = r.signals.find((s) => s.factor.toLowerCase().includes("no expected"));
    expect(existence?.rawScore).toBe(50);
  });

  it("more days in stage over benchmark increases risk", () => {
    const slow = scoreTemporalPressure({ ...base, daysInStage: 90 });
    const fast = scoreTemporalPressure({ ...base, daysInStage: 10 });
    expect(slow.score).toBeGreaterThan(fast.score);
  });
});

describe("scoreFinancialStructure", () => {
  const base = {
    normalizedTCV: 100000,
    productRevenue: 100000,
    servicesRevenue: 30000,
    servicesTier: "Standard",
    pricingModel: "Annual Subscription",
    termYears: 3,
    crossSellPitchedCount: 0,
    progressPct: 80,
  };

  it("small deals carry no services structural risk", () => {
    const r = scoreFinancialStructure(base);
    expect(r.score).toBeLessThanOrEqual(20);
  });

  it("large deal with no services tier raises risk", () => {
    const r = scoreFinancialStructure({
      ...base,
      normalizedTCV: 1500000,
      servicesTier: "None",
    });
    expect(r.score).toBeGreaterThan(0);
  });

  it("many cross-sells pitched early is scope-creep risk", () => {
    const r = scoreFinancialStructure({
      ...base,
      crossSellPitchedCount: 4,
      progressPct: 20,
    });
    const cs = r.signals.find((s) => s.factor.toLowerCase().includes("cross-sell"));
    expect(cs?.rawScore).toBeGreaterThan(0);
  });
});

describe("scoreCompetitiveExposure", () => {
  it("empty competitors → assessable false, score 5", () => {
    const r = scoreCompetitiveExposure({ competitors: [], progressPct: 50 });
    expect(r.assessable).toBe(false);
    expect(r.score).toBe(5);
  });

  it("more active competitors raises count risk", () => {
    const one: CompetitorInput[] = [{ name: "AWS", status: "Active", winRate: null }];
    const three: CompetitorInput[] = [
      { name: "AWS", status: "Active", winRate: null },
      { name: "Okta", status: "Active", winRate: null },
      { name: "Ping", status: "Active", winRate: null },
    ];
    expect(
      scoreCompetitiveExposure({ competitors: one, progressPct: 30 }).score,
    ).toBeLessThan(
      scoreCompetitiveExposure({ competitors: three, progressPct: 30 }).score,
    );
  });

  it("null winRate makes the win-rate signal contribute 0 but count still applies", () => {
    const r = scoreCompetitiveExposure({
      competitors: [{ name: "AWS", status: "Active", winRate: null }],
      progressPct: 30,
    });
    const wr = r.signals.find((s) => s.factor.toLowerCase().includes("win rate"));
    expect(wr?.rawScore).toBe(0);
    expect(r.score).toBeGreaterThan(0);
  });

  it("low win rate (0-1 scale) is high risk", () => {
    const r = scoreCompetitiveExposure({
      competitors: [{ name: "AWS", status: "Active", winRate: 0.1 }],
      progressPct: 30,
    });
    const wr = r.signals.find((s) => s.factor.toLowerCase().includes("win rate"));
    expect(wr?.rawScore).toBeGreaterThan(50);
  });
});

describe("scoreEngagementVitality", () => {
  const base = {
    salesStage: "Commercial",
    daysSinceLastUpdate: 1,
    blueprintNotes: "A detailed strategic blueprint with plenty of content.",
    activeBlockerCount: 0,
    highSeverityBlockerCount: 0,
  };

  it("is deterministic", () => {
    expect(scoreEngagementVitality(base)).toEqual(scoreEngagementVitality(base));
  });

  it("fresh, well-documented deal scores low", () => {
    expect(scoreEngagementVitality(base).score).toBeLessThanOrEqual(10);
  });

  it("staleness escalates risk", () => {
    const stale = scoreEngagementVitality({ ...base, daysSinceLastUpdate: 30 });
    expect(stale.score).toBeGreaterThan(scoreEngagementVitality(base).score);
  });

  it("missing strategic notes past Discovery adds risk", () => {
    const r = scoreEngagementVitality({ ...base, blueprintNotes: null });
    const notes = r.signals.find((s) => s.factor.toLowerCase().includes("notes"));
    expect(notes?.rawScore).toBeGreaterThan(0);
  });

  it("high-severity blockers add proxy risk", () => {
    const r = scoreEngagementVitality({
      ...base,
      activeBlockerCount: 3,
      highSeverityBlockerCount: 2,
    });
    expect(r.score).toBeGreaterThan(scoreEngagementVitality(base).score);
  });
});
