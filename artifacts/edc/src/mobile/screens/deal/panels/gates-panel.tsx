import { useMemo, useState } from "react";
import { AlertTriangle, Check, Lock } from "lucide-react";
import { cn } from "@/lib/utils";
import { formatDate, humanizeCode } from "@/lib/format";
import { useGetDealIntelligence, useListGates, type Gate } from "@workspace/api-client-react";
import { useCanWrite } from "@/lib/auth/role-context";
import { MobileCard, CardHeader } from "@/mobile/components/mobile-card";
import { PanelBody, type PanelBodyProps } from "@/mobile/screens/deal/panel-screen";
import { WriteErrorInline } from "@/mobile/write/write-error-inline";
import type { WriteOutcome } from "@/mobile/write/write-outcome";
import { useGateToggle } from "@/mobile/write/use-gate-toggle";

/**
 * Technical validation gates, and the tap that clears one.
 *
 * ## The most natural write in the app to do from a phone
 *
 * You clear a gate walking out of the room where it was cleared. That is
 * precisely when a laptop is shut, and it is why this is one of the four writes
 * this shell ships.
 *
 * ## No confirmation, and a real undo instead
 *
 * The action is instantly reversible and the undo bar offers exactly that. A
 * dialog in front of a reversible one-tap action teaches people to dismiss
 * dialogs, which is how they end up dismissing the one that mattered.
 *
 * ## Prerequisites are shown, not enforced
 *
 * The engine records out-of-order completions as integrity warnings rather than
 * refusing them, because sometimes the work really did happen out of order.
 * Marking a gate whose prerequisites are open is therefore allowed and labelled,
 * which matches the server rather than inventing a stricter client.
 */
export function GatesPanel({ dealId }: PanelBodyProps) {
  const intelQuery = useGetDealIntelligence(dealId);
  const gatesQuery = useListGates(dealId);
  const { toggle, isPending } = useGateToggle(dealId);
  const canWrite = useCanWrite();
  const [outcome, setOutcome] = useState<WriteOutcome | null>(null);

  const intel = intelQuery.data?.data;
  const track = intel?.technicalTrack;

  // Prefer the dedicated gate list: it carries notes and completedBy, which the
  // intelligence payload's copy does not. Both are patched together on a write,
  // so they cannot disagree about completion.
  const gates = useMemo(() => {
    const list = gatesQuery.data?.data ?? track?.gates ?? [];
    return [...list].sort((a, b) => a.sortOrder - b.sortOrder);
  }, [gatesQuery.data, track]);

  const completedCodes = useMemo(
    () => new Set(gates.filter((g) => g.isCompleted).map((g) => g.gateCode)),
    [gates],
  );

  return (
    <PanelBody
      loading={intelQuery.isLoading && gatesQuery.isLoading}
      error={intelQuery.isError && gatesQuery.isError}
      empty={gates.length === 0 && !gatesQuery.isLoading}
      emptyTitle="No gates defined"
      emptyBody="Technical gates are configured per deal type in Settings."
    >
      <>
        {track ? (
          <MobileCard>
            <CardHeader label="Progress" />
            <p className="m-title m-num">
              {Math.round(track.progressPercentage)}%
              <span className="m-caption m-muted ml-2">
                {track.stepsCompleted} of {track.totalSteps} cleared
              </span>
            </p>
            <div className="mt-2.5 h-1.5 overflow-hidden rounded-full bg-muted" aria-hidden="true">
              <div
                className="h-full rounded-full bg-primary"
                style={{ width: `${Math.max(0, Math.min(100, track.progressPercentage))}%` }}
              />
            </div>
            <p className="m-caption m-muted mt-2">Next: {track.currentMilestone}</p>

            {track.integrityWarnings.length > 0 ? (
              <ul className="mt-3 space-y-1">
                {track.integrityWarnings.map((warning, i) => (
                  <li key={i} className="m-caption flex items-start gap-1.5 text-destructive">
                    <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                    <span className="text-pretty">{warning.message}</span>
                  </li>
                ))}
              </ul>
            ) : null}
          </MobileCard>
        ) : null}

        <MobileCard>
          <CardHeader label="Gates" />
          <ul className="-mx-4 -mb-4">
            {gates.map((gate, i) => (
              <li key={gate.gateCode} className={cn(i > 0 && "border-t border-border")}>
                <GateRow
                  gate={gate}
                  canWrite={canWrite}
                  pending={isPending}
                  blockedBy={(gate.prerequisiteGateCodes ?? []).filter(
                    (code) => !completedCodes.has(code),
                  )}
                  onToggle={async () => {
                    setOutcome(
                      await toggle(gate.gateCode, !gate.isCompleted, { label: gate.label }),
                    );
                  }}
                />
              </li>
            ))}
          </ul>
          <div className="px-4">
            <WriteErrorInline outcome={outcome} />
          </div>
        </MobileCard>
      </>
    </PanelBody>
  );
}

function GateRow({
  gate,
  canWrite,
  pending,
  blockedBy,
  onToggle,
}: {
  gate: Gate;
  canWrite: boolean;
  pending: boolean;
  blockedBy: string[];
  onToggle: () => void;
}) {
  const content = (
    <>
      <span
        className={cn(
          "mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full border-2",
          gate.isCompleted ? "border-primary bg-primary" : "border-border",
        )}
        aria-hidden="true"
      >
        {/* A drawn check rather than the ✓ character: the glyph is a different
            weight and optical size in every face, and it never centres. */}
        {gate.isCompleted ? (
          <Check className="h-3.5 w-3.5 text-primary-foreground" strokeWidth={3.5} />
        ) : null}
      </span>
      <span className="min-w-0 flex-1">
        <span className={cn("m-headline block", !gate.isCompleted && "m-muted")}>{gate.label}</span>
        <span className="m-caption m-muted block">
          Gate {gate.gateGroup}
          {gate.isCompleted && gate.completedBy ? ` · ${gate.completedBy}` : ""}
          {gate.isCompleted && gate.completedAt
            ? ` · ${formatDate(gate.completedAt, "—")}`
            : ""}
        </span>
        {gate.notes ? <span className="m-caption m-muted mt-0.5 block">{gate.notes}</span> : null}
        {blockedBy.length > 0 && !gate.isCompleted ? (
          <span className="m-caption m-muted mt-0.5 flex items-center gap-1">
            <Lock className="h-3 w-3 shrink-0" aria-hidden="true" />
            After {blockedBy.map(humanizeCode).join(", ")}
          </span>
        ) : null}
      </span>
    </>
  );

  // A reader sees the same row as a plain row — NOT an AdminOnly wrapper, which
  // renders null and would delete the gate list for anyone read-only, and not a
  // disabled checkbox either, which invites a tap and then refuses it. The state
  // is the content here; only the control is a permission.
  if (!canWrite) {
    return <div className="flex items-start gap-3 px-4 py-3.5">{content}</div>;
  }

  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={gate.isCompleted}
      disabled={pending}
      onClick={onToggle}
      className="m-tap m-press flex w-full items-start gap-3 px-4 py-3.5 text-left disabled:opacity-60"
    >
      {content}
    </button>
  );
}
