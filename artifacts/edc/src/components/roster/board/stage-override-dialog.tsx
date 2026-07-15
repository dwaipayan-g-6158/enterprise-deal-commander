import { useEffect, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { GuardrailNotice } from "@/components/cockpit/risk/guardrail-notice";
import type { StageMoveApi } from "./use-stage-move";

const MIN_REASON = 10;
const MAX_REASON = 1000;

// Shown when a drag/context-menu stage move hits the server's 409 guardrail.
// Collects an override reason and re-submits via the move API. Cancelling just
// dismisses — the optimistic move was already rolled back by the hook.
export function StageOverrideDialog({ moveApi }: { moveApi: StageMoveApi }) {
  const { pendingOverride, submitOverride, cancelOverride } = moveApi;
  const [reason, setReason] = useState("");

  // Reset the field each time a new guardrail is raised.
  useEffect(() => {
    if (pendingOverride) setReason("");
  }, [pendingOverride]);

  const open = pendingOverride !== null;
  const trimmed = reason.trim();
  const canSubmit = trimmed.length >= MIN_REASON;

  return (
    <Dialog open={open} onOpenChange={(v) => !v && cancelOverride()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Stage advancement blocked</DialogTitle>
          <DialogDescription>
            {pendingOverride
              ? `Moving “${pendingOverride.deal.dealName}” to ${pendingOverride.toStage.name} is gated by active risk. Document why you're overriding to proceed.`
              : null}
          </DialogDescription>
        </DialogHeader>

        {pendingOverride && (
          <div className="rounded-md border border-destructive/40 bg-destructive/10 p-4 space-y-3">
            <GuardrailNotice message={pendingOverride.message} patternCodes={pendingOverride.patternCodes} />
            <div className="grid gap-2">
              <Label className="text-xs" htmlFor="override-reason">
                Override reason (min {MIN_REASON} chars)
              </Label>
              <Textarea
                id="override-reason"
                rows={3}
                autoFocus
                maxLength={MAX_REASON}
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder="Document why you are overriding the guardrail…"
              />
            </div>
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={cancelOverride}>
            Cancel
          </Button>
          <Button disabled={!canSubmit} onClick={() => submitOverride(trimmed)}>
            Override &amp; Move
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
