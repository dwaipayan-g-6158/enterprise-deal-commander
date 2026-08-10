import { describe, expect, it } from "vitest";
import {
  activeLensId,
  activeTabId,
  isLateralRoot,
  MOBILE_TABS,
  INTELLIGENCE_LENSES,
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
