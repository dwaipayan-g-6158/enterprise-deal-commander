// Bounded-concurrency fan-out. Pure and DB-free by design — no file here may
// import `@workspace/db` or `@workspace/db/catalyst`.
//
// This used to live in `lib/portfolio.ts` next to the Drizzle `computeSummary`,
// which meant importing a four-line helper pulled in the Postgres client and
// made the helper's own unit tests require a reachable `DATABASE_URL`. That
// file is gone; this is the part of it that was always worth keeping.

/**
 * Max concurrent per-deal intelligence assemblies.
 *
 * `assembleDealIntelligence` issues a burst of Data Store reads per deal, and
 * the portfolio loop runs it once per active deal (GET /intelligence/summary,
 * GET /intelligence/portfolio-analysis, GET /api/v2/analytics/engagement).
 * Catalyst enforces a per-app Data Store concurrency limit and rejects work
 * over it — a rejection that arrives as a FAST 500, not a slow one, which is
 * why an unbounded `Promise.all` here reads as a server bug rather than as
 * backpressure (see lib/db/src/catalyst/sdk.ts). 8 keeps the pipe full without
 * reaching that limit.
 */
export const INTEL_CONCURRENCY = 8;

/** Order-preserving bounded-concurrency map (no such helper exists in-repo). */
export async function mapWithConcurrency<T, R>(
  items: T[],
  limit: number,
  fn: (item: T) => Promise<R>,
): Promise<R[]> {
  const results = new Array<R>(items.length);
  let next = 0;
  const workers = Array.from(
    { length: Math.min(limit, items.length) },
    async () => {
      for (let i = next++; i < items.length; i = next++) {
        results[i] = await fn(items[i]);
      }
    },
  );
  await Promise.all(workers);
  return results;
}
