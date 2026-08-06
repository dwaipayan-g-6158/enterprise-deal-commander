import { useEffect, useState } from "react";
import { useRegisterSW } from "virtual:pwa-register/react";
import { useToast } from "@/hooks/use-toast";
import { ToastAction } from "@/components/ui/toast";

/**
 * Under registerType "autoUpdate" (see vite.config.ts) the new service worker
 * skipWaiting()s and claims control on its own — this component no longer
 * gates THAT. It only offers to reload the page so the running JS catches up
 * with the worker that already took over. Hence `onNeedReload` (which
 * suppresses vite-plugin-pwa's built-in automatic reload) rather than
 * `needRefresh`, and a plain location.reload() rather than
 * updateServiceWorker() — in this mode `needRefresh` never becomes true and
 * updateServiceWorker() is a no-op, so the previous implementation would have
 * silently stopped showing anything.
 *
 * Reloading matters more than it looks: cleanupOutdatedCaches() drops the
 * previous precache and an AppSail deploy replaces the whole public/ tree, so
 * the old content-hashed chunks are gone from both. A tab still running the
 * previous bundle that later lazy-imports a chunk it hasn't fetched (the
 * desktop/mobile shell split in App.tsx fires on a resize across 767px) would
 * 404 into an unresolved Suspense.
 */
export function PwaUpdatePrompt() {
  const { toast } = useToast();
  const [needReload, setNeedReload] = useState(false);

  useRegisterSW({
    onNeedReload() {
      // On the sign-in screen there is nothing to preserve, and a visitor who
      // cannot sign in is the least likely person to notice or trust a toast
      // — this is the exact case the eviction exists for, so take the reload
      // immediately instead of asking. Same for a backgrounded tab, where a
      // reload can't interrupt anyone.
      if (
        window.location.pathname.endsWith("/login") ||
        document.visibilityState === "hidden"
      ) {
        window.location.reload();
        return;
      }
      setNeedReload(true);
    },
  });

  useEffect(() => {
    if (!needReload) return;
    toast({
      title: "New version available",
      description: "Reload to get the latest Deal Commander.",
      action: (
        <ToastAction altText="Reload" onClick={() => window.location.reload()}>
          Reload
        </ToastAction>
      ),
    });
  }, [needReload, toast]);

  return null;
}
