import { describe, it, expect } from "vitest";
import { toFanSeries, classifyVelocity, meterGeometry } from "./transforms";

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

describe("meterGeometry", () => {
  it("splits an overdue deal into on-time base + red overflow", () => {
    const g = meterGeometry({ daysInStage: 45, benchmarkDays: 27, deltaDays: 18 }, 45);
    expect(g.tone).toBe("behind");
    expect(g.fillPct).toBe(100);
    expect(g.benchmarkPct).toBeCloseTo(60);
    expect(g.overflowPct).toBeCloseTo(40);
  });

  it("renders an ahead deal as a short fill with no overflow", () => {
    const g = meterGeometry({ daysInStage: 8, benchmarkDays: 10, deltaDays: -2 }, 45);
    expect(g.tone).toBe("ahead");
    expect(g.fillPct).toBeCloseTo(17.78, 1);
    expect(g.benchmarkPct).toBeCloseTo(22.22, 1);
    expect(g.overflowPct).toBe(0);
  });

  it("treats an on-benchmark deal as on with no overflow", () => {
    const g = meterGeometry({ daysInStage: 10, benchmarkDays: 10, deltaDays: 0 }, 20);
    expect(g.tone).toBe("on");
    expect(g.fillPct).toBe(50);
    expect(g.benchmarkPct).toBe(50);
    expect(g.overflowPct).toBe(0);
  });

  it("guards against a zero scaleMax and clamps to 0-100", () => {
    const g = meterGeometry({ daysInStage: 0, benchmarkDays: 0, deltaDays: 0 }, 0);
    expect(g.fillPct).toBe(0);
    expect(g.benchmarkPct).toBe(0);
    expect(g.overflowPct).toBe(0);
  });
});
