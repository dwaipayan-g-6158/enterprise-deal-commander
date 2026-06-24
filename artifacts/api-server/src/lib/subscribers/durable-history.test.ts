import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import { and, eq, inArray } from "drizzle-orm";
import {
  db,
  pool,
  enterpriseDeals,
  pipelineStages,
  pricingModels,
  servicesTiers,
  dealActivityLog,
  dealSnapshots,
  dealHealthHistory,
} from "@workspace/db";
import { emitDealEvent } from "../events";
import { registerSubscribers, unregisterSubscribers } from "./index";

/**
 * Integration tests for the Phase 2 durable-history subscribers. They register
 * the real event-bus subscribers and exercise them against the live database,
 * asserting that domain events durably append the expected edc_v2 rows and that
 * per-deal serialization prevents duplicate health-history rows.
 *
 * Events are dispatched fire-and-forget through the bus, so assertions poll the
 * database until the expected rows materialize (or a timeout elapses).
 */

const ACTOR = "vitest";
const createdDealIds: string[] = [];

async function poll<T>(
  fn: () => Promise<T>,
  predicate: (v: T) => boolean,
  timeoutMs = 10_000,
): Promise<T> {
  const start = Date.now();
  let last = await fn();
  while (!predicate(last)) {
    if (Date.now() - start > timeoutMs) return last;
    await new Promise((r) => setTimeout(r, 100));
    last = await fn();
  }
  return last;
}

async function createDeal(name: string): Promise<string> {
  const [stage] = await db.select().from(pipelineStages).limit(1);
  const [pricing] = await db.select().from(pricingModels).limit(1);
  const [tier] = await db.select().from(servicesTiers).limit(1);
  const [row] = await db
    .insert(enterpriseDeals)
    .values({
      dealName: `${name} ${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      accountName: `Acct ${name} ${Math.random().toString(36).slice(2, 8)}`,
      accountManager: "AM",
      technicalLead: "TL",
      salesStageId: stage.id,
      pricingModelId: pricing.id,
      servicesTierId: tier.id,
      productRevenue: "500000",
      servicesRevenue: "100000",
    })
    .returning({ id: enterpriseDeals.id });
  createdDealIds.push(row.id);
  return row.id;
}

beforeAll(() => {
  registerSubscribers();
});

afterAll(async () => {
  unregisterSubscribers();
  if (createdDealIds.length > 0) {
    // edc_v2 rows cascade-delete with the parent deal.
    await db
      .delete(enterpriseDeals)
      .where(inArray(enterpriseDeals.id, createdDealIds));
  }
  await pool.end();
});

describe("durable history subscribers", () => {
  it("appends activity, snapshot, and health-history rows on a gate toggle", async () => {
    const dealId = await createDeal("Gate Toggle");

    emitDealEvent("gate.toggled", {
      dealId,
      actor: ACTOR,
      gateCode: "G1",
      isCompleted: true,
    });

    const activity = await poll(
      () =>
        db
          .select()
          .from(dealActivityLog)
          .where(
            and(
              eq(dealActivityLog.dealId, dealId),
              eq(dealActivityLog.eventType, "gate.toggled"),
            ),
          ),
      (rows) => rows.length >= 1,
    );
    expect(activity.length).toBe(1);
    expect(activity[0].entityType).toBe("gate");
    expect(activity[0].entityId).toBe("G1");
    expect(activity[0].summary).toContain("G1");

    const snapshots = await poll(
      () =>
        db.select().from(dealSnapshots).where(eq(dealSnapshots.dealId, dealId)),
      (rows) => rows.length >= 1,
    );
    expect(snapshots.length).toBeGreaterThanOrEqual(1);
    expect(snapshots[0].triggerEvent).toBe("gate.toggled");

    const health = await poll(
      () =>
        db
          .select()
          .from(dealHealthHistory)
          .where(eq(dealHealthHistory.dealId, dealId)),
      (rows) => rows.length >= 1,
    );
    expect(health.length).toBeGreaterThanOrEqual(1);
    // First-ever transition for a brand-new deal starts from null.
    expect(health[0].fromStatus).toBeNull();
  });

  it("appends an activity row + snapshot when a blocker is created", async () => {
    const dealId = await createDeal("Blocker Create");

    emitDealEvent("blocker.created", {
      dealId,
      actor: ACTOR,
      blockerId: "blk-1",
      description: "Security review pending",
    });

    const activity = await poll(
      () =>
        db
          .select()
          .from(dealActivityLog)
          .where(
            and(
              eq(dealActivityLog.dealId, dealId),
              eq(dealActivityLog.eventType, "blocker.created"),
            ),
          ),
      (rows) => rows.length >= 1,
    );
    expect(activity.length).toBe(1);
    expect(activity[0].entityType).toBe("blocker");
    expect(activity[0].entityId).toBe("blk-1");

    const snapshots = await poll(
      () =>
        db.select().from(dealSnapshots).where(eq(dealSnapshots.dealId, dealId)),
      (rows) => rows.length >= 1,
    );
    expect(snapshots.length).toBeGreaterThanOrEqual(1);

    // The blocker.created event also drives a health reconciliation; for a
    // brand-new deal this records the first transition (from null).
    const health = await poll(
      () =>
        db
          .select()
          .from(dealHealthHistory)
          .where(eq(dealHealthHistory.dealId, dealId)),
      (rows) => rows.length >= 1,
    );
    expect(health.length).toBeGreaterThanOrEqual(1);
    expect(health[0].fromStatus).toBeNull();
  });

  it("appends activity, snapshot and health rows on a stage change", async () => {
    const dealId = await createDeal("Stage Change");

    emitDealEvent("deal.stage_changed", {
      dealId,
      actor: ACTOR,
      fromStageId: 1,
      toStageId: 2,
      overridden: false,
    });

    const activity = await poll(
      () =>
        db
          .select()
          .from(dealActivityLog)
          .where(
            and(
              eq(dealActivityLog.dealId, dealId),
              eq(dealActivityLog.eventType, "deal.stage_changed"),
            ),
          ),
      (rows) => rows.length >= 1,
    );
    expect(activity.length).toBe(1);
    expect(activity[0].entityType).toBe("deal");

    const snapshots = await poll(
      () =>
        db.select().from(dealSnapshots).where(eq(dealSnapshots.dealId, dealId)),
      (rows) => rows.length >= 1,
    );
    expect(snapshots.length).toBeGreaterThanOrEqual(1);

    const health = await poll(
      () =>
        db
          .select()
          .from(dealHealthHistory)
          .where(eq(dealHealthHistory.dealId, dealId)),
      (rows) => rows.length >= 1,
    );
    expect(health.length).toBeGreaterThanOrEqual(1);
  });

  it("does not produce duplicate health-history rows for a single stage change", async () => {
    const dealId = await createDeal("Serialized Health");

    // A single user stage change fans out into multiple co-fired events. Each
    // triggers a health reconciliation; without per-deal serialization they
    // could both read the same prior (null) health and both insert.
    emitDealEvent("deal.updated", {
      dealId,
      actor: ACTOR,
      changedFields: ["salesStageId"],
    });
    emitDealEvent("deal.stage_changed", {
      dealId,
      actor: ACTOR,
      fromStageId: 1,
      toStageId: 2,
      overridden: false,
    });

    // Wait for at least one health row, then give any second reconciliation
    // ample time to (incorrectly) insert a duplicate.
    await poll(
      () =>
        db
          .select()
          .from(dealHealthHistory)
          .where(eq(dealHealthHistory.dealId, dealId)),
      (rows) => rows.length >= 1,
    );
    await new Promise((r) => setTimeout(r, 1500));

    const health = await db
      .select()
      .from(dealHealthHistory)
      .where(eq(dealHealthHistory.dealId, dealId));
    expect(health.length).toBe(1);
  });
});
