import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  adoptCompare,
  canCompare,
  clearCompare,
  compareSelection,
  decodeCompare,
  encodeCompare,
  MAX_COMPARE,
  MIN_COMPARE,
  nextSelection,
  subscribeCompare,
  toggleCompare,
} from "./compare-selection";

beforeEach(() => {
  clearCompare();
});

describe("nextSelection", () => {
  it("adds and removes", () => {
    expect(nextSelection([], "a")).toEqual(["a"]);
    expect(nextSelection(["a", "b"], "a")).toEqual(["b"]);
  });

  it("keeps selection order rather than sorting", () => {
    // The comparison's columns follow this order, so re-sorting here would
    // shuffle the columns under someone who picked them deliberately.
    expect(nextSelection(nextSelection(["c"], "a"), "b")).toEqual(["c", "a", "b"]);
  });

  it("ignores a pick past the cap instead of evicting one", () => {
    // Silently dropping the first pick to make room for a fifth is how somebody
    // concludes the app lost their selection.
    const full = ["a", "b", "c", "d"];
    expect(full).toHaveLength(MAX_COMPARE);
    expect(nextSelection(full, "e")).toEqual(full);
    // …and deselecting still works when full.
    expect(nextSelection(full, "b")).toEqual(["a", "c", "d"]);
  });

  it("never returns duplicates", () => {
    expect(nextSelection(["a"], "a")).toEqual([]);
  });
});

describe("the store", () => {
  it("starts empty and toggles", () => {
    expect(compareSelection()).toEqual([]);
    toggleCompare("a");
    expect(compareSelection()).toEqual(["a"]);
    toggleCompare("a");
    expect(compareSelection()).toEqual([]);
  });

  it("notifies subscribers on change", () => {
    const listener = vi.fn();
    const unsubscribe = subscribeCompare(listener);
    toggleCompare("a");
    expect(listener).toHaveBeenCalledTimes(1);
    unsubscribe();
    toggleCompare("b");
    expect(listener).toHaveBeenCalledTimes(1);
  });

  it("does not notify when clearing an already-empty selection", () => {
    // A no-op emit would re-render every card on the archive for nothing.
    const listener = vi.fn();
    const unsubscribe = subscribeCompare(listener);
    clearCompare();
    expect(listener).not.toHaveBeenCalled();
    unsubscribe();
  });

  it("adopts a selection from a URL", () => {
    adoptCompare(["a", "b"]);
    expect(compareSelection()).toEqual(["a", "b"]);
  });

  it("does not notify when adopting the selection it already holds", () => {
    // The comparison screen adopts from its own URL on every render pass. An
    // unconditional emit there would loop.
    adoptCompare(["a", "b"]);
    const listener = vi.fn();
    const unsubscribe = subscribeCompare(listener);
    adoptCompare(["a", "b"]);
    expect(listener).not.toHaveBeenCalled();
    unsubscribe();
  });

  it("caps and dedupes what it adopts", () => {
    adoptCompare(["a", "a", "b", "c", "d", "e"]);
    expect(compareSelection()).toEqual(["a", "b", "c", "d"]);
  });

  it("drops empty ids from a malformed URL", () => {
    adoptCompare(["", "a", ""]);
    expect(compareSelection()).toEqual(["a"]);
  });
});

describe("the URL codec", () => {
  it("round-trips", () => {
    expect(decodeCompare(encodeCompare(["a", "b"]))).toEqual(["a", "b"]);
  });

  it("survives whitespace, blanks and duplicates", () => {
    expect(decodeCompare(" a , ,b,a ")).toEqual(["a", "b"]);
  });

  it("returns nothing for a missing parameter", () => {
    expect(decodeCompare(null)).toEqual([]);
    expect(decodeCompare("")).toEqual([]);
  });

  it("caps what it decodes, so a hand-edited URL cannot widen the table", () => {
    expect(decodeCompare("a,b,c,d,e,f")).toHaveLength(MAX_COMPARE);
  });
});

describe("canCompare", () => {
  it("needs at least two", () => {
    expect(MIN_COMPARE).toBe(2);
    expect(canCompare([])).toBe(false);
    expect(canCompare(["a"])).toBe(false);
    expect(canCompare(["a", "b"])).toBe(true);
  });
});
