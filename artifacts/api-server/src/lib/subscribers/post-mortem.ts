import {
  type CatalystApp,
  createPipelineStagesRepo,
  createPricingModelsRepo,
  createServicesTiersRepo,
  createEnterpriseDealsRepo,
  createDealTechnicalGatesRepo,
  createDealBlockersRepo,
  createDealCompetitorsRepo,
  createCompetitorsRepo,
  createDealMemoryRepo,
} from "@workspace/db/catalyst";
import { calculateFlatTCV } from "@workspace/engine";
import { dealEvents } from "../events";
import { logger } from "../logger";

/**
 * Win/Loss Post-Mortem capture (V2 F5/F6). When a deal reaches a Closed-Won or
 * Closed-Lost stage, upsert a `deal_memory` archive pre-populated with metrics.
 * Narrative fields (win_loss_narrative, key_lessons, tags) are filled later via
 * the deal-memory API.
 */
function outcomeFor(stage: string): "Won" | "Lost" | null {
  const s = stage.toLowerCase();
  if (s.includes("won")) return "Won";
  if (s.includes("lost")) return "Lost";
  return null;
}

export function registerPostMortem(): () => void {
  return dealEvents.on(async (event) => {
    if (event.type !== "deal.stage_changed") return;
    // Absent if this event came from an emitter that hasn't migrated off
    // Drizzle yet — no-op rather than throw, per the event bus's "never
    // break the request path" contract (see lib/events.ts).
    if (!event.catalystApp) return;
    const catalystApp = event.catalystApp as CatalystApp;

    const stages = await createPipelineStagesRepo(catalystApp).listAll();
    const stage = stages.find((s) => s.id === event.toStageId);
    if (!stage) return;
    const outcome = outcomeFor(stage.stageName);
    if (!outcome) return;

    const deal = await createEnterpriseDealsRepo(catalystApp).getById(event.dealId);
    if (!deal) return;

    const [pricingModels, servicesTiers, gates, blockers, competitorLinks, competitors] = await Promise.all([
      createPricingModelsRepo(catalystApp).listAll(),
      createServicesTiersRepo(catalystApp).listAll(),
      createDealTechnicalGatesRepo(catalystApp).list(event.dealId),
      createDealBlockersRepo(catalystApp).list(event.dealId),
      createDealCompetitorsRepo(catalystApp).list(event.dealId),
      createCompetitorsRepo(catalystApp).listAll(),
    ]);
    const pricingModel = pricingModels.find((p) => p.id === deal.pricingModelId)?.modelName ?? null;
    const servicesTier = servicesTiers.find((t) => t.id === deal.servicesTierId)?.tierName ?? null;
    const competitorNameById = new Map(competitors.map((c) => [c.id, c.name]));

    const finalTcv = calculateFlatTCV({
      productRevenue: Number(deal.productRevenue) || 0,
      servicesRevenue: Number(deal.servicesRevenue) || 0,
      contractTermYears: deal.contractTermYears,
      pricingModel: pricingModel ?? "",
    });
    const daysActive = Math.max(
      0,
      Math.round((Date.now() - deal.createdAt.getTime()) / 86_400_000),
    );
    const competitorsFaced = competitorLinks
      .map((l) => competitorNameById.get(l.competitorId))
      .filter((n): n is string => !!n);

    await createDealMemoryRepo(catalystApp).upsertByDealId({
      dealId: deal.id,
      accountName: deal.accountName,
      dealName: deal.dealName,
      outcome,
      finalTcv,
      pricingModel,
      servicesTier,
      totalGatesCompleted: gates.filter((g) => g.isCompleted).length,
      totalBlockersEncountered: blockers.length,
      totalDaysActive: daysActive,
      competitorsFaced,
    });
    logger.info({ dealId: deal.id, outcome }, "Post-mortem archived to deal memory");
  });
}
