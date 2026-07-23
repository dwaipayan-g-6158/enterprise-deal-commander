import { describe, it, expect } from "vitest";
import {
  DEFAULT_ROW_ORDER,
  getRowOrder,
  saveRowOrder,
  moveRow,
  resetRowOrder,
} from "./row-order";
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

describe("getRowOrder", () => {
  it("returns the default order when nothing is stored", () => {
    expect(getRowOrder(fakeStore())).toEqual(DEFAULT_ROW_ORDER);
  });

  it("returns a stored valid permutation as-is", () => {
    const reversed = [...DEFAULT_ROW_ORDER].reverse();
    const store = fakeStore({ "edc.dashboard.rowOrder": JSON.stringify(reversed) });
    expect(getRowOrder(store)).toEqual(reversed);
  });

  it("falls back to default when the stored value has a different length", () => {
    const store = fakeStore({
      "edc.dashboard.rowOrder": JSON.stringify(DEFAULT_ROW_ORDER.slice(0, 3)),
    });
    expect(getRowOrder(store)).toEqual(DEFAULT_ROW_ORDER);
  });

  it("falls back to default when the stored value has a duplicate id", () => {
    const bad = [...DEFAULT_ROW_ORDER.slice(0, -1), DEFAULT_ROW_ORDER[0]];
    const store = fakeStore({ "edc.dashboard.rowOrder": JSON.stringify(bad) });
    expect(getRowOrder(store)).toEqual(DEFAULT_ROW_ORDER);
  });

  it("falls back to default when the stored value contains an unknown id", () => {
    const bad = [...DEFAULT_ROW_ORDER.slice(0, -1), "not-a-real-row"];
    const store = fakeStore({ "edc.dashboard.rowOrder": JSON.stringify(bad) });
    expect(getRowOrder(store)).toEqual(DEFAULT_ROW_ORDER);
  });

  it("falls back to default on corrupt JSON", () => {
    const store = fakeStore({ "edc.dashboard.rowOrder": "{not json" });
    expect(getRowOrder(store)).toEqual(DEFAULT_ROW_ORDER);
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
    expect(() => getRowOrder(throwing)).not.toThrow();
    expect(getRowOrder(throwing)).toEqual(DEFAULT_ROW_ORDER);
  });
});

describe("saveRowOrder / getRowOrder round-trip", () => {
  it("persists and reads back a reordered array", () => {
    const store = fakeStore();
    const reordered = [...DEFAULT_ROW_ORDER].reverse();
    saveRowOrder(store, reordered);
    expect(getRowOrder(store)).toEqual(reordered);
  });

  it("never throws when the store throws", () => {
    const throwing: KeyValueStore = {
      getItem: () => null,
      setItem: () => {
        throw new Error("boom");
      },
    };
    expect(() => saveRowOrder(throwing, DEFAULT_ROW_ORDER)).not.toThrow();
  });
});

describe("moveRow", () => {
  it("moves a row up by one position", () => {
    const order = ["a", "b", "c"];
    expect(moveRow(order, "b", "up")).toEqual(["b", "a", "c"]);
  });

  it("moves a row down by one position", () => {
    const order = ["a", "b", "c"];
    expect(moveRow(order, "b", "down")).toEqual(["a", "c", "b"]);
  });

  it("no-ops moving the first row up", () => {
    const order = ["a", "b", "c"];
    expect(moveRow(order, "a", "up")).toEqual(order);
  });

  it("no-ops moving the last row down", () => {
    const order = ["a", "b", "c"];
    expect(moveRow(order, "c", "down")).toEqual(order);
  });

  it("no-ops on an id that isn't present", () => {
    const order = ["a", "b", "c"];
    expect(moveRow(order, "z", "up")).toEqual(order);
  });
});

describe("resetRowOrder", () => {
  it("clears the stored override so getRowOrder falls back to default", () => {
    const store = fakeStore({
      "edc.dashboard.rowOrder": JSON.stringify([...DEFAULT_ROW_ORDER].reverse()),
    });
    resetRowOrder(store);
    expect(getRowOrder(store)).toEqual(DEFAULT_ROW_ORDER);
  });
});
