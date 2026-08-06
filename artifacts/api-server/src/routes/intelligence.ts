import { Router, type IRouter, type Request, type Response } from "express";
import {
  initCatalystApp,
  createEnterpriseDealsRepo,
  createPipelineStagesRepo,
  createPricingModelsRepo,
  createProductCatalogRepo,
  createDealCrossSellsRepo,
  createDealProductInterestsRepo,
  createLossArchetypesRepo,
} from "@workspace/db/catalyst";
import {
  GetDealIntelligenceParams,
  GetDealIntelligenceResponse,
  GetIntelligenceSummaryResponse,
  GetPortfolioAnalysisResponse,
  GetProductMixResponse,
  GetAutopsyQueryParams,
  GetAutopsyResponse,
} from "@workspace/api-zod";
import { calculateFlatTCV } from "@workspace/engine";
import { notFound } from "../lib/http";
import { contextualAlertsFor } from "../lib/catalyst/contextual-alerts";
import { cache, CacheKeys, CacheTtl } from "../lib/cache";
import {
  type Intel,
  cachedIntel,
  computeSummary,
  computePortfolioAnalysis,
  mapWithConcurrency,
  INTEL_CONCURRENCY,
} from "../lib/catalyst/portfolio";
import { CLOSED_STAGES } from "../lib/deal-filters";

// The precomputed `portfolio_rollups` fast path that used to front the summary
// and portfolio-analysis reads is deliberately gone from this file.
//
// It was only ever a cache in front of the same compute, filled by the periodic
// refresh job in lib/subscribers/index.ts — and that job is a wall-clock
// setInterval, which AppSail never runs, because it kills idle instances after
// five minutes. So on Catalyst the rollup table is permanently empty and every
// read fell through to the live compute anyway; keeping the reader would have
// meant keeping lib/portfolio-rollups.ts's Drizzle dependency for a branch that
// can never be taken. Restoring it belongs with the Job Scheduling slice, which
// is what gives those jobs somewhere to actually run.

// Auth + write-role enforcement is applied centrally in routes/index.ts.
const router: IRouter = Router();

router.get(
  "/deals/:dealId/intelligence",
  async (req: Request, res: Response) => {
    const { dealId } = GetDealIntelligenceParams.parse(req.params);
    const catalystApp = initCatalystApp(req);
    const data = await cachedIntel(catalystApp, dealId);
    if (!data) throw notFound("Deal not found");
    // Merge V2 competitive (F2) + stakeholder (F8) alerts without mutating the
    // cached object: clone governance + alerts before appending.
    const extra = await contextualAlertsFor(catalystApp, dealId);
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
 * Portfolio-wide summary. Served from the short-TTL `summary:` cache tier,
 * which the event bus drops on any deal mutation — see the note at the top of
 * this file for why the precomputed-rollup fast path is not in the Catalyst
 * read path.
 */
router.get(
  "/intelligence/summary",
  async (req: Request, res: Response) => {
    const catalystApp = initCatalystApp(req);
    const data = await cache.wrap(
      `${CacheKeys.summaryPrefix}overview`,
      CacheTtl.summary,
      () => computeSummary(catalystApp),
    );
    res.json(GetIntelligenceSummaryResponse.parse({ data }));
  },
);

router.get(
  "/intelligence/portfolio-analysis",
  async (req: Request, res: Response) => {
    const catalystApp = initCatalystApp(req);
    const data = await cache.wrap(
      `${CacheKeys.summaryPrefix}portfolio-analysis`,
      CacheTtl.summary,
      () => computePortfolioAnalysis(catalystApp),
    );
    res.json(GetPortfolioAnalysisResponse.parse({ data }));
  },
);

/**
 * Product-mix & whitespace across the active portfolio: how the pipeline splits
 * by suite, and per-product attach (pitched/interested) vs the total active
 * deal count. Powers the suite-mix charts and the whitespace heatmap.
 */
router.get("/intelligence/product-mix", async (req: Request, res: Response) => {
  const catalystApp = initCatalystApp(req);
  const [allDeals, stages, models] = await Promise.all([
    createEnterpriseDealsRepo(catalystApp).list(),
    createPipelineStagesRepo(catalystApp).listAll(),
    createPricingModelsRepo(catalystApp).listAll(),
  ]);
  const stageNameById = new Map(stages.map((s) => [s.id, s.stageName]));
  const modelNameById = new Map(models.map((m) => [m.id, m.modelName]));
  const deals = allDeals
    // Both joins in the original were INNER, so a deal whose stage or pricing
    // model no longer resolves is dropped rather than defaulted.
    .filter((d) => stageNameById.has(d.salesStageId) && modelNameById.has(d.pricingModelId))
    .filter((d) => d.deletedAt == null && d.archivedAt == null)
    // "Active" pipeline excludes closed deals — a Closed-Lost/Won deal is
    // no longer open whitespace or live pipeline.
    .filter((d) => !CLOSED_STAGES.includes(stageNameById.get(d.salesStageId)!))
    .map((d) => ({
      id: d.id,
      dealName: d.dealName,
      accountName: d.accountName,
      salesStage: stageNameById.get(d.salesStageId)!,
      productRevenue: d.productRevenue,
      contractTermYears: d.contractTermYears,
      servicesRevenue: d.servicesRevenue,
      pricingModel: modelNameById.get(d.pricingModelId)!,
    }));
  const activeIds = new Set(deals.map((d) => d.id));
  const totalActiveDeals = activeIds.size;
  const tcvById = new Map(
    deals.map((d) => {
      const tcv = calculateFlatTCV({
        productRevenue: Number(d.productRevenue) || 0,
        servicesRevenue: Number(d.servicesRevenue) || 0,
        contractTermYears: d.contractTermYears,
        pricingModel: d.pricingModel,
      });
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

  const catalog = await createProductCatalogRepo(catalystApp).listActive();
  const productById = new Map(catalog.map((c) => [c.id, c]));

  const [pitched, interests] = await Promise.all([
    createDealCrossSellsRepo(catalystApp).listAll(),
    createDealProductInterestsRepo(catalystApp).listAll(),
  ]);

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

const UNCLASSIFIED_ARCHETYPE_NAME = "Unclassified";

router.get("/analytics/autopsy", async (req: Request, res: Response) => {
  const q = GetAutopsyQueryParams.parse(req.query);

  // leftJoin (was innerJoin): a deal can reach Closed-Lost with no archetype
  // set (the server has never required one on close — see the loss archetype
  // being merely client-side-enforced on CloseDealDialog), and an innerJoin
  // silently dropped every such deal from this whole tab. Those deals now
  // land in a synthetic "Unclassified" bucket instead of disappearing.
  const catalystApp = initCatalystApp(req);
  const [allDeals, stages, archetypes] = await Promise.all([
    createEnterpriseDealsRepo(catalystApp).list(),
    createPipelineStagesRepo(catalystApp).listAll(),
    // listAll, not listActive: the original left-joined the table with no
    // is_active predicate, so a deal still resolves the name of an archetype
    // that has since been deactivated.
    createLossArchetypesRepo(catalystApp).listAll(),
  ]);
  const stageNameById = new Map(stages.map((s) => [s.id, s.stageName]));
  const archetypeNameById = new Map(archetypes.map((a) => [a.id, a.archetypeName]));
  const lostRows = allDeals
    // innerJoin on pipelineStages: an unresolved stage drops the row.
    .filter((d) => stageNameById.get(d.salesStageId) === "Closed-Lost")
    .filter((d) => d.deletedAt == null)
    .filter((d) => q.archetypeId == null || d.lossArchetypeId === q.archetypeId)
    .map((d) => ({
      id: d.id,
      dealName: d.dealName,
      accountName: d.accountName,
      salesStage: stageNameById.get(d.salesStageId)!,
      lossArchetypeId: d.lossArchetypeId,
      // leftJoin: a null/dangling archetype id keeps the deal and falls through
      // to the synthetic "Unclassified" bucket below.
      archetypeName:
        d.lossArchetypeId == null
          ? null
          : (archetypeNameById.get(d.lossArchetypeId) ?? null),
    }));

  // cachedIntel (not assembleDealIntelligence) so this tab shares the same
  // cache tier the roster/summary already warm, and a concurrent map instead of
  // a sequential await-in-a-loop — the previous version serialized one full
  // intelligence assembly per lost deal.
  //
  // Bounded at INTEL_CONCURRENCY rather than an unbounded Promise.all: each
  // cache miss issues ~15 sequential queries against a 10-connection pool, so
  // fanning out over every Closed-Lost deal at once queues on the pool and
  // starves concurrent handlers (see lib/portfolio.ts). Order is preserved,
  // which the index-keyed `lostRows.forEach` zip below depends on.
  const intelResults = await mapWithConcurrency(lostRows, INTEL_CONCURRENCY, (r) =>
    cachedIntel(catalystApp, r.id),
  );

  const groups = new Map<
    number | null,
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
  lostRows.forEach((row, i) => {
    const intel = intelResults[i];
    if (!intel) return;
    const aid = row.lossArchetypeId;
    if (!groups.has(aid)) {
      groups.set(aid, { name: row.archetypeName ?? UNCLASSIFIED_ARCHETYPE_NAME, deals: [], lostDeals: [] });
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
  });

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
    // Gate GROUP 2 specifically (was `<= 2`, which also matched an
    // incomplete group-1 gate) — "Never Passed Gate 2" means group 2 itself
    // was never completed, not "some earlier gate was incomplete".
    const neverPassedGate2 = group.deals.filter((d) =>
      d.technicalTrack.gates.some((g) => g.gateGroup === 2 && !g.isCompleted),
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
