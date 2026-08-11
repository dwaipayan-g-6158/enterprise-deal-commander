import { describe, expect, it } from "vitest";
import { liveStatus, msUntilIdle, SAVED_VISIBLE_MS, type LiveStatusInput } from "./live-status";

const idle: LiveStatusInput = { offline: false, writing: false, savedAt: null, now: 1000 };

describe("liveStatus", () => {
  it("says nothing when there is nothing to say", () => {
    expect(liveStatus(idle)).toBeNull();
  });

  it("reports a write in flight", () => {
    expect(liveStatus({ ...idle, writing: true })).toBe("saving");
  });

  it("confirms a save for a bounded window, then goes quiet", () => {
    const savedAt = 1000;
    expect(liveStatus({ ...idle, savedAt, now: savedAt })).toBe("saved");
    expect(liveStatus({ ...idle, savedAt, now: savedAt + SAVED_VISIBLE_MS - 1 })).toBe("saved");
    expect(liveStatus({ ...idle, savedAt, now: savedAt + SAVED_VISIBLE_MS })).toBeNull();
  });

  /**
   * The one ordering that is a correctness rule rather than a preference.
   * MOBILE_WRITE_OPTIONS sets networkMode "always" so an offline write rejects
   * instead of queueing; "Saving…" over a dead connection would promise exactly
   * the queue-and-retry behaviour the write layer refuses to implement.
   */
  it("says offline rather than saving when both are true", () => {
    expect(liveStatus({ ...idle, offline: true, writing: true })).toBe("offline");
  });

  it("lets a new write supersede the last confirmation", () => {
    const at = 1000;
    expect(liveStatus({ offline: false, writing: true, savedAt: at, now: at + 10 })).toBe("saving");
  });

  it("does not confirm a save that happened before going offline", () => {
    const at = 1000;
    expect(liveStatus({ offline: true, writing: false, savedAt: at, now: at + 10 })).toBe("offline");
  });
});

describe("msUntilIdle", () => {
  it("schedules exactly the remainder of the confirmation window", () => {
    expect(msUntilIdle({ ...idle, savedAt: 1000, now: 1500 })).toBe(SAVED_VISIBLE_MS - 500);
  });

  it("has nothing to schedule while offline or writing, which have no deadline", () => {
    expect(msUntilIdle({ ...idle, offline: true, savedAt: 1000 })).toBeNull();
    expect(msUntilIdle({ ...idle, writing: true, savedAt: 1000 })).toBeNull();
  });

  it("has nothing to schedule once the window has closed", () => {
    expect(msUntilIdle({ ...idle, savedAt: 1000, now: 1000 + SAVED_VISIBLE_MS })).toBeNull();
    expect(msUntilIdle(idle)).toBeNull();
  });
});
