import { describe, expect, it } from "vitest";
import { HEALTH_CLASS, OUTCOME_CLASS, RISK_LEVEL_CLASS } from "../../../lib/semantic-colors";
import { rowAccent, type AccentInput } from "./row-accent";

function row(over: Partial<AccentInput> = {}): AccentInput {
  return { salesStage: "Validation", healthStatus: "YELLOW", riskLevel: null, ...over };
}

describe("rowAccent — live deals", () => {
  it("prefers the 4-state risk level when enrichment has landed", () => {
    expect(rowAccent(row({ riskLevel: "HIGH" }))).toContain(RISK_LEVEL_CLASS.HIGH.borderL);
    expect(rowAccent(row({ riskLevel: "ELEVATED" }))).toContain(RISK_LEVEL_CLASS.ELEVATED.borderL);
  });

  it("falls back to the 3-state health when riskLevel is null", () => {
    expect(rowAccent(row({ riskLevel: null, healthStatus: "RED" }))).toContain(HEALTH_CLASS.RED.borderL);
    expect(rowAccent(row({ riskLevel: null, healthStatus: "YELLOW" }))).toContain(HEALTH_CLASS.YELLOW.borderL);
  });

  // The healthy case has never drawn a stripe; HEALTH_CLASS.GREEN/RISK LOW do
  // carry a real borderL, so this has to stay an explicit empty string.
  it("draws no stripe for the healthy case in either mode", () => {
    expect(rowAccent(row({ riskLevel: "LOW" }))).toBe("");
    expect(rowAccent(row({ riskLevel: null, healthStatus: "GREEN" }))).toBe("");
  });
});

describe("rowAccent — decided deals", () => {
  it("uses the outcome vocabulary instead of the risk ramp", () => {
    expect(rowAccent(row({ salesStage: "Closed-Won" }))).toContain(OUTCOME_CLASS.won.borderL);
    expect(rowAccent(row({ salesStage: "Closed-Lost" }))).toContain(OUTCOME_CLASS.lost.borderL);
  });

  // The whole point of the change: a decided deal is off the risk ramp, so a
  // stale HIGH riskLevel or RED health must not repaint it as a live problem.
  it("outranks both riskLevel and healthStatus", () => {
    const won = rowAccent(row({ salesStage: "Closed-Won", riskLevel: "HIGH", healthStatus: "RED" }));
    expect(won).toContain(OUTCOME_CLASS.won.borderL);
    expect(won).not.toContain(RISK_LEVEL_CLASS.HIGH.borderL);

    const lost = rowAccent(row({ salesStage: "Closed-Lost", riskLevel: "HIGH", healthStatus: "RED" }));
    expect(lost).toContain(OUTCOME_CLASS.lost.borderL);
    expect(lost).not.toContain(RISK_LEVEL_CLASS.HIGH.borderL);
  });

  // Won is a result, not a footnote — only Lost recedes.
  it("mutes Lost rows and leaves Won at full strength", () => {
    expect(rowAccent(row({ salesStage: "Closed-Lost" }))).toContain("opacity-");
    expect(rowAccent(row({ salesStage: "Closed-Won" }))).not.toContain("opacity-");
  });

  it("matches the same stage spellings terminalOutcome accepts", () => {
    expect(rowAccent(row({ salesStage: "closed won" }))).toContain(OUTCOME_CLASS.won.borderL);
    expect(rowAccent(row({ salesStage: "closedlost" }))).toContain(OUTCOME_CLASS.lost.borderL);
  });

  it("treats a missing stage as a live deal", () => {
    expect(rowAccent(row({ salesStage: null, riskLevel: "HIGH" }))).toContain(RISK_LEVEL_CLASS.HIGH.borderL);
  });
});
