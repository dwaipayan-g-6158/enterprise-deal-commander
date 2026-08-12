import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { SRC } from "./module-graph";

/**
 * A panel's loading gate must not clear until every query behind it has settled.
 *
 * `gates-panel.tsx` gated on `intelQuery.isLoading && gatesQuery.isLoading`. With
 * `&&` the skeleton clears as soon as the FIRST query resolves, so a panel whose
 * cards come from different queries renders the half it has — and then inserts the
 * other half wherever it belongs, which for Gates was ABOVE content already on
 * screen.
 *
 * Measured on the deployed app at 390x844: the Progress card appeared above the
 * Gates card and pushed it from top 77 to top 221, 132px of card plus a 12px gap.
 * One layout shift, 0.146 CLS — the worst of any mobile route, and four hundred
 * times the next worst.
 *
 * `&&` in an `error` gate is fine and deliberately not caught here: one query
 * failing while another succeeds should show what arrived, not an error screen.
 */

const PANELS = join(SRC, "mobile", "screens", "deal", "panels");

/** `loading={...}` on a PanelBody, with the expression it is given. */
function loadingGates(source: string): string[] {
  return [...source.matchAll(/loading=\{([^}]*)\}/g)].map((m) => m[1].trim());
}

const FILES = readdirSync(PANELS).filter((f) => f.endsWith(".tsx") && !f.includes(".test."));

describe("panel loading gates wait for every query", () => {
  it("finds panels to check", () => {
    // Guards the guard: a rename that empties this list must not read as a pass.
    expect(FILES.length).toBeGreaterThan(5);
    expect(FILES).toContain("gates-panel.tsx");
  });

  it.each(FILES)("%s does not clear its skeleton on the first query", (file) => {
    const source = readFileSync(join(PANELS, file), "utf8")
      // Comments in this area discuss `&&` at length by necessity.
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .replace(/^\s*\/\/.*$/gm, "");

    for (const gate of loadingGates(source)) {
      expect(
        gate,
        `${file} gates loading on "${gate}" — && clears the skeleton when the ` +
          `FIRST query resolves, so a second card can land above content that is ` +
          `already on screen. Use || so the panel arrives in one piece.`,
      ).not.toContain("&&");
    }
  });

  it("keeps the two-query panels agreeing with each other", () => {
    // Gates and Stage are the two panels fed by two queries; they had drifted.
    const read = (f: string) => readFileSync(join(PANELS, f), "utf8");
    for (const file of ["gates-panel.tsx", "stage-panel.tsx"]) {
      const gates = loadingGates(read(file));
      expect(gates.some((g) => g.includes("||")), `${file} should join its queries with ||`).toBe(
        true,
      );
    }
  });
});
