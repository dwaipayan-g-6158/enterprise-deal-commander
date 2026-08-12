import { describe, it, expect, beforeAll, beforeEach } from "vitest";
import type { Request, Response } from "express";
import {
  initCatalystApp,
  createEnterpriseDealsRepo,
  createStakeholdersRepo,
} from "@workspace/db/catalyst";
import {
  installCatalystFake,
  seedStandardLookups,
  STAGES,
  PRICING_MODEL_ID,
  SERVICES_TIER_ID,
  type CatalystTestStore,
} from "../test-support/catalyst-test-app";
import intelligenceRouter from "./intelligence";
import dispositionsRouter from "./dispositions";

// Same handler-plucking technique as deals.stage-guardrail.test.ts — there is
// no supertest harness in this repo.
function getHandler(
  router: typeof intelligenceRouter,
  method: "get" | "put",
  path: string,
) {
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

const actor = { id: "test-actor", username: "test", displayName: "Contextual Disposition Test" };

interface AlertShape {
  code: string;
  disposition: { state: string; snoozeUntil: string | null } | null;
}
interface Governance {
  alerts: AlertShape[];
  managedAlerts: AlertShape[];
  unmanagedAlertCount: number;
}

let store: CatalystTestStore;
let seq = 0;

async function createDealWithHostileDecisionMaker(): Promise<string> {
  const app = initCatalystApp({ headers: {} });
  const deal = await createEnterpriseDealsRepo(app).create({
    dealName: `Contextual Disposition ${seq}`,
    accountName: `Contextual Disposition Acct ${seq++}`,
    accountManager: "AM",
    technicalLead: "TL",
    // Discovery keeps MISSING_STRUCTURAL_ANCHOR quiet, isolating the
    // contextual alert as the one under test.
    salesStageId: STAGES.Discovery,
    pricingModelId: PRICING_MODEL_ID,
    servicesTierId: SERVICES_TIER_ID,
    productRevenue: "1000.00",
    servicesRevenue: "0",
    contractTermYears: 1,
    dealCurrency: "USD",
  });
  await createStakeholdersRepo(app).create(deal.id, {
    name: "Hostile VP",
    roleType: "Economic Buyer",
    influenceLevel: "High",
    sentiment: "Hostile",
    isDecisionMaker: true,
  });
  return deal.id;
}

async function readGovernance(dealId: string): Promise<Governance> {
  const handler = getHandler(intelligenceRouter, "get", "/deals/:dealId/intelligence");
  let captured: { data: { governance: Governance } } | undefined;
  const fakeReq = { params: { dealId }, actor, headers: {}, query: {} } as unknown as Request;
  const fakeRes = {
    json: (b: unknown) => {
      captured = b as typeof captured;
    },
  } as unknown as Response;
  await handler(fakeReq, fakeRes);
  if (!captured) throw new Error("intelligence route returned nothing");
  return captured.data.governance;
}

async function disposition(dealId: string, patternCode: string, body: Record<string, unknown>) {
  const handler = getHandler(
    dispositionsRouter,
    "put",
    "/deals/:dealId/alerts/:patternCode/disposition",
  );
  const fakeReq = {
    params: { dealId, patternCode },
    body,
    actor,
    headers: {},
    query: {},
  } as unknown as Request;
  const fakeRes = { json: () => {} } as unknown as Response;
  await handler(fakeReq, fakeRes);
}

beforeAll(() => {
  ({ store } = installCatalystFake());
});

beforeEach(() => {
  store.reset();
  seq = 0;
  seedStandardLookups(store);
});

/**
 * Contextual (competitive/stakeholder) alerts are merged into the response
 * outside the engine, so nothing partitions them for us. They used to be
 * appended to `alerts` wholesale with `disposition: null` hardcoded, which made
 * every disposition written against one a silent no-op: the PUT returned 200,
 * the row landed in `deal_alert_dispositions`, and the next read handed the
 * alert straight back as if nothing had happened.
 */
describe("GET /deals/:dealId/intelligence — contextual alert dispositions", () => {
  it("surfaces an undispositioned contextual alert as unmanaged", async () => {
    const id = await createDealWithHostileDecisionMaker();

    const governance = await readGovernance(id);
    expect(governance.alerts.map((a) => a.code)).toContain("HOSTILE_STAKEHOLDER");
    expect(governance.managedAlerts.map((a) => a.code)).not.toContain("HOSTILE_STAKEHOLDER");
  });

  it("moves a snoozed contextual alert into managedAlerts and keeps it there", async () => {
    const id = await createDealWithHostileDecisionMaker();
    await disposition(id, "HOSTILE_STAKEHOLDER", {
      disposition: "snooze",
      snooze_duration_days: 7,
    });

    const governance = await readGovernance(id);
    expect(governance.alerts.map((a) => a.code)).not.toContain("HOSTILE_STAKEHOLDER");

    const managed = governance.managedAlerts.find((a) => a.code === "HOSTILE_STAKEHOLDER");
    expect(managed).toBeDefined();
    expect(managed?.disposition?.state).toBe("snooze");
    // The expiry has to survive the round-trip, or the lazy-expiry read would
    // treat the snooze as already lapsed and delete the row.
    expect(managed?.disposition?.snoozeUntil).toBeTruthy();

    // A second read must agree with the first — the original bug only showed
    // itself on the refetch after the optimistic update.
    const again = await readGovernance(id);
    expect(again.managedAlerts.map((a) => a.code)).toContain("HOSTILE_STAKEHOLDER");
  });

  it("counts only unmanaged contextual alerts in unmanagedAlertCount", async () => {
    const id = await createDealWithHostileDecisionMaker();

    const before = await readGovernance(id);
    expect(before.unmanagedAlertCount).toBe(before.alerts.length);

    await disposition(id, "HOSTILE_STAKEHOLDER", { disposition: "acknowledge" });

    const after = await readGovernance(id);
    expect(after.unmanagedAlertCount).toBe(after.alerts.length);
    expect(after.unmanagedAlertCount).toBe(before.unmanagedAlertCount - 1);
  });
});
