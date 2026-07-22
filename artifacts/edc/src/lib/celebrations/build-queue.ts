/**
 * Pure celebration-queue builder. The existing toast store
 * (`hooks/use-toast.ts`) has TOAST_LIMIT=1 — a second `toast()` call
 * silently evicts the first rather than queuing it — so `CelebrationWatcher`
 * (the consumer of this module) drains this list one at a time on a timer
 * instead of firing every celebration at once.
 */

export interface CelebrationPayload {
  id: string;
  title: string;
  description?: string;
}

export interface BuildQueueInputs {
  dealsClosedWonSince: { dealId: string; dealName: string }[];
  newlyEarnedAchievements: { code: string; name: string; description: string }[];
  streakMilestoneCrossed: number | null;
}

const STREAK_MILESTONES = [7, 14, 30, 60, 90];

export function buildCelebrationQueue(inputs: BuildQueueInputs): CelebrationPayload[] {
  const queue: CelebrationPayload[] = [];
  for (const deal of inputs.dealsClosedWonSince) {
    queue.push({
      id: `deal-closed-${deal.dealId}`,
      title: "Deal closed",
      description: `${deal.dealName} — congratulations.`,
    });
  }
  for (const a of inputs.newlyEarnedAchievements) {
    queue.push({
      id: `achievement-${a.code}`,
      title: `Achievement unlocked: ${a.name}`,
      description: a.description,
    });
  }
  if (inputs.streakMilestoneCrossed !== null) {
    queue.push({
      id: `streak-${inputs.streakMilestoneCrossed}`,
      title: `${inputs.streakMilestoneCrossed}-day streak`,
      description: "Consistency compounds.",
    });
  }
  return queue;
}

/** Returns the smallest named milestone whose boundary was crossed between the two streak values, or null. */
export function streakMilestoneCrossed(previousStreak: number, currentStreak: number): number | null {
  for (const m of STREAK_MILESTONES) {
    if (previousStreak < m && currentStreak >= m) return m;
  }
  return null;
}
