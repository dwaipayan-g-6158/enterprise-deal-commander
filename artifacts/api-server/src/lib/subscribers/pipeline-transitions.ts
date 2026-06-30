import { and, desc, eq, lte } from "drizzle-orm";
import {
  db, pipelineTransitions, pipelineStages, enterpriseDeals, dealSnapshots,
} from "@workspace/db";
import { computeTransitionType, type StageDef } from "@workspace/engine";
import { dealEvents } from "../events";
import { logger } from "../logger";

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
  const tcvAtTransition = snap?.normalizedTcv ?? null;

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

export function registerPipelineTransitions(): () => void {
  return dealEvents.on(async (event) => {
    try {
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
