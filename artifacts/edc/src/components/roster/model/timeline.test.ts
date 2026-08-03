import { describe, it, expect } from "vitest";
import { buildTimeline } from "./timeline";
import type { RosterRow } from "./roster-types";

// Local parts, not a UTC-instant string — see derive-rows.test.ts's NOW for
// why a UTC fixture's local calendar day is machine-dependent.
const NOW = new Date(2026, 5, 27, 12, 0, 0).getTime();
const onDay = (iso: string) => iso;
const atHour = (h: number) => new Date(2026, 5, 27, h).getTime();

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

  it("a deal due TODAY never lands in Overdue, at any hour of today (regression: TZ rounding)", () => {
    // The bug: `new Date(iso)` read a date-only string as UTC midnight and
    // was compared against a local `todayStart`, so a deal due today could
    // land in Overdue (or escape it) depending on the viewer's timezone
    // offset and the hour of day — the same class of bug already fixed in
    // derive-rows.ts's closeWithin and CloseDateCell's overdue styling.
    for (const h of [0, 9, 17, 18, 23]) {
      const cols = buildTimeline([row({ expectedCloseDate: "2026-06-27" })], atHour(h));
      expect(cols.some((c) => c.kind === "overdue")).toBe(false);
      expect(cols.find((c) => c.kind === "month")?.rows).toHaveLength(1);
    }
  });

  it("yesterday is overdue, at any hour of today", () => {
    for (const h of [0, 9, 17, 18, 23]) {
      const cols = buildTimeline([row({ expectedCloseDate: "2026-06-26" })], atHour(h));
      expect(cols[0].kind).toBe("overdue");
    }
  });
});
