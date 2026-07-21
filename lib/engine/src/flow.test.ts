import { describe, it, expect } from "vitest";
import {
  computeTransitionType,
  computeFunnel,
  computeConversionMatrix,
  computeSankeyFlows,
  computeTransitionBreakdown,
  computeRecycleExit,
  computeCoverage,
  computeHealthScore,
  scoreHealthAbsolute,
  DEFAULT_HEALTH_WEIGHTS,
  DEFAULT_HEALTH_BENCHMARKS,
  type StageDef,
  type OpenDeal,
  type TransitionRec,
} from "./flow";

const STAGES: StageDef[] = [
  { id: 1, name: "Discovery", sortOrder: 1 },
  { id: 2, name: "Validation", sortOrder: 2 },
  { id: 3, name: "Commercial", sortOrder: 3 },
  { id: 4, name: "Procurement", sortOrder: 4 },
  { id: 5, name: "Closed-Won", sortOrder: 5, terminal: "won" },
  { id: 6, name: "Closed-Lost", sortOrder: 6, terminal: "lost" },
];

describe("computeTransitionType", () => {
  it("classifies create when fromSortOrder is null", () => {
    expect(computeTransitionType(null, STAGES[0])).toBe("create");
  });
  it("classifies forward and backward by sort order", () => {
    expect(computeTransitionType(1, STAGES[1])).toBe("forward");
    expect(computeTransitionType(3, STAGES[0])).toBe("backward");
  });
  it("classifies terminal stages as exit_won / exit_lost", () => {
    expect(computeTransitionType(4, STAGES[4])).toBe("exit_won");
    expect(computeTransitionType(2, STAGES[5])).toBe("exit_lost");
  });
});

describe("computeFunnel", () => {
  it("counts deals and value per active stage with conversion to next", () => {
    const deals: OpenDeal[] = [
      { id: "a", stageId: 1, tcv: 100, winProbabilityPct: null, aiWinProbability: null, createdAt: "2026-01-01" },
      { id: "b", stageId: 2, tcv: 200, winProbabilityPct: null, aiWinProbability: null, createdAt: "2026-01-01" },
      { id: "c", stageId: 2, tcv: 300, winProbabilityPct: null, aiWinProbability: null, createdAt: "2026-01-01" },
    ];
    const rows = computeFunnel(deals, [], STAGES);
    const validation = rows.find((r) => r.stageId === 2)!;
    expect(validation.dealCount).toBe(2);
    expect(validation.totalValue).toBe(500);
    // Discovery → Validation conversion = deals that reached Validation+ / deals that entered Discovery
    expect(rows.find((r) => r.stageId === 1)!.dealCount).toBe(1);
  });
  it("excludes terminal stages from the active funnel", () => {
    const rows = computeFunnel([], [], STAGES);
    expect(rows.every((r) => r.stageId < 5)).toBe(true);
  });
});

describe("computeConversionMatrix", () => {
  it("computes from→to rates with forward/regression/stagnation kinds", () => {
    const now = "2026-02-01T00:00:00Z";
    const transitions: TransitionRec[] = [
      { dealId: "a", fromStageId: 1, toStageId: 2, transitionType: "forward", tcv: 0, daysInFromStage: 5, transitionedAt: "2026-01-10T00:00:00Z" },
      { dealId: "b", fromStageId: 1, toStageId: 2, transitionType: "forward", tcv: 0, daysInFromStage: 5, transitionedAt: "2026-01-11T00:00:00Z" },
      { dealId: "c", fromStageId: 1, toStageId: 1, transitionType: "backward", tcv: 0, daysInFromStage: 5, transitionedAt: "2026-01-12T00:00:00Z" },
    ];
    const m = computeConversionMatrix(transitions, STAGES, 90, now);
    const cell12 = m[0].find((c) => c.toId === 2)!; // from stage 1 → stage 2
    expect(cell12.kind).toBe("forward");
    expect(cell12.n).toBe(2);
    // 3 transitions out of stage 1, 2 went to stage 2 → 66.7%
    expect(cell12.rate).toBeCloseTo(66.7, 1);
  });
  it("excludes transitions older than the window", () => {
    const now = "2026-06-01T00:00:00Z";
    const transitions: TransitionRec[] = [
      { dealId: "a", fromStageId: 1, toStageId: 2, transitionType: "forward", tcv: 0, daysInFromStage: 5, transitionedAt: "2026-01-01T00:00:00Z" },
    ];
    const m = computeConversionMatrix(transitions, STAGES, 30, now);
    expect(m[0].every((c) => c.n === 0)).toBe(true);
  });
  it("classifies a move into Closed-Lost as 'loss', not 'forward' — regression guard", () => {
    // Closed-Lost (id 6) has the HIGHEST sortOrder of any stage. Before the
    // terminal-flag fix, "to.sortOrder > from.sortOrder" made every exit_lost
    // transition read as "forward" (and render green in the UI).
    const now = "2026-02-01T00:00:00Z";
    const transitions: TransitionRec[] = [
      { dealId: "a", fromStageId: 3, toStageId: 6, transitionType: "exit_lost", tcv: 0, daysInFromStage: 5, transitionedAt: "2026-01-10T00:00:00Z" },
    ];
    const m = computeConversionMatrix(transitions, STAGES, 90, now);
    const cellToLost = m.find((row) => row[0]?.fromId === 3)!.find((c) => c.toId === 6)!;
    expect(cellToLost.kind).toBe("loss");
  });
  it("classifies a move into Closed-Won as 'win'", () => {
    const now = "2026-02-01T00:00:00Z";
    const transitions: TransitionRec[] = [
      { dealId: "a", fromStageId: 4, toStageId: 5, transitionType: "exit_won", tcv: 0, daysInFromStage: 5, transitionedAt: "2026-01-10T00:00:00Z" },
    ];
    const m = computeConversionMatrix(transitions, STAGES, 90, now);
    const cellToWon = m.find((row) => row[0]?.fromId === 4)!.find((c) => c.toId === 5)!;
    expect(cellToWon.kind).toBe("win");
  });
});

describe("computeTransitionBreakdown", () => {
  it("buckets transitions into advance/recycle/won/lost by count and value, excluding create", () => {
    const transitions: TransitionRec[] = [
      { dealId: "a", fromStageId: null, toStageId: 1, transitionType: "create", tcv: 100, daysInFromStage: null, transitionedAt: "2026-01-01T00:00:00Z" },
      { dealId: "a", fromStageId: 1, toStageId: 2, transitionType: "forward", tcv: 100, daysInFromStage: 3, transitionedAt: "2026-01-04T00:00:00Z" },
      { dealId: "b", fromStageId: 2, toStageId: 1, transitionType: "backward", tcv: 50, daysInFromStage: 2, transitionedAt: "2026-01-05T00:00:00Z" },
      { dealId: "c", fromStageId: 4, toStageId: 5, transitionType: "exit_won", tcv: 300, daysInFromStage: 6, transitionedAt: "2026-01-06T00:00:00Z" },
      { dealId: "d", fromStageId: 3, toStageId: 6, transitionType: "exit_lost", tcv: 200, daysInFromStage: 8, transitionedAt: "2026-01-07T00:00:00Z" },
    ];
    const b = computeTransitionBreakdown(transitions);
    expect(b.advance).toEqual({ count: 1, value: 100 });
    expect(b.recycle).toEqual({ count: 1, value: 50 });
    expect(b.won).toEqual({ count: 1, value: 300 });
    expect(b.lost).toEqual({ count: 1, value: 200 });
  });
});

describe("computeSankeyFlows", () => {
  it("builds weighted links incl. exit nodes (count mode)", () => {
    const transitions: TransitionRec[] = [
      { dealId: "a", fromStageId: 1, toStageId: 2, transitionType: "forward", tcv: 100, daysInFromStage: 1, transitionedAt: "2026-01-01T00:00:00Z" },
      { dealId: "b", fromStageId: 2, toStageId: 5, transitionType: "exit_won", tcv: 200, daysInFromStage: 1, transitionedAt: "2026-01-02T00:00:00Z" },
    ];
    const { nodes, links } = computeSankeyFlows(transitions, STAGES, "count");
    expect(links.find((l) => l.source === "1" && l.target === "2")!.value).toBe(1);
    expect(nodes.some((n) => n.id === "5")).toBe(true);
  });
  it("weights links by value in value mode", () => {
    const transitions: TransitionRec[] = [
      { dealId: "a", fromStageId: 1, toStageId: 2, transitionType: "forward", tcv: 100, daysInFromStage: 1, transitionedAt: "2026-01-01T00:00:00Z" },
    ];
    const { links } = computeSankeyFlows(transitions, STAGES, "value");
    expect(links[0].value).toBe(100);
  });
});

describe("computeRecycleExit", () => {
  it("computes recycle rate and recycle-count distribution", () => {
    const transitions: TransitionRec[] = [
      { dealId: "a", fromStageId: null, toStageId: 1, transitionType: "create", tcv: 100, daysInFromStage: null, transitionedAt: "2026-01-01T00:00:00Z" },
      { dealId: "a", fromStageId: 1, toStageId: 2, transitionType: "forward", tcv: 100, daysInFromStage: 3, transitionedAt: "2026-01-04T00:00:00Z" },
      { dealId: "a", fromStageId: 2, toStageId: 1, transitionType: "backward", tcv: 100, daysInFromStage: 2, transitionedAt: "2026-01-06T00:00:00Z" },
    ];
    const r = computeRecycleExit(transitions, STAGES);
    expect(r.recycleCountDistribution[1]).toBe(1); // one deal recycled once
    expect(r.overallRecycleRate).toBeGreaterThan(0);
  });
  it("counts exits by terminal stage in the waterfall", () => {
    const transitions: TransitionRec[] = [
      { dealId: "b", fromStageId: null, toStageId: 1, transitionType: "create", tcv: 500, daysInFromStage: null, transitionedAt: "2026-01-01T00:00:00Z" },
      { dealId: "b", fromStageId: 1, toStageId: 5, transitionType: "exit_won", tcv: 500, daysInFromStage: 4, transitionedAt: "2026-01-05T00:00:00Z" },
    ];
    const r = computeRecycleExit(transitions, STAGES);
    expect(r.waterfall.find((w) => w.kind === "won")!.delta).toBe(-500);
    expect(r.waterfall.find((w) => w.kind === "created")!.delta).toBe(500);
  });
  it("reports 'still open' as the ending running total (created - won - lost), not a recycled marker", () => {
    const transitions: TransitionRec[] = [
      { dealId: "b", fromStageId: null, toStageId: 1, transitionType: "create", tcv: 1000, daysInFromStage: null, transitionedAt: "2026-01-01T00:00:00Z" },
      { dealId: "b", fromStageId: 1, toStageId: 5, transitionType: "exit_won", tcv: 1000, daysInFromStage: 4, transitionedAt: "2026-01-05T00:00:00Z" },
      { dealId: "c", fromStageId: null, toStageId: 1, transitionType: "create", tcv: 400, daysInFromStage: null, transitionedAt: "2026-01-02T00:00:00Z" },
      { dealId: "c", fromStageId: 1, toStageId: 6, transitionType: "exit_lost", tcv: 400, daysInFromStage: 4, transitionedAt: "2026-01-06T00:00:00Z" },
      { dealId: "d", fromStageId: null, toStageId: 1, transitionType: "create", tcv: 300, daysInFromStage: null, transitionedAt: "2026-01-03T00:00:00Z" },
    ];
    const r = computeRecycleExit(transitions, STAGES);
    // created 1700, won 1000, lost 400 -> still open 300 (deal "d", never exited)
    expect(r.waterfall.find((w) => w.kind === "ending")!.delta).toBe(300);
    // Exactly 4 steps now (created/won/lost/ending) — recycling is reported
    // separately via recycledDealCount/recycledValue, not as a 5th step.
    expect(r.waterfall.map((w) => w.kind)).toEqual(["created", "won", "lost", "ending"]);
  });
  it("splits exit rate by stage into won vs lost, and reports recycled deal count/value", () => {
    const transitions: TransitionRec[] = [
      { dealId: "a", fromStageId: null, toStageId: 4, transitionType: "create", tcv: 100, daysInFromStage: null, transitionedAt: "2026-01-01T00:00:00Z" },
      { dealId: "a", fromStageId: 4, toStageId: 5, transitionType: "exit_won", tcv: 100, daysInFromStage: 4, transitionedAt: "2026-01-05T00:00:00Z" },
      { dealId: "b", fromStageId: null, toStageId: 4, transitionType: "create", tcv: 200, daysInFromStage: null, transitionedAt: "2026-01-01T00:00:00Z" },
      { dealId: "b", fromStageId: 4, toStageId: 6, transitionType: "exit_lost", tcv: 200, daysInFromStage: 4, transitionedAt: "2026-01-05T00:00:00Z" },
      { dealId: "c", fromStageId: 2, toStageId: 1, transitionType: "backward", tcv: 75, daysInFromStage: 2, transitionedAt: "2026-01-05T00:00:00Z" },
    ];
    const r = computeRecycleExit(transitions, STAGES);
    expect(r.exitWonRateByStage[4]).toBe(50);
    expect(r.exitLostRateByStage[4]).toBe(50);
    expect(r.recycledDealCount).toBe(1);
    expect(r.recycledValue).toBe(75);
  });
});

describe("computeCoverage", () => {
  it("returns null ratios when no target set", () => {
    const c = computeCoverage([], STAGES, null, "2026-01-01");
    expect(c.total).toBeNull();
  });
  it("computes total and qualified (qualified = past Discovery)", () => {
    const deals: OpenDeal[] = [
      { id: "a", stageId: 1, tcv: 100, winProbabilityPct: 50, aiWinProbability: 0.5, createdAt: "2026-01-15" },
      { id: "b", stageId: 3, tcv: 300, winProbabilityPct: 80, aiWinProbability: 0.8, createdAt: "2026-01-15" },
    ];
    const c = computeCoverage(deals, STAGES, 1000, "2026-01-01");
    expect(c.total).toBeCloseTo(0.4, 2); // 400/1000
    expect(c.qualified).toBeCloseTo(0.3, 2); // 300/1000 (stage 3 only)
    expect(c.weighted).toBeCloseTo(0.29, 2); // (100*.5 + 300*.8)/1000 = 290/1000
  });
  it("net-new counts landedAt (not createdAt) when landedAt is set", () => {
    // Both rows were created in-period, but one LANDED before the period.
    const deals: OpenDeal[] = [
      { id: "old", stageId: 3, tcv: 500, winProbabilityPct: null, aiWinProbability: null, createdAt: "2026-05-01", landedAt: "2026-01-15" },
      { id: "new", stageId: 3, tcv: 200, winProbabilityPct: null, aiWinProbability: null, createdAt: "2026-05-01", landedAt: "2026-05-01" },
    ];
    const c = computeCoverage(deals, STAGES, 1000, "2026-04-01");
    // gap = 1000 - 0 weighted = 1000; only the in-period landing counts → 200/1000.
    expect(c.netNew).toBeCloseTo(0.2, 2);
  });
  it("net-new falls back to createdAt when landedAt is absent", () => {
    const deals: OpenDeal[] = [
      { id: "old", stageId: 3, tcv: 500, winProbabilityPct: null, aiWinProbability: null, createdAt: "2026-05-01" },
      { id: "new", stageId: 3, tcv: 200, winProbabilityPct: null, aiWinProbability: null, createdAt: "2026-05-01" },
    ];
    const c = computeCoverage(deals, STAGES, 1000, "2026-04-01");
    // No landedAt → both count by createdAt → 700/1000.
    expect(c.netNew).toBeCloseTo(0.7, 2);
  });
});

describe("computeHealthScore", () => {
  it("normalizes components to percentile rank and weights them", () => {
    const inputs = { coverageQualified: 3, velocityIndex: 40, winRate: 0.5, generationRatio: 1.1, agingScore: 30, retentionRate: 0.9 };
    const history = {
      coverage: [1, 2, 3, 4], velocity: [30, 40, 50, 60], conversion: [0.2, 0.3, 0.4, 0.5],
      generation: [0.8, 0.9, 1.0, 1.1], age: [20, 30, 40, 50], attrition: [0.7, 0.8, 0.9, 0.95],
    };
    const r = computeHealthScore(inputs, history, DEFAULT_HEALTH_WEIGHTS);
    expect(r.score).toBe(75);
    expect(r.subScores.velocity).toBe(50);
  });
  it("returns null coverage sub-score when coverage input is null", () => {
    const inputs = { coverageQualified: null, velocityIndex: 40, winRate: 0.5, generationRatio: null, agingScore: 30, retentionRate: 0.9 };
    const history = { coverage: [], velocity: [40], conversion: [0.5], generation: [], age: [30], attrition: [0.9] };
    const r = computeHealthScore(inputs, history);
    expect(r.subScores.coverage).toBeNull();
    expect(r.subScores.generation).toBeNull();
  });
});

describe("scoreHealthAbsolute", () => {
  it("scores every dimension against a fixed benchmark — no history needed, so it's never a flat 50", () => {
    // This is the regression guard for the Pipeline Pulse bug: computeHealthScore
    // percentile-ranks against history and returns 50 for every dimension when
    // history is empty (see the "returns null coverage sub-score" case above,
    // and computeHealthScore's own doc comment). scoreHealthAbsolute takes no
    // history at all and must produce varied, deterministic scores immediately.
    const inputs = {
      coverageQualified: 3, // at/above the 3x ceiling -> 100
      velocityIndex: 30, // at the 30-day floor -> 100
      winRate: 0.2, // halfway to the 40% ceiling -> 50
      generationRatio: 0.5, // halfway -> 50
      agingScore: 0.25, // halfway to the 50% ceiling (lower is better) -> 50
      retentionRate: 0.75, // halfway between 50% and 100% -> 50
    };
    const r = scoreHealthAbsolute(inputs, DEFAULT_HEALTH_BENCHMARKS, DEFAULT_HEALTH_WEIGHTS);
    expect(r.subScores.coverage).toBe(100);
    expect(r.subScores.velocity).toBe(100);
    expect(r.subScores.conversion).toBe(50);
    expect(r.subScores.generation).toBe(50);
    expect(r.subScores.age).toBe(50);
    expect(r.subScores.attrition).toBe(50);
    // Weighted mean of [100,100,50,50,50,50] = 400/6 ≈ 66.67 -> rounds to 67.
    expect(r.score).toBe(67);
  });
  it("clamps out-of-range values at the benchmark floor/ceiling", () => {
    const inputs = {
      coverageQualified: 10, // way above ceiling -> still 100, not >100
      velocityIndex: 500, // way past the 120-day ceiling -> still 0, not negative
      winRate: 0,
      generationRatio: 0,
      agingScore: 1,
      retentionRate: 0,
    };
    const r = scoreHealthAbsolute(inputs);
    expect(r.subScores.coverage).toBe(100);
    expect(r.subScores.velocity).toBe(0);
    expect(r.subScores.age).toBe(0);
  });
  it("excludes null dimensions and re-normalizes the remaining weights", () => {
    const inputs = {
      coverageQualified: null,
      velocityIndex: 30,
      winRate: 0.4,
      generationRatio: null,
      agingScore: 0,
      retentionRate: 1,
    };
    const r = scoreHealthAbsolute(inputs);
    expect(r.subScores.coverage).toBeNull();
    expect(r.subScores.generation).toBeNull();
    // velocity=100, conversion=100, age=100, attrition=100 -> mean of the 4 non-null = 100.
    expect(r.score).toBe(100);
  });
});
