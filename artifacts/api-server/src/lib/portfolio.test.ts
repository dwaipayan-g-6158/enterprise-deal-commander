import { describe, it, expect, afterAll } from "vitest";
import { inArray } from "drizzle-orm";
import {
  db,
  pool,
  enterpriseDeals,
  pricingModels,
  servicesTiers,
  pipelineStages,
} from "@workspace/db";
import { computeSummary } from "./portfolio";

const createdDealIds: string[] = [];

async function createDeal(stageName: string, productRevenue: string): Promise<string> {
  const [pricing] = await db.select().from(pricingModels).limit(1);
  const [tier] = await db.select().from(servicesTiers).limit(1);
  const stages = await db.select().from(pipelineStages);
  const stage = stages.find((s) => s.stageName === stageName);
  if (!stage) throw new Error(`Seed data missing pipeline stage "${stageName}"`);
  const [row] = await db
    .insert(enterpriseDeals)
    .values({
      dealName: `Closed Exclusion Test ${stageName} ${Date.now()}`,
      accountName: `Closed Exclusion Acct ${stageName} ${Date.now()}`,
      accountManager: "AM",
      technicalLead: "TL",
      salesStageId: stage.id,
      pricingModelId: pricing.id,
      servicesTierId: tier.id,
      productRevenue,
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

describe("computeSummary — closed deals excluded from active portfolio", () => {
  it("does not count a Closed-Won or Closed-Lost deal in totals, TCV, or dealsByStage", async () => {
    const before = await computeSummary();

    // Distinctive, large revenue values so any regression that re-includes
    // these deals shows up unmistakably in totalTCV.
    await createDeal("Closed-Won", "123456700.00");
    await createDeal("Closed-Lost", "987654300.00");

    const after = await computeSummary();

    expect(after.totalDealsMonitored).toBe(before.totalDealsMonitored);
    expect(after.totalTCV).toBe(before.totalTCV);
    expect(after.dealsByStage["Closed-Won"]).toBeUndefined();
    expect(after.dealsByStage["Closed-Lost"]).toBeUndefined();
  });
});
