import { useQueryClient } from "@tanstack/react-query";
import {
  useReopenPlaybookStep,
  useSetPlaybookStepState,
  getGetPlaybookJourneyQueryKey,
} from "@workspace/api-client-react";
import { MOBILE_WRITE_OPTIONS } from "@/mobile/write/write-options";
import { patchPlaybookStep, type StepStatus } from "@/mobile/write/optimistic";
import { invalidatePlaybook } from "@/mobile/write/invalidate";
import { classifyWriteError, type WriteOutcome } from "@/mobile/write/write-outcome";
import { useWriteStatus } from "@/mobile/write/write-status-context";
import { haptic } from "@/mobile/lib/haptics";

/**
 * Playbook step state — the most natural phone action in the app. You tick it
 * walking out of the meeting, which is exactly when a laptop is not open.
 *
 * The ONLY module permitted to import `useSetPlaybookStepState` and
 * `useReopenPlaybookStep`.
 *
 * ## Serialised per assignment, and not defensively
 *
 * The generated hook instances are shared, and concurrent calls through one are
 * not safe — playbook-panel.tsx already carries that warning. On a phone this is
 * not theoretical: three steps ticked in under a second is an ordinary gesture,
 * and the desktop panel simply never invited it.
 */
export function usePlaybookStep(dealId: string) {
  const qc = useQueryClient();
  const setState = useSetPlaybookStepState({ mutation: MOBILE_WRITE_OPTIONS });
  const reopen = useReopenPlaybookStep({ mutation: MOBILE_WRITE_OPTIONS });
  const { begin, end, runSerial, offerUndo } = useWriteStatus();

  async function run(
    assignmentId: string,
    stepId: string,
    status: StepStatus | null,
    opts: { note?: string | null; label: string; offerUndoWindow?: boolean },
  ): Promise<WriteOutcome | null> {
    const key = getGetPlaybookJourneyQueryKey(dealId);

    return runSerial(`playbook:${assignmentId}`, async () => {
      begin("playbook");
      await qc.cancelQueries({ queryKey: key });
      const snapshot = qc.getQueriesData({ queryKey: key });
      qc.setQueriesData({ queryKey: key }, (old) =>
        patchPlaybookStep(old, assignmentId, stepId, status, opts.note),
      );

      try {
        if (status === null) {
          await reopen.mutateAsync({ assignmentId, stepId });
        } else {
          await setState.mutateAsync({
            assignmentId,
            stepId,
            // No `as never` here. The generated type and the spec agree
            // (`note?: string | null`); the cast on the desktop panel was stale.
            data: { status, note: opts.note ? opts.note : null },
          });
        }
        haptic();
        await invalidatePlaybook(qc, dealId, assignmentId);

        // Reopening IS the undo, so it does not offer one of its own — an undo
        // bar that undoes an undo is a loop with no exit.
        if (status !== null && opts.offerUndoWindow !== false) {
          offerUndo({
            id: `step:${stepId}`,
            openedAt: performance.now(),
            action: { kind: "playbook-step", assignmentId, stepId, label: opts.label },
          });
        }
        return null;
      } catch (error) {
        snapshot.forEach(([k, previous]) => qc.setQueryData(k, previous));
        return classifyWriteError(error);
      } finally {
        end("playbook");
      }
    });
  }

  return {
    setStatus: (assignmentId: string, stepId: string, status: StepStatus, opts: { note?: string | null; label: string }) =>
      run(assignmentId, stepId, status, opts),
    reopenStep: (assignmentId: string, stepId: string, label: string) =>
      run(assignmentId, stepId, null, { label, offerUndoWindow: false }),
    isPending: setState.isPending || reopen.isPending,
  };
}
