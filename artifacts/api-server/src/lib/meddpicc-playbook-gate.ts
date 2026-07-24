import { and, eq } from "drizzle-orm";
import {
  db,
  dealPlaybookAssignments,
  playbooks,
  playbookSteps,
  playbookStepCompletions,
} from "@workspace/db";
import { emitDealEvent } from "./events";
import { recomputeAssignment, dealIdForAssignment } from "./playbook-signals";
import type { MeddpiccScoreResult } from "@workspace/engine";

const MEDDPICC_STEP_NAME = "MEDDPICC qualification scored";
const MEDDPICC_PLAYBOOK_NAME = "Discovery / Qualification Playbook";
const SYSTEM_ACTOR = "system";

/**
 * Per-assignment serialization. `computeMeddpiccScoreForDeal` can be called
 * in rapid succession for the same deal (e.g. two quick PATCH calls, or a
 * PATCH immediately followed by the assessment refetch), and each call
 * independently awaits a DB round trip between checking for an existing
 * completion row and inserting/deleting it. Without serialization, two calls
 * for the same assignment can both observe the same stale state before
 * either write lands, producing duplicate rows or duplicate
 * `playbook.step_changed` cascades — `playbookStepCompletions` has no unique
 * constraint on (assignmentId, stepId) to backstop this at the DB level
 * (unlike `dealPlaybookAssignments`'s `deal_playbook_assignment_uq`).
 * Chaining per assignment makes the check-then-write atomic relative to
 * other calls for that same assignment: the second call's check runs only
 * after the first call has fully finished, so it sees the just-written state
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

async function emitStepChanged(assignmentId: string, stepId: string, action: "completed" | "reopened") {
  await recomputeAssignment(assignmentId);
  const dealIdForEvent = await dealIdForAssignment(assignmentId);
  if (dealIdForEvent) {
    emitDealEvent("playbook.step_changed", {
      dealId: dealIdForEvent,
      actor: SYSTEM_ACTOR,
      assignmentId,
      stepId,
      action,
    });
  }
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
    completedBy: SYSTEM_ACTOR,
  });
  await emitStepChanged(assignmentId, stepId, "completed");
}

async function reopenStepIfSystemCompleted(assignmentId: string, stepId: string): Promise<void> {
  const [existing] = await db
    .select({ status: playbookStepCompletions.status, completedBy: playbookStepCompletions.completedBy })
    .from(playbookStepCompletions)
    .where(
      and(eq(playbookStepCompletions.assignmentId, assignmentId), eq(playbookStepCompletions.stepId, stepId)),
    )
    .limit(1);

  // Nothing to reopen, or the row is a rep's own manual completion / an
  // explicit skip / an explicit block — never undo a human decision because
  // the score happened to dip.
  if (!existing) return;
  if (existing.status !== "completed" || existing.completedBy !== SYSTEM_ACTOR) return;

  await db
    .delete(playbookStepCompletions)
    .where(
      and(eq(playbookStepCompletions.assignmentId, assignmentId), eq(playbookStepCompletions.stepId, stepId)),
    );
  await emitStepChanged(assignmentId, stepId, "reopened");
}

/**
 * Called directly from `computeMeddpiccScoreForDeal` on every score
 * computation (GET assessment or PATCH answer alike) — not gated behind any
 * event. Keeps the "MEDDPICC qualification scored" playbook step in sync
 * with the current score in both directions, but only for what the system
 * itself granted: reaching Green auto-completes the step if nothing has
 * acted on it yet; dropping back below Green reopens it again, but only if
 * the existing completion was itself system-granted — a rep's manual
 * completion, skip, or block is never touched by a later score change.
 */
export async function syncMeddpiccPlaybookGate(
  dealId: string,
  ragStatus: MeddpiccScoreResult["ragStatus"],
  overallPct: number,
): Promise<void> {
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
    ragStatus === "Green"
      ? completeStepIfNotAlready(row.assignmentId, row.stepId, overallPct)
      : reopenStepIfSystemCompleted(row.assignmentId, row.stepId),
  );
}
