import { describe, it, expect, afterAll } from "vitest";
import { asc, eq, inArray } from "drizzle-orm";
import {
  db,
  pool,
  enterpriseDeals,
  pipelineStages,
  pricingModels,
  servicesTiers,
  playbooks,
  playbookSteps,
  dealPlaybookAssignments,
  playbookStepCompletions,
} from "@workspace/db";
import {
  getPlaybookSignals,
  getPlaybookJourney,
  startPlaybookForDeal,
  recomputeAssignment,
  supersedeStalePlaybookAssignments,
} from "./playbook-signals";

// Integration test for the playbook signal derivation that feeds the predictive
// score, the risk engine, and the trajectory. Exercises the real DB.

const createdDealIds: string[] = [];
const createdPlaybookIds: string[] = [];
const DAY_MS = 1000 * 60 * 60 * 24;

async function createDeal(): Promise<string> {
  const [stage] = await db.select().from(pipelineStages).limit(1);
  const [pricing] = await db.select().from(pricingModels).limit(1);
  const [tier] = await db.select().from(servicesTiers).limit(1);
  const suffix = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const [row] = await db
    .insert(enterpriseDeals)
    .values({
      dealName: `Playbook Signals ${suffix}`,
      accountName: `Acct ${suffix}`,
      accountManager: "AM",
      technicalLead: "TL",
      salesStageId: stage.id,
      pricingModelId: pricing.id,
      servicesTierId: tier.id,
      productRevenue: "500000",
      servicesRevenue: "100000",
    })
    .returning({ id: enterpriseDeals.id });
  createdDealIds.push(row.id);
  return row.id;
}

afterAll(async () => {
  if (createdDealIds.length > 0) {
    // Assignments + completions cascade with the parent deal.
    await db.delete(enterpriseDeals).where(inArray(enterpriseDeals.id, createdDealIds));
  }
  if (createdPlaybookIds.length > 0) {
    // Steps cascade with the parent playbook.
    await db.delete(playbooks).where(inArray(playbooks.id, createdPlaybookIds));
  }
  await pool.end();
});

describe("getPlaybookSignals", () => {
  it("returns a neutral empty signal when the deal has no active assignment", async () => {
    const dealId = await createDeal();
    const signals = await getPlaybookSignals(dealId);
    expect(signals.hasPlaybook).toBe(false);
    expect(signals.adherencePct).toBeNull();
    expect(signals.criticalGaps).toBe(0);
    expect(signals.overdueCount).toBe(0);
  });

  it("derives adherence, critical gaps, and overdue from step actions", async () => {
    const dealId = await createDeal();

    const [pb] = await db
      .insert(playbooks)
      .values({
        playbookName: `Signals Test PB ${Date.now()}`,
        applicableStage: "NoSuchStage", // never auto-assigns to other deals
        createdBy: "vitest",
      })
      .returning({ id: playbooks.id });
    createdPlaybookIds.push(pb.id);

    const steps = await db
      .insert(playbookSteps)
      .values([
        { playbookId: pb.id, stepOrder: 1, stepName: "S1", recommendedAction: "a", expectedDurationDays: 1, isCritical: true },
        { playbookId: pb.id, stepOrder: 2, stepName: "S2", recommendedAction: "a", expectedDurationDays: 1, isCritical: true },
        { playbookId: pb.id, stepOrder: 3, stepName: "S3", recommendedAction: "a", expectedDurationDays: 1, isCritical: true },
        { playbookId: pb.id, stepOrder: 4, stepName: "S4", recommendedAction: "a", expectedDurationDays: 1, isCritical: false },
      ])
      .returning({ id: playbookSteps.id, stepOrder: playbookSteps.stepOrder });
    const byOrder = new Map(steps.map((s) => [s.stepOrder, s.id]));

    // Assigned 30 days ago so every step's deadline is in the past.
    const [assignment] = await db
      .insert(dealPlaybookAssignments)
      .values({
        dealId,
        playbookId: pb.id,
        currentStepId: byOrder.get(1)!,
        assignedAt: new Date(Date.now() - 30 * DAY_MS),
      })
      .returning({ id: dealPlaybookAssignments.id });

    await db.insert(playbookStepCompletions).values([
      { assignmentId: assignment.id, stepId: byOrder.get(1)!, status: "completed", skipped: false },
      { assignmentId: assignment.id, stepId: byOrder.get(2)!, status: "skipped", skipped: true },
      { assignmentId: assignment.id, stepId: byOrder.get(3)!, status: "blocked", skipped: false },
      // S4 left open
    ]);

    const signals = await getPlaybookSignals(dealId);
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

    // Playbook 1: 2 steps, both completed.
    const [pb1] = await db
      .insert(playbooks)
      .values({
        playbookName: `Agg PB1 ${Date.now()}`,
        applicableStage: "Vitest-Agg-Stage-1",
        createdBy: "vitest",
      })
      .returning({ id: playbooks.id });
    createdPlaybookIds.push(pb1.id);
    const steps1 = await db
      .insert(playbookSteps)
      .values([
        { playbookId: pb1.id, stepOrder: 1, stepName: "P1S1", recommendedAction: "a", isCritical: true },
        { playbookId: pb1.id, stepOrder: 2, stepName: "P1S2", recommendedAction: "a", isCritical: false },
      ])
      .returning({ id: playbookSteps.id });
    const [a1] = await db
      .insert(dealPlaybookAssignments)
      .values({ dealId, playbookId: pb1.id, currentStepId: null })
      .returning({ id: dealPlaybookAssignments.id });
    await db.insert(playbookStepCompletions).values([
      { assignmentId: a1.id, stepId: steps1[0].id, status: "completed", skipped: false },
      { assignmentId: a1.id, stepId: steps1[1].id, status: "completed", skipped: false },
    ]);

    // Playbook 2: assigned 30 days ago — one skipped-critical step, one left
    // open past its deadline.
    const [pb2] = await db
      .insert(playbooks)
      .values({
        playbookName: `Agg PB2 ${Date.now()}`,
        applicableStage: "Vitest-Agg-Stage-2",
        createdBy: "vitest",
      })
      .returning({ id: playbooks.id });
    createdPlaybookIds.push(pb2.id);
    const steps2 = await db
      .insert(playbookSteps)
      .values([
        { playbookId: pb2.id, stepOrder: 1, stepName: "P2S1", recommendedAction: "a", expectedDurationDays: 1, isCritical: true },
        { playbookId: pb2.id, stepOrder: 2, stepName: "P2S2", recommendedAction: "a", expectedDurationDays: 1, isCritical: false },
      ])
      .returning({ id: playbookSteps.id });
    const [a2] = await db
      .insert(dealPlaybookAssignments)
      .values({
        dealId,
        playbookId: pb2.id,
        currentStepId: null,
        assignedAt: new Date(Date.now() - 30 * DAY_MS),
      })
      .returning({ id: dealPlaybookAssignments.id });
    await db.insert(playbookStepCompletions).values([
      { assignmentId: a2.id, stepId: steps2[0].id, status: "skipped", skipped: true },
      // steps2[1] left open -> overdue
    ]);

    const signals = await getPlaybookSignals(dealId);
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

    const [pb] = await db
      .insert(playbooks)
      .values({
        playbookName: `Superseded Test PB ${Date.now()}`,
        applicableStage: "Vitest-Superseded-Stage",
        createdBy: "vitest",
      })
      .returning({ id: playbooks.id });
    createdPlaybookIds.push(pb.id);

    await db.insert(playbookSteps).values([
      { playbookId: pb.id, stepOrder: 1, stepName: "S1", recommendedAction: "a", isCritical: true },
      { playbookId: pb.id, stepOrder: 2, stepName: "S2", recommendedAction: "a", isCritical: false },
    ]);

    // Discovery-stage playbook, started, left with steps incomplete.
    const [assignment] = await db
      .insert(dealPlaybookAssignments)
      .values({ dealId, playbookId: pb.id })
      .returning({ id: dealPlaybookAssignments.id });

    // Simulate what supersedeStalePlaybookAssignments does once the deal
    // advances past this playbook's stage.
    await db
      .update(dealPlaybookAssignments)
      .set({ status: "Superseded" })
      .where(eq(dealPlaybookAssignments.id, assignment.id));

    const signals = await getPlaybookSignals(dealId);
    // This is the deal's ONLY assignment, and it's Superseded -> the aggregate
    // must behave exactly as if the deal has no playbook at all.
    expect(signals.hasPlaybook).toBe(false);
    expect(signals.totalSteps).toBe(0);
    expect(signals.adherencePct).toBeNull();
    expect(signals.criticalGaps).toBe(0);
    expect(signals.overdueCount).toBe(0);
  });
});

describe("getPlaybookJourney + startPlaybookForDeal", () => {
  it("classifies not_started / active / completed per stage playbook", async () => {
    const dealId = await createDeal();

    const [pbA] = await db
      .insert(playbooks)
      .values({
        playbookName: `Journey A ${Date.now()}`,
        applicableStage: "Vitest-Journey-Stage-A",
        createdBy: "vitest",
      })
      .returning({ id: playbooks.id });
    createdPlaybookIds.push(pbA.id);
    const [pbB] = await db
      .insert(playbooks)
      .values({
        playbookName: `Journey B ${Date.now()}`,
        applicableStage: "Vitest-Journey-Stage-B",
        createdBy: "vitest",
      })
      .returning({ id: playbooks.id });
    createdPlaybookIds.push(pbB.id);

    const stepsA = await db
      .insert(playbookSteps)
      .values([
        { playbookId: pbA.id, stepOrder: 1, stepName: "A1", recommendedAction: "a", isCritical: false },
        { playbookId: pbA.id, stepOrder: 2, stepName: "A2", recommendedAction: "a", isCritical: false },
      ])
      .returning({ id: playbookSteps.id });
    await db.insert(playbookSteps).values([
      { playbookId: pbB.id, stepOrder: 1, stepName: "B1", recommendedAction: "a", isCritical: false },
    ]);

    // pbA has no assignment yet -> not_started, but its step catalog is still visible.
    let journey = await getPlaybookJourney(dealId);
    let entryA = journey.find((e) => e.playbookId === pbA.id)!;
    expect(entryA.status).toBe("not_started");
    expect(entryA.totalSteps).toBe(2);
    expect(entryA.assignmentId).toBeNull();

    // Manual start is idempotent.
    const { assignment, created } = await startPlaybookForDeal(dealId, pbA.id);
    expect(created).toBe(true);
    const { assignment: again, created: createdAgain } = await startPlaybookForDeal(dealId, pbA.id);
    expect(createdAgain).toBe(false);
    expect(again.id).toBe(assignment.id);

    journey = await getPlaybookJourney(dealId);
    entryA = journey.find((e) => e.playbookId === pbA.id)!;
    expect(entryA.status).toBe("active");
    expect(entryA.assignmentId).toBe(assignment.id);

    // Complete both steps (progress reflects it immediately; "completed"
    // classification depends on the assignment's status column, which only
    // the route layer's recomputeAssignment flips).
    await db.insert(playbookStepCompletions).values([
      { assignmentId: assignment.id, stepId: stepsA[0].id, status: "completed", skipped: false },
      { assignmentId: assignment.id, stepId: stepsA[1].id, status: "completed", skipped: false },
    ]);
    journey = await getPlaybookJourney(dealId);
    entryA = journey.find((e) => e.playbookId === pbA.id)!;
    expect(entryA.completedCount).toBe(2);
    expect(entryA.progressPct).toBe(100);
    expect(entryA.adherencePct).toBe(100);
    expect(entryA.status).toBe("active");

    await db
      .update(dealPlaybookAssignments)
      .set({ status: "Completed", completedAt: new Date() })
      .where(eq(dealPlaybookAssignments.id, assignment.id));
    journey = await getPlaybookJourney(dealId);
    entryA = journey.find((e) => e.playbookId === pbA.id)!;
    expect(entryA.status).toBe("completed");

    // pbB was never touched.
    const entryB = journey.find((e) => e.playbookId === pbB.id)!;
    expect(entryB.status).toBe("not_started");
    expect(entryB.totalSteps).toBe(1);
    expect(entryB.assignmentId).toBeNull();
  });
});

describe("supersedeStalePlaybookAssignments", () => {
  it("marks an earlier-stage Active assignment Superseded when the deal advances past it, and leaves a Completed assignment untouched", async () => {
    const stages = await db.select().from(pipelineStages).orderBy(asc(pipelineStages.sortOrder));
    const discovery = stages.find((s) => s.stageName === "Discovery")!;
    const validation = stages.find((s) => s.stageName === "Validation")!;
    const [discoveryPlaybook] = await db
      .select()
      .from(playbooks)
      .where(eq(playbooks.applicableStage, discovery.stageName))
      .limit(1);

    // Deal 1: start the Discovery playbook and touch nothing -> stays "Active".
    const dealId1 = await createDeal();
    const [assignment1] = await db
      .insert(dealPlaybookAssignments)
      .values({ dealId: dealId1, playbookId: discoveryPlaybook.id })
      .returning({ id: dealPlaybookAssignments.id });

    // Deal advances all the way to Validation (sortOrder > Discovery's).
    await supersedeStalePlaybookAssignments(dealId1, validation.sortOrder);

    const [after1] = await db
      .select({ status: dealPlaybookAssignments.status })
      .from(dealPlaybookAssignments)
      .where(eq(dealPlaybookAssignments.id, assignment1.id));
    expect(after1.status).toBe("Superseded");

    // Deal 2: start the Discovery playbook and complete every step, so
    // recomputeAssignment flips it to "Completed" via the existing path.
    const dealId2 = await createDeal();
    const [assignment2] = await db
      .insert(dealPlaybookAssignments)
      .values({ dealId: dealId2, playbookId: discoveryPlaybook.id })
      .returning({ id: dealPlaybookAssignments.id });
    const discoverySteps = await db
      .select({ id: playbookSteps.id })
      .from(playbookSteps)
      .where(eq(playbookSteps.playbookId, discoveryPlaybook.id));
    await db.insert(playbookStepCompletions).values(
      discoverySteps.map((s) => ({
        assignmentId: assignment2.id,
        stepId: s.id,
        status: "completed",
        skipped: false,
      })),
    );
    await recomputeAssignment(assignment2.id);

    const [beforeSupersede] = await db
      .select({ status: dealPlaybookAssignments.status })
      .from(dealPlaybookAssignments)
      .where(eq(dealPlaybookAssignments.id, assignment2.id));
    expect(beforeSupersede.status).toBe("Completed");

    await supersedeStalePlaybookAssignments(dealId2, validation.sortOrder);

    const [after2] = await db
      .select({ status: dealPlaybookAssignments.status })
      .from(dealPlaybookAssignments)
      .where(eq(dealPlaybookAssignments.id, assignment2.id));
    // Completed assignments are a terminal state too -- never downgraded.
    expect(after2.status).toBe("Completed");
  });
});

describe("recomputeAssignment", () => {
  it("never resurrects a Superseded assignment back to Active when one of its steps is actioned", async () => {
    const stages = await db.select().from(pipelineStages).orderBy(asc(pipelineStages.sortOrder));
    const discovery = stages.find((s) => s.stageName === "Discovery")!;
    const validation = stages.find((s) => s.stageName === "Validation")!;
    const [discoveryPlaybook] = await db
      .select()
      .from(playbooks)
      .where(eq(playbooks.applicableStage, discovery.stageName))
      .limit(1);

    const dealId = await createDeal();
    const [assignment] = await db
      .insert(dealPlaybookAssignments)
      .values({ dealId, playbookId: discoveryPlaybook.id })
      .returning({ id: dealPlaybookAssignments.id });

    // Deal advances past Discovery -> the Discovery assignment goes terminal.
    await supersedeStalePlaybookAssignments(dealId, validation.sortOrder);
    const [superseded] = await db
      .select({ status: dealPlaybookAssignments.status })
      .from(dealPlaybookAssignments)
      .where(eq(dealPlaybookAssignments.id, assignment.id));
    expect(superseded.status).toBe("Superseded");

    // Someone now tidies up a leftover Discovery step (or the MEDDPICC gate
    // sync touches it). recomputeAssignment must NOT flip the row back to
    // "Active" -- doing so would silently re-arm the H9 scoring bug, with the
    // superseded playbook counting against the deal forever.
    const discoverySteps = await db
      .select({ id: playbookSteps.id })
      .from(playbookSteps)
      .where(eq(playbookSteps.playbookId, discoveryPlaybook.id))
      .orderBy(asc(playbookSteps.stepOrder));
    await db.insert(playbookStepCompletions).values({
      assignmentId: assignment.id,
      stepId: discoverySteps[0].id,
      status: "completed",
      skipped: false,
    });
    await recomputeAssignment(assignment.id);

    const [after] = await db
      .select({ status: dealPlaybookAssignments.status })
      .from(dealPlaybookAssignments)
      .where(eq(dealPlaybookAssignments.id, assignment.id));
    expect(after.status).toBe("Superseded");

    // ...and the deal's aggregate still behaves as if it has no playbook.
    const signals = await getPlaybookSignals(dealId);
    expect(signals.hasPlaybook).toBe(false);
  });

  it("still flips an Active assignment to Completed once every step is terminal", async () => {
    const stages = await db.select().from(pipelineStages).orderBy(asc(pipelineStages.sortOrder));
    const discovery = stages.find((s) => s.stageName === "Discovery")!;
    const [discoveryPlaybook] = await db
      .select()
      .from(playbooks)
      .where(eq(playbooks.applicableStage, discovery.stageName))
      .limit(1);

    const dealId = await createDeal();
    const [assignment] = await db
      .insert(dealPlaybookAssignments)
      .values({ dealId, playbookId: discoveryPlaybook.id })
      .returning({ id: dealPlaybookAssignments.id });
    const discoverySteps = await db
      .select({ id: playbookSteps.id })
      .from(playbookSteps)
      .where(eq(playbookSteps.playbookId, discoveryPlaybook.id));
    await db.insert(playbookStepCompletions).values(
      discoverySteps.map((s) => ({
        assignmentId: assignment.id,
        stepId: s.id,
        status: "completed",
        skipped: false,
      })),
    );
    await recomputeAssignment(assignment.id);

    const [after] = await db
      .select({ status: dealPlaybookAssignments.status })
      .from(dealPlaybookAssignments)
      .where(eq(dealPlaybookAssignments.id, assignment.id));
    expect(after.status).toBe("Completed");
  });
});
