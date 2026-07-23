import { describe, it, expect } from "vitest";
import { isFocusModeEnabled, setFocusMode } from "./focus-mode";
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

describe("isFocusModeEnabled / setFocusMode", () => {
  it("defaults to disabled when nothing is stored", () => {
    expect(isFocusModeEnabled(fakeStore())).toBe(false);
  });

  it("round-trips enabling and disabling", () => {
    const store = fakeStore();
    setFocusMode(store, true);
    expect(isFocusModeEnabled(store)).toBe(true);
    setFocusMode(store, false);
    expect(isFocusModeEnabled(store)).toBe(false);
  });

  it("treats any non-'true' stored value as disabled", () => {
    const store = fakeStore({ "edc.presence.focusMode": "garbage" });
    expect(isFocusModeEnabled(store)).toBe(false);
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
    expect(() => isFocusModeEnabled(throwing)).not.toThrow();
    expect(isFocusModeEnabled(throwing)).toBe(false);
    expect(() => setFocusMode(throwing, true)).not.toThrow();
  });
});
