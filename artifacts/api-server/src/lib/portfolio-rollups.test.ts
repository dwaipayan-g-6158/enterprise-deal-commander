import { describe, it, expect, afterAll } from "vitest";
import { eq } from "drizzle-orm";
import { db, pool, portfolioRollups } from "@workspace/db";
import {
  refreshPortfolioRollups,
  readSummaryRollup,
  readPortfolioAnalysisRollup,
  RollupNames,
} from "./portfolio-rollups";
import { ROLLUP_MAX_AGE_MS } from "./portfolio-rollup-coordinator";

/**
 * Thin, DB-backed tests: the actual single-flight/invalidation-epoch logic is
 * exercised exhaustively (with deferred promises, no DB) in
 * `portfolio-rollup-coordinator.test.ts`. This file only proves the wiring —
 * that `refreshPortfolioRollups` really persists rows the read path can see,
 * and that the max-age boundary from Task 4 still governs what's served.
 *
 * Deliberately NOT tested here: `invalidatePortfolioRollups()` end-to-end.
 * It truncates the whole `portfolio_rollups` table (disruptive to run
 * mid-suite against a shared dev DB) and arms a real 2s debounced background
 * refresh that could repopulate rows underneath a later assertion in this
 * file, or in a file that runs after it (this suite runs all files serially
 * in one process — see vitest.config.ts's `fileParallelism: false`). That
 * coordinator-level behavior (epoch bump before delete, discard-on-supersede)
 * is already covered without a database in portfolio-rollup-coordinator.test.ts.
 */

afterAll(async () => {
  await pool.end();
});

describe("refreshPortfolioRollups + read path", () => {
  it("refresh then read returns the precomputed payloads", async () => {
    await refreshPortfolioRollups();

    const summary = await readSummaryRollup();
    const portfolio = await readPortfolioAnalysisRollup();

    expect(summary).not.toBeNull();
    expect(summary).toHaveProperty("totalDealsMonitored");

    expect(portfolio).not.toBeNull();
    expect(portfolio).toHaveProperty("riskMatrix");
    expect(portfolio).toHaveProperty("summary");
  });

  it("treats a rollup older than ROLLUP_MAX_AGE_MS as a miss", async () => {
    await refreshPortfolioRollups();
    await db
      .update(portfolioRollups)
      .set({ computedAt: new Date(Date.now() - ROLLUP_MAX_AGE_MS - 60_000) })
      .where(eq(portfolioRollups.name, RollupNames.summary));

    const summary = await readSummaryRollup();

    expect(summary).toBeNull();
  });

  it("still serves a rollup just inside the max age", async () => {
    await refreshPortfolioRollups();
    await db
      .update(portfolioRollups)
      .set({ computedAt: new Date(Date.now() - ROLLUP_MAX_AGE_MS + 60_000) })
      .where(eq(portfolioRollups.name, RollupNames.summary));

    const summary = await readSummaryRollup();

    expect(summary).not.toBeNull();
  });
});
