// Pure filter -> sort -> group -> subtotals pipeline. Kept side-effect-free and
// `now`-injected so it is fully node-testable. Search + state are handled
// server-side (passed to useListDeals); everything else is client-side because
// the active set is small (10-50 deals) and fully materialized.
import { calendarDaysUntil, daysLeftInLocalQuarter } from "../../../lib/format";
import { terminalOutcome } from "./board";
import { COLUMNS, getComparator } from "./roster-columns";
import type { GroupBy, RosterRow, RosterView, SortSpec } from "./roster-types";

export interface RosterGroup {
  key: string;
  label: string;
  rows: RosterRow[];
  totalTCV: number; // sum of normalizedTCV (cross-currency comparable)
  redCount: number;
}

export interface DerivedRows {
  groups: RosterGroup[]; // one group with key "" when group === "none"
  flat: RosterRow[]; // post-filter+sort, flattened in group/display order
  totalCount: number; // rows before client filters
  matchedCount: number; // rows after client filters
}

const HEALTH_ORDER: Record<string, number> = { RED: 0, YELLOW: 1, GREEN: 2 };

// Cross-currency-comparable TCV, with the same null fallback everywhere it's
// aggregated or compared. The TCV range filter and the group/no-group
// subtotal used to fall back differently (`normalizedTCV ?? calculatedTCV ?? 0`
// vs bare `normalizedTCV ?? 0`), so a deal missing its FX-normalized value
// (MISSING_FX_RATE) would silently drop out of a subtotal while still
// counting toward the filter.
function comparableTCV(row: RosterRow): number {
  return row.normalizedTCV ?? row.calculatedTCV ?? 0;
}

// Calendar-day comparison, delegated to lib/format.ts's calendarDaysUntil so
// this agrees with CloseDateCell's overdue styling and the timeline's Overdue
// column instead of maintaining a fourth copy of the same math. This used to
// do `new Date(iso).getTime() - now` directly, which reads a date-only
// "YYYY-MM-DD" string (expectedCloseDate) as UTC midnight — off by one day in
// every positive-offset zone, so a deal due TODAY read as overdue in IST past
// ~17:30. `quarter` is a real local calendar quarter, not a flat 92-day window
// (Q3 is 92 days but Q4 is often 92, Q1/Q2 vary) — see daysLeftInLocalQuarter.
function closeWithin(iso: string | null | undefined, preset: RosterView["filters"]["closePreset"], now: number): boolean {
  if (preset === "any") return true;
  if (!iso) return false;
  const days = calendarDaysUntil(iso, now);
  if (days == null) return false;
  switch (preset) {
    case "overdue":
      return days < 0;
    case "30d":
      return days >= 0 && days <= 30;
    case "60d":
      return days >= 0 && days <= 60;
    case "90d":
      return days >= 0 && days <= 90;
    case "quarter":
      return days >= 0 && days <= daysLeftInLocalQuarter(now);
    default:
      return true;
  }
}

function passesClosure(row: RosterRow, closure: RosterView["filters"]["closure"]): boolean {
  // Defensive default: saved views / URLs written before this field existed have no
  // `closure` key at all, and should behave exactly as before (open only).
  const mode = closure ?? "open";
  if (mode === "all") return true;
  const isTerminal = terminalOutcome(row.salesStage) != null;
  return mode === "closed" ? isTerminal : !isTerminal;
}

function passesFilters(row: RosterRow, view: RosterView, now: number): boolean {
  const f = view.filters;
  if (!passesClosure(row, f.closure)) return false;
  if (f.stage.length && !f.stage.includes(row.salesStage)) return false;
  if (f.health.length && !f.health.includes(row.healthStatus as never)) return false;
  if (f.velocity.length && !f.velocity.includes(row.velocity)) return false;

  const tcv = comparableTCV(row);
  if (f.tcvMin != null && tcv < f.tcvMin) return false;
  if (f.tcvMax != null && tcv > f.tcvMax) return false;

  if (f.scoreMin != null && (row.score == null || row.score < f.scoreMin)) return false;
  if (f.scoreMax != null && (row.score == null || row.score > f.scoreMax)) return false;

  if (!closeWithin(row.expectedCloseDate, f.closePreset, now)) return false;

  if (f.accountManager.length && !f.accountManager.includes(row.accountManager)) return false;
  if (f.technicalLead.length && !f.technicalLead.includes(row.technicalLead)) return false;

  if (f.hasCompetitors === true && row.competitorId == null) return false;
  if (f.hasCompetitors === false && row.competitorId != null) return false;

  if (f.committed === true && row.committed !== true) return false;
  if (f.committed === false && row.committed === true) return false;

  // Tags now ride along on the deal list payload, so we filter by them here:
  // a row matches if it carries at least one of the selected tag ids (OR).
  if (f.tags.length) {
    const ids = new Set((row.tags ?? []).map((t) => t.id));
    if (!f.tags.some((id) => ids.has(id))) return false;
  }

  return true;
}

function makeMultiComparator(sort: SortSpec[]): (a: RosterRow, b: RosterRow) => number {
  return (a, b) => {
    for (const s of sort) {
      const col = COLUMNS[s.key];
      if (!col) continue;
      const cmp = getComparator(col)(a, b);
      if (cmp !== 0) return s.dir === "desc" ? -cmp : cmp;
    }
    return 0;
  };
}

function groupValue(row: RosterRow, group: GroupBy): string {
  switch (group) {
    case "salesStage":
      return row.salesStage;
    case "healthStatus":
      return row.healthStatus;
    case "accountManager":
      return row.accountManager;
    default:
      return "";
  }
}

function groupSortRank(group: GroupBy, key: string, sampleRow: RosterRow | undefined): number | string {
  if (group === "healthStatus") return HEALTH_ORDER[key] ?? 99;
  if (group === "salesStage") return sampleRow?.salesStageId ?? 99;
  return key; // accountManager — alphabetical
}

export function computeDerivedRows(rows: RosterRow[], view: RosterView, now: number): DerivedRows {
  const filtered = rows.filter((r) => passesFilters(r, view, now));
  const comparator = makeMultiComparator(view.sort);
  const sorted = [...filtered].sort(comparator);

  if (view.group === "none") {
    const totalTCV = sorted.reduce((s, r) => s + comparableTCV(r), 0);
    const redCount = sorted.filter((r) => r.healthStatus === "RED").length;
    return {
      groups: [{ key: "", label: "", rows: sorted, totalTCV, redCount }],
      flat: sorted,
      totalCount: rows.length,
      matchedCount: sorted.length,
    };
  }

  const byKey = new Map<string, RosterRow[]>();
  for (const r of sorted) {
    const k = groupValue(r, view.group);
    const arr = byKey.get(k);
    if (arr) arr.push(r);
    else byKey.set(k, [r]);
  }

  const groups: RosterGroup[] = [...byKey.entries()].map(([key, gRows]) => ({
    key,
    label: key || "—",
    rows: gRows,
    totalTCV: gRows.reduce((s, r) => s + comparableTCV(r), 0),
    redCount: gRows.filter((r) => r.healthStatus === "RED").length,
  }));

  groups.sort((a, b) => {
    const ra = groupSortRank(view.group, a.key, a.rows[0]);
    const rb = groupSortRank(view.group, b.key, b.rows[0]);
    if (typeof ra === "number" && typeof rb === "number") return ra - rb;
    return String(ra).localeCompare(String(rb));
  });

  return {
    groups,
    flat: groups.flatMap((g) => g.rows),
    totalCount: rows.length,
    matchedCount: filtered.length,
  };
}
