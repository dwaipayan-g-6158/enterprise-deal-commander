import { describe, it, expect, beforeAll, beforeEach } from "vitest";
import type { Request, Response } from "express";
import {
  initCatalystApp,
  createEngineThresholdsRepo,
  createSettingsChangeLogRepo,
} from "@workspace/db/catalyst";
import { installCatalystFake, type CatalystTestStore } from "../test-support/catalyst-test-app";
import router from "./settings-audit";

// M4 regression cover: `engine_thresholds` is written by THREE routes. Task 12
// wired `validateThresholdUpdate` into PUT /lookups/engine-thresholds only, so
// the rollback and config-import routes in this file remained an unguarded path
// to exactly the values that gate rejects (a zero risk weight collapses every
// deal's risk to LOW/GREEN; non-monotonic risk_level_* boundaries make levels
// unreachable). Handler-extraction technique matches analytics.tcv.test.ts.
// Runs against the in-memory Data Store (test-support/catalyst-test-app.ts).
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
  return {
    params: over.params ?? {},
    body: over.body,
    query: {},
    headers: {},
    actor: ACTOR,
  } as unknown as Request;
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

let store: CatalystTestStore;

const app = () => initCatalystApp({ headers: {} });

const valueOf = async (key: string): Promise<string | undefined> => {
  const rows = await createEngineThresholdsRepo(app()).listAll();
  return rows.find((r) => r.parameterKey === key)?.parameterValue;
};

const changeLog = async () => createSettingsChangeLogRepo(app()).listAll();

const countImportLogs = async (key: string): Promise<number> =>
  (await changeLog()).filter((r) => r.settingKey === key && r.action === "import").length;

/**
 * Record a real change-log entry through the repository and hand back its id.
 * `record()` mints the id itself, so the row is found by settingKey afterwards
 * rather than by an id chosen here — which also keeps the old_value/new_value
 * JSON round-trip exactly the one production performs.
 */
async function seedChangeLogEntry(settingKey: string, oldValue: unknown, newValue: unknown): Promise<string> {
  await createSettingsChangeLogRepo(app()).record({
    module: "engine_thresholds",
    settingKey,
    action: "update",
    oldValue,
    newValue,
    dataType: "number",
    actor: "vitest",
  });
  const row = (await changeLog()).find((r) => r.settingKey === settingKey && r.action === "update");
  if (!row) throw new Error(`fixture change-log row for ${settingKey} not found`);
  return row.id;
}

beforeAll(() => {
  ({ store } = installCatalystFake());
});

beforeEach(() => {
  store.reset();
  // `validateThresholdUpdate` resolves an unspecified risk_level_* sibling from
  // whatever is currently stored, so the boundary rule only has something to
  // compare against if these rows exist. Values are the engine defaults
  // (deriveRiskBoundaries in lib/engine-config.ts).
  store.seedRaw("engine_thresholds", [
    { id: "1", parameter_key: "elephant_tcv_threshold", parameter_value: "500000", data_type_: "number" },
    { id: "2", parameter_key: "risk_weight_technical", parameter_value: "0.15", data_type_: "number" },
    { id: "3", parameter_key: "risk_weight_commercial", parameter_value: "0.15", data_type_: "number" },
    { id: "4", parameter_key: "risk_level_low_max", parameter_value: "25", data_type_: "number" },
    { id: "5", parameter_key: "risk_level_moderate_max", parameter_value: "50", data_type_: "number" },
    { id: "6", parameter_key: "risk_level_elevated_max", parameter_value: "75", data_type_: "number" },
  ]);
});

describe("POST /settings/change-log/:id/rollback — threshold bound validation", () => {
  it("rejects a rollback that would restore a zero risk weight, and writes nothing", async () => {
    const key = "risk_weight_technical";
    const before = await valueOf(key);

    // A prior change-log entry whose *old* value is the out-of-bounds one, so
    // rolling it back is what tries to reintroduce 0.
    const logId = await seedChangeLogEntry(key, "0", "0.15");

    const result = await callExpectingThrow(
      "/settings/change-log/:id/rollback",
      fakeReq({ params: { id: logId }, body: { reason: "vitest attempt" } }),
    );
    expect(result.status).toBe(400);
    expect(result.message).toContain(key);

    // The threshold is untouched — including staying absent if it was absent.
    expect(await valueOf(key)).toBe(before);
    const rollbackLogs = (await changeLog()).filter(
      (r) => r.rollbackOf === logId && r.action === "rollback",
    );
    expect(rollbackLogs).toHaveLength(0);
  });

  it("still applies a rollback whose restored value is in bounds (the guard does not over-block)", async () => {
    const key = "risk_weight_technical";
    const logId = await seedChangeLogEntry(key, "0.2", "0.15");

    const ok = await callHandler(
      "/settings/change-log/:id/rollback",
      fakeReq({ params: { id: logId }, body: { reason: "vitest restore" } }),
    );

    expect((ok.body as { data: { restored: string } }).data.restored).toBe("0.2");
    expect(await valueOf(key)).toBe("0.2");
    const rollbackLogs = (await changeLog()).filter(
      (r) => r.rollbackOf === logId && r.action === "rollback",
    );
    expect(rollbackLogs).toHaveLength(1);
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
    // No new audit row either.
    expect(await countImportLogs(validKey)).toBe(importLogsBefore);
  });

  it("rejects non-monotonic risk_level_* boundaries in an import payload", async () => {
    const before = await valueOf("risk_level_low_max");
    expect(before).toBe("25");

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
    expect(await valueOf("risk_level_low_max")).toBe(before);
  });

  it("still applies a valid import payload (the guard does not over-block)", async () => {
    const key = "elephant_tcv_threshold";
    const original = await valueOf(key);
    expect(original).toBeDefined();
    const bumped = String(Number(original) + 1);

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
    expect(await countImportLogs(key)).toBe(1);
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
    expect(store.count("v2_scoring_model_weights")).toBe(0);
  });

  it("rejects a negative calibratedWeight with 400, writing nothing", async () => {
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
    expect(store.count("v2_scoring_model_weights")).toBe(0);
  });

  it("accepts an in-bounds calibratedWeight (the bound does not over-block)", async () => {
    const ok = await callHandler(
      "/settings/config/import",
      fakeReq({
        body: {
          engineThresholds: [],
          scoringModelWeights: [{ featureId: probeFeatureId, calibratedWeight: 0.4 }],
        },
      }),
    );
    expect((ok.body as { data: { importedWeights: number } }).data.importedWeights).toBe(1);
    expect(store.count("v2_scoring_model_weights")).toBe(1);
  });
});
