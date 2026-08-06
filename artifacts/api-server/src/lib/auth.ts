import type { Request, Response, NextFunction } from "express";
import { initCatalystApp, initCatalystAdminApp, getCurrentCatalystUser, createCommandersRepo } from "@workspace/db/catalyst";
import { logSettingsChange } from "./catalyst/settings-audit";
import { unauthorized } from "./http";
import { logger } from "./logger";

export type Role = "admin" | "reader";

export interface Actor {
  id: string;
  username: string;
  displayName: string;
  /**
   * Authoritative role for THIS request, resolved from the `commanders`
   * Data Store row on every authenticated request — never trusted from
   * anything Catalyst itself hands back about the signed-in user, so a
   * demotion or deactivation takes effect on the very next request rather
   * than waiting out however long the Catalyst session itself lives.
   */
  role: Role;
}

export interface AuthedRequest extends Request {
  actor?: Actor;
}

/**
 * `SUPER_ADMIN_EMAIL` bootstraps the very first admin: whichever
 * Catalyst-authenticated email matches it becomes an admin the first time it
 * signs in, even before any commanders row exists. Unlike the sibling
 * Customer-Insight-Engine project (which falls back to a hardcoded example
 * address when the env var is unset), this deliberately has NO default —
 * an unset var must never silently grant admin to a guessable email in a
 * deployment someone forgot to configure. The "first commander ever" and
 * "Catalyst's own platform-admin role" bootstrap paths below still work
 * without it.
 */
function isSuperAdminEmail(email: string): boolean {
  const configured = (process.env.SUPER_ADMIN_EMAIL ?? "").trim().toLowerCase();
  return configured.length > 0 && email.trim().toLowerCase() === configured;
}

/**
 * Resolve (and, on first sight of this Catalyst identity, provision) the
 * commander row for the current request's authenticated Catalyst user.
 *
 * Three cases, in order:
 *  1. A commander row already claimed by this exact catalyst_user_id — use
 *     it (and its live role/isActive) directly.
 *  2. An outstanding invite for this email (routes/users.ts's POST /users)
 *     with no catalyst_user_id yet — claim it now, adopting whatever role
 *     the inviting admin chose.
 *  3. Neither — this Catalyst identity has never been seen and was never
 *     invited. Auto-provision a new commander row: admin if this is the
 *     very first commander ever, or the email matches SUPER_ADMIN_EMAIL, or
 *     Catalyst's own project role for this user is already an "admin" type
 *     role; reader otherwise. Mirrors Customer-Insight-Engine's
 *     `resolveRole` bootstrap.
 *
 * Returns null only when an existing row is deactivated — the one case that
 * revokes access outright rather than resolving to a role.
 */
async function resolveCommander(
  req: Request,
  catalystUser: { userId: string; email: string; firstName: string; lastName: string; isPlatformAdmin: boolean },
): Promise<Actor | null> {
  const repo = createCommandersRepo(initCatalystApp(req));

  const existing = await repo.getByCatalystUserId(catalystUser.userId);
  if (existing) {
    if (!existing.isActive) return null;
    return { id: existing.id, username: existing.username, displayName: existing.displayName, role: existing.role };
  }

  // Every write below is admin-scoped: `commanders` is Select-only for the
  // "App User" role (see docs/CATALYST_SCHEMA.md's Slice 4 note), so an
  // ordinary authenticated Catalyst user cannot self-provision or
  // self-promote by hitting Data Store's own REST API directly — only this
  // server, using the admin-scoped SDK init, can write this table.
  const adminRepo = createCommandersRepo(initCatalystAdminApp(req));
  const username = catalystUser.email.trim().toLowerCase();

  const pending = await adminRepo.getPendingInviteByUsername(username);
  if (pending) {
    const claimed = await adminRepo.claim(pending.id, catalystUser.userId);
    return { id: claimed.id, username: claimed.username, displayName: claimed.displayName, role: claimed.role };
  }

  const all = await repo.listAll();
  const isFirstCommanderEver = all.length === 0;
  const role: Role =
    isFirstCommanderEver || isSuperAdminEmail(username) || catalystUser.isPlatformAdmin ? "admin" : "reader";
  const displayName = [catalystUser.firstName, catalystUser.lastName].filter(Boolean).join(" ") || username;

  const created = await adminRepo.create({ catalystUserId: catalystUser.userId, username, displayName, role, isActive: true });

  // Auto-provisioning is itself a "create" worth auditing, same as an
  // admin-driven invite (routes/users.ts) — the change log should be a
  // complete record of every account that came to exist, not just the ones
  // created through the Users tab.
  await logSettingsChange(initCatalystAdminApp(req), {
    module: "users",
    settingKey: created.username,
    entityId: created.id,
    action: "create",
    oldValue: null,
    newValue: { username: created.username, displayName: created.displayName, role, isActive: true },
    actor: "system (first Catalyst sign-in)",
  });

  return { id: created.id, username: created.username, displayName: created.displayName, role: created.role };
}

/**
 * 401 gate. Registered ONCE, path-less, in routes/index.ts.
 *
 * MUST keep exactly 3 declared parameters. Layer.handleRequest skips any
 * handler with `fn.length > 3` (it treats 4 as an error handler), which would
 * silently disable auth for the whole app.
 */
export async function requireAuth(req: Request, _res: Response, next: NextFunction): Promise<void> {
  // Idempotency. Multiple routers used to each mount a path-less
  // `.use(requireAuth)` at the same prefix, so requireAuth could run several
  // times per request. This guard makes that free instead of several extra
  // Catalyst round trips, and costs nothing now that there is only one call
  // site. It also lets a test harness inject `req.actor` directly and skip
  // real Catalyst auth entirely (see routes/index.rbac.test.ts).
  if ((req as AuthedRequest).actor) {
    next();
    return;
  }

  try {
    const catalystUser = await getCurrentCatalystUser(req);
    const actor = await resolveCommander(req, catalystUser);
    if (!actor) {
      next(unauthorized("Session is no longer valid"));
      return;
    }
    (req as AuthedRequest).actor = actor;
    next();
  } catch (err) {
    // No valid Catalyst session (not signed in, or an SDK-level failure) —
    // collapse every case to a plain 401 in the RESPONSE, matching the
    // pre-Catalyst behavior's "same generic outcome" posture. But log the
    // real error server-side: the Catalyst Node SDK throws distinct,
    // specific error messages (e.g. a credential-scope mismatch reads
    // completely differently from "not signed in at all"), and collapsing
    // them silently made a real bug (see this file's git history / the
    // Slice 4 plan writeup) indistinguishable from an ordinary
    // not-yet-authenticated request for an entire debugging session.
    logger.warn({ err }, "requireAuth: Catalyst session resolution failed");
    next(unauthorized());
  }
}

export function getActor(req: Request): Actor {
  const actor = (req as AuthedRequest).actor;
  if (!actor) {
    throw unauthorized();
  }
  return actor;
}
