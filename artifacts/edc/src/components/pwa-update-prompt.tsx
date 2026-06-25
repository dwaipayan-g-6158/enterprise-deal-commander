import { useEffect } from "react";
import { useRegisterSW } from "virtual:pwa-register/react";
import { useToast } from "@/hooks/use-toast";
import { ToastAction } from "@/components/ui/toast";

export function PwaUpdatePrompt() {
  const { toast } = useToast();
  const {
    needRefresh: [needRefresh],
    updateServiceWorker,
  } = useRegisterSW();

  useEffect(() => {
    if (needRefresh) {
      toast({
        title: "New version available",
        description: "Reload to get the latest Deal Commander.",
        action: (
          <ToastAction altText="Reload" onClick={() => updateServiceWorker(true)}>
            Reload
          </ToastAction>
        ),
      });
    }
  }, [needRefresh, toast, updateServiceWorker]);

  return null;
}
