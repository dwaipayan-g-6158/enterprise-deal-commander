import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { findTypeCollisions } from "./class-scan";
import { srcRelative, SRC, walkFiles } from "./module-graph";

/**
 * Catches the footgun that is the price of the type ladder's precedence trick.
 *
 * The `.m-*` type styles are declared UNLAYERED so they beat shadcn's
 * `@layer`-ed defaults — that is what lets `.m-headline` override an
 * `<ItemTitle>`'s baked-in `text-sm font-medium` instead of losing to it.
 * Tailwind's utilities are layered too, so the same precedence means
 * `className="m-caption text-xs"` silently ignores `text-xs`. The element
 * renders at 13px, the author believes they wrote 12px, and nothing complains.
 *
 * The scanning is in class-scan.ts with its own suite; this file is the policy.
 */

const MOBILE = join(SRC, "mobile");

describe("mobile type styles are not silently overridden", () => {
  const files = walkFiles(MOBILE).filter((f) => f.endsWith(".tsx"));

  it("scans the shell's components", () => {
    // Tripwire: an empty file list would make the assertion below vacuous, which
    // is how a suite survives a directory rename while measuring nothing.
    expect(files.length).toBeGreaterThan(5);
  });

  it("never pairs a rung with a utility it wins against, or stacks two rungs", () => {
    const offenders = files.flatMap((file) =>
      findTypeCollisions(readFileSync(file, "utf8")).map(
        // The offending expression is quoted back so the failure says WHERE,
        // not just what. A guard that reports only a filename sends the reader
        // hunting through three hundred lines of JSX.
        (f) => `${srcRelative(file)}: ${f.message}\n    in: ${f.world.replace(/\s+/g, " ").trim().slice(0, 160)}`,
      ),
    );
    expect(offenders).toEqual([]);
  });

  it("ships no monospace on the mobile surface", () => {
    // `$3.82M` set in Geist Mono renders as `$3 . 82M`. The shell uses
    // font-variant-numeric: tabular-nums for column alignment instead.
    const offenders = files
      .filter((f) => /\bfont-mono\b/.test(readFileSync(f, "utf8")))
      .map(srcRelative);
    expect(offenders).toEqual([]);
  });
});
