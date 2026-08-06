import { useCallback } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { catalystSignOut } from "./catalyst-client";
import { resetAuthBounceGuard } from "./catalyst-auth-bounce";
import { clearPersistedRole } from "./role-context";

/**
 * The single sign-out path. This used to be implemented twice —
 * components/layout.tsx purged the query cache and the `edc-api-reads`
 * service-worker cache, components/command-palette.tsx did neither — so
 * signing out from ⌘K left the previous session's GET responses cached and,
 * now that the role is persisted for offline use (see role-context.tsx),
 * would also leave its role in localStorage. The next person to sign in on
 * that machine would inherit both until /auth/me resolved. Anything that
 * ends a session must go through here.
 *
 * Post-Catalyst-migration: there is no server logout route anymore (see
 * routes/auth.ts's docstring) — `catalystSignOut()` calls the Web SDK's own
 * `auth.signOut()` directly, which is what actually ends the Catalyst
 * session, and it does its own navigation to /login. The local cache
 * teardown below still needs to happen BEFORE that navigation fires, same
 * as before.
 */
export function useSignOut() {
  const queryClient = useQueryClient();

  return useCallback(async () => {
    clearPersistedRole();
    queryClient.clear();

    // CatalystAuthBounce fires at most once per path kind per tab so the SDK's
    // sign-IN marker can't trap the browser in a redirect loop. Sign-out goes
    // through that same component but is always a deliberate click, never a
    // loop, so give it a fresh one-shot — otherwise the second sign-out in a
    // tab finds the guard already spent, skips the reload that actually
    // performs the logout, and leaves the user on the 404 route still signed
    // in. See resetAuthBounceGuard's docstring.
    resetAuthBounceGuard("accounts");

    if (typeof caches !== "undefined") {
      try {
        const keys = await caches.keys();
        // Prefix, not the exact "edc-api-reads" name: the service worker now
        // splits API responses across buckets (reads, lookups — see the
        // runtimeCaching list in vite.config.ts), and matching one name by
        // hand would leave the others holding the previous session's data on
        // a shared device. Any future edc-api-* bucket is covered too.
        await Promise.all(
          keys.filter((k) => k.includes("edc-api-")).map((k) => caches.delete(k)),
        );
      } catch (e) {
        console.error(e);
      }
    }

    await catalystSignOut();
  }, [queryClient]);
}
