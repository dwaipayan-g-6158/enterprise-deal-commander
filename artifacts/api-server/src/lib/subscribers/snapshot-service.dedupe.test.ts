import { describe, it, expect, afterAll } from "vitest";
import { eq, inArray } from "drizzle-orm";
import {
  db,
  pool,
  enterpriseDeals,
  dealSnapshots,
  pricingModels,
  servicesTiers,
  pipelineStages,
} from "@workspace/db";
import { captureSnapshot } from "./snapshot-service";

// Exercises the real DB path of the periodic job's unchanged-skip, not just the
// pure fingerprint (covered in snapshot-service.test.ts). Uses a throwaway deal
// so no real pipeline data is touched; deal_snapshots cascades on delete.

const createdDealIds: string[] = [];

async function createDeal(): Promise<string> {
  const [pricing] = await db.select().from(pricingModels).limit(1);
  const [tier] = await db.select().from(servicesTiers).limit(1);
  const stages = await db.select().from(pipelineStages);
  const stage = stages.find((s) => s.stageName === "Discovery") ?? stages[0];
  if (!pricing || !tier || !stage) throw new Error("Seed data missing lookups");

  const stamp = Date.now();
  const [deal] = await db
    .insert(enterpriseDeals)
    .values({
      dealName: `Snapshot Dedupe ${stamp}`,
      accountName: `Snapshot Dedupe Acct ${stamp}`,
      accountManager: "AM",
      technicalLead: "TL",
      salesStageId: stage.id,
      pricingModelId: pricing.id,
      servicesTierId: tier.id,
      productRevenue: "1000.00",
      servicesRevenue: "0",
    })
    .returning({ id: enterpriseDeals.id });
  createdDealIds.push(deal.id);
  return deal.id;
}

async function snapshotCount(dealId: string): Promise<number> {
  const rows = await db
    .select({ id: dealSnapshots.id })
    .from(dealSnapshots)
    .where(eq(dealSnapshots.dealId, dealId));
  return rows.length;
}

/** Mirrors what snapshotAllActiveDeals does per deal. */
const periodic = (dealId: string) =>
  captureSnapshot({
    dealId,
    reason: "periodic",
    triggerEvent: null,
    actor: "system",
    force: true,
    skipIfUnchanged: true,
  });

afterAll(async () => {
  if (createdDealIds.length > 0) {
    await db.delete(enterpriseDeals).where(inArray(enterpriseDeals.id, createdDealIds));
  }
  await pool.end();
});

describe("periodic snapshot skips unchanged deals", () => {
  it("captures the first time, then skips while nothing changes", async () => {
    const dealId = await createDeal();

    // No prior snapshot — there is nothing to compare against, so capture.
    expect(await periodic(dealId)).toBe(true);
    expect(await snapshotCount(dealId)).toBe(1);

    // This is the case that produced ~91 near-identical rows per deal.
    expect(await periodic(dealId)).toBe(false);
    expect(await periodic(dealId)).toBe(false);
    expect(await snapshotCount(dealId)).toBe(1);
  });

  it("captures again once the deal actually changes", async () => {
    const dealId = await createDeal();
    expect(await periodic(dealId)).toBe(true);
    expect(await periodic(dealId)).toBe(false);

    await db
      .update(enterpriseDeals)
      .set({ productRevenue: "5000.00" })
      .where(eq(enterpriseDeals.id, dealId));

    expect(await periodic(dealId)).toBe(true);
    expect(await snapshotCount(dealId)).toBe(2);

    // ...and settles again afterwards.
    expect(await periodic(dealId)).toBe(false);
    expect(await snapshotCount(dealId)).toBe(2);
  });

  it("still captures an event-driven snapshot when content is unchanged", async () => {
    // Event captures must never be skipped: the event firing IS the thing being
    // recorded, and the row is what the History UI offers as a restore point.
    const dealId = await createDeal();
    expect(await periodic(dealId)).toBe(true);
    expect(await periodic(dealId)).toBe(false);

    const inserted = await captureSnapshot({
      dealId,
      reason: "event:gate.toggled",
      triggerEvent: "gate.toggled",
      actor: "Test Actor",
      force: true,
    });

    expect(inserted).toBe(true);
    expect(await snapshotCount(dealId)).toBe(2);
  });
});
