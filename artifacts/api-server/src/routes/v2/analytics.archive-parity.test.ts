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

// NOTE: The originating task brief assumed this test would hit
// GET /analytics/win-loss with a { totalWon, totalLost, winRate } shape.
// Neither is true: that handler reads unconditionally from `dealMemory` — it
// never touches enterprise_deals, so archiving a deal can't move its numbers
// either before or after this task's fix. GET /analytics/pipeline is the
// endpoint that actually consumes the live-deal filter this task changes, so
// it's the one that can prove the pre-fix bug and the post-fix behavior.
// Verified by reading the handler before writing this test, per the brief's
// instruction not to guess.
//
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

interface StageBucket { stage: string; count: number; tcv: number }
interface PipelineData {
  totalTcv: number;
  activeDeals: number;
  openTcv: number;
  openDealCount: number;
  byStage: StageBucket[];
}

async function callPipeline(): Promise<PipelineData> {
  const handler = getHandler("get", "/analytics/pipeline");
  let captured: { data: PipelineData } | undefined;
  const fakeReq = { query: {}, params: {}, headers: {} } as unknown as Request;
  const fakeRes = { json: (body: { data: PipelineData }) => { captured = body; } } as unknown as Response;
  await handler(fakeReq, fakeRes);
  if (!captured) throw new Error("Handler did not call res.json");
  return captured.data;
}

function closedLostCount(data: PipelineData): number {
  return data.byStage.find((s) => s.stage === "Closed-Lost")?.count ?? 0;
}

let store: CatalystTestStore;
let seq = 0;

const app = () => initCatalystApp({ headers: {} });

const DEAL_TCV = 1000;

async function createClosedLostDeal(): Promise<string> {
  const deal = await createEnterpriseDealsRepo(app()).create({
    dealName: `Archive Parity Test ${seq}`,
    accountName: `Archive Parity Acct ${seq++}`,
    accountManager: "AM",
    technicalLead: "TL",
    salesStageId: STAGES["Closed-Lost"],
    pricingModelId: PRICING_MODEL_ID,
    servicesTierId: SERVICES_TIER_ID,
    productRevenue: DEAL_TCV.toFixed(2),
    servicesRevenue: "0",
    contractTermYears: 1,
    dealCurrency: "USD",
  });
  return deal.id;
}

function archive(id: string): void {
  const touched = store.patchRaw(
    "enterprise_deals",
    (r) => r["id"] === id,
    { archived_at: formatCatalystDateTime(new Date()) },
  );
  if (touched !== 1) throw new Error(`fixture patch touched ${touched} rows, expected 1`);
}

beforeAll(() => {
  ({ store } = installCatalystFake());
});

beforeEach(() => {
  store.reset();
  seq = 0;
  seedStandardLookups(store);
});

describe("GET /analytics/pipeline — archived deals still count", () => {
  it("keeps a Closed-Lost deal in the pipeline stage breakdown after it's archived", async () => {
    const id = await createClosedLostDeal();

    const afterCreate = await callPipeline();
    expect(closedLostCount(afterCreate)).toBe(1); // sanity: the new deal is already counted
    expect(afterCreate.totalTcv).toBe(DEAL_TCV);

    archive(id);

    const afterArchive = await callPipeline();
    // This is the bug this task fixes: archiving a Closed-Lost deal must NOT
    // remove it from the analytics breakdown, or portfolio numbers silently
    // shift the moment someone tidies up the roster.
    expect(closedLostCount(afterArchive)).toBe(1);
    expect(afterArchive.totalTcv).toBe(DEAL_TCV);
    expect(afterArchive.activeDeals).toBe(1);
  });

  it("still drops a soft-DELETED deal, so 'archived counts' is not just 'nothing is ever filtered'", async () => {
    const id = await createClosedLostDeal();
    const touched = store.patchRaw(
      "enterprise_deals",
      (r) => r["id"] === id,
      { deleted_at: formatCatalystDateTime(new Date()) },
    );
    expect(touched).toBe(1);

    const result = await callPipeline();
    expect(closedLostCount(result)).toBe(0);
    expect(result.totalTcv).toBe(0);
  });

  it("excludes a closed deal from the OPEN pipeline figures while keeping it in the totals", async () => {
    const closedId = await createClosedLostDeal();
    archive(closedId);

    const result = await callPipeline();
    // totalTcv/activeDeals span every stage; openTcv/openDealCount are the
    // "active pipeline" read the analytics header actually wants.
    expect(result.totalTcv).toBe(DEAL_TCV);
    expect(result.openTcv).toBe(0);
    expect(result.openDealCount).toBe(0);
  });
});
