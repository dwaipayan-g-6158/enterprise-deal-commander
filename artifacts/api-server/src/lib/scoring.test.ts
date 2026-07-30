import { describe, it, expect, afterAll } from "vitest";
import { eq } from "drizzle-orm";
import { db, pool, enterpriseDeals, pricingModels, servicesTiers, pipelineStages, dealScores, dealTechnicalGates } from "@workspace/db";
import { computeDealScore, scoreDeal, buildScoringInput } from "./scoring";

const createdDealIds: string[] = [];

async function createDeal(): Promise<string> {
  const [pricing] = await db.select().from(pricingModels).limit(1);
  const [tier] = await db.select().from(servicesTiers).limit(1);
  const stages = await db.select().from(pipelineStages);
  const stage = stages.find((s) => s.stageName === "Discovery");
  if (!stage) throw new Error('Seed data missing pipeline stage "Discovery"');

  const [deal] = await db
    .insert(enterpriseDeals)
    .values({
      dealName: `Scoring RBAC Test ${Date.now()}`,
      accountName: `Scoring RBAC Acct ${Date.now()}`,
      accountManager: "AM",
      technicalLead: "TL",
      salesStageId: stage.id,
      pricingModelId: pricing.id,
      servicesTierId: tier.id,
      productRevenue: "1000.00",
      servicesRevenue: "0",
    })
    .returning({ id: enterpriseDeals.id });
  createdDealIds.push(deal.id);
  return deal.id;
}

async function scoreRowCount(dealId: string): Promise<number> {
  const rows = await db.select({ id: dealScores.id }).from(dealScores).where(eq(dealScores.dealId, dealId));
  return rows.length;
}

afterAll(async () => {
  // deal_scores.deal_id -> enterprise_deals.id ON DELETE CASCADE, so deleting
  // the deal is enough to clean up any rows either function inserted.
  if (createdDealIds.length > 0) {
    for (const id of createdDealIds) {
      await db.delete(enterpriseDeals).where(eq(enterpriseDeals.id, id));
    }
  }
  await pool.end();
});

describe("computeDealScore vs scoreDeal", () => {
  it("computeDealScore returns a score without appending to deal_scores", async () => {
    const dealId = await createDeal();
    expect(await scoreRowCount(dealId)).toBe(0);

    const result = await computeDealScore(dealId);
    expect(result).not.toBeNull();
    expect(typeof result?.score).toBe("number");
    expect(await scoreRowCount(dealId)).toBe(0);
  });

  it("scoreDeal computes AND appends exactly one deal_scores row", async () => {
    const dealId = await createDeal();
    expect(await scoreRowCount(dealId)).toBe(0);

    const result = await scoreDeal(dealId);
    expect(result).not.toBeNull();
    expect(await scoreRowCount(dealId)).toBe(1);

    // History is append-only: a second call adds a second row, not an upsert.
    await scoreDeal(dealId);
    expect(await scoreRowCount(dealId)).toBe(2);
  });

  it("both return null for a deal that doesn't exist, without inserting anything", async () => {
    const bogusId = "00000000-0000-0000-0000-000000000000";
    expect(await computeDealScore(bogusId)).toBeNull();
    expect(await scoreDeal(bogusId)).toBeNull();
  });

  it("computeDealScore and scoreDeal agree on the score/confidence for the same deal state", async () => {
    const dealId = await createDeal();
    const a = await computeDealScore(dealId);
    const b = await scoreDeal(dealId);
    expect(b?.score).toBe(a?.score);
    expect(b?.confidence).toBe(a?.confidence);
  });
});

describe("buildScoringInput — gate code matching", () => {
  it("G1_CRITERIA_LOCKED alone does not satisfy executiveAgreed", async () => {
    const dealId = await createDeal();
    await db.insert(dealTechnicalGates).values({
      dealId, gateCode: "G1_CRITERIA_LOCKED", isCompleted: true,
    });
    const input = await buildScoringInput(dealId);
    expect(input?.executiveAgreed).toBe(false);
  });

  it("G1_EXECUTIVE_AGREED satisfies executiveAgreed", async () => {
    const dealId = await createDeal();
    await db.insert(dealTechnicalGates).values([
      { dealId, gateCode: "G1_CRITERIA_LOCKED", isCompleted: true },
      { dealId, gateCode: "G1_EXECUTIVE_AGREED", isCompleted: true },
    ]);
    const input = await buildScoringInput(dealId);
    expect(input?.executiveAgreed).toBe(true);
  });
});
