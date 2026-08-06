import { describe, it, expect, afterAll } from "vitest";
import type { Request, Response } from "express";
import { eq } from "drizzle-orm";
import {
  db,
  pool,
  enterpriseDeals,
  pricingModels,
  servicesTiers,
  pipelineStages,
  dealScores,
  commanderAchievements,
} from "@workspace/db";
import type { AuthedRequest } from "../../lib/auth";
import router from "./analytics";

// Same technique as the other routes/v2/analytics.*.test.ts files: no
// supertest harness exists in this repo, so pull the real handler off the
// router's stack and call it directly.
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

function fakeReq(actorRole: "admin" | "reader", params: Record<string, string> = {}): Request {
  return {
    params,
    query: {},
    actor: { id: "test-actor", username: "test-actor", displayName: "Test Actor", role: actorRole },
  } as unknown as AuthedRequest as unknown as Request;
}

async function call<T>(handler: (req: Request, res: Response) => unknown, req: Request): Promise<T> {
  let captured: T | undefined;
  const fakeRes = { json: (body: T) => { captured = body; } } as unknown as Response;
  await handler(req, fakeRes);
  if (captured === undefined) throw new Error("Handler did not call res.json");
  return captured;
}

const createdDealIds: string[] = [];

async function createDeal(): Promise<string> {
  const [pricing] = await db.select().from(pricingModels).limit(1);
  const [tier] = await db.select().from(servicesTiers).limit(1);
  const stages = await db.select().from(pipelineStages);
  const stage = stages.find((s) => s.stageName === "Discovery");
  if (!stage) throw new Error('Seed data missing pipeline stage "Discovery"');

  const [deal] = await db
    .insert(enterpriseDeals)
    .values({
      dealName: `Score RBAC Route Test ${Date.now()}`,
      accountName: `Score RBAC Route Acct ${Date.now()}`,
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

async function scoreRowCount(dealId: string): Promise<number> {
  const rows = await db.select({ id: dealScores.id }).from(dealScores).where(eq(dealScores.dealId, dealId));
  return rows.length;
}

afterAll(async () => {
  for (const id of createdDealIds) {
    await db.delete(enterpriseDeals).where(eq(enterpriseDeals.id, id));
  }
  await pool.end();
});

// Skipped post-Catalyst-migration (both describe blocks in this file):
// routes/v2/analytics.ts's GET /deals/:dealId/score and GET /analytics/engagement
// now read/write via Catalyst Data Store, not Drizzle/Postgres.
// `initCatalystApp(req)` requires real Catalyst session/headers to succeed —
// a fake `Request` object in a local Vitest run can never provide that (same
// "Data Store isn't reachable from localhost" limitation already documented
// for lookups.engine-thresholds.test.ts). This file's fixtures also seed via
// Drizzle directly, which the migrated handlers no longer read. Retire or
// rewrite as an integration test against the deployed AppSail app once
// Slice 6 seeding lands.
describe.skip("GET /deals/:dealId/score — role-gated persistence", () => {
  it("a reader gets a score without appending to deal_scores", async () => {
    const dealId = await createDeal();
    const handler = getHandler("/deals/:dealId/score");

    const before = await scoreRowCount(dealId);
    const result = await call<{ data: { score: number } }>(handler, fakeReq("reader", { dealId }));
    expect(typeof result.data.score).toBe("number");
    expect(await scoreRowCount(dealId)).toBe(before);
  });

  it("an admin gets the same score AND appends to deal_scores", async () => {
    const dealId = await createDeal();
    const handler = getHandler("/deals/:dealId/score");

    const before = await scoreRowCount(dealId);
    const readerResult = await call<{ data: { score: number } }>(handler, fakeReq("reader", { dealId }));
    const adminResult = await call<{ data: { score: number } }>(handler, fakeReq("admin", { dealId }));

    expect(adminResult.data.score).toBe(readerResult.data.score);
    expect(await scoreRowCount(dealId)).toBe(before + 1);
  });
});

// Skipped post-Catalyst-migration — see the comment on the describe block above.
describe.skip("GET /analytics/engagement — achievement ledger is admin-only to write", () => {
  it("a reader's call never inserts into the app-global commander_achievements table", async () => {
    const handler = getHandler("/analytics/engagement");
    const before = await db.select({ code: commanderAchievements.achievementCode }).from(commanderAchievements);

    const result = await call<{ data: { achievements: unknown[] } }>(handler, fakeReq("reader"));
    expect(Array.isArray(result.data.achievements)).toBe(true);

    const after = await db.select({ code: commanderAchievements.achievementCode }).from(commanderAchievements);
    expect(after.length).toBe(before.length);
  });

  it("an admin's call still succeeds and returns the full achievement list", async () => {
    const handler = getHandler("/analytics/engagement");
    const result = await call<{ data: { achievements: unknown[] } }>(handler, fakeReq("admin"));
    expect(result.data.achievements.length).toBeGreaterThan(0);
  });
});
