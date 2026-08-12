/**
 * The routes that render outside the app shell.
 *
 * `/login` is the sign-in page, `/share/:token` the public briefing card, and
 * `/__catalyst` + `/accounts` the Catalyst gateway's own documents — the embedded
 * sign-in iframe, the logout bounce, password recovery. None of them mount
 * `<Layout>` or `MShell`; both shells already route them outside their guards
 * (desktop-app.tsx's plain `<Route>`s, mobile-app.tsx's outer Switch).
 *
 * TWO things key off this list for two different reasons, and one list is what
 * keeps them from drifting:
 *
 *  - **`ShellGate` (App.tsx) must not use a shell skeleton as its Suspense
 *    fallback here.** The desktop skeleton draws a 256px sidebar with seven nav
 *    rows, an avatar and two buttons; the mobile one draws a nav bar and a
 *    four-item tab bar. On a refresh of `/login` that is a fully signed-in app on
 *    screen — measured on the deployed build at 61→342ms, so ~280ms warm and
 *    longer cold — and it reads as "you are already logged in" right before the
 *    sign-in form replaces it. Reported exactly that way.
 *  - **`AppReveal` must not mask them.** A mask over a sign-in form says "still
 *    loading" about the one screen where that is the wrong message; `/share`
 *    resolves no session, so a readiness contract that waits for one would always
 *    run to the ceiling; and painting a full-screen panel over the gateway's own
 *    document is the mistake the service worker's `navigateFallbackDenylist`
 *    exists to prevent, with the same symptom — a sign-in form that is simply not
 *    there.
 *
 * Anchored at `^` and terminated with `(?:[/?]|$)` for the same reason that
 * denylist is: an unanchored `/login` would also match `/deals?ref=/login`, and a
 * bare prefix would match a future `/logindiagnostics`. Both failures are silent.
 */
const ROUTES_OUTSIDE_SHELL = [
  /^\/login(?:[/?]|$)/,
  /^\/share(?:[/?]|$)/,
  /^\/__catalyst(?:[/?]|$)/,
  /^\/accounts(?:[/?]|$)/,
];

/** True when `path` renders no app shell, so no shell chrome should precede it. */
export function isOutsideShell(path: string): boolean {
  return ROUTES_OUTSIDE_SHELL.some((route) => route.test(path));
}

/**
 * The sign-in route specifically — the one route that follows no theme.
 *
 * Narrower than `isOutsideShell` on purpose: `/share/:token` is public but fully
 * themed, so it must keep the reader's own light or dark background. Only sign-in
 * is always dark.
 *
 * Duplicated in index.html's pre-paint script, which cannot import anything this
 * early; theme-flash.test.ts parses the copy there and checks it agrees with this.
 */
export function isSignInRoute(path: string): boolean {
  return /^\/login(?:[/?]|$)/.test(path);
}

/**
 * The colour the sign-in page paints itself, as a literal.
 *
 * `pages/login.tsx` opts out of the theme system and inlines EDC's `.dark`
 * palette, because the Catalyst sign-in iframe is themed by a single static
 * stylesheet that cannot follow the token permutations. This is that page's
 * `--background`, exported so the surface shown BEFORE it loads is the same colour
 * rather than a near-miss — the gap and the page then read as one canvas.
 *
 * Kept here, in an eager module, rather than imported from login.tsx: that page
 * lives in the lazy shell chunk, and importing a constant out of it would pull the
 * whole chunk into the main bundle.
 */
export const SIGN_IN_CANVAS = "hsl(220 10% 8%)";
