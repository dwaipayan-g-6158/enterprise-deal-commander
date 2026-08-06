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
  PRICING_MODEL_ID,
  SERVICES_TIER_ID,
  type CatalystTestStore,
} from "../../test-support/catalyst-test-app";
import { cache } from "../../lib/cache";
import router from "./analytics";

// The route handler isn't exported directly, but it's registered on the
// default-exported Router. Pull it off the stack so this test exercises the
// real production handler (query + baseline logic) rather than reimplementing
// it, without needing a supertest/HTTP harness (none exists in this repo).
// Runs against the in-memory Data Store (test-support/catalyst-test-app.ts).
function getHandler(path: string) {
  const stack = (router as unknown as { stack: Array<{ route?: { path: string; methods: Record<string, boolean>; stack: Array<{ handle: (req: Request, res: Response) => unknown }> } }> }).stack;
  const layer = stack.find((l) => l.route?.path === path && l.route.methods.get);
  if (!layer?.route) throw new Error(`Route GET ${path} not registered`);
  return layer.route.stack[0].handle;
}

interface VitalSigns {
  totalTCV: number;
  weightedPipeline: number;
  activeDeals: number;
  avgScore: number | null;
  baseline: { totalTCV: number; activeDeals: number; redAlerts: number } | null;
}

async function callVitalSigns(): Promise<VitalSigns> {
  const handler = getHandler("/analytics/vital-signs");
  let captured: { data: VitalSigns } | undefined;
  const fakeReq = { headers: {}, params: {}, query: {} } as unknown as Request;
  const fakeRes = { json: (body: { data: VitalSigns }) => { captured = body; } } as unknown as Response;
  await handler(fakeReq, fakeRes);
  if (!captured) throw new Error("Handler did not call res.json");
  return captured.data;
}

let store: CatalystTestStore;
let seq = 0;

const app = () => initCatalystApp({ headers: {} });

const OPEN_TCV = 1_000_000;
const OPEN_BASELINE_TCV = 500_000;
// Distinctive, large figures so any regression that re-includes the closed deal
// shows up unmistakably rather than as a plausible-looking total.
const CLOSED_TCV = 88_888_800;
const CLOSED_BASELINE_TCV = 77_777_700;

async function createDeal(
  tag: string,
  stageName: "Discovery" | "Closed-Won",
  productRevenue: number,
): Promise<string> {
  const deal = await createEnterpriseDealsRepo(app()).create({
    dealName: `Vital Signs ${tag} ${seq}`,
    accountName: `Vital Signs Acct ${tag} ${seq++}`,
    accountManager: "AM",
    technicalLead: "TL",
    salesStageId: STAGES[stageName],
    pricingModelId: PRICING_MODEL_ID,
    servicesTierId: SERVICES_TIER_ID,
    productRevenue: productRevenue.toFixed(2),
    servicesRevenue: "0",
    contractTermYears: 1,
    dealCurrency: "USD",
  });
  return deal.id;
}

/**
 * A snapshot dated well before the 7-day cutoff, carrying a distinctive TCV, a
 * RED health status and `redAlerts` RED-severity alerts in its payload — so a
 * regression that lets the wrong deal into the baseline shows up in
 * baseline.totalTCV AND baseline.redAlerts, not just one of them.
 */
function seedSnapshot(dealId: string, stageName: string, tcv: number, redAlerts: number): void {
  store.seedRaw("v2_deal_snapshots", [
    {
      id: crypto.randomUUID(),
      deal_id: dealId,
      reason: "test-seed",
      health_status: "RED",
      sales_stage_id: String(STAGES[stageName as keyof typeof STAGES]),
      sales_stage: stageName,
      calculated_tcv: String(tcv),
      normalized_tcv: String(tcv),
      payload_inline: JSON.stringify({
        governance: { alerts: Array.from({ length: redAlerts }, () => ({ severity: "RED" })) },
      }),
      created_by: "test",
      snapshot_at: formatCatalystDateTime(new Date(Date.now() - 10 * 86_400_000)),
    },
  ]);
}

beforeAll(() => {
  ({ store } = installCatalystFake());
});

beforeEach(() => {
  store.reset();
  seq = 0;
  seedStandardLookups(store);
  // getThresholds()/getFxRate() memoise under the `lookup:` tier for the life of
  // the process, so they would otherwise outlive store.reset().
  cache.clear();
});

describe("GET /analytics/vital-signs — closed deals excluded", () => {
  it("excludes a Closed-Won deal from current totals and from the 7-day baseline", async () => {
    // One open deal establishes non-zero expected values, so the assertions
    // below are exact rather than "unchanged" — a handler that returned zeroes
    // for everything would satisfy a pure before/after comparison.
    const openId = await createDeal("open", "Discovery", OPEN_TCV);
    seedSnapshot(openId, "Discovery", OPEN_BASELINE_TCV, 1);

    const closedId = await createDeal("closed", "Closed-Won", CLOSED_TCV);
    seedSnapshot(closedId, "Closed-Won", CLOSED_BASELINE_TCV, 3);

    const result = await callVitalSigns();

    // Current query (Part 1): only the open deal counts.
    expect(result.totalTCV).toBe(OPEN_TCV);
    expect(result.activeDeals).toBe(1);

    // Baseline (Part 2): the closed deal's snapshot must not move the ~7-day-ago
    // baseline either, even though it predates the cutoff and would otherwise
    // be the "latest" row for that deal.
    expect(result.baseline).not.toBeNull();
    expect(result.baseline!.totalTCV).toBe(OPEN_BASELINE_TCV);
    expect(result.baseline!.activeDeals).toBe(1);
    expect(result.baseline!.redAlerts).toBe(1);
  });

  it("reports no baseline at all when every snapshot is newer than the 7-day cutoff", async () => {
    const openId = await createDeal("recent-only", "Discovery", OPEN_TCV);
    store.seedRaw("v2_deal_snapshots", [
      {
        id: crypto.randomUUID(),
        deal_id: openId,
        reason: "test-seed",
        health_status: "GREEN",
        sales_stage_id: String(STAGES.Discovery),
        sales_stage: "Discovery",
        calculated_tcv: String(OPEN_BASELINE_TCV),
        normalized_tcv: String(OPEN_BASELINE_TCV),
        payload_inline: "{}",
        created_by: "test",
        snapshot_at: formatCatalystDateTime(new Date()),
      },
    ]);

    const result = await callVitalSigns();

    expect(result.totalTCV).toBe(OPEN_TCV);
    // A snapshot inside the window is not a baseline — comparing today against
    // today would report a zero delta on the dashboard rather than "no data".
    expect(result.baseline).toBeNull();
  });
});
