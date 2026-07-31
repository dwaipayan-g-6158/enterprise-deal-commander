import { db, enterpriseDeals } from "@workspace/db";
import { and, isNull } from "drizzle-orm";
import { logger } from "../logger";
import {
  refreshMaterializedViews,
  MV_REFRESH_INTERVAL_MS,
} from "../materialized-views";
import {
  registerPortfolioRollupView,
  purgeAndWarmPortfolioRollups,
} from "../portfolio-rollups";
import { registerActivityLogger } from "./activity-logger";
import { registerSnapshotService, snapshotAllActiveDeals } from "./snapshot-service";
import { registerHealthTracker } from "./health-tracker";
import { registerCacheInvalidation } from "./cache-invalidation";
import { registerWebhookDispatcher } from "./webhook-dispatcher";
import { registerNotificationService } from "./notification-service";
import { registerPlaybookEngine } from "./playbook-engine";
import { registerPostMortem } from "./post-mortem";
import { registerScoring } from "./scoring";
import { registerPipelineTransitions } from "./pipeline-transitions";

export { captureSnapshot } from "./snapshot-service";
export { reconcileHealth } from "./health-tracker";

const SNAPSHOT_INTERVAL_MS = 60 * 60_000; // hourly

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
  // V2 Sovereign Intelligence subscribers.
  disposers.push(registerWebhookDispatcher());
  disposers.push(registerNotificationService());
  disposers.push(registerPlaybookEngine());
  disposers.push(registerPostMortem());
  disposers.push(registerScoring());
  disposers.push(registerPipelineTransitions());

  // Register portfolio rollups with the MV refresh registry, then purge+warm
  // at startup: a rollup row written by a previous (possibly older) binary may
  // encode stale compute logic, so we never serve one we didn't compute
  // ourselves this process. Between purge and warm-completion, reads
  // live-compute — identical to today's cold-start behavior.
  registerPortfolioRollupView();
  void purgeAndWarmPortfolioRollups().catch((err) =>
    logger.error({ err }, "Initial portfolio rollup purge+warm failed"),
  );

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
