import { useState } from "react";
import { Ban, Check, RotateCcw, SkipForward } from "lucide-react";
import { cn } from "@/lib/utils";
import { formatDate } from "@/lib/format";
import { useGetPlaybookJourney } from "@workspace/api-client-react";
import { useCanWrite } from "@/lib/auth/role-context";
import { MobileCard, CardHeader } from "@/mobile/components/mobile-card";
import { MActionSheet } from "@/mobile/ui/m-action-sheet";
import { PanelBody, type PanelBodyProps } from "@/mobile/screens/deal/panel-screen";
import { WriteErrorInline } from "@/mobile/write/write-error-inline";
import type { WriteOutcome } from "@/mobile/write/write-outcome";
import type { StepStatus } from "@/mobile/write/optimistic";
import { usePlaybookStep } from "@/mobile/write/use-playbook-step";

/**
 * The playbook journey endpoint is an open payload in the contract
 * (GenericDataResponse), so the fields read here are declared locally — the same
 * approach `v2/playbook-panel.tsx` takes on desktop.
 */
interface Step {
  id: string;
  stepOrder: number;
  stepName: string;
  recommendedAction: string;
  expectedDurationDays: number | null;
  isCritical: boolean;
}

interface StepStateView {
  status: StepStatus;
  note: string | null;
  actionedAt: string;
}

interface JourneyEntry {
  playbookId: string;
  playbookName: string;
  applicableStage: string | null;
  isCurrentStage: boolean;
  assignmentId: string | null;
  status: string;
  totalSteps: number;
  completedCount: number;
  progressPct: number;
  criticalGaps: number;
  overdueCount: number;
  steps: Step[];
  stepStates: Record<string, StepStateView>;
  overdueStepIds: string[];
}

const STATUS_MARK: Record<StepStatus, { label: string; icon: typeof Check; tone: string }> = {
  completed: { label: "Done", icon: Check, tone: "border-primary bg-primary text-primary-foreground" },
  skipped: { label: "Skipped", icon: SkipForward, tone: "border-border bg-muted text-muted-foreground" },
  blocked: { label: "Blocked", icon: Ban, tone: "border-destructive bg-destructive/10 text-destructive" },
};

/**
 * The deal's playbooks, and the steps you tick walking out of the meeting.
 *
 * ## Skipped is not done, and it must not look like it
 *
 * A step can be completed, skipped or blocked, and an early version of the
 * desktop panel drew a skip with the same green check as a completion — so a
 * playbook that had been abandoned read as a playbook that had been run. All
 * three states get their own mark here, and only one of them is a check.
 *
 * ## Every started playbook, not just the current stage
 *
 * The journey covers all five stages. Showing only the current one hides that
 * the Discovery play was never finished, which is usually the reason the current
 * stage is stuck.
 */
export function PlaybookPanel({ dealId }: PanelBodyProps) {
  const query = useGetPlaybookJourney(dealId);
  const { setStatus, reopenStep, isPending } = usePlaybookStep(dealId);
  const canWrite = useCanWrite();
  const [sheetFor, setSheetFor] = useState<{ entry: JourneyEntry; step: Step } | null>(null);
  const [outcome, setOutcome] = useState<WriteOutcome | null>(null);

  const journey = ((query.data?.data as { journey?: JourneyEntry[] } | undefined)?.journey ??
    []) as JourneyEntry[];
  const started = journey.filter((e) => e.assignmentId);

  async function run(entry: JourneyEntry, step: Step, status: StepStatus) {
    if (!entry.assignmentId) return;
    setOutcome(
      await setStatus(entry.assignmentId, step.id, status, { label: step.stepName }),
    );
  }

  return (
    <PanelBody
      loading={query.isLoading}
      error={query.isError}
      empty={!query.isLoading && journey.length === 0}
      emptyTitle="No playbooks yet"
      emptyBody="A playbook is assigned when the deal enters a stage that has one."
    >
      <>
        {started.length === 0 && journey.length > 0 ? (
          <MobileCard>
            <p className="m-body m-muted">
              No playbook has been started on this deal. Starting one is a desktop action — it
              assigns the play and its owners.
            </p>
          </MobileCard>
        ) : null}

        {journey.map((entry) => (
          <MobileCard key={entry.playbookId}>
            <CardHeader
              label={entry.playbookName}
              action={
                entry.isCurrentStage ? (
                  <span className="m-caption text-primary">Current stage</span>
                ) : entry.applicableStage ? (
                  <span className="m-caption m-muted">{entry.applicableStage}</span>
                ) : undefined
              }
            />

            <div className="flex items-baseline justify-between gap-3">
              <p className="m-headline m-num">
                {entry.completedCount}
                <span className="m-muted">/{entry.totalSteps}</span>
                <span className="m-caption m-muted ml-2">steps</span>
              </p>
              {entry.criticalGaps > 0 ? (
                <span className="m-caption text-destructive">{entry.criticalGaps} critical open</span>
              ) : null}
            </div>
            <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-muted" aria-hidden="true">
              <div
                className={cn(
                  "h-full rounded-full",
                  // A playbook nobody has started shows its fill in grey, so
                  // "assigned but untouched" and "not assigned" do not read the
                  // same at a glance.
                  entry.assignmentId ? "bg-primary" : "bg-muted-foreground/40",
                  // Ticking a step recomputes this optimistically; the movement
                  // is the confirmation that the tap landed.
                  "m-fill",
                )}
                style={{ width: `${Math.max(0, Math.min(100, entry.progressPct))}%` }}
              />
            </div>

            <ul className="-mx-4 mt-3 -mb-4">
              {[...entry.steps]
                .sort((a, b) => a.stepOrder - b.stepOrder)
                .map((step, i) => (
                  <li key={step.id} className={cn(i > 0 && "border-t border-border")}>
                    <StepRow
                      step={step}
                      state={entry.stepStates?.[step.id]}
                      overdue={(entry.overdueStepIds ?? []).includes(step.id)}
                      actionable={entry.assignmentId != null && canWrite}
                      pending={isPending}
                      onPress={() => setSheetFor({ entry, step })}
                    />
                  </li>
                ))}
            </ul>
            <div className="px-4">
              <WriteErrorInline outcome={outcome} />
            </div>
          </MobileCard>
        ))}

        <MActionSheet
          open={sheetFor != null}
          onOpenChange={(next) => {
            if (!next) setSheetFor(null);
          }}
          title={sheetFor?.step.stepName ?? ""}
          description={sheetFor?.step.recommendedAction}
          actions={
            sheetFor
              ? [
                  {
                    id: "completed",
                    label: "Mark done",
                    icon: Check,
                    onSelect: () => void run(sheetFor.entry, sheetFor.step, "completed"),
                  },
                  {
                    id: "skipped",
                    label: "Skip",
                    detail: "Recorded as skipped, not as done.",
                    icon: SkipForward,
                    onSelect: () => void run(sheetFor.entry, sheetFor.step, "skipped"),
                  },
                  {
                    id: "blocked",
                    label: "Blocked",
                    detail: "Something outside the play is stopping it.",
                    icon: Ban,
                    onSelect: () => void run(sheetFor.entry, sheetFor.step, "blocked"),
                  },
                  {
                    id: "reopen",
                    label: "Reopen",
                    detail: "Back to not started.",
                    icon: RotateCcw,
                    disabled: sheetFor.entry.stepStates?.[sheetFor.step.id] == null,
                    onSelect: () => {
                      if (!sheetFor.entry.assignmentId) return;
                      void reopenStep(
                        sheetFor.entry.assignmentId,
                        sheetFor.step.id,
                        sheetFor.step.stepName,
                      );
                    },
                  },
                ]
              : []
          }
        />
      </>
    </PanelBody>
  );
}

function StepRow({
  step,
  state,
  overdue,
  actionable,
  pending,
  onPress,
}: {
  step: Step;
  state: StepStateView | undefined;
  overdue: boolean;
  actionable: boolean;
  pending: boolean;
  onPress: () => void;
}) {
  const mark = state ? STATUS_MARK[state.status] : null;
  const Icon = mark?.icon;

  const content = (
    <>
      <span
        className={cn(
          "mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full border-2",
          mark ? mark.tone : "border-border",
        )}
        aria-hidden="true"
      >
        {Icon ? <Icon className="h-3.5 w-3.5" strokeWidth={3} /> : null}
      </span>
      <span className="min-w-0 flex-1">
        <span className={cn("m-headline block", !state && "m-muted")}>
          {step.stepName}
          {step.isCritical ? <span className="ml-1.5 text-destructive">·</span> : null}
          {/* The mark is the only visual channel for status, so the state is
              spelled out for anyone not reading colour or shape. */}
          <span className="sr-only">{mark ? ` — ${mark.label}` : " — not started"}</span>
        </span>
        <span className="m-caption m-muted block text-pretty">{step.recommendedAction}</span>
        {state?.note ? <span className="m-caption m-muted block">{state.note}</span> : null}
        {state ? (
          <span className="m-caption m-muted block">
            {mark?.label} · {formatDate(state.actionedAt, "—")}
          </span>
        ) : overdue ? (
          <span className="m-caption block text-destructive">Overdue</span>
        ) : step.expectedDurationDays != null ? (
          <span className="m-caption m-muted block">~{step.expectedDurationDays}d</span>
        ) : null}
      </span>
    </>
  );

  // A plain row when there is nothing to do here — an unstarted playbook, or a
  // read-only session. Deliberately NOT an AdminOnly wrapper: that renders null,
  // which would delete the entire step list for anyone read-only. The steps are
  // the content; only the sheet they open is a permission.
  if (!actionable) {
    return <div className="flex items-start gap-3 px-4 py-3.5">{content}</div>;
  }

  return (
    <button
      type="button"
      disabled={pending}
      onClick={onPress}
      className="m-tap m-press flex w-full items-start gap-3 px-4 py-3.5 text-left disabled:opacity-60"
    >
      {content}
    </button>
  );
}
