import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { importsOf, reachableModules } from "./module-graph";

/**
 * The mobile shell is read-only by construction, and this is what enforces it.
 *
 * Modelled on the server's routes/index.rbac.test.ts, which walks every
 * registered route rather than trusting a checklist: here we walk every module
 * reachable from src/mobile and assert that none of them can issue a write.
 *
 * The walk itself now lives in module-graph.ts, shared with the other mobile
 * guards and covered by its own fixture suite — including the `export … from`
 * forms this file's original parser missed, any one of which would have
 * disabled the walk silently.
 *
 * The server's deny-by-default gate still refuses any write from a reader, so
 * this is the second of two independent guarantees, not the only one.
 */

/**
 * Verbs the mobile surface may perform. The dashboard-visit ping (which
 * writes only the caller's own last-visited timestamp, and is on the
 * server's reader allowlist) is a deliberate exception — listing it here
 * makes it a decision rather than an oversight. Sign-in/sign-out no longer
 * go through the generated API client at all post-Catalyst-migration
 * (Slice 4) — they're a Catalyst Web SDK widget call and a GET /auth/me
 * poll, not useLogin/useLogout mutations — so there is nothing to allowlist
 * for them anymore.
 */
const ALLOWED_MUTATION_HOOKS = new Set(["useDashboardVisit"]);

/** Query-shaped hooks and the query-key/options helpers that pair with them. */
const READ_HOOK = /^use(Get|List|Search|Compare)/;
const QUERY_HELPER = /(QueryKey|QueryOptions|QueryResult|QueryError)$/;

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
      importsOf(file).some(
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
      for (const record of importsOf(file)) {
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
      return /method:\s*["'`](POST|PUT|PATCH|DELETE)["'`]/i.test(source);
    });

    expect(offenders).toEqual([]);
  });
});
