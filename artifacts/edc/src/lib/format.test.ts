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
