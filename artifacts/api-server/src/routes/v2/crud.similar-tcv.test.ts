import { describe, it, expect, beforeAll, beforeEach } from "vitest";
import type { Request, Response } from "express";
import crypto from "node:crypto";
import {
  initCatalystApp,
  createEnterpriseDealsRepo,
  formatCatalystDateTime,
} from "@workspace/db/catalyst";
import {
  installCatalystFake,
  seedStandardLookups,
  STAGES,
  PRICING_MODELS,
  SERVICES_TIER_ID,
  type CatalystTestStore,
} from "../../test-support/catalyst-test-app";
import router from "./crud";

// Same handler-extraction technique as analytics.tcv.test.ts — no supertest
// harness exists in this repo. Runs against the in-memory Data Store
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

interface MemoryOut {
  id: string;
  accountName: string;
  finalTcv: number | null;
}

async function callSimilar(dealId: string): Promise<MemoryOut[]> {
  const handler = getHandler("/memory/similar/:dealId");
  let captured: { data: MemoryOut[] } | undefined;
  const fakeReq = { params: { dealId }, query: {}, body: {}, headers: {} } as unknown as Request;
  const fakeRes = {
    json: (body: { data: MemoryOut[] }) => {
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

/**
 * A Multi-Year Committed deal: $1,000,000/yr x 3yr + $200,000 services, so its
 * calculateFlatTCV is $3,200,000. Deriving TCV from raw productRevenue alone
 * yields $1,000,000 — a 68.75% understatement that throws off any comparison
 * against `dealMemory.finalTcv`, which IS term-multiplied.
 */
async function createMultiYearDeal(accountName: string): Promise<string> {
  const deal = await createEnterpriseDealsRepo(app()).create({
    dealName: `Similar TCV Multi-Year ${seq++}`,
    accountName,
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

function createMemoryRow(accountName: string, finalTcv: string): string {
  const id = crypto.randomUUID();
  store.seedRaw("v2_deal_memory", [
    {
      id,
      // No FK on deal_memory.deal_id; a synthetic id keeps this row independent
      // of the live deal.
      deal_id: crypto.randomUUID(),
      account_name: accountName,
      deal_name: `Archived ${accountName}`,
      outcome: "Won",
      final_tcv: finalTcv,
      archived_at: formatCatalystDateTime(new Date()),
    },
  ]);
  return id;
}

beforeAll(() => {
  ({ store } = installCatalystFake());
});

beforeEach(() => {
  store.reset();
  seq = 0;
  seedStandardLookups(store);
});

describe("GET /memory/similar/:dealId — TCV comparison parity", () => {
  it("matches an archived deal sized against the term-multiplied TCV, not raw productRevenue", async () => {
    // Distinct account names on both sides, so the only way this can match is
    // through the TCV-proximity branch (never the accountName shortcut).
    const dealId = await createMultiYearDeal("Similar Live Acct");
    // 3,000,000 vs the deal's real 3,200,000 TCV -> ratio 0.0625, well inside
    // the 0.5 window. Against the old raw-productRevenue figure of 1,000,000 the
    // ratio is 2.0, so this row was wrongly excluded.
    const nearId = createMemoryRow("Similar Archived Near", "3000000.00");

    const results = await callSimilar(dealId);
    expect(results.map((r) => r.id)).toContain(nearId);
  });

  it("still excludes an archived deal far outside the 0.5 window", async () => {
    const dealId = await createMultiYearDeal("Similar Live Acct Far");
    // 1,000,000 is what the buggy comparison used as the live deal's own TCV, so
    // it used to match exactly; against the real 3,200,000 it is 0.6875 away and
    // must NOT match. This pins the fix as a re-scaling, not a widening.
    const farId = createMemoryRow("Similar Archived Far", "1000000.00");

    const results = await callSimilar(dealId);
    expect(results.map((r) => r.id)).not.toContain(farId);
  });

  it("still matches on account name regardless of how far apart the TCVs are", async () => {
    const accountName = "Similar Same Acct";
    const dealId = await createMultiYearDeal(accountName);
    // Same account, wildly different size — the accountName shortcut must win
    // before the proximity window is ever consulted.
    const sameAcctId = createMemoryRow(accountName, "10.00");

    const results = await callSimilar(dealId);
    expect(results.map((r) => r.id)).toContain(sameAcctId);
  });
});
