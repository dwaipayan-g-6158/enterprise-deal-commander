import { describe, it, expect, beforeAll, beforeEach } from "vitest";
import crypto from "node:crypto";
import {
  initCatalystApp,
  createEnterpriseDealsRepo,
  createStakeholdersRepo,
  createDealTechnicalGatesRepo,
  createDealCompetitorsRepo,
  createCompetitorsRepo,
} from "@workspace/db/catalyst";
import {
  installCatalystFake,
  seedStandardLookups,
  STAGES,
  PRICING_MODEL_ID,
  SERVICES_TIER_ID,
  type CatalystTestStore,
} from "../../test-support/catalyst-test-app";
import { getMeddpiccComputedAnswers } from "./meddpicc-signals";
import { cache } from "../cache";

// Ported from the old Drizzle `lib/meddpicc-signals.test.ts`, which exercised an
// implementation that no longer exists. The rules being pinned are unchanged —
// the same seven questions, the same score thresholds — but they now run against
// the Data Store implementation that actually serves
// GET /v1/deals/:dealId/meddpicc, and against the in-memory fake rather than a
// shared dev database, so the fixtures are isolated per test.

let store: CatalystTestStore;
let seq = 0;

const app = () => initCatalystApp({ headers: {} });

beforeAll(() => {
  store = installCatalystFake().store;
});

beforeEach(() => {
  store.reset();
  seedStandardLookups(store);
  // `competitorWinRates` memoizes under the `summary:` cache tier; without this
  // a win-rate tally computed in one test leaks into the next.
  cache.clear();
});

async function createDeal(accountName?: string): Promise<{ id: string; accountName: string }> {
  const acct = accountName ?? `Signals Acct ${++seq}`;
  const deal = await createEnterpriseDealsRepo(app()).create({
    dealName: `Signals Test ${seq}`,
    accountName: acct,
    accountManager: "AM",
    technicalLead: "TL",
    salesStageId: STAGES.Discovery,
    pricingModelId: PRICING_MODEL_ID,
    servicesTierId: SERVICES_TIER_ID,
    productRevenue: "100000",
    servicesRevenue: "0",
    contractTermYears: 1,
    dealCurrency: "USD",
  });
  return { id: deal.id, accountName: acct };
}

function completeGate(dealId: string, gateCode: string): Promise<void> {
  return createDealTechnicalGatesRepo(app()).upsert(dealId, gateCode, {
    isCompleted: true,
    completedAt: new Date(),
    completedBy: "test",
    notes: null,
  });
}

async function scoreFor(dealId: string, accountName: string, questionOrder: number): Promise<number | undefined> {
  const answers = await getMeddpiccComputedAnswers(app(), dealId, accountName);
  return answers.find((a) => a.questionOrder === questionOrder)?.score;
}

describe("getMeddpiccComputedAnswers — Economic Buyer (Q2)", () => {
  it("scores 0 when neither signal is present", async () => {
    const { id } = await createDeal();
    expect(await scoreFor(id, "irrelevant", 2)).toBe(0);
  });

  it("scores 2 when only the Economic Buyer stakeholder is tagged", async () => {
    const { id } = await createDeal();
    await createStakeholdersRepo(app()).create(id, {
      name: "Big Boss",
      roleType: "Economic Buyer",
      influenceLevel: "High",
      sentiment: "Neutral",
    });
    expect(await scoreFor(id, "irrelevant", 2)).toBe(2);
  });

  it("scores 2 when only the executive-agreement gate is completed", async () => {
    const { id } = await createDeal();
    await completeGate(id, "G1_EXECUTIVE_AGREED");
    expect(await scoreFor(id, "irrelevant", 2)).toBe(2);
  });

  it("scores 3 when both signals are present", async () => {
    const { id } = await createDeal();
    await createStakeholdersRepo(app()).create(id, {
      name: "Big Boss",
      roleType: "Economic Buyer",
      influenceLevel: "High",
      sentiment: "Neutral",
    });
    await completeGate(id, "G1_EXECUTIVE_AGREED");
    expect(await scoreFor(id, "irrelevant", 2)).toBe(3);
  });

  it("is not fooled by an unrelated completed gate", async () => {
    const { id } = await createDeal();
    await completeGate(id, "G1_CRITERIA_LOCKED");
    expect(await scoreFor(id, "irrelevant", 2)).toBe(0);
  });
});

describe("getMeddpiccComputedAnswers — Decision Criteria (Q3)", () => {
  it("scores 0 when G1_CRITERIA_LOCKED is not completed", async () => {
    const { id } = await createDeal();
    expect(await scoreFor(id, "irrelevant", 3)).toBe(0);
  });

  it("scores 3 when G1_CRITERIA_LOCKED is completed", async () => {
    const { id } = await createDeal();
    await completeGate(id, "G1_CRITERIA_LOCKED");
    expect(await scoreFor(id, "irrelevant", 3)).toBe(3);
  });

  it("does not count the gate when the row exists but is NOT completed", async () => {
    // The Data Store stores booleans as strings, so an `is_completed` of "false"
    // is still truthy if a guard forgets to parse it — a failure mode the
    // Drizzle original could not have had.
    const { id } = await createDeal();
    await createDealTechnicalGatesRepo(app()).upsert(id, "G1_CRITERIA_LOCKED", {
      isCompleted: false,
      completedAt: null,
      completedBy: null,
      notes: null,
    });
    expect(await scoreFor(id, "irrelevant", 3)).toBe(0);
  });
});

describe("getMeddpiccComputedAnswers — Decision Process (Q4)", () => {
  it("scores 0 with no decision-maker stakeholders", async () => {
    const { id } = await createDeal();
    expect(await scoreFor(id, "irrelevant", 4)).toBe(0);
  });

  it("scores 2 with exactly one decision-maker stakeholder", async () => {
    const { id } = await createDeal();
    await createStakeholdersRepo(app()).create(id, {
      name: "Decider One",
      roleType: "Influencer",
      influenceLevel: "High",
      sentiment: "Neutral",
      isDecisionMaker: true,
    });
    expect(await scoreFor(id, "irrelevant", 4)).toBe(2);
  });

  it("scores 3 with two or more decision-maker stakeholders", async () => {
    const { id } = await createDeal();
    const repo = createStakeholdersRepo(app());
    await repo.create(id, {
      name: "Decider One",
      roleType: "Influencer",
      influenceLevel: "High",
      sentiment: "Neutral",
      isDecisionMaker: true,
    });
    await repo.create(id, {
      name: "Decider Two",
      roleType: "Influencer",
      influenceLevel: "High",
      sentiment: "Neutral",
      isDecisionMaker: true,
    });
    expect(await scoreFor(id, "irrelevant", 4)).toBe(3);
  });

  it("ignores stakeholders on OTHER deals", async () => {
    const { id } = await createDeal();
    const other = await createDeal();
    await createStakeholdersRepo(app()).create(other.id, {
      name: "Someone Else's Decider",
      roleType: "Influencer",
      influenceLevel: "High",
      sentiment: "Neutral",
      isDecisionMaker: true,
    });
    expect(await scoreFor(id, "irrelevant", 4)).toBe(0);
  });
});

describe("getMeddpiccComputedAnswers — Paper Process (Q5)", () => {
  it("scores 0 with no playbook assignment and no compliance gate", async () => {
    const { id } = await createDeal();
    expect(await scoreFor(id, "irrelevant", 5)).toBe(0);
  });

  it("scores 1 when only the compliance gate is completed", async () => {
    const { id } = await createDeal();
    await completeGate(id, "G4_COMPLIANCE_VALIDATED");
    expect(await scoreFor(id, "irrelevant", 5)).toBe(1);
  });
});

describe("getMeddpiccComputedAnswers — Identify Pain (Q6)", () => {
  function seedMemory(accountName: string, outcome: string): void {
    store.seedRaw("v2_deal_memory", [
      {
        id: crypto.randomUUID(),
        deal_id: "00000000-0000-0000-0000-000000000000",
        account_name: accountName,
        deal_name: "Prior Deal",
        outcome,
      },
    ]);
  }

  it("scores 3 when the account has a prior Won deal", async () => {
    const { id, accountName } = await createDeal("Repeat Acct");
    seedMemory(accountName, "Won");
    expect(await scoreFor(id, accountName, 6)).toBe(3);
  });

  it("scores 2 (never below Neutral) when the account has no prior Won deal", async () => {
    const { id, accountName } = await createDeal("Net New Acct");
    expect(await scoreFor(id, accountName, 6)).toBe(2);
  });

  it("does not count a prior LOST deal as evidence of understood pain", async () => {
    const { id, accountName } = await createDeal("Lost Before Acct");
    seedMemory(accountName, "Lost");
    expect(await scoreFor(id, accountName, 6)).toBe(2);
  });

  it("does not credit a Won deal belonging to a DIFFERENT account", async () => {
    const { id, accountName } = await createDeal("Unrelated Acct");
    seedMemory("Some Other Company", "Won");
    expect(await scoreFor(id, accountName, 6)).toBe(2);
  });
});

describe("getMeddpiccComputedAnswers — Champion (Q7)", () => {
  it("scores 1 (Strong No, not Unknown) when no signal is present", async () => {
    const { id } = await createDeal();
    expect(await scoreFor(id, "irrelevant", 7)).toBe(1);
  });

  it("scores 2 when only a Champion stakeholder is tagged", async () => {
    const { id } = await createDeal();
    await createStakeholdersRepo(app()).create(id, {
      name: "Jane Doe",
      roleType: "Champion",
      influenceLevel: "High",
      sentiment: "Champion",
    });
    expect(await scoreFor(id, "irrelevant", 7)).toBe(2);
  });

  it("scores 3 when both a Champion stakeholder and the defensibility gate are present", async () => {
    const { id } = await createDeal();
    await createStakeholdersRepo(app()).create(id, {
      name: "Jane Doe",
      roleType: "Champion",
      influenceLevel: "High",
      sentiment: "Champion",
    });
    await completeGate(id, "G2_CHAMPION_DEFENSIBLE");
    expect(await scoreFor(id, "irrelevant", 7)).toBe(3);
  });

  it("keys off SENTIMENT, not roleType — a Champion-titled but neutral stakeholder does not count", async () => {
    const { id } = await createDeal();
    await createStakeholdersRepo(app()).create(id, {
      name: "In Name Only",
      roleType: "Champion",
      influenceLevel: "High",
      sentiment: "Neutral",
    });
    expect(await scoreFor(id, "irrelevant", 7)).toBe(1);
  });
});

describe("getMeddpiccComputedAnswers — Competition (Q8)", () => {
  it("scores 0 when no competitor is tracked", async () => {
    const { id } = await createDeal();
    expect(await scoreFor(id, "irrelevant", 8)).toBe(0);
  });

  it("scores 0 when a competitor is tracked but has no historical win-rate data", async () => {
    const { id } = await createDeal();
    const competitor = await createCompetitorsRepo(app()).create({ name: "NoHistory Competitor" });
    await createDealCompetitorsRepo(app()).createIfMissing(id, competitor.id);
    expect(await scoreFor(id, "irrelevant", 8)).toBe(0);
  });

  it("scores 3 against a competitor we have always beaten", async () => {
    // Not reachable in the Drizzle original's fixtures, which never seeded a
    // decided history — so the win-rate arm of Q8 went unexercised entirely.
    const { id } = await createDeal();
    const competitor = await createCompetitorsRepo(app()).create({ name: "Always Beaten" });
    const links = createDealCompetitorsRepo(app());
    // Historical evidence lives on OTHER deals' links; "Won Against" is a win.
    const priorA = await createDeal();
    const priorB = await createDeal();
    await links.create({ dealId: priorA.id, competitorId: competitor.id, status: "Won Against" });
    await links.create({ dealId: priorB.id, competitorId: competitor.id, status: "Won Against" });
    await links.createIfMissing(id, competitor.id);

    expect(await scoreFor(id, "irrelevant", 8)).toBe(3);
  });

  it("scores 0 against a competitor we have always lost to", async () => {
    const { id } = await createDeal();
    const competitor = await createCompetitorsRepo(app()).create({ name: "Always Loses Us" });
    const links = createDealCompetitorsRepo(app());
    const priorA = await createDeal();
    await links.create({ dealId: priorA.id, competitorId: competitor.id, status: "Lost To" });
    await links.createIfMissing(id, competitor.id);

    expect(await scoreFor(id, "irrelevant", 8)).toBe(0);
  });
});
