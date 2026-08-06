import { describe, it, expect, afterAll } from "vitest";
import type { Request, Response } from "express";
import { inArray } from "drizzle-orm";
import { db, pool, enterpriseDeals, pricingModels, servicesTiers, pipelineStages } from "@workspace/db";
import router from "./config";

// Same handler-extraction technique as routes/v2/config.test.ts and
// routes/v2/analytics.vital-signs.test.ts — no supertest harness exists in
// this repo.
function getHandler(method: "get" | "post", path: string) {
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

async function callTestPattern(comparisonValue: string): Promise<TestPatternResponse["data"]> {
  const handler = getHandler("post", "/custom-patterns/test");
  let captured: TestPatternResponse | undefined;
  const fakeReq = {
    body: {
      pattern_name: "TCV multiplier probe",
      severity: "YELLOW",
      weight: 1,
      alert_message_template: "probe",
      conditions: [
        { field_path: "financials.calculatedTCV", operator: "gte", comparison_value: comparisonValue, sort_order: 0 },
      ],
    },
  } as unknown as Request;
  const fakeRes = { json: (body: TestPatternResponse) => { captured = body; } } as unknown as Response;
  await handler(fakeReq, fakeRes);
  if (!captured) throw new Error("Handler did not call res.json");
  return captured.data;
}

const createdDealIds: string[] = [];

// A Multi-Year Committed deal: correct TCV (calculateFlatTCV) is
// 1,000,000 x 3 + 200,000 = 3,200,000. The buggy inline sum instead produces
// 1,200,000 — which sits BELOW a 2,000,000 threshold, so a >= 2,000,000
// pattern condition distinguishes the two unambiguously without needing a
// before/after delta (this is a membership check, not an additive total).
async function createMultiYearDeal(): Promise<string> {
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
      dealName: `Config TCV Multi-Year Test ${Date.now()}`,
      accountName: `Config TCV Multi-Year Acct ${Date.now()}`,
      accountManager: "AM",
      technicalLead: "TL",
      salesStageId: stage.id,
      pricingModelId: pricing.id,
      servicesTierId: tier.id,
      contractTermYears: 3,
      productRevenue: "1000000.00",
      servicesRevenue: "200000.00",
    })
    .returning({ id: enterpriseDeals.id });
  createdDealIds.push(deal.id);
  return deal.id;
}

afterAll(async () => {
  if (createdDealIds.length > 0) {
    await db.delete(enterpriseDeals).where(inArray(enterpriseDeals.id, createdDealIds));
  }
  await pool.end();
});

// Skipped post-Catalyst-migration: routes/v2/config.ts's POST /custom-patterns/test
// now reads enterprise_deals via Catalyst Data Store, not Drizzle/Postgres.
// `initCatalystApp(req)` requires real Catalyst session/headers to succeed — a
// fake `Request` object in a local Vitest run can never provide that (same
// "Data Store isn't reachable from localhost" limitation already documented
// for lookups.engine-thresholds.test.ts). This file's fixtures also seed via
// Drizzle directly, which the migrated handler no longer reads. Retire or
// rewrite as an integration test against the deployed AppSail app once Slice 6
// seeding lands.
describe.skip("POST /custom-patterns/test — normalizedDeals() TCV honors the term multiplier", () => {
  it("matches a Multi-Year Committed deal against a threshold only the correctly-multiplied TCV clears", async () => {
    const dealId = await createMultiYearDeal();

    // Fails today: normalizedDeals() computes calculatedTCV as
    // productRevenue + servicesRevenue (1,200,000), which is below 2,000,000,
    // so the deal would NOT appear in matches even though its real TCV
    // (3,200,000) clears the threshold comfortably.
    const { matches } = await callTestPattern("2000000");
    const matchedIds = new Set(matches.map((m) => m.dealId));
    expect(matchedIds.has(dealId)).toBe(true);
  });
});
