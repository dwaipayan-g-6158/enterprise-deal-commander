import { useCallback, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  useUpdateDeal,
  getListDealsQueryKey,
  getGetRosterEnrichmentQueryKey,
  getGetDealQueryKey,
  getGetDealIntelligenceQueryKey,
  type Deal,
  type DealUpdate,
} from "@workspace/api-client-react";
import { useToast } from "@/hooks/use-toast";
import { extractGuardrail, type BoardStage } from "../model/board";
import type { RosterRow } from "../model/roster-types";

export interface PendingOverride {
  deal: RosterRow;
  toStage: BoardStage;
  message: string;
  patternCodes: string[];
}

export interface StageMoveApi {
  /** Attempt to move a deal to a stage. No-op for same-stage or terminal targets. */
  move: (dealId: string, toStage: BoardStage) => void;
  /** Deals with an in-flight move (used to dim/lock their cards). */
  movingIds: Set<string>;
  /** Set when the last attempt hit the 409 guardrail; drives the override dialog. */
  pendingOverride: PendingOverride | null;
  /** Re-submit the pending move with an override reason (≥10 chars). */
  submitOverride: (reason: string) => void;
  /** Dismiss the override dialog (the optimistic change was already rolled back). */
  cancelOverride: () => void;
}

// Optimistically move a deal between columns in a cached deals-list response.
// Returns the input untouched when the deal isn't present, so unrelated cached
// param-variants are left alone.
function patchDealStage(cached: unknown, dealId: string, toStage: BoardStage): unknown {
  if (!cached || typeof cached !== "object") return cached;
  const c = cached as { data?: Deal[] };
  if (!Array.isArray(c.data)) return cached;
  let changed = false;
  const data = c.data.map((d) => {
    if (d.id !== dealId) return d;
    changed = true;
    return { ...d, salesStageId: toStage.id, salesStage: toStage.name };
  });
  return changed ? { ...c, data } : cached;
}

/**
 * Drag-drop / context-menu stage moves for the board. Optimistically relocates
 * the card, submits `PUT /deals/:id { sales_stage_id }` (which the server routes
 * through the guardrail, audit log, stage-changed event and pipeline-transition
 * recording), and on a 409 guardrail surfaces the override dialog. Enrichment is
 * invalidated on success because nothing else refreshes it and risk/velocity are
 * stage-dependent.
 */
export function useStageMove(rows: RosterRow[]): StageMoveApi {
  const qc = useQueryClient();
  const updateDeal = useUpdateDeal();
  const { toast } = useToast();

  const [movingIds, setMovingIds] = useState<Set<string>>(new Set());
  const [pendingOverride, setPendingOverride] = useState<PendingOverride | null>(null);

  // Refs keep the returned callbacks stable so memoized cards don't churn when
  // the row set refreshes.
  const rowsRef = useRef(rows);
  rowsRef.current = rows;
  const pendingRef = useRef<PendingOverride | null>(null);
  pendingRef.current = pendingOverride;

  const markMoving = (id: string, on: boolean) =>
    setMovingIds((prev) => {
      const next = new Set(prev);
      if (on) next.add(id);
      else next.delete(id);
      return next;
    });

  const attempt = useCallback(
    async (row: RosterRow, toStage: BoardStage, overrideReason: string | undefined, isOverride: boolean) => {
      const dealId = row.id;
      const listKey = getListDealsQueryKey();

      // Optimistic move: cancel in-flight refetches, snapshot, patch every
      // cached deals-list variant.
      await qc.cancelQueries({ queryKey: listKey });
      const snapshot = qc.getQueriesData({ queryKey: listKey });
      qc.setQueriesData({ queryKey: listKey }, (old) => patchDealStage(old, dealId, toStage));
      markMoving(dealId, true);

      try {
        const data: DealUpdate = { sales_stage_id: toStage.id };
        if (overrideReason && overrideReason.length >= 10) data.override_reason = overrideReason;
        await updateDeal.mutateAsync({ id: dealId, data });

        await Promise.all([
          qc.invalidateQueries({ queryKey: listKey }),
          qc.invalidateQueries({ queryKey: getGetRosterEnrichmentQueryKey() }),
          qc.invalidateQueries({ queryKey: getGetDealQueryKey(dealId) }),
          qc.invalidateQueries({ queryKey: getGetDealIntelligenceQueryKey(dealId) }),
        ]);
        toast({ title: `Moved to ${toStage.name}` });
        setPendingOverride(null);
      } catch (err: unknown) {
        // Roll back every snapshotted variant.
        snapshot.forEach(([key, prev]) => qc.setQueryData(key, prev));
        const guardrail = extractGuardrail(err);
        if (guardrail && !isOverride) {
          setPendingOverride({ deal: row, toStage, message: guardrail.message, patternCodes: guardrail.patternCodes });
        } else {
          const msg = (err as { data?: { error?: { message?: string } } })?.data?.error?.message;
          toast({
            title: "Could not move deal",
            description: msg ?? "The stage change was rejected.",
            variant: "destructive",
          });
          // On a failed override, leave the dialog open so the user can retry or cancel.
        }
      } finally {
        markMoving(dealId, false);
      }
    },
    [qc, updateDeal, toast],
  );

  const move = useCallback(
    (dealId: string, toStage: BoardStage) => {
      const row = rowsRef.current.find((r) => r.id === dealId);
      if (!row) return;
      if (row.salesStageId === toStage.id) return; // same column — no-op
      if (toStage.terminal) return; // terminal columns are view-only in v1
      void attempt(row, toStage, undefined, false);
    },
    [attempt],
  );

  const submitOverride = useCallback(
    (reason: string) => {
      const po = pendingRef.current;
      if (!po) return;
      void attempt(po.deal, po.toStage, reason.trim(), true);
    },
    [attempt],
  );

  const cancelOverride = useCallback(() => setPendingOverride(null), []);

  return { move, movingIds, pendingOverride, submitOverride, cancelOverride };
}
