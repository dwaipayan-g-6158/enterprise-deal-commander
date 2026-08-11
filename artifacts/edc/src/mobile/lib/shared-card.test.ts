import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  _resetSharedCard,
  armSharedCard,
  armSharedReturn,
  disarmSharedCard,
  isSharedCardArmed,
  registerReturnSource,
  sharedCardSeed,
} from "./shared-card";
import { _resetScrollMemory, installScrollMemory, rememberScroll } from "./scroll-memory";
import { SRC } from "../module-graph";

/**
 * The reverse morph.
 *
 * Forward has worked since the shell shipped; back was disabled because "the
 * list remounts at the top of its scroll" and there was nothing where the hero
 * would land. Scroll restoration removed that, and these are the conditions
 * under which arming the return is safe — every one of them exists to avoid the
 * failure the memory card's own comment names: a part with nothing to morph
 * into animates out on its own and reads as a glitch.
 */

/** vitest runs `environment: "node"`, so the DOM this module touches is faked. */
interface FakeEl {
  style: { viewTransitionName?: string };
  dataset: { sharedPart?: string };
  querySelectorAll: () => FakeEl[];
  scrollTop?: number;
}

function fakeEl(parts: string[] = []): FakeEl {
  const children: FakeEl[] = parts.map((part) => ({
    style: {},
    dataset: { sharedPart: part },
    querySelectorAll: () => [],
  }));
  return { style: {}, dataset: {}, querySelectorAll: () => children };
}

function asElement(el: FakeEl): HTMLElement {
  return el as unknown as HTMLElement;
}

/**
 * Registers `id`'s hero exactly as useSharedReturnSource's ref callback does —
 * the hook is a `useCallback` over this same function, so testing through it
 * would add a renderer without adding coverage.
 */
function registerHero(id: string, el: FakeEl) {
  registerReturnSource(id, asElement(el));
}

beforeEach(() => {
  // supportsViewTransitions() reads document.startViewTransition; without it
  // every arm short-circuits and the positive cases below cannot be reached.
  (globalThis as { document?: unknown }).document = { startViewTransition: () => {} };
  _resetSharedCard();
  _resetScrollMemory();
});

afterEach(() => {
  delete (globalThis as { document?: unknown }).document;
});

/** The scroll container, so hasRememberedScroll has something to record. */
function haveVisited(index: number) {
  installScrollMemory(asElement({ ...fakeEl(), scrollTop: 240 }));
  rememberScroll(index);
}

describe("armSharedCard", () => {
  it("stamps the leaving card and every part it declares", () => {
    const card = fakeEl(["eyebrow", "title", "value"]);
    armSharedCard("d1", { eyebrow: "Acme", title: "Renewal", value: "$1.4M" }, asElement(card));

    expect(card.style.viewTransitionName).toBe("m-shared-card");
    expect(card.querySelectorAll().map((c) => c.style.viewTransitionName)).toEqual([
      "m-shared-eyebrow",
      "m-shared-title",
      "m-shared-value",
    ]);
    expect(isSharedCardArmed("d1")).toBe(true);
    expect(sharedCardSeed("d1")?.title).toBe("Renewal");
  });

  it("ignores parts it does not know, rather than naming them", () => {
    // An unknown name would be a name with no counterpart on the other side.
    const card = fakeEl(["title", "sparkline"]);
    armSharedCard("d1", { eyebrow: "", title: "", value: "" }, asElement(card));
    expect(card.querySelectorAll()[1].style.viewTransitionName).toBeUndefined();
  });
});

describe("armSharedReturn", () => {
  it("does nothing when no hero is on screen", () => {
    haveVisited(0);
    expect(armSharedReturn(0)).toBe(false);
    expect(isSharedCardArmed("d1")).toBe(false);
  });

  /**
   * The guard that matters most in practice: going back to a screen never
   * visited means the list arrives as a shimmer, nothing claims the names, and
   * the browser animates the hero out alone — flying to nothing.
   */
  it("does nothing when the destination has never been visited", () => {
    const hero = fakeEl(["title"]);
    registerHero("d1", hero);
    expect(armSharedReturn(7)).toBe(false);
    expect(hero.style.viewTransitionName).toBeUndefined();
  });

  it("stands down when two heroes are mounted at once", () => {
    // React briefly holds both screens during a transition; arming then would
    // pick whichever the map happened to yield first.
    haveVisited(0);
    registerHero("d1", fakeEl(["title"]));
    registerHero("d2", fakeEl(["title"]));
    expect(armSharedReturn(0)).toBe(false);
  });

  it("stamps the hero and arms its id when everything lines up", () => {
    haveVisited(0);
    const hero = fakeEl(["eyebrow", "title", "value"]);
    registerHero("d1", hero);

    expect(armSharedReturn(0)).toBe(true);
    expect(hero.style.viewTransitionName).toBe("m-shared-card");
    expect(hero.querySelectorAll().map((c) => c.style.viewTransitionName)).toEqual([
      "m-shared-eyebrow",
      "m-shared-title",
      "m-shared-value",
    ]);
    expect(isSharedCardArmed("d1")).toBe(true);
  });

  it("drops the outbound seed, which describes the wrong direction", () => {
    haveVisited(0);
    const hero = fakeEl(["title"]);
    armSharedCard("d1", { eyebrow: "Acme", title: "Renewal", value: "$1.4M" }, asElement(hero));
    registerHero("d1", hero);

    armSharedReturn(0);
    expect(sharedCardSeed("d1")).toBeNull();
  });

  it("does nothing without view-transition support", () => {
    delete (globalThis as { document?: unknown }).document;
    haveVisited(0);
    const hero = fakeEl(["title"]);
    registerHero("d1", hero);

    expect(armSharedReturn(0)).toBe(false);
    // Nothing would ever clear a name written on an engine that cannot animate.
    expect(hero.style.viewTransitionName).toBeUndefined();
  });
});

describe("disarmSharedCard", () => {
  it("releases the name so a later navigation does not find two claimants", () => {
    haveVisited(0);
    registerHero("d1", fakeEl(["title"]));
    armSharedReturn(0);
    disarmSharedCard();
    expect(isSharedCardArmed("d1")).toBe(false);
  });
});

/**
 * Ordering, asserted against source because there is no runtime seam for it.
 *
 * startViewTransition captures the OLD snapshot the moment it is called, so a
 * name written after `runTransition` is a name the outgoing frame never had —
 * the morph silently degrades to a plain slide and nothing anywhere errors.
 */
describe("both navigation paths arm before the snapshot", () => {
  const NAV = readFileSync(join(SRC, "mobile", "lib", "nav-transition.ts"), "utf8");
  const BACK = readFileSync(join(SRC, "mobile", "lib", "back-gesture.ts"), "utf8");

  /**
   * Counted, not just located. `indexOf` finds the FIRST call, so a correct
   * early arm plus a stray late one inside runTransition's own callbacks would
   * satisfy a position check while doing exactly the wrong thing on the second
   * path — which is how the first draft of this test passed against a deliberately
   * broken implementation. scroll-memory.test.ts records the same trap.
   */
  function armOffsets(body: string) {
    const calls = [...body.matchAll(/armSharedReturn\(/g)].map((m) => m.index ?? -1);
    return { calls, transition: body.indexOf("runTransition(") };
  }

  it("aroundNav arms exactly once, before it starts the transition", () => {
    const { calls, transition } = armOffsets(NAV.slice(NAV.indexOf("export function aroundNav")));
    expect(calls, "aroundNav should arm the return exactly once").toHaveLength(1);
    expect(calls[0], "arming must precede the snapshot").toBeLessThan(transition);
  });

  it("back-gesture arms exactly once, before it starts the transition", () => {
    const { calls, transition } = armOffsets(BACK.slice(BACK.indexOf("function onPopState")));
    expect(calls, "onPopState should arm the return exactly once").toHaveLength(1);
    expect(calls[0], "arming must precede the snapshot").toBeLessThan(transition);
  });

  /**
   * And AFTER the bail-outs. Under reduced motion, without view transitions, or
   * while Chromium drives its own predictive-back preview, there is no
   * transition to attach a morph to — stamping there leaves names on an element
   * that nothing will ever clean up.
   */
  it("back-gesture arms only once it has committed to animating", () => {
    const body = BACK.slice(BACK.indexOf("function onPopState"));
    const bailout = body.indexOf("hasUAVisualTransition");
    const arm = body.indexOf("armSharedReturn(");
    expect(bailout).toBeGreaterThan(-1);
    expect(arm, "arming must come after the stand-down checks").toBeGreaterThan(bailout);
  });
});
