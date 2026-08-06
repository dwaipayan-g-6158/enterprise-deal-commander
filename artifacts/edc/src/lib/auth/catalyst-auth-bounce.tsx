import { useEffect } from "react";

/**
 * Catches a Catalyst Web SDK implementation detail that shows up in TWO
 * places: `sdk.auth.signIn()` (catalyst-client.ts), when it finds the visitor
 * already has a valid Zoho identity, and `sdk.auth.signOut()`, on every call.
 * Neither actually performs the real work via a top-level navigation --
 * both just mark the transition with `history.pushState`/`replaceState` to
 * an internal URL (`/__catalyst/{projectId}/auth/signin-redirect?…` for
 * sign-in, `/accounts/p/{zaid}/logout?…` for sign-out) and stop. Confirmed
 * live (AppSail request logs + a direct `fetch` of each URL): these are
 * client-side-only history changes first -- our server never sees a request
 * for them -- and the state change they're marking (a real session existing,
 * or a real session having ended) only actually takes effect once something
 * performs a genuine network hit against that EXACT URL, not just any request
 * to the app. An earlier version of this component reloaded to `/` instead of
 * the marked URL itself, which happened to work for sign-in (that session was
 * already established by the iframe's own real network calls before this
 * ever ran) but silently broke sign-out: `/accounts/.../logout` never
 * actually got requested, so the session stayed alive under a page that
 * looked signed out. Confirmed live by checking `/api/v1/auth/me` after a
 * "successful" sign-out -- still 200.
 *
 * wouter's browser-location hook patches `history.pushState`/`replaceState`
 * globally so it can detect programmatic navigation from any code, not only
 * its own `navigate()`. That's normally the right call, but here it means
 * wouter treats the SDK's internal marker as a real route change: it unmounts
 * whatever was on screen -- including login.tsx's `/auth/me` poll, or
 * whatever page called signOut -- and falls through to the 404 route, since
 * neither `/__catalyst/…` nor `/accounts/…` matches an app route.
 *
 * Registered for both prefixes (ahead of the catch-all) in both
 * desktop-app.tsx and mobile-app.tsx. Forces a real, hard reload of the
 * CURRENT (marked) URL -- a genuine document load against the exact address
 * the SDK left in the bar, which is itself the real network hit that finishes
 * whatever the SDK started. Each of these URLs declares its own landing spot
 * (`login_redirect` in app-config.json for the signin-redirect path,
 * `serviceurl=.../login` for the logout path), so the platform/server itself
 * decides where the browser ends up next -- this component doesn't need to.
 *
 * Sign-in's "already signed in" detection specifically does NOT, by itself,
 * establish a working app session on its own marker URL alone in every case
 * (confirmed live during earlier debugging) -- so without a guard, an
 * unauthenticated visitor whose `/login` mount re-triggers it could loop:
 * `/` bounces to `/login`, `/login` re-triggers the SDK's redirect, this
 * component reloads that URL, its own redirect lands back on `/`, repeat.
 * The sessionStorage guard below makes each PATH KIND a one-shot rather than
 * sharing a single guard across both -- so a sign-out later in the same tab
 * isn't silently swallowed by a guard a sign-in bounce already spent, and
 * vice versa. First occurrence of a given kind forces the reload; any repeat
 * of that same kind in the same tab renders nothing and lets the normal 404
 * stand rather than loop silently.
 */
const GUARD_KEYS = {
  accounts: "edc.catalystAuthBounce.attempted.accounts",
  catalyst: "edc.catalystAuthBounce.attempted.catalyst",
} as const;

export type AuthBounceKind = keyof typeof GUARD_KEYS;

function kindFor(pathname: string): AuthBounceKind {
  // No trailing slash: a bare "/accounts" was previously misclassified as the
  // "catalyst" kind and would spend the wrong one-shot.
  return pathname.startsWith("/accounts") ? "accounts" : "catalyst";
}

/**
 * Hands a given path kind a fresh one-shot.
 *
 * The guard above exists to break the SIGN-IN loop described in the module
 * docstring, where nothing user-initiated is happening and each pass re-enters
 * through the same marker. Sign-OUT reuses this component but is always a
 * deliberate click and can never be a loop, so it must not inherit a one-shot
 * that an earlier sign-out in this tab already spent — sessionStorage survives
 * `location.replace`, so without this the SECOND sign-out of a tab (sign out,
 * sign back in, sign out again) skipped the reload that actually performs the
 * logout and stranded the user on the 404 route with a live session. That was
 * latent until the service-worker fix (vite.config.ts's
 * navigateFallbackDenylist) made the first sign-out work at all. Called from
 * useSignOut(), the single funnel every sign-out goes through.
 */
export function resetAuthBounceGuard(kind: AuthBounceKind): void {
  try {
    sessionStorage.removeItem(GUARD_KEYS[kind]);
  } catch {
    // Private-mode storage can throw; losing the reset only costs this
    // sign-out its one-shot, which is the pre-existing behaviour.
  }
}

export function CatalystAuthBounce() {
  useEffect(() => {
    const key = GUARD_KEYS[kindFor(window.location.pathname)];
    if (sessionStorage.getItem(key)) return;
    sessionStorage.setItem(key, "1");
    // Reload the marked URL itself (not "/") -- see the module docstring for
    // why the exact address matters here, not just "some request to the app".
    window.location.replace(window.location.href);
  }, []);
  return null;
}
