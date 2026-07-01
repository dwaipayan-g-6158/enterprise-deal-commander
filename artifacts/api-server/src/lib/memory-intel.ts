const MIN_ENCOUNTERS = 3;

export interface MemoryRow {
  id: string;
  outcome: string;
  finalTcv: string | null;
  totalDaysActive: number | null;
  competitorsFaced: string[] | null;
  pricingModel: string | null;
  servicesTier: string | null;
  primaryLossCategory: string | null;
}

export interface CompetitorIntel {
  name: string;
  encounterCount: number;
  winRatePct: number;
  topLossCategory: string | null;
  avgTcv: number;
}

export function percentiles(xs: number[]): { p25: number; median: number; p75: number; p90: number } {
  if (xs.length === 0) return { p25: 0, median: 0, p75: 0, p90: 0 };
  const s = [...xs].sort((a, b) => a - b);
  const at = (p: number) => s[Math.min(s.length - 1, Math.floor(s.length * p))];
  return { p25: at(0.25), median: at(0.5), p75: at(0.75), p90: at(0.9) };
}

export function computeCompetitorIntel(rows: MemoryRow[]): CompetitorIntel[] {
  const byCompetitor = new Map<string, MemoryRow[]>();
  for (const r of rows) {
    for (const c of r.competitorsFaced ?? []) {
      const arr = byCompetitor.get(c) ?? [];
      arr.push(r);
      byCompetitor.set(c, arr);
    }
  }

  const result: CompetitorIntel[] = [];
  for (const [name, encounters] of byCompetitor.entries()) {
    if (encounters.length < MIN_ENCOUNTERS) continue;
    const decided = encounters.filter((r) => r.outcome === "Won" || r.outcome === "Lost");
    const wins = decided.filter((r) => r.outcome === "Won").length;
    const winRatePct = decided.length ? Math.round((wins / decided.length) * 100) : 0;

    const lossCategoryCounts = new Map<string, number>();
    for (const r of encounters) {
      if (r.outcome === "Lost" && r.primaryLossCategory) {
        lossCategoryCounts.set(r.primaryLossCategory, (lossCategoryCounts.get(r.primaryLossCategory) ?? 0) + 1);
      }
    }
    let topLossCategory: string | null = null;
    let topCount = 0;
    for (const [cat, count] of lossCategoryCounts.entries()) {
      if (count > topCount) {
        topLossCategory = cat;
        topCount = count;
      }
    }

    const tcvs = encounters.map((r) => Number(r.finalTcv) || 0);
    const avgTcv = tcvs.length ? Math.round(tcvs.reduce((a, b) => a + b, 0) / tcvs.length) : 0;

    result.push({ name, encounterCount: encounters.length, winRatePct, topLossCategory, avgTcv });
  }

  return result.sort((a, b) => b.encounterCount - a.encounterCount);
}
