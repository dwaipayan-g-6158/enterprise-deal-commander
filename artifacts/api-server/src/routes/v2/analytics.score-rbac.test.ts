import { describe, it, expect, beforeAll, beforeEach } from "vitest";
import type { Request, Response } from "express";
import { initCatalystApp, createEnterpriseDealsRepo } from "@workspace/db/catalyst";
import {
  installCatalystFake,
  seedStandardLookups,
  STAGES,
  PRICING_MODEL_ID,
  SERVICES_TIER_ID,
  type CatalystTestStore,
} from "../../test-support/catalyst-test-app";
import { cache } from "../../lib/cache";
import type { AuthedRequest } from "../../lib/auth";
import router from "./analytics";

// Same technique as the other routes/v2/analytics.*.test.ts files: no
// supertest harness exists in this repo, so pull the real handler off the
// router's stack and call it directly. Runs against the in-memory Data Store
// (test-support/catalyst-test-app.ts).
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
    headers: {},
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

let store: CatalystTestStore;
let seq = 0;

const app = () => initCatalystApp({ headers: {} });

async function createDeal(stageName: "Discovery" | "Closed-Won" = "Discovery"): Promise<string> {
  const deal = await createEnterpriseDealsRepo(app()).create({
    dealName: `Score RBAC Route Test ${seq}`,
    accountName: `Score RBAC Route Acct ${seq++}`,
    accountManager: "AM",
    technicalLead: "TL",
    salesStageId: STAGES[stageName],
    pricingModelId: PRICING_MODEL_ID,
    servicesTierId: SERVICES_TIER_ID,
    productRevenue: "1000.00",
    servicesRevenue: "0",
    contractTermYears: 1,
    dealCurrency: "USD",
  });
  return deal.id;
}

function scoreRowCount(dealId: string): number {
  return store.rows("v2_deal_scores").filter((r) => r["deal_id"] === dealId).length;
}

beforeAll(() => {
  ({ store } = installCatalystFake());
});

beforeEach(() => {
  store.reset();
  seq = 0;
  seedStandardLookups(store);
  cache.clear();
});

describe("GET /deals/:dealId/score — role-gated persistence", () => {
  it("a reader gets a score without appending to deal_scores", async () => {
    const dealId = await createDeal();
    const handler = getHandler("/deals/:dealId/score");

    const result = await call<{ data: { score: number } }>(handler, fakeReq("reader", { dealId }));
    expect(typeof result.data.score).toBe("number");
    expect(scoreRowCount(dealId)).toBe(0);
  });

  it("an admin gets the same score AND appends to deal_scores", async () => {
    const dealId = await createDeal();
    const handler = getHandler("/deals/:dealId/score");

    const readerResult = await call<{ data: { score: number } }>(handler, fakeReq("reader", { dealId }));
    const adminResult = await call<{ data: { score: number } }>(handler, fakeReq("admin", { dealId }));

    expect(adminResult.data.score).toBe(readerResult.data.score);
    expect(scoreRowCount(dealId)).toBe(1);
  });
});

describe("GET /analytics/engagement — achievement ledger is admin-only to write", () => {
  // A Closed-Won deal makes the `first_close` achievement true, so there is
  // genuinely something for an admin call to mint. Without it both roles write
  // nothing and the reader assertion would pass vacuously.
  const seedEarnableAchievement = () => createDeal("Closed-Won");

  it("a reader's call never inserts into the app-global commander_achievements table", async () => {
    await seedEarnableAchievement();
    const handler = getHandler("/analytics/engagement");

    const result = await call<{ data: { achievements: unknown[] } }>(handler, fakeReq("reader"));
    expect(Array.isArray(result.data.achievements)).toBe(true);
    expect(store.count("v2_commander_achievements")).toBe(0);
  });

  it("an admin's call mints the earned achievement", async () => {
    await seedEarnableAchievement();
    const handler = getHandler("/analytics/engagement");

    const result = await call<{ data: { achievements: { code: string; locked: boolean }[] } }>(
      handler,
      fakeReq("admin"),
    );

    expect(result.data.achievements.length).toBeGreaterThan(0);
    expect(result.data.achievements.find((a) => a.code === "first_close")?.locked).toBe(false);
    expect(store.rows("v2_commander_achievements").map((r) => r["achievement_code"])).toContain("first_close");
  });
});
