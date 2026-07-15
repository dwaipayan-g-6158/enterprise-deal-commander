import { useCallback, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  useUpdateDeal,
  getListDealsQueryKey,
  getGetRosterEnrichmentQueryKey,
  getGetDealQueryKey,
  getGetDealIntelligenceQueryKey,
  getSearchDealMemoryQueryKey,
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
  /** Extra fields (e.g. loss archetype/reason on a close) to re-send with the override. */
  extra?: DealUpdate;
}

export interface StageMoveApi {
  /** Move a deal to a non-terminal stage. No-op for same-stage or terminal targets. */
  move: (dealId: string, toStage: BoardStage) => void;
  /** Close a deal into a terminal stage, carrying won/lost fields. */
  close: (dealId: string, toStage: BoardStage, extra: DealUpdate) => void;
  /** Deals with an in-flight move (used to dim/lock their cards). */
  movingIds: Set<string>;
  /** Set when the last attempt hit the 409 guardrail; drives the override dialog. */
  pendingOverride: PendingOverride | null;
  /** Re-submit the pending move with an override reason (≥10 chars). */
  submitOverride: (reason: string) => void;
  /** Dismiss the override dialog (the optimistic change was already rolled back). */
  cancelOverride: () => void;
}

export interface StageMoveOptions {
  /** Called after a successful move into a terminal stage (in place of the generic toast). */
  onClosed?: (row: RosterRow, outcome: "won" | "lost") => void;
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
 * the card, submits `PUT /deals/:id` (which the server routes through the
 * guardrail, audit log, stage-changed event and pipeline-transition recording),
 * and on a 409 guardrail surfaces the override dialog. Terminal moves (close)
 * carry won/lost fields and notify via `onClosed`. Enrichment is invalidated on
 * success because nothing else refreshes it and risk/velocity are stage-dependent.
 */
export function useStageMove(rows: RosterRow[], opts: StageMoveOptions = {}): StageMoveApi {
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
  const onClosedRef = useRef(opts.onClosed);
  onClosedRef.current = opts.onClosed;

  const markMoving = (id: string, on: boolean) =>
    setMovingIds((prev) => {
      const next = new Set(prev);
      if (on) next.add(id);
      else next.delete(id);
      return next;
    });

  const attempt = useCallback(
    async (
      row: RosterRow,
      toStage: BoardStage,
      overrideReason: string | undefined,
      isOverride: boolean,
      extra?: DealUpdate,
    ) => {
      const dealId = row.id;
      const listKey = getListDealsQueryKey();

      // Optimistic move: cancel in-flight refetches, snapshot, patch every
      // cached deals-list variant.
      await qc.cancelQueries({ queryKey: listKey });
      const snapshot = qc.getQueriesData({ queryKey: listKey });
      qc.setQueriesData({ queryKey: listKey }, (old) => patchDealStage(old, dealId, toStage));
      markMoving(dealId, true);

      try {
        const data: DealUpdate = { ...extra, sales_stage_id: toStage.id };
        if (overrideReason && overrideReason.length >= 10) data.override_reason = overrideReason;
        await updateDeal.mutateAsync({ id: dealId, data });

        const invalidations = [
          qc.invalidateQueries({ queryKey: listKey }),
          qc.invalidateQueries({ queryKey: getGetRosterEnrichmentQueryKey() }),
          qc.invalidateQueries({ queryKey: getGetDealQueryKey(dealId) }),
          qc.invalidateQueries({ queryKey: getGetDealIntelligenceQueryKey(dealId) }),
        ];
        // A close archives the deal to memory (post-mortem subscriber) — refresh
        // the memory surfaces so the autopsy sheet finds the new row.
        if (toStage.terminal) {
          invalidations.push(qc.invalidateQueries({ queryKey: getSearchDealMemoryQueryKey() }));
        }
        await Promise.all(invalidations);

        setPendingOverride(null);
        if (toStage.terminal) onClosedRef.current?.(row, toStage.terminal);
        else toast({ title: `Moved to ${toStage.name}` });
      } catch (err: unknown) {
        // Roll back every snapshotted variant.
        snapshot.forEach(([key, prev]) => qc.setQueryData(key, prev));
        const guardrail = extractGuardrail(err);
        if (guardrail && !isOverride) {
          setPendingOverride({ deal: row, toStage, message: guardrail.message, patternCodes: guardrail.patternCodes, extra });
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
      if (toStage.terminal) return; // closing goes through close(), not a plain move
      void attempt(row, toStage, undefined, false);
    },
    [attempt],
  );

  const close = useCallback(
    (dealId: string, toStage: BoardStage, extra: DealUpdate) => {
      const row = rowsRef.current.find((r) => r.id === dealId);
      if (!row) return;
      if (row.salesStageId === toStage.id) return; // already there — no-op
      void attempt(row, toStage, undefined, false, extra);
    },
    [attempt],
  );

  const submitOverride = useCallback(
    (reason: string) => {
      const po = pendingRef.current;
      if (!po) return;
      void attempt(po.deal, po.toStage, reason.trim(), true, po.extra);
    },
    [attempt],
  );

  const cancelOverride = useCallback(() => setPendingOverride(null), []);

  return { move, close, movingIds, pendingOverride, submitOverride, cancelOverride };
}
