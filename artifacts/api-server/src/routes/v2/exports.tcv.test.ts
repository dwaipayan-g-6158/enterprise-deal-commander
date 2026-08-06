import { describe, it, expect, afterAll } from "vitest";
import type { Request, Response } from "express";
import { inArray } from "drizzle-orm";
import { db, pool, enterpriseDeals, pricingModels, servicesTiers, pipelineStages } from "@workspace/db";
import router from "./exports";

// Same handler-extraction technique as routes/v2/analytics.vital-signs.test.ts
// and routes/v2/config.test.ts — no supertest harness exists in this repo. The
// /reports/pipeline handler calls res.send(html) rather than res.json, so the
// fake Response captures via `send` instead.
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

async function callPipelineReport(): Promise<string> {
  const handler = getHandler("/reports/pipeline");
  let captured: string | undefined;
  const fakeReq = {} as Request;
  const fakeRes = {
    setHeader: () => {},
    send: (body: string) => {
      captured = body;
    },
  } as unknown as Response;
  await handler(fakeReq, fakeRes);
  if (captured === undefined) throw new Error("Handler did not call res.send");
  return captured;
}

function totalTcvFromHtml(html: string): number {
  const m = html.match(/Total TCV<\/div><div class="value">\$([\d,]+)<\/div>/);
  if (!m) throw new Error("Could not find Total TCV KPI in report HTML");
  return Number(m[1].replace(/,/g, ""));
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

const createdDealIds: string[] = [];

// A Multi-Year Committed deal with a deliberately huge productRevenue so it
// sorts to the very top of activeDealRows() (ORDER BY productRevenue DESC)
// and is guaranteed to land in the "Top Deals by TCV" table (top 8 only).
// Correct TCV (calculateFlatTCV) = 50,000,000 x 3 + 10,000,000 = 160,000,000;
// the buggy inline sum instead produces 60,000,000.
async function createMultiYearDeal(): Promise<{ id: string; dealName: string }> {
  const pricingRows = await db.select().from(pricingModels);
  const pricing = pricingRows.find((p) => p.modelName === "Multi-Year Committed");
  if (!pricing) throw new Error('Seed data missing pricing model "Multi-Year Committed"');
  const [tier] = await db.select().from(servicesTiers).limit(1);
  const stages = await db.select().from(pipelineStages);
  const stage = stages.find((s) => s.stageName === "Discovery");
  if (!stage) throw new Error('Seed data missing pipeline stage "Discovery"');

  const dealName = `Exports TCV Multi-Year Test ${Date.now()}`;
  const [deal] = await db
    .insert(enterpriseDeals)
    .values({
      dealName,
      accountName: `Exports TCV Multi-Year Acct ${Date.now()}`,
      accountManager: "AM",
      technicalLead: "TL",
      salesStageId: stage.id,
      pricingModelId: pricing.id,
      servicesTierId: tier.id,
      contractTermYears: 3,
      productRevenue: "50000000.00",
      servicesRevenue: "10000000.00",
    })
    .returning({ id: enterpriseDeals.id });
  createdDealIds.push(deal.id);
  return { id: deal.id, dealName };
}

afterAll(async () => {
  if (createdDealIds.length > 0) {
    await db.delete(enterpriseDeals).where(inArray(enterpriseDeals.id, createdDealIds));
  }
  await pool.end();
});

// Skipped post-Catalyst-migration: routes/v2/exports.ts's GET /reports/pipeline
// now reads enterprise_deals via Catalyst Data Store, not Drizzle/Postgres.
// `initCatalystApp(req)` requires real Catalyst session/headers to succeed —
// a fake `Request` object in a local Vitest run can never provide that (same
// "Data Store isn't reachable from localhost" limitation already documented
// for lookups.engine-thresholds.test.ts). This file's fixtures also seed via
// Drizzle directly, which the migrated handler no longer reads. Retire or
// rewrite as an integration test against the deployed AppSail app once
// Slice 6 seeding lands.
describe.skip("GET /reports/pipeline — TCV honors the Multi-Year Committed term multiplier", () => {
  it("KPI Total TCV delta and the Top Deals table both reflect the term multiplier, not a flat sum", async () => {
    const before = totalTcvFromHtml(await callPipelineReport());
    const { dealName } = await createMultiYearDeal();
    const after = await callPipelineReport();

    // Fails today: pipelineFacts()'s per-row tcv is the inline
    // productRevenue + servicesRevenue sum (60,000,000), not
    // calculateFlatTCV's 160,000,000.
    expect(totalTcvFromHtml(after) - before).toBe(160_000_000);

    // Fails today for the same reason, in the separately-duplicated inline
    // calc feeding the "Top Deals by TCV" table row for this exact deal.
    const rowRegex = new RegExp(`<td>${escapeRegExp(dealName)}</td>.*?class="num">\\$([\\d,]+)</td></tr>`);
    const rowMatch = after.match(rowRegex);
    expect(rowMatch).not.toBeNull();
    expect(Number(rowMatch![1].replace(/,/g, ""))).toBe(160_000_000);
  });
});
