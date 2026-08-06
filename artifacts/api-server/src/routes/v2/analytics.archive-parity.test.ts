import { describe, it, expect, afterAll } from "vitest";
import type { Request, Response } from "express";
import { eq, inArray } from "drizzle-orm";
import { db, pool, enterpriseDeals, pricingModels, servicesTiers, pipelineStages } from "@workspace/db";
import router from "./analytics";

// NOTE: The originating task brief assumed this test would hit
// GET /analytics/win-loss with a { totalWon, totalLost, winRate } shape.
// Neither is true: that handler (routes/v2/analytics.ts ~L253) reads
// unconditionally from `dealMemory` — it never joins enterpriseDeals and
// never touches `activeFilter`, so archiving a deal can't move its numbers
// either before or after this task's fix. Its real response shape is also
// `{ totalClosed, won, lost, winRatePct, byTcvRange }`.
// GET /analytics/pipeline (~L154) is the endpoint that actually consumes the
// `activeFilter` const this task changes (`.where(activeFilter)` at L163,
// with no separate stage exclusion), so it's the one that can prove the
// pre-fix bug and the post-fix behavior. Verified by reading the handler
// before writing this test, per the brief's instruction not to guess.
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

interface StageBucket { stage: string; count: number; tcv: number }
interface PipelineData { totalTcv: number; activeDeals: number; byStage: StageBucket[] }

async function callPipeline(): Promise<PipelineData> {
  const handler = getHandler("get", "/analytics/pipeline");
  let captured: { data: PipelineData } | undefined;
  const fakeRes = { json: (body: { data: PipelineData }) => { captured = body; } } as unknown as Response;
  await handler({ query: {} } as unknown as Request, fakeRes);
  if (!captured) throw new Error("Handler did not call res.json");
  return captured.data;
}

function closedLostCount(data: PipelineData): number {
  return data.byStage.find((s) => s.stage === "Closed-Lost")?.count ?? 0;
}

const createdDealIds: string[] = [];

async function createClosedLostDeal(): Promise<string> {
  const [pricing] = await db.select().from(pricingModels).limit(1);
  const [tier] = await db.select().from(servicesTiers).limit(1);
  const stages = await db.select().from(pipelineStages);
  const stage = stages.find((s) => s.stageName === "Closed-Lost");
  if (!stage) throw new Error('Seed data missing pipeline stage "Closed-Lost"');

  const [deal] = await db
    .insert(enterpriseDeals)
    .values({
      dealName: `Archive Parity Test ${Date.now()}`,
      accountName: `Archive Parity Acct ${Date.now()}`,
      accountManager: "AM",
      technicalLead: "TL",
      salesStageId: stage.id,
      pricingModelId: pricing.id,
      servicesTierId: tier.id,
      productRevenue: "1000.00",
      servicesRevenue: "0",
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

// Skipped post-Catalyst-migration: routes/v2/analytics.ts's GET /analytics/pipeline
// now reads enterprise_deals via Catalyst Data Store, not Drizzle/Postgres.
// `initCatalystApp(req)` requires real Catalyst session/headers to succeed —
// a fake `Request` object in a local Vitest run can never provide that (same
// "Data Store isn't reachable from localhost" limitation already documented
// for lookups.engine-thresholds.test.ts). This file's fixtures also seed via
// Drizzle directly, which the migrated handler no longer reads. Retire or
// rewrite as an integration test against the deployed AppSail app once
// Slice 6 seeding lands.
describe.skip("GET /analytics/pipeline — archived deals still count", () => {
  it("keeps a Closed-Lost deal in the pipeline stage breakdown after it's archived", async () => {
    const id = await createClosedLostDeal();

    const afterCreate = await callPipeline();
    const countAfterCreate = closedLostCount(afterCreate);
    expect(countAfterCreate).toBeGreaterThan(0); // sanity: the new deal is already counted

    await db.update(enterpriseDeals).set({ archivedAt: new Date() }).where(eq(enterpriseDeals.id, id));

    const afterArchive = await callPipeline();
    const countAfterArchive = closedLostCount(afterArchive);
    // This is the bug this task fixes: archiving a Closed-Lost deal must NOT
    // remove it from the analytics breakdown, or portfolio numbers silently
    // shift the moment someone tidies up the roster.
    expect(countAfterArchive).toBe(countAfterCreate);
    expect(afterArchive.totalTcv).toBe(afterCreate.totalTcv);
  });
});
