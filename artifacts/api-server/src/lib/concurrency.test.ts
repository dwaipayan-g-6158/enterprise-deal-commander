import { describe, it, expect, vi } from "vitest";
import { mapWithConcurrency } from "./concurrency";

// Moved here verbatim from the old `lib/portfolio.test.ts`, which needed a
// reachable `DATABASE_URL` purely because `mapWithConcurrency` shared a file
// with a Drizzle query. It no longer does, so these run with no database at all.
describe("mapWithConcurrency", () => {
  it("preserves input order even when later items resolve before earlier ones", async () => {
    const items = [0, 1, 2, 3];
    const result = await mapWithConcurrency(
      items,
      4,
      (i) =>
        new Promise<number>((resolve) => setTimeout(() => resolve(i), (4 - i) * 5)),
    );
    // Item 3 resolves first (5ms) and item 0 resolves last (20ms), but the
    // result must still match INPUT order, not completion order.
    expect(result).toEqual([0, 1, 2, 3]);
  });

  it("never runs more than `limit` calls concurrently", async () => {
    const items = [0, 1, 2, 3, 4];
    let inFlight = 0;
    let maxInFlight = 0;
    const result = await mapWithConcurrency(items, 2, async (i) => {
      inFlight += 1;
      maxInFlight = Math.max(maxInFlight, inFlight);
      await new Promise((resolve) => setTimeout(resolve, 10));
      inFlight -= 1;
      return i;
    });
    // Deterministic counter check, NOT a wall-clock timing assertion — see
    // task-7-brief.md for why timing-based concurrency assertions are flaky
    // on Windows.
    expect(maxInFlight).toBe(2);
    expect(result).toEqual([0, 1, 2, 3, 4]);
  });

  it("propagates the rejection reason from a failing call, same as Promise.all", async () => {
    const boom = new Error("boom from item 1");
    const items = [0, 1, 2];
    await expect(
      mapWithConcurrency(items, 2, async (i) => {
        if (i === 1) throw boom;
        return i;
      }),
    ).rejects.toBe(boom);
  });

  it("resolves to an empty array and never calls fn for empty input", async () => {
    const fn = vi.fn(async (i: number) => i);
    const result = await mapWithConcurrency([], 8, fn);
    expect(result).toEqual([]);
    expect(fn).not.toHaveBeenCalled();
  });

  it("behaves correctly when limit exceeds items.length", async () => {
    const items = ["a", "b", "c"];
    const result = await mapWithConcurrency(items, 8, async (s) => s.toUpperCase());
    expect(result).toEqual(["A", "B", "C"]);
  });
});
