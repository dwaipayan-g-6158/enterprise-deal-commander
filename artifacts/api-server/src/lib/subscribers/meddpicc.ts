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

/**
 * Per-assignment serialization. `meddpicc.answer_changed` events can fire in
 * rapid succession for the same deal (e.g. two quick PATCH calls), and each
 * dispatch independently awaits a DB round trip between checking for an
 * existing completion row and inserting one. Without serialization, two
 * dispatches for the same assignment can both observe "no completion row
 * yet" before either INSERT lands, producing duplicate "completed" rows and
 * duplicate `playbook.step_changed` cascades — `playbookStepCompletions` has
 * no unique constraint on (assignmentId, stepId) to backstop this at the DB
 * level (unlike `dealPlaybookAssignments`'s `deal_playbook_assignment_uq`).
 * Chaining per assignment makes the check-then-insert atomic relative to
 * other calls for that same assignment: the second call's check runs only
 * after the first call has fully finished, so it sees the just-inserted row
 * and correctly no-ops. Calls for different assignments are unaffected and
 * still run concurrently.
 */
const assignmentChains = new Map<string, Promise<unknown>>();

function runSerialPerAssignment(assignmentId: string, fn: () => Promise<void>): Promise<unknown> {
  const prev = assignmentChains.get(assignmentId) ?? Promise.resolve();
  const next = prev.then(fn, fn);
  assignmentChains.set(
    assignmentId,
    next.finally(() => {
      if (assignmentChains.get(assignmentId) === next) assignmentChains.delete(assignmentId);
    }),
  );
  return next;
}

async function completeStepIfNotAlready(assignmentId: string, stepId: string, overallPct: number): Promise<void> {
  const [existing] = await db
    .select({ status: playbookStepCompletions.status })
    .from(playbookStepCompletions)
    .where(
      and(eq(playbookStepCompletions.assignmentId, assignmentId), eq(playbookStepCompletions.stepId, stepId)),
    )
    .limit(1);

  // The rep already took an explicit action (completed/skipped/blocked), or a
  // concurrent call for this same assignment already inserted the row while
  // this one waited its turn in the per-assignment chain — never override
  // that, and never re-complete.
  if (existing) return;

  await db.insert(playbookStepCompletions).values({
    assignmentId,
    stepId,
    status: "completed",
    notes: `Auto-completed: MEDDPICC reached Green, ${overallPct}%`,
  });
  await recomputeAssignment(assignmentId);
  const dealIdForEvent = await dealIdForAssignment(assignmentId);
  if (dealIdForEvent) {
    emitDealEvent("playbook.step_changed", {
      dealId: dealIdForEvent,
      actor: "system",
      assignmentId,
      stepId,
      action: "completed",
    });
  }
}

async function autoCompleteMeddpiccStepIfGreen(dealId: string, overallPct: number): Promise<void> {
  const [row] = await db
    .select({
      assignmentId: dealPlaybookAssignments.id,
      stepId: playbookSteps.id,
    })
    .from(dealPlaybookAssignments)
    .innerJoin(playbooks, eq(dealPlaybookAssignments.playbookId, playbooks.id))
    .innerJoin(
      playbookSteps,
      and(eq(playbookSteps.playbookId, playbooks.id), eq(playbookSteps.stepName, MEDDPICC_STEP_NAME)),
    )
    .where(and(eq(dealPlaybookAssignments.dealId, dealId), eq(playbooks.playbookName, MEDDPICC_PLAYBOOK_NAME)))
    .limit(1);

  if (!row) return; // no assignment for this playbook on this deal

  await runSerialPerAssignment(row.assignmentId, () =>
    completeStepIfNotAlready(row.assignmentId, row.stepId, overallPct),
  );
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
