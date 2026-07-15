import { describe, it, expect } from "vitest";
import { pickLatestPerDeal, computeScoreDelta, type ScoreRow } from "./roster-enrichment";

describe("pickLatestPerDeal", () => {
  it("keeps the first score per deal from a desc-ordered list", () => {
    const rows: ScoreRow[] = [
      { dealId: "a", score: 70, computedAt: "2026-07-15" },
      { dealId: "a", score: 40, computedAt: "2026-07-01" },
      { dealId: "b", score: 55, computedAt: "2026-07-10" },
    ];
    const m = pickLatestPerDeal(rows);
    expect(m.get("a")).toBe(70);
    expect(m.get("b")).toBe(55);
    expect(m.size).toBe(2);
  });

  it("returns an empty map for no rows", () => {
    expect(pickLatestPerDeal([]).size).toBe(0);
  });
});

describe("computeScoreDelta", () => {
  it("subtracts baseline from current", () => {
    expect(computeScoreDelta(70, 40)).toBe(30);
    expect(computeScoreDelta(40, 70)).toBe(-30);
    expect(computeScoreDelta(50, 50)).toBe(0);
  });

  it("is null when either side is missing", () => {
    expect(computeScoreDelta(70, null)).toBeNull();
    expect(computeScoreDelta(null, 40)).toBeNull();
    expect(computeScoreDelta(null, null)).toBeNull();
    expect(computeScoreDelta(70, undefined)).toBeNull();
  });
});
