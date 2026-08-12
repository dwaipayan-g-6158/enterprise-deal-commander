import { createHash } from "node:crypto";
import type { Request, RequestHandler, Response, NextFunction } from "express";

/**
 * The origins the app actually loads from.
 *
 * Measured, not assumed: every request the deployed `/login` makes was captured
 * in a browser before this policy was written, because a CSP guessed from the
 * source tree is exactly how you take sign-in down.
 *
 * - `static.zohocdn.com` serves `catalystWebSDK.js`, which `login.tsx` loads to
 *   render the embedded sign-in widget. Without it there is no way into the app.
 * - Google Fonts, for the SIGN-IN IFRAME only. The app itself no longer touches
 *   either origin — Geist and Geist Mono ship from `public/fonts` (see
 *   `artifacts/edc/scripts/sync-fonts.mjs`) — but `public/login-iframe.css`
 *   still `@import`s the googleapis stylesheet for the embedded widget, and
 *   `fonts.gstatic.com` is the separate origin that sheet points at.
 *
 *   These two are therefore listed more broadly than the parent page needs.
 *   Tightening them is deliberately NOT bundled with the self-hosting change:
 *   the iframe's own document is answered by the Catalyst gateway and carries
 *   the gateway's policy rather than this one, so whether removing them has any
 *   effect at all can only be settled by driving the deployed sign-in flow.
 *   Until that is measured, listing an origin the parent never calls is a
 *   smaller mistake than un-theming sign-in.
 */
const ZOHO_CDN = "https://static.zohocdn.com";
const FONT_CSS = "https://fonts.googleapis.com";
const FONT_FILES = "https://fonts.gstatic.com";

/**
 * Extracts a CSP `'sha256-...'` token for every INLINE `<script>` in an HTML
 * document, so `script-src` can allow exactly those and nothing else.
 *
 * ## Why this is computed at runtime instead of pinned as a constant
 *
 * `index.html` carries one inline script — the pre-paint theme and time-band
 * stamp — and it has to be inline: it must run before the first paint, and a
 * `src=` would make it a network round trip (theme-flash.test.ts asserts that it
 * stays inline for exactly this reason). But `script-src 'self'` does not cover
 * inline script, so under the policy below that script was silently BLOCKED on
 * the deployed app: dark mode flashed a white screen on every launch, and the
 * doc comment here used to claim there were no inline scripts to worry about.
 *
 * Nothing failed loudly. Locally the SPA is served by Vite on its own port and
 * never sees this header at all, so the only symptom was a console entry on a
 * deployed build.
 *
 * A hard-coded hash would have re-introduced the same class of silent failure
 * from a different direction: a CSP hash covers the script's exact bytes, and
 * the bytes include its line endings. Measured on this repo — the working-tree
 * file is CRLF and the git blob is LF, and the two hash differently. Pinning
 * either one means any checkout normalised the other way blocks the script again,
 * with no test able to catch it because the source still looks right.
 *
 * Reading the file the server is actually about to serve removes the question.
 * It costs one read at startup and cannot disagree with reality.
 *
 * ## …but the served BYTES are not what the browser hashes
 *
 * Reading the served file is necessary and was not sufficient, and this is the
 * part that kept the script blocked. A CSP hash is computed over the script
 * element's **child text content in the DOM**, not over the bytes on the wire —
 * and the HTML parser's input-stream preprocessing has already rewritten every
 * CRLF (and every lone CR) to a single LF before that text exists. So a CRLF file
 * hashes one way on disk and another way in the browser, always.
 *
 * Measured on the deployed app: the header carried
 * `sha256-Bqx36o5HnFsNVFnU/kSIfymFvqsC8oKwwcpIeuPrseU=` — a faithful hash of the
 * served CRLF bytes — while Chrome computed
 * `sha256-G9iEZuP1TUUgdsNpadTDmJqTMRTw3TGjtn4H6X+Uj8I=` from the parsed text and
 * refused the script. Windows builds are CRLF because git checks out that way, so
 * this affected every deploy from this host: the pre-paint theme stamp never ran,
 * and dark mode went back to flashing white on launch — the exact bug that script
 * exists to prevent, reintroduced by the policy meant to protect it. Nothing
 * failed loudly; local dev never sees this header at all.
 *
 * Hence the newline normalisation below. It is not cosmetic tidying of the input —
 * it is reproducing a step the parser performs, which is the only way to predict
 * what the browser will hash.
 *
 * Scripts with a `src` are skipped: those are covered by `'self'` already, and
 * hashing an external script's (empty) body would allow every empty inline
 * script on the origin.
 */
export function inlineScriptHashes(html: string): string[] {
  const hashes: string[] = [];

  for (const match of html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi)) {
    const [, attributes, body] = match;
    if (/\bsrc\s*=/i.test(attributes)) continue;
    // Exactly the HTML input-stream preprocessing rule: CRLF -> LF, then any
    // remaining lone CR -> LF. Nothing else is touched — no trimming, no
    // whitespace collapsing — because the parser does nothing else either, and
    // anything extra would produce a hash that never matches.
    const asParsed = body.replace(/\r\n?/g, "\n");
    hashes.push(`'sha256-${createHash("sha256").update(asParsed, "utf8").digest("base64")}'`);
  }

  return hashes;
}

/**
 * Content-Security-Policy for everything this server serves.
 *
 * ## What this does and does not cover
 *
 * Only responses that reach Express. The Catalyst gateway answers `/accounts/*`
 * and `/__catalyst/*` itself — including the sign-in iframe's own document,
 * which pulls a dozen more `static.zohocdn.com` assets. That document carries
 * whatever policy the gateway sets; this one governs the parent page, so it
 * needs `frame-src 'self'` to be allowed to embed it (the iframe src is
 * same-origin) and nothing more.
 *
 * ## The two relaxations, and why each is not negotiable
 *
 * `style-src` keeps `'unsafe-inline'`. React writes inline `style` attributes —
 * `login.tsx` sets its safe-area padding that way, vaul positions every sheet
 * that way, and the mobile shell's ambient wash is an inline background-image.
 * Without it the app renders unstyled in the places that matter most. Inline
 * style ATTRIBUTES are what is being allowed here; there is still no path for
 * an injected `<style>` element to load remote CSS, since only the two font
 * origins are listed.
 *
 * `script-src` does NOT include `'unsafe-eval'` or `'unsafe-inline'`, and it must
 * not: those are the two relaxations that would make the whole policy decorative.
 * Both the app bundle and the Catalyst SDK were verified to run without eval
 * against the deployed build. If a future Zoho SDK needs it, add it deliberately
 * with a note — do not widen the whole directive.
 *
 * index.html's one inline script is allowed by HASH instead, passed in by the
 * caller — see `inlineScriptHashes` above for why that is derived from the served
 * file rather than pinned. `'unsafe-inline'` would have been the easy fix and is
 * the wrong one: it allows every injected `<script>` on the origin in order to
 * permit one known thirty-line function.
 *
 * (A hash in `script-src` also makes browsers ignore `'unsafe-inline'` if one is
 * ever added, which is a useful ratchet: the two cannot silently coexist.)
 *
 * `frame-ancestors 'none'` matches the `X-Frame-Options: DENY` the gateway
 * already sends; stating it here is what makes it apply in browsers that have
 * dropped the older header.
 */
export function buildContentSecurityPolicy(scriptHashes: readonly string[] = []): string {
  return [
    "default-src 'self'",
    ["script-src 'self'", ZOHO_CDN, ...scriptHashes].join(" "),
    `style-src 'self' 'unsafe-inline' ${FONT_CSS}`,
    `font-src 'self' data: ${FONT_FILES}`,
    "img-src 'self' data: blob:",
    `connect-src 'self' ${ZOHO_CDN}`,
    // The embedded sign-in widget, which is served from this same origin.
    "frame-src 'self'",
    "worker-src 'self'",
    "manifest-src 'self'",
    "base-uri 'self'",
    "form-action 'self'",
    "object-src 'none'",
    "frame-ancestors 'none'",
  ].join("; ");
}

/**
 * Security headers the Catalyst gateway does not already set.
 *
 * The gateway supplies `Strict-Transport-Security`, `X-Content-Type-Options:
 * nosniff` and `X-Frame-Options: DENY` on its own — verified against the
 * deployed app rather than assumed — so this adds only what was missing.
 *
 * `Referrer-Policy` matters more than it looks here: deal URLs carry an id, and
 * the sign-in flow redirects to Zoho. `strict-origin-when-cross-origin` sends
 * the full path same-origin and only the bare origin outward, so a deal id never
 * leaves in a Referer header.
 *
 * `Permissions-Policy` denies the hardware this app has no use for. It is a
 * deny-list of capabilities, not a feature.
 */
export function createSecurityHeaders(csp: string): RequestHandler {
  return function securityHeaders(_req: Request, res: Response, next: NextFunction): void {
    res.setHeader("Content-Security-Policy", csp);
    res.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");
    res.setHeader(
      "Permissions-Policy",
      "camera=(), microphone=(), geolocation=(), payment=(), usb=()",
    );
    next();
  };
}

/**
 * The policy with no inline-script hashes in it.
 *
 * This is the honest default for a server with no SPA to serve — the local dev
 * setup, where Vite hosts the frontend on its own port. app.ts adds the hashes
 * when `dist/public/index.html` exists, which is the only situation in which this
 * server sends HTML with a script in it.
 */
export const CONTENT_SECURITY_POLICY = buildContentSecurityPolicy();

/** Exported for the test that pins the directives against the measured origins. */
export const securityHeaders = createSecurityHeaders(CONTENT_SECURITY_POLICY);
