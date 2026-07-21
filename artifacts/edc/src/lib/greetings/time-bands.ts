export type TimeBand = "morning" | "afternoon" | "evening" | "night";

/**
 * Morning 6-12, Afternoon 12-17, Evening 17-21, Night 21-6 (wraps midnight).
 * Uses the browser's local time — no timezone acknowledgement (single-user app).
 */
export function getTimeBand(date: Date): TimeBand {
  const hour = date.getHours();
  if (hour >= 6 && hour < 12) return "morning";
  if (hour >= 12 && hour < 17) return "afternoon";
  if (hour >= 17 && hour < 21) return "evening";
  return "night";
}
