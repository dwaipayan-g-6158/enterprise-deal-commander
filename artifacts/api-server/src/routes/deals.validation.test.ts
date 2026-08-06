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
} from "../test-support/catalyst-test-app";
import dealsRouter from "./deals";
import lookupsRouter from "./lookups";

/**
 * Range validation that used to be a Postgres CHECK constraint.
 *
 * Data Store enforces no CHECK constraints at all, so the seven the schema
 * declared had to move somewhere. Four were already covered by the OpenAPI
 * spec (`minimum: 0` on both revenue fields, `minimum: 1` on contract term,
 * and the disposition enum) and a fifth, `gate_group_range`, guards a table
 * with no write route. These two were the real gap:
 *
 *   - `win_probability_range`  — win_probability_pct BETWEEN 0 AND 100
 *   - `fx_rate_positive`       — rate > 0
 *
 * The API boundary is the right home for them: every write reaches Data Store
 * through a Zod-validated route, so a repository-level check would only
 * duplicate this one layer further down.
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function getHandler(router: any, method: string, path: string) {
  const layer = router.stack.find(
    (l: { route?: { path: string; methods: Record<string, boolean> } }) =>
      l.route?.path === path && l.route.methods[method],
  );
  if (!layer?.route) throw new Error(`Route ${method.toUpperCase()} ${path} not registered`);
  return layer.route.stack[0].handle as (req: Request, res: Response) => unknown;
}

async function call(
  handler: (req: Request, res: Response) => unknown,
  req: Partial<Request>,
): Promise<{ status: number; thrown?: Error & { status?: number } }> {
  const fakeReq = {
    params: {},
    query: {},
    body: {},
    headers: {},
    actor: { id: "a", username: "a@example.com", displayName: "A", role: "admin" },
    ...req,
  } as unknown as Request;
  const res = { json: () => {}, status: () => res } as unknown as Response;
  try {
    await handler(fakeReq, res);
    return { status: 200 };
  } catch (err) {
    const e = err as Error & { status?: number };
    return { status: e.status ?? 0, thrown: e };
  }
}

let store: CatalystTestStore;

async function makeDeal(): Promise<string> {
  const deal = await createEnterpriseDealsRepo(initCatalystApp({ headers: {} })).create({
    dealName: "Validation Test",
    accountName: "Validation Acct",
    accountManager: "AM",
    technicalLead: "TL",
    salesStageId: STAGES.Discovery,
    pricingModelId: PRICING_MODEL_ID,
    servicesTierId: SERVICES_TIER_ID,
    productRevenue: "1000.00",
    servicesRevenue: "0",
    contractTermYears: 1,
    dealCurrency: "USD",
  });
  return deal.id;
}

beforeAll(() => {
  ({ store } = installCatalystFake());
});

beforeEach(() => {
  store.reset();
  seedStandardLookups(store);
});

describe("win_probability_pct — the win_probability_range CHECK, enforced at the API", () => {
  it("rejects above 100 on update", async () => {
    const id = await makeDeal();
    const { status } = await call(getHandler(dealsRouter, "put", "/deals/:id"), {
      params: { id },
      body: { win_probability_pct: 150 },
    });
    expect(status).toBe(400);
  });

  it("rejects below 0 on update", async () => {
    const id = await makeDeal();
    const { status } = await call(getHandler(dealsRouter, "put", "/deals/:id"), {
      params: { id },
      body: { win_probability_pct: -1 },
    });
    expect(status).toBe(400);
  });

  it("accepts the boundaries and null", async () => {
    const id = await makeDeal();
    for (const value of [0, 100, null]) {
      const { status, thrown } = await call(getHandler(dealsRouter, "put", "/deals/:id"), {
        params: { id },
        body: { win_probability_pct: value },
      });
      expect(thrown?.status, `win_probability_pct=${value} should be accepted`).not.toBe(400);
      expect(status).not.toBe(400);
    }
  });

  it("rejects above 100 on create too, not just update", async () => {
    const { status } = await call(getHandler(dealsRouter, "post", "/deals"), {
      body: {
        deal_name: "X",
        account_name: "Y",
        account_manager: "AM",
        technical_lead: "TL",
        sales_stage_id: STAGES.Discovery,
        pricing_model_id: PRICING_MODEL_ID,
        services_tier_id: SERVICES_TIER_ID,
        product_revenue: 1000,
        services_revenue: 0,
        contract_term_years: 1,
        deal_currency: "USD",
        win_probability_pct: 101,
      },
    });
    expect(status).toBe(400);
  });
});

describe("fx rate — the fx_rate_positive CHECK, enforced at the API", () => {
  const body = (rate: number) => ({
    updates: [{ base_currency: "USD", quote_currency: "EUR", rate, as_of: "2026-01-01" }],
  });

  it("rejects a zero rate", async () => {
    const { status } = await call(getHandler(lookupsRouter, "put", "/lookups/fx-rates"), {
      body: body(0),
    });
    expect(status).toBe(400);
  });

  it("rejects a negative rate", async () => {
    const { status } = await call(getHandler(lookupsRouter, "put", "/lookups/fx-rates"), {
      body: body(-1.5),
    });
    expect(status).toBe(400);
  });

  it("accepts a small positive rate", async () => {
    const { thrown } = await call(getHandler(lookupsRouter, "put", "/lookups/fx-rates"), {
      body: body(0.0001),
    });
    expect(thrown?.status).not.toBe(400);
  });
});
