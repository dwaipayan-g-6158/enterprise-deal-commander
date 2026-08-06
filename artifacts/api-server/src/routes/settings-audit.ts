import { Router, type IRouter, type Request, type Response } from "express";
import {
  initCatalystApp,
  createSettingsChangeLogRepo,
  createEngineThresholdsRepo,
  createScoringModelWeightsRepo,
  type SettingsChangeLogRow,
} from "@workspace/db/catalyst";
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
import { logSettingsChange } from "../lib/catalyst/settings-audit";
import { computeRollback } from "../lib/settings-rollback";
import { validateThresholdUpdate } from "../lib/threshold-validation";

const router: IRouter = Router();

function toRow(r: SettingsChangeLogRow) {
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
    changedAt: r.changedAt.toISOString(),
  };
}

router.get("/settings/change-log", async (req: Request, res: Response) => {
  const catalystApp = initCatalystApp(req);
  const moduleFilter = typeof req.query.module === "string" ? req.query.module : undefined;
  const limit = Math.max(1, Math.min(200, Number(req.query.limit ?? 50)));
  // listAll() already returns newest-first (see the repo) — Data Store has no
  // WHERE/LIMIT at the Row API level, so the module filter and limit are
  // plain JS array ops, same pattern as every other migrated list endpoint.
  const rows = await createSettingsChangeLogRepo(catalystApp).listAll();
  const filtered = moduleFilter ? rows.filter((r) => r.module === moduleFilter) : rows;
  res.json(ListSettingsChangeLogResponse.parse({ data: filtered.slice(0, limit).map(toRow) }));
});

router.get("/settings/change-log/:id", async (req: Request, res: Response) => {
  const catalystApp = initCatalystApp(req);
  const { id } = GetSettingsChangeParams.parse(req.params);
  const row = await createSettingsChangeLogRepo(catalystApp).getById(id);
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
  const catalystApp = initCatalystApp(req);
  const { id } = RollbackSettingsChangeParams.parse(req.params);
  const body = RollbackSettingsChangeBody.safeParse(req.body ?? {});
  const actor = getActor(req);
  const row = await createSettingsChangeLogRepo(catalystApp).getById(id);
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

  // engine_thresholds values are always strings at the storage layer
  // (parameter_value is varchar) — coerce any primitive shape the change-log
  // JSON round-trip could have handed back into the text form the column
  // actually needs; only reject non-primitives (object/array) and
  // null/undefined. (No drizzle-orm jsonb double-decode gotcha to guard
  // against here — old_value/new_value are a plain JSON.stringify/parse
  // round-trip over a `text` column, not a Postgres jsonb driver value; see
  // the repo's rowToSettingsChangeLog comment.)
  const restoreValue =
    typeof inverse.valueToRestore === "string" ||
    typeof inverse.valueToRestore === "number" ||
    typeof inverse.valueToRestore === "boolean"
      ? String(inverse.valueToRestore)
      : undefined;

  if (inverse.action !== "update" || restoreValue === undefined) {
    throw conflict(`Cannot automatically apply a "${inverse.action}" rollback for module "${row.module}"`);
  }

  // Same bounded validation PUT /lookups/engine-thresholds applies (M4). This
  // route writes the same engine_thresholds table, so without it a rollback is
  // an alternate path to the very values that gate blocks — e.g. restoring a
  // risk_weight_* to 0 (collapsing every deal's risk to LOW/GREEN) or a
  // non-monotonic risk_level_* boundary. The rollback is a single
  // parameterKey/parameterValue pair; boundary rules resolve their unspecified
  // siblings from current DB state.
  const thresholdsRepo = createEngineThresholdsRepo(catalystApp);
  const currentThresholds = await thresholdsRepo.listAll();
  const currentMap = new Map(
    currentThresholds.map((t) => [t.parameterKey, { parameterValue: t.parameterValue, dataType: t.dataType }]),
  );
  const validation = validateThresholdUpdate(
    [{ parameter_key: inverse.settingKey, parameter_value: restoreValue }],
    currentMap,
  );
  if (!validation.valid) {
    throw badRequest(validation.error ?? "Invalid threshold rollback value");
  }

  await thresholdsRepo.upsertOne(inverse.settingKey, restoreValue);

  await logSettingsChange(req, {
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

/** Dedupe an append-only calibration history down to the newest row per featureId. */
function latestWeightPerFeature<T extends { featureId: string }>(sortedNewestFirst: T[]): Map<string, T> {
  const latest = new Map<string, T>();
  for (const row of sortedNewestFirst) {
    if (!latest.has(row.featureId)) latest.set(row.featureId, row);
  }
  return latest;
}

router.get("/settings/config/export", async (req: Request, res: Response) => {
  const catalystApp = initCatalystApp(req);
  const thresholds = await createEngineThresholdsRepo(catalystApp).listAll();
  // scoring_model_weights is an append-only history table (one row per
  // calibration, not per feature) — mirror the same "latest row per
  // featureId" dedup that `getScoringWeights()` (lib/catalyst/scoring.ts)
  // already does internally, so "export" means "the current effective
  // configuration" rather than the entire calibration history. Without
  // this, repeated export -> import round-trips grow the table unbounded.
  const scoringWeightHistory = await createScoringModelWeightsRepo(catalystApp).listAll();
  const scoringWeights = [...latestWeightPerFeature(scoringWeightHistory).values()];
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
        calibratedWeight: w.calibratedWeight,
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
  const catalystApp = initCatalystApp(req);
  const parsed = ImportSettingsConfigBody.safeParse(req.body);
  if (!parsed.success) {
    throw badRequest("Invalid config import payload", parsed.error.issues);
  }
  const actor = getActor(req);

  const thresholdsRepo = createEngineThresholdsRepo(catalystApp);
  const priorThresholds = await thresholdsRepo.listAll();
  const priorByKey = new Map(priorThresholds.map((t) => [t.parameterKey, t.parameterValue]));
  // Same bounded validation PUT /lookups/engine-thresholds applies (M4) — an
  // import is otherwise a way to smuggle in the values that gate rejects.
  // Validated as ONE batch before any write, so an invalid entry rejects the
  // whole payload rather than leaving the entries ahead of it already applied.
  // (Note the field-name casing differs: the import payload is camelCase,
  // ThresholdUpdateItem is snake_case.)
  const currentMap = new Map(
    priorThresholds.map((t) => [t.parameterKey, { parameterValue: t.parameterValue, dataType: t.dataType }]),
  );
  const thresholdValidation = validateThresholdUpdate(
    parsed.data.engineThresholds.map((row) => ({
      parameter_key: row.parameterKey,
      parameter_value: row.parameterValue,
    })),
    currentMap,
  );
  if (!thresholdValidation.valid) {
    throw badRequest(thresholdValidation.error ?? "Invalid engine thresholds in import payload");
  }
  for (const row of parsed.data.engineThresholds) {
    await thresholdsRepo.upsertOne(row.parameterKey, row.parameterValue);
    await logSettingsChange(req, {
      module: "engine_thresholds",
      settingKey: row.parameterKey,
      action: "import",
      oldValue: priorByKey.get(row.parameterKey) ?? null,
      newValue: row.parameterValue,
      dataType: "number",
      actor: actor.username,
    });
  }

  const scoringWeightsRepo = createScoringModelWeightsRepo(catalystApp);
  // The Drizzle original built `priorWeightByFeature` from an un-ordered
  // `db.select()`, so its "prior value" was really "whatever row order
  // Postgres happened to return" — not necessarily the latest calibration.
  // Data Store's Row API gives no comparable implicit ordering to replicate,
  // so this uses the same "latest per featureId" dedup as the export
  // endpoint above, which is the only value that's actually meaningful here
  // (the current effective weight being replaced).
  const priorWeights = await scoringWeightsRepo.listAll();
  const priorWeightByFeature = new Map(
    [...latestWeightPerFeature(priorWeights).values()].map((w) => [w.featureId, w.calibratedWeight]),
  );
  const importedAt = new Date().toISOString().slice(0, 10);
  for (const row of parsed.data.scoringModelWeights) {
    await scoringWeightsRepo.append(row.featureId, row.calibratedWeight, importedAt);
    await logSettingsChange(req, {
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
