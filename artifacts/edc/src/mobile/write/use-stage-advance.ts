import { useQueryClient } from "@tanstack/react-query";
import { useUpdateDeal, getListDealsQueryKey, type DealUpdate } from "@workspace/api-client-react";
import { extractGuardrail, patchDealStage, type BoardStage } from "@/components/roster/model/board";
import { MOBILE_WRITE_OPTIONS } from "@/mobile/write/write-options";
import { invalidateStage } from "@/mobile/write/invalidate";
import { classifyWriteError, type WriteOutcome } from "@/mobile/write/write-outcome";
import { useWriteStatus } from "@/mobile/write/write-status-context";
import { haptic } from "@/mobile/lib/haptics";

/** The server enforces this too; stating it here lets the UI count down live. */
export const OVERRIDE_REASON_MIN_LENGTH = 10;

export interface GuardrailBlock {
  message: string;
  patternCodes: string[];
}

export type StageResult =
  | { status: "ok" }
  | { status: "blocked"; guardrail: GuardrailBlock }
  | { status: "failed"; outcome: WriteOutcome };

/**
 * Advancing a deal's stage, including the 409 guardrail.
 *
 * The ONLY module permitted to import `useUpdateDeal`.
 *
 * Modelled on `components/roster/board/use-stage-move.ts`, which is already
 * correct and already has the 409 shape under test. `patchDealStage` and
 * `extractGuardrail` are IMPORTED from the roster model rather than reimplemented
 * — two implementations of "move a deal between stages" is exactly the
 * divergence useRosterData exists to prevent, and the phone and the laptop
 * disagreeing about which stage a deal is in would be the worst possible bug to
 * ship in a field app.
 *
 * Terminal stages are deliberately not reachable from here. Closing a deal
 * collects a loss archetype, a loss reason and a competitor (close-deal-dialog
 * on desktop), and those write the Deal Memory record the whole Memory tab is
 * built on. Shipping a close without them would quietly file an autopsy with a
 * hole in it, and nobody would notice until they went looking months later.
 */
export function useStageAdvance(dealId: string) {
  const qc = useQueryClient();
  const mutation = useUpdateDeal({ mutation: MOBILE_WRITE_OPTIONS });
  const { begin, end, runSerial } = useWriteStatus();

  async function advance(
    toStage: BoardStage,
    opts: { overrideReason?: string } = {},
  ): Promise<StageResult> {
    const listKey = getListDealsQueryKey();

    return runSerial(`stage:${dealId}`, async () => {
      begin("stage");
      await qc.cancelQueries({ queryKey: listKey });
      const snapshot = qc.getQueriesData({ queryKey: listKey });
      qc.setQueriesData({ queryKey: listKey }, (old) => patchDealStage(old, dealId, toStage));

      try {
        const data: DealUpdate = { sales_stage_id: toStage.id };
        if (opts.overrideReason && opts.overrideReason.length >= OVERRIDE_REASON_MIN_LENGTH) {
          data.override_reason = opts.overrideReason;
        }
        await mutation.mutateAsync({ id: dealId, data });
        haptic();
        await invalidateStage(qc, dealId);
        return { status: "ok" } as const;
      } catch (error) {
        snapshot.forEach(([key, previous]) => qc.setQueryData(key, previous));

        const guardrail = extractGuardrail(error);
        // Only surface the guardrail branch on a FIRST attempt. A 409 on a
        // submission that already carried an override means the override was
        // rejected, and re-offering the same form as though nothing had been
        // tried is how a user ends up typing the same reason three times.
        if (guardrail && !opts.overrideReason) {
          return { status: "blocked", guardrail } as const;
        }
        return { status: "failed", outcome: classifyWriteError(error) } as const;
      } finally {
        end("stage");
      }
    });
  }

  return { advance, isPending: mutation.isPending };
}
