import { describe, it, expect } from "vitest";
import { db, pipelineTransitions, enterpriseDeals, pricingModels } from "@workspace/db";
import { and, eq } from "drizzle-orm";
import { calculateFlatTCV } from "@workspace/engine";
import { recordTransition, recordCreateTransition } from "./pipeline-transitions";

const TEST_AT = new Date("2026-03-01T00:00:00Z");
const CREATE_TEST_AT = new Date("2026-03-02T00:00:00Z");

describe("recordTransition", () => {
  it("writes a forward transition row with residence days", async () => {
    // assumes a seeded deal; pick the first active deal
    const [deal] = await db.select({ id: enterpriseDeals.id }).from(enterpriseDeals).limit(1);
    // Clean up any prior row at this exact timestamp so the insert is not skipped
    // by onConflictDoNothing (which would leave a stale null daysInFromStage).
    await db.delete(pipelineTransitions).where(
      and(
        eq(pipelineTransitions.dealId, deal.id),
        eq(pipelineTransitions.transitionedAt, TEST_AT),
      ),
    );
    await recordTransition({
      dealId: deal.id, fromStageId: 1, toStageId: 2, overridden: false,
      actor: "test", at: TEST_AT,
    });
    const rows = await db.select().from(pipelineTransitions).where(eq(pipelineTransitions.dealId, deal.id));
    const row = rows.find((r) => r.transitionedAt.toISOString().startsWith("2026-03-01"));
    expect(row?.transitionType).toBe("forward");
    // daysInFromStage is populated from deal.stageEnteredAt (first-move fallback).
    // enterpriseDeals.stageEnteredAt is NOT NULL .defaultNow(), so this is always >= 0.
    expect(row?.daysInFromStage).toBeGreaterThanOrEqual(0);
  });

  it("a deal.created event produces a pipeline_transitions row with fromStageId null and the correct TCV", async () => {
    const [deal] = await db
      .select({
        id: enterpriseDeals.id,
        salesStageId: enterpriseDeals.salesStageId,
        productRevenue: enterpriseDeals.productRevenue,
        servicesRevenue: enterpriseDeals.servicesRevenue,
        contractTermYears: enterpriseDeals.contractTermYears,
        pricingModel: pricingModels.modelName,
      })
      .from(enterpriseDeals)
      .leftJoin(pricingModels, eq(enterpriseDeals.pricingModelId, pricingModels.id))
      .limit(1);

    // Clean up any prior row at this exact timestamp so the insert is not
    // skipped by onConflictDoNothing.
    await db.delete(pipelineTransitions).where(
      and(
        eq(pipelineTransitions.dealId, deal.id),
        eq(pipelineTransitions.transitionedAt, CREATE_TEST_AT),
      ),
    );

    await recordCreateTransition({ dealId: deal.id, actor: "test", at: CREATE_TEST_AT });

    const rows = await db.select().from(pipelineTransitions).where(
      and(
        eq(pipelineTransitions.dealId, deal.id),
        eq(pipelineTransitions.transitionedAt, CREATE_TEST_AT),
      ),
    );
    expect(rows).toHaveLength(1);
    const row = rows[0];
    expect(row.fromStageId).toBeNull();
    expect(row.toStageId).toBe(deal.salesStageId);
    expect(row.transitionType).toBe("create");
    const expectedTcv = calculateFlatTCV({
      productRevenue: Number(deal.productRevenue) || 0,
      servicesRevenue: Number(deal.servicesRevenue) || 0,
      contractTermYears: deal.contractTermYears,
      pricingModel: deal.pricingModel ?? "",
    });
    expect(Number(row.tcvAtTransition)).toBe(Math.round(expectedTcv));
  });
});
