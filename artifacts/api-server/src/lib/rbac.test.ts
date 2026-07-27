import { describe, it, expect } from "vitest";
import type { Request, Response, NextFunction } from "express";
import { requireWriteRole, fullPathname, READER_WRITE_METHOD_ALLOWLIST } from "./rbac";
import type { AuthedRequest, Role } from "./auth";

function run(opts: {
  role?: Role;
  method: string;
  baseUrl?: string;
  url: string;
}): { nextArg: unknown; nextCalled: boolean } {
  const req = {
    method: opts.method,
    baseUrl: opts.baseUrl ?? "/api",
    url: opts.url,
    // express computes req.path from req.url via parseurl — for these pure
    // unit tests it's simplest to just strip the query string ourselves,
    // matching what parseurl(req).pathname actually returns.
    path: opts.url.split("?")[0],
    actor:
      opts.role !== undefined
        ? { id: "u1", username: "u1", displayName: "U1", role: opts.role }
        : undefined,
  } as unknown as AuthedRequest;
  const res = {} as Response;
  let nextArg: unknown;
  let nextCalled = false;
  const next: NextFunction = ((err?: unknown) => {
    nextCalled = true;
    nextArg = err;
  }) as NextFunction;
  requireWriteRole(req as unknown as Request, res, next);
  return { nextArg, nextCalled };
}

describe("fullPathname", () => {
  it("sums baseUrl + path, ignoring the query string", () => {
    expect(
      fullPathname({ baseUrl: "/api", path: "/v2/nlc/parse" } as unknown as Request),
    ).toBe("/api/v2/nlc/parse");
  });

  it("lowercases", () => {
    expect(
      fullPathname({ baseUrl: "/API", path: "/V2/NLC/Parse" } as unknown as Request),
    ).toBe("/api/v2/nlc/parse");
  });

  it("strips a trailing slash", () => {
    expect(
      fullPathname({ baseUrl: "/api", path: "/v2/nlc/parse/" } as unknown as Request),
    ).toBe("/api/v2/nlc/parse");
  });

  it("never strips the sole leading slash of the root path", () => {
    expect(fullPathname({ baseUrl: "", path: "/" } as unknown as Request)).toBe("/");
  });
});

describe("requireWriteRole", () => {
  it("admin: any method passes with no error", () => {
    const { nextCalled, nextArg } = run({ role: "admin", method: "POST", url: "/v1/deals" });
    expect(nextCalled).toBe(true);
    expect(nextArg).toBeUndefined();
  });

  it("reader: GET passes", () => {
    const { nextArg } = run({ role: "reader", method: "GET", url: "/v1/deals" });
    expect(nextArg).toBeUndefined();
  });

  it("reader: HEAD and OPTIONS pass", () => {
    expect(run({ role: "reader", method: "HEAD", url: "/v1/deals" }).nextArg).toBeUndefined();
    expect(run({ role: "reader", method: "OPTIONS", url: "/v1/deals" }).nextArg).toBeUndefined();
  });

  it("reader: an unlisted POST is refused with 403 FORBIDDEN", () => {
    const { nextArg } = run({ role: "reader", method: "POST", url: "/v1/deals" });
    expect(nextArg).toMatchObject({ status: 403, code: "FORBIDDEN" });
  });

  it("reader: every allowlisted path is allowed", () => {
    // Allowlist entries are the full "/api/..." pathname (baseUrl + path).
    // run() defaults baseUrl to "/api" itself, so strip it from `url` here or
    // the two would double up into "/api/api/...".
    for (const path of READER_WRITE_METHOD_ALLOWLIST) {
      const url = path.replace(/^\/api/, "");
      const { nextArg } = run({ role: "reader", method: "POST", url });
      expect.soft(nextArg, `expected ${path} to be allowed`).toBeUndefined();
    }
  });

  // This is the test that fails if fullPathname is ever switched to
  // req.originalUrl (which would carry the query string into the comparison).
  it("reader: an allowlisted path with a query string is still allowed", () => {
    const { nextArg } = run({
      role: "reader",
      method: "POST",
      url: "/v2/nlc/parse?debug=1",
    });
    expect(nextArg).toBeUndefined();
  });

  it("reader: a trailing slash on an allowlisted path is still allowed", () => {
    const { nextArg } = run({ role: "reader", method: "POST", url: "/v2/nlc/parse/" });
    expect(nextArg).toBeUndefined();
  });

  it("reader: an uppercase allowlisted path is still allowed", () => {
    const { nextArg } = run({
      role: "reader",
      method: "POST",
      baseUrl: "/API",
      url: "/V2/NLC/Parse",
    });
    expect(nextArg).toBeUndefined();
  });

  it("reader: a path that merely starts with an allowlisted path is refused (exact match, no prefix)", () => {
    expect(
      run({ role: "reader", method: "POST", url: "/v2/nlc/parseX" }).nextArg,
    ).toMatchObject({ status: 403 });
    expect(
      run({ role: "reader", method: "POST", url: "/v2/scenarios/compute-and-save" }).nextArg,
    ).toMatchObject({ status: 403 });
  });

  it("fails closed with 401 if actor is missing (e.g. mounted before requireAuth)", () => {
    const { nextArg } = run({ method: "POST", url: "/v1/deals" });
    expect(nextArg).toMatchObject({ status: 401 });
  });
});
