import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { SRC } from "./module-graph";

/**
 * The docked search bars hold position during a pull-to-refresh.
 *
 * This has now been reported in BOTH directions on the same screen, which is why
 * it is pinned by a test rather than left to a comment:
 *
 *   1. The dock originally took none of the pull and was reported as a stuck
 *      control, so it was given a damped copy of the content's transform.
 *   2. That was reported the other way round — the bar moving on what the user
 *      intended as a scroll — and reverted to static.
 *
 * What the first fix missed is that **Deals has no scroll range**: a typical
 * pipeline underfills the viewport, so `scrollHeight === clientHeight` and
 * pull-to-refresh arms on every downward drag. Measured on the deployed app at
 * 390x844: Deals 0px of scroll, Memory 959px, both moving the dock 24px on the
 * same gesture. Identical code; only the odds of entering the gesture differ.
 *
 * So the guard is not "the ratio is 0" — it is that the dock is handed no
 * transform at all, and that it still renders outside the transformed element.
 */

const MOBILE = join(SRC, "mobile");
const read = (rel: string) => readFileSync(join(MOBILE, rel), "utf8");

const PULL = stripComments(read("components/pull-to-refresh.tsx"));
const PHYSICS = stripComments(read("ui/pull-physics.ts"));
const DOCKED_SCREENS = ["screens/deals/deals-screen.tsx", "screens/memory/memory-screen.tsx"];

describe("the docked bars do not move with the pull", () => {
  it("hands the dock no transform", () => {
    // The content gets one; the dock must not. A `translateY` anywhere near the
    // dock render is the regression this exists to catch.
    const at = PULL.indexOf("{dock}");
    expect(at, "PullToRefresh should render {dock} directly").toBeGreaterThan(-1);
    expect(PULL).not.toMatch(/dock\?\.\(/);
    expect(PULL).not.toContain("DOCK_PULL_RATIO");
  });

  it("keeps the ratio deleted rather than set to zero", () => {
    // A zero constant invites someone to "just tune it a little", which is how
    // this became a round trip the first time.
    expect(PHYSICS).not.toMatch(/export const DOCK_PULL_RATIO/);
  });

  it("takes the dock as a node, not a style callback", () => {
    expect(PULL).toMatch(/dock\?:\s*ReactNode/);
  });

  it.each(DOCKED_SCREENS)("%s passes a plain node and no inline style", (file) => {
    const source = stripComments(read(file));
    const dockAt = source.indexOf("dock={");
    expect(dockAt, `${file} should still dock its search bar`).toBeGreaterThan(-1);
    const dockBlock = source.slice(dockAt, dockAt + 900);
    expect(dockBlock, "no pullStyle callback").not.toMatch(/\(pullStyle\)|style=\{pullStyle\}/);
  });

  it.each(DOCKED_SCREENS)("%s keeps the bar viewport-pinned", (file) => {
    // The whole reason `dock` exists: rendered as a sibling of the transformed
    // content so its `fixed` still resolves against the viewport.
    const source = stripComments(read(file));
    const dockBlock = source.slice(source.indexOf("dock={"), source.indexOf("dock={") + 900);
    expect(dockBlock).toContain("fixed");
    expect(dockBlock).toContain("bottom-[var(--m-dock-bottom)]");
  });

  it("still transforms the content, so the gesture itself survives", () => {
    // Freezing the dock must not have frozen the pull. The content keeps its
    // conditional transform — `none` at rest, real only during a pull.
    expect(PULL).toMatch(/transform:\s*pull === 0 \? "none" : `translateY\(\$\{pull\}px\)`/);
  });
});

/** Comments describe this behaviour at length; only real code counts. */
function stripComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
}
