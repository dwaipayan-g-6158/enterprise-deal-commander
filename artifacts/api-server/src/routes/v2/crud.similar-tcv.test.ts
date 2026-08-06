import { describe, it, expect, afterAll } from "vitest";
import type { Request, Response } from "express";
import crypto from "node:crypto";
import { inArray } from "drizzle-orm";
import {
  db,
  pool,
  enterpriseDeals,
  pricingModels,
  servicesTiers,
  pipelineStages,
  dealMemory,
} from "@workspace/db";
import router from "./crud";

// Same handler-extraction technique as analytics.tcv.test.ts — no supertest
// harness exists in this repo.
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

interface MemoryOut {
  id: string;
  accountName: string;
  finalTcv: string | null;
}

async function callSimilar(dealId: string): Promise<MemoryOut[]> {
  const handler = getHandler("/memory/similar/:dealId");
  let captured: { data: MemoryOut[] } | undefined;
  const fakeReq = { params: { dealId } } as unknown as Request;
  const fakeRes = {
    json: (body: { data: MemoryOut[] }) => {
      captured = body;
    },
  } as unknown as Response;
  await handler(fakeReq, fakeRes);
  if (!captured) throw new Error("Handler did not call res.json");
  return captured.data;
}

const createdDealIds: string[] = [];
const createdMemoryIds: string[] = [];
const suffix = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

/**
 * A Multi-Year Committed deal: $1,000,000/yr x 3yr + $200,000 services, so its
 * calculateFlatTCV is $3,200,000. Deriving TCV from raw productRevenue alone
 * yields $1,000,000 — a 68.75% understatement that throws off any comparison
 * against `dealMemory.finalTcv`, which IS term-multiplied.
 */
async function createMultiYearDeal(accountName: string): Promise<string> {
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
      dealName: `Similar TCV Multi-Year ${suffix}`,
      accountName,
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

async function createMemoryRow(accountName: string, finalTcv: string): Promise<string> {
  const [row] = await db
    .insert(dealMemory)
    .values({
      // No FK on deal_memory.deal_id; a synthetic id keeps this row independent
      // of the live deal (which the unique constraint on deal_id would collide
      // with if reused).
      dealId: crypto.randomUUID(),
      accountName,
      dealName: `Archived ${accountName}`,
      outcome: "Won",
      finalTcv,
    })
    .returning({ id: dealMemory.id });
  createdMemoryIds.push(row.id);
  return row.id;
}

afterAll(async () => {
  if (createdMemoryIds.length > 0) {
    await db.delete(dealMemory).where(inArray(dealMemory.id, createdMemoryIds));
  }
  if (createdDealIds.length > 0) {
    await db.delete(enterpriseDeals).where(inArray(enterpriseDeals.id, createdDealIds));
  }
  await pool.end();
});

// Skipped post-Catalyst-migration: routes/v2/crud.ts's GET /memory/similar/:dealId
// now reads enterprise_deals, pricing_models, and v2_deal_memory via Catalyst
// Data Store, not Drizzle/Postgres. `initCatalystApp(req)` requires real
// Catalyst session/headers to succeed — a fake `Request` object in a local
// Vitest run can never provide that (same "Data Store isn't reachable from
// localhost" limitation already documented for
// lookups.engine-thresholds.test.ts). This file's fixtures also seed via
// Drizzle directly, which the migrated handler no longer reads. Retire or
// rewrite as an integration test against the deployed AppSail app once
// Slice 6 seeding lands.
describe.skip("GET /memory/similar/:dealId — TCV comparison parity", () => {
  it("matches an archived deal sized against the term-multiplied TCV, not raw productRevenue", async () => {
    // Distinct account names on both sides, so the only way this can match is
    // through the TCV-proximity branch (never the accountName shortcut).
    const dealId = await createMultiYearDeal(`Similar Live Acct ${suffix}`);
    // 3,000,000 vs the deal's real 3,200,000 TCV -> ratio 0.0625, well inside
    // the 0.5 window. Against the old raw-productRevenue figure of 1,000,000 the
    // ratio is 2.0, so this row was wrongly excluded.
    const nearId = await createMemoryRow(`Similar Archived Near ${suffix}`, "3000000.00");

    const results = await callSimilar(dealId);
    expect(results.map((r) => r.id)).toContain(nearId);
  });

  it("still excludes an archived deal far outside the 0.5 window", async () => {
    const dealId = await createMultiYearDeal(`Similar Live Acct Far ${suffix}`);
    // 1,000,000 is what the buggy comparison used as the live deal's own TCV, so
    // it used to match exactly; against the real 3,200,000 it is 0.6875 away and
    // must NOT match. This pins the fix as a re-scaling, not a widening.
    const farId = await createMemoryRow(`Similar Archived Far ${suffix}`, "1000000.00");

    const results = await callSimilar(dealId);
    expect(results.map((r) => r.id)).not.toContain(farId);
  });
});
