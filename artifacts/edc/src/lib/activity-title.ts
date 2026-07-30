// What one `edc_v2.deal_activity_log` row says, in one place.
//
// Four surfaces render the portfolio/deal activity feed — the cockpit's Record
// -> History Timeline (components/cockpit/history/adapters.ts), the dashboard's
// Recent Activity card, and the DailyBar's Today and Welcome Back popovers. All
// four used to print `event.summary` verbatim, which is right for every event
// type except one.
//
// This lives in lib/ rather than under components/cockpit/ so the dashboard
// widgets don't have to import cockpit internals (and vice versa) — the same
// reasoning that moved humanizeCode/relativeTime into lib/format.ts. Imports
// here are RELATIVE: this module is reachable from *.test.ts files and
// vitest.config.ts is standalone with no resolve.alias, so "@/" would resolve
// under tsc but fail at test runtime.
import { humanizeEventType, humanizeField } from "./format";

/** The subset of the generated `ActivityEvent` a title depends on. */
export interface ActivityTitleInput {
  eventType: string;
  summary?: string | null;
  metadata?: Record<string, unknown> | null;
}

export interface ActivityTitleOptions {
  /**
   * How many changed fields to name before falling back to a count.
   *
   * Defaults to 1, which is right for an expandable row: the cockpit timeline
   * lists the fields underneath, so the title only needs to disambiguate the
   * single-field case. Terminal rows with nowhere to expand (the dashboard
   * card, the DailyBar popovers) pass a higher number, because there naming
   * two or three fields is the only chance to say which ones changed.
   */
  maxNamedFields?: number;
}

/** "salesStageId" → "Sales Stage". */
export function humanizeCamelField(field: string): string {
  return fieldLabel(field.replace(/([a-z0-9])([A-Z])/g, "$1_$2").toLowerCase());
}

/**
 * Audit/activity columns whose humanizeField() output reads badly. Overrides
 * only — anything absent falls through, so this stays short.
 *
 * Lives here rather than in format.ts because it is this log's vocabulary, not
 * a general formatting rule; humanizeField has to stay generic.
 */
const FIELD_LABELS: Record<string, string> = {
  // "Win Probability Pct" — the unit is already in the formatted value.
  win_probability_pct: "Win Probability",
  // Acronyms humanizeField can't know about; it would title-case these to
  // "Crm Record Url" / "Ad360 Seat Count".
  crm_record_url: "CRM Record URL",
  ad360_seat_count: "AD360 Seat Count",
  ad360_feature_notes: "AD360 Feature Notes",
};

/** An audit/activity column name as a person reads it. */
export function fieldLabel(field: string): string {
  return FIELD_LABELS[field] ?? humanizeField(field);
}

/** Field names in `deal.updated` metadata are camelCase (Object.keys(updates)). */
export function changedFieldNames(
  metadata: Record<string, unknown> | null | undefined,
): string[] {
  const raw = metadata?.changedFields;
  if (!Array.isArray(raw)) return [];
  return raw.filter((f): f is string => typeof f === "string" && f.length > 0);
}

/** "A, B and C" — Oxford-less, matching how the rest of the app reads. */
function joinNames(names: string[]): string {
  if (names.length <= 1) return names[0] ?? "";
  return `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`;
}

/**
 * The human-facing title for one activity row.
 *
 * `deal.updated` is the ONE event whose server-side summary is unusable: the
 * emitter writes `Object.keys(updates).join(", ")`, so a full-form save reads
 * "Updated dealName, accountName, crmRecordUrl, accountManager, technicalLead,
 * salesStageId, …" — twenty raw camelCase identifiers. Every other event type
 * gets a hand-written plain-English summary server-side, so this returns those
 * untouched rather than second-guessing them.
 */
export function activityTitle(
  event: ActivityTitleInput,
  options: ActivityTitleOptions = {},
): string {
  const fallback = event.summary?.trim() || humanizeEventType(event.eventType);
  if (event.eventType !== "deal.updated") return fallback;

  const fields = changedFieldNames(event.metadata);
  if (fields.length === 0) return fallback;

  const maxNamed = options.maxNamedFields ?? 1;
  if (fields.length <= maxNamed) {
    return `Changed ${joinNames(fields.map(humanizeCamelField))}`;
  }
  return `Updated ${fields.length} fields`;
}
