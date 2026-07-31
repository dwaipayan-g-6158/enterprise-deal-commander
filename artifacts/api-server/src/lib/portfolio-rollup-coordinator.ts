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

/** Cap on discard-and-recompute rounds inside one refresh (see RefreshCoordinator). */
export const MAX_REFRESH_ATTEMPTS = 3;

/**
 * Single-flight + invalidation-epoch guard for a recompute-and-upsert job.
 *
 * Two overlapping problems this solves:
 *  1. The 15-min materialized-view job and the 2s-debounced post-mutation
 *     refresh can run at the same time, doing the same expensive work twice and
 *     racing each other's upserts. `run()` joins an in-flight run instead.
 *  2. Worse, a refresh that STARTED before an invalidating mutation can finish
 *     after `invalidatePortfolioRollups()` deleted the rows, re-inserting
 *     pre-mutation numbers that are then stale-but-not-invalidated until the
 *     next cycle. `invalidate()` bumps an epoch; a job whose snapshot predates
 *     the bump must skip its write (`isSuperseded()`) and is recomputed.
 *
 * Same shape as the `cache.wrap` generation guard in lib/cache.ts — see
 * .agents/memory/edc-cache-generation-guard.md.
 */
export class RefreshCoordinator {
  private inFlight: Promise<boolean> | null = null;
  private rerunQueued = false;
  private epoch = 0;

  /** MUST be called synchronously by every invalidation, BEFORE issuing the DELETE. */
  invalidate(): void {
    this.epoch += 1;
  }

  get currentEpoch(): number {
    return this.epoch;
  }

  /**
   * Run `job` at most once concurrently. `job` must consult `isSuperseded()`
   * after computing and skip its write when true. Resolves false if it gave up
   * after `maxAttempts` rounds (rollups left absent => reads live-compute).
   */
  run(
    job: (isSuperseded: () => boolean) => Promise<void>,
    maxAttempts = MAX_REFRESH_ATTEMPTS,
  ): Promise<boolean> {
    if (this.inFlight) {
      this.rerunQueued = true;
      return this.inFlight;
    }
    const running = (async () => {
      for (let attempt = 0; attempt < maxAttempts; attempt++) {
        this.rerunQueued = false;
        const startEpoch = this.epoch;
        const isSuperseded = () => this.epoch !== startEpoch;
        await job(isSuperseded);
        if (!this.rerunQueued && !isSuperseded()) return true;
      }
      return false;
    })();
    this.inFlight = running.finally(() => {
      this.inFlight = null;
    });
    return this.inFlight;
  }
}

export interface Debouncer {
  schedule(): void;
  cancel(): void;
  readonly pending: boolean;
}

/**
 * Leading-window debounce, preserving the existing `scheduleRefresh` semantics
 * EXACTLY: the first call in a burst arms the timer and it fires `delayMs`
 * later; calls inside the window are absorbed and do NOT push the deadline out.
 * (Do not "fix" this into a trailing debounce — a sustained write burst would
 * then starve the refresh indefinitely.)
 */
export function createDebouncer(
  delayMs: number,
  fn: () => void,
  unref = true,
): Debouncer {
  let timer: NodeJS.Timeout | null = null;
  return {
    schedule(): void {
      if (timer) return;
      timer = setTimeout(() => {
        timer = null;
        fn();
      }, delayMs);
      if (unref) timer.unref();
    },
    cancel(): void {
      if (timer) {
        clearTimeout(timer);
        timer = null;
      }
    },
    get pending(): boolean {
      return timer !== null;
    },
  };
}
