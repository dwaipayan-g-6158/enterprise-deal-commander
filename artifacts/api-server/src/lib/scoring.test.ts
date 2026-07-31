import { randomUUID } from "node:crypto";
import { describe, it, expect, afterAll } from "vitest";
import { eq } from "drizzle-orm";
import {
  db,
  pool,
  enterpriseDeals,
  pricingModels,
  servicesTiers,
  pipelineStages,
  dealScores,
  dealTechnicalGates,
  dealMemory,
  velocityBenchmarks,
} from "@workspace/db";
import { computeDealScore, scoreDeal, buildScoringInput, historicalContext } from "./scoring";

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

// Parameterizes pricing-model lookup by modelName (rather than createDeal's
// "just take the first row") so the multi-year term multiplier is exercised
// deterministically regardless of seed ordering.
async function createMultiYearDeal(opts: {
  productRevenue: number;
  servicesRevenue: number;
  termYears: number;
}): Promise<string> {
  const pricingRows = await db.select().from(pricingModels);
  const pricing = pricingRows.find((p) => p.modelName === "Multi-Year Committed");
  if (!pricing) throw new Error('Seed data missing pricing model "Multi-Year Committed"');
  const [tier] = await db.select().from(servicesTiers).limit(1);
  const stages = await db.select().from(pipelineStages);
  const stage = stages.find((s) => s.stageName === "Discovery");
  if (!stage) throw new Error('Seed data missing pipeline stage "Discovery"');

  const [deal] = await db
    .insert(enterpriseDeals)
    .values({
      dealName: `Scoring Multi-Year Test ${Date.now()}`,
      accountName: `Scoring Multi-Year Acct ${Date.now()}`,
      accountManager: "AM",
      technicalLead: "TL",
      salesStageId: stage.id,
      pricingModelId: pricing.id,
      servicesTierId: tier.id,
      contractTermYears: opts.termYears,
      productRevenue: opts.productRevenue.toFixed(2),
      servicesRevenue: opts.servicesRevenue.toFixed(2),
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

describe("buildScoringInput — TCV calculation", () => {
  it("buildScoringInput's calculatedTCV honors the Multi-Year Committed term multiplier", async () => {
    const dealId = await createMultiYearDeal({ productRevenue: 1_000_000, servicesRevenue: 200_000, termYears: 3 });
    const input = await buildScoringInput(dealId);
    // Fails today: calculatedTCV is inlined as productRevenue + servicesRevenue
    // (1,200,000), dropping the x3 term multiplier that calculateFlatTCV applies.
    expect(input?.calculatedTCV).toBe(3_200_000);
  });
});

describe("historicalContext — winRateByProfile", () => {
  const testPricingModel = `Test Profile ${Date.now()}`;
  const memoryDealIds: string[] = [];

  afterAll(async () => {
    for (const id of memoryDealIds) {
      await db.delete(dealMemory).where(eq(dealMemory.dealId, id));
    }
  });

  it("historicalContext populates winRateByProfile keyed by pricing model", async () => {
    // Seed a deterministic 2-won / 1-lost mix under a synthetic pricing model
    // name so the computed ratio is exact and unaffected by pre-existing seed
    // rows under real pricing model names (e.g. "Annual Subscription").
    const rows = [
      { outcome: "Won" as const },
      { outcome: "Won" as const },
      { outcome: "Lost" as const },
    ];
    for (const row of rows) {
      const id = randomUUID();
      memoryDealIds.push(id);
      await db.insert(dealMemory).values({
        dealId: id,
        accountName: "Win Rate Test Acct",
        dealName: "Win Rate Test Deal",
        outcome: row.outcome,
        finalTcv: "100000.00",
        pricingModel: testPricingModel,
      });
    }

    const ctx = await historicalContext();
    expect(ctx.winRateByProfile).toBeDefined();
    expect(ctx.winRateByProfile?.[testPricingModel]).toBeCloseTo(2 / 3);
  });

  it("buildScoringInput's profileKey matches a key winRateByProfile can resolve", async () => {
    const dealId = await createDeal();
    const input = await buildScoringInput(dealId);
    const ctx = await historicalContext();
    // profileKey must be exactly the pricing model name — no stage prefix.
    expect(input?.profileKey).not.toContain("|");
    expect(ctx.winRateByProfile).toBeDefined();
  });
});

describe("computeDealScore — stageBenchmarkDays / confidence", () => {
  const benchmarkStageName = "Discovery";

  afterAll(async () => {
    await db.delete(velocityBenchmarks).where(eq(velocityBenchmarks.stageName, benchmarkStageName));
  });

  it("confidence reaches HIGH when daysToClose, avgWonTCV, and stageBenchmarkDays are all available", async () => {
    // This dev DB's velocity_benchmarks rollup is empty (nothing in the repo
    // populates it yet — it's a maintained rollup fed by a job outside this
    // task's scope), so seed the one row computeDealScore needs to resolve a
    // non-null stageBenchmarkDays for a Discovery-stage deal.
    await db
      .insert(velocityBenchmarks)
      .values({ stageName: benchmarkStageName, medianDays: "45.00", sampleSize: 10 });

    const dealId = await createDeal(); // Discovery stage per the existing helper
    // Give it an expected close date so daysToClose is non-null:
    await db.update(enterpriseDeals).set({ expectedCloseDate: "2026-12-31" }).where(eq(enterpriseDeals.id, dealId));
    const score = await computeDealScore(dealId);
    expect(score?.confidence).toBe("HIGH");
  });
});
