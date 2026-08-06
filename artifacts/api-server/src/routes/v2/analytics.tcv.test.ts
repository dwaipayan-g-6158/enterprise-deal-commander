import { describe, it, expect, afterAll } from "vitest";
import type { Request, Response } from "express";
import { inArray } from "drizzle-orm";
import { db, pool, enterpriseDeals, pricingModels, servicesTiers, pipelineStages } from "@workspace/db";
import router from "./analytics";

// Same handler-extraction technique as analytics.vital-signs.test.ts and
// analytics.simulation.test.ts — no supertest harness exists in this repo.
function getHandler(path: string) {
  const stack = (router as unknown as {
    stack: Array<{
      route?: {
        path: string;
        methods: Record<string, boolean>;
        stack: Array<{ handle: (req: Request, res: Response) => unknown }>;
      };
    }>;
  }).stack;
  const layer = stack.find((l) => l.route?.path === path && l.route.methods.get);
  if (!layer?.route) throw new Error(`Route GET ${path} not registered`);
  return layer.route.stack[0].handle;
}

interface PipelineData {
  totalTcv: number;
  activeDeals: number;
  byStage: { stage: string; count: number; tcv: number }[];
}

interface VitalSignsData {
  totalTCV: number;
  weightedPipeline: number;
  activeDeals: number;
  avgScore: number | null;
  baseline: { totalTCV: number; activeDeals: number; redAlerts: number } | null;
}

async function callHandler<T>(path: string): Promise<T> {
  const handler = getHandler(path);
  let captured: { data: T } | undefined;
  const fakeReq = {} as Request;
  const fakeRes = {
    json: (body: { data: T }) => {
      captured = body;
    },
  } as unknown as Response;
  await handler(fakeReq, fakeRes);
  if (!captured) throw new Error("Handler did not call res.json");
  return captured.data;
}

const callPipeline = () => callHandler<PipelineData>("/analytics/pipeline");
const callVitalSigns = () => callHandler<VitalSignsData>("/analytics/vital-signs");

const createdDealIds: string[] = [];

// A Multi-Year Committed deal: TCV must be productRevenue * contractTermYears
// + servicesRevenue (calculateFlatTCV), not the flat
// productRevenue + servicesRevenue sum that several analytics routes used to
// inline. $1,000,000/yr x 3yr + $200,000 services = $3,200,000 — the buggy
// inline sum instead produces $1,200,000, a 62.5% understatement.
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
      dealName: `TCV Multi-Year Test ${Date.now()}`,
      accountName: `TCV Multi-Year Acct ${Date.now()}`,
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

// Skipped post-Catalyst-migration: routes/v2/analytics.ts's GET
// /analytics/pipeline and /analytics/vital-signs now read via Catalyst Data
// Store, not Drizzle/Postgres. `initCatalystApp(req)` requires real Catalyst
// session/headers to succeed — a fake `Request` object in a local Vitest run
// can never provide that (same "Data Store isn't reachable from localhost"
// limitation already documented for lookups.engine-thresholds.test.ts). This
// file's fixtures also seed via Drizzle directly, which the migrated
// handlers no longer read. Retire or rewrite as an integration test against
// the deployed AppSail app once Slice 6 seeding lands.
describe.skip("Multi-Year Committed TCV — calculateFlatTCV consolidation", () => {
  it("GET /analytics/pipeline: totalTcv reflects the full 3-year multiplier, not a flat sum", async () => {
    const before = await callPipeline();
    await createMultiYearDeal();
    const after = await callPipeline();

    // Fails today: the inline `(Number(productRevenue)||0) + (Number(servicesRevenue)||0)`
    // drops the contractTermYears multiplier, so the delta is 1,200,000 instead
    // of 3,200,000.
    expect(after.totalTcv - before.totalTcv).toBe(3_200_000);
    expect(after.activeDeals - before.activeDeals).toBe(1);
  });

  it("GET /analytics/vital-signs: totalTCV reflects the full 3-year multiplier, not a flat sum", async () => {
    const before = await callVitalSigns();
    await createMultiYearDeal();
    const after = await callVitalSigns();

    expect(after.totalTCV - before.totalTCV).toBe(3_200_000);
    expect(after.activeDeals - before.activeDeals).toBe(1);
  });
});
