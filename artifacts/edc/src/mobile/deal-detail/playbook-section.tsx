import { cn } from "@/lib/utils";
import { CollapsibleSection } from "@/mobile/components/collapsible-section";

/**
 * The playbook journey endpoint is typed as an open payload in the contract
 * (GenericDataResponse), so the fields this screen reads are declared locally
 * — the same approach playbook-panel.tsx takes on desktop.
 */
export interface JourneyEntry {
  playbookId: string;
  playbookName: string;
  applicableStage: string | null;
  isCurrentStage: boolean;
  assignmentId: string | null;
  status: string;
  totalSteps: number;
  completedCount: number;
  progressPct: number;
}

/**
 * Where the deal stands against its playbooks. The desktop panel lets an
 * admin mark steps done; here it reads as a progress rail, because "are we
 * running the play" is the field question.
 */
export function PlaybookSection({ journey }: { journey: JourneyEntry[] }) {
  const started = journey.filter((e) => e.assignmentId);
  const totalSteps = journey.reduce((sum, e) => sum + e.totalSteps, 0);
  const doneSteps = journey.reduce((sum, e) => sum + e.completedCount, 0);
  const current = journey.find((e) => e.isCurrentStage);

  const verdict = (
    <>
      <p className="m-h3">
        {current ? current.playbookName : started.length ? "In progress" : "Not started"}
      </p>
      <p className="m-data m-muted mt-1">
        {totalSteps > 0
          ? `${doneSteps} of ${totalSteps} steps · ${started.length} of ${journey.length} playbooks started`
          : "No playbook steps yet"}
      </p>
    </>
  );

  return (
    <CollapsibleSection anchorId="playbook" label="Playbook" verdict={verdict}>
      {journey.length > 0 ? (
        <ul className="space-y-3">
          {journey.map((entry) => (
            <li key={entry.playbookId}>
              <div className="flex items-baseline justify-between gap-3">
                <p className={cn("text-sm", entry.isCurrentStage ? "font-semibold" : "m-muted")}>
                  {entry.playbookName}
                  {entry.isCurrentStage ? (
                    <span className="ml-1.5 text-primary">· current stage</span>
                  ) : null}
                </p>
                <span className="m-data m-muted shrink-0">
                  {entry.completedCount}/{entry.totalSteps}
                </span>
              </div>
              <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-muted">
                <div
                  className={cn(
                    "h-full rounded-full",
                    entry.assignmentId ? "bg-primary" : "bg-border",
                  )}
                  style={{ width: `${Math.round(entry.progressPct)}%` }}
                />
              </div>
            </li>
          ))}
        </ul>
      ) : undefined}
    </CollapsibleSection>
  );
}
