/**
 * Calendar-day math for DATE-ONLY columns.
 *
 * `enterprise_deals.expected_close_date` and `deal_decisions.due_date` are
 * Postgres `date` columns read in string mode, so they arrive as bare
 * "YYYY-MM-DD" with no time and no zone. Handing such a string to
 * `new Date(...)` parses it as UTC **midnight**, and comparing that instant
 * against a local `new Date()` is off by the host's UTC offset — in IST
 * (UTC+5:30) a deal closing *today* sits 5.5 hours in the past, so:
 *
 *   - a decision due today was filed under "Overdue" (while the client's own
 *     `fmtDue` printed "today" for the very same row), and
 *   - a deal closing today dropped out of "Upcoming closes" entirely.
 *
 * These helpers therefore read the date by string surgery and compare LOCAL
 * calendar days, never instants. They mirror `calendarDaysUntil` /
 * `parseLocalISODate` in `artifacts/edc/src/lib/format.ts` — the client-side
 * copy that already got this right — so both ends of the wire agree about what
 * "today" means. Keep the two in step.
 *
 * `now` is always injected (never read from the clock in here) so this stays
 * testable under a fixed clock and an arbitrary TZ.
 */

const DATE_ONLY_RE = /^(\d{4})-(\d{2})-(\d{2})$/;

/**
 * Whole calendar days from the local day containing `now` to the local calendar
 * day named by `dateOnly` — negative in the past, 0 for "today". Returns null
 * for a missing or malformed value.
 *
 * Accepts a full ISO datetime too (falling back to `new Date`), matching the
 * client helper: only the bare date-only form needs the string-surgery path.
 */
export function calendarDaysUntil(
  dateOnly: string | null | undefined,
  now: Date,
): number | null {
  if (!dateOnly) return null;

  let target: number;
  const m = DATE_ONLY_RE.exec(dateOnly);
  if (m) {
    target = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3])).getTime();
  } else {
    const parsed = new Date(dateOnly);
    if (Number.isNaN(parsed.getTime())) return null;
    target = new Date(
      parsed.getFullYear(),
      parsed.getMonth(),
      parsed.getDate(),
    ).getTime();
  }

  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  return Math.round((target - today) / 86_400_000);
}

/** True when the date-only value names a local calendar day strictly before today. */
export function isBeforeToday(
  dateOnly: string | null | undefined,
  now: Date,
): boolean {
  const days = calendarDaysUntil(dateOnly, now);
  return days != null && days < 0;
}

/**
 * True when the date-only value falls in the inclusive local calendar-day
 * window `[today, today + windowDays]`. Inclusive at BOTH ends: a deal closing
 * today belongs in a "next 30 days" reminder, and so does one closing on day 30.
 */
export function isWithinDays(
  dateOnly: string | null | undefined,
  windowDays: number,
  now: Date,
): boolean {
  const days = calendarDaysUntil(dateOnly, now);
  return days != null && days >= 0 && days <= windowDays;
}
