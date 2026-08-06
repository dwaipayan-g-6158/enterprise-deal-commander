import { describe, it, expect, beforeAll, beforeEach } from "vitest";
import type { Request, Response } from "express";
import { formatCatalystDateTime } from "@workspace/db/catalyst";
import type { AuthedRequest } from "../../lib/auth";
import { installCatalystFake, type CatalystTestStore } from "../../test-support/catalyst-test-app";
import router from "./crud";

// Same technique as the other route tests: no supertest harness exists, so
// pull the real handler off the router's stack and call it directly. Backed by
// the in-memory Data Store (test-support/catalyst-test-app.ts).
//
// This file is worth more than its size. It covers PUT /memory/:id, and the
// store it runs against rejects unknown column names using the real schema —
// which is exactly the check that was missing when `v2_deal_memory.key_lessons`
// shipped without ever having been created, making every autopsy save 500 in
// production while every read looked like legitimately-empty data. See the
// `key_lessons` round-trip test at the bottom.

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

function fakeReq(overrides: Partial<Request> = {}): Request {
  return {
    params: {},
    query: {},
    body: {},
    headers: {},
    actor: { id: "test-actor", username: "test-actor", displayName: "Test Actor", role: "admin" },
    ...overrides,
  } as unknown as AuthedRequest as unknown as Request;
}

async function call<T>(handler: (req: Request, res: Response) => unknown, req: Request): Promise<T> {
  let captured: T | undefined;
  const fakeRes = { json: (body: T) => { captured = body; } } as unknown as Response;
  await handler(req, fakeRes);
  if (captured === undefined) throw new Error("Handler did not call res.json");
  return captured;
}

let store: CatalystTestStore;
let seq = 0;

function createMemoryRow(overrides: Record<string, unknown> = {}): { id: string; dealId: string } {
  const id = crypto.randomUUID();
  const dealId = crypto.randomUUID();
  store.seedRaw("v2_deal_memory", [
    {
      id,
      deal_id: dealId,
      account_name: "Autopsy Test Acct",
      deal_name: `Autopsy Test Deal ${seq++}`,
      outcome: "Lost",
      archived_at: formatCatalystDateTime(new Date()),
      ...overrides,
    },
  ]);
  return { id, dealId };
}

beforeAll(() => {
  ({ store } = installCatalystFake());
});

beforeEach(() => {
  store.reset();
  seq = 0;
});

describe("GET /memory/search?dealId= — exact deal lookup bypasses the LIMIT 50", () => {
  it("finds a row even when 50+ other rows were archived more recently", async () => {
    const target = createMemoryRow({ archived_at: formatCatalystDateTime(new Date("2020-01-01T00:00:00Z")) });
    // Push 55 fresher rows in front of it in archived_at DESC order — enough to
    // push the target past the route's LIMIT 50 when not filtered by dealId.
    for (let i = 0; i < 55; i++) createMemoryRow();

    const result = await call<{ data: { dealId: string }[] }>(
      getHandler("get", "/memory/search"),
      fakeReq({ query: { dealId: target.dealId } }),
    );
    expect(result.data).toHaveLength(1);
    expect(result.data[0].dealId).toBe(target.dealId);
  });
});

describe("PUT /memory/:id — autopsy capture", () => {
  it("does not stamp autopsyCompletedAt when the body has no meaningfully-filled autopsy field", async () => {
    const row = createMemoryRow();
    // Present but empty — an isAutopsyUpdate-qualifying key whose value still
    // computes to a 0 quality score, the case the qualityScore > 0 gate exists for.
    const result = await call<{ data: { autopsyCompletedAt: string | null; qualityScore: number | null } }>(
      getHandler("put", "/memory/:id"),
      fakeReq({ params: { id: row.id }, body: { causal_chain: [] } }),
    );
    expect(result.data.qualityScore).toBe(0);
    expect(result.data.autopsyCompletedAt).toBeNull();
  });

  it("stamps autopsyCompletedAt once a real field is captured, then clears it via an explicit null", async () => {
    const row = createMemoryRow();
    const handler = getHandler("put", "/memory/:id");

    const first = await call<{ data: { autopsyCompletedAt: string | null; lossNarrative: string | null } }>(
      handler,
      fakeReq({ params: { id: row.id }, body: { loss_narrative: "Lost on price" } }),
    );
    expect(first.data.autopsyCompletedAt).not.toBeNull();
    expect(first.data.lossNarrative).toBe("Lost on price");

    // `??` used to treat an explicit null the same as "omitted" and silently
    // keep the existing value — this proves the field actually clears now.
    const cleared = await call<{ data: { lossNarrative: string | null } }>(
      handler,
      fakeReq({ params: { id: row.id }, body: { loss_narrative: null } }),
    );
    expect(cleared.data.lossNarrative).toBeNull();
  });

  // Regression for the missing-column bug. In production this 500'd with
  // Data Store's `400 INVALID_INPUT — Invalid column name key_lessons`, because
  // v2_deal_memory.key_lessons had never been created; reads returned null and
  // hid it, so only a SAVE surfaced it. The test store declares the real column
  // set, so deleting that column again would fail this test rather than reach
  // production.
  it("round-trips the narrative, key lessons and tags an autopsy save sends", async () => {
    const row = createMemoryRow();
    const result = await call<{
      data: { winLossNarrative: string | null; keyLessons: string[] | null; tags: string[] | null };
    }>(
      getHandler("put", "/memory/:id"),
      fakeReq({
        params: { id: row.id },
        body: {
          win_loss_narrative: "Lost on integration depth",
          key_lessons: ["Engage security earlier", "Bring the integration architect"],
          tags: ["displacement"],
        },
      }),
    );
    expect(result.data.winLossNarrative).toBe("Lost on integration depth");
    expect(result.data.keyLessons).toEqual(["Engage security earlier", "Bring the integration architect"]);
    expect(result.data.tags).toEqual(["displacement"]);

    // And it is genuinely persisted, not merely echoed back by the handler.
    const reread = await call<{ data: { keyLessons: string[] | null }[] }>(
      getHandler("get", "/memory/search"),
      fakeReq({ query: { dealId: row.dealId } }),
    );
    expect(reread.data[0].keyLessons).toEqual([
      "Engage security earlier",
      "Bring the integration architect",
    ]);
  });
});
