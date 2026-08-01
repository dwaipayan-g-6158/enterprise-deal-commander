// Pure helpers for change-log-settings.tsx (Task 8 / G1). Split out so the
// "can this row be rolled back" predicate and the value/filename rendering
// are unit-testable without rendering the component or mocking the
// generated hooks — same precedent as scoring-weights-model.ts (Task 3) and
// settings-model.ts (Task 7).

/**
 * Mirrors the exact server-side gate in api-server's
 * routes/settings-audit.ts POST /settings/change-log/:id/rollback handler
 * (~lines 75-81): only engine_thresholds' own "update" entries can be
 * rolled back automatically today (a single parameterKey/parameterValue
 * upsert — every other module is an entity table or a composite fx_rates
 * key that needs its own per-module unpacking, deferred per this plan's
 * Global Constraints). Every other module/action combination 409s
 * server-side, so the UI must never render an enabled control for them —
 * this predicate is the single source of truth both the row action and the
 * disabled-button tooltip read from, so they can't drift apart.
 */
export function canRollback(module: string, action: string): boolean {
  return module === "engine_thresholds" && action === "update";
}

/**
 * Renders a change-log oldValue/newValue for display. Both are typed
 * `unknown` (jsonb columns) — engine_thresholds values are plain
 * strings/numbers at the storage layer, but other modules log full entity
 * snapshots as objects/arrays, which would otherwise print as the
 * unreadable "[object Object]" through a bare template string.
 */
export function formatChangeValue(value: unknown): string {
  if (value === null || value === undefined) return "—"; // em dash
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

/**
 * "edc-settings-export-2026-08-01.json" for a given ISO instant/date-only
 * string — only the date portion is used so repeated exports in one day
 * share a filename (browsers append " (1)" rather than silently
 * overwriting) and the folder sorts chronologically.
 */
export function buildExportFilename(dateISO: string): string {
  return `edc-settings-export-${dateISO.slice(0, 10)}.json`;
}
