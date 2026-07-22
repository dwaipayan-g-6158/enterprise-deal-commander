import { describe, it, expect } from "vitest";
import { computeStreak } from "./compute-streak";

function at(year: number, month: number, day: number, hour = 12): Date {
  return new Date(year, month - 1, day, hour, 0, 0, 0);
}

function iso(year: number, month: number, day: number, hour = 12): string {
  return at(year, month, day, hour).toISOString();
}

describe("computeStreak", () => {
  it("returns 0 for no activity", () => {
    expect(computeStreak([], at(2026, 7, 23))).toBe(0);
  });

  it("counts a single active day (today) as a streak of 1", () => {
    expect(computeStreak([iso(2026, 7, 23, 9)], at(2026, 7, 23, 15))).toBe(1);
  });

  it("counts consecutive active days ending today", () => {
    const activity = [iso(2026, 7, 21, 9), iso(2026, 7, 22, 9), iso(2026, 7, 23, 9)];
    expect(computeStreak(activity, at(2026, 7, 23, 15))).toBe(3);
  });

  it("stops at the first gap", () => {
    const activity = [iso(2026, 7, 19, 9), iso(2026, 7, 22, 9), iso(2026, 7, 23, 9)];
    expect(computeStreak(activity, at(2026, 7, 23, 15))).toBe(2);
  });

  it("doesn't zero out when today has no activity yet, if yesterday was active", () => {
    const activity = [iso(2026, 7, 21, 9), iso(2026, 7, 22, 9)];
    expect(computeStreak(activity, at(2026, 7, 23, 8))).toBe(2);
  });

  it("returns 0 if neither today nor yesterday has activity", () => {
    expect(computeStreak([iso(2026, 7, 20, 9)], at(2026, 7, 23, 15))).toBe(0);
  });

  it("dedupes multiple events on the same local day", () => {
    const activity = [iso(2026, 7, 23, 8), iso(2026, 7, 23, 9), iso(2026, 7, 23, 20)];
    expect(computeStreak(activity, at(2026, 7, 23, 15))).toBe(1);
  });

  it("ignores unparseable timestamps defensively", () => {
    expect(computeStreak(["not-a-date", iso(2026, 7, 23, 9)], at(2026, 7, 23, 15))).toBe(1);
  });
});
