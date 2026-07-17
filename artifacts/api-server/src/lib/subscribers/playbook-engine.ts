import { and, eq } from "drizzle-orm";
import { db, pipelineStages, playbooks } from "@workspace/db";
import { dealEvents, emitDealEvent } from "../events";
import { startPlaybookForDeal } from "../playbook-signals";
import { logger } from "../logger";

/**
 * Automated Playbook Engine (V2 F11). On a stage change, if a playbook targets
 * the new stage, auto-assign it — guarded per (deal, playbook), not per deal,
 * so a deal keeps every earlier-stage assignment as it advances through its
 * journey instead of getting stuck on whichever playbook it picked up first.
 */
async function stageName(stageId: number): Promise<string | null> {
  const rows = await db
    .select({ name: pipelineStages.stageName })
    .from(pipelineStages)
    .where(eq(pipelineStages.id, stageId))
    .limit(1);
  return rows[0]?.name ?? null;
}

export function registerPlaybookEngine(): () => void {
  return dealEvents.on(async (event) => {
    if (event.type !== "deal.stage_changed") return;
    const name = await stageName(event.toStageId);
    if (!name) return;

    const candidates = await db
      .select()
      .from(playbooks)
      .where(and(eq(playbooks.applicableStage, name), eq(playbooks.isActive, true)))
      .limit(1);
    const playbook = candidates[0];
    if (!playbook) return;

    const { assignment, created } = await startPlaybookForDeal(event.dealId, playbook.id);
    if (!created) return;

    logger.info(
      { dealId: event.dealId, playbookId: playbook.id, stage: name },
      "Playbook auto-assigned on stage change",
    );
    emitDealEvent("playbook.assigned", {
      dealId: event.dealId,
      actor: event.actor,
      assignmentId: assignment.id,
      playbookId: playbook.id,
    });
  });
}
