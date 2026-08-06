import { describe, it, expect, afterAll } from "vitest";
import type { Request, Response } from "express";
import { eq } from "drizzle-orm";
import { db, pool, engineThresholds, settingsChangeLog } from "@workspace/db";
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
  return { body, params: {}, actor: ACTOR } as unknown as Request;
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

const valueOf = async (key: string): Promise<string | undefined> => {
  const [row] = await db
    .select({ v: engineThresholds.parameterValue })
    .from(engineThresholds)
    .where(eq(engineThresholds.parameterKey, key));
  return row?.v;
};

afterAll(async () => {
  // The one test below that reaches a real write logs a settings_change_log
  // row under this actor — this actor username is unique to this file, so
  // deleting everything it wrote is safe cleanup for the shared dev DB.
  await db.delete(settingsChangeLog).where(eq(settingsChangeLog.actor, ACTOR.username));
  await pool.end();
});

// Skipped post-Catalyst-migration: routes/lookups.ts now reads/writes
// engine_thresholds via Catalyst Data Store (see docs/CATALYST_SCHEMA.md),
// not Drizzle/Postgres. `initCatalystApp(req)` requires a real Catalyst
// session/headers to succeed — a fake `Request` object in a local Vitest
// run can never provide that, matching the same "Data Store isn't reachable
// from localhost" limitation already documented for the sibling
// Customer-Insight-Engine project (see [[periscope-cie-server]] in project
// memory). This file's fixtures (`elephant_tcv_threshold` etc.) also assume
// Postgres seed data that doesn't exist in Data Store yet (seeding is Slice
// 6). Retire or rewrite as an integration test against the deployed AppSail
// app once Slice 6 seeding lands — tracked in the migration plan.
describe.skip("PUT /lookups/engine-thresholds — unknown parameter_key rejection (F11)", () => {
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
