import { describe, expect, it } from "vitest";
import { buildVerdict, type VerdictInput } from "./verdict";

/**
 * Deliberately euro-denominated and deliberately free of a decimal point: the
 * currency proves the formatter is injected rather than assumed, and the missing
 * point keeps the "exactly one sentence" assertion below honest about what a
 * full stop is.
 */
const money = (n: number) => `€${Math.round(n / 1_000)}k`;

function input(overrides: Partial<VerdictInput> = {}): VerdictInput {
  return {
    redAlerts: 0,
    tcvAtRisk: 0,
    dealsByHealth: { GREEN: 8, YELLOW: 2, RED: 0 },
    staleDeals: 0,
    ...overrides,
  };
}

describe("buildVerdict", () => {
  it("leads with value behind red alerts", () => {
    const v = buildVerdict(input({ redAlerts: 3, tcvAtRisk: 4_200_000 }), money);
    expect(v.tone).toBe("critical");
    expect(v.sentence).toBe("€4200k is sitting behind 3 red alerts.");
    expect(v.figure).toEqual({ label: "TCV at risk", value: 4_200_000, kind: "money" });
  });

  it("denominates in the currency it is handed, never a dollar sign", () => {
    const v = buildVerdict(input({ redAlerts: 1, tcvAtRisk: 1_000_000 }), money);
    expect(v.sentence).toContain("€");
    expect(v.sentence).not.toContain("$");
  });

  it("does not claim nothing is at risk when a red alert has no TCV behind it", () => {
    // A deal can carry an alert before anyone has entered its value. Reporting
    // "€0k is sitting behind 1 red alert" would read as reassurance.
    const v = buildVerdict(input({ redAlerts: 1, tcvAtRisk: 0 }), money);
    expect(v.tone).toBe("critical");
    expect(v.sentence).toBe("1 red alert needs a decision.");
    expect(v.figure).toEqual({ label: "Red alerts", value: 1, kind: "count" });
  });

  it("falls to stalled deals only once nothing is red", () => {
    const v = buildVerdict(input({ staleDeals: 4 }), money);
    expect(v.tone).toBe("caution");
    expect(v.sentence).toBe("Nothing is red, but 4 deals have stopped moving.");

    // …and an alert outranks it, rather than the two being blended into a score.
    const withAlert = buildVerdict(input({ staleDeals: 9, redAlerts: 2, tcvAtRisk: 1 }), money);
    expect(withAlert.sentence).toContain("red");
    expect(withAlert.sentence).not.toContain("stopped moving");
  });

  it("reports red health with no alert firing", () => {
    const v = buildVerdict(input({ dealsByHealth: { GREEN: 4, YELLOW: 1, RED: 2 } }), money);
    expect(v.tone).toBe("caution");
    expect(v.sentence).toBe("2 deals are marked red with no alert firing.");
  });

  it("says so plainly when the portfolio is clear", () => {
    const v = buildVerdict(input(), money);
    expect(v.tone).toBe("steady");
    expect(v.sentence).toBe("All 10 active deals are clear — nothing red, nothing stalled.");
    // No borrowed figure: the Pulse block below already leads with the weighted
    // pipeline, and the same number twice reads as two different numbers.
    expect(v.figure).toBeNull();
  });

  it("handles an empty portfolio without inventing a verdict", () => {
    const v = buildVerdict(input({ dealsByHealth: { GREEN: 0, YELLOW: 0, RED: 0 } }), money);
    expect(v.tone).toBe("quiet");
    expect(v.figure).toBeNull();

    // Null health is the pre-load state, and must read the same way rather than
    // announcing a clear pipeline the app has not looked at yet.
    expect(buildVerdict(input({ dealsByHealth: null }), money).tone).toBe("quiet");
  });

  it("agrees with itself about singular and plural", () => {
    expect(buildVerdict(input({ redAlerts: 1, tcvAtRisk: 5000 }), money).sentence).toBe(
      "€5k is sitting behind 1 red alert.",
    );
    expect(buildVerdict(input({ staleDeals: 1 }), money).sentence).toBe(
      "Nothing is red, but 1 deal has stopped moving.",
    );
    expect(
      buildVerdict(input({ dealsByHealth: { GREEN: 1, YELLOW: 0, RED: 0 } }), money).sentence,
    ).toBe("All 1 active deal is clear — nothing red, nothing stalled.");
  });

  it("always returns exactly one sentence", () => {
    const cases: Partial<VerdictInput>[] = [
      { redAlerts: 2, tcvAtRisk: 9000 },
      { redAlerts: 2 },
      { staleDeals: 3 },
      { dealsByHealth: { GREEN: 0, YELLOW: 0, RED: 3 } },
      {},
      { dealsByHealth: null },
    ];
    for (const c of cases) {
      const { sentence } = buildVerdict(input(c), money);
      expect(sentence.trim()).not.toBe("");
      // One terminal full stop, at the end. An em dash and a comma are fine; a
      // second sentence is not.
      expect(sentence.split(".").filter((s) => s.trim().length > 0)).toHaveLength(1);
      expect(sentence.endsWith(".")).toBe(true);
    }
  });
});
