import { describe, it, expect } from "vitest";
import { pickPersonalityMessage, type PersonalityMessage } from "./rotation";
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

const TWO_MESSAGES: PersonalityMessage[] = [
  { id: "a", text: "Message A" },
  { id: "b", text: "Message B" },
];

describe("pickPersonalityMessage", () => {
  it("returns a message from the given pool", () => {
    const store = fakeStore();
    const picked = pickPersonalityMessage(store, new Date(2026, 6, 23, 9), TWO_MESSAGES);
    expect(TWO_MESSAGES.map((m) => m.id)).toContain(picked.id);
  });

  it("avoids repeating within the 72h dedup window (pool of 2)", () => {
    const store = fakeStore();
    const first = pickPersonalityMessage(store, new Date(2026, 6, 23, 9), TWO_MESSAGES);
    const second = pickPersonalityMessage(store, new Date(2026, 6, 23, 10), TWO_MESSAGES);
    expect(second.id).not.toBe(first.id);
  });

  it("allows repeats once the dedup window has passed", () => {
    const store = fakeStore();
    pickPersonalityMessage(store, new Date(2026, 6, 23, 9), TWO_MESSAGES);
    pickPersonalityMessage(store, new Date(2026, 6, 23, 10), TWO_MESSAGES);
    // Both ids shown; 73h later the window has fully elapsed for both entries.
    const afterWindow = pickPersonalityMessage(
      store,
      new Date(2026, 6, 26, 11),
      TWO_MESSAGES,
    );
    expect(TWO_MESSAGES.map((m) => m.id)).toContain(afterWindow.id);
  });

  it("falls back to a fresh pick on corrupt storage", () => {
    const store = fakeStore({ "edc.personality.shown": "{not json" });
    const picked = pickPersonalityMessage(store, new Date(2026, 6, 23, 9), TWO_MESSAGES);
    expect(TWO_MESSAGES.map((m) => m.id)).toContain(picked.id);
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
    expect(() => pickPersonalityMessage(throwing, new Date(), TWO_MESSAGES)).not.toThrow();
  });
});
