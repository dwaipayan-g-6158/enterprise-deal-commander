import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  _resetScrollMemory,
  installScrollMemory,
  rememberScroll,
  restoreScroll,
} from "./scroll-memory";

/** Only `scrollTop` is ever touched, so a plain object is a faithful stand-in. */
function fakeContainer(scrollTop = 0) {
  return { scrollTop } as unknown as HTMLElement;
}

afterEach(() => _resetScrollMemory());

describe("scroll memory", () => {
  it("returns a reader to where they were", () => {
    const el = fakeContainer(420);
    installScrollMemory(el);

    rememberScroll(0);
    el.scrollTop = 0; // the next screen mounts at the top
    restoreScroll(0);

    expect(el.scrollTop).toBe(420);
  });

  it("sends a never-visited entry to the top", () => {
    const el = fakeContainer(300);
    installScrollMemory(el);
    restoreScroll(7);
    expect(el.scrollTop).toBe(0);
  });

  it("keeps one position per history index", () => {
    const el = fakeContainer();
    installScrollMemory(el);

    el.scrollTop = 100;
    rememberScroll(0);
    el.scrollTop = 250;
    rememberScroll(1);

    restoreScroll(0);
    expect(el.scrollTop).toBe(100);
    restoreScroll(1);
    expect(el.scrollTop).toBe(250);
  });

  it("records where the reader IS, so capturing after the commit records zero", () => {
    // This is the shape of the bug that shipped, written out. The container is
    // shared by every screen, so once the incoming screen has committed it is
    // already scrolled to that screen's position — and capturing then stores the
    // arrival, not the departure.
    const el = fakeContainer(420);
    installScrollMemory(el);

    el.scrollTop = 0; // incoming screen committed
    rememberScroll(0); // ...and only now captured — too late
    el.scrollTop = 999;
    restoreScroll(0);

    expect(el.scrollTop).toBe(0);
  });
});

describe("both navigation paths capture before they move", () => {
  const LIB = import.meta.dirname;
  const NAV_TRANSITION = readFileSync(join(LIB, "nav-transition.ts"), "utf8");
  const BACK_GESTURE = readFileSync(join(LIB, "back-gesture.ts"), "utf8");

  /**
   * The regression this pins.
   *
   * `nav-transition.ts` called `rememberScroll(from.index)` in `runTransition`'s
   * AFTER-COMMIT callback — the same slot `back-gesture.ts` uses to *restore*
   * scroll. By then React had committed the incoming screen and the shared
   * container was already at that screen's position, so every forward navigation
   * stored 0 against the entry it was leaving, and back always landed at the top.
   *
   * Measured on the deployed app: Command Center scrolled to 420, pushed into a
   * panel, went back, read 0.
   *
   * `back-gesture.ts` had it right the whole time, which is what made the two
   * paths disagree.
   */
  it("nav-transition remembers the outgoing scroll before starting the transition", () => {
    // Scoped to aroundNav's body: `runTransition` is also imported and declared
    // earlier in the file, and matching either of those compares against the
    // wrong offset — which is how the first draft of this test failed against a
    // correct implementation.
    const body = NAV_TRANSITION.slice(NAV_TRANSITION.indexOf("export function aroundNav"));
    expect(body, "aroundNav should still be here").not.toBe("");

    const remember = body.indexOf("rememberScroll(");
    const transition = body.indexOf("runTransition(");

    expect(remember, "aroundNav should still record scroll").toBeGreaterThan(-1);
    expect(transition, "aroundNav should still run a transition").toBeGreaterThan(-1);
    expect(
      remember,
      "rememberScroll must run BEFORE runTransition — inside its callbacks the container has already moved",
    ).toBeLessThan(transition);
  });

  it("back-gesture remembers before the pop is allowed to proceed", () => {
    const remember = BACK_GESTURE.indexOf("rememberScroll(");
    const restore = BACK_GESTURE.indexOf("restoreScroll(");

    expect(remember).toBeGreaterThan(-1);
    expect(remember, "the departure must be captured before the arrival is restored").toBeLessThan(
      restore,
    );
  });
});
