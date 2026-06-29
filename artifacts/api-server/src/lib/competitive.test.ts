import { describe, it, expect } from "vitest";
import { reduceWinRates, type CompetitorOutcomeRow } from "./competitive";

describe("reduceWinRates (pure)", () => {
  it("computes win rate from Won Against / (Won + Lost)", () => {
    const rows: CompetitorOutcomeRow[] = [
      { competitorId: 1, name: "CompX", status: "Won Against" },
      { competitorId: 1, name: "CompX", status: "Won Against" },
      { competitorId: 1, name: "CompX", status: "Won Against" },
      { competitorId: 1, name: "CompX", status: "Lost To" },
    ];
    const map = reduceWinRates(rows);
    expect(map.get(1)).toEqual({
      competitorId: 1,
      name: "CompX",
      winRate: 0.75,
    });
  });

  it("ignores non-decisive statuses (Active, Displaced) in the tally", () => {
    const rows: CompetitorOutcomeRow[] = [
      { competitorId: 7, name: "Quest", status: "Won Against" },
      { competitorId: 7, name: "Quest", status: "Active" },
      { competitorId: 7, name: "Quest", status: "Displaced" },
      { competitorId: 7, name: "Quest", status: "Lost To" },
    ];
    expect(reduceWinRates(rows).get(7)?.winRate).toBe(0.5);
  });

  it("omits competitors with no Won/Lost history (caller maps to null)", () => {
    const rows: CompetitorOutcomeRow[] = [
      { competitorId: 2, name: "OnlyActive", status: "Active" },
      { competitorId: 2, name: "OnlyActive", status: "Displaced" },
    ];
    const map = reduceWinRates(rows);
    expect(map.has(2)).toBe(false);
    expect(map.get(2)).toBeUndefined();
  });

  it("tracks several competitors independently and keys by id", () => {
    const rows: CompetitorOutcomeRow[] = [
      { competitorId: 1, name: "AWS", status: "Won Against" },
      { competitorId: 1, name: "AWS", status: "Won Against" },
      { competitorId: 2, name: "Splunk", status: "Lost To" },
      { competitorId: 2, name: "Splunk", status: "Lost To" },
      { competitorId: 2, name: "Splunk", status: "Won Against" },
    ];
    const map = reduceWinRates(rows);
    expect(map.get(1)?.winRate).toBe(1);
    expect(map.get(2)?.winRate).toBeCloseTo(1 / 3);
    expect([...map.keys()].sort()).toEqual([1, 2]);
  });

  it("falls back to 'Unknown' name when the joined competitor name is null", () => {
    const rows: CompetitorOutcomeRow[] = [
      { competitorId: 9, name: null, status: "Won Against" },
      { competitorId: 9, name: null, status: "Lost To" },
    ];
    expect(reduceWinRates(rows).get(9)?.name).toBe("Unknown");
  });

  it("returns an empty map for no rows", () => {
    expect(reduceWinRates([]).size).toBe(0);
  });
});
