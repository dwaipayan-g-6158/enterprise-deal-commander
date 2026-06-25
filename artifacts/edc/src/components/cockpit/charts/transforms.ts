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
