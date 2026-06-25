import type { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";
import { unauthorized } from "./http";

const COOKIE_NAME = "edc_session";
const TOKEN_TTL = "7d";

function getSecret(): string {
  const secret = process.env.SESSION_SECRET;
  if (secret) return secret;
  if (process.env.NODE_ENV === "production") {
    throw new Error("SESSION_SECRET environment variable is required.");
  }
  // Dev-only: a stable fallback so sessions survive server restarts when no
  // SESSION_SECRET is exported in the shell. Production still requires the
  // env var (throws above), so this weak key can never be used in prod.
  return "edc-dev-insecure-stable-secret";
}

export interface Actor {
  id: string;
  username: string;
  displayName: string;
}

export interface AuthedRequest extends Request {
  actor?: Actor;
}

interface SessionClaims {
  sub: string;
  username: string;
  name: string;
}

export function issueSession(res: Response, actor: Actor): void {
  const token = jwt.sign(
    { sub: actor.id, username: actor.username, name: actor.displayName },
    getSecret(),
    { algorithm: "HS256", expiresIn: TOKEN_TTL },
  );
  res.cookie(COOKIE_NAME, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    maxAge: 7 * 24 * 60 * 60 * 1000,
    path: "/",
  });
}

export function clearSession(res: Response): void {
  res.clearCookie(COOKIE_NAME, { path: "/" });
}

export function readActor(req: Request): Actor | null {
  const cookies = (req as Request & { cookies?: Record<string, string> })
    .cookies;
  const token = cookies?.[COOKIE_NAME];
  if (!token) return null;
  try {
    const claims = jwt.verify(token, getSecret(), {
      algorithms: ["HS256"],
    }) as SessionClaims;
    return {
      id: claims.sub,
      username: claims.username,
      displayName: claims.name,
    };
  } catch {
    return null;
  }
}

export function requireAuth(
  req: Request,
  _res: Response,
  next: NextFunction,
): void {
  const actor = readActor(req);
  if (!actor) {
    next(unauthorized());
    return;
  }
  (req as AuthedRequest).actor = actor;
  next();
}

export function getActor(req: Request): Actor {
  const actor = (req as AuthedRequest).actor;
  if (!actor) {
    throw unauthorized();
  }
  return actor;
}
