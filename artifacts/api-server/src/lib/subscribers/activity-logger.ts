import { db, dealActivityLog } from "@workspace/db";
import type { DealEvent } from "../events";
import { dealEvents } from "../events";

/** Build a concise human-readable summary line for an activity event. */
function summarize(event: DealEvent): string {
  switch (event.type) {
    case "deal.created":
      return `Created deal "${event.dealName}"`;
    case "deal.updated":
      return event.changedFields.length
        ? `Updated ${event.changedFields.join(", ")}`
        : "Updated deal";
    case "deal.stage_changed":
      return event.overridden
        ? "Advanced stage (guardrail overridden)"
        : "Changed sales stage";
    case "deal.deleted":
      return "Deleted deal";
    case "deal.restored":
      return "Restored deal";
    case "deal.archived":
      return "Archived deal";
    case "gate.toggled":
      return `Gate ${event.gateCode} marked ${event.isCompleted ? "complete" : "incomplete"}`;
    case "blocker.created":
      return `Logged blocker: ${event.description.slice(0, 140)}`;
    case "blocker.resolved":
      return `Blocker ${event.isResolved ? "resolved" : "reopened"}`;
    case "health.changed":
      return `Health changed ${event.fromStatus ?? "—"} → ${event.toStatus}`;
  }
}

/** Map an event to the entity it concerns (for filtering downstream). */
function entityOf(event: DealEvent): { entityType: string; entityId: string | null } {
  switch (event.type) {
    case "gate.toggled":
      return { entityType: "gate", entityId: event.gateCode };
    case "blocker.created":
    case "blocker.resolved":
      return { entityType: "blocker", entityId: event.blockerId };
    case "health.changed":
      return { entityType: "health", entityId: null };
    default:
      return { entityType: "deal", entityId: null };
  }
}

function metadataOf(event: DealEvent): Record<string, unknown> {
  const { type, dealId, actor, occurredAt, ...rest } = event;
  void type;
  void dealId;
  void actor;
  void occurredAt;
  return rest;
}

export function registerActivityLogger(): () => void {
  return dealEvents.on(async (event) => {
    const { entityType, entityId } = entityOf(event);
    await db.insert(dealActivityLog).values({
      dealId: event.dealId,
      eventType: event.type,
      entityType,
      entityId,
      summary: summarize(event),
      metadata: metadataOf(event),
      actor: event.actor,
      occurredAt: event.occurredAt,
    });
  });
}
