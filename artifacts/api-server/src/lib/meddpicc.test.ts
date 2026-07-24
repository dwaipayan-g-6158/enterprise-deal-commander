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
  it("computes a score for a brand-new deal from live-computed answers alone and persists a snapshot row", async () => {
    const dealId = await createDeal("Discovery");
    const result = await computeMeddpiccScoreForDeal(dealId);
    expect(result).not.toBeNull();
    const latest = await getLatestMeddpiccScore(dealId);
    expect(latest?.overallPct).toBe(result?.overallPct);
  });

  it("returns null for a non-existent deal", async () => {
    const result = await computeMeddpiccScoreForDeal("00000000-0000-0000-0000-000000000000");
    expect(result).toBeNull();
  });
});

describe("getMeddpiccAssessment / upsertMeddpiccAnswer", () => {
  it("returns all 8 questions, each with a computed or unanswered source before any manual answer", async () => {
    const dealId = await createDeal("Discovery");
    const assessment = await getMeddpiccAssessment(dealId);
    expect(assessment?.questions).toHaveLength(8);
    expect(assessment?.answers).toHaveLength(8);
    const metrics = assessment?.answers.find((a) => a.questionOrder === 1);
    expect(metrics?.source).toBe("unanswered");
    expect(metrics?.score).toBeNull();
    const economicBuyer = assessment?.answers.find((a) => a.questionOrder === 2);
    expect(economicBuyer?.source).toBe("computed");
    expect(economicBuyer?.reason).not.toBeNull();
  });

  it("upserts a manual answer for Metrics and reflects it in the next assessment + score", async () => {
    const dealId = await createDeal("Discovery");
    await upsertMeddpiccAnswer(dealId, 1, { score: 3 }, "vitest");
    const assessment = await getMeddpiccAssessment(dealId);
    const answer = assessment?.answers.find((a) => a.questionOrder === 1);
    expect(answer?.score).toBe(3);
    expect(answer?.source).toBe("manual");
    expect(assessment?.score.overallScore).toBeGreaterThanOrEqual(3);
  });

  it("a manual override on an auto-computed question wins over the live-computed value", async () => {
    const dealId = await createDeal("Discovery");
    const before = await getMeddpiccAssessment(dealId);
    const computed = before?.answers.find((a) => a.questionOrder === 3); // Decision Criteria, computed 0 with no gate
    expect(computed?.source).toBe("computed");
    expect(computed?.score).toBe(0);

    await upsertMeddpiccAnswer(dealId, 3, { score: 3 }, "vitest");
    const after = await getMeddpiccAssessment(dealId);
    const overridden = after?.answers.find((a) => a.questionOrder === 3);
    expect(overridden?.source).toBe("manual");
    expect(overridden?.score).toBe(3);
    expect(overridden?.reason).not.toBeNull(); // reason still shown even though overridden
  });

  it("upserting the same question twice updates rather than duplicates", async () => {
    const dealId = await createDeal("Discovery");
    await upsertMeddpiccAnswer(dealId, 1, { score: 1 }, "vitest");
    await upsertMeddpiccAnswer(dealId, 1, { score: 3, note: "changed my mind" }, "vitest");
    const assessment = await getMeddpiccAssessment(dealId);
    const answer = assessment?.answers.find((a) => a.questionOrder === 1);
    expect(answer?.score).toBe(3);
    expect(answer?.note).toBe("changed my mind");
  });

  it("throws for a non-existent dealId", async () => {
    await expect(
      upsertMeddpiccAnswer("00000000-0000-0000-0000-000000000000", 1, { score: 3 }, "vitest"),
    ).rejects.toThrow();
  });

  it("rejects a score above the valid range (99)", async () => {
    const dealId = await createDeal("Discovery");
    await expect(upsertMeddpiccAnswer(dealId, 1, { score: 99 }, "vitest")).rejects.toThrow();
  });

  it("rejects a score below the valid range (-1)", async () => {
    const dealId = await createDeal("Discovery");
    await expect(upsertMeddpiccAnswer(dealId, 1, { score: -1 }, "vitest")).rejects.toThrow();
  });

  it("rejects a non-integer score (1.5)", async () => {
    const dealId = await createDeal("Discovery");
    await expect(upsertMeddpiccAnswer(dealId, 1, { score: 1.5 }, "vitest")).rejects.toThrow();
  });

  it("accepts the boundary-valid score 0", async () => {
    const dealId = await createDeal("Discovery");
    await upsertMeddpiccAnswer(dealId, 1, { score: 0 }, "vitest");
    const assessment = await getMeddpiccAssessment(dealId);
    expect(assessment?.answers.find((a) => a.questionOrder === 1)?.score).toBe(0);
  });

  it("accepts the boundary-valid score 3", async () => {
    const dealId = await createDeal("Discovery");
    await upsertMeddpiccAnswer(dealId, 1, { score: 3 }, "vitest");
    const assessment = await getMeddpiccAssessment(dealId);
    expect(assessment?.answers.find((a) => a.questionOrder === 1)?.score).toBe(3);
  });
});

describe("stage bucket wiring", () => {
  it("uses the Qualification bucket (Q-tagged questions only) for a Discovery-stage deal", async () => {
    const dealId = await createDeal("Discovery");
    // Q-tagged questions: Metrics(1), DecisionCriteria(3), DecisionProcess(4), IdentifyPain(6), Competition(8) — 5 x 3 = 15 max.
    for (const order of [1, 3, 4, 6, 8]) await upsertMeddpiccAnswer(dealId, order, { score: 3 }, "vitest");
    const result = await computeMeddpiccScoreForDeal(dealId);
    expect(result?.stagePct).toBe(100);
  });
});
