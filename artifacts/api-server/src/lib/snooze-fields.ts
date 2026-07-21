import type { enterpriseDeals } from "@workspace/db";

// Deal fields a snooze can watch for change, keyed by their DB column name
// (snake_case, matching the string the client sends and the disposition
// stores verbatim). Shared between the write path (dispositions.ts, which
// snapshots the current value) and the read path (intelligence.ts, which
// compares the current value against that snapshot to detect a change).
export const SNOOZE_WATCHABLE_FIELDS = [
  "sales_stage_id",
  "win_probability_pct",
  "expected_close_date",
  "product_revenue",
  "services_revenue",
] as const;

export type SnoozeWatchableField = (typeof SNOOZE_WATCHABLE_FIELDS)[number];

type DealRow = typeof enterpriseDeals.$inferSelect;

const FIELD_ACCESSORS: Record<SnoozeWatchableField, (deal: DealRow) => string> = {
  sales_stage_id: (d) => String(d.salesStageId),
  win_probability_pct: (d) => String(d.winProbabilityPct),
  expected_close_date: (d) => String(d.expectedCloseDate),
  product_revenue: (d) => String(d.productRevenue),
  services_revenue: (d) => String(d.servicesRevenue),
};

export function isSnoozeWatchableField(
  field: string,
): field is SnoozeWatchableField {
  return (SNOOZE_WATCHABLE_FIELDS as readonly string[]).includes(field);
}

/** Stringified current value of a watched field, or null if the field name is unrecognized. */
export function snapshotFieldValue(field: string, deal: DealRow): string | null {
  if (!isSnoozeWatchableField(field)) return null;
  return FIELD_ACCESSORS[field](deal);
}
