import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { importsOf, reachableModules, srcRelative, SRC } from "./module-graph";

/**
 * Guards the mobile chunk's size at the point where it would be blown, rather
 * than after.
 *
 * The mobile shell is a separate lazy chunk (App.tsx's ShellGate picks it by
 * viewport at 767px), and its whole reason for existing is that a phone should
 * not download the desktop bundle — ~94 KB against ~1.4 MB. That gap is not
 * maintained by discipline; it is maintained by not importing the libraries
 * that create it.
 *
 * This is a banned-specifier test, not a byte-size assertion, and deliberately
 * so. A size limit needs a build (slow, and flaky under vitest), and it only
 * tells you AFTER someone imported recharts that the chunk grew. This tells
 * them at the import, names the file, and says what to use instead.
 *
 * Bans are transitive: reaching recharts through a shared desktop component
 * costs exactly as much as importing it directly.
 */

/** Bare specifiers the mobile chunk may not reach, and what to do instead. */
const BANNED: Record<string, string> = {
  recharts:
    "the mobile chart kit is hand-rolled SVG in src/mobile/charts — recharts is ~100KB and its interactions are hover-based, which a thumb cannot produce",
  "framer-motion":
    "mobile motion is CSS: transitions for state, animation-timeline for scroll-driven, startViewTransition for routes. No animation runtime ships to phones",
  cmdk: "the Commander sheet is a plain filtered list; cmdk's keyboard model buys nothing on a touch device",
  "embla-carousel-react": "use CSS scroll-snap",
  "react-day-picker": "use a native date input — iOS renders its own wheel picker",
  "html-to-image": "Briefing export is a desktop surface",
  "input-otp": "sign-in runs in the Catalyst widget, outside the shell",
  "react-resizable-panels": "nothing on a phone is resizable",
  sonner:
    "Toaster mounts outside .m-shell, so it renders in desktop tokens. Mobile surfaces feedback in-shell — see src/mobile/write/",
};

/**
 * Banned before they exist. These are not declared dependencies, so pnpm's
 * strict node_modules already blocks an import today — but the ban is what
 * makes `pnpm add d3` and the import that motivated it fail in the same change,
 * while the reviewer is still looking at why.
 */
const BANNED_BEFORE_ARRIVAL: Record<string, string> = {
  d3: "use src/mobile/charts/chart-geometry.ts — the path math this app needs is a few dozen lines",
  "chart.js": "same as d3: the kit is hand-rolled and touch-first",
  victory: "same as d3: the kit is hand-rolled and touch-first",
  "@react-spring/web": "see framer-motion — mobile motion is CSS",
  "react-spring": "see framer-motion — mobile motion is CSS",
};

/** `d3-scale` and friends cost as much as `d3` itself. */
function bannedReason(specifier: string): string | undefined {
  if (BANNED[specifier]) return BANNED[specifier];
  if (BANNED_BEFORE_ARRIVAL[specifier]) return BANNED_BEFORE_ARRIVAL[specifier];
  if (/^d3-/.test(specifier)) return BANNED_BEFORE_ARRIVAL.d3;
  return undefined;
}

describe("the mobile chunk stays small", () => {
  const modules = reachableModules();

  it("reaches enough of the tree for the ban to mean anything", () => {
    // Same tripwire as every other suite built on the walk: a resolver that
    // returned nothing would make the bans below vacuous.
    expect(modules.length).toBeGreaterThan(20);
    expect(modules.some((m) => m.includes("semantic-colors"))).toBe(true);
  });

  it("imports no heavyweight library, directly or transitively", () => {
    const offenders: string[] = [];

    for (const file of modules) {
      for (const record of importsOf(file)) {
        const reason = bannedReason(record.specifier);
        if (reason) offenders.push(`${srcRelative(file)} imports ${record.specifier} — ${reason}`);
      }
    }

    expect(offenders).toEqual([]);
  });

  it("keeps BANNED pointed at libraries the repo actually has", () => {
    // A ban on a package nobody could import is theatre, and theatre in a guard
    // suite is worse than a gap: it reads as protection. Anything not installed
    // belongs in BANNED_BEFORE_ARRIVAL, where the name says what it is.
    const pkg = JSON.parse(readFileSync(join(SRC, "..", "package.json"), "utf8")) as {
      dependencies?: Record<string, string>;
      devDependencies?: Record<string, string>;
    };
    const declared = new Set([
      ...Object.keys(pkg.dependencies ?? {}),
      ...Object.keys(pkg.devDependencies ?? {}),
    ]);

    expect(Object.keys(BANNED).filter((n) => !declared.has(n))).toEqual([]);
    expect(Object.keys(BANNED_BEFORE_ARRIVAL).filter((n) => declared.has(n))).toEqual([]);
  });
});
