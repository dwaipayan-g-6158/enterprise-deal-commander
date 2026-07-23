import { describe, it, expect } from "vitest";
import { computeStatus, DEFAULT_IDLE_THRESHOLD_MS } from "./idle-tracker";

describe("computeStatus", () => {
  it("is active just under the threshold", () => {
    const lastActivityAt = new Date(2026, 6, 23, 12, 0, 0);
    const now = new Date(lastActivityAt.getTime() + DEFAULT_IDLE_THRESHOLD_MS - 1);
    expect(computeStatus(lastActivityAt, now, DEFAULT_IDLE_THRESHOLD_MS)).toBe("active");
  });

  it("is away exactly at the threshold", () => {
    const lastActivityAt = new Date(2026, 6, 23, 12, 0, 0);
    const now = new Date(lastActivityAt.getTime() + DEFAULT_IDLE_THRESHOLD_MS);
    expect(computeStatus(lastActivityAt, now, DEFAULT_IDLE_THRESHOLD_MS)).toBe("away");
  });

  it("is away well past the threshold", () => {
    const lastActivityAt = new Date(2026, 6, 23, 12, 0, 0);
    const now = new Date(lastActivityAt.getTime() + DEFAULT_IDLE_THRESHOLD_MS * 10);
    expect(computeStatus(lastActivityAt, now, DEFAULT_IDLE_THRESHOLD_MS)).toBe("away");
  });

  it("is active at zero elapsed time", () => {
    const lastActivityAt = new Date(2026, 6, 23, 12, 0, 0);
    expect(computeStatus(lastActivityAt, lastActivityAt, DEFAULT_IDLE_THRESHOLD_MS)).toBe("active");
  });

  it("respects a custom threshold", () => {
    const lastActivityAt = new Date(2026, 6, 23, 12, 0, 0);
    const now = new Date(lastActivityAt.getTime() + 1000);
    expect(computeStatus(lastActivityAt, now, 500)).toBe("away");
    expect(computeStatus(lastActivityAt, now, 2000)).toBe("active");
  });
});
