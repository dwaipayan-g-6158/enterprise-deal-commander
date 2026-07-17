import { and, asc, eq } from "drizzle-orm";
import {
  db,
  dealPlaybookAssignments,
  playbookSteps,
  playbookStepCompletions,
  engineThresholds,
} from "@workspace/db";

// Derives the playbook execution signals for a deal's ACTIVE assignment. These
// feed the predictive score (playbook_adherence factor), the risk engine
// (PLAYBOOK_EXECUTION_GAP pattern), the trajectory snapshot, and the deal's
// Playbook panel. Single source of truth so those surfaces never diverge.

export type PlaybookStepStatus = "completed" | "skipped" | "blocked";

export interface PlaybookStepStateView {
  status: PlaybookStepStatus;
  note: string | null;
  actionedAt: string;
}

export interface PlaybookSignals {
  assignmentId: string | null;
  playbookId: string | null;
  status: string | null;
  currentStepId: string | null;
  hasPlaybook: boolean;
  totalSteps: number;
  completedCount: number;
  /** Completed (non-skipped) steps / total, 0–100; null when no active assignment. */
  adherencePct: number | null;
  /** (Completed + skipped) / total, 0–100 — "how far through the play". */
  progressPct: number;
  /** Critical steps that were skipped OR blocked. */
  criticalGaps: number;
  overdueCount: number;
  stepStates: Record<string, PlaybookStepStateView>;
  overdueStepIds: string[];
}

const DEFAULT_GRACE_DAYS = 3;
const DAY_MS = 1000 * 60 * 60 * 24;

const EMPTY: PlaybookSignals = {
  assignmentId: null,
  playbookId: null,
  status: null,
  currentStepId: null,
  hasPlaybook: false,
  totalSteps: 0,
  completedCount: 0,
  adherencePct: null,
  progressPct: 0,
  criticalGaps: 0,
  overdueCount: 0,
  stepStates: {},
  overdueStepIds: [],
};

async function overdueGraceDays(): Promise<number> {
  const [row] = await db
    .select({ v: engineThresholds.parameterValue })
    .from(engineThresholds)
    .where(eq(engineThresholds.parameterKey, "playbook_overdue_grace_days"))
    .limit(1);
  const n = row ? Number(row.v) : NaN;
  return Number.isFinite(n) ? n : DEFAULT_GRACE_DAYS;
}

export async function getPlaybookSignals(dealId: string): Promise<PlaybookSignals> {
  const [assignment] = await db
    .select()
    .from(dealPlaybookAssignments)
    .where(
      and(
        eq(dealPlaybookAssignments.dealId, dealId),
        eq(dealPlaybookAssignments.status, "Active"),
      ),
    )
    .limit(1);
  if (!assignment) return EMPTY;

  const steps = await db
    .select()
    .from(playbookSteps)
    .where(eq(playbookSteps.playbookId, assignment.playbookId))
    .orderBy(asc(playbookSteps.stepOrder));
  const completions = await db
    .select()
    .from(playbookStepCompletions)
    .where(eq(playbookStepCompletions.assignmentId, assignment.id));

  // One action row per step (latest wins, defensive against any legacy dupes).
  type Completion = (typeof completions)[number];
  const byStep = new Map<string, Completion>();
  for (const c of completions) {
    const prev = byStep.get(c.stepId);
    if (
      !prev ||
      (c.completedAt && prev.completedAt && c.completedAt > prev.completedAt)
    ) {
      byStep.set(c.stepId, c);
    }
  }

  const graceDays = await overdueGraceDays();
  const assignedAt = assignment.assignedAt
    ? new Date(assignment.assignedAt).getTime()
    : Date.now();
  const now = Date.now();

  const stepStates: Record<string, PlaybookStepStateView> = {};
  const overdueStepIds: string[] = [];
  let completedCount = 0;
  let skippedCount = 0;
  let criticalGaps = 0;
  let cumulativeDays = 0;

  for (const s of steps) {
    cumulativeDays += s.expectedDurationDays ?? 0;
    const c = byStep.get(s.id);
    const status: PlaybookStepStatus | null = c
      ? ((c.status as PlaybookStepStatus) ?? (c.skipped ? "skipped" : "completed"))
      : null;

    if (status && c) {
      stepStates[s.id] = {
        status,
        note: c.notes ?? c.skipReason ?? null,
        actionedAt: (c.completedAt ? new Date(c.completedAt) : new Date()).toISOString(),
      };
    }
    if (status === "completed") completedCount++;
    if (status === "skipped") skippedCount++;
    if ((status === "skipped" || status === "blocked") && s.isCritical) criticalGaps++;

    // Overdue = not yet completed/skipped (open or blocked) and past its deadline.
    const terminal = status === "completed" || status === "skipped";
    if (!terminal) {
      const deadline = assignedAt + (cumulativeDays + graceDays) * DAY_MS;
      if (now > deadline) overdueStepIds.push(s.id);
    }
  }

  const totalSteps = steps.length;
  return {
    assignmentId: assignment.id,
    playbookId: assignment.playbookId,
    status: assignment.status,
    currentStepId: assignment.currentStepId,
    hasPlaybook: true,
    totalSteps,
    completedCount,
    adherencePct: totalSteps > 0 ? Math.round((completedCount / totalSteps) * 100) : 0,
    progressPct:
      totalSteps > 0
        ? Math.round(((completedCount + skippedCount) / totalSteps) * 100)
        : 0,
    criticalGaps,
    overdueCount: overdueStepIds.length,
    stepStates,
    overdueStepIds,
  };
}
