import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { inArray, eq, and } from "drizzle-orm";
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
} from "@workspace/db";
import { emitDealEvent } from "../events";
import { registerSubscribers, unregisterSubscribers } from "./index";
import { QUESTION_CATALOG } from "@workspace/engine";
import { upsertMeddpiccAnswer } from "../meddpicc";

const ACTOR = "vitest";
const createdDealIds: string[] = [];

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

async function createDiscoveryDeal(): Promise<string> {
  const [pricing] = await db.select().from(pricingModels).limit(1);
  const [tier] = await db.select().from(servicesTiers).limit(1);
  const [discovery] = await db.select().from(pipelineStages).where(eq(pipelineStages.stageName, "Discovery"));
  const [row] = await db
    .insert(enterpriseDeals)
    .values({
      dealName: `Meddpicc Subscriber Test ${Date.now()}`,
      accountName: `Acct ${Date.now()}`,
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
  const [pb] = await db.select().from(playbooks).where(eq(playbooks.playbookName, "Discovery / Qualification Playbook"));
  const [assignment] = await db
    .insert(dealPlaybookAssignments)
    .values({ dealId, playbookId: pb.id })
    .returning({ id: dealPlaybookAssignments.id });
  return assignment.id;
}

async function stepStatus(assignmentId: string, stepName: string): Promise<string | undefined> {
  const [pb] = await db.select().from(playbooks).where(eq(playbooks.playbookName, "Discovery / Qualification Playbook"));
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

beforeAll(() => {
  registerSubscribers();
});

afterAll(async () => {
  unregisterSubscribers();
  if (createdDealIds.length > 0) {
    await db.delete(enterpriseDeals).where(inArray(enterpriseDeals.id, createdDealIds));
  }
  await pool.end();
});

describe("MEDDPICC subscriber", () => {
  it("auto-completes the MEDDPICC qualification step once the score reaches Green", async () => {
    const dealId = await createDiscoveryDeal();
    const assignmentId = await assignDiscoveryPlaybook(dealId);

    for (const q of QUESTION_CATALOG) {
      await upsertMeddpiccAnswer(dealId, q.questionOrder, { score: 3 }, ACTOR);
    }
    emitDealEvent("meddpicc.answer_changed", { dealId, actor: ACTOR, questionOrder: 43, score: 3 });

    const status = await poll(
      () => stepStatus(assignmentId, "MEDDPICC qualification scored"),
      (s) => s === "completed",
    );
    expect(status).toBe("completed");
  });

  it("does not auto-complete the step if the rep already skipped it explicitly", async () => {
    const dealId = await createDiscoveryDeal();
    const assignmentId = await assignDiscoveryPlaybook(dealId);
    const [pb] = await db.select().from(playbooks).where(eq(playbooks.playbookName, "Discovery / Qualification Playbook"));
    const [step] = await db
      .select()
      .from(playbookSteps)
      .where(and(eq(playbookSteps.playbookId, pb.id), eq(playbookSteps.stepName, "MEDDPICC qualification scored")));
    await db.insert(playbookStepCompletions).values({
      assignmentId,
      stepId: step.id,
      status: "skipped",
      skipped: true,
      skipReason: "Not applicable for this deal",
    });

    for (const q of QUESTION_CATALOG) {
      await upsertMeddpiccAnswer(dealId, q.questionOrder, { score: 3 }, ACTOR);
    }
    emitDealEvent("meddpicc.answer_changed", { dealId, actor: ACTOR, questionOrder: 43, score: 3 });
    await new Promise((r) => setTimeout(r, 1500)); // give the (no-op) subscriber time to run

    const status = await stepStatus(assignmentId, "MEDDPICC qualification scored");
    expect(status).toBe("skipped"); // untouched — explicit rep decision respected
  });
});
