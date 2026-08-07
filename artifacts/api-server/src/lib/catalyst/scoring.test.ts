import { describe, it, expect, beforeAll, beforeEach } from "vitest";
import crypto from "node:crypto";
import {
  initCatalystApp,
  createEnterpriseDealsRepo,
  createDealTechnicalGatesRepo,
} from "@workspace/db/catalyst";
import {
  installCatalystFake,
  seedStandardLookups,
  STAGES,
  PRICING_MODELS,
  PRICING_MODEL_ID,
  SERVICES_TIER_ID,
  type CatalystTestStore,
} from "../../test-support/catalyst-test-app";
import { computeDealScore, scoreDeal, buildScoringInput, historicalContext } from "./scoring";
import { cache } from "../cache";

// Ported from the Drizzle `lib/scoring.test.ts`. The predictive score is what
// the roster trend arrow and the /analytics score endpoints are built on, and
// the Catalyst implementation had no coverage of its own.

let store: CatalystTestStore;
let seq = 0;

const app = () => initCatalystApp({ headers: {} });

beforeAll(() => {
  ({ store } = installCatalystFake());
});

beforeEach(() => {
  store.reset();
  seedStandardLookups(store);
  cache.clear();
});

async function createDeal(overrides: Record<string, unknown> = {}): Promise<string> {
  const deal = await createEnterpriseDealsRepo(app()).create({
    dealName: `Scoring Test ${++seq}`,
    accountName: `Scoring Acct ${seq}`,
    accountManager: "AM",
    technicalLead: "TL",
    salesStageId: STAGES.Discovery,
    pricingModelId: PRICING_MODEL_ID,
    servicesTierId: SERVICES_TIER_ID,
    productRevenue: "1000.00",
    servicesRevenue: "0",
    contractTermYears: 1,
    dealCurrency: "USD",
    ...overrides,
  });
  return deal.id;
}

function scoreRowCount(dealId: string): number {
  return store.rows("v2_deal_scores").filter((r) => r["deal_id"] === dealId).length;
}

function completeGate(dealId: string, gateCode: string): Promise<void> {
  return createDealTechnicalGatesRepo(app()).upsert(dealId, gateCode, {
    isCompleted: true,
    completedAt: new Date(),
    completedBy: "test",
    notes: null,
  });
}

describe("computeDealScore vs scoreDeal", () => {
  it("computeDealScore returns a score without appending to deal_scores", async () => {
    const dealId = await createDeal();
    expect(scoreRowCount(dealId)).toBe(0);

    const result = await computeDealScore(app(), dealId);
    expect(result).not.toBeNull();
    expect(typeof result?.score).toBe("number");
    expect(scoreRowCount(dealId)).toBe(0);
  });

  it("scoreDeal computes AND appends exactly one deal_scores row", async () => {
    const dealId = await createDeal();
    expect(scoreRowCount(dealId)).toBe(0);

    const result = await scoreDeal(app(), dealId);
    expect(result).not.toBeNull();
    expect(scoreRowCount(dealId)).toBe(1);

    // History is append-only: a second call adds a second row, not an upsert.
    await scoreDeal(app(), dealId);
    expect(scoreRowCount(dealId)).toBe(2);
  });

  it("both return null for a deal that doesn't exist, without inserting anything", async () => {
    const bogusId = "00000000-0000-0000-0000-000000000000";
    expect(await computeDealScore(app(), bogusId)).toBeNull();
    expect(await scoreDeal(app(), bogusId)).toBeNull();
    expect(store.rows("v2_deal_scores")).toHaveLength(0);
  });

  it("computeDealScore and scoreDeal agree on the score/confidence for the same deal state", async () => {
    const dealId = await createDeal();
    const a = await computeDealScore(app(), dealId);
    const b = await scoreDeal(app(), dealId);
    expect(b?.score).toBe(a?.score);
    expect(b?.confidence).toBe(a?.confidence);
  });
});

describe("buildScoringInput — gate code matching", () => {
  it("G1_CRITERIA_LOCKED alone does not satisfy executiveAgreed", async () => {
    const dealId = await createDeal();
    await completeGate(dealId, "G1_CRITERIA_LOCKED");
    const input = await buildScoringInput(app(), dealId);
    expect(input?.executiveAgreed).toBe(false);
  });

  it("G1_EXECUTIVE_AGREED satisfies executiveAgreed", async () => {
    const dealId = await createDeal();
    await completeGate(dealId, "G1_CRITERIA_LOCKED");
    await completeGate(dealId, "G1_EXECUTIVE_AGREED");
    const input = await buildScoringInput(app(), dealId);
    expect(input?.executiveAgreed).toBe(true);
  });

  it("an INCOMPLETE G1_EXECUTIVE_AGREED row does not satisfy executiveAgreed", async () => {
    // Booleans round-trip through the Data Store as strings, so "false" is
    // truthy unless the guard parses it — a failure mode with no Drizzle analogue.
    const dealId = await createDeal();
    await createDealTechnicalGatesRepo(app()).upsert(dealId, "G1_EXECUTIVE_AGREED", {
      isCompleted: false,
      completedAt: null,
      completedBy: null,
      notes: null,
    });
    const input = await buildScoringInput(app(), dealId);
    expect(input?.executiveAgreed).toBe(false);
  });
});

describe("buildScoringInput — TCV calculation", () => {
  it("calculatedTCV honors the Multi-Year Committed term multiplier", async () => {
    const dealId = await createDeal({
      pricingModelId: PRICING_MODELS["Multi-Year Committed"],
      productRevenue: "1000000.00",
      servicesRevenue: "200000.00",
      contractTermYears: 3,
    });
    const input = await buildScoringInput(app(), dealId);
    // 1,000,000 x 3 + 200,000. A flat product+services sum would give 1,200,000
    // and silently under-report every multi-year deal.
    expect(input?.calculatedTCV).toBe(3_200_000);
  });

  it("a non-multi-year model stays a flat sum regardless of contractTermYears", async () => {
    const dealId = await createDeal({
      pricingModelId: PRICING_MODELS["Annual Subscription"],
      productRevenue: "1000000.00",
      servicesRevenue: "200000.00",
      contractTermYears: 3,
    });
    const input = await buildScoringInput(app(), dealId);
    expect(input?.calculatedTCV).toBe(1_200_000);
  });
});

describe("historicalContext — winRateByProfile", () => {
  const testPricingModel = "Test Profile";

  function seedMemory(outcome: string, pricingModel: string): void {
    store.seedRaw("v2_deal_memory", [
      {
        id: crypto.randomUUID(),
        deal_id: crypto.randomUUID(),
        account_name: "Win Rate Test Acct",
        deal_name: "Win Rate Test Deal",
        outcome,
        final_tcv: "100000.00",
        pricing_model: pricingModel,
      },
    ]);
  }

  it("populates winRateByProfile keyed by pricing model", async () => {
    // A deterministic 2-won / 1-lost mix, so the ratio is exact. On the shared
    // dev database the original had to use a synthetic model name to avoid
    // colliding with seed rows; the in-memory store starts empty, so it doesn't.
    seedMemory("Won", testPricingModel);
    seedMemory("Won", testPricingModel);
    seedMemory("Lost", testPricingModel);

    const ctx = await historicalContext(app());
    expect(ctx.winRateByProfile).toBeDefined();
    expect(ctx.winRateByProfile?.[testPricingModel]).toBeCloseTo(2 / 3);
  });

  it("keeps profiles separate — one model's losses do not drag another's rate down", async () => {
    seedMemory("Won", "Model A");
    seedMemory("Lost", "Model B");
    seedMemory("Lost", "Model B");

    const ctx = await historicalContext(app());
    expect(ctx.winRateByProfile?.["Model A"]).toBeCloseTo(1);
    expect(ctx.winRateByProfile?.["Model B"]).toBeCloseTo(0);
  });

  it("buildScoringInput's profileKey matches a key winRateByProfile can resolve", async () => {
    const dealId = await createDeal();
    const input = await buildScoringInput(app(), dealId);
    const ctx = await historicalContext(app());
    // profileKey must be exactly the pricing model name — no stage prefix.
    expect(input?.profileKey).not.toContain("|");
    expect(input?.profileKey).toBe("Annual Subscription");
    expect(ctx.winRateByProfile).toBeDefined();
  });
});

describe("computeDealScore — stageBenchmarkDays / confidence", () => {
  it("confidence reaches HIGH when daysToClose, avgWonTCV, and stageBenchmarkDays are all available", async () => {
    store.seedRaw("v2_velocity_benchmarks", [
      { stage_name: "Discovery", median_days: "45.00", sample_size: "10" },
    ]);
    // avgWonTCV needs at least one Won deal in memory to resolve.
    store.seedRaw("v2_deal_memory", [
      {
        id: crypto.randomUUID(),
        deal_id: crypto.randomUUID(),
        account_name: "Prior Win",
        deal_name: "Prior Win Deal",
        outcome: "Won",
        final_tcv: "500000.00",
        pricing_model: "Annual Subscription",
      },
    ]);

    const dealId = await createDeal({ expectedCloseDate: "2026-12-31" });
    const score = await computeDealScore(app(), dealId);
    expect(score?.confidence).toBe("HIGH");
  });

  it("confidence is not HIGH when the stage has no velocity benchmark", async () => {
    // The counterweight the original lacked: without it, a function that
    // hard-coded "HIGH" would have passed.
    const dealId = await createDeal({ expectedCloseDate: "2026-12-31" });
    const score = await computeDealScore(app(), dealId);
    expect(score?.confidence).not.toBe("HIGH");
  });
});
