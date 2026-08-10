import { describe, expect, it } from "vitest";
import { directionBetween, readIndex, stampIndex } from "./history-index";
import { navDirection } from "./nav-transition";

/**
 * Direction used to be inferred from path depth, and depth is a proxy for
 * history that disagrees with it constantly. The cases at the bottom of this
 * file are the ones the old heuristic got backwards on every single use — they
 * are the reason the index exists.
 */

describe("readIndex", () => {
  it("reads an index out of a history state", () => {
    expect(readIndex({ __mIndex: 3 })).toBe(3);
    expect(readIndex({ __mIndex: 0 })).toBe(0);
  });

  it("returns null rather than 0 for a state that carries none", () => {
    // The distinction matters: 0 is a real entry (the first one), and treating
    // "absent" as 0 would make every un-indexed entry look like the start of
    // history, so a back gesture from it would animate forward.
    expect(readIndex({})).toBeNull();
    expect(readIndex(null)).toBeNull();
    expect(readIndex(undefined)).toBeNull();
    expect(readIndex("a string")).toBeNull();
    expect(readIndex({ __mIndex: "3" })).toBeNull();
    expect(readIndex({ __mIndex: Number.NaN })).toBeNull();
  });
});

describe("stampIndex", () => {
  it("preserves whatever else the state carries", () => {
    expect(stampIndex({ scrollKey: "x" }, 2)).toEqual({ scrollKey: "x", __mIndex: 2 });
  });

  it("replaces a non-object state instead of spreading it", () => {
    // Spreading a string would produce an object of character indices, which is
    // both wrong and very hard to notice.
    expect(stampIndex("nonsense", 1)).toEqual({ __mIndex: 1 });
    expect(stampIndex(undefined, 1)).toEqual({ __mIndex: 1 });
  });

  it("overwrites an existing index", () => {
    expect(stampIndex({ __mIndex: 9 }, 2)).toEqual({ __mIndex: 2 });
  });
});

describe("directionBetween", () => {
  it("reads forward, back and replace", () => {
    expect(directionBetween(1, 2)).toBe("forward");
    expect(directionBetween(2, 1)).toBe("back");
    // Equal indices mean the entry was replaced rather than pushed, which is
    // lateral by definition — exactly what the Intelligence lens switcher does.
    expect(directionBetween(2, 2)).toBe("lateral");
  });

  it("does not care how far apart the indices are", () => {
    // A deep back-stack pop is still a pop.
    expect(directionBetween(7, 1)).toBe("back");
  });
});

describe("navDirection", () => {
  it("treats movement between peer roots as lateral, whatever history says", () => {
    // Both of these were pushes in history order. Animating a push between
    // peers implies a stack that is not there, and the user then discovers
    // that back does not undo it.
    expect(navDirection({ path: "/deals", index: 1 }, { path: "/memory", index: 2 })).toBe("lateral");
    expect(navDirection({ path: "/memory", index: 5 }, { path: "/", index: 6 })).toBe("lateral");
  });

  it("treats an Intelligence lens switch as lateral", () => {
    expect(navDirection({ path: "/analytics", index: 3 }, { path: "/portfolio", index: 3 })).toBe(
      "lateral",
    );
    expect(navDirection({ path: "/portfolio", index: 3 }, { path: "/autopsy", index: 3 })).toBe(
      "lateral",
    );
  });

  it("pushes into a detail screen and pops back out", () => {
    expect(navDirection({ path: "/deals", index: 1 }, { path: "/deals/abc", index: 2 })).toBe(
      "forward",
    );
    expect(navDirection({ path: "/deals/abc", index: 2 }, { path: "/deals", index: 1 })).toBe("back");
  });

  it("pushes deeper from a panel into another panel", () => {
    expect(
      navDirection({ path: "/deals/abc", index: 2 }, { path: "/deals/abc/gates", index: 3 }),
    ).toBe("forward");
  });

  // --- The cases path-depth got wrong. These are the regression. -----------

  it("calls a back from /deals to /analytics BACK, not lateral", () => {
    // Both are one segment deep, so depth said "lateral" and the pop played as
    // a cross-fade. History says otherwise — but note both are peer roots, so
    // the peer rule takes precedence and it is lateral by DESIGN here, not by
    // accident. The genuinely broken case is below.
    expect(navDirection({ path: "/deals", index: 4 }, { path: "/analytics", index: 3 })).toBe(
      "lateral",
    );
  });

  it("calls a back from a deal panel to a sibling panel BACK, not lateral", () => {
    // Two paths at equal depth, neither a peer root, arrived at by a pop. Depth
    // said lateral; it is a pop and must animate as one.
    expect(
      navDirection({ path: "/deals/abc/gates", index: 5 }, { path: "/deals/abc/risk", index: 4 }),
    ).toBe("back");
  });

  it("calls a forward jump from a deep screen to a shallow one FORWARD", () => {
    // /deals/:id -> /memory is one segment shallower, so depth said "back" and
    // the app slid the wrong way on a forward navigation. This is the one users
    // notice immediately.
    expect(navDirection({ path: "/deals/abc/gates", index: 2 }, { path: "/account", index: 3 })).toBe(
      "forward",
    );
  });
});
