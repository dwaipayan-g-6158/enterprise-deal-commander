import { describe, expect, it } from "vitest";
import { formatDate, formatDateTime, humanizeIsoDates } from "./format";

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
