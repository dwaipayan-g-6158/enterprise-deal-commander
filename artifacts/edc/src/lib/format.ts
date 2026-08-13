import { quarterStartUTC } from "@workspace/engine";

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

/**
 * Compact currency for a tile/table figure: "$2.34M", "$450K", "$999",
 * "-$1.50M", "EUR 2K". Consolidates what used to be FOUR independent
 * copies — this file's own `compactUSD` plus one apiece in
 * `components/cockpit/portfolio-summary-cards.tsx`, `portfolio-risk-heatmap.tsx`
 * (byte-identical to the summary-cards copy), and `product-mix-section.tsx`
 * (which SHADOWED this very function under the same name) — all of which
 * fell through to an uncompacted "$-5000" for negative input (`n >=
 * 1_000_000` is false for negatives) and could round 999,999 up into the
 * nonsense "$1000K" instead of carrying into "$1.00M". `compactUSD` below is
 * now a one-line USD-bound alias, kept so its existing importers (four
 * Closed-Lost Autopsy panels) don't need touching.
 */
export function compactCurrency(n: number, currency = "USD"): string {
  const v = Number(n);
  // Number.isFinite, not the old `Number(n) || 0` — that form let Infinity
  // through and rendered "$InfinityM".
  const safe = Number.isFinite(v) ? v : 0;
  const sign = safe < 0 ? "-" : "";
  const abs = Math.abs(safe);
  const sym = currency === "USD" ? "$" : `${currency} `;
  // Branch on the ROUNDED thousands, not on `abs`: rounding first is what
  // makes 999_999 read "$1.00M" instead of carrying into "$1000K". The K
  // branch still gates on `abs >= 1_000` so $500 stays "$500" (Math.round(0.5)
  // is 1, which would otherwise misfire the K branch).
  const thousands = Math.round(abs / 1_000);
  if (thousands >= 1_000) return `${sign}${sym}${(abs / 1_000_000).toFixed(2)}M`;
  if (abs >= 1_000) return `${sign}${sym}${thousands}K`;
  return `${sign}${sym}${Math.round(abs)}`;
}

/** USD-bound alias of `compactCurrency` — one implementation, two entry points. */
export const compactUSD = (n: number): string => compactCurrency(n, "USD");

/** Round to at most 2 decimal places (e.g. 23.6667 -> 23.67). */
export function round2(n: unknown): number {
  return Math.round((Number(n) || 0) * 100) / 100;
}

/**
 * Format a non-currency metric (cycle time, index, lift multiplier, score,
 * percentage) at at most 2 decimal places, trimming trailing zeros —
 * 23.6667 -> "23.67", 24 -> "24", 0.6 -> "0.6". Not for currency: currency
 * formatting (money, formatCurrency, compactUSD/compactCurrency) is unaffected.
 */
export function formatNum(n: unknown): string {
  return round2(n).toLocaleString("en-US", { maximumFractionDigits: 2 });
}

// ---- Contract term -----------------------------------------------------

/** The one spelling of "this deal never expires" — kept out of
 *  @workspace/engine (whose risk-explanation prose has its own lowercase
 *  "perpetual term" wording; see dimensions.ts signal 5.3) so a form-copy
 *  tweak here never silently rewrites historical risk explanations. */
export const PERPETUAL_TERM_LABEL = "Perpetual";

/**
 * Renders a deal's contract term for display, in one of three house styles —
 * consolidating what was three near-identical inline expressions (deal
 * cockpit's "N Years", the mobile brief's "N yr", the mobile economics
 * panel's "N year term") that each needed to special-case Perpetual
 * separately. `years` goes through the same non-finite -> 1 guard as
 * `clampTerm` (deal-form-helpers.ts) since a perpetual deal's
 * `contract_term_years` is a filler value that must never leak into prose.
 */
export function formatTerm(
  years: unknown,
  isPerpetual: boolean | undefined,
  style: "long" | "short" | "phrase" = "long",
): string {
  if (isPerpetual) {
    return style === "phrase" ? `${PERPETUAL_TERM_LABEL.toLowerCase()} term` : PERPETUAL_TERM_LABEL;
  }
  const n = Math.round(Number(years));
  const safe = Number.isFinite(n) ? Math.min(10, Math.max(1, n)) : 1;
  if (style === "short") return `${safe} yr`;
  if (style === "phrase") return `${safe} year term`;
  return `${safe} Years`;
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
 * Whole calendar days from the local day containing `now` to the local
 * calendar day of `value` — negative in the past, 0 for "today". `now` is
 * injected (defaulting to the real clock) so pure pipelines like the roster's
 * derive-rows can pass a fixed clock and stay node-testable.
 *
 * Goes through dateParts(), so a date-only "YYYY-MM-DD" string (expectedCloseDate
 * and friends) is read by string surgery and NEVER handed to `new Date(string)`
 * — per this file's header rule, that parses as UTC midnight and is off by one
 * in every non-UTC zone. This used to be reimplemented three times (here as
 * dayLabel's inline math, in dashboard/widgets/_shared.tsx's daysUntil, and in
 * the roster's derive-rows/timeline close-date logic) and only this copy got
 * the UTC-midnight fix — the other two silently disagreed with it, including
 * a case where a deal due TODAY read as overdue in the roster in IST past
 * ~17:30. There is now exactly one copy of this formula.
 */
export function calendarDaysUntil(value: DateInput, now: number = Date.now()): number | null {
  const p = dateParts(value);
  if (!p) return null;
  const target = new Date(p.y, p.mo - 1, p.d).getTime();
  const n = new Date(now);
  const today = new Date(n.getFullYear(), n.getMonth(), n.getDate()).getTime();
  return Math.round((target - today) / 86_400_000);
}

/**
 * Days remaining (inclusive of today) until the end of the LOCAL calendar
 * quarter containing `now` — 0 on the quarter's last day. Deliberately LOCAL,
 * the opposite convention from quarterStartISO/todayUTCISO below: those exist
 * only for pipeline_targets.period_start, a bare date-only column with no
 * local time attached at all, so UTC is the one frame every client can agree
 * on. A roster close-date filter is answering "what can still land this
 * quarter" for a person in their own timezone, so it must use the local
 * calendar quarter instead.
 */
export function daysLeftInLocalQuarter(now: number = Date.now()): number {
  const n = new Date(now);
  const monthAfterQuarter = Math.floor(n.getMonth() / 3) * 3 + 3;
  const lastDay = new Date(n.getFullYear(), monthAfterQuarter, 0); // day 0 = last day of prev month
  return calendarDaysUntil(lastDay, now) ?? 0;
}

/**
 * Day-group heading for a timeline: "Today" / "Yesterday" / "15/07/2026".
 * Deliberately falls back to the house DD/MM/YYYY rather than inventing a
 * second date format (e.g. "Mon 15 Jul") — per this file's header rule, one
 * absolute format for the whole app.
 */
export function dayLabel(value: DateInput): string {
  if (!dateParts(value)) return "Unknown date";
  const diffDays = calendarDaysUntil(value);
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
//
// quarterStartISO/todayUTCISO below (in the Quarter-start section further
// down) are the deliberate EXCEPTION to this: pipeline_targets.period_start
// has no local time attached to it at all (bare date-only string on disk),
// so UTC is the one frame the server and every browser can agree on — see
// that section's own comment for the full reasoning.

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

// ---- Quarter-start (UTC) -----------------------------------------------
//
// Used solely by the Quarterly Pipeline Targets settings panel
// (components/settings/targets-settings.tsx). Deliberately UTC, not local
// calendar — the opposite convention from every other date helper in this
// file. pipeline_targets.period_start is stored as a bare, timezone-less
// date-only string, so there's no "local time" attached to a row at all;
// UTC is the one frame this browser and the Node server can agree on
// without a "whose local time?" ambiguity (a positive-offset timezone like
// IST disagreeing with the server about which quarter "right now" falls in
// was the actual bug this fixed — see git history / task-4-report.md).
//
// The flooring math itself is `quarterStartUTC` from `@workspace/engine` — a
// pure, isomorphic function with zero DB/network deps that runs identically
// here and in routes/v2/analytics.ts's `activeQuarterStart` on the server.
// There is now exactly ONE copy of this formula, not two kept in sync by
// comment.

/**
 * Snaps a "YYYY-MM-DD" date-only string to the start of its UTC calendar
 * quarter ("2026-08-17" -> "2026-07-01"). Constructing a `Date` from a
 * date-only string normally parses it as UTC midnight and is exactly the
 * footgun this file's header warns about for LOCAL-calendar callers — here
 * that UTC interpretation is intentional and correct (see the section
 * comment above). Malformed/empty input (e.g. `""`) falls back to the
 * current UTC quarter rather than propagating a "NaN-01" string.
 */
export function quarterStartISO(dateOnlyISO: string): string {
  const d = dateOnlyISO ? new Date(dateOnlyISO.slice(0, 10)) : new Date(NaN);
  return quarterStartUTC(Number.isFinite(d.getTime()) ? d : new Date());
}

/** "Today" as the UTC calendar date — see the section comment above for why
 *  this deliberately does NOT use the local-calendar `todayISO()`. */
export function todayUTCISO(): string {
  return new Date().toISOString().slice(0, 10);
}
