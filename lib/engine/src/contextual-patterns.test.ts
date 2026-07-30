import { describe, it, expect } from "vitest";
import { evaluateCompetitivePatterns } from "./contextual-patterns";

describe("evaluateCompetitivePatterns — LOST_TO_PATTERN polarity", () => {
  it("does NOT fire when we usually win against an active competitor (ourWinRate 0.7)", () => {
    const alerts = evaluateCompetitivePatterns({
      activeCompetitors: 1,
      technicalProgressPct: 80,
      competitorProfiles: [
        { competitorName: "Beatable Co", status: "Active", ourWinRate: 0.7 },
      ],
    });
    expect(alerts.find((a) => a.code === "LOST_TO_PATTERN")).toBeUndefined();
  });

  it("DOES fire when we usually lose against an active competitor (ourWinRate 0.2)", () => {
    const alerts = evaluateCompetitivePatterns({
      activeCompetitors: 1,
      technicalProgressPct: 80,
      competitorProfiles: [
        { competitorName: "Tough Co", status: "Active", ourWinRate: 0.2 },
      ],
    });
    const alert = alerts.find((a) => a.code === "LOST_TO_PATTERN");
    expect(alert).toBeDefined();
    expect(alert!.message).toContain("80%"); // 1 - 0.2 = 0.8 = their win rate against us
  });

  it("boundary: exactly 0.4 (our win rate) still fires; exactly 0.6 does not", () => {
    const at04 = evaluateCompetitivePatterns({
      activeCompetitors: 1, technicalProgressPct: 0,
      competitorProfiles: [{ competitorName: "X", status: "Active", ourWinRate: 0.4 }],
    });
    expect(at04.find((a) => a.code === "LOST_TO_PATTERN")).toBeDefined();
    const at06 = evaluateCompetitivePatterns({
      activeCompetitors: 1, technicalProgressPct: 0,
      competitorProfiles: [{ competitorName: "X", status: "Active", ourWinRate: 0.6 }],
    });
    expect(at06.find((a) => a.code === "LOST_TO_PATTERN")).toBeUndefined();
  });
});
