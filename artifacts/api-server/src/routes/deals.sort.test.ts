import { describe, it, expect, afterAll } from "vitest";
import type { Request, Response } from "express";
import { inArray } from "drizzle-orm";
import { db, pool, enterpriseDeals, pricingModels, servicesTiers, pipelineStages } from "@workspace/db";
import router from "./deals";

// Regression coverage for the `sort` query param on GET /deals — previously
// unvalidated (any string accepted, silently sorting nothing when the key
// didn't exist on the serialized deal) and, even for a real numeric key,
// unsafe once a null was present (fell through to `String(null)` comparison,
// ordering "10" before "9"). See routes/deals.ts's SORTABLE_DEAL_KEYS.

function getHandler(method: "get" | "post" | "put" | "delete", path: string) {
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

interface DealSummary {
  id: string;
  dealName: string;
  winProbabilityPct: number | null;
}
interface ListDealsResponseShape {
  data: DealSummary[];
}

async function callList(query: Record<string, string>): Promise<DealSummary[]> {
  const handler = getHandler("get", "/deals");
  let captured: ListDealsResponseShape | undefined;
  const fakeReq = { query } as unknown as Request;
  const fakeRes = { json: (body: ListDealsResponseShape) => { captured = body; } } as unknown as Response;
  await handler(fakeReq, fakeRes);
  if (!captured) throw new Error("Handler did not call res.json");
  return captured.data;
}

const createdDealIds: string[] = [];

async function createDeal(tag: string, winProbabilityPct: number | null): Promise<string> {
  const [pricing] = await db.select().from(pricingModels).limit(1);
  const [tier] = await db.select().from(servicesTiers).limit(1);
  const stages = await db.select().from(pipelineStages);
  const stage = stages.find((s) => s.stageName === "Discovery") ?? stages[0];

  const [deal] = await db
    .insert(enterpriseDeals)
    .values({
      dealName: `Sort Test ${tag} ${Date.now()}`,
      accountName: `Sort Test Acct ${tag} ${Date.now()}`,
      accountManager: "AM",
      technicalLead: "TL",
      salesStageId: stage.id,
      pricingModelId: pricing.id,
      servicesTierId: tier.id,
      productRevenue: "1000.00",
      servicesRevenue: "0",
      winProbabilityPct,
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

// Skipped post-Catalyst-migration: routes/deals.ts now reads enterprise_deals
// via Catalyst Data Store, not Drizzle/Postgres. `initCatalystApp(req)`
// requires real Catalyst session/headers to succeed — a fake `Request` object
// in a local Vitest run can never provide that (same "Data Store isn't
// reachable from localhost" limitation already documented for
// lookups.engine-thresholds.test.ts and the sibling Customer-Insight-Engine
// project). This file's fixtures also seed via Drizzle directly, which the
// migrated handler no longer reads. Retire or rewrite as an integration test
// against the deployed AppSail app once Slice 6 seeding lands.
describe.skip("GET /deals?sort=... — allowlist and null-safe numeric ordering", () => {
  it("rejects an unrecognized sort key instead of silently no-op sorting", async () => {
    await expect(callList({ sort: "bogus", limit: "500" })).rejects.toMatchObject({ status: 400 });
  });

  it("rejects an unrecognized key even with a leading '-' (desc)", async () => {
    await expect(callList({ sort: "-notAField", limit: "500" })).rejects.toMatchObject({ status: 400 });
  });

  it("sorts a recognized string key ascending and descending", async () => {
    const lowId = await createDeal("aaa-low", 10);
    const highId = await createDeal("zzz-high", 10);

    const asc = await callList({ sort: "dealName", limit: "500" });
    const ascIds = asc.map((d) => d.id);
    expect(ascIds.indexOf(lowId)).toBeLessThan(ascIds.indexOf(highId));

    const desc = await callList({ sort: "-dealName", limit: "500" });
    const descIds = desc.map((d) => d.id);
    expect(descIds.indexOf(highId)).toBeLessThan(descIds.indexOf(lowId));
  });

  it("sorts null last on a nullable numeric key, ascending AND descending", async () => {
    const lowId = await createDeal("num-low", 20);
    const highId = await createDeal("num-high", 80);
    const nullId = await createDeal("num-null", null);

    const asc = await callList({ sort: "winProbabilityPct", limit: "500" });
    const ascIds = asc.map((d) => d.id);
    // 20 before 80 before null
    expect(ascIds.indexOf(lowId)).toBeLessThan(ascIds.indexOf(highId));
    expect(ascIds.indexOf(highId)).toBeLessThan(ascIds.indexOf(nullId));

    const desc = await callList({ sort: "-winProbabilityPct", limit: "500" });
    const descIds = desc.map((d) => d.id);
    // 80 before 20 before null — null stays last in EITHER direction, unlike
    // the old `String(null)` fallback, which would have flipped its position
    // when the direction flipped.
    expect(descIds.indexOf(highId)).toBeLessThan(descIds.indexOf(lowId));
    expect(descIds.indexOf(lowId)).toBeLessThan(descIds.indexOf(nullId));
  });
});
