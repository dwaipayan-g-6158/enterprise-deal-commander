/**
 * Local-time, Monday-start week boundary calculator. Mirrors the
 * `src/lib/greetings/time-bands.ts` convention: uses the browser's local
 * time throughout (no timezone acknowledgement — single-user app), never
 * touches UTC getters, and every function is pure (dependencies passed in,
 * nothing read from ambient state).
 */

const ONE_DAY_MS = 24 * 60 * 60 * 1000;
const SEVEN_DAYS_MS = 7 * ONE_DAY_MS;

/** The Monday 00:00:00.000 (local time) at or before `date`. */
export function startOfWeek(date: Date): Date {
  const day = date.getDay(); // 0 = Sunday ... 6 = Saturday
  const daysBack = day === 0 ? 6 : day - 1;
  return new Date(date.getFullYear(), date.getMonth(), date.getDate() - daysBack, 0, 0, 0, 0);
}

export function isMonday(date: Date): boolean {
  return date.getDay() === 1;
}

export function isFriday(date: Date): boolean {
  return date.getDay() === 5;
}

/** The window from this week's Monday 00:00 through `date` itself. */
export function currentWeekWindow(date: Date): { since: Date; until: Date } {
  return { since: startOfWeek(date), until: date };
}

/**
 * The prior 7-day window, ending exactly where `currentWeekWindow(date)`
 * begins — no gap or overlap between the two windows.
 */
export function previousWeekWindow(date: Date): { since: Date; until: Date } {
  const until = startOfWeek(date);
  const since = new Date(until.getTime() - SEVEN_DAYS_MS);
  return { since, until };
}

/**
 * A stable, ISO-8601-style week identifier (e.g. "2026-W30") — the same
 * value for every day Monday-Sunday of one week, and different for the
 * next. Follows the ISO 8601 week-numbering rule (week 1 is the week
 * containing the year's first Thursday, equivalently the week containing
 * Jan 4th) so year-boundary weeks resolve to the correct ISO year even when
 * they span two calendar years.
 */
export function weekKey(date: Date): string {
  const monday = startOfWeek(date);
  // The Thursday of this same week determines the ISO year: ISO 8601 assigns
  // a week to whichever year contains its Thursday.
  const thursday = new Date(monday.getFullYear(), monday.getMonth(), monday.getDate() + 3);
  const isoYear = thursday.getFullYear();
  const jan4 = new Date(isoYear, 0, 4);
  const week1Monday = startOfWeek(jan4);
  const diffDays = Math.round((monday.getTime() - week1Monday.getTime()) / ONE_DAY_MS);
  const weekNum = Math.floor(diffDays / 7) + 1;
  return `${isoYear}-W${String(weekNum).padStart(2, "0")}`;
}
