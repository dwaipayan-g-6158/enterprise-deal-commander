import { describe, it, expect } from "vitest";
import { weightToPctString, selectChangedWeights, type WeightRow } from "./scoring-weights-model";

describe("weightToPctString", () => {
  it("keeps real precision instead of rounding 12.5% down to 13", () => {
    expect(weightToPctString(0.125)).toBe("12.5");
  });

  it("does not append a trailing .0 for a whole-number percentage", () => {
    expect(weightToPctString(0.5)).toBe("50");
  });

  it("caps at 2 decimal places for an awkward fraction", () => {
    expect(weightToPctString(1 / 3)).toBe("33.33");
  });

  it("handles zero", () => {
    expect(weightToPctString(0)).toBe("0");
  });
});

describe("selectChangedWeights", () => {
  const rows: WeightRow[] = [
    { featureId: "gate_momentum", weight: 0.2 },
    { featureId: "stage_velocity", weight: 0.15 },
    { featureId: "blocker_load", weight: 0.1 },
  ];

  it("returns nothing when every pct value still matches what was loaded", () => {
    const pct = { gate_momentum: "20", stage_velocity: "15", blocker_load: "10" };
    expect(selectChangedWeights(rows, pct)).toEqual([]);
  });

  it("returns only the factor the user actually edited, not the untouched ones", () => {
    const pct = { gate_momentum: "25", stage_velocity: "15", blocker_load: "10" };
    expect(selectChangedWeights(rows, pct)).toEqual([{ feature_id: "gate_momentum", weight: 0.25 }]);
  });

  it("converts the edited percentage string back into a fraction of 1.0", () => {
    const pct = { gate_momentum: "20", stage_velocity: "12.5", blocker_load: "10" };
    expect(selectChangedWeights(rows, pct)).toEqual([{ feature_id: "stage_velocity", weight: 0.125 }]);
  });

  it("supports multiple simultaneous edits", () => {
    const pct = { gate_momentum: "30", stage_velocity: "5", blocker_load: "10" };
    expect(selectChangedWeights(rows, pct)).toEqual([
      { feature_id: "gate_momentum", weight: 0.3 },
      { feature_id: "stage_velocity", weight: 0.05 },
    ]);
  });

  it("ignores a row with no local pct entry yet (still loading)", () => {
    const pct = { gate_momentum: "20" };
    expect(selectChangedWeights(rows, pct)).toEqual([]);
  });

  it("treats a blank edited value as 0, not as unchanged", () => {
    const pct = { gate_momentum: "", stage_velocity: "15", blocker_load: "10" };
    expect(selectChangedWeights(rows, pct)).toEqual([{ feature_id: "gate_momentum", weight: 0 }]);
  });
});
