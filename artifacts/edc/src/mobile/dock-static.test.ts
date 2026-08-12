import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { SRC } from "./module-graph";

/**
 * The docked bottom bars hold position while the list scrolls or pulls.
 *
 * This took three attempts and two of them were wrong in Chromium's favour, so
 * the invariants are pinned here rather than left to comments.
 *
 *   1. The dock took none of the pull and was reported as a stuck control on a
 *      short list, so it was given a damped copy of the content's transform.
 *   2. That was reported the other way round — a bar moving during what the user
 *      meant as a scroll — and reverted to no transform. Verified 0px in Chromium.
 *   3. **It was still moving on iOS Safari and in the installed PWA**, because the
 *      cause there is different and Chromium cannot show it: the bar was
 *      `position: fixed` while living inside `main`, the shell's scroll container.
 *      Chromium pins such an element to the viewport per spec; WebKit composites
 *      it into the scroller's layer, and `backdrop-filter` guarantees it gets its
 *      own layer to be promoted with.
 *
 * `MTabBar` never had the bug: same `.m-glass` backdrop, but `absolute` inside the
 * non-scrolling frame. `MDock` now does the same, portalling each bar out of the
 * scroller. So the guards are structural — no screen may place a docked bar
 * itself, and MDock may not use `fixed`.
 */

const MOBILE = join(SRC, "mobile");
const read = (rel: string) => readFileSync(join(MOBILE, rel), "utf8");
const strip = (s: string) =>
  s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

const DOCK = strip(read("shell/m-dock.tsx"));
const SHELL = strip(read("shell/m-shell.tsx"));
const PULL = strip(read("components/pull-to-refresh.tsx"));
const PHYSICS = strip(read("ui/pull-physics.ts"));

/** Every screen with a bar docked to the bottom of the shell. */
const DOCKED_SCREENS = [
  "screens/deals/deals-screen.tsx",
  "screens/memory/memory-screen.tsx",
  "screens/memory/ask-screen.tsx",
];

describe("the dock lives outside the scroll container", () => {
  it("is positioned absolute, like the tab bar, never fixed", () => {
    // The whole iOS fix in one assertion. `fixed` inside a scroller is what
    // WebKit composites with the list.
    expect(DOCK).toMatch(/absolute inset-x-0/);
    expect(DOCK).not.toMatch(/\bfixed\b/);
  });

  it("portals out of the screen subtree", () => {
    expect(DOCK).toContain("createPortal");
    expect(DOCK).toContain("useShellDockHost");
  });

  it("mounts its host as a sibling of main, not inside it", () => {
    /**
     * The host must sit between `</main>` and `<MTabBar />` — outside the
     * scroller and beside the one bottom bar that already behaves on iOS. If it
     * drifts back inside `main`, the portal is pointless.
     */
    const closeMain = SHELL.indexOf("</main>");
    const host = SHELL.indexOf("ref={setDockHost}");
    const tabBar = SHELL.indexOf("<MTabBar />");
    expect(closeMain).toBeGreaterThan(-1);
    expect(host, "dock host should exist").toBeGreaterThan(-1);
    expect(host, "dock host must be AFTER </main>").toBeGreaterThan(closeMain);
    expect(host, "dock host should sit before the tab bar").toBeLessThan(tabBar);
  });

  it("exposes the host through the shell, so screens cannot place a bar themselves", () => {
    expect(SHELL).toMatch(/export function useShellDockHost/);
    expect(SHELL).toMatch(/DockHostContext\.Provider/);
  });
});

describe("no screen places a docked bar of its own", () => {
  it.each(DOCKED_SCREENS)("%s uses MDock", (file) => {
    const source = strip(read(file));
    expect(source).toContain("<MDock");
    expect(source).toContain('from "@/mobile/shell/m-dock"');
  });

  it.each(DOCKED_SCREENS)("%s declares no fixed glass bar itself", (file) => {
    // `m-glass-bottom` plus `fixed` in a screen is the exact shape of the bug.
    const source = strip(read(file));
    for (const line of source.split("\n")) {
      if (!line.includes("m-glass-bottom")) continue;
      expect(line, `${file} should not position its own dock`).not.toMatch(/\bfixed\b/);
    }
  });

  it.each(DOCKED_SCREENS)("%s does not pass a position to MDock", (file) => {
    // MDock owns `absolute`; a caller adding `fixed` would silently reinstate
    // the WebKit bug, since Chromium would still look correct.
    const source = strip(read(file));
    const at = source.indexOf("<MDock");
    const openTag = source.slice(at, source.indexOf(">", at));
    expect(openTag).not.toMatch(/\bfixed\b/);
    expect(openTag).not.toMatch(/\babsolute\b/);
  });
});

describe("the pull no longer moves anything but the list", () => {
  it("has no dock prop left on PullToRefresh", () => {
    expect(PULL).not.toMatch(/dock\?:/);
    expect(PULL).not.toMatch(/\{dock\}/);
    expect(PULL).not.toContain("DOCK_PULL_RATIO");
  });

  it("keeps the pull ratio deleted rather than set to zero", () => {
    // A zero constant invites someone to tune it back up.
    expect(PHYSICS).not.toMatch(/export const DOCK_PULL_RATIO/);
  });

  it("still transforms the content, so the gesture itself survives", () => {
    expect(PULL).toMatch(/transform:\s*pull === 0 \? "none" : `translateY\(\$\{pull\}px\)`/);
  });
});
