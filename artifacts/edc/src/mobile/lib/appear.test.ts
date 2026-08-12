import { describe, expect, it } from "vitest";
import { appearsOnSettle } from "./appear";

describe("appearsOnSettle", () => {
  it("fades on the loading -> settled edge", () => {
    expect(appearsOnSettle(true, false)).toBe(true);
  });

  it("does not fade while still loading", () => {
    expect(appearsOnSettle(true, true)).toBe(false);
    expect(appearsOnSettle(false, true)).toBe(false);
  });

  it("does not fade when the first render was already settled", () => {
    // A warm cache. The route transition is already animating this screen's
    // arrival, and a second animation on top of it is the "second load" reading
    // .m-appear exists to avoid — and it would start a shared-card morph target
    // at opacity 0.
    expect(appearsOnSettle(false, false)).toBe(false);
  });
});
