import { Router, type IRouter, type Request, type Response } from "express";
import {
  initCatalystApp,
  initCatalystAdminApp,
  createCommandersRepo,
  inviteCatalystUser,
  deleteCatalystUser,
  isDuplicateValueError,
  type CommanderRow,
} from "@workspace/db/catalyst";
import { ListUsersResponse, CreateUserBody, UpdateUserParams, UpdateUserBody, DeleteUserParams } from "@workspace/api-zod";
import { getActor, type Role } from "../lib/auth";
import { badRequest, conflict, notFound } from "../lib/http";
import { logSettingsChange } from "../lib/catalyst/settings-audit";
import { logger } from "../lib/logger";

/**
 * User account management — the actual "delegation" capability of RBAC.
 * Without this, roles exist in the schema but nobody can hand one out.
 *
 * No requireAdmin decorator on any route here, and none is needed: the
 * app-wide gate (requireAuth + requireWriteRole in routes/index.ts) already
 * lets GET through to any authenticated caller and refuses every other
 * method to a reader. Do not add a redundant per-route check — it would
 * only create a second place to keep in sync with the real one.
 *
 * Post-Catalyst-migration: "create a user" is now "invite a Catalyst project
 * user" (Catalyst sends its own set-password email; there is no
 * app-managed password anymore, so POST /users/:id/password is gone
 * entirely). The invited person's commander row starts with
 * catalyst_user_id null and is claimed automatically on their first sign-in
 * (see lib/auth.ts's resolveCommander) — the chosen role sticks because it's
 * on the pending row, not decided fresh at claim time.
 */

const router: IRouter = Router();

function toUserRow(row: CommanderRow) {
  return {
    id: row.id,
    email: row.username,
    displayName: row.displayName,
    role: row.role as Role,
    isActive: row.isActive,
    createdAt: row.createdAt.toISOString(),
    lastDashboardVisitAt: row.lastDashboardVisitAt ? row.lastDashboardVisitAt.toISOString() : null,
  };
}

router.get("/users", async (req: Request, res: Response) => {
  const rows = await createCommandersRepo(initCatalystApp(req)).listAll();
  res.json(ListUsersResponse.parse({ data: rows.map(toUserRow) }));
});

router.post("/users", async (req: Request, res: Response) => {
  const parsed = CreateUserBody.safeParse(req.body);
  if (!parsed.success) {
    throw badRequest("Invalid user payload", parsed.error.issues);
  }
  const actor = getActor(req);
  // Lowercase on the way in, matching the case-insensitive lookup every
  // other username comparison in this file already uses.
  const email = parsed.data.email.trim().toLowerCase();
  const role: Role = parsed.data.role ?? "reader";
  const displayName = parsed.data.display_name;

  const repo = createCommandersRepo(initCatalystApp(req));
  const existing = await repo.getByUsername(email);
  if (existing) {
    throw conflict("A user with this email already exists");
  }

  // Catalyst's invite API wants first/last name separately; EDC only
  // collects one display-name field, so split on the first space and fall
  // back to putting the whole thing in first_name.
  const [firstName, ...rest] = displayName.trim().split(/\s+/);
  const lastName = rest.join(" ");
  const appOrigin = (process.env.APP_ORIGIN || `${req.protocol}://${req.get("host")}`).replace(/\/$/, "");

  try {
    await inviteCatalystUser(req, { firstName: firstName || displayName, lastName, email }, `${appOrigin}/`);
  } catch (err) {
    logger.error({ err, email }, "Catalyst registerUser failed");
    throw conflict("Could not invite this email — it may already be registered with Catalyst, or Catalyst rejected it");
  }

  // Admin-scoped: commanders is Select-only for ordinary Catalyst users (see
  // lib/auth.ts's resolveCommander docstring).
  const adminRepo = createCommandersRepo(initCatalystAdminApp(req));
  let created: CommanderRow;
  try {
    created = await adminRepo.create({ catalystUserId: null, username: email, displayName, role, isActive: true });
  } catch (err) {
    // Race-safety backstop for the pre-check above — two concurrent creates
    // of the same email can both pass the read before either inserts.
    if (isDuplicateValueError(err)) {
      throw conflict("A user with this email already exists");
    }
    throw err;
  }

  await logSettingsChange(initCatalystAdminApp(req), {
    module: "users",
    settingKey: created.username,
    entityId: created.id,
    action: "create",
    oldValue: null,
    newValue: { username: created.username, displayName: created.displayName, role, isActive: true },
    actor: actor.username,
  });

  res.status(201).json({ data: toUserRow(created) });
});

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

  const repo = createCommandersRepo(initCatalystApp(req));
  const target = await repo.getById(id);
  if (!target) throw notFound("User not found");

  // Self-guards, checked BEFORE the last-admin check so the message is
  // specific to what the caller actually tried to do.
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

  // Data Store has no transactions and no row locks (unlike the original
  // Drizzle version's `SELECT ... FOR UPDATE`) — this is the plan's accepted
  // trade-off: pre-check to fail fast in the common case, apply the write,
  // then re-check the invariant and self-revert if a concurrent request
  // raced past both pre-checks. Weaker than a real lock under true
  // concurrency, but self-revert means the failure mode is a rejected
  // request, never a permanently admin-less app.
  if (willDemote || willDeactivate) {
    const others = (await repo.listAll()).filter((u) => u.role === "admin" && u.isActive && u.id !== target.id);
    if (others.length === 0) {
      throw conflict("At least one active admin must remain — promote another user first");
    }
  }

  const adminRepo = createCommandersRepo(initCatalystAdminApp(req));
  const updated = await adminRepo.update(id, {
    displayName: body.display_name,
    role: body.role,
    isActive: body.is_active,
  });
  if (!updated) throw notFound("User not found");

  if (willDemote || willDeactivate) {
    // MUST read through `adminRepo`, not `repo`. sdk.ts memoizes reads per
    // request in a WeakMap keyed on the catalystApp OBJECT, and
    // initCatalystApp/initCatalystAdminApp return two different objects with
    // two separate caches. The write above invalidated only the admin app's
    // cache, so `repo.listAll()` here would replay the rows it read during the
    // pre-check — i.e. the state before the write — and `stillOk` would be
    // true no matter what just happened. That made this entire self-revert
    // backstop dead code: verified by disabling the pre-check above, at which
    // point the invariant could be violated with no 409 and no revert.
    const stillOk = (await adminRepo.listAll()).some((u) => u.role === "admin" && u.isActive);
    if (!stillOk) {
      await adminRepo.update(id, { role: target.role, isActive: target.isActive });
      throw conflict("At least one active admin must remain — promote another user first");
    }
  }

  const action = body.is_active === false ? "deactivate" : body.is_active === true ? "reactivate" : "update";
  await logSettingsChange(initCatalystAdminApp(req), {
    module: "users",
    settingKey: updated.username,
    entityId: updated.id,
    action,
    oldValue: { displayName: target.displayName, role: target.role, isActive: target.isActive },
    newValue: { displayName: updated.displayName, role: updated.role, isActive: updated.isActive },
    actor: actor.username,
  });

  res.json({ data: toUserRow(updated) });
});

router.delete("/users/:id", async (req: Request, res: Response) => {
  const { id } = DeleteUserParams.parse(req.params);
  const actor = getActor(req);

  const repo = createCommandersRepo(initCatalystApp(req));
  const target = await repo.getById(id);
  if (!target) throw notFound("User not found");

  if (target.id === actor.id) {
    throw conflict("You cannot delete your own account");
  }
  const isLastActiveAdmin = target.role === "admin" && target.isActive;
  if (isLastActiveAdmin) {
    const others = (await repo.listAll()).filter((u) => u.role === "admin" && u.isActive && u.id !== target.id);
    if (others.length === 0) {
      throw conflict("At least one active admin must remain — promote another user first");
    }
  }

  const adminRepo = createCommandersRepo(initCatalystAdminApp(req));
  await adminRepo.delete(id);

  // A delete can't self-revert (the row and its identity are gone) — the
  // narrow race window this leaves open (two simultaneous deletes of two
  // different admins when exactly 2 are active) is the same class of
  // accepted trade-off as PATCH's above. Loudly logging rather than silently
  // succeeding is the correct response if it ever actually happens.
  if (isLastActiveAdmin) {
    const stillOk = (await repo.listAll()).some((u) => u.role === "admin" && u.isActive);
    if (!stillOk) {
      logger.error({ deletedId: id }, "Last active admin was deleted in a race — the app may now have zero admins");
    }
  }

  // Best-effort: also remove them from Catalyst's own project user
  // directory so they can no longer sign in at all. Must not block the
  // app-level removal on failure — the commanders row is gone either way,
  // which is the authoritative "no more app access" signal this app itself
  // enforces regardless of what Catalyst's directory still contains.
  if (target.catalystUserId) {
    try {
      await deleteCatalystUser(req, target.catalystUserId);
    } catch (err) {
      logger.error(
        { err, catalystUserId: target.catalystUserId },
        "Failed to remove the Catalyst project user after deleting their commander row",
      );
    }
  }

  await logSettingsChange(initCatalystAdminApp(req), {
    module: "users",
    settingKey: target.username,
    entityId: target.id,
    action: "delete",
    oldValue: { username: target.username, displayName: target.displayName, role: target.role, isActive: target.isActive },
    newValue: null,
    actor: actor.username,
  });

  res.json({ message: "User deleted" });
});

export default router;
