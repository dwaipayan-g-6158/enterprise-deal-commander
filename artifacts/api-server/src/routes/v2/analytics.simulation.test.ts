import { describe, it, expect, beforeAll, beforeEach } from "vitest";
import type { Request, Response } from "express";
import {
  initCatalystApp,
  createEnterpriseDealsRepo,
  formatCatalystDateTime,
} from "@workspace/db/catalyst";
import {
  installCatalystFake,
  seedStandardLookups,
  STAGES,
  PRICING_MODEL_ID,
  SERVICES_TIER_ID,
  type CatalystTestStore,
} from "../../test-support/catalyst-test-app";
import router from "./analytics";

// Same handler-extraction technique as analytics.next-actions.test.ts and
// analytics.archive-parity.test.ts — no supertest harness exists in this repo.
// Runs against the in-memory Data Store (test-support/catalyst-test-app.ts).
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

interface SimulationData {
  iterations: number;
  totalDeals: number;
  weightedPipeline: number;
  traditionalWeightedPipeline: number;
}

async function callSimulation(): Promise<SimulationData> {
  const handler = getHandler("get", "/analytics/simulation");
  let captured: { data: SimulationData } | undefined;
  // The smallest iteration count the handler accepts — the assertions below are
  // all on deterministic fields (deal count and the two weighted sums), never
  // on the RNG-driven percentiles, so there is nothing to gain from 10,000.
  const fakeReq = { query: { iterations: "1000" }, params: {}, headers: {} } as unknown as Request;
  const fakeRes = {
    json: (body: { data: SimulationData }) => {
      captured = body;
    },
  } as unknown as Response;
  await handler(fakeReq, fakeRes);
  if (!captured) throw new Error("Handler did not call res.json");
  return captured.data;
}

let store: CatalystTestStore;
let seq = 0;

const app = () => initCatalystApp({ headers: {} });

const OPEN_TCV = 1_000_000;
const OPEN_WIN_PCT = 50;
// Deliberately huge so any leak into the forecast would be unmissable.
const CLOSED_TCV = 50_000_000;

async function createDeal(
  tag: string,
  stageName: "Discovery" | "Closed-Won",
  productRevenue: number,
  opts: { archivedAt?: Date } = {},
): Promise<string> {
  const deal = await createEnterpriseDealsRepo(app()).create({
    dealName: `Simulation ${tag} ${seq}`,
    accountName: `Simulation Acct ${tag} ${seq++}`,
    accountManager: "AM",
    technicalLead: "TL",
    salesStageId: STAGES[stageName],
    pricingModelId: PRICING_MODEL_ID,
    servicesTierId: SERVICES_TIER_ID,
    productRevenue: productRevenue.toFixed(2),
    servicesRevenue: "0",
    contractTermYears: 1,
    dealCurrency: "USD",
    winProbabilityPct: OPEN_WIN_PCT,
  });
  if (opts.archivedAt) {
    const touched = store.patchRaw(
      "enterprise_deals",
      (r) => r["id"] === deal.id,
      { archived_at: formatCatalystDateTime(opts.archivedAt) },
    );
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

describe("GET /analytics/simulation — closed deals never enter the forecast", () => {
  it("counts only the open deal, archived or not, in totalDeals and both weighted sums", async () => {
    // One open deal gives the forecast a non-zero expected value, so the
    // assertions are exact rather than "unchanged" — a handler returning
    // nothing at all would satisfy a pure before/after comparison.
    await createDeal("open", "Discovery", OPEN_TCV);
    await createDeal("won", "Closed-Won", CLOSED_TCV);
    await createDeal("won-archived", "Closed-Won", CLOSED_TCV, { archivedAt: new Date() });

    const result = await callSimulation();

    expect(result.totalDeals).toBe(1);
    // No predictive score exists for the open deal, so dealProbability falls
    // back to its manual win probability: 1,000,000 x 0.5.
    expect(result.weightedPipeline).toBe(OPEN_TCV * (OPEN_WIN_PCT / 100));
    expect(result.traditionalWeightedPipeline).toBe(OPEN_TCV * (OPEN_WIN_PCT / 100));
  });
});
