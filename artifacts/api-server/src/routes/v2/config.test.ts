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

// Separate, never-before-seen feature id for the oldValue regression below —
// it needs a featureId with NO pre-existing scoring_model_weights rows so the
// "brand-new factor" (genuinely null oldValue) case is unambiguous, which
// TEST_FEATURE_ID above can't guarantee once the F2 test has already inserted
// a row for it.
const OLD_VALUE_TEST_FEATURE_ID = "test_probe_scoring_weight_oldvalue";

afterAll(async () => {
  if (createdDealIds.length > 0) {
    await db.delete(enterpriseDeals).where(inArray(enterpriseDeals.id, createdDealIds));
  }
  await db.delete(scoringModelWeights).where(eq(scoringModelWeights.featureId, TEST_FEATURE_ID));
  await db.delete(settingsChangeLog).where(eq(settingsChangeLog.settingKey, TEST_FEATURE_ID));
  await db.delete(scoringModelWeights).where(eq(scoringModelWeights.featureId, OLD_VALUE_TEST_FEATURE_ID));
  await db.delete(settingsChangeLog).where(eq(settingsChangeLog.settingKey, OLD_VALUE_TEST_FEATURE_ID));
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

// Skipped post-Catalyst-migration (all 3 describe blocks in this file):
// routes/v2/config.ts now reads/writes enterprise_deals, scoring_model_weights,
// custom_risk_patterns etc. via Catalyst Data Store, not Drizzle/Postgres.
// `initCatalystApp(req)` requires real Catalyst session/headers to succeed — a
// fake `Request` object in a local Vitest run can never provide that (same
// "Data Store isn't reachable from localhost" limitation already documented
// for lookups.engine-thresholds.test.ts and the sibling Customer-Insight-Engine
// project). This file's fixtures also seed via Drizzle directly, which the
// migrated handlers no longer read. Retire or rewrite as an integration test
// against the deployed AppSail app once Slice 6 seeding lands.
describe.skip("PUT /config/scoring-weights — inline re-score (F2)", () => {
  it("returns a rescored count alongside the updated count", async () => {
    const { updated, rescored } = await callUpdateScoringWeights();

    expect(updated).toBe(1);
    expect(Number.isInteger(rescored)).toBe(true);
    expect(rescored).toBeGreaterThanOrEqual(0);
  });
});

describe.skip("PUT /config/scoring-weights — audit entries record the real prior weight, not always null", () => {
  it("logs oldValue: null for a brand-new factor, then the real prior weight on the next PUT", async () => {
    const handler = getHandler("put", "/config/scoring-weights");
    const put = async (weight: number) => {
      const fakeReq = {
        body: { weights: [{ feature_id: OLD_VALUE_TEST_FEATURE_ID, weight }] },
        actor: { id: "test-actor", username: "test-actor", displayName: "Test Actor", role: "admin" },
      } as unknown as Request;
      const fakeRes = { json: () => {} } as unknown as Response;
      await handler(fakeReq, fakeRes);
    };

    await put(0.3);
    await put(0.6);

    const rows = await db
      .select()
      .from(settingsChangeLog)
      .where(eq(settingsChangeLog.settingKey, OLD_VALUE_TEST_FEATURE_ID))
      .orderBy(settingsChangeLog.changedAt);
    expect(rows).toHaveLength(2);
    // First-ever PUT for this featureId: no prior row exists — null is the
    // legitimate case here, not a hardcoded shortcut.
    expect(rows[0].oldValue).toBeNull();
    expect(Number(rows[0].newValue)).toBeCloseTo(0.3, 5);
    // Second PUT: oldValue must be the real weight set by the first PUT.
    expect(Number(rows[1].oldValue)).toBeCloseTo(0.3, 5);
    expect(Number(rows[1].newValue)).toBeCloseTo(0.6, 5);
  });
});

describe.skip("POST /custom-patterns/test — excludes non-live deals", () => {
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
