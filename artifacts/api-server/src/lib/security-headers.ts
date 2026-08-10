import type { Request, Response, NextFunction } from "express";

/**
 * The origins the app actually loads from.
 *
 * Measured, not assumed: every request the deployed `/login` makes was captured
 * in a browser before this policy was written, because a CSP guessed from the
 * source tree is exactly how you take sign-in down.
 *
 * - `static.zohocdn.com` serves `catalystWebSDK.js`, which `login.tsx` loads to
 *   render the embedded sign-in widget. Without it there is no way into the app.
 * - Google Fonts serves the Geist stylesheet (`fonts.googleapis.com`) and the
 *   woff2 files it points at (`fonts.gstatic.com`), which are separate origins.
 */
const ZOHO_CDN = "https://static.zohocdn.com";
const FONT_CSS = "https://fonts.googleapis.com";
const FONT_FILES = "https://fonts.gstatic.com";

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
 * `script-src` does NOT include `'unsafe-eval'` or `'unsafe-inline'`. The SPA is
 * a Vite build with no inline scripts in index.html, and both the app bundle and
 * the Catalyst SDK were verified to run without eval against the deployed build.
 * If a future Zoho SDK needs it, add it deliberately with a note — do not widen
 * the whole directive.
 *
 * `frame-ancestors 'none'` matches the `X-Frame-Options: DENY` the gateway
 * already sends; stating it here is what makes it apply in browsers that have
 * dropped the older header.
 */
const CSP = [
  "default-src 'self'",
  `script-src 'self' ${ZOHO_CDN}`,
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
export function securityHeaders(_req: Request, res: Response, next: NextFunction): void {
  res.setHeader("Content-Security-Policy", CSP);
  res.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");
  res.setHeader("Permissions-Policy", "camera=(), microphone=(), geolocation=(), payment=(), usb=()");
  next();
}

/** Exported for the test that pins the directives against the measured origins. */
export const CONTENT_SECURITY_POLICY = CSP;
