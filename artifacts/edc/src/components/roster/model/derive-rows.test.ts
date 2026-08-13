import { describe, it, expect } from "vitest";
import { calendarDaysUntil } from "../../../lib/format";
import { computeDerivedRows } from "./derive-rows";
import { DEFAULT_FILTERS, DEFAULT_SORT, type RosterRow, type RosterView } from "./roster-types";

// Fixed clock so close-date presets are deterministic. Built from LOCAL parts
// (not `new Date("2026-06-27T00:00:00Z")`) — a UTC-instant fixture's local
// calendar day varies by machine timezone (27 Jun in IST, 26 Jun in UTC-5),
// which would make date-only assertions flaky/machine-dependent. Noon avoids
// accidentally landing on the boundary itself.
const NOW = new Date(2026, 5, 27, 12, 0, 0).getTime();
const inDays = (n: number) => new Date(NOW + n * 86_400_000).toISOString();
// A date-only "YYYY-MM-DD" string `n` calendar days from NOW's local day —
// this is the shape expectedCloseDate actually serializes as in production,
// unlike `inDays`'s full timestamp.
function onDay(n: number): string {
  const d = new Date(2026, 5, 27 + n);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
// NOW at a given local hour of the same day — for the "due today, at every
// hour" regression that the old UTC-midnight-parse bug failed past ~18:00 IST.
const atHour = (h: number) => new Date(2026, 5, 27, h).getTime();

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
  });

  it("filters by velocity bucket", () => {
    const rows = [row({ velocity: "STALLED" }), row({ velocity: "NORMAL" })];
    expect(computeDerivedRows(rows, viewWith({ velocity: ["STALLED"] }), NOW).matchedCount).toBe(1);
  });

  it("filters by committed (tri-state)", () => {
    const rows = [row({ committed: true }), row({ committed: false }), row({ committed: true })];
    expect(computeDerivedRows(rows, viewWith({ committed: true }), NOW).matchedCount).toBe(2);
    expect(computeDerivedRows(rows, viewWith({ committed: false }), NOW).matchedCount).toBe(1);
    expect(computeDerivedRows(rows, viewWith({ committed: null }), NOW).matchedCount).toBe(3);
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

describe("closeWithin — calendar-day semantics (regression: TZ rounding)", () => {
  const matches = (iso: string, preset: RosterView["filters"]["closePreset"], now = NOW) =>
    computeDerivedRows([row({ expectedCloseDate: iso })], viewWith({ closePreset: preset }), now).matchedCount === 1;

  it("a deal due TODAY is never overdue, at any hour of today", () => {
    // The bug: `new Date(iso).getTime() - now` read a date-only string as UTC
    // midnight, so once local time passed the UTC offset boundary (~18:00 in
    // IST) a deal due today rounded to -1 day and was misclassified overdue.
    for (const h of [0, 9, 17, 18, 23]) {
      expect(matches(onDay(0), "overdue", atHour(h))).toBe(false);
    }
  });

  it("a deal due TODAY is inside every forward window, at any hour of today", () => {
    for (const h of [0, 9, 17, 18, 23]) {
      expect(matches(onDay(0), "30d", atHour(h))).toBe(true);
    }
  });

  it("yesterday is overdue, tomorrow is not", () => {
    expect(matches(onDay(-1), "overdue")).toBe(true);
    expect(matches(onDay(1), "overdue")).toBe(false);
  });

  it("30d/60d/90d are inclusive at the boundary day, exclusive one day past it", () => {
    expect(matches(onDay(30), "30d")).toBe(true);
    expect(matches(onDay(31), "30d")).toBe(false);
    expect(matches(onDay(60), "60d")).toBe(true);
    expect(matches(onDay(61), "60d")).toBe(false);
    expect(matches(onDay(90), "90d")).toBe(true);
    expect(matches(onDay(91), "90d")).toBe(false);
  });

  it("a date-only string and the equivalent same-local-day timestamp classify identically", () => {
    expect(matches(onDay(10), "30d")).toBe(matches(inDays(10), "30d"));
  });

  it("an unparseable close date is excluded from every real preset, included only by 'any'", () => {
    for (const preset of ["overdue", "30d", "60d", "90d", "quarter"] as const) {
      expect(matches("not-a-date", preset)).toBe(false);
    }
    expect(matches("not-a-date", "any")).toBe(true);
  });

  it("a null close date is excluded from every real preset (pre-existing behavior, locked)", () => {
    const rows = [row({ expectedCloseDate: null })];
    for (const preset of ["overdue", "30d", "60d", "90d", "quarter"] as const) {
      expect(computeDerivedRows(rows, viewWith({ closePreset: preset }), NOW).matchedCount).toBe(0);
    }
    expect(computeDerivedRows(rows, viewWith({ closePreset: "any" }), NOW).matchedCount).toBe(1);
  });
});

describe("closeWithin — 'This quarter' is a real calendar quarter, not a flat day count", () => {
  const matchesOn = (offsetFromToday: number, now: number) =>
    computeDerivedRows(
      [row({ expectedCloseDate: onDayFrom(now, offsetFromToday) })],
      viewWith({ closePreset: "quarter" }),
      now,
    ).matchedCount === 1;

  function onDayFrom(now: number, n: number): string {
    const base = new Date(now);
    const d = new Date(base.getFullYear(), base.getMonth(), base.getDate() + n);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  }

  it("from 2026-08-03 (Q3), admits through 2026-09-30 and excludes 2026-10-01", () => {
    const now = new Date(2026, 7, 3, 12).getTime();
    expect(matchesOn(58, now)).toBe(true); // 2026-09-30
    expect(matchesOn(59, now)).toBe(false); // 2026-10-01
  });

  it("this is the case a flat '<= 92 days' bound got wrong — the mislabel this fixes", () => {
    // Under the old flat 92-day window, day 70 (well into Q4) still matched
    // "This quarter" — a real calendar quarter must exclude it, even though
    // the same deal legitimately belongs in the "next 90 days" preset.
    const now = new Date(2026, 7, 3, 12).getTime();
    expect(matchesOn(70, now)).toBe(false); // "quarter": excluded, it's in Q4
    const withinNinety = computeDerivedRows(
      [row({ expectedCloseDate: onDayFrom(now, 70) })],
      viewWith({ closePreset: "90d" }),
      now,
    ).matchedCount;
    expect(withinNinety).toBe(1); // "90d": still correctly included
  });

  it("on the last day of the quarter, admits only today", () => {
    const now = new Date(2026, 8, 30, 12).getTime(); // 2026-09-30
    expect(matchesOn(0, now)).toBe(true);
    expect(matchesOn(1, now)).toBe(false); // 2026-10-01
  });

  it("rolls over the year boundary (Q4 -> Q1)", () => {
    const now = new Date(2026, 11, 15, 12).getTime(); // 2026-12-15
    expect(matchesOn(16, now)).toBe(true); // 2026-12-31
    expect(matchesOn(17, now)).toBe(false); // 2027-01-01
  });

  it("an overdue deal is never 'closing this quarter'", () => {
    const now = new Date(2026, 7, 3, 12).getTime();
    expect(matchesOn(-1, now)).toBe(false);
  });
});

describe("closeWithin agrees with calendarDaysUntil (cross-implementation guard)", () => {
  it("the Overdue filter's verdict matches calendarDaysUntil's sign, at every offset", () => {
    // This is the guard against the historical bug class: the roster's Overdue
    // filter and CloseDateCell's red-date styling used two different date-math
    // implementations and could disagree on the same row. Both now delegate to
    // calendarDaysUntil, so this must hold by construction.
    for (const offset of [-2, -1, 0, 1, 30]) {
      const iso = onDay(offset);
      const filterSaysOverdue = computeDerivedRows(
        [row({ expectedCloseDate: iso })],
        viewWith({ closePreset: "overdue" }),
        NOW,
      ).matchedCount === 1;
      expect(filterSaysOverdue).toBe((calendarDaysUntil(iso, NOW) ?? 0) < 0);
    }
  });
});

describe("computeDerivedRows — closure", () => {
  const rows = [
    row({ salesStage: "Discovery" }),
    row({ salesStage: "Validation" }),
    row({ salesStage: "Closed-Lost" }),
    row({ salesStage: "Closed-Won" }),
  ];

  it("defaults to open, hiding both Closed-Won and Closed-Lost", () => {
    const out = computeDerivedRows(rows, viewWith({}), NOW);
    expect(out.matchedCount).toBe(2);
    expect(out.flat.map((r) => r.salesStage).sort()).toEqual(["Discovery", "Validation"]);
  });

  it("closure: closed keeps only terminal-stage deals", () => {
    const out = computeDerivedRows(rows, viewWith({ closure: "closed" }), NOW);
    expect(out.matchedCount).toBe(2);
    expect(out.flat.map((r) => r.salesStage).sort()).toEqual(["Closed-Lost", "Closed-Won"]);
  });

  it("closure: all keeps every stage", () => {
    const out = computeDerivedRows(rows, viewWith({ closure: "all" }), NOW);
    expect(out.matchedCount).toBe(4);
  });

  it("treats a missing closure field (pre-existing saved view) as open", () => {
    const view = viewWith({});
    // Simulate a saved view persisted before this field existed.
    delete (view.filters as { closure?: unknown }).closure;
    const out = computeDerivedRows(rows, view, NOW);
    expect(out.matchedCount).toBe(2);
    expect(out.flat.map((r) => r.salesStage).sort()).toEqual(["Discovery", "Validation"]);
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

  // Grouping by health used to file decided deals under whatever health the
  // engine last computed for them, so a Closed-Won deal sat inside "YELLOW"
  // alongside live deals that genuinely need work.
  it("groups decided deals under WON/LOST rather than their stale health", () => {
    const rows = [
      row({ healthStatus: "YELLOW", salesStage: "Closed-Won" }),
      row({ healthStatus: "RED", salesStage: "Closed-Lost" }),
      row({ healthStatus: "YELLOW", salesStage: "Validation" }),
    ];
    const out = computeDerivedRows(
      rows,
      viewWith({ closure: "all" }, { group: "healthStatus" }),
      NOW,
    );
    expect(out.groups.map((g) => g.key)).toEqual(["YELLOW", "WON", "LOST"]);
    expect(out.groups[0].rows).toHaveLength(1);
  });

  it("orders decided groups after every live health group", () => {
    const rows = [
      row({ salesStage: "Closed-Lost", healthStatus: "GREEN" }),
      row({ healthStatus: "GREEN" }),
      row({ salesStage: "Closed-Won", healthStatus: "GREEN" }),
      row({ healthStatus: "RED" }),
    ];
    const out = computeDerivedRows(
      rows,
      viewWith({ closure: "all" }, { group: "healthStatus" }),
      NOW,
    );
    expect(out.groups.map((g) => g.key)).toEqual(["RED", "GREEN", "WON", "LOST"]);
  });

  // redCount drives the "· N Critical" subtotal. A decided deal is not critical.
  it("keeps decided deals out of the redCount subtotal", () => {
    const rows = [row({ healthStatus: "RED", salesStage: "Closed-Lost" })];
    const out = computeDerivedRows(rows, viewWith({ closure: "all" }), NOW);
    expect(out.groups[0].redCount).toBe(0);
  });
});
