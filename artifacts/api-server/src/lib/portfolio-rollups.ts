import { db, portfolioRollups } from "@workspace/db";
import { eq } from "drizzle-orm";
import { logger } from "./logger";
import { registerMaterializedView } from "./materialized-views";
import {
  isRollupStale,
  ROLLUP_MAX_AGE_MS,
  MAX_REFRESH_ATTEMPTS,
  RefreshCoordinator,
  createDebouncer,
} from "./portfolio-rollup-coordinator";
import { computeSummary, computePortfolioAnalysis } from "./portfolio";

/**
 * Precomputed portfolio rollup store (`edc_v2.portfolio_rollups`).
 *
 * The portfolio/summary endpoints assemble intelligence for every active deal
 * on each request, which gets expensive as the deal count grows. This module
 * precomputes those aggregates into a maintained rollup table that the read
 * endpoints serve directly when present.
 *
 * Freshness is kept by two mechanisms:
 *   - The existing 15-min materialized-view refresh job recomputes and upserts
 *     each rollup (this module registers itself in that registry).
 *   - Any deal mutation invalidates (deletes) the rollups; reads then fall back
 *     to live compute until the next refresh repopulates them.
 */

export const RollupNames = {
  summary: "summary",
  portfolioAnalysis: "portfolio-analysis",
} as const;

export type SummaryRollup = Awaited<ReturnType<typeof computeSummary>>;
export type PortfolioAnalysisRollup = Awaited<
  ReturnType<typeof computePortfolioAnalysis>
>;

async function upsertRollup(
  name: string,
  payload: Record<string, unknown>,
): Promise<void> {
  await db
    .insert(portfolioRollups)
    .values({ name, payload, computedAt: new Date() })
    .onConflictDoUpdate({
      target: portfolioRollups.name,
      set: { payload, computedAt: new Date() },
    });
}

let lastStaleWarnAt = 0;
const STALE_WARN_THROTTLE_MS = 60_000;

async function readRollup<T>(name: string): Promise<T | null> {
  const rows = await db
    .select({
      payload: portfolioRollups.payload,
      computedAt: portfolioRollups.computedAt,
    })
    .from(portfolioRollups)
    .where(eq(portfolioRollups.name, name))
    .limit(1);
  if (rows.length === 0) return null;
  const { payload, computedAt } = rows[0];
  if (isRollupStale(computedAt)) {
    // Throttled: this runs on every /intelligence/summary and
    // /intelligence/portfolio-analysis request, so an unthrottled warn would
    // flood the log for exactly as long as the problem lasts.
    const now = Date.now();
    if (now - lastStaleWarnAt > STALE_WARN_THROTTLE_MS) {
      lastStaleWarnAt = now;
      logger.warn(
        { rollup: name, computedAt, maxAgeMs: ROLLUP_MAX_AGE_MS },
        "Portfolio rollup exceeded max age — refresh job may be dead; serving live compute",
      );
    }
    return null;
  }
  return payload as T;
}

/** Read the precomputed summary rollup, or null when not yet computed. */
export function readSummaryRollup(): Promise<SummaryRollup | null> {
  return readRollup<SummaryRollup>(RollupNames.summary);
}

/** Read the precomputed portfolio-analysis rollup, or null when absent. */
export function readPortfolioAnalysisRollup(): Promise<PortfolioAnalysisRollup | null> {
  return readRollup<PortfolioAnalysisRollup>(RollupNames.portfolioAnalysis);
}

const coordinator = new RefreshCoordinator();

/**
 * Recompute every portfolio rollup and upsert it. Single-flighted: a concurrent
 * caller (periodic MV job vs. debounced post-mutation refresh) joins the
 * in-flight run rather than duplicating the compute.
 */
export async function refreshPortfolioRollups(): Promise<void> {
  const ok = await coordinator.run(async (isSuperseded) => {
    const [summary, portfolio] = await Promise.all([
      computeSummary(),
      computePortfolioAnalysis(),
    ]);
    if (isSuperseded()) {
      // A mutation invalidated the rollups while we were computing: this
      // snapshot predates it, and upserting now would resurrect pre-mutation
      // numbers AFTER the DELETE. Drop it; the coordinator recomputes.
      logger.debug("Discarded portfolio rollup snapshot invalidated mid-compute");
      return;
    }
    await upsertRollup(RollupNames.summary, summary);
    await upsertRollup(RollupNames.portfolioAnalysis, portfolio);
  });
  if (!ok) {
    logger.warn(
      { attempts: MAX_REFRESH_ATTEMPTS },
      "Portfolio rollup refresh superseded on every attempt; leaving rollups absent (reads live-compute)",
    );
  }
}

/** Resolves once the most recent invalidation's DELETE has actually landed. */
let pendingDelete: Promise<void> = Promise.resolve();

const REFRESH_DEBOUNCE_MS = 2_000;
const refreshDebouncer = createDebouncer(REFRESH_DEBOUNCE_MS, () => {
  // Sequence after the pending DELETE so the fire-and-forget delete can never
  // land on top of the fresh rows this refresh is about to write.
  void pendingDelete
    .then(() => refreshPortfolioRollups())
    .catch((err) =>
      logger.error({ err }, "Debounced portfolio rollup refresh failed"),
    );
});

/**
 * Drop all precomputed rollups so the next read falls back to live compute.
 * Called on any deal mutation. Never throws — invalidation must not break the
 * request path. A debounced background refresh repopulates the rollups shortly
 * after the write burst settles.
 */
export function invalidatePortfolioRollups(): void {
  // Bump FIRST and synchronously — before any await — so a refresh already
  // computing is guaranteed to observe the new epoch and discard its snapshot.
  coordinator.invalidate();
  pendingDelete = (async () => {
    try {
      await db.delete(portfolioRollups);
    } catch (err) {
      logger.error({ err }, "Failed to invalidate portfolio rollups");
    }
  })();
  refreshDebouncer.schedule();
}

let registered = false;

/**
 * Register the portfolio rollups with the materialized-view refresh registry so
 * the existing periodic job keeps them fresh. Idempotent.
 */
export function registerPortfolioRollupView(): void {
  if (registered) return;
  registered = true;
  registerMaterializedView({
    name: "edc_v2.portfolio_rollups",
    refresh: refreshPortfolioRollups,
  });
}

/**
 * Delete any rollup left by a previous process, then warm. A payload written by
 * an older binary can encode a different formula (e.g. the pre-normalization
 * diversification index) or, for a future contract change, a different shape
 * that would fail the route's Zod parse. Process start is the one moment we
 * know the compute code may have changed, so we never serve a payload we didn't
 * compute ourselves.
 *
 * Timing caveat: the caller (`registerSubscribers()`) invokes this
 * fire-and-forget (`void purgeAndWarmPortfolioRollups().catch(...)`) from
 * inside the `app.listen` callback in `index.ts` — i.e. AFTER the server has
 * already begun accepting HTTP connections, not before. So there is a brief
 * (typically sub-second) window where a request can still read a rollup row
 * written by the PREVIOUS process. This self-heals on the very next request
 * once the purge lands, because a rollup HIT bypasses the 15s `cache.wrap`
 * `summary:` tier entirely — a stale read in that window is never cached
 * forward. It is NOT a guarantee against a second instance of this process
 * still running (and re-upserting) concurrently in a multi-instance
 * deployment — see .agents/memory/edc-phase2-backbone.md.
 */
export async function purgeAndWarmPortfolioRollups(): Promise<void> {
  try {
    await db.delete(portfolioRollups);
  } catch (err) {
    logger.error({ err }, "Failed to purge stale portfolio rollups at startup");
  }
  await refreshPortfolioRollups();
}
