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

  // ── Task 13: sweep versions of the "score is stable..." invariant above (Task 6's fix) ──
  //
  // Deviation from the task-13 brief's own sketch (explicitly authorized by the
  // brief's note): the brief's single loop over `additions` conflates two
  // different effects of growing the lost cohort.
  //
  //  1. `computePatternLethality`'s `lethality = lostCount / total` is a genuine
  //     proportion re-estimate: adding *any* new lost deal grows `total`, and
  //     a pattern's own lethality share only stays fixed if that new deal ALSO
  //     fires it (numerator grows in lockstep with the denominator). That is
  //     expected, correct behavior — nothing to do with the Task 6 bug — and a
  //     sweep must not assert stability across it.
  //  2. The actual Task 6 bug was `scoreLossRisk` summing lethality across
  //     EVERY distinct pattern code ever observed in the cohort
  //     (`maxPossibleSum = lethality.reduce(...)`), so a lost deal firing a
  //     pattern the active deal DOESN'T match still shrank the active deal's
  //     score by inflating that denominator. The fix (max-matched-lethality)
  //     makes the score depend ONLY on the lethality of patterns the active
  //     deal itself matches — entries for other codes are structurally
  //     invisible to it.
  //
  // Two focused sweeps below isolate these: the first proves effect #2 is
  // fixed directly at the `scoreLossRisk` boundary (no `computePatternLethality`
  // denominator subtlety involved at all); the second sweeps a realistic
  // growing cohort — mirroring the existing single-example test just above,
  // generalized across cohort size — where the active-matched pattern's own
  // share is held fixed at 100% by construction, so unrelated pattern growth
  // is provably a no-op. The third documents the CONTRAST case from the
  // brief's note: when new lost deals genuinely change how often the active
  // deal's own matched pattern fires, the score legitimately (and
  // deterministically) moves — that is correct behavior, not a regression.

  it("[invariant] scoreLossRisk ignores lethality entries for patterns outside the active deal's matched set, across many catalog sizes and lethality values", () => {
    const active = ["GHOST_PIPELINE", "NO_CLOSE_DATE"];
    const matched = [
      { code: "GHOST_PIPELINE", lethality: 0.8, lostCount: 4 },
      { code: "NO_CLOSE_DATE", lethality: 0.3, lostCount: 2 },
    ];
    const baseline = scoreLossRisk(active, matched);
    expect(baseline.score).toBe(80);

    const unrelatedCodes = [
      "STALLED_VALIDATION", "PHANTOM_CHAMPION", "DISCOUNT_TRAP", "SIEM_UNDERSCOPED",
      "UNPROTECTED_ELEPHANT", "LOW_ATTACH_ELEPHANT", "POC_DEATH_MARCH",
    ];
    for (let catalogSize = 0; catalogSize <= unrelatedCodes.length; catalogSize++) {
      for (const unrelatedLethality of [0.05, 0.5, 0.9, 1.0]) {
        const extended = [
          ...matched,
          ...unrelatedCodes
            .slice(0, catalogSize)
            .map((code) => ({ code, lethality: unrelatedLethality, lostCount: 1 })),
        ];
        const result = scoreLossRisk(active, extended);
        expect(result.score).toBe(baseline.score);
      }
    }
  });

  it("[invariant] scoreLossRisk for a fixed active deal is unaffected by NEW distinct patterns added alongside its own matched pattern, as the lost cohort grows", () => {
    const active = ["GHOST_PIPELINE"];
    // Every lost deal in the cohort fires GHOST_PIPELINE (so its own lethality
    // share is pinned at 100% throughout), but each ALSO fires one new, distinct,
    // unrelated pattern as the cohort grows — this is the exact shape of the
    // pre-existing single-example regression test above, generalized into a
    // sweep over cohort size 1..9.
    const unrelatedCodes = [
      "NO_CLOSE_DATE", "STALLED_VALIDATION", "PHANTOM_CHAMPION", "DISCOUNT_TRAP",
      "SIEM_UNDERSCOPED", "UNPROTECTED_ELEPHANT", "LOW_ATTACH_ELEPHANT",
      "POC_DEATH_MARCH", "CLOSE_DATE_PRESSURE",
    ];
    for (let cohortSize = 1; cohortSize <= unrelatedCodes.length; cohortSize++) {
      const cohort = Array.from({ length: cohortSize }, (_, i) => [
        "GHOST_PIPELINE",
        unrelatedCodes[i],
      ]);
      const lethality = computePatternLethality(cohort);
      const { score } = scoreLossRisk(active, lethality);
      expect(score).toBe(100);
    }
  });

  it("(contrast, not a regression) scoreLossRisk legitimately tracks the active deal's OWN matched-pattern lethality share as the lost cohort's composition changes", () => {
    const active = ["GHOST_PIPELINE"];
    const totalLostDeals = 10;
    let priorScore = -1;
    for (let firingCount = 1; firingCount <= totalLostDeals; firingCount++) {
      // firingCount of the 10 lost deals fire GHOST_PIPELINE; the rest fire an
      // unrelated pattern. As firingCount rises, GHOST_PIPELINE's own lethality
      // share genuinely rises too — the score must track it exactly. This is
      // real signal, not the Task 6 dilution bug (which was about an
      // ever-growing catalog of DISTINCT codes, not about a matched pattern's
      // own share honestly changing with more data).
      const cohort = [
        ...Array(firingCount).fill(["GHOST_PIPELINE"]),
        ...Array(totalLostDeals - firingCount).fill(["STALLED_VALIDATION"]),
      ];
      const lethality = computePatternLethality(cohort);
      const { score } = scoreLossRisk(active, lethality);
      expect(score).toBe(Math.round((firingCount / totalLostDeals) * 100));
      expect(score).toBeGreaterThanOrEqual(priorScore);
      priorScore = score;
    }
  });
});
