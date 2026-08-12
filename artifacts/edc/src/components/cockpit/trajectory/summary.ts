// Relative, not the `@/` alias — the same constraint `history/adapters.ts`
// documents. These pure modules are unit-tested directly, and the alias does not
// resolve in that context.
import { HEALTH_LABEL as SHARED_HEALTH_LABEL } from "../../../lib/semantic-colors";

/**
 * What the trajectory adds up to — pure, and shared by both shells.
 *
 * Extracted from `deal-trajectory.tsx` rather than reimplemented, for the reason
 * `history/adapters.ts` was: two shells deriving "is this deal slipping?" from
 * the same payload by separate arithmetic will eventually disagree, and the one
 * that disagrees is the one nobody is looking at. The desktop panel had the
 * verdict, the KPI deltas and the stage rail; mobile drew three charts and left
 * the reader to conclude.
 *
 * No React and no recharts here on purpose. `deal-trajectory.tsx` imports
 * recharts, and `mobile/deps.test.ts` bans it from the mobile chunk
 * transitively — so this has to be a module the chart file imports, never the
 * other way round.
 */

export type Health = "RED" | "YELLOW" | "GREEN" | null;

/** The loose analytics payload, typed once. `/v2/analytics/deals/:id/trajectory`
 *  is a GenericDataResponse in the contract, so this is a hand-declared view. */
export interface TrajectoryPoint {
  at: string;
  score: number | null;
  gatePct: number | null;
  health: Health;
  stage: string | null;
  tcv: number | null;
  playbookPct: number | null;
  meddpiccPct: number | null;
}

export interface StageChange {
  at: string;
  from: string | null;
  to: string | null;
}

export interface TrajectoryData {
  points: TrajectoryPoint[];
  stageChanges: StageChange[];
}

/** A point enriched with a numeric x (epoch ms) for a stable time axis. */
export interface ChartRow extends TrajectoryPoint {
  t: number;
}

export const HEALTH_LABEL: Record<NonNullable<Health>, string> = {
  RED: SHARED_HEALTH_LABEL.RED,
  YELLOW: SHARED_HEALTH_LABEL.YELLOW,
  GREEN: SHARED_HEALTH_LABEL.GREEN,
};

export const HEALTH_RANK: Record<NonNullable<Health>, number> = {
  RED: 0,
  YELLOW: 1,
  GREEN: 2,
};

export const dayCount = (a: number, b: number) =>
  Math.max(1, Math.round((b - a) / 86_400_000) + 1);

/** Rows sorted ascending with an epoch-ms x, dropping unparseable timestamps. */
export function toChartRows(points: TrajectoryPoint[]): ChartRow[] {
  return points
    .map((p) => ({ ...p, t: new Date(p.at).getTime() }))
    .filter((r) => Number.isFinite(r.t))
    .sort((a, b) => a.t - b.t);
}

export function firstLast<T>(
  rows: ChartRow[],
  pick: (r: ChartRow) => T | null | undefined,
): { first: T | null; last: T | null } {
  let first: T | null = null;
  let last: T | null = null;
  for (const r of rows) {
    const v = pick(r);
    if (v != null) {
      if (first == null) first = v;
      last = v;
    }
  }
  return { first, last };
}

export interface Summary {
  score: { first: number | null; last: number | null };
  gate: { first: number | null; last: number | null };
  tcv: { first: number | null; last: number | null };
  health: { first: Health; last: Health };
  healthTrend: "improved" | "worsened" | "flat";
  stage: string | null;
  spanStart: number;
  spanEnd: number;
  spanDays: number;
}

/**
 * Baseline (first non-null) → current (last non-null) per metric.
 *
 * First NON-NULL rather than first row: the endpoint carries each metric forward
 * across an axis built from two independent series, so a leading null means
 * "not measured yet", not "was zero".
 */
export function deriveSummary(rows: ChartRow[], now: number = Date.now()): Summary {
  const score = firstLast(rows, (r) => r.score);
  const gate = firstLast(rows, (r) => r.gatePct);
  const tcv = firstLast(rows, (r) => r.tcv);
  const healthFL = firstLast<NonNullable<Health>>(rows, (r) => r.health);
  const stage = firstLast(rows, (r) => r.stage);

  let healthTrend: Summary["healthTrend"] = "flat";
  if (healthFL.first && healthFL.last) {
    const d = HEALTH_RANK[healthFL.last] - HEALTH_RANK[healthFL.first];
    healthTrend = d > 0 ? "improved" : d < 0 ? "worsened" : "flat";
  }

  const spanStart = rows[0]?.t ?? now;
  const spanEnd = rows[rows.length - 1]?.t ?? now;

  return {
    score,
    gate,
    tcv,
    health: { first: healthFL.first, last: healthFL.last },
    healthTrend,
    stage: stage.last,
    spanStart,
    spanEnd,
    spanDays: dayCount(spanStart, spanEnd),
  };
}

export type Tone = "good" | "warn" | "bad";

export interface Verdict {
  /** Kept separate from `rest` so a caller can colour-emphasise just this. */
  lead: string;
  tone: Tone;
  rest: string;
}

/** Points of score movement that count as a real move rather than noise. */
const MATERIAL_SCORE_DELTA = 5;

/**
 * A deterministic plain-language headline. No LLM, and no randomness — the same
 * payload must always produce the same sentence.
 */
export function verdict(s: Summary): Verdict {
  const scoreDelta =
    s.score.first != null && s.score.last != null ? s.score.last - s.score.first : 0;
  const stage = s.stage ?? "this stage";

  // Slipping — score fell meaningfully, or health worsened.
  if (scoreDelta <= -MATERIAL_SCORE_DELTA || s.healthTrend === "worsened") {
    if (s.healthTrend === "worsened" && s.health.last) {
      const drop = scoreDelta < 0 ? `score down ${Math.abs(scoreDelta)} pts, ` : "";
      return {
        lead: "Slipping",
        tone: "bad",
        rest: ` — ${drop}health fell to ${HEALTH_LABEL[s.health.last]}.`,
      };
    }
    return {
      lead: "Slipping",
      tone: "bad",
      rest: ` — score down ${Math.abs(scoreDelta)} pts in ${stage}.`,
    };
  }

  // Climbing — score rose meaningfully, or health improved.
  if (scoreDelta >= MATERIAL_SCORE_DELTA || s.healthTrend === "improved") {
    const advanced = s.stage ? ` as the deal advanced into ${stage}` : "";
    if (scoreDelta >= MATERIAL_SCORE_DELTA) {
      return {
        lead: "Climbing",
        tone: "good",
        rest: ` — score up ${scoreDelta} pts${advanced}.`,
      };
    }
    return {
      lead: "Climbing",
      tone: "good",
      rest:
        s.healthTrend === "improved" && s.health.last
          ? ` — health improved to ${HEALTH_LABEL[s.health.last]} in ${stage}.`
          : ` — momentum building in ${stage}.`,
    };
  }

  return {
    lead: "Stalling",
    tone: "warn",
    rest: ` — flat for ${s.spanDays} ${s.spanDays === 1 ? "day" : "days"} in ${stage}.`,
  };
}

export interface StageDuration {
  stage: string;
  days: number;
  health: Health;
  isCurrent: boolean;
}

/**
 * Contiguous runs of equal stage, with how long each lasted.
 *
 * Deliberately NOT the same computation as `stageSegments` in
 * `deal-trajectory.tsx`, which is why it does not share the name. Two
 * differences, both chosen for a phone where this is a list rather than a
 * proportional rail:
 *
 *   - The current stage is measured up to `now`, not to its last snapshot.
 *     Otherwise the stage the deal is actually sitting in always reads shorter
 *     than it is, which inverts the one signal a duration list exists to give.
 *   - A run keeps the WORST health seen during it, not the last. A stage that
 *     went red and recovered still spent time red, and that is the fact worth
 *     carrying.
 */
export function stageDurations(rows: ChartRow[], now: number = Date.now()): StageDuration[] {
  const withStage = rows.filter((r) => r.stage != null);
  if (withStage.length === 0) return [];

  const runs: { stage: string; start: number; health: Health }[] = [];
  for (const row of withStage) {
    const last = runs[runs.length - 1];
    if (!last || last.stage !== row.stage) {
      runs.push({ stage: row.stage as string, start: row.t, health: row.health });
    } else if (row.health != null) {
      // The worst health seen during the run, not the last — a stage that went
      // red and recovered still spent time red, and that is the fact worth
      // keeping in a duration rail.
      if (last.health == null || HEALTH_RANK[row.health] < HEALTH_RANK[last.health]) {
        last.health = row.health;
      }
    }
  }

  return runs.map((run, i) => {
    const end = i + 1 < runs.length ? runs[i + 1].start : now;
    return {
      stage: run.stage,
      days: dayCount(run.start, end),
      health: run.health,
      isCurrent: i === runs.length - 1,
    };
  });
}
