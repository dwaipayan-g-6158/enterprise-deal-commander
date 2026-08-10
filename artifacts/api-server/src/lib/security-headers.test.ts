import { describe, expect, it } from "vitest";
import { CONTENT_SECURITY_POLICY, securityHeaders } from "./security-headers";
import type { Request, Response, NextFunction } from "express";

function directive(name: string): string | undefined {
  return CONTENT_SECURITY_POLICY.split("; ")
    .find((d) => d.startsWith(`${name} `) || d === name)
    ?.slice(name.length + 1);
}

function runMiddleware() {
  const headers: Record<string, string> = {};
  const res = { setHeader: (k: string, v: string) => void (headers[k] = v) } as unknown as Response;
  let nexted = false;
  securityHeaders({} as Request, res, (() => void (nexted = true)) as NextFunction);
  return { headers, nexted };
}

describe("security headers", () => {
  it("sets the three the Catalyst gateway does not", () => {
    // The gateway already sends HSTS, X-Content-Type-Options and
    // X-Frame-Options — verified against the deployed app. Re-sending them here
    // would risk two conflicting values on one response.
    const { headers, nexted } = runMiddleware();
    expect(Object.keys(headers).sort()).toEqual([
      "Content-Security-Policy",
      "Permissions-Policy",
      "Referrer-Policy",
    ]);
    expect(nexted).toBe(true);
  });

  it("does not duplicate what the gateway already sends", () => {
    const { headers } = runMiddleware();
    for (const gateway of ["Strict-Transport-Security", "X-Content-Type-Options", "X-Frame-Options"]) {
      expect(headers[gateway], gateway).toBeUndefined();
    }
  });

  it("keeps a deal id out of outbound Referer headers", () => {
    // Deal URLs carry an id and sign-in redirects to Zoho. This sends the full
    // path same-origin and only the bare origin cross-origin.
    expect(runMiddleware().headers["Referrer-Policy"]).toBe("strict-origin-when-cross-origin");
  });
});

describe("the content security policy", () => {
  /**
   * Every origin below was observed loading on the deployed `/login` before the
   * policy was written. A CSP derived from reading the source instead is how you
   * discover in production that sign-in needed one more host.
   */
  it("allows the Catalyst web SDK, without which there is no way to sign in", () => {
    expect(directive("script-src")).toContain("https://static.zohocdn.com");
  });

  it("allows the Google Fonts stylesheet and the font files separately", () => {
    // Two different origins; allowing only one silently drops the typeface.
    expect(directive("style-src")).toContain("https://fonts.googleapis.com");
    expect(directive("font-src")).toContain("https://fonts.gstatic.com");
  });

  it("allows the same-origin sign-in iframe to be embedded", () => {
    expect(directive("frame-src")).toBe("'self'");
  });

  it("allows inline style attributes, which React and vaul both require", () => {
    // login.tsx sets safe-area padding inline and vaul positions every sheet
    // inline. Removing this renders the app unstyled where it matters most.
    expect(directive("style-src")).toContain("'unsafe-inline'");
  });

  it("never allows eval or inline script", () => {
    // The one relaxation that would make the whole policy decorative.
    expect(directive("script-src")).not.toContain("unsafe-eval");
    expect(directive("script-src")).not.toContain("unsafe-inline");
  });

  it("locks down the directives an injection would reach for", () => {
    expect(directive("object-src")).toBe("'none'");
    expect(directive("base-uri")).toBe("'self'");
    expect(directive("form-action")).toBe("'self'");
    expect(directive("frame-ancestors")).toBe("'none'");
  });

  it("defaults to self, so a directive nobody thought of still fails closed", () => {
    expect(directive("default-src")).toBe("'self'");
  });

  it("lets the service worker and the manifest load", () => {
    // default-src would cover both, but a later widening of default-src should
    // not silently widen these too.
    expect(directive("worker-src")).toBe("'self'");
    expect(directive("manifest-src")).toBe("'self'");
  });
});
