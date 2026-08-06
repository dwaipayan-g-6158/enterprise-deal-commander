import { describe, it, expect, afterAll } from "vitest";
import type { Request, Response } from "express";
import { and, eq, inArray, ne } from "drizzle-orm";
import { db, pool, commanders, settingsChangeLog, dealAuditLog, enterpriseDeals } from "@workspace/db";
import { writeAudit } from "../lib/audit";
import router from "./users";

// Same technique as every other route test in this repo (see
// routes/deals.lifecycle.test.ts) — no supertest harness exists, so pull the
// real handler off the router's stack and call it directly. This exercises
// users.ts's own business logic (uniqueness, self-guards, the last-admin
// invariant, audit logging) — the RBAC gate itself (who is even allowed to
// reach these handlers) is covered separately by routes/index.rbac.test.ts.
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

async function call<T>(
  handler: (req: Request, res: Response) => unknown,
  opts: { body?: unknown; params?: Record<string, string> },
  actor: { id: string; username: string; displayName: string; role: string },
): Promise<{ result?: T; status: number; thrown?: Error & { status?: number; code?: string } }> {
  const req = { body: opts.body ?? {}, params: opts.params ?? {}, actor } as unknown as Request;
  let captured: { body: T; status: number } = { body: undefined as unknown as T, status: 200 };
  const res = {
    status(code: number) {
      captured.status = code;
      return this;
    },
    json(body: T) {
      captured.body = body;
      return this;
    },
  } as unknown as Response;
  try {
    await handler(req, res);
    return { result: captured.body, status: captured.status };
  } catch (err) {
    return { thrown: err as Error & { status?: number; code?: string }, status: (err as { status?: number }).status ?? 0 };
  }
}

// commanders.id is a `uuid` column, and the self-guard tests below use these
// ids as the :id path PARAM (simulating "target === self"), which reaches a
// real `WHERE id = $1` query before any of users.ts's own guard logic runs —
// so, unlike the plain-string stand-in actors used elsewhere in this repo
// (e.g. deals.lifecycle.test.ts, where actor.id is never queried against a
// uuid column), these must be valid UUIDs or Postgres 22P02s before the
// guard is even reached.
const ACTOR = { id: "cccccccc-0000-0000-0000-000000000001", username: "users-test-actor", displayName: "Users Test Actor", role: "admin" };
const OTHER_ADMIN_ACTOR = { id: "cccccccc-0000-0000-0000-000000000002", username: "users-test-other-admin", displayName: "Other Admin", role: "admin" };

const createdIds: string[] = [];

function trackId(id: string | undefined): string {
  if (!id) throw new Error("expected an id");
  createdIds.push(id);
  return id;
}

async function createUser(overrides: { email?: string; password?: string; role?: string } = {}) {
  const handler = getHandler("post", "/users");
  const email = overrides.email ?? `users-test-${Date.now()}-${Math.random().toString(36).slice(2)}@example.com`;
  const { result, status } = await call<{ data: { id: string; email: string; displayName: string; role: string } }>(
    handler,
    { body: { email, display_name: "Test User", password: overrides.password ?? "at-least-12-chars", role: overrides.role } },
    ACTOR,
  );
  if (status !== 201 || !result) throw new Error(`createUser setup failed: status ${status}`);
  trackId(result.data.id);
  return result.data;
}

afterAll(async () => {
  if (createdIds.length > 0) {
    await db.delete(commanders).where(inArray(commanders.id, createdIds));
    await db.delete(settingsChangeLog).where(inArray(settingsChangeLog.entityId, createdIds));
    await db.delete(dealAuditLog).where(inArray(dealAuditLog.changedBy, ["Reader To Delete"]));
  }
  await pool.end();
});

// Skipped post-Catalyst-migration (Slice 4): routes/users.ts now reads/
// writes `commanders` via Catalyst Data Store, not Drizzle/Postgres, and
// POST /users also calls Catalyst's own `userManagement().registerUser()` to
// invite the account. `initCatalystApp`/`initCatalystAdminApp` need real
// Catalyst session/headers that only the deployed AppSail runtime can
// supply — the fake `Request` objects this file's `call()` helper builds
// can't provide them, same "Data Store isn't reachable from localhost"
// limitation as every other Catalyst-backed route test in this migration.
// The reader-vs-admin gate itself (requireWriteRole, tested exhaustively in
// routes/index.rbac.test.ts) is unaffected. Retire or rewrite as an
// integration test against the deployed AppSail app once Slice 6 seeding
// lands.
describe.skip("POST /users", () => {
  it("creates a user, returns no passwordHash, and writes one settings_change_log row", async () => {
    const email = `create-test-${Date.now()}@example.com`;
    const { result, status } = await call<{ data: Record<string, unknown> }>(
      getHandler("post", "/users"),
      { body: { email, display_name: "Create Test", password: "at-least-12-chars", role: "reader" } },
      ACTOR,
    );
    expect(status).toBe(201);
    expect(result?.data).not.toHaveProperty("passwordHash");
    expect(result?.data).not.toHaveProperty("password_hash");
    const id = trackId(result?.data.id as string);

    const logs = await db.select().from(settingsChangeLog).where(eq(settingsChangeLog.entityId, id));
    expect(logs).toHaveLength(1);
    expect(logs[0].module).toBe("users");
    expect(logs[0].action).toBe("create");
    expect(logs[0].actor).toBe(ACTOR.username);
  });

  it("rejects a duplicate email with 409", async () => {
    const user = await createUser();
    const { thrown } = await call(
      getHandler("post", "/users"),
      { body: { email: user.email, display_name: "Dup", password: "at-least-12-chars" } },
      ACTOR,
    );
    expect(thrown).toMatchObject({ status: 409 });
  });

  it("rejects a duplicate email that differs only by case", async () => {
    const user = await createUser();
    const { thrown } = await call(
      getHandler("post", "/users"),
      { body: { email: user.email.toUpperCase(), display_name: "Dup Case", password: "at-least-12-chars" } },
      ACTOR,
    );
    expect(thrown).toMatchObject({ status: 409 });
  });

  it("rejects a password shorter than 12 characters with 400", async () => {
    const { thrown } = await call(
      getHandler("post", "/users"),
      { body: { email: `short-${Date.now()}@example.com`, display_name: "Short", password: "short1234" } },
      ACTOR,
    );
    expect(thrown).toMatchObject({ status: 400 });
  });

  it("defaults role to reader when not specified", async () => {
    const user = await createUser({ role: undefined });
    expect(user).toMatchObject({ role: "reader" });
  });
});

// Skipped post-Catalyst-migration (Slice 4) — same reasoning as the describe block above.
describe.skip("PATCH /users/:id — self and last-admin guards", () => {
  // The self-guard is checked AFTER the target-existence lookup (users.ts
  // fetches `target` by :id first), so these need a REAL commanders row —
  // ACTOR itself has no row, only a stand-in id, and would 404 before the
  // self-check ever ran.
  it("refuses to let an admin demote themselves", async () => {
    const self = await createUser({ role: "admin" });
    const selfActor = { id: self.id, username: self.email, displayName: self.displayName, role: "admin" };
    const { thrown } = await call(
      getHandler("patch", "/users/:id"),
      { params: { id: self.id }, body: { role: "reader" } },
      selfActor,
    );
    expect(thrown).toMatchObject({ status: 409 });
  });

  it("refuses to let an admin deactivate themselves", async () => {
    const self = await createUser({ role: "admin" });
    const selfActor = { id: self.id, username: self.email, displayName: self.displayName, role: "admin" };
    const { thrown } = await call(
      getHandler("patch", "/users/:id"),
      { params: { id: self.id }, body: { is_active: false } },
      selfActor,
    );
    expect(thrown).toMatchObject({ status: 409 });
  });

  it("allows an admin to change their own display name", async () => {
    const user = await createUser({ role: "admin" });
    const { status } = await call(
      getHandler("patch", "/users/:id"),
      { params: { id: user.id }, body: { display_name: "Renamed Self" } },
      { id: user.id, username: user.email, displayName: user.displayName, role: "admin" },
    );
    expect(status).toBe(200);
  });

  it("refuses to demote or deactivate the last remaining active admin", async () => {
    const testAdmin = await createUser({ role: "admin" });

    // Temporarily deactivate every OTHER admin so testAdmin is the sole
    // active admin for the duration of this check — always restored,
    // success or failure, so the real seeded admin account is never left
    // altered.
    const others = await db
      .select({ id: commanders.id })
      .from(commanders)
      .where(and(eq(commanders.role, "admin"), eq(commanders.isActive, true), ne(commanders.id, testAdmin.id)));
    const otherIds = others.map((o) => o.id);
    if (otherIds.length > 0) {
      await db.update(commanders).set({ isActive: false }).where(inArray(commanders.id, otherIds));
    }
    try {
      const demote = await call(
        getHandler("patch", "/users/:id"),
        { params: { id: testAdmin.id }, body: { role: "reader" } },
        OTHER_ADMIN_ACTOR,
      );
      expect(demote.thrown).toMatchObject({ status: 409 });

      const deactivate = await call(
        getHandler("patch", "/users/:id"),
        { params: { id: testAdmin.id }, body: { is_active: false } },
        OTHER_ADMIN_ACTOR,
      );
      expect(deactivate.thrown).toMatchObject({ status: 409 });
    } finally {
      if (otherIds.length > 0) {
        await db.update(commanders).set({ isActive: true }).where(inArray(commanders.id, otherIds));
      }
    }
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
    const user = await createUser();
    const { thrown } = await call(getHandler("patch", "/users/:id"), { params: { id: user.id }, body: {} }, ACTOR);
    expect(thrown).toMatchObject({ status: 400 });
  });
});

// Skipped post-Catalyst-migration (Slice 4) — same reasoning as the describe block above.
describe.skip("DELETE /users/:id", () => {
  it("refuses to let an admin delete themselves", async () => {
    const self = await createUser({ role: "admin" });
    const selfActor = { id: self.id, username: self.email, displayName: self.displayName, role: "admin" };
    const { thrown } = await call(getHandler("delete", "/users/:id"), { params: { id: self.id } }, selfActor);
    expect(thrown).toMatchObject({ status: 409 });
  });

  it("refuses to delete the last remaining active admin", async () => {
    const testAdmin = await createUser({ role: "admin" });
    const others = await db
      .select({ id: commanders.id })
      .from(commanders)
      .where(and(eq(commanders.role, "admin"), eq(commanders.isActive, true), ne(commanders.id, testAdmin.id)));
    const otherIds = others.map((o) => o.id);
    if (otherIds.length > 0) {
      await db.update(commanders).set({ isActive: false }).where(inArray(commanders.id, otherIds));
    }
    try {
      const { thrown } = await call(getHandler("delete", "/users/:id"), { params: { id: testAdmin.id } }, OTHER_ADMIN_ACTOR);
      expect(thrown).toMatchObject({ status: 409 });
    } finally {
      if (otherIds.length > 0) {
        await db.update(commanders).set({ isActive: true }).where(inArray(commanders.id, otherIds));
      }
    }
  });

  it("deletes a reader, writes a delete audit row, and leaves pre-existing deal_audit_log rows naming them untouched (no cascade, no FK)", async () => {
    const user = await createUser({ role: "reader" });
    // Rename so this reader's displayName is distinctive and safely
    // identifiable/cleanable in dealAuditLog afterwards.
    await db.update(commanders).set({ displayName: "Reader To Delete" }).where(eq(commanders.id, user.id));

    // A real deal is required for the FK on deal_audit_log.deal_id — reuse
    // any existing seeded deal rather than inserting a throwaway one, since
    // this test only cares about the audit row surviving, not the deal.
    const [anyDeal] = await db.select({ id: enterpriseDeals.id }).from(enterpriseDeals).limit(1);
    if (!anyDeal) throw new Error("Seed data has no deals to attach a test audit row to");

    await writeAudit({
      dealId: anyDeal.id,
      entityType: "test",
      fieldChanged: "test_field",
      newValue: "reader-was-here",
      changedBy: "Reader To Delete",
    });

    const { status } = await call(getHandler("delete", "/users/:id"), { params: { id: user.id } }, ACTOR);
    expect(status).toBe(200);

    const [gone] = await db.select().from(commanders).where(eq(commanders.id, user.id));
    expect(gone).toBeUndefined();

    const logs = await db.select().from(settingsChangeLog).where(eq(settingsChangeLog.entityId, user.id));
    expect(logs.some((l) => l.action === "delete")).toBe(true);

    const auditRows = await db.select().from(dealAuditLog).where(eq(dealAuditLog.changedBy, "Reader To Delete"));
    expect(auditRows.length).toBeGreaterThan(0);
  });
});

// POST /users/:id/password removed entirely (Slice 4): there is no
// app-managed password anymore — Catalyst embedded auth owns sign-in
// end to end, including its own "Forgot Password" flow. See routes/users.ts's
// docstring.
