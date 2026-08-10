import { useEffect, useState } from "react";
import { WifiOff } from "lucide-react";

/**
 * Offline state, in the mobile shell's own chrome.
 *
 * The shared `OfflineBanner` is pinned to the bottom of the viewport, and on a
 * phone the bottom is the busiest part of the screen: the tab bar owns the
 * last 64px and the Commander capsule floats above it. The banner wore a
 * `max-md:` offset to clear the bar and still cut straight through the capsule
 * — measured at a 20px overlap. It is desktop-only now, and this takes over
 * below `md`.
 *
 * Rendered inside `MobileHeader` rather than as a sibling of it, for two
 * reasons. The header already owns `pt-safe`, so a strip above it would either
 * double the status-bar inset or have to negotiate for it. And the header
 * carries `m-vt-navbar`, which lifts it out of the route transition's snapshot
 * — a strip outside that name would slide away with the content underneath it
 * on every navigation.
 *
 * "Showing last-synced data" is context about what you are reading, which is
 * an argument for putting it above the content rather than below it anyway.
 */
export function OfflineStrip() {
  const [offline, setOffline] = useState(() =>
    typeof navigator === "undefined" ? false : !navigator.onLine,
  );

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
    <div
      // A polite live region: the connection dropping is worth announcing, but
      // not worth interrupting whatever is being read.
      role="status"
      className="m-label flex items-center justify-center gap-1.5 bg-amber-500 py-1 text-amber-950"
    >
      <WifiOff className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
      Offline — showing last-synced data
    </div>
  );
}
