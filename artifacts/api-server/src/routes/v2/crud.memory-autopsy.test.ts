import { describe, it, expect, afterAll } from "vitest";
import type { Request, Response } from "express";
import { inArray } from "drizzle-orm";
import { db, pool, dealMemory } from "@workspace/db";
import type { AuthedRequest } from "../../lib/auth";
import router from "./crud";

// Same technique as routes/v2/analytics.*.test.ts: no supertest harness
// exists in this repo, so pull the real handler off the router's stack and
// call it directly.
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

const createdMemoryIds: string[] = [];

async function createMemoryRow(overrides: Partial<typeof dealMemory.$inferInsert> = {}) {
  const [row] = await db
    .insert(dealMemory)
    .values({
      dealId: crypto.randomUUID(),
      accountName: "Autopsy Test Acct",
      dealName: "Autopsy Test Deal",
      outcome: "Lost",
      ...overrides,
    })
    .returning();
  createdMemoryIds.push(row.id);
  return row;
}

afterAll(async () => {
  if (createdMemoryIds.length > 0) {
    await db.delete(dealMemory).where(inArray(dealMemory.id, createdMemoryIds));
  }
  await pool.end();
});

// Skipped post-Catalyst-migration: routes/v2/crud.ts's GET /memory/search and
// PUT /memory/:id now read/write v2_deal_memory via Catalyst Data Store, not
// Drizzle/Postgres. `initCatalystApp(req)` requires real Catalyst
// session/headers to succeed — a fake `Request` object in a local Vitest run
// can never provide that (same "Data Store isn't reachable from localhost"
// limitation already documented for lookups.engine-thresholds.test.ts). This
// file's fixtures also seed via Drizzle directly, which the migrated handlers
// no longer read. Retire or rewrite as an integration test against the
// deployed AppSail app once Slice 6 seeding lands.
describe.skip("GET /memory/search?dealId= — exact deal lookup bypasses the LIMIT 50", () => {
  it("finds a row even when 50+ other rows were archived more recently", async () => {
    const target = await createMemoryRow({ archivedAt: new Date("2020-01-01T00:00:00Z") });
    // Push 55 fresher rows in front of it in archived_at DESC order — enough
    // to push the target past the route's LIMIT 50 when not filtered by
    // dealId.
    await Promise.all(Array.from({ length: 55 }, () => createMemoryRow({ archivedAt: new Date() })));

    const handler = getHandler("get", "/memory/search");
    const result = await call<{ data: { dealId: string }[] }>(
      handler,
      fakeReq({ query: { dealId: target.dealId } }),
    );
    expect(result.data).toHaveLength(1);
    expect(result.data[0].dealId).toBe(target.dealId);
  });
});

// Skipped post-Catalyst-migration — see the comment on the describe block above.
describe.skip("PUT /memory/:id — autopsy capture", () => {
  it("does not stamp autopsyCompletedAt when the body has no meaningfully-filled autopsy field", async () => {
    const row = await createMemoryRow();
    const handler = getHandler("put", "/memory/:id");

    // Present but empty — an isAutopsyUpdate-qualifying key whose value still
    // computes to a 0 quality score, the case the qualityScore > 0 gate
    // exists for.
    const result = await call<{ data: { autopsyCompletedAt: string | null; qualityScore: number | null } }>(
      handler,
      fakeReq({ params: { id: row.id }, body: { causal_chain: [] } }),
    );
    expect(result.data.qualityScore).toBe(0);
    expect(result.data.autopsyCompletedAt).toBeNull();
  });

  it("stamps autopsyCompletedAt once a real field is captured, then clears it via an explicit null", async () => {
    const row = await createMemoryRow();
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
});
