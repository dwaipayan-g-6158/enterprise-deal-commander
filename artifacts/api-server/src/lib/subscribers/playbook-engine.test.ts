import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { asc, eq, inArray } from "drizzle-orm";
import {
  db,
  pool,
  enterpriseDeals,
  pipelineStages,
  pricingModels,
  servicesTiers,
  playbooks,
  dealPlaybookAssignments,
} from "@workspace/db";
import { emitDealEvent } from "../events";
import { registerSubscribers, unregisterSubscribers } from "./index";

// Regression test for the "playbook never updates on stage change" bug: the
// auto-assign guard used to check "does this deal have ANY active assignment",
// so once a deal picked up its first stage playbook, every later stage change
// was silently ignored. It now guards per (deal, playbook) — a deal keeps
// every earlier assignment as it advances through its journey.

const ACTOR = "vitest";
const createdDealIds: string[] = [];

async function poll<T>(
  fn: () => Promise<T>,
  predicate: (v: T) => boolean,
  timeoutMs = 10_000,
): Promise<T> {
  const start = Date.now();
  let last = await fn();
  while (!predicate(last)) {
    if (Date.now() - start > timeoutMs) return last;
    await new Promise((r) => setTimeout(r, 100));
    last = await fn();
  }
  return last;
}

async function createDeal(stageId: number): Promise<string> {
  const [pricing] = await db.select().from(pricingModels).limit(1);
  const [tier] = await db.select().from(servicesTiers).limit(1);
  const suffix = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const [row] = await db
    .insert(enterpriseDeals)
    .values({
      dealName: `Playbook Engine ${suffix}`,
      accountName: `Acct ${suffix}`,
      accountManager: "AM",
      technicalLead: "TL",
      salesStageId: stageId,
      pricingModelId: pricing.id,
      servicesTierId: tier.id,
      productRevenue: "500000",
      servicesRevenue: "100000",
    })
    .returning({ id: enterpriseDeals.id });
  createdDealIds.push(row.id);
  return row.id;
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

describe("playbook auto-assign on stage change", () => {
  it("assigns each new stage's playbook without removing earlier assignments", async () => {
    const stages = await db.select().from(pipelineStages).orderBy(asc(pipelineStages.sortOrder));
    const [discovery, validation, commercial] = stages;
    const dealId = await createDeal(discovery.id);

    const [validationPlaybook] = await db
      .select()
      .from(playbooks)
      .where(eq(playbooks.applicableStage, validation.stageName));
    const [commercialPlaybook] = await db
      .select()
      .from(playbooks)
      .where(eq(playbooks.applicableStage, commercial.stageName));

    // Discovery -> Validation
    emitDealEvent("deal.stage_changed", {
      dealId,
      actor: ACTOR,
      fromStageId: discovery.id,
      toStageId: validation.id,
      overridden: false,
    });
    const afterFirst = await poll(
      () => db.select().from(dealPlaybookAssignments).where(eq(dealPlaybookAssignments.dealId, dealId)),
      (rows) => rows.length >= 1,
    );
    expect(afterFirst.length).toBe(1);
    expect(afterFirst[0].playbookId).toBe(validationPlaybook.id);
    const validationAssignmentId = afterFirst[0].id;

    // Validation -> Commercial
    emitDealEvent("deal.stage_changed", {
      dealId,
      actor: ACTOR,
      fromStageId: validation.id,
      toStageId: commercial.id,
      overridden: false,
    });
    const afterSecond = await poll(
      () => db.select().from(dealPlaybookAssignments).where(eq(dealPlaybookAssignments.dealId, dealId)),
      (rows) => rows.length >= 2,
    );

    expect(afterSecond.length).toBe(2);
    const byPlaybookId = new Map(afterSecond.map((a) => [a.playbookId, a]));
    // The Validation assignment survives untouched (same row, not recreated).
    expect(byPlaybookId.get(validationPlaybook.id)?.id).toBe(validationAssignmentId);
    // The Commercial assignment was newly created — this is exactly what the
    // old per-deal guard used to block.
    expect(byPlaybookId.has(commercialPlaybook.id)).toBe(true);
  });

  it("does not create a duplicate assignment when the deal re-enters a stage it already has", async () => {
    const stages = await db.select().from(pipelineStages).orderBy(asc(pipelineStages.sortOrder));
    const [discovery, validation, commercial] = stages;
    const dealId = await createDeal(discovery.id);

    emitDealEvent("deal.stage_changed", {
      dealId,
      actor: ACTOR,
      fromStageId: discovery.id,
      toStageId: validation.id,
      overridden: false,
    });
    const afterFirst = await poll(
      () => db.select().from(dealPlaybookAssignments).where(eq(dealPlaybookAssignments.dealId, dealId)),
      (rows) => rows.length >= 1,
    );
    expect(afterFirst.length).toBe(1);

    emitDealEvent("deal.stage_changed", {
      dealId,
      actor: ACTOR,
      fromStageId: validation.id,
      toStageId: commercial.id,
      overridden: false,
    });
    await poll(
      () => db.select().from(dealPlaybookAssignments).where(eq(dealPlaybookAssignments.dealId, dealId)),
      (rows) => rows.length >= 2,
    );

    // Bounce back to Validation, which the deal already has an assignment
    // for — this must NOT create a second Validation row.
    emitDealEvent("deal.stage_changed", {
      dealId,
      actor: ACTOR,
      fromStageId: commercial.id,
      toStageId: validation.id,
      overridden: false,
    });
    // Give the (idempotent, no-op) re-assign attempt time to run.
    await new Promise((r) => setTimeout(r, 1500));

    const rows = await db
      .select()
      .from(dealPlaybookAssignments)
      .where(eq(dealPlaybookAssignments.dealId, dealId));
    expect(rows.length).toBe(2);
    expect(rows.find((r) => r.playbookId === afterFirst[0].playbookId)?.id).toBe(afterFirst[0].id);
  });
});
