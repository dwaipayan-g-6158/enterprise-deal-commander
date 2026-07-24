import { describe, it, expect, afterAll } from "vitest";
import { and, eq, inArray } from "drizzle-orm";
import {
  db,
  pool,
  enterpriseDeals,
  pricingModels,
  servicesTiers,
  pipelineStages,
  playbooks,
  dealPlaybookAssignments,
  playbookSteps,
  playbookStepCompletions,
  stakeholders,
  dealTechnicalGates,
  dealMemory,
  dealCompetitors,
  competitors,
} from "@workspace/db";
import { computeMeddpiccScoreForDeal, getMeddpiccAssessment, upsertMeddpiccAnswer } from "./meddpicc";
import { cache } from "./cache";

const ACTOR = "vitest";
const MEDDPICC_STEP_NAME = "MEDDPICC qualification scored";
const DISCOVERY_PLAYBOOK = "Discovery / Qualification Playbook";

const createdDealIds: string[] = [];
const createdDealMemoryIds: string[] = [];
const createdCompetitorIds: number[] = [];

async function createDiscoveryDeal(accountName: string): Promise<string> {
  const [pricing] = await db.select().from(pricingModels).limit(1);
  const [tier] = await db.select().from(servicesTiers).limit(1);
  const [discovery] = await db.select().from(pipelineStages).where(eq(pipelineStages.stageName, "Discovery"));
  const [row] = await db
    .insert(enterpriseDeals)
    .values({
      dealName: `Playbook Gate Test ${Date.now()}`,
      accountName,
      accountManager: "AM",
      technicalLead: "TL",
      salesStageId: discovery.id,
      pricingModelId: pricing.id,
      servicesTierId: tier.id,
      productRevenue: "100000",
      servicesRevenue: "0",
    })
    .returning({ id: enterpriseDeals.id });
  createdDealIds.push(row.id);
  return row.id;
}

async function assignDiscoveryPlaybook(dealId: string): Promise<string> {
  const [pb] = await db.select().from(playbooks).where(eq(playbooks.playbookName, DISCOVERY_PLAYBOOK));
  const [assignment] = await db
    .insert(dealPlaybookAssignments)
    .values({ dealId, playbookId: pb.id })
    .returning({ id: dealPlaybookAssignments.id });
  return assignment.id;
}

async function stepStatus(assignmentId: string, stepName: string): Promise<string | undefined> {
  const [pb] = await db.select().from(playbooks).where(eq(playbooks.playbookName, DISCOVERY_PLAYBOOK));
  const [step] = await db
    .select()
    .from(playbookSteps)
    .where(and(eq(playbookSteps.playbookId, pb.id), eq(playbookSteps.stepName, stepName)));
  const [completion] = await db
    .select()
    .from(playbookStepCompletions)
    .where(and(eq(playbookStepCompletions.assignmentId, assignmentId), eq(playbookStepCompletions.stepId, step.id)));
  return completion?.status;
}

async function completionRowCount(assignmentId: string, stepName: string): Promise<number> {
  const [pb] = await db.select().from(playbooks).where(eq(playbooks.playbookName, DISCOVERY_PLAYBOOK));
  const [step] = await db
    .select()
    .from(playbookSteps)
    .where(and(eq(playbookSteps.playbookId, pb.id), eq(playbookSteps.stepName, stepName)));
  const rows = await db
    .select()
    .from(playbookStepCompletions)
    .where(and(eq(playbookStepCompletions.assignmentId, assignmentId), eq(playbookStepCompletions.stepId, step.id)));
  return rows.length;
}

async function poll<T>(fn: () => Promise<T>, predicate: (v: T) => boolean, timeoutMs = 10_000): Promise<T> {
  const start = Date.now();
  let last = await fn();
  while (!predicate(last)) {
    if (Date.now() - start > timeoutMs) return last;
    await new Promise((r) => setTimeout(r, 100));
    last = await fn();
  }
  return last;
}

afterAll(async () => {
  if (createdDealMemoryIds.length > 0) {
    await db.delete(dealMemory).where(inArray(dealMemory.id, createdDealMemoryIds));
  }
  if (createdDealIds.length > 0) {
    await db.delete(enterpriseDeals).where(inArray(enterpriseDeals.id, createdDealIds));
  }
  if (createdCompetitorIds.length > 0) {
    await db.delete(competitors).where(inArray(competitors.id, createdCompetitorIds));
  }
  await pool.end();
});

describe("MEDDPICC playbook gate", () => {
  it("auto-completes the MEDDPICC step when the score reaches Green via manual answers", async () => {
    const dealId = await createDiscoveryDeal(`Acct ${Date.now()}-a`);
    const assignmentId = await assignDiscoveryPlaybook(dealId);

    for (let order = 1; order <= 8; order++) {
      await upsertMeddpiccAnswer(dealId, order, { score: 3 }, ACTOR);
    }
    // The real PATCH route recomputes the assessment right after every
    // upsert (that recompute is what surfaces the new score to the caller) —
    // mirror that here, since this test calls the lib function directly.
    await getMeddpiccAssessment(dealId);

    const status = await poll(
      () => stepStatus(assignmentId, MEDDPICC_STEP_NAME),
      (s) => s === "completed",
    );
    expect(status).toBe("completed");
  });

  it("does not auto-complete the step if the rep already skipped it explicitly", async () => {
    const dealId = await createDiscoveryDeal(`Acct ${Date.now()}-b`);
    const assignmentId = await assignDiscoveryPlaybook(dealId);
    const [pb] = await db.select().from(playbooks).where(eq(playbooks.playbookName, DISCOVERY_PLAYBOOK));
    const [step] = await db
      .select()
      .from(playbookSteps)
      .where(and(eq(playbookSteps.playbookId, pb.id), eq(playbookSteps.stepName, MEDDPICC_STEP_NAME)));
    await db.insert(playbookStepCompletions).values({
      assignmentId,
      stepId: step.id,
      status: "skipped",
      skipped: true,
      skipReason: "Not applicable for this deal",
    });

    for (let order = 1; order <= 8; order++) {
      await upsertMeddpiccAnswer(dealId, order, { score: 3 }, ACTOR);
    }
    // Confirm the score actually reached Green before asserting the skip was
    // respected — otherwise this test would pass vacuously even if the
    // auto-complete check were broken (it would just never have run).
    const assessment = await getMeddpiccAssessment(dealId);
    expect(assessment?.score.ragStatus).toBe("Green");

    const status = await stepStatus(assignmentId, MEDDPICC_STEP_NAME);
    expect(status).toBe("skipped"); // untouched — explicit rep decision respected
  });

  it("produces exactly one completion row when computeMeddpiccScoreForDeal is called twice back-to-back", async () => {
    const dealId = await createDiscoveryDeal(`Acct ${Date.now()}-c`);
    const assignmentId = await assignDiscoveryPlaybook(dealId);

    for (let order = 1; order <= 8; order++) {
      await upsertMeddpiccAnswer(dealId, order, { score: 3 }, ACTOR);
    }

    // Two concurrent calls for the same deal, with no await between them, so
    // both dispatches are in flight simultaneously — this is the race the
    // per-assignment serialization in meddpicc-playbook-gate.ts guards.
    await Promise.all([computeMeddpiccScoreForDeal(dealId), computeMeddpiccScoreForDeal(dealId)]);

    const status = await poll(
      () => stepStatus(assignmentId, MEDDPICC_STEP_NAME),
      (s) => s === "completed",
    );
    expect(status).toBe("completed");

    const count = await completionRowCount(assignmentId, MEDDPICC_STEP_NAME);
    expect(count).toBe(1);
  });

  it("auto-completes purely from auto-computed answers, with zero manual answers ever given", async () => {
    const accountName = `Acct ${Date.now()}-d`;
    const dealId = await createDiscoveryDeal(accountName);
    const assignmentId = await assignDiscoveryPlaybook(dealId);

    // Economic Buyer + Decision Process (2+ decision-makers) + Champion signals.
    await db.insert(stakeholders).values([
      {
        dealId,
        name: "Big Boss",
        roleType: "Economic Buyer",
        influenceLevel: "High",
        sentiment: "Champion",
        isDecisionMaker: true,
      },
      {
        dealId,
        name: "Second Decider",
        roleType: "Influencer",
        influenceLevel: "High",
        sentiment: "Neutral",
        isDecisionMaker: true,
      },
    ]);

    // Decision Criteria + Economic Buyer + Champion + partial Paper Process gates.
    await db.insert(dealTechnicalGates).values([
      { dealId, gateCode: "G1_EXECUTIVE_AGREED", isCompleted: true },
      { dealId, gateCode: "G1_CRITERIA_LOCKED", isCompleted: true },
      { dealId, gateCode: "G2_CHAMPION_DEFENSIBLE", isCompleted: true },
      { dealId, gateCode: "G4_COMPLIANCE_VALIDATED", isCompleted: true },
    ]);

    // Identify Pain: prior Won deal for this account.
    const [prior] = await db
      .insert(dealMemory)
      .values({
        dealId: "00000000-0000-0000-0000-000000000000",
        accountName,
        dealName: "Prior Deal",
        outcome: "Won",
      })
      .returning({ id: dealMemory.id });
    createdDealMemoryIds.push(prior.id);

    // Competition: a tracked competitor this deal has already "Won Against"
    // gives a 100% historical win rate for that competitor.
    const [competitor] = await db
      .insert(competitors)
      .values({ name: `Playbook Gate Test Competitor ${Date.now()}` })
      .returning({ id: competitors.id });
    createdCompetitorIds.push(competitor.id);
    await db.insert(dealCompetitors).values({ dealId, competitorId: competitor.id, status: "Won Against" });

    // The win-rate lookup is cached in-process; clear it so this test's fresh
    // competitor data is never shadowed by an earlier test's (empty) result.
    cache.clear();

    // This totals Economic Buyer(3) + Decision Criteria(3) + Decision Process(3)
    // + Paper Process(1, gate only) + Identify Pain(3) + Champion(3) +
    // Competition(3) = 19 of 24 (79%) — Green (>75) — with Metrics (the one
    // manual-only question) left completely unanswered. No upsertMeddpiccAnswer
    // call happens anywhere in this test.
    const assessment = await getMeddpiccAssessment(dealId);
    expect(assessment?.score.ragStatus).toBe("Green");
    expect(assessment?.answers.find((a) => a.questionOrder === 1)?.source).toBe("unanswered");

    const status = await poll(
      () => stepStatus(assignmentId, MEDDPICC_STEP_NAME),
      (s) => s === "completed",
    );
    expect(status).toBe("completed");
  });

  it("reopens a system-completed step when the score subsequently drops below Green", async () => {
    const dealId = await createDiscoveryDeal(`Acct ${Date.now()}-e`);
    const assignmentId = await assignDiscoveryPlaybook(dealId);

    for (let order = 1; order <= 8; order++) {
      await upsertMeddpiccAnswer(dealId, order, { score: 3 }, ACTOR);
    }
    let assessment = await getMeddpiccAssessment(dealId);
    expect(assessment?.score.ragStatus).toBe("Green");
    expect(await stepStatus(assignmentId, MEDDPICC_STEP_NAME)).toBe("completed");

    // Drop Metrics back down — 21/24 (88%) is still Green, so also drop
    // Economic Buyer to land well under the 75% threshold.
    await upsertMeddpiccAnswer(dealId, 1, { score: 0 }, ACTOR);
    await upsertMeddpiccAnswer(dealId, 2, { score: 0 }, ACTOR);
    assessment = await getMeddpiccAssessment(dealId);
    expect(assessment?.score.ragStatus).not.toBe("Green");
    expect(await stepStatus(assignmentId, MEDDPICC_STEP_NAME)).toBeUndefined();
  });

  it("does not reopen a step a rep manually completed, even when the score is Red", async () => {
    const dealId = await createDiscoveryDeal(`Acct ${Date.now()}-f`);
    const assignmentId = await assignDiscoveryPlaybook(dealId);
    const [pb] = await db.select().from(playbooks).where(eq(playbooks.playbookName, DISCOVERY_PLAYBOOK));
    const [step] = await db
      .select()
      .from(playbookSteps)
      .where(and(eq(playbookSteps.playbookId, pb.id), eq(playbookSteps.stepName, MEDDPICC_STEP_NAME)));
    // Simulates the manual "set step state" route, which persists the
    // acting rep's name as completedBy (not "system").
    await db.insert(playbookStepCompletions).values({
      assignmentId,
      stepId: step.id,
      status: "completed",
      completedBy: "A Human Rep",
      notes: "Reviewed manually, marking done regardless of score",
    });

    const assessment = await getMeddpiccAssessment(dealId);
    expect(assessment?.score.ragStatus).toBe("Red"); // brand-new deal, no signals set up

    const status = await stepStatus(assignmentId, MEDDPICC_STEP_NAME);
    expect(status).toBe("completed"); // untouched — a human's decision, not the system's
  });
});
