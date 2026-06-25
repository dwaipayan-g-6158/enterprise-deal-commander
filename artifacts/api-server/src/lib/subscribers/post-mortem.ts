import { eq, sql } from "drizzle-orm";
import {
  db,
  pipelineStages,
  enterpriseDeals,
  pricingModels,
  servicesTiers,
  dealTechnicalGates,
  dealBlockers,
  dealCompetitors,
  competitors,
  dealMemory,
} from "@workspace/db";
import { dealEvents } from "../events";
import { logger } from "../logger";

/**
 * Win/Loss Post-Mortem capture (V2 F5/F6). When a deal reaches a Closed-Won or
 * Closed-Lost stage, upsert a `deal_memory` archive pre-populated with metrics.
 * Narrative fields (win_loss_narrative, key_lessons, tags) are filled later via
 * the deal-memory API.
 */
async function stageName(stageId: number): Promise<string | null> {
  const rows = await db
    .select({ name: pipelineStages.stageName })
    .from(pipelineStages)
    .where(eq(pipelineStages.id, stageId))
    .limit(1);
  return rows[0]?.name ?? null;
}

function outcomeFor(stage: string): "Won" | "Lost" | null {
  const s = stage.toLowerCase();
  if (s.includes("won")) return "Won";
  if (s.includes("lost")) return "Lost";
  return null;
}

export function registerPostMortem(): () => void {
  return dealEvents.on(async (event) => {
    if (event.type !== "deal.stage_changed") return;
    const name = await stageName(event.toStageId);
    if (!name) return;
    const outcome = outcomeFor(name);
    if (!outcome) return;

    const dealRows = await db
      .select({
        id: enterpriseDeals.id,
        accountName: enterpriseDeals.accountName,
        dealName: enterpriseDeals.dealName,
        productRevenue: enterpriseDeals.productRevenue,
        servicesRevenue: enterpriseDeals.servicesRevenue,
        createdAt: enterpriseDeals.createdAt,
        pricingModel: pricingModels.modelName,
        servicesTier: servicesTiers.tierName,
      })
      .from(enterpriseDeals)
      .leftJoin(pricingModels, eq(enterpriseDeals.pricingModelId, pricingModels.id))
      .leftJoin(servicesTiers, eq(enterpriseDeals.servicesTierId, servicesTiers.id))
      .where(eq(enterpriseDeals.id, event.dealId))
      .limit(1);
    const deal = dealRows[0];
    if (!deal) return;

    const [gates] = await db
      .select({ n: sql<number>`count(*)::int` })
      .from(dealTechnicalGates)
      .where(sql`${dealTechnicalGates.dealId} = ${event.dealId} and ${dealTechnicalGates.isCompleted} = true`);
    const [blockers] = await db
      .select({ n: sql<number>`count(*)::int` })
      .from(dealBlockers)
      .where(eq(dealBlockers.dealId, event.dealId));
    const competitorRows = await db
      .select({ name: competitors.name })
      .from(dealCompetitors)
      .leftJoin(competitors, eq(dealCompetitors.competitorId, competitors.id))
      .where(eq(dealCompetitors.dealId, event.dealId));

    const finalTcv =
      (Number(deal.productRevenue) || 0) + (Number(deal.servicesRevenue) || 0);
    const daysActive = Math.max(
      0,
      Math.round((Date.now() - new Date(deal.createdAt).getTime()) / 86_400_000),
    );

    await db
      .insert(dealMemory)
      .values({
        dealId: deal.id,
        accountName: deal.accountName,
        dealName: deal.dealName,
        outcome,
        finalTcv: String(finalTcv),
        pricingModel: deal.pricingModel ?? null,
        servicesTier: deal.servicesTier ?? null,
        totalGatesCompleted: gates?.n ?? 0,
        totalBlockersEncountered: blockers?.n ?? 0,
        totalDaysActive: daysActive,
        competitorsFaced: competitorRows.map((r) => r.name).filter((n): n is string => !!n),
      })
      .onConflictDoUpdate({
        target: dealMemory.dealId,
        set: {
          outcome,
          finalTcv: String(finalTcv),
          totalGatesCompleted: gates?.n ?? 0,
          totalBlockersEncountered: blockers?.n ?? 0,
          totalDaysActive: daysActive,
          archivedAt: new Date(),
        },
      });
    logger.info({ dealId: deal.id, outcome }, "Post-mortem archived to deal memory");
  });
}
