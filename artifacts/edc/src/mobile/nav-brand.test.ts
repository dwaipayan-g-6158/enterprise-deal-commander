import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { SRC } from "./module-graph";

/**
 * The brand mark is on all four tab roots, and it draws.
 *
 * Written as a source scan because these are JSX components and the mobile
 * suite runs `environment: "node"` with no DOM and no alias resolution. It
 * catches the failure that actually happens: someone edits one screen's nav bar
 * and the mark quietly survives on three of the four.
 */

const MOBILE = join(SRC, "mobile");
const read = (rel: string) => readFileSync(join(MOBILE, rel), "utf8");

/** Every screen that owns a tab root, and therefore the trailing cluster. */
const TAB_ROOTS = [
  "screens/command/command-screen.tsx",
  "screens/deals/deals-screen.tsx",
  "screens/intelligence/lens-screen.tsx",
  "screens/memory/memory-screen.tsx",
];

describe("the brand mark on the tab roots", () => {
  it.each(TAB_ROOTS)("%s puts MNavTrailing in the nav bar's trailing slot", (file) => {
    const source = stripComments(read(file));
    expect(source, `${file} should render the brand + account cluster`).toMatch(
      /right=\{<MNavTrailing\s*\/>\}/,
    );
  });

  it.each(TAB_ROOTS)("%s no longer renders a bare avatar in that slot", (file) => {
    // The cluster owns the avatar now. A screen that kept `right={<MAvatar />}`
    // would look correct in review and simply have no mark.
    const source = stripComments(read(file));
    expect(source, `${file} still passes MAvatar directly`).not.toMatch(
      /right=\{<MAvatar\s*\/>\}/,
    );
  });

  it("names every tab root, so a fifth cannot be added without a decision", () => {
    // Derived from the tab model rather than from this file's own list: a new
    // entry in MOBILE_TABS has to be triaged here rather than silently skipped.
    const nav = stripComments(read("nav/mobile-nav.ts"));
    const ids = [...nav.matchAll(/^\s*\{?\s*id:\s*"([a-z]+)"/gm)].map((m) => m[1]);
    const tabIds = ids.filter((id) =>
      ["command", "deals", "intelligence", "memory"].includes(id),
    );
    expect(new Set(tabIds).size, "MOBILE_TABS changed — triage the new root").toBe(
      TAB_ROOTS.length,
    );
  });
});

describe("the mark itself", () => {
  const TRAILING = stripComments(read("shell/m-nav-trailing.tsx"));

  it("animates — it is not passed animated={false}", () => {
    expect(TRAILING).toMatch(/<EdcLogoMark/);
    expect(TRAILING, "the draw-in is the whole point of this component").not.toMatch(
      /animated=\{false\}/,
    );
  });

  it("finishes inside a tab dwell", () => {
    // EdcLogoMark's own sequence is 3.22s at timeScale 1, which is longer than
    // the gap between two tab taps — the mark would be caught mid-draw on every
    // switch. Anything at or below 1 reintroduces that.
    const match = TRAILING.match(/MARK_TIME_SCALE\s*=\s*([\d.]+)/);
    expect(match, "the speed-up must stay a named constant").not.toBeNull();
    const scale = Number(match![1]);
    expect(scale).toBeGreaterThan(1);
    expect((3.22 / scale) * 1000, "draw must land under 2s").toBeLessThan(2000);
  });

  it("keeps the account entry point beside it", () => {
    // The mark took over the slot the avatar had. Losing the avatar would move
    // Settings, Users and sign-out out of reach on every tab root at once.
    expect(TRAILING).toMatch(/<MAvatar\s*\/>/);
  });
});

/**
 * The first-paint skeleton has to agree with the live bar, or the handover
 * shifts the mark across the header.
 */
describe("the skeleton hands over without moving anything", () => {
  const SKELETON = stripComments(read("shell/m-shell-skeleton.tsx"));

  it("puts the mark on the trailing side too", () => {
    expect(SKELETON).toMatch(/ml-auto/);
    const trailing = SKELETON.slice(SKELETON.indexOf("ml-auto"));
    expect(trailing.indexOf("EdcLogoMark"), "the mark belongs inside the trailing cluster")
      .toBeGreaterThan(-1);
  });

  it("renders the same 24px mark the live bar does", () => {
    expect(SKELETON).toMatch(/<EdcLogoMark size=\{24\}/);
  });

  it("stays static, because it is torn down within a few hundred ms", () => {
    expect(SKELETON).toMatch(/animated=\{false\}/);
  });
});

/** Comments describe these props constantly; only real code counts. */
function stripComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
}
