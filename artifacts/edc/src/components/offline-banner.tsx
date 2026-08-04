import { useEffect, useState } from "react";
import { WifiOff } from "lucide-react";

export function OfflineBanner() {
  const [offline, setOffline] = useState(!navigator.onLine);

  useEffect(() => {
    const on = () => setOffline(false);
    const off = () => setOffline(true);
    window.addEventListener("online", on);
    window.addEventListener("offline", off);
    return () => {
      window.removeEventListener("online", on);
      window.removeEventListener("offline", off);
    };
  }, []);

  if (!offline) return null;
  return (
    // Below md: the mobile shell's tab bar occupies the bottom of the screen,
    // so the banner rides above it (4rem bar + the home-indicator inset the
    // bar itself pads with). Desktop keeps sitting flush at the bottom.
    <div className="fixed bottom-0 max-md:bottom-[calc(4rem+env(safe-area-inset-bottom))] inset-x-0 z-50 flex items-center justify-center gap-2 bg-amber-500/95 text-amber-950 text-sm py-1.5 px-3">
      <WifiOff className="h-4 w-4" />
      Offline — showing last-synced data
    </div>
  );
}
