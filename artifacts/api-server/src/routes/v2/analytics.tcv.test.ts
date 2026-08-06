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
import router from "./analytics";

// Same handler-extraction technique as analytics.vital-signs.test.ts and
// analytics.simulation.test.ts — no supertest harness exists in this repo.
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

interface PipelineData {
  totalTcv: number;
  activeDeals: number;
  byStage: { stage: string; count: number; tcv: number }[];
}

interface VitalSignsData {
  totalTCV: number;
  weightedPipeline: number;
  activeDeals: number;
  avgScore: number | null;
  baseline: { totalTCV: number; activeDeals: number; redAlerts: number } | null;
}

async function callHandler<T>(path: string): Promise<T> {
  const handler = getHandler(path);
  let captured: { data: T } | undefined;
  const fakeReq = { headers: {}, query: {}, params: {}, body: {} } as unknown as Request;
  const fakeRes = {
    json: (body: { data: T }) => {
      captured = body;
    },
  } as unknown as Response;
  await handler(fakeReq, fakeRes);
  if (!captured) throw new Error("Handler did not call res.json");
  return captured.data;
}

const callPipeline = () => callHandler<PipelineData>("/analytics/pipeline");
const callVitalSigns = () => callHandler<VitalSignsData>("/analytics/vital-signs");

let store: CatalystTestStore;
let seq = 0;

// A Multi-Year Committed deal: TCV must be productRevenue * contractTermYears
// + servicesRevenue (calculateFlatTCV), not the flat
// productRevenue + servicesRevenue sum that several analytics routes used to
// inline. $1,000,000/yr x 3yr + $200,000 services = $3,200,000 — the buggy
// inline sum instead produces $1,200,000, a 62.5% understatement.
async function createMultiYearDeal(): Promise<string> {
  const deal = await createEnterpriseDealsRepo(initCatalystApp({ headers: {} })).create({
    dealName: `analytics.tcv Multi-Year Test ${seq}`,
    accountName: `analytics.tcv Multi-Year Acct ${seq++}`,
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
describe("Multi-Year Committed TCV — calculateFlatTCV consolidation", () => {
  it("GET /analytics/pipeline: totalTcv reflects the full 3-year multiplier, not a flat sum", async () => {
    const before = await callPipeline();
    await createMultiYearDeal();
    const after = await callPipeline();

    // Fails today: the inline `(Number(productRevenue)||0) + (Number(servicesRevenue)||0)`
    // drops the contractTermYears multiplier, so the delta is 1,200,000 instead
    // of 3,200,000.
    expect(after.totalTcv - before.totalTcv).toBe(3_200_000);
    expect(after.activeDeals - before.activeDeals).toBe(1);
  });

  it("GET /analytics/vital-signs: totalTCV reflects the full 3-year multiplier, not a flat sum", async () => {
    const before = await callVitalSigns();
    await createMultiYearDeal();
    const after = await callVitalSigns();

    expect(after.totalTCV - before.totalTCV).toBe(3_200_000);
    expect(after.activeDeals - before.activeDeals).toBe(1);
  });
});
