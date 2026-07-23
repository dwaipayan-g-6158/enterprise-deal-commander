/** Pure idle/active boundary check for Profile Presence (PRD 4.12). */

export const DEFAULT_IDLE_THRESHOLD_MS = 5 * 60 * 1000;

export function computeStatus(
  lastActivityAt: Date,
  now: Date,
  idleThresholdMs: number,
): "active" | "away" {
  return now.getTime() - lastActivityAt.getTime() >= idleThresholdMs ? "away" : "active";
}
