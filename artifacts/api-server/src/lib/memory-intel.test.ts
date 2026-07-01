import { describe, it, expect } from "vitest";
import { computeCompetitorIntel, percentiles, type MemoryRow } from "./memory-intel";

function row(overrides: Partial<MemoryRow> = {}): MemoryRow {
  return {
    id: "r1",
    outcome: "Won",
    finalTcv: "100000",
    totalDaysActive: 90,
    competitorsFaced: [],
    pricingModel: "Subscription",
    servicesTier: "Standard",
    primaryLossCategory: null,
    ...overrides,
  } as MemoryRow;
}

describe("percentiles", () => {
  it("returns zeros for an empty array", () => {
    expect(percentiles([])).toEqual({ p25: 0, median: 0, p75: 0, p90: 0 });
  });

  it("computes percentiles over a sorted sample", () => {
    const xs = [10, 20, 30, 40, 50, 60, 70, 80, 90, 100];
    const p = percentiles(xs);
    expect(p.median).toBe(60);
    expect(p.p25).toBeLessThan(p.median);
    expect(p.p90).toBeGreaterThan(p.median);
  });
});

describe("computeCompetitorIntel", () => {
  it("returns no entries below the minimum encounter threshold", () => {
    const rows = [row({ competitorsFaced: ["CloudBridge"] }), row({ competitorsFaced: ["CloudBridge"] })];
    expect(computeCompetitorIntel(rows)).toEqual([]);
  });

  it("aggregates win rate and top loss category once the threshold is met", () => {
    const rows = [
      row({ competitorsFaced: ["CloudBridge"], outcome: "Won" }),
      row({ competitorsFaced: ["CloudBridge"], outcome: "Lost", primaryLossCategory: "price" }),
      row({ competitorsFaced: ["CloudBridge"], outcome: "Lost", primaryLossCategory: "price" }),
    ];
    const intel = computeCompetitorIntel(rows);
    expect(intel).toHaveLength(1);
    expect(intel[0].name).toBe("CloudBridge");
    expect(intel[0].encounterCount).toBe(3);
    expect(intel[0].winRatePct).toBe(33);
    expect(intel[0].topLossCategory).toBe("price");
  });

  it("sorts competitors by encounter count descending", () => {
    const rows = [
      ...Array.from({ length: 3 }, () => row({ competitorsFaced: ["Rival"] })),
      ...Array.from({ length: 5 }, () => row({ competitorsFaced: ["BigCo"] })),
    ];
    expect(computeCompetitorIntel(rows).map((c) => c.name)).toEqual(["BigCo", "Rival"]);
  });
});
