// Enterprise Deal Commander — Loss-Risk Enrichment (pure, isomorphic)
//
// Cross-references the engine patterns currently firing on an ACTIVE deal
// against how often those same patterns fired on deals that were ultimately
// Closed-Lost. This is deliberately NOT a new scoring model: it complements
// the Risk Engine v2 composite score (risk-v2.ts) and the predictive
// dealScores (scoring.ts) rather than competing with them — the framing is
// "which active deals currently exhibit the patterns that killed past deals."

export interface PatternLethality {
  code: string;
  /** Share of historical lost deals on which this pattern fired, in [0, 1]. */
  lethality: number;
  lostCount: number;
}

/**
 * Reduces the firing-pattern codes of a cohort of closed-lost deals into a
 * per-pattern lethality share. One entry per pattern code that fired on at
 * least one lost deal.
 */
export function computePatternLethality(
  lostDealsAlertCodes: string[][],
): PatternLethality[] {
  const total = lostDealsAlertCodes.length;
  if (total === 0) return [];

  const counts = new Map<string, number>();
  for (const codes of lostDealsAlertCodes) {
    for (const code of new Set(codes)) {
      counts.set(code, (counts.get(code) ?? 0) + 1);
    }
  }

  return [...counts.entries()].map(([code, lostCount]) => ({
    code,
    lethality: lostCount / total,
    lostCount,
  }));
}

export interface LossRiskMatch {
  code: string;
  lethality: number;
}

export interface LossRiskResult {
  /** 0-100, normalized sum of matched historical lethalities. */
  score: number;
  matchedPatterns: LossRiskMatch[];
}

/**
 * Scores one active deal's currently-firing pattern codes against the
 * historical lethality map. Score is the sum of matched lethalities,
 * normalized against the theoretical max (every known pattern matching at
 * full lethality) and clamped to [0, 100].
 */
export function scoreLossRisk(
  activeAlertCodes: string[],
  lethality: PatternLethality[],
): LossRiskResult {
  const byCode = new Map(lethality.map((l) => [l.code, l.lethality]));

  const matchedPatterns: LossRiskMatch[] = [];
  for (const code of activeAlertCodes) {
    const matchedLethality = byCode.get(code);
    if (matchedLethality !== undefined) {
      matchedPatterns.push({ code, lethality: matchedLethality });
    }
  }

  if (matchedPatterns.length === 0) {
    return { score: 0, matchedPatterns: [] };
  }

  const matchedSum = matchedPatterns.reduce((s, m) => s + m.lethality, 0);
  const maxPossibleSum = lethality.reduce((s, l) => s + l.lethality, 0);
  const score = maxPossibleSum > 0
    ? Math.min(100, Math.round((matchedSum / maxPossibleSum) * 100))
    : 0;

  matchedPatterns.sort((a, b) => b.lethality - a.lethality);

  return { score, matchedPatterns };
}
