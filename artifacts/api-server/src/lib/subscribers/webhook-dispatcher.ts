import crypto from "node:crypto";
import { eq, sql } from "drizzle-orm";
import { db, webhooks, webhookDeliveryLog } from "@workspace/db";
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
  webhook: typeof webhooks.$inferSelect,
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

  await db.insert(webhookDeliveryLog).values({
    webhookId: webhook.id,
    eventType,
    payload: data,
    responseStatus: status,
    responseBody,
    success: ok,
  });

  if (ok) {
    await db
      .update(webhooks)
      .set({ lastTriggeredAt: new Date(), failureCount: 0 })
      .where(eq(webhooks.id, webhook.id));
    return;
  }

  if (attempt < MAX_ATTEMPTS) {
    setTimeout(() => void deliver(webhook, eventType, data, attempt + 1), attempt * 5000).unref();
    return;
  }

  // Exhausted retries — bump failure count and auto-disable at 10 consecutive.
  const [row] = await db
    .update(webhooks)
    .set({ failureCount: sql`${webhooks.failureCount} + 1` })
    .where(eq(webhooks.id, webhook.id))
    .returning({ failureCount: webhooks.failureCount });
  if (row && row.failureCount >= 10) {
    await db.update(webhooks).set({ isActive: false }).where(eq(webhooks.id, webhook.id));
    logger.warn({ webhookId: webhook.id }, "Webhook auto-disabled after 10 failures");
  }
}

function eventData(event: DealEvent): Record<string, unknown> {
  const { type, ...rest } = event;
  void type;
  return rest as Record<string, unknown>;
}

export function registerWebhookDispatcher(): () => void {
  return dealEvents.on(async (event) => {
    const subscribed = await db.select().from(webhooks).where(eq(webhooks.isActive, true));
    for (const webhook of subscribed) {
      if (!webhook.events.includes(event.type)) continue;
      void deliver(webhook, event.type, eventData(event)).catch((err) =>
        logger.error({ err, webhookId: webhook.id }, "Webhook delivery error"),
      );
    }
  });
}
