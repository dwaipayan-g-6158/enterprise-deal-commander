import { and, asc, eq } from "drizzle-orm";
import {
  db,
  pipelineStages,
  playbooks,
  playbookSteps,
  dealPlaybookAssignments,
} from "@workspace/db";
import { dealEvents } from "../events";
import { logger } from "../logger";

/**
 * Automated Playbook Engine (V2 F11). On a stage change, if a playbook targets
 * the new stage and the deal has no active assignment, auto-assign it with the
 * pointer set to the first step.
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

    const existing = await db
      .select({ id: dealPlaybookAssignments.id })
      .from(dealPlaybookAssignments)
      .where(
        and(
          eq(dealPlaybookAssignments.dealId, event.dealId),
          eq(dealPlaybookAssignments.status, "Active"),
        ),
      )
      .limit(1);
    if (existing.length > 0) return;

    const candidates = await db
      .select()
      .from(playbooks)
      .where(and(eq(playbooks.applicableStage, name), eq(playbooks.isActive, true)))
      .limit(1);
    const playbook = candidates[0];
    if (!playbook) return;

    const firstStep = await db
      .select({ id: playbookSteps.id })
      .from(playbookSteps)
      .where(eq(playbookSteps.playbookId, playbook.id))
      .orderBy(asc(playbookSteps.stepOrder))
      .limit(1);

    await db.insert(dealPlaybookAssignments).values({
      dealId: event.dealId,
      playbookId: playbook.id,
      currentStepId: firstStep[0]?.id ?? null,
    });
    logger.info(
      { dealId: event.dealId, playbookId: playbook.id, stage: name },
      "Playbook auto-assigned on stage change",
    );
  });
}
