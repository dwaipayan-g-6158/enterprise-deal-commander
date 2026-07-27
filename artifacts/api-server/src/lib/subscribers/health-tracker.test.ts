import { describe, it, expect } from "vitest";
import { shouldSkipHealthReconcile } from "./health-tracker";

describe("shouldSkipHealthReconcile", () => {
  it("skips health.changed (recursion guard), deal.deleted, and deal.archived", () => {
    expect(shouldSkipHealthReconcile("health.changed")).toBe(true);
    expect(shouldSkipHealthReconcile("deal.deleted")).toBe(true);
    expect(shouldSkipHealthReconcile("deal.archived")).toBe(true);
  });

  it("does not skip other event types", () => {
    expect(shouldSkipHealthReconcile("deal.updated")).toBe(false);
    expect(shouldSkipHealthReconcile("deal.restored")).toBe(false);
    expect(shouldSkipHealthReconcile("gate.toggled")).toBe(false);
  });
});
