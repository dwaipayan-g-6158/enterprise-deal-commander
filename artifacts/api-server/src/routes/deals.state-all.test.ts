import { describe, it, expect, afterAll } from "vitest";
import type { Request, Response } from "express";
import { inArray } from "drizzle-orm";
import { db, pool, enterpriseDeals, pricingModels, servicesTiers, pipelineStages } from "@workspace/db";
import router from "./deals";

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

interface DealSummary { id: string }
interface ListDealsResponseShape { data: DealSummary[] }

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

async function createDeal(tag: string, overrides: { archivedAt?: Date; deletedAt?: Date }): Promise<string> {
  const [pricing] = await db.select().from(pricingModels).limit(1);
  const [tier] = await db.select().from(servicesTiers).limit(1);
  const stages = await db.select().from(pipelineStages);
  const stage = stages.find((s) => s.stageName === "Closed-Lost");
  if (!stage) throw new Error('Seed data missing pipeline stage "Closed-Lost"');

  const [deal] = await db
    .insert(enterpriseDeals)
    .values({
      dealName: `State All Test ${tag} ${Date.now()}`,
      accountName: `State All Acct ${tag} ${Date.now()}`,
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

afterAll(async () => {
  if (createdDealIds.length > 0) {
    await db.delete(enterpriseDeals).where(inArray(enterpriseDeals.id, createdDealIds));
  }
  await pool.end();
});

describe("GET /deals?state=... — all four predicates", () => {
  it("includes active and archived deals, excludes deleted, for state=all", async () => {
    const activeId = await createDeal("active", {});
    const archivedId = await createDeal("archived", { archivedAt: new Date() });
    const deletedId = await createDeal("deleted", { deletedAt: new Date() });

    const rows = await callList({ state: "all", limit: "500" });
    const ids = new Set(rows.map((r) => r.id));

    expect(ids.has(activeId)).toBe(true);
    expect(ids.has(archivedId)).toBe(true);
    expect(ids.has(deletedId)).toBe(false);
  });

  // The remaining three predicates are pre-existing and unchanged by this
  // plan — asserted here anyway because, per the audit that motivated this
  // whole plan, zero tests touched them before now.
  it("state=active excludes both archived and deleted", async () => {
    const activeId = await createDeal("active2", {});
    const archivedId = await createDeal("archived2", { archivedAt: new Date() });
    const deletedId = await createDeal("deleted2", { deletedAt: new Date() });

    const ids = new Set((await callList({ state: "active", limit: "500" })).map((r) => r.id));
    expect(ids.has(activeId)).toBe(true);
    expect(ids.has(archivedId)).toBe(false);
    expect(ids.has(deletedId)).toBe(false);
  });

  it("state=archived returns only archived, non-deleted deals", async () => {
    const archivedId = await createDeal("archived3", { archivedAt: new Date() });
    const activeId = await createDeal("active3", {});

    const ids = new Set((await callList({ state: "archived", limit: "500" })).map((r) => r.id));
    expect(ids.has(archivedId)).toBe(true);
    expect(ids.has(activeId)).toBe(false);
  });

  it("state=deleted returns deleted deals regardless of archived flag", async () => {
    const deletedId = await createDeal("deleted3", { deletedAt: new Date() });
    const bothId = await createDeal("both3", { archivedAt: new Date(), deletedAt: new Date() });

    const ids = new Set((await callList({ state: "deleted", limit: "500" })).map((r) => r.id));
    expect(ids.has(deletedId)).toBe(true);
    expect(ids.has(bothId)).toBe(true);
  });
});
