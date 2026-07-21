import { Router, type IRouter, type Request, type Response } from "express";
import bcrypt from "bcryptjs";
import { eq, sql } from "drizzle-orm";
import { db, commanders } from "@workspace/db";
import {
  LoginBody,
  LoginResponse,
  LogoutResponse,
  GetMeResponse,
  DashboardVisitResponse,
} from "@workspace/api-zod";
import {
  issueSession,
  clearSession,
  requireAuth,
  getActor,
} from "../lib/auth";
import { badRequest, unauthorized } from "../lib/http";

const router: IRouter = Router();

router.post("/auth/login", async (req: Request, res: Response) => {
  const parsed = LoginBody.safeParse(req.body);
  if (!parsed.success) {
    throw badRequest("Invalid credentials payload", parsed.error.issues);
  }
  const { email, password } = parsed.data;
  const rows = await db
    .select()
    .from(commanders)
    .where(eq(commanders.username, email))
    .limit(1);
  const commander = rows[0];
  if (!commander) {
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

router.post("/auth/logout", (_req: Request, res: Response) => {
  clearSession(res);
  res.json(LogoutResponse.parse({ message: "Signed out" }));
});

router.get("/auth/me", requireAuth, (req: Request, res: Response) => {
  const actor = getActor(req);
  res.json(
    GetMeResponse.parse({
      id: actor.id,
      email: actor.username,
      role: "commander",
      displayName: actor.displayName,
    }),
  );
});

router.post(
  "/auth/dashboard-visit",
  requireAuth,
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

export default router;
