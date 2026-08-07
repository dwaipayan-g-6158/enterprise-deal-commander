import { describe, it, expect, beforeAll, beforeEach } from "vitest";
import crypto from "node:crypto";
import { initCatalystApp, createEnterpriseDealsRepo } from "@workspace/db/catalyst";
import { QUESTION_CATALOG } from "@workspace/engine";
import {
  installCatalystFake,
  seedStandardLookups,
  STAGES,
  PRICING_MODEL_ID,
  SERVICES_TIER_ID,
  type CatalystTestStore,
} from "../../test-support/catalyst-test-app";
import {
  computeMeddpiccScoreForDeal,
  getMeddpiccAssessment,
  upsertMeddpiccAnswer,
  getLatestMeddpiccScore,
} from "./meddpicc";
import { cache } from "../cache";

// Ported from the old Drizzle `lib/meddpicc.test.ts`. Same behaviours pinned —
// the merge rule (manual beats computed), the 0..3 validation boundary, the
// append-only score history, the stage bucket — but against the Data Store
// implementation that GET/PUT /v1/deals/:dealId/meddpicc actually calls.

let store: CatalystTestStore;
let seq = 0;

const app = () => initCatalystApp({ headers: {} });

/**
 * The MEDDPICC question catalog. `seedStandardLookups` does not include it —
 * in production it is seeded by lib/catalyst/seed.ts, which also reseeds it
 * whenever the engine's QUESTION_CATALOG changes. Derived from that same
 * catalog here so the two can never drift apart in this fixture.
 */
function seedQuestions(): void {
  store.seedRaw(
    "v2_meddpicc_questions",
    QUESTION_CATALOG.map((q) => ({
      id: crypto.randomUUID(),
      question_order: String(q.questionOrder),
      pillar: q.pillar,
      stage_tag: q.stageTag,
      question_text: q.questionText,
      help_text: q.helpText ?? null,
    })),
  );
}

beforeAll(() => {
  store = installCatalystFake().store;
});

beforeEach(() => {
  store.reset();
  seedStandardLookups(store);
  seedQuestions();
  cache.clear();
});

async function createDeal(stageName: keyof typeof STAGES = "Discovery"): Promise<string> {
  const deal = await createEnterpriseDealsRepo(app()).create({
    dealName: `Meddpicc Score Test ${++seq}`,
    accountName: `Meddpicc Acct ${seq}`,
    accountManager: "AM",
    technicalLead: "TL",
    salesStageId: STAGES[stageName],
    pricingModelId: PRICING_MODEL_ID,
    servicesTierId: SERVICES_TIER_ID,
    productRevenue: "100000",
    servicesRevenue: "0",
    contractTermYears: 1,
    dealCurrency: "USD",
  });
  return deal.id;
}

describe("computeMeddpiccScoreForDeal", () => {
  it("computes a score for a brand-new deal from live-computed answers alone and persists a snapshot row", async () => {
    const dealId = await createDeal();
    const result = await computeMeddpiccScoreForDeal(app(), dealId);
    expect(result).not.toBeNull();
    const latest = await getLatestMeddpiccScore(app(), dealId);
    expect(latest?.overallPct).toBe(result?.overallPct);
  });

  it("returns null for a non-existent deal", async () => {
    const result = await computeMeddpiccScoreForDeal(app(), "00000000-0000-0000-0000-000000000000");
    expect(result).toBeNull();
  });

  it("appends history rather than overwriting — the latest row wins", async () => {
    // deal_meddpicc_scores is append-only; the Record tab's MEDDPICC trend
    // depends on the older rows surviving a recompute.
    const dealId = await createDeal();
    const first = await computeMeddpiccScoreForDeal(app(), dealId);
    await upsertMeddpiccAnswer(app(), dealId, 1, { score: 3 }, "vitest");
    const second = await computeMeddpiccScoreForDeal(app(), dealId);

    expect(second?.overallScore).toBeGreaterThan(first?.overallScore ?? 0);
    const latest = await getLatestMeddpiccScore(app(), dealId);
    expect(latest?.overallPct).toBe(second?.overallPct);
    expect(store.rows("v2_deal_meddpicc_scores").filter((r) => r["deal_id"] === dealId)).toHaveLength(2);
  });
});

describe("getMeddpiccAssessment / upsertMeddpiccAnswer", () => {
  it("returns all 8 questions, each with a computed or unanswered source before any manual answer", async () => {
    const dealId = await createDeal();
    const assessment = await getMeddpiccAssessment(app(), dealId);
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
    const dealId = await createDeal();
    await upsertMeddpiccAnswer(app(), dealId, 1, { score: 3 }, "vitest");
    const assessment = await getMeddpiccAssessment(app(), dealId);
    const answer = assessment?.answers.find((a) => a.questionOrder === 1);
    expect(answer?.score).toBe(3);
    expect(answer?.source).toBe("manual");
    expect(assessment?.score.overallScore).toBeGreaterThanOrEqual(3);
  });

  it("a manual override on an auto-computed question wins over the live-computed value", async () => {
    const dealId = await createDeal();
    const before = await getMeddpiccAssessment(app(), dealId);
    const computed = before?.answers.find((a) => a.questionOrder === 3); // Decision Criteria, computed 0 with no gate
    expect(computed?.source).toBe("computed");
    expect(computed?.score).toBe(0);

    await upsertMeddpiccAnswer(app(), dealId, 3, { score: 3 }, "vitest");
    const after = await getMeddpiccAssessment(app(), dealId);
    const overridden = after?.answers.find((a) => a.questionOrder === 3);
    expect(overridden?.source).toBe("manual");
    expect(overridden?.score).toBe(3);
    expect(overridden?.reason).not.toBeNull(); // reason still shown even though overridden
  });

  it("upserting the same question twice updates rather than duplicates", async () => {
    const dealId = await createDeal();
    await upsertMeddpiccAnswer(app(), dealId, 1, { score: 1 }, "vitest");
    await upsertMeddpiccAnswer(app(), dealId, 1, { score: 3, note: "changed my mind" }, "vitest");
    const assessment = await getMeddpiccAssessment(app(), dealId);
    const answer = assessment?.answers.find((a) => a.questionOrder === 1);
    expect(answer?.score).toBe(3);
    expect(answer?.note).toBe("changed my mind");
    // The natural key must have deduped the row, not just the read.
    expect(store.rows("v2_deal_meddpicc_answers").filter((r) => r["deal_id"] === dealId)).toHaveLength(1);
  });

  it("throws for a non-existent dealId", async () => {
    await expect(
      upsertMeddpiccAnswer(app(), "00000000-0000-0000-0000-000000000000", 1, { score: 3 }, "vitest"),
    ).rejects.toThrow();
  });

  it("throws for a question order outside the catalog", async () => {
    const dealId = await createDeal();
    await expect(upsertMeddpiccAnswer(app(), dealId, 99, { score: 3 }, "vitest")).rejects.toThrow();
  });

  it("rejects a score above the valid range (99)", async () => {
    const dealId = await createDeal();
    await expect(upsertMeddpiccAnswer(app(), dealId, 1, { score: 99 }, "vitest")).rejects.toThrow();
  });

  it("rejects a score below the valid range (-1)", async () => {
    const dealId = await createDeal();
    await expect(upsertMeddpiccAnswer(app(), dealId, 1, { score: -1 }, "vitest")).rejects.toThrow();
  });

  it("rejects a non-integer score (1.5)", async () => {
    const dealId = await createDeal();
    await expect(upsertMeddpiccAnswer(app(), dealId, 1, { score: 1.5 }, "vitest")).rejects.toThrow();
  });

  it("accepts the boundary-valid score 0", async () => {
    const dealId = await createDeal();
    await upsertMeddpiccAnswer(app(), dealId, 1, { score: 0 }, "vitest");
    const assessment = await getMeddpiccAssessment(app(), dealId);
    expect(assessment?.answers.find((a) => a.questionOrder === 1)?.score).toBe(0);
  });

  it("accepts the boundary-valid score 3", async () => {
    const dealId = await createDeal();
    await upsertMeddpiccAnswer(app(), dealId, 1, { score: 3 }, "vitest");
    const assessment = await getMeddpiccAssessment(app(), dealId);
    expect(assessment?.answers.find((a) => a.questionOrder === 1)?.score).toBe(3);
  });

  it("a manual answer of 0 is still 'manual', not confused with unanswered", async () => {
    // Score 0 is falsy; a `if (score)` guard anywhere on this path would silently
    // downgrade a deliberate "Strong No" back to "unanswered".
    const dealId = await createDeal();
    await upsertMeddpiccAnswer(app(), dealId, 1, { score: 0 }, "vitest");
    const assessment = await getMeddpiccAssessment(app(), dealId);
    const answer = assessment?.answers.find((a) => a.questionOrder === 1);
    expect(answer?.source).toBe("manual");
    expect(answer?.score).toBe(0);
  });
});

describe("stage bucket wiring", () => {
  it("uses the Qualification bucket (Q-tagged questions only) for a Discovery-stage deal", async () => {
    const dealId = await createDeal("Discovery");
    // Q-tagged questions: Metrics(1), DecisionCriteria(3), DecisionProcess(4), IdentifyPain(6), Competition(8) — 5 x 3 = 15 max.
    for (const order of [1, 3, 4, 6, 8]) await upsertMeddpiccAnswer(app(), dealId, order, { score: 3 }, "vitest");
    const result = await computeMeddpiccScoreForDeal(app(), dealId);
    expect(result?.stagePct).toBe(100);
  });

  it("does not reach 100% on the same answers once the deal moves to a later bucket", async () => {
    // Procurement maps to the Negotiation bucket, which weighs EVERY question
    // rather than the Q-tagged five, so the identical answer set that saturates
    // Qualification must not saturate here — that is the whole point of
    // bucketing by stage. (Passing a stage name the catalog does not know would
    // also land in the Negotiation bucket via the `?? "Negotiation"` fallback,
    // so this must be a real stage or it proves nothing about the mapping.)
    const dealId = await createDeal("Procurement");
    for (const order of [1, 3, 4, 6, 8]) await upsertMeddpiccAnswer(app(), dealId, order, { score: 3 }, "vitest");
    const result = await computeMeddpiccScoreForDeal(app(), dealId);
    expect(result?.stagePct).toBeLessThan(100);
  });
});
