const DAY_MS = 86_400_000;

export interface MemoryRow {
  id: string;
  outcome: string;
  finalTcv: string | null;
  competitorsFaced: string[] | null;
  winLossNarrative: string | null;
  keyLessons: string[] | null;
  archivedAt: Date;
  autopsyCompletedAt: Date | null;
}

export interface MemoryHealth {
  totalArchived: number;
  archiveCompletenessPct: number;
  knowledgeDensity: number;
  freshnessPct: number;
  coverage: { dimension: string; value: string; count: number }[];
  decayCount: number;
}

const hasNarrative = (r: MemoryRow) => !!r.winLossNarrative && r.winLossNarrative.trim().length > 0;

export function computeMemoryHealth(rows: MemoryRow[], now: Date = new Date()): MemoryHealth {
  const total = rows.length;
  const withNarrative = rows.filter(hasNarrative).length;
  const totalLessons = rows.reduce((sum, r) => sum + (r.keyLessons?.length ?? 0), 0);

  const ninetyDaysAgo = new Date(now.getTime() - 90 * DAY_MS);
  const fresh = rows.filter((r) => {
    const latest = r.autopsyCompletedAt ?? r.archivedAt;
    return latest && new Date(latest) >= ninetyDaysAgo;
  }).length;

  const coverageMap = new Map<string, number>();
  for (const r of rows) {
    const value = r.competitorsFaced?.length ? "with competitor" : "no competitor";
    const key = `${r.outcome}::${value}`;
    coverageMap.set(key, (coverageMap.get(key) ?? 0) + 1);
  }
  const coverage = [...coverageMap.entries()].map(([key, count]) => {
    const [dimension, value] = key.split("::");
    return { dimension, value, count };
  });

  const oneEightyDaysAgo = new Date(now.getTime() - 180 * DAY_MS);
  const decayCount = rows.filter(
    (r) =>
      r.outcome === "Lost" &&
      new Date(r.archivedAt) < oneEightyDaysAgo &&
      !hasNarrative(r) &&
      !r.autopsyCompletedAt,
  ).length;

  return {
    totalArchived: total,
    archiveCompletenessPct: total ? Math.round((withNarrative / total) * 100) : 0,
    knowledgeDensity: total ? Math.round((totalLessons / total) * 10) / 10 : 0,
    freshnessPct: total ? Math.round((fresh / total) * 100) : 0,
    coverage,
    decayCount,
  };
}
