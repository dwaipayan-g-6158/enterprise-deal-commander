import { db, enterpriseDeals } from "@workspace/db";
import { and, isNull } from "drizzle-orm";
import { logger } from "../logger";
import { refreshMaterializedViews } from "../materialized-views";
import { registerActivityLogger } from "./activity-logger";
import { registerSnapshotService, snapshotAllActiveDeals } from "./snapshot-service";
import { registerHealthTracker } from "./health-tracker";
import { registerCacheInvalidation } from "./cache-invalidation";

export { captureSnapshot } from "./snapshot-service";
export { reconcileHealth } from "./health-tracker";

const SNAPSHOT_INTERVAL_MS = 60 * 60_000; // hourly
const MV_REFRESH_INTERVAL_MS = 15 * 60_000; // every 15 minutes

async function activeDealIds(): Promise<string[]> {
  const rows = await db
    .select({ id: enterpriseDeals.id })
    .from(enterpriseDeals)
    .where(
      and(isNull(enterpriseDeals.deletedAt), isNull(enterpriseDeals.archivedAt)),
    );
  return rows.map((r) => r.id);
}

let started = false;
const disposers: Array<() => void> = [];
const timers: NodeJS.Timeout[] = [];

/**
 * Wire the Phase 2 backbone: attach event subscribers and start periodic jobs.
 * Idempotent — safe to call once at startup. Timers are unref'd so they never
 * keep the process alive on their own.
 */
export function registerSubscribers(): void {
  if (started) return;
  started = true;

  disposers.push(registerActivityLogger());
  disposers.push(registerSnapshotService());
  disposers.push(registerHealthTracker());
  disposers.push(registerCacheInvalidation());

  const snapshotTimer = setInterval(() => {
    void (async () => {
      try {
        const ids = await activeDealIds();
        const n = await snapshotAllActiveDeals(ids);
        logger.info({ deals: ids.length, snapshots: n }, "Periodic snapshot run");
      } catch (err) {
        logger.error({ err }, "Periodic snapshot job failed");
      }
    })();
  }, SNAPSHOT_INTERVAL_MS);
  snapshotTimer.unref();
  timers.push(snapshotTimer);

  const mvTimer = setInterval(() => {
    void refreshMaterializedViews();
  }, MV_REFRESH_INTERVAL_MS);
  mvTimer.unref();
  timers.push(mvTimer);

  logger.info("Phase 2 backbone subscribers registered");
}

/** Tear down subscribers and timers (used in tests / graceful shutdown). */
export function unregisterSubscribers(): void {
  for (const dispose of disposers) dispose();
  disposers.length = 0;
  for (const timer of timers) clearInterval(timer);
  timers.length = 0;
  started = false;
}
