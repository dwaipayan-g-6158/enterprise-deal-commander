import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import {
  initCatalystApp,
  createEnterpriseDealsRepo,
  createDealMemoryRepo,
} from "@workspace/db/catalyst";
import {
  installCatalystFake,
  seedStandardLookups,
  STAGES,
  PRICING_MODELS,
  SERVICES_TIER_ID,
  type CatalystTestStore,
} from "../../test-support/catalyst-test-app";
import { emitDealEvent } from "../events";
import { registerPostMortem } from "./post-mortem";

// Regression test: registerPostMortem() used to compute dealMemory.finalTcv
// as a flat productRevenue + servicesRevenue sum, dropping the
// contractTermYears multiplier for Multi-Year Committed deals. This is the
// highest-stakes of the TCV consolidation sites — historicalContext() reads
// dealMemory.finalTcv directly to compute avgWonTCV, so every deal that closed
// before this fix wrote a wrong historical TCV into the very number deal-size
// scoring compares against.
//
// Runs against the in-memory Data Store (test-support/catalyst-test-app.ts).
// The event must carry `catalystApp`: the subscriber no-ops without it (see
// lib/events.ts), which is asserted explicitly below.

const ACTOR = "vitest";

let store: CatalystTestStore;
let seq = 0;
let dispose: () => void;

const app = () => initCatalystApp({ headers: {} });

async function poll<T>(fn: () => Promise<T>, predicate: (v: T) => boolean, timeoutMs = 5_000): Promise<T> {
  const start = Date.now();
  let last = await fn();
  while (!predicate(last)) {
    if (Date.now() - start > timeoutMs) return last;
    await new Promise((r) => setTimeout(r, 10));
    last = await fn();
  }
  return last;
}

const memoryFor = async (dealId: string) =>
  (await createDealMemoryRepo(app()).listAll()).filter((r) => r.dealId === dealId);

async function createMultiYearDeal(): Promise<string> {
  const deal = await createEnterpriseDealsRepo(app()).create({
    dealName: `Post-Mortem TCV Test ${seq}`,
    accountName: `Post-Mortem TCV Acct ${seq++}`,
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

function closeDeal(dealId: string, toStageId: number, withApp = true): void {
  emitDealEvent("deal.stage_changed", {
    dealId,
    actor: ACTOR,
    fromStageId: STAGES.Discovery,
    toStageId,
    overridden: false,
    ...(withApp ? { catalystApp: app() } : {}),
  });
}

beforeAll(() => {
  ({ store } = installCatalystFake());
  // Registered alone rather than through registerSubscribers(), which also
  // starts the Drizzle-backed portfolio-rollup warm and two wall-clock timers.
  dispose = registerPostMortem();
});

afterAll(() => {
  dispose();
});

beforeEach(() => {
  store.reset();
  seq = 0;
  seedStandardLookups(store);
});

describe("post-mortem subscriber — finalTcv honors the Multi-Year Committed term multiplier", () => {
  it("persists dealMemory.finalTcv as productRevenue * contractTermYears + servicesRevenue on Closed-Won", async () => {
    const dealId = await createMultiYearDeal();

    closeDeal(dealId, STAGES["Closed-Won"]);

    const memoryRows = await poll(() => memoryFor(dealId), (rows) => rows.length >= 1);

    expect(memoryRows.length).toBe(1);
    expect(memoryRows[0].outcome).toBe("Won");
    // The bug: finalTcv was productRevenue + servicesRevenue (1,200,000),
    // dropping the x3 term multiplier that calculateFlatTCV applies.
    expect(memoryRows[0].finalTcv).toBe(3_200_000);
    // The rest of the pre-populated archive, so a regression that writes the
    // right TCV into an otherwise-empty row still fails.
    expect(memoryRows[0].pricingModel).toBe("Multi-Year Committed");
  });

  it("records a Closed-Lost deal as Lost with the same term-aware TCV", async () => {
    const dealId = await createMultiYearDeal();

    closeDeal(dealId, STAGES["Closed-Lost"]);

    const memoryRows = await poll(() => memoryFor(dealId), (rows) => rows.length >= 1);
    expect(memoryRows[0].outcome).toBe("Lost");
    expect(memoryRows[0].finalTcv).toBe(3_200_000);
  });

  it("archives nothing for a move between two open stages", async () => {
    const dealId = await createMultiYearDeal();

    closeDeal(dealId, STAGES.Validation);

    await new Promise((r) => setTimeout(r, 200));
    expect(await memoryFor(dealId)).toHaveLength(0);
  });

  it("upserts rather than duplicating when a closed deal's stage changes again", async () => {
    const dealId = await createMultiYearDeal();

    closeDeal(dealId, STAGES["Closed-Won"]);
    await poll(() => memoryFor(dealId), (rows) => rows.length >= 1);
    // Corrected after the fact: Won -> Lost must rewrite the one archive row,
    // not leave two contradictory ones behind for historicalContext to average.
    emitDealEvent("deal.stage_changed", {
      dealId,
      actor: ACTOR,
      fromStageId: STAGES["Closed-Won"],
      toStageId: STAGES["Closed-Lost"],
      overridden: false,
      catalystApp: app(),
    });
    const rows = await poll(() => memoryFor(dealId), (r) => r[0]?.outcome === "Lost");

    expect(rows).toHaveLength(1);
    expect(rows[0].outcome).toBe("Lost");
  });

  it("writes nothing when the event carries no catalystApp", async () => {
    const dealId = await createMultiYearDeal();
    closeDeal(dealId, STAGES["Closed-Won"], false);
    await new Promise((r) => setTimeout(r, 200));
    expect(await memoryFor(dealId)).toHaveLength(0);
  });
});
