import { describe, it, expect } from "vitest";
import { isDismissed, dismiss } from "./review-dismiss";
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

describe("isDismissed", () => {
  it("returns false when nothing is stored", () => {
    expect(isDismissed(fakeStore(), "2026-W30")).toBe(false);
  });

  it("returns false for corrupted JSON", () => {
    const store = fakeStore({ "edc.weekly.dismissed": "{not json" });
    expect(isDismissed(store, "2026-W30")).toBe(false);
  });

  it("returns false when the stored value isn't an array", () => {
    const store = fakeStore({ "edc.weekly.dismissed": JSON.stringify({ oops: true }) });
    expect(isDismissed(store, "2026-W30")).toBe(false);
  });

  it("returns true for a key that was dismissed", () => {
    const store = fakeStore({ "edc.weekly.dismissed": JSON.stringify(["2026-W30"]) });
    expect(isDismissed(store, "2026-W30")).toBe(true);
  });

  it("returns false for a different week key", () => {
    const store = fakeStore({ "edc.weekly.dismissed": JSON.stringify(["2026-W30"]) });
    expect(isDismissed(store, "2026-W31")).toBe(false);
  });

  it("never throws when the store itself throws on read", () => {
    const throwingStore: KeyValueStore = {
      getItem: () => {
        throw new Error("storage unavailable");
      },
      setItem: () => {
        throw new Error("storage unavailable");
      },
    };
    expect(() => isDismissed(throwingStore, "2026-W30")).not.toThrow();
    expect(isDismissed(throwingStore, "2026-W30")).toBe(false);
  });
});

describe("dismiss", () => {
  it("makes isDismissed true for the same key afterwards", () => {
    const store = fakeStore();
    dismiss(store, "2026-W30");
    expect(isDismissed(store, "2026-W30")).toBe(true);
  });

  it("does not mark a different week key as dismissed", () => {
    const store = fakeStore();
    dismiss(store, "2026-W30");
    expect(isDismissed(store, "2026-W31")).toBe(false);
  });

  it("preserves previously dismissed weeks when dismissing a new one", () => {
    const store = fakeStore();
    dismiss(store, "2026-W29");
    dismiss(store, "2026-W30");
    expect(isDismissed(store, "2026-W29")).toBe(true);
    expect(isDismissed(store, "2026-W30")).toBe(true);
  });

  it("is idempotent for the same key", () => {
    const store = fakeStore();
    dismiss(store, "2026-W30");
    dismiss(store, "2026-W30");
    expect(isDismissed(store, "2026-W30")).toBe(true);
  });

  it("recovers from corrupted existing JSON instead of throwing", () => {
    const store = fakeStore({ "edc.weekly.dismissed": "{not json" });
    expect(() => dismiss(store, "2026-W30")).not.toThrow();
    expect(isDismissed(store, "2026-W30")).toBe(true);
  });

  it("never throws when the store itself throws on write", () => {
    const throwingStore: KeyValueStore = {
      getItem: () => null,
      setItem: () => {
        throw new Error("storage full");
      },
    };
    expect(() => dismiss(throwingStore, "2026-W30")).not.toThrow();
  });
});
