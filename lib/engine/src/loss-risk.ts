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
  /** 0-100: the lethality of the single most dangerous matched pattern. */
  score: number;
  matchedPatterns: LossRiskMatch[];
}

/**
 * Scores one active deal's currently-firing pattern codes against the
 * historical lethality map. Score is the lethality of the single most
 * dangerous pattern this deal shares with the lost cohort, scaled to
 * [0, 100] — i.e. "this deal carries the pattern that killed X% of past
 * losses." This is intentionally NOT a sum across matched patterns: summing
 * (even normalized) makes every deal's score shrink as the historical
 * cohort accumulates more distinct patterns, regardless of whether those
 * new patterns relate to the deal being scored. A max-of-matched score is
 * stable under cohort growth: adding an unrelated lost deal's new pattern
 * never changes an existing deal's score.
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

  matchedPatterns.sort((a, b) => b.lethality - a.lethality);
  const maxMatchedLethality = matchedPatterns[0].lethality;
  const score = Math.min(100, Math.round(maxMatchedLethality * 100));

  return { score, matchedPatterns };
}
