import { eq } from "drizzle-orm";
import { db, notificationRules, notificationLog } from "@workspace/db";
import { dealEvents, type DealEvent } from "../events";
import { sendMail } from "../mail";
import { logger } from "../logger";

/**
 * Smart Alerts (V2 F12, escalation chains excluded). Maps domain events to
 * notification trigger events, evaluates each active rule's JSONB conditions,
 * and writes a `notification_log` row. The `in_app` channel is fully functional
 * (surfaced via the notifications API); `email` is best-effort via the mail
 * stub. No escalation, no chaining.
 */
const EVENT_TO_TRIGGER: Partial<Record<DealEvent["type"], string>> = {
  "health.changed": "health_changed",
  "deal.stage_changed": "stage_changed",
  "blocker.created": "blocker_created",
};

function messageFor(event: DealEvent): string {
  switch (event.type) {
    case "health.changed":
      return `Deal health changed ${event.fromStatus ?? "—"} → ${event.toStatus}`;
    case "deal.stage_changed":
      return `Deal advanced to stage ${event.toStageId}${event.overridden ? " (guardrail overridden)" : ""}`;
    case "blocker.created":
      return `New blocker logged: ${event.description}`;
    default:
      return `Event ${event.type}`;
  }
}

/** Lightweight JSONB condition match against an event. */
function conditionsMatch(conditions: Record<string, unknown> | null, event: DealEvent): boolean {
  if (!conditions) return true;
  if (typeof conditions.health === "string" && event.type === "health.changed") {
    if (event.toStatus !== conditions.health) return false;
  }
  return true;
}

export function registerNotificationService(): () => void {
  return dealEvents.on(async (event) => {
    const trigger = EVENT_TO_TRIGGER[event.type];
    if (!trigger) return;

    const rules = await db
      .select()
      .from(notificationRules)
      .where(eq(notificationRules.isActive, true));

    for (const rule of rules) {
      if (rule.triggerEvent !== trigger) continue;
      if (!conditionsMatch(rule.triggerConditions ?? null, event)) continue;

      const message = messageFor(event);
      const subject = `[EDC] ${rule.ruleName}`;
      await db.insert(notificationLog).values({
        ruleId: rule.id,
        dealId: event.dealId,
        channel: rule.channel,
        recipient: rule.commanderId,
        subject,
        message,
      });

      if (rule.channel === "email") {
        void sendMail({ to: rule.commanderId, subject, html: `<p>${message}</p>` }).catch((err) =>
          logger.error({ err, ruleId: rule.id }, "Notification email failed"),
        );
      }
    }
  });
}
