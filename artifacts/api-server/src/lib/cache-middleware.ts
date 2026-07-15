import type { Request, Response, NextFunction } from "express";
import { cache, CacheKeys, invalidateDeal } from "./cache";
import { invalidatePortfolioRollups } from "./portfolio-rollups";

/**
 * Authoritative cache-invalidation guard for the intelligence/summary cache.
 *
 * The event-bus `registerCacheInvalidation` subscriber drops cache entries for
 * the common deal/gate/blocker mutations, but it only fires for routes that
 * emit events. To guarantee Phase 1 byte-identical read behavior (no stale
 * intelligence after ANY write), this middleware invalidates on every
 * successful mutating request — including routes that do not emit events
 * (blocker delete, cross-sells, dispositions, interventions) and global config
 * changes (engine thresholds / FX rates) that affect every deal's computed
 * intelligence.
 *
 * It runs on `res.on("finish")` so invalidation only happens for requests that
 * actually succeeded (status < 400). Double-invalidation with the event
 * subscriber is harmless — invalidation is idempotent.
 */
const DEAL_PATH = /\/deals\/([^/?]+)/;
const GLOBAL_CONFIG_PATH = /\/lookups\/|\/settings\//;

export function cacheInvalidationMiddleware(
  req: Request,
  res: Response,
  next: NextFunction,
): void {
  const method = req.method.toUpperCase();
  if (method === "GET" || method === "HEAD" || method === "OPTIONS") {
    next();
    return;
  }

  res.on("finish", () => {
    if (res.statusCode >= 400) return;
    const path = req.originalUrl;

    const dealMatch = DEAL_PATH.exec(path);
    if (dealMatch) {
      invalidateDeal(decodeURIComponent(dealMatch[1]));
      invalidatePortfolioRollups();
      return;
    }

    if (GLOBAL_CONFIG_PATH.test(path)) {
      // Threshold / FX changes re-shape every deal's intelligence, and the
      // cached lookup tier (thresholds/FX) is now stale.
      cache.invalidatePrefix(CacheKeys.lookupPrefix);
      cache.invalidatePrefix(CacheKeys.intelligencePrefix);
      cache.invalidatePrefix(CacheKeys.summaryPrefix);
      invalidatePortfolioRollups();
    }
  });

  next();
}
