import { describe, it, expect, beforeAll, beforeEach } from "vitest";
import crypto from "node:crypto";
import {
  initCatalystApp,
  createEnterpriseDealsRepo,
  createPipelineTransitionsRepo,
  formatCatalystDateTime,
} from "@workspace/db/catalyst";
import { calculateFlatTCV } from "@workspace/engine";
import {
  installCatalystFake,
  seedStandardLookups,
  STAGES,
  PRICING_MODELS,
  SERVICES_TIER_ID,
  type CatalystTestStore,
} from "../../test-support/catalyst-test-app";
import { recordTransition, recordCreateTransition } from "./pipeline-transitions";

// Runs against the in-memory Data Store (test-support/catalyst-test-app.ts):
// recordTransition/recordCreateTransition take an explicit `catalystApp` and
// go through the real repositories, so nothing here is a stand-in for the
// production write path.
const TEST_AT = new Date("2026-03-01T00:00:00Z");
const CREATE_TEST_AT = new Date("2026-03-02T00:00:00Z");

let store: CatalystTestStore;
let seq = 0;

const app = () => initCatalystApp({ headers: {} });

async function createDeal(opts: {
  stageName?: keyof typeof STAGES;
  pricingModelName?: keyof typeof PRICING_MODELS;
  productRevenue?: string;
  servicesRevenue?: string;
  contractTermYears?: number;
  stageEnteredAt?: Date;
} = {}) {
  const deal = await createEnterpriseDealsRepo(app()).create({
    dealName: `Transitions Test ${seq}`,
    accountName: `Transitions Acct ${seq++}`,
    accountManager: "AM",
    technicalLead: "TL",
    salesStageId: STAGES[opts.stageName ?? "Discovery"],
    pricingModelId: PRICING_MODELS[opts.pricingModelName ?? "Annual Subscription"],
    servicesTierId: SERVICES_TIER_ID,
    productRevenue: opts.productRevenue ?? "1000000.00",
    servicesRevenue: opts.servicesRevenue ?? "200000.00",
    contractTermYears: opts.contractTermYears ?? 1,
    dealCurrency: "USD",
  });
  if (opts.stageEnteredAt) {
    const touched = store.patchRaw(
      "enterprise_deals",
      (r) => r["id"] === deal.id,
      { stage_entered_at: formatCatalystDateTime(opts.stageEnteredAt) },
    );
    if (touched !== 1) throw new Error(`fixture patch touched ${touched} rows, expected 1`);
  }
  return deal;
}

const transitionsFor = async (dealId: string) =>
  (await createPipelineTransitionsRepo(app()).listAll()).filter((t) => t.dealId === dealId);

beforeAll(() => {
  ({ store } = installCatalystFake());
});

beforeEach(() => {
  store.reset();
  seq = 0;
  seedStandardLookups(store);
});

describe("recordTransition", () => {
  it("writes a forward transition row with residence days", async () => {
    // 12 days before the transition, so daysInFromStage is an exact figure
    // rather than "some non-negative number" — the first-move fallback reads
    // the deal's own stageEnteredAt when no prior transition row exists.
    const deal = await createDeal({
      stageEnteredAt: new Date(TEST_AT.getTime() - 12 * 86_400_000),
    });

    await recordTransition(app(), {
      dealId: deal.id,
      fromStageId: STAGES.Discovery,
      toStageId: STAGES.Validation,
      overridden: false,
      actor: "test",
      at: TEST_AT,
    });

    const rows = await transitionsFor(deal.id);
    expect(rows).toHaveLength(1);
    expect(rows[0].transitionType).toBe("forward");
    expect(rows[0].daysInFromStage).toBe(12);
  });

  it("measures residence from the PREVIOUS transition once one exists, not stageEnteredAt", async () => {
    const deal = await createDeal({
      stageEnteredAt: new Date(TEST_AT.getTime() - 90 * 86_400_000),
    });

    // First move: 90 days, off stageEnteredAt.
    await recordTransition(app(), {
      dealId: deal.id,
      fromStageId: STAGES.Discovery,
      toStageId: STAGES.Validation,
      overridden: false,
      actor: "test",
      at: TEST_AT,
    });
    // Second move, 3 days later: must be 3, not 93.
    await recordTransition(app(), {
      dealId: deal.id,
      fromStageId: STAGES.Validation,
      toStageId: STAGES.Commercial,
      overridden: false,
      actor: "test",
      at: new Date(TEST_AT.getTime() + 3 * 86_400_000),
    });

    const rows = await transitionsFor(deal.id);
    expect(rows.map((r) => r.daysInFromStage)).toEqual([90, 3]);
  });

  it("classifies a move back down the funnel as backward", async () => {
    const deal = await createDeal({ stageName: "Commercial" });

    await recordTransition(app(), {
      dealId: deal.id,
      fromStageId: STAGES.Commercial,
      toStageId: STAGES.Discovery,
      overridden: false,
      actor: "test",
      at: TEST_AT,
    });

    expect((await transitionsFor(deal.id))[0].transitionType).toBe("backward");
  });

  it("takes tcvAtTransition from the latest snapshot at or before the transition", async () => {
    const deal = await createDeal();
    // Two snapshots either side of the transition: only the earlier one counts.
    for (const [offsetDays, tcv] of [[-5, 777], [+5, 999]] as const) {
      store.seedRaw("v2_deal_snapshots", [
        {
          id: crypto.randomUUID(),
          deal_id: deal.id,
          reason: "test-seed",
          health_status: "GREEN",
          sales_stage_id: String(STAGES.Discovery),
          sales_stage: "Discovery",
          calculated_tcv: String(tcv),
          normalized_tcv: String(tcv),
          payload_inline: "{}",
          created_by: "test",
          snapshot_at: formatCatalystDateTime(new Date(TEST_AT.getTime() + offsetDays * 86_400_000)),
        },
      ]);
    }

    await recordTransition(app(), {
      dealId: deal.id,
      fromStageId: STAGES.Discovery,
      toStageId: STAGES.Validation,
      overridden: false,
      actor: "test",
      at: TEST_AT,
    });

    expect((await transitionsFor(deal.id))[0].tcvAtTransition).toBe(777);
  });

  it("falls back to the deal's own economics when no snapshot exists yet", async () => {
    // Snapshots are periodic, not written synchronously with every deal change,
    // so a deal can transition before it has one. Leaving tcvAtTransition null
    // silently zeroed the Recycle & Exit waterfall's "Created" value.
    const deal = await createDeal({
      pricingModelName: "Multi-Year Committed",
      productRevenue: "1000000.00",
      servicesRevenue: "200000.00",
      contractTermYears: 3,
    });

    await recordTransition(app(), {
      dealId: deal.id,
      fromStageId: STAGES.Discovery,
      toStageId: STAGES.Validation,
      overridden: false,
      actor: "test",
      at: TEST_AT,
    });

    // Term-multiplied: 1,000,000 x 3 + 200,000. A flat sum would give 1,200,000.
    expect((await transitionsFor(deal.id))[0].tcvAtTransition).toBe(3_200_000);
  });
});

describe("recordCreateTransition", () => {
  it("produces a row with fromStageId null and the correct term-aware TCV", async () => {
    const deal = await createDeal({
      stageName: "Validation",
      pricingModelName: "Multi-Year Committed",
      productRevenue: "1000000.00",
      servicesRevenue: "200000.00",
      contractTermYears: 3,
    });

    await recordCreateTransition(app(), { dealId: deal.id, actor: "test", at: CREATE_TEST_AT });

    const rows = await transitionsFor(deal.id);
    expect(rows).toHaveLength(1);
    const row = rows[0];
    expect(row.fromStageId).toBeNull();
    expect(row.toStageId).toBe(STAGES.Validation);
    expect(row.transitionType).toBe("create");
    const expectedTcv = calculateFlatTCV({
      productRevenue: 1_000_000,
      servicesRevenue: 200_000,
      contractTermYears: 3,
      pricingModel: "Multi-Year Committed",
    });
    expect(row.tcvAtTransition).toBe(Math.round(expectedTcv));
    expect(row.daysInFromStage).toBeNull();
  });

  it("writes nothing for a deal that no longer exists", async () => {
    await recordCreateTransition(app(), {
      dealId: "00000000-0000-0000-0000-000000000000",
      actor: "test",
      at: CREATE_TEST_AT,
    });
    expect(store.count("v2_pipeline_transitions")).toBe(0);
  });
});
