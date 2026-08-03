import { describe, it, expect } from "vitest";
import { pruneSelection } from "./selection";

describe("pruneSelection", () => {
  it("drops ids no longer present in the visible set", () => {
    // The bug this fixes: select two deals, then narrow a filter so those
    // deals scroll off screen — the bulk bar used to stay armed against them.
    const selected = new Set(["a", "b", "c"]);
    const result = pruneSelection(selected, ["b"]);
    expect([...result]).toEqual(["b"]);
  });

  it("keeps every id when all are still visible, regardless of order", () => {
    const selected = new Set(["a", "b"]);
    const result = pruneSelection(selected, ["b", "a", "z"]);
    expect(result).toBe(selected); // same reference — no re-render bait
  });

  it("returns the identical Set reference when nothing is dropped", () => {
    const selected = new Set(["a", "b"]);
    expect(pruneSelection(selected, ["a", "b", "c"])).toBe(selected);
  });

  it("returns a new Set (not the original) when something is dropped", () => {
    const selected = new Set(["a", "b"]);
    const result = pruneSelection(selected, ["a"]);
    expect(result).not.toBe(selected);
    expect([...result]).toEqual(["a"]);
  });

  it("an empty visible set drops everything", () => {
    const result = pruneSelection(new Set(["a", "b"]), []);
    expect(result.size).toBe(0);
  });

  it("an empty selection short-circuits to the same (empty) reference", () => {
    const selected = new Set<string>();
    expect(pruneSelection(selected, ["a", "b"])).toBe(selected);
  });

  it("a selection fully outside the visible set becomes empty", () => {
    const result = pruneSelection(new Set(["x", "y"]), ["a", "b"]);
    expect(result.size).toBe(0);
  });
});
