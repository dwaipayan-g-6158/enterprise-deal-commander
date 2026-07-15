// Pure helpers for roster enrichment score-trend computation. DB-free so they
// unit-test headless (repo pattern: memory-intel.ts). The route runs the SQL
// (latest scores, and scores as-of a cutoff) and feeds the rows through here.

export interface ScoreRow {
  dealId: string;
  score: number;
  computedAt: Date | string;
}

/**
 * Reduce score rows already ordered by computedAt DESC to the first (latest)
 * score seen per deal. Pass a list pre-filtered to `computed_at <= cutoff` to
 * get each deal's score as of that cutoff.
 */
export function pickLatestPerDeal(rows: ScoreRow[]): Map<string, number> {
  const m = new Map<string, number>();
  for (const r of rows) if (!m.has(r.dealId)) m.set(r.dealId, r.score);
  return m;
}

/** current − baseline; null when either side is missing (no trend to show). */
export function computeScoreDelta(
  current: number | null | undefined,
  baseline: number | null | undefined,
): number | null {
  if (current == null || baseline == null) return null;
  return current - baseline;
}
