import { describe, it, expect } from "vitest";
import { isDismissedToday, dismissToday } from "./dismiss";
import type { KeyValueStore } from "@/lib/storage";

function fakeStore(initial: Record<string, string> = {}): KeyValueStore {
  const data = { ...initial };
  return {
    getItem: (key) => data[key] ?? null,
    setItem: (key, value) => {
      data[key] = value;
    },
  };
}

describe("isDismissedToday / dismissToday", () => {
  it("is not dismissed when nothing is stored", () => {
    expect(isDismissedToday(fakeStore(), new Date(2026, 6, 23, 17))).toBe(false);
  });

  it("is dismissed after calling dismissToday for the same local date", () => {
    const store = fakeStore();
    const now = new Date(2026, 6, 23, 17);
    dismissToday(store, now);
    expect(isDismissedToday(store, now)).toBe(true);
  });

  it("is not dismissed on a different local date than the one stored", () => {
    const store = fakeStore();
    dismissToday(store, new Date(2026, 6, 23, 17));
    expect(isDismissedToday(store, new Date(2026, 6, 24, 9))).toBe(false);
  });

  it("never throws when the store throws", () => {
    const throwing: KeyValueStore = {
      getItem: () => {
        throw new Error("boom");
      },
      setItem: () => {
        throw new Error("boom");
      },
    };
    expect(() => isDismissedToday(throwing, new Date())).not.toThrow();
    expect(() => dismissToday(throwing, new Date())).not.toThrow();
  });
});
