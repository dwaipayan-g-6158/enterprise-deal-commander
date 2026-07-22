import { describe, it, expect } from "vitest";
import { readAcked, toggleAck } from "./daily-ack";
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

function at(y: number, m: number, d: number, h = 9): Date {
  return new Date(y, m, d, h, 0, 0);
}

describe("readAcked", () => {
  it("returns an empty array when nothing is stored", () => {
    expect(readAcked(fakeStore(), at(2026, 6, 22))).toEqual([]);
  });

  it("returns an empty array for corrupted JSON", () => {
    const store = fakeStore({ "edc.mission.acked": "{not json" });
    expect(readAcked(store, at(2026, 6, 22))).toEqual([]);
  });

  it("returns an empty array when the stored payload is malformed (missing fields / wrong types)", () => {
    const store = fakeStore({ "edc.mission.acked": JSON.stringify({ ids: "not-an-array" }) });
    expect(readAcked(store, at(2026, 6, 22))).toEqual([]);
    const store2 = fakeStore({ "edc.mission.acked": JSON.stringify([1, 2, 3]) });
    expect(readAcked(store2, at(2026, 6, 22))).toEqual([]);
  });

  it("returns the stored ids when the date matches today's local date", () => {
    const store = fakeStore({
      "edc.mission.acked": JSON.stringify({ date: "2026-07-22", ids: ["a", "b"] }),
    });
    expect(readAcked(store, at(2026, 6, 22))).toEqual(["a", "b"]);
  });

  it("returns [] when the stored date is a different local date (resets at local midnight)", () => {
    const store = fakeStore({
      "edc.mission.acked": JSON.stringify({ date: "2026-07-21", ids: ["a", "b"] }),
    });
    expect(readAcked(store, at(2026, 6, 22))).toEqual([]);
  });
});

describe("toggleAck", () => {
  it("adds an id when it is not yet acked", () => {
    const store = fakeStore();
    const now = at(2026, 6, 22);
    toggleAck(store, "item-1", now);
    expect(readAcked(store, now)).toEqual(["item-1"]);
  });

  it("removes an id when it is already acked", () => {
    const store = fakeStore({
      "edc.mission.acked": JSON.stringify({ date: "2026-07-22", ids: ["item-1", "item-2"] }),
    });
    const now = at(2026, 6, 22);
    toggleAck(store, "item-1", now);
    expect(readAcked(store, now)).toEqual(["item-2"]);
  });

  it("starts a fresh ack set for a new local date rather than appending to a stale one", () => {
    const store = fakeStore({
      "edc.mission.acked": JSON.stringify({ date: "2026-07-21", ids: ["stale"] }),
    });
    const now = at(2026, 6, 22);
    toggleAck(store, "item-1", now);
    expect(readAcked(store, now)).toEqual(["item-1"]);
  });

  it("never throws even if the store itself throws", () => {
    const throwingStore: KeyValueStore = {
      getItem: () => {
        throw new Error("boom");
      },
      setItem: () => {
        throw new Error("boom");
      },
    };
    expect(() => toggleAck(throwingStore, "item-1", at(2026, 6, 22))).not.toThrow();
    expect(() => readAcked(throwingStore, at(2026, 6, 22))).not.toThrow();
  });
});
