export function money(n: unknown): string {
  return "$" + Math.round(Number(n) || 0).toLocaleString("en-US");
}

/** Round to at most 2 decimal places (e.g. 23.6667 -> 23.67). */
export function round2(n: unknown): number {
  return Math.round((Number(n) || 0) * 100) / 100;
}

/**
 * Format a non-currency metric (cycle time, index, lift multiplier, score,
 * percentage) at at most 2 decimal places, trimming trailing zeros —
 * 23.6667 -> "23.67", 24 -> "24", 0.6 -> "0.6". Not for currency: currency
 * formatting (money, formatCurrency, compactUSD/compactValue) is unaffected.
 */
export function formatNum(n: unknown): string {
  return round2(n).toLocaleString("en-US", { maximumFractionDigits: 2 });
}
