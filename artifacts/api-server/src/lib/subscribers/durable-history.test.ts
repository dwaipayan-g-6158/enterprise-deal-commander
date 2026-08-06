import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import { initCatalystApp, createEnterpriseDealsRepo } from "@workspace/db/catalyst";
import {
  installCatalystFake,
  seedStandardLookups,
  STAGES,
  PRICING_MODEL_ID,
  SERVICES_TIER_ID,
  type CatalystTestStore,
} from "../../test-support/catalyst-test-app";
import { cache } from "../cache";
import { emitDealEvent } from "../events";
import { registerActivityLogger } from "./activity-logger";
import { registerSnapshotService } from "./snapshot-service";
import { registerHealthTracker } from "./health-tracker";

/**
 * Integration tests for the Phase 2 durable-history subscribers: the real
 * event-bus subscribers are registered and driven against the in-memory Data
 * Store (test-support/catalyst-test-app.ts), asserting that domain events
 * durably append the expected v2 rows and that per-deal serialization prevents
 * duplicate health-history rows.
 *
 * Every event carries `catalystApp` explicitly. That is not a test shortcut —
 * it is the contract: each of these subscribers no-ops when `event.catalystApp`
 * is absent (see lib/events.ts), so an emitter that forgets it silently loses
 * all durable history for that action. Emitting without it here would make
 * these tests pass against a subscriber that never wrote anything.
 *
 * Events are dispatched fire-and-forget through the bus, so assertions poll
 * until the expected rows materialize (or a timeout elapses).
 */

const ACTOR = "vitest";

let store: CatalystTestStore;
let seq = 0;
let disposers: Array<() => void> = [];

const app = () => initCatalystApp({ headers: {} });

async function poll<T>(
  fn: () => T,
  predicate: (v: T) => boolean,
  timeoutMs = 5_000,
): Promise<T> {
  const start = Date.now();
  let last = fn();
  while (!predicate(last)) {
    if (Date.now() - start > timeoutMs) return last;
    await new Promise((r) => setTimeout(r, 10));
    last = fn();
  }
  return last;
}

const rowsFor = (table: string, dealId: string) =>
  store.rows(table).filter((r) => r["deal_id"] === dealId);

async function createDeal(name: string): Promise<string> {
  const deal = await createEnterpriseDealsRepo(app()).create({
    dealName: `${name} ${seq}`,
    accountName: `Acct ${name} ${seq++}`,
    accountManager: "AM",
    technicalLead: "TL",
    salesStageId: STAGES.Discovery,
    pricingModelId: PRICING_MODEL_ID,
    servicesTierId: SERVICES_TIER_ID,
    productRevenue: "500000",
    servicesRevenue: "100000",
    contractTermYears: 1,
    dealCurrency: "USD",
  });
  return deal.id;
}

beforeAll(() => {
  ({ store } = installCatalystFake());
  // Registered individually rather than through registerSubscribers(), which
  // also kicks off the Drizzle-backed portfolio-rollup purge+warm and two
  // wall-clock timers — neither of which is this file's subject.
  disposers = [registerActivityLogger(), registerSnapshotService(), registerHealthTracker()];
});

afterAll(() => {
  for (const dispose of disposers) dispose();
  disposers = [];
});

beforeEach(() => {
  store.reset();
  seq = 0;
  seedStandardLookups(store);
  cache.clear();
});

describe("durable history subscribers", () => {
  it("appends activity, snapshot, and health-history rows on a gate toggle", async () => {
    const dealId = await createDeal("Gate Toggle");

    emitDealEvent("gate.toggled", {
      dealId,
      actor: ACTOR,
      gateCode: "G1",
      isCompleted: true,
      catalystApp: app(),
    });

    const activity = await poll(
      () => rowsFor("v2_deal_activity_log", dealId).filter((r) => r["event_type"] === "gate.toggled"),
      (rows) => rows.length >= 1,
    );
    expect(activity.length).toBe(1);
    expect(activity[0]["entity_type"]).toBe("gate");
    expect(activity[0]["entity_id"]).toBe("G1");
    expect(activity[0]["summary"]).toContain("G1");

    const snapshots = await poll(
      () => rowsFor("v2_deal_snapshots", dealId),
      (rows) => rows.length >= 1,
    );
    expect(snapshots.length).toBeGreaterThanOrEqual(1);
    expect(snapshots[0]["trigger_event"]).toBe("gate.toggled");

    const health = await poll(
      () => rowsFor("v2_deal_health_history", dealId),
      (rows) => rows.length >= 1,
    );
    expect(health.length).toBeGreaterThanOrEqual(1);
    // First-ever transition for a brand-new deal starts from null — Data Store
    // omits null columns entirely, so the key is simply absent.
    expect(health[0]["from_status"]).toBeUndefined();
  });

  it("appends an activity row + snapshot when a blocker is created", async () => {
    const dealId = await createDeal("Blocker Create");

    emitDealEvent("blocker.created", {
      dealId,
      actor: ACTOR,
      blockerId: "blk-1",
      description: "Security review pending",
      catalystApp: app(),
    });

    const activity = await poll(
      () => rowsFor("v2_deal_activity_log", dealId).filter((r) => r["event_type"] === "blocker.created"),
      (rows) => rows.length >= 1,
    );
    expect(activity.length).toBe(1);
    expect(activity[0]["entity_type"]).toBe("blocker");
    expect(activity[0]["entity_id"]).toBe("blk-1");

    const snapshots = await poll(
      () => rowsFor("v2_deal_snapshots", dealId),
      (rows) => rows.length >= 1,
    );
    expect(snapshots.length).toBeGreaterThanOrEqual(1);

    // The blocker.created event also drives a health reconciliation; for a
    // brand-new deal this records the first transition (from null).
    const health = await poll(
      () => rowsFor("v2_deal_health_history", dealId),
      (rows) => rows.length >= 1,
    );
    expect(health.length).toBeGreaterThanOrEqual(1);
    expect(health[0]["from_status"]).toBeUndefined();
  });

  it("appends activity, snapshot and health rows on a stage change", async () => {
    const dealId = await createDeal("Stage Change");

    emitDealEvent("deal.stage_changed", {
      dealId,
      actor: ACTOR,
      fromStageId: STAGES.Discovery,
      toStageId: STAGES.Validation,
      overridden: false,
      catalystApp: app(),
    });

    const activity = await poll(
      () => rowsFor("v2_deal_activity_log", dealId).filter((r) => r["event_type"] === "deal.stage_changed"),
      (rows) => rows.length >= 1,
    );
    expect(activity.length).toBe(1);
    expect(activity[0]["entity_type"]).toBe("deal");

    const snapshots = await poll(
      () => rowsFor("v2_deal_snapshots", dealId),
      (rows) => rows.length >= 1,
    );
    expect(snapshots.length).toBeGreaterThanOrEqual(1);

    const health = await poll(
      () => rowsFor("v2_deal_health_history", dealId),
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
      catalystApp: app(),
    });
    emitDealEvent("deal.stage_changed", {
      dealId,
      actor: ACTOR,
      fromStageId: STAGES.Discovery,
      toStageId: STAGES.Validation,
      overridden: false,
      catalystApp: app(),
    });

    // Wait for at least one health row, then give any second reconciliation
    // ample time to (incorrectly) insert a duplicate.
    await poll(() => rowsFor("v2_deal_health_history", dealId), (rows) => rows.length >= 1);
    await new Promise((r) => setTimeout(r, 500));

    expect(rowsFor("v2_deal_health_history", dealId)).toHaveLength(1);
  });

  it("writes nothing at all when the event carries no catalystApp", async () => {
    // The no-op contract: a subscriber must not throw when an unmigrated
    // emitter omits the handle (lib/events.ts), but it must also not silently
    // look like it succeeded. This is the case that would make every assertion
    // above vacuous if the handle were left off.
    const dealId = await createDeal("No Catalyst App");

    emitDealEvent("gate.toggled", { dealId, actor: ACTOR, gateCode: "G1", isCompleted: true });

    await new Promise((r) => setTimeout(r, 300));
    expect(rowsFor("v2_deal_activity_log", dealId)).toHaveLength(0);
    expect(rowsFor("v2_deal_snapshots", dealId)).toHaveLength(0);
    expect(rowsFor("v2_deal_health_history", dealId)).toHaveLength(0);
  });
});
