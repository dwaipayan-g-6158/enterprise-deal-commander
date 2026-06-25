import { Router, type IRouter, type Request, type Response } from "express";
import { and, eq, isNull, notInArray } from "drizzle-orm";
import {
  db,
  enterpriseDeals,
  pipelineStages,
  pricingModels,
  productCatalog,
  dealCrossSells,
  dealProductInterests,
  lossArchetypes,
} from "@workspace/db";
import {
  GetDealIntelligenceParams,
  GetDealIntelligenceResponse,
  GetIntelligenceSummaryResponse,
  GetPortfolioAnalysisResponse,
  GetProductMixResponse,
  GetAutopsyQueryParams,
  GetAutopsyResponse,
} from "@workspace/api-zod";
import { requireAuth } from "../lib/auth";
import { notFound } from "../lib/http";
import { assembleDealIntelligence } from "../lib/intelligence";
import { contextualAlertsFor } from "../lib/contextual-alerts";
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
    // Merge V2 competitive (F2) + stakeholder (F8) alerts without mutating the
    // cached object: clone governance + alerts before appending.
    const extra = await contextualAlertsFor(dealId);
    const merged = extra.length
      ? {
          ...data,
          governance: {
            ...data.governance,
            alerts: [...data.governance.alerts, ...extra],
          },
        }
      : data;
    res.json(GetDealIntelligenceResponse.parse({ data: merged }));
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

/**
 * Product-mix & whitespace across the active portfolio: how the pipeline splits
 * by suite, and per-product attach (pitched/interested) vs the total active
 * deal count. Powers the suite-mix charts and the whitespace heatmap.
 */
router.get("/intelligence/product-mix", async (_req: Request, res: Response) => {
  const deals = await db
    .select({
      id: enterpriseDeals.id,
      dealName: enterpriseDeals.dealName,
      accountName: enterpriseDeals.accountName,
      salesStage: pipelineStages.stageName,
      productRevenue: enterpriseDeals.productRevenue,
      contractTermYears: enterpriseDeals.contractTermYears,
      servicesRevenue: enterpriseDeals.servicesRevenue,
      pricingModel: pricingModels.modelName,
    })
    .from(enterpriseDeals)
    .innerJoin(pricingModels, eq(enterpriseDeals.pricingModelId, pricingModels.id))
    .innerJoin(pipelineStages, eq(enterpriseDeals.salesStageId, pipelineStages.id))
    .where(
      and(
        isNull(enterpriseDeals.deletedAt),
        isNull(enterpriseDeals.archivedAt),
        // "Active" pipeline excludes closed deals — a Closed-Lost/Won deal is
        // no longer open whitespace or live pipeline.
        notInArray(pipelineStages.stageName, ["Closed-Won", "Closed-Lost"]),
      ),
    );
  const activeIds = new Set(deals.map((d) => d.id));
  const totalActiveDeals = activeIds.size;
  const tcvById = new Map(
    deals.map((d) => {
      const p = Number(d.productRevenue);
      const s = Number(d.servicesRevenue);
      const tcv =
        d.pricingModel === "Multi-Year Committed"
          ? p * d.contractTermYears + s
          : p + s;
      return [d.id, tcv];
    }),
  );
  // Lightweight per-deal descriptor used by the UI drill-downs.
  const dealById = new Map(deals.map((d) => [d.id, d]));
  const dealInfo = (id: string) => {
    const d = dealById.get(id)!;
    return {
      id,
      dealName: d.dealName,
      accountName: d.accountName,
      salesStage: d.salesStage,
      tcv: tcvById.get(id) ?? 0,
    };
  };

  const catalog = await db
    .select()
    .from(productCatalog)
    .where(eq(productCatalog.isActive, true));
  const productById = new Map(catalog.map((c) => [c.id, c]));

  const pitched = await db.select().from(dealCrossSells);
  const interests = await db.select().from(dealProductInterests);

  // Suites each active deal touches (via pitched cross-sells or anchor interests).
  const dealSuites = new Map<string, Set<string>>();
  const touch = (dealId: string, productId: string) => {
    if (!activeIds.has(dealId)) return;
    const suite = productById.get(productId)?.suite;
    if (!suite) return;
    if (!dealSuites.has(dealId)) dealSuites.set(dealId, new Set());
    dealSuites.get(dealId)!.add(suite);
  };
  for (const p of pitched) if (p.isPitched) touch(p.dealId, p.productId);
  for (const i of interests) touch(i.dealId, i.productId);

  const suiteAgg = new Map<
    string,
    { dealCount: number; totalTCV: number; dealIds: Set<string> }
  >();
  for (const [dealId, suites] of dealSuites) {
    for (const suite of suites) {
      const e =
        suiteAgg.get(suite) ?? { dealCount: 0, totalTCV: 0, dealIds: new Set() };
      e.dealCount += 1;
      e.totalTCV += tcvById.get(dealId) ?? 0;
      e.dealIds.add(dealId);
      suiteAgg.set(suite, e);
    }
  }
  const pipelineBySuite = [...suiteAgg.entries()]
    .map(([suite, v]) => ({
      suite,
      dealCount: v.dealCount,
      totalTCV: v.totalTCV,
      deals: [...v.dealIds]
        .map(dealInfo)
        .sort((a, b) => b.tcv - a.tcv),
    }))
    .sort((a, b) => a.suite.localeCompare(b.suite));

  const distinctActive = (
    rows: { dealId: string; productId: string }[],
  ): Map<string, Set<string>> => {
    const m = new Map<string, Set<string>>();
    for (const r of rows) {
      if (!activeIds.has(r.dealId)) continue;
      if (!m.has(r.productId)) m.set(r.productId, new Set());
      m.get(r.productId)!.add(r.dealId);
    }
    return m;
  };
  const pitchedByProduct = distinctActive(pitched.filter((p) => p.isPitched));
  const interestedByProduct = distinctActive(interests);

  const productWhitespace = catalog
    .map((c) => {
      const pitchedIds = pitchedByProduct.get(c.id) ?? new Set<string>();
      const pitchedDealCount = pitchedIds.size;
      const interestedDealCount = interestedByProduct.get(c.id)?.size ?? 0;
      // Whitespace = active deals where this product is NOT yet pitched.
      const whitespaceDeals = [...activeIds]
        .filter((id) => !pitchedIds.has(id))
        .map(dealInfo)
        .sort((a, b) => b.tcv - a.tcv);
      return {
        code: c.code,
        productName: c.productName,
        suite: c.suite ?? null,
        pitchedDealCount,
        interestedDealCount,
        totalDeals: totalActiveDeals,
        attachPct: totalActiveDeals > 0 ? pitchedDealCount / totalActiveDeals : 0,
        pitchedDeals: [...pitchedIds].map(dealInfo).sort((a, b) => b.tcv - a.tcv),
        whitespaceDeals,
      };
    })
    .sort(
      (a, b) =>
        (a.suite ?? "").localeCompare(b.suite ?? "") ||
        a.productName.localeCompare(b.productName),
    );

  res.json(
    GetProductMixResponse.parse({
      data: { totalActiveDeals, pipelineBySuite, productWhitespace },
    }),
  );
});

router.get("/analytics/autopsy", async (req: Request, res: Response) => {
  const q = GetAutopsyQueryParams.parse(req.query);

  const lostRows = await db
    .select({
      id: enterpriseDeals.id,
      dealName: enterpriseDeals.dealName,
      accountName: enterpriseDeals.accountName,
      salesStage: pipelineStages.stageName,
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
    {
      name: string;
      deals: Intel[];
      lostDeals: {
        id: string;
        dealName: string;
        accountName: string;
        salesStage: string;
        tcv: number;
      }[];
    }
  >();
  for (const row of filtered) {
    const intel = await assembleDealIntelligence(row.id);
    if (!intel) continue;
    const aid = row.lossArchetypeId!;
    if (!groups.has(aid)) {
      groups.set(aid, { name: row.archetypeName, deals: [], lostDeals: [] });
    }
    const g = groups.get(aid)!;
    g.deals.push(intel);
    g.lostDeals.push({
      id: row.id,
      dealName: row.dealName,
      accountName: row.accountName,
      salesStage: row.salesStage,
      tcv: intel.financials.calculatedTCV,
    });
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
      deals: group.lostDeals.sort((a, b) => b.tcv - a.tcv),
    };
  });

  res.json(GetAutopsyResponse.parse({ data: { byArchetype } }));
});

export default router;
