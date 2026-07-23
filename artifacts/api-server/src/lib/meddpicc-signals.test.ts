import { describe, it, expect, afterAll } from "vitest";
import { inArray } from "drizzle-orm";
import {
  db,
  pool,
  enterpriseDeals,
  pricingModels,
  servicesTiers,
  stakeholders,
  dealMemory,
  dealTechnicalGates,
} from "@workspace/db";
import { getMeddpiccSuggestions } from "./meddpicc-signals";

const createdDealIds: string[] = [];
const createdDealMemoryIds: string[] = [];

async function createDeal(stageId: number, accountName: string): Promise<string> {
  const [pricing] = await db.select().from(pricingModels).limit(1);
  const [tier] = await db.select().from(servicesTiers).limit(1);
  const [row] = await db
    .insert(enterpriseDeals)
    .values({
      dealName: `Signals Test ${Date.now()}`,
      accountName,
      accountManager: "AM",
      technicalLead: "TL",
      salesStageId: stageId,
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
  if (createdDealMemoryIds.length > 0) {
    await db.delete(dealMemory).where(inArray(dealMemory.id, createdDealMemoryIds));
  }
  if (createdDealIds.length > 0) {
    await db.delete(enterpriseDeals).where(inArray(enterpriseDeals.id, createdDealIds));
  }
  await pool.end();
});

describe("getMeddpiccSuggestions", () => {
  it("returns no Champion or Economic Buyer suggestion for a deal with no stakeholders", async () => {
    const dealId = await createDeal(1, `Acct ${Date.now()}-a`);
    const suggestions = await getMeddpiccSuggestions(dealId);
    expect(suggestions.find((s) => s.questionOrder === 34)?.suggestedScore).toBe(1); // no champion → 1
    expect(suggestions.find((s) => s.questionOrder === 6)?.suggestedScore).toBe(0); // no EB → 0
  });

  it("suggests Strong Yes for Champion (Q34) once a Champion stakeholder exists", async () => {
    const dealId = await createDeal(1, `Acct ${Date.now()}-b`);
    await db.insert(stakeholders).values({
      dealId,
      name: "Jane Doe",
      roleType: "Champion",
      influenceLevel: "High",
      sentiment: "Champion",
    });
    const suggestions = await getMeddpiccSuggestions(dealId);
    expect(suggestions.find((s) => s.questionOrder === 34)?.suggestedScore).toBe(3);
  });

  it("suggests Strong Yes for Economic Buyer known (Q6) once an Economic Buyer stakeholder exists", async () => {
    const dealId = await createDeal(1, `Acct ${Date.now()}-c`);
    await db.insert(stakeholders).values({
      dealId,
      name: "Big Boss",
      roleType: "Economic Buyer",
      influenceLevel: "High",
      sentiment: "Neutral",
    });
    const suggestions = await getMeddpiccSuggestions(dealId);
    expect(suggestions.find((s) => s.questionOrder === 6)?.suggestedScore).toBe(3);
  });

  it("does not suggest budget approved (Q9) when only the unrelated G1_CRITERIA_LOCKED gate is completed", async () => {
    const dealId = await createDeal(1, `Acct ${Date.now()}-f`);
    await db.insert(dealTechnicalGates).values({
      dealId,
      gateCode: "G1_CRITERIA_LOCKED",
      isCompleted: true,
    });
    const suggestions = await getMeddpiccSuggestions(dealId);
    expect(suggestions.find((s) => s.questionOrder === 9)?.suggestedScore).toBe(0);
  });

  it("suggests 3 for budget approved (Q9) when G1_EXECUTIVE_AGREED gate is completed", async () => {
    const dealId = await createDeal(1, `Acct ${Date.now()}-g`);
    await db.insert(dealTechnicalGates).values({
      dealId,
      gateCode: "G1_EXECUTIVE_AGREED",
      isCompleted: true,
    });
    const suggestions = await getMeddpiccSuggestions(dealId);
    expect(suggestions.find((s) => s.questionOrder === 9)?.suggestedScore).toBe(3);
  });

  it("suggests 3 for existing-customer (Q24) when the account has a prior Won deal", async () => {
    const accountName = `Repeat Acct ${Date.now()}`;
    const dealId = await createDeal(1, accountName);
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
    const suggestions = await getMeddpiccSuggestions(dealId);
    expect(suggestions.find((s) => s.questionOrder === 24)?.suggestedScore).toBe(3);
  });

  it("suggests 2 for existing-customer (Q24) when the account has no prior Won deal", async () => {
    const dealId = await createDeal(1, `Net New Acct ${Date.now()}`);
    const suggestions = await getMeddpiccSuggestions(dealId);
    expect(suggestions.find((s) => s.questionOrder === 24)?.suggestedScore).toBe(2);
  });

  it("returns no Paper Process suggestions when the deal has no Procurement/Legal playbook assignment", async () => {
    const dealId = await createDeal(1, `Acct ${Date.now()}-d`);
    const suggestions = await getMeddpiccSuggestions(dealId);
    expect(suggestions.find((s) => s.questionOrder === 21)).toBeUndefined();
    expect(suggestions.find((s) => s.questionOrder === 22)).toBeUndefined();
  });

  it("returns no Competition suggestion when the deal has no tracked competitors", async () => {
    const dealId = await createDeal(1, `Acct ${Date.now()}-e`);
    const suggestions = await getMeddpiccSuggestions(dealId);
    expect(suggestions.find((s) => s.questionOrder === 39)).toBeUndefined();
  });
});
