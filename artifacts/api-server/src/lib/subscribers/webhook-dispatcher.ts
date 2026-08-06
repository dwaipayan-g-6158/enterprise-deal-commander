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
 * each active webhook subscribed to that event type. Fire-and-forget with up to
 * 3 retries (5/10/15s backoff), a 10s per-attempt timeout, HMAC-SHA256
 * signature, delivery logging, and auto-disable after 10 consecutive failures.
 */
const MAX_ATTEMPTS = 3;
const TIMEOUT_MS = 10_000;

async function deliver(
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
  await createWebhookDeliveryLogRepo(catalystApp).create({
    webhookId: webhook.id,
    eventType,
    payload: data,
    responseStatus: status,
    responseBody,
    success: ok,
  });

  if (ok) {
    await webhooksRepo.update(webhook.id, { failureCount: 0 });
    return;
  }

  if (attempt < MAX_ATTEMPTS) {
    const delayMs = attempt * 5000;
    // This retry is scheduled IN MEMORY and is therefore not durable: AppSail
    // recycles an idle instance after five minutes, and `.unref()` means the
    // timer will never hold the process open. If the instance goes away inside
    // this window the retry simply never happens, and — without this log — no
    // trace of it would exist anywhere, because the delivery-log row is only
    // written once an attempt actually completes.
    //
    // A durable retry (a drain job on the existing Job Scheduling cron) is
    // deliberately not built yet; see docs/CATALYST_SCHEMA.md for the decision
    // and the cheap path to add it. The window is seconds rather than the hour
    // the periodic-snapshot timer had, which is why this is a log and not a
    // rebuild.
    logger.warn(
      { webhookId: webhook.id, eventType, attempt, nextAttempt: attempt + 1, delayMs, status },
      "Webhook delivery failed; retry scheduled in-memory (lost if this instance recycles)",
    );
    setTimeout(() => void deliver(catalystApp, webhook, eventType, data, attempt + 1), delayMs).unref();
    return;
  }

  // Exhausted retries — bump failure count and auto-disable at 10 consecutive.
  const current = await webhooksRepo.getById(webhook.id);
  const nextFailureCount = (current?.failureCount ?? webhook.failureCount) + 1;
  await webhooksRepo.update(webhook.id, { failureCount: nextFailureCount });
  if (nextFailureCount >= 10) {
    await webhooksRepo.update(webhook.id, { isActive: false });
    logger.warn({ webhookId: webhook.id }, "Webhook auto-disabled after 10 failures");
  }
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
