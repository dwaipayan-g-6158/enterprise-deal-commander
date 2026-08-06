import { type CatalystApp, createDealHealthHistoryRepo } from "@workspace/db/catalyst";
import { dealEvents, emitDealEvent, type DealEventType } from "../events";
import { assembleDealIntelligence } from "../catalyst/intelligence";

/**
 * Tracks governance health transitions. After any mutation that could change a
 * deal's health, recompute the current health and, if it differs from the most
 * recently recorded value, append a row to `edc_v2.deal_health_history` and
 * emit a `health.changed` event (which the activity logger + snapshot service
 * also observe).
 *
 * It deliberately ignores `health.changed` itself to avoid recursion.
 */
export async function reconcileHealth(
  catalystApp: CatalystApp,
  dealId: string,
  actor: string,
): Promise<boolean> {
  const intel = await assembleDealIntelligence(catalystApp, dealId);
  if (!intel) return false;
  const current = intel.governance.healthStatus;
  const previous = await createDealHealthHistoryRepo(catalystApp).lastRecordedStatus(dealId);
  if (previous === current) return false;

  const topRed = intel.governance.alerts.find((a) => a.severity === "RED");
  const reason = topRed?.message ?? topRed?.code ?? `Health is ${current}`;

  await createDealHealthHistoryRepo(catalystApp).create({
    dealId,
    fromStatus: previous,
    toStatus: current,
    reason,
    actor,
  });

  emitDealEvent("health.changed", {
    dealId,
    actor,
    fromStatus: previous,
    toStatus: current,
    reason,
    catalystApp,
  });
  return true;
}

/**
 * Per-deal serialization. A single stage change emits multiple events
 * (`deal.updated` + `deal.stage_changed`), each dispatched asynchronously. If
 * two reconciliations for the same deal ran concurrently they could both read
 * the same prior health, both insert, and produce duplicate history rows +
 * duplicate `health.changed` cascades. Chaining per deal makes the
 * read-then-insert atomic relative to other reconciliations for that deal, so
 * the second run observes the freshly-inserted row and no-ops.
 */
const chains = new Map<string, Promise<unknown>>();

function runSerialPerDeal(
  dealId: string,
  fn: () => Promise<unknown>,
): Promise<unknown> {
  const prev = chains.get(dealId) ?? Promise.resolve();
  const next = prev.then(fn, fn);
  chains.set(
    dealId,
    next.finally(() => {
      if (chains.get(dealId) === next) chains.delete(dealId);
    }),
  );
  return next;
}

/** health.changed is a self-recursion guard; deal.deleted/deal.archived are
 *  deals whose health will never be checked again. */
export function shouldSkipHealthReconcile(eventType: DealEventType): boolean {
  return (
    eventType === "health.changed" ||
    eventType === "deal.deleted" ||
    eventType === "deal.archived"
  );
}

export function registerHealthTracker(): () => void {
  return dealEvents.on(async (event) => {
    if (shouldSkipHealthReconcile(event.type)) return;
    // Absent if this event came from an emitter that hasn't migrated off
    // Drizzle yet — no-op rather than throw, per the event bus's "never
    // break the request path" contract (see lib/events.ts).
    if (!event.catalystApp) return;
    const catalystApp = event.catalystApp as CatalystApp;
    await runSerialPerDeal(event.dealId, () =>
      reconcileHealth(catalystApp, event.dealId, event.actor),
    );
  });
}
