import { describe, it, expect, beforeAll, beforeEach } from "vitest";
import type { Request, Response } from "express";
import { initCatalystApp, createEnterpriseDealsRepo } from "@workspace/db/catalyst";
import {
  installCatalystFake,
  seedStandardLookups,
  STAGES,
  PRICING_MODELS,
  SERVICES_TIER_ID,
  type CatalystTestStore,
} from "../../test-support/catalyst-test-app";
import router from "./config";

// Same handler-extraction technique as routes/v2/config.test.ts and
// routes/v2/analytics.vital-signs.test.ts — no supertest harness exists in
// this repo.
function getHandler(method: "get" | "post", path: string) {
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

interface TestPatternMatch { dealId: string; dealName: string; accountName: string }
interface TestPatternResponse { data: { matchCount: number; matches: TestPatternMatch[] } }

async function callTestPattern(comparisonValue: string): Promise<TestPatternResponse["data"]> {
  const handler = getHandler("post", "/custom-patterns/test");
  let captured: TestPatternResponse | undefined;
  const fakeReq = {
    body: {
      pattern_name: "TCV multiplier probe",
      severity: "YELLOW",
      weight: 1,
      alert_message_template: "probe",
      conditions: [
        { field_path: "financials.calculatedTCV", operator: "gte", comparison_value: comparisonValue, sort_order: 0 },
      ],
    },
  } as unknown as Request;
  const fakeRes = { json: (body: TestPatternResponse) => { captured = body; } } as unknown as Response;
  await handler(fakeReq, fakeRes);
  if (!captured) throw new Error("Handler did not call res.json");
  return captured.data;
}

let store: CatalystTestStore;
let seq = 0;

// A Multi-Year Committed deal: correct TCV (calculateFlatTCV) is
// 1,000,000 x 3 + 200,000 = 3,200,000. The buggy inline sum instead produces
// 1,200,000 — which sits BELOW a 2,000,000 threshold, so a >= 2,000,000
// pattern condition distinguishes the two unambiguously without needing a
// before/after delta (this is a membership check, not an additive total).
async function createMultiYearDeal(): Promise<string> {
  const deal = await createEnterpriseDealsRepo(initCatalystApp({ headers: {} })).create({
    dealName: `config.tcv Multi-Year Test ${seq}`,
    accountName: `config.tcv Multi-Year Acct ${seq++}`,
    accountManager: "AM",
    technicalLead: "TL",
    salesStageId: STAGES.Discovery,
    pricingModelId: PRICING_MODELS["Multi-Year Committed"],
    servicesTierId: SERVICES_TIER_ID,
    contractTermYears: 3,
    productRevenue: "1000000.00",
    servicesRevenue: "200000.00",
    dealCurrency: "USD",
  });
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

// Runs against the in-memory Data Store (test-support/catalyst-test-app.ts).
describe("POST /custom-patterns/test — normalizedDeals() TCV honors the term multiplier", () => {
  it("matches a Multi-Year Committed deal against a threshold only the correctly-multiplied TCV clears", async () => {
    const dealId = await createMultiYearDeal();

    // Fails today: normalizedDeals() computes calculatedTCV as
    // productRevenue + servicesRevenue (1,200,000), which is below 2,000,000,
    // so the deal would NOT appear in matches even though its real TCV
    // (3,200,000) clears the threshold comfortably.
    const { matches } = await callTestPattern("2000000");
    const matchedIds = new Set(matches.map((m) => m.dealId));
    expect(matchedIds.has(dealId)).toBe(true);
  });
});
