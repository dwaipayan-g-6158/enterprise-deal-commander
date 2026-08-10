import { useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useWriteStatusOptional } from "@/mobile/write/write-status-context";

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
  const writeStatus = useWriteStatusOptional();

  useEffect(() => {
    const onVisibilityChange = () => {
      if (document.visibilityState !== "visible") return;
      // Offline, a refetch can only fail; the service worker is already
      // serving the last-synced reads.
      if (typeof navigator !== "undefined" && !navigator.onLine) return;
      // A write is in flight, and a resume refetch would land on top of its
      // optimistic patch and silently revert it. This is not a rare race: it is
      // exactly what happens when someone taps and the phone locks, which on a
      // field app is most taps. The write's own invalidation will refresh
      // whatever this would have.
      if (writeStatus?.hasWritesInFlight) return;
      void queryClient.refetchQueries({ type: "active", stale: true });
    };

    document.addEventListener("visibilitychange", onVisibilityChange);
    return () => document.removeEventListener("visibilitychange", onVisibilityChange);
  }, [queryClient, writeStatus]);
}
