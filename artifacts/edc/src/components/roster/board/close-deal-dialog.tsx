import { useEffect, useState } from "react";
import { useListLossArchetypes, type DealUpdate } from "@workspace/api-client-react";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { formatCurrency } from "@/components/cockpit/use-invalidate";
import { Trophy, Ban } from "lucide-react";
import type { BoardStage } from "../model/board";
import type { RosterRow } from "../model/roster-types";

export interface PendingClose {
  row: RosterRow;
  toStage: BoardStage;
}

// Drag-to-close confirmation. Won is a simple confirm; Lost requires a loss
// archetype (client-side enforcement — the server's 422 is unimplemented) and
// takes an optional reason. Emits the extra DealUpdate fields for the move.
export function CloseDealDialog({
  pending,
  onCancel,
  onConfirm,
}: {
  pending: PendingClose | null;
  onCancel: () => void;
  onConfirm: (extra: DealUpdate) => void;
}) {
  const { data: archetypes } = useListLossArchetypes();
  const [archetypeId, setArchetypeId] = useState<string>("");
  const [reason, setReason] = useState("");

  useEffect(() => {
    if (pending) {
      setArchetypeId("");
      setReason("");
    }
  }, [pending]);

  const outcome = pending?.toStage.terminal; // "won" | "lost" | null
  const isLost = outcome === "lost";
  const canConfirm = !isLost || archetypeId !== "";

  const submit = () => {
    if (!pending) return;
    const extra: DealUpdate = {};
    if (isLost) {
      extra.loss_archetype_id = Number(archetypeId);
      if (reason.trim()) extra.loss_reason = reason.trim();
    }
    onConfirm(extra);
  };

  return (
    <Dialog open={pending !== null} onOpenChange={(v) => !v && onCancel()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            {isLost ? <Ban className="h-5 w-5 text-rose-500" /> : <Trophy className="h-5 w-5 text-emerald-500" />}
            Mark deal {outcome === "won" ? "Won" : "Lost"}
          </DialogTitle>
          <DialogDescription>
            {pending
              ? `${pending.row.dealName} · ${formatCurrency(pending.row.calculatedTCV ?? 0, pending.row.dealCurrency)}`
              : null}
          </DialogDescription>
        </DialogHeader>

        {isLost && (
          <div className="space-y-4">
            <div className="grid gap-2">
              <Label htmlFor="close-archetype">Loss archetype (required)</Label>
              <Select value={archetypeId} onValueChange={setArchetypeId}>
                <SelectTrigger id="close-archetype">
                  <SelectValue placeholder="Select archetype" />
                </SelectTrigger>
                <SelectContent>
                  {(archetypes?.data ?? []).map((a) => (
                    <SelectItem key={a.id} value={String(a.id)}>
                      {a.archetypeName}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-2">
              <Label htmlFor="close-reason">Loss reason (optional)</Label>
              <Textarea
                id="close-reason"
                rows={3}
                maxLength={2000}
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder="What ultimately lost this deal?"
              />
            </div>
          </div>
        )}

        {outcome === "won" && (
          <p className="text-sm text-muted-foreground">
            This marks the deal Closed-Won and archives it to Deal Memory.
          </p>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={onCancel}>
            Cancel
          </Button>
          <Button disabled={!canConfirm} onClick={submit}>
            {outcome === "won" ? "Mark Won" : "Mark Lost"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
