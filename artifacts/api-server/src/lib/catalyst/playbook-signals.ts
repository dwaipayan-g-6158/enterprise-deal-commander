// Catalyst-backed reimplementation of ../playbook-signals.ts — see the
// module docstring in ./intelligence.ts for why this is a parallel file
// rather than an in-place rewrite. lib/subscribers/playbook-engine.ts still
// imports the original (Drizzle) version and is unaffected by this file.
import {
  type CatalystApp,
  createDealPlaybookAssignmentsRepo,
  createPlaybooksRepo,
  createPlaybookStepsRepo,
  createPlaybookStepCompletionsRepo,
  createEngineThresholdsRepo,
  createEnterpriseDealsRepo,
  createPipelineStagesRepo,
} from "@workspace/db/catalyst";

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

async function overdueGraceDays(catalystApp: CatalystApp): Promise<number> {
  const thresholds = await createEngineThresholdsRepo(catalystApp).listAll();
  const row = thresholds.find((t) => t.parameterKey === "playbook_overdue_grace_days");
  const n = row ? Number(row.parameterValue) : NaN;
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

async function stepsAndCompletionsFor(catalystApp: CatalystApp, assignmentId: string, playbookId: string) {
  const steps = await createPlaybookStepsRepo(catalystApp).listByPlaybookId(playbookId);
  const completions = await createPlaybookStepCompletionsRepo(catalystApp).listByAssignmentId(assignmentId);
  return { steps, completions };
}

/**
 * Deal-wide aggregate across every assignment the deal has ever picked up —
 * excluding any "Superseded" ones. An assignment is superseded once the deal
 * advances past its playbook's stage (see `supersedeStalePlaybookAssignments`),
 * so it stops weighing in here even though the row itself is retained for
 * history/audit. A deal whose only assignment(s) are all superseded is
 * reported exactly like a deal with no playbook at all.
 */
export async function getPlaybookSignals(catalystApp: CatalystApp, dealId: string): Promise<PlaybookSignals> {
  const allAssignments = await createDealPlaybookAssignmentsRepo(catalystApp).list(dealId);
  const assignments = allAssignments.filter((a) => a.status !== "Superseded");
  if (assignments.length === 0) return EMPTY_AGGREGATE;

  const graceDays = await overdueGraceDays(catalystApp);
  let totalSteps = 0;
  let completedCount = 0;
  let skippedCount = 0;
  let criticalGaps = 0;
  let overdueCount = 0;

  for (const assignment of assignments) {
    const { steps, completions } = await stepsAndCompletionsFor(catalystApp, assignment.id, assignment.playbookId);
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
 * Marks every "Active" assignment on this deal whose playbook targets a
 * stage strictly earlier (by sortOrder) than the deal's new stage as
 * "Superseded" — a terminal state distinct from "Completed", excluded from
 * getPlaybookSignals' aggregate. "Completed" assignments are never touched.
 */
export async function supersedeStalePlaybookAssignments(
  catalystApp: CatalystApp,
  dealId: string,
  newStageSortOrder: number,
): Promise<void> {
  const assignmentsRepo = createDealPlaybookAssignmentsRepo(catalystApp);
  const [assignments, allPlaybooks, stages] = await Promise.all([
    assignmentsRepo.list(dealId),
    createPlaybooksRepo(catalystApp).listAll(),
    createPipelineStagesRepo(catalystApp).listAll(),
  ]);
  const playbookById = new Map(allPlaybooks.map((p) => [p.id, p]));
  const sortOrderByStageName = new Map(stages.map((s) => [s.stageName, s.sortOrder]));
  for (const row of assignments) {
    const playbook = playbookById.get(row.playbookId);
    if (!playbook?.applicableStage) continue;
    const sortOrder = sortOrderByStageName.get(playbook.applicableStage);
    if (sortOrder === undefined) continue;
    if (row.status === "Active" && sortOrder < newStageSortOrder) {
      await assignmentsRepo.update(row.id, { status: "Superseded" });
    }
  }
}

/**
 * Full journey: one entry per stage that has a configured playbook, ordered by
 * the stage's sort order (Discovery → Closed-Won), each classified
 * not_started / active / completed. Started entries carry the same per-step
 * detail the panel already renders; not-started entries still carry the step
 * catalog (name/description/critical) so the panel can preview before Start.
 */
export async function getPlaybookJourney(catalystApp: CatalystApp, dealId: string): Promise<PlaybookJourneyEntry[]> {
  const stages = await createPipelineStagesRepo(catalystApp).listAll();
  const stageNameById = new Map(stages.map((s) => [s.id, s.stageName]));
  const deal = await createEnterpriseDealsRepo(catalystApp).getById(dealId);
  const currentStage = deal ? stageNameById.get(deal.salesStageId) ?? null : null;

  const activePlaybooks = await createPlaybooksRepo(catalystApp).listActive();
  const sortOrderByStageName = new Map(stages.map((s) => [s.stageName, s.sortOrder]));
  // Mirrors the original leftJoin + `orderBy(asc(sortOrder))`: a playbook whose
  // applicableStage doesn't resolve to a known stage still appears, sorted last
  // (Postgres ASC defaults to NULLS LAST).
  const catalog = activePlaybooks
    .map((pb) => ({
      id: pb.id,
      playbookName: pb.playbookName,
      applicableStage: pb.applicableStage,
      sortOrder: pb.applicableStage != null ? sortOrderByStageName.get(pb.applicableStage) ?? null : null,
    }))
    .sort((a, b) => {
      if (a.sortOrder == null && b.sortOrder == null) return 0;
      if (a.sortOrder == null) return 1;
      if (b.sortOrder == null) return -1;
      return a.sortOrder - b.sortOrder;
    });

  const assignments = await createDealPlaybookAssignmentsRepo(catalystApp).list(dealId);
  const assignmentByPlaybook = new Map(assignments.map((a) => [a.playbookId, a]));

  const graceDays = await overdueGraceDays(catalystApp);
  const entries: PlaybookJourneyEntry[] = [];

  for (const pb of catalog) {
    const steps = await createPlaybookStepsRepo(catalystApp).listByPlaybookId(pb.id);
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

    const completions = await createPlaybookStepCompletionsRepo(catalystApp).listByAssignmentId(assignment.id);
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
  catalystApp: CatalystApp,
  dealId: string,
  playbookId: string,
): Promise<{ assignment: AssignmentRow; created: boolean }> {
  const assignmentsRepo = createDealPlaybookAssignmentsRepo(catalystApp);
  const existing = await assignmentsRepo.getByDealAndPlaybook(dealId, playbookId);
  if (existing) return { assignment: existing, created: false };

  // Already sorted by stepOrder ascending in the repo.
  const steps = await createPlaybookStepsRepo(catalystApp).listByPlaybookId(playbookId);
  const firstStep = steps[0];

  const created = await assignmentsRepo.create({
    dealId,
    playbookId,
    currentStepId: firstStep?.id ?? null,
  });
  return { assignment: created, created: true };
}

// Recompute the assignment pointer + status after any step action. currentStepId
// = first step not yet completed-or-skipped (highlight only — steps are freely
// actionable out of order); status = "Completed" once every step is terminal.
export async function recomputeAssignment(catalystApp: CatalystApp, assignmentId: string): Promise<void> {
  const assignmentsRepo = createDealPlaybookAssignmentsRepo(catalystApp);
  const assignment = await assignmentsRepo.getById(assignmentId);
  if (!assignment) return;
  // "Superseded" is terminal: the deal has advanced past this playbook's stage
  // and `getPlaybookSignals` deliberately stops counting it. Actioning one of
  // its leftover steps (directly, or via the MEDDPICC gate sync) must NOT
  // resurrect it to "Active" -- that would silently re-arm the H9 bug where a
  // stale playbook keeps dragging the deal's score down with no way to clear it.
  if (assignment.status === "Superseded") return;
  const steps = await createPlaybookStepsRepo(catalystApp).listByPlaybookId(assignment.playbookId);
  const completions = await createPlaybookStepCompletionsRepo(catalystApp).listByAssignmentId(assignmentId);
  const terminal = new Set(
    completions
      .filter((c) => c.status === "completed" || c.status === "skipped")
      .map((c) => c.stepId),
  );
  const next = steps.find((s) => !terminal.has(s.id));
  if (next) {
    await assignmentsRepo.update(assignmentId, { currentStepId: next.id, status: "Active", completedAt: null });
  } else if (steps.length > 0) {
    await assignmentsRepo.update(assignmentId, { status: "Completed", completedAt: new Date(), currentStepId: null });
  }
}

export async function dealIdForAssignment(catalystApp: CatalystApp, assignmentId: string): Promise<string | null> {
  const a = await createDealPlaybookAssignmentsRepo(catalystApp).getById(assignmentId);
  return a?.dealId ?? null;
}
