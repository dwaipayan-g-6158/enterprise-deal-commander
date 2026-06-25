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

export function computeRampTCV(
  schedule: PricingYear[],
  fallback: FlatPricingInput,
): number {
  if (schedule.length > 0) {
    return schedule.reduce((sum, y) => sum + yearNetRevenue(y), 0);
  }
  const base = Number(fallback.productRevenue) || 0;
  const services = Number(fallback.servicesRevenue) || 0;
  const term = Number(fallback.contractTermYears) || 1;
  if (fallback.pricingModel === "Multi-Year Committed") {
    return base * term + services;
  }
  return base + services;
}
