import { describe, it, expect } from "vitest";
import {
  classifyRisk,
  RISK_LEVEL_LABEL,
  RISK_LEVEL_CLASS,
  healthToRiskLevel,
  sortDimensionsDesc,
  sortActions,
  extractDealRisk,
} from "./risk-model";

describe("classifyRisk", () => {
  it("maps boundary scores to correct levels", () => {
    expect(classifyRisk(0)).toBe("LOW");
    expect(classifyRisk(25)).toBe("LOW");
    expect(classifyRisk(26)).toBe("MODERATE");
    expect(classifyRisk(50)).toBe("MODERATE");
    expect(classifyRisk(51)).toBe("ELEVATED");
    expect(classifyRisk(75)).toBe("ELEVATED");
    expect(classifyRisk(76)).toBe("HIGH");
    expect(classifyRisk(100)).toBe("HIGH");
  });
});

describe("RISK_LEVEL_LABEL", () => {
  it("has all 4 risk level keys", () => {
    expect(Object.keys(RISK_LEVEL_LABEL).sort()).toEqual(
      ["ELEVATED", "HIGH", "LOW", "MODERATE"]
    );
  });
});

describe("RISK_LEVEL_CLASS", () => {
  it("has all 4 risk level keys", () => {
    expect(Object.keys(RISK_LEVEL_CLASS).sort()).toEqual(
      ["ELEVATED", "HIGH", "LOW", "MODERATE"]
    );
  });
});

describe("healthToRiskLevel", () => {
  it("maps health states to risk levels", () => {
    expect(healthToRiskLevel("RED")).toBe("HIGH");
    expect(healthToRiskLevel("YELLOW")).toBe("MODERATE");
    expect(healthToRiskLevel("GREEN")).toBe("LOW");
  });
});

describe("sortDimensionsDesc", () => {
  it("orders dimensions by score descending", () => {
    const dims = [
      { name: "A", score: 40 },
      { name: "B", score: 80 },
      { name: "C", score: 20 },
    ];
    const sorted = sortDimensionsDesc(dims);
    expect(sorted.map((d) => d.score)).toEqual([80, 40, 20]);
  });

  it("does not mutate the input array", () => {
    const dims = [
      { name: "A", score: 40 },
      { name: "B", score: 80 },
    ];
    const original = [...dims];
    sortDimensionsDesc(dims);
    expect(dims).toEqual(original);
  });
});

describe("sortActions", () => {
  it("orders actions BLOCKER < CRITICAL < HIGH < MEDIUM < LOW", () => {
    const actions = [
      { priority: "LOW" as const, action: "a" },
      { priority: "HIGH" as const, action: "b" },
      { priority: "BLOCKER" as const, action: "c" },
      { priority: "MEDIUM" as const, action: "d" },
      { priority: "CRITICAL" as const, action: "e" },
    ];
    const sorted = sortActions(actions);
    expect(sorted.map((a) => a.priority)).toEqual([
      "BLOCKER", "CRITICAL", "HIGH", "MEDIUM", "LOW",
    ]);
  });

  it("does not mutate the input array", () => {
    const actions = [
      { priority: "LOW" as const, action: "x" },
      { priority: "BLOCKER" as const, action: "y" },
    ];
    const original = [...actions];
    sortActions(actions);
    expect(actions).toEqual(original);
  });
});

describe("extractDealRisk", () => {
  it("returns null for null", () => {
    expect(extractDealRisk(null)).toBeNull();
  });

  it("returns null for empty object", () => {
    expect(extractDealRisk({})).toBeNull();
  });

  it("returns null when governance exists but has no risk", () => {
    expect(extractDealRisk({ governance: {} })).toBeNull();
  });

  it("returns null when risk.compositeScore is not a number", () => {
    expect(extractDealRisk({ risk: { compositeScore: "x", riskLevel: "HIGH" } })).toBeNull();
  });

  it("returns null when risk.riskLevel is missing", () => {
    expect(extractDealRisk({ risk: { compositeScore: 62 } })).toBeNull();
  });

  it("returns the object for a valid top-level risk", () => {
    const intel = { risk: { compositeScore: 62, riskLevel: "ELEVATED" } };
    const result = extractDealRisk(intel);
    expect(result).not.toBeNull();
    expect(result?.compositeScore).toBe(62);
    expect(result?.riskLevel).toBe("ELEVATED");
  });

  it("returns the object for a valid governance.risk", () => {
    const intel = { governance: { risk: { compositeScore: 10, riskLevel: "LOW" } } };
    const result = extractDealRisk(intel);
    expect(result).not.toBeNull();
    expect(result?.compositeScore).toBe(10);
    expect(result?.riskLevel).toBe("LOW");
  });
});
