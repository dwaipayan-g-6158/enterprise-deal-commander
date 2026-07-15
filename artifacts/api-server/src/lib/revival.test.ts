import { describe, it, expect } from "vitest";
import { selectRevivalCandidates, type MemoryLite, type RevivalConfig } from "./revival";

const NOW = new Date("2026-07-16T00:00:00Z").getTime();
const daysAgo = (n: number) => new Date(NOW - n * 86_400_000).toISOString();
const CFG: RevivalConfig = { minWinBack: 3, cooloffDays: 60, maxAgeDays: 365 };

let seq = 0;
function mem(p: Partial<MemoryLite> = {}): MemoryLite {
  seq += 1;
  return {
    id: p.id ?? `m${seq}`,
    dealId: p.dealId ?? `d${seq}`,
    accountName: p.accountName ?? `Acct ${seq}`,
    dealName: p.dealName ?? `Deal ${seq}`,
    outcome: p.outcome ?? "Lost",
    finalTcv: p.finalTcv ?? 100,
    winBackPotential: p.winBackPotential ?? 4,
    winBackTimeline: p.winBackTimeline ?? "short_term",
    primaryLossCategory: p.primaryLossCategory ?? null,
    archivedAt: p.archivedAt ?? daysAgo(90),
    ...p,
  };
}

describe("selectRevivalCandidates", () => {
  it("includes a Lost deal past cool-off with sufficient win-back", () => {
    const out = selectRevivalCandidates([mem({ id: "x" })], CFG, NOW);
    expect(out.map((c) => c.memoryId)).toEqual(["x"]);
    expect(out[0].reasons.length).toBeGreaterThan(0);
    expect(out[0].ageDays).toBe(90);
  });

  it("excludes Won deals", () => {
    expect(selectRevivalCandidates([mem({ outcome: "Won" })], CFG, NOW)).toHaveLength(0);
  });

  it("excludes win-back below the threshold", () => {
    expect(selectRevivalCandidates([mem({ winBackPotential: 2 })], CFG, NOW)).toHaveLength(0);
    expect(selectRevivalCandidates([mem({ winBackPotential: null })], CFG, NOW)).toHaveLength(0);
  });

  it("excludes deals still inside the cool-off and beyond the max window", () => {
    expect(selectRevivalCandidates([mem({ archivedAt: daysAgo(30) })], CFG, NOW)).toHaveLength(0); // too fresh
    expect(selectRevivalCandidates([mem({ archivedAt: daysAgo(400) })], CFG, NOW)).toHaveLength(0); // too old
    expect(selectRevivalCandidates([mem({ archivedAt: daysAgo(60) })], CFG, NOW)).toHaveLength(1); // exactly cool-off
  });

  it("sorts by win-back potential then final TCV", () => {
    const rows = [
      mem({ id: "lowWb", winBackPotential: 3, finalTcv: 999 }),
      mem({ id: "hiWbLoTcv", winBackPotential: 5, finalTcv: 10 }),
      mem({ id: "hiWbHiTcv", winBackPotential: 5, finalTcv: 500 }),
    ];
    expect(selectRevivalCandidates(rows, CFG, NOW).map((c) => c.memoryId)).toEqual(["hiWbHiTcv", "hiWbLoTcv", "lowWb"]);
  });
});
