// Enterprise Deal Commander — Flow Analytics engine (pure, isomorphic).
// No DB/network I/O. All inputs passed as arguments (see scoring.ts / risk-v2.ts).

export type TransitionType = "create" | "forward" | "backward" | "exit_won" | "exit_lost";

export interface StageDef {
  id: number;
  name: string;
  sortOrder: number;
  terminal?: "won" | "lost";
}

export interface TransitionRec {
  dealId: string;
  fromStageId: number | null;
  toStageId: number | null;
  transitionType: TransitionType;
  tcv: number;
  daysInFromStage: number | null;
  transitionedAt: string;
}

export interface OpenDeal {
  id: string;
  stageId: number;
  tcv: number;
  winProbabilityPct: number | null;
  aiWinProbability: number | null; // 0..1
  createdAt: string;
  landedAt?: string | null; // pipeline-entry date; falls back to createdAt
}

export interface FunnelRow {
  stageId: number;
  stageName: string;
  dealCount: number;
  totalValue: number;
  convToNextPct: number | null;
  avgDaysInStage: number | null;
  pctOfPipeline: number;
}

// NOTE: a same-stage move (fromSortOrder == toStage.sortOrder, non-terminal) is classified
// "backward" here, while the conversion matrix independently labels same-stage cells "stagnation"
// by sortOrder — the stored TransitionType and matrix `kind` are independent classifications.
export function computeTransitionType(
  fromSortOrder: number | null,
  toStage: StageDef,
): TransitionType {
  if (fromSortOrder === null) return "create";
  if (toStage.terminal === "won") return "exit_won";
  if (toStage.terminal === "lost") return "exit_lost";
  return toStage.sortOrder > fromSortOrder ? "forward" : "backward";
}

export function computeFunnel(
  deals: OpenDeal[],
  transitions: TransitionRec[],
  stages: StageDef[],
): FunnelRow[] {
  const active = [...stages].filter((s) => !s.terminal).sort((a, b) => a.sortOrder - b.sortOrder);
  const totalValue = deals.reduce((sum, d) => sum + d.tcv, 0) || 1;

  // Count of deals that ever entered each active stage (for conversion).
  const enteredCount = new Map<number, number>();
  for (const t of transitions) {
    if (t.toStageId != null) enteredCount.set(t.toStageId, (enteredCount.get(t.toStageId) ?? 0) + 1);
  }
  // Average residence time per stage, from transitions leaving that stage.
  const residSum = new Map<number, number>();
  const residN = new Map<number, number>();
  for (const t of transitions) {
    if (t.fromStageId != null && t.daysInFromStage != null) {
      residSum.set(t.fromStageId, (residSum.get(t.fromStageId) ?? 0) + t.daysInFromStage);
      residN.set(t.fromStageId, (residN.get(t.fromStageId) ?? 0) + 1);
    }
  }

  return active.map((stage, i) => {
    const inStage = deals.filter((d) => d.stageId === stage.id);
    const next = active[i + 1];
    // Use transition-derived entry count only (no inStage.length fallback) so that
    // convToNextPct is null — not a misleading 0% — when there is no transition history.
    const enteredThis = enteredCount.get(stage.id);
    const enteredNext = next ? (enteredCount.get(next.id) ?? 0) : null;
    const n = residN.get(stage.id) ?? 0;
    return {
      stageId: stage.id,
      stageName: stage.name,
      dealCount: inStage.length,
      totalValue: inStage.reduce((s, d) => s + d.tcv, 0),
      convToNextPct:
        enteredThis != null && enteredThis > 0 && enteredNext != null
          ? round1((enteredNext / enteredThis) * 100)
          : null,
      avgDaysInStage: n > 0 ? Math.round((residSum.get(stage.id) ?? 0) / n) : null,
      pctOfPipeline: round1((inStage.reduce((s, d) => s + d.tcv, 0) / totalValue) * 100),
    };
  });
}

function round1(n: number): number {
  return Math.round(n * 10) / 10;
}

// ---------------------------------------------------------------------------
// Task 3: computeConversionMatrix
// ---------------------------------------------------------------------------

export interface MatrixCell {
  fromId: number;
  toId: number;
  rate: number;
  n: number;
  kind: "win" | "forward" | "stagnation" | "regression" | "loss";
  significant: boolean;
}

export function computeConversionMatrix(
  transitions: TransitionRec[],
  stages: StageDef[],
  windowDays: number,
  nowISO: string,
): MatrixCell[][] {
  const ordered = [...stages].sort((a, b) => a.sortOrder - b.sortOrder);
  const cutoff = new Date(nowISO).getTime() - windowDays * 86_400_000;
  const inWindow = transitions.filter(
    (t) => t.fromStageId != null && t.toStageId != null && new Date(t.transitionedAt).getTime() >= cutoff,
  );
  const orderById = new Map(ordered.map((s) => [s.id, s.sortOrder]));

  // Outgoing totals per from-stage (denominator).
  const outTotal = new Map<number, number>();
  for (const t of inWindow) outTotal.set(t.fromStageId!, (outTotal.get(t.fromStageId!) ?? 0) + 1);

  // Portfolio-wide forward rate baseline for significance.
  const fwdN = inWindow.filter((t) => (orderById.get(t.toStageId!) ?? 0) > (orderById.get(t.fromStageId!) ?? 0)).length;
  const baseline = inWindow.length > 0 ? fwdN / inWindow.length : 0;

  return ordered.map((from) =>
    ordered.map((to) => {
      const n = inWindow.filter((t) => t.fromStageId === from.id && t.toStageId === to.id).length;
      const denom = outTotal.get(from.id) ?? 0;
      const rate = denom > 0 ? round1((n / denom) * 100) : 0;
      // Terminal outcomes are decided first — a move into Closed-Won/Closed-Lost
      // is a win/loss regardless of sortOrder. Only non-terminal destinations
      // fall back to comparing sortOrder (stagnation/forward/regression). This
      // is what keeps a loss from being misread as "forward" just because the
      // Closed-Lost stage happens to sort after every real stage.
      const kind: MatrixCell["kind"] =
        to.terminal === "won"
          ? "win"
          : to.terminal === "lost"
            ? "loss"
            : to.sortOrder === from.sortOrder
              ? "stagnation"
              : to.sortOrder > from.sortOrder
                ? "forward"
                : "regression";
      return { fromId: from.id, toId: to.id, rate, n, kind, significant: zTestSignificant(n, denom, baseline) };
    }),
  );
}

// Two-proportion z-test vs portfolio baseline; |z| > 1.96 ≈ p < 0.05.
function zTestSignificant(successes: number, n: number, baseline: number): boolean {
  if (n < 10 || baseline <= 0 || baseline >= 1) return false;
  const p = successes / n;
  const se = Math.sqrt((baseline * (1 - baseline)) / n);
  if (se === 0) return false;
  return Math.abs((p - baseline) / se) > 1.96;
}

// ---------------------------------------------------------------------------
// Task 4: computeSankeyFlows
// ---------------------------------------------------------------------------

export interface SankeyNode { id: string; label: string }
export interface SankeyLink { source: string; target: string; value: number }

export function computeSankeyFlows(
  transitions: TransitionRec[],
  stages: StageDef[],
  mode: "count" | "value",
): { nodes: SankeyNode[]; links: SankeyLink[] } {
  const nameById = new Map(stages.map((s) => [s.id, s.name]));
  const linkMap = new Map<string, number>();
  const usedNodes = new Set<number>();

  for (const t of transitions) {
    if (t.fromStageId == null || t.toStageId == null) continue;
    const key = `${t.fromStageId}→${t.toStageId}`;
    linkMap.set(key, (linkMap.get(key) ?? 0) + (mode === "value" ? t.tcv : 1));
    usedNodes.add(t.fromStageId);
    usedNodes.add(t.toStageId);
  }

  const nodes: SankeyNode[] = [...usedNodes]
    .sort((a, b) => a - b)
    .map((id) => ({ id: String(id), label: nameById.get(id) ?? `Stage ${id}` }));
  const links: SankeyLink[] = [...linkMap.entries()].map(([key, value]) => {
    const [source, target] = key.split("→");
    return { source, target, value: Math.round(value) };
  });
  return { nodes, links };
}

// ---------------------------------------------------------------------------
// Task 4b: computeTransitionBreakdown
// ---------------------------------------------------------------------------

export interface BreakdownBucket { count: number; value: number }
export interface TransitionBreakdown {
  advance: BreakdownBucket;
  recycle: BreakdownBucket;
  won: BreakdownBucket;
  lost: BreakdownBucket;
}

// Classifies every transition into one of four plain-language buckets using
// the already-computed TransitionType (forward -> advance, backward ->
// recycle, exit_won -> won, exit_lost -> lost). "create" transitions (a deal
// entering the pipeline, not moving between stages) are excluded. This is the
// data behind the Stage Transitions breakdown panel — it complements the
// Sankey (which only shows forward progression) by accounting for every
// transition, including the recycled/won/lost ones the Sankey omits.
export function computeTransitionBreakdown(transitions: TransitionRec[]): TransitionBreakdown {
  const bucket = (): BreakdownBucket => ({ count: 0, value: 0 });
  const out: TransitionBreakdown = { advance: bucket(), recycle: bucket(), won: bucket(), lost: bucket() };
  for (const t of transitions) {
    const key: keyof TransitionBreakdown | null =
      t.transitionType === "forward"
        ? "advance"
        : t.transitionType === "backward"
          ? "recycle"
          : t.transitionType === "exit_won"
            ? "won"
            : t.transitionType === "exit_lost"
              ? "lost"
              : null;
    if (key == null) continue;
    out[key].count += 1;
    out[key].value += t.tcv;
  }
  for (const k of Object.keys(out) as (keyof TransitionBreakdown)[]) out[k].value = Math.round(out[k].value);
  return out;
}

// ---------------------------------------------------------------------------
// Task 5: computeRecycleExit
// ---------------------------------------------------------------------------

// "created"/"won"/"lost" are signed deltas that bridge to the ending open
// value; "ending" is the resulting running total, not a delta, so the UI
// renders it as a neutral subtotal rather than a +/- change.
export interface WaterfallStep { label: string; delta: number; kind: "created" | "won" | "lost" | "ending" }
export interface RecycleExit {
  overallRecycleRate: number;
  recycledDealCount: number;
  recycledValue: number;
  recycleRateByStage: Record<number, number>;
  // Combined (won+lost) exit rate by stage, kept for callers that don't need
  // the won/lost split.
  exitRateByStage: Record<number, number>;
  exitWonRateByStage: Record<number, number>;
  exitLostRateByStage: Record<number, number>;
  recycleCountDistribution: Record<number, number>;
  waterfall: WaterfallStep[];
}

export function computeRecycleExit(transitions: TransitionRec[], stages: StageDef[]): RecycleExit {
  const dealIds = new Set(transitions.map((t) => t.dealId));
  const totalDeals = dealIds.size || 1;

  // Per-deal backward count.
  const backByDeal = new Map<string, number>();
  for (const t of transitions) {
    if (t.transitionType === "backward") backByDeal.set(t.dealId, (backByDeal.get(t.dealId) ?? 0) + 1);
  }
  const recycledDeals = [...backByDeal.values()].filter((c) => c > 0).length;
  const recycleCountDistribution: Record<number, number> = {};
  for (const c of backByDeal.values()) recycleCountDistribution[c] = (recycleCountDistribution[c] ?? 0) + 1;
  const recycledValue = transitions
    .filter((t) => t.transitionType === "backward")
    .reduce((s, t) => s + t.tcv, 0);

  // Recycle/exit rate by stage = (backward|exit from stage) / (entered stage).
  const enteredByStage = new Map<number, number>();
  const backFromStage = new Map<number, number>();
  const exitFromStage = new Map<number, number>();
  const exitWonFromStage = new Map<number, number>();
  const exitLostFromStage = new Map<number, number>();
  for (const t of transitions) {
    if (t.toStageId != null) enteredByStage.set(t.toStageId, (enteredByStage.get(t.toStageId) ?? 0) + 1);
    if (t.fromStageId != null && t.transitionType === "backward")
      backFromStage.set(t.fromStageId, (backFromStage.get(t.fromStageId) ?? 0) + 1);
    if (t.fromStageId != null && (t.transitionType === "exit_won" || t.transitionType === "exit_lost"))
      exitFromStage.set(t.fromStageId, (exitFromStage.get(t.fromStageId) ?? 0) + 1);
    if (t.fromStageId != null && t.transitionType === "exit_won")
      exitWonFromStage.set(t.fromStageId, (exitWonFromStage.get(t.fromStageId) ?? 0) + 1);
    if (t.fromStageId != null && t.transitionType === "exit_lost")
      exitLostFromStage.set(t.fromStageId, (exitLostFromStage.get(t.fromStageId) ?? 0) + 1);
  }
  const recycleRateByStage: Record<number, number> = {};
  const exitRateByStage: Record<number, number> = {};
  const exitWonRateByStage: Record<number, number> = {};
  const exitLostRateByStage: Record<number, number> = {};
  for (const s of stages) {
    const entered = enteredByStage.get(s.id) ?? 0;
    recycleRateByStage[s.id] = entered > 0 ? round1(((backFromStage.get(s.id) ?? 0) / entered) * 100) : 0;
    exitRateByStage[s.id] = entered > 0 ? round1(((exitFromStage.get(s.id) ?? 0) / entered) * 100) : 0;
    exitWonRateByStage[s.id] = entered > 0 ? round1(((exitWonFromStage.get(s.id) ?? 0) / entered) * 100) : 0;
    exitLostRateByStage[s.id] = entered > 0 ? round1(((exitLostFromStage.get(s.id) ?? 0) / entered) * 100) : 0;
  }

  // Value bridge: Created (+) -> Won (−) -> Lost (−) -> Still open (running
  // total). Recycling is deal churn *within* the pipeline, not a value entry
  // or exit, so it's surfaced separately (recycledDealCount/recycledValue)
  // rather than as a waterfall step.
  const created = transitions.filter((t) => t.transitionType === "create").reduce((s, t) => s + t.tcv, 0);
  const won = transitions.filter((t) => t.transitionType === "exit_won").reduce((s, t) => s + t.tcv, 0);
  const lost = transitions.filter((t) => t.transitionType === "exit_lost").reduce((s, t) => s + t.tcv, 0);
  const stillOpen = Math.max(0, created - won - lost);
  const waterfall: WaterfallStep[] = [
    { label: "Created", delta: Math.round(created), kind: "created" },
    { label: "Won", delta: -Math.round(won), kind: "won" },
    { label: "Lost", delta: -Math.round(lost), kind: "lost" },
    { label: "Still open", delta: Math.round(stillOpen), kind: "ending" },
  ];

  return {
    overallRecycleRate: round1((recycledDeals / totalDeals) * 100),
    recycledDealCount: recycledDeals,
    recycledValue: Math.round(recycledValue),
    recycleRateByStage,
    exitRateByStage,
    exitWonRateByStage,
    exitLostRateByStage,
    recycleCountDistribution,
    waterfall,
  };
}

// ---------------------------------------------------------------------------
// Task 6: computeCoverage
// ---------------------------------------------------------------------------

export interface CoverageRatios {
  total: number | null;
  qualified: number | null;
  weighted: number | null;
  aiAdjusted: number | null;
  netNew: number | null;
  caveats: string[];
}

export function computeCoverage(
  deals: OpenDeal[],
  stages: StageDef[],
  target: number | null,
  periodStartISO: string,
): CoverageRatios {
  if (!target || target <= 0) {
    return { total: null, qualified: null, weighted: null, aiAdjusted: null, netNew: null, caveats: ["No target set for the active period."] };
  }
  const terminalIds = new Set(stages.filter((s) => s.terminal).map((s) => s.id));
  const open = deals.filter((d) => !terminalIds.has(d.stageId));
  const discoveryOrder = Math.min(...stages.map((s) => s.sortOrder));
  const orderById = new Map(stages.map((s) => [s.id, s.sortOrder]));

  const total = open.reduce((s, d) => s + d.tcv, 0);
  const qualified = open
    .filter((d) => (orderById.get(d.stageId) ?? 0) > discoveryOrder)
    .reduce((s, d) => s + d.tcv, 0);

  const caveats: string[] = [];
  const withProb = open.filter((d) => d.winProbabilityPct != null);
  if (withProb.length < open.length) caveats.push(`${open.length - withProb.length} deal(s) excluded from weighted coverage (no win probability).`);
  const weighted = withProb.reduce((s, d) => s + d.tcv * (d.winProbabilityPct! / 100), 0);

  const withAi = open.filter((d) => d.aiWinProbability != null);
  if (withAi.length < open.length) caveats.push(`${open.length - withAi.length} deal(s) excluded from AI-adjusted coverage (not scored).`);
  const aiAdjusted = withAi.reduce((s, d) => s + d.tcv * d.aiWinProbability!, 0);

  const periodStart = new Date(periodStartISO).getTime();
  const netNewValue = open.filter((d) => new Date(d.landedAt ?? d.createdAt).getTime() >= periodStart).reduce((s, d) => s + d.tcv, 0);
  const gap = Math.max(0, target - weighted);

  return {
    total: round2(total / target),
    qualified: round2(qualified / target),
    weighted: round2(weighted / target),
    aiAdjusted: round2(aiAdjusted / target),
    netNew: gap > 0 ? round2(netNewValue / gap) : null,
    caveats,
  };
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

// ---------------------------------------------------------------------------
// Task 7: computeHealthScore
// ---------------------------------------------------------------------------

export interface HealthInputs {
  coverageQualified: number | null;
  velocityIndex: number; // lower is better
  winRate: number;
  generationRatio: number | null;
  agingScore: number; // lower is better
  retentionRate: number;
}
export interface HealthHistory {
  coverage: number[]; velocity: number[]; conversion: number[];
  generation: number[]; age: number[]; attrition: number[];
}
export interface HealthWeights {
  coverage: number; velocity: number; conversion: number;
  generation: number; age: number; attrition: number;
}
export const DEFAULT_HEALTH_WEIGHTS: HealthWeights = {
  coverage: 1 / 6, velocity: 1 / 6, conversion: 1 / 6, generation: 1 / 6, age: 1 / 6, attrition: 1 / 6,
};
export interface HealthScore {
  score: number;
  subScores: Record<keyof HealthWeights, number | null>;
}

// Percentile rank of value within history → 0..100. invert: lower raw is better.
function percentileRank(value: number | null, history: number[], invert = false): number | null {
  if (value == null) return null;
  if (history.length === 0) return 50; // neutral when no baseline
  const below = history.filter((h) => h <= value).length;
  let pct = (below / history.length) * 100;
  if (invert) pct = 100 - pct;
  return Math.round(Math.max(0, Math.min(100, pct)));
}

export function computeHealthScore(
  inputs: HealthInputs,
  history: HealthHistory,
  weights: HealthWeights = DEFAULT_HEALTH_WEIGHTS,
): HealthScore {
  const subScores: Record<keyof HealthWeights, number | null> = {
    coverage: percentileRank(inputs.coverageQualified, history.coverage),
    velocity: percentileRank(inputs.velocityIndex, history.velocity, true),
    conversion: percentileRank(inputs.winRate, history.conversion),
    generation: percentileRank(inputs.generationRatio, history.generation),
    age: percentileRank(inputs.agingScore, history.age, true),
    attrition: percentileRank(inputs.retentionRate, history.attrition),
  };
  // Weighted mean over available (non-null) sub-scores; re-normalize weights.
  let wSum = 0;
  let acc = 0;
  for (const k of Object.keys(weights) as (keyof HealthWeights)[]) {
    const s = subScores[k];
    if (s != null) {
      acc += weights[k] * s;
      wSum += weights[k];
    }
  }
  const score = wSum > 0 ? Math.round(acc / wSum) : 0;
  return { score, subScores };
}

// ---------------------------------------------------------------------------
// Task 7b: scoreHealthAbsolute
// ---------------------------------------------------------------------------
//
// computeHealthScore above is relative — it percentile-ranks today's value
// against accrued history, and returns a neutral 50 for every dimension until
// that history exists (see percentileRank). For a single-tenant cockpit that
// starves the Pipeline Pulse widget of any real signal from day one — every
// sub-score, and therefore the composite, sits at exactly 50 forever unless
// history is separately wired in.
//
// scoreHealthAbsolute instead scores each dimension against a fixed,
// documented benchmark curve (no historical baseline required), so the score
// is meaningful immediately and the same curve doubles as the "how is this
// calculated" copy shown in the UI's info hints.

// A benchmark is a linear ramp from (floorValue -> floorScore) to
// (ceilValue -> ceilScore), clamped at both ends. For "lower is better"
// metrics (e.g. velocity, age) floorScore is the higher number and
// floorValue < ceilValue still holds — the ramp direction is encoded by
// which score is higher, not by value ordering.
export interface HealthBenchmark {
  floorValue: number;
  floorScore: number;
  ceilValue: number;
  ceilScore: number;
}
export type HealthBenchmarks = Record<keyof HealthWeights, HealthBenchmark>;

export const DEFAULT_HEALTH_BENCHMARKS: HealthBenchmarks = {
  // Qualified pipeline coverage ratio (qualified value / target). 0x -> 0, 3x+ -> 100.
  coverage: { floorValue: 0, floorScore: 0, ceilValue: 3, ceilScore: 100 },
  // Average stage residence in days (lower is better). <=30d -> 100, >=120d -> 0.
  velocity: { floorValue: 30, floorScore: 100, ceilValue: 120, ceilScore: 0 },
  // Win rate, 0..1. 0% -> 0, 40%+ -> 100.
  conversion: { floorValue: 0, floorScore: 0, ceilValue: 0.4, ceilScore: 100 },
  // Net-new value as a ratio of the remaining coverage gap. 0x -> 0, 1x+ (gap fully backfilled) -> 100.
  generation: { floorValue: 0, floorScore: 0, ceilValue: 1, ceilScore: 100 },
  // Share of open deals running >1.5x their stage's median residence (lower is better). 0% -> 100, 50%+ -> 0.
  age: { floorValue: 0, floorScore: 100, ceilValue: 0.5, ceilScore: 0 },
  // Retention rate = 1 - recycle rate, 0..1. <=50% -> 0, 100% -> 100.
  attrition: { floorValue: 0.5, floorScore: 0, ceilValue: 1, ceilScore: 100 },
};

function scoreAgainstBenchmark(value: number | null, b: HealthBenchmark): number | null {
  if (value == null) return null;
  const { floorValue, floorScore, ceilValue, ceilScore } = b;
  if (floorValue === ceilValue) return floorScore;
  const t = (value - floorValue) / (ceilValue - floorValue);
  const clamped = Math.max(0, Math.min(1, t));
  return Math.round(floorScore + clamped * (ceilScore - floorScore));
}

export function scoreHealthAbsolute(
  inputs: HealthInputs,
  benchmarks: HealthBenchmarks = DEFAULT_HEALTH_BENCHMARKS,
  weights: HealthWeights = DEFAULT_HEALTH_WEIGHTS,
): HealthScore {
  const subScores: Record<keyof HealthWeights, number | null> = {
    coverage: scoreAgainstBenchmark(inputs.coverageQualified, benchmarks.coverage),
    velocity: scoreAgainstBenchmark(inputs.velocityIndex, benchmarks.velocity),
    conversion: scoreAgainstBenchmark(inputs.winRate, benchmarks.conversion),
    generation: scoreAgainstBenchmark(inputs.generationRatio, benchmarks.generation),
    age: scoreAgainstBenchmark(inputs.agingScore, benchmarks.age),
    attrition: scoreAgainstBenchmark(inputs.retentionRate, benchmarks.attrition),
  };
  // Weighted mean over available (non-null) sub-scores; re-normalize weights
  // (identical aggregation rule to computeHealthScore, just fed by absolute
  // sub-scores instead of percentile ranks).
  let wSum = 0;
  let acc = 0;
  for (const k of Object.keys(weights) as (keyof HealthWeights)[]) {
    const s = subScores[k];
    if (s != null) {
      acc += weights[k] * s;
      wSum += weights[k];
    }
  }
  const score = wSum > 0 ? Math.round(acc / wSum) : 0;
  return { score, subScores };
}
