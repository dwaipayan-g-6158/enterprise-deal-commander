import { describe, it, expect, beforeAll, afterAll } from "vitest";
import type { AddressInfo } from "node:net";
import express, { type Express, type Request, type Response, type NextFunction, type Response as ExpressResponse } from "express";
import cors from "cors";
import cookieParser from "cookie-parser";
import bcrypt from "bcryptjs";
import { eq } from "drizzle-orm";
import { db, pool, commanders } from "@workspace/db";
import router from "./index";
import { HttpError, sendError } from "../lib/http";
import { issueSession } from "../lib/auth";
import { READER_WRITE_METHOD_ALLOWLIST } from "../lib/rbac";
import { authSessionRouter } from "./auth";
import usersRouter from "./users";
import dealsRouter from "./deals";
import gatesRouter from "./gates";
import blockersRouter from "./blockers";
import crossSellsRouter from "./crosssells";
import intelligenceRouter from "./intelligence";
import dispositionsRouter from "./dispositions";
import interventionsRouter from "./interventions";
import auditRouter from "./audit";
import batSignalRouter from "./batsignal";
import lookupsRouter from "./lookups";
import settingsAuditRouter from "./settings-audit";
import v2Router from "./v2";

/**
 * The deny-by-default proof.
 *
 * Every router mounted BELOW the requireAuth/requireWriteRole gate in
 * routes/index.ts is walked here to enumerate every method+path it declares.
 * A reader cookie is then fired at every non-GET one and MUST get back
 * exactly 403 unless the exact path is in READER_WRITE_METHOD_ALLOWLIST.
 *
 * This is what makes a mutation route added tomorrow fail closed
 * automatically: it is discovered by the walk below and must either 403 or be
 * explicitly (and reviewably) allowlisted, or this test fails.
 *
 * Safe to run against the real dev DB: a 403 means requireWriteRole rejected
 * the request BEFORE any route handler ran, so none of these calls touch the
 * database regardless of the (empty) body sent. Only the small number of
 * pinned GET/login/public assertions at the bottom exercise real handlers,
 * and all of those are non-mutating by construction.
 */

interface RouteEntry {
  method: string;
  path: string;
}

function collectRoutes(router: unknown, prefix: string): RouteEntry[] {
  const stack = (router as { stack: unknown[] }).stack ?? [];
  const results: RouteEntry[] = [];
  for (const layer of stack as Array<{
    route?: { path: string; methods: Record<string, boolean> };
    handle?: { stack?: unknown[] };
  }>) {
    if (layer.route) {
      const path = prefix + layer.route.path;
      for (const [method, enabled] of Object.entries(layer.route.methods)) {
        if (enabled && method !== "_all") results.push({ method: method.toUpperCase(), path });
      }
    } else if (layer.handle?.stack) {
      // Every nested router in this codebase is mounted path-less
      // (router.use(subRouter), no path segment consumed) — v2Router nests
      // crud/analytics/config/exports/meddpicc exactly this way — so the
      // prefix carries through unchanged rather than needing to be derived
      // from Express's internal path-to-regexp state.
      results.push(...collectRoutes(layer.handle, prefix));
    }
  }
  return results;
}

function fullPath(prefix: string, routePath: string): string {
  // Placeholder value for every :param — irrelevant for this test, since a
  // 403 from requireWriteRole fires before any param is ever parsed.
  return ("/api" + prefix + routePath).replace(/:[^/]+/g, "test-id").toLowerCase();
}

const PROTECTED_V1_ROUTERS: Array<[unknown, string]> = [
  [authSessionRouter, "/v1"],
  [usersRouter, "/v1"],
  [dealsRouter, "/v1"],
  [gatesRouter, "/v1"],
  [blockersRouter, "/v1"],
  [crossSellsRouter, "/v1"],
  [intelligenceRouter, "/v1"],
  [dispositionsRouter, "/v1"],
  [interventionsRouter, "/v1"],
  [auditRouter, "/v1"],
  [batSignalRouter, "/v1"],
  [lookupsRouter, "/v1"],
  [settingsAuditRouter, "/v1"],
  [v2Router, "/v2"],
];

const allEntries = PROTECTED_V1_ROUTERS.flatMap(([router, prefix]) =>
  collectRoutes(router, prefix).map((e) => ({ ...e, fullPath: fullPath(prefix, e.path) })),
);
const writeEntries = allEntries.filter((e) => e.method !== "GET");

// Deliberately NOT importing ../app: app.ts reads globalThis.__dirname
// (`path.join(globalThis.__dirname, "public")`) to locate the built SPA for
// single-origin hosting, and that global is only ever set by build.mjs's
// esbuild banner in the production bundle — it's undefined under vitest/tsx,
// so importing app.ts directly throws before a single test runs. This
// mirrors the middleware chain that actually matters for RBAC (cors,
// cookies, body parsing, the /api router, the 404 and error handlers) and
// skips only the static-file/SPA-fallback block, which has nothing to do
// with authorization.
function buildTestApp(): Express {
  const testApp = express();
  testApp.use(cors());
  testApp.use(cookieParser());
  testApp.use(express.json());
  testApp.use(express.urlencoded({ extended: true }));
  testApp.use("/api", router);
  testApp.use("/api", (req: Request, res: Response) => {
    sendError(res, new HttpError(404, "NOT_FOUND", `No route for ${req.method} ${req.path}`));
  });
  testApp.use((err: unknown, _req: Request, res: Response, _next: NextFunction): void => {
    if (err instanceof HttpError) {
      sendError(res, err);
      return;
    }
    sendError(res, new HttpError(500, "INTERNAL_ERROR", "An unexpected error occurred"));
  });
  return testApp;
}

let server: ReturnType<Express["listen"]>;
let base: string;

const ADMIN_ID = "aaaaaaaa-0000-0000-0000-000000000001";
const READER_ID = "bbbbbbbb-0000-0000-0000-000000000002";
const ADMIN_USERNAME = `rbac-sweep-admin-${Date.now()}@example.com`;
const READER_USERNAME = `rbac-sweep-reader-${Date.now()}@example.com`;

let adminCookie: string;
let readerCookie: string;

function mintCookie(identity: { id: string; username: string; displayName: string }): string {
  let captured: { name: string; value: string } | undefined;
  const fakeRes = {
    cookie(name: string, value: string) {
      captured = { name, value };
    },
  } as unknown as ExpressResponse;
  issueSession(fakeRes, identity);
  if (!captured) throw new Error("issueSession did not call res.cookie");
  return `${captured.name}=${captured.value}`;
}

beforeAll(async () => {
  await db.delete(commanders).where(eq(commanders.id, ADMIN_ID));
  await db.delete(commanders).where(eq(commanders.id, READER_ID));
  await db.insert(commanders).values([
    {
      id: ADMIN_ID,
      username: ADMIN_USERNAME,
      displayName: "RBAC Sweep Admin",
      passwordHash: await bcrypt.hash("irrelevant", 4),
      role: "admin",
      isActive: true,
    },
    {
      id: READER_ID,
      username: READER_USERNAME,
      displayName: "RBAC Sweep Reader",
      passwordHash: await bcrypt.hash("irrelevant", 4),
      role: "reader",
      isActive: true,
    },
  ]);
  adminCookie = mintCookie({ id: ADMIN_ID, username: ADMIN_USERNAME, displayName: "RBAC Sweep Admin" });
  readerCookie = mintCookie({ id: READER_ID, username: READER_USERNAME, displayName: "RBAC Sweep Reader" });

  await new Promise<void>((resolve) => {
    server = buildTestApp().listen(0, () => resolve());
  });
  const port = (server.address() as AddressInfo).port;
  base = `http://127.0.0.1:${port}`;
});

afterAll(async () => {
  await db.delete(commanders).where(eq(commanders.id, ADMIN_ID));
  await db.delete(commanders).where(eq(commanders.id, READER_ID));
  await new Promise<void>((resolve) => server.close(() => resolve()));
  await pool.end();
});

describe("exhaustive deny-by-default sweep", () => {
  it("collected a substantial number of write routes to sweep (collection sanity check)", () => {
    expect(writeEntries.length).toBeGreaterThan(40);
  });

  it("every non-allowlisted write route rejects a reader with exactly 403 FORBIDDEN", async () => {
    for (const entry of writeEntries) {
      if (READER_WRITE_METHOD_ALLOWLIST.has(entry.fullPath)) continue;
      const res = await fetch(`${base}${entry.fullPath}`, {
        method: entry.method,
        headers: { Cookie: readerCookie, "content-type": "application/json" },
        body: entry.method === "GET" || entry.method === "DELETE" ? undefined : "{}",
      });
      expect
        .soft(res.status, `${entry.method} ${entry.fullPath} should 403 a reader`)
        .toBe(403);
      if (res.status === 403) {
        const body = (await res.json()) as { error?: { code?: string } };
        expect.soft(body.error?.code, `${entry.method} ${entry.fullPath} error code`).toBe("FORBIDDEN");
      }
    }
  });

  it("every allowlisted write route is reachable by a reader (not 403)", async () => {
    for (const path of READER_WRITE_METHOD_ALLOWLIST) {
      const res = await fetch(`${base}${path}`, {
        method: "POST",
        headers: { Cookie: readerCookie, "content-type": "application/json" },
        body: "{}",
      });
      expect.soft(res.status, `${path} should not 403 a reader`).not.toBe(403);
    }
  });
});

describe("public surface — unauthenticated access", () => {
  it("GET /api/healthz is public", async () => {
    const res = await fetch(`${base}/api/healthz`);
    expect(res.status).toBe(200);
  });

  it("POST /api/v1/auth/login with bad credentials is a 401 from the real handler, not the gate", async () => {
    const res = await fetch(`${base}/api/v1/auth/login`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email: "nobody@example.com", password: "wrong" }),
    });
    expect(res.status).toBe(401);
  });

  it("GET /api/v1/share/:token for a well-formed but unknown token is a 404 from the real handler", async () => {
    // bat_signals.token is a `uuid` column — a syntactically valid but
    // nonexistent UUID exercises the route's own `if (!signal) throw
    // notFound()` branch. (A malformed token like "does-not-exist" 500s
    // instead, from Postgres rejecting the invalid uuid literal — a
    // pre-existing rough edge in this public route, unrelated to RBAC.)
    const res = await fetch(`${base}/api/v1/share/00000000-0000-0000-0000-000000000000`);
    expect(res.status).toBe(404);
  });

  it("GET /api/v1/deals with no cookie is 401", async () => {
    const res = await fetch(`${base}/api/v1/deals`);
    expect(res.status).toBe(401);
  });

  it("GET /api/v2/activity with no cookie is 401", async () => {
    const res = await fetch(`${base}/api/v2/activity`);
    expect(res.status).toBe(401);
  });

  it("regression: GET /api/v1/settings/config/export with no cookie is 401 (the settings-audit.ts accidental-protection bug)", async () => {
    const res = await fetch(`${base}/api/v1/settings/config/export`);
    expect(res.status).toBe(401);
  });

  it("unknown path with no cookie is 401 (auth is checked before route existence)", async () => {
    const res = await fetch(`${base}/api/does-not-exist`);
    expect(res.status).toBe(401);
  });
});

describe("readers read everything", () => {
  it("GET /api/v1/deals is 200 for a reader", async () => {
    const res = await fetch(`${base}/api/v1/deals`, { headers: { Cookie: readerCookie } });
    expect(res.status).toBe(200);
  });

  it("GET /api/v1/settings/config/export is 200 for a reader", async () => {
    const res = await fetch(`${base}/api/v1/settings/config/export`, { headers: { Cookie: readerCookie } });
    expect(res.status).toBe(200);
  });

  it("GET /api/v1/users is 200 for a reader and never includes a passwordHash field", async () => {
    const res = await fetch(`${base}/api/v1/users`, { headers: { Cookie: readerCookie } });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { data: Array<Record<string, unknown>> };
    expect(body.data.length).toBeGreaterThan(0);
    for (const user of body.data) {
      expect(user).not.toHaveProperty("passwordHash");
      expect(user).not.toHaveProperty("password_hash");
    }
  });

  it("unknown path for an authenticated admin is a real 404", async () => {
    const res = await fetch(`${base}/api/does-not-exist`, { headers: { Cookie: adminCookie } });
    expect(res.status).toBe(404);
  });
});

describe("/auth/me reflects the real role", () => {
  it("reports 'reader' for the reader session", async () => {
    const res = await fetch(`${base}/api/v1/auth/me`, { headers: { Cookie: readerCookie } });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { role: string };
    expect(body.role).toBe("reader");
  });

  it("reports 'admin' for the admin session", async () => {
    const res = await fetch(`${base}/api/v1/auth/me`, { headers: { Cookie: adminCookie } });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { role: string };
    expect(body.role).toBe("admin");
  });
});
