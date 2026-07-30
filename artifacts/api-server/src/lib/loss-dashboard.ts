// Closed-Lost Autopsy: Loss Dashboard metrics (pure, DB-free — the route
// supplies the rows). Mirrors the product-gaps.ts / memory-health.ts
// convention: a pure compute function the route thinly wraps, so the metric
// logic unit-tests without seeding a database.

export interface LossDashboardRow {
  /** Term-aware TCV (deal-filters.ts termAwareTcv), not a flat product+services sum. */
  tcv: number;
  primaryLossCategory: string | null;
  autopsyCompletedAt: Date | string | null;
  qualityScore: number | null;
}

export interface CategoryComposition {
  category: string;
  count: number;
  value: number;
}

export interface LossDashboardMetrics {
  lossPulse: number | null;
  lossPulseComponents: {
    autopsyCompletenessPct: number;
    avgQualityScore: number | null;
    lossRatePct: number | null;
  };
  volume: { lossCount: number; lossValue: number };
  compositionByCategory: CategoryComposition[];
}

/**
 * `rows` is the Closed-Lost stage cohort (the canonical loss ledger — NOT
 * `deal_memory.outcome`, which can lag if the post-mortem subscriber missed a
 * row), each left-joined with its deal_memory enrichment. `wonCount` is the
 * Closed-Won count from the same stage-based query, for the loss rate.
 */
export function computeLossDashboardMetrics(
  rows: LossDashboardRow[],
  wonCount: number,
): LossDashboardMetrics {
  const lossCount = rows.length;
  const lossValue = rows.reduce((s, r) => s + r.tcv, 0);

  const byCategory = new Map<string, { count: number; value: number }>();
  for (const r of rows) {
    const cat = r.primaryLossCategory ?? "uncategorized";
    const cur = byCategory.get(cat) ?? { count: 0, value: 0 };
    cur.count++;
    cur.value += r.tcv;
    byCategory.set(cat, cur);
  }
  const compositionByCategory = [...byCategory.entries()]
    .map(([category, v]) => ({ category, count: v.count, value: v.value }))
    .sort((a, b) => b.value - a.value);

  const completed = rows.filter((r) => r.autopsyCompletedAt != null);
  const autopsyCompletenessPct = lossCount > 0 ? Math.round((completed.length / lossCount) * 100) : 0;
  // Average only rows that actually HAVE a quality score — a completed
  // autopsy with no score used to fold in as 0 and drag the mean down.
  const scored = completed.filter((r) => r.qualityScore != null);
  const avgQualityScore =
    scored.length > 0
      ? Math.round(scored.reduce((s, r) => s + (r.qualityScore ?? 0), 0) / scored.length)
      : null;
  const decided = lossCount + wonCount;
  const lossRatePct = decided > 0 ? Math.round((lossCount / decided) * 100) : null;

  // Loss Pulse measures "are we learning from losses" — completeness and
  // quality of the autopsy record — NOT win/loss rate, which used to be
  // folded into the same composite (a spotless, loss-free pipeline scored a
  // misleading 50 instead of "nothing to measure yet"). lossRatePct is still
  // returned in lossPulseComponents for display, just not averaged in.
  const pulseComponents = [autopsyCompletenessPct, avgQualityScore].filter(
    (c): c is number => c != null,
  );
  const lossPulse =
    lossCount === 0 || pulseComponents.length === 0
      ? null
      : Math.round(pulseComponents.reduce((s, c) => s + c, 0) / pulseComponents.length);

  return {
    lossPulse,
    lossPulseComponents: { autopsyCompletenessPct, avgQualityScore, lossRatePct },
    volume: { lossCount, lossValue },
    compositionByCategory,
  };
}
