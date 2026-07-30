// ---- Dates ------------------------------------------------------------
//
// Renders every absolute date as DD/MM/YYYY (DD/MM/YYYY, HH:MM for
// timestamps). Hand-rolled rather than date-fns (which was declared in
// package.json but never imported anywhere in the repo, and has since been
// removed — see git history for why: the risk here is *parsing*, not
// formatting, so date-fns's format() would still need a hand-written
// date-only parser feeding it; api-server needs the identical format and has
// no date library; and Intl/ICU output is version-dependent, so
// byte-deterministic hand-built strings are testable where
// toLocaleDateString("en-GB") is not).
//
// THE CRITICAL RULE: new Date("2026-08-30") parses as UTC midnight, so
// reading local getters off it is off-by-one in every negative-offset zone.
// A date-only "YYYY-MM-DD" string is therefore NEVER passed through `Date` —
// it's formatted by string surgery on the regex-captured groups. Anything
// else (a full ISO timestamp, a Date, a number) is a real instant and is
// read with local getters, which is correct and matches this app's existing
// toLocaleString() behaviour for timestamps.
//
// This does NOT prohibit the opposite direction: building a `Date` from local
// *parts* (new Date(year, month, day), or plain `new Date()`) and reading
// local getters off it is always safe — the off-by-one only bites when a
// string is handed to the `Date` constructor and re-interpreted as UTC. See
// parseLocalISODate/toLocalISODate/todayISO below, which round-trip a Date
// through local parts for callers (date pickers, "today" defaults) that need
// a calendar day rather than a UTC instant.
export type DateInput = string | number | Date | null | undefined;

const DATE_ONLY_RE = /^(\d{4})-(\d{2})-(\d{2})$/;
interface DateParts {
  y: number;
  mo: number;
  d: number;
  h: number;
  mi: number;
}

const pad2 = (n: number) => String(n).padStart(2, "0");
const pad4 = (n: number) => String(n).padStart(4, "0");

function fromInstant(d: Date): DateParts | null {
  if (!Number.isFinite(d.getTime())) return null;
  return { y: d.getFullYear(), mo: d.getMonth() + 1, d: d.getDate(), h: d.getHours(), mi: d.getMinutes() };
}

function dateParts(value: DateInput): DateParts | null {
  if (value == null) return null;
  if (typeof value === "string") {
    const s = value.trim();
    if (!s) return null;
    const m = DATE_ONLY_RE.exec(s);
    if (m) {
      // Calendar day — string surgery only, `Date` is never constructed.
      const y = Number(m[1]);
      const mo = Number(m[2]);
      const d = Number(m[3]);
      if (y === 0 || mo < 1 || mo > 12 || d < 1 || d > 31) return null;
      return { y, mo, d, h: 0, mi: 0 };
    }
    return fromInstant(new Date(s));
  }
  return fromInstant(value instanceof Date ? value : new Date(value));
}

/** "30/08/2026", or `null` for missing/invalid input. */
export function formatDate(value: DateInput): string | null;
/** "30/08/2026", or `fallback` for missing/invalid input. */
export function formatDate(value: DateInput, fallback: string): string;
export function formatDate(value: DateInput, fallback?: string): string | null {
  const p = dateParts(value);
  return p ? `${pad2(p.d)}/${pad2(p.mo)}/${pad4(p.y)}` : (fallback ?? null);
}

/** "30/08/2026, 22:05" (24h), or `null` for missing/invalid input. */
export function formatDateTime(value: DateInput): string | null;
/** "30/08/2026, 22:05" (24h), or `fallback` for missing/invalid input. */
export function formatDateTime(value: DateInput, fallback: string): string;
export function formatDateTime(value: DateInput, fallback?: string): string | null {
  const p = dateParts(value);
  return p ? `${pad2(p.d)}/${pad2(p.mo)}/${pad4(p.y)}, ${pad2(p.h)}:${pad2(p.mi)}` : (fallback ?? null);
}

/** "22:05" (24h), or `fallback` for missing/invalid input. For rows already
 *  grouped under a day heading, where repeating the date would be noise. */
export function formatTime(value: DateInput, fallback = "—"): string {
  const p = dateParts(value);
  return p ? `${pad2(p.h)}:${pad2(p.mi)}` : fallback;
}

/**
 * Rewrites bare YYYY-MM-DD tokens inside free text to DD/MM/YYYY. Used only
 * at the render boundary for @workspace/engine explanation strings, which
 * must stay pure/isomorphic and therefore never format dates themselves —
 * see risk/risk-presentation.ts formatExplanationValue.
 */
export function humanizeIsoDates(text: string): string {
  return text.replace(/\b(\d{4})-(\d{2})-(\d{2})\b/g, (all, y, mo, d) => {
    const moN = Number(mo);
    const dN = Number(d);
    return moN >= 1 && moN <= 12 && dN >= 1 && dN <= 31 ? `${d}/${mo}/${y}` : all;
  });
}

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

// ---- Humanizing raw identifiers ---------------------------------------
//
// The audit log and the v2 activity log both store raw machine identifiers
// (`sales_stage_id`, `deal.stage_changed`), and those used to be rendered
// verbatim in the Record tab. These turn them into something a person reads.
// humanizeCode/relativeTime were originally defined in
// components/dashboard/widgets/_shared.tsx and live here now so cockpit code
// doesn't have to import dashboard-widget internals; _shared.tsx re-exports
// them so its existing importers are unaffected.

/** "PREMATURE_COMMERCIAL_DISCONNECT" → "Premature Commercial Disconnect". */
export function humanizeCode(code: string): string {
  return code
    .toLowerCase()
    .split(/[_\s]+/)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

/**
 * A `deal_audit_log.field_changed` column name as a person would say it:
 * "sales_stage_id" → "Sales Stage", "is_completed" → "Completed".
 * A trailing `_id` is dropped because the audit row stores the raw foreign
 * key and it's the resolved *name* that gets displayed next to this label.
 */
export function humanizeField(field: string): string {
  return humanizeCode(field.replace(/_id$/, "").replace(/^is_/, ""));
}

/** "deal.stage_changed" → "Stage changed". Fallback when no summary exists. */
export function humanizeEventType(eventType: string): string {
  const dot = eventType.indexOf(".");
  const tail = dot === -1 ? eventType : eventType.slice(dot + 1);
  const words = tail.replace(/[_.]+/g, " ").trim();
  return words.charAt(0).toUpperCase() + words.slice(1);
}

/** "just now" / "5m ago" / "3h ago" / "2d ago", then DD/MM/YYYY past a week. */
export function relativeTime(iso: string | null | undefined): string {
  if (!iso) return "";
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return "";
  const sec = Math.round((Date.now() - then) / 1000);
  if (sec < 60) return "just now";
  const min = Math.round(sec / 60);
  if (min < 60) return `${min}m ago`;
  const hr = Math.round(min / 60);
  if (hr < 24) return `${hr}h ago`;
  const day = Math.round(hr / 24);
  if (day < 7) return `${day}d ago`;
  return formatDate(iso) ?? "";
}

/**
 * Day-group heading for a timeline: "Today" / "Yesterday" / "15/07/2026".
 * Deliberately falls back to the house DD/MM/YYYY rather than inventing a
 * second date format (e.g. "Mon 15 Jul") — per this file's header rule, one
 * absolute format for the whole app. Compares local midnight to local
 * midnight, like daysUntil in dashboard/widgets/_shared.tsx.
 */
export function dayLabel(value: DateInput): string {
  const p = dateParts(value);
  if (!p) return "Unknown date";
  const target = new Date(p.y, p.mo - 1, p.d);
  const now = new Date();
  const todayMidnight = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const diffDays = Math.round((target.getTime() - todayMidnight.getTime()) / 86_400_000);
  if (diffDays === 0) return "Today";
  if (diffDays === -1) return "Yesterday";
  return formatDate(value, "Unknown date");
}

/** Stable "YYYY-MM-DD" bucket key for grouping a timeline by calendar day. */
export function dayKey(value: DateInput): string {
  const p = dateParts(value);
  return p ? `${pad4(p.y)}-${pad2(p.mo)}-${pad2(p.d)}` : "unknown";
}

// ---- Local-calendar round-trip ----------------------------------------
//
// For callers that need "today" (or a picked date) as a LOCAL calendar day,
// not a UTC instant — `new Date().toISOString().slice(0, 10)` is UTC and
// drifts a day from the local date near midnight in any non-UTC timezone.

/** Parse a "YYYY-MM-DD" string into a local Date (no timezone shift), or
 *  `undefined` for a missing/malformed string. */
export function parseLocalISODate(value?: string): Date | undefined {
  if (!value) return undefined;
  const parts = value.split("-");
  if (parts.length !== 3) return undefined;
  const year = Number(parts[0]);
  const month = Number(parts[1]);
  const day = Number(parts[2]);
  if (Number.isNaN(year) || Number.isNaN(month) || Number.isNaN(day)) return undefined;
  return new Date(year, month - 1, day);
}

/** Format a Date into "YYYY-MM-DD" using local date parts (avoids toISOString TZ shift). */
export function toLocalISODate(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

/** Today's local calendar date as "YYYY-MM-DD". */
export function todayISO(): string {
  return toLocalISODate(new Date());
}
