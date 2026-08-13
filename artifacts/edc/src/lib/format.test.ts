import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  formatDate,
  formatDateTime,
  humanizeIsoDates,
  parseLocalISODate,
  toLocalISODate,
  todayISO,
  compactCurrency,
  compactUSD,
  quarterStartISO,
  todayUTCISO,
  calendarDaysUntil,
  daysLeftInLocalQuarter,
  formatTerm,
  PERPETUAL_TERM_LABEL,
} from "./format";

describe("formatDate — date-only strings (never constructs a Date)", () => {
  it("formats a plain calendar day", () => {
    expect(formatDate("2026-08-30")).toBe("30/08/2026");
  });

  it("does not go off-by-one at a year boundary in a negative-offset zone", () => {
    // A naive `new Date("2026-01-01")` + local getters returns 31/12/2025
    // under any negative UTC offset. This is the canary for that class of bug.
    expect(formatDate("2026-01-01")).toBe("01/01/2026");
  });

  it("does not swap day and month", () => {
    expect(formatDate("2026-12-05")).toBe("05/12/2026");
    expect(formatDate("2026-05-12")).toBe("12/05/2026");
  });

  it("handles a leap day", () => {
    expect(formatDate("2024-02-29")).toBe("29/02/2024");
  });

  it("zero-pads single-digit day/month", () => {
    expect(formatDate("2026-01-05")).toBe("05/01/2026");
  });
});

describe("formatDate/formatDateTime — instants (real Date, local getters)", () => {
  it("formats a locally-constructed Date consistently regardless of ambient TZ", () => {
    const local = new Date(2026, 7, 30, 22, 5); // 30 Aug 2026, 22:05 local
    expect(formatDateTime(local.toISOString())).toBe("30/08/2026, 22:05");
    expect(formatDate(local.toISOString())).toBe("30/08/2026");
    expect(formatDateTime(local)).toBe("30/08/2026, 22:05");
  });

  it("treats a no-offset timestamp string as local, per the ISO-8601 spec", () => {
    expect(formatDateTime("2026-08-30T22:05:00")).toBe("30/08/2026, 22:05");
  });

  it("zero-pads single-digit hour and minute", () => {
    const local = new Date(2026, 7, 30, 9, 5);
    expect(formatDateTime(local)).toBe("30/08/2026, 09:05");
  });

  it("date-only input implies midnight for formatDateTime", () => {
    expect(formatDateTime("2026-08-30")).toBe("30/08/2026, 00:00");
  });
});

describe("formatDate/formatDateTime — empty and invalid input", () => {
  it("returns null for missing input with no fallback", () => {
    expect(formatDate(null)).toBeNull();
    expect(formatDate(undefined)).toBeNull();
    expect(formatDate("")).toBeNull();
    expect(formatDate("   ")).toBeNull();
    expect(formatDateTime(null)).toBeNull();
  });

  it("returns the fallback when given one", () => {
    expect(formatDate(null, "—")).toBe("—");
    expect(formatDate("", "")).toBe(""); // `??`, not `||` — an intentional "" survives
  });

  it("never renders NaN/NaN/NaN or 00/00/0000 for garbage input — collapses to null instead", () => {
    for (const bad of ["n/a", "tomorrow", "0000-00-00", "2026-13-40", new Date("nope")]) {
      expect(formatDate(bad as never)).toBeNull();
    }
  });
});

describe("toLocalISODate/parseLocalISODate — local calendar round-trip", () => {
  it("formats a locally-constructed Date's own parts, not a UTC instant", () => {
    // The bug this guards against: new Date(2026, 6, 1).toISOString().slice(0, 10)
    // shifts to the previous UTC day in any positive-offset timezone (e.g. IST),
    // yielding "2026-06-30" instead of "2026-07-01".
    expect(toLocalISODate(new Date(2026, 6, 1))).toBe("2026-07-01");
  });

  it("zero-pads single-digit month/day", () => {
    expect(toLocalISODate(new Date(2026, 0, 5))).toBe("2026-01-05");
  });

  it("parses a YYYY-MM-DD string back into the same local Date, no shift", () => {
    const parsed = parseLocalISODate("2026-08-30");
    expect(parsed?.getFullYear()).toBe(2026);
    expect(parsed?.getMonth()).toBe(7);
    expect(parsed?.getDate()).toBe(30);
  });

  it("round-trips through both directions", () => {
    const iso = "2026-12-05";
    expect(toLocalISODate(parseLocalISODate(iso) as Date)).toBe(iso);
  });

  it("returns undefined for missing/malformed input", () => {
    expect(parseLocalISODate(undefined)).toBeUndefined();
    expect(parseLocalISODate("")).toBeUndefined();
    expect(parseLocalISODate("2026-08")).toBeUndefined();
    expect(parseLocalISODate("not-a-date")).toBeUndefined();
  });
});

describe("todayISO", () => {
  it("matches toLocalISODate(new Date()) — a local calendar day, not UTC", () => {
    expect(todayISO()).toBe(toLocalISODate(new Date()));
  });

  it("is a YYYY-MM-DD string", () => {
    expect(todayISO()).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
});

describe("calendarDaysUntil — local calendar-day diff, the roster's overdue/quarter canary", () => {
  // 27 Jun 2026, LOCAL parts — not `new Date("2026-06-27T...Z")`, whose local
  // calendar day varies by machine timezone and would make these tests flaky.
  const localDay = (hour = 12) => new Date(2026, 5, 27, hour).getTime();

  it("is 0 for today regardless of the hour — the canary for the UTC-midnight bug", () => {
    // The bug this fixes: a date-only string handed to `new Date(iso)` parses
    // as UTC midnight, so comparing it against `now` (a real instant) used to
    // go negative once local time passed the UTC offset boundary — a deal due
    // TODAY read as overdue in IST past ~17:30. calendarDaysUntil must read 0
    // at every hour of today, not just the morning.
    for (const hour of [0, 9, 17, 18, 23]) {
      expect(calendarDaysUntil("2026-06-27", localDay(hour))).toBe(0);
    }
  });

  it("is negative for a past date, positive for a future one", () => {
    expect(calendarDaysUntil("2026-06-22", localDay())).toBe(-5);
    expect(calendarDaysUntil("2026-07-27", localDay())).toBe(30);
  });

  it("agrees whether given a date-only string or an equivalent local-midnight instant", () => {
    const asString = calendarDaysUntil("2026-07-10", localDay());
    const asInstant = calendarDaysUntil(new Date(2026, 6, 10), localDay());
    expect(asInstant).toBe(asString);
  });

  it("returns null for missing/unparseable input", () => {
    expect(calendarDaysUntil(null, localDay())).toBeNull();
    expect(calendarDaysUntil(undefined, localDay())).toBeNull();
    expect(calendarDaysUntil("", localDay())).toBeNull();
    expect(calendarDaysUntil("not-a-date", localDay())).toBeNull();
  });

  it("rounds a DST-shortened/lengthened day to a whole day", () => {
    // A 23h or 25h local day (DST transition) must still count as exactly one
    // calendar day, not 0.958 or 1.042 rounding down/up unpredictably.
    expect(calendarDaysUntil("2026-06-28", localDay(23))).toBe(1);
  });

  it("defaults `now` to the real clock when omitted", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 5, 27, 12));
    try {
      expect(calendarDaysUntil("2026-06-27")).toBe(0);
    } finally {
      vi.useRealTimers();
    }
  });
});

describe("daysLeftInLocalQuarter — a real calendar quarter, not a flat day count", () => {
  const at = (y: number, mo: number, d: number, h = 12) => new Date(y, mo - 1, d, h).getTime();

  it("computes days remaining in Q3 from an early-quarter date", () => {
    // 2026-08-03 -> Q3 ends 2026-09-30 -> 58 days left. This is the case that
    // exposed the bug: the old flat `<= 92` bound admitted deals through
    // ~2026-11-03, a month into Q4, under a label that says "This quarter".
    expect(daysLeftInLocalQuarter(at(2026, 8, 3))).toBe(58);
  });

  it("is 0 on the last day of the quarter", () => {
    expect(daysLeftInLocalQuarter(at(2026, 9, 30))).toBe(0);
  });

  it("handles the year-end quarter rollover", () => {
    expect(daysLeftInLocalQuarter(at(2026, 12, 15))).toBe(16); // through 2026-12-31
  });

  it("handles Q1/Q2/Q4 boundaries, not just Q3", () => {
    expect(daysLeftInLocalQuarter(at(2026, 1, 1))).toBe(89); // Q1 ends 2026-03-31
    expect(daysLeftInLocalQuarter(at(2026, 4, 1))).toBe(90); // Q2 ends 2026-06-30
    expect(daysLeftInLocalQuarter(at(2026, 10, 1))).toBe(91); // Q4 ends 2026-12-31
  });
});

describe("quarterStartISO — UTC quarter-flooring for pipeline_targets.period_start", () => {
  it("snaps a mid-quarter date to that quarter's first day", () => {
    expect(quarterStartISO("2026-08-17")).toBe("2026-07-01");
  });

  it("floors the boundary month of each quarter to itself", () => {
    expect(quarterStartISO("2026-01-01")).toBe("2026-01-01");
    expect(quarterStartISO("2026-04-01")).toBe("2026-04-01");
    expect(quarterStartISO("2026-07-01")).toBe("2026-07-01");
    expect(quarterStartISO("2026-10-01")).toBe("2026-10-01");
  });

  it("snaps the last day of a quarter to that same quarter's start, not the next one", () => {
    expect(quarterStartISO("2026-03-31")).toBe("2026-01-01");
    expect(quarterStartISO("2026-12-31")).toBe("2026-10-01");
  });

  it("tolerates a full timestamp by using only its date portion", () => {
    expect(quarterStartISO("2026-08-17T23:59:59.000Z")).toBe("2026-07-01");
  });

  it("falls back to the current UTC quarter for malformed/empty input instead of emitting NaN", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-08-17T00:00:00.000Z"));
    try {
      expect(quarterStartISO("")).toBe("2026-07-01");
      expect(quarterStartISO("not-a-date")).toBe("2026-07-01");
    } finally {
      vi.useRealTimers();
    }
  });
});

describe("todayUTCISO", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("returns the UTC calendar date, not the local one, near a UTC midnight boundary", () => {
    // 2026-08-17T23:30:00Z is still 2026-08-18 local in any timezone ahead of
    // UTC by 30+ minutes — todayUTCISO must report the UTC day regardless.
    vi.setSystemTime(new Date("2026-08-17T23:30:00.000Z"));
    expect(todayUTCISO()).toBe("2026-08-17");
  });

  it("is a YYYY-MM-DD string", () => {
    vi.setSystemTime(new Date("2026-01-05T00:00:00.000Z"));
    expect(todayUTCISO()).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it("feeding todayUTCISO into quarterStartISO gives the active UTC quarter", () => {
    vi.setSystemTime(new Date("2026-11-20T00:00:00.000Z"));
    expect(quarterStartISO(todayUTCISO())).toBe("2026-10-01");
  });
});

describe("humanizeIsoDates", () => {
  it("rewrites a bare ISO date inside a real engine explanation string", () => {
    expect(humanizeIsoDates("Close date: 2026-08-30")).toBe("Close date: 30/08/2026");
  });

  it("passes non-date text through unchanged", () => {
    const factor = "Stage: Negotiation (expected ~80% gates), actual: 45%";
    expect(humanizeIsoDates(factor)).toBe(factor);
  });

  it("leaves a YYYY-MM-DD-shaped false positive with an invalid month alone", () => {
    expect(humanizeIsoDates("ticket 2026-99-01")).toBe("ticket 2026-99-01");
  });
});

describe("compactCurrency — the consolidated compact-money helper", () => {
  it("compacts millions to 2dp and thousands to a whole number", () => {
    expect(compactCurrency(2_340_000)).toBe("$2.34M");
    expect(compactCurrency(450_000)).toBe("$450K");
    expect(compactCurrency(1_000)).toBe("$1K");
    expect(compactCurrency(999)).toBe("$999");
  });

  it("handles negatives — the bug all three cockpit copies shared", () => {
    expect(compactCurrency(-1_500_000)).toBe("-$1.50M");
    expect(compactCurrency(-5_000)).toBe("-$5K");
    expect(compactCurrency(-999)).toBe("-$999");
    expect(compactCurrency(-0)).toBe("$0");
  });

  it("carries into M instead of rendering a nonsense $1000K", () => {
    expect(compactCurrency(999_999)).toBe("$1.00M");
    expect(compactCurrency(999_500)).toBe("$1.00M");
    expect(compactCurrency(999_499)).toBe("$999K");
    expect(compactCurrency(-999_999)).toBe("-$1.00M");
  });

  it("does not round sub-$1000 values up into K (Math.round(0.5) === 1)", () => {
    expect(compactCurrency(500)).toBe("$500");
    expect(compactCurrency(999.4)).toBe("$999");
  });

  it("prefixes a non-USD code instead of a $ glyph", () => {
    expect(compactCurrency(1_500_000, "EUR")).toBe("EUR 1.50M");
    expect(compactCurrency(2_000, "INR")).toBe("INR 2K");
    expect(compactCurrency(-1_500_000, "EUR")).toBe("-EUR 1.50M");
  });

  it("collapses non-finite input to zero rather than $InfinityM", () => {
    expect(compactCurrency(Number.NaN)).toBe("$0");
    expect(compactCurrency(Number.POSITIVE_INFINITY)).toBe("$0");
    expect(compactCurrency(undefined as never)).toBe("$0");
  });

  it("compactUSD is an alias, not a second implementation", () => {
    for (const n of [0, 999, 1_000, 999_999, 2_340_000, -5_000]) {
      expect(compactUSD(n)).toBe(compactCurrency(n, "USD"));
    }
  });
});

describe("formatTerm — the one spelling of a deal's contract term", () => {
  it("isPerpetual wins over any years value, including the filler 1", () => {
    expect(formatTerm(1, true)).toBe(PERPETUAL_TERM_LABEL);
    expect(formatTerm(7, true)).toBe(PERPETUAL_TERM_LABEL);
  });

  it("renders each style for a non-perpetual term", () => {
    expect(formatTerm(3, false, "long")).toBe("3 Years");
    expect(formatTerm(3, false, "short")).toBe("3 yr");
    expect(formatTerm(3, false, "phrase")).toBe("3 year term");
  });

  it("defaults to the long style", () => {
    expect(formatTerm(3, false)).toBe("3 Years");
  });

  it("renders each style for a perpetual term", () => {
    expect(formatTerm(1, true, "long")).toBe("Perpetual");
    expect(formatTerm(1, true, "short")).toBe("Perpetual");
    // Mid-caption prose ("... · perpetual term") wants a lowercase, not the
    // capitalized label — the only style-dependent branch on the perpetual side.
    expect(formatTerm(1, true, "phrase")).toBe("perpetual term");
  });

  it("clamps a non-finite/out-of-range years value the same way clampTerm does", () => {
    expect(formatTerm(Number.NaN, false)).toBe("1 Years");
    expect(formatTerm(0, false)).toBe("1 Years");
    expect(formatTerm(99, false)).toBe("10 Years");
    expect(formatTerm(undefined, false)).toBe("1 Years");
  });
});
