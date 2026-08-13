import { describe, expect, it } from "vitest";
import type { Deal } from "@workspace/api-client-react";
import {
  clampTerm,
  clampRevenue,
  revenueHint,
  encodeTerm,
  decodeTerm,
  dealToFormState,
  emptyOrNumber,
  isSameFormState,
  PERPETUAL_TERM_VALUE,
  TERM_YEAR_OPTIONS,
} from "./deal-form-helpers";

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

describe("encodeTerm / decodeTerm", () => {
  it("round-trips every numeric option", () => {
    for (const y of TERM_YEAR_OPTIONS) {
      const encoded = encodeTerm(String(y));
      expect(encoded).toEqual({ contractTermYears: y, isPerpetualTerm: false });
      expect(decodeTerm(encoded.contractTermYears, encoded.isPerpetualTerm)).toBe(String(y));
    }
  });

  it("encodes the perpetual sentinel to a valid filler year plus the flag", () => {
    expect(encodeTerm(PERPETUAL_TERM_VALUE)).toEqual({ contractTermYears: 1, isPerpetualTerm: true });
  });

  it("decodes a perpetual deal back to the sentinel, never '1 year'", () => {
    // The filler contractTermYears=1 must not read back as a plain numeric
    // term — isPerpetualTerm wins regardless of what the filler value is.
    expect(decodeTerm(1, true)).toBe(PERPETUAL_TERM_VALUE);
    expect(decodeTerm(7, true)).toBe(PERPETUAL_TERM_VALUE);
  });

  it("decodes a non-perpetual deal to its numeric option", () => {
    expect(decodeTerm(3, false)).toBe("3");
    expect(decodeTerm(3, undefined)).toBe("3");
  });

  it("decodes an out-of-contract stored value onto a real Select option, never an empty trigger", () => {
    expect(decodeTerm(0, false)).toBe("1");
    expect(decodeTerm(99, false)).toBe("10");
    expect(decodeTerm(NaN, false)).toBe("1");
  });

  it("clamps a non-finite/out-of-range numeric encode into the server contract", () => {
    expect(encodeTerm("0")).toEqual({ contractTermYears: 1, isPerpetualTerm: false });
    expect(encodeTerm("99")).toEqual({ contractTermYears: 10, isPerpetualTerm: false });
    expect(encodeTerm("not-a-number")).toEqual({ contractTermYears: 1, isPerpetualTerm: false });
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

describe("emptyOrNumber", () => {
  const cases: [unknown, number | ""][] = [
    ["", ""],
    [null, ""],
    [undefined, ""],
    ["abc", ""],
    [NaN, ""],
    ["0", 0],
    ["75", 75],
    [1500, 1500],
  ];
  it.each(cases)("emptyOrNumber(%p) === %p", (input, expected) => {
    expect(emptyOrNumber(input)).toBe(expected);
  });

  it("never yields NaN, so a cleared field stays comparable", () => {
    // The whole point: `valueAsNumber: true` turned a cleared box into NaN, and
    // NaN !== NaN made every isSameFormState() check below false forever.
    for (const [input] of cases) {
      expect(Number.isNaN(emptyOrNumber(input))).toBe(false);
    }
  });
});

describe("dealToFormState / isSameFormState", () => {
  const deal = {
    dealName: "Project Atlas",
    accountName: "Acme Corp",
    accountManager: "Ada",
    technicalLead: "Grace",
    salesStageId: 2,
    productRevenue: 100_000,
    servicesRevenue: 20_000,
    dealCurrency: "USD",
  } as Deal;

  it("collapses absent nullable columns to the controlled-input empty string", () => {
    const form = dealToFormState(deal);
    expect(form.crm_record_url).toBe("");
    expect(form.win_probability_pct).toBe("");
    expect(form.estimated_log_sources).toBe("");
    expect(form.competitor_id).toBe("");
  });

  it("supplies the same fallbacks the form's own defaults use", () => {
    const form = dealToFormState(deal);
    expect(form.contract_term_years).toBe(1);
    expect(form.is_perpetual_term).toBe(false);
    expect(form.pricing_model_id).toBe(0);
    expect(form.committed).toBe(false);
  });

  it("truncates the date columns to the yyyy-mm-dd the pickers expect", () => {
    const form = dealToFormState({
      ...deal,
      expectedCloseDate: "2026-08-14T00:00:00.000Z",
      landedAt: "2026-01-02T09:30:00.000Z",
    } as Deal);
    expect(form.expected_close_date).toBe("2026-08-14");
    expect(form.landed_at).toBe("2026-01-02");
  });

  it("matches an identical projection and separates a changed one", () => {
    expect(isSameFormState(dealToFormState(deal), dealToFormState(deal))).toBe(true);
    expect(
      isSameFormState(
        dealToFormState(deal),
        dealToFormState({ ...deal, productRevenue: 500_000 } as Deal),
      ),
    ).toBe(false);
  });
});
