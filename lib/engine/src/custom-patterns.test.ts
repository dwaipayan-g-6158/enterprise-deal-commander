import { describe, it, expect } from "vitest";
import {
  evaluateCondition,
  requiresComparisonValue,
  type CustomOperator,
} from "./custom-patterns";

const ALL_OPERATORS: CustomOperator[] = [
  "gt",
  "lt",
  "gte",
  "lte",
  "eq",
  "neq",
  "contains",
  "not_contains",
  "is_null",
  "is_not_null",
];

describe("requiresComparisonValue", () => {
  it("is false only for is_null/is_not_null, whose comparison is never read", () => {
    expect(requiresComparisonValue("is_null")).toBe(false);
    expect(requiresComparisonValue("is_not_null")).toBe(false);
  });

  it("is true for every other operator", () => {
    const others = ALL_OPERATORS.filter(
      (o) => o !== "is_null" && o !== "is_not_null",
    );
    expect(others).toEqual([
      "gt",
      "lt",
      "gte",
      "lte",
      "eq",
      "neq",
      "contains",
      "not_contains",
    ]);
    for (const op of others) {
      expect(requiresComparisonValue(op)).toBe(true);
    }
  });

  it("covers all 10 CustomOperator values (fails loudly if a new one is ever added)", () => {
    expect(ALL_OPERATORS).toHaveLength(10);
  });
});

// Regression tests locking in the exact runtime behavior that
// requiresComparisonValue's guard exists to prevent — see the doc comment on
// requiresComparisonValue for the full reasoning.
describe("evaluateCondition with a blank comparisonValue", () => {
  it("gt/lt/gte/lte can never match — asNumber('') is null, so `numeric` is false and the hard-coded `false` branch fires", () => {
    for (const op of ["gt", "lt", "gte", "lte"] as CustomOperator[]) {
      expect(evaluateCondition(100, op, "")).toBe(false);
      expect(evaluateCondition(0, op, "")).toBe(false);
      expect(evaluateCondition(-5, op, "")).toBe(false);
    }
  });

  it("not_contains can never match — every string includes '', so !includes('') is always false", () => {
    expect(evaluateCondition("Negotiation", "not_contains", "")).toBe(false);
    expect(evaluateCondition("", "not_contains", "")).toBe(false);
    expect(evaluateCondition(null, "not_contains", "")).toBe(false);
  });

  it("contains always matches — every string includes '' — a silent no-op, not a dead condition", () => {
    expect(evaluateCondition("Negotiation", "contains", "")).toBe(true);
    expect(evaluateCondition("", "contains", "")).toBe(true);
    expect(evaluateCondition(null, "contains", "")).toBe(true);
  });

  it("eq/neq fall through to string comparison against '' — only true for a field that is itself null/undefined/blank", () => {
    expect(evaluateCondition(42, "eq", "")).toBe(false);
    expect(evaluateCondition("Negotiation", "eq", "")).toBe(false);
    expect(evaluateCondition(null, "eq", "")).toBe(true);
    expect(evaluateCondition(undefined, "eq", "")).toBe(true);
    expect(evaluateCondition("", "eq", "")).toBe(true);

    expect(evaluateCondition(42, "neq", "")).toBe(true);
    expect(evaluateCondition("Negotiation", "neq", "")).toBe(true);
    expect(evaluateCondition(null, "neq", "")).toBe(false);
  });

  it("is_null/is_not_null never look at comparisonValue at all", () => {
    expect(evaluateCondition(null, "is_null", "")).toBe(true);
    expect(evaluateCondition(null, "is_null", "anything")).toBe(true);
    expect(evaluateCondition(5, "is_not_null", "")).toBe(true);
    expect(evaluateCondition(5, "is_not_null", "anything")).toBe(true);
  });
});
