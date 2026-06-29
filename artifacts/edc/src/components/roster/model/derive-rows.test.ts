import { describe, it, expect } from "vitest";
import { computeDerivedRows } from "./derive-rows";
import { DEFAULT_FILTERS, DEFAULT_SORT, type RosterRow, type RosterView } from "./roster-types";

// Fixed clock so close-date presets are deterministic.
const NOW = new Date("2026-06-27T00:00:00Z").getTime();
const inDays = (n: number) => new Date(NOW + n * 86_400_000).toISOString();

let seq = 0;
function row(p: Partial<RosterRow> = {}): RosterRow {
  seq += 1;
  return {
    id: p.id ?? `d${seq}`,
    dealName: p.dealName ?? `Deal ${seq}`,
    accountName: p.accountName ?? `Acct ${seq}`,
    accountManager: p.accountManager ?? "Dana",
    technicalLead: p.technicalLead ?? "Lee",
    salesStageId: p.salesStageId ?? 1,
    salesStage: p.salesStage ?? "Discovery",
    productRevenue: 0,
    servicesRevenue: 0,
    dealCurrency: "USD",
    calculatedTCV: p.calculatedTCV ?? 100,
    normalizedTCV: p.normalizedTCV ?? p.calculatedTCV ?? 100,
    healthStatus: p.healthStatus ?? "GREEN",
    score: p.score ?? null,
    gatesPct: p.gatesPct ?? 0,
    daysInStage: p.daysInStage ?? null,
    benchmarkDays: p.benchmarkDays ?? null,
    deltaDays: p.deltaDays ?? null,
    velocity: p.velocity ?? "NORMAL",
    competitorId: p.competitorId ?? null,
    expectedCloseDate: p.expectedCloseDate ?? null,
    ...p,
  } as RosterRow;
}

function viewWith(over: Partial<RosterView["filters"]>, rest: Partial<RosterView> = {}): RosterView {
  return {
    filters: { ...DEFAULT_FILTERS, ...over },
    sort: rest.sort ?? DEFAULT_SORT,
    group: rest.group ?? "none",
  };
}

describe("computeDerivedRows — filtering", () => {
  it("filters by health (multi-select)", () => {
    const rows = [row({ healthStatus: "RED" }), row({ healthStatus: "GREEN" }), row({ healthStatus: "YELLOW" })];
    const out = computeDerivedRows(rows, viewWith({ health: ["RED", "YELLOW"] }), NOW);
    expect(out.matchedCount).toBe(2);
    expect(out.totalCount).toBe(3);
  });

  it("filters by velocity bucket", () => {
    const rows = [row({ velocity: "STALLED" }), row({ velocity: "NORMAL" })];
    expect(computeDerivedRows(rows, viewWith({ velocity: ["STALLED"] }), NOW).matchedCount).toBe(1);
  });

  it("filters by TCV range using normalizedTCV", () => {
    const rows = [row({ normalizedTCV: 50 }), row({ normalizedTCV: 150 }), row({ normalizedTCV: 250 })];
    const out = computeDerivedRows(rows, viewWith({ tcvMin: 100, tcvMax: 200 }), NOW);
    expect(out.matchedCount).toBe(1);
  });

  it("filters by score range and excludes null scores", () => {
    const rows = [row({ score: 90 }), row({ score: 40 }), row({ score: null })];
    expect(computeDerivedRows(rows, viewWith({ scoreMin: 50 }), NOW).matchedCount).toBe(1);
  });

  it("filters by close-date preset", () => {
    const rows = [
      row({ expectedCloseDate: inDays(-5) }), // overdue
      row({ expectedCloseDate: inDays(10) }), // within 30
      row({ expectedCloseDate: inDays(80) }), // outside 30
      row({ expectedCloseDate: null }),
    ];
    expect(computeDerivedRows(rows, viewWith({ closePreset: "overdue" }), NOW).matchedCount).toBe(1);
    expect(computeDerivedRows(rows, viewWith({ closePreset: "30d" }), NOW).matchedCount).toBe(1);
  });

  it("filters by hasCompetitors", () => {
    const rows = [row({ competitorId: 3 }), row({ competitorId: null })];
    expect(computeDerivedRows(rows, viewWith({ hasCompetitors: true }), NOW).matchedCount).toBe(1);
    expect(computeDerivedRows(rows, viewWith({ hasCompetitors: false }), NOW).matchedCount).toBe(1);
  });
});

describe("computeDerivedRows — sorting", () => {
  it("sorts by TCV desc by default", () => {
    const rows = [row({ calculatedTCV: 10 }), row({ calculatedTCV: 30 }), row({ calculatedTCV: 20 })];
    const out = computeDerivedRows(rows, viewWith({}), NOW);
    expect(out.flat.map((r) => r.calculatedTCV)).toEqual([30, 20, 10]);
  });

  it("breaks ties with a secondary sort key", () => {
    const rows = [
      row({ calculatedTCV: 100, score: 10 }),
      row({ calculatedTCV: 100, score: 90 }),
    ];
    const out = computeDerivedRows(
      rows,
      viewWith({}, { sort: [{ key: "calculatedTCV", dir: "desc" }, { key: "score", dir: "desc" }] }),
      NOW,
    );
    expect(out.flat.map((r) => r.score)).toEqual([90, 10]);
  });

  it("sorts health by severity, not alphabetically", () => {
    const rows = [row({ healthStatus: "GREEN" }), row({ healthStatus: "RED" }), row({ healthStatus: "YELLOW" })];
    const out = computeDerivedRows(rows, viewWith({}, { sort: [{ key: "healthStatus", dir: "desc" }] }), NOW);
    expect(out.flat.map((r) => r.healthStatus)).toEqual(["RED", "YELLOW", "GREEN"]);
  });
});

describe("computeDerivedRows — grouping", () => {
  it("groups by stage with subtotals and pipeline ordering", () => {
    const rows = [
      row({ salesStage: "Closing", salesStageId: 3, normalizedTCV: 100, healthStatus: "RED" }),
      row({ salesStage: "Discovery", salesStageId: 1, normalizedTCV: 50 }),
      row({ salesStage: "Discovery", salesStageId: 1, normalizedTCV: 25 }),
    ];
    const out = computeDerivedRows(rows, viewWith({}, { group: "salesStage" }), NOW);
    expect(out.groups.map((g) => g.key)).toEqual(["Discovery", "Closing"]);
    expect(out.groups[0].rows).toHaveLength(2);
    expect(out.groups[0].totalTCV).toBe(75);
    expect(out.groups[1].redCount).toBe(1);
    // flat preserves group order
    expect(out.flat).toHaveLength(3);
  });

  it("returns a single empty-key group when group is none", () => {
    const out = computeDerivedRows([row(), row()], viewWith({}), NOW);
    expect(out.groups).toHaveLength(1);
    expect(out.groups[0].key).toBe("");
  });
});
