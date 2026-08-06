import { describe, it, expect } from "vitest";
import { db, pipelineTransitions, enterpriseDeals, pricingModels } from "@workspace/db";
import { and, eq } from "drizzle-orm";
import { calculateFlatTCV } from "@workspace/engine";
import { recordTransition, recordCreateTransition } from "./pipeline-transitions";

const TEST_AT = new Date("2026-03-01T00:00:00Z");
const CREATE_TEST_AT = new Date("2026-03-02T00:00:00Z");

// Skipped post-Catalyst-migration: lib/subscribers/pipeline-transitions.ts's
// recordTransition/recordCreateTransition now take an explicit `catalystApp`
// first argument and read/write v2_pipeline_transitions via Catalyst Data
// Store, not Drizzle/Postgres. `initCatalystApp(req)`-style Catalyst
// session/headers can't be manufactured in a local Vitest run (same "Data
// Store isn't reachable from localhost" limitation already documented for
// lookups.engine-thresholds.test.ts), and this file's fixtures/assertions
// are Drizzle-only besides. Retire or rewrite as an integration test against
// the deployed AppSail app once Slice 6 seeding lands.
describe.skip("recordTransition", () => {
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
    // First arg is a Catalyst app handle post-migration — this whole describe
    // block is skipped (see the comment above), so the value never actually
    // matters at runtime; it's only here to satisfy the compiler.
    await recordTransition(undefined, {
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

    // See the comment on the other test in this (skipped) describe block.
    await recordCreateTransition(undefined, { dealId: deal.id, actor: "test", at: CREATE_TEST_AT });

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
