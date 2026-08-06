import { describe, it, expect, beforeAll, beforeEach } from "vitest";
import type { Request, Response } from "express";
import { initCatalystApp, createEngineThresholdsRepo } from "@workspace/db/catalyst";
import { installCatalystFake, type CatalystTestStore } from "../test-support/catalyst-test-app";
import router from "./lookups";

// F11: PUT /lookups/engine-thresholds used to upsert ANY parameter_key sent,
// including ones absent from engine_thresholds entirely. validateThresholdUpdate
// only applies its numeric/bounds rules to keys it recognizes by fixed name
// (POSITIVE_WEIGHT_KEYS etc.) or that are already present in `current`, so a
// genuinely unknown key — a typo, or something from a stale client — sailed
// through with zero validation and landed in the table as a brand-new row.
// Same handler-extraction technique as every other route test in this repo
// (see routes/users.test.ts) — no supertest harness exists.
function getHandler(method: "get" | "put", path: string) {
  const stack = (router as unknown as {
    stack: Array<{
      route?: {
        path: string;
        methods: Record<string, boolean>;
        stack: Array<{ handle: (req: Request, res: Response) => unknown }>;
      };
    }>;
  }).stack;
  const layer = stack.find((l) => l.route?.path === path && l.route.methods[method]);
  if (!layer?.route) throw new Error(`Route ${method.toUpperCase()} ${path} not registered`);
  return layer.route.stack[0].handle;
}

const ACTOR = { id: "eeeeeeee-0000-0000-0000-000000000001", username: "lookups-test-actor", displayName: "Lookups Test Actor", role: "admin" };

function fakeReq(body: unknown): Request {
  return { body, params: {}, query: {}, headers: {}, actor: ACTOR } as unknown as Request;
}

function fakeRes(): Response {
  return { json: () => undefined, status() { return this; } } as unknown as Response;
}

async function callExpectingThrow(req: Request): Promise<{ status: number; message: string }> {
  const handler = getHandler("put", "/lookups/engine-thresholds");
  try {
    await handler(req, fakeRes());
  } catch (err) {
    const e = err as { status?: number; message?: string };
    return { status: e.status ?? 0, message: e.message ?? "" };
  }
  throw new Error("Expected the handler to throw, but it resolved");
}

let store: CatalystTestStore;

const valueOf = async (key: string): Promise<string | undefined> => {
  const rows = await createEngineThresholdsRepo(initCatalystApp({ headers: {} })).listAll();
  return rows.find((r) => r.parameterKey === key)?.parameterValue;
};

beforeAll(() => {
  ({ store } = installCatalystFake());
});

beforeEach(() => {
  store.reset();
  // Only the one key these tests read. `validateThresholdUpdate` applies its
  // bounds rules to keys it recognises by fixed name OR that already exist in
  // `current`, so an existing row is what makes `elephant_tcv_threshold` the
  // "valid key" half of the unknown-key assertions.
  store.seedRaw("engine_thresholds", [
    {
      id: "1",
      parameter_key: "elephant_tcv_threshold",
      parameter_value: "500000",
      data_type_: "number",
      description: "Elephant TCV threshold",
    },
  ]);
});

// Runs against the in-memory Data Store (test-support/catalyst-test-app.ts).
describe("PUT /lookups/engine-thresholds — unknown parameter_key rejection (F11)", () => {
  it("rejects a completely unrecognized parameter_key with a 400, and writes nothing", async () => {
    const bogusKey = "definitely_not_a_real_threshold_key_vitest";

    const result = await callExpectingThrow(
      fakeReq({ updates: [{ parameter_key: bogusKey, parameter_value: "5" }] }),
    );

    expect(result.status).toBe(400);
    expect(result.message).toContain(bogusKey);
    expect(await valueOf(bogusKey)).toBeUndefined();
  });

  it("rejects the whole batch when only one of several keys is unrecognized, leaving the valid one untouched", async () => {
    const validKey = "elephant_tcv_threshold";
    const bogusKey = "another_bogus_key_vitest";
    const before = await valueOf(validKey);
    expect(before).toBeDefined();

    const result = await callExpectingThrow(
      fakeReq({
        updates: [
          { parameter_key: validKey, parameter_value: String(Number(before) + 1) },
          { parameter_key: bogusKey, parameter_value: "1" },
        ],
      }),
    );

    expect(result.status).toBe(400);
    expect(result.message).toContain(bogusKey);
    // The whole batch is rejected up front — the valid key is untouched too.
    expect(await valueOf(validKey)).toBe(before);
  });

  it("still accepts a batch where every key is a real, already-existing threshold", async () => {
    const validKey = "elephant_tcv_threshold";
    const before = await valueOf(validKey);
    expect(before).toBeDefined();

    const handler = getHandler("put", "/lookups/engine-thresholds");
    let jsonBody: unknown;
    const res = { json: (b: unknown) => { jsonBody = b; }, status() { return this; } } as unknown as Response;
    await handler(fakeReq({ updates: [{ parameter_key: validKey, parameter_value: before }] }), res);

    expect(jsonBody).toBeDefined();
    // Round-tripped the existing value back — no net change, nothing to restore.
    expect(await valueOf(validKey)).toBe(before);
  });
});
