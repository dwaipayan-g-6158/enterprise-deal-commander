import crypto from "node:crypto";
import {
  type CatalystApp,
  createWebhooksRepo,
  createWebhookDeliveryLogRepo,
  type WebhookRow,
} from "@workspace/db/catalyst";
import { dealEvents, type DealEvent } from "../events";
import { logger } from "../logger";

/**
 * Webhook dispatcher (V2 F1). On every domain event, POST a signed payload to
 * each active webhook subscribed to that event type: 10s per-attempt timeout,
 * HMAC-SHA256 signature, delivery logging, auto-disable after 10 consecutive
 * failures.
 *
 * RETRIES ARE DURABLE, NOT IN-MEMORY.
 *
 * This used to schedule its own retries with `setTimeout(...).unref()`. AppSail
 * recycles an idle instance after five minutes, so any retry still pending in
 * that window simply never happened — and left no trace, because a delivery-log
 * row is only written once an attempt completes. A failed attempt now records
 * `next_attempt_at` on its log row and returns; the drain job
 * (POST /api/v1/jobs/webhook-retries, cron every 10 min) picks it up. One code
 * path, and nothing is owned by a process that may not exist a minute later.
 *
 * The cost is latency: the first retry lands within ~10 minutes rather than 5
 * seconds. That is the deliberate trade — a retry that actually happens late
 * beats one that silently never happens.
 */
const MAX_ATTEMPTS = 5;
const TIMEOUT_MS = 10_000;

/**
 * Backoff before attempt N+1, given that attempt N just failed: 10m, 20m, then
 * 40m capped. Pure and exported so the schedule is unit-testable without Data
 * Store or a clock (same reasoning as lib/memory-search.ts).
 */
export function retryDelayMs(attempt: number): number {
  const TEN_MINUTES = 10 * 60_000;
  return Math.min(TEN_MINUTES * 2 ** (attempt - 1), 40 * 60_000);
}

/** True when `attempt` was the last one this webhook gets. */
export function isFinalAttempt(attempt: number): boolean {
  return attempt >= MAX_ATTEMPTS;
}

export async function deliver(
  catalystApp: CatalystApp,
  webhook: WebhookRow,
  eventType: string,
  data: Record<string, unknown>,
  attempt = 1,
): Promise<void> {
  const body = JSON.stringify({ event: eventType, timestamp: new Date().toISOString(), data });
  const signature = crypto.createHmac("sha256", webhook.secretKey).update(body).digest("hex");

  let status: number | null = null;
  let ok = false;
  let responseBody: string | null = null;
  try {
    const res = await fetch(webhook.targetUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-EDC-Signature": `sha256=${signature}`,
        "X-EDC-Event": eventType,
        "X-EDC-Delivery": crypto.randomUUID(),
      },
      body,
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    status = res.status;
    ok = res.ok;
    responseBody = (await res.text().catch(() => ""))?.slice(0, 1000) ?? null;
  } catch (err) {
    responseBody = err instanceof Error ? err.message : String(err);
  }

  const webhooksRepo = createWebhooksRepo(catalystApp);
  const willRetry = !ok && !isFinalAttempt(attempt);

  // The log row IS the retry queue entry — written before anything else, so an
  // attempt can never fail in a way that loses the record of it being owed.
  await createWebhookDeliveryLogRepo(catalystApp).create({
    webhookId: webhook.id,
    eventType,
    payload: data,
    responseStatus: status,
    responseBody,
    success: ok,
    attemptCount: attempt,
    nextAttemptAt: willRetry ? new Date(Date.now() + retryDelayMs(attempt)) : null,
  });

  if (ok) {
    await webhooksRepo.update(webhook.id, { failureCount: 0 });
    return;
  }

  if (willRetry) {
    logger.warn(
      {
        webhookId: webhook.id,
        eventType,
        attempt,
        nextAttempt: attempt + 1,
        retryInMs: retryDelayMs(attempt),
        status,
      },
      "Webhook delivery failed; durable retry queued for the drain job",
    );
    return;
  }

  // Retry budget spent — bump failure count and auto-disable at 10 consecutive.
  const current = await webhooksRepo.getById(webhook.id);
  const nextFailureCount = (current?.failureCount ?? webhook.failureCount) + 1;
  await webhooksRepo.update(webhook.id, { failureCount: nextFailureCount });
  logger.warn(
    { webhookId: webhook.id, eventType, attempts: attempt, failureCount: nextFailureCount },
    "Webhook delivery gave up after exhausting its retry budget",
  );
  if (nextFailureCount >= 10) {
    await webhooksRepo.update(webhook.id, { isActive: false });
    logger.warn({ webhookId: webhook.id }, "Webhook auto-disabled after 10 failures");
  }
}

/**
 * Re-attempt every delivery whose retry has come due. Invoked by the cron
 * through POST /api/v1/jobs/webhook-retries.
 *
 * Each row is cleared from the queue BEFORE its retry runs, so a drain that
 * overruns into the next cron tick cannot hand the same row out twice; the
 * retry then writes its own fresh row carrying the next `next_attempt_at`. One
 * bad row must never abort the sweep, so failures are logged per row — the same
 * shape as snapshotAllActiveDealsCatalyst.
 */
export async function drainWebhookRetries(
  catalystApp: CatalystApp,
  now = new Date(),
): Promise<{ due: number; delivered: number; failed: number; skipped: number }> {
  const deliveryLog = createWebhookDeliveryLogRepo(catalystApp);
  const webhooksRepo = createWebhooksRepo(catalystApp);
  const due = await deliveryLog.listDueRetries(now);

  let delivered = 0;
  let failed = 0;
  let skipped = 0;

  for (const row of due) {
    try {
      const webhook = await webhooksRepo.getById(row.webhookId);
      // Deleted or disabled since the attempt was queued — drop it rather than
      // resurrecting traffic to an endpoint the user has switched off.
      if (!webhook || !webhook.isActive) {
        await deliveryLog.clearRetry(row.id);
        skipped++;
        continue;
      }
      await deliveryLog.clearRetry(row.id);
      await deliver(catalystApp, webhook, row.eventType, row.payload, row.attemptCount + 1);
      delivered++;
    } catch (err) {
      failed++;
      logger.error({ err, deliveryId: row.id, webhookId: row.webhookId }, "Webhook retry failed to run");
    }
  }

  return { due: due.length, delivered, failed, skipped };
}

function eventData(event: DealEvent): Record<string, unknown> {
  const { type, catalystApp, ...rest } = event;
  void type;
  void catalystApp;
  return rest as Record<string, unknown>;
}

export function registerWebhookDispatcher(): () => void {
  return dealEvents.on(async (event) => {
    // Absent if this event came from an emitter that hasn't migrated off
    // Drizzle yet — no-op rather than throw, per the event bus's "never
    // break the request path" contract (see lib/events.ts).
    if (!event.catalystApp) return;
    const catalystApp = event.catalystApp as CatalystApp;
    const allWebhooks = await createWebhooksRepo(catalystApp).listAll();
    const subscribed = allWebhooks.filter((w) => w.isActive);
    for (const webhook of subscribed) {
      if (!webhook.events.includes(event.type)) continue;
      void deliver(catalystApp, webhook, event.type, eventData(event)).catch((err) =>
        logger.error({ err, webhookId: webhook.id }, "Webhook delivery error"),
      );
    }
  });
}
