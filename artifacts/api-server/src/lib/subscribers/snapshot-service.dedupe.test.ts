import { describe, it, expect, beforeAll, beforeEach } from "vitest";
import {
  initCatalystApp,
  createEnterpriseDealsRepo,
  createDealSnapshotsRepo,
  formatCatalystDateTime,
} from "@workspace/db/catalyst";
import {
  installCatalystFake,
  seedStandardLookups,
  STAGES,
  PRICING_MODEL_ID,
  SERVICES_TIER_ID,
  type CatalystTestStore,
} from "../../test-support/catalyst-test-app";
import { captureSnapshotCatalyst } from "./snapshot-service";
import { cache } from "../cache";

// Exercises the periodic job's unchanged-skip end to end — the repository read,
// the fingerprint comparison, and the write — rather than just the pure
// fingerprint (covered in snapshot-service.test.ts).
//
// Ported from the Drizzle `snapshot-service.dedupe.test.ts`, which drove the
// `captureSnapshot` that no longer exists. Same three behaviours, now against
// the Catalyst path that the cron actually runs, plus a regression test for a
// tie bug that only exists on Data Store.

let store: CatalystTestStore;
let seq = 0;

const app = () => initCatalystApp({ headers: {} });

beforeAll(() => {
  ({ store } = installCatalystFake());
});

beforeEach(() => {
  store.reset();
  seedStandardLookups(store);
  cache.clear();
});

async function createDeal(): Promise<string> {
  const deal = await createEnterpriseDealsRepo(app()).create({
    dealName: `Snapshot Dedupe ${++seq}`,
    accountName: `Snapshot Dedupe Acct ${seq}`,
    accountManager: "AM",
    technicalLead: "TL",
    salesStageId: STAGES.Discovery,
    pricingModelId: PRICING_MODEL_ID,
    servicesTierId: SERVICES_TIER_ID,
    productRevenue: "1000.00",
    servicesRevenue: "0",
    contractTermYears: 1,
    dealCurrency: "USD",
  });
  return deal.id;
}

function snapshotCount(dealId: string): number {
  return store.rows("v2_deal_snapshots").filter((r) => r["deal_id"] === dealId).length;
}

/** Mirrors exactly what `snapshotAllActiveDealsCatalyst` does per deal. */
const periodic = (dealId: string) =>
  captureSnapshotCatalyst(app(), {
    dealId,
    reason: "periodic",
    triggerEvent: null,
    actor: "system",
    force: true,
    skipIfUnchanged: true,
  });

describe("periodic snapshot skips unchanged deals", () => {
  it("captures the first time, then skips while nothing changes", async () => {
    const dealId = await createDeal();

    // No prior snapshot — there is nothing to compare against, so capture.
    expect(await periodic(dealId)).toBe(true);
    expect(snapshotCount(dealId)).toBe(1);

    // This is the case that produced ~91 near-identical rows per deal.
    expect(await periodic(dealId)).toBe(false);
    expect(await periodic(dealId)).toBe(false);
    expect(snapshotCount(dealId)).toBe(1);
  });

  it("captures again once the deal actually changes", async () => {
    const dealId = await createDeal();
    expect(await periodic(dealId)).toBe(true);
    expect(await periodic(dealId)).toBe(false);

    const deals = createEnterpriseDealsRepo(app());
    const current = await deals.getById(dealId);
    if (!current) throw new Error("fixture deal vanished");
    await deals.update(
      dealId,
      { dealName: current.dealName, accountName: current.accountName },
      { productRevenue: "5000.00" },
    );

    expect(await periodic(dealId)).toBe(true);
    expect(snapshotCount(dealId)).toBe(2);

    // ...and settles again afterwards.
    expect(await periodic(dealId)).toBe(false);
    expect(snapshotCount(dealId)).toBe(2);
  });

  it("still captures an event-driven snapshot when content is unchanged", async () => {
    // Event captures must never be skipped: the event firing IS the thing being
    // recorded, and the row is what the History UI offers as a restore point.
    const dealId = await createDeal();
    expect(await periodic(dealId)).toBe(true);
    expect(await periodic(dealId)).toBe(false);

    const inserted = await captureSnapshotCatalyst(app(), {
      dealId,
      reason: "event:gate.toggled",
      triggerEvent: "gate.toggled",
      actor: "Test Actor",
      force: true,
    });

    expect(inserted).toBe(true);
    expect(snapshotCount(dealId)).toBe(2);
  });

  it("compares against the NEWEST snapshot when several share a timestamp", async () => {
    // Data Store datetimes are second-granularity, so a burst of snapshots all
    // carry the same `snapshot_at`. `latestAtOrBeforePerDeal` used a strict `>`
    // and so kept the FIRST row of that second — meaning the skip check
    // fingerprinted against a stale payload and re-wrote a row that had not
    // changed. Written directly through the repo so both rows are guaranteed to
    // share a second regardless of how fast the machine is.
    const dealId = await createDeal();
    const snapshots = createDealSnapshotsRepo(app());
    const sameSecond = new Date();

    const base = {
      dealId,
      reason: "periodic",
      triggerEvent: null,
      healthStatus: "GREEN",
      salesStageId: STAGES.Discovery,
      salesStage: "Discovery",
      calculatedTcv: 1000,
      normalizedTcv: 1000,
      createdBy: "system",
    };
    await snapshots.create({ ...base, payload: { marker: "older" } });
    await snapshots.create({ ...base, payload: { marker: "newer" } });

    // Both rows must genuinely share a timestamp, or this proves nothing.
    const stamps = store.rows("v2_deal_snapshots").map((r) => r["snapshot_at"]);
    expect(new Set(stamps).size).toBe(1);
    expect(stamps[0]).toBe(formatCatalystDateTime(sameSecond));

    const latest = await snapshots.latestAtOrBefore(dealId, new Date(Date.now() + 60_000));
    expect((latest?.payload as { marker?: string } | null)?.marker).toBe("newer");
  });
});
