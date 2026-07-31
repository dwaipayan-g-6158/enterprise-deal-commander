import { describe, it, expect } from "vitest";
import {
  isRollupStale,
  ROLLUP_MAX_AGE_MS,
  ROLLUP_STALE_GRACE_MS,
  MAX_REFRESH_ATTEMPTS,
  RefreshCoordinator,
  createDebouncer,
} from "./portfolio-rollup-coordinator";
import { MV_REFRESH_INTERVAL_MS } from "./refresh-cadence";

/** A promise plus externally-callable resolve/reject, for controlling exactly
 * when an in-flight job settles without relying on fake timers. */
function deferred<T = void>(): {
  promise: Promise<T>;
  resolve: (value: T) => void;
  reject: (err: unknown) => void;
} {
  let resolve!: (value: T) => void;
  let reject!: (err: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

describe("isRollupStale", () => {
  const now = Date.parse("2026-07-31T12:00:00.000Z");

  it("is not stale exactly at maxAgeMs old (boundary is >, not >=)", () => {
    const computedAt = new Date(now - ROLLUP_MAX_AGE_MS);
    expect(isRollupStale(computedAt, now)).toBe(false);
  });

  it("is stale at maxAgeMs + 1ms old", () => {
    const computedAt = new Date(now - ROLLUP_MAX_AGE_MS - 1);
    expect(isRollupStale(computedAt, now)).toBe(true);
  });

  it("is stale when computedAt is null", () => {
    expect(isRollupStale(null, now)).toBe(true);
  });

  it("is stale when computedAt is undefined", () => {
    expect(isRollupStale(undefined, now)).toBe(true);
  });

  it("is stale for an unparseable string", () => {
    expect(isRollupStale("not-a-date", now)).toBe(true);
  });

  it("is not stale for a valid, fresh ISO string", () => {
    const fresh = new Date(now - 60_000).toISOString();
    expect(isRollupStale(fresh, now)).toBe(false);
  });

  it("is not stale for a timestamp in the future (clock skew, not staleness)", () => {
    const future = new Date(now + 60_000);
    expect(isRollupStale(future, now)).toBe(false);
  });

  it("honors an explicit maxAgeMs override", () => {
    const customMaxAge = 5_000;
    const justUnderCustom = new Date(now - customMaxAge);
    const justOverCustom = new Date(now - customMaxAge - 1);
    expect(isRollupStale(justUnderCustom, now, customMaxAge)).toBe(false);
    expect(isRollupStale(justOverCustom, now, customMaxAge)).toBe(true);
    // Same age would NOT be stale against the (much larger) default max age,
    // proving the override — not the default — governs the boundary above.
    expect(isRollupStale(justOverCustom, now)).toBe(false);
  });
});

describe("constant sanity", () => {
  it("ROLLUP_MAX_AGE_MS exceeds the refresh cadence (one cycle fits inside the max age)", () => {
    expect(ROLLUP_MAX_AGE_MS).toBeGreaterThan(MV_REFRESH_INTERVAL_MS);
  });

  it("ROLLUP_STALE_GRACE_MS is positive", () => {
    expect(ROLLUP_STALE_GRACE_MS).toBeGreaterThan(0);
  });
});

describe("RefreshCoordinator", () => {
  it("joins an in-flight run instead of starting a second", async () => {
    const coordinator = new RefreshCoordinator();
    const gate = deferred<void>();
    let invocations = 0;

    const job = async () => {
      invocations++;
      if (invocations === 1) {
        // First invocation blocks until the test releases it, giving the test
        // a window in which to call run() again while still in-flight.
        await gate.promise;
      }
      // Second (coalesced-rerun) invocation resolves immediately.
    };

    const p1 = coordinator.run(job);
    const p2 = coordinator.run(job); // called while p1's job is still blocked
    const p3 = coordinator.run(job); // ditto

    // All three calls must have joined the same in-flight promise.
    expect(p2).toBe(p1);
    expect(p3).toBe(p1);

    gate.resolve();
    const [r1, r2, r3] = await Promise.all([p1, p2, p3]);

    // Exactly one coalesced rerun: the original attempt, plus one extra
    // (not two, even though run() was called two additional times while
    // in-flight) — that's the single-flight guarantee.
    expect(invocations).toBe(2);
    expect(r1).toBe(true);
    expect(r2).toBe(true);
    expect(r3).toBe(true);
  });

  it("discards a snapshot invalidated mid-compute and recomputes", async () => {
    const coordinator = new RefreshCoordinator();
    let invocations = 0;
    let writes = 0;
    const supersededAtWriteTime: boolean[] = [];

    const job = async (isSuperseded: () => boolean) => {
      invocations++;
      if (invocations === 1) {
        // Simulate a mutation arriving mid-compute, on the first attempt only.
        coordinator.invalidate();
      }
      supersededAtWriteTime.push(isSuperseded());
      if (isSuperseded()) return; // discard — do not "write"
      writes++;
    };

    const ok = await coordinator.run(job);

    expect(ok).toBe(true);
    expect(invocations).toBe(2);
    expect(writes).toBe(1);
    expect(supersededAtWriteTime).toEqual([true, false]);
  });

  it("gives up after MAX_REFRESH_ATTEMPTS rather than looping forever", async () => {
    const coordinator = new RefreshCoordinator();
    let invocations = 0;

    const job = async () => {
      invocations++;
      // Permanently supersede itself on every attempt.
      coordinator.invalidate();
    };

    const ok = await coordinator.run(job);

    expect(ok).toBe(false);
    expect(invocations).toBe(MAX_REFRESH_ATTEMPTS);
  });

  it("clears in-flight state after a throwing job", async () => {
    const coordinator = new RefreshCoordinator();

    await expect(
      coordinator.run(async () => {
        throw new Error("boom");
      }),
    ).rejects.toThrow("boom");

    // A subsequent run() must not be stuck joining the failed in-flight run —
    // it should start a genuinely fresh job and succeed.
    let secondRanFresh = false;
    const ok = await coordinator.run(async () => {
      secondRanFresh = true;
    });

    expect(secondRanFresh).toBe(true);
    expect(ok).toBe(true);
  });

  it("invalidate() bumps the epoch synchronously", () => {
    const coordinator = new RefreshCoordinator();
    const before = coordinator.currentEpoch;
    coordinator.invalidate();
    // No await anywhere above: proves the bump is synchronous, not deferred
    // to a microtask.
    expect(coordinator.currentEpoch).toBe(before + 1);
  });
});

describe("createDebouncer", () => {
  const DELAY_MS = 5;

  it("collapses 3 rapid schedule() calls into a single fn() invocation", async () => {
    let calls = 0;
    const debouncer = createDebouncer(DELAY_MS, () => {
      calls++;
    });

    debouncer.schedule();
    debouncer.schedule();
    debouncer.schedule();

    await sleep(DELAY_MS * 4);

    expect(calls).toBe(1);
  });

  it("pending is true right after schedule() and false once fn() has fired", async () => {
    let fired = false;
    const debouncer = createDebouncer(DELAY_MS, () => {
      fired = true;
    });

    debouncer.schedule();
    expect(debouncer.pending).toBe(true);

    await sleep(DELAY_MS * 4);

    expect(fired).toBe(true);
    expect(debouncer.pending).toBe(false);
  });

  it("re-arms after firing so a later schedule() fires again", async () => {
    let calls = 0;
    const debouncer = createDebouncer(DELAY_MS, () => {
      calls++;
    });

    debouncer.schedule();
    await sleep(DELAY_MS * 4);
    expect(calls).toBe(1);

    debouncer.schedule();
    await sleep(DELAY_MS * 4);
    expect(calls).toBe(2);
  });

  it("fires at the FIRST schedule()'s deadline, not extended by a later one (leading, not trailing)", async () => {
    // Regression guard: if createDebouncer were "fixed" into a trailing
    // debounce, a second schedule() call inside the window would push the
    // deadline out and fn() would fire later than the window below allows.
    const WINDOW_DELAY_MS = 30;
    let firedAt: number | null = null;
    const debouncer = createDebouncer(WINDOW_DELAY_MS, () => {
      firedAt = Date.now();
    });

    const start = Date.now();
    debouncer.schedule();
    // Call again partway through the window — must be absorbed, not push
    // the deadline out.
    await sleep(WINDOW_DELAY_MS * 0.5);
    debouncer.schedule();

    await sleep(WINDOW_DELAY_MS * 2);

    expect(firedAt).not.toBeNull();
    const elapsed = (firedAt as unknown as number) - start;
    // Leading-window: fires ~WINDOW_DELAY_MS after the FIRST call. A trailing
    // debounce would instead fire ~1.5x WINDOW_DELAY_MS after start. Allow
    // generous scheduling slack but stay well under the trailing-debounce
    // timing to distinguish the two.
    expect(elapsed).toBeLessThan(WINDOW_DELAY_MS * 1.3);
  });

  it("cancel() before the delay elapses prevents fn() from ever firing", async () => {
    let calls = 0;
    const debouncer = createDebouncer(DELAY_MS, () => {
      calls++;
    });

    debouncer.schedule();
    debouncer.cancel();

    await sleep(DELAY_MS * 4);

    expect(calls).toBe(0);
    expect(debouncer.pending).toBe(false);
  });
});
