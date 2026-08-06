import { describe, it, expect, afterAll } from "vitest";
import type { Request, Response } from "express";
import { inArray } from "drizzle-orm";
import {
  db,
  pool,
  enterpriseDeals,
  pricingModels,
  servicesTiers,
  pipelineStages,
} from "@workspace/db";
import router from "./analytics";

// Same handler-extraction technique as analytics.next-actions.test.ts and
// analytics.archive-parity.test.ts — no supertest harness exists in this repo.
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

interface SimulationData {
  iterations: number;
  totalDeals: number;
  weightedPipeline: number;
}

async function callSimulation(): Promise<SimulationData> {
  const handler = getHandler("get", "/analytics/simulation");
  let captured: { data: SimulationData } | undefined;
  const fakeReq = { query: {} } as unknown as Request;
  const fakeRes = {
    json: (body: { data: SimulationData }) => {
      captured = body;
    },
  } as unknown as Response;
  await handler(fakeReq, fakeRes);
  if (!captured) throw new Error("Handler did not call res.json");
  return captured.data;
}

const createdDealIds: string[] = [];

async function createClosedWonDeal(tag: string, archivedAt?: Date): Promise<string> {
  const [pricing] = await db.select().from(pricingModels).limit(1);
  const [tier] = await db.select().from(servicesTiers).limit(1);
  const stages = await db.select().from(pipelineStages);
  const stage = stages.find((s) => s.stageName === "Closed-Won");
  if (!stage) throw new Error('Seed data missing pipeline stage "Closed-Won"');

  const [deal] = await db
    .insert(enterpriseDeals)
    .values({
      dealName: `Simulation Closed Test ${tag} ${Date.now()}`,
      accountName: `Simulation Closed Acct ${tag} ${Date.now()}`,
      accountManager: "AM",
      technicalLead: "TL",
      salesStageId: stage.id,
      pricingModelId: pricing.id,
      servicesTierId: tier.id,
      // Deliberately huge so any leak into the forecast would be unmissable.
      productRevenue: "50000000.00",
      servicesRevenue: "0",
      archivedAt: archivedAt ?? null,
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
// /analytics/simulation now reads via Catalyst Data Store, not
// Drizzle/Postgres. `initCatalystApp(req)` requires real Catalyst
// session/headers to succeed — a fake `Request` object in a local Vitest run
// can never provide that (same "Data Store isn't reachable from localhost"
// limitation already documented for lookups.engine-thresholds.test.ts). This
// file's fixtures also seed via Drizzle directly, which the migrated handler
// no longer reads. Retire or rewrite as an integration test against the
// deployed AppSail app once Slice 6 seeding lands.
describe.skip("GET /analytics/simulation — closed deals never enter the forecast", () => {
  it("leaves totalDeals/weightedPipeline unchanged for a large Closed-Won deal, archived or not", async () => {
    const baseline = await callSimulation();

    const wonId = await createClosedWonDeal("plain");
    const afterWon = await callSimulation();
    expect(afterWon.totalDeals).toBe(baseline.totalDeals);
    expect(afterWon.weightedPipeline).toBe(baseline.weightedPipeline);

    const archivedWonId = await createClosedWonDeal("archived", new Date());
    const afterArchivedWon = await callSimulation();
    expect(afterArchivedWon.totalDeals).toBe(baseline.totalDeals);
    expect(afterArchivedWon.weightedPipeline).toBe(baseline.weightedPipeline);

    expect(wonId).toBeTruthy();
    expect(archivedWonId).toBeTruthy();
  });
});
