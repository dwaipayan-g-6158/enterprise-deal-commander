import { describe, it, expect, beforeAll, beforeEach } from "vitest";
import type { Request, Response } from "express";
import { initCatalystApp, createEnterpriseDealsRepo } from "@workspace/db/catalyst";
import { installCatalystFake, type CatalystTestStore } from "../test-support/catalyst-test-app";
import router from "./deals";

// Regression coverage for the `sort` query param on GET /deals — previously
// unvalidated (any string accepted, silently sorting nothing when the key
// didn't exist on the serialized deal) and, even for a real numeric key,
// unsafe once a null was present (fell through to `String(null)` comparison,
// ordering "10" before "9"). See routes/deals.ts's SORTABLE_DEAL_KEYS.
//
// Runs against an in-memory Data Store (test-support/catalyst-test-app.ts).
// This file was skipped through the Catalyst migration on the grounds that
// "Data Store isn't reachable from localhost" — but the handler never needed
// to reach Catalyst, only to be handed a `catalystApp`, so the coverage was
// recoverable all along.

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

async function callList(query: Record<string, string>): Promise<DealSummary[]> {
  const handler = getHandler("get", "/deals");
  let captured: { data: DealSummary[] } | undefined;
  const fakeReq = { query, headers: {} } as unknown as Request;
  const fakeRes = { json: (body: { data: DealSummary[] }) => { captured = body; } } as unknown as Response;
  await handler(fakeReq, fakeRes);
  if (!captured) throw new Error("Handler did not call res.json");
  return captured.data;
}

let store: CatalystTestStore;

const STAGE_ID = 1;
const PRICING_ID = 1;
const TIER_ID = 1;

/** The lookup rows the deal list joins against, in raw Data Store shape. */
function seedLookups(): void {
  store.seedRaw("pipeline_stages", [
    { id: String(STAGE_ID), stage_name: "Discovery", stage_order: "1", is_active: "true" },
  ]);
  store.seedRaw("pricing_models", [
    { id: String(PRICING_ID), model_name: "Annual Subscription", is_active: "true" },
  ]);
  store.seedRaw("services_tiers", [
    { id: String(TIER_ID), tier_name: "None", is_active: "true" },
  ]);
}

/** Created through the real repository, so the stored row shape is the real one. */
async function createDeal(tag: string, winProbabilityPct: number | null): Promise<string> {
  const app = initCatalystApp({ headers: {} });
  const deal = await createEnterpriseDealsRepo(app).create({
    dealName: `Sort Test ${tag}`,
    accountName: `Sort Test Acct ${tag}`,
    accountManager: "AM",
    technicalLead: "TL",
    salesStageId: STAGE_ID,
    pricingModelId: PRICING_ID,
    servicesTierId: TIER_ID,
    productRevenue: "1000.00",
    servicesRevenue: "0",
    contractTermYears: 1,
    dealCurrency: "USD",
    winProbabilityPct,
  });
  return deal.id;
}

beforeAll(() => {
  ({ store } = installCatalystFake());
});

beforeEach(() => {
  store.reset();
  seedLookups();
});

describe("GET /deals?sort=... — allowlist and null-safe numeric ordering", () => {
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
