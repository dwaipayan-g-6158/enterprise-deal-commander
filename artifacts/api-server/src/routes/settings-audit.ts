import { Router, type IRouter, type Request, type Response } from "express";
import { eq, desc } from "drizzle-orm";
import { db, settingsChangeLog, engineThresholds, scoringModelWeights } from "@workspace/db";
import {
  ListSettingsChangeLogResponse,
  GetSettingsChangeParams,
  GetSettingsChangeResponse,
  RollbackSettingsChangeParams,
  RollbackSettingsChangeBody,
  ImportSettingsConfigBody,
} from "@workspace/api-zod";
import { getActor } from "../lib/auth";
import { badRequest, notFound, conflict } from "../lib/http";
import { computeRollback, logSettingsChange } from "../lib/settings-audit";
import { toISO } from "../lib/intelligence";

const router: IRouter = Router();

function toRow(r: typeof settingsChangeLog.$inferSelect) {
  return {
    id: r.id,
    module: r.module,
    settingKey: r.settingKey,
    entityId: r.entityId,
    action: r.action,
    oldValue: r.oldValue,
    newValue: r.newValue,
    dataType: r.dataType,
    actor: r.actor,
    reason: r.reason,
    rollbackOf: r.rollbackOf,
    // changedAt is a `timestamp` column — reuse the same Date|string coercion
    // the rest of the codebase already applies to timestamp columns (see
    // `toISO` in intelligence.ts and the equivalent inline check in
    // `webhookOut` in routes/v2/crud.ts) rather than assuming the pg driver
    // always hands back a Date instance.
    changedAt: toISO(r.changedAt) ?? new Date(0).toISOString(),
  };
}

router.get("/settings/change-log", async (req: Request, res: Response) => {
  const moduleFilter = typeof req.query.module === "string" ? req.query.module : undefined;
  const limit = Math.max(1, Math.min(200, Number(req.query.limit ?? 50)));
  const rows = await db
    .select()
    .from(settingsChangeLog)
    .where(moduleFilter ? eq(settingsChangeLog.module, moduleFilter) : undefined)
    .orderBy(desc(settingsChangeLog.changedAt))
    .limit(limit);
  res.json(ListSettingsChangeLogResponse.parse({ data: rows.map(toRow) }));
});

router.get("/settings/change-log/:id", async (req: Request, res: Response) => {
  const { id } = GetSettingsChangeParams.parse(req.params);
  const [row] = await db.select().from(settingsChangeLog).where(eq(settingsChangeLog.id, id));
  if (!row) throw notFound("Change-log entry not found");
  res.json(GetSettingsChangeResponse.parse({ data: toRow(row) }));
});

// Only engine_thresholds rollback is wired in this checkpoint — its rows are
// a single parameterKey -> parameterValue upsert. fx_rates uses a composite
// (baseCurrency, quoteCurrency, asOf) key encoded into settingKey as
// "EUR:USD:2026-07-15" (see Task 8) and every other module is an entity
// table — both need per-module unpacking that is out of scope here (see this
// plan's Global Constraints: entity-table and fx_rates rollback are
// deferred to the Governance & Audit UI phase).
router.post("/settings/change-log/:id/rollback", async (req: Request, res: Response) => {
  const { id } = RollbackSettingsChangeParams.parse(req.params);
  const body = RollbackSettingsChangeBody.safeParse(req.body ?? {});
  const actor = getActor(req);
  const [row] = await db.select().from(settingsChangeLog).where(eq(settingsChangeLog.id, id));
  if (!row) throw notFound("Change-log entry not found");

  if (row.module !== "engine_thresholds") {
    throw conflict(`Rollback not yet supported for module "${row.module}"`);
  }

  if (row.action !== "update") {
    throw conflict(`Cannot roll back a "${row.action}" entry — only original update changes can be rolled back`);
  }

  const inverse = computeRollback({
    module: row.module,
    settingKey: row.settingKey,
    entityId: row.entityId,
    action: row.action,
    oldValue: row.oldValue,
    newValue: row.newValue,
  });

  // `settingsChangeLog.oldValue`/`newValue` are jsonb columns, and
  // drizzle-orm's PgJsonb#mapFromDriverValue unconditionally re-JSON.parses
  // any string the driver hands back — but `pg` already auto-decodes jsonb
  // text itself, so a stored plain string like the JSON text `"21"` comes
  // back from `pg` as the JS string "21", then gets *re*-parsed by drizzle
  // into the JS number 21. engine_thresholds values are always strings at
  // the storage layer (parameterValue is `text`), so this double-decode is
  // silently lossy for anything that also happens to be valid JSON on its
  // own (numbers, "true"/"false"/"null") — a bare `typeof === "string"`
  // check would incorrectly 409 on exactly the numeric thresholds this
  // route exists to roll back. Coerce any of the primitive shapes drizzle
  // could have handed back into the text form the column actually needs;
  // only reject non-primitives (object/array) and null/undefined.
  const restoreValue =
    typeof inverse.valueToRestore === "string" ||
    typeof inverse.valueToRestore === "number" ||
    typeof inverse.valueToRestore === "boolean"
      ? String(inverse.valueToRestore)
      : undefined;

  if (inverse.action !== "update" || restoreValue === undefined) {
    throw conflict(`Cannot automatically apply a "${inverse.action}" rollback for module "${row.module}"`);
  }

  await db
    .insert(engineThresholds)
    .values({ parameterKey: inverse.settingKey, parameterValue: restoreValue })
    .onConflictDoUpdate({
      target: engineThresholds.parameterKey,
      set: { parameterValue: restoreValue },
    });

  await logSettingsChange({
    module: row.module,
    settingKey: row.settingKey,
    action: "rollback",
    oldValue: row.newValue,
    newValue: restoreValue,
    dataType: row.dataType,
    actor: actor.username,
    reason: body.success ? body.data.reason : undefined,
    rollbackOf: row.id,
  });

  res.json({ data: { restored: restoreValue } });
});

router.get("/settings/config/export", async (_req: Request, res: Response) => {
  const thresholds = await db.select().from(engineThresholds);
  // scoring_model_weights is an append-only history table (one row per
  // calibration, not per feature) — mirror the same "latest row per
  // featureId" dedup that `getScoringWeights()` (lib/scoring.ts) already
  // does internally, so "export" means "the current effective
  // configuration" rather than the entire calibration history. Without
  // this, repeated export -> import round-trips grow the table unbounded.
  const scoringWeightHistory = await db
    .select()
    .from(scoringModelWeights)
    .orderBy(desc(scoringModelWeights.calibrationDate));
  const latestByFeature = new Map<string, typeof scoringModelWeights.$inferSelect>();
  for (const row of scoringWeightHistory) {
    if (!latestByFeature.has(row.featureId)) latestByFeature.set(row.featureId, row);
  }
  const scoringWeights = [...latestByFeature.values()];
  res.json({
    data: {
      exportedAt: new Date().toISOString(),
      engineThresholds: thresholds.map((t) => ({
        parameterKey: t.parameterKey,
        parameterValue: t.parameterValue,
        dataType: t.dataType,
      })),
      scoringModelWeights: scoringWeights.map((w) => ({
        featureId: w.featureId,
        // scoringModelWeights.calibratedWeight is a Postgres `numeric`
        // column; drizzle-orm returns numeric columns as strings (to avoid
        // silent float-precision loss), but ImportSettingsConfigBody's
        // `calibratedWeight` is typed `number` (it's re-stringified on the
        // way back in via `String(...)` on the import side below) — coerce
        // here so an export is directly re-postable to /config/import.
        calibratedWeight: Number(w.calibratedWeight),
      })),
    },
  });
});

// Re-applies a previously exported snapshot. Scoped to the two
// engine_thresholds/scoring_model_weights-backed tables this checkpoint
// covers (same limitation as rollback — see this plan's Global Constraints).
// Each restored row is individually audit-logged with action "import" so the
// change log stays a complete record of what happened, not just that an
// import occurred.
router.post("/settings/config/import", async (req: Request, res: Response) => {
  const parsed = ImportSettingsConfigBody.safeParse(req.body);
  if (!parsed.success) {
    throw badRequest("Invalid config import payload", parsed.error.issues);
  }
  const actor = getActor(req);

  const priorThresholds = await db.select().from(engineThresholds);
  const priorByKey = new Map(priorThresholds.map((t) => [t.parameterKey, t.parameterValue]));
  for (const row of parsed.data.engineThresholds) {
    await db
      .insert(engineThresholds)
      .values({ parameterKey: row.parameterKey, parameterValue: row.parameterValue })
      .onConflictDoUpdate({
        target: engineThresholds.parameterKey,
        set: { parameterValue: row.parameterValue },
      });
    await logSettingsChange({
      module: "engine_thresholds",
      settingKey: row.parameterKey,
      action: "import",
      oldValue: priorByKey.get(row.parameterKey) ?? null,
      newValue: row.parameterValue,
      dataType: "number",
      actor: actor.username,
    });
  }

  const priorWeights = await db.select().from(scoringModelWeights);
  const priorWeightByFeature = new Map(priorWeights.map((w) => [w.featureId, w.calibratedWeight]));
  const importedAt = new Date().toISOString().slice(0, 10);
  for (const row of parsed.data.scoringModelWeights) {
    await db.insert(scoringModelWeights).values({
      featureId: row.featureId,
      calibratedWeight: String(row.calibratedWeight),
      sampleSize: 0,
      calibrationDate: importedAt,
    });
    await logSettingsChange({
      module: "scoring_model_weights",
      settingKey: row.featureId,
      action: "import",
      oldValue: priorWeightByFeature.get(row.featureId) ?? null,
      newValue: row.calibratedWeight,
      dataType: "number",
      actor: actor.username,
    });
  }

  res.json({ data: { importedThresholds: parsed.data.engineThresholds.length, importedWeights: parsed.data.scoringModelWeights.length } });
});

export default router;
