import { describe, it, expect } from "vitest";
import { computeMemoryHealth, type MemoryRow } from "./memory-health";

function row(overrides: Partial<MemoryRow> = {}): MemoryRow {
  return {
    id: "r1",
    outcome: "Won",
    finalTcv: "100000",
    competitorsFaced: [],
    winLossNarrative: null,
    keyLessons: null,
    archivedAt: new Date(),
    autopsyCompletedAt: null,
    ...overrides,
  } as MemoryRow;
}

describe("computeMemoryHealth", () => {
  it("returns zeroed metrics for an empty archive", () => {
    const health = computeMemoryHealth([]);
    expect(health.totalArchived).toBe(0);
    expect(health.archiveCompletenessPct).toBe(0);
    expect(health.decayCount).toBe(0);
  });

  it("computes completeness from narrative presence", () => {
    const rows = [row({ winLossNarrative: "Won on price" }), row({ winLossNarrative: null })];
    expect(computeMemoryHealth(rows).archiveCompletenessPct).toBe(50);
  });

  it("averages key lessons per deal for knowledge density", () => {
    const rows = [row({ keyLessons: ["a", "b"] }), row({ keyLessons: ["c"] })];
    expect(computeMemoryHealth(rows).knowledgeDensity).toBe(1.5);
  });

  it("flags decayed Lost deals with no narrative and no autopsy older than 180 days", () => {
    const old = new Date(Date.now() - 200 * 86_400_000);
    const rows = [row({ outcome: "Lost", archivedAt: old, winLossNarrative: null, autopsyCompletedAt: null })];
    expect(computeMemoryHealth(rows).decayCount).toBe(1);
  });

  it("does not flag a Lost deal as decayed once autopsy is completed", () => {
    const old = new Date(Date.now() - 200 * 86_400_000);
    const rows = [row({ outcome: "Lost", archivedAt: old, autopsyCompletedAt: new Date() })];
    expect(computeMemoryHealth(rows).decayCount).toBe(0);
  });

  it("buckets coverage by outcome and competitor presence", () => {
    const rows = [row({ outcome: "Won", competitorsFaced: ["CloudBridge"] }), row({ outcome: "Won", competitorsFaced: [] })];
    const coverage = computeMemoryHealth(rows).coverage;
    expect(coverage.find((c) => c.value === "with competitor")?.count).toBe(1);
    expect(coverage.find((c) => c.value === "no competitor")?.count).toBe(1);
  });
});
