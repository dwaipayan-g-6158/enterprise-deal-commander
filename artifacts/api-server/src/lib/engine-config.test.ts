import { describe, it, expect } from "vitest";
import { num, deriveRiskWeights, deriveRiskBoundaries } from "./engine-config";
import type { EngineThresholds } from "@workspace/engine";

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
