import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  activeLensId,
  activeTabId,
  hidesCommander,
  isLateralMove,
  isLateralRoot,
  MOBILE_TABS,
  INTELLIGENCE_LENSES,
  pathnameOf,
} from "./mobile-nav";

/**
 * activeTabId has real branching — longest-prefix-wins across a tab that owns
 * three prefixes — and shipped for four phases with no test. The bar answering
 * "where am I" wrongly is a small bug that is felt on every single navigation.
 */

describe("activeTabId", () => {
  it("lights the tab that owns each root", () => {
    expect(activeTabId("/")).toBe("command");
    expect(activeTabId("/deals")).toBe("deals");
    expect(activeTabId("/analytics")).toBe("intelligence");
    expect(activeTabId("/memory")).toBe("memory");
  });

  it("keeps a tab lit from any depth beneath it", () => {
    expect(activeTabId("/deals/abc")).toBe("deals");
    expect(activeTabId("/deals/abc/gates")).toBe("deals");
    expect(activeTabId("/memory/xyz/timeline")).toBe("memory");
    expect(activeTabId("/analytics/flow")).toBe("intelligence");
  });

  it("lights Intelligence from all three of its lenses", () => {
    // The whole point of the merge: Portfolio and Autopsy keep their real
    // desktop URLs, so deep links stay valid, but they are not their own tabs.
    expect(activeTabId("/portfolio")).toBe("intelligence");
    expect(activeTabId("/portfolio/alerts")).toBe("intelligence");
    expect(activeTabId("/autopsy")).toBe("intelligence");
    expect(activeTabId("/autopsy/archetypes")).toBe("intelligence");
  });

  it("does not let Command swallow every path", () => {
    // "/" is a prefix of literally everything, so longest-prefix-wins is what
    // stops the Command tab staying lit across the whole app.
    expect(activeTabId("/deals")).not.toBe("command");
    expect(activeTabId("/memory/abc")).not.toBe("command");
  });

  it("lights nothing for the account surfaces", () => {
    // Reached from the avatar, not the bar. Lighting a tab there would tell the
    // reader they are somewhere they are not.
    expect(activeTabId("/account")).toBeUndefined();
    expect(activeTabId("/settings/users")).toBeUndefined();
    expect(activeTabId("/login")).toBeUndefined();
  });

  it("is not fooled by a path that merely starts with a tab's name", () => {
    // A lookalike lights NOTHING rather than falling back to Command, because
    // "/" is matched exactly rather than as a prefix. That is the right answer
    // twice over: /dealsomething is not inside Deals, and it is not the Command
    // Center either — an unknown route should not claim to be somewhere.
    expect(activeTabId("/dealsomething")).toBeUndefined();
    expect(activeTabId("/analytics-archive")).toBeUndefined();
  });
});

describe("isLateralRoot", () => {
  it("covers every tab root and every Intelligence lens", () => {
    for (const path of ["/", "/deals", "/analytics", "/portfolio", "/autopsy", "/memory"]) {
      expect(isLateralRoot(path), path).toBe(true);
    }
  });

  it("excludes anything below a root", () => {
    // A push into a detail screen has a hierarchy; movement between peers does
    // not. Getting this wrong animates a drill-down as a cross-fade.
    expect(isLateralRoot("/deals/abc")).toBe(false);
    expect(isLateralRoot("/analytics/flow")).toBe(false);
    expect(isLateralRoot("/account")).toBe(false);
  });

  it("still recognises a root carrying a query string", () => {
    // wouter hands aroundNav whatever was passed to navigate(), so a filtered
    // list arrives as "/deals?h=RED". Without stripping, a tab root stopped
    // being recognised as one the moment it carried a filter.
    expect(isLateralRoot("/deals?h=RED")).toBe(true);
    expect(isLateralRoot("/memory?q=acme")).toBe(true);
  });
});

describe("pathnameOf", () => {
  it("drops the query and the hash", () => {
    expect(pathnameOf("/deals?h=RED&v=SLOW")).toBe("/deals");
    expect(pathnameOf("/deals#top")).toBe("/deals");
    expect(pathnameOf("/deals?q=a#top")).toBe("/deals");
  });

  it("leaves a bare path alone", () => {
    expect(pathnameOf("/deals/abc")).toBe("/deals/abc");
    expect(pathnameOf("/")).toBe("/");
  });
});

describe("isLateralMove", () => {
  it("treats a filter change as lateral, not as a step deeper", () => {
    // This is what lets the Deals screen push a real history entry per filter
    // change — so back undoes it and the URL stays shareable — without the
    // move animating as a push into a stack that does not exist.
    expect(isLateralMove("/deals", "/deals?h=RED")).toBe(true);
    expect(isLateralMove("/deals?h=RED", "/deals?v=STALLED")).toBe(true);
    expect(isLateralMove("/deals?h=RED", "/deals")).toBe(true);
  });

  it("keeps peer destinations lateral", () => {
    expect(isLateralMove("/deals", "/memory")).toBe(true);
    expect(isLateralMove("/analytics", "/portfolio")).toBe(true);
  });

  it("leaves a real drill-down to the history index", () => {
    expect(isLateralMove("/deals", "/deals/abc")).toBe(false);
    expect(isLateralMove("/deals/abc", "/deals/abc/gates")).toBe(false);
    // Same query, different deal: still a move between two screens.
    expect(isLateralMove("/deals/abc", "/deals/def")).toBe(false);
  });

  it("is symmetric for peers and same-path moves", () => {
    for (const [a, b] of [
      ["/deals", "/memory"],
      ["/deals", "/deals?h=RED"],
    ]) {
      expect(isLateralMove(a, b)).toBe(isLateralMove(b, a));
    }
  });
});

describe("the tab set itself", () => {
  it("is four tabs, because a fifth shrinks every target", () => {
    expect(MOBILE_TABS).toHaveLength(4);
  });

  it("gives every tab an href its own prefixes cover", () => {
    // A tab whose href does not light itself is unreachable-looking: you tap it
    // and the bar shows you somewhere else.
    for (const tab of MOBILE_TABS) {
      expect(activeTabId(tab.href), tab.id).toBe(tab.id);
    }
  });

  it("never lets two tabs claim the same path", () => {
    const seen = new Set<string>();
    for (const tab of MOBILE_TABS) {
      for (const prefix of tab.prefixes) {
        expect(seen.has(prefix), `${prefix} claimed twice`).toBe(false);
        seen.add(prefix);
      }
    }
  });
});

describe("activeLensId", () => {
  it("names the lens for each Intelligence URL", () => {
    expect(activeLensId("/analytics")).toBe("pipeline");
    expect(activeLensId("/analytics/flow")).toBe("pipeline");
    expect(activeLensId("/portfolio")).toBe("portfolio");
    expect(activeLensId("/autopsy/product-gaps")).toBe("losses");
    expect(activeLensId("/deals")).toBeUndefined();
  });

  it("keeps every lens href inside the Intelligence tab", () => {
    for (const lens of INTELLIGENCE_LENSES) {
      expect(activeTabId(lens.href), lens.id).toBe("intelligence");
    }
  });
});

describe("hidesCommander", () => {
  it("stays off the screens that own their own thumb zone", () => {
    // Memory and the Deals list dock a search input there.
    expect(hidesCommander("/deals")).toBe(true);
    expect(hidesCommander("/memory")).toBe(true);
    expect(hidesCommander("/memory/ask")).toBe(true);
  });

  it("stays off Account and settings, where it is pure occlusion", () => {
    /**
     * The regression this pins.
     *
     * There is nothing on these screens to search or jump to, and the capsule
     * floats over the bottom of the content regardless. Measured on the deployed
     * app: `/account` at rest put the 48px Sign out row 28px under the tab bar
     * with the capsule over the remaining 20px, so NONE of it was tappable — a
     * tap at its centre switched to the Intelligence tab and one at its top edge
     * opened search. The only way out of the app had no working target.
     */
    expect(hidesCommander("/account")).toBe(true);
    for (const id of ["users", "change-log", "team", "targets", "achievements"]) {
      expect(hidesCommander(`/settings/${id}`), id).toBe(true);
    }
  });

  it("still shows on the screens whose verb it carries", () => {
    // Guard against a hide rule that quietly swallows the whole app.
    expect(hidesCommander("/")).toBe(false);
    expect(hidesCommander("/analytics")).toBe(false);
    expect(hidesCommander("/deals/abc")).toBe(false);
    expect(hidesCommander("/deals/abc/stage")).toBe(false);
  });

  it("ignores query and hash, which do not change the screen", () => {
    expect(hidesCommander("/deals?h=RED")).toBe(true);
    expect(hidesCommander("/account#top")).toBe(true);
  });
});

describe("the account screen keeps its destructive action out of the chrome band", () => {
  const SOURCE = readFileSync(
    join(import.meta.dirname, "..", "screens", "account", "account-screen.tsx"),
    "utf8",
  );

  it("puts Sign out above the engine-settings note", () => {
    // Ordering, not preference. This screen runs a little past the shell's
    // usable height, so its tail renders under the tab bar — and with Sign out
    // last, that tail WAS Sign out. Prose is what belongs in a band the chrome
    // covers: nothing is lost by not tapping it.
    const signOut = SOURCE.indexOf('title={signingOut ? "Signing out…" : "Sign out"}');
    const engine = SOURCE.indexOf('title="Engine settings"');

    expect(signOut, "Sign out should still be here").toBeGreaterThan(-1);
    expect(engine, "the engine-settings note should still be here").toBeGreaterThan(-1);
    expect(signOut, "Sign out must not be the last thing on the screen").toBeLessThan(engine);
  });
});
