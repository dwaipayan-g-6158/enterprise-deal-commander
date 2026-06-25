import { describe, it, expect } from "vitest";
import { toFanSeries, classifyVelocity } from "./transforms";

describe("toFanSeries", () => {
  it("builds an ordered band series from percentiles", () => {
    const out = toFanSeries({ p10: 1, p25: 2, p50: 3, p75: 4, p90: 5 });
    expect(out.map((d) => d.k)).toEqual(["P10", "P25", "P50", "P75", "P90"]);
    expect(out.map((d) => d.mid)).toEqual([1, 2, 3, 4, 5]);
    // lo is the p10 floor, hi is the p90 ceiling for the shaded band
    expect(out[0].lo).toBe(1);
    expect(out[4].hi).toBe(5);
  });
});

describe("classifyVelocity", () => {
  it("classifies by delta sign", () => {
    expect(classifyVelocity(5)).toBe("behind");
    expect(classifyVelocity(0)).toBe("on");
    expect(classifyVelocity(-3)).toBe("ahead");
  });
});
