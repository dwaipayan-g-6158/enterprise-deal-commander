import { readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { importsOf, reachableModules, srcRelative, SRC } from "./module-graph";

/**
 * The mobile shell may perform exactly four write actions, and this is what
 * enforces it.
 *
 * Replaces read-only.test.ts, which banned every write outright. The posture is
 * unchanged — walk every module reachable from src/mobile, fail closed — but the
 * question has changed from "does this write?" to "is this ONE OF THE FOUR, in
 * the ONE module allowed to hold it?".
 *
 * The server's deny-by-default `requireWriteRole` gate still refuses any write
 * from a reader, so this remains the second of two independent guarantees.
 *
 * ## The write surface is DERIVED, not guessed
 *
 * The old test decided what counted as a write with
 * `READ_HOOK = /^use(Get|List|Search|Compare)/`. That had three live problems:
 *
 *   - False negative: `useAskDealMemory` is a GET (verified in the generated
 *     client) but fails the regex, so Ask Advisor was un-shippable on mobile
 *     without editing the test — the guard was blocking a READ.
 *   - Hole: the check began `if (!name.startsWith("use")) continue`, so
 *     `import { updateDeal }` or `import { getUpdateDealMutationOptions }` sailed
 *     straight through. Neither starts with "use".
 *   - Fragility: it depended on Orval's operationId prefixes, which are a
 *     spec-authoring convention rather than a fact about the HTTP method.
 *
 * This reads the generated client and extracts every operation whose body
 * actually contains a POST/PUT/PATCH/DELETE. A hook added by tomorrow's codegen
 * lands in the ban set automatically, with no test edit and no chance of anyone
 * forgetting.
 */

const GENERATED = join(SRC, "..", "..", "..", "lib", "api-client-react", "src", "generated", "api.ts");
const CLIENT_PACKAGE = "@workspace/api-client-react";

/**
 * The allowlist, as hook → the single module permitted to hold it.
 *
 * Containment is by OWNING MODULE, not merely by name. "Which hooks may be used"
 * and "which files may hold them" are different questions, and the second is the
 * one that stops a write spreading: with an owner named, a mutation cannot drift
 * into a screen component without the test naming the file it drifted into.
 */
const WRITE_ALLOWLIST = new Map<string, string>([
  // 1. Playbook step state — complete / skip / block, and reopen as its undo.
  ["useSetPlaybookStepState", "mobile/write/use-playbook-step.ts"],
  ["useReopenPlaybookStep", "mobile/write/use-playbook-step.ts"],
  // 2. Risk disposition — acknowledge / snooze / accept, and clear as the undo
  //    for the first two. Accept is deliberately not undoable: it clears the
  //    server-side stage guardrail, so it is an authorization, not a note.
  ["useSetDisposition", "mobile/write/use-risk-disposition.ts"],
  ["useClearDisposition", "mobile/write/use-risk-disposition.ts"],
  // 3. Technical gate toggle.
  ["useUpdateGate", "mobile/write/use-gate-toggle.ts"],
  // 4. Stage advance, including the 409 STAGE_GUARDRAIL override.
  ["useUpdateDeal", "mobile/write/use-stage-advance.ts"],
  // Not one of the four: the visit ping writes only the caller's own
  // last-visited timestamp and sits on the server's own
  // READER_WRITE_METHOD_ALLOWLIST. Listed so it is a decision, not an oversight.
  ["useDashboardVisit", "mobile/write/use-dashboard-visit.ts"],
]);

/** React Query's mutation primitives. Banned everywhere, including write/. */
const MUTATION_PRIMITIVES = ["useMutation", "useMutationState", "useIsMutating", "MutationCache"];

/** Shared pages that legitimately render inside the mobile tree. */
const ALLOWED_SHARED_PAGES = ["pages/not-found", "pages/login", "pages/share"];

// --- derivation -------------------------------------------------------------

const generatedSource = readFileSync(GENERATED, "utf8");

/** Every operation whose implementation issues a non-GET request. */
function deriveWriteOperations(source: string): Set<string> {
  const ops = new Set<string>();
  // `export const updateDeal = async (…) => { … method: 'PUT' … }`
  const declaration = /export const (\w+) = async \(/g;
  const bounds = [...source.matchAll(declaration)].map((m) => ({ name: m[1], at: m.index! }));

  bounds.forEach((entry, i) => {
    const end = i + 1 < bounds.length ? bounds[i + 1].at : source.length;
    const body = source.slice(entry.at, end);
    if (/method:\s*'(POST|PUT|PATCH|DELETE)'/.test(body)) ops.add(entry.name);
  });
  return ops;
}

function deriveMutationOptions(source: string): Set<string> {
  return new Set(
    [...source.matchAll(/export const get(\w+)MutationOptions/g)].map((m) => m[1]),
  );
}

const writeOps = deriveWriteOperations(generatedSource);
const mutationOptions = deriveMutationOptions(generatedSource);

const capitalise = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

/**
 * Every VALUE binding that performs a write.
 *
 * Types are excluded on purpose: `UpdateDealMutationError` is a legitimate
 * import for typing an error handler inside the owning module, and banning it
 * would push authors toward `any`.
 */
const writeSymbols = new Set<string>();
for (const op of writeOps) {
  writeSymbols.add(op);
  writeSymbols.add(`use${capitalise(op)}`);
  writeSymbols.add(`get${capitalise(op)}MutationOptions`);
}

const modules = reachableModules();

// --- A: the derivation is honest --------------------------------------------

describe("the write surface is derived from the generated client", () => {
  it("reads a real generated client, not a stub", () => {
    // A truncated or missing file would derive an EMPTY ban set and make every
    // assertion below pass while measuring nothing.
    expect(statSync(GENERATED).size).toBeGreaterThan(100_000);
    expect(writeOps.size).toBeGreaterThan(50);
  });

  it("agrees with Orval's own mutation-options emission", () => {
    // Two independent signals for the same fact. If Orval changes its emission
    // shape, this fails loudly instead of silently deriving nothing.
    expect(mutationOptions.size).toBe(writeOps.size);
    const capitalised = new Set([...writeOps].map(capitalise));
    expect([...mutationOptions].filter((m) => !capitalised.has(m))).toEqual([]);
  });

  it("contains the operations the four actions depend on", () => {
    for (const op of [
      "updateDeal",
      "setDisposition",
      "clearDisposition",
      "updateGate",
      "setPlaybookStepState",
      "reopenPlaybookStep",
      "dashboardVisit",
    ]) {
      expect(writeOps.has(op), op).toBe(true);
    }
  });

  it("does not classify a read as a write", () => {
    // askDealMemory is the case that broke the old naming heuristic: a GET whose
    // name does not begin get/list/search/compare, so the previous guard blocked
    // Ask Advisor from ever shipping on mobile.
    for (const op of ["getDeal", "listDeals", "askDealMemory", "compareDealMemory"]) {
      expect(writeOps.has(op), op).toBe(false);
    }
  });
});

// --- B: the walk reaches what it claims -------------------------------------

describe("the module walk is real", () => {
  it("reaches the shell broadly", () => {
    expect(modules.length).toBeGreaterThan(40);
  });

  it("reaches named screens across the shell", () => {
    // One per tab, plus the two screens reached from elsewhere. A walk that
    // stopped short of any of these would leave that whole tab unaudited while
    // still reporting a healthy module count.
    for (const name of [
      "command-screen",
      "deals-screen",
      "deal-brief-screen",
      "panel-screen",
      "memory-screen",
      "account-screen",
    ]) {
      expect(modules.some((m) => m.includes(name)), name).toBe(true);
    }
  });

  it("follows imports out of src/mobile, including a deep shared path", () => {
    // semantic-colors is one hop. The roster model is three — mobile write hook
    // -> roster model -> semantic-colors — and it is the two-hops-away case that
    // a per-file scan would miss.
    expect(modules.some((m) => m.includes("semantic-colors"))).toBe(true);
    expect(modules.some((m) => m.includes(join("roster", "model", "board")))).toBe(true);
  });

  it("reaches every module the allowlist names", () => {
    // An allowlist entry pointing at a deleted or orphaned module would be a
    // standing permission for a feature that no longer exists.
    const reachable = new Set(modules.map(srcRelative));
    for (const owner of new Set(WRITE_ALLOWLIST.values())) {
      expect(reachable.has(owner), `${owner} is not reachable`).toBe(true);
    }
  });
});

// --- C: no mutation primitives, anywhere ------------------------------------

describe("React Query's mutation primitives are banned outright", () => {
  it("appear in no reachable module, including src/mobile/write", () => {
    // This is what makes the allowlist EXHAUSTIVE rather than merely long: with
    // useMutation unavailable everywhere, the seven allowlisted generated hooks
    // are the only door a write can come through. It is also why
    // write-status-context counts in-flight writes by hand instead of calling
    // useIsMutating.
    const offenders: string[] = [];
    for (const file of modules) {
      for (const record of importsOf(file)) {
        if (record.specifier !== "@tanstack/react-query") continue;
        for (const name of record.names) {
          if (MUTATION_PRIMITIVES.includes(name)) offenders.push(`${srcRelative(file)}: ${name}`);
        }
      }
    }
    expect(offenders).toEqual([]);
  });
});

// --- D: writes only at their one owner --------------------------------------

describe("every write symbol lives in exactly one module", () => {
  it("is imported only by its owner", () => {
    const offenders: string[] = [];

    for (const file of modules) {
      const relative = srcRelative(file);
      for (const record of importsOf(file)) {
        if (record.specifier !== CLIENT_PACKAGE) continue;

        // A star re-export forwards every binding of the client, write hooks
        // included, without naming one — so `names` cannot be trusted here.
        if (record.star) {
          offenders.push(`${relative}: star re-export of ${CLIENT_PACKAGE}`);
          continue;
        }

        for (const name of record.names) {
          if (!writeSymbols.has(name)) continue; // a read — no name check at all
          const owner = WRITE_ALLOWLIST.get(name);
          if (owner == null) offenders.push(`${relative}: ${name} is not allowlisted`);
          else if (owner !== relative) offenders.push(`${relative}: ${name} belongs to ${owner}`);
        }
      }
    }

    expect(offenders).toEqual([]);
  });
});

// --- E: the allowlist is minimal --------------------------------------------

describe("the allowlist is minimal, not merely consistent", () => {
  it("has exactly the seven entries the four actions require", () => {
    // Four actions: playbook step (2 hooks, one being its undo), disposition
    // (2, likewise), gate toggle (1), stage advance (1) — plus the visit ping.
    // An eighth entry fails even when otherwise consistent, so whoever adds one
    // has to change this number and say why in review.
    expect(WRITE_ALLOWLIST.size).toBe(7);
  });

  it("names only hooks that are genuinely writes", () => {
    for (const name of WRITE_ALLOWLIST.keys()) {
      expect(writeSymbols.has(name), `${name} is not a write in the generated client`).toBe(true);
    }
  });

  it("has no entry its owner does not actually import", () => {
    // An unused entry is a standing permission nobody is using. This is what
    // makes the allowlist SHRINK when an action is dropped, rather than rot.
    const offenders: string[] = [];
    for (const [name, owner] of WRITE_ALLOWLIST) {
      const file = join(SRC, owner);
      const imported = importsOf(file).some(
        (record) => record.specifier === CLIENT_PACKAGE && record.names.includes(name),
      );
      if (!imported) offenders.push(`${owner} does not import ${name}`);
    }
    expect(offenders).toEqual([]);
  });
});

// --- F: no raw writes -------------------------------------------------------

describe("no write escapes through a raw request", () => {
  it("issues no non-GET fetch", () => {
    const offenders = modules.filter((file) =>
      // The backtick is in the quote class deliberately: a template literal was
      // the obvious way around the previous version of this regex.
      /method:\s*["'`](POST|PUT|PATCH|DELETE)["'`]/i.test(readFileSync(file, "utf8")),
    );
    expect(offenders.map(srcRelative)).toEqual([]);
  });

  it("uses no transport that would bypass the client", () => {
    const banned = [/navigator\.sendBeacon\(/, /new XMLHttpRequest\(/, /\.getMutationCache\(/];
    const offenders: string[] = [];
    for (const file of modules) {
      const source = readFileSync(file, "utf8");
      for (const pattern of banned) {
        if (pattern.test(source)) offenders.push(`${srcRelative(file)}: ${pattern.source}`);
      }
    }
    expect(offenders).toEqual([]);
  });

  // Documented limitation: a computed method — `{ method: verb }` — is not
  // caught, and static analysis cannot catch it. requireWriteRole still can,
  // which is the entire reason this is the second guarantee rather than the only
  // one.
});

// --- G: containment ---------------------------------------------------------

describe("the mobile tree stays out of desktop", () => {
  it("imports no desktop page or shell", () => {
    // This encodes as a rule the failure the original read-only test described
    // in prose: a mobile screen innocently importing a desktop component that
    // itself imports edit-deal-sheet.tsx, shipping a mutation one hop out of
    // sight. Catching it at the boundary beats catching it downstream.
    const offenders: string[] = [];
    for (const file of modules) {
      for (const record of importsOf(file)) {
        const isDesktop =
          record.specifier.startsWith("@/desktop/") ||
          (record.specifier.startsWith("@/pages/") &&
            !ALLOWED_SHARED_PAGES.some((page) => record.specifier.includes(page)));
        if (isDesktop) offenders.push(`${srcRelative(file)} imports ${record.specifier}`);
      }
    }
    expect(offenders).toEqual([]);
  });

  it("never toasts from the write layer", () => {
    // <Toaster/> is a sibling of ShellGate and therefore outside .m-shell, so it
    // paints in desktop tokens on a phone. The write layer reports failures in
    // place instead — see write-error-inline.tsx.
    const offenders = modules
      .filter((file) => srcRelative(file).startsWith("mobile/write/"))
      .filter((file) => importsOf(file).some((r) => r.specifier.includes("hooks/use-toast")));
    expect(offenders.map(srcRelative)).toEqual([]);
  });
});

// --- H: the options that make failure honest --------------------------------

describe("writes fail loudly rather than pretending to queue", () => {
  it("submits every action with the shared options", () => {
    for (const owner of new Set(WRITE_ALLOWLIST.values())) {
      const source = readFileSync(join(SRC, owner), "utf8");
      expect(source, owner).toContain("MOBILE_WRITE_OPTIONS");
    }
  });

  it("pins networkMode and the 403 suppression", () => {
    // A crude string match, and flagged as such: it is the only way to pin
    // "writes fail loudly offline" from environment: "node". The runtime
    // behaviour belongs to the MCP browser pass — go offline, tap Complete, and
    // assert the copy says NOT SAVED rather than queued.
    const options = readFileSync(join(SRC, "mobile/write/write-options.ts"), "utf8");
    expect(options).toContain('networkMode: "always"');
    expect(options).toContain("suppressForbiddenToast: true");
  });
});
