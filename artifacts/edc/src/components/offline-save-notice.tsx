import { useEffect, useRef } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";

/**
 * Gives feedback for saves attempted while offline. React Query pauses
 * mutations when offline (networkMode "online") instead of failing them, which
 * is safe (no false success, no lost edit) but silent — the user clicks Save
 * and nothing visibly happens. This watches the mutation cache and toasts once
 * when a mutation is paused, then confirms when the queue drains on reconnect.
 *
 * Global by design: one mount covers every mutation in the app, regardless of
 * each form's own mutation options.
 */
export function OfflineSaveNotice() {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const queued = useRef(false);

  useEffect(() => {
    const cache = queryClient.getMutationCache();
    const sync = () => {
      const anyPaused = cache.getAll().some((m) => m.state.isPaused);
      if (anyPaused && !queued.current) {
        queued.current = true;
        toast({
          title: "You're offline",
          description:
            "Your changes are queued and will save automatically when you reconnect.",
        });
      } else if (!anyPaused && queued.current) {
        queued.current = false;
        toast({
          title: "Back online",
          description: "Syncing your queued changes.",
        });
      }
    };
    const unsubscribe = cache.subscribe(sync);
    sync();
    return unsubscribe;
  }, [queryClient, toast]);

  return null;
}
