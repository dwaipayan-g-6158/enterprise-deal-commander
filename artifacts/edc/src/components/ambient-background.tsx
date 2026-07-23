import { useEffect } from "react";
import { useTimeBand } from "@/hooks/use-time-band";

// Non-visual. Stamps data-time-band on <html> so index.css can apply a
// subtle (<=5% perceptual) tint per band — see the design spec's Ambient
// Background section. Reuses the same getTimeBand() Phase 1's greeting
// already relies on, not a second competing time-banding scheme.
export function AmbientBackground() {
  const band = useTimeBand();

  useEffect(() => {
    document.documentElement.setAttribute("data-time-band", band);
  }, [band]);

  return null;
}
