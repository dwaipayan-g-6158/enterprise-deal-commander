import { describe, it, expect } from "vitest";
import { db, pipelineTransitions, enterpriseDeals } from "@workspace/db";
import { and, eq } from "drizzle-orm";
import { recordTransition } from "./pipeline-transitions";

const TEST_AT = new Date("2026-03-01T00:00:00Z");

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
});
