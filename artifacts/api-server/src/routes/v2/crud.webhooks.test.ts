import { describe, it, expect, afterAll } from "vitest";
import type { Request, Response } from "express";
import crypto from "node:crypto";
import { inArray } from "drizzle-orm";
import { db, pool, webhooks, settingsChangeLog } from "@workspace/db";
import type { AuthedRequest } from "../../lib/auth";
import router from "./crud";

// Same handler-extraction technique as crud.memory-autopsy.test.ts — no
// supertest harness exists in this repo, so pull the real handler off the
// router's stack and call it directly.
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

interface WebhookOut {
  id: string;
  webhookName: string;
  targetUrl: string;
  events: string[];
  isActive: boolean;
  failureCount: number;
}

async function call(handler: (req: Request, res: Response) => unknown, req: Request): Promise<{ data: WebhookOut }> {
  let captured: { data: WebhookOut } | undefined;
  const fakeRes = { json: (body: { data: WebhookOut }) => { captured = body; } } as unknown as Response;
  await handler(req, fakeRes);
  if (!captured) throw new Error("Handler did not call res.json");
  return captured;
}

const createdWebhookIds: string[] = [];
const suffix = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

async function createWebhookRow(overrides: Partial<typeof webhooks.$inferInsert> = {}) {
  const [row] = await db
    .insert(webhooks)
    .values({
      webhookName: `Toggle Test Webhook ${suffix}`,
      targetUrl: "https://example.test/hook",
      secretKey: crypto.randomBytes(16).toString("hex"),
      events: ["deal.created"],
      isActive: true,
      createdBy: "test-actor",
      ...overrides,
    })
    .returning();
  createdWebhookIds.push(row.id);
  return row;
}

afterAll(async () => {
  if (createdWebhookIds.length > 0) {
    await db.delete(settingsChangeLog).where(inArray(settingsChangeLog.entityId, createdWebhookIds));
    await db.delete(webhooks).where(inArray(webhooks.id, createdWebhookIds));
  }
  await pool.end();
});

// Skipped post-Catalyst-migration: routes/v2/crud.ts's PUT /webhooks/:id now
// reads/writes v2_webhooks via Catalyst Data Store, not Drizzle/Postgres.
// `initCatalystApp(req)` requires real Catalyst session/headers to succeed —
// a fake `Request` object in a local Vitest run can never provide that (same
// "Data Store isn't reachable from localhost" limitation already documented
// for lookups.engine-thresholds.test.ts). This file's fixtures also seed via
// Drizzle directly, which the migrated handler no longer reads. Retire or
// rewrite as an integration test against the deployed AppSail app once
// Slice 6 seeding lands.
describe.skip("PUT /webhooks/:id — failureCount reset on re-enable (F1)", () => {
  it("resets failureCount to 0 when is_active flips from false to true", async () => {
    const row = await createWebhookRow({ isActive: false, failureCount: 12 });
    const handler = getHandler("put", "/webhooks/:id");

    const result = await call(handler, fakeReq({
      params: { id: row.id },
      body: {
        webhook_name: row.webhookName,
        target_url: row.targetUrl,
        events: row.events,
        is_active: true,
      },
    }));

    expect(result.data.isActive).toBe(true);
    expect(result.data.failureCount).toBe(0);
  });

  it("does not reset failureCount when toggling other fields on an already-active webhook", async () => {
    const row = await createWebhookRow({ isActive: true, failureCount: 3 });
    const handler = getHandler("put", "/webhooks/:id");

    // is_active stays true (not a false->true transition) — only the name
    // changes. failureCount must be left untouched.
    const result = await call(handler, fakeReq({
      params: { id: row.id },
      body: {
        webhook_name: `${row.webhookName} renamed`,
        target_url: row.targetUrl,
        events: row.events,
        is_active: true,
      },
    }));

    expect(result.data.isActive).toBe(true);
    expect(result.data.failureCount).toBe(3);
  });

  it("does not reset failureCount when disabling an active webhook (true -> false)", async () => {
    const row = await createWebhookRow({ isActive: true, failureCount: 5 });
    const handler = getHandler("put", "/webhooks/:id");

    const result = await call(handler, fakeReq({
      params: { id: row.id },
      body: {
        webhook_name: row.webhookName,
        target_url: row.targetUrl,
        events: row.events,
        is_active: false,
      },
    }));

    expect(result.data.isActive).toBe(false);
    expect(result.data.failureCount).toBe(5);
  });
});
