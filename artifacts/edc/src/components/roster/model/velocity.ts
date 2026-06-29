// Velocity bucket derivation + display metadata. Single source of truth so the
// velocity filter, the cell renderer, and the sort comparator always agree.
import type { RosterEnrichment, VelocityBucket } from "./roster-types";

export const VELOCITY_LABEL: Record<VelocityBucket, string> = {
  FAST: "Ahead",
  NORMAL: "On Pace",
  SLOW: "Slow",
  STALLED: "Stalled",
  NO_DATE: "—",
};

/**
 * Severity ranking for sorting. Higher = worse. STALLED is the most urgent;
 * NO_DATE has no signal so it sorts to the bottom.
 */
export const VELOCITY_RANK: Record<VelocityBucket, number> = {
  STALLED: 4,
  SLOW: 3,
  NORMAL: 2,
  FAST: 1,
  NO_DATE: 0,
};

/** Buckets a user can actually filter on (NO_DATE is implicit, not offered). */
export const VELOCITY_FILTER_OPTIONS: VelocityBucket[] = ["STALLED", "SLOW", "NORMAL", "FAST"];

/** The backend already flags SLOW at benchmark*1.5; STALLED escalates past this. */
export const STALL_MULTIPLIER = 2;

type VelocityInput = Pick<RosterEnrichment, "benchmarkDays" | "daysInStage" | "velocityStatus">;

export function deriveVelocityBucket(e: VelocityInput | undefined | null): VelocityBucket {
  if (!e || !e.benchmarkDays || e.benchmarkDays <= 0) return "NO_DATE";
  if (e.daysInStage > e.benchmarkDays * STALL_MULTIPLIER) return "STALLED";
  if (e.velocityStatus === "SLOW") return "SLOW";
  if (e.velocityStatus === "FAST") return "FAST";
  return "NORMAL";
}
