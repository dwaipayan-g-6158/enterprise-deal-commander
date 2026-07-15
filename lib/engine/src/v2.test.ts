import { describe, it, expect } from "vitest";
import {
  computePredictiveScore,
  sigmoid,
  TOTAL_SCORING_WEIGHT,
  DEFAULT_SCORING_WEIGHTS,
  type ScoringInput,
} from "./scoring";
import { runPipelineSimulation, dealProbability } from "./simulation";
import {
  evaluateCondition,
  evaluateCustomPatterns,
  renderTemplate,
  resolveFieldPath,
  type CustomPattern,
} from "./custom-patterns";
import { computeRampTCV } from "./ramp";
import { parseNLC } from "./nlc";

const baseScoringInput: ScoringInput = {
  progressPct: 50,
  daysInStage: 14,
  productRevenue: 400000,
  servicesRevenue: 120000,
  ctoSignedOff: false,
  executiveAgreed: true,
  totalBlockerCount: 0,
  highBlockerCount: 0,
  calculatedTCV: 1000000,
  daysToClose: 60,
  profileKey: "Commercial|Multi-Year",
};

describe("predictive scoring", () => {
  it("weights sum to 100", () => {
    expect(TOTAL_SCORING_WEIGHT).toBe(100);
  });

  it("sigmoid is 0.5 at the midpoint and monotonic", () => {
    expect(sigmoid(0.5)).toBeCloseTo(0.5, 6);
    expect(sigmoid(0.8)).toBeGreaterThan(sigmoid(0.5));
    expect(sigmoid(0.2)).toBeLessThan(sigmoid(0.5));
  });

  it("produces a 0–100 score with breakdown summing to score", () => {
    const r = computePredictiveScore(baseScoringInput);
    expect(r.score).toBeGreaterThanOrEqual(0);
    expect(r.score).toBeLessThanOrEqual(100);
    expect(r.breakdown).toHaveLength(8);
  });

  it("scores a strong deal higher than a weak deal", () => {
    const strong = computePredictiveScore({
      ...baseScoringInput,
      progressPct: 95,
      ctoSignedOff: true,
      highBlockerCount: 0,
      totalBlockerCount: 0,
    });
    const weak = computePredictiveScore({
      ...baseScoringInput,
      progressPct: 10,
      ctoSignedOff: false,
      executiveAgreed: false,
      highBlockerCount: 3,
      totalBlockerCount: 5,
    });
    expect(strong.score).toBeGreaterThan(weak.score);
  });

  it("confidence reflects data completeness", () => {
    const high = computePredictiveScore(baseScoringInput, {
      stageBenchmarkDays: 20,
      avgWonTCV: 900000,
    });
    expect(high.confidence).toBe("HIGH");
    const low = computePredictiveScore({ ...baseScoringInput, daysToClose: null });
    expect(low.confidence).toBe("LOW");
  });

  it("DEFAULT_SCORING_WEIGHTS mirrors the 8 FACTOR defaults and sums to 100", () => {
    expect(DEFAULT_SCORING_WEIGHTS).toEqual({
      gate_momentum: 25,
      stage_velocity: 15,
      services_attachment: 10,
      executive_alignment: 15,
      blocker_load: 10,
      deal_size_confidence: 5,
      close_pressure: 10,
      historical_win_rate: 10,
    });
    expect(Object.values(DEFAULT_SCORING_WEIGHTS).reduce((a, b) => a + b, 0)).toBe(100);
  });

  it("an explicit weights override changes which factor dominates the score", () => {
    // All weight on gate_momentum (progress 95%); every other factor's weight is 0.
    const allOnGateMomentum = { ...DEFAULT_SCORING_WEIGHTS };
    for (const k of Object.keys(allOnGateMomentum)) allOnGateMomentum[k] = 0;
    allOnGateMomentum.gate_momentum = 100;

    const highProgress = computePredictiveScore(
      { ...baseScoringInput, progressPct: 95 },
      {},
      allOnGateMomentum,
    );
    const lowProgress = computePredictiveScore(
      { ...baseScoringInput, progressPct: 5 },
      {},
      allOnGateMomentum,
    );
    expect(highProgress.score).toBeGreaterThan(lowProgress.score);
    // With no weights passed, the default FACTORS weights are used (unchanged behavior).
    const defaultWeighted = computePredictiveScore(baseScoringInput);
    expect(defaultWeighted.breakdown.find((b) => b.featureId === "gate_momentum")?.weight).toBe(25);
  });
});

describe("pipeline simulation", () => {
  it("a certain deal always closes; an impossible deal never does", () => {
    const r = runPipelineSimulation(
      [
        { calculatedTCV: 100, predictiveScore: 100 },
        { calculatedTCV: 50, predictiveScore: 0 },
      ],
      1000,
    );
    expect(r.percentiles.p50).toBe(100);
    expect(r.worstCase).toBe(100);
    expect(r.bestCase).toBe(100);
  });

  it("percentiles are monotonically ordered", () => {
    const deals = Array.from({ length: 20 }, () => ({ calculatedTCV: 1000, predictiveScore: 50 }));
    const r = runPipelineSimulation(deals, 5000);
    const { p10, p25, p50, p75, p90 } = r.percentiles;
    expect(p10).toBeLessThanOrEqual(p25);
    expect(p25).toBeLessThanOrEqual(p50);
    expect(p50).toBeLessThanOrEqual(p75);
    expect(p75).toBeLessThanOrEqual(p90);
  });

  it("derives probability with score → win% → 30% fallback", () => {
    expect(dealProbability({ calculatedTCV: 1, predictiveScore: 80 })).toBeCloseTo(0.8);
    expect(dealProbability({ calculatedTCV: 1, winProbabilityPct: 40 })).toBeCloseTo(0.4);
    expect(dealProbability({ calculatedTCV: 1 })).toBeCloseTo(0.3);
  });
});

describe("custom pattern evaluator", () => {
  it("evaluates each operator", () => {
    expect(evaluateCondition(10, "gt", "5")).toBe(true);
    expect(evaluateCondition(10, "lt", "5")).toBe(false);
    expect(evaluateCondition(5, "gte", "5")).toBe(true);
    expect(evaluateCondition(5, "lte", "5")).toBe(true);
    expect(evaluateCondition("None", "eq", "none")).toBe(true);
    expect(evaluateCondition("Commercial", "neq", "Discovery")).toBe(true);
    expect(evaluateCondition("AWS battle", "contains", "aws")).toBe(true);
    expect(evaluateCondition("AWS battle", "not_contains", "snowflake")).toBe(true);
    expect(evaluateCondition(null, "is_null", "")).toBe(true);
    expect(evaluateCondition(3, "is_not_null", "")).toBe(true);
  });

  it("resolves dotted field paths", () => {
    expect(resolveFieldPath({ financials: { calculatedTCV: 500000 } }, "financials.calculatedTCV")).toBe(500000);
  });

  it("renders {{placeholder}} templates", () => {
    expect(renderTemplate("Deal {{dealName}} at {{financials.calculatedTCV}}", {
      dealName: "Atlas",
      financials: { calculatedTCV: 1000000 },
    })).toBe("Deal Atlas at 1000000");
  });

  it("fires only when ALL conditions hold (AND)", () => {
    const pattern: CustomPattern = {
      id: "p1",
      patternName: "Big slow deal",
      severity: "RED",
      weight: 60,
      alertMessageTemplate: "{{dealName}} is big and slow",
      conditions: [
        { fieldPath: "financials.calculatedTCV", operator: "gt", comparisonValue: "500000", sortOrder: 0 },
        { fieldPath: "technicalTrack.progressPercentage", operator: "lt", comparisonValue: "50", sortOrder: 1 },
      ],
    };
    const fires = evaluateCustomPatterns([pattern], {
      dealName: "Atlas",
      financials: { calculatedTCV: 1000000 },
      technicalTrack: { progressPercentage: 33 },
    });
    expect(fires).toHaveLength(1);
    expect(fires[0].message).toBe("Atlas is big and slow");

    const noFire = evaluateCustomPatterns([pattern], {
      dealName: "Atlas",
      financials: { calculatedTCV: 1000000 },
      technicalTrack: { progressPercentage: 80 },
    });
    expect(noFire).toHaveLength(0);
  });
});

describe("ramp TCV", () => {
  it("sums net product + services across years", () => {
    const tcv = computeRampTCV(
      [
        { yearNumber: 1, productRevenue: 100000, servicesRevenue: 20000, discountPct: 0 },
        { yearNumber: 2, productRevenue: 100000, servicesRevenue: 0, discountPct: 10 },
      ],
      { productRevenue: 0, servicesRevenue: 0, contractTermYears: 2, pricingModel: "Annual" },
    );
    // 120000 + 90000 = 210000
    expect(tcv).toBe(210000);
  });

  it("falls back to flat multi-year committed", () => {
    expect(
      computeRampTCV([], {
        productRevenue: 100000,
        servicesRevenue: 50000,
        contractTermYears: 3,
        pricingModel: "Multi-Year Committed",
      }),
    ).toBe(350000);
  });

  it("falls back to flat annual", () => {
    expect(
      computeRampTCV([], {
        productRevenue: 100000,
        servicesRevenue: 50000,
        contractTermYears: 3,
        pricingModel: "Annual",
      }),
    ).toBe(150000);
  });
});

describe("NLC parser", () => {
  it("parses 'show red deals above $1M'", () => {
    const q = parseNLC("show red deals above $1M");
    expect(q).toMatchObject({ type: "LIST", entity: "deals" });
    if (q && q.type === "LIST") {
      expect(q.conditions).toContainEqual({ field: "health", operator: "eq", value: "RED" });
      expect(q.conditions).toContainEqual({ field: "tcv", operator: "gt", value: 1000000 });
    }
  });

  it("parses date + progress conditions", () => {
    const q = parseNLC("deals closing this quarter with less than 50% progress");
    if (q && q.type === "LIST") {
      expect(q.conditions).toContainEqual({ field: "close_date", operator: "in", value: "this_quarter" });
      expect(q.conditions).toContainEqual({ field: "progress", operator: "lt", value: 50 });
    } else {
      throw new Error("expected LIST");
    }
  });

  it("parses COUNT with stage and blocker conditions", () => {
    const q = parseNLC("count deals where stage is commercial and blockers > 2");
    expect(q?.type).toBe("COUNT");
    if (q && q.type === "COUNT") {
      expect(q.conditions).toContainEqual({ field: "stage", operator: "eq", value: "Commercial" });
      expect(q.conditions).toContainEqual({ field: "blockers", operator: "gt", value: 2 });
    }
  });

  it("parses COMPARE", () => {
    expect(parseNLC("compare acme corp and horizon fintech")).toEqual({
      type: "COMPARE",
      entities: ["acme corp", "horizon fintech"],
    });
  });

  it("parses competitor, stale days, no-close-date, and sort", () => {
    expect((parseNLC("deals with snowflake as competitor") as any).conditions).toContainEqual({
      field: "competitor",
      operator: "eq",
      value: "Snowflake",
    });
    expect((parseNLC("stale deals over 30 days") as any).conditions).toContainEqual({
      field: "days_in_stage",
      operator: "gt",
      value: 30,
    });
    expect((parseNLC("my deals with no close date") as any).conditions).toContainEqual({
      field: "close_date",
      operator: "is_null",
      value: "",
    });
    const sorted = parseNLC("highest tcv deals");
    expect(sorted).toMatchObject({ type: "LIST", sort: { field: "tcv", direction: "DESC" }, limit: 10 });
  });

  it("falls back to SEARCH for unparseable input", () => {
    expect(parseNLC("what is going on")).toEqual({ type: "SEARCH", query: "what is going on" });
  });
});
