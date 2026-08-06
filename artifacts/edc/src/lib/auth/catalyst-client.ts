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
    s.onerror = () => reject(new Error(`Failed to load ${src}`));
    document.head.appendChild(s);
  });
}

/**
 * Loads the Web SDK + the platform's own init script exactly once, and
 * waits for `window.catalyst.auth` to become available before resolving.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function loadCatalystSDK(): Promise<any> {
  if (loadPromise) return loadPromise;
  loadPromise = (async () => {
    if (typeof window === "undefined") throw new Error("SSR not supported");
    await loadScript(CDN_URL);
    await loadScript(INIT_URL);
    const start = Date.now();
    while (
      (!window.catalyst || typeof window.catalyst.auth?.signIn !== "function") &&
      Date.now() - start < 3000
    ) {
      await new Promise((r) => setTimeout(r, 50));
    }
    if (!window.catalyst?.auth) throw new Error("Catalyst Web SDK failed to initialize");
    return window.catalyst;
  })();
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
  await sdk.auth.signIn(elementId, {});
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
