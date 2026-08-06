import { describe, it, expect, beforeAll, beforeEach, afterEach, vi } from "vitest";
import crypto from "node:crypto";
import {
  initCatalystApp,
  createWebhooksRepo,
  createWebhookDeliveryLogRepo,
  type WebhookRow,
} from "@workspace/db/catalyst";
import { installCatalystFake, type CatalystTestStore } from "../../test-support/catalyst-test-app";
import { deliver, drainWebhookRetries, retryDelayMs, isFinalAttempt } from "./webhook-dispatcher";

/**
 * The durable-retry contract (V2 F1).
 *
 * The property that matters is NOT "a retry eventually happens" — the old
 * in-memory `setTimeout` satisfied that on a machine that stays up. It is that
 * a pending retry survives the process: it must exist as a row in Data Store
 * before `deliver()` returns, so an AppSail instance recycling five minutes
 * later cannot take it with them. Every assertion below is written against the
 * stored row rather than against a timer.
 *
 * Runs against the in-memory Data Store (test-support/catalyst-test-app.ts)
 * with `fetch` stubbed — no network, no clock.
 */

let store: CatalystTestStore;
let seq = 0;

const app = () => initCatalystApp({ headers: {} });
const deliveryLog = () => createWebhookDeliveryLogRepo(app());

/** Rows straight from the store, so the retry columns are visible as written. */
const rawRows = () => store.rows("v2_webhook_delivery_log");

async function createWebhook(overrides: { isActive?: boolean; failureCount?: number } = {}): Promise<WebhookRow> {
  const row = await createWebhooksRepo(app()).create({
    webhookName: `Retry Test Webhook ${seq++}`,
    targetUrl: "https://example.test/hook",
    secretKey: crypto.randomBytes(16).toString("hex"),
    events: ["deal.created"],
    isActive: true,
    createdBy: "test",
  });
  const patch: Record<string, unknown> = {};
  if (overrides.isActive !== undefined) patch["is_active"] = String(overrides.isActive);
  if (overrides.failureCount !== undefined) patch["failure_count"] = String(overrides.failureCount);
  if (Object.keys(patch).length > 0) {
    const touched = store.patchRaw("v2_webhooks", (r) => r["id"] === row.id, patch);
    if (touched !== 1) throw new Error(`fixture patch touched ${touched} rows, expected 1`);
  }
  return { ...row, ...overrides };
}

/** Stub global fetch with a fixed outcome; returns the call counter. */
function stubFetch(outcome: "ok" | "fail" | "throw"): { calls: number } {
  const counter = { calls: 0 };
  vi.stubGlobal("fetch", async () => {
    counter.calls++;
    if (outcome === "throw") throw new Error("ECONNREFUSED");
    return {
      status: outcome === "ok" ? 200 : 500,
      ok: outcome === "ok",
      text: async () => (outcome === "ok" ? "thanks" : "boom"),
    } as unknown as Response;
  });
  return counter;
}

beforeAll(() => {
  ({ store } = installCatalystFake());
});

beforeEach(() => {
  store.reset();
  seq = 0;
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("retryDelayMs / isFinalAttempt — the schedule, without a clock", () => {
  it("backs off 10m, 20m, then caps at 40m", () => {
    expect(retryDelayMs(1)).toBe(10 * 60_000);
    expect(retryDelayMs(2)).toBe(20 * 60_000);
    expect(retryDelayMs(3)).toBe(40 * 60_000);
    expect(retryDelayMs(4)).toBe(40 * 60_000);
    // Capped, not unbounded — an 8th attempt must not schedule itself hours out.
    expect(retryDelayMs(8)).toBe(40 * 60_000);
  });

  it("gives up after the 5th attempt", () => {
    expect(isFinalAttempt(4)).toBe(false);
    expect(isFinalAttempt(5)).toBe(true);
  });
});

describe("deliver() — a failed attempt persists its own retry", () => {
  it("writes a log row carrying attempt_count and a future next_attempt_at, and does not sleep", async () => {
    const webhook = await createWebhook();
    const fetchCalls = stubFetch("fail");
    const before = Date.now();

    await deliver(app(), webhook, "deal.created", { dealId: "d1" });

    // One attempt only — the old code would have queued a timer for a second.
    expect(fetchCalls.calls).toBe(1);

    const rows = rawRows();
    expect(rows).toHaveLength(1);
    expect(rows[0]["success"]).toBe("false");
    expect(rows[0]["attempt_count"]).toBe("1");
    // The retry exists in the STORE, not in a timer — this is the whole point.
    expect(rows[0]["next_attempt_at"]).toBeDefined();

    const due = await deliveryLog().listDueRetries(new Date(before + retryDelayMs(1) + 1000));
    expect(due).toHaveLength(1);
    expect(due[0].attemptCount).toBe(1);
    expect(due[0].payload).toEqual({ dealId: "d1" });
  });

  it("is not yet due before its backoff elapses", async () => {
    const webhook = await createWebhook();
    stubFetch("fail");
    const before = Date.now();

    await deliver(app(), webhook, "deal.created", { dealId: "d1" });

    // One minute later the retry must still be waiting, or the drain would
    // hammer a failing endpoint on every cron tick.
    expect(await deliveryLog().listDueRetries(new Date(before + 60_000))).toHaveLength(0);
  });

  it("records a transport-level failure the same way as an HTTP error", async () => {
    const webhook = await createWebhook();
    stubFetch("throw");

    await deliver(app(), webhook, "deal.created", { dealId: "d1" });

    const rows = rawRows();
    expect(rows[0]["success"]).toBe("false");
    expect(rows[0]["response_body"]).toContain("ECONNREFUSED");
    expect(rows[0]["next_attempt_at"]).toBeDefined();
  });

  it("queues nothing and resets failureCount on success", async () => {
    const webhook = await createWebhook({ failureCount: 4 });
    stubFetch("ok");

    await deliver(app(), webhook, "deal.created", { dealId: "d1" });

    const rows = rawRows();
    expect(rows[0]["success"]).toBe("true");
    expect(rows[0]["next_attempt_at"]).toBeUndefined();
    expect(await deliveryLog().listDueRetries(new Date(Date.now() + 86_400_000))).toHaveLength(0);
    expect((await createWebhooksRepo(app()).getById(webhook.id))?.failureCount).toBe(0);
  });

  it("stops queueing on the final attempt and bumps failureCount instead", async () => {
    const webhook = await createWebhook({ failureCount: 2 });
    stubFetch("fail");

    await deliver(app(), webhook, "deal.created", { dealId: "d1" }, 5);

    const rows = rawRows();
    expect(rows[0]["attempt_count"]).toBe("5");
    expect(rows[0]["next_attempt_at"]).toBeUndefined();
    expect((await createWebhooksRepo(app()).getById(webhook.id))?.failureCount).toBe(3);
    // Nothing left owed — a spent budget must not leave a row the drain retries forever.
    expect(await deliveryLog().listDueRetries(new Date(Date.now() + 86_400_000))).toHaveLength(0);
  });

  it("auto-disables the webhook on the 10th consecutive failure", async () => {
    const webhook = await createWebhook({ failureCount: 9 });
    stubFetch("fail");

    await deliver(app(), webhook, "deal.created", { dealId: "d1" }, 5);

    const after = await createWebhooksRepo(app()).getById(webhook.id);
    expect(after?.failureCount).toBe(10);
    expect(after?.isActive).toBe(false);
  });
});

describe("drainWebhookRetries() — the job that makes retries durable", () => {
  it("re-delivers a due retry, advances the attempt count, and clears the original", async () => {
    const webhook = await createWebhook();
    stubFetch("fail");
    await deliver(app(), webhook, "deal.created", { dealId: "d1" });
    const firstRowId = rawRows()[0]["id"];

    // Drain well after the backoff, with delivery now succeeding.
    vi.unstubAllGlobals();
    const retryCalls = stubFetch("ok");
    const result = await drainWebhookRetries(app(), new Date(Date.now() + 60 * 60_000));

    expect(result).toMatchObject({ due: 1, delivered: 1, failed: 0, skipped: 0 });
    expect(retryCalls.calls).toBe(1);

    const rows = rawRows();
    expect(rows).toHaveLength(2);
    // The original is out of the queue but still an honest record of its failure.
    const original = rows.find((r) => r["id"] === firstRowId)!;
    expect(original["success"]).toBe("false");
    expect(original["next_attempt_at"]).toBeUndefined();
    // The retry is attempt 2 and succeeded.
    const retryRow = rows.find((r) => r["id"] !== firstRowId)!;
    expect(retryRow["attempt_count"]).toBe("2");
    expect(retryRow["success"]).toBe("true");
  });

  it("does not hand the same row out twice", async () => {
    const webhook = await createWebhook();
    stubFetch("fail");
    await deliver(app(), webhook, "deal.created", { dealId: "d1" });

    const farFuture = new Date(Date.now() + 60 * 60_000);
    await drainWebhookRetries(app(), farFuture);
    // The retry itself failed and queued attempt 3 — but the ORIGINAL row must
    // not still be due, or an overrunning drain would double-deliver.
    const second = await drainWebhookRetries(app(), farFuture);
    expect(second.due).toBe(1); // attempt 2's own row, not attempt 1's again

    const attemptCounts = rawRows().map((r) => r["attempt_count"]).sort();
    expect(attemptCounts).toEqual(["1", "2", "3"]);
  });

  it("drops a queued retry whose webhook has been deleted or disabled", async () => {
    const webhook = await createWebhook();
    stubFetch("fail");
    await deliver(app(), webhook, "deal.created", { dealId: "d1" });

    await createWebhooksRepo(app()).update(webhook.id, { isActive: false });

    const result = await drainWebhookRetries(app(), new Date(Date.now() + 60 * 60_000));
    expect(result).toMatchObject({ due: 1, delivered: 0, skipped: 1 });
    // No new attempt row: a disabled webhook must not keep receiving traffic.
    expect(rawRows()).toHaveLength(1);
    expect(rawRows()[0]["next_attempt_at"]).toBeUndefined();
  });

  it("reports nothing to do when no retry is due", async () => {
    const webhook = await createWebhook();
    stubFetch("ok");
    await deliver(app(), webhook, "deal.created", { dealId: "d1" });

    expect(await drainWebhookRetries(app(), new Date())).toMatchObject({ due: 0, delivered: 0 });
  });

  it("ignores legacy rows written before the retry columns existed", async () => {
    // A failed delivery from the in-memory era: no attempt_count, no
    // next_attempt_at. It must not be resurrected years later by the drain.
    store.seedRaw("v2_webhook_delivery_log", [
      {
        id: crypto.randomUUID(),
        webhook_id: crypto.randomUUID(),
        event_type: "deal.created",
        payload: "{}",
        success: "false",
        delivered_at: "2026-01-01 00:00:00:000",
      },
    ]);

    expect(await drainWebhookRetries(app(), new Date())).toMatchObject({ due: 0 });
  });
});
