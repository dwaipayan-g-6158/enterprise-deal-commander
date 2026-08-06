import {
  type CatalystApp,
  createPipelineStagesRepo,
  createPlaybooksRepo,
} from "@workspace/db/catalyst";
import { dealEvents, emitDealEvent } from "../events";
import { startPlaybookForDeal, supersedeStalePlaybookAssignments } from "../catalyst/playbook-signals";
import { logger } from "../logger";

/**
 * Automated Playbook Engine (V2 F11). On a stage change, if a playbook targets
 * the new stage, auto-assign it — guarded per (deal, playbook), not per deal,
 * so a deal keeps every earlier-stage assignment as it advances through its
 * journey instead of getting stuck on whichever playbook it picked up first.
 *
 * It also supersedes any still-"Active" assignment left behind at an earlier
 * stage, unconditionally — even when the new stage has no playbook of its own
 * to auto-assign — so a deal that advances with steps still open stops
 * accruing overdue/adherence penalties against a playbook it has moved past.
 */
export function registerPlaybookEngine(): () => void {
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

    await supersedeStalePlaybookAssignments(catalystApp, event.dealId, stage.sortOrder);

    const activePlaybooks = await createPlaybooksRepo(catalystApp).listActive();
    const playbook = activePlaybooks.find((p) => p.applicableStage === stage.stageName);
    if (!playbook) return;

    const { assignment, created } = await startPlaybookForDeal(catalystApp, event.dealId, playbook.id);
    if (!created) return;

    logger.info(
      { dealId: event.dealId, playbookId: playbook.id, stage: stage.stageName },
      "Playbook auto-assigned on stage change",
    );
    emitDealEvent("playbook.assigned", {
      dealId: event.dealId,
      actor: event.actor,
      assignmentId: assignment.id,
      playbookId: playbook.id,
      catalystApp,
    });
  });
}
