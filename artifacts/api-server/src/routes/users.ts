import { Router, type IRouter, type Request, type Response } from "express";
import bcrypt from "bcryptjs";
import { and, eq, ne, sql } from "drizzle-orm";
import { db, commanders } from "@workspace/db";
import {
  ListUsersResponse,
  CreateUserBody,
  UpdateUserParams,
  UpdateUserBody,
  DeleteUserParams,
  ResetUserPasswordParams,
  ResetUserPasswordBody,
} from "@workspace/api-zod";
import { getActor, type Role } from "../lib/auth";
import { badRequest, conflict, notFound } from "../lib/http";
import { logSettingsChange } from "../lib/settings-audit";

/**
 * User account management — the actual "delegation" capability of RBAC.
 * Without this, roles exist in the schema but nobody can hand one out.
 *
 * No requireAdmin decorator on any route here, and none is needed: the
 * app-wide gate (requireAuth + requireWriteRole in routes/index.ts) already
 * lets GET through to any authenticated caller and refuses every other
 * method to a reader. Do not add a redundant per-route check — it would
 * only create a second place to keep in sync with the real one.
 */

const router: IRouter = Router();

type CommanderRow = typeof commanders.$inferSelect;
// Derived rather than imported from a specific drizzle-orm transaction type
// name, so this keeps compiling if the pg-core transaction type is ever
// renamed upstream.
type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

function toUserRow(row: CommanderRow) {
  return {
    id: row.id,
    email: row.username,
    displayName: row.displayName,
    role: row.role as Role,
    isActive: row.isActive,
    createdAt: row.createdAt.toISOString(),
    lastDashboardVisitAt: row.lastDashboardVisitAt
      ? row.lastDashboardVisitAt.toISOString()
      : null,
  };
}

router.get("/users", async (_req: Request, res: Response) => {
  const rows = await db.select().from(commanders).orderBy(commanders.createdAt);
  res.json(ListUsersResponse.parse({ data: rows.map(toUserRow) }));
});

router.post("/users", async (req: Request, res: Response) => {
  const parsed = CreateUserBody.safeParse(req.body);
  if (!parsed.success) {
    throw badRequest("Invalid user payload", parsed.error.issues);
  }
  const actor = getActor(req);
  // Lowercase on the way in pairs with the lower() comparison at login
  // (routes/auth.ts) — otherwise a user created as "Alice@corp.com" could
  // only ever sign in by typing that exact casing back.
  const email = parsed.data.email.trim().toLowerCase();
  const role: Role = parsed.data.role ?? "reader";

  const existing = await db
    .select({ id: commanders.id })
    .from(commanders)
    .where(sql`lower(${commanders.username}) = lower(${email})`)
    .limit(1);
  if (existing.length > 0) {
    throw conflict("A user with this email already exists");
  }

  const passwordHash = await bcrypt.hash(parsed.data.password, 10);
  try {
    const [created] = await db
      .insert(commanders)
      .values({
        username: email,
        displayName: parsed.data.display_name,
        passwordHash,
        role,
        isActive: true,
      })
      .returning();

    await logSettingsChange({
      module: "users",
      settingKey: created.username,
      entityId: created.id,
      action: "create",
      oldValue: null,
      newValue: { username: created.username, displayName: created.displayName, role, isActive: true },
      actor: actor.username,
    });

    res.status(201).json({ data: toUserRow(created) });
  } catch (err) {
    // Race-safety backstop for the pre-check above — two concurrent creates
    // of the same email can both pass the SELECT before either INSERTs.
    if (err instanceof Error && "code" in err && (err as { code?: string }).code === "23505") {
      throw conflict("A user with this email already exists");
    }
    throw err;
  }
});

/**
 * The last-active-admin invariant. Must run inside the SAME transaction as
 * the write, after locking every admin row, or two concurrent demotes can
 * each see the other still admin and the app locks itself out permanently
 * with no recovery path except psql (re-running
 * lib/db/sql/2026-07-28-commander-rbac.sql, which re-promotes whichever row
 * still exists once there are zero admins).
 */
async function assertAnotherActiveAdminRemains(
  tx: Tx,
  targetId: string,
): Promise<void> {
  // Locking (`.for("update")`) serializes concurrent admin/is_active writers
  // against each other — the SELECT below is otherwise just a snapshot read
  // that two simultaneous demotions could both pass.
  await tx
    .select({ id: commanders.id })
    .from(commanders)
    .where(eq(commanders.role, "admin"))
    .for("update");

  const others = await tx
    .select({ id: commanders.id })
    .from(commanders)
    .where(
      and(
        eq(commanders.role, "admin"),
        eq(commanders.isActive, true),
        ne(commanders.id, targetId),
      ),
    );
  if (others.length === 0) {
    throw conflict("At least one active admin must remain — promote another user first");
  }
}

router.patch("/users/:id", async (req: Request, res: Response) => {
  const { id } = UpdateUserParams.parse(req.params);
  const parsed = UpdateUserBody.safeParse(req.body);
  if (!parsed.success) {
    throw badRequest("Invalid user payload", parsed.error.issues);
  }
  const body = parsed.data;
  if (body.display_name === undefined && body.role === undefined && body.is_active === undefined) {
    throw badRequest("Provide at least one field to update");
  }
  const actor = getActor(req);

  const result = await db.transaction(async (tx) => {
    const [target] = await tx
      .select()
      .from(commanders)
      .where(eq(commanders.id, id))
      .for("update");
    if (!target) throw notFound("User not found");

    // Self-guards, checked BEFORE the last-admin check so the message is
    // specific to what the caller actually tried to do. Changing your own
    // display name is fine and handled by the generic update path below.
    if (target.id === actor.id) {
      if (body.role !== undefined && body.role !== "admin") {
        throw conflict("You cannot demote yourself");
      }
      if (body.is_active === false) {
        throw conflict("You cannot deactivate your own account");
      }
    }

    const willDemote = body.role === "reader" && target.role === "admin";
    const willDeactivate = body.is_active === false && target.isActive;
    if (willDemote || willDeactivate) {
      await assertAnotherActiveAdminRemains(tx, target.id);
    }

    const [updated] = await tx
      .update(commanders)
      .set({
        ...(body.display_name !== undefined ? { displayName: body.display_name } : {}),
        ...(body.role !== undefined ? { role: body.role } : {}),
        ...(body.is_active !== undefined ? { isActive: body.is_active } : {}),
      })
      .where(eq(commanders.id, id))
      .returning();

    return { before: target, after: updated };
  });

  // Logged AFTER the transaction commits, not inside it — logSettingsChange
  // writes through the module-level `db` on its own connection, so calling
  // it inside the transaction callback would leave a permanent audit row
  // even if a later statement in the same callback rolled everything else
  // back.
  const action = body.is_active === false ? "deactivate" : body.is_active === true ? "reactivate" : "update";
  await logSettingsChange({
    module: "users",
    settingKey: result.after.username,
    entityId: result.after.id,
    action,
    oldValue: {
      displayName: result.before.displayName,
      role: result.before.role,
      isActive: result.before.isActive,
    },
    newValue: {
      displayName: result.after.displayName,
      role: result.after.role,
      isActive: result.after.isActive,
    },
    actor: actor.username,
  });

  res.json({ data: toUserRow(result.after) });
});

router.delete("/users/:id", async (req: Request, res: Response) => {
  const { id } = DeleteUserParams.parse(req.params);
  const actor = getActor(req);

  const deleted = await db.transaction(async (tx) => {
    const [target] = await tx
      .select()
      .from(commanders)
      .where(eq(commanders.id, id))
      .for("update");
    if (!target) throw notFound("User not found");

    if (target.id === actor.id) {
      throw conflict("You cannot delete your own account");
    }
    if (target.role === "admin" && target.isActive) {
      await assertAnotherActiveAdminRemains(tx, target.id);
    }

    // Verified safe: no table anywhere holds a foreign key to commanders.id
    // (every "who did this" column across the schema is a denormalized
    // varchar holding the display name/username), so this cannot cascade or
    // orphan anything. Audit rows naming this person survive verbatim —
    // that's also why the frontend leads with Deactivate and treats this as
    // a confirm-gated secondary action.
    await tx.delete(commanders).where(eq(commanders.id, id));
    return target;
  });

  await logSettingsChange({
    module: "users",
    settingKey: deleted.username,
    entityId: deleted.id,
    action: "delete",
    oldValue: { username: deleted.username, displayName: deleted.displayName, role: deleted.role, isActive: deleted.isActive },
    newValue: null,
    actor: actor.username,
  });

  res.json({ message: "User deleted" });
});

router.post("/users/:id/password", async (req: Request, res: Response) => {
  const { id } = ResetUserPasswordParams.parse(req.params);
  const parsed = ResetUserPasswordBody.safeParse(req.body);
  if (!parsed.success) {
    throw badRequest("Invalid password payload", parsed.error.issues);
  }
  const actor = getActor(req);

  const [target] = await db.select().from(commanders).where(eq(commanders.id, id)).limit(1);
  if (!target) throw notFound("User not found");

  const passwordHash = await bcrypt.hash(parsed.data.password, 10);
  await db.update(commanders).set({ passwordHash }).where(eq(commanders.id, id));

  // Never put the hash or the plaintext in oldValue/newValue — they are
  // jsonb columns rendered directly in the Settings > Change Log UI.
  await logSettingsChange({
    module: "users",
    settingKey: target.username,
    entityId: target.id,
    action: "update",
    oldValue: null,
    newValue: { passwordChanged: true },
    actor: actor.username,
  });

  res.json({ message: "Password reset" });
});

export default router;
