import { describe, it, expect, beforeAll, beforeEach } from "vitest";
import type { Request, Response } from "express";
import crypto from "node:crypto";
import { initCatalystApp, createWebhooksRepo } from "@workspace/db/catalyst";
import { installCatalystFake, type CatalystTestStore } from "../../test-support/catalyst-test-app";
import type { AuthedRequest } from "../../lib/auth";
import router from "./crud";

// Same handler-extraction technique as crud.memory-autopsy.test.ts — no
// supertest harness exists in this repo, so pull the real handler off the
// router's stack and call it directly. Runs against the in-memory Data Store
// (test-support/catalyst-test-app.ts).
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

let store: CatalystTestStore;
let seq = 0;

const app = () => initCatalystApp({ headers: {} });

/**
 * Created through the real repository, then patched into the is_active /
 * failure_count state under test — `create()` deliberately hardcodes
 * failure_count to 0 and exposes no way to set it, which is correct for
 * production and useless for a fixture that needs a webhook already in the
 * auto-disabled state.
 */
async function createWebhookRow(overrides: { isActive?: boolean; failureCount?: number } = {}) {
  const row = await createWebhooksRepo(app()).create({
    webhookName: `Toggle Test Webhook ${seq++}`,
    targetUrl: "https://example.test/hook",
    secretKey: crypto.randomBytes(16).toString("hex"),
    events: ["deal.created"],
    isActive: true,
    createdBy: "test-actor",
  });
  const patch: Record<string, unknown> = {};
  if (overrides.isActive !== undefined) patch["is_active"] = String(overrides.isActive);
  if (overrides.failureCount !== undefined) patch["failure_count"] = String(overrides.failureCount);
  if (Object.keys(patch).length > 0) {
    const touched = store.patchRaw("v2_webhooks", (r) => r["id"] === row.id, patch);
    if (touched !== 1) throw new Error(`fixture patch touched ${touched} rows, expected 1`);
  }
  return { ...row, ...overrides };
}

beforeAll(() => {
  ({ store } = installCatalystFake());
});

beforeEach(() => {
  store.reset();
  seq = 0;
});

describe("PUT /webhooks/:id — failureCount reset on re-enable (F1)", () => {
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
    // Persisted, not just reflected in the response body.
    expect((await createWebhooksRepo(app()).getById(row.id))?.failureCount).toBe(0);
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
