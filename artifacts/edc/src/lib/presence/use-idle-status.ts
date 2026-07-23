import { useEffect, useState } from "react";
import { computeStatus, DEFAULT_IDLE_THRESHOLD_MS } from "./idle-tracker";

const REEVALUATE_INTERVAL_MS = 30 * 1000;
const ACTIVITY_EVENTS = ["mousemove", "keydown"] as const;

/**
 * Tracks Active/Away for Profile Presence. Re-evaluates on a 30s interval
 * (not only on the next render) so "Away" appears within 30s of the
 * threshold passing, per the design spec. Per-tab only, by design — see
 * the spec's "Idle tracker across tabs/windows" edge case.
 */
export function useIdleStatus(
  idleThresholdMs: number = DEFAULT_IDLE_THRESHOLD_MS,
): "active" | "away" {
  const [lastActivityAt, setLastActivityAt] = useState(() => new Date());
  const [status, setStatus] = useState<"active" | "away">("active");

  useEffect(() => {
    function handleActivity() {
      setLastActivityAt(new Date());
    }
    function handleVisibility() {
      if (document.visibilityState === "visible") handleActivity();
    }
    ACTIVITY_EVENTS.forEach((evt) => window.addEventListener(evt, handleActivity));
    document.addEventListener("visibilitychange", handleVisibility);
    return () => {
      ACTIVITY_EVENTS.forEach((evt) => window.removeEventListener(evt, handleActivity));
      document.removeEventListener("visibilitychange", handleVisibility);
    };
  }, []);

  useEffect(() => {
    const id = setInterval(() => {
      setStatus(computeStatus(lastActivityAt, new Date(), idleThresholdMs));
    }, REEVALUATE_INTERVAL_MS);
    return () => clearInterval(id);
  }, [lastActivityAt, idleThresholdMs]);

  return status;
}
