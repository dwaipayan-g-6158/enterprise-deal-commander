import { describe, it, expect } from "vitest";
import {
  num,
  deriveRiskWeights,
  deriveRiskBoundaries,
  deriveHealthWeights,
  derivePortfolioConfig,
  mergeScoringWeights,
} from "./engine-config";
import type { EngineThresholds, HealthWeights } from "@workspace/engine";
import { DEFAULT_PORTFOLIO_CONFIG } from "./portfolio-metrics";

// `EngineThresholds` has 16 required named fields (elephant_tcv_threshold,
// mega_deal_tcv_threshold, ...) plus a `[key: string]: number | string` index
// signature; the risk_weight_*/risk_level_* keys under test live only in the
// index signature. These tests exercise `num`/`deriveRiskWeights`/
// `deriveRiskBoundaries` purely through that index signature, so fixtures are
// asserted through the index signature rather than padded with 16 unrelated
// fields that have no bearing on the behavior under test.
const asThresholds = (v: Record<string, number | string>): EngineThresholds =>
  v as unknown as EngineThresholds;

describe("num", () => {
  it("returns the numeric threshold value when present", () => {
    expect(num(asThresholds({ foo: 42 }), "foo", 0)).toBe(42);
  });
  it("coerces a numeric string", () => {
    expect(num(asThresholds({ foo: "42" }), "foo", 0)).toBe(42);
  });
  it("falls back when the key is absent", () => {
    expect(num(asThresholds({}), "foo", 7)).toBe(7);
  });
  it("falls back when the value is non-numeric", () => {
    expect(num(asThresholds({ foo: "not-a-number" }), "foo", 7)).toBe(7);
  });
});

describe("deriveRiskWeights", () => {
  it("reads ALL SEVEN dimension weights from thresholds (not just technical/commercial)", () => {
    const thresholds = asThresholds({
      risk_weight_technical: 0.3,
      risk_weight_commercial: 0.2,
      risk_weight_stakeholder: 0.1,
      risk_weight_temporal: 0.1,
      risk_weight_financial: 0.1,
      risk_weight_competitive: 0.1,
      risk_weight_engagement: 0.1,
    });
    expect(deriveRiskWeights(thresholds)).toEqual({
      technical: 0.3,
      commercial: 0.2,
      stakeholder: 0.1,
      temporal: 0.1,
      financial: 0.1,
      competitive: 0.1,
      engagement: 0.1,
    });
  });

  it("defaults to the seeded PRD values when thresholds are empty", () => {
    expect(deriveRiskWeights(asThresholds({}))).toEqual({
      technical: 0.2,
      commercial: 0.15,
      stakeholder: 0.15,
      temporal: 0.15,
      financial: 0.1,
      competitive: 0.1,
      engagement: 0.15,
    });
  });
});

describe("deriveRiskBoundaries", () => {
  it("reads the three level boundaries from thresholds", () => {
    expect(
      deriveRiskBoundaries(
        asThresholds({
          risk_level_low_max: 20,
          risk_level_moderate_max: 45,
          risk_level_elevated_max: 70,
        }),
      ),
    ).toEqual({ lowMax: 20, moderateMax: 45, elevatedMax: 70 });
  });

  it("defaults to 25/50/75 when thresholds are empty", () => {
    expect(deriveRiskBoundaries(asThresholds({}))).toEqual({
      lowMax: 25,
      moderateMax: 50,
      elevatedMax: 75,
    });
  });
});

describe("deriveHealthWeights", () => {
  it("reads all six health-score weights from thresholds", () => {
    const thresholds = asThresholds({
      health_weight_coverage: 0.3,
      health_weight_velocity: 0.2,
      health_weight_conversion: 0.2,
      health_weight_generation: 0.1,
      health_weight_age: 0.1,
      health_weight_attrition: 0.1,
    });
    const result: HealthWeights = deriveHealthWeights(thresholds);
    expect(result).toEqual({
      coverage: 0.3,
      velocity: 0.2,
      conversion: 0.2,
      generation: 0.1,
      age: 0.1,
      attrition: 0.1,
    });
  });

  it("defaults to equal-sixths (matching the prior hardcoded DEFAULT_HEALTH_WEIGHTS) when thresholds are empty", () => {
    const result = deriveHealthWeights(asThresholds({}));
    expect(result.coverage).toBeCloseTo(1 / 6, 6);
    expect(result.velocity).toBeCloseTo(1 / 6, 6);
    expect(result.conversion).toBeCloseTo(1 / 6, 6);
    expect(result.generation).toBeCloseTo(1 / 6, 6);
    expect(result.age).toBeCloseTo(1 / 6, 6);
    expect(result.attrition).toBeCloseTo(1 / 6, 6);
  });
});

describe("derivePortfolioConfig", () => {
  it("reads all 7 portfolio constants from thresholds", () => {
    const thresholds = {
      portfolio_health_base_green: 5,
      portfolio_health_base_yellow: 40,
      portfolio_health_base_red: 80,
      portfolio_alert_bump_cap: 20,
      portfolio_alert_bump_per_weight: 0.3,
      portfolio_min_confidence_deals: 4,
      portfolio_significant_lift: 1.8,
      portfolio_cluster_min_share: 0.6,
      portfolio_cluster_min_deals: 4,
    };
    expect(derivePortfolioConfig(asThresholds(thresholds))).toEqual({
      healthBase: { GREEN: 5, YELLOW: 40, RED: 80 },
      alertBumpCap: 20,
      alertBumpPerWeight: 0.3,
      minConfidenceDeals: 4,
      significantLift: 1.8,
      clusterMinShare: 0.6,
      clusterMinDeals: 4,
    });
  });

  it("defaults to DEFAULT_PORTFOLIO_CONFIG when thresholds are empty", () => {
    expect(derivePortfolioConfig(asThresholds({}))).toEqual(DEFAULT_PORTFOLIO_CONFIG);
  });
});

describe("mergeScoringWeights", () => {
  it("overrides only the factors present in the calibrated rows, leaving the rest at default", () => {
    const merged = mergeScoringWeights([
      { featureId: "gate_momentum", calibratedWeight: 0.4 },
      { featureId: "stage_velocity", calibratedWeight: 0.05 },
    ]);
    expect(merged.gate_momentum).toBe(0.4);
    expect(merged.stage_velocity).toBe(0.05);
    // Untouched factors keep their scaled default (fraction-of-1, see Step 7).
    expect(merged.executive_alignment).toBeCloseTo(0.15, 4);
  });

  it("ignores rows with an unknown featureId or a non-finite weight", () => {
    const merged = mergeScoringWeights([
      { featureId: "not_a_real_factor", calibratedWeight: 0.9 },
      { featureId: "blocker_load", calibratedWeight: Number.NaN },
    ]);
    expect(merged.not_a_real_factor).toBeUndefined();
    expect(merged.blocker_load).toBeCloseTo(0.1, 4);
  });

  it("returns the full default set (scaled to fractions of 1) when given no rows", () => {
    const merged = mergeScoringWeights([]);
    expect(Object.values(merged).reduce((a, b) => a + b, 0)).toBeCloseTo(1, 4);
  });
});
