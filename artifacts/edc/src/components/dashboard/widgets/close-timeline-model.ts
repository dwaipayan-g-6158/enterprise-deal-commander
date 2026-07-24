// Close Timeline — pure bucketing model. No React/JSX so it stays
// node-testable, mirroring the pipeline-risk.ts / roster board.ts split.
// NOTE: terminalOutcome is imported via a relative path, not the "@/" alias —
// this file's vitest config (vitest.config.ts) is a standalone config with no
// resolve.alias, so a value import through "@/..." would fail to resolve at
// test runtime even though tsc (which does read tsconfig `paths`) would be
// fine with it.
import { terminalOutcome } from "../../roster/model/board";
import type { Health } from "./_shared";

export interface TimelineDeal {
  id: string;
  accountName: string;
  salesStage: string | null | undefined;
  // Optional (not just nullable): the generated `Deal` type declares this key
  // itself optional (`expectedCloseDate?: string | null`), and a required
  // property typed `T | undefined` is NOT assignable-from an optional `T`
  // property in TS's structural check ("optional in source but required in
  // target") — so this has to mirror that optionality, not just the value's
  // nullability, for `buildTimeline(deals, ...)` to accept `Deal[]` directly.
  expectedCloseDate?: string | null;
  normalizedTCV?: number | null;
  calculatedTCV?: number | null;
  healthStatus?: string | null;
}

export interface TimelineBucket {
  key: string; // "overdue" for the overdue bucket, else "YYYY-MM"
  label: string; // "Overdue" or e.g. "Apr 2026"
  deals: { id: string; accountName: string; tcv: number; health: Health }[];
  tcv: number;
}

export interface Timeline {
  overdue: TimelineBucket | null;
  months: TimelineBucket[];
  noDateCount: number;
  redTcv: number;
}

const DATE_ONLY_RE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Year/month (month 0-indexed) a close-date string buckets into, or null when
 * missing/unparseable. Bare `YYYY-MM-DD` strings are read directly out of the
 * string rather than round-tripped through `new Date(...)`: for a date-only
 * string `new Date(...)` parses as UTC midnight, and reading it back with
 * local-time getters (`.getFullYear()`/`.getMonth()`) can roll it back a
 * month for any timezone west of UTC. Anything else (e.g. a full ISO
 * datetime) falls back to `new Date(...)` parsing, matching prior behavior.
 */
function parseYearMonth(iso: string): { year: number; month: number } | null {
  if (DATE_ONLY_RE.test(iso)) {
    return { year: Number(iso.slice(0, 4)), month: Number(iso.slice(5, 7)) - 1 };
  }
  const dt = new Date(iso);
  if (Number.isNaN(dt.getTime())) return null;
  return { year: dt.getFullYear(), month: dt.getMonth() };
}

function monthKey(year: number, month: number): string {
  return `${year}-${String(month + 1).padStart(2, "0")}`;
}

function monthLabel(year: number, month: number): string {
  // Built from explicit y/m/d components (not a parsed string), so there's no
  // UTC-midnight rollback risk here.
  return new Date(year, month, 1).toLocaleDateString("en-US", { month: "short", year: "numeric" });
}

/**
 * Buckets deals into an "Overdue" bucket + one bucket per (future-or-current)
 * month, excluding closed (won/lost) deals entirely. `now` is always injected
 * (never `Date.now()`/`new Date()` internally) so this stays testable with a
 * fixed clock; the caller (the component) is the only place allowed to pass
 * the real current time.
 */
export function buildTimeline(deals: TimelineDeal[], now: Date): Timeline {
  const currentKey = monthKey(now.getFullYear(), now.getMonth());

  const monthBuckets = new Map<string, TimelineBucket>();
  const overdueDeals: TimelineBucket["deals"] = [];
  let overdueTcv = 0;
  let noDateCount = 0;
  let redTcv = 0;

  for (const d of deals) {
    // Skip closed deals FIRST — before RED-health accumulation and before the
    // no-date count — so a closed RED deal, or a closed deal with no close
    // date, never contaminates `redTcv` / `noDateCount`. Mirrors the engine's
    // own NO_CLOSE_DATE risk pattern, which similarly exempts Closed-Won /
    // Closed-Lost (lib/engine/src/index.ts, read-only reference).
    if (terminalOutcome(d.salesStage) != null) continue;

    const tcv = d.normalizedTCV ?? d.calculatedTCV ?? 0;
    const health = d.healthStatus as Health;
    if (health === "RED") redTcv += tcv;

    if (!d.expectedCloseDate) {
      noDateCount++;
      continue;
    }
    const parsed = parseYearMonth(d.expectedCloseDate);
    if (!parsed) {
      noDateCount++;
      continue;
    }

    const key = monthKey(parsed.year, parsed.month);
    const entry = { id: d.id, accountName: d.accountName, tcv, health };
    if (key < currentKey) {
      overdueDeals.push(entry);
      overdueTcv += tcv;
    } else {
      const bucket = monthBuckets.get(key) ?? { key, label: monthLabel(parsed.year, parsed.month), deals: [], tcv: 0 };
      bucket.deals.push(entry);
      bucket.tcv += tcv;
      monthBuckets.set(key, bucket);
    }
  }

  const months = [...monthBuckets.values()].sort((a, b) => a.key.localeCompare(b.key));
  for (const bucket of months) bucket.deals.sort((a, b) => b.tcv - a.tcv);
  overdueDeals.sort((a, b) => b.tcv - a.tcv);

  const overdue: TimelineBucket | null =
    overdueDeals.length > 0 ? { key: "overdue", label: "Overdue", deals: overdueDeals, tcv: overdueTcv } : null;

  return { overdue, months, noDateCount, redTcv };
}
