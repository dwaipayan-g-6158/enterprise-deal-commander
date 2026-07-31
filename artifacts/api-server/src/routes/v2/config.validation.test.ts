import { describe, it, expect } from "vitest";
import type { Request, Response } from "express";
import router from "./config";

// Same technique as config.test.ts / deals.stage-guardrail.test.ts — no
// supertest harness exists in this repo, so pull the real handler off the
// router's stack and call it directly, catching whatever it throws. This
// proves the settings routes now reject invalid bodies with a legible 400
// (via safeParse + badRequest) instead of letting a bare ZodError escape as
// an unexplained 500 — see task-1-brief.md.
function getHandler(method: "post" | "put", path: string) {
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

async function callWithInvalidBody(
  method: "post" | "put",
  path: string,
  body: unknown,
  params: Record<string, string> = {},
) {
  const handler = getHandler(method, path);
  const fakeReq = { body, params } as unknown as Request;
  const fakeRes = { json: () => {}, status: () => fakeRes } as unknown as Response;
  let thrown: (Error & { status?: number; code?: string; details?: unknown }) | undefined;
  try {
    await handler(fakeReq, fakeRes);
  } catch (err) {
    thrown = err as typeof thrown;
  }
  return thrown;
}

describe("v2/config settings routes reject invalid bodies with 400, not 500", () => {
  it("POST /custom-patterns — missing required fields", async () => {
    const thrown = await callWithInvalidBody("post", "/custom-patterns", {});
    expect(thrown).toBeDefined();
    expect(thrown?.status).toBe(400);
    expect(thrown?.code).toBe("BAD_REQUEST");
    expect(thrown?.message).toBeTruthy();
    expect(Array.isArray(thrown?.details)).toBe(true);
    expect((thrown?.details as unknown[]).length).toBeGreaterThan(0);
  });

  it("PUT /custom-patterns/:id — missing required fields", async () => {
    const thrown = await callWithInvalidBody(
      "put",
      "/custom-patterns/:id",
      {},
      { id: "11111111-1111-1111-1111-111111111111" },
    );
    expect(thrown).toBeDefined();
    expect(thrown?.status).toBe(400);
    expect(thrown?.code).toBe("BAD_REQUEST");
    expect(thrown?.message).toBeTruthy();
    expect(Array.isArray(thrown?.details)).toBe(true);
  });

  it("PUT /config/targets — missing required fields", async () => {
    const thrown = await callWithInvalidBody("put", "/config/targets", {});
    expect(thrown).toBeDefined();
    expect(thrown?.status).toBe(400);
    expect(thrown?.code).toBe("BAD_REQUEST");
    expect(thrown?.message).toBeTruthy();
    expect(Array.isArray(thrown?.details)).toBe(true);
  });

  it("PUT /config/scoring-weights — weights not an array", async () => {
    const thrown = await callWithInvalidBody("put", "/config/scoring-weights", {
      weights: "not-an-array",
    });
    expect(thrown).toBeDefined();
    expect(thrown?.status).toBe(400);
    expect(thrown?.code).toBe("BAD_REQUEST");
    expect(thrown?.message).toBeTruthy();
    expect(Array.isArray(thrown?.details)).toBe(true);
  });

  // Scoring weights are fractions of 1.0 and feed a permanently-appended,
  // append-only history table (scoring_model_weights): a bad row here would
  // corrupt every subsequent deal's predictive score with no easy undo. These
  // two cases prove the OpenAPI-derived `minimum: 0, maximum: 1` bound (task-2)
  // rejects out-of-range weights with a clean 400 instead of a 500 (task-1)
  // or — worse — a silent, corrupting success.
  it("PUT /config/scoring-weights — negative weight is rejected with 400", async () => {
    const thrown = await callWithInvalidBody("put", "/config/scoring-weights", {
      weights: [{ feature_id: "gate_momentum", weight: -0.5 }],
    });
    expect(thrown).toBeDefined();
    expect(thrown?.status).toBe(400);
    expect(thrown?.code).toBe("BAD_REQUEST");
    expect(thrown?.message).toBeTruthy();
    expect(Array.isArray(thrown?.details)).toBe(true);
    expect((thrown?.details as unknown[]).length).toBeGreaterThan(0);
  });

  it("PUT /config/scoring-weights — weight above 1 (100%) is rejected with 400", async () => {
    const thrown = await callWithInvalidBody("put", "/config/scoring-weights", {
      weights: [{ feature_id: "gate_momentum", weight: 2 }],
    });
    expect(thrown).toBeDefined();
    expect(thrown?.status).toBe(400);
    expect(thrown?.code).toBe("BAD_REQUEST");
    expect(thrown?.message).toBeTruthy();
    expect(Array.isArray(thrown?.details)).toBe(true);
    expect((thrown?.details as unknown[]).length).toBeGreaterThan(0);
  });

  // pipeline_targets.target_value feeds computeCoverage/health-score ratios
  // directly as a divisor (lib/engine/src/flow.ts): a negative target would
  // flip every coverage ratio's sign instead of being rejected outright.
  // Proves the OpenAPI-derived `minimum: 0` bound (task-2) rejects it with a
  // clean 400 instead of a silently-corrupting 200 — see task-4-brief.md.
  it("PUT /config/targets — negative targetValue is rejected with 400", async () => {
    const thrown = await callWithInvalidBody("put", "/config/targets", {
      periodType: "quarter",
      periodStart: "2026-07-01",
      targetValue: -1,
    });
    expect(thrown).toBeDefined();
    expect(thrown?.status).toBe(400);
    expect(thrown?.code).toBe("BAD_REQUEST");
    expect(thrown?.message).toBeTruthy();
    expect(Array.isArray(thrown?.details)).toBe(true);
    expect((thrown?.details as unknown[]).length).toBeGreaterThan(0);
    // Pin down WHICH field failed — without this, the test would pass just as
    // happily if some unrelated Zod issue (e.g. a bad periodStart) were the
    // one caught, silently losing coverage of the `targetValue` minimum bound.
    expect(JSON.stringify(thrown?.details)).toContain("targetValue");
  });
});
