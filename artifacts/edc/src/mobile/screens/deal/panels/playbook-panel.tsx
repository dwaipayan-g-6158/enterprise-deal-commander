import { useState } from "react";
import { Ban, Check, NotebookPen, RotateCcw, SkipForward } from "lucide-react";
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

/** Order the note screen offers the three states in. */
const STATUS_CHOICES: StepStatus[] = ["completed", "skipped", "blocked"];

/** Matches the server: `note` is text, and long prose belongs on the deal. */
const NOTE_MAX_LENGTH = 500;

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
  const [noteFor, setNoteFor] = useState<{ entry: JourneyEntry; step: Step } | null>(null);
  const [outcome, setOutcome] = useState<WriteOutcome | null>(null);

  const journey = ((query.data?.data as { journey?: JourneyEntry[] } | undefined)?.journey ??
    []) as JourneyEntry[];
  const started = journey.filter((e) => e.assignmentId);

  async function run(
    entry: JourneyEntry,
    step: Step,
    status: StepStatus,
    note?: string | null,
  ) {
    if (!entry.assignmentId) return null;
    const result = await setStatus(entry.assignmentId, step.id, status, {
      label: step.stepName,
      note,
    });
    setOutcome(result);
    return result;
  }

  // The note editor is a full screen, not a sheet, for the reason AcceptScreen
  // documents in alerts-panel.tsx: vaul repositions when the keyboard opens and
  // fights iOS precisely while someone is typing. MActionSheet also has no input
  // slot by design — its rows are label/detail/icon/onSelect only.
  if (noteFor) {
    return (
      <NoteScreen
        step={noteFor.step}
        state={noteFor.entry.stepStates?.[noteFor.step.id]}
        pending={isPending}
        onCancel={() => {
          setNoteFor(null);
          setOutcome(null);
        }}
        onSave={async (status, note) => {
          const result = await run(noteFor.entry, noteFor.step, status, note);
          // Stay put on failure so the note somebody just typed is not thrown
          // away — same rule as the accept rationale.
          if (!result) setNoteFor(null);
        }}
      />
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
                    // The three rows above stay one tap each — ticking a step
                    // walking out of a meeting is the whole point of the panel.
                    // This is the way in for the cases where the state alone
                    // does not say enough, and for editing what was written
                    // before.
                    id: "note",
                    label: sheetFor.entry.stepStates?.[sheetFor.step.id]?.note
                      ? "Edit the note"
                      : "Add a note",
                    detail: "Say why, and set the state at the same time.",
                    icon: NotebookPen,
                    onSelect: () => {
                      setNoteFor(sheetFor);
                      setOutcome(null);
                    },
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

/**
 * Setting a step's state and saying why, on one screen.
 *
 * ## One screen for both writing and editing
 *
 * A note and a state are one decision — "skipped, because procurement moved the
 * review" is a single thought — so they are captured together rather than in two
 * steps. The same screen edits: it opens prefilled with whatever is already
 * recorded, which is what makes an actioned step revisable at all. Previously
 * nothing on the phone could reach `note`, despite the whole path down to the
 * optimistic patch already accepting one, and StepRow already rendering it.
 *
 * The state is preselected to the step's current one so re-saving a note cannot
 * silently change the state as a side effect.
 */
function NoteScreen({
  step,
  state,
  pending,
  onCancel,
  onSave,
}: {
  step: Step;
  state: StepStateView | undefined;
  pending: boolean;
  onCancel: () => void;
  onSave: (status: StepStatus, note: string | null) => void;
}) {
  const [status, setStatus] = useState<StepStatus>(state?.status ?? "completed");
  const [note, setNote] = useState(state?.note ?? "");

  const trimmed = note.trim();
  const remaining = NOTE_MAX_LENGTH - trimmed.length;

  return (
    <section className="m-card p-4">
      <h2 className="m-headline">{step.stepName}</h2>
      <p className="m-body m-muted mt-1 text-pretty">{step.recommendedAction}</p>

      <p className="m-label m-muted mt-4">State</p>
      <div className="mt-1.5 flex gap-2" role="radiogroup" aria-label="Step state">
        {STATUS_CHOICES.map((choice) => {
          const selected = choice === status;
          return (
            <button
              key={choice}
              type="button"
              role="radio"
              aria-checked={selected}
              onClick={() => setStatus(choice)}
              className={cn(
                "m-label m-press m-tap flex-1 rounded-full border py-2.5",
                selected
                  ? "border-primary bg-primary text-primary-foreground"
                  : "border-border text-muted-foreground",
              )}
            >
              {STATUS_MARK[choice].label}
            </button>
          );
        })}
      </div>

      <label htmlFor="step-note" className="m-label m-muted mt-4 block">
        Note <span className="font-normal">(optional)</span>
      </label>
      <textarea
        id="step-note"
        value={note}
        onChange={(e) => setNote(e.target.value)}
        rows={4}
        maxLength={NOTE_MAX_LENGTH}
        // 16px minimum, or iOS zooms the viewport on focus.
        className="mt-1.5 w-full resize-none rounded-xl border border-border bg-card p-3 text-base outline-none"
        placeholder="What happened, or what is holding it up."
      />
      <p className="m-caption m-muted mt-1">
        {remaining <= 50 ? `${remaining} characters left` : "Shown against the step for the team."}
      </p>

      <button
        type="button"
        disabled={pending}
        // An empty note clears the stored one rather than writing "" — null is
        // what the API and the optimistic patch both treat as "no note".
        onClick={() => onSave(status, trimmed ? trimmed : null)}
        className="m-label m-press m-tap mt-3 w-full rounded-full border border-primary py-3 text-primary disabled:opacity-40"
      >
        Save
      </button>
      <button
        type="button"
        onClick={onCancel}
        className="m-label m-press m-tap m-muted mt-1 w-full py-3"
      >
        Cancel
      </button>
    </section>
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
