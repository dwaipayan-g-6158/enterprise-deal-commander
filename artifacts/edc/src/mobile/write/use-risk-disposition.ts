import { useQueryClient } from "@tanstack/react-query";
import {
  useClearDisposition,
  useSetDisposition,
  getGetDealIntelligenceQueryKey,
} from "@workspace/api-client-react";
import { MOBILE_WRITE_OPTIONS } from "@/mobile/write/write-options";
import { patchAlertDisposition, unpatchAlertDisposition } from "@/mobile/write/optimistic";
import { invalidateDisposition } from "@/mobile/write/invalidate";
import { classifyWriteError, type WriteOutcome } from "@/mobile/write/write-outcome";
import { useWriteStatus } from "@/mobile/write/write-status-context";
import { haptic } from "@/mobile/lib/haptics";

export type Disposition = "acknowledge" | "snooze" | "accept";

/** The server enforces this too; stating it here lets the UI count down live. */
export const RATIONALE_MIN_LENGTH = 10;

/**
 * Risk dispositions.
 *
 * The ONLY module permitted to import `useSetDisposition` and
 * `useClearDisposition`.
 *
 * ## Two of the three are undoable, and the third must not be
 *
 * `acknowledge` and `snooze` are notes: they record that someone has seen an
 * alert and when to raise it again. Both are single taps, both are eminently
 * fat-fingerable on a phone, and both get the undo window.
 *
 * `accept` is different in kind. Server-side, `isBlockingRedAlert` treats an
 * accepted alert as CLEARING THE STAGE GUARDRAIL, while acknowledge and snooze
 * do not. Accepting is therefore an authorization to advance past a red alert,
 * it carries a mandatory rationale, and it is audited. Letting that be issued
 * and silently revoked inside a six-second window — with no second rationale
 * recorded — would leave a guardrail lifted and replaced with nothing on the
 * record explaining why. So accept requires confirmation, states its
 * consequence on screen, and offers no undo.
 */
export function useRiskDisposition(dealId: string) {
  const qc = useQueryClient();
  const setDisposition = useSetDisposition({ mutation: MOBILE_WRITE_OPTIONS });
  const clearDisposition = useClearDisposition({ mutation: MOBILE_WRITE_OPTIONS });
  const { begin, end, runSerial, offerUndo, noteSaved } = useWriteStatus();

  const key = getGetDealIntelligenceQueryKey(dealId);

  async function apply(
    patternCode: string,
    disposition: Disposition,
    opts: { label: string; rationale?: string; snoozeDays?: number; snoozeUntilFieldChange?: string },
  ): Promise<WriteOutcome | null> {
    return runSerial(`disposition:${dealId}`, async () => {
      begin("disposition");
      await qc.cancelQueries({ queryKey: key });
      const snapshot = qc.getQueriesData({ queryKey: key });
      qc.setQueriesData({ queryKey: key }, (old) =>
        patchAlertDisposition(old, patternCode, disposition),
      );

      try {
        await setDisposition.mutateAsync({
          dealId,
          patternCode,
          data: {
            disposition,
            ...(opts.rationale ? { rationale: opts.rationale } : {}),
            ...(opts.snoozeDays ? { snooze_duration_days: opts.snoozeDays } : {}),
            ...(opts.snoozeUntilFieldChange
              ? { snooze_until_field_change: opts.snoozeUntilFieldChange }
              : {}),
          },
        });
        haptic();
        noteSaved();
        await invalidateDisposition(qc, dealId);

        if (disposition !== "accept") {
          offerUndo({
            id: `disposition:${patternCode}`,
            openedAt: performance.now(),
            action: { kind: "disposition", dealId, patternCode, label: opts.label },
          });
        }
        return null;
      } catch (error) {
        snapshot.forEach(([k, previous]) => qc.setQueryData(k, previous));
        return classifyWriteError(error);
      } finally {
        end("disposition");
      }
    });
  }

  /** The undo for acknowledge and snooze. Never offered for accept. */
  async function clear(patternCode: string): Promise<WriteOutcome | null> {
    return runSerial(`disposition:${dealId}`, async () => {
      begin("disposition");
      await qc.cancelQueries({ queryKey: key });
      const snapshot = qc.getQueriesData({ queryKey: key });
      qc.setQueriesData({ queryKey: key }, (old) => unpatchAlertDisposition(old, patternCode));

      try {
        await clearDisposition.mutateAsync({ dealId, patternCode });
        haptic();
        noteSaved();
        await invalidateDisposition(qc, dealId);
        return null;
      } catch (error) {
        snapshot.forEach(([k, previous]) => qc.setQueryData(k, previous));
        return classifyWriteError(error);
      } finally {
        end("disposition");
      }
    });
  }

  return {
    apply,
    clear,
    isPending: setDisposition.isPending || clearDisposition.isPending,
  };
}
