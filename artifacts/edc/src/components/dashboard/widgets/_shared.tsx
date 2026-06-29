// Shared helpers + tiny presentational bits for the dashboard command-center
// widgets. Keep this lean — anything chart-shaped lives in cockpit/charts.
import { ArrowDown, ArrowUp } from "lucide-react";

export type Health = "GREEN" | "YELLOW" | "RED";

export const HEALTH_DOT: Record<Health, string> = {
  GREEN: "bg-emerald-500",
  YELLOW: "bg-amber-500",
  RED: "bg-red-500",
};

export const HEALTH_TEXT: Record<Health, string> = {
  GREEN: "text-emerald-500",
  YELLOW: "text-amber-500",
  RED: "text-red-500",
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

/** "PREMATURE_COMMERCIAL_DISCONNECT" → "Premature Commercial Disconnect". */
export function humanizeCode(code: string): string {
  return code
    .toLowerCase()
    .split(/[_\s]+/)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

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
  return new Date(iso).toLocaleDateString();
}

/** Short date, e.g. "Aug 30". Returns null for missing/invalid dates. */
export function shortDate(iso: string | null | undefined): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

export function daysUntil(iso: string | null | undefined): number | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return Math.round((d.getTime() - Date.now()) / 86_400_000);
}

/**
 * Week-over-week delta indicator. `positiveIsGood` flips the color semantics:
 * for TCV a rise is good (green); for red-alert counts a rise is bad (red).
 */
export function DeltaBadge({
  current,
  baseline,
  positiveIsGood = true,
  format = (n: number) => String(n),
}: {
  current: number;
  baseline: number | null | undefined;
  positiveIsGood?: boolean;
  format?: (n: number) => string;
}) {
  if (baseline == null) return null;
  const delta = current - baseline;
  if (delta === 0) {
    return <span className="text-xs text-muted-foreground">— vs last wk</span>;
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
      <span className="text-muted-foreground font-normal ml-0.5">vs last wk</span>
    </span>
  );
}
