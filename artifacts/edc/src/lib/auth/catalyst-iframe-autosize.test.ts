import { describe, it, expect } from "vitest";
import {
  pickButtonAnchor,
  pickScrollOffset,
  type ButtonAnchorCandidate,
} from "./catalyst-iframe-autosize";

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

  it("accepts a button pushed far down by scroll", () => {
    // The measurement is document-relative precisely so this stays correct
    // after Zoho auto-scrolls the frame on field focus.
    expect(pickButtonAnchor([candidate({ bottom: 44 + 100 })])).toBe(144);
  });
});

describe("pickScrollOffset", () => {
  it("reads the offset off the window when both element scrollTops are zero", () => {
    // THE regression case. Zoho's document is quirks mode and this app's
    // stylesheet hides the root's overflow, which together make
    // `document.scrollingElement` null and leave `scrollY` the only source
    // telling the truth. Measured live on the password step: the frame's own
    // viewport sat at 16 while both scrollTops read 0, so the frame measured
    // 16px short and clipped the top of the "<email> / Change" row.
    expect(
      pickScrollOffset({ viewScrollY: 16, documentElementScrollTop: 0, bodyScrollTop: 0 }),
    ).toBe(16);
  });

  it("falls back to the element offsets when the document has no window", () => {
    // A document detached from its view still has to measure; `defaultView` is
    // nullable and was the reason the original read an element in the first
    // place.
    expect(pickScrollOffset({ documentElementScrollTop: 40 })).toBe(40);
    // Quirks mode puts the viewport's scroll on `body`, not `documentElement` —
    // and the older shape of this bug (a `height: 100%` body scrolling its own
    // content) showed up here too, measured at 88.
    expect(pickScrollOffset({ documentElementScrollTop: 0, bodyScrollTop: 88 })).toBe(88);
  });

  it("prefers the window over the element offsets rather than summing them", () => {
    // In quirks mode `scrollY` and `body.scrollTop` are two views of the SAME
    // scroll. Adding them would double the correction and inflate the frame.
    expect(pickScrollOffset({ viewScrollY: 88, bodyScrollTop: 88 })).toBe(88);
  });

  it("reports zero for an unscrolled document", () => {
    expect(pickScrollOffset({ viewScrollY: 0, documentElementScrollTop: 0, bodyScrollTop: 0 })).toBe(0);
    expect(pickScrollOffset({})).toBe(0);
  });
});
