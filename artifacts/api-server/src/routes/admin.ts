import { Router, type IRouter, type Request, type Response } from "express";
import { initCatalystApp } from "@workspace/db/catalyst";
import { badRequest } from "../lib/http";
import { getActor } from "../lib/auth";
import { logger } from "../lib/logger";
import {
  seedLookupsCatalyst,
  seedConfigCatalyst,
  seedDealsCatalyst,
  type SeedSummary,
} from "../lib/catalyst/seed";
import { runTransitionBackfill } from "../lib/catalyst/transitions-backfill";

// Auth + write-role enforcement is applied centrally in routes/index.ts.
// POST is a non-safe method and this path is NOT in
// READER_WRITE_METHOD_ALLOWLIST, so requireWriteRole already makes this
// admin-only — deliberately no per-router role check here (see the gate
// docstring in routes/index.ts).
const router: IRouter = Router();

/**
 * Operational endpoints. Deliberately outside lib/api-spec's openapi.yaml and
 * the generated Zod contract: these are for an operator driving the deployed
 * app, not part of the product API the frontend consumes.
 */

const PHASES = ["lookups", "config", "deals", "all"] as const;
type Phase = (typeof PHASES)[number];

/**
 * Safest default. `lookups` is pure reference data and row-level idempotent
 * (it writes only rows that are missing), so an accidental bare POST cannot
 * duplicate anything or invent demo deals in a live pipeline.
 */
const DEFAULT_PHASE: Phase = "lookups";

const RUNNERS: Record<Exclude<Phase, "all">, (app: unknown) => Promise<SeedSummary>> = {
  lookups: seedLookupsCatalyst,
  config: seedConfigCatalyst,
  deals: seedDealsCatalyst,
};

/** Phase order matters: deals resolve their FKs against the lookup rows. */
const ALL_PHASES: Array<Exclude<Phase, "all">> = ["lookups", "config", "deals"];

function isPhase(value: string): value is Phase {
  return (PHASES as readonly string[]).includes(value);
}

/**
 * Seed the Catalyst Data Store.
 *
 * `POST /api/v1/admin/seed?phase=lookups|config|deals|all` (also accepts
 * `{ "phase": ... }` in the body). The Data Store SDK initialises from the
 * AppSail gateway's request headers and is unreachable from localhost, so the
 * seed has to be driven through the deployed app rather than run as a CLI
 * script — see the module docstring in lib/catalyst/seed.ts.
 *
 * Every phase is independently re-runnable: a phase whose data is already
 * present reports 0 rows written for each of its tables rather than
 * duplicating.
 */
router.post("/admin/seed", async (req: Request, res: Response) => {
  const raw =
    (typeof req.query["phase"] === "string" ? req.query["phase"] : undefined) ??
    (typeof (req.body as { phase?: unknown } | undefined)?.phase === "string"
      ? ((req.body as { phase: string }).phase)
      : undefined) ??
    DEFAULT_PHASE;

  if (!isPhase(raw)) {
    throw badRequest(`Unknown seed phase "${raw}". Expected one of: ${PHASES.join(", ")}`);
  }

  const actor = getActor(req);
  const toRun = raw === "all" ? ALL_PHASES : [raw];
  const catalystApp = initCatalystApp(req);

  logger.info({ phase: raw, actor: actor.username }, "Seed requested");

  const phases: Record<string, SeedSummary> = {};
  let totalRowsWritten = 0;
  for (const phase of toRun) {
    const started = Date.now();
    const summary = await RUNNERS[phase](catalystApp);
    const written = Object.values(summary).reduce((sum, n) => sum + n, 0);
    totalRowsWritten += written;
    phases[phase] = summary;
    logger.info({ phase, written, ms: Date.now() - started, tables: summary }, "Seed phase complete");
  }

  res.json({ data: { phase: raw, phases, totalRowsWritten } });
});

/**
 * Reconstruct `v2_pipeline_transitions` from the history the app already has
 * (audit log, then snapshots, then synthetic create/exit floors).
 *
 * An endpoint rather than a CLI script for the same reason `/admin/seed` is
 * one: the reconstruction needs a `catalystApp`, and the only way to get a real
 * one is from a request against the deployed app.
 *
 * Idempotent — a second call plans nothing, because the first call's rows are
 * now part of what it dedupes against. That is what makes it safe to leave
 * callable in production.
 */
router.post("/admin/backfill-transitions", async (req: Request, res: Response) => {
  const actor = getActor(req);
  logger.info({ actor: actor.username }, "Pipeline-transitions backfill requested");

  const started = Date.now();
  const result = await runTransitionBackfill(initCatalystApp(req));
  logger.info({ ...result, ms: Date.now() - started }, "Pipeline-transitions backfill complete");

  res.json({ data: { ...result, ms: Date.now() - started } });
});

export default router;
