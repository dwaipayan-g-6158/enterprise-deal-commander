import { describe, it, expect } from "vitest";
import {
  startOfWeek,
  isMonday,
  isFriday,
  currentWeekWindow,
  previousWeekWindow,
  weekKey,
} from "./week-boundaries";

function at(year: number, month: number, day: number, hour = 0, minute = 0): Date {
  return new Date(year, month, day, hour, minute, 0, 0);
}

describe("isMonday", () => {
  it("is true for a Monday", () => {
    expect(isMonday(at(2026, 6, 20, 9))).toBe(true);
  });
  it("is false for a Friday", () => {
    expect(isMonday(at(2026, 6, 24, 9))).toBe(false);
  });
  it("is false for a mid-week Wednesday", () => {
    expect(isMonday(at(2026, 6, 22, 9))).toBe(false);
  });
  it("is true for a Monday that wraps across a year boundary (Dec 29, 2025)", () => {
    expect(isMonday(at(2025, 11, 29, 9))).toBe(true);
  });
});

describe("isFriday", () => {
  it("is true for a Friday", () => {
    expect(isFriday(at(2026, 6, 24, 9))).toBe(true);
  });
  it("is false for a Monday", () => {
    expect(isFriday(at(2026, 6, 20, 9))).toBe(false);
  });
  it("is false for a mid-week Wednesday", () => {
    expect(isFriday(at(2026, 6, 22, 9))).toBe(false);
  });
  it("is true for a Friday that wraps across a month/year boundary (Jan 2, 2026)", () => {
    expect(isFriday(at(2026, 0, 2, 9))).toBe(true);
  });
});

describe("startOfWeek", () => {
  it("returns the same day at local midnight for a Monday", () => {
    const result = startOfWeek(at(2026, 6, 20, 9, 30));
    expect(result).toEqual(at(2026, 6, 20, 0, 0));
  });

  it("returns the preceding Monday for a mid-week Wednesday", () => {
    const result = startOfWeek(at(2026, 6, 22, 14, 30));
    expect(result).toEqual(at(2026, 6, 20, 0, 0));
  });

  it("returns the preceding Monday (6 days back) for a Sunday", () => {
    const result = startOfWeek(at(2026, 6, 26, 23, 59));
    expect(result).toEqual(at(2026, 6, 20, 0, 0));
  });

  it("handles a week that wraps across a year boundary", () => {
    const result = startOfWeek(at(2026, 0, 2, 9)); // Friday, Jan 2 2026
    expect(result).toEqual(at(2025, 11, 29, 0, 0)); // Monday, Dec 29 2025
  });
});

describe("currentWeekWindow", () => {
  it("returns startOfWeek as `since` and the input date as `until`", () => {
    const now = at(2026, 6, 22, 14, 30);
    const window = currentWeekWindow(now);
    expect(window.since).toEqual(startOfWeek(now));
    expect(window.until).toEqual(now);
  });
});

describe("previousWeekWindow", () => {
  it("ends exactly where the current window begins (no gap or overlap)", () => {
    const now = at(2026, 6, 22, 14, 30);
    const previous = previousWeekWindow(now);
    const current = currentWeekWindow(now);
    expect(previous.until.getTime()).toBe(current.since.getTime());
  });

  it("spans exactly the prior 7 days", () => {
    const now = at(2026, 6, 22, 14, 30);
    const previous = previousWeekWindow(now);
    const days = (previous.until.getTime() - previous.since.getTime()) / 86_400_000;
    expect(days).toBe(7);
    expect(previous.since).toEqual(at(2026, 6, 13, 0, 0));
  });
});

describe("weekKey", () => {
  it("is stable for every day Monday through Sunday of one week", () => {
    const monday = weekKey(at(2026, 6, 20, 0));
    expect(weekKey(at(2026, 6, 21, 12))).toBe(monday);
    expect(weekKey(at(2026, 6, 22, 8))).toBe(monday);
    expect(weekKey(at(2026, 6, 23, 23))).toBe(monday);
    expect(weekKey(at(2026, 6, 24, 6))).toBe(monday);
    expect(weekKey(at(2026, 6, 25, 18))).toBe(monday);
    expect(weekKey(at(2026, 6, 26, 23, 59))).toBe(monday);
  });

  it("changes for the following Monday", () => {
    const thisWeek = weekKey(at(2026, 6, 20, 0));
    const nextWeek = weekKey(at(2026, 6, 27, 0));
    expect(nextWeek).not.toBe(thisWeek);
  });

  it("differs between Sunday 23:59 and Monday 00:01 of the next week", () => {
    const sundayLate = weekKey(at(2026, 0, 4, 23, 59));
    const mondayEarly = weekKey(at(2026, 0, 5, 0, 1));
    expect(sundayLate).not.toBe(mondayEarly);
  });

  it("produces a stable key across a year boundary (Dec 29, 2025 - Jan 4, 2026 is one ISO week)", () => {
    const key = weekKey(at(2025, 11, 29, 0));
    expect(weekKey(at(2025, 11, 31, 12))).toBe(key);
    expect(weekKey(at(2026, 0, 2, 9))).toBe(key);
    expect(weekKey(at(2026, 0, 4, 23, 59))).toBe(key);
  });

  it("matches the expected ISO-ish format", () => {
    expect(weekKey(at(2026, 6, 20, 0))).toBe("2026-W30");
  });
});
