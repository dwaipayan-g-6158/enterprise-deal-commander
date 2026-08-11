import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  CONTENT_SECURITY_POLICY,
  buildContentSecurityPolicy,
  inlineScriptHashes,
  securityHeaders,
} from "./security-headers";
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

/**
 * The SPA's inline pre-paint script, and the policy that has to admit it.
 *
 * This is the regression these tests exist for. `script-src 'self'` does not
 * cover inline script, so for as long as index.html has carried its pre-paint
 * theme stamp, that script was BLOCKED on the deployed app — dark mode flashed
 * white on every launch and the doc comment in the module under test asserted
 * there were no inline scripts to worry about. Nothing failed loudly: locally the
 * SPA is served by Vite on its own port and never sees this header, so the only
 * symptom lived in a deployed browser's console.
 *
 * What follows checks the mechanism (hashes are derived, correctly formed, and
 * reach the directive) rather than pinning a hash value. A pinned value is the
 * trap: a CSP hash covers the script's exact bytes including line endings, and
 * this repo's working tree is CRLF while its git blobs are LF, so the two hash
 * differently and either literal would break on a checkout normalised the other
 * way — invisibly, because the source would still look correct.
 */
describe("the inline pre-paint script", () => {
  /** The real file, so this tracks whatever index.html actually says today. */
  const INDEX_HTML = readFileSync(
    join(import.meta.dirname, "..", "..", "..", "edc", "index.html"),
    "utf8",
  );

  it("still exists in index.html, and still has to be inline", () => {
    // If this ever legitimately goes away, the hash plumbing can go with it.
    // Until then it is load-bearing: it applies the theme class and the time band
    // before the first paint, which is why it cannot be a src= file.
    expect(INDEX_HTML).toMatch(/<script>[\s\S]*localStorage\.getItem\("theme"\)/);
  });

  it("is hashed, so script-src can admit it without 'unsafe-inline'", () => {
    const hashes = inlineScriptHashes(INDEX_HTML);
    expect(hashes).toHaveLength(1);
    expect(hashes[0]).toMatch(/^'sha256-[A-Za-z0-9+/]{43}='$/);
  });

  it("hashes the script body verbatim, because anything else never matches", () => {
    // Trimming, re-indenting or normalising newlines all produce a hash the
    // browser will not recognise, and the failure is silent.
    const body = INDEX_HTML.match(/<script>([\s\S]*?)<\/script>/)![1];
    const expected = createHash("sha256").update(body, "utf8").digest("base64");
    expect(inlineScriptHashes(INDEX_HTML)[0]).toBe(`'sha256-${expected}'`);
  });

  it("ignores scripts with a src, which 'self' already covers", () => {
    // index.html's module entry is one of these. Hashing an external script's
    // empty body would whitelist every empty inline script on the origin.
    expect(INDEX_HTML).toMatch(/<script[^>]+\bsrc=/);
    const external = inlineScriptHashes('<script type="module" src="/src/main.tsx"></script>');
    expect(external).toEqual([]);
  });

  it("puts the hash in script-src and nowhere else", () => {
    const csp = buildContentSecurityPolicy(inlineScriptHashes(INDEX_HTML));
    const scriptSrc = csp.split("; ").find((d) => d.startsWith("script-src "))!;
    expect(scriptSrc).toContain("'sha256-");
    // One directive, one purpose. A hash loose in style-src or default-src would
    // be silently ignored and read as coverage that isn't there.
    expect(csp.split("'sha256-")).toHaveLength(2);
  });

  it("still refuses 'unsafe-inline' once a hash is present", () => {
    // The easy fix, and the wrong one: it would admit every injected <script> on
    // the origin to permit one known function. Browsers also ignore
    // 'unsafe-inline' when a hash is present, so the two cannot quietly coexist.
    const csp = buildContentSecurityPolicy(inlineScriptHashes(INDEX_HTML));
    const scriptSrc = csp.split("; ").find((d) => d.startsWith("script-src "))!;
    expect(scriptSrc).not.toContain("unsafe-inline");
    expect(scriptSrc).not.toContain("unsafe-eval");
  });

  it("carries no hashes when there is no SPA to serve", () => {
    // Local dev: Vite hosts the frontend, this server emits only JSON, and a
    // hash for a script it never sends would be noise.
    expect(CONTENT_SECURITY_POLICY).not.toContain("sha256-");
  });
});
