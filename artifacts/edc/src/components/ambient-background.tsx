import { useEffect } from "react";
import { useTimeBand } from "@/hooks/use-time-band";

// Non-visual. Keeps data-time-band on <html> current so index.css can apply a
// subtle (<=5% perceptual) tint per band — see the design spec's Ambient
// Background section. Reuses the same getTimeBand() Phase 1's greeting
// already relies on, not a second competing time-banding scheme.
//
// This UPDATES the attribute; it does not establish it. The initial stamp
// happens in index.html's pre-paint script, and that split is the whole point:
// body carries `transition: background-color 2s ease` for the live band
// crossing, so an attribute that first appears after mount does not tint the
// page — it spends two seconds fading INTO the tint, on every single load, on
// every route. Setting it before the first paint means the first painted colour
// is already the final one.
//
// The write is guarded rather than unconditional for the same reason. React runs
// this effect on mount, when the pre-paint script has already written the
// identical value; assigning it again is not a no-op to the style engine — it
// re-resolves the custom properties and hands body a fresh background-color to
// transition to, which is exactly the 2s smear this is meant to avoid. Only a
// real change gets written, so the tween runs only when the band actually turns
// over (see useTimeBand's 5-minute re-evaluation).
export function AmbientBackground() {
  const band = useTimeBand();

  useEffect(() => {
    const root = document.documentElement;
    if (root.getAttribute("data-time-band") === band) return;
    root.setAttribute("data-time-band", band);
  }, [band]);

  return null;
}
