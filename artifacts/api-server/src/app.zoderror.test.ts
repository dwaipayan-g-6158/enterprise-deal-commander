import { describe, it, expect, beforeAll, afterAll } from "vitest";
import type { AddressInfo } from "node:net";
import type { Response as ExpressResponse } from "express";
import bcrypt from "bcryptjs";
import { eq } from "drizzle-orm";
import { db, pool, commanders } from "@workspace/db";
import { issueSession } from "./lib/auth";

/**
 * End-to-end proof that a raw, uncaught ZodError reaching app.ts's error
 * middleware (src/app.ts, the branch added alongside the HttpError branch)
 * comes back as a legible 400 in the standard sendError envelope, not an
 * unexplained 500 -- see task-1-brief.md.
 *
 * This deliberately boots the REAL app.ts default export over a real HTTP
 * server, rather than reimplementing the middleware chain a second time.
 * index.rbac.test.ts already reimplements it locally (buildTestApp()) to
 * dodge app.ts's `globalThis.__dirname` read (only ever set by build.mjs's
 * esbuild banner in the production bundle) -- but that local copy doesn't
 * have the ZodError branch, so a regression in the real app.ts (e.g. the
 * branch getting reordered, deleted, or the `instanceof ZodError` check
 * subtly broken) would not be caught by that file. Stubbing __dirname to a
 * directory with no "public" subdirectory makes the SPA-static-file block a
 * no-op (`fs.existsSync(publicDir)` is false) without touching app.ts's
 * production behavior at all, so the import below pulls in the literal
 * production error-handling middleware.
 */
globalThis.__dirname = import.meta.dirname;
const { default: app } = await import("./app");

let server: ReturnType<typeof app.listen>;
let base: string;

const ADMIN_ID = "cccccccc-0000-0000-0000-000000000003";
const ADMIN_USERNAME = `zoderror-sweep-admin-${Date.now()}@example.com`;
let adminCookie: string;

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
  await db.insert(commanders).values({
    id: ADMIN_ID,
    username: ADMIN_USERNAME,
    displayName: "ZodError Sweep Admin",
    passwordHash: await bcrypt.hash("irrelevant", 4),
    role: "admin",
    isActive: true,
  });
  adminCookie = mintCookie({ id: ADMIN_ID, username: ADMIN_USERNAME, displayName: "ZodError Sweep Admin" });

  await new Promise<void>((resolve) => {
    server = app.listen(0, () => resolve());
  });
  const port = (server.address() as AddressInfo).port;
  base = `http://127.0.0.1:${port}`;
});

afterAll(async () => {
  await db.delete(commanders).where(eq(commanders.id, ADMIN_ID));
  await new Promise<void>((resolve) => server.close(() => resolve()));
  await pool.end();
});

describe("app.ts error middleware: raw ZodError -> 400", () => {
  it("POST /api/v2/playbooks (still a bare CreatePlaybookBody.parse(), out of task-1 scope) with an invalid body is 400, not 500", async () => {
    const res = await fetch(`${base}/api/v2/playbooks`, {
      method: "POST",
      headers: { Cookie: adminCookie, "content-type": "application/json" },
      // Missing the required `playbook_name` string -> CreatePlaybookBody.parse()
      // throws a raw ZodError that only app.ts's middleware ever sees.
      body: JSON.stringify({}),
    });

    expect(res.status).toBe(400);

    const contentType = res.headers.get("content-type");
    expect(contentType).toContain("application/json");

    const responseBody = (await res.json()) as {
      error?: { code?: string; message?: string; details?: unknown };
    };
    expect(responseBody.error?.code).toBe("BAD_REQUEST");
    expect(responseBody.error?.message).toBeTruthy();
    expect(Array.isArray(responseBody.error?.details)).toBe(true);
    expect((responseBody.error?.details as unknown[]).length).toBeGreaterThan(0);
    // Sanity check that these are genuine Zod issues (each has a `path` +
    // `message`), not some other array shape that happens to be non-empty.
    const firstIssue = (responseBody.error?.details as Array<{ path?: unknown; message?: unknown }>)[0];
    expect(firstIssue).toHaveProperty("message");
    expect(firstIssue).toHaveProperty("path");
  });
});
