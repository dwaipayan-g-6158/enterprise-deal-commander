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
import router from "./exports";

// Same handler-extraction technique as routes/v2/analytics.vital-signs.test.ts
// and routes/v2/config.test.ts — no supertest harness exists in this repo. The
// /reports/pipeline handler calls res.send(html) rather than res.json, so the
// fake Response captures via `send` instead.
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

async function callPipelineReport(): Promise<string> {
  const handler = getHandler("/reports/pipeline");
  let captured: string | undefined;
  const fakeReq = { headers: {}, query: {}, params: {}, body: {} } as unknown as Request;
  const fakeRes = {
    setHeader: () => {},
    send: (body: string) => {
      captured = body;
    },
  } as unknown as Response;
  await handler(fakeReq, fakeRes);
  if (captured === undefined) throw new Error("Handler did not call res.send");
  return captured;
}

function totalTcvFromHtml(html: string): number {
  const m = html.match(/Total TCV<\/div><div class="value">\$([\d,]+)<\/div>/);
  if (!m) throw new Error("Could not find Total TCV KPI in report HTML");
  return Number(m[1].replace(/,/g, ""));
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

let store: CatalystTestStore;
let seq = 0;

// A Multi-Year Committed deal with a deliberately huge productRevenue so it
// sorts to the very top of activeDealRows() (ORDER BY productRevenue DESC)
// and is guaranteed to land in the "Top Deals by TCV" table (top 8 only).
// Correct TCV (calculateFlatTCV) = 50,000,000 x 3 + 10,000,000 = 160,000,000;
// the buggy inline sum instead produces 60,000,000.
async function createMultiYearDeal(): Promise<{ id: string; dealName: string }> {
  const dealName = `exports.tcv Multi-Year Test ${seq}`;
  const deal = await createEnterpriseDealsRepo(initCatalystApp({ headers: {} })).create({
    dealName,
    accountName: `exports.tcv Multi-Year Acct ${seq++}`,
    accountManager: "AM",
    technicalLead: "TL",
    salesStageId: STAGES.Discovery,
    pricingModelId: PRICING_MODELS["Multi-Year Committed"],
    servicesTierId: SERVICES_TIER_ID,
    contractTermYears: 3,
    // Deliberately huge so this deal sorts to the very top of
    // activeDealRows()'s productRevenue DESC ordering, which is what puts it in
    // the Top Deals table the assertions read. 50,000,000 x 3 + 10,000,000 =
    // 160,000,000 under calculateFlatTCV, versus a flat sum of 60,000,000.
    productRevenue: "50000000.00",
    servicesRevenue: "10000000.00",
    dealCurrency: "USD",
  });
  return { id: deal.id, dealName };
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
describe("GET /reports/pipeline — TCV honors the Multi-Year Committed term multiplier", () => {
  it("KPI Total TCV delta and the Top Deals table both reflect the term multiplier, not a flat sum", async () => {
    const before = totalTcvFromHtml(await callPipelineReport());
    const { dealName } = await createMultiYearDeal();
    const after = await callPipelineReport();

    // Fails today: pipelineFacts()'s per-row tcv is the inline
    // productRevenue + servicesRevenue sum (60,000,000), not
    // calculateFlatTCV's 160,000,000.
    expect(totalTcvFromHtml(after) - before).toBe(160_000_000);

    // Fails today for the same reason, in the separately-duplicated inline
    // calc feeding the "Top Deals by TCV" table row for this exact deal.
    const rowRegex = new RegExp(`<td>${escapeRegExp(dealName)}</td>.*?class="num">\\$([\\d,]+)</td></tr>`);
    const rowMatch = after.match(rowRegex);
    expect(rowMatch).not.toBeNull();
    expect(Number(rowMatch![1].replace(/,/g, ""))).toBe(160_000_000);
  });
});
