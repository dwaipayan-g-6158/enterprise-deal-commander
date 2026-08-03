import { describe, it, expect } from "vitest";
import { calendarDaysUntil, isBeforeToday, isWithinDays } from "./calendar-days";

/**
 * These are the regression tests for the date-only/UTC-midnight bug: a Postgres
 * `date` column arrives as "YYYY-MM-DD", and `new Date(thatString)` is UTC
 * midnight. Comparing it against a local `new Date()` made a row dated TODAY
 * look like the past in every timezone east of UTC — so a decision due today was
 * reported "overdue" and a deal closing today vanished from "upcoming closes".
 *
 * The whole point is that the answer must not depend on the time of day, so each
 * case is swept across the clock (including the hours that used to break: any
 * local time past the host's UTC offset). `now` is injected, so these are
 * deterministic under any TZ the suite happens to run in.
 */

/** Local "YYYY-MM-DD" for a date `offsetDays` from the local day of `now`. */
function localDateKey(now: Date, offsetDays: number): string {
  const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() + offsetDays);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

const HOURS_OF_DAY = [0, 1, 6, 11, 12, 17, 18, 23];

describe("calendarDaysUntil", () => {
  it("returns 0 for today at every hour of the day", () => {
    for (const hour of HOURS_OF_DAY) {
      const now = new Date(2026, 7, 4, hour, 30, 0);
      expect(calendarDaysUntil(localDateKey(now, 0), now)).toBe(0);
    }
  });

  it("returns exact day offsets regardless of time of day", () => {
    for (const hour of HOURS_OF_DAY) {
      const now = new Date(2026, 7, 4, hour, 45, 0);
      expect(calendarDaysUntil(localDateKey(now, 1), now)).toBe(1);
      expect(calendarDaysUntil(localDateKey(now, -1), now)).toBe(-1);
      expect(calendarDaysUntil(localDateKey(now, 30), now)).toBe(30);
      expect(calendarDaysUntil(localDateKey(now, -30), now)).toBe(-30);
    }
  });

  it("crosses month and year boundaries by calendar day, not by 30/365-day arithmetic", () => {
    const newYearsEve = new Date(2026, 11, 31, 23, 0, 0);
    expect(calendarDaysUntil("2027-01-01", newYearsEve)).toBe(1);
    expect(calendarDaysUntil("2026-12-31", newYearsEve)).toBe(0);

    // Feb 2028 is a leap February: 29th exists and is one day after the 28th.
    const leapDayEve = new Date(2028, 1, 28, 9, 0, 0);
    expect(calendarDaysUntil("2028-02-29", leapDayEve)).toBe(1);
    expect(calendarDaysUntil("2028-03-01", leapDayEve)).toBe(2);
  });

  it("returns null for missing or malformed values rather than NaN", () => {
    const now = new Date(2026, 7, 4, 12, 0, 0);
    expect(calendarDaysUntil(null, now)).toBeNull();
    expect(calendarDaysUntil(undefined, now)).toBeNull();
    expect(calendarDaysUntil("", now)).toBeNull();
    expect(calendarDaysUntil("not-a-date", now)).toBeNull();
  });

  it("also accepts a full ISO datetime, bucketing it by its local calendar day", () => {
    const now = new Date(2026, 7, 4, 12, 0, 0);
    const tomorrowNoon = new Date(2026, 7, 5, 12, 0, 0);
    expect(calendarDaysUntil(tomorrowNoon.toISOString(), now)).toBe(1);
  });
});

describe("isBeforeToday", () => {
  it("never treats today as the past, at any hour", () => {
    for (const hour of HOURS_OF_DAY) {
      const now = new Date(2026, 7, 4, hour, 30, 0);
      // The original bug: this was `true` for every local hour past the UTC
      // offset, filing a decision due today under "Overdue".
      expect(isBeforeToday(localDateKey(now, 0), now)).toBe(false);
    }
  });

  it("is true for yesterday and false for tomorrow", () => {
    const now = new Date(2026, 7, 4, 17, 45, 0);
    expect(isBeforeToday(localDateKey(now, -1), now)).toBe(true);
    expect(isBeforeToday(localDateKey(now, 1), now)).toBe(false);
  });

  it("is false for a missing date (no due date is not overdue)", () => {
    expect(isBeforeToday(null, new Date(2026, 7, 4, 12, 0, 0))).toBe(false);
  });
});

describe("isWithinDays", () => {
  it("includes both ends of the window", () => {
    for (const hour of HOURS_OF_DAY) {
      const now = new Date(2026, 7, 4, hour, 30, 0);
      // Today: the case that used to be excluded outright.
      expect(isWithinDays(localDateKey(now, 0), 30, now)).toBe(true);
      // Exactly on the boundary.
      expect(isWithinDays(localDateKey(now, 30), 30, now)).toBe(true);
    }
  });

  it("excludes the past and anything past the window", () => {
    const now = new Date(2026, 7, 4, 21, 0, 0);
    expect(isWithinDays(localDateKey(now, -1), 30, now)).toBe(false);
    expect(isWithinDays(localDateKey(now, 31), 30, now)).toBe(false);
  });

  it("is false for a missing date", () => {
    expect(isWithinDays(null, 30, new Date(2026, 7, 4, 12, 0, 0))).toBe(false);
  });
});
