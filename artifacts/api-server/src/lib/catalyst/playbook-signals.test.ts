import { describe, it, expect, beforeAll, beforeEach } from "vitest";
import crypto from "node:crypto";
import {
  initCatalystApp,
  createEnterpriseDealsRepo,
  createDealPlaybookAssignmentsRepo,
  formatCatalystDateTime,
} from "@workspace/db/catalyst";
import {
  installCatalystFake,
  seedStandardLookups,
  STAGES,
  PRICING_MODEL_ID,
  SERVICES_TIER_ID,
  type CatalystTestStore,
} from "../../test-support/catalyst-test-app";
import {
  getPlaybookSignals,
  getPlaybookJourney,
  startPlaybookForDeal,
  recomputeAssignment,
  supersedeStalePlaybookAssignments,
} from "./playbook-signals";
import { cache } from "../cache";

// The playbook signal derivation that feeds the predictive score's 9th factor,
// the PLAYBOOK_EXECUTION_GAP risk pattern and the trajectory.
//
// Ported from the Drizzle `lib/playbook-signals.test.ts`. The Catalyst
// implementation had no coverage at all — `lib/subscribers/playbook-engine.test.ts`
// exercises only the auto-assign subscriber, not any of these five functions.

const DAY_MS = 1000 * 60 * 60 * 24;

let store: CatalystTestStore;
let seq = 0;

const app = () => initCatalystApp({ headers: {} });

beforeAll(() => {
  ({ store } = installCatalystFake());
});

beforeEach(() => {
  store.reset();
  seq = 0;
  seedStandardLookups(store);
  cache.clear();
});

async function createDeal(): Promise<string> {
  const deal = await createEnterpriseDealsRepo(app()).create({
    dealName: `Playbook Signals ${++seq}`,
    accountName: `Playbook Acct ${seq}`,
    accountManager: "AM",
    technicalLead: "TL",
    salesStageId: STAGES.Discovery,
    pricingModelId: PRICING_MODEL_ID,
    servicesTierId: SERVICES_TIER_ID,
    productRevenue: "500000",
    servicesRevenue: "100000",
    contractTermYears: 1,
    dealCurrency: "USD",
  });
  return deal.id;
}

interface StepSpec {
  stepName: string;
  isCritical?: boolean;
  expectedDurationDays?: number;
}

/** Seed a playbook plus its ordered steps; returns the ids in step order. */
function seedPlaybook(
  applicableStage: string,
  steps: StepSpec[],
): { playbookId: string; stepIds: string[] } {
  const playbookId = crypto.randomUUID();
  store.seedRaw("v2_playbooks", [
    {
      id: playbookId,
      playbook_name: `PB ${applicableStage}`,
      applicable_stage: applicableStage,
      is_active: "true",
      created_by: "vitest",
      created_at: formatCatalystDateTime(new Date()),
    },
  ]);
  const stepIds = steps.map(() => crypto.randomUUID());
  store.seedRaw(
    "v2_playbook_steps",
    steps.map((s, i) => ({
      id: stepIds[i],
      playbook_id: playbookId,
      step_order: String(i + 1),
      step_name: s.stepName,
      recommended_action: "a",
      expected_duration_days: s.expectedDurationDays == null ? null : String(s.expectedDurationDays),
      is_critical: s.isCritical ? "true" : "false",
      natural_key: `${playbookId}:${i + 1}`,
    })),
  );
  return { playbookId, stepIds };
}

function seedAssignment(opts: {
  dealId: string;
  playbookId: string;
  status?: string;
  assignedDaysAgo?: number;
  currentStepId?: string | null;
}): string {
  const id = crypto.randomUUID();
  const assignedAt = new Date(Date.now() - (opts.assignedDaysAgo ?? 0) * DAY_MS);
  store.seedRaw("v2_deal_playbook_assignments", [
    {
      id,
      deal_id: opts.dealId,
      playbook_id: opts.playbookId,
      current_step_id: opts.currentStepId ?? null,
      status: opts.status ?? "Active",
      assigned_at: formatCatalystDateTime(assignedAt),
      completed_at: null,
      natural_key: `${opts.dealId}:${opts.playbookId}`,
    },
  ]);
  return id;
}

function seedCompletion(assignmentId: string, stepId: string, status: string): void {
  store.seedRaw("v2_playbook_step_completions", [
    {
      id: crypto.randomUUID(),
      assignment_id: assignmentId,
      step_id: stepId,
      completed_at: formatCatalystDateTime(new Date()),
      skipped: status === "skipped" ? "true" : "false",
      status,
      completed_by: "vitest",
    },
  ]);
}

function assignmentStatus(assignmentId: string): string | undefined {
  return store.rows("v2_deal_playbook_assignments").find((r) => r["id"] === assignmentId)?.["status"];
}

describe("getPlaybookSignals", () => {
  it("returns a neutral empty signal when the deal has no active assignment", async () => {
    const dealId = await createDeal();
    const signals = await getPlaybookSignals(app(), dealId);
    expect(signals.hasPlaybook).toBe(false);
    expect(signals.adherencePct).toBeNull();
    expect(signals.criticalGaps).toBe(0);
    expect(signals.overdueCount).toBe(0);
  });

  it("derives adherence, critical gaps, and overdue from step actions", async () => {
    const dealId = await createDeal();
    const { playbookId, stepIds } = seedPlaybook("NoSuchStage", [
      { stepName: "S1", isCritical: true, expectedDurationDays: 1 },
      { stepName: "S2", isCritical: true, expectedDurationDays: 1 },
      { stepName: "S3", isCritical: true, expectedDurationDays: 1 },
      { stepName: "S4", isCritical: false, expectedDurationDays: 1 },
    ]);
    // Assigned 30 days ago so every step's deadline is in the past.
    const assignmentId = seedAssignment({
      dealId,
      playbookId,
      assignedDaysAgo: 30,
      currentStepId: stepIds[0],
    });

    seedCompletion(assignmentId, stepIds[0], "completed");
    seedCompletion(assignmentId, stepIds[1], "skipped");
    seedCompletion(assignmentId, stepIds[2], "blocked");
    // S4 left open

    const signals = await getPlaybookSignals(app(), dealId);
    expect(signals.hasPlaybook).toBe(true);
    expect(signals.totalSteps).toBe(4);
    expect(signals.adherencePct).toBe(25); // 1 completed / 4
    expect(signals.progressPct).toBe(50); // (1 completed + 1 skipped) / 4
    expect(signals.criticalGaps).toBe(2); // S2 skipped-critical + S3 blocked-critical
    // Non-terminal steps past their deadline: S3 (blocked) + S4 (open).
    expect(signals.overdueCount).toBe(2);
  });

  it("sums adherence, critical gaps, and overdue across every assignment the deal has", async () => {
    const dealId = await createDeal();

    // Playbook 1: 2 steps, both completed, assigned just now (nothing overdue).
    const pb1 = seedPlaybook("Vitest-Agg-Stage-1", [
      { stepName: "P1S1", isCritical: true },
      { stepName: "P1S2", isCritical: false },
    ]);
    const a1 = seedAssignment({ dealId, playbookId: pb1.playbookId });
    seedCompletion(a1, pb1.stepIds[0], "completed");
    seedCompletion(a1, pb1.stepIds[1], "completed");

    // Playbook 2: assigned 30 days ago — one skipped-critical step, one left
    // open past its deadline.
    const pb2 = seedPlaybook("Vitest-Agg-Stage-2", [
      { stepName: "P2S1", isCritical: true, expectedDurationDays: 1 },
      { stepName: "P2S2", isCritical: false, expectedDurationDays: 1 },
    ]);
    const a2 = seedAssignment({ dealId, playbookId: pb2.playbookId, assignedDaysAgo: 30 });
    seedCompletion(a2, pb2.stepIds[0], "skipped");
    // pb2 step 2 left open -> overdue

    const signals = await getPlaybookSignals(app(), dealId);
    expect(signals.hasPlaybook).toBe(true);
    expect(signals.totalSteps).toBe(4); // 2 (pb1) + 2 (pb2)
    expect(signals.completedCount).toBe(2); // both from pb1
    expect(signals.adherencePct).toBe(50); // 2/4
    expect(signals.progressPct).toBe(75); // (2 completed + 1 skipped) / 4
    expect(signals.criticalGaps).toBe(1); // P2S1 skipped-critical
    expect(signals.overdueCount).toBe(1); // P2S2 open + overdue
  });

  it("excludes a Superseded assignment from the aggregate", async () => {
    const dealId = await createDeal();
    const { playbookId } = seedPlaybook("Vitest-Superseded-Stage", [
      { stepName: "S1", isCritical: true },
      { stepName: "S2", isCritical: false },
    ]);
    seedAssignment({ dealId, playbookId, status: "Superseded" });

    const signals = await getPlaybookSignals(app(), dealId);
    // This is the deal's ONLY assignment, and it's Superseded -> the aggregate
    // must behave exactly as if the deal has no playbook at all.
    expect(signals.hasPlaybook).toBe(false);
    expect(signals.totalSteps).toBe(0);
    expect(signals.adherencePct).toBeNull();
    expect(signals.criticalGaps).toBe(0);
    expect(signals.overdueCount).toBe(0);
  });

  it("treats a null expected duration as adding no time to the schedule, so the grace period alone decides", async () => {
    // `cumulativeDays += expectedDurationDays ?? 0` — a step with no configured
    // duration does not extend the schedule, so it comes due as soon as the
    // grace window closes rather than never coming due. Both directions are
    // asserted, because a test on only the aged assignment would also pass for
    // an implementation that flagged every step overdue unconditionally.
    const { playbookId } = seedPlaybook("Vitest-NoDuration-Stage", [
      { stepName: "S1", isCritical: true },
      { stepName: "S2", isCritical: false },
    ]);

    const freshDeal = await createDeal();
    seedAssignment({ dealId: freshDeal, playbookId });
    const fresh = await getPlaybookSignals(app(), freshDeal);
    expect(fresh.totalSteps).toBe(2);
    expect(fresh.overdueCount).toBe(0); // still inside the grace window

    const staleDeal = await createDeal();
    seedAssignment({ dealId: staleDeal, playbookId, assignedDaysAgo: 365 });
    const stale = await getPlaybookSignals(app(), staleDeal);
    expect(stale.totalSteps).toBe(2);
    expect(stale.overdueCount).toBe(2); // grace long expired
  });
});

describe("getPlaybookJourney + startPlaybookForDeal", () => {
  it("classifies not_started / active / completed per stage playbook", async () => {
    const dealId = await createDeal();
    // Journey entries are keyed to stages that have a playbook, so these must
    // be real stage names to appear at all.
    const pbA = seedPlaybook("Discovery", [{ stepName: "A1" }, { stepName: "A2" }]);
    const pbB = seedPlaybook("Validation", [{ stepName: "B1" }]);

    // pbA has no assignment yet -> not_started, but its step catalog is still visible.
    let journey = await getPlaybookJourney(app(), dealId);
    let entryA = journey.find((e) => e.playbookId === pbA.playbookId)!;
    expect(entryA.status).toBe("not_started");
    expect(entryA.totalSteps).toBe(2);
    expect(entryA.assignmentId).toBeNull();

    // Manual start is idempotent.
    const { assignment, created } = await startPlaybookForDeal(app(), dealId, pbA.playbookId);
    expect(created).toBe(true);
    const { assignment: again, created: createdAgain } = await startPlaybookForDeal(
      app(),
      dealId,
      pbA.playbookId,
    );
    expect(createdAgain).toBe(false);
    expect(again.id).toBe(assignment.id);

    journey = await getPlaybookJourney(app(), dealId);
    entryA = journey.find((e) => e.playbookId === pbA.playbookId)!;
    expect(entryA.status).toBe("active");
    expect(entryA.assignmentId).toBe(assignment.id);

    // Complete both steps (progress reflects it immediately; "completed"
    // classification depends on the assignment's status column, which only
    // recomputeAssignment flips).
    seedCompletion(assignment.id, pbA.stepIds[0], "completed");
    seedCompletion(assignment.id, pbA.stepIds[1], "completed");
    journey = await getPlaybookJourney(app(), dealId);
    entryA = journey.find((e) => e.playbookId === pbA.playbookId)!;
    expect(entryA.completedCount).toBe(2);
    expect(entryA.progressPct).toBe(100);
    expect(entryA.adherencePct).toBe(100);
    expect(entryA.status).toBe("active");

    await createDealPlaybookAssignmentsRepo(app()).update(assignment.id, { status: "Completed" });
    journey = await getPlaybookJourney(app(), dealId);
    entryA = journey.find((e) => e.playbookId === pbA.playbookId)!;
    expect(entryA.status).toBe("completed");

    // pbB was never touched.
    const entryB = journey.find((e) => e.playbookId === pbB.playbookId)!;
    expect(entryB.status).toBe("not_started");
    expect(entryB.totalSteps).toBe(1);
    expect(entryB.assignmentId).toBeNull();
  });
});

describe("supersedeStalePlaybookAssignments", () => {
  it("marks an earlier-stage Active assignment Superseded when the deal advances past it, and leaves a Completed assignment untouched", async () => {
    const { playbookId, stepIds } = seedPlaybook("Discovery", [
      { stepName: "D1" },
      { stepName: "D2" },
    ]);
    const validationSortOrder = STAGES.Validation;

    // Deal 1: start the Discovery playbook and touch nothing -> stays "Active".
    const dealId1 = await createDeal();
    const assignment1 = seedAssignment({ dealId: dealId1, playbookId });

    await supersedeStalePlaybookAssignments(app(), dealId1, validationSortOrder);
    expect(assignmentStatus(assignment1)).toBe("Superseded");

    // Deal 2: complete every step so recomputeAssignment flips it to "Completed".
    const dealId2 = await createDeal();
    const assignment2 = seedAssignment({ dealId: dealId2, playbookId });
    for (const stepId of stepIds) seedCompletion(assignment2, stepId, "completed");
    await recomputeAssignment(app(), assignment2);
    expect(assignmentStatus(assignment2)).toBe("Completed");

    await supersedeStalePlaybookAssignments(app(), dealId2, validationSortOrder);
    // Completed assignments are a terminal state too — never downgraded.
    expect(assignmentStatus(assignment2)).toBe("Completed");
  });

  it("leaves an assignment alone when the deal has NOT advanced past its stage", async () => {
    // The counterweight: an implementation that superseded unconditionally
    // would have passed every assertion in the test above.
    const { playbookId } = seedPlaybook("Commercial", [{ stepName: "C1" }]);
    const dealId = await createDeal();
    const assignmentId = seedAssignment({ dealId, playbookId });

    await supersedeStalePlaybookAssignments(app(), dealId, STAGES.Validation);
    expect(assignmentStatus(assignmentId)).toBe("Active");
  });
});

describe("recomputeAssignment", () => {
  it("never resurrects a Superseded assignment back to Active when one of its steps is actioned", async () => {
    const { playbookId, stepIds } = seedPlaybook("Discovery", [
      { stepName: "D1" },
      { stepName: "D2" },
    ]);
    const dealId = await createDeal();
    const assignmentId = seedAssignment({ dealId, playbookId });

    // Deal advances past Discovery -> the Discovery assignment goes terminal.
    await supersedeStalePlaybookAssignments(app(), dealId, STAGES.Validation);
    expect(assignmentStatus(assignmentId)).toBe("Superseded");

    // Someone now tidies up a leftover Discovery step (or the MEDDPICC gate
    // sync touches it). recomputeAssignment must NOT flip the row back to
    // "Active" — doing so would silently re-arm the H9 scoring bug, with the
    // superseded playbook counting against the deal forever.
    seedCompletion(assignmentId, stepIds[0], "completed");
    await recomputeAssignment(app(), assignmentId);
    expect(assignmentStatus(assignmentId)).toBe("Superseded");

    // ...and the deal's aggregate still behaves as if it has no playbook.
    const signals = await getPlaybookSignals(app(), dealId);
    expect(signals.hasPlaybook).toBe(false);
  });

  it("still flips an Active assignment to Completed once every step is terminal", async () => {
    const { playbookId, stepIds } = seedPlaybook("Discovery", [
      { stepName: "D1" },
      { stepName: "D2" },
    ]);
    const dealId = await createDeal();
    const assignmentId = seedAssignment({ dealId, playbookId });
    for (const stepId of stepIds) seedCompletion(assignmentId, stepId, "completed");

    await recomputeAssignment(app(), assignmentId);
    expect(assignmentStatus(assignmentId)).toBe("Completed");
  });

  it("counts a SKIPPED step as terminal for completion, but a BLOCKED one as not", async () => {
    // "every step is terminal" has to mean completed-or-skipped; treating
    // blocked as terminal would mark a stuck playbook finished.
    const { playbookId, stepIds } = seedPlaybook("Discovery", [
      { stepName: "D1" },
      { stepName: "D2" },
    ]);
    const dealId = await createDeal();

    const blockedAssignment = seedAssignment({ dealId, playbookId });
    seedCompletion(blockedAssignment, stepIds[0], "completed");
    seedCompletion(blockedAssignment, stepIds[1], "blocked");
    await recomputeAssignment(app(), blockedAssignment);
    expect(assignmentStatus(blockedAssignment)).toBe("Active");

    const otherDeal = await createDeal();
    const skippedAssignment = seedAssignment({ dealId: otherDeal, playbookId });
    seedCompletion(skippedAssignment, stepIds[0], "completed");
    seedCompletion(skippedAssignment, stepIds[1], "skipped");
    await recomputeAssignment(app(), skippedAssignment);
    expect(assignmentStatus(skippedAssignment)).toBe("Completed");
  });
});
