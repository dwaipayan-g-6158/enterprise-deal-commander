import { and, eq } from "drizzle-orm";
import {
  db,
  dealPlaybookAssignments,
  playbooks,
  playbookSteps,
  playbookStepCompletions,
} from "@workspace/db";
import { dealEvents, emitDealEvent } from "../events";
import { computeMeddpiccScoreForDeal } from "../meddpicc";
import { recomputeAssignment, dealIdForAssignment } from "../playbook-signals";

const MEDDPICC_STEP_NAME = "MEDDPICC qualification scored";
const MEDDPICC_PLAYBOOK_NAME = "Discovery / Qualification Playbook";

async function autoCompleteMeddpiccStepIfGreen(dealId: string, overallPct: number): Promise<void> {
  const [row] = await db
    .select({
      assignmentId: dealPlaybookAssignments.id,
      stepId: playbookSteps.id,
      completionStatus: playbookStepCompletions.status,
    })
    .from(dealPlaybookAssignments)
    .innerJoin(playbooks, eq(dealPlaybookAssignments.playbookId, playbooks.id))
    .innerJoin(
      playbookSteps,
      and(eq(playbookSteps.playbookId, playbooks.id), eq(playbookSteps.stepName, MEDDPICC_STEP_NAME)),
    )
    .leftJoin(
      playbookStepCompletions,
      and(
        eq(playbookStepCompletions.assignmentId, dealPlaybookAssignments.id),
        eq(playbookStepCompletions.stepId, playbookSteps.id),
      ),
    )
    .where(and(eq(dealPlaybookAssignments.dealId, dealId), eq(playbooks.playbookName, MEDDPICC_PLAYBOOK_NAME)))
    .limit(1);

  // No assignment, or the rep already took an explicit action (completed/
  // skipped/blocked) — never override that, and never re-complete.
  if (!row || row.completionStatus != null) return;

  await db.insert(playbookStepCompletions).values({
    assignmentId: row.assignmentId,
    stepId: row.stepId,
    status: "completed",
    notes: `Auto-completed: MEDDPICC reached Green, ${overallPct}%`,
  });
  await recomputeAssignment(row.assignmentId);
  const dealIdForEvent = await dealIdForAssignment(row.assignmentId);
  if (dealIdForEvent) {
    emitDealEvent("playbook.step_changed", {
      dealId: dealIdForEvent,
      actor: "system",
      assignmentId: row.assignmentId,
      stepId: row.stepId,
      action: "completed",
    });
  }
}

export function registerMeddpicc(): () => void {
  return dealEvents.on(async (event) => {
    if (event.type !== "meddpicc.answer_changed") return;
    const result = await computeMeddpiccScoreForDeal(event.dealId);
    if (result && result.ragStatus === "Green") {
      await autoCompleteMeddpiccStepIfGreen(event.dealId, result.overallPct);
    }
  });
}
