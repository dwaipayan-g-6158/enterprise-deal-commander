import { describe, it, expect } from "vitest";
import {
  computeTransitionType,
  computeFunnel,
  computeConversionMatrix,
  computeSankeyFlows,
  computeRecycleExit,
  computeCoverage,
  computeHealthScore,
  DEFAULT_HEALTH_WEIGHTS,
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
