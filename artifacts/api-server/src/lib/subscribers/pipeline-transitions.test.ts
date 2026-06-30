import { describe, it, expect } from "vitest";
import { db, pipelineTransitions, enterpriseDeals } from "@workspace/db";
import { eq } from "drizzle-orm";
import { recordTransition } from "./pipeline-transitions";

describe("recordTransition", () => {
  it("writes a forward transition row with residence days", async () => {
    // assumes a seeded deal; pick the first active deal
    const [deal] = await db.select({ id: enterpriseDeals.id }).from(enterpriseDeals).limit(1);
    await recordTransition({
      dealId: deal.id, fromStageId: 1, toStageId: 2, overridden: false,
      actor: "test", at: new Date("2026-03-01T00:00:00Z"),
    });
    const rows = await db.select().from(pipelineTransitions).where(eq(pipelineTransitions.dealId, deal.id));
    const row = rows.find((r) => r.transitionedAt.toISOString().startsWith("2026-03-01"));
    expect(row?.transitionType).toBe("forward");
  });
});
