import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { eq, inArray } from "drizzle-orm";
import {
  db,
  pool,
  enterpriseDeals,
  pipelineStages,
  pricingModels,
  servicesTiers,
  dealMemory,
} from "@workspace/db";
import { emitDealEvent } from "../events";
import { registerSubscribers, unregisterSubscribers } from "./index";

// Same emitDealEvent + registerSubscribers/unregisterSubscribers + poll
// pattern as ./playbook-engine.test.ts (the closest existing subscriber test
// in this repo — no dedicated post-mortem.test.ts existed before this).
//
// Regression test: registerPostMortem() used to compute dealMemory.finalTcv
// as a flat productRevenue + servicesRevenue sum, dropping the
// contractTermYears multiplier for Multi-Year Committed deals. This is the
// highest-stakes of the TCV consolidation sites — lib/scoring.ts's
// historicalContext() reads dealMemory.finalTcv directly to compute
// avgWonTCV, so every deal that closed before this fix wrote a wrong
// historical TCV into the very number deal-size scoring compares against.

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

async function createMultiYearDeal(stageId: number): Promise<string> {
  const pricingRows = await db.select().from(pricingModels);
  const pricing = pricingRows.find((p) => p.modelName === "Multi-Year Committed");
  if (!pricing) throw new Error('Seed data missing pricing model "Multi-Year Committed"');
  const [tier] = await db.select().from(servicesTiers).limit(1);
  const suffix = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const [row] = await db
    .insert(enterpriseDeals)
    .values({
      dealName: `Post-Mortem TCV Test ${suffix}`,
      accountName: `Post-Mortem TCV Acct ${suffix}`,
      accountManager: "AM",
      technicalLead: "TL",
      salesStageId: stageId,
      pricingModelId: pricing.id,
      servicesTierId: tier.id,
      contractTermYears: 3,
      productRevenue: "1000000.00",
      servicesRevenue: "200000.00",
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
    await db.delete(dealMemory).where(inArray(dealMemory.dealId, createdDealIds));
    await db.delete(enterpriseDeals).where(inArray(enterpriseDeals.id, createdDealIds));
  }
  await pool.end();
});

describe("post-mortem subscriber — finalTcv honors the Multi-Year Committed term multiplier", () => {
  it("persists dealMemory.finalTcv as productRevenue * contractTermYears + servicesRevenue on Closed-Won", async () => {
    const stages = await db.select().from(pipelineStages);
    const discovery = stages.find((s) => s.stageName === "Discovery");
    const closedWon = stages.find((s) => s.stageName === "Closed-Won");
    if (!discovery || !closedWon) throw new Error("Seed data missing Discovery/Closed-Won stages");

    const dealId = await createMultiYearDeal(discovery.id);

    emitDealEvent("deal.stage_changed", {
      dealId,
      actor: ACTOR,
      fromStageId: discovery.id,
      toStageId: closedWon.id,
      overridden: false,
    });

    const memoryRows = await poll(
      () => db.select().from(dealMemory).where(eq(dealMemory.dealId, dealId)),
      (rows) => rows.length >= 1,
    );

    expect(memoryRows.length).toBe(1);
    expect(memoryRows[0].outcome).toBe("Won");
    // Fails today: the subscriber computes finalTcv as
    // productRevenue + servicesRevenue (1,200,000), dropping the x3 term
    // multiplier that calculateFlatTCV applies.
    expect(Number(memoryRows[0].finalTcv)).toBe(3_200_000);
  });
});
