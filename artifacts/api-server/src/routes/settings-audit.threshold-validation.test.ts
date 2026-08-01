import { describe, it, expect, afterAll } from "vitest";
import type { Request, Response } from "express";
import { and, eq, inArray } from "drizzle-orm";
import { db, pool, engineThresholds, settingsChangeLog, scoringModelWeights } from "@workspace/db";
import router from "./settings-audit";

// M4 regression cover: `engine_thresholds` is written by THREE routes. Task 12
// wired `validateThresholdUpdate` into PUT /lookups/engine-thresholds only, so
// the rollback and config-import routes in this file remained an unguarded path
// to exactly the values that gate rejects (a zero risk weight collapses every
// deal's risk to LOW/GREEN; non-monotonic risk_level_* boundaries make levels
// unreachable). Handler-extraction technique matches analytics.tcv.test.ts.
function getPostHandler(path: string) {
  const stack = (router as unknown as {
    stack: Array<{
      route?: {
        path: string;
        methods: Record<string, boolean>;
        stack: Array<{ handle: (req: Request, res: Response) => unknown }>;
      };
    }>;
  }).stack;
  const layer = stack.find((l) => l.route?.path === path && l.route.methods.post);
  if (!layer?.route) throw new Error(`Route POST ${path} not registered`);
  return layer.route.stack[0].handle;
}

const ACTOR = { id: "00000000-0000-0000-0000-000000000000", username: "vitest", displayName: "Vitest", role: "admin" };

function fakeReq(over: { params?: Record<string, string>; body?: unknown }): Request {
  return { params: over.params ?? {}, body: over.body, actor: ACTOR } as unknown as Request;
}

async function callHandler(path: string, req: Request): Promise<{ status: number; body: unknown }> {
  const handler = getPostHandler(path);
  let captured: unknown;
  const fakeRes = {
    json: (body: unknown) => {
      captured = body;
    },
  } as unknown as Response;
  await handler(req, fakeRes);
  return { status: 200, body: captured };
}

/** Runs a handler expected to throw an HttpError, returning its status/message. */
async function callExpectingThrow(path: string, req: Request): Promise<{ status: number; message: string }> {
  try {
    await callHandler(path, req);
  } catch (err) {
    const e = err as { status?: number; message?: string };
    return { status: e.status ?? 0, message: e.message ?? "" };
  }
  throw new Error("Expected the handler to throw, but it resolved");
}

const valueOf = async (key: string): Promise<string | undefined> => {
  const [row] = await db
    .select({ v: engineThresholds.parameterValue })
    .from(engineThresholds)
    .where(eq(engineThresholds.parameterKey, key));
  return row?.v;
};

const importLogIds = async (key: string): Promise<string[]> => {
  const rows = await db
    .select({ id: settingsChangeLog.id })
    .from(settingsChangeLog)
    .where(and(eq(settingsChangeLog.settingKey, key), eq(settingsChangeLog.action, "import")));
  return rows.map((r) => r.id);
};

const countImportLogs = async (key: string): Promise<number> => (await importLogIds(key)).length;

const createdLogIds: string[] = [];

afterAll(async () => {
  if (createdLogIds.length > 0) {
    await db.delete(settingsChangeLog).where(inArray(settingsChangeLog.id, createdLogIds));
  }
  await pool.end();
});

describe("POST /settings/change-log/:id/rollback — threshold bound validation", () => {
  it("rejects a rollback that would restore a zero risk weight, and writes nothing", async () => {
    const key = "risk_weight_technical";
    const before = await valueOf(key);

    // A prior change-log entry whose *old* value is the out-of-bounds one, so
    // rolling it back is what tries to reintroduce 0.
    const [logRow] = await db
      .insert(settingsChangeLog)
      .values({
        module: "engine_thresholds",
        settingKey: key,
        action: "update",
        oldValue: "0",
        newValue: "0.15",
        dataType: "number",
        actor: "vitest",
      })
      .returning({ id: settingsChangeLog.id });
    createdLogIds.push(logRow.id);

    const result = await callExpectingThrow(
      "/settings/change-log/:id/rollback",
      fakeReq({ params: { id: logRow.id }, body: { reason: "vitest attempt" } }),
    );
    expect(result.status).toBe(400);
    expect(result.message).toContain(key);

    // The threshold is untouched — including staying absent if it was absent.
    expect(await valueOf(key)).toBe(before);
    const rollbackLogs = await db
      .select()
      .from(settingsChangeLog)
      .where(and(eq(settingsChangeLog.rollbackOf, logRow.id), eq(settingsChangeLog.action, "rollback")));
    expect(rollbackLogs).toHaveLength(0);
  });
});

describe("POST /settings/config/import — threshold bound validation", () => {
  it("rejects the whole batch when any threshold is invalid, writing none of them", async () => {
    const validKey = "elephant_tcv_threshold";
    const invalidKey = "risk_weight_commercial";
    const validBefore = await valueOf(validKey);
    const invalidBefore = await valueOf(invalidKey);
    const importLogsBefore = await countImportLogs(validKey);

    const result = await callExpectingThrow(
      "/settings/config/import",
      fakeReq({
        body: {
          engineThresholds: [
            // Deliberately FIRST in array order: an unvalidated loop would have
            // already committed this one before reaching the invalid entry.
            { parameterKey: validKey, parameterValue: "777777" },
            { parameterKey: invalidKey, parameterValue: "0" },
          ],
          scoringModelWeights: [],
        },
      }),
    );
    expect(result.status).toBe(400);
    expect(result.message).toContain(invalidKey);

    expect(await valueOf(validKey)).toBe(validBefore);
    expect(await valueOf(invalidKey)).toBe(invalidBefore);
    // No new audit row either — a delta, since this shared dev DB already holds
    // legitimate historical "import" entries for this key.
    expect(await countImportLogs(validKey)).toBe(importLogsBefore);
  });

  it("rejects non-monotonic risk_level_* boundaries in an import payload", async () => {
    const result = await callExpectingThrow(
      "/settings/config/import",
      fakeReq({
        body: {
          engineThresholds: [
            { parameterKey: "risk_level_low_max", parameterValue: "80" },
            { parameterKey: "risk_level_moderate_max", parameterValue: "40" },
            { parameterKey: "risk_level_elevated_max", parameterValue: "60" },
          ],
          scoringModelWeights: [],
        },
      }),
    );
    expect(result.status).toBe(400);
    expect(result.message).toContain("risk_level boundaries");
    expect(await valueOf("risk_level_low_max")).not.toBe("80");
  });

  it("still applies a valid import payload (the guard does not over-block)", async () => {
    const key = "elephant_tcv_threshold";
    const original = await valueOf(key);
    expect(original).toBeDefined();
    const bumped = String(Number(original) + 1);
    // Snapshot the PRE-EXISTING audit rows for this key so cleanup below removes
    // only the one this test causes. This dev DB holds real historical "import"
    // entries; deleting every match would destroy them.
    const priorLogIds = new Set(await importLogIds(key));

    const ok = await callHandler(
      "/settings/config/import",
      fakeReq({
        body: {
          engineThresholds: [{ parameterKey: key, parameterValue: bumped }],
          scoringModelWeights: [],
        },
      }),
    );
    expect((ok.body as { data: { importedThresholds: number } }).data.importedThresholds).toBe(1);
    expect(await valueOf(key)).toBe(bumped);

    // Restore, so this suite leaves the shared dev DB as it found it.
    await db
      .update(engineThresholds)
      .set({ parameterValue: original! })
      .where(eq(engineThresholds.parameterKey, key));
    const newLogIds = (await importLogIds(key)).filter((id) => !priorLogIds.has(id));
    createdLogIds.push(...newLogIds);
  });
});

// This is the one remaining write path to scoring_model_weights that bypassed
// the [0,1] bound PUT /config/scoring-weights already enforces via
// ScoringWeightsUpdate's OpenAPI contract — see the fix for the final
// whole-branch review's config-import scoring-weight bound finding. Proves
// the same bound now also applies to ImportSettingsConfigBody's
// scoringModelWeights[].calibratedWeight.
describe("POST /settings/config/import — scoring weight bound validation", () => {
  const probeFeatureId = "test_import_bound_probe";

  it("rejects an out-of-range calibratedWeight with 400, writing nothing", async () => {
    const before = await db
      .select()
      .from(scoringModelWeights)
      .where(eq(scoringModelWeights.featureId, probeFeatureId));

    const result = await callExpectingThrow(
      "/settings/config/import",
      fakeReq({
        body: {
          engineThresholds: [],
          scoringModelWeights: [{ featureId: probeFeatureId, calibratedWeight: 1.5 }],
        },
      }),
    );
    expect(result.status).toBe(400);

    const after = await db
      .select()
      .from(scoringModelWeights)
      .where(eq(scoringModelWeights.featureId, probeFeatureId));
    expect(after).toEqual(before);
  });

  it("rejects a negative calibratedWeight with 400, writing nothing", async () => {
    const before = await db
      .select()
      .from(scoringModelWeights)
      .where(eq(scoringModelWeights.featureId, probeFeatureId));

    const result = await callExpectingThrow(
      "/settings/config/import",
      fakeReq({
        body: {
          engineThresholds: [],
          scoringModelWeights: [{ featureId: probeFeatureId, calibratedWeight: -0.1 }],
        },
      }),
    );
    expect(result.status).toBe(400);

    const after = await db
      .select()
      .from(scoringModelWeights)
      .where(eq(scoringModelWeights.featureId, probeFeatureId));
    expect(after).toEqual(before);
  });
});
