import { useQueryClient } from "@tanstack/react-query";
import {
  useUpdateGate,
  getGetDealIntelligenceQueryKey,
  getListGatesQueryKey,
} from "@workspace/api-client-react";
import { MOBILE_WRITE_OPTIONS } from "@/mobile/write/write-options";
import { patchGateList, patchIntelligenceGates } from "@/mobile/write/optimistic";
import { invalidateGates } from "@/mobile/write/invalidate";
import { classifyWriteError, type WriteOutcome } from "@/mobile/write/write-outcome";
import { useWriteStatus } from "@/mobile/write/write-status-context";
import { haptic } from "@/mobile/lib/haptics";

/**
 * Toggling a technical gate from the field.
 *
 * The ONLY module permitted to import `useUpdateGate` — see write-allowlist.test.ts.
 *
 * No confirmation: the action is instantly reversible and the undo bar offers
 * exactly that. A dialog in front of a reversible one-tap action trains people
 * to dismiss dialogs.
 *
 * Both caches holding gate state are patched together. Patching one leaves the
 * deal screen and the gates panel disagreeing about the completion percentage,
 * which the reader cannot resolve and has every reason to distrust.
 */
export function useGateToggle(dealId: string) {
  const qc = useQueryClient();
  const mutation = useUpdateGate({ mutation: MOBILE_WRITE_OPTIONS });
  const { begin, end, runSerial, offerUndo } = useWriteStatus();

  async function toggle(
    gateCode: string,
    isCompleted: boolean,
    opts: { label: string; notes?: string; offerUndoWindow?: boolean } = { label: gateCode },
  ): Promise<WriteOutcome | null> {
    const gatesKey = getListGatesQueryKey(dealId);
    const intelKey = getGetDealIntelligenceQueryKey(dealId);

    return runSerial(`gates:${dealId}`, async () => {
      begin("gate");
      await Promise.all([
        qc.cancelQueries({ queryKey: gatesKey }),
        qc.cancelQueries({ queryKey: intelKey }),
      ]);
      const snapshot = [...qc.getQueriesData({ queryKey: gatesKey }), ...qc.getQueriesData({ queryKey: intelKey })];

      qc.setQueriesData({ queryKey: gatesKey }, (old) => patchGateList(old, gateCode, isCompleted));
      qc.setQueriesData({ queryKey: intelKey }, (old) =>
        patchIntelligenceGates(old, gateCode, isCompleted),
      );

      try {
        await mutation.mutateAsync({
          dealId,
          gateCode,
          data: { is_completed: isCompleted, ...(opts.notes ? { notes: opts.notes } : {}) },
        });
        haptic();
        await invalidateGates(qc, dealId);
        if (opts.offerUndoWindow !== false) {
          offerUndo({
            id: `gate:${gateCode}:${isCompleted}`,
            openedAt: performance.now(),
            action: { kind: "gate", dealId, gateCode, wasCompleted: isCompleted, label: opts.label },
          });
        }
        return null;
      } catch (error) {
        // Every snapshotted variant, not just the one we read — setQueriesData
        // fanned out, so the rollback has to as well.
        snapshot.forEach(([key, previous]) => qc.setQueryData(key, previous));
        // Deliberately no haptic on failure. A buzz is a confirmation gesture,
        // and it is a no-op on current iOS anyway (lib/haptics.ts), so it can
        // never be the thing that tells someone their write did not land.
        return classifyWriteError(error);
      } finally {
        end("gate");
      }
    });
  }

  return { toggle, isPending: mutation.isPending };
}
