import { db, dealSnapshots } from "@workspace/db";
import { dealEvents } from "../events";
import {
  serializeDeal,
  getDealGates,
  assembleDealIntelligence,
} from "../intelligence";
import { logger } from "../logger";

/**
 * Captures point-in-time snapshots of a deal's serialized state, gate state,
 * and a compact governance summary into `edc_v2.deal_snapshots`.
 *
 * A short per-deal debounce dedupes the burst of events that co-fire from a
 * single user action (e.g. a stage change emits `deal.updated`,
 * `deal.stage_changed`, and `health.changed`). The periodic job bypasses the
 * debounce so long-idle deals still accrue history.
 */
const DEBOUNCE_MS = 3_000;
const lastSnapshotAt = new Map<string, number>();

export interface CaptureSnapshotOptions {
  dealId: string;
  reason: string;
  triggerEvent?: string | null;
  actor: string;
  force?: boolean;
}

export async function captureSnapshot(
  opts: CaptureSnapshotOptions,
): Promise<boolean> {
  const { dealId, reason, triggerEvent, actor, force } = opts;
  const now = Date.now();
  if (!force) {
    const last = lastSnapshotAt.get(dealId);
    if (last !== undefined && now - last < DEBOUNCE_MS) return false;
  }
  lastSnapshotAt.set(dealId, now);

  const deal = await serializeDeal(dealId);
  if (!deal) {
    lastSnapshotAt.delete(dealId);
    return false;
  }
  const gates = await getDealGates(dealId);
  const intel = await assembleDealIntelligence(dealId);

  const governance = intel
    ? {
        healthStatus: intel.governance.healthStatus,
        alerts: intel.governance.alerts.map((a) => ({
          code: a.code,
          severity: a.severity,
        })),
      }
    : { healthStatus: deal.healthStatus, alerts: [] as unknown[] };

  await db.insert(dealSnapshots).values({
    dealId,
    reason,
    triggerEvent: triggerEvent ?? null,
    healthStatus: deal.healthStatus,
    salesStageId: deal.salesStageId,
    salesStage: deal.salesStage,
    calculatedTcv: String(deal.calculatedTCV ?? 0),
    normalizedTcv: String(deal.normalizedTCV ?? 0),
    payload: { deal, gates, governance },
    createdBy: actor,
  });
  return true;
}

export function registerSnapshotService(): () => void {
  return dealEvents.on(async (event) => {
    // Skip snapshotting hard-removed deals — there is nothing to serialize.
    if (event.type === "deal.deleted") return;
    await captureSnapshot({
      dealId: event.dealId,
      reason: `event:${event.type}`,
      triggerEvent: event.type,
      actor: event.actor,
    });
  });
}

/** Snapshot every active deal regardless of recent activity (periodic job). */
export async function snapshotAllActiveDeals(dealIds: string[]): Promise<number> {
  let count = 0;
  for (const dealId of dealIds) {
    try {
      const ok = await captureSnapshot({
        dealId,
        reason: "periodic",
        triggerEvent: null,
        actor: "system",
        force: true,
      });
      if (ok) count++;
    } catch (err) {
      logger.error({ err, dealId }, "Periodic snapshot failed for deal");
    }
  }
  return count;
}
