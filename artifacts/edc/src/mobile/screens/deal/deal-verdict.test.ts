import { describe, expect, it } from "vitest";
import { DEAL_PANELS } from "../../nav/routes";
import { buildDealVerdict, type DealVerdictInput } from "./deal-verdict";

function input(overrides: Partial<DealVerdictInput> = {}): DealVerdictInput {
  return {
    riskLevel: "LOW",
    openRedAlerts: 0,
    openYellowAlerts: 0,
    managedAlerts: 0,
    gatesPct: 100,
    stage: "Validation",
    daysInStage: 12,
    daysToClose: 30,
    benchmarkDays: 20,
    ...overrides,
  };
}

describe("buildDealVerdict", () => {
  it("leads with the guardrail, because that is the mechanical consequence", () => {
    const v = buildDealVerdict(input({ openRedAlerts: 2, riskLevel: "HIGH" }));
    expect(v.tone).toBe("critical");
    expect(v.sentence).toBe(
      "2 red alerts are open — the stage guardrail holds until they are dispositioned.",
    );
    expect(v.panel).toBe("alerts");
  });

  it("outranks everything else with a red alert", () => {
    // A deal can be red, overdue, stalled and unvalidated at once. The reader
    // only needs the one that is stopping them.
    const v = buildDealVerdict(
      input({ openRedAlerts: 1, daysToClose: -40, gatesPct: 0, daysInStage: 200 }),
    );
    expect(v.sentence).toContain("red alert");
  });

  it("reports an overdue close date next", () => {
    const v = buildDealVerdict(input({ daysToClose: -9 }));
    expect(v.tone).toBe("critical");
    expect(v.sentence).toBe("9 days past its close date and still in Validation.");
    expect(v.panel).toBe("stage");
  });

  it("calls a deal stalled on the same line the roster does", () => {
    // deriveVelocityBucket escalates to STALLED past twice the benchmark. Using
    // a different threshold here would let the card say "Stalled" and the Brief
    // say nothing, about the same deal, on the same tap.
    expect(buildDealVerdict(input({ daysInStage: 41, benchmarkDays: 20 })).sentence).toBe(
      "Stalled in Validation — 41 days against a 20-day benchmark.",
    );
    expect(buildDealVerdict(input({ daysInStage: 40, benchmarkDays: 20 })).tone).not.toBe("critical");
  });

  it("does not invent a benchmark it does not have", () => {
    // benchmarkDays is null when the stage has no usable comparison — a closed
    // stage, or the only open deal in it. Treating null as 0 would make every
    // such deal permanently "stalled".
    expect(buildDealVerdict(input({ daysInStage: 900, benchmarkDays: null })).tone).not.toBe(
      "critical",
    );
    expect(buildDealVerdict(input({ daysInStage: 900, benchmarkDays: 0 })).tone).not.toBe(
      "critical",
    );
  });

  it("says a yellow alert is open and says it is not blocking", () => {
    const v = buildDealVerdict(input({ openYellowAlerts: 3 }));
    expect(v.tone).toBe("caution");
    expect(v.sentence).toBe("3 alerts open, none of them blocking.");
    expect(v.panel).toBe("alerts");
  });

  it("distinguishes no gates cleared from partially cleared", () => {
    expect(buildDealVerdict(input({ gatesPct: 0, daysInStage: 30 })).sentence).toBe(
      "No technical gates cleared yet, 30 days into Validation.",
    );
    expect(buildDealVerdict(input({ gatesPct: 40 })).sentence).toBe(
      "Technical validation is 40% through — behind where Validation expects it.",
    );
  });

  it("still reports elevated risk when nothing is open", () => {
    const v = buildDealVerdict(input({ riskLevel: "ELEVATED" }));
    expect(v.tone).toBe("caution");
    expect(v.sentence).toBe("No open alerts, but the risk model still reads elevated.");
    expect(v.panel).toBe("score");
  });

  it("credits work already done when everything is clear", () => {
    expect(buildDealVerdict(input()).sentence).toBe("Nothing is blocking this deal.");
    expect(buildDealVerdict(input({ managedAlerts: 2 })).sentence).toBe(
      "Nothing open — 2 alerts already managed.",
    );
    expect(buildDealVerdict(input({ managedAlerts: 1 })).sentence).toBe(
      "Nothing open — 1 alert already managed.",
    );
  });

  it("agrees with itself about singular and plural", () => {
    expect(buildDealVerdict(input({ openRedAlerts: 1 })).sentence).toBe(
      "1 red alert is open — the stage guardrail holds until it is dispositioned.",
    );
    expect(buildDealVerdict(input({ daysToClose: -1 })).sentence).toBe(
      "1 day past its close date and still in Validation.",
    );
  });

  it("only ever points at a panel that exists", () => {
    const panelIds = new Set(DEAL_PANELS.map((p) => p.id));
    const cases: Partial<DealVerdictInput>[] = [
      { openRedAlerts: 1 },
      { daysToClose: -3 },
      { daysInStage: 99, benchmarkDays: 10 },
      { openYellowAlerts: 1 },
      { gatesPct: 0 },
      { gatesPct: 20 },
      { riskLevel: "HIGH" },
      {},
    ];
    for (const c of cases) {
      const { panel, sentence } = buildDealVerdict(input(c));
      if (panel != null) expect(panelIds.has(panel), panel).toBe(true);
      expect(sentence.endsWith(".")).toBe(true);
    }
  });
});
