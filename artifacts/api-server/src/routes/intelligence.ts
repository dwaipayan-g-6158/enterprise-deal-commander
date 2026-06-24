import { Router, type IRouter, type Request, type Response } from "express";
import { eq } from "drizzle-orm";
import {
  db,
  enterpriseDeals,
  pipelineStages,
  lossArchetypes,
} from "@workspace/db";
import {
  GetDealIntelligenceParams,
  GetDealIntelligenceResponse,
  GetIntelligenceSummaryResponse,
  GetPortfolioAnalysisResponse,
  GetAutopsyQueryParams,
  GetAutopsyResponse,
} from "@workspace/api-zod";
import { requireAuth } from "../lib/auth";
import { notFound } from "../lib/http";
import { assembleDealIntelligence } from "../lib/intelligence";
import { cache, CacheKeys, CacheTtl } from "../lib/cache";
import {
  type Intel,
  cachedIntel,
  computeSummary,
  computePortfolioAnalysis,
} from "../lib/portfolio";
import {
  readSummaryRollup,
  readPortfolioAnalysisRollup,
} from "../lib/portfolio-rollups";

const router: IRouter = Router();

router.use(requireAuth);

router.get(
  "/deals/:dealId/intelligence",
  async (req: Request, res: Response) => {
    const { dealId } = GetDealIntelligenceParams.parse(req.params);
    const data = await cachedIntel(dealId);
    if (!data) throw notFound("Deal not found");
    res.json(GetDealIntelligenceResponse.parse({ data }));
  },
);

/**
 * Portfolio rollups are precomputed into `edc_v2.portfolio_rollups` by the
 * periodic refresh job and invalidated on any deal mutation. Reads serve the
 * precomputed rollup when present, falling back to a short-TTL live compute
 * (`summary:` cache tier) until the rollup is repopulated.
 */
router.get(
  "/intelligence/summary",
  async (_req: Request, res: Response) => {
    const data =
      (await readSummaryRollup()) ??
      (await cache.wrap(
        `${CacheKeys.summaryPrefix}overview`,
        CacheTtl.summary,
        () => computeSummary(),
      ));
    res.json(GetIntelligenceSummaryResponse.parse({ data }));
  },
);

router.get(
  "/intelligence/portfolio-analysis",
  async (_req: Request, res: Response) => {
    const data =
      (await readPortfolioAnalysisRollup()) ??
      (await cache.wrap(
        `${CacheKeys.summaryPrefix}portfolio-analysis`,
        CacheTtl.summary,
        () => computePortfolioAnalysis(),
      ));
    res.json(GetPortfolioAnalysisResponse.parse({ data }));
  },
);

router.get("/analytics/autopsy", async (req: Request, res: Response) => {
  const q = GetAutopsyQueryParams.parse(req.query);

  const lostRows = await db
    .select({
      id: enterpriseDeals.id,
      lossArchetypeId: enterpriseDeals.lossArchetypeId,
      archetypeName: lossArchetypes.archetypeName,
    })
    .from(enterpriseDeals)
    .innerJoin(pipelineStages, eq(enterpriseDeals.salesStageId, pipelineStages.id))
    .innerJoin(
      lossArchetypes,
      eq(enterpriseDeals.lossArchetypeId, lossArchetypes.id),
    )
    .where(eq(pipelineStages.stageName, "Closed-Lost"));

  const filtered = q.archetypeId
    ? lostRows.filter((r) => r.lossArchetypeId === q.archetypeId)
    : lostRows;

  const groups = new Map<
    number,
    { name: string; deals: Intel[] }
  >();
  for (const row of filtered) {
    const intel = await assembleDealIntelligence(row.id);
    if (!intel) continue;
    const aid = row.lossArchetypeId!;
    if (!groups.has(aid)) {
      groups.set(aid, { name: row.archetypeName, deals: [] });
    }
    groups.get(aid)!.deals.push(intel);
  }

  const byArchetype = [...groups.entries()].map(([archetypeId, group]) => {
    const lossCount = group.deals.length;
    const avgGateCompletionPct =
      group.deals.reduce(
        (s, d) => s + d.technicalTrack.progressPercentage,
        0,
      ) / Math.max(1, lossCount);
    const servicesAttachShare =
      group.deals.filter((d) => d.financials.servicesTier !== "None").length /
      Math.max(1, lossCount);
    const patternCounts = new Map<string, number>();
    for (const d of group.deals) {
      for (const a of [
        ...d.governance.alerts,
        ...d.governance.managedAlerts,
      ]) {
        patternCounts.set(a.code, (patternCounts.get(a.code) ?? 0) + 1);
      }
    }
    const patternsThatFired = [...patternCounts.entries()]
      .map(([code, count]) => ({ code, share: count / Math.max(1, lossCount) }))
      .sort((a, b) => b.share - a.share);
    const neverPassedGate2 = group.deals.filter((d) =>
      d.technicalTrack.gates.some((g) => g.gateGroup <= 2 && !g.isCompleted),
    ).length;
    return {
      archetypeId,
      archetypeName: group.name,
      lossCount,
      avgGateCompletionPct,
      servicesAttachShare,
      patternsThatFired,
      neverPassedGate2Share: neverPassedGate2 / Math.max(1, lossCount),
    };
  });

  res.json(GetAutopsyResponse.parse({ data: { byArchetype } }));
});

export default router;
