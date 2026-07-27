import { describe, it, expect } from "vitest";
import { shouldSkipSnapshot } from "./snapshot-service";

describe("shouldSkipSnapshot", () => {
  it("skips deal.deleted and deal.archived", () => {
    expect(shouldSkipSnapshot("deal.deleted")).toBe(true);
    expect(shouldSkipSnapshot("deal.archived")).toBe(true);
  });

  it("does not skip other event types", () => {
    expect(shouldSkipSnapshot("deal.updated")).toBe(false);
    expect(shouldSkipSnapshot("deal.restored")).toBe(false);
    expect(shouldSkipSnapshot("deal.created")).toBe(false);
    expect(shouldSkipSnapshot("health.changed")).toBe(false);
  });
});
