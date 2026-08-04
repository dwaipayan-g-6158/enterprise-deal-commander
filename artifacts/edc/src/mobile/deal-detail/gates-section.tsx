import { Check } from "lucide-react";
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
      <p className="m-title">
        {pct}%
        <span className="m-caption m-muted ml-2">
          {track.stepsCompleted} of {track.totalSteps} cleared
        </span>
      </p>
      <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-muted">
        <div
          className="h-full rounded-full bg-primary"
          style={{ width: `${pct}%` }}
        />
      </div>
      <p className="m-caption m-muted mt-2">Next: {track.currentMilestone}</p>
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
                  "mt-1 flex h-4 w-4 shrink-0 items-center justify-center rounded-full border",
                  gate.isCompleted
                    ? "border-emerald-500 bg-emerald-500 text-white"
                    : "border-border",
                )}
                aria-hidden="true"
              >
                {/* A drawn check rather than the ✓ character: the glyph is a
                    different weight and optical size in every face, and it
                    never centres in a 16px circle. */}
                {gate.isCompleted ? <Check className="h-2.5 w-2.5" strokeWidth={3.5} /> : null}
              </span>
              <div className="min-w-0 flex-1">
                <p className={cn("m-body", !gate.isCompleted && "m-muted")}>
                  {gate.label}
                  <span className="sr-only">
                    {gate.isCompleted ? " — cleared" : " — not cleared"}
                  </span>
                </p>
                <p className="m-caption m-muted mt-0.5">Gate {gate.gateGroup}</p>
              </div>
            </li>
          ))}
      </ul>
    </CollapsibleSection>
  );
}
