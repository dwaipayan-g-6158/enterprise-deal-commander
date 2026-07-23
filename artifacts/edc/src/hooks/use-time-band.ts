import { useEffect, useState } from "react";
import { getTimeBand, type TimeBand } from "@/lib/greetings/time-bands";

const REEVALUATE_INTERVAL_MS = 5 * 60 * 1000;

/** Re-evaluates the current time band every 5 minutes so a band transition is caught without a page reload. */
export function useTimeBand(): TimeBand {
  const [band, setBand] = useState<TimeBand>(() => getTimeBand(new Date()));

  useEffect(() => {
    const id = setInterval(() => setBand(getTimeBand(new Date())), REEVALUATE_INTERVAL_MS);
    return () => clearInterval(id);
  }, []);

  return band;
}
