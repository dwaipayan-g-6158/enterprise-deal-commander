import { db, enterpriseDeals } from "@workspace/db";
import { and, isNull } from "drizzle-orm";
import { logger } from "../logger";
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

  // The precomputed `edc_v2.portfolio_rollups` table and the materialized-view
  // registry that refreshed it used to be wired up here. Both are gone: the
  // rollup's READ path was dropped when routes/intelligence.ts moved to Data
  // Store, which left the write side maintaining a table nothing consulted —
  // and on Catalyst every one of those writes was a doomed Postgres call,
  // swallowed and logged, on the startup path AND on every mutation. The
  // compute it fronted is 10ms/156ms, so there is nothing to reinstate. See
  // .agents/memory/edc-phase2-backbone.md.

  // NOTE: on Catalyst this timer never fires — AppSail kills an idle instance
  // after five minutes, so wall-clock intervals registered here are dead code in
  // the deployed app. The periodic snapshot job now runs through Catalyst Job
  // Scheduling instead, which invokes POST /api/v1/jobs/snapshots on a cron (see
  // routes/jobs.ts). This timer is kept only for local Postgres development,
  // where the process does stay alive.
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
