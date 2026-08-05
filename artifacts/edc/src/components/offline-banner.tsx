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
    // Desktop only. The bottom of a phone screen is the busiest part of it —
    // tab bar, then the Commander capsule floating above that — and this used
    // to wear a `max-md:` offset to clear the bar while still cutting through
    // the capsule. Below md, mobile/shell/offline-strip.tsx says the same
    // thing from inside the header instead.
    <div className="fixed bottom-0 inset-x-0 z-50 hidden md:flex items-center justify-center gap-2 bg-amber-500/95 text-amber-950 text-sm py-1.5 px-3">
      <WifiOff className="h-4 w-4" />
      Offline — showing last-synced data
    </div>
  );
}
