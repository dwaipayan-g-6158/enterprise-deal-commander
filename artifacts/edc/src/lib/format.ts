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
