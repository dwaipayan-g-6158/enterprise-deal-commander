// Pure "deal revival" selection: from archived Lost deals, surface the ones
// worth re-engaging (Vivun's Deal Revival). DB-free so it unit-tests headless
// (repo pattern: memory-health.ts). The route loads deal_memory + thresholds
// and feeds rows through here.

export interface MemoryLite {
  id: string;
  dealId: string;
  accountName: string;
  dealName: string;
  outcome: string;
  finalTcv: number | null;
  winBackPotential: number | null;
  winBackTimeline: string | null;
  primaryLossCategory: string | null;
  archivedAt: string | Date;
}

export interface RevivalConfig {
  minWinBack: number;
  cooloffDays: number;
  maxAgeDays: number;
}

export interface RevivalCandidate {
  memoryId: string;
  dealId: string;
  accountName: string;
  dealName: string;
  finalTcv: number | null;
  winBackPotential: number | null;
  winBackTimeline: string | null;
  primaryLossCategory: string | null;
  archivedAt: string;
  ageDays: number;
  reasons: string[];
}

const MS_PER_DAY = 86_400_000;

function ageInDays(archivedAt: string | Date, now: number): number {
  const t = new Date(archivedAt).getTime();
  if (Number.isNaN(t)) return 0;
  return Math.floor((now - t) / MS_PER_DAY);
}

/**
 * A Lost deal is a revival candidate when its win-back potential meets the
 * threshold and it has aged past the cool-off but not beyond the max window
 * (stale losses aren't worth chasing). Sorted by win-back potential, then value.
 */
export function selectRevivalCandidates(rows: MemoryLite[], cfg: RevivalConfig, now: number): RevivalCandidate[] {
  const out: RevivalCandidate[] = [];
  for (const r of rows) {
    if (r.outcome !== "Lost") continue;
    if (r.winBackPotential == null || r.winBackPotential < cfg.minWinBack) continue;
    const ageDays = ageInDays(r.archivedAt, now);
    if (ageDays < cfg.cooloffDays || ageDays > cfg.maxAgeDays) continue;

    const reasons = [`Win-back potential ${r.winBackPotential}/5`, `Lost ${ageDays} days ago (past ${cfg.cooloffDays}-day cool-off)`];
    if (r.primaryLossCategory) reasons.push(`Loss driver: ${r.primaryLossCategory}`);
    if (r.winBackTimeline) reasons.push(`Timeline: ${r.winBackTimeline}`);

    out.push({
      memoryId: r.id,
      dealId: r.dealId,
      accountName: r.accountName,
      dealName: r.dealName,
      finalTcv: r.finalTcv,
      winBackPotential: r.winBackPotential,
      winBackTimeline: r.winBackTimeline,
      primaryLossCategory: r.primaryLossCategory,
      archivedAt: new Date(r.archivedAt).toISOString(),
      ageDays,
      reasons,
    });
  }
  out.sort((a, b) => (b.winBackPotential ?? 0) - (a.winBackPotential ?? 0) || (b.finalTcv ?? 0) - (a.finalTcv ?? 0));
  return out;
}
