/**
 * DB-free freshness primitives for the portfolio rollups. Kept separate from
 * `portfolio-rollups.ts` (which imports the Drizzle client) so the staleness
 * rule is unit-testable with no database.
 */

/**
 * Grace on top of one full refresh cycle: covers refresh duration (each cycle
 * assembles intelligence for every active deal, twice) plus setInterval drift.
 */
export const ROLLUP_STALE_GRACE_MS = 2 * 60_000;

/**
 * A rollup older than this is treated as a cache MISS, not as data: the read
 * falls through to live compute (itself cached 15s under the `summary:` tier),
 * and the read path logs a throttled warning so a dead refresh job is visible.
 *
 * Sized as one refresh cycle + grace (17 min) against `MV_REFRESH_INTERVAL_MS`
 * (15 min, materialized-views.ts). One missed cycle is enough evidence the job
 * is unhealthy; tolerating two would mean serving 30-minute-old numbers on a
 * page whose live fallback costs ~one compute per 15s. Bounded staleness
 * (17 min) is strictly better than today's unbounded.
 */
export const ROLLUP_MAX_AGE_MS = 15 * 60_000 + ROLLUP_STALE_GRACE_MS;

/** True when a rollup is too old to serve. Unknown/unparseable => stale. */
export function isRollupStale(
  computedAt: Date | string | null | undefined,
  now: number = Date.now(),
  maxAgeMs: number = ROLLUP_MAX_AGE_MS,
): boolean {
  if (computedAt == null) return true;
  const t = computedAt instanceof Date ? computedAt.getTime() : Date.parse(computedAt);
  if (Number.isNaN(t)) return true;
  // A future timestamp is clock skew, not staleness — don't discard on it.
  return now - t > maxAgeMs;
}
