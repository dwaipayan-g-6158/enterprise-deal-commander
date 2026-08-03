/**
 * Shared "days in stage vs. benchmark" math for /analytics/velocity and
 * /analytics/flow/health-score's aging dimension — pulled out so both
 * routes score deals the same way instead of /analytics/velocity computing
 * its own median-by-stage inline while health-score duplicated an almost
 * identical loop (routes/v2/analytics.ts, previously ~L1573-1592).
 *
 * Two things this fixes that the original inline versions got wrong:
 *
 * 1. Self-referential benchmark: the original median included the deal
 *    being scored in its own comparison set, so a stage with exactly one
 *    open deal made that deal's benchmark EQUAL to itself ("exactly at
 *    benchmark") — contradicting the UI tooltip's own promise ("median
 *    across OTHER open deals"). This computes a leave-one-out median: each
 *    deal is compared against the other deals in its stage, never itself.
 *    A stage where a deal is the ONLY one open returns benchmarkDays: null
 *    (not a misleading 0 or a self-fulfilling match).
 *
 * 2. Closed-stage pollution: callers are responsible for passing only OPEN
 *    deals (see CLOSED_STAGES in deal-filters.ts) — this module has no
 *    opinion on that, it just computes medians over whatever rows it's
 *    given.
 */

export interface VelocityInput {
  id: string;
  stageName: string;
  daysInStage: number;
}

export interface VelocityRow extends VelocityInput {
  benchmarkDays: number | null;
  deltaDays: number | null;
  velocity: "SLOW" | "FAST" | "NORMAL" | "INSUFFICIENT_DATA";
  /** How many OTHER open deals in this stage contributed to benchmarkDays. */
  benchmarkSampleSize: number;
}

function medianOf(xs: number[]): number {
  const s = [...xs].sort((a, b) => a - b);
  return s[Math.floor(s.length / 2)];
}

export function computeVelocityRows(rows: VelocityInput[]): VelocityRow[] {
  const daysByStage = new Map<string, number[]>();
  for (const r of rows) {
    const arr = daysByStage.get(r.stageName) ?? [];
    arr.push(r.daysInStage);
    daysByStage.set(r.stageName, arr);
  }

  return rows.map((r) => {
    const pool = daysByStage.get(r.stageName) ?? [];
    // Remove exactly ONE occurrence of this deal's own value — not every
    // occurrence — so two different deals that happen to share the same
    // daysInStage (e.g. both at 13 days) each still compare against the
    // other's value instead of excluding both of them.
    const selfIdx = pool.indexOf(r.daysInStage);
    const others = selfIdx === -1 ? pool : [...pool.slice(0, selfIdx), ...pool.slice(selfIdx + 1)];

    if (others.length === 0) {
      return {
        ...r,
        benchmarkDays: null,
        deltaDays: null,
        velocity: "INSUFFICIENT_DATA",
        benchmarkSampleSize: 0,
      };
    }

    const benchmarkDays = medianOf(others);
    // A zero median is not a usable benchmark for a RATIO test: the bands below
    // collapse (0 * 1.5 === 0), so every deal with even one day in stage would
    // be flagged SLOW. A 0 median means every other open deal in this stage
    // entered today — there is genuinely no track record to compare against
    // yet, which is the same "no usable benchmark" case as others.length === 0
    // above, so it reports identically rather than inventing an absolute
    // day-count threshold this module has no basis to pick.
    if (benchmarkDays === 0) {
      return {
        ...r,
        benchmarkDays: null,
        deltaDays: null,
        velocity: "INSUFFICIENT_DATA",
        benchmarkSampleSize: others.length,
      };
    }

    const deltaDays = r.daysInStage - benchmarkDays;
    const velocity: VelocityRow["velocity"] =
      r.daysInStage > benchmarkDays * 1.5 ? "SLOW" : r.daysInStage < benchmarkDays * 0.5 ? "FAST" : "NORMAL";
    return { ...r, benchmarkDays, deltaDays, velocity, benchmarkSampleSize: others.length };
  });
}
