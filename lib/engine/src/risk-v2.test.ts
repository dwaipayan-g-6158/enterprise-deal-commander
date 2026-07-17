import { describe, it, expect } from "vitest";
import {
  classifyRiskLevel,
  computeComposite,
  applyAmplification,
  topDrivers,
  generateUnifiedActions,
  computeUnifiedRisk,
  PATTERN_DIMENSION_MAP,
  HARDCODED_WEIGHTS,
  HARDCODED_BOUNDARIES,
  MAX_AMPLIFICATION_PER_DIMENSION,
  DIMENSION_SCORE_CAP,
} from "./risk-v2";
import type { DimensionFnResult, DimensionScore } from "./risk-v2-types";

function dim(
  name: DimensionFnResult["name"],
  score: number,
  assessable = true,
  signals: DimensionFnResult["signals"] = [{ factor: `${name} signal`, rawScore: score, weight: 1 }],
): DimensionFnResult {
  return { name, score, signals, assessable };
}

describe("classifyRiskLevel", () => {
  it("applies inclusive boundaries 25 / 50 / 75", () => {
    expect(classifyRiskLevel(25)).toBe("LOW");
    expect(classifyRiskLevel(26)).toBe("MODERATE");
    expect(classifyRiskLevel(50)).toBe("MODERATE");
    expect(classifyRiskLevel(51)).toBe("ELEVATED");
    expect(classifyRiskLevel(75)).toBe("ELEVATED");
    expect(classifyRiskLevel(76)).toBe("HIGH");
    expect(classifyRiskLevel(0)).toBe("LOW");
    expect(classifyRiskLevel(100)).toBe("HIGH");
  });
});

describe("computeComposite", () => {
  function asScore(d: DimensionFnResult): DimensionScore {
    return { ...d, baseScore: d.score, amplification: 0, weight: 0, contributingPatterns: [] };
  }

  it("excludes non-assessable dims from the denominator", () => {
    // Two dims, equal weight (0.20 technical, 0.10 competitive). Make competitive
    // non-assessable with a wild score and confirm it does not move the composite.
    const dimsAssessable = [asScore(dim("Technical Readiness", 80))];
    const onlyTech = computeComposite(dimsAssessable, HARDCODED_WEIGHTS);

    const withNonAssessable = [
      asScore(dim("Technical Readiness", 80)),
      asScore(dim("Competitive Exposure", 5, false)),
    ];
    const both = computeComposite(withNonAssessable, HARDCODED_WEIGHTS);
    expect(both).toBe(onlyTech);
    expect(both).toBe(80);
  });

  it("rounds and clamps to 0–100", () => {
    const dims = [asScore(dim("Technical Readiness", 100))];
    expect(computeComposite(dims, HARDCODED_WEIGHTS)).toBe(100);
  });

  it("returns 0 when nothing is assessable", () => {
    const dims = [asScore(dim("Technical Readiness", 80, false))];
    expect(computeComposite(dims, HARDCODED_WEIGHTS)).toBe(0);
  });
});

describe("applyAmplification", () => {
  it("caps amplification at MAX_AMPLIFICATION_PER_DIMENSION per dimension", () => {
    // GHOST_PIPELINE boosts Engagement +30; NO_CLOSE_DATE boosts Engagement +10;
    // PHANTOM_CHAMPION boosts Engagement +10 → total 50, capped at 40.
    const base = [dim("Engagement Vitality", 0)];
    const out = applyAmplification(base, [
      "GHOST_PIPELINE",
      "NO_CLOSE_DATE",
      "PHANTOM_CHAMPION",
    ]);
    const eng = out.find((d) => d.name === "Engagement Vitality")!;
    expect(eng.amplification).toBe(MAX_AMPLIFICATION_PER_DIMENSION);
  });

  it("caps final score at DIMENSION_SCORE_CAP", () => {
    const base = [dim("Engagement Vitality", 90)];
    const out = applyAmplification(base, ["GHOST_PIPELINE"]); // +30 → 120, cap 100
    const eng = out.find((d) => d.name === "Engagement Vitality")!;
    expect(eng.score).toBe(DIMENSION_SCORE_CAP);
    expect(eng.baseScore).toBe(90);
  });

  it("records contributing patterns per dimension", () => {
    const base = [dim("Commercial Alignment", 30), dim("Technical Readiness", 30)];
    const out = applyAmplification(base, ["PREMATURE_COMMERCIAL"]);
    const comm = out.find((d) => d.name === "Commercial Alignment")!;
    expect(comm.contributingPatterns).toContain("PREMATURE_COMMERCIAL");
    expect(comm.amplification).toBe(25);
  });

  it("ignores unknown pattern codes", () => {
    const base = [dim("Technical Readiness", 30)];
    const out = applyAmplification(base, ["NOT_A_REAL_PATTERN"]);
    expect(out[0].amplification).toBe(0);
  });
});

describe("PATTERN_DIMENSION_MAP", () => {
  it("includes STALLED_VALIDATION (the reconciled entry)", () => {
    expect(PATTERN_DIMENSION_MAP.STALLED_VALIDATION).toBeDefined();
    const dims = PATTERN_DIMENSION_MAP.STALLED_VALIDATION.amplifications.map((a) => a.dimension);
    expect(dims).toContain("Temporal Pressure");
    expect(dims).toContain("Technical Readiness");
  });

  it("covers all 16 real pattern codes", () => {
    const codes = [
      "PREMATURE_COMMERCIAL", "UNPROTECTED_ELEPHANT", "MISSING_STRUCTURAL_ANCHOR",
      "PHANTOM_CHAMPION", "GHOST_PIPELINE", "DISCOUNT_TRAP", "STALLED_VALIDATION",
      "CLOSE_DATE_PRESSURE", "UNRESOLVED_CRITICAL_BLOCKERS", "NO_CLOSE_DATE",
      "SLOW_MOTION_COLLISION", "LOW_ATTACH_ELEPHANT", "COMPETITIVE_DISPLACEMENT_STALL",
      "POC_DEATH_MARCH", "SIEM_UNDERSCOPED", "PLAYBOOK_EXECUTION_GAP",
    ];
    for (const c of codes) {
      expect(PATTERN_DIMENSION_MAP[c], `missing map entry for ${c}`).toBeDefined();
    }
  });
});

describe("topDrivers", () => {
  it("sorts by impact descending and slices to 5", () => {
    const dims = applyAmplification(
      [
        dim("Technical Readiness", 80, true, [
          { factor: "tech-a", rawScore: 80, weight: 0.5 },
          { factor: "tech-b", rawScore: 40, weight: 0.5 },
        ]),
        dim("Commercial Alignment", 60, true, [
          { factor: "comm-a", rawScore: 60, weight: 1 },
        ]),
        dim("Stakeholder Coverage", 20, true, [
          { factor: "stake-a", rawScore: 20, weight: 1 },
        ]),
        dim("Temporal Pressure", 10, true, [{ factor: "temp-a", rawScore: 10, weight: 1 }]),
        dim("Financial Structure", 5, true, [{ factor: "fin-a", rawScore: 5, weight: 1 }]),
        dim("Competitive Exposure", 3, true, [{ factor: "comp-a", rawScore: 3, weight: 1 }]),
      ],
      [],
    );
    const drivers = topDrivers(dims);
    expect(drivers.length).toBeLessThanOrEqual(5);
    for (let i = 1; i < drivers.length; i++) {
      expect(drivers[i - 1].impact).toBeGreaterThanOrEqual(drivers[i].impact);
    }
  });
});

describe("generateUnifiedActions", () => {
  const dims: DimensionScore[] = applyAmplification(
    [dim("Commercial Alignment", 60), dim("Technical Readiness", 30)],
    [],
  );

  it("emits BLOCKER actions from guardrail codes, sorted first", () => {
    const actions = generateUnifiedActions(
      dims,
      ["PREMATURE_COMMERCIAL"],
      ["PREMATURE_COMMERCIAL"],
      { tcv: 1_000_000, daysToClose: 30, progressPct: 30 },
    );
    expect(actions[0].priority).toBe("BLOCKER");
    expect(actions[0].source).toBe("STAGE_GUARDRAIL");
  });

  it("orders BLOCKER < CRITICAL < HIGH < MEDIUM < LOW", () => {
    const actions = generateUnifiedActions(
      applyAmplification([dim("Engagement Vitality", 70), dim("Stakeholder Coverage", 30)], []),
      ["GHOST_PIPELINE", "LOW_ATTACH_ELEPHANT"],
      ["MISSING_STRUCTURAL_ANCHOR"],
      { tcv: 2_000_000, daysToClose: 10, progressPct: 20 },
    );
    const order = { BLOCKER: 0, CRITICAL: 1, HIGH: 2, MEDIUM: 3, LOW: 4 } as const;
    for (let i = 1; i < actions.length; i++) {
      expect(order[actions[i - 1].priority]).toBeLessThanOrEqual(order[actions[i].priority]);
    }
  });
});

describe("computeUnifiedRisk", () => {
  const dimensionResults: DimensionFnResult[] = [
    dim("Technical Readiness", 50),
    dim("Commercial Alignment", 40),
    dim("Stakeholder Coverage", 30),
    dim("Temporal Pressure", 60),
    dim("Financial Structure", 20),
    dim("Competitive Exposure", 5, false),
    dim("Engagement Vitality", 25),
  ];

  it("orchestrates into a complete UnifiedRisk and is deterministic", () => {
    const args = {
      dimensionResults,
      activePatternCodes: ["PREMATURE_COMMERCIAL", "GHOST_PIPELINE"],
      guardrailCodes: ["PREMATURE_COMMERCIAL"],
      dealView: { tcv: 1_500_000, daysToClose: 40, progressPct: 30 },
    };
    const a = computeUnifiedRisk(args);
    const b = computeUnifiedRisk(args);
    expect(a).toEqual(b);
    expect(a.compositeScore).toBeGreaterThanOrEqual(0);
    expect(a.compositeScore).toBeLessThanOrEqual(100);
    expect(["LOW", "MODERATE", "ELEVATED", "HIGH"]).toContain(a.riskLevel);
    expect(a.dimensions).toHaveLength(7);
    expect(a.topDrivers.length).toBeLessThanOrEqual(5);
    expect(a.recommendedActions[0].priority).toBe("BLOCKER");
  });

  it("uses hardcoded defaults for weights and boundaries", () => {
    expect(HARDCODED_WEIGHTS.technical).toBe(0.2);
    expect(HARDCODED_BOUNDARIES.lowMax).toBe(25);
  });
});
