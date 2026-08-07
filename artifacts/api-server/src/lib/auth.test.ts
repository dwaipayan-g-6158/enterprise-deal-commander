import { describe, it, expect, beforeAll, beforeEach, afterEach } from "vitest";
import type { Request, Response, NextFunction } from "express";
import { initCatalystApp, createCommandersRepo } from "@workspace/db/catalyst";
import { installCatalystFake, type CatalystTestStore } from "../test-support/catalyst-test-app";
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
 * The session-resolution path was untestable for a while after that, for want
 * of any way to fake a Catalyst session. It is testable now: the Data Store
 * fake models `userManagement().getCurrentUser()` too, so `store.signInAs()`
 * stands an identity up in front of requireAuth and resolveCommander decides
 * what — if anything — that identity is entitled to. That decision is worth
 * pinning down here rather than in a deployed integration test, because it is
 * the app's entire authorization boundary: who gets an account at all.
 */

let store: CatalystTestStore;

const req = () => ({ headers: {} }) as unknown as Request;

/** Run requireAuth and report what it did, without an Express app in the way. */
async function auth(): Promise<{ actor?: AuthedRequest["actor"]; status?: number }> {
  const r = req() as AuthedRequest;
  let err: unknown;
  const next: NextFunction = ((e?: unknown) => {
    err = e;
  }) as NextFunction;
  await requireAuth(r as unknown as Request, {} as Response, next);
  if (err) return { status: (err as { status?: number }).status };
  return { actor: r.actor };
}

async function commanders() {
  return createCommandersRepo(initCatalystApp({ headers: {} })).listAll();
}

beforeAll(() => {
  ({ store } = installCatalystFake());
});

beforeEach(() => {
  store.reset();
  store.declareUnique("commanders", ["id", "username"]);
});

afterEach(() => {
  delete process.env.ALLOWED_EMAIL_DOMAINS;
  delete process.env.SUPER_ADMIN_EMAIL;
});

describe("requireAuth", () => {
  it("the idempotency guard skips Catalyst resolution entirely when req.actor is already set", async () => {
    const r = {
      actor: { id: "pre-set-id", username: "pre-set@example.com", displayName: "Pre-set", role: "admin" },
    } as unknown as AuthedRequest;
    let nextArg: unknown;
    const next: NextFunction = ((e?: unknown) => {
      nextArg = e;
    }) as NextFunction;
    await requireAuth(r as unknown as Request, {} as Response, next);
    // Unchanged — proves requireAuth returned immediately via the guard
    // rather than attempting to resolve a Catalyst session (which would
    // throw and 401 here, since no session is established in this test).
    expect(r.actor).toMatchObject({ displayName: "Pre-set", role: "admin" });
    expect(nextArg).toBeUndefined();
  });

  it("401s when there is no Catalyst session at all", async () => {
    expect(await auth()).toMatchObject({ status: 401 });
  });
});

describe("resolveCommander — provisioning", () => {
  it("auto-provisions the very first commander as an admin", async () => {
    store.signInAs({ email: "first@zohocorp.com", firstName: "First", lastName: "Admin" });
    expect(await auth()).toMatchObject({
      actor: { username: "first@zohocorp.com", displayName: "First Admin", role: "admin" },
    });
    expect(await commanders()).toHaveLength(1);
  });

  it("auto-provisions a later never-seen identity as a reader", async () => {
    store.signInAs({ email: "first@zohocorp.com" });
    await auth();
    store.signInAs({ email: "second@zohocorp.com" });
    expect(await auth()).toMatchObject({ actor: { username: "second@zohocorp.com", role: "reader" } });
  });

  it("claims a pending invite and adopts the role the inviting admin chose", async () => {
    const repo = createCommandersRepo(initCatalystApp({ headers: {} }));
    const invited = await repo.create({
      catalystUserId: null,
      username: "invited@zohocorp.com",
      displayName: "Invited Person",
      role: "admin",
      isActive: true,
    });

    store.signInAs({ userId: "cat-999", email: "Invited@ZohoCorp.com" });
    expect(await auth()).toMatchObject({ actor: { id: invited.id, role: "admin" } });

    // Claimed in place, not duplicated.
    const all = await commanders();
    expect(all).toHaveLength(1);
    expect(all[0].catalystUserId).toBe("cat-999");
  });

  it("401s a deactivated account without reactivating anything", async () => {
    store.signInAs({ userId: "cat-1", email: "gone@zohocorp.com" });
    await auth();
    const repo = createCommandersRepo(initCatalystApp({ headers: {} }));
    const [row] = await commanders();
    await repo.update(row.id, { isActive: false });

    expect(await auth()).toMatchObject({ status: 401 });
    expect((await commanders())[0].isActive).toBe(false);
  });
});

describe("resolveCommander — corporate email domain", () => {
  // The other half of the boundary. Without this, restricting POST /users
  // would be cosmetic: anyone able to authenticate against the Catalyst
  // project would still land a reader row via auto-provisioning.
  it("refuses to auto-provision an off-domain identity, creating no row", async () => {
    store.signInAs({ email: "outsider@gmail.com", firstName: "Out", lastName: "Sider" });
    expect(await auth()).toMatchObject({ status: 401 });
    expect(await commanders()).toHaveLength(0);
  });

  it("refuses even when it would otherwise be the first-admin bootstrap", async () => {
    process.env.SUPER_ADMIN_EMAIL = "outsider@gmail.com";
    store.signInAs({ email: "outsider@gmail.com", isPlatformAdmin: true });
    expect(await auth()).toMatchObject({ status: 401 });
    expect(await commanders()).toHaveLength(0);
  });

  it("refuses to claim a stale off-domain pending invite, leaving it unclaimed", async () => {
    const repo = createCommandersRepo(initCatalystApp({ headers: {} }));
    await repo.create({
      catalystUserId: null,
      username: "outsider@gmail.com",
      displayName: "Outsider",
      role: "admin",
      isActive: true,
    });

    store.signInAs({ email: "outsider@gmail.com" });
    expect(await auth()).toMatchObject({ status: 401 });
    expect((await commanders())[0].catalystUserId).toBeNull();
  });

  // The deliberate carve-out: the domain rule gates row CREATION, not every
  // request. Otherwise tightening the allowlist would instantly lock out
  // everyone it no longer covers — quite possibly including the last admin,
  // with nobody left able to undo it.
  it("still admits an off-domain user who ALREADY has a claimed row", async () => {
    process.env.ALLOWED_EMAIL_DOMAINS = "gmail.com";
    store.signInAs({ userId: "cat-legacy", email: "legacy@gmail.com" });
    expect(await auth()).toMatchObject({ actor: { username: "legacy@gmail.com" } });

    // Now tighten the allowlist so their address no longer qualifies.
    process.env.ALLOWED_EMAIL_DOMAINS = "zohocorp.com";
    expect(await auth()).toMatchObject({ actor: { username: "legacy@gmail.com" } });
  });

  it("honours ALLOWED_EMAIL_DOMAINS when it is configured", async () => {
    process.env.ALLOWED_EMAIL_DOMAINS = "partner.example";
    store.signInAs({ email: "guest@partner.example" });
    expect(await auth()).toMatchObject({ actor: { username: "guest@partner.example" } });

    store.signInAs({ email: "someone@zohocorp.com" });
    expect(await auth()).toMatchObject({ status: 401 });
  });
});
