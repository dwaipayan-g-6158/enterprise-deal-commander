import { describe, expect, it } from "vitest";
import { describeKindCount, digestHistory } from "./digest";
import type { TimelineRow } from "./adapters";

/**
 * Built in LOCAL time on purpose. `digestHistory` groups by `dayKey`, which is
 * local, so a fixture constructed in UTC would land on a different calendar day
 * on a machine far enough from UTC and the busiest-day assertion would pass or
 * fail depending on where it ran.
 */
function atDay(dayOffset: number, hour = 9): string {
  return new Date(2026, 7, 1 + dayOffset, hour, 0, 0).toISOString();
}

function row(over: Partial<TimelineRow> & { id: string }): TimelineRow {
  return {
    kind: "field",
    title: "Updated 2 fields",
    at: atDay(0),
    actor: "Sarah Chen",
    details: [],
    ...over,
  };
}

describe("digestHistory", () => {
  it("returns an empty digest rather than throwing on no rows", () => {
    expect(digestHistory([])).toEqual({
      total: 0,
      spanDays: null,
      actors: [],
      byKind: [],
      busiestDay: null,
      latestAt: null,
    });
  });

  it("counts kinds largest-first and omits kinds with no rows", () => {
    const digest = digestHistory([
      row({ id: "1", kind: "gate" }),
      row({ id: "2", kind: "gate" }),
      row({ id: "3", kind: "gate" }),
      row({ id: "4", kind: "stage" }),
    ]);
    expect(digest.byKind).toEqual([
      { kind: "gate", count: 3 },
      { kind: "stage", count: 1 },
    ]);
    expect(digest.byKind.some((k) => k.kind === "blocker")).toBe(false);
  });

  it("breaks kind ties by name so the order does not follow the payload", () => {
    const forwards = digestHistory([
      row({ id: "1", kind: "stage" }),
      row({ id: "2", kind: "gate" }),
    ]);
    const backwards = digestHistory([
      row({ id: "1", kind: "gate" }),
      row({ id: "2", kind: "stage" }),
    ]);
    expect(forwards.byKind).toEqual(backwards.byKind);
  });

  it("ranks actors by volume and skips unattributed system rows", () => {
    const digest = digestHistory([
      row({ id: "1", actor: "Sarah Chen" }),
      row({ id: "2", actor: "Sarah Chen" }),
      row({ id: "3", actor: "David Park" }),
      row({ id: "4", kind: "system", actor: "" }),
    ]);
    expect(digest.actors).toEqual([
      { name: "Sarah Chen", count: 2 },
      { name: "David Park", count: 1 },
    ]);
  });

  it("spans inclusive days across the oldest and newest row", () => {
    const digest = digestHistory([
      row({ id: "1", at: atDay(0) }),
      row({ id: "2", at: atDay(4) }),
    ]);
    expect(digest.spanDays).toBe(5);
  });

  it("finds the busiest day and reports the newest timestamp", () => {
    const digest = digestHistory([
      row({ id: "1", at: atDay(0) }),
      row({ id: "2", at: atDay(2, 9) }),
      row({ id: "3", at: atDay(2, 12) }),
      row({ id: "4", at: atDay(2, 15) }),
    ]);
    expect(digest.busiestDay?.count).toBe(3);
    expect(digest.latestAt).toBe(atDay(2, 15));
  });

  it("ignores rows whose timestamp will not parse, without dropping their counts", () => {
    // A row with a bad timestamp still happened — it just cannot be placed on
    // the day axis. Counting it in `total` while leaving it out of the span is
    // deliberate; silently discarding it would under-report the history.
    const digest = digestHistory([
      row({ id: "1", at: atDay(0) }),
      row({ id: "2", at: "not a date" }),
    ]);
    expect(digest.total).toBe(2);
    expect(digest.spanDays).toBe(1);
  });
});

describe("describeKindCount", () => {
  it("uses the singular for one and the plural otherwise", () => {
    expect(describeKindCount({ kind: "stage", count: 1 })).toBe("1 stage move");
    expect(describeKindCount({ kind: "stage", count: 3 })).toBe("3 stage moves");
    expect(describeKindCount({ kind: "gate", count: 1 })).toBe("1 gate update");
    expect(describeKindCount({ kind: "blocker", count: 2 })).toBe("2 blockers");
  });
});
