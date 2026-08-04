import { describe, expect, it } from "vitest";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join, resolve } from "node:path";

/**
 * The mobile shell is read-only by construction, and this is what enforces it.
 *
 * Modelled on the server's routes/index.rbac.test.ts, which walks every
 * registered route rather than trusting a checklist: here we walk every module
 * reachable from src/mobile and assert that none of them can issue a write.
 *
 * The walk is transitive on purpose. A per-file scan would pass a mobile
 * screen that innocently imports a desktop component which itself imports
 * edit-deal-sheet.tsx — the mutation would ship, one hop out of sight.
 *
 * The server's deny-by-default gate still refuses any write from a reader, so
 * this is the second of two independent guarantees, not the only one.
 */

const SRC = resolve(import.meta.dirname, "..");
const MOBILE = join(SRC, "mobile");

/**
 * Verbs the mobile surface may perform. Session endpoints and the
 * dashboard-visit ping (which writes only the caller's own last-visited
 * timestamp, and is on the server's reader allowlist) are deliberate
 * exceptions — listing them here makes them a decision rather than an
 * oversight.
 */
const ALLOWED_MUTATION_HOOKS = new Set(["useLogin", "useLogout", "useDashboardVisit"]);

/** Query-shaped hooks and the query-key/options helpers that pair with them. */
const READ_HOOK = /^use(Get|List|Search|Compare)/;
const QUERY_HELPER = /(QueryKey|QueryOptions|QueryResult|QueryError)$/;

function walkFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((entry) => {
    const full = join(dir, entry);
    return statSync(full).isDirectory()
      ? walkFiles(full)
      : /\.tsx?$/.test(entry) && !/\.test\.tsx?$/.test(entry)
        ? [full]
        : [];
  });
}

interface ImportRecord {
  specifier: string;
  names: string[];
}

/** Static and dynamic import specifiers, with their named bindings. */
function parseImports(source: string): ImportRecord[] {
  const records: ImportRecord[] = [];

  // import ... from "x" — the binding clause is optional (side-effect imports).
  const staticImport = /import\s+(?:([\s\S]*?)\s+from\s+)?["']([^"']+)["']/g;
  for (const match of source.matchAll(staticImport)) {
    const clause = match[1] ?? "";
    const braces = clause.match(/\{([\s\S]*?)\}/);
    const names = braces
      ? braces[1]
          .split(",")
          .map((n) => n.replace(/\btype\b/, "").split(/\s+as\s+/)[0].trim())
          .filter(Boolean)
      : [];
    records.push({ specifier: match[2], names });
  }

  for (const match of source.matchAll(/import\(\s*["']([^"']+)["']\s*\)/g)) {
    records.push({ specifier: match[1], names: [] });
  }

  return records;
}

/** Resolves a first-party specifier to a file on disk, or null if external. */
function resolveFirstParty(specifier: string, fromFile: string): string | null {
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

/** Every first-party module reachable from src/mobile, including the entrypoints. */
function reachableModules(): string[] {
  const seen = new Set<string>();
  const queue = walkFiles(MOBILE);

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

describe("the mobile shell cannot write", () => {
  const modules = reachableModules();

  it("reaches the screens it is supposed to", () => {
    // Guards the walk itself: a resolver that silently returned null for
    // everything would make every assertion below vacuously pass.
    expect(modules.length).toBeGreaterThan(20);
    expect(modules.some((m) => m.includes("deal-detail-screen"))).toBe(true);
    // And it must follow imports out of src/mobile into shared code.
    expect(modules.some((m) => m.includes("semantic-colors"))).toBe(true);
  });

  it("imports no mutation primitives from React Query", () => {
    const offenders = modules.filter((file) =>
      parseImports(readFileSync(file, "utf8")).some(
        (record) =>
          record.specifier === "@tanstack/react-query" &&
          record.names.some((name) =>
            ["useMutation", "useMutationState", "useIsMutating", "MutationCache"].includes(name),
          ),
      ),
    );

    expect(offenders).toEqual([]);
  });

  it("imports only read hooks from the generated API client", () => {
    const offenders: string[] = [];

    for (const file of modules) {
      for (const record of parseImports(readFileSync(file, "utf8"))) {
        if (record.specifier !== "@workspace/api-client-react") continue;
        for (const name of record.names) {
          if (!name.startsWith("use")) continue;
          if (READ_HOOK.test(name)) continue;
          if (QUERY_HELPER.test(name)) continue;
          if (ALLOWED_MUTATION_HOOKS.has(name)) continue;
          offenders.push(`${file}: ${name}`);
        }
      }
    }

    expect(offenders).toEqual([]);
  });

  it("issues no write requests through raw fetch", () => {
    const offenders = modules.filter((file) => {
      const source = readFileSync(file, "utf8");
      return /method:\s*["'](POST|PUT|PATCH|DELETE)["']/i.test(source);
    });

    expect(offenders).toEqual([]);
  });
});
