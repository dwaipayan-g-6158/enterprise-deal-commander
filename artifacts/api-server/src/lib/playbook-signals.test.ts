import { describe, it, expect, afterAll } from "vitest";
import { inArray } from "drizzle-orm";
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
import { getPlaybookSignals } from "./playbook-signals";

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
});
