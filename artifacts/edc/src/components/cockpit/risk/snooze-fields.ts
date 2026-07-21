export interface SnoozeField {
  value: string;
  label: string;
}

// Deal fields a snooze can watch for change. `value` is the literal DB
// column name the backend snapshots and re-compares (see the mirrored
// SNOOZE_WATCHABLE_FIELDS in artifacts/api-server/src/lib/snooze-fields.ts).
// Single source of truth for both the cockpit snooze popover and the
// dashboard critical-alerts dialog, so the two surfaces never drift.
export const SNOOZE_FIELDS: SnoozeField[] = [
  { value: "sales_stage_id", label: "Sales stage" },
  { value: "win_probability_pct", label: "Win probability" },
  { value: "expected_close_date", label: "Expected close date" },
  { value: "product_revenue", label: "Product revenue" },
  { value: "services_revenue", label: "Services revenue" },
];

export function snoozeFieldLabel(value: string): string {
  return SNOOZE_FIELDS.find((f) => f.value === value)?.label ?? value;
}
