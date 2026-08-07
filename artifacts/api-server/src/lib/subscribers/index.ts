import { logger } from "../logger";
import { registerActivityLogger } from "./activity-logger";
import { registerSnapshotService } from "./snapshot-service";
import { registerHealthTracker } from "./health-tracker";
import { registerCacheInvalidation } from "./cache-invalidation";
import { registerWebhookDispatcher } from "./webhook-dispatcher";
import { registerNotificationService } from "./notification-service";
import { registerPlaybookEngine } from "./playbook-engine";
import { registerPostMortem } from "./post-mortem";
import { registerScoring } from "./scoring";
import { registerPipelineTransitions } from "./pipeline-transitions";

let started = false;
const disposers: Array<() => void> = [];

/**
 * Wire the Phase 2 backbone: attach the event subscribers. Idempotent — safe to
 * call once at startup.
 *
 * There are no timers here any more. This function used to also start an hourly
 * `setInterval` that snapshotted every active deal, and on Catalyst that timer
 * could never fire: AppSail kills an idle instance after five minutes, so a
 * wall-clock interval registered at startup is dead code in the deployed app.
 * The snapshot run is a Catalyst cron hitting `POST /api/v1/jobs/snapshots`
 * instead (routes/jobs.ts) — observed firing on a cold instance it started
 * itself, which is precisely what a timer could not do.
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

  logger.info("Phase 2 backbone subscribers registered");
}

/** Tear down subscribers (used in tests / graceful shutdown). */
export function unregisterSubscribers(): void {
  for (const dispose of disposers) dispose();
  disposers.length = 0;
  started = false;
}
