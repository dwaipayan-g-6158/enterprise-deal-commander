import { useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";

/**
 * Refetch stale visible data when the app comes back to the foreground.
 *
 * The global QueryClient sets refetchOnWindowFocus: false, which is right for
 * a desktop tab that stays open all day but wrong for an installed PWA — a
 * phone app is backgrounded constantly, and a commander reopening it at noon
 * should not be reading the pipeline as it stood at breakfast.
 *
 * Scoped to the mobile shell rather than changed globally so desktop keeps its
 * deliberate behavior. Only active + stale queries refetch, so returning to
 * the app is a no-op when nothing has aged out.
 */
export function useAppResumeRefetch(): void {
  const queryClient = useQueryClient();

  useEffect(() => {
    const onVisibilityChange = () => {
      if (document.visibilityState !== "visible") return;
      // Offline, a refetch can only fail; the service worker is already
      // serving the last-synced reads.
      if (typeof navigator !== "undefined" && !navigator.onLine) return;
      void queryClient.refetchQueries({ type: "active", stale: true });
    };

    document.addEventListener("visibilitychange", onVisibilityChange);
    return () => document.removeEventListener("visibilitychange", onVisibilityChange);
  }, [queryClient]);
}
