import { describe, it, expect } from "vitest";
import { computePatternLethality, scoreLossRisk } from "./loss-risk";

describe("computePatternLethality", () => {
  it("returns a lethality share per pattern code, normalized by lost-deal count", () => {
    const result = computePatternLethality([
      ["PHANTOM_CHAMPION", "GHOST_PIPELINE"],
      ["PHANTOM_CHAMPION"],
      ["DISCOUNT_TRAP"],
    ]);
    const byCode = new Map(result.map((r) => [r.code, r]));
    expect(byCode.get("PHANTOM_CHAMPION")).toEqual({
      code: "PHANTOM_CHAMPION",
      lethality: 2 / 3,
      lostCount: 2,
    });
    expect(byCode.get("GHOST_PIPELINE")).toEqual({
      code: "GHOST_PIPELINE",
      lethality: 1 / 3,
      lostCount: 1,
    });
    expect(byCode.get("DISCOUNT_TRAP")).toEqual({
      code: "DISCOUNT_TRAP",
      lethality: 1 / 3,
      lostCount: 1,
    });
  });

  it("returns an empty array when there are no lost deals", () => {
    expect(computePatternLethality([])).toEqual([]);
  });
});

describe("scoreLossRisk", () => {
  const lethality = [
    { code: "PHANTOM_CHAMPION", lethality: 0.8, lostCount: 4 },
    { code: "DISCOUNT_TRAP", lethality: 0.4, lostCount: 2 },
    { code: "GHOST_PIPELINE", lethality: 0.2, lostCount: 1 },
  ];

  it("scores 0 with no matched patterns", () => {
    const result = scoreLossRisk([], lethality);
    expect(result.score).toBe(0);
    expect(result.matchedPatterns).toEqual([]);
  });

  it("scores higher for a deal matching more/deadlier historical patterns", () => {
    const lowRisk = scoreLossRisk(["GHOST_PIPELINE"], lethality);
    const highRisk = scoreLossRisk(["PHANTOM_CHAMPION", "DISCOUNT_TRAP"], lethality);
    expect(highRisk.score).toBeGreaterThan(lowRisk.score);
  });

  it("only includes matched patterns that appear in the historical lethality map", () => {
    const result = scoreLossRisk(["PHANTOM_CHAMPION", "SOME_UNRELATED_PATTERN"], lethality);
    expect(result.matchedPatterns).toEqual([{ code: "PHANTOM_CHAMPION", lethality: 0.8 }]);
  });

  it("clamps the score to a maximum of 100 regardless of how many deadly patterns match", () => {
    const allDeadly = [
      { code: "A", lethality: 1, lostCount: 5 },
      { code: "B", lethality: 1, lostCount: 5 },
      { code: "C", lethality: 1, lostCount: 5 },
      { code: "D", lethality: 1, lostCount: 5 },
    ];
    const result = scoreLossRisk(["A", "B", "C", "D"], allDeadly);
    expect(result.score).toBeLessThanOrEqual(100);
  });

  it("score is stable (monotonically non-decreasing) as the lost cohort grows with UNRELATED patterns", () => {
    const active = ["GHOST_PIPELINE"];
    const cohortA = computePatternLethality([["GHOST_PIPELINE"]]);
    // cohortB adds two more lost deals, each contributing one UNRELATED
    // distinct pattern to the catalog (NO_CLOSE_DATE, STALLED_VALIDATION) —
    // but GHOST_PIPELINE still fires on every lost deal, so its OWN
    // lethality (lostCount / total) is unchanged at 100%. This isolates the
    // bug under test (an ever-growing catalog of unrelated patterns
    // shrinking the score) from the unrelated, expected behavior of
    // computePatternLethality's share re-estimating when a pattern's own
    // hit rate genuinely changes with more data.
    const cohortB = computePatternLethality([
      ["GHOST_PIPELINE"],
      ["GHOST_PIPELINE", "NO_CLOSE_DATE"],
      ["GHOST_PIPELINE", "STALLED_VALIDATION"],
    ]);
    const a = scoreLossRisk(active, cohortA);
    const b = scoreLossRisk(active, cohortB);
    expect(b.score).toBe(a.score); // GHOST_PIPELINE's own lethality (100% in both cases) is unchanged
    expect(a.score).toBe(100);
  });

  it("score reflects the single most-lethal MATCHED pattern, not a sum diluted by the full catalog", () => {
    // Cohort of 10 lost deals: GHOST_PIPELINE fired on 8 of them (80% lethality),
    // NO_CLOSE_DATE fired on 2 (20%). Active deal fires both.
    const lostCodes = [
      ...Array(8).fill(["GHOST_PIPELINE"]),
      ...Array(2).fill(["NO_CLOSE_DATE"]),
    ];
    const lethality = computePatternLethality(lostCodes);
    const result = scoreLossRisk(["GHOST_PIPELINE", "NO_CLOSE_DATE"], lethality);
    expect(result.score).toBe(80);
  });
});
