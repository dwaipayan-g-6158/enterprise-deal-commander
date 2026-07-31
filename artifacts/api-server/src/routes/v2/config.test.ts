import { describe, it, expect, afterAll } from "vitest";
import type { Request, Response } from "express";
import { eq, inArray } from "drizzle-orm";
import {
  db,
  pool,
  enterpriseDeals,
  pricingModels,
  servicesTiers,
  pipelineStages,
  scoringModelWeights,
  settingsChangeLog,
} from "@workspace/db";
import router from "./config";

// Mirrors routes/v2/analytics.vital-signs.test.ts: no supertest harness exists
// in this repo, so pull the real handler off the router's stack and call it
// directly — this exercises production code, not a reimplementation of it.
function getHandler(method: "get" | "post" | "put", path: string) {
  const stack = (router as unknown as {
    stack: Array<{
      route?: {
        path: string;
        methods: Record<string, boolean>;
        stack: Array<{ handle: (req: Request, res: Response) => unknown }>;
      };
    }>;
  }).stack;
  const layer = stack.find((l) => l.route?.path === path && l.route.methods[method]);
  if (!layer?.route) throw new Error(`Route ${method.toUpperCase()} ${path} not registered`);
  return layer.route.stack[0].handle;
}

interface TestPatternMatch { dealId: string; dealName: string; accountName: string }
interface TestPatternResponse { data: { matchCount: number; matches: TestPatternMatch[] } }

async function callTestPattern(): Promise<TestPatternResponse["data"]> {
  const handler = getHandler("post", "/custom-patterns/test");
  let captured: TestPatternResponse | undefined;
  const fakeReq = {
    body: {
      pattern_name: "Preview probe",
      severity: "YELLOW",
      weight: 1,
      alert_message_template: "probe",
      // gte 0 matches every deal — revenue is never negative (DB check
      // constraint) — so this condition is purely a vehicle to exercise
      // normalizedDeals()'s WHERE clause, not the pattern-matching logic.
      conditions: [
        { field_path: "financials.calculatedTCV", operator: "gte", comparison_value: "0", sort_order: 0 },
      ],
    },
  } as unknown as Request;
  const fakeRes = { json: (body: TestPatternResponse) => { captured = body; } } as unknown as Response;
  await handler(fakeReq, fakeRes);
  if (!captured) throw new Error("Handler did not call res.json");
  return captured.data;
}

const createdDealIds: string[] = [];

async function createDeal(tag: string, overrides: { archivedAt?: Date; deletedAt?: Date }): Promise<string> {
  const [pricing] = await db.select().from(pricingModels).limit(1);
  const [tier] = await db.select().from(servicesTiers).limit(1);
  const stages = await db.select().from(pipelineStages);
  const stage = stages.find((s) => s.stageName === "Closed-Lost");
  if (!stage) throw new Error('Seed data missing pipeline stage "Closed-Lost"');

  const [deal] = await db
    .insert(enterpriseDeals)
    .values({
      dealName: `Preview Leak Test ${tag} ${Date.now()}`,
      accountName: `Preview Leak Acct ${tag} ${Date.now()}`,
      accountManager: "AM",
      technicalLead: "TL",
      salesStageId: stage.id,
      pricingModelId: pricing.id,
      servicesTierId: tier.id,
      productRevenue: "1000.00",
      servicesRevenue: "0",
      archivedAt: overrides.archivedAt ?? null,
      deletedAt: overrides.deletedAt ?? null,
    })
    .returning({ id: enterpriseDeals.id });
  createdDealIds.push(deal.id);
  return deal.id;
}

// Feature id used only by the PUT /config/scoring-weights test below. It is
// deliberately not one of the real predictive-score factors: mergeScoringWeights
// (lib/engine-config.ts) only merges rows whose featureId is already a known
// key, so writing a calibration row under this made-up id can never perturb
// any other test's or the live app's actual scoring weights.
const TEST_FEATURE_ID = "test_probe_scoring_weight";

afterAll(async () => {
  if (createdDealIds.length > 0) {
    await db.delete(enterpriseDeals).where(inArray(enterpriseDeals.id, createdDealIds));
  }
  await db.delete(scoringModelWeights).where(eq(scoringModelWeights.featureId, TEST_FEATURE_ID));
  await db.delete(settingsChangeLog).where(eq(settingsChangeLog.settingKey, TEST_FEATURE_ID));
  await pool.end();
});

interface UpdateWeightsResponse { data: { updated: number; rescored: number } }

async function callUpdateScoringWeights(): Promise<UpdateWeightsResponse["data"]> {
  const handler = getHandler("put", "/config/scoring-weights");
  let captured: UpdateWeightsResponse | undefined;
  const fakeReq = {
    body: { weights: [{ feature_id: TEST_FEATURE_ID, weight: 0.5 }] },
    actor: { id: "test-actor", username: "test-actor", displayName: "Test Actor", role: "admin" },
  } as unknown as Request;
  const fakeRes = { json: (body: UpdateWeightsResponse) => { captured = body; } } as unknown as Response;
  await handler(fakeReq, fakeRes);
  if (!captured) throw new Error("Handler did not call res.json");
  return captured.data;
}

describe("PUT /config/scoring-weights — inline re-score (F2)", () => {
  it("returns a rescored count alongside the updated count", async () => {
    const { updated, rescored } = await callUpdateScoringWeights();

    expect(updated).toBe(1);
    expect(Number.isInteger(rescored)).toBe(true);
    expect(rescored).toBeGreaterThanOrEqual(0);
  });
});

describe("POST /custom-patterns/test — excludes non-live deals", () => {
  it("matches a live deal but not an archived or deleted one", async () => {
    const liveId = await createDeal("live", {});
    const archivedId = await createDeal("archived", { archivedAt: new Date() });
    const deletedId = await createDeal("deleted", { deletedAt: new Date() });

    const { matches } = await callTestPattern();
    const matchedIds = new Set(matches.map((m) => m.dealId));

    expect(matchedIds.has(liveId)).toBe(true);
    expect(matchedIds.has(archivedId)).toBe(false);
    expect(matchedIds.has(deletedId)).toBe(false);
  });
});
