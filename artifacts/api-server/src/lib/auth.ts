import type { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";
import { eq } from "drizzle-orm";
import { db, commanders } from "@workspace/db";
import { unauthorized } from "./http";

const COOKIE_NAME = "edc_session";
const TOKEN_TTL = "7d";
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

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

export type Role = "admin" | "reader";

export interface Actor {
  id: string;
  username: string;
  displayName: string;
  /**
   * Authoritative role for THIS request, read from `commanders.role` on every
   * authenticated request. Deliberately NOT a JWT claim: the session cookie
   * lives for 7 days, so a claim would keep a demoted or deactivated user at
   * admin for up to a week. Revocation must be immediate, so the token proves
   * only identity and the row decides authority. Bonus: the committed dev
   * fallback secret above means a role claim would be self-signable by
   * anyone reading this public repo.
   */
  role: Role;
}

export interface AuthedRequest extends Request {
  actor?: Actor;
}

/** What the session cookie actually proves: identity, nothing more. */
interface SessionIdentity {
  id: string;
  username: string;
  displayName: string;
}

interface SessionClaims {
  sub: string;
  username: string;
  name: string;
}

export function issueSession(res: Response, identity: SessionIdentity): void {
  const token = jwt.sign(
    { sub: identity.id, username: identity.username, name: identity.displayName },
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

/** Decode the cookie. Returns identity only — never authority. */
export function readSessionIdentity(req: Request): SessionIdentity | null {
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

async function loadPrincipal(id: string): Promise<Actor | null> {
  const [row] = await db
    .select({
      id: commanders.id,
      username: commanders.username,
      displayName: commanders.displayName,
      role: commanders.role,
      isActive: commanders.isActive,
    })
    .from(commanders)
    .where(eq(commanders.id, id))
    .limit(1);

  if (!row || !row.isActive) return null;

  return {
    id: row.id,
    username: row.username,
    displayName: row.displayName,
    // Fail closed on anything the CHECK constraint somehow let through.
    role: row.role === "admin" ? "admin" : "reader",
  };
}

/**
 * 401 gate. Registered ONCE, path-less, in routes/index.ts.
 *
 * Async because it resolves the caller's live role/active state from the DB
 * on every request rather than trusting the (long-lived) cookie for it.
 * Express 5 handles this fine: router@2 Layer.handleRequest attaches
 * `.then(null, next)` to any returned promise, so a rejection becomes a 500
 * via the app error handler rather than an unhandled rejection.
 *
 * MUST keep exactly 3 declared parameters. Layer.handleRequest skips any
 * handler with `fn.length > 3` (it treats 4 as an error handler), which would
 * silently disable auth for the whole app.
 */
export async function requireAuth(
  req: Request,
  _res: Response,
  next: NextFunction,
): Promise<void> {
  // Idempotency. Multiple routers used to each mount a path-less
  // `.use(requireAuth)` at the same prefix, so requireAuth could run several
  // times per request. This guard makes that free instead of several extra
  // DB round trips, and costs nothing now that there is only one call site.
  if ((req as AuthedRequest).actor) {
    next();
    return;
  }

  const identity = readSessionIdentity(req);
  if (!identity) {
    next(unauthorized());
    return;
  }

  // `sub` is attacker-shaped in any deployment using the dev fallback secret.
  // Without this, a non-UUID sub makes Postgres raise 22P02 on the uuid
  // column and the client gets a 500 where it should get a 401.
  if (!UUID_RE.test(identity.id)) {
    next(unauthorized());
    return;
  }

  // Deleted or deactivated after the cookie was issued -> revoked NOW, not in
  // up to 7 days. This lookup is the whole reason requireAuth is async.
  const actor = await loadPrincipal(identity.id);
  if (!actor) {
    next(unauthorized("Session is no longer valid"));
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
