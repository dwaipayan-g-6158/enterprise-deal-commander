import { db, portfolioRollups } from "@workspace/db";
import { eq } from "drizzle-orm";
import { logger } from "./logger";
import { registerMaterializedView } from "./materialized-views";
import { isRollupStale, ROLLUP_MAX_AGE_MS } from "./portfolio-rollup-coordinator";
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

/** Recompute every portfolio rollup and upsert it into the table. */
export async function refreshPortfolioRollups(): Promise<void> {
  const [summary, portfolio] = await Promise.all([
    computeSummary(),
    computePortfolioAnalysis(),
  ]);
  await upsertRollup(RollupNames.summary, summary);
  await upsertRollup(RollupNames.portfolioAnalysis, portfolio);
}

/**
 * Drop all precomputed rollups so the next read falls back to live compute.
 * Called on any deal mutation. Never throws — invalidation must not break the
 * request path. A debounced background refresh repopulates the rollups shortly
 * after the write burst settles.
 */
export function invalidatePortfolioRollups(): void {
  void (async () => {
    try {
      await db.delete(portfolioRollups);
    } catch (err) {
      logger.error({ err }, "Failed to invalidate portfolio rollups");
    }
  })();
  scheduleRefresh();
}

const REFRESH_DEBOUNCE_MS = 2_000;
let refreshTimer: NodeJS.Timeout | null = null;

function scheduleRefresh(): void {
  if (refreshTimer) return;
  refreshTimer = setTimeout(() => {
    refreshTimer = null;
    void refreshPortfolioRollups().catch((err) =>
      logger.error({ err }, "Debounced portfolio rollup refresh failed"),
    );
  }, REFRESH_DEBOUNCE_MS);
  refreshTimer.unref();
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
