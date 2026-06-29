import { describe, it, expect } from "vitest";
import {
  bucketDealsByLevel,
  averageScore,
  pickHighestRisk,
  buildInsight,
  type PipelineRiskRow,
} from "./pipeline-risk";

// ---------------------------------------------------------------------------
// Fixture helpers
// ---------------------------------------------------------------------------

function row(
  id: string,
  riskScore: number | null,
  riskLevel: PipelineRiskRow["riskLevel"],
  tcv = 1_000_000,
): PipelineRiskRow {
  return { id, name: `Deal ${id}`, tcv, riskScore, riskLevel };
}

const FIXTURE: PipelineRiskRow[] = [
  row("d1", 82, "HIGH", 5_000_000),
  row("d2", 60, "ELEVATED", 3_000_000),
  row("d3", 60, "ELEVATED", 2_000_000),
  row("d4", 35, "MODERATE", 1_500_000),
  row("d5", 10, "LOW", 500_000),
  row("d6", null, null, 800_000), // unscored — excluded from buckets
];

// ---------------------------------------------------------------------------
// bucketDealsByLevel
// ---------------------------------------------------------------------------

describe("bucketDealsByLevel", () => {
  it("counts and sums TCV for each level, excluding null-riskLevel rows", () => {
    const buckets = bucketDealsByLevel(FIXTURE);
    expect(buckets.HIGH).toEqual({ count: 1, tcv: 5_000_000 });
    expect(buckets.ELEVATED).toEqual({ count: 2, tcv: 5_000_000 });
    expect(buckets.MODERATE).toEqual({ count: 1, tcv: 1_500_000 });
    expect(buckets.LOW).toEqual({ count: 1, tcv: 500_000 });
  });

  it("returns zero counts when no rows have a riskLevel", () => {
    const unscored = [row("x1", null, null), row("x2", null, null)];
    const buckets = bucketDealsByLevel(unscored);
    expect(buckets.HIGH.count).toBe(0);
    expect(buckets.ELEVATED.count).toBe(0);
    expect(buckets.MODERATE.count).toBe(0);
    expect(buckets.LOW.count).toBe(0);
  });

  it("returns all four keys even when some are empty", () => {
    const sparse = [row("s1", 90, "HIGH")];
    const buckets = bucketDealsByLevel(sparse);
    expect(Object.keys(buckets).sort()).toEqual(["ELEVATED", "HIGH", "LOW", "MODERATE"]);
    expect(buckets.ELEVATED.count).toBe(0);
  });

  it("accumulates TCV correctly across multiple rows in the same bucket", () => {
    const same = [row("a", 80, "HIGH", 1_000), row("b", 85, "HIGH", 2_000)];
    const buckets = bucketDealsByLevel(same);
    expect(buckets.HIGH).toEqual({ count: 2, tcv: 3_000 });
  });
});

// ---------------------------------------------------------------------------
// averageScore
// ---------------------------------------------------------------------------

describe("averageScore", () => {
  it("computes the mean of non-null scores", () => {
    const rows: PipelineRiskRow[] = [
      row("a", 80, "HIGH"),
      row("b", 40, "MODERATE"),
      row("c", 20, "LOW"),
    ];
    expect(averageScore(rows)).toBeCloseTo(140 / 3);
  });

  it("ignores null scores", () => {
    const rows: PipelineRiskRow[] = [
      row("a", 60, "ELEVATED"),
      row("b", null, null),
      row("c", 40, "MODERATE"),
    ];
    expect(averageScore(rows)).toBeCloseTo(50);
  });

  it("returns null when all scores are null", () => {
    const rows = [row("a", null, null), row("b", null, null)];
    expect(averageScore(rows)).toBeNull();
  });

  it("returns null for an empty array", () => {
    expect(averageScore([])).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// pickHighestRisk
// ---------------------------------------------------------------------------

describe("pickHighestRisk", () => {
  it("returns the row with the maximum riskScore", () => {
    const result = pickHighestRisk(FIXTURE);
    expect(result?.id).toBe("d1"); // score 82 is the highest
  });

  it("returns the first row encountered on a tie", () => {
    const rows: PipelineRiskRow[] = [
      row("t1", 60, "ELEVATED"),
      row("t2", 60, "ELEVATED"),
      row("t3", 40, "MODERATE"),
    ];
    expect(pickHighestRisk(rows)?.id).toBe("t1");
  });

  it("skips null-scored rows", () => {
    const rows = [row("n1", null, null), row("n2", 50, "MODERATE"), row("n3", null, null)];
    expect(pickHighestRisk(rows)?.id).toBe("n2");
  });

  it("returns null when no rows have a score", () => {
    expect(pickHighestRisk([row("x", null, null)])).toBeNull();
    expect(pickHighestRisk([])).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// buildInsight
// ---------------------------------------------------------------------------

describe("buildInsight", () => {
  it("mentions High or Elevated count when present", () => {
    const buckets = bucketDealsByLevel(FIXTURE);
    const avg = averageScore(FIXTURE); // 82 + 60 + 60 + 35 + 10 = 247 / 5 = 49.4
    const insight = buildInsight(buckets, avg);
    expect(insight).toContain("3 deals are High or Elevated risk");
    expect(insight).toContain("49");
  });

  it("mentions the average score when there are High/Elevated deals", () => {
    const rows = [row("a", 80, "HIGH"), row("b", 70, "ELEVATED")];
    const insight = buildInsight(bucketDealsByLevel(rows), averageScore(rows));
    expect(insight).toContain("average pipeline risk score is 75");
  });

  it("produces singular 'deal' when count is 1", () => {
    const rows = [row("a", 80, "HIGH")];
    const insight = buildInsight(bucketDealsByLevel(rows), averageScore(rows));
    expect(insight).toMatch(/1 deal is High or Elevated/);
  });

  it("falls back to no-score variant when avgScore is null", () => {
    const rows = [row("a", null, "HIGH")];
    // riskLevel set but no score — HIGH bucket has count 1
    const insight = buildInsight(bucketDealsByLevel(rows), null);
    expect(insight).toContain("1 deal is High or Elevated risk across the active pipeline");
  });

  it("returns empty pipeline message when no buckets populated", () => {
    const empty = bucketDealsByLevel([]);
    expect(buildInsight(empty, null)).toBe("No scored deals in the active pipeline.");
  });

  it("returns all-low message when only LOW deals are present", () => {
    const rows = [row("a", 10, "LOW"), row("b", 15, "LOW")];
    const insight = buildInsight(bucketDealsByLevel(rows), averageScore(rows));
    expect(insight).toContain("All scored deals are Low risk");
  });

  it("does not claim all-Low when MODERATE deals are present but riskScore is null", () => {
    // A deal that has a riskLevel of MODERATE but no numeric riskScore.
    // bucketDealsByLevel counts it into MODERATE; averageScore returns null.
    const rows = [row("m1", null, "MODERATE")];
    const buckets = bucketDealsByLevel(rows);
    const insight = buildInsight(buckets, null);
    // Must NOT say "Low risk" or imply a clean pipeline.
    expect(insight).not.toContain("Low risk");
    // Must reflect the MODERATE deal.
    expect(insight).toContain("Moderate risk");
  });
});
