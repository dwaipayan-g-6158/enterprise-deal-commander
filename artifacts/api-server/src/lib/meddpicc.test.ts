import { describe, it, expect, afterAll } from "vitest";
import { inArray } from "drizzle-orm";
import { db, pool, enterpriseDeals, pricingModels, servicesTiers, pipelineStages } from "@workspace/db";
import {
  computeMeddpiccScoreForDeal,
  getMeddpiccAssessment,
  upsertMeddpiccAnswer,
  getLatestMeddpiccScore,
} from "./meddpicc";

const createdDealIds: string[] = [];

async function createDeal(stageName: string): Promise<string> {
  const [stage] = await db.select().from(pipelineStages).where(
    // any stage whose name matches; falls back to first stage if not found
    stageName ? (undefined as never) : (undefined as never),
  );
  const [pricing] = await db.select().from(pricingModels).limit(1);
  const [tier] = await db.select().from(servicesTiers).limit(1);
  const stages = await db.select().from(pipelineStages);
  const match = stages.find((s) => s.stageName === stageName) ?? stages[0];
  const [row] = await db
    .insert(enterpriseDeals)
    .values({
      dealName: `Meddpicc Score Test ${Date.now()}`,
      accountName: `Acct ${Date.now()}`,
      accountManager: "AM",
      technicalLead: "TL",
      salesStageId: match.id,
      pricingModelId: pricing.id,
      servicesTierId: tier.id,
      productRevenue: "100000",
      servicesRevenue: "0",
    })
    .returning({ id: enterpriseDeals.id });
  createdDealIds.push(row.id);
  return row.id;
}

afterAll(async () => {
  if (createdDealIds.length > 0) {
    await db.delete(enterpriseDeals).where(inArray(enterpriseDeals.id, createdDealIds));
  }
  await pool.end();
});

describe("computeMeddpiccScoreForDeal", () => {
  it("scores 0% for a brand-new deal with no answers and persists a snapshot row", async () => {
    const dealId = await createDeal("Discovery");
    const result = await computeMeddpiccScoreForDeal(dealId);
    expect(result?.overallPct).toBe(0);
    expect(result?.ragStatus).toBe("Red");
    const latest = await getLatestMeddpiccScore(dealId);
    expect(latest?.overallPct).toBe(0);
  });

  it("returns null for a non-existent deal", async () => {
    const result = await computeMeddpiccScoreForDeal("00000000-0000-0000-0000-000000000000");
    expect(result).toBeNull();
  });
});

describe("getMeddpiccAssessment / upsertMeddpiccAnswer", () => {
  it("returns all 43 questions with null answers before anything is scored", async () => {
    const dealId = await createDeal("Discovery");
    const assessment = await getMeddpiccAssessment(dealId);
    expect(assessment?.questions).toHaveLength(43);
    expect(assessment?.answers.every((a) => a.score === null)).toBe(true);
  });

  it("upserts an answer and reflects it in the next assessment + score", async () => {
    const dealId = await createDeal("Discovery");
    await upsertMeddpiccAnswer(dealId, 1, { score: 3 }, "vitest");
    const assessment = await getMeddpiccAssessment(dealId);
    const answer = assessment?.answers.find((a) => a.questionOrder === 1);
    expect(answer?.score).toBe(3);
    expect(assessment?.score.overallScore).toBeGreaterThanOrEqual(3);
  });

  it("marks isAutoSuggested true when the saved score matches the live suggestion", async () => {
    const dealId = await createDeal("Discovery");
    // Q24 (existing customer) always has a suggestion (3 or 2) even with no data.
    const before = await getMeddpiccAssessment(dealId);
    const suggestion = before?.suggestions.find((s) => s.questionOrder === 24);
    expect(suggestion).toBeDefined();
    await upsertMeddpiccAnswer(dealId, 24, { score: suggestion!.suggestedScore }, "vitest");
    const after = await getMeddpiccAssessment(dealId);
    expect(after?.answers.find((a) => a.questionOrder === 24)?.isAutoSuggested).toBe(true);
  });

  it("upserting the same question twice updates rather than duplicates", async () => {
    const dealId = await createDeal("Discovery");
    await upsertMeddpiccAnswer(dealId, 5, { score: 1 }, "vitest");
    await upsertMeddpiccAnswer(dealId, 5, { score: 3, note: "changed my mind" }, "vitest");
    const assessment = await getMeddpiccAssessment(dealId);
    const answer = assessment?.answers.find((a) => a.questionOrder === 5);
    expect(answer?.score).toBe(3);
    expect(answer?.note).toBe("changed my mind");
  });
});

describe("stage bucket wiring", () => {
  it("uses the Qualification bucket (Q-tagged /81) for a Discovery-stage deal", async () => {
    const dealId = await createDeal("Discovery");
    for (const order of [1, 2, 3, 4, 5]) await upsertMeddpiccAnswer(dealId, order, { score: 3 }, "vitest");
    const result = await computeMeddpiccScoreForDeal(dealId);
    // 5 Metrics questions (all Q-tagged) x 3 = 15 of 81 possible stage points.
    expect(result?.stagePct).toBe(Math.round((15 / 81) * 100));
  });
});
