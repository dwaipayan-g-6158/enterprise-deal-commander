import { describe, expect, it } from "vitest";
import { isPerpetualModel, clampTerm, clampRevenue, revenueHint } from "./deal-form-helpers";

const MODELS = [
  { id: 1, modelName: "Annual Subscription" },
  { id: 2, modelName: "Multi-Year Committed" },
  { id: 3, modelName: "Perpetual License" },
  { id: 4, modelName: "Usage-Based" },
];

describe("isPerpetualModel", () => {
  it("matches the Perpetual License row by id", () => {
    expect(isPerpetualModel(MODELS, 3)).toBe(true);
  });
  it("is false for other models", () => {
    expect(isPerpetualModel(MODELS, 1)).toBe(false);
    expect(isPerpetualModel(MODELS, 2)).toBe(false);
    expect(isPerpetualModel(MODELS, 4)).toBe(false);
  });
  it("is false while the lookup is still loading (models undefined)", () => {
    expect(isPerpetualModel(undefined, 3)).toBe(false);
  });
  it("is false for an unset id", () => {
    expect(isPerpetualModel(MODELS, undefined)).toBe(false);
    expect(isPerpetualModel(MODELS, 0)).toBe(false);
  });
  it("is false for an unknown id", () => {
    expect(isPerpetualModel(MODELS, 999)).toBe(false);
  });
});

describe("clampTerm", () => {
  const cases: [unknown, number][] = [
    [1, 1],
    [10, 10],
    [3, 3],
    [0, 1],
    [11, 10],
    [-5, 1],
    [NaN, 1],
    [Infinity, 1],
    [-Infinity, 1],
    ["", 1],
    [undefined, 1],
    [2.6, 3],
  ];
  it.each(cases)("clampTerm(%p) === %p", (input, expected) => {
    expect(clampTerm(input)).toBe(expected);
  });

  it("always satisfies the server contract (integer, 1-10)", () => {
    // Mirrors CreateDealBody.contract_term_years: zod.number().min(1).max(10)
    // (lib/api-zod/src/generated/api.ts). Not imported directly here — api-zod
    // isn't a dependency of this package — but the bound is restated exactly.
    for (const [input] of cases) {
      const result = clampTerm(input);
      expect(Number.isInteger(result)).toBe(true);
      expect(result).toBeGreaterThanOrEqual(1);
      expect(result).toBeLessThanOrEqual(10);
    }
  });
});

describe("clampRevenue", () => {
  const cases: [unknown, number][] = [
    [0, 0],
    [400, 400],
    [1234.56, 1234.56],
    [-5, 0],
    [-Infinity, 0],
    [NaN, 0],
    [Infinity, 0],
    ["", 0],
    [undefined, 0],
  ];
  it.each(cases)("clampRevenue(%p) === %p", (input, expected) => {
    expect(clampRevenue(input)).toBe(expected);
  });

  it("always satisfies the server contract (number, minimum 0)", () => {
    // Mirrors UpdateDealBody.product_revenue/services_revenue:
    // zod.number().min(0).optional() (lib/api-zod/src/generated/api.ts).
    for (const [input] of cases) {
      const result = clampRevenue(input);
      expect(Number.isFinite(result)).toBe(true);
      expect(result).toBeGreaterThanOrEqual(0);
    }
  });
});

describe("revenueHint", () => {
  it("is null for empty/invalid/zero/sub-1000 input", () => {
    expect(revenueHint(NaN)).toBeNull();
    expect(revenueHint("")).toBeNull();
    expect(revenueHint(undefined)).toBeNull();
    expect(revenueHint(0)).toBeNull();
    expect(revenueHint(999)).toBeNull();
  });
  it("formats compact values at and above 1000", () => {
    expect(revenueHint(1000)).toBe("= $1K");
    expect(revenueHint(10000)).toBe("= $10K");
    expect(revenueHint(1500)).toBe("= $1.5K");
    expect(revenueHint(1234567)).toBe("= $1.2M");
  });
  it("renders negatives so an out-of-contract value is visible", () => {
    expect(revenueHint(-10000)).toBe("= -$10K");
  });
});
