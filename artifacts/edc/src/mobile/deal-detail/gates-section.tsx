import type { Intelligence } from "@workspace/api-client-react";
import { cn } from "@/lib/utils";
import { CollapsibleSection } from "@/mobile/components/collapsible-section";

/**
 * Technical validation progress. Read-only by construction — the checkboxes
 * the cockpit renders here are marks of state, not controls, so a gate shows
 * whether it cleared and nothing invites a tap.
 */
export function GatesSection({ intel }: { intel: Intelligence }) {
  const track = intel.technicalTrack;
  const pct = Math.round(track.progressPercentage);

  const verdict = (
    <>
      <p className="m-h3">
        <span className="font-mono text-2xl font-semibold tracking-[-0.03em]">{pct}%</span>
        <span className="m-muted ml-2 text-sm font-medium">
          {track.stepsCompleted} of {track.totalSteps} cleared
        </span>
      </p>
      <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-[var(--m-skeleton)]">
        <div
          className="h-full rounded-full bg-[var(--m-primary)]"
          style={{ width: `${pct}%` }}
        />
      </div>
      <p className="m-data m-muted mt-2">Next: {track.currentMilestone}</p>
    </>
  );

  return (
    <CollapsibleSection anchorId="gates" label="Technical gates" verdict={verdict}>
      <ul className="space-y-2.5">
        {[...track.gates]
          .sort((a, b) => a.sortOrder - b.sortOrder)
          .map((gate) => (
            <li key={gate.gateCode} className="flex items-start gap-2.5">
              <span
                className={cn(
                  "mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full border text-[10px] font-bold",
                  gate.isCompleted
                    ? "border-emerald-500 bg-emerald-500 text-white"
                    : "border-[var(--m-keyline)]",
                )}
                aria-hidden="true"
              >
                {gate.isCompleted ? "✓" : ""}
              </span>
              <div className="min-w-0 flex-1">
                <p className={cn("text-sm", !gate.isCompleted && "m-muted")}>
                  {gate.label}
                  <span className="sr-only">
                    {gate.isCompleted ? " — cleared" : " — not cleared"}
                  </span>
                </p>
                <p className="m-data m-muted mt-0.5">Gate {gate.gateGroup}</p>
              </div>
            </li>
          ))}
      </ul>
    </CollapsibleSection>
  );
}
