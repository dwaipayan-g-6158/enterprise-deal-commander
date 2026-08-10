import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { DEAL_PANELS } from "../../nav/routes";

const PANELS_DIR = join(import.meta.dirname, "panels");

function registrySource(): string {
  return readFileSync(join(PANELS_DIR, "index.ts"), "utf8");
}

/**
 * The registry keys, read from source rather than imported.
 *
 * Importing `index.ts` would pull sixteen React components into a vitest run
 * configured with `environment: "node"`. Reading the file is enough: the
 * question is which ids the map declares, and that is answerable statically.
 */
function registeredIds(): string[] {
  const body = registrySource();
  const start = body.indexOf("PANEL_BODIES");
  expect(start, "PANEL_BODIES is no longer declared").toBeGreaterThan(-1);
  // Keys are bare identifiers except "cross-sell", which must be quoted.
  return [...body.slice(start).matchAll(/^\s{2}"?([a-z][a-z-]*)"?:\s/gm)].map((m) => m[1]);
}

describe("the panel registry", () => {
  it("has a body for every panel in the route table, and nothing else", () => {
    // Both directions. A table entry with no body pushes an empty screen; a body
    // with no table entry is unreachable code that still costs bytes in the
    // mobile chunk.
    expect(registeredIds().sort()).toEqual(DEAL_PANELS.map((p) => p.id).sort());
  });

  it("registers each id exactly once", () => {
    const ids = registeredIds();
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("covers all sixteen", () => {
    expect(registeredIds()).toHaveLength(16);
  });
});

describe("the write panels", () => {
  /**
   * Which panel files are allowed to import a write hook, and which one each may
   * import.
   *
   * The write-allowlist suite already proves the hooks themselves are only
   * imported by their owning module, and that no other module in the shell can
   * reach a generated mutation. This is the layer above: it pins WHICH SCREENS
   * carry a write, so a fifth write surface cannot appear on a phone without
   * somebody editing this list and having to justify it.
   */
  const WRITE_PANELS: Record<string, string> = {
    "stage-panel.tsx": "use-stage-advance",
    "alerts-panel.tsx": "use-risk-disposition",
    "gates-panel.tsx": "use-gate-toggle",
    "playbook-panel.tsx": "use-playbook-step",
  };

  const PANEL_FILES = [
    "stage-panel.tsx",
    "alerts-panel.tsx",
    "gates-panel.tsx",
    "playbook-panel.tsx",
    "meddpicc-panel.tsx",
    "risk-panels.tsx",
    "intel-panels.tsx",
    "commercial-panels.tsx",
    "record-panels.tsx",
  ];

  it("keeps writes to the four panels that are supposed to have them", () => {
    for (const file of PANEL_FILES) {
      const source = readFileSync(join(PANELS_DIR, file), "utf8");
      const imported = [...source.matchAll(/from "@\/mobile\/write\/(use-[a-z-]+)"/g)].map(
        (m) => m[1],
      );
      const allowed = WRITE_PANELS[file];
      if (allowed) {
        expect(imported, file).toEqual([allowed]);
      } else {
        expect(imported, `${file} must not import a write hook`).toEqual([]);
      }
    }
  });

  it("names only panel files that exist", () => {
    // A renamed file would otherwise silently drop out of the check above,
    // leaving the panel unaudited while the suite stayed green.
    for (const file of [...PANEL_FILES]) {
      expect(() => readFileSync(join(PANELS_DIR, file), "utf8"), file).not.toThrow();
    }
  });

  it("accounts for every panel source file", () => {
    // The counterpart of the check above: a NEW panel file that nobody added to
    // PANEL_FILES would import whatever it liked, unaudited.
    const imports = [...registrySource().matchAll(/panels\/([a-z-]+)"/g)].map((m) => `${m[1]}.tsx`);
    expect([...new Set(imports)].sort()).toEqual([...PANEL_FILES].sort());
  });
});
