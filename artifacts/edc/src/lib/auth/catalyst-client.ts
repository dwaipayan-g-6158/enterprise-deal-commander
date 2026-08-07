// Wrapper around the Catalyst Web SDK (window.catalyst) for Native Auth's
// embedded sign-in iframe. Modeled directly on the sibling
// Customer-Insight-Engine ("Periscope") project's lib/catalyst-client.ts,
// which has run this exact pattern in production for months.
//
// EDC is single-origin AppSail (BASE_PATH `/`, same as Periscope) — the Web
// SDK script + Catalyst's own platform-served `/__catalyst/sdk/init.js` are
// loaded dynamically at runtime rather than as `<script>` tags in
// index.html, so nothing here needs to branch on environment: `init.js` is
// intercepted at the Catalyst gateway level (even though this Express app
// never defines that route) and always resolves the correct project/zaid/org
// config for whichever domain actually served the page.

import { isCatalystSdkReady } from "./catalyst-sdk-state";

declare global {
  interface Window {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    catalyst?: any;
  }
}

// Matches the version the EDC Catalyst project's own console currently
// generates for "Embedded Authentication Type" (Cloud Scale → Authentication
// → Authentication Type → v4) — verified live, not guessed.
const CDN_URL = "https://static.zohocdn.com/catalyst/sdk/js/4.6.2/catalystWebSDK.js";
const INIT_URL = "/__catalyst/sdk/init.js";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let loadPromise: Promise<any> | null = null;

function loadScript(src: string): Promise<void> {
  return new Promise((resolve, reject) => {
    if (document.querySelector(`script[src="${src}"]`)) {
      resolve();
      return;
    }
    const s = document.createElement("script");
    s.src = src;
    s.async = false; // preserve execution order for dynamically-inserted scripts
    s.onload = () => resolve();
    s.onerror = () => {
      // Drop the failed tag before rejecting. The early-return above treats a
      // present tag as already-loaded, so leaving a 404'd one in the head
      // would make the sign-in page's retry resolve instantly against a
      // script that never executed, instead of re-requesting it.
      s.remove();
      reject(new Error(`Failed to load ${src}`));
    };
    document.head.appendChild(s);
  });
}

// How long to wait for init.js to populate `window.catalyst` after both
// script tags have loaded.
const SDK_READY_TIMEOUT_MS = 3000;

/**
 * Loads the Web SDK + the platform's own init script, and waits for the SDK
 * to become genuinely usable before resolving.
 *
 * Rejects — rather than resolving with a half-initialized handle — when
 * `init.js` doesn't land. That script is served by the Catalyst AppSail
 * gateway and exists nowhere else, so off the deployed domain (localhost, a
 * preview host) this is the *expected* path, not a rare edge case. It has to
 * surface as an error the caller can render, because the CDN script alone
 * leaves `window.catalyst.auth` present but inert: the previous guard tested
 * only `!window.catalyst?.auth`, passed on that inert object, and let
 * `signIn()` run against an uninitialized SDK — which renders nothing at all
 * and left the sign-in card silently blank. `isCatalystSdkReady` is the same
 * condition the wait loop below polls on, so the two can no longer disagree.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function loadCatalystSDK(): Promise<any> {
  if (loadPromise) return loadPromise;
  const attempt = (async () => {
    if (typeof window === "undefined") throw new Error("SSR not supported");
    await loadScript(CDN_URL);
    await loadScript(INIT_URL);
    const start = Date.now();
    while (!isCatalystSdkReady(window.catalyst) && Date.now() - start < SDK_READY_TIMEOUT_MS) {
      await new Promise((r) => setTimeout(r, 50));
    }
    if (!isCatalystSdkReady(window.catalyst)) {
      throw new Error("Catalyst Web SDK failed to initialize");
    }
    return window.catalyst;
  })();
  // A failed attempt must not be memoized: the sign-in page offers a retry,
  // and re-awaiting this same rejected promise would fail instantly forever
  // no matter how the underlying problem (offline, blocked CDN, gateway
  // hiccup) resolved in the meantime.
  loadPromise = attempt.catch((err: unknown) => {
    loadPromise = null;
    throw err;
  });
  return loadPromise;
}

/**
 * Renders the embedded Catalyst email/password sign-in form into the given element id.
 *
 * Deliberately passes no `service_url`, after two rounds of live testing
 * settled the question:
 *
 *  1. First attempt (present, pointed at our own origin `/`, matching
 *     Periscope): caused "refused to connect" inside the iframe --
 *     `X-Frame-Options: deny` on our own root document blocked it. Turned
 *     out to be a red herring layered on top of a real gap: `app-config.json`
 *     was missing `catalyst_auth`/`login_redirect` (now set).
 *  2. Second attempt (removed, to work around #1): the SDK's "already signed
 *     in" fast path had nowhere to send the top-level window, so it marked
 *     the transition with a `history.pushState` to its own internal
 *     `/__catalyst/{projectId}/auth/signin-redirect` URL instead -- a
 *     client-side-only marker our router doesn't recognize. Now handled by
 *     `CatalystAuthBounce` (registered in desktop-app.tsx/mobile-app.tsx),
 *     which forces a real reload back to `/` whenever that marker (or the
 *     equivalent `/accounts/*` one `signOut` produces) appears.
 *  3. With `service_url` present AND `catalyst_auth`/`CatalystAuthBounce` in
 *     place: a *different*, confirmed-live bug -- the iframe successfully
 *     loads `service_url` (our own `/`), which (unauthenticated) client-side
 *     redirects to `/login`, which mounts this exact component again and
 *     renders a *second* sign-in iframe nested inside the first. Recursive,
 *     not just cosmetic: the inner iframe never receives real user input.
 *
 * Omitting it avoids #1 and #3 outright, and #2 is a solved problem now that
 * CatalystAuthBounce exists -- this page's own `/auth/me` polling loop (see
 * login.tsx) independently handles navigating away once a session exists,
 * so nothing depends on the SDK's own post-signin redirect completing.
 */
export async function renderSignInForm(elementId: string): Promise<void> {
  const sdk = await loadCatalystSDK();
  // `css_url` is the primary theming path (public/login-iframe.css): Zoho
  // fetches it itself, so it lands before the frame's first paint instead of
  // flashing an unstyled white panel. Note the SDK treats it as a REPLACEMENT
  // for its own embedded_signin.css, which is why that sheet is @imported at
  // the top of ours — without it the form loses Zoho's step toggles.
  //
  // Absolute URL because the frame resolves it against its own origin.
  // Still NO `service_url` — see the three live-tested failures above.
  const css_url = `${window.location.origin}/login-iframe.css`;
  await sdk.auth.signIn(elementId, { css_url });
}

/**
 * Sign out via the Web SDK directly (no server route — see routes/auth.ts's
 * docstring for why one no longer exists), landing back on /login.
 */
export async function catalystSignOut(): Promise<void> {
  try {
    const sdk = await loadCatalystSDK();
    await sdk.auth.signOut(`${window.location.origin}/login`);
  } catch {
    window.location.href = `${window.location.origin}/login`;
  }
}
