import { describe, it, expect } from "vitest";
import {
  selectGreeting,
  type GreetingPool,
  type GreetingContext,
} from "./select-greeting";

function ctx(overrides: Partial<GreetingContext> = {}): GreetingContext {
  return {
    namePart: ", Sarah",
    procurementCount: 0,
    closeThisWeekValueRaw: 0,
    closeThisWeekValue: "$0",
    closeThisWeekCount: 0,
    recentPhaseAdvanceCount: 0,
    activeValidationValueRaw: 0,
    activeValidationValue: "$0",
    overdueActionCount: 0,
    oneStepFromCloseDealName: undefined,
    ...overrides,
  };
}

const POOL: GreetingPool = {
  morning: [
    { id: "m-generic-1", hook: null, text: "Good Morning{{namePart}}." },
    {
      id: "m-procurement-1",
      hook: "procurementCount",
      text: "{{procurementCount}} in procurement.",
    },
  ],
  afternoon: [{ id: "a-generic-1", hook: null, text: "Good Afternoon{{namePart}}." }],
  evening: [{ id: "e-generic-1", hook: null, text: "Good Evening{{namePart}}." }],
  night: [{ id: "n-generic-1", hook: null, text: "Working late{{namePart}}?" }],
};

describe("selectGreeting", () => {
  it("only picks a generic entry when no hook is eligible", () => {
    const result = selectGreeting(POOL, "morning", ctx(), [], () => 0);
    expect(result.id).toBe("m-generic-1");
  });

  it("makes a hook entry eligible once its condition is met", () => {
    const result = selectGreeting(
      POOL,
      "morning",
      ctx({ procurementCount: 3 }),
      [],
      () => 0.99,
    );
    expect(result.id).toBe("m-procurement-1");
    expect(result.text).toBe("3 in procurement.");
  });

  it("excludes ids shown within the last 48h", () => {
    const shown = [{ id: "m-generic-1", shownAt: new Date().toISOString() }];
    const result = selectGreeting(
      POOL,
      "morning",
      ctx({ procurementCount: 3 }),
      shown,
      () => 0,
    );
    expect(result.id).toBe("m-procurement-1");
  });

  it("relaxes the 48h filter when every eligible entry has already been shown", () => {
    const shown = [{ id: "m-generic-1", shownAt: new Date().toISOString() }];
    const result = selectGreeting(POOL, "morning", ctx(), shown, () => 0);
    expect(result.id).toBe("m-generic-1");
  });

  it("interpolates namePart", () => {
    const result = selectGreeting(
      POOL,
      "afternoon",
      ctx({ namePart: ", Priya" }),
      [],
      () => 0,
    );
    expect(result.text).toBe("Good Afternoon, Priya.");
  });

  it("falls back to the safe default when a band has zero eligible entries", () => {
    const emptyPool: GreetingPool = {
      morning: [],
      afternoon: [],
      evening: [],
      night: [],
    };
    const result = selectGreeting(emptyPool, "morning", ctx(), [], () => 0);
    expect(result.id).toBe("fallback");
  });
});
