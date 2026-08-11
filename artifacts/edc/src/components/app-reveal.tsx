import { useCallback, useEffect, useRef, useState } from "react";
import { useIsFetching } from "@tanstack/react-query";
import { useLocation } from "wouter";

/**
 * Long enough that a warm refresh reads as one deliberate movement rather than a
 * flicker, short enough that nobody waits on it. Both shells reach first content
 * inside this on a warm load, so in the common case the floor — not the readiness
 * contract — is what decides when the page appears.
 */
const FLOOR_MS = 250;

/**
 * Hard ceiling. The mask lifts on this no matter what the network is doing.
 *
 * This is the load-bearing number. Every screen underneath already has its own
 * skeleton and its own live region, so a slow read costs a reader a plainer first
 * frame; a mask without a ceiling would cost them the app. Same contract
 * BootSplash's MAX_VISIBLE_MS states for the same reason.
 */
const CEILING_MS = 1200;

/** Must match the .app-reveal transition duration in index.css. */
const FADE_MS = 200;

/**
 * Routes that must never be covered.
 *
 * `/__catalyst` and `/accounts` are the Catalyst gateway's namespaces — the
 * embedded sign-in iframe, the logout bounce, password recovery. Painting a
 * full-screen panel over Zoho's own document is the same class of mistake the
 * service worker's `navigateFallbackDenylist` exists to prevent (vite.config.ts),
 * and the symptom would look identical: a sign-in form that is simply not there.
 *
 * `/login` is exempt because of the redirect path rather than the direct one. A
 * resolved-but-sessionless refresh lands here via useAuthGuard's redirect, and a
 * mask that held through that bounce would show someone a veiled sign-in form —
 * the one screen where "the app is still loading" is the wrong message.
 *
 * `/share/:token` is public and never resolves a session, so a contract that
 * waits on one would always run to the ceiling.
 *
 * Anchored at ^ and terminated with (?:[/?]|$) for the same reason the service
 * worker's denylist is: an unanchored /login/ would also match /deals?ref=/login,
 * and a bare prefix would match a future /logindiagnostics.
 */
const EXEMPT_ROUTES = [
  /^\/login(?:[/?]|$)/,
  /^\/share(?:[/?]|$)/,
  /^\/__catalyst(?:[/?]|$)/,
  /^\/accounts(?:[/?]|$)/,
];

export function isExemptRoute(path: string): boolean {
  return EXEMPT_ROUTES.some((route) => route.test(path));
}

function prefersReducedMotion(): boolean {
  return window.matchMedia?.("(prefers-reduced-motion: reduce)").matches === true;
}

function fontsAlreadyLoaded(): boolean {
  // No FontFaceSet (old Safari, jsdom) means nothing to wait for. Treating that
  // as "not ready" would hold every such browser to the ceiling.
  return typeof document.fonts === "undefined" || document.fonts.status === "loaded";
}

/**
 * The boot mask: an opaque canvas over the app until the app is worth looking at,
 * then a short cross-fade.
 *
 * ## What this is actually for
 *
 * A browser refresh used to expose the whole reconstruction. On the Command page
 * that meant, in order: a bare body, the lazy shell chunk's Suspense skeleton, the
 * auth guard's skeleton, the page's own differently-shaped skeleton, and then
 * fifteen widgets each swapping their own placeholder for content as their own
 * query landed. Every hop is a real DOM change at slightly different geometry, so
 * the page visibly assembled itself for about a second.
 *
 * Masking is only half the answer and deliberately so — a mask over churn just
 * relocates the churn to the moment it lifts. The other half is that the churn
 * itself got smaller: the theme and time band now land before the first paint
 * (index.html), the 2s background tween can no longer run during boot (index.css),
 * the fonts are same-origin and preloaded, and the shifters at the top of the
 * dashboard reserve their resolved height. This component covers what is left.
 *
 * ## Why a React component is enough to cover the first frame
 *
 * It does not need to exist before React mounts. Everything before React's first
 * commit is a bare `body`, and body already carries the final `--background` —
 * theme class and time band are both stamped by index.html's pre-paint script.
 * So the sequence is: correct empty canvas, then this panel in the same colour
 * (painted in the same commit as the first shell content, so the content is never
 * visible under it), then a fade to the built page. There is no colour cut and no
 * gap to cover with static markup.
 *
 * ## Why it does not coordinate with BootSplash
 *
 * It does not have to, and the reason is worth stating so nobody adds the wiring.
 * BootSplash sits at z-[100] and is opaque; this is at z-[95]. On a cold launch in
 * the installed app BootSplash is already covering the screen, its floor (1450ms)
 * outlasts this ceiling (1200ms), so this panel's entire fade happens underneath
 * something opaque and is never seen. BootSplash then performs the only visible
 * reveal. In a browser tab, or under reduced motion, BootSplash renders nothing
 * and this does the work alone. Neither needs to know about the other, and
 * importing boot-splash.tsx here would pull the whole mobile chunk into the main
 * bundle to learn something the z-order already settles.
 */
export function AppReveal() {
  const [location] = useLocation();

  // Read once, at mount. This is a boot mask; a route change later must not
  // resurrect it, and re-evaluating the exemption on every navigation would do
  // exactly that when someone moves from /login into the app.
  const [phase, setPhase] = useState<"masking" | "leaving" | "gone">(() =>
    isExemptRoute(location) ? "gone" : "masking",
  );
  const [floorElapsed, setFloorElapsed] = useState(() => prefersReducedMotion());
  const [fontsReady, setFontsReady] = useState(fontsAlreadyLoaded);

  /**
   * Offline is a decision, not a pending state — the same judgement
   * use-auth-guard.ts makes, and it has to be made here too. Offline, the session
   * query is disabled and the screens render from the service worker's cache, so
   * no fetch ever starts and the data half of the contract below can never be
   * satisfied. Without this the offline launch would sit behind a blank panel for
   * the full ceiling, which is the one case where the app was ready immediately.
   */
  const [offline] = useState(() => typeof navigator !== "undefined" && !navigator.onLine);

  const inFlight = useIsFetching();

  /**
   * `useIsFetching() === 0` is true at TWO different moments, and only the second
   * one means anything: before the first query has started, and after the last one
   * has finished. The first zero arrives before the lazy shell chunk has even
   * downloaded — every query in this app lives inside that chunk, so at the moment
   * this component first renders there is nothing fetching and nothing mounted to
   * fetch. Lifting on that would reveal the empty shell and defeat the whole
   * exercise.
   *
   * So the condition is "has been busy, and is now quiet" rather than "is quiet".
   * BootSplash reads the same signal and gets away with the naive form only
   * because its 1450ms floor outlasts the pre-flight zero.
   */
  const sawFetching = useRef(false);
  useEffect(() => {
    if (inFlight > 0) sawFetching.current = true;
  }, [inFlight]);

  const leftRef = useRef(false);
  const leave = useCallback(() => {
    if (leftRef.current) return;
    leftRef.current = true;
    // Set here rather than after the fade: this is what re-enables the 2s
    // background-color tween (index.css, mobile/styles/material.css), and the
    // band crossing it exists for cannot happen inside a 200ms fade. Setting it
    // late would leave a window where a real band change stepped instantly.
    document.documentElement.setAttribute("data-app-ready", "");
    setPhase(prefersReducedMotion() ? "gone" : "leaving");
  }, []);

  // Exempt route at mount: nothing to reveal, but the app still has to be told
  // boot is over or the ambient tween stays disabled for the whole session.
  useEffect(() => {
    if (phase === "gone") leave();
  }, [phase, leave]);

  useEffect(() => {
    if (phase !== "masking") return;
    const floor = setTimeout(() => setFloorElapsed(true), FLOOR_MS);
    const ceiling = setTimeout(leave, CEILING_MS);
    return () => {
      clearTimeout(floor);
      clearTimeout(ceiling);
    };
  }, [phase, leave]);

  useEffect(() => {
    if (typeof document.fonts === "undefined") return;
    let cancelled = false;
    // Fonts matter here because the alternative is revealing a page in the
    // fallback face and letting it relay out afterwards — the exact shift the
    // self-hosting change removed from the critical path. They are preloaded and
    // precached, so this resolves almost immediately in every case but a genuinely
    // cold first visit; the ceiling covers that one.
    void document.fonts.ready.then(() => {
      if (!cancelled) setFontsReady(true);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (phase !== "masking" || !floorElapsed || !fontsReady) return;
    const dataSettled = offline || (sawFetching.current && inFlight === 0);
    if (dataSettled) leave();
  }, [phase, floorElapsed, fontsReady, offline, inFlight, leave]);

  useEffect(() => {
    if (phase !== "leaving") return;
    const t = setTimeout(() => setPhase("gone"), FADE_MS);
    return () => clearTimeout(t);
  }, [phase]);

  if (phase === "gone") return null;

  return (
    <div
      // Decorative. Every screen underneath announces its own load through the
      // skeletons' live regions (AppShellSkeleton, MobileShellSkeleton), and a
      // second announcement from an empty panel would talk over the one that
      // actually says what is loading. Same reasoning as BootSplash's.
      aria-hidden="true"
      data-leaving={phase === "leaving" || undefined}
      className="app-reveal"
    />
  );
}
