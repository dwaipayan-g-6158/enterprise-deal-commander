import { describe, it, expect } from "vitest";
import { pickButtonAnchor, type ButtonAnchorCandidate } from "./catalyst-iframe-autosize";

function candidate(over: Partial<ButtonAnchorCandidate> = {}): ButtonAnchorCandidate {
  return { bottom: 300, width: 338, height: 44, rendered: true, ...over };
}

describe("pickButtonAnchor", () => {
  it("returns the lowest qualifying button", () => {
    expect(
      pickButtonAnchor([candidate({ bottom: 180 }), candidate({ bottom: 420 }), candidate({ bottom: 260 })]),
    ).toBe(420);
  });

  it("ignores buttons Zoho has hidden between steps", () => {
    // Every step's controls stay in the DOM; only the active ones are laid out.
    // Counting a hidden one would size the frame for a step that isn't showing.
    expect(
      pickButtonAnchor([candidate({ bottom: 260 }), candidate({ bottom: 900, rendered: false })]),
    ).toBe(260);
  });

  it("ignores decorative or collapsed controls below the size floor", () => {
    expect(pickButtonAnchor([candidate({ bottom: 500, width: 20 })])).toBeNull();
    expect(pickButtonAnchor([candidate({ bottom: 500, height: 8 })])).toBeNull();
    // The real button still wins when a tiny one sits lower.
    expect(
      pickButtonAnchor([candidate({ bottom: 300 }), candidate({ bottom: 700, width: 12, height: 12 })]),
    ).toBe(300);
  });

  it("rejects non-positive bottoms", () => {
    // Zoho parks inactive rows off the top (negative coords) rather than
    // unmounting them.
    expect(pickButtonAnchor([candidate({ bottom: 0 }), candidate({ bottom: -100 })])).toBeNull();
  });

  it("returns null for an empty set so the caller can fall back", () => {
    expect(pickButtonAnchor([])).toBeNull();
  });

  it("accepts a button pushed far down by body scroll", () => {
    // The measurement is body-relative precisely so this stays correct after
    // Zoho auto-scrolls its own body on OTP focus.
    expect(pickButtonAnchor([candidate({ bottom: 44 + 100 })])).toBe(144);
  });
});
