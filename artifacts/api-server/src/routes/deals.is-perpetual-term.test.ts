import { describe, it, expect, beforeAll, beforeEach } from "vitest";
import type { Request, Response } from "express";
import { initCatalystApp, createDealAuditLogRepo } from "@workspace/db/catalyst";
import {
  installCatalystFake,
  seedStandardLookups,
  STAGES,
  PRICING_MODEL_ID,
  SERVICES_TIER_ID,
  type CatalystTestStore,
} from "../test-support/catalyst-test-app";
import dealsRouter from "./deals";

// POST/GET/PUT round trip for the new is_perpetual_term flag — the four
// places §Phase 4 touches (create, read, update, audit) all agree.
//
// Same technique as deals.lifecycle.test.ts / deals.audit-coverage.test.ts —
// no supertest harness exists in this repo.
function getHandler(method: "get" | "post" | "put", path: string) {
  const stack = (dealsRouter as unknown as {
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

const actor = { id: "test-actor", username: "test", displayName: "Perpetual Term Test" };
const app = () => initCatalystApp({ headers: {} });

let store: CatalystTestStore;

async function call(handler: (req: Request, res: Response) => unknown, req: Partial<Request>) {
  let captured: unknown;
  const fakeReq = { query: {}, headers: {}, actor, ...req } as unknown as Request;
  const fakeRes = {
    json: (b: unknown) => { captured = b; },
    status: () => fakeRes,
  } as unknown as Response;
  await handler(fakeReq, fakeRes);
  return captured as { data: Record<string, unknown> };
}

beforeAll(() => {
  ({ store } = installCatalystFake());
});

beforeEach(() => {
  store.reset();
  seedStandardLookups(store);
});

describe("is_perpetual_term — create/read/update/audit round trip", () => {
  it("creates true, reads it back, updates to false, and reads that back", async () => {
    const created = await call(getHandler("post", "/deals"), {
      body: {
        deal_name: "Perpetual Term Round Trip",
        account_name: "Round Trip Acct",
        account_manager: "AM",
        technical_lead: "TL",
        sales_stage_id: STAGES.Discovery,
        pricing_model_id: PRICING_MODEL_ID,
        services_tier_id: SERVICES_TIER_ID,
        product_revenue: 1000,
        services_revenue: 0,
        contract_term_years: 1,
        is_perpetual_term: true,
        deal_currency: "USD",
      },
    });
    const id = created.data.id as string;
    expect(created.data.isPerpetualTerm).toBe(true);

    const read = await call(getHandler("get", "/deals/:id"), { params: { id } });
    expect(read.data.isPerpetualTerm).toBe(true);

    const updated = await call(getHandler("put", "/deals/:id"), {
      params: { id },
      body: { is_perpetual_term: false },
    });
    expect(updated.data.isPerpetualTerm).toBe(false);

    const readAgain = await call(getHandler("get", "/deals/:id"), { params: { id } });
    expect(readAgain.data.isPerpetualTerm).toBe(false);

    // Exactly one audit row for this field, recording the true -> false flip.
    const rows = await createDealAuditLogRepo(app()).list(id);
    const auditRows = rows.filter((r) => r.fieldChanged === "is_perpetual_term");
    expect(auditRows).toHaveLength(1);
    expect(auditRows[0].oldValue).toBe("true");
    expect(auditRows[0].newValue).toBe("false");
  });

  it("defaults to false when omitted on create", async () => {
    const created = await call(getHandler("post", "/deals"), {
      body: {
        deal_name: "Perpetual Term Default",
        account_name: "Default Acct",
        account_manager: "AM",
        technical_lead: "TL",
        sales_stage_id: STAGES.Discovery,
        pricing_model_id: PRICING_MODEL_ID,
        services_tier_id: SERVICES_TIER_ID,
        product_revenue: 1000,
        services_revenue: 0,
        contract_term_years: 3,
        deal_currency: "USD",
      },
    });
    expect(created.data.isPerpetualTerm).toBe(false);
  });
});
