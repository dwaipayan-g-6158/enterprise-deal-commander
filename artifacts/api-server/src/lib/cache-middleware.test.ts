import { describe, it, expect, beforeEach } from "vitest";
import type { Request, Response, NextFunction } from "express";
import { cacheInvalidationMiddleware } from "./cache-middleware";
import { cache, CacheKeys } from "./cache";

/**
 * A minimal fake Response that records the `finish` listener so the test can
 * fire it manually (the real listener fires after the HTTP response is sent).
 */
function makeReqRes(opts: {
  method: string;
  url: string;
  statusCode?: number;
}): { req: Request; res: Response; finish: () => void } {
  const listeners: Array<() => void> = [];
  const req = {
    method: opts.method,
    originalUrl: opts.url,
  } as unknown as Request;
  const res = {
    statusCode: opts.statusCode ?? 200,
    on(event: string, cb: () => void) {
      if (event === "finish") listeners.push(cb);
      return this;
    },
  } as unknown as Response;
  return { req, res, finish: () => listeners.forEach((cb) => cb()) };
}

function run(opts: { method: string; url: string; statusCode?: number }) {
  const { req, res, finish } = makeReqRes(opts);
  let nextCalled = false;
  const next: NextFunction = () => {
    nextCalled = true;
  };
  cacheInvalidationMiddleware(req, res, next);
  expect(nextCalled).toBe(true);
  finish();
}

const DEAL_ID = "11111111-1111-1111-1111-111111111111";

describe("cacheInvalidationMiddleware", () => {
  beforeEach(() => {
    cache.clear();
  });

  it("drops cached intelligence after a NON-event-emitting cross-sell PUT", () => {
    cache.set(CacheKeys.intelligence(DEAL_ID), { stale: true });
    run({ method: "PUT", url: `/api/v1/deals/${DEAL_ID}/cross-sells` });
    expect(cache.get(CacheKeys.intelligence(DEAL_ID))).toBeUndefined();
  });

  it("drops cached intelligence after a NON-event-emitting blocker DELETE", () => {
    cache.set(CacheKeys.intelligence(DEAL_ID), { stale: true });
    run({
      method: "DELETE",
      url: `/api/v1/deals/${DEAL_ID}/blockers/abc`,
    });
    expect(cache.get(CacheKeys.intelligence(DEAL_ID))).toBeUndefined();
  });

  it("drops cached intelligence after a NON-event-emitting intervention launch", () => {
    cache.set(CacheKeys.intelligence(DEAL_ID), { stale: true });
    run({
      method: "POST",
      url: `/api/v1/deals/${DEAL_ID}/interventions`,
    });
    expect(cache.get(CacheKeys.intelligence(DEAL_ID))).toBeUndefined();
  });

  it("drops cached summaries (portfolio rollups) after a deal mutation", () => {
    cache.set(`${CacheKeys.summaryPrefix}portfolio`, { stale: true });
    run({
      method: "POST",
      url: `/api/v1/deals/${DEAL_ID}/dispositions`,
    });
    expect(cache.get(`${CacheKeys.summaryPrefix}portfolio`)).toBeUndefined();
  });

  it("drops lookup, intelligence and summary caches for ALL deals on a global config change", () => {
    const otherDeal = "22222222-2222-2222-2222-222222222222";
    cache.set(`${CacheKeys.lookupPrefix}thresholds`, { stale: true });
    cache.set(CacheKeys.intelligence(DEAL_ID), { stale: true });
    cache.set(CacheKeys.intelligence(otherDeal), { stale: true });
    cache.set(`${CacheKeys.summaryPrefix}portfolio`, { stale: true });

    run({ method: "PUT", url: "/api/v1/lookups/engine-thresholds" });

    expect(cache.get(`${CacheKeys.lookupPrefix}thresholds`)).toBeUndefined();
    expect(cache.get(CacheKeys.intelligence(DEAL_ID))).toBeUndefined();
    expect(cache.get(CacheKeys.intelligence(otherDeal))).toBeUndefined();
    expect(cache.get(`${CacheKeys.summaryPrefix}portfolio`)).toBeUndefined();
  });

  it("drops caches on an FX-rate change too", () => {
    cache.set(`${CacheKeys.lookupPrefix}fx:EUR:USD`, 1.1);
    cache.set(CacheKeys.intelligence(DEAL_ID), { stale: true });
    run({ method: "PUT", url: "/api/v1/lookups/fx-rates" });
    expect(cache.get(`${CacheKeys.lookupPrefix}fx:EUR:USD`)).toBeUndefined();
    expect(cache.get(CacheKeys.intelligence(DEAL_ID))).toBeUndefined();
  });

  it("drops caches on a settings-audit rollback (new /v1/settings/ path)", () => {
    cache.set(`${CacheKeys.lookupPrefix}scoring-weights`, { stale: true });
    run({ method: "POST", url: "/api/v1/settings/change-log/abc-123/rollback" });
    expect(cache.get(`${CacheKeys.lookupPrefix}scoring-weights`)).toBeUndefined();
  });

  it("does NOT invalidate on a read (GET)", () => {
    cache.set(CacheKeys.intelligence(DEAL_ID), { fresh: true });
    run({ method: "GET", url: `/api/v1/deals/${DEAL_ID}` });
    expect(cache.get(CacheKeys.intelligence(DEAL_ID))).toEqual({ fresh: true });
  });

  it("does NOT invalidate when the mutation failed (status >= 400)", () => {
    cache.set(CacheKeys.intelligence(DEAL_ID), { fresh: true });
    run({
      method: "PUT",
      url: `/api/v1/deals/${DEAL_ID}/cross-sells`,
      statusCode: 422,
    });
    expect(cache.get(CacheKeys.intelligence(DEAL_ID))).toEqual({ fresh: true });
  });
});
