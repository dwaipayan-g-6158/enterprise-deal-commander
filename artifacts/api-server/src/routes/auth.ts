import { Router, type IRouter, type Request, type Response } from "express";
import { initCatalystApp, createCommandersRepo } from "@workspace/db/catalyst";
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
  const previousVisitAt = await createCommandersRepo(initCatalystApp(req)).touchDashboardVisit(actor.id);
  res.json(DashboardVisitResponse.parse({ previousVisitAt: previousVisitAt ? previousVisitAt.toISOString() : null }));
});

export default authSessionRouter;
