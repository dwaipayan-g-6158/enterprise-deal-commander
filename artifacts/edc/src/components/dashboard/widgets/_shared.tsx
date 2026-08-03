// Shared helpers + tiny presentational bits for the dashboard command-center
// widgets. Keep this lean — anything chart-shaped lives in cockpit/charts.
//
// NOTE: formatDate/HEALTH_CLASS are imported via relative paths, not the "@/"
// alias — this file is pulled in (via deal-form-helpers.ts's value import of
// compactCurrency) by code that runs under vitest's standalone config, which
// has no resolve.alias, so a value import through "@/..." fails to resolve at
// test runtime even though tsc is fine with it. Mirrors the same note in
// close-timeline-model.ts.
import { ArrowDown, ArrowUp } from "lucide-react";
import type { Target, Transition } from "framer-motion";
import { calendarDaysUntil, humanizeCode, relativeTime } from "../../../lib/format";
import { HEALTH_CLASS, type Health } from "../../../lib/semantic-colors";

export type { Health };

// humanizeCode/relativeTime moved to lib/format.ts (cockpit code needs them
// too and shouldn't import dashboard-widget internals). Re-exported so the
// existing importers of this module keep their import path unchanged.
export { humanizeCode, relativeTime };

// Sourced from the shared HEALTH_CLASS map (lib/semantic-colors.ts) instead
// of a local Record literal — this pair used to hardcode GREEN as emerald,
// which collided with the deal strip's Closed-Won colour. Re-exported here so
// the 7 existing importers keep their import path unchanged.
export const HEALTH_DOT: Record<Health, string> = {
  GREEN: HEALTH_CLASS.GREEN.dot,
  YELLOW: HEALTH_CLASS.YELLOW.dot,
  RED: HEALTH_CLASS.RED.dot,
};

export const HEALTH_TEXT: Record<Health, string> = {
  GREEN: HEALTH_CLASS.GREEN.text,
  YELLOW: HEALTH_CLASS.YELLOW.text,
  RED: HEALTH_CLASS.RED.text,
};

/** Compact currency, e.g. $8.4M. */
export function compactCurrency(n: number, currency = "USD"): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency,
    notation: "compact",
    maximumFractionDigits: 1,
  }).format(Number(n) || 0);
}

/** Full currency with no decimals, e.g. $8,450,000. */
export function fullCurrency(n: number, currency = "USD"): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency,
    maximumFractionDigits: 0,
  }).format(Number(n) || 0);
}

/**
 * Calendar days from local today to `iso` (negative if in the past). One-line
 * alias of lib/format.ts's calendarDaysUntil — kept here under its original
 * name so this module's existing importers (cells.tsx, dashboard/widgets/
 * deal-roster.tsx, cockpit/risk/managed-risks.tsx) don't need touching. See
 * calendarDaysUntil's own comment for why this must never read a date-only
 * "YYYY-MM-DD" string through `new Date(iso)` directly.
 */
export function daysUntil(iso: string | null | undefined): number | null {
  return calendarDaysUntil(iso);
}

/**
 * Framer-motion props for a staggered fade/slide-in list row, spread onto a
 * `motion.li`/`motion.button` inside an `AnimatePresence`. Mirrors the house
 * convention in cockpit/account-navigation-array.tsx (fade + small x-slide,
 * capped stagger delay) so every dialog's row entrance reads the same.
 * Collapses to an instant, no-op transition when `reduce` (prefers-reduced-
 * motion) is true — always pass `!!useReducedMotion()` from the caller.
 */
export function rowMotion(
  reduce: boolean,
  index: number,
): { initial: Target | false; animate: Target; exit: Target; transition: Transition } {
  return {
    initial: reduce ? false : { opacity: 0, x: -12 },
    animate: { opacity: 1, x: 0 },
    exit: { opacity: 0 },
    transition: {
      duration: reduce ? 0 : 0.18,
      delay: reduce ? 0 : Math.min(index, 15) * 0.025,
      ease: "easeOut",
    },
  };
}

/**
 * Week-over-week delta indicator. `positiveIsGood` flips the color semantics:
 * for TCV a rise is good (green); for red-alert counts a rise is bad (red).
 * `compact` omits the trailing "vs last wk" label, for tight spaces like a
 * DailyBar segment trigger.
 */
export function DeltaBadge({
  current,
  baseline,
  positiveIsGood = true,
  format = (n: number) => String(n),
  compact = false,
}: {
  current: number;
  baseline: number | null | undefined;
  positiveIsGood?: boolean;
  format?: (n: number) => string;
  compact?: boolean;
}) {
  if (baseline == null) return null;
  const delta = current - baseline;
  if (delta === 0) {
    return (
      <span className="text-xs text-muted-foreground">{compact ? "—" : "— vs last wk"}</span>
    );
  }
  const up = delta > 0;
  const good = up === positiveIsGood;
  const Icon = up ? ArrowUp : ArrowDown;
  return (
    <span
      className={`flex items-center gap-0.5 text-xs font-medium ${good ? "text-emerald-500" : "text-red-500"}`}
    >
      <Icon className="h-3 w-3" aria-hidden />
      {format(Math.abs(delta))}
      {!compact && <span className="text-muted-foreground font-normal ml-0.5">vs last wk</span>}
    </span>
  );
}
