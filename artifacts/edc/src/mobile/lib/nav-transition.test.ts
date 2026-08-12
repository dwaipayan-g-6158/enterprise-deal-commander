import { describe, expect, it, vi, beforeEach } from "vitest";
import { aroundNav } from "./nav-transition";
import { readIndex } from "./history-index";

// node environment: no history, no document. Both are stubbed to exactly the
// surface aroundNav touches.
//
// document.startViewTransition is stubbed too, and deliberately runs its
// callback synchronously rather than being left absent: runTransition's OWN
// "!start" fallback also skips the animation, which would make both
// assertions pass whether or not the quiet path exists. The stub exists so
// the only thing skipping the animation here is isQuietMove.
const state: { value: unknown } = { value: null };
vi.stubGlobal("history", {
  get state() {
    return state.value;
  },
  replaceState: (s: unknown) => {
    state.value = s;
  },
});
vi.stubGlobal("location", { pathname: "/deals" });
vi.stubGlobal("window", { location: { pathname: "/deals" } });
vi.stubGlobal("document", {
  documentElement: { dataset: {} },
  startViewTransition: (update: () => void) => {
    update();
    return { finished: Promise.resolve() };
  },
});

/**
 * The quiet path must skip the ANIMATION and nothing else.
 *
 * The tempting shortcut is `navigate(to, { transition: false })`, which
 * aroundNav already understands — but that branch returns early and skips
 * stampIndex, so the replaced entry loses its __mIndex. currentIndex() then
 * falls back to 0, canPopWithinApp() reports false, and the back chevron
 * vanishes from every screen reached from a searched list.
 */
describe("aroundNav quiet path", () => {
  beforeEach(() => {
    state.value = { __mIndex: 3 };
  });

  it("still stamps the history index on a same-path replace", () => {
    const navigate = vi.fn();
    aroundNav(navigate, "/deals?q=acme", { replace: true });

    expect(navigate).toHaveBeenCalledTimes(1);
    const [to, options] = navigate.mock.calls[0];
    expect(to).toBe("/deals?q=acme");
    // A replace keeps the entry, so it keeps the index.
    expect(readIndex(options.state)).toBe(3);
  });

  it("does not mark a direction for a quiet move", () => {
    aroundNav(vi.fn(), "/deals?q=acme", { replace: true });
    expect(document.documentElement.dataset.mNav).toBeUndefined();
  });
});
