import { describe, it, expect } from "vitest";
import type { Request, Response, NextFunction } from "express";
import { requireAuth, type AuthedRequest } from "./auth";

/**
 * This file used to be a full suite against the JWT/bcrypt/Postgres-backed
 * requireAuth (mint a cookie via issueSession, verify role/deactivation/
 * deletion/tampered-token/non-UUID-sub behavior against a real commanders
 * row). That entire mechanism is gone — Slice 4 replaced it wholesale with
 * Zoho Catalyst embedded authentication (see requireAuth/resolveCommander in
 * ./auth.ts), and none of those specific behaviors (JWT verification, a
 * signed cookie, a Postgres row keyed by a UUID sub) exist anymore to test.
 *
 * requireAuth's new session-resolution path (getCurrentCatalystUser +
 * resolveCommander) genuinely cannot be exercised locally — same "Data Store
 * isn't reachable from localhost" limitation as every other Catalyst-backed
 * code path in this migration, compounded by there being no way to fake a
 * real Catalyst session at all outside the deployed AppSail runtime. That
 * needs an integration test against the deployed app instead (Slice 6
 * territory), not a unit test here.
 *
 * The one behavior below survives untouched: the idempotency guard is pure
 * and DB-free (it returns before ever touching Catalyst), so it's still
 * directly testable exactly as before.
 */
describe("requireAuth", () => {
  it("the idempotency guard skips Catalyst resolution entirely when req.actor is already set", async () => {
    const req = {
      actor: { id: "pre-set-id", username: "pre-set@example.com", displayName: "Pre-set", role: "admin" },
    } as unknown as AuthedRequest;
    let nextArg: unknown;
    const next: NextFunction = ((err?: unknown) => {
      nextArg = err;
    }) as NextFunction;
    await requireAuth(req as unknown as Request, {} as Response, next);
    // Unchanged — proves requireAuth returned immediately via the guard
    // rather than attempting to resolve a Catalyst session (which would
    // throw and 401 here, since no real session exists in this test).
    expect(req.actor).toMatchObject({ displayName: "Pre-set", role: "admin" });
    expect(nextArg).toBeUndefined();
  });
});
