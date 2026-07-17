import { and, asc, eq } from "drizzle-orm";
import {
  db,
  dealPlaybookAssignments,
  playbooks,
  playbookSteps,
  playbookStepCompletions,
  engineThresholds,
  enterpriseDeals,
  pipelineStages,
} from "@workspace/db";

// Derives the playbook execution signals for a deal's assignments. These feed
// the predictive score (playbook_adherence factor), the risk engine
// (PLAYBOOK_EXECUTION_GAP pattern), the trajectory snapshot, and the Playbook
// journey panel. Single source of truth so those surfaces never diverge.
//
// A deal can hold multiple concurrent assignments — one per stage-playbook it
// has touched on its journey (Discovery, Validation, ...). `getPlaybookSignals`
// aggregates across ALL of them (unfinished earlier-stage work still weighs in
// after the deal advances); `getPlaybookJourney` returns the full per-stage
// picture for the panel. Both share `computeAssignmentSignals`, the pure
// per-assignment calculator.

export type PlaybookStepStatus = "completed" | "skipped" | "blocked";

export interface PlaybookStepStateView {
  status: PlaybookStepStatus;
  note: string | null;
  actionedAt: string;
}

interface AssignmentRow {
  id: string;
  playbookId: string;
  status: string;
  currentStepId: string | null;
  assignedAt: Date | string;
}

interface StepRow {
  id: string;
  stepOrder: number;
  expectedDurationDays: number | null;
  isCritical: boolean;
}

interface CompletionRow {
  stepId: string;
  status: string | null;
  skipped: boolean;
  notes: string | null;
  skipReason: string | null;
  completedAt: Date | string | null;
}

/** Per-assignment execution signals — one playbook's state, on its own. */
export interface AssignmentSignals {
  assignmentId: string;
  playbookId: string;
  status: string;
  currentStepId: string | null;
  totalSteps: number;
  completedCount: number;
  skippedCount: number;
  /** Completed (non-skipped) steps / total, 0–100. */
  adherencePct: number;
  /** (Completed + skipped) / total, 0–100 — "how far through the play". */
  progressPct: number;
  /** Critical steps that were skipped OR blocked. */
  criticalGaps: number;
  overdueCount: number;
  stepStates: Record<string, PlaybookStepStateView>;
  overdueStepIds: string[];
}

/** Deal-wide aggregate across all assignments — consumed by scoring/risk/snapshots. */
export interface PlaybookSignals {
  hasPlaybook: boolean;
  totalSteps: number;
  completedCount: number;
  /** null only when the deal has no assignment at all. */
  adherencePct: number | null;
  progressPct: number;
  criticalGaps: number;
  overdueCount: number;
}

export type PlaybookJourneyStatus = "not_started" | "active" | "completed";

export interface PlaybookJourneyStep {
  id: string;
  stepOrder: number;
  stepName: string;
  description: string | null;
  triggerCondition: string | null;
  recommendedAction: string;
  expectedDurationDays: number | null;
  isCritical: boolean;
}

export interface PlaybookJourneyEntry {
  playbookId: string;
  playbookName: string;
  applicableStage: string | null;
  isCurrentStage: boolean;
  assignmentId: string | null;
  currentStepId: string | null;
  status: PlaybookJourneyStatus;
  totalSteps: number;
  completedCount: number;
  progressPct: number;
  adherencePct: number | null;
  criticalGaps: number;
  overdueCount: number;
  steps: PlaybookJourneyStep[];
  stepStates: Record<string, PlaybookStepStateView>;
  overdueStepIds: string[];
}

const DEFAULT_GRACE_DAYS = 3;
const DAY_MS = 1000 * 60 * 60 * 24;

const EMPTY_AGGREGATE: PlaybookSignals = {
  hasPlaybook: false,
  totalSteps: 0,
  completedCount: 0,
  adherencePct: null,
  progressPct: 0,
  criticalGaps: 0,
  overdueCount: 0,
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

// Pure calculator: given one assignment + its ordered steps + its completion
// ledger, derive every execution signal for that assignment alone. No DB
// access — the sole source of truth shared by the aggregate and journey views.
function computeAssignmentSignals(
  assignment: AssignmentRow,
  steps: StepRow[],
  completions: CompletionRow[],
  graceDays: number,
): AssignmentSignals {
  const byStep = new Map<string, CompletionRow>();
  for (const c of completions) {
    const prev = byStep.get(c.stepId);
    if (!prev || (c.completedAt && prev.completedAt && c.completedAt > prev.completedAt)) {
      byStep.set(c.stepId, c);
    }
  }

  const graceMs = graceDays * DAY_MS;
  const assignedAt = assignment.assignedAt ? new Date(assignment.assignedAt).getTime() : Date.now();
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
      const deadline = assignedAt + cumulativeDays * DAY_MS + graceMs;
      if (now > deadline) overdueStepIds.push(s.id);
    }
  }

  const totalSteps = steps.length;
  return {
    assignmentId: assignment.id,
    playbookId: assignment.playbookId,
    status: assignment.status,
    currentStepId: assignment.currentStepId,
    totalSteps,
    completedCount,
    skippedCount,
    adherencePct: totalSteps > 0 ? Math.round((completedCount / totalSteps) * 100) : 0,
    progressPct: totalSteps > 0 ? Math.round(((completedCount + skippedCount) / totalSteps) * 100) : 0,
    criticalGaps,
    overdueCount: overdueStepIds.length,
    stepStates,
    overdueStepIds,
  };
}

async function stepsAndCompletionsFor(assignmentId: string, playbookId: string) {
  const steps = await db
    .select()
    .from(playbookSteps)
    .where(eq(playbookSteps.playbookId, playbookId))
    .orderBy(asc(playbookSteps.stepOrder));
  const completions = await db
    .select()
    .from(playbookStepCompletions)
    .where(eq(playbookStepCompletions.assignmentId, assignmentId));
  return { steps, completions };
}

/** Deal-wide aggregate across every assignment the deal has ever picked up. */
export async function getPlaybookSignals(dealId: string): Promise<PlaybookSignals> {
  const assignments = await db
    .select()
    .from(dealPlaybookAssignments)
    .where(eq(dealPlaybookAssignments.dealId, dealId));
  if (assignments.length === 0) return EMPTY_AGGREGATE;

  const graceDays = await overdueGraceDays();
  let totalSteps = 0;
  let completedCount = 0;
  let skippedCount = 0;
  let criticalGaps = 0;
  let overdueCount = 0;

  for (const assignment of assignments) {
    const { steps, completions } = await stepsAndCompletionsFor(assignment.id, assignment.playbookId);
    const sig = computeAssignmentSignals(assignment, steps, completions, graceDays);
    totalSteps += sig.totalSteps;
    completedCount += sig.completedCount;
    skippedCount += sig.skippedCount;
    criticalGaps += sig.criticalGaps;
    overdueCount += sig.overdueCount;
  }

  return {
    hasPlaybook: true,
    totalSteps,
    completedCount,
    adherencePct: totalSteps > 0 ? Math.round((completedCount / totalSteps) * 100) : 0,
    progressPct: totalSteps > 0 ? Math.round(((completedCount + skippedCount) / totalSteps) * 100) : 0,
    criticalGaps,
    overdueCount,
  };
}

/**
 * Full journey: one entry per stage that has a configured playbook, ordered by
 * the stage's sort order (Discovery → Closed-Won), each classified
 * not_started / active / completed. Started entries carry the same per-step
 * detail the panel already renders; not-started entries still carry the step
 * catalog (name/description/critical) so the panel can preview before Start.
 */
export async function getPlaybookJourney(dealId: string): Promise<PlaybookJourneyEntry[]> {
  const [deal] = await db
    .select({ stageName: pipelineStages.stageName })
    .from(enterpriseDeals)
    .innerJoin(pipelineStages, eq(enterpriseDeals.salesStageId, pipelineStages.id))
    .where(eq(enterpriseDeals.id, dealId))
    .limit(1);
  const currentStage = deal?.stageName ?? null;

  const catalog = await db
    .select({
      id: playbooks.id,
      playbookName: playbooks.playbookName,
      applicableStage: playbooks.applicableStage,
      sortOrder: pipelineStages.sortOrder,
    })
    .from(playbooks)
    .leftJoin(pipelineStages, eq(playbooks.applicableStage, pipelineStages.stageName))
    .where(eq(playbooks.isActive, true))
    .orderBy(asc(pipelineStages.sortOrder));

  const assignments = await db
    .select()
    .from(dealPlaybookAssignments)
    .where(eq(dealPlaybookAssignments.dealId, dealId));
  const assignmentByPlaybook = new Map(assignments.map((a) => [a.playbookId, a]));

  const graceDays = await overdueGraceDays();
  const entries: PlaybookJourneyEntry[] = [];

  for (const pb of catalog) {
    const steps = await db
      .select()
      .from(playbookSteps)
      .where(eq(playbookSteps.playbookId, pb.id))
      .orderBy(asc(playbookSteps.stepOrder));
    const stepView: PlaybookJourneyStep[] = steps.map((s) => ({
      id: s.id,
      stepOrder: s.stepOrder,
      stepName: s.stepName,
      description: s.description,
      triggerCondition: s.triggerCondition,
      recommendedAction: s.recommendedAction,
      expectedDurationDays: s.expectedDurationDays,
      isCritical: s.isCritical,
    }));

    const assignment = assignmentByPlaybook.get(pb.id);
    if (!assignment) {
      entries.push({
        playbookId: pb.id,
        playbookName: pb.playbookName,
        applicableStage: pb.applicableStage,
        isCurrentStage: pb.applicableStage === currentStage,
        assignmentId: null,
        currentStepId: null,
        status: "not_started",
        totalSteps: steps.length,
        completedCount: 0,
        progressPct: 0,
        adherencePct: null,
        criticalGaps: 0,
        overdueCount: 0,
        steps: stepView,
        stepStates: {},
        overdueStepIds: [],
      });
      continue;
    }

    const completions = await db
      .select()
      .from(playbookStepCompletions)
      .where(eq(playbookStepCompletions.assignmentId, assignment.id));
    const sig = computeAssignmentSignals(assignment, steps, completions, graceDays);

    entries.push({
      playbookId: pb.id,
      playbookName: pb.playbookName,
      applicableStage: pb.applicableStage,
      isCurrentStage: pb.applicableStage === currentStage,
      assignmentId: assignment.id,
      currentStepId: assignment.currentStepId,
      status: assignment.status === "Completed" ? "completed" : "active",
      totalSteps: sig.totalSteps,
      completedCount: sig.completedCount,
      progressPct: sig.progressPct,
      adherencePct: sig.adherencePct,
      criticalGaps: sig.criticalGaps,
      overdueCount: sig.overdueCount,
      steps: stepView,
      stepStates: sig.stepStates,
      overdueStepIds: sig.overdueStepIds,
    });
  }

  return entries;
}

/**
 * Idempotent manual assignment create for a specific playbook — returns the
 * existing assignment if the deal already has one for this playbook (the
 * unique (deal_id, playbook_id) constraint is the backstop). currentStepId is
 * set to the first step. Emits no event itself — callers (the route handler)
 * emit `playbook.assigned` only when a new row was actually created.
 */
export async function startPlaybookForDeal(
  dealId: string,
  playbookId: string,
): Promise<{ assignment: AssignmentRow; created: boolean }> {
  const [existing] = await db
    .select()
    .from(dealPlaybookAssignments)
    .where(
      and(
        eq(dealPlaybookAssignments.dealId, dealId),
        eq(dealPlaybookAssignments.playbookId, playbookId),
      ),
    )
    .limit(1);
  if (existing) return { assignment: existing, created: false };

  const [firstStep] = await db
    .select({ id: playbookSteps.id })
    .from(playbookSteps)
    .where(eq(playbookSteps.playbookId, playbookId))
    .orderBy(asc(playbookSteps.stepOrder))
    .limit(1);

  const [created] = await db
    .insert(dealPlaybookAssignments)
    .values({
      dealId,
      playbookId,
      currentStepId: firstStep?.id ?? null,
    })
    .returning();
  return { assignment: created, created: true };
}
