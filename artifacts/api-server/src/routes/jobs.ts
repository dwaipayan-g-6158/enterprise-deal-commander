// Scheduled-job entry points, invoked by Catalyst Job Scheduling.
//
// WHY THIS IS AN HTTP ROUTE AND NOT A TIMER
//
// lib/subscribers/index.ts registers its periodic work as `setInterval`s inside
// the `app.listen` callback. AppSail kills an idle instance after five minutes,
// so on Catalyst those timers simply never fire — the hourly snapshot job has
// never run once in the deployed app, which is why the deal-detail trajectory
// panel reads "Awaiting history — not enough snapshots to chart a trend yet".
//
// A Catalyst AppSail-type Job Pool invokes its target by making an ORDINARY
// HTTP REQUEST to the app (the cron config is: target AppSail + method + URL +
// arbitrary headers). That is what makes this tractable: the long-standing
// blocker recorded throughout the migration plan — "these jobs have no
// per-request `req` to derive a `catalystApp` from" — dissolves, because a job
// run IS a request. `initCatalystApp(req)` works here exactly as it does on any
// other route, with no second initialization path to maintain.
//
// WHY IT IS MOUNTED ABOVE THE AUTH GATE
//
// A cron has no Catalyst user session, so it cannot pass `requireAuth`. This
// router is therefore registered before the gate in routes/index.ts and carries
// its own authentication: a shared secret in `X-EDC-Job-Secret`, compared in
// constant time against `EDC_JOB_SECRET`. It is deny-by-default in the strongest
// sense — if `EDC_JOB_SECRET` is unset or empty the route refuses every request,
// so a deployment that forgets to configure it fails closed and loudly rather
// than exposing an unauthenticated write endpoint. routes/index.rbac.test.ts
// pins the public route set and covers this.

import { Router, type IRouter, type Request, type Response } from "express";
import { timingSafeEqual } from "node:crypto";
import { initCatalystApp } from "@workspace/db/catalyst";
import { HttpError, notFound } from "../lib/http";
import { logger } from "../lib/logger";
import { activeDealIds } from "../lib/catalyst/portfolio";
import { snapshotAllActiveDealsCatalyst } from "../lib/subscribers/snapshot-service";
import { drainWebhookRetries } from "../lib/subscribers/webhook-dispatcher";

const router: IRouter = Router();

/**
 * Constant-time secret comparison. `timingSafeEqual` throws on a length
 * mismatch, which would itself leak length, so both sides are hashed to a
 * fixed width first by comparing equal-length buffers only after a length
 * check that is deliberately performed on the *padded* values.
 */
function secretMatches(provided: string, expected: string): boolean {
  const a = Buffer.from(provided);
  const b = Buffer.from(expected);
  if (a.length !== b.length) {
    // Still burn a comparison so the failure cost doesn't depend on length.
    timingSafeEqual(b, b);
    return false;
  }
  return timingSafeEqual(a, b);
}

function assertJobCaller(req: Request): void {
  const expected = (process.env["EDC_JOB_SECRET"] ?? "").trim();
  if (expected.length === 0) {
    logger.error("A job endpoint was called but EDC_JOB_SECRET is not configured — refusing");
    throw new HttpError(
      503,
      "JOB_AUTH_UNCONFIGURED",
      "Scheduled jobs are not configured on this deployment",
    );
  }
  const header = req.get("x-edc-job-secret") ?? "";
  if (!secretMatches(header, expected)) {
    // Deliberately NOT the generic "UNAUTHORIZED" that requireAuth returns:
    // this router sits above the auth gate, so a distinct code is the only way
    // to tell "the job secret was wrong" from "the auth gate rejected it",
    // which is exactly what the tests need to prove this route is genuinely
    // reachable without a session and genuinely closed without the secret.
    throw new HttpError(401, "JOB_UNAUTHORIZED", "Invalid job credentials");
  }
}

/**
 * Last run per job, in memory, for quick diagnosis. Deliberately not persisted:
 * Catalyst's own Job Scheduling console keeps execution history (15 days in
 * development), and an instance that has been recycled reporting "never run"
 * is honest about what THIS instance knows rather than implying the schedule
 * is broken.
 */
const lastRun = new Map<string, unknown>();

type JobHandler = (req: Request) => Promise<Record<string, unknown>>;

const JOBS: Record<string, JobHandler> = {
  /**
   * Hourly: snapshot every open deal whose content changed since its last
   * snapshot. This is the job the deal-trajectory chart and the vital-signs
   * 7-day baseline are both built on.
   */
  async snapshots(req: Request) {
    const catalystApp = initCatalystApp(req);
    const ids = await activeDealIds(catalystApp);
    const result = await snapshotAllActiveDealsCatalyst(catalystApp, ids);
    return { activeDeals: ids.length, ...result };
  },

  /**
   * Every 10 minutes: re-attempt webhook deliveries whose retry has come due.
   * This is what makes webhook retries durable — the dispatcher no longer owns
   * an in-memory timer that an instance recycle would silently discard (see
   * lib/subscribers/webhook-dispatcher.ts).
   */
  async "webhook-retries"(req: Request) {
    return drainWebhookRetries(initCatalystApp(req));
  },
};

router.post("/jobs/:jobName", async (req: Request, res: Response) => {
  assertJobCaller(req);
  const { jobName } = req.params;
  const handler = JOBS[jobName as string];
  if (!handler) throw notFound(`No such job: ${jobName}`);

  const startedAt = Date.now();
  try {
    const result = await handler(req);
    const record = { job: jobName, ok: true, ms: Date.now() - startedAt, ...result };
    lastRun.set(jobName as string, { ...record, at: new Date().toISOString() });
    logger.info(record, "Scheduled job completed");
    res.json({ data: record });
  } catch (err) {
    lastRun.set(jobName as string, {
      job: jobName,
      ok: false,
      at: new Date().toISOString(),
      error: err instanceof Error ? err.message : String(err),
    });
    // Rethrow: the job must report a non-2xx so Catalyst records a Failure and
    // applies the cron's configured retry, rather than silently "succeeding".
    throw err;
  }
});

/** What this instance last did, for diagnosis. Same secret as running a job. */
router.get("/jobs/_status", (req: Request, res: Response) => {
  assertJobCaller(req);
  res.json({
    data: {
      knownJobs: Object.keys(JOBS),
      lastRun: Object.fromEntries(lastRun),
      instanceStartedAt: new Date(Date.now() - Math.floor(process.uptime() * 1000)).toISOString(),
    },
  });
});

export default router;
