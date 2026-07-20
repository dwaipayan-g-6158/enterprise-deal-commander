// Ramp Deal Pricing TCV (V2 F13) — pure & isomorphic.
//
// When a multi-year pricing schedule exists, TCV is the sum of each year's
// net product revenue (after that year's discount) plus services. Otherwise it
// falls back to the V1 flat calculation.

export interface PricingYear {
  yearNumber: number;
  productRevenue: number;
  servicesRevenue: number;
  discountPct?: number | null;
}

export interface FlatPricingInput {
  productRevenue: number;
  servicesRevenue: number;
  contractTermYears: number;
  pricingModel: string;
}

/** Net revenue for a single ramp year: product×(1-discount%) + services. */
export function yearNetRevenue(year: PricingYear): number {
  const discount = year.discountPct ?? 0;
  return year.productRevenue * (1 - discount / 100) + year.servicesRevenue;
}

/**
 * Flat (V1) TCV — no per-year schedule, just a single product/services figure
 * amortized over the contract term. Shared by `computeRampTCV`'s fallback path
 * and by `processDealIntelligence`'s own `calculatedTCV`, so both the header
 * TCV and any client-side preview of a would-be change (e.g. the Commercial
 * Worksheet's "Apply to Deal" confirmation) are guaranteed to agree.
 */
export function calculateFlatTCV(input: FlatPricingInput): number {
  const base = Number(input.productRevenue) || 0;
  const services = Number(input.servicesRevenue) || 0;
  const term = Number(input.contractTermYears) || 1;
  if (input.pricingModel === "Multi-Year Committed") {
    return base * term + services;
  }
  return base + services;
}

export function computeRampTCV(
  schedule: PricingYear[],
  fallback: FlatPricingInput,
): number {
  if (schedule.length > 0) {
    return schedule.reduce((sum, y) => sum + yearNetRevenue(y), 0);
  }
  return calculateFlatTCV(fallback);
}
