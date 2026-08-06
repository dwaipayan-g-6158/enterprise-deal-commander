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
import dealsRouter from "./deals";
import dispositionsRouter from "./dispositions";

// Same technique as deals.lifecycle.test.ts / deals.audit-coverage.test.ts /
// routes/v2/config.test.ts — no supertest harness exists in this repo.
function getHandler(
  router: typeof dealsRouter,
  method: "get" | "post" | "put" | "delete",
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

const actor = { id: "test-actor", username: "test", displayName: "Stage Guardrail Test" };

let store: CatalystTestStore;
let seq = 0;

function findStageId(stageName: keyof typeof STAGES): number {
  return STAGES[stageName];
}

/** Created through the real repository, so the stored row shape is the real one. */
async function createDeal(tag: string, stageName: keyof typeof STAGES): Promise<string> {
  const deal = await createEnterpriseDealsRepo(initCatalystApp({ headers: {} })).create({
    dealName: `Stage Guardrail ${tag} ${seq}`,
    accountName: `Stage Guardrail Acct ${tag} ${seq++}`,
    accountManager: "AM",
    technicalLead: "TL",
    salesStageId: findStageId(stageName),
    pricingModelId: PRICING_MODEL_ID,
    servicesTierId: SERVICES_TIER_ID,
    productRevenue: "1000.00",
    servicesRevenue: "0",
    contractTermYears: 1,
    dealCurrency: "USD",
  });
  return deal.id;
}

async function callUpdate(id: string, body: Record<string, unknown>) {
  const handler = getHandler(dealsRouter, "put", "/deals/:id");
  let captured: unknown;
  let thrown:
    | (Error & { status?: number; code?: string; patternCodes?: string[] })
    | undefined;
  const fakeReq = { params: { id }, body, actor, headers: {}, query: {} } as unknown as Request;
  const fakeRes = {
    json: (b: unknown) => {
      captured = b;
    },
  } as unknown as Response;
  try {
    await handler(fakeReq, fakeRes);
  } catch (err) {
    thrown = err as typeof thrown;
  }
  return { captured, thrown };
}

async function callDisposition(
  dealId: string,
  patternCode: string,
  body: Record<string, unknown>,
) {
  const handler = getHandler(
    dispositionsRouter,
    "put",
    "/deals/:dealId/alerts/:patternCode/disposition",
  );
  let captured: unknown;
  let thrown: (Error & { status?: number; code?: string }) | undefined;
  const fakeReq = {
    params: { dealId, patternCode },
    body,
    actor,
    headers: {},
    query: {},
  } as unknown as Request;
  const fakeRes = {
    json: (b: unknown) => {
      captured = b;
    },
  } as unknown as Response;
  try {
    await handler(fakeReq, fakeRes);
  } catch (err) {
    thrown = err as typeof thrown;
  }
  return { captured, thrown };
}

async function currentStage(id: string): Promise<number> {
  const deal = await createEnterpriseDealsRepo(initCatalystApp({ headers: {} })).getById(id);
  if (!deal) throw new Error(`deal ${id} vanished`);
  return deal.salesStageId;
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
// `engine_thresholds` is deliberately left empty: getThresholds() overlays DB
// rows onto DEFAULT_THRESHOLDS, so the risk engine here runs on exactly the
// configuration a fresh install has.
describe("PUT/PATCH /deals/:id — stage-advancement guardrail blocking-alert predicate", () => {
  it("acknowledging a RED alert does NOT waive the stage-advancement guardrail", async () => {
    // Validation is past Discovery with no gates completed, so
    // MISSING_STRUCTURAL_ANCHOR (RED, weight 90) fires unconditionally.
    const id = await createDeal("ack-red", "Validation");

    const { thrown: dispThrown } = await callDisposition(
      id,
      "MISSING_STRUCTURAL_ANCHOR",
      { disposition: "acknowledge" },
    );
    expect(dispThrown).toBeUndefined();

    const commercial = await findStageId("Commercial");
    const { thrown } = await callUpdate(id, { sales_stage_id: commercial });
    expect(thrown?.status).toBe(409);
    expect(thrown?.code).toBe("STAGE_GUARDRAIL");
    expect(thrown?.patternCodes).toContain("MISSING_STRUCTURAL_ANCHOR");

    // Stage must not have moved.
    expect(await currentStage(id)).not.toBe(commercial);
  });

  it("a hostile decision-maker (contextual RED alert) blocks stage advancement", async () => {
    // Created in Discovery so MISSING_STRUCTURAL_ANCHOR does not also fire —
    // isolates HOSTILE_STAKEHOLDER as the blocking pattern under test.
    const id = await createDeal("hostile-stakeholder", "Discovery");
    await createStakeholdersRepo(initCatalystApp({ headers: {} })).create(id, {
      name: "Hostile VP",
      roleType: "Economic Buyer",
      influenceLevel: "High",
      sentiment: "Hostile",
      isDecisionMaker: true,
    });

    const validation = await findStageId("Validation");
    const { thrown } = await callUpdate(id, { sales_stage_id: validation });
    expect(thrown?.status).toBe(409);
    expect(thrown?.code).toBe("STAGE_GUARDRAIL");
    expect(thrown?.patternCodes).toContain("HOSTILE_STAKEHOLDER");

    expect(await currentStage(id)).not.toBe(validation);
  });

  it("accepting a RED alert (with rationale) still clears the guardrail — unchanged behavior", async () => {
    const id = await createDeal("accept-red", "Validation");

    const { thrown: dispThrown } = await callDisposition(
      id,
      "MISSING_STRUCTURAL_ANCHOR",
      {
        disposition: "accept",
        rationale: "Reviewed with VP Eng; risk explicitly accepted for now.",
      },
    );
    expect(dispThrown).toBeUndefined();

    const commercial = await findStageId("Commercial");
    const { thrown, captured } = await callUpdate(id, {
      sales_stage_id: commercial,
    });
    expect(thrown).toBeUndefined();
    expect(captured).toBeDefined();
    expect(await currentStage(id)).toBe(commercial);
  });
});
