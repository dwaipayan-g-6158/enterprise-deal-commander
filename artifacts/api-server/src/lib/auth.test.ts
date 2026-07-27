import { describe, it, expect, beforeAll, afterAll } from "vitest";
import type { Request, Response, NextFunction } from "express";
import { eq } from "drizzle-orm";
import { db, pool, commanders } from "@workspace/db";
import bcrypt from "bcryptjs";
import { issueSession, requireAuth, type AuthedRequest } from "./auth";

/**
 * Mints a real session cookie via the real issueSession, capturing whatever
 * cookie name/value it sets rather than hardcoding "edc_session" — these
 * tests should keep working even if the cookie name is ever renamed.
 */
function mintCookie(identity: { id: string; username: string; displayName: string }): {
  name: string;
  value: string;
} {
  let captured: { name: string; value: string } | undefined;
  const fakeRes = {
    cookie(name: string, value: string) {
      captured = { name, value };
    },
  } as unknown as Response;
  issueSession(fakeRes, identity);
  if (!captured) throw new Error("issueSession did not call res.cookie");
  return captured;
}

async function callRequireAuth(cookie: { name: string; value: string } | null): Promise<{
  actor: AuthedRequest["actor"];
  nextArg: unknown;
}> {
  const req = {
    cookies: cookie ? { [cookie.name]: cookie.value } : {},
  } as unknown as AuthedRequest;
  let nextArg: unknown;
  const next: NextFunction = ((err?: unknown) => {
    nextArg = err;
  }) as NextFunction;
  await requireAuth(req as unknown as Request, {} as Response, next);
  return { actor: req.actor, nextArg };
}

const TEST_ID = "eeeeeeee-1111-2222-3333-444444444444";
const TEST_USERNAME = `auth-test-${Date.now()}@example.com`;

describe("requireAuth", () => {
  beforeAll(async () => {
    await db.delete(commanders).where(eq(commanders.id, TEST_ID));
    await db.insert(commanders).values({
      id: TEST_ID,
      username: TEST_USERNAME,
      displayName: "Auth Test",
      passwordHash: await bcrypt.hash("irrelevant", 4),
      role: "reader",
      isActive: true,
    });
  });

  afterAll(async () => {
    await db.delete(commanders).where(eq(commanders.id, TEST_ID));
    await pool.end();
  });

  it("resolves the actor's role from the DB row, not from the token", async () => {
    const cookie = mintCookie({ id: TEST_ID, username: TEST_USERNAME, displayName: "Auth Test" });
    const { actor, nextArg } = await callRequireAuth(cookie);
    expect(nextArg).toBeUndefined();
    expect(actor).toMatchObject({ id: TEST_ID, role: "reader" });
  });

  it("a role change in the DB takes effect on the very next request, with the SAME cookie (no JWT staleness)", async () => {
    const cookie = mintCookie({ id: TEST_ID, username: TEST_USERNAME, displayName: "Auth Test" });

    await db.update(commanders).set({ role: "admin" }).where(eq(commanders.id, TEST_ID));
    const afterPromote = await callRequireAuth(cookie);
    expect(afterPromote.actor?.role).toBe("admin");

    await db.update(commanders).set({ role: "reader" }).where(eq(commanders.id, TEST_ID));
    const afterDemote = await callRequireAuth(cookie);
    expect(afterDemote.actor?.role).toBe("reader");
  });

  it("deactivating the row revokes the SAME cookie immediately, not in up to 7 days", async () => {
    const cookie = mintCookie({ id: TEST_ID, username: TEST_USERNAME, displayName: "Auth Test" });

    const beforeDeactivate = await callRequireAuth(cookie);
    expect(beforeDeactivate.nextArg).toBeUndefined();

    await db.update(commanders).set({ isActive: false }).where(eq(commanders.id, TEST_ID));
    const afterDeactivate = await callRequireAuth(cookie);
    expect(afterDeactivate.nextArg).toMatchObject({ status: 401 });

    // restore for subsequent tests in this file
    await db.update(commanders).set({ isActive: true }).where(eq(commanders.id, TEST_ID));
  });

  it("a deleted row also revokes the same cookie", async () => {
    const cookie = mintCookie({ id: TEST_ID, username: TEST_USERNAME, displayName: "Auth Test" });
    await db.delete(commanders).where(eq(commanders.id, TEST_ID));
    try {
      const { nextArg } = await callRequireAuth(cookie);
      expect(nextArg).toMatchObject({ status: 401 });
    } finally {
      // re-insert so later tests/afterAll cleanup still have a row to act on
      await db.insert(commanders).values({
        id: TEST_ID,
        username: TEST_USERNAME,
        displayName: "Auth Test",
        passwordHash: await bcrypt.hash("irrelevant", 4),
        role: "reader",
        isActive: true,
      });
    }
  });

  it("a non-UUID sub is rejected as 401, not a 500 from a malformed Postgres query", async () => {
    const cookie = mintCookie({ id: "not-a-uuid", username: "x", displayName: "x" });
    const { nextArg } = await callRequireAuth(cookie);
    expect(nextArg).toMatchObject({ status: 401 });
  });

  it("no cookie at all is 401", async () => {
    const { nextArg } = await callRequireAuth(null);
    expect(nextArg).toMatchObject({ status: 401 });
  });

  it("an invalid/tampered token is 401", async () => {
    const { nextArg } = await callRequireAuth({ name: "edc_session", value: "not-a-real-jwt" });
    expect(nextArg).toMatchObject({ status: 401 });
  });

  it("the idempotency guard skips the DB lookup entirely when req.actor is already set", async () => {
    const req = {
      cookies: {},
      actor: { id: TEST_ID, username: TEST_USERNAME, displayName: "Pre-set", role: "admin" },
    } as unknown as AuthedRequest;
    let nextArg: unknown;
    const next: NextFunction = ((err?: unknown) => {
      nextArg = err;
    }) as NextFunction;
    await requireAuth(req as unknown as Request, {} as Response, next);
    // Unchanged — proves requireAuth returned immediately via the guard
    // rather than re-querying (which would overwrite displayName/role from
    // the real TEST_ID row).
    expect(req.actor).toMatchObject({ displayName: "Pre-set", role: "admin" });
    expect(nextArg).toBeUndefined();
  });
});
