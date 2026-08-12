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
