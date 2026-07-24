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
  dealCompetitors,
  competitors,
} from "@workspace/db";
import { getMeddpiccComputedAnswers } from "./meddpicc-signals";

const createdDealIds: string[] = [];
const createdDealMemoryIds: string[] = [];
const createdCompetitorIds: number[] = [];

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
  if (createdCompetitorIds.length > 0) {
    await db.delete(competitors).where(inArray(competitors.id, createdCompetitorIds));
  }
  await pool.end();
});

describe("getMeddpiccComputedAnswers — Economic Buyer (Q2)", () => {
  it("scores 0 when neither signal is present", async () => {
    const dealId = await createDeal(1, `Acct ${Date.now()}-a`);
    const answers = await getMeddpiccComputedAnswers(dealId, "irrelevant");
    expect(answers.find((a) => a.questionOrder === 2)?.score).toBe(0);
  });

  it("scores 2 when only the Economic Buyer stakeholder is tagged", async () => {
    const dealId = await createDeal(1, `Acct ${Date.now()}-b`);
    await db.insert(stakeholders).values({
      dealId,
      name: "Big Boss",
      roleType: "Economic Buyer",
      influenceLevel: "High",
      sentiment: "Neutral",
    });
    const answers = await getMeddpiccComputedAnswers(dealId, "irrelevant");
    expect(answers.find((a) => a.questionOrder === 2)?.score).toBe(2);
  });

  it("scores 2 when only the executive-agreement gate is completed", async () => {
    const dealId = await createDeal(1, `Acct ${Date.now()}-c`);
    await db.insert(dealTechnicalGates).values({ dealId, gateCode: "G1_EXECUTIVE_AGREED", isCompleted: true });
    const answers = await getMeddpiccComputedAnswers(dealId, "irrelevant");
    expect(answers.find((a) => a.questionOrder === 2)?.score).toBe(2);
  });

  it("scores 3 when both signals are present", async () => {
    const dealId = await createDeal(1, `Acct ${Date.now()}-d`);
    await db.insert(stakeholders).values({
      dealId,
      name: "Big Boss",
      roleType: "Economic Buyer",
      influenceLevel: "High",
      sentiment: "Neutral",
    });
    await db.insert(dealTechnicalGates).values({ dealId, gateCode: "G1_EXECUTIVE_AGREED", isCompleted: true });
    const answers = await getMeddpiccComputedAnswers(dealId, "irrelevant");
    expect(answers.find((a) => a.questionOrder === 2)?.score).toBe(3);
  });

  it("is not fooled by an unrelated completed gate", async () => {
    const dealId = await createDeal(1, `Acct ${Date.now()}-e`);
    await db.insert(dealTechnicalGates).values({ dealId, gateCode: "G1_CRITERIA_LOCKED", isCompleted: true });
    const answers = await getMeddpiccComputedAnswers(dealId, "irrelevant");
    expect(answers.find((a) => a.questionOrder === 2)?.score).toBe(0);
  });
});

describe("getMeddpiccComputedAnswers — Decision Criteria (Q3)", () => {
  it("scores 0 when G1_CRITERIA_LOCKED is not completed", async () => {
    const dealId = await createDeal(1, `Acct ${Date.now()}-f`);
    const answers = await getMeddpiccComputedAnswers(dealId, "irrelevant");
    expect(answers.find((a) => a.questionOrder === 3)?.score).toBe(0);
  });

  it("scores 3 when G1_CRITERIA_LOCKED is completed", async () => {
    const dealId = await createDeal(1, `Acct ${Date.now()}-g`);
    await db.insert(dealTechnicalGates).values({ dealId, gateCode: "G1_CRITERIA_LOCKED", isCompleted: true });
    const answers = await getMeddpiccComputedAnswers(dealId, "irrelevant");
    expect(answers.find((a) => a.questionOrder === 3)?.score).toBe(3);
  });
});

describe("getMeddpiccComputedAnswers — Decision Process (Q4)", () => {
  it("scores 0 with no decision-maker stakeholders", async () => {
    const dealId = await createDeal(1, `Acct ${Date.now()}-h`);
    const answers = await getMeddpiccComputedAnswers(dealId, "irrelevant");
    expect(answers.find((a) => a.questionOrder === 4)?.score).toBe(0);
  });

  it("scores 2 with exactly one decision-maker stakeholder", async () => {
    const dealId = await createDeal(1, `Acct ${Date.now()}-i`);
    await db.insert(stakeholders).values({
      dealId,
      name: "Decider One",
      roleType: "Influencer",
      influenceLevel: "High",
      isDecisionMaker: true,
    });
    const answers = await getMeddpiccComputedAnswers(dealId, "irrelevant");
    expect(answers.find((a) => a.questionOrder === 4)?.score).toBe(2);
  });

  it("scores 3 with two or more decision-maker stakeholders", async () => {
    const dealId = await createDeal(1, `Acct ${Date.now()}-j`);
    await db.insert(stakeholders).values([
      { dealId, name: "Decider One", roleType: "Influencer", influenceLevel: "High", isDecisionMaker: true },
      { dealId, name: "Decider Two", roleType: "Influencer", influenceLevel: "High", isDecisionMaker: true },
    ]);
    const answers = await getMeddpiccComputedAnswers(dealId, "irrelevant");
    expect(answers.find((a) => a.questionOrder === 4)?.score).toBe(3);
  });
});

describe("getMeddpiccComputedAnswers — Paper Process (Q5)", () => {
  it("scores 0 with no playbook assignment and no compliance gate", async () => {
    const dealId = await createDeal(1, `Acct ${Date.now()}-k`);
    const answers = await getMeddpiccComputedAnswers(dealId, "irrelevant");
    expect(answers.find((a) => a.questionOrder === 5)?.score).toBe(0);
  });

  it("scores 1 when only the compliance gate is completed", async () => {
    const dealId = await createDeal(1, `Acct ${Date.now()}-l`);
    await db.insert(dealTechnicalGates).values({ dealId, gateCode: "G4_COMPLIANCE_VALIDATED", isCompleted: true });
    const answers = await getMeddpiccComputedAnswers(dealId, "irrelevant");
    expect(answers.find((a) => a.questionOrder === 5)?.score).toBe(1);
  });
});

describe("getMeddpiccComputedAnswers — Identify Pain (Q6)", () => {
  it("scores 3 when the account has a prior Won deal", async () => {
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
    const answers = await getMeddpiccComputedAnswers(dealId, accountName);
    expect(answers.find((a) => a.questionOrder === 6)?.score).toBe(3);
  });

  it("scores 2 (never below Neutral) when the account has no prior Won deal", async () => {
    const accountName = `Net New Acct ${Date.now()}`;
    const dealId = await createDeal(1, accountName);
    const answers = await getMeddpiccComputedAnswers(dealId, accountName);
    expect(answers.find((a) => a.questionOrder === 6)?.score).toBe(2);
  });
});

describe("getMeddpiccComputedAnswers — Champion (Q7)", () => {
  it("scores 1 (Strong No, not Unknown) when no signal is present", async () => {
    const dealId = await createDeal(1, `Acct ${Date.now()}-m`);
    const answers = await getMeddpiccComputedAnswers(dealId, "irrelevant");
    expect(answers.find((a) => a.questionOrder === 7)?.score).toBe(1);
  });

  it("scores 2 when only a Champion stakeholder is tagged", async () => {
    const dealId = await createDeal(1, `Acct ${Date.now()}-n`);
    await db.insert(stakeholders).values({
      dealId,
      name: "Jane Doe",
      roleType: "Champion",
      influenceLevel: "High",
      sentiment: "Champion",
    });
    const answers = await getMeddpiccComputedAnswers(dealId, "irrelevant");
    expect(answers.find((a) => a.questionOrder === 7)?.score).toBe(2);
  });

  it("scores 3 when both a Champion stakeholder and the defensibility gate are present", async () => {
    const dealId = await createDeal(1, `Acct ${Date.now()}-o`);
    await db.insert(stakeholders).values({
      dealId,
      name: "Jane Doe",
      roleType: "Champion",
      influenceLevel: "High",
      sentiment: "Champion",
    });
    await db.insert(dealTechnicalGates).values({ dealId, gateCode: "G2_CHAMPION_DEFENSIBLE", isCompleted: true });
    const answers = await getMeddpiccComputedAnswers(dealId, "irrelevant");
    expect(answers.find((a) => a.questionOrder === 7)?.score).toBe(3);
  });
});

describe("getMeddpiccComputedAnswers — Competition (Q8)", () => {
  it("scores 0 when no competitor is tracked", async () => {
    const dealId = await createDeal(1, `Acct ${Date.now()}-p`);
    const answers = await getMeddpiccComputedAnswers(dealId, "irrelevant");
    expect(answers.find((a) => a.questionOrder === 8)?.score).toBe(0);
  });

  it("scores 0 when a competitor is tracked but has no historical win-rate data", async () => {
    const dealId = await createDeal(1, `Acct ${Date.now()}-q`);
    const [competitor] = await db
      .insert(competitors)
      .values({ name: `NoHistory Competitor ${Date.now()}` })
      .returning({ id: competitors.id });
    createdCompetitorIds.push(competitor.id);
    await db.insert(dealCompetitors).values({ dealId, competitorId: competitor.id });
    const answers = await getMeddpiccComputedAnswers(dealId, "irrelevant");
    expect(answers.find((a) => a.questionOrder === 8)?.score).toBe(0);
  });
});
