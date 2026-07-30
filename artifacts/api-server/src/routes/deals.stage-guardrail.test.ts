import { describe, it, expect, afterAll } from "vitest";
import type { Request, Response } from "express";
import { eq, inArray } from "drizzle-orm";
import {
  db,
  pool,
  enterpriseDeals,
  pricingModels,
  servicesTiers,
  pipelineStages,
  stakeholders,
} from "@workspace/db";
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
const createdDealIds: string[] = [];

async function findStageId(stageName: string): Promise<number> {
  const stages = await db.select().from(pipelineStages);
  const stage = stages.find((s) => s.stageName === stageName);
  if (!stage) throw new Error(`Seed data missing pipeline stage "${stageName}"`);
  return stage.id;
}

async function createDeal(tag: string, stageName: string): Promise<string> {
  const [pricing] = await db.select().from(pricingModels).limit(1);
  const [tier] = await db.select().from(servicesTiers).limit(1);
  const stageId = await findStageId(stageName);

  const [deal] = await db
    .insert(enterpriseDeals)
    .values({
      dealName: `Stage Guardrail ${tag} ${Date.now()}`,
      accountName: `Stage Guardrail Acct ${tag} ${Date.now()}`,
      accountManager: "AM",
      technicalLead: "TL",
      salesStageId: stageId,
      pricingModelId: pricing.id,
      servicesTierId: tier.id,
      productRevenue: "1000.00",
      servicesRevenue: "0",
    })
    .returning({ id: enterpriseDeals.id });
  createdDealIds.push(deal.id);
  return deal.id;
}

async function callUpdate(id: string, body: Record<string, unknown>) {
  const handler = getHandler(dealsRouter, "put", "/deals/:id");
  let captured: unknown;
  let thrown:
    | (Error & { status?: number; code?: string; patternCodes?: string[] })
    | undefined;
  const fakeReq = { params: { id }, body, actor } as unknown as Request;
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
  const [row] = await db
    .select({ salesStageId: enterpriseDeals.salesStageId })
    .from(enterpriseDeals)
    .where(eq(enterpriseDeals.id, id));
  return row.salesStageId;
}

afterAll(async () => {
  if (createdDealIds.length > 0) {
    await db.delete(enterpriseDeals).where(inArray(enterpriseDeals.id, createdDealIds));
  }
  await pool.end();
});

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
    await db.insert(stakeholders).values({
      dealId: id,
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
