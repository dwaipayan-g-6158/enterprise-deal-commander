import { describe, it, expect } from "vitest";
import { buildTimeline } from "./timeline";
import type { RosterRow } from "./roster-types";

const NOW = new Date("2026-06-27T12:00:00Z").getTime();
const onDay = (iso: string) => iso;

let seq = 0;
function row(p: Partial<RosterRow> = {}): RosterRow {
  seq += 1;
  return {
    id: p.id ?? `d${seq}`,
    dealName: `Deal ${seq}`,
    accountName: `Acct ${seq}`,
    salesStageId: 1,
    salesStage: "Discovery",
    normalizedTCV: p.normalizedTCV ?? 100,
    calculatedTCV: 100,
    expectedCloseDate: p.expectedCloseDate ?? null,
    ...p,
  } as RosterRow;
}

describe("buildTimeline", () => {
  it("returns empty for no rows", () => {
    expect(buildTimeline([], NOW)).toEqual([]);
  });

  it("routes overdue, months, and no-date; orders Overdue → months asc → No date", () => {
    const rows = [
      row({ id: "future1", expectedCloseDate: onDay("2026-08-10") }),
      row({ id: "overdue1", expectedCloseDate: onDay("2026-05-01") }),
      row({ id: "nodate1", expectedCloseDate: null }),
      row({ id: "future2", expectedCloseDate: onDay("2026-07-15") }),
      row({ id: "bad", expectedCloseDate: "not-a-date" }),
    ];
    const cols = buildTimeline(rows, NOW);
    expect(cols.map((c) => c.kind)).toEqual(["overdue", "month", "month", "none"]);
    expect(cols[0].rows.map((r) => r.id)).toEqual(["overdue1"]);
    // July before August
    expect(cols[1].label).toContain("Jul");
    expect(cols[1].rows.map((r) => r.id)).toEqual(["future2"]);
    expect(cols[2].label).toContain("Aug");
    // no-date column gathers both the null and the unparseable date
    expect(cols[3].rows.map((r) => r.id).sort()).toEqual(["bad", "nodate1"]);
  });

  it("omits synthetic columns when empty (no overdue / no no-date)", () => {
    const cols = buildTimeline([row({ expectedCloseDate: "2026-09-01" })], NOW);
    expect(cols).toHaveLength(1);
    expect(cols[0].kind).toBe("month");
  });

  it("sums normalizedTCV and counts per column", () => {
    const rows = [
      row({ expectedCloseDate: "2026-07-05", normalizedTCV: 100 }),
      row({ expectedCloseDate: "2026-07-20", normalizedTCV: 250 }),
    ];
    const [july] = buildTimeline(rows, NOW);
    expect(july.dealCount).toBe(2);
    expect(july.totalTCV).toBe(350);
  });

  it("preserves incoming order within a column", () => {
    const rows = [
      row({ id: "a", expectedCloseDate: "2026-07-28" }),
      row({ id: "b", expectedCloseDate: "2026-07-02" }),
    ];
    const [july] = buildTimeline(rows, NOW);
    expect(july.rows.map((r) => r.id)).toEqual(["a", "b"]); // input order, not date order
  });
});
