import { useCallback } from "react";
import { useLocation } from "wouter";
import { useQueryClient } from "@tanstack/react-query";
import { useLogout } from "@workspace/api-client-react";
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
 */
export function useSignOut() {
  const logout = useLogout();
  const queryClient = useQueryClient();
  const [, setLocation] = useLocation();

  return useCallback(async () => {
    try {
      await logout.mutateAsync();
    } catch (e) {
      // Deliberate change from the old layout.tsx behavior: a failed logout
      // call used to abort the whole teardown, stranding the user signed in
      // with a live cache. Log it and clear locally regardless.
      console.error(e);
    }

    clearPersistedRole();
    queryClient.clear();

    if (typeof caches !== "undefined") {
      try {
        const keys = await caches.keys();
        await Promise.all(
          keys.filter((k) => k.includes("edc-api-reads")).map((k) => caches.delete(k)),
        );
      } catch (e) {
        console.error(e);
      }
    }

    setLocation("/login");
  }, [logout, queryClient, setLocation]);
}
