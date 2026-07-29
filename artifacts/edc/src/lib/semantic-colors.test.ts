import { describe, expect, it } from "vitest";
import {
  classifyRisk,
  healthToRiskLevel,
  RISK_LEVEL_CLASS,
  RISK_LEVEL_SHORT_LABEL,
  HEALTH_CLASS,
  OUTCOME_CLASS,
  RISK_LEVEL_HSL,
  HEALTH_HSL,
  BRIEFING_HEALTH_HEX,
  BRIEFING_OUTCOME_HEX,
  type RiskLevel,
  type Health,
} from "./semantic-colors";

const RISK_LEVELS: RiskLevel[] = ["LOW", "MODERATE", "ELEVATED", "HIGH"];
const HEALTHS: Health[] = ["GREEN", "YELLOW", "RED"];

describe("key completeness", () => {
  it("RISK_LEVEL_CLASS has every slot for every level", () => {
    for (const level of RISK_LEVELS) {
      const cls = RISK_LEVEL_CLASS[level];
      for (const slot of ["text", "bg", "border", "fill", "dot", "borderL", "cell"] as const) {
        expect(cls[slot]).toBeTruthy();
      }
    }
  });

  it("RISK_LEVEL_SHORT_LABEL has every level", () => {
    for (const level of RISK_LEVELS) {
      expect(RISK_LEVEL_SHORT_LABEL[level]).toBeTruthy();
    }
  });

  it("HEALTH_CLASS and HEALTH_HSL have all 3 health states", () => {
    for (const h of HEALTHS) {
      expect(HEALTH_CLASS[h]).toBeTruthy();
      expect(HEALTH_HSL[h]).toBeTruthy();
    }
  });

  it("OUTCOME_CLASS has both outcomes", () => {
    expect(OUTCOME_CLASS.won).toBeTruthy();
    expect(OUTCOME_CLASS.lost).toBeTruthy();
  });
});

describe("derivation invariant — health can never drift from risk", () => {
  it("HEALTH_CLASS[h] is exactly RISK_LEVEL_CLASS[healthToRiskLevel(h)]", () => {
    for (const h of HEALTHS) {
      expect(HEALTH_CLASS[h]).toEqual(RISK_LEVEL_CLASS[healthToRiskLevel(h)]);
    }
  });

  it("HEALTH_HSL[h] is exactly RISK_LEVEL_HSL[healthToRiskLevel(h)]", () => {
    for (const h of HEALTHS) {
      expect(HEALTH_HSL[h]).toBe(RISK_LEVEL_HSL[healthToRiskLevel(h)]);
    }
  });
});

describe("semantic assertions — the actual bug fix, pinned", () => {
  it("LOW/GREEN is sky, never emerald/green/teal", () => {
    const allLow = Object.values(RISK_LEVEL_CLASS.LOW).join(" ");
    expect(allLow).toMatch(/sky-/);
    expect(allLow).not.toMatch(/emerald|green-|teal-/);
  });

  it("won is emerald", () => {
    expect(Object.values(OUTCOME_CLASS.won).join(" ")).toMatch(/emerald/);
  });

  it("lost is slate, never rose/red/destructive", () => {
    const allLost = Object.values(OUTCOME_CLASS.lost).join(" ");
    expect(allLost).toMatch(/slate-/);
    expect(allLost).not.toMatch(/rose|red-|destructive/);
  });

  it("MODERATE/ELEVATED/HIGH are unchanged from the pre-existing palette", () => {
    expect(Object.values(RISK_LEVEL_CLASS.MODERATE).join(" ")).toMatch(/amber-/);
    expect(Object.values(RISK_LEVEL_CLASS.ELEVATED).join(" ")).toMatch(/orange-/);
    expect(Object.values(RISK_LEVEL_CLASS.HIGH).join(" ")).toMatch(/red-/);
  });
});

describe("print-literal guard — briefing export must stay static hex", () => {
  const HEX_RE = /^#[0-9A-Fa-f]{6}$/;

  it("every BRIEFING_HEALTH_HEX value is a bare hex literal", () => {
    for (const h of HEALTHS) {
      const v = BRIEFING_HEALTH_HEX[h];
      expect(v).toMatch(HEX_RE);
      expect(v).not.toMatch(/var\(|oklch\(/);
    }
  });

  it("every BRIEFING_OUTCOME_HEX value is a bare hex literal", () => {
    for (const v of Object.values(BRIEFING_OUTCOME_HEX)) {
      expect(v).toMatch(HEX_RE);
      expect(v).not.toMatch(/var\(|oklch\(/);
    }
  });
});

describe("classifyRisk boundaries (pins scoreColor's threshold equivalence)", () => {
  it.each([
    [0, "LOW"],
    [25, "LOW"],
    [26, "MODERATE"],
    [50, "MODERATE"],
    [51, "ELEVATED"],
    [75, "ELEVATED"],
    [76, "HIGH"],
    [100, "HIGH"],
  ] as const)("classifyRisk(%i) === %s", (score, expected) => {
    expect(classifyRisk(score)).toBe(expected);
  });
});
