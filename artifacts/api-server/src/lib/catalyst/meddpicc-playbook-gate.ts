// Keeps the "MEDDPICC qualification scored" playbook step in sync with the
// deal's current MEDDPICC score, in both directions, but only ever undoing what
// the system itself granted.
//
// This began as a parallel Catalyst twin of a Drizzle
// `../meddpicc-playbook-gate.ts` that could not be retired while the periodic
// snapshot job ran off an in-process timer with no request to derive an app
// from. Catalyst Job Scheduling removed that constraint and the Drizzle
// original is gone; this is now the only implementation.
import { emitDealEvent } from "../events";
import {
  type CatalystApp,
  createPlaybooksRepo,
  createPlaybookStepsRepo,
  createPlaybookStepCompletionsRepo,
  createDealPlaybookAssignmentsRepo,
} from "@workspace/db/catalyst";
import { recomputeAssignment, dealIdForAssignment } from "./playbook-signals";
import type { MeddpiccScoreResult } from "@workspace/engine";

const MEDDPICC_STEP_NAME = "MEDDPICC qualification scored";
const MEDDPICC_PLAYBOOK_NAME = "Discovery / Qualification Playbook";
const SYSTEM_ACTOR = "system";

/** Per-assignment serialization — see the identical map in ../meddpicc-playbook-gate.ts for the full rationale. */
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

async function emitStepChanged(
  catalystApp: CatalystApp,
  assignmentId: string,
  stepId: string,
  action: "completed" | "reopened",
) {
  await recomputeAssignment(catalystApp, assignmentId);
  const dealIdForEvent = await dealIdForAssignment(catalystApp, assignmentId);
  if (dealIdForEvent) {
    emitDealEvent("playbook.step_changed", {
      dealId: dealIdForEvent,
      actor: SYSTEM_ACTOR,
      assignmentId,
      stepId,
      action,
      catalystApp,
    });
  }
}

async function completeStepIfNotAlready(
  catalystApp: CatalystApp,
  assignmentId: string,
  stepId: string,
  overallPct: number,
): Promise<void> {
  const completions = await createPlaybookStepCompletionsRepo(catalystApp).listByAssignmentId(assignmentId);
  // The rep already took an explicit action (completed/skipped/blocked), or a
  // concurrent call for this same assignment already inserted the row while
  // this one waited its turn in the per-assignment chain — never override
  // that, and never re-complete.
  if (completions.some((c) => c.stepId === stepId)) return;

  await createPlaybookStepCompletionsRepo(catalystApp).upsertForStep({
    assignmentId,
    stepId,
    status: "completed",
    note: `Auto-completed: MEDDPICC reached Green, ${overallPct}%`,
    completedBy: SYSTEM_ACTOR,
  });
  await emitStepChanged(catalystApp, assignmentId, stepId, "completed");
}

async function reopenStepIfSystemCompleted(catalystApp: CatalystApp, assignmentId: string, stepId: string): Promise<void> {
  const completions = await createPlaybookStepCompletionsRepo(catalystApp).listByAssignmentId(assignmentId);
  const existing = completions.find((c) => c.stepId === stepId);
  // Nothing to reopen, or the row is a rep's own manual completion / an
  // explicit skip / an explicit block — never undo a human decision because
  // the score happened to dip.
  if (!existing) return;
  if (existing.status !== "completed" || existing.completedBy !== SYSTEM_ACTOR) return;

  await createPlaybookStepCompletionsRepo(catalystApp).deleteForStep(assignmentId, stepId);
  await emitStepChanged(catalystApp, assignmentId, stepId, "reopened");
}

/**
 * Called directly from `computeMeddpiccScoreForDeal` (lib/catalyst/meddpicc.ts)
 * on every score computation (GET assessment or PATCH answer alike) — not
 * gated behind any event. Keeps the "MEDDPICC qualification scored" playbook
 * step in sync with the current score in both directions, but only for what
 * the system itself granted: reaching Green auto-completes the step if
 * nothing has acted on it yet; dropping back below Green reopens it again,
 * but only if the existing completion was itself system-granted.
 */
export async function syncMeddpiccPlaybookGate(
  catalystApp: CatalystApp,
  dealId: string,
  ragStatus: MeddpiccScoreResult["ragStatus"],
  overallPct: number,
): Promise<void> {
  const playbook = (await createPlaybooksRepo(catalystApp).listAll()).find(
    (p) => p.playbookName === MEDDPICC_PLAYBOOK_NAME,
  );
  if (!playbook) return;
  const assignment = (await createDealPlaybookAssignmentsRepo(catalystApp).list(dealId)).find(
    (a) => a.playbookId === playbook.id,
  );
  if (!assignment) return; // no assignment for this playbook on this deal

  const steps = await createPlaybookStepsRepo(catalystApp).listByPlaybookId(playbook.id);
  const step = steps.find((s) => s.stepName === MEDDPICC_STEP_NAME);
  if (!step) return;

  await runSerialPerAssignment(assignment.id, () =>
    ragStatus === "Green"
      ? completeStepIfNotAlready(catalystApp, assignment.id, step.id, overallPct)
      : reopenStepIfSystemCompleted(catalystApp, assignment.id, step.id),
  );
}
