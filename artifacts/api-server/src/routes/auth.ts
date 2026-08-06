import { Router, type IRouter, type Request, type Response } from "express";
import { initCatalystAdminApp, createCommandersRepo } from "@workspace/db/catalyst";
import { GetMeResponse, DashboardVisitResponse } from "@workspace/api-zod";
import { getActor } from "../lib/auth";

/**
 * Sign-in and sign-out no longer have server routes at all: Catalyst
 * embedded auth's Web SDK widget (src/pages/login.tsx) talks directly to
 * Zoho's own identity servers to establish and end a session — there is
 * nothing for this server to authenticate a password against or a cookie to
 * issue/clear. `POST /auth/login` and `POST /auth/logout` are retired along
 * with bcryptjs/jsonwebtoken (see the removed authPublicRouter in
 * routes/index.ts). Everything left here is genuinely session-dependent, so
 * it stays mounted below the requireAuth/requireWriteRole gate exactly where
 * it always was.
 */
export const authSessionRouter: IRouter = Router();

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

authSessionRouter.post("/auth/dashboard-visit", async (req: Request, res: Response) => {
  const actor = getActor(req);
  // Admin-scoped, like every other write to `commanders` (see
  // lib/auth.ts's resolveCommander docstring): the table is Select-only for
  // the "App User" role, and `touchDashboardVisit` is an UPDATE, not a read.
  // This was the one user-scoped write left on this table — with the old
  // permissive table permissions it worked anyway, so nothing surfaced until
  // the permission was actually tightened. `actor.id` comes from the
  // authenticated session, so a caller can still only touch their own row.
  const previousVisitAt = await createCommandersRepo(initCatalystAdminApp(req)).touchDashboardVisit(actor.id);
  res.json(DashboardVisitResponse.parse({ previousVisitAt: previousVisitAt ? previousVisitAt.toISOString() : null }));
});

export default authSessionRouter;
