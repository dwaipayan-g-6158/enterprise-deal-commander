import { describe, it, expect } from "vitest";
import { pickDailyQuote, type Quote } from "./quote-rotation";
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

const TWO_QUOTES: Quote[] = [
  { id: "a", text: "Quote A" },
  { id: "b", text: "Quote B" },
];

describe("pickDailyQuote", () => {
  it("returns a quote from the given pool", () => {
    const store = fakeStore();
    const picked = pickDailyQuote(store, new Date(2026, 6, 23, 9), TWO_QUOTES);
    expect(TWO_QUOTES.map((q) => q.id)).toContain(picked.id);
  });

  it("returns the same quote on repeated calls the same local day", () => {
    const store = fakeStore();
    const first = pickDailyQuote(store, new Date(2026, 6, 23, 9), TWO_QUOTES);
    const second = pickDailyQuote(store, new Date(2026, 6, 23, 20), TWO_QUOTES);
    expect(second.id).toBe(first.id);
  });

  it("picks the sole remaining unseen quote on the next day (pool of 2)", () => {
    const store = fakeStore();
    const day1 = pickDailyQuote(store, new Date(2026, 6, 23, 9), TWO_QUOTES);
    const day2 = pickDailyQuote(store, new Date(2026, 6, 24, 9), TWO_QUOTES);
    expect(day2.id).not.toBe(day1.id);
  });

  it("resets the exhaustion cycle once every quote has been shown", () => {
    const store = fakeStore();
    pickDailyQuote(store, new Date(2026, 6, 23, 9), TWO_QUOTES);
    pickDailyQuote(store, new Date(2026, 6, 24, 9), TWO_QUOTES);
    // Both ids have now been shown; day 3 must reset and pick from the full pool again.
    const day3 = pickDailyQuote(store, new Date(2026, 6, 25, 9), TWO_QUOTES);
    expect(TWO_QUOTES.map((q) => q.id)).toContain(day3.id);
    const raw = store.getItem("edc.quotes.shown");
    expect(raw).not.toBeNull();
    const state = JSON.parse(raw as string);
    expect(state.shownIds).toEqual([day3.id]);
  });

  it("falls back to a fresh pick on corrupt storage", () => {
    const store = fakeStore({ "edc.quotes.shown": "{not json" });
    const picked = pickDailyQuote(store, new Date(2026, 6, 23, 9), TWO_QUOTES);
    expect(TWO_QUOTES.map((q) => q.id)).toContain(picked.id);
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
    expect(() => pickDailyQuote(throwing, new Date(), TWO_QUOTES)).not.toThrow();
  });
});
