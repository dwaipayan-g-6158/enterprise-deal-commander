import type { Request, Response, NextFunction } from "express";
import { forbidden, unauthorized } from "./http";
import type { AuthedRequest } from "./auth";

/** Express routes HEAD to GET handlers; cors() short-circuits OPTIONS before this. */
const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

/**
 * The complete list of non-safe-method requests a reader may make.
 *
 * Full pathnames (mount prefix included, query string excluded). Adding an
 * entry here is the ONLY way to let a reader past a POST/PUT/PATCH/DELETE,
 * and every entry needs a one-line justification. Pinned by
 * routes/index.rbac.test.ts.
 *
 *   /api/v1/auth/dashboard-visit  writes only commanders.last_dashboard_visit_at
 *                                 for the caller's OWN row; fires on every
 *                                 dashboard load and drives the "welcome back"
 *                                 diff. Readers see the dashboard, so they need it.
 *   /api/v2/nlc/parse             pure function, no DB   (analytics.ts:1366)
 *   /api/v2/scenarios/compute     in-memory only         (config.ts:418)
 *                                 NOTE: POST /api/v2/scenarios (no /compute)
 *                                 DOES insert and is deliberately absent.
 *   /api/v2/custom-patterns/test  in-memory only         (config.ts:637)
 *
 * Exact-match only, no prefixes: a prefix rule would let
 * "/api/v2/scenarios/compute-and-save" through.
 */
export const READER_WRITE_METHOD_ALLOWLIST: ReadonlySet<string> = new Set([
  "/api/v1/auth/dashboard-visit",
  "/api/v2/nlc/parse",
  "/api/v2/scenarios/compute",
  "/api/v2/custom-patterns/test",
]);

/**
 * The request's complete pathname, correct regardless of where this
 * middleware is mounted.
 *
 * req.baseUrl is the prefix consumed so far ("/api" for the path-less
 * registration in routes/index.ts). req.path is parseurl(req.url).pathname —
 * the remainder WITHOUT the query string. Their sum is invariant under where
 * the middleware is mounted.
 *
 * Do NOT substitute req.originalUrl: it still carries "?debug=1", so exact
 * comparison silently fails and prefix comparison silently over-matches.
 *
 * Normalized to match Express's own default matching, so the allowlist can
 * never disagree with the router about which route a request reaches:
 *   - lowercased  (Express default caseSensitive: false)
 *   - trailing slash stripped (Express default strict: false)
 */
export function fullPathname(req: Request): string {
  const lowered = (req.baseUrl + req.path).toLowerCase();
  return lowered.length > 1 ? lowered.replace(/\/+$/, "") : lowered;
}

/**
 * 403 gate. Registered ONCE, path-less, immediately after requireAuth.
 *
 * Deny-by-default: a reader is refused ANY non-safe method unless the exact
 * path is allowlisted above. A mutation route added tomorrow is denied to
 * readers the moment it is registered, with no per-route opt-in and no way to
 * forget. That property is the point of this design and is asserted
 * exhaustively in routes/index.rbac.test.ts.
 *
 * Verb-level only, by product decision: readers see EVERY deal, every page,
 * every field, every bulk export. There is no data scoping anywhere.
 *
 * Must keep exactly 3 declared parameters — see the arity note in
 * requireAuth (lib/auth.ts). A 4-param version is silently skipped by
 * Express's router and would disable the entire authorization layer.
 */
export function requireWriteRole(
  req: Request,
  _res: Response,
  next: NextFunction,
): void {
  const actor = (req as AuthedRequest).actor;
  // Only reachable if someone reorders this above requireAuth. Fail closed.
  if (!actor) {
    next(unauthorized());
    return;
  }

  if (actor.role === "admin") {
    next();
    return;
  }
  if (SAFE_METHODS.has(req.method.toUpperCase())) {
    next();
    return;
  }
  if (READER_WRITE_METHOD_ALLOWLIST.has(fullPathname(req))) {
    next();
    return;
  }

  next(forbidden("This action requires the admin role"));
}
