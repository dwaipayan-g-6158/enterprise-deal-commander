// Catalyst-backed reimplementation of ../competitive.ts — see the module
// docstring in ./intelligence.ts for why this is a parallel file rather than
// an in-place rewrite.
import { type CatalystApp, createDealCompetitorsRepo, createCompetitorsRepo } from "@workspace/db/catalyst";
import { cache, CacheKeys, CacheTtl } from "../cache";
import { reduceWinRates, type CompetitorWinRate, type CompetitorOutcomeRow } from "../competitive";

export type { CompetitorWinRate, CompetitorOutcomeRow };

/**
 * Our global historical win rate per competitor, computed once from every
 * deal↔competitor link and cached under the short-TTL `summary:` tier so the
 * portfolio loop (which calls `assembleDealIntelligence` per active deal) does
 * not recompute the full tally N times. Invalidated with the rest of the
 * `summary:` prefix whenever a deal mutates (see `invalidateDeal`).
 */
export async function competitorWinRates(
  catalystApp: CatalystApp,
): Promise<Map<number, CompetitorWinRate>> {
  return cache.wrap(
    `${CacheKeys.summaryPrefix}competitor-win-rates`,
    CacheTtl.summary,
    async () => {
      const [links, competitors] = await Promise.all([
        createDealCompetitorsRepo(catalystApp).listAll(),
        createCompetitorsRepo(catalystApp).listAll(),
      ]);
      const nameById = new Map(competitors.map((c) => [c.id, c.name]));
      const rows: CompetitorOutcomeRow[] = links.map((l) => ({
        competitorId: l.competitorId,
        name: nameById.get(l.competitorId) ?? null,
        status: l.status,
      }));
      return reduceWinRates(rows);
    },
  );
}
