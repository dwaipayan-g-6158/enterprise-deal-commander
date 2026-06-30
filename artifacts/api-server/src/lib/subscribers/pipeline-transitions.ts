import { desc, eq } from "drizzle-orm";
import {
  db, pipelineTransitions, pipelineStages,
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

  // Residence in the stage being left = now − last transition INTO that stage (or deal creation).
  let daysInFromStage: number | null = null;
  if (args.fromStageId != null) {
    const [prev] = await db
      .select({ at: pipelineTransitions.transitionedAt })
      .from(pipelineTransitions)
      .where(eq(pipelineTransitions.dealId, args.dealId))
      .orderBy(desc(pipelineTransitions.transitionedAt))
      .limit(1);
    const since = prev?.at ?? null;
    if (since) {
      daysInFromStage = Math.max(0, Math.round((at.getTime() - new Date(since).getTime()) / 86_400_000));
    }
  }

  // normalizedTcv is not a stored column — it is computed from productRevenue,
  // contractTermYears, servicesRevenue, and FX rate at intelligence time.
  // We store null here; analytics queries can join deal_snapshots for TCV context.
  const tcvAtTransition = null;

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
