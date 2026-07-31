import { and, desc, eq, lte } from "drizzle-orm";
import {
  db, pipelineTransitions, pipelineStages, enterpriseDeals, dealSnapshots, pricingModels,
} from "@workspace/db";
import { computeTransitionType, calculateFlatTCV, type StageDef } from "@workspace/engine";
import { dealEvents } from "../events";
import { logger } from "../logger";
import { flatTcv } from "../deal-filters";

async function loadStages(): Promise<StageDef[]> {
  const rows = await db.select().from(pipelineStages);
  return rows.map((s) => ({
    id: s.id,
    name: s.stageName,
    sortOrder: s.sortOrder,
    terminal: s.stageName === "Closed-Won" ? "won" as const : s.stageName === "Closed-Lost" ? "lost" as const : undefined,
  }));
}

export async function recordTransition(args: {
  dealId: string;
  fromStageId: number | null;
  toStageId: number;
  overridden: boolean;
  actor: string;
  at?: Date;
}): Promise<void> {
  const stages = await loadStages();
  const fromStage = args.fromStageId != null ? stages.find((s) => s.id === args.fromStageId) : null;
  const toStage = stages.find((s) => s.id === args.toStageId);
  if (!toStage) return;

  const type = computeTransitionType(fromStage?.sortOrder ?? null, toStage);
  const at = args.at ?? new Date();

  // Residence in the stage being left = now − last transition INTO that stage.
  // For the deal's first-ever stage change (no prior transition row), fall back
  // to stageEnteredAt (when the deal entered its current stage).
  let daysInFromStage: number | null = null;
  if (args.fromStageId != null) {
    const [prev] = await db
      .select({ at: pipelineTransitions.transitionedAt })
      .from(pipelineTransitions)
      .where(eq(pipelineTransitions.dealId, args.dealId))
      .orderBy(desc(pipelineTransitions.transitionedAt))
      .limit(1);
    if (prev?.at) {
      daysInFromStage = Math.max(0, Math.round((at.getTime() - new Date(prev.at).getTime()) / 86_400_000));
    } else {
      // First stage change: no prior transition row — use deal's stageEnteredAt.
      const [dealRow] = await db
        .select({ stageEnteredAt: enterpriseDeals.stageEnteredAt })
        .from(enterpriseDeals)
        .where(eq(enterpriseDeals.id, args.dealId))
        .limit(1);
      if (dealRow?.stageEnteredAt) {
        daysInFromStage = Math.max(0, Math.round((at.getTime() - new Date(dealRow.stageEnteredAt).getTime()) / 86_400_000));
      }
    }
  }

  // Populate tcvAtTransition from the most recent deal snapshot at or before
  // the transition time (deal_snapshots stores the computed normalizedTcv).
  const [snap] = await db
    .select({ normalizedTcv: dealSnapshots.normalizedTcv })
    .from(dealSnapshots)
    .where(and(eq(dealSnapshots.dealId, args.dealId), lte(dealSnapshots.snapshotAt, at)))
    .orderBy(desc(dealSnapshots.snapshotAt))
    .limit(1);
  // A deal can transition (most commonly: its very first "create" transition)
  // before any snapshot exists for it — snapshots are periodic, not written
  // synchronously with every deal change. Falling back to `null` there
  // silently zeroed out the pipeline's "Created" value in the Recycle & Exit
  // waterfall. The deal's own current revenue fields are always available,
  // so fall back to those (flatTcv — the same product+services formula every
  // other analytics route on this branch uses) instead of leaving
  // tcvAtTransition unset.
  let tcvAtTransition = snap?.normalizedTcv ?? null;
  if (tcvAtTransition == null) {
    const [dealTcvRow] = await db
      .select({
        productRevenue: enterpriseDeals.productRevenue,
        servicesRevenue: enterpriseDeals.servicesRevenue,
      })
      .from(enterpriseDeals)
      .where(eq(enterpriseDeals.id, args.dealId))
      .limit(1);
    if (dealTcvRow) tcvAtTransition = String(flatTcv(dealTcvRow));
  }

  await db
    .insert(pipelineTransitions)
    .values({
      dealId: args.dealId,
      fromStageId: args.fromStageId,
      toStageId: args.toStageId,
      transitionType: type,
      tcvAtTransition,
      daysInFromStage,
      overridden: args.overridden,
      transitionedAt: at,
      createdBy: args.actor,
    })
    .onConflictDoNothing({ target: [pipelineTransitions.dealId, pipelineTransitions.transitionedAt] });
}

/**
 * Records the initial "create" transition for a brand-new deal (fromStageId
 * null -> its starting stage). Without this, `pipeline_transitions` only ever
 * gains a "create" row via the one-shot backfill script — every deal created
 * since then has no create row, understating value-bridge (waterfall) totals.
 *
 * TCV is computed live from the deal's current economics (rather than looked
 * up from `deal_snapshots`, which may not exist yet for a brand-new deal).
 */
export async function recordCreateTransition(args: {
  dealId: string;
  actor: string;
  at?: Date;
}): Promise<void> {
  const [deal] = await db
    .select({
      salesStageId: enterpriseDeals.salesStageId,
      productRevenue: enterpriseDeals.productRevenue,
      servicesRevenue: enterpriseDeals.servicesRevenue,
      contractTermYears: enterpriseDeals.contractTermYears,
      pricingModel: pricingModels.modelName,
    })
    .from(enterpriseDeals)
    .leftJoin(pricingModels, eq(enterpriseDeals.pricingModelId, pricingModels.id))
    .where(eq(enterpriseDeals.id, args.dealId))
    .limit(1);
  if (!deal) return;

  const tcv = calculateFlatTCV({
    productRevenue: Number(deal.productRevenue) || 0,
    servicesRevenue: Number(deal.servicesRevenue) || 0,
    contractTermYears: deal.contractTermYears,
    pricingModel: deal.pricingModel ?? "",
  });

  await db
    .insert(pipelineTransitions)
    .values({
      dealId: args.dealId,
      fromStageId: null,
      toStageId: deal.salesStageId,
      transitionType: "create",
      tcvAtTransition: String(Math.round(tcv)),
      daysInFromStage: null,
      overridden: false,
      transitionedAt: args.at ?? new Date(),
      createdBy: args.actor,
    })
    .onConflictDoNothing({ target: [pipelineTransitions.dealId, pipelineTransitions.transitionedAt] });
}

export function registerPipelineTransitions(): () => void {
  return dealEvents.on(async (event) => {
    try {
      if (event.type === "deal.created") {
        await recordCreateTransition({
          dealId: event.dealId,
          actor: event.actor,
          at: event.occurredAt,
        });
        return;
      }
      if (event.type === "deal.stage_changed") {
        await recordTransition({
          dealId: event.dealId,
          fromStageId: event.fromStageId,
          toStageId: event.toStageId,
          overridden: event.overridden,
          actor: event.actor,
          at: event.occurredAt,
        });
      }
    } catch (err) {
      logger.error({ err, event: event.type }, "pipeline-transitions subscriber failed");
    }
  });
}
