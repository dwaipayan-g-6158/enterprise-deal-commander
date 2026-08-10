import { describe, expect, it } from "vitest";
import {
  buildGreetingContext,
  countRecentStageChanges,
  type GreetingDealInput,
} from "./greeting-context";

const money = (n: number) => `€${Math.round(n / 1_000)}k`;

/** 2026-08-11, 09:00 local. */
const NOW = new Date(2026, 7, 11, 9, 0, 0).getTime();

function deal(overrides: Partial<GreetingDealInput> = {}): GreetingDealInput {
  return {
    dealName: "Acme Platform",
    salesStage: "Validation",
    normalizedTCV: 100_000,
    expectedCloseDate: null,
    ...overrides,
  };
}

function context(deals: GreetingDealInput[], extra = {}) {
  return buildGreetingContext(
    { deals, recentStageChanges: 0, overdueActionCount: 0, displayName: undefined, ...extra },
    money,
    NOW,
  );
}

describe("buildGreetingContext", () => {
  it("counts deals by stage", () => {
    const ctx = context([
      deal({ salesStage: "Procurement" }),
      deal({ salesStage: "Procurement" }),
      deal({ salesStage: "Validation" }),
      deal({ salesStage: "Discovery" }),
    ]);
    expect(ctx.procurementCount).toBe(2);
    expect(ctx.activeValidationValueRaw).toBe(100_000);
  });

  it("counts a deal closing today as closing this week", () => {
    // The bug this exists to prevent: `new Date("2026-08-11")` is UTC midnight,
    // which is already in the past by 09:00 in any zone east of UTC — so a deal
    // due TODAY silently dropped out of the greeting. calendarDaysUntil does the
    // comparison in local calendar days.
    const ctx = context([deal({ expectedCloseDate: "2026-08-11" })]);
    expect(ctx.closeThisWeekCount).toBe(1);
    expect(ctx.closeThisWeekValueRaw).toBe(100_000);
  });

  it("excludes deals that are already decided", () => {
    // `state: "active"` is a lifecycle filter — it still returns deals sitting
    // in a Closed-Won/Closed-Lost stage, which would inflate a "closing this
    // week" figure with deals that closed last month.
    const ctx = context([
      deal({ salesStage: "Closed-Won", expectedCloseDate: "2026-08-12" }),
      deal({ salesStage: "Closed Lost", expectedCloseDate: "2026-08-12" }),
      deal({ salesStage: "Procurement", expectedCloseDate: "2026-08-12" }),
    ]);
    expect(ctx.closeThisWeekCount).toBe(1);
  });

  it("takes the seven-day window inclusively and stops there", () => {
    const ctx = context([
      deal({ expectedCloseDate: "2026-08-18" }), // +7 — in
      deal({ expectedCloseDate: "2026-08-19" }), // +8 — out
      deal({ expectedCloseDate: "2026-08-10" }), // overdue — out
    ]);
    expect(ctx.closeThisWeekCount).toBe(1);
  });

  it("prefers normalized TCV so it never adds euros to dollars", () => {
    const ctx = context([
      deal({ expectedCloseDate: "2026-08-12", normalizedTCV: 50_000, calculatedTCV: 900_000 }),
    ]);
    expect(ctx.closeThisWeekValueRaw).toBe(50_000);
    // …falling back only when the FX-normalized figure is genuinely absent.
    const fallback = context([
      deal({ expectedCloseDate: "2026-08-12", normalizedTCV: null, calculatedTCV: 7_000 }),
    ]);
    expect(fallback.closeThisWeekValueRaw).toBe(7_000);
  });

  it("formats money in the currency it is handed", () => {
    const ctx = context([deal({ expectedCloseDate: "2026-08-12", normalizedTCV: 4_000 })]);
    expect(ctx.closeThisWeekValue).toBe("€4k");
    expect(ctx.closeThisWeekValue).not.toContain("$");
  });

  it("names the largest Procurement deal as one step from close", () => {
    const ctx = context([
      deal({ salesStage: "Procurement", dealName: "Small", normalizedTCV: 10 }),
      deal({ salesStage: "Procurement", dealName: "Large", normalizedTCV: 900 }),
      deal({ salesStage: "Validation", dealName: "Largest overall", normalizedTCV: 9_000 }),
    ]);
    expect(ctx.oneStepFromCloseDealName).toBe("Large");
  });

  it("leaves the one-step hook undefined rather than guessing", () => {
    // Undefined is what makes the hook ineligible in select-greeting, so a
    // greeting that names a deal is never rendered with an empty name.
    expect(context([deal({ salesStage: "Discovery" })]).oneStepFromCloseDealName).toBeUndefined();
  });

  it("builds the name part with its own comma, or nothing at all", () => {
    expect(context([], { displayName: "Dana" }).namePart).toBe(", Dana");
    expect(context([]).namePart).toBe("");
  });

  it("survives an empty pipeline", () => {
    const ctx = context([]);
    expect(ctx.procurementCount).toBe(0);
    expect(ctx.closeThisWeekValueRaw).toBe(0);
    expect(ctx.closeThisWeekValue).toBe("€0k");
  });
});

describe("countRecentStageChanges", () => {
  const iso = (msAgo: number) => new Date(NOW - msAgo).toISOString();
  const HOUR = 60 * 60 * 1000;

  it("counts only stage changes, and only inside 24 hours", () => {
    const events = [
      { eventType: "deal.stage_changed", occurredAt: iso(2 * HOUR) },
      { eventType: "deal.stage_changed", occurredAt: iso(23 * HOUR) },
      { eventType: "deal.stage_changed", occurredAt: iso(25 * HOUR) },
      { eventType: "deal.gate_updated", occurredAt: iso(1 * HOUR) },
    ];
    expect(countRecentStageChanges(events, NOW)).toBe(2);
  });

  it("ignores an unparseable timestamp instead of counting it", () => {
    const events = [{ eventType: "deal.stage_changed", occurredAt: "not a date" }];
    expect(countRecentStageChanges(events, NOW)).toBe(0);
  });

  it("returns zero for no events", () => {
    expect(countRecentStageChanges([], NOW)).toBe(0);
  });
});
