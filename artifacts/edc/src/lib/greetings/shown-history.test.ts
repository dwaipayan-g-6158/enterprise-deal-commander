import { describe, it, expect } from "vitest";
import { readShownHistory, recordShown } from "./shown-history";
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

describe("readShownHistory", () => {
  it("returns an empty array when nothing is stored", () => {
    expect(readShownHistory(fakeStore(), new Date())).toEqual([]);
  });

  it("returns an empty array for corrupted JSON", () => {
    const store = fakeStore({ "edc.greetings.shown": "{not json" });
    expect(readShownHistory(store, new Date())).toEqual([]);
  });

  it("prunes entries older than 48 hours", () => {
    const now = new Date("2026-07-21T12:00:00Z");
    const old = new Date("2026-07-19T00:00:00Z").toISOString(); // 60h ago
    const recent = new Date("2026-07-21T00:00:00Z").toISOString(); // 12h ago
    const store = fakeStore({
      "edc.greetings.shown": JSON.stringify([
        { id: "old-1", shownAt: old },
        { id: "recent-1", shownAt: recent },
      ]),
    });
    expect(readShownHistory(store, now)).toEqual([
      { id: "recent-1", shownAt: recent },
    ]);
  });
});

describe("recordShown", () => {
  it("appends a new entry and prunes stale ones on write", () => {
    const now = new Date("2026-07-21T12:00:00Z");
    const old = new Date("2026-07-19T00:00:00Z").toISOString();
    const store = fakeStore({
      "edc.greetings.shown": JSON.stringify([{ id: "old-1", shownAt: old }]),
    });
    recordShown(store, "new-1", now);
    expect(readShownHistory(store, now)).toEqual([
      { id: "new-1", shownAt: now.toISOString() },
    ]);
  });
});
