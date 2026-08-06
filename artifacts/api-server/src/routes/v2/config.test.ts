import { describe, it, expect, beforeAll, beforeEach } from "vitest";
import type { Request, Response } from "express";
import {
  initCatalystApp,
  createEnterpriseDealsRepo,
  createSettingsChangeLogRepo,
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
import router from "./config";

// Mirrors routes/v2/analytics.vital-signs.test.ts: no supertest harness exists
// in this repo, so pull the real handler off the router's stack and call it
// directly — this exercises production code, not a reimplementation of it.
// Runs against the in-memory Data Store (test-support/catalyst-test-app.ts).
function getHandler(method: "get" | "post" | "put", path: string) {
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

const actor = { id: "test-actor", username: "test-actor", displayName: "Test Actor", role: "admin" };

async function callTestPattern(): Promise<TestPatternResponse["data"]> {
  const handler = getHandler("post", "/custom-patterns/test");
  let captured: TestPatternResponse | undefined;
  const fakeReq = {
    headers: {},
    query: {},
    params: {},
    body: {
      pattern_name: "Preview probe",
      severity: "YELLOW",
      weight: 1,
      alert_message_template: "probe",
      // gte 0 matches every deal — revenue is never negative (the API contract
      // enforces `minimum: 0`) — so this condition is purely a vehicle to
      // exercise normalizedDeals()'s live-only filter, not the pattern-matching
      // logic.
      conditions: [
        { field_path: "financials.calculatedTCV", operator: "gte", comparison_value: "0", sort_order: 0 },
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

const app = () => initCatalystApp({ headers: {} });

/** Created through the real repository, then patched into the archived/deleted state. */
async function createDeal(
  tag: string,
  overrides: { archivedAt?: Date; deletedAt?: Date } = {},
): Promise<string> {
  const deal = await createEnterpriseDealsRepo(app()).create({
    dealName: `Preview Leak Test ${tag} ${seq}`,
    accountName: `Preview Leak Acct ${tag} ${seq++}`,
    accountManager: "AM",
    technicalLead: "TL",
    salesStageId: STAGES["Closed-Lost"],
    pricingModelId: PRICING_MODEL_ID,
    servicesTierId: SERVICES_TIER_ID,
    productRevenue: "1000.00",
    servicesRevenue: "0",
    contractTermYears: 1,
    dealCurrency: "USD",
  });
  const patch: Record<string, unknown> = {};
  if (overrides.archivedAt) patch["archived_at"] = formatCatalystDateTime(overrides.archivedAt);
  if (overrides.deletedAt) patch["deleted_at"] = formatCatalystDateTime(overrides.deletedAt);
  if (Object.keys(patch).length > 0) {
    const touched = store.patchRaw("enterprise_deals", (r) => r["id"] === deal.id, patch);
    if (touched !== 1) throw new Error(`fixture patch touched ${touched} rows, expected 1`);
  }
  return deal.id;
}

// Feature id used only by the PUT /config/scoring-weights tests below. It is
// deliberately not one of the real predictive-score factors: mergeScoringWeights
// (lib/engine-config.ts) only merges rows whose featureId is already a known
// key, so writing a calibration row under this made-up id can never perturb the
// scoring weights any other assertion in this file depends on.
const TEST_FEATURE_ID = "test_probe_scoring_weight";

// Separate feature id for the oldValue regression below, so the "brand-new
// factor" (genuinely null oldValue) case stays unambiguous once the F2 test has
// already appended a row under TEST_FEATURE_ID.
const OLD_VALUE_TEST_FEATURE_ID = "test_probe_scoring_weight_oldvalue";

interface UpdateWeightsResponse { data: { updated: number; rescored: number } }

async function callUpdateScoringWeights(
  featureId = TEST_FEATURE_ID,
  weight = 0.5,
): Promise<UpdateWeightsResponse["data"]> {
  const handler = getHandler("put", "/config/scoring-weights");
  let captured: UpdateWeightsResponse | undefined;
  const fakeReq = {
    headers: {},
    query: {},
    params: {},
    body: { weights: [{ feature_id: featureId, weight }] },
    actor,
  } as unknown as Request;
  const fakeRes = { json: (body: UpdateWeightsResponse) => { captured = body; } } as unknown as Response;
  await handler(fakeReq, fakeRes);
  if (!captured) throw new Error("Handler did not call res.json");
  return captured.data;
}

async function changeLogFor(settingKey: string) {
  const rows = await createSettingsChangeLogRepo(app()).listAll();
  return rows.filter((r) => r.settingKey === settingKey);
}

beforeAll(() => {
  ({ store } = installCatalystFake());
});

beforeEach(() => {
  store.reset();
  seq = 0;
  seedStandardLookups(store);
  // getScoringWeights() memoises under the `lookup:` tier for the life of the
  // process, so a weight set by one test would otherwise survive store.reset()
  // and be read back by the next.
  cache.clear();
});

describe("PUT /config/scoring-weights — inline re-score (F2)", () => {
  it("returns a rescored count alongside the updated count", async () => {
    // Two live deals and one archived: the re-score covers active deals only,
    // so an exact count is what proves the pass actually ran. Asserting merely
    // ">= 0" would still pass if rescoreActiveDeals() were never called.
    await createDeal("rescore-live-a");
    await createDeal("rescore-live-b");
    await createDeal("rescore-archived", { archivedAt: new Date() });

    const { updated, rescored } = await callUpdateScoringWeights();

    expect(updated).toBe(1);
    expect(rescored).toBe(2);
    // ...and the re-score persisted, rather than just being counted.
    expect(store.count("v2_deal_scores")).toBe(2);
  });
});

describe("PUT /config/scoring-weights — audit entries record the real prior weight, not always null", () => {
  it("logs oldValue: null for a brand-new factor, then the real prior weight on the next PUT", async () => {
    await callUpdateScoringWeights(OLD_VALUE_TEST_FEATURE_ID, 0.3);
    await callUpdateScoringWeights(OLD_VALUE_TEST_FEATURE_ID, 0.6);

    const rows = await changeLogFor(OLD_VALUE_TEST_FEATURE_ID);
    expect(rows).toHaveLength(2);

    // Matched by newValue rather than by order: both rows are written within
    // the same second and `changed_at` has second resolution, so sorting by it
    // cannot distinguish them.
    const first = rows.find((r) => Number(r.newValue) === 0.3);
    const second = rows.find((r) => Number(r.newValue) === 0.6);
    expect(first).toBeDefined();
    expect(second).toBeDefined();

    // First-ever PUT for this featureId: no prior row exists — null is the
    // legitimate case here, not a hardcoded shortcut.
    expect(first!.oldValue).toBeNull();
    // Second PUT: oldValue must be the real weight set by the first PUT.
    expect(Number(second!.oldValue)).toBeCloseTo(0.3, 5);
  });
});

describe("POST /custom-patterns/test — excludes non-live deals", () => {
  it("matches a live deal but not an archived or deleted one", async () => {
    const liveId = await createDeal("live");
    const archivedId = await createDeal("archived", { archivedAt: new Date() });
    const deletedId = await createDeal("deleted", { deletedAt: new Date() });

    const { matches, matchCount } = await callTestPattern();
    const matchedIds = new Set(matches.map((m) => m.dealId));

    expect(matchedIds.has(liveId)).toBe(true);
    expect(matchedIds.has(archivedId)).toBe(false);
    expect(matchedIds.has(deletedId)).toBe(false);
    // The preview is the whole live set, not just "contains the live deal" —
    // this is what fails if the filter is dropped.
    expect(matchCount).toBe(1);
  });
});
