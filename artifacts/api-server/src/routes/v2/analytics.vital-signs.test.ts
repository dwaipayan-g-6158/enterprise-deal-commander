import { describe, it, expect, afterAll } from "vitest";
import type { Request, Response } from "express";
import { inArray } from "drizzle-orm";
import { db, pool, enterpriseDeals, pricingModels, servicesTiers, pipelineStages, dealSnapshots } from "@workspace/db";
import router from "./analytics";

// The route handler isn't exported directly, but it's registered on the
// default-exported Router. Pull it off the stack so this test exercises the
// real production handler (query + baseline logic) rather than reimplementing
// it, without needing a supertest/HTTP harness (none exists in this repo).
function getHandler(path: string) {
  const stack = (router as unknown as { stack: Array<{ route?: { path: string; methods: Record<string, boolean>; stack: Array<{ handle: (req: Request, res: Response) => unknown }> } }> }).stack;
  const layer = stack.find((l) => l.route?.path === path && l.route.methods.get);
  if (!layer?.route) throw new Error(`Route GET ${path} not registered`);
  return layer.route.stack[0].handle;
}

interface VitalSigns {
  totalTCV: number;
  weightedPipeline: number;
  activeDeals: number;
  avgScore: number | null;
  baseline: { totalTCV: number; activeDeals: number; redAlerts: number } | null;
}

async function callVitalSigns(): Promise<VitalSigns> {
  const handler = getHandler("/analytics/vital-signs");
  let captured: { data: VitalSigns } | undefined;
  const fakeRes = { json: (body: { data: VitalSigns }) => { captured = body; } } as unknown as Response;
  await handler({} as Request, fakeRes);
  if (!captured) throw new Error("Handler did not call res.json");
  return captured.data;
}

const createdDealIds: string[] = [];

async function createClosedDealWithSnapshot(): Promise<void> {
  const [pricing] = await db.select().from(pricingModels).limit(1);
  const [tier] = await db.select().from(servicesTiers).limit(1);
  const stages = await db.select().from(pipelineStages);
  const stage = stages.find((s) => s.stageName === "Closed-Won");
  if (!stage) throw new Error('Seed data missing pipeline stage "Closed-Won"');

  const [deal] = await db
    .insert(enterpriseDeals)
    .values({
      dealName: `Vital Signs Exclusion Test ${Date.now()}`,
      accountName: `Vital Signs Exclusion Acct ${Date.now()}`,
      accountManager: "AM",
      technicalLead: "TL",
      salesStageId: stage.id,
      pricingModelId: pricing.id,
      servicesTierId: tier.id,
      // Distinctive, large revenue so any regression that re-includes this
      // deal in the "current" totals shows up unmistakably.
      productRevenue: "88888800.00",
      servicesRevenue: "0",
    })
    .returning({ id: enterpriseDeals.id });
  createdDealIds.push(deal.id);

  // A snapshot row dated well before the 7-day cutoff, with a distinctive
  // TCV and a RED health status so a regression that re-includes it in the
  // baseline shows up in both baseline.totalTCV and baseline.redAlerts.
  await db.insert(dealSnapshots).values({
    dealId: deal.id,
    reason: "test-seed",
    healthStatus: "RED",
    salesStageId: stage.id,
    salesStage: stage.stageName,
    calculatedTcv: "77777700.00",
    payload: {},
    createdBy: "test",
    snapshotAt: new Date(Date.now() - 10 * 86_400_000),
  });
}

afterAll(async () => {
  if (createdDealIds.length > 0) {
    // deal_snapshots.deal_id has onDelete: cascade, so this also removes the
    // seeded snapshot row.
    await db.delete(enterpriseDeals).where(inArray(enterpriseDeals.id, createdDealIds));
  }
  await pool.end();
});

describe("GET /analytics/vital-signs — closed deals excluded", () => {
  it("excludes a Closed-Won deal from current totals and from the 7-day baseline", async () => {
    const before = await callVitalSigns();

    await createClosedDealWithSnapshot();

    const after = await callVitalSigns();

    // Current query (Part 1): the closed deal must not move totalTCV,
    // weightedPipeline, or activeDeals.
    expect(after.totalTCV).toBe(before.totalTCV);
    expect(after.activeDeals).toBe(before.activeDeals);

    // Baseline (Part 2): the closed deal's snapshot must not move the
    // ~7-day-ago baseline either, even though the snapshot predates the
    // cutoff and would otherwise be the "latest" row for that deal.
    expect(after.baseline?.totalTCV ?? null).toBe(before.baseline?.totalTCV ?? null);
    expect(after.baseline?.activeDeals ?? null).toBe(before.baseline?.activeDeals ?? null);
    expect(after.baseline?.redAlerts ?? null).toBe(before.baseline?.redAlerts ?? null);
  });
});
