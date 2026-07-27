import { Router, type IRouter, type Request, type Response } from "express";
import bcrypt from "bcryptjs";
import { sql } from "drizzle-orm";
import { db, commanders } from "@workspace/db";
import {
  LoginBody,
  LoginResponse,
  LogoutResponse,
  GetMeResponse,
  DashboardVisitResponse,
} from "@workspace/api-zod";
import { issueSession, clearSession, getActor } from "../lib/auth";
import { badRequest, unauthorized } from "../lib/http";

/**
 * Two routers, not one, and this split is deliberate: authPublicRouter is
 * mounted ABOVE the requireAuth/requireWriteRole gate in routes/index.ts
 * (login has no session yet; logout just clears a cookie), authSessionRouter
 * is mounted BELOW it with everything else. Keeping /auth/me and
 * /auth/dashboard-visit in the same file as login/logout used to mean the
 * whole file sat above the gate — so the day someone added, say,
 * POST /auth/change-password here, it would have been reader-writable with
 * no review signal. That is the exact shape of the routes/settings-audit.ts
 * bug this RBAC change also fixes, just in a new location.
 */

export const authPublicRouter: IRouter = Router();
export const authSessionRouter: IRouter = Router();

authPublicRouter.post("/auth/login", async (req: Request, res: Response) => {
  const parsed = LoginBody.safeParse(req.body);
  if (!parsed.success) {
    throw badRequest("Invalid credentials payload", parsed.error.issues);
  }
  const { email, password } = parsed.data;
  // lower() on both sides pairs with lowercasing usernames on create
  // (routes/users.ts) — otherwise a user created as "Alice@corp.com" could
  // only ever sign in by typing the exact original casing. This can only
  // ever make login MORE permissive than an exact match, never less, so it
  // cannot lock anyone out.
  const rows = await db
    .select()
    .from(commanders)
    .where(sql`lower(${commanders.username}) = lower(${email})`)
    .limit(1);
  const commander = rows[0];
  // Same generic message whether the account doesn't exist, the password is
  // wrong, or the account is deactivated — a distinct "account disabled"
  // message would let an unauthenticated caller enumerate which usernames
  // exist and are active.
  if (!commander || !commander.isActive) {
    throw unauthorized("Invalid email or password");
  }

  const ok = await bcrypt.compare(password, commander.passwordHash);
  if (!ok) {
    throw unauthorized("Invalid email or password");
  }

  issueSession(res, {
    id: commander.id,
    username: commander.username,
    displayName: commander.displayName,
  });
  res.json(LoginResponse.parse({ message: "Signed in" }));
});

authPublicRouter.post("/auth/logout", (_req: Request, res: Response) => {
  clearSession(res);
  res.json(LogoutResponse.parse({ message: "Signed out" }));
});

authSessionRouter.get("/auth/me", (req: Request, res: Response) => {
  const actor = getActor(req);
  res.json(
    GetMeResponse.parse({
      id: actor.id,
      email: actor.username,
      role: actor.role,
      displayName: actor.displayName,
    }),
  );
});

authSessionRouter.post(
  "/auth/dashboard-visit",
  async (req: Request, res: Response) => {
    const actor = getActor(req);
    const result = await db.execute(sql`
      WITH prev AS (
        SELECT last_dashboard_visit_at FROM commanders WHERE id = ${actor.id}
      )
      UPDATE commanders
      SET last_dashboard_visit_at = now()
      WHERE id = ${actor.id}
      RETURNING (SELECT last_dashboard_visit_at FROM prev) AS previous_visit_at
    `);
    const list = Array.isArray(result)
      ? result
      : ((result as { rows: unknown[] }).rows ?? []);
    const row = list[0] as
      | { previous_visit_at: string | Date | null }
      | undefined;
    const previousVisitAt = row?.previous_visit_at
      ? new Date(row.previous_visit_at).toISOString()
      : null;
    res.json(DashboardVisitResponse.parse({ previousVisitAt }));
  },
);
