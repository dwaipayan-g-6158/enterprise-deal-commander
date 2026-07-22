import { describe, it, expect } from "vitest";
import { pickInsight } from "./insight-history";
import type { Insight } from "./insight-builder";
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

function insight(id: string, kind: Insight["kind"] = "pattern"): Insight {
  return { id, kind, text: `Text for ${id}` };
}

describe("pickInsight", () => {
  it("returns null for an empty candidate list", () => {
    const store = fakeStore();
    expect(pickInsight([], store, new Date())).toBeNull();
  });

  it("does not touch storage when candidates are empty", () => {
    const store = fakeStore();
    pickInsight([], store, new Date());
    expect(store.getItem("edc.insights.shown")).toBeNull();
  });

  it("picks the (only) candidate when there is no shown history", () => {
    const store = fakeStore();
    const candidates = [insight("a")];
    const result = pickInsight(candidates, store, new Date(), () => 0);
    expect(result?.id).toBe("a");
  });

  it("excludes an id shown within the last 48h", () => {
    const now = new Date("2026-07-22T12:00:00Z");
    const shownRecently = new Date("2026-07-22T06:00:00Z").toISOString(); // 6h ago
    const store = fakeStore({
      "edc.insights.shown": JSON.stringify([{ id: "a", shownAt: shownRecently }]),
    });
    const candidates = [insight("a"), insight("b")];
    // random() => 0 would pick index 0 of the *filtered* pool ["b"], proving "a" was excluded.
    const result = pickInsight(candidates, store, now, () => 0);
    expect(result?.id).toBe("b");
  });

  it("relaxes the dedup filter when every candidate has already been shown", () => {
    const now = new Date("2026-07-22T12:00:00Z");
    const shownRecently = new Date("2026-07-22T06:00:00Z").toISOString();
    const store = fakeStore({
      "edc.insights.shown": JSON.stringify([
        { id: "a", shownAt: shownRecently },
        { id: "b", shownAt: shownRecently },
      ]),
    });
    const candidates = [insight("a"), insight("b")];
    const result = pickInsight(candidates, store, now, () => 0);
    // Pool relaxed back to the full candidate list; random()=>0 picks index 0.
    expect(result?.id).toBe("a");
  });

  it("no longer excludes an id once its shown entry ages past 48h", () => {
    const now = new Date("2026-07-22T12:00:00Z");
    const shownLongAgo = new Date("2026-07-19T00:00:00Z").toISOString(); // 84h ago
    const store = fakeStore({
      "edc.insights.shown": JSON.stringify([{ id: "a", shownAt: shownLongAgo }]),
    });
    const candidates = [insight("a"), insight("b")];
    const result = pickInsight(candidates, store, now, () => 0);
    // "a"'s shown entry is stale (>48h), so it's back in the fresh pool at index 0.
    expect(result?.id).toBe("a");
  });

  it("records the pick so a subsequent call excludes it", () => {
    const now = new Date("2026-07-22T12:00:00Z");
    const store = fakeStore();
    const candidates = [insight("a"), insight("b")];
    const first = pickInsight(candidates, store, now, () => 0);
    expect(first?.id).toBe("a");
    // With "a" now recorded as shown, the next call's fresh pool is just ["b"].
    const second = pickInsight(candidates, store, now, () => 0);
    expect(second?.id).toBe("b");
  });

  it("never throws when storage getItem/setItem throw", () => {
    const throwingStore: KeyValueStore = {
      getItem: () => {
        throw new Error("boom");
      },
      setItem: () => {
        throw new Error("boom");
      },
    };
    const candidates = [insight("a")];
    expect(() => pickInsight(candidates, throwingStore, new Date())).not.toThrow();
    expect(pickInsight(candidates, throwingStore, new Date(), () => 0)?.id).toBe("a");
  });

  it("never throws on corrupted stored JSON, and treats history as empty", () => {
    const store = fakeStore({ "edc.insights.shown": "{not json" });
    const candidates = [insight("a"), insight("b")];
    const result = pickInsight(candidates, store, new Date(), () => 0);
    expect(result?.id).toBe("a");
  });
});
