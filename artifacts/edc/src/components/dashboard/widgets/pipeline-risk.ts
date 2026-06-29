// Pipeline Risk — pure aggregation helpers.
// IMPORTANT: No `@/` alias imports — this file must be node-testable via
// vitest without a Vite resolve step. RiskLevel is re-declared locally to
// match risk-model.ts exactly; if that union ever changes, update here too.

// ---------------------------------------------------------------------------
// Types (kept local to stay alias-free)
// ---------------------------------------------------------------------------

/** Must match RiskLevel in cockpit/risk/risk-model.ts exactly. */
export type RiskLevel = "LOW" | "MODERATE" | "ELEVATED" | "HIGH";

export interface PipelineRiskRow {
  id: string;
  name: string;
  tcv: number;
  riskScore: number | null;
  riskLevel: RiskLevel | null;
}

export interface LevelBucket {
  count: number;
  tcv: number;
}

/** The four buckets we always report (even when count = 0). */
const ALL_LEVELS: RiskLevel[] = ["HIGH", "ELEVATED", "MODERATE", "LOW"];

// ---------------------------------------------------------------------------
// Pure helpers
// ---------------------------------------------------------------------------

/**
 * Groups rows with a non-null riskLevel into buckets; sums TCV per bucket.
 * Rows with null riskLevel are skipped entirely.
 */
export function bucketDealsByLevel(
  rows: PipelineRiskRow[],
): Record<RiskLevel, LevelBucket> {
  const empty = (): LevelBucket => ({ count: 0, tcv: 0 });
  const result: Record<RiskLevel, LevelBucket> = {
    HIGH: empty(),
    ELEVATED: empty(),
    MODERATE: empty(),
    LOW: empty(),
  };
  for (const row of rows) {
    if (row.riskLevel == null) continue;
    result[row.riskLevel].count += 1;
    result[row.riskLevel].tcv += row.tcv;
  }
  return result;
}

/**
 * Mean of non-null riskScores. Returns null when no rows have a score.
 */
export function averageScore(rows: PipelineRiskRow[]): number | null {
  const scored = rows.filter((r) => r.riskScore != null);
  if (scored.length === 0) return null;
  const sum = scored.reduce((acc, r) => acc + (r.riskScore as number), 0);
  return sum / scored.length;
}

/**
 * The row with the highest riskScore. Ties → first encountered.
 * Returns null when no rows have a score.
 */
export function pickHighestRisk(rows: PipelineRiskRow[]): PipelineRiskRow | null {
  let best: PipelineRiskRow | null = null;
  for (const row of rows) {
    if (row.riskScore == null) continue;
    if (best == null || row.riskScore > (best.riskScore as number)) {
      best = row;
    }
  }
  return best;
}

/**
 * A short, deterministic insight string suitable for the widget footer.
 * Based on the highest-populated high-end bucket relative to the average score.
 */
export function buildInsight(
  buckets: Record<RiskLevel, LevelBucket>,
  avgScore: number | null,
): string {
  const total = ALL_LEVELS.reduce((s, l) => s + buckets[l].count, 0);
  if (total === 0) return "No scored deals in the active pipeline.";

  // Find the top high-end bucket (HIGH first, then ELEVATED)
  const highCount = buckets.HIGH.count + buckets.ELEVATED.count;
  if (highCount > 0) {
    const verb = highCount === 1 ? "is" : "are";
    const dealWord = highCount === 1 ? "deal" : "deals";
    if (avgScore != null) {
      const rounded = Math.round(avgScore);
      return `${highCount} ${dealWord} ${verb} High or Elevated risk — average pipeline risk score is ${rounded}.`;
    }
    return `${highCount} ${dealWord} ${verb} High or Elevated risk across the active pipeline.`;
  }

  // All moderate or low
  const modCount = buckets.MODERATE.count;
  if (modCount > 0) {
    const dealWord = `${modCount} deal${modCount === 1 ? "" : "s"}`;
    if (avgScore != null) {
      const rounded = Math.round(avgScore);
      return `${dealWord} at Moderate risk — average score ${rounded}. No High or Elevated deals.`;
    }
    return `${dealWord} at Moderate risk. No High or Elevated deals.`;
  }

  return "All scored deals are Low risk — pipeline is in good shape.";
}
