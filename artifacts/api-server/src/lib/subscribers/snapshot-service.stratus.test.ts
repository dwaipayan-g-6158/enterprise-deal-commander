import { describe, it, expect, beforeAll, beforeEach } from "vitest";
import crypto from "node:crypto";
import {
  initCatalystApp,
  createDealSnapshotsRepo,
  SNAPSHOT_PAYLOAD_LIMIT,
  SNAPSHOT_BUCKET,
} from "@workspace/db/catalyst";
import { installCatalystFake, type CatalystTestStore } from "../../test-support/catalyst-test-app";

/**
 * The Stratus offload for `v2_deal_snapshots.payload`.
 *
 * Two properties matter and they pull against each other:
 *
 *  1. An oversize payload must SURVIVE. Data Store caps a `text` column at
 *     10,000 chars; before this existed, a payload over the limit failed the
 *     whole insert.
 *  2. A normal payload must not pay for it. The offload is threshold-triggered
 *     precisely so the vital-signs baseline (one snapshot per open deal, every
 *     dashboard load) and the trajectory (every snapshot for one deal) keep
 *     costing zero object reads. Several assertions below check the bucket is
 *     *untouched*, which is the half that a naive "just put everything in
 *     Stratus" implementation would silently fail.
 *
 * Runs against the in-memory Data Store + Stratus fake
 * (test-support/catalyst-test-app.ts).
 */

let store: CatalystTestStore;

const app = () => initCatalystApp({ headers: {} });
const repo = () => createDealSnapshotsRepo(app());

/** A payload that serializes to comfortably more than the inline limit. */
function oversizePayload(marker: string): Record<string, unknown> {
  return { marker, filler: "x".repeat(SNAPSHOT_PAYLOAD_LIMIT + 500) };
}

function smallPayload(marker: string): Record<string, unknown> {
  return { marker, governance: { alerts: [{ code: "A", severity: "RED" }] } };
}

async function writeSnapshot(dealId: string, payload: Record<string, unknown>): Promise<void> {
  await repo().create({
    dealId,
    reason: "test",
    triggerEvent: null,
    healthStatus: "GREEN",
    salesStageId: 1,
    salesStage: "Discovery",
    calculatedTcv: 1000,
    normalizedTcv: 1000,
    payload,
    createdBy: "test",
  });
}

const rawSnapshots = () => store.rows("v2_deal_snapshots");

beforeAll(() => {
  ({ store } = installCatalystFake());
});

beforeEach(() => {
  store.reset();
});

describe("snapshot payloads under the limit stay inline", () => {
  it("writes payload_inline, no payload_key, and never touches the bucket", async () => {
    const dealId = crypto.randomUUID();
    await writeSnapshot(dealId, smallPayload("small"));

    const [row] = rawSnapshots();
    expect(row["payload_inline"]).toBeDefined();
    expect(row["payload_key"]).toBeUndefined();
    // The common path must cost zero object writes — this is the assertion that
    // fails if someone "simplifies" the offload into unconditional Stratus.
    expect(store.objects.size).toBe(0);
  });

  it("reads back without any object fetch", async () => {
    const dealId = crypto.randomUUID();
    await writeSnapshot(dealId, smallPayload("small"));

    const [snap] = await repo().listByDealId(dealId);
    expect(snap.payload).toEqual(smallPayload("small"));
    expect(store.objects.size).toBe(0);
  });
});

describe("snapshot payloads over the limit offload to Stratus", () => {
  it("stores the blob in the bucket and the row keeps only a key", async () => {
    const dealId = crypto.randomUUID();
    await writeSnapshot(dealId, oversizePayload("big"));

    const [row] = rawSnapshots();
    // The row itself is intact — health, stage and TCV are real columns and
    // still feed vital-signs even for an offloaded snapshot.
    expect(row["health_status"]).toBe("GREEN");
    expect(row["calculated_tcv"]).toBe("1000");
    // ...but the payload is not inline.
    expect(row["payload_inline"]).toBeUndefined();
    expect(row["payload_key"]).toBe(`deal-snapshots/${dealId}/${row["id"]}.json`);

    expect(store.objects.size).toBe(1);
    expect(store.objects.has(`${SNAPSHOT_BUCKET}/${row["payload_key"]}`)).toBe(true);
  });

  it("round-trips the payload through listByDealId, getById and latestAtOrBeforePerDeal", async () => {
    const dealId = crypto.randomUUID();
    const payload = oversizePayload("round-trip");
    await writeSnapshot(dealId, payload);
    const id = rawSnapshots()[0]["id"];

    // All three read paths hydrate — a caller must never have to remember to.
    expect((await repo().listByDealId(dealId))[0].payload).toEqual(payload);
    expect((await repo().getById(id))?.payload).toEqual(payload);
    const [baseline] = await repo().latestAtOrBeforePerDeal([dealId], new Date(Date.now() + 60_000));
    expect(baseline.payload).toEqual(payload);
  });

  it("hydrates only the offloaded rows in a mixed history", async () => {
    const dealId = crypto.randomUUID();
    await writeSnapshot(dealId, smallPayload("inline-one"));
    await writeSnapshot(dealId, oversizePayload("offloaded"));
    await writeSnapshot(dealId, smallPayload("inline-two"));

    // Exactly one object stored, for the one oversize payload.
    expect(store.objects.size).toBe(1);

    const snaps = await repo().listByDealId(dealId);
    expect(snaps).toHaveLength(3);
    expect(snaps.map((s) => (s.payload as { marker: string }).marker)).toEqual([
      "inline-one",
      "offloaded",
      "inline-two",
    ]);
  });

  it("does not leak payloadKey into the returned row", async () => {
    // The offload is an implementation detail of the repository. Leaking the
    // key would invite a caller to fetch it themselves and re-introduce the
    // forgot-to-hydrate bug this design exists to prevent.
    const dealId = crypto.randomUUID();
    await writeSnapshot(dealId, oversizePayload("no-leak"));

    const [snap] = await repo().listByDealId(dealId);
    expect(snap).not.toHaveProperty("payloadKey");
  });

  it("degrades to a null payload rather than throwing when the object is gone", async () => {
    // An unreadable blob is supporting detail — a missing trajectory point must
    // not take down a dashboard that is otherwise fine.
    const dealId = crypto.randomUUID();
    await writeSnapshot(dealId, oversizePayload("vanishing"));
    store.objects.clear();

    const [snap] = await repo().listByDealId(dealId);
    expect(snap.payload).toBeNull();
    expect(snap.healthStatus).toBe("GREEN");
  });

  it("writes no row at all when the Stratus put fails", async () => {
    // Ordering matters: the object goes first, so a storage failure aborts the
    // insert instead of leaving a row pointing at an object that never existed.
    const dealId = crypto.randomUUID();
    const original = store.objects.set.bind(store.objects);
    store.objects.set = () => {
      throw new Error("stratus unavailable");
    };
    try {
      await expect(writeSnapshot(dealId, oversizePayload("doomed"))).rejects.toThrow(
        "stratus unavailable",
      );
    } finally {
      store.objects.set = original;
    }
    expect(rawSnapshots()).toHaveLength(0);
  });
});
