import { describe, it, expect, beforeAll, beforeEach, afterEach } from "vitest";
import type { Request, Response } from "express";
import { initCatalystApp, createCommandersRepo, createSettingsChangeLogRepo } from "@workspace/db/catalyst";
import { installCatalystFake, type CatalystTestStore } from "../test-support/catalyst-test-app";
import router from "./users";

// Same technique as every other route test in this repo — no supertest harness
// exists, so pull the real handler off the router's stack and call it directly.
// This exercises users.ts's own business logic (uniqueness, the self-guards,
// the last-admin invariant, audit logging); the RBAC gate itself (who may reach
// these handlers) is covered by routes/index.rbac.test.ts.
//
// Runs against an in-memory Data Store (test-support/catalyst-test-app.ts),
// including a recorded stand-in for Catalyst's user directory. That last part
// is what makes POST /users testable at all: the real handler invites through
// Catalyst before writing the commanders row, and a real invite provisions an
// account and emails a real person.
//
// The last-admin invariant below is the reason this file matters more than most.
// It CANNOT be checked against the deployed app: the self-guards fire first, so
// reaching it needs a second admin account, which needs a real invite. Here it
// is reachable directly.

function getHandler(method: "get" | "post" | "patch" | "delete", path: string) {
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

interface Actor { id: string; username: string; displayName: string; role: string }

async function call<T>(
  handler: (req: Request, res: Response) => unknown,
  opts: { body?: unknown; params?: Record<string, string> },
  actor: Actor,
): Promise<{ result?: T; status: number; thrown?: Error & { status?: number } }> {
  const req = {
    body: opts.body ?? {},
    params: opts.params ?? {},
    query: {},
    headers: {},
    actor,
    protocol: "https",
    get: () => "edc.test",
  } as unknown as Request;
  const captured: { body: T; status: number } = { body: undefined as unknown as T, status: 200 };
  const res = {
    status(code: number) { captured.status = code; return this; },
    json(body: T) { captured.body = body; return this; },
  } as unknown as Response;
  try {
    await handler(req, res);
    return { result: captured.body, status: captured.status };
  } catch (err) {
    return { thrown: err as Error & { status?: number }, status: (err as { status?: number }).status ?? 0 };
  }
}

let store: CatalystTestStore;

const ACTOR: Actor = {
  id: "cccccccc-0000-0000-0000-000000000001",
  username: "users-test-actor",
  displayName: "Users Test Actor",
  role: "admin",
};

interface UserRow { id: string; email: string; displayName: string; role: string; isActive: boolean; isPending?: boolean }

// Every fixture address must sit on the allowed corporate domain
// (lib/email-domain.ts) — POST /users refuses anything else outright.
async function createUser(overrides: { email?: string; role?: string } = {}): Promise<UserRow> {
  const email = overrides.email ?? `users-test-${store.count("commanders")}@zohocorp.com`;
  const { result, status, thrown } = await call<{ data: UserRow }>(
    getHandler("post", "/users"),
    { body: { email, display_name: "Test User", role: overrides.role } },
    ACTOR,
  );
  if (status !== 201 || !result) throw new Error(`createUser setup failed: ${status} ${thrown?.message ?? ""}`);
  return result.data;
}

/**
 * Put a commander row straight into the store, bypassing the invite handler.
 * Always CLAIMED (catalyst_user_id set), i.e. someone who has actually signed
 * in — which is what makes an admin count toward the last-admin invariant.
 * For an unclaimed admin invite, use createUser({ role: "admin" }).
 */
async function seedCommander(role: "admin" | "reader", isActive = true): Promise<UserRow> {
  const repo = createCommandersRepo(initCatalystApp({ headers: {} }));
  const n = store.count("commanders");
  const row = await repo.create({
    catalystUserId: `cat-${n}`,
    username: `seeded-${n}@zohocorp.com`,
    displayName: `Seeded ${n}`,
    role,
    isActive,
  });
  return { id: row.id, email: row.username, displayName: row.displayName, role: row.role, isActive: row.isActive };
}

async function changeLogFor(entityId: string) {
  const rows = await createSettingsChangeLogRepo(initCatalystApp({ headers: {} })).listAll();
  return rows.filter((r) => r.entityId === entityId);
}

beforeAll(() => {
  ({ store } = installCatalystFake());
});

beforeEach(() => {
  store.reset();
  // `id` and `username` are unique columns on `commanders` in Data Store.
  // Declaring them means the handler's duplicate backstop is exercised against
  // a real constraint rather than a pretend one.
  store.declareUnique("commanders", ["id", "username"]);
});

afterEach(() => {
  delete process.env.ALLOWED_EMAIL_DOMAINS;
});

describe("POST /users", () => {
  it("creates a user, returns no password field, and writes one change-log row", async () => {
    const { result, status } = await call<{ data: Record<string, unknown> }>(
      getHandler("post", "/users"),
      { body: { email: "Create.Test@ZohoCorp.com", display_name: "Create Test", role: "reader" } },
      ACTOR,
    );
    expect(status).toBe(201);
    expect(result?.data).not.toHaveProperty("passwordHash");
    expect(result?.data).not.toHaveProperty("password_hash");
    // Nor the Catalyst user id — isPending exposes only whether it is absent.
    expect(result?.data).not.toHaveProperty("catalystUserId");
    // Email is lower-cased on the way in, matching every lookup in the file.
    expect(result?.data.email).toBe("create.test@zohocorp.com");

    const logs = await changeLogFor(result!.data.id as string);
    expect(logs).toHaveLength(1);
    expect(logs[0]).toMatchObject({ module: "users", action: "create", actor: ACTOR.username });
  });

  it("invites through Catalyst with the display name split into first/last", async () => {
    await createUser({ email: "split.me@zohocorp.com" });
    expect(store.invites).toHaveLength(1);
    expect(store.invites[0]).toMatchObject({
      email: "split.me@zohocorp.com",
      firstName: "Test",
      lastName: "User",
    });
  });

  it("rejects a duplicate email with 409", async () => {
    const user = await createUser();
    const { thrown } = await call(
      getHandler("post", "/users"),
      { body: { email: user.email, display_name: "Dup" } },
      ACTOR,
    );
    expect(thrown).toMatchObject({ status: 409 });
  });

  it("rejects a duplicate email that differs only by case", async () => {
    const user = await createUser();
    const { thrown } = await call(
      getHandler("post", "/users"),
      { body: { email: user.email.toUpperCase(), display_name: "Dup Case" } },
      ACTOR,
    );
    expect(thrown).toMatchObject({ status: 409 });
  });

  it("defaults role to reader when not specified", async () => {
    const user = await createUser();
    expect(user).toMatchObject({ role: "reader" });
  });

  it("writes NO commanders row when the Catalyst invite fails", async () => {
    // Ordering matters: the handler invites first precisely so a rejected email
    // can't leave an orphaned app account that will never be able to sign in.
    store.failNextInvite();
    const before = store.count("commanders");
    const { thrown } = await call(
      getHandler("post", "/users"),
      { body: { email: "rejected@zohocorp.com", display_name: "Rejected" } },
      ACTOR,
    );
    expect(thrown).toMatchObject({ status: 409 });
    expect(store.count("commanders")).toBe(before);
  });

  it("marks a freshly invited user as pending until they claim the invite", async () => {
    const invited = await createUser();
    expect(invited.isPending).toBe(true);

    const { result } = await call<{ data: UserRow[] }>(getHandler("get", "/users"), {}, ACTOR);
    expect(result?.data.find((u) => u.id === invited.id)?.isPending).toBe(true);
    // A seeded row stands in for someone who has actually signed in.
    const claimed = await seedCommander("reader");
    const { result: after } = await call<{ data: UserRow[] }>(getHandler("get", "/users"), {}, ACTOR);
    expect(after?.data.find((u) => u.id === claimed.id)?.isPending).toBe(false);
  });
});

describe("POST /users — corporate email domain", () => {
  it("refuses an off-domain email with 400, touching NOTHING", async () => {
    const before = store.count("commanders");
    const { thrown } = await call(
      getHandler("post", "/users"),
      { body: { email: "someone@gmail.com", display_name: "Outside Person" } },
      ACTOR,
    );
    expect(thrown).toMatchObject({ status: 400 });
    expect(thrown?.message).toContain("@zohocorp.com");
    // The check must run BEFORE the Catalyst invite, or a typo'd outsider is
    // left registered on the Catalyst project with no commanders row.
    expect(store.invites).toHaveLength(0);
    expect(store.count("commanders")).toBe(before);
  });

  it.each(["a@notzohocorp.com", "a@zohocorp.com.attacker.example", "a@in.zohocorp.com"])(
    "refuses the look-alike domain in %o",
    async (email) => {
      const { thrown } = await call(
        getHandler("post", "/users"),
        { body: { email, display_name: "Look Alike" } },
        ACTOR,
      );
      expect(thrown).toMatchObject({ status: 400 });
    },
  );

  it("refuses a value that is not an email address at all", async () => {
    const { thrown } = await call(
      getHandler("post", "/users"),
      { body: { email: "notanemail", display_name: "No At Sign" } },
      ACTOR,
    );
    expect(thrown).toMatchObject({ status: 400 });
  });

  it("honours ALLOWED_EMAIL_DOMAINS when it is configured", async () => {
    process.env.ALLOWED_EMAIL_DOMAINS = "zohocorp.com,partner.example";
    const { status } = await call(
      getHandler("post", "/users"),
      { body: { email: "guest@partner.example", display_name: "Guest User" } },
      ACTOR,
    );
    expect(status).toBe(201);

    const { thrown } = await call(
      getHandler("post", "/users"),
      { body: { email: "someone@gmail.com", display_name: "Still Outside" } },
      ACTOR,
    );
    expect(thrown).toMatchObject({ status: 400 });
  });
});

describe("PATCH /users/:id — self and last-admin guards", () => {
  it("refuses to let an admin demote themselves", async () => {
    const self = await seedCommander("admin");
    const { thrown } = await call(
      getHandler("patch", "/users/:id"),
      { params: { id: self.id }, body: { role: "reader" } },
      { ...self, username: self.email },
    );
    expect(thrown).toMatchObject({ status: 409 });
  });

  it("refuses to let an admin deactivate themselves", async () => {
    const self = await seedCommander("admin");
    const { thrown } = await call(
      getHandler("patch", "/users/:id"),
      { params: { id: self.id }, body: { is_active: false } },
      { ...self, username: self.email },
    );
    expect(thrown).toMatchObject({ status: 409 });
  });

  it("allows an admin to change their own display name", async () => {
    const self = await seedCommander("admin");
    const { status } = await call(
      getHandler("patch", "/users/:id"),
      { params: { id: self.id }, body: { display_name: "Renamed Self" } },
      { ...self, username: self.email },
    );
    expect(status).toBe(200);
  });

  // The invariant that cannot be reached against the deployed app.
  it("refuses to demote the last remaining active admin", async () => {
    const lastAdmin = await seedCommander("admin");
    const otherAdminActor: Actor = { ...(await seedCommander("admin", false)), username: "other@example.com" };

    const { thrown } = await call(
      getHandler("patch", "/users/:id"),
      { params: { id: lastAdmin.id }, body: { role: "reader" } },
      otherAdminActor,
    );
    expect(thrown).toMatchObject({ status: 409 });

    // And the row is genuinely unchanged, not merely reported as rejected.
    const repo = createCommandersRepo(initCatalystApp({ headers: {} }));
    expect(await repo.getById(lastAdmin.id)).toMatchObject({ role: "admin", isActive: true });
  });

  it("refuses to deactivate the last remaining active admin", async () => {
    const lastAdmin = await seedCommander("admin");
    const otherAdminActor: Actor = { ...(await seedCommander("admin", false)), username: "other@example.com" };

    const { thrown } = await call(
      getHandler("patch", "/users/:id"),
      { params: { id: lastAdmin.id }, body: { is_active: false } },
      otherAdminActor,
    );
    expect(thrown).toMatchObject({ status: 409 });
    const repo = createCommandersRepo(initCatalystApp({ headers: {} }));
    expect(await repo.getById(lastAdmin.id)).toMatchObject({ role: "admin", isActive: true });
  });

  it("ALLOWS demoting an admin while another active admin remains", async () => {
    const target = await seedCommander("admin");
    await seedCommander("admin"); // a second active admin
    const { status } = await call(
      getHandler("patch", "/users/:id"),
      { params: { id: target.id }, body: { role: "reader" } },
      ACTOR,
    );
    expect(status).toBe(200);
    const repo = createCommandersRepo(initCatalystApp({ headers: {} }));
    expect(await repo.getById(target.id)).toMatchObject({ role: "reader" });
  });

  // An admin INVITE is not an admin. Nobody has signed in as them, so counting
  // the invite would let the only real admin demote themselves and leave the
  // app with nobody able to administer it.
  it("does NOT let an unclaimed admin invite satisfy the last-admin invariant", async () => {
    const lastAdmin = await seedCommander("admin");
    const pendingAdmin = await createUser({ role: "admin" });
    expect(pendingAdmin.isPending).toBe(true);

    const otherAdminActor: Actor = { ...(await seedCommander("admin", false)), username: "other@zohocorp.com" };
    const { thrown } = await call(
      getHandler("patch", "/users/:id"),
      { params: { id: lastAdmin.id }, body: { role: "reader" } },
      otherAdminActor,
    );
    expect(thrown).toMatchObject({ status: 409 });

    const repo = createCommandersRepo(initCatalystApp({ headers: {} }));
    expect(await repo.getById(lastAdmin.id)).toMatchObject({ role: "admin", isActive: true });
  });

  it("ALLOWS demoting an unclaimed admin invite even when it is the only other admin", async () => {
    const pendingAdmin = await createUser({ role: "admin" });
    await seedCommander("admin"); // the one real admin

    const { status } = await call(
      getHandler("patch", "/users/:id"),
      { params: { id: pendingAdmin.id }, body: { role: "reader" } },
      ACTOR,
    );
    expect(status).toBe(200);
  });

  it("returns 404 for a nonexistent user", async () => {
    const { thrown } = await call(
      getHandler("patch", "/users/:id"),
      { params: { id: "00000000-0000-0000-0000-000000000000" }, body: { display_name: "x" } },
      ACTOR,
    );
    expect(thrown).toMatchObject({ status: 404 });
  });

  it("rejects an empty update body", async () => {
    const user = await seedCommander("reader");
    const { thrown } = await call(getHandler("patch", "/users/:id"), { params: { id: user.id }, body: {} }, ACTOR);
    expect(thrown).toMatchObject({ status: 400 });
  });
});

describe("DELETE /users/:id", () => {
  it("refuses to let an admin delete themselves", async () => {
    const self = await seedCommander("admin");
    const { thrown } = await call(
      getHandler("delete", "/users/:id"),
      { params: { id: self.id } },
      { ...self, username: self.email },
    );
    expect(thrown).toMatchObject({ status: 409 });
  });

  it("refuses to delete the last remaining active admin", async () => {
    const lastAdmin = await seedCommander("admin");
    const otherAdminActor: Actor = { ...(await seedCommander("admin", false)), username: "other@example.com" };
    const { thrown } = await call(
      getHandler("delete", "/users/:id"),
      { params: { id: lastAdmin.id } },
      otherAdminActor,
    );
    expect(thrown).toMatchObject({ status: 409 });
    const repo = createCommandersRepo(initCatalystApp({ headers: {} }));
    expect(await repo.getById(lastAdmin.id)).not.toBeNull();
  });

  it("does NOT let an unclaimed admin invite satisfy the last-admin invariant", async () => {
    const lastAdmin = await seedCommander("admin");
    await createUser({ role: "admin" }); // an invite, not an admin
    const otherAdminActor: Actor = { ...(await seedCommander("admin", false)), username: "other@zohocorp.com" };

    const { thrown } = await call(
      getHandler("delete", "/users/:id"),
      { params: { id: lastAdmin.id } },
      otherAdminActor,
    );
    expect(thrown).toMatchObject({ status: 409 });
    const repo = createCommandersRepo(initCatalystApp({ headers: {} }));
    expect(await repo.getById(lastAdmin.id)).not.toBeNull();
  });

  it("ALLOWS cancelling an unclaimed admin invite that is the only other admin", async () => {
    const pendingAdmin = await createUser({ role: "admin" });
    await seedCommander("admin"); // the one real admin

    const { status } = await call(getHandler("delete", "/users/:id"), { params: { id: pendingAdmin.id } }, ACTOR);
    expect(status).toBe(200);
    const repo = createCommandersRepo(initCatalystApp({ headers: {} }));
    expect(await repo.getById(pendingAdmin.id)).toBeNull();
  });

  it("deletes a reader, removes the Catalyst directory user, and writes a delete audit row", async () => {
    const user = await createUser({ role: "reader" });
    const { status } = await call(getHandler("delete", "/users/:id"), { params: { id: user.id } }, ACTOR);
    expect(status).toBe(200);

    const repo = createCommandersRepo(initCatalystApp({ headers: {} }));
    expect(await repo.getById(user.id)).toBeNull();

    const logs = await changeLogFor(user.id);
    expect(logs.some((l) => l.action === "delete")).toBe(true);
  });
});
