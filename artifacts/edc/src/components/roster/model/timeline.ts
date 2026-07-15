// Pure timeline model for the board's Timeline view. Buckets the flat,
// already-filtered/sorted rows by month of expectedCloseDate into a horizontal
// rail: Overdue first, months ascending, "No close date" last. No React/JSX so
// it stays node-testable (mirrors model/board.ts).
import type { RosterRow } from "./roster-types";

export type TimelineKind = "overdue" | "month" | "none";

export interface TimelineColumn {
  key: string;
  label: string;
  kind: TimelineKind;
  rows: RosterRow[];
  dealCount: number;
  /** Sum of normalizedTCV across the column (cross-currency comparable). */
  totalTCV: number;
}

const MS_PER_DAY = 86_400_000;

interface Bucket {
  key: string;
  label: string;
  kind: TimelineKind;
  rows: RosterRow[];
  totalTCV: number;
}

/**
 * Group rows by close-date month. A row whose expectedCloseDate is missing or
 * unparseable lands in the trailing "No close date" column; a row whose close
 * date is strictly before `now` lands in the leading "Overdue" column. Rows keep
 * their incoming order within each column (the active roster sort). Empty
 * synthetic columns are omitted.
 */
export function buildTimeline(rows: RosterRow[], now: number): TimelineColumn[] {
  const overdue: Bucket = { key: "overdue", label: "Overdue", kind: "overdue", rows: [], totalTCV: 0 };
  const noDate: Bucket = { key: "none", label: "No close date", kind: "none", rows: [], totalTCV: 0 };
  const months = new Map<string, Bucket>();
  const today = new Date(now);
  const todayStart = new Date(today.getFullYear(), today.getMonth(), today.getDate()).getTime();

  for (const row of rows) {
    const tcv = row.normalizedTCV ?? 0;
    const iso = row.expectedCloseDate;
    const dt = iso ? new Date(iso) : null;
    if (!dt || Number.isNaN(dt.getTime())) {
      noDate.rows.push(row);
      noDate.totalTCV += tcv;
      continue;
    }
    if (dt.getTime() < todayStart) {
      overdue.rows.push(row);
      overdue.totalTCV += tcv;
      continue;
    }
    const key = `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, "0")}`;
    const label = dt.toLocaleDateString("en-US", { month: "short", year: "numeric" });
    const b = months.get(key) ?? { key, label, kind: "month" as const, rows: [], totalTCV: 0 };
    b.rows.push(row);
    b.totalTCV += tcv;
    months.set(key, b);
  }

  const monthCols = [...months.values()].sort((a, b) => a.key.localeCompare(b.key));
  const ordered: Bucket[] = [overdue, ...monthCols, noDate];
  return ordered
    .filter((b) => b.rows.length > 0)
    .map((b) => ({ key: b.key, label: b.label, kind: b.kind, rows: b.rows, dealCount: b.rows.length, totalTCV: b.totalTCV }));
}
