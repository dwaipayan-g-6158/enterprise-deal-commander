import { describe, expect, it } from "vitest";
import { join } from "node:path";
import { parseImports, reachableModules, resolveFirstParty, srcRelative, SRC } from "./module-graph";

/**
 * The suites that guard the mobile shell — the write allowlist, the dependency
 * budget, the type-collision scan — are all only as good as this parser. If it
 * misses a form, the walk stops early and every assertion downstream passes
 * vacuously while reporting coverage it does not have.
 *
 * That is not hypothetical. Before this module existed, the parser matched only
 * `import`. A single-line barrel in shared code — `export * from "./writer"` —
 * would have disabled the entire transitive walk, silently, with a green suite.
 * The re-export cases below are the ones that were unguarded.
 */

const specifiers = (src: string) => parseImports(src).map((r) => r.specifier);

describe("parseImports — static imports", () => {
  it("reads every binding form", () => {
    expect(parseImports(`import d from "a";`)[0]).toMatchObject({ specifier: "a", names: [], kind: "import" });
    expect(parseImports(`import { a, b } from "m";`)[0].names).toEqual(["a", "b"]);
    expect(parseImports(`import { a as x, b as y } from "m";`)[0].names).toEqual(["a", "b"]);
    expect(parseImports(`import d, { a } from "m";`)[0].names).toEqual(["a"]);
  });

  it("reads a side-effect import, which still creates a graph edge", () => {
    expect(specifiers(`import "./styles.css";`)).toEqual(["./styles.css"]);
  });

  it("reads type-only imports, and strips the `type` keyword from names", () => {
    expect(parseImports(`import type { Deal } from "m";`)[0].names).toEqual(["Deal"]);
    expect(parseImports(`import { type Deal, useGetDeal } from "m";`)[0].names).toEqual(["Deal", "useGetDeal"]);
  });

  it("reads a namespace import and flags it as a star", () => {
    const [r] = parseImports(`import * as ns from "m";`);
    expect(r).toMatchObject({ specifier: "m", star: true });
  });

  it("survives a multi-line binding clause", () => {
    expect(parseImports(`import {\n  a,\n  b,\n} from "m";`)[0].names).toEqual(["a", "b"]);
  });
});

describe("parseImports — re-exports (the forms that were unguarded)", () => {
  it("reads `export { a } from`", () => {
    const [r] = parseImports(`export { a, b as c } from "m";`);
    expect(r).toMatchObject({ specifier: "m", kind: "export", star: false });
    expect(r.names).toEqual(["a", "b"]);
  });

  it("reads `export * from` and flags it as a star", () => {
    const [r] = parseImports(`export * from "m";`);
    expect(r).toMatchObject({ specifier: "m", kind: "export", star: true });
    // A star re-export forwards bindings this file never names, so a
    // containment check cannot rely on `names` — hence the flag.
    expect(r.names).toEqual([]);
  });

  it("reads `export * as ns from`", () => {
    expect(parseImports(`export * as ns from "m";`)[0]).toMatchObject({ specifier: "m", star: true });
  });

  it("reads `export type { T } from`", () => {
    expect(parseImports(`export type { Deal } from "m";`)[0].names).toEqual(["Deal"]);
  });

  it("does NOT read a plain export as a module reference", () => {
    // `export const BASE = "https://x"` names no module. Treating the string
    // literal as a specifier would fill the graph with junk and, worse, make a
    // real miss harder to notice.
    expect(parseImports(`export const BASE = "https://x";`)).toEqual([]);
    expect(parseImports(`export function f() { return "m"; }`)).toEqual([]);
    expect(parseImports(`export default { name: "m" };`)).toEqual([]);
  });
});

describe("parseImports — dynamic import", () => {
  it("reads a lazily-loaded chunk", () => {
    expect(specifiers(`const M = lazy(() => import("@/mobile/mobile-app"));`)).toEqual(["@/mobile/mobile-app"]);
  });
});

describe("parseImports — things that must not match", () => {
  it("ignores a keyword embedded in a longer identifier", () => {
    expect(parseImports(`const reimport = "m"; const _export = "n";`)).toEqual([]);
  });

  it("does not let a clause span a statement boundary", () => {
    // `[^;]*?` is what stops `import` on line 1 from pairing with a `from` many
    // statements later and inventing an edge that isn't there.
    const src = `import a from "one";\nconst x = 1;\nimport b from "two";`;
    expect(specifiers(src)).toEqual(["one", "two"]);
  });
});

describe("resolveFirstParty", () => {
  const from = join(SRC, "mobile", "module-graph.ts");

  it("resolves an aliased first-party path", () => {
    expect(resolveFirstParty("@/lib/semantic-colors", from)).toBe(join(SRC, "lib", "semantic-colors.ts"));
  });

  it("resolves a relative path", () => {
    expect(resolveFirstParty("../lib/semantic-colors", from)).toBe(join(SRC, "lib", "semantic-colors.ts"));
  });

  it("returns null for a package, so the walk stops at the workspace boundary", () => {
    expect(resolveFirstParty("react", from)).toBeNull();
    expect(resolveFirstParty("@workspace/api-client-react", from)).toBeNull();
    expect(resolveFirstParty("@/does/not/exist", from)).toBeNull();
  });
});

describe("reachableModules", () => {
  const modules = reachableModules();

  it("reaches enough of the tree to make downstream assertions meaningful", () => {
    // A resolver that silently returned null for everything would make every
    // suite built on this pass with nothing measured. This is the tripwire.
    expect(modules.length).toBeGreaterThan(20);
  });

  it("follows imports OUT of src/mobile into shared code", () => {
    // The two-hops-away case: mobile screen -> shared module. Losing this is
    // how a write arrives through a desktop component nobody inspected.
    expect(modules.some((m) => m.includes("semantic-colors"))).toBe(true);
  });

  it("reports paths that read the same on every OS", () => {
    expect(srcRelative(join(SRC, "mobile", "module-graph.ts"))).toBe("mobile/module-graph.ts");
  });
});
