import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  _resetScrollMemory,
  installScrollMemory,
  isProgrammaticScroll,
  markProgrammaticScroll,
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

/**
 * Telling the app's own scrolling apart from the reader's.
 *
 * The container cannot say who moved it, and everything downstream that reacts
 * to scroll has to know. The Commander capsule hides on downward scroll, so a
 * restore to 300px read as a deliberate 300px flick and took the capsule away
 * for its whole settle window on every back-navigation — measured on the
 * deployed build at ~420ms of opacity 0 from a single `scrollTop = 300`.
 */
describe("programmatic scroll marking", () => {
  it("is off until something claims a scroll", () => {
    expect(isProgrammaticScroll()).toBe(false);
  });

  it("reports the app's scrolling for the length of the window", () => {
    markProgrammaticScroll(50_000);
    expect(isProgrammaticScroll()).toBe(true);
  });

  it("expires, so the reader's next real gesture is judged normally", () => {
    // Zero-length: already expired by the time it is asked.
    markProgrammaticScroll(0);
    expect(isProgrammaticScroll()).toBe(false);
  });

  it("never shortens a window already in flight", () => {
    // A restore landing inside a smooth jump must not hand the rest of that
    // jump back to the reader — the jump is still emitting scroll events.
    markProgrammaticScroll(50_000);
    markProgrammaticScroll(0);
    expect(isProgrammaticScroll()).toBe(true);
  });

  it("restoreScroll claims its own scroll", () => {
    installScrollMemory(fakeContainer(0));
    expect(isProgrammaticScroll()).toBe(false);
    restoreScroll(3);
    expect(
      isProgrammaticScroll(),
      "the scroll event restoreScroll causes must already find the window open",
    ).toBe(true);
  });

  /**
   * Ordering, asserted against source: the mark has to be written BEFORE the
   * assignment that moves the container, or the event it produces arrives while
   * the window is still shut.
   */
  it("marks before it moves the container", () => {
    const source = readFileSync(join(import.meta.dirname, "scroll-memory.ts"), "utf8");
    const body = source.slice(source.indexOf("export function restoreScroll"));
    const mark = body.indexOf("markProgrammaticScroll(");
    const assign = body.indexOf("container.scrollTop =");
    expect(mark).toBeGreaterThan(-1);
    expect(mark, "mark must precede the assignment").toBeLessThan(assign);
  });
});

/** The consumer this exists for. */
describe("the Commander capsule", () => {
  const CAPSULE = readFileSync(
    join(import.meta.dirname, "..", "commander", "commander-button.tsx"),
    "utf8",
  );

  it("stands down while the app is the one scrolling", () => {
    expect(CAPSULE).toMatch(/isProgrammaticScroll\(\)/);
  });

  it("resyncs its origin rather than just skipping, so the next gesture measures true", () => {
    // Returning without updating lastYRef would leave the origin at the
    // pre-jump position, and the reader's next small scroll would then look
    // like the whole jump.
    const guard = CAPSULE.slice(CAPSULE.indexOf("isProgrammaticScroll()"));
    const resync = guard.indexOf("lastYRef.current = y");
    const ret = guard.indexOf("return;");
    expect(resync).toBeGreaterThan(-1);
    expect(resync, "resync must happen before the early return").toBeLessThan(ret);
  });

  it("is consulted before the hysteresis check, not after", () => {
    // After the check, a jump smaller than the threshold would still be judged.
    const body = CAPSULE.slice(CAPSULE.indexOf("const onScroll"));
    expect(body.indexOf("isProgrammaticScroll()")).toBeLessThan(body.indexOf("HYSTERESIS_PX"));
  });
});
