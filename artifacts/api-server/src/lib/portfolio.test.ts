import { describe, it, expect, afterAll, vi } from "vitest";
import { inArray } from "drizzle-orm";
import {
  db,
  pool,
  enterpriseDeals,
  pricingModels,
  servicesTiers,
  pipelineStages,
  dealReviewMarkers,
  dealAuditLog,
} from "@workspace/db";
import { computeSummary, mapWithConcurrency } from "./portfolio";

const createdDealIds: string[] = [];

async function createDeal(stageName: string, productRevenue: string): Promise<string> {
  const [pricing] = await db.select().from(pricingModels).limit(1);
  const [tier] = await db.select().from(servicesTiers).limit(1);
  const stages = await db.select().from(pipelineStages);
  const stage = stages.find((s) => s.stageName === stageName);
  if (!stage) throw new Error(`Seed data missing pipeline stage "${stageName}"`);
  const [row] = await db
    .insert(enterpriseDeals)
    .values({
      dealName: `Closed Exclusion Test ${stageName} ${Date.now()}`,
      accountName: `Closed Exclusion Acct ${stageName} ${Date.now()}`,
      accountManager: "AM",
      technicalLead: "TL",
      salesStageId: stage.id,
      pricingModelId: pricing.id,
      servicesTierId: tier.id,
      productRevenue,
      servicesRevenue: "0",
    })
    .returning({ id: enterpriseDeals.id });
  createdDealIds.push(row.id);
  return row.id;
}

afterAll(async () => {
  if (createdDealIds.length > 0) {
    await db.delete(enterpriseDeals).where(inArray(enterpriseDeals.id, createdDealIds));
  }
  await pool.end();
});

describe("computeSummary — closed deals excluded from active portfolio", () => {
  it("does not count a Closed-Won or Closed-Lost deal in totals, TCV, or dealsByStage", async () => {
    const before = await computeSummary();

    // Distinctive, large revenue values so any regression that re-includes
    // these deals shows up unmistakably in totalTCV.
    await createDeal("Closed-Won", "123456700.00");
    await createDeal("Closed-Lost", "987654300.00");

    const after = await computeSummary();

    expect(after.totalDealsMonitored).toBe(before.totalDealsMonitored);
    expect(after.totalTCV).toBe(before.totalTCV);
    expect(after.dealsByStage["Closed-Won"]).toBeUndefined();
    expect(after.dealsByStage["Closed-Lost"]).toBeUndefined();
  });
});

// `deal_review_markers.deal_id` and `deal_audit_log.deal_id` both declare
// `.references(() => enterpriseDeals.id, { onDelete: "cascade" })` (see
// lib/db/src/schema/deals.ts), so deleting the parent deal in `afterAll`
// above cascades to remove these rows too — no extra cleanup needed here.
describe("computeSummary — changes since last review (INNER JOIN semantics)", () => {
  const HOUR = 60 * 60 * 1000;
  const MINUTE = 60 * 1000;

  it("counts only deals with a marker AND newer audit rows; excludes markerless deals entirely (not as changeCount 0)", async () => {
    const before = await computeSummary();

    const now = Date.now();

    // Deal M ("mover"): has a marker, one audit row before it (must not
    // count) and one after it (must count) -> changeCount 1.
    const dealM = await createDeal("Discovery", "111111.00");
    await db.insert(dealReviewMarkers).values({
      dealId: dealM,
      lastReviewedAt: new Date(now - HOUR),
      reviewedBy: "tester",
    });
    await db.insert(dealAuditLog).values([
      {
        dealId: dealM,
        entityType: "deal",
        fieldChanged: "stage",
        changedBy: "tester",
        changedAt: new Date(now - 2 * HOUR), // before marker: must NOT count
      },
      {
        dealId: dealM,
        entityType: "deal",
        fieldChanged: "stage",
        changedBy: "tester",
        changedAt: new Date(now - 10 * MINUTE), // after marker: MUST count
      },
    ]);

    // Deal Z ("marker, no changes since"): has a marker, but its only audit
    // row is older than the marker -> changeCount 0 -> excluded.
    const dealZ = await createDeal("Discovery", "222222.00");
    await db.insert(dealReviewMarkers).values({
      dealId: dealZ,
      lastReviewedAt: new Date(now - HOUR),
      reviewedBy: "tester",
    });
    await db.insert(dealAuditLog).values({
      dealId: dealZ,
      entityType: "deal",
      fieldChanged: "stage",
      changedBy: "tester",
      changedAt: new Date(now - 2 * HOUR), // before marker: proves old rows don't leak in
    });

    // Deal N ("no marker at all"): recent audit rows that WOULD count if a
    // marker existed, but there is deliberately NO deal_review_markers row.
    // This is the case that proves the INNER JOIN (not a LEFT JOIN + `?? 0`)
    // is what's excluding it: with a LEFT JOIN, these recent rows would
    // wrongly produce a positive changeCount.
    const dealN = await createDeal("Discovery", "333333.00");
    await db.insert(dealAuditLog).values({
      dealId: dealN,
      entityType: "deal",
      fieldChanged: "stage",
      changedBy: "tester",
      changedAt: new Date(now - 10 * MINUTE),
    });

    const after = await computeSummary();

    // Only Deal M contributes -- Deal Z (no newer rows) and Deal N (no
    // marker) must not move the needle at all.
    expect(
      after.changesSinceLastReview.dealsWithChanges -
        before.changesSinceLastReview.dealsWithChanges,
    ).toBe(1);

    const mover = after.changesSinceLastReview.topMovers.find(
      (m) => m.dealId === dealM,
    );
    expect(mover).toBeDefined();
    expect(mover?.changeCount).toBe(1);

    expect(
      after.changesSinceLastReview.topMovers.some((m) => m.dealId === dealZ),
    ).toBe(false);
    expect(
      after.changesSinceLastReview.topMovers.some((m) => m.dealId === dealN),
    ).toBe(false);
  });
});

// `mapWithConcurrency` itself is pure and DB-free, but it lives in `./portfolio`,
// which unconditionally imports `@workspace/db` (throws at import time without
// `DATABASE_URL` — same import-chain situation as the DB-backed suites above),
// so there is no benefit to a separate test file: any file importing it from
// `./portfolio` needs `DATABASE_URL` set regardless of where the `describe`
// block lives.
describe("mapWithConcurrency", () => {
  it("preserves input order even when later items resolve before earlier ones", async () => {
    const items = [0, 1, 2, 3];
    const result = await mapWithConcurrency(
      items,
      4,
      (i) =>
        new Promise<number>((resolve) => setTimeout(() => resolve(i), (4 - i) * 5)),
    );
    // Item 3 resolves first (5ms) and item 0 resolves last (20ms), but the
    // result must still match INPUT order, not completion order.
    expect(result).toEqual([0, 1, 2, 3]);
  });

  it("never runs more than `limit` calls concurrently", async () => {
    const items = [0, 1, 2, 3, 4];
    let inFlight = 0;
    let maxInFlight = 0;
    const result = await mapWithConcurrency(items, 2, async (i) => {
      inFlight += 1;
      maxInFlight = Math.max(maxInFlight, inFlight);
      await new Promise((resolve) => setTimeout(resolve, 10));
      inFlight -= 1;
      return i;
    });
    // Deterministic counter check, NOT a wall-clock timing assertion — see
    // task-7-brief.md for why timing-based concurrency assertions are flaky
    // on Windows.
    expect(maxInFlight).toBe(2);
    expect(result).toEqual([0, 1, 2, 3, 4]);
  });

  it("propagates the rejection reason from a failing call, same as Promise.all", async () => {
    const boom = new Error("boom from item 1");
    const items = [0, 1, 2];
    await expect(
      mapWithConcurrency(items, 2, async (i) => {
        if (i === 1) throw boom;
        return i;
      }),
    ).rejects.toBe(boom);
  });

  it("resolves to an empty array and never calls fn for empty input", async () => {
    const fn = vi.fn(async (i: number) => i);
    const result = await mapWithConcurrency([], 8, fn);
    expect(result).toEqual([]);
    expect(fn).not.toHaveBeenCalled();
  });

  it("behaves correctly when limit exceeds items.length", async () => {
    const items = ["a", "b", "c"];
    const result = await mapWithConcurrency(items, 8, async (s) => s.toUpperCase());
    expect(result).toEqual(["A", "B", "C"]);
  });
});
