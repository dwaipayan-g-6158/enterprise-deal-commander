import { describe, it, expect } from "vitest";
import { computeCompetitorIntel, computePlaybookEffectiveness, percentiles, type MemoryRow } from "./memory-intel";

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

describe("computePlaybookEffectiveness", () => {
  it("compares win rate between deals that used a playbook and those that didn't", () => {
    const memory = [
      { dealId: "a", outcome: "Won" },
      { dealId: "b", outcome: "Won" },
      { dealId: "c", outcome: "Lost" },
      { dealId: "d", outcome: "Lost" },
    ];
    const assigned = new Set(["a", "b", "c"]); // 3 with playbook: 2 won, 1 lost; 1 without: lost
    const eff = computePlaybookEffectiveness(memory, assigned);
    expect(eff.withPlaybookCount).toBe(3);
    expect(eff.withoutPlaybookCount).toBe(1);
    expect(eff.withPlaybookWinRatePct).toBe(67);
    expect(eff.withoutPlaybookWinRatePct).toBe(0);
  });

  it("returns null win rates for a group with no decided deals", () => {
    const eff = computePlaybookEffectiveness([], new Set());
    expect(eff.withPlaybookWinRatePct).toBeNull();
    expect(eff.withoutPlaybookWinRatePct).toBeNull();
  });
});
