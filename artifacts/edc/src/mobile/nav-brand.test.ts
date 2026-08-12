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
  it.each(TAB_ROOTS)("%s puts MNavBrand in the nav bar's leading slot", (file) => {
    const source = stripComments(read(file));
    expect(source, `${file} should render the brand mark`).toMatch(
      /leading=\{<MNavBrand\s*\/>\}/,
    );
  });

  it.each(TAB_ROOTS)("%s keeps the avatar in the trailing slot", (file) => {
    // The mark took the leading slot, not the avatar's. Losing the avatar would
    // move Settings, Users and sign-out out of reach on every tab root at once.
    const source = stripComments(read(file));
    expect(source, `${file} lost its account entry point`).toMatch(
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
  const BRAND = stripComments(read("shell/m-nav-brand.tsx"));

  it("animates — it is not passed animated={false}", () => {
    expect(BRAND).toMatch(/<EdcLogoMark/);
    expect(BRAND, "the draw-in is the whole point of this component").not.toMatch(
      /animated=\{false\}/,
    );
  });

  it("finishes inside a tab dwell", () => {
    // EdcLogoMark's own sequence is 3.22s at timeScale 1, which is longer than
    // the gap between two tab taps — the mark would be caught mid-draw on every
    // switch. Anything at or below 1 reintroduces that.
    const match = BRAND.match(/MARK_TIME_SCALE\s*=\s*([\d.]+)/);
    expect(match, "the speed-up must stay a named constant").not.toBeNull();
    const scale = Number(match![1]);
    expect(scale).toBeGreaterThan(1);
    expect((3.22 / scale) * 1000, "draw must land under 2s").toBeLessThan(2000);
  });

  it("renders at the size the leading slot and the skeleton both assume", () => {
    expect(BRAND).toMatch(/size=\{24\}/);
  });
});

/**
 * The mark stays off pushed screens, and MNavBar is what enforces it.
 *
 * `leading` is ignored whenever `backHref` is set — the chevron owns that
 * corner. That is the only thing keeping the mark from appearing beside a back
 * button on every detail screen, so it is worth an assertion rather than a
 * comment.
 */
describe("the leading slot yields to the back chevron", () => {
  const NAV_BAR = read("shell/m-nav-bar.tsx");

  it("renders leading only when there is no backHref", () => {
    const body = NAV_BAR.slice(NAV_BAR.indexOf("export function MNavBar"));
    expect(body).toMatch(/backHref\s*\?[\s\S]{0,120}MBackLink[\s\S]{0,80}:\s*leading\s*\?/);
  });
});

/**
 * The first-paint skeleton has to agree with the live bar, or the handover
 * shifts the mark across the header.
 */
describe("the skeleton hands over without moving anything", () => {
  const SKELETON = stripComments(read("shell/m-shell-skeleton.tsx"));

  it("puts the mark first, ahead of the title, as the live leading slot does", () => {
    const mark = SKELETON.indexOf("EdcLogoMark");
    // Anchored on MNavBar's own class recipe for the flexible text block, which
    // the skeleton deliberately mirrors, rather than on a particular stand-in
    // width. The previous version looked for a literal `h-4 w-36` and so asserted
    // nothing at all once that width changed — indexOf returned -1 and the
    // ordering comparison passed against a negative index.
    const textBlock = SKELETON.indexOf("min-w-0 flex-1");
    expect(mark, "the skeleton should still render the mark").toBeGreaterThan(-1);
    expect(textBlock, "the skeleton should mirror MNavBar's text block").toBeGreaterThan(-1);
    expect(mark, "the mark leads the row, like MNavBar's leading slot").toBeLessThan(textBlock);
  });

  it("renders the same 24px mark the live bar does", () => {
    expect(SKELETON).toMatch(/<EdcLogoMark size=\{24\}/);
  });

  it("stays static, because it is torn down within a few hundred ms", () => {
    expect(SKELETON).toMatch(/animated=\{false\}/);
  });

  it("shows a back chevron instead of the mark on pushed screens", () => {
    // MNavBar ignores `leading` entirely once `backHref` is set, so a pushed
    // screen's skeleton must not draw the mark — it would appear for one frame
    // and then vanish on handover. The mark therefore sits on the false branch of
    // a `pushed` conditional rather than unconditionally in the row.
    expect(SKELETON).toMatch(/plan\.pushed\s*\?[\s\S]{0,600}:\s*\([\s\S]{0,200}EdcLogoMark/);
  });
});

/** Comments describe these props constantly; only real code counts. */
function stripComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
}
