import { describe, it, expect } from "vitest";
import { buildTimeline, type TimelineDeal } from "./close-timeline-model";

// Fixed clock for every test: "now" is July 15, 2026 (local time). Never rely
// on the real clock — buildTimeline always takes `now` as a parameter.
const NOW = new Date(2026, 6, 15); // month is 0-indexed: 6 = July

let seq = 0;
function deal(p: Partial<TimelineDeal> = {}): TimelineDeal {
  seq += 1;
  return {
    id: p.id ?? `d${seq}`,
    accountName: p.accountName ?? `Account ${seq}`,
    salesStage: p.salesStage ?? "Discovery",
    expectedCloseDate: p.expectedCloseDate ?? null,
    normalizedTCV: p.normalizedTCV,
    calculatedTCV: p.calculatedTCV,
    healthStatus: p.healthStatus,
    ...p,
  };
}

describe("buildTimeline — closed-deal exclusion", () => {
  it("excludes Closed-Won and Closed-Lost from months, redTcv, and noDateCount", () => {
    const deals = [
      deal({ id: "won", salesStage: "Closed-Won", healthStatus: "RED", expectedCloseDate: null, normalizedTCV: 500 }),
      deal({ id: "lost", salesStage: "Closed-Lost", healthStatus: "RED", expectedCloseDate: null, normalizedTCV: 700 }),
      deal({ id: "open", salesStage: "Discovery", healthStatus: "RED", expectedCloseDate: "2026-07-20", normalizedTCV: 100 }),
    ];
    const timeline = buildTimeline(deals, NOW);
    expect(timeline.months).toHaveLength(1);
    expect(timeline.months[0].deals.map((d) => d.id)).toEqual(["open"]);
    // Closed deals with no close date must NOT bump noDateCount.
    expect(timeline.noDateCount).toBe(0);
    // Closed RED deals must NOT bump redTcv — only the open RED deal counts.
    expect(timeline.redTcv).toBe(100);
  });

  it("excludes variant stage spellings ('closed won', 'closedlost') via the real terminalOutcome contract", () => {
    const deals = [
      deal({ id: "a", salesStage: "closed won", normalizedTCV: 100 }),
      deal({ id: "b", salesStage: "closedlost", normalizedTCV: 200 }),
      deal({ id: "c", salesStage: "Validation", expectedCloseDate: "2026-07-20", normalizedTCV: 300 }),
    ];
    const timeline = buildTimeline(deals, NOW);
    const allIds = [...(timeline.overdue?.deals ?? []), ...timeline.months.flatMap((m) => m.deals)].map((d) => d.id);
    expect(allIds).toEqual(["c"]);
  });
});

describe("buildTimeline — overdue bucket", () => {
  it("places a past close date (before the start of the current month) into the overdue bucket, not a month bucket", () => {
    const deals = [deal({ id: "past", expectedCloseDate: "2026-05-10", normalizedTCV: 100 })];
    const timeline = buildTimeline(deals, NOW);
    expect(timeline.overdue).not.toBeNull();
    expect(timeline.overdue!.key).toBe("overdue");
    expect(timeline.overdue!.label).toBe("Overdue");
    expect(timeline.overdue!.deals.map((d) => d.id)).toEqual(["past"]);
    expect(timeline.months).toHaveLength(0);
  });

  it("boundary: a close date within the current month lands in that month's bucket, not overdue", () => {
    // NOW is July 15, 2026 — July 3 is earlier in the same month, so it must
    // NOT be treated as overdue (this view is month-level, not day-level).
    const deals = [deal({ id: "early-this-month", expectedCloseDate: "2026-07-03", normalizedTCV: 100 })];
    const timeline = buildTimeline(deals, NOW);
    expect(timeline.overdue).toBeNull();
    expect(timeline.months).toHaveLength(1);
    expect(timeline.months[0].key).toBe("2026-07");
    expect(timeline.months[0].deals.map((d) => d.id)).toEqual(["early-this-month"]);
  });

  it("collapses overdue deals from multiple past months into a single bucket", () => {
    const deals = [
      deal({ id: "jan", expectedCloseDate: "2026-01-05", normalizedTCV: 100 }),
      deal({ id: "mar", expectedCloseDate: "2026-03-05", normalizedTCV: 100 }),
    ];
    const timeline = buildTimeline(deals, NOW);
    expect(timeline.overdue!.deals.map((d) => d.id).sort()).toEqual(["jan", "mar"]);
    expect(timeline.months).toHaveLength(0);
  });
});

describe("buildTimeline — missing/unparseable dates", () => {
  it("counts null, undefined, and unparseable close dates in noDateCount and places them in no bucket", () => {
    const deals = [
      deal({ id: "null-date", expectedCloseDate: null }),
      deal({ id: "undef-date", expectedCloseDate: undefined }),
      deal({ id: "garbage-date", expectedCloseDate: "not-a-date" }),
    ];
    const timeline = buildTimeline(deals, NOW);
    expect(timeline.noDateCount).toBe(3);
    expect(timeline.overdue).toBeNull();
    expect(timeline.months).toHaveLength(0);
  });
});

describe("buildTimeline — timezone-safe date-only parsing", () => {
  it("buckets a bare YYYY-MM-DD string to its own year/month regardless of host timezone", () => {
    // Regression test for the UTC-midnight-then-local-getters rollback bug:
    // `new Date("2026-01-15")` parses as UTC midnight, and reading it back
    // with `.getFullYear()/.getMonth()` in local time rolls it back to
    // December 2025 for any timezone west of UTC. Even if this test happens
    // to run in a UTC host environment (no rollback would be observable
    // there), it still guards the code path: parseYearMonth reads the
    // year/month directly out of the string instead of round-tripping
    // through `new Date(...)`.
    const deals = [deal({ id: "jan15", expectedCloseDate: "2026-01-15", normalizedTCV: 100 })];
    const timeline = buildTimeline(deals, NOW);
    expect(timeline.overdue!.deals.map((d) => d.id)).toEqual(["jan15"]);
    // (2026-01 is before NOW's 2026-07, so it lands in overdue rather than
    // months — the point under test is that it's January 2026, not December
    // 2025 or any other rolled-back month.)
  });

  it("a same-month bare date-only string still resolves to the current month bucket", () => {
    const deals = [deal({ id: "jul31", expectedCloseDate: "2026-07-31", normalizedTCV: 100 })];
    const timeline = buildTimeline(deals, NOW);
    expect(timeline.overdue).toBeNull();
    expect(timeline.months[0].key).toBe("2026-07");
  });
});

describe("buildTimeline — TCV fallback and bucket aggregation", () => {
  it("falls back to calculatedTCV when normalizedTCV is missing, and to 0 when both are missing", () => {
    const deals = [
      deal({ id: "has-normalized", expectedCloseDate: "2026-08-01", normalizedTCV: 50, calculatedTCV: 999 }),
      deal({ id: "fallback-calculated", expectedCloseDate: "2026-08-01", normalizedTCV: null, calculatedTCV: 75 }),
      deal({ id: "neither", expectedCloseDate: "2026-08-01" }),
    ];
    const timeline = buildTimeline(deals, NOW);
    const byId = Object.fromEntries(timeline.months[0].deals.map((d) => [d.id, d.tcv]));
    expect(byId["has-normalized"]).toBe(50);
    expect(byId["fallback-calculated"]).toBe(75);
    expect(byId["neither"]).toBe(0);
  });

  it("sums a bucket's tcv across all of its deals", () => {
    const deals = [
      deal({ id: "a", expectedCloseDate: "2026-09-01", normalizedTCV: 100 }),
      deal({ id: "b", expectedCloseDate: "2026-09-15", normalizedTCV: 250 }),
    ];
    const timeline = buildTimeline(deals, NOW);
    expect(timeline.months[0].tcv).toBe(350);
  });

  it("sorts deals within a bucket by tcv descending", () => {
    const deals = [
      deal({ id: "small", expectedCloseDate: "2026-09-01", normalizedTCV: 10 }),
      deal({ id: "big", expectedCloseDate: "2026-09-02", normalizedTCV: 1000 }),
      deal({ id: "mid", expectedCloseDate: "2026-09-03", normalizedTCV: 500 }),
    ];
    const timeline = buildTimeline(deals, NOW);
    expect(timeline.months[0].deals.map((d) => d.id)).toEqual(["big", "mid", "small"]);
  });

  it("sorts months ascending by key", () => {
    const deals = [
      deal({ id: "later", expectedCloseDate: "2026-12-01", normalizedTCV: 10 }),
      deal({ id: "sooner", expectedCloseDate: "2026-08-01", normalizedTCV: 10 }),
    ];
    const timeline = buildTimeline(deals, NOW);
    expect(timeline.months.map((m) => m.key)).toEqual(["2026-08", "2026-12"]);
  });
});
