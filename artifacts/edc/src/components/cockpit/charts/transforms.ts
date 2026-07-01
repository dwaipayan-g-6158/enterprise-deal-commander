export interface Forecast { p10: number; p25: number; p50: number; p75: number; p90: number }

/**
 * Shape percentiles for a fan/area chart. `mid` is the per-point value;
 * `lo`/`hi` carry the p10 floor and p90 ceiling so a shaded band can span them.
 */
export function toFanSeries(f: Forecast): { k: string; lo: number; mid: number; hi: number }[] {
  const order: (keyof Forecast)[] = ["p10", "p25", "p50", "p75", "p90"];
  return order.map((key) => ({
    k: key.toUpperCase(),
    lo: f.p10,
    mid: f[key],
    hi: f.p90,
  }));
}

export function classifyVelocity(deltaDays: number): "ahead" | "on" | "behind" {
  if (deltaDays > 0) return "behind";
  if (deltaDays < 0) return "ahead";
  return "on";
}

export type VelocityTone = "ahead" | "on" | "behind";

export interface MeterGeometry {
  /** Total fill width as a 0–100 percentage of the shared track scale. */
  fillPct: number;
  /** Benchmark tick position as a 0–100 percentage of the shared track scale. */
  benchmarkPct: number;
  /** Overdue portion (beyond benchmark) as a 0–100 percentage; 0 unless behind. */
  overflowPct: number;
  tone: VelocityTone;
}

const clampPct = (n: number): number => Math.max(0, Math.min(100, n));

/**
 * Geometry for one deal's inline variance meter. All percentages are relative
 * to a shared `scaleMax` (the largest daysInStage across the visible deals) so
 * bars are comparable row-to-row. `scaleMax <= 0` is guarded to 1.
 */
export function meterGeometry(
  deal: { daysInStage: number; benchmarkDays: number; deltaDays: number },
  scaleMax: number,
): MeterGeometry {
  const max = scaleMax > 0 ? scaleMax : 1;
  const tone = classifyVelocity(deal.deltaDays);
  return {
    fillPct: clampPct((deal.daysInStage / max) * 100),
    benchmarkPct: clampPct((deal.benchmarkDays / max) * 100),
    overflowPct: tone === "behind" ? clampPct(((deal.daysInStage - deal.benchmarkDays) / max) * 100) : 0,
    tone,
  };
}
