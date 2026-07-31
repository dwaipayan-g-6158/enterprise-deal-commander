import { describe, it, expect } from "vitest";
import { shouldConfirmTabSwitch } from "./settings-model";

describe("shouldConfirmTabSwitch", () => {
  it("does not confirm when the current tab has no unsaved changes", () => {
    expect(shouldConfirmTabSwitch("thresholds", "weights", { thresholds: false, weights: true })).toBe(false);
  });

  it("confirms when leaving a dirty tab for a different tab", () => {
    expect(shouldConfirmTabSwitch("thresholds", "weights", { thresholds: true, weights: false })).toBe(true);
  });

  it("does not confirm when the tab isn't actually changing", () => {
    expect(shouldConfirmTabSwitch("thresholds", "thresholds", { thresholds: true })).toBe(false);
  });

  it("does not confirm for a tab with no dirty-tracking entry at all (e.g. Team, Webhooks)", () => {
    expect(shouldConfirmTabSwitch("team", "users", {})).toBe(false);
  });

  it("only cares about the tab being left, not the destination's dirty state", () => {
    expect(shouldConfirmTabSwitch("weights", "thresholds", { weights: true, thresholds: true })).toBe(true);
  });
});
