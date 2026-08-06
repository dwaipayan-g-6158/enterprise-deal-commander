import { describe, it, expect, beforeAll, beforeEach } from "vitest";
import type { Request, Response } from "express";
import { initCatalystApp, createEnterpriseDealsRepo, formatCatalystDateTime } from "@workspace/db/catalyst";
import {
  installCatalystFake,
  seedStandardLookups,
  STAGES,
  PRICING_MODEL_ID,
  SERVICES_TIER_ID,
  type CatalystTestStore,
} from "../test-support/catalyst-test-app";
import router from "./deals";

// Coverage for GET /deals?state= — the four lifecycle predicates. Per the audit
// that motivated the archive/restore work, zero tests touched three of them
// before this file existed.
//
// Runs against the in-memory Data Store (test-support/catalyst-test-app.ts);
// previously skipped on the mistaken grounds that a route test needs to reach
// Catalyst.

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

async function callList(query: Record<string, string>): Promise<{ id: string }[]> {
  const handler = getHandler("get", "/deals");
  let captured: { data: { id: string }[] } | undefined;
  const req = { query, headers: {} } as unknown as Request;
  const res = { json: (body: { data: { id: string }[] }) => { captured = body; } } as unknown as Response;
  await handler(req, res);
  if (!captured) throw new Error("Handler did not call res.json");
  return captured.data;
}

let store: CatalystTestStore;
let seq = 0;

const STAGE_ID = STAGES["Closed-Lost"];
const PRICING_ID = PRICING_MODEL_ID;
const TIER_ID = SERVICES_TIER_ID;

/**
 * Created through the real repository so the row shape is real, then patched
 * for the archived/deleted state, which no repo method exposes directly.
 */
async function createDeal(
  tag: string,
  state: { archivedAt?: Date; deletedAt?: Date },
): Promise<string> {
  const app = initCatalystApp({ headers: {} });
  const deal = await createEnterpriseDealsRepo(app).create({
    dealName: `State All Test ${tag} ${seq}`,
    accountName: `State All Acct ${tag} ${seq++}`,
    accountManager: "AM",
    technicalLead: "TL",
    salesStageId: STAGE_ID,
    pricingModelId: PRICING_ID,
    servicesTierId: TIER_ID,
    productRevenue: "1000.00",
    servicesRevenue: "0",
    contractTermYears: 1,
    dealCurrency: "USD",
  });
  const patch: Record<string, unknown> = {};
  if (state.archivedAt) patch["archived_at"] = formatCatalystDateTime(state.archivedAt);
  if (state.deletedAt) patch["deleted_at"] = formatCatalystDateTime(state.deletedAt);
  if (Object.keys(patch).length > 0) {
    const touched = store.patchRaw("enterprise_deals", (r) => r["id"] === deal.id, patch);
    if (touched !== 1) throw new Error(`fixture patch touched ${touched} rows, expected 1`);
  }
  return deal.id;
}

beforeAll(() => {
  ({ store } = installCatalystFake());
});

beforeEach(() => {
  store.reset();
  seq = 0;
  seedStandardLookups(store);
});

describe("GET /deals?state=... — all four predicates", () => {
  it("includes active and archived deals, excludes deleted, for state=all", async () => {
    const activeId = await createDeal("active", {});
    const archivedId = await createDeal("archived", { archivedAt: new Date() });
    const deletedId = await createDeal("deleted", { deletedAt: new Date() });

    const ids = new Set((await callList({ state: "all", limit: "500" })).map((r) => r.id));
    expect(ids.has(activeId)).toBe(true);
    expect(ids.has(archivedId)).toBe(true);
    expect(ids.has(deletedId)).toBe(false);
  });

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
