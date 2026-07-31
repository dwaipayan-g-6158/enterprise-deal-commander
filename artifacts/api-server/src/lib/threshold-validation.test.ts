import { describe, it, expect } from "vitest";
import { validateThresholdUpdate } from "./threshold-validation";

describe("validateThresholdUpdate", () => {
  it("rejects a risk_weight_* set to 0", () => {
    const result = validateThresholdUpdate(
      [{ parameter_key: "risk_weight_technical", parameter_value: "0" }],
      new Map(), // current DB rows, empty for this case
    );
    expect(result.valid).toBe(false);
  });

  it("rejects risk_level boundaries that are non-monotonic after merging with current values", () => {
    const current = new Map([
      ["risk_level_low_max", { parameterValue: "25", dataType: "number" }],
      ["risk_level_moderate_max", { parameterValue: "50", dataType: "number" }],
      ["risk_level_elevated_max", { parameterValue: "75", dataType: "number" }],
    ]);
    const result = validateThresholdUpdate(
      [{ parameter_key: "risk_level_low_max", parameter_value: "80" }], // now 80 > moderate_max's current 50
      current,
    );
    expect(result.valid).toBe(false);
  });

  it("rejects low_attach_rate_threshold outside [0, 1]", () => {
    const result = validateThresholdUpdate(
      [{ parameter_key: "low_attach_rate_threshold", parameter_value: "5" }],
      new Map(),
    );
    expect(result.valid).toBe(false);
  });

  it("accepts a valid, well-formed update", () => {
    const result = validateThresholdUpdate(
      [{ parameter_key: "stale_stage_days", parameter_value: "25" }],
      new Map([["stale_stage_days", { parameterValue: "21", dataType: "number" }]]),
    );
    expect(result.valid).toBe(true);
  });
});
