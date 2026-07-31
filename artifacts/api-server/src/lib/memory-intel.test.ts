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

  it("computes percentiles over a sorted sample via linear interpolation", () => {
    const xs = [10, 20, 30, 40, 50, 60, 70, 80, 90, 100];
    const p = percentiles(xs);
    expect(p.p25).toBe(32.5);
    expect(p.median).toBe(55);
    expect(p.p75).toBe(77.5);
    expect(p.p90).toBe(91);
  });

  it("does not collapse p90 to the max for small samples", () => {
    // Nearest-rank (floor(n*p)) degenerates to the max for any n <= 10 — the
    // only regime this app's archive runs in. Interpolation must not do that.
    const xs = [10, 20, 30];
    const p = percentiles(xs);
    expect(p.p90).toBeLessThan(30);
    expect(p.p90).toBeGreaterThan(20);
  });

  it("interpolates the median for an even-length sample instead of picking the upper middle", () => {
    const p = percentiles([10, 20]);
    expect(p.median).toBe(15);
  });
});

describe("computeCompetitorIntel", () => {
  it("returns a competitor below the low-confidence floor, flagged rather than hidden", () => {
    const rows = [row({ competitorsFaced: ["CloudBridge"] }), row({ competitorsFaced: ["CloudBridge"] })];
    const intel = computeCompetitorIntel(rows);
    expect(intel).toHaveLength(1);
    expect(intel[0].encounterCount).toBe(2);
    expect(intel[0].lowConfidence).toBe(true);
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
    expect(intel[0].lowConfidence).toBe(false);
  });

  it("ignores null/zero TCV rows when averaging deal size", () => {
    const rows = [
      row({ competitorsFaced: ["CloudBridge"], finalTcv: null }),
      row({ competitorsFaced: ["CloudBridge"], finalTcv: "0" }),
      row({ competitorsFaced: ["CloudBridge"], finalTcv: "200000" }),
    ];
    expect(computeCompetitorIntel(rows)[0].avgTcv).toBe(200000);
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
