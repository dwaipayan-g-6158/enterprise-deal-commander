/**
 * A static, transitive module graph over the frontend source tree.
 *
 * Three suites depend on this — the write allowlist, the mobile dependency
 * budget, and the type-utility collision scan — and all three share one
 * property: they must fail CLOSED. A resolver that quietly returned nothing
 * would make every assertion built on it vacuously green, which is worse than
 * having no suite at all, because it reads as coverage.
 *
 * So the walk is transitive on purpose. A per-file scan would pass a mobile
 * screen that innocently imports a desktop component which itself imports
 * edit-deal-sheet.tsx — the mutation ships, one hop out of sight. Extracted from
 * read-only.test.ts, where this logic first lived.
 *
 * ## The bypass this extraction fixed
 *
 * The original parser matched only `import`. It did not match `export … from`,
 * `export *`, or `export * as ns` — so a single-line barrel anywhere in shared
 * code (`export * from "./writer"`) took the entire transitive walk out at the
 * knees, silently and permanently. Nothing would have caught it. `parseImports`
 * now matches re-exports too, and module-graph.test.ts pins every form.
 *
 * No React, no DOM, no `@/` imports — vitest runs with `environment: "node"`
 * and no alias resolution.
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join, relative, resolve, sep } from "node:path";

/** `artifacts/edc/src`. */
export const SRC = resolve(import.meta.dirname, "..");

export type ImportKind = "import" | "export" | "dynamic";

export interface ImportRecord {
  /** The module specifier, exactly as written. */
  specifier: string;
  /** Named bindings, `as` aliases reduced to the source name. Empty for `*` and side-effect forms. */
  names: string[];
  kind: ImportKind;
  /**
   * True for `import * as ns` / `export *` / `export * as ns`. A star re-export
   * forwards every binding of the target, including ones this file never names —
   * which is why a containment check cannot rely on `names` alone.
   */
  star: boolean;
}

/** Every non-test `.ts`/`.tsx` file under `dir`, recursively. */
export function walkFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((entry) => {
    const full = join(dir, entry);
    return statSync(full).isDirectory()
      ? walkFiles(full)
      : /\.tsx?$/.test(entry) && !/\.test\.tsx?$/.test(entry)
        ? [full]
        : [];
  });
}

function bindingNames(clause: string): string[] {
  const braces = clause.match(/\{([\s\S]*?)\}/);
  if (!braces) return [];
  return braces[1]
    .split(",")
    .map((n) => n.replace(/\btype\b/, "").split(/\s+as\s+/)[0].trim())
    .filter(Boolean);
}

/**
 * Every module reference in a source file: static imports, re-exports, and
 * dynamic `import()`.
 *
 * The clause is captured as `[^;]*?` so it cannot span a statement boundary and
 * swallow an unrelated declaration, and each keyword is guarded by a lookbehind
 * so `reimport` / `_export` don't match.
 */
export function parseImports(source: string): ImportRecord[] {
  const records: ImportRecord[] = [];

  // `import x from "m"`, `import "m"` (the from-clause is optional for
  // side-effect imports, which still create an edge in the graph).
  for (const m of source.matchAll(/(?<![\w$])import\s+(?:([^;]*?)\s+from\s+)?["']([^"']+)["']/g)) {
    const clause = m[1] ?? "";
    records.push({
      specifier: m[2],
      names: bindingNames(clause),
      kind: "import",
      star: /\*\s*(?:as\s|$)/.test(clause),
    });
  }

  // `export { a } from "m"`, `export * from "m"`, `export * as ns from "m"`.
  // Here the from-clause is REQUIRED: a bare `export const x = "y"` is not a
  // module reference and must not be read as one.
  for (const m of source.matchAll(/(?<![\w$])export\s+([^;]*?)\s+from\s+["']([^"']+)["']/g)) {
    records.push({
      specifier: m[2],
      names: bindingNames(m[1]),
      kind: "export",
      star: m[1].includes("*"),
    });
  }

  for (const m of source.matchAll(/import\(\s*["']([^"']+)["']\s*\)/g)) {
    records.push({ specifier: m[1], names: [], kind: "dynamic", star: false });
  }

  return records;
}

/** Resolves a first-party specifier to a file on disk, or null when it's a package. */
export function resolveFirstParty(specifier: string, fromFile: string): string | null {
  let base: string;
  if (specifier.startsWith("@/")) {
    base = join(SRC, specifier.slice(2));
  } else if (specifier.startsWith(".")) {
    base = resolve(dirname(fromFile), specifier);
  } else {
    // A bare specifier is a package (@workspace/*, react, lucide-react …).
    return null;
  }

  for (const candidate of [
    base,
    `${base}.ts`,
    `${base}.tsx`,
    join(base, "index.ts"),
    join(base, "index.tsx"),
  ]) {
    try {
      if (statSync(candidate).isFile()) return candidate;
    } catch {
      // Not this candidate; try the next extension.
    }
  }
  return null;
}

/**
 * Every first-party module reachable from `roots`, including the roots.
 * Defaults to the whole mobile shell.
 */
export function reachableModules(roots: string[] = [join(SRC, "mobile")]): string[] {
  const seen = new Set<string>();
  const queue = roots.flatMap((root) => (statSync(root).isDirectory() ? walkFiles(root) : [root]));

  while (queue.length > 0) {
    const file = queue.pop()!;
    if (seen.has(file)) continue;
    seen.add(file);

    for (const record of parseImports(readFileSync(file, "utf8"))) {
      const resolved = resolveFirstParty(record.specifier, file);
      if (resolved && !seen.has(resolved)) queue.push(resolved);
    }
  }

  return [...seen];
}

/** A stable `src/`-relative POSIX path, so assertions read the same on any OS. */
export function srcRelative(file: string): string {
  return relative(SRC, file).split(sep).join("/");
}

/** Convenience: every module reference in a file on disk. */
export function importsOf(file: string): ImportRecord[] {
  return parseImports(readFileSync(file, "utf8"));
}
