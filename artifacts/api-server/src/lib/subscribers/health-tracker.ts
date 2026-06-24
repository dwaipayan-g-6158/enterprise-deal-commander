import { db, dealHealthHistory } from "@workspace/db";
import { desc, eq } from "drizzle-orm";
import { dealEvents, emitDealEvent } from "../events";
import { assembleDealIntelligence } from "../intelligence";

/**
 * Tracks governance health transitions. After any mutation that could change a
 * deal's health, recompute the current health and, if it differs from the most
 * recently recorded value, append a row to `edc_v2.deal_health_history` and
 * emit a `health.changed` event (which the activity logger + snapshot service
 * also observe).
 *
 * It deliberately ignores `health.changed` itself to avoid recursion.
 */
async function lastRecordedHealth(dealId: string): Promise<string | null> {
  const rows = await db
    .select({ toStatus: dealHealthHistory.toStatus })
    .from(dealHealthHistory)
    .where(eq(dealHealthHistory.dealId, dealId))
    .orderBy(desc(dealHealthHistory.changedAt))
    .limit(1);
  return rows[0]?.toStatus ?? null;
}

export async function reconcileHealth(
  dealId: string,
  actor: string,
): Promise<boolean> {
  const intel = await assembleDealIntelligence(dealId);
  if (!intel) return false;
  const current = intel.governance.healthStatus;
  const previous = await lastRecordedHealth(dealId);
  if (previous === current) return false;

  const topRed = intel.governance.alerts.find((a) => a.severity === "RED");
  const reason = topRed?.message ?? topRed?.code ?? `Health is ${current}`;

  await db.insert(dealHealthHistory).values({
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

export function registerHealthTracker(): () => void {
  return dealEvents.on(async (event) => {
    if (event.type === "health.changed") return;
    if (event.type === "deal.deleted") return;
    await runSerialPerDeal(event.dealId, () =>
      reconcileHealth(event.dealId, event.actor),
    );
  });
}
