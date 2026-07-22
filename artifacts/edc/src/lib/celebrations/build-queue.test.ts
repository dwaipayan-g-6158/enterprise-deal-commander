import { describe, it, expect } from "vitest";
import { buildCelebrationQueue, streakMilestoneCrossed } from "./build-queue";

describe("buildCelebrationQueue", () => {
  it("returns an empty queue when nothing changed", () => {
    expect(
      buildCelebrationQueue({ dealsClosedWonSince: [], newlyEarnedAchievements: [], streakMilestoneCrossed: null }),
    ).toEqual([]);
  });

  it("queues one entry per newly closed-won deal", () => {
    const q = buildCelebrationQueue({
      dealsClosedWonSince: [
        { dealId: "d1", dealName: "Acme" },
        { dealId: "d2", dealName: "Globex" },
      ],
      newlyEarnedAchievements: [],
      streakMilestoneCrossed: null,
    });
    expect(q).toHaveLength(2);
    expect(q[0].title).toBe("Deal closed");
    expect(q[0].description).toContain("Acme");
  });

  it("queues one entry per newly earned achievement", () => {
    const q = buildCelebrationQueue({
      dealsClosedWonSince: [],
      newlyEarnedAchievements: [{ code: "first_close", name: "First Deal Closed", description: "..." }],
      streakMilestoneCrossed: null,
    });
    expect(q).toHaveLength(1);
    expect(q[0].title).toBe("Achievement unlocked: First Deal Closed");
  });

  it("queues a streak milestone entry when one was crossed", () => {
    const q = buildCelebrationQueue({
      dealsClosedWonSince: [],
      newlyEarnedAchievements: [],
      streakMilestoneCrossed: 7,
    });
    expect(q).toHaveLength(1);
    expect(q[0].title).toBe("7-day streak");
  });

  it("orders deals-closed before achievements before streak, combining all three", () => {
    const q = buildCelebrationQueue({
      dealsClosedWonSince: [{ dealId: "d1", dealName: "Acme" }],
      newlyEarnedAchievements: [{ code: "first_close", name: "First Deal Closed", description: "..." }],
      streakMilestoneCrossed: 7,
    });
    expect(q.map((c) => c.id)).toEqual(["deal-closed-d1", "achievement-first_close", "streak-7"]);
  });
});

describe("streakMilestoneCrossed", () => {
  it("returns null when no milestone boundary was crossed", () => {
    expect(streakMilestoneCrossed(3, 5)).toBeNull();
  });
  it("returns the milestone value when crossed", () => {
    expect(streakMilestoneCrossed(6, 7)).toBe(7);
  });
  it("returns the smallest milestone crossed if multiple were skipped over", () => {
    expect(streakMilestoneCrossed(5, 15)).toBe(7);
  });
  it("returns null if already past the milestone (no re-crossing)", () => {
    expect(streakMilestoneCrossed(10, 12)).toBeNull();
  });
});
