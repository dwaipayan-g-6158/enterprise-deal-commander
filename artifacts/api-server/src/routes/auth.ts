import { Router, type IRouter, type Request, type Response } from "express";
import bcrypt from "bcryptjs";
import { eq } from "drizzle-orm";
import { db, commanders } from "@workspace/db";
import {
  LoginBody,
  LoginResponse,
  LogoutResponse,
  GetMeResponse,
} from "@workspace/api-zod";
import {
  issueSession,
  clearSession,
  requireAuth,
  getActor,
} from "../lib/auth";
import { badRequest, unauthorized, HttpError } from "../lib/http";

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

  // Account lockout check
  if (commander.lockedUntil && commander.lockedUntil > new Date()) {
    const retryAfterSec = Math.ceil(
      (commander.lockedUntil.getTime() - Date.now()) / 1000,
    );
    res.setHeader("Retry-After", String(retryAfterSec));
    throw new HttpError(
      429,
      "ACCOUNT_LOCKED",
      "Account locked due to too many failed attempts. Try again in 15 minutes.",
    );
  }

  const ok = await bcrypt.compare(password, commander.passwordHash);
  if (!ok) {
    const newAttempts = commander.loginAttempts + 1;
    const lockedUntil =
      newAttempts >= 5 ? new Date(Date.now() + 15 * 60 * 1000) : null;
    await db
      .update(commanders)
      .set({ loginAttempts: newAttempts, lockedUntil })
      .where(eq(commanders.id, commander.id));
    throw unauthorized("Invalid email or password");
  }

  // Reset attempts on successful login
  await db
    .update(commanders)
    .set({ loginAttempts: 0, lockedUntil: null })
    .where(eq(commanders.id, commander.id));

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
    }),
  );
});

export default router;
