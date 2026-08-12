# Mobile Search Flicker and Late-Content Fade Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Stop the Deals search bar flickering on every keystroke, and make content that arrives after a page switch fade in instead of popping.

**Architecture:** Two independent halves. The flicker is fixed by not animating a typing-driven URL replace (a new pure predicate feeding a `quiet` path through `aroundNav`) and by holding the previous results while the next load (`keepPreviousData`). The fade is added at every *existing* skeleton→content boundary — the components that already own a `loading` prop — gated by a pure `appearsOnSettle` predicate so it fires only on a `loading → settled` edge and never on a warm-cache first render.

**Tech Stack:** React 19, Vite, Tailwind v4, wouter (`aroundNav`), TanStack Query v5, Vitest (`environment: "node"`), CSS View Transitions.

## Global Constraints

- Package is `@workspace/edc`. Run tests with `pnpm --filter @workspace/edc run test`.
- `vitest.config.ts` sets `environment: "node"` and `include: ["src/**/*.test.ts"]`. **`.test.tsx` files are not collected and there is no DOM.** All new logic must be a pure `.ts` module or a source-grep test.
- No alias resolution in tests — test files import pure modules by relative path.
- `.m-appear` is used **unchanged**: `opacity` 0→1, `translate` `0 4px`→`none`, `var(--m-dur-quick)` (200ms), `var(--m-ease-enter)`, `both`. Do not add a new keyframe.
- Never put `.m-appear` on an element that carries a `view-transition-name`. The shared-card hero would start at `opacity: 0` and the morph would animate into nothing.
- Reduced motion needs no guard: `.m-appear` is finite and uses `both`, so the global clamp lands it on its end state.
- Frontend-only. No API, schema, or `openapi.yaml` change; no codegen run.
- Run `pnpm run typecheck` from the repo root before claiming a task compiles.
- Branch: continue `fix/mobile-pwa-nine-issues`. Do not branch from `main`.

---

## File Structure

**Created**

| File | Responsibility |
| --- | --- |
| `artifacts/edc/src/mobile/lib/appear.ts` | The one pure predicate deciding whether a settled render fades. |
| `artifacts/edc/src/mobile/lib/appear.test.ts` | Truth table for it. |
| `artifacts/edc/src/mobile/hooks/use-appear-on-settle.ts` | Thin ref wrapper turning the predicate into a class name. |
| `artifacts/edc/src/mobile/appear-coverage.test.ts` | Grep test: every loading branch in the shell participates. |

**Modified**

| File | Change |
| --- | --- |
| `mobile/nav/mobile-nav.ts` | Add `isQuietMove`. |
| `mobile/nav/mobile-nav.test.ts` | Cases for it. |
| `mobile/lib/nav-transition.ts` | `runTransition` gains `quiet`; `aroundNav` computes and passes it. |
| `mobile/lib/nav-transition.test.ts` (new file, listed here as it tests an existing module) | Quiet path still stamps the history index. |
| `components/roster/hooks/use-roster-data.ts` | `placeholderData: keepPreviousData`. |
| `mobile/screens/deals/deals-screen.tsx` | Debounce 280→350; fade on content container. |
| `mobile/shell/m-dock.tsx` | `m-vt-dock` class. |
| `mobile/styles/motion.css` | `.m-vt-dock` rule. |
| `mobile/screens/deal/panel-screen.tsx` | Fade in `PanelBody` — covers 16 panels. |
| `mobile/charts/m-chart-frame.tsx` | Fade in `MChartFrame` — covers every chart card. |
| `mobile/screens/intelligence/lens-screen.tsx` | Optional `loading` prop + fade — covers the Intelligence lenses. |
| `mobile/screens/intelligence/portfolio-screen.tsx`, `losses-screen.tsx` | Pass `loading`. |
| `mobile/screens/intelligence/pipeline-screen.tsx` | Fade the one non-chart block. |
| `mobile/screens/memory/lens-screens.tsx` | `LensFrame` gains `loading` + fade; 4 callers pass it. |
| `mobile/screens/memory/memory-screen.tsx` | Fade on content container. |
| `mobile/screens/command/needs-block.tsx` | Fade on the populated `<ul>`. |
| Phase 2 screens | See Tasks 12–13. Ten files: `account/settings-screen.tsx` (5 gates), `intelligence/loss-detail-screen.tsx` (3), `intelligence/portfolio-alerts-screen.tsx`, `intelligence/flow-screen.tsx` (2), `memory/compare-screen.tsx`, `memory/memory-detail-screen.tsx`, `memory/memory-panel-screen.tsx` (3), `command/movement-block.tsx`, `deal/deal-brief-screen.tsx`. |

**Never modified — the fade must not reach these**

| File | Why |
| --- | --- |
| `mobile/screens/deal/brief-hero.tsx` | Holds the shared-card `view-transition-name`. Starting it at `opacity: 0` animates the morph target into nothing. |
| `mobile/screens/memory/ask-screen.tsx` | Its `Shimmer` is a pending-answer placeholder inside a chat thread, not a screen populating. Fading an arriving answer is a separate design question. |
| `mobile/screens/command/pulse-block.tsx`, `verdict-block.tsx` | Already apply `.m-appear` directly. |

---

# Phase 1 — the two reported bugs

### Task 1: A typing-driven URL replace must not animate

**Files:**
- Modify: `artifacts/edc/src/mobile/nav/mobile-nav.ts` (append after `isLateralMove`, currently ends line 123)
- Modify: `artifacts/edc/src/mobile/nav/mobile-nav.test.ts`
- Modify: `artifacts/edc/src/mobile/lib/nav-transition.ts:62` (`runTransition`) and `:114` (`aroundNav`)
- Create: `artifacts/edc/src/mobile/lib/nav-transition.test.ts`

**Interfaces:**
- Consumes: `pathnameOf(to: string): string` — already exported from `mobile-nav.ts`.
- Produces: `isQuietMove(fromPath: string, toPath: string, replace: boolean): boolean`. `runTransition(direction, update, afterCommit?, quiet?)` — the 4th parameter is new and optional, so existing callers are unaffected.

- [ ] **Step 1: Write the failing test for `isQuietMove`**

Append to `artifacts/edc/src/mobile/nav/mobile-nav.test.ts`:

```ts
describe("isQuietMove", () => {
  it("is quiet for a replace that only changes the query on the same path", () => {
    // The Deals search: one of these per settled keystroke.
    expect(isQuietMove("/deals", "/deals?q=acme", true)).toBe(true);
    expect(isQuietMove("/deals", "/deals", true)).toBe(true);
  });

  it("is NOT quiet for a push, even on the same path", () => {
    // Filter, sort, group and saved-view changes push on purpose, so the back
    // gesture undoes them. Those keep their cross-fade.
    expect(isQuietMove("/deals", "/deals?h=RED", false)).toBe(false);
  });

  it("is NOT quiet for a replace across paths", () => {
    // The Intelligence lens switcher replaces so the three lenses share one
    // back-stack entry. It must still cross-fade.
    expect(isQuietMove("/analytics", "/portfolio", true)).toBe(false);
  });

  it("compares pathnames, ignoring query and hash on both sides", () => {
    expect(isQuietMove("/deals?q=a", "/deals?q=ab", true)).toBe(true);
    expect(isQuietMove("/deals#top", "/deals?q=ab", true)).toBe(true);
  });
});
```

Add `isQuietMove` to the existing import from `./mobile-nav` at the top of that file.

- [ ] **Step 2: Run it and confirm it fails**

Run: `pnpm --filter @workspace/edc exec vitest run src/mobile/nav/mobile-nav.test.ts -t "isQuietMove"`
Expected: FAIL — `isQuietMove is not a function`.

- [ ] **Step 3: Implement `isQuietMove`**

Append to `artifacts/edc/src/mobile/nav/mobile-nav.ts`:

```ts
/**
 * Whether a navigation should complete with no animation at all.
 *
 * A design statement, not an optimisation. A PUSH carrying a new query is a
 * discrete act the reader chose — a filter, a sort, a saved view — and
 * cross-fading it is right. A REPLACE on the path already underfoot is a
 * continuous adjustment of the list in front of them, and continuous
 * adjustments do not animate: the Deals search replaces once per settled
 * keystroke, and animating that cross-faded the whole root, the field being
 * typed into included.
 *
 * `replace` is the discriminator rather than "same path", because filter, sort
 * and group deliberately push (see use-roster-url.ts) and must keep their
 * cross-fade. The shell's only other replace is the Intelligence lens switcher,
 * which changes path and so is unaffected.
 */
export function isQuietMove(fromPath: string, toPath: string, replace: boolean): boolean {
  return replace && pathnameOf(fromPath) === pathnameOf(toPath);
}
```

- [ ] **Step 4: Run it and confirm it passes**

Run: `pnpm --filter @workspace/edc exec vitest run src/mobile/nav/mobile-nav.test.ts -t "isQuietMove"`
Expected: PASS (4 tests).

- [ ] **Step 5: Write the failing test for index stamping on the quiet path**

This is the regression guard. Create `artifacts/edc/src/mobile/lib/nav-transition.test.ts`:

```ts
import { describe, expect, it, vi, beforeEach } from "vitest";
import { aroundNav } from "./nav-transition";
import { readIndex } from "./history-index";

/**
 * The quiet path must skip the ANIMATION and nothing else.
 *
 * The tempting shortcut is `navigate(to, { transition: false })`, which
 * aroundNav already understands — but that branch returns early and skips
 * stampIndex, so the replaced entry loses its __mIndex. currentIndex() then
 * falls back to 0, canPopWithinApp() reports false, and the back chevron
 * vanishes from every screen reached from a searched list.
 */
describe("aroundNav quiet path", () => {
  beforeEach(() => {
    history.replaceState({ __mIndex: 3 }, "", "/deals");
  });

  it("still stamps the history index on a same-path replace", () => {
    const navigate = vi.fn();
    aroundNav(navigate, "/deals?q=acme", { replace: true });

    expect(navigate).toHaveBeenCalledTimes(1);
    const [to, options] = navigate.mock.calls[0];
    expect(to).toBe("/deals?q=acme");
    // A replace keeps the entry, so it keeps the index.
    expect(readIndex(options.state)).toBe(3);
  });

  it("does not mark a direction for a quiet move", () => {
    aroundNav(vi.fn(), "/deals?q=acme", { replace: true });
    expect(document.documentElement.dataset.mNav).toBeUndefined();
  });
});
```

`environment: "node"` has no `history` or `document`. Add the minimal globals at the top of this test file, above the imports' use — a stub is honest here because the assertions are about *what aroundNav writes*, not about a real browser:

```ts
// node environment: no history, no document. Both are stubbed to exactly the
// surface aroundNav touches.
const state: { value: unknown } = { value: null };
vi.stubGlobal("history", {
  get state() {
    return state.value;
  },
  replaceState: (s: unknown) => {
    state.value = s;
  },
});
vi.stubGlobal("location", { pathname: "/deals" });
vi.stubGlobal("window", { location: { pathname: "/deals" } });
vi.stubGlobal("document", { documentElement: { dataset: {} } });
```

Place this block immediately after the imports. Replace the `beforeEach` body with `state.value = { __mIndex: 3 }`.

- [ ] **Step 6: Run it and confirm it fails**

Run: `pnpm --filter @workspace/edc exec vitest run src/mobile/lib/nav-transition.test.ts`
Expected: FAIL — `data-m-nav` is set to `"lateral"` and/or the second test fails, because nothing is quiet yet.

- [ ] **Step 7: Add the `quiet` parameter to `runTransition`**

In `artifacts/edc/src/mobile/lib/nav-transition.ts`, change the `runTransition` signature and its early-return:

```ts
export function runTransition(
  direction: NavDirection,
  update: () => void,
  afterCommit?: () => void,
  /**
   * Skip the animation, keeping every other effect. Typing in a list's search
   * field replaces the URL once per settled keystroke; animating that
   * cross-faded the whole root. See isQuietMove.
   */
  quiet?: boolean,
): void {
  const start = (document as Document & { startViewTransition?: StartViewTransition })
    .startViewTransition;

  if (quiet || !start || prefersReducedMotion()) {
    update();
    afterCommit?.();
    return;
  }
```

Leave the rest of the function unchanged.

- [ ] **Step 8: Compute `quiet` in `aroundNav`**

In the same file, inside `aroundNav`, after `const direction = navDirection(...)`, add:

```ts
  // Not `options.transition === false`: that branch returns before stampIndex,
  // which would strip __mIndex off the replaced entry and break canPopWithinApp.
  const quiet = isQuietMove(from.path, to, options?.replace === true);
```

Change the `runTransition` call's tail to pass it:

```ts
  runTransition(
    direction,
    () => navigate(to, withIndex),
    () => {
      noteNavigation(to, toIndex);
    },
    quiet,
  );
```

Add `isQuietMove` to the existing `import { isLateralMove } from "../nav/mobile-nav";` line.

- [ ] **Step 9: Run both test files and typecheck**

Run: `pnpm --filter @workspace/edc exec vitest run src/mobile/lib/nav-transition.test.ts src/mobile/nav/mobile-nav.test.ts`
Expected: PASS.
Run: `pnpm run typecheck`
Expected: no errors.

- [ ] **Step 10: Commit**

```bash
git add artifacts/edc/src/mobile/nav/mobile-nav.ts artifacts/edc/src/mobile/nav/mobile-nav.test.ts artifacts/edc/src/mobile/lib/nav-transition.ts artifacts/edc/src/mobile/lib/nav-transition.test.ts
git commit -m "Stop a typed search from cross-fading the whole screen"
```

---

### Task 2: Hold the previous results while the next ones load

**Files:**
- Modify: `artifacts/edc/src/components/roster/hooks/use-roster-data.ts:18-22`
- Modify: `artifacts/edc/src/mobile/screens/deals/deals-screen.tsx:25`

**Interfaces:**
- Consumes: nothing from Task 1.
- Produces: no signature change. `useRosterData` keeps returning `{ rows, total, isLoading, isError, isFetching, refetch }`; `isLoading` simply stops flipping true on a search keystroke.

- [ ] **Step 1: Add `keepPreviousData` to the deals query**

In `use-roster-data.ts`, add the import:

```ts
import { keepPreviousData } from "@tanstack/react-query";
```

Replace the `useListDeals` call:

```ts
  const dealsQuery = useListDeals(dealParams, {
    // Opt this query into focus refetch (the global default is off); Phase 8
    // layers a visible-tab interval on top.
    //
    // keepPreviousData, or every settled keystroke is a brand-new query key, and
    // a brand-new key means isLoading — which tears the list down to shimmer
    // between each character, blanks the nav subtitle, and can flash "No
    // matches" for a half-typed term. Same fix, and the same reason, as
    // mobile/screens/memory/memory-screen.tsx.
    //
    // Desktop shares this hook and already renders "· updating…" gated on
    // isFetching (pages/deals.tsx). That hint never fired during a search
    // before, because the list was torn down instead; this is what makes it work
    // as written.
    query: {
      refetchOnWindowFocus: true,
      queryKey: getListDealsQueryKey(dealParams),
      placeholderData: keepPreviousData,
    },
  });
```

`useGetRosterEnrichment()` takes no params, so its key never changes and it needs nothing.

- [ ] **Step 2: Raise the debounce**

In `deals-screen.tsx`, replace lines 24–25:

```ts
/**
 * One keystroke per request is a request per keystroke.
 *
 * 350 rather than 280: each settled keystroke is a 500-row Data Store read, and
 * Catalyst's concurrency limit surfaces as a 429 that presents as a fast 500.
 * Read lag is ~1–2s regardless, so the extra 70ms is invisible to the reader and
 * measurably fewer requests.
 */
const SEARCH_DEBOUNCE_MS = 350;
```

- [ ] **Step 3: Run the suite and typecheck**

Run: `pnpm --filter @workspace/edc run test`
Expected: PASS. No existing test asserts `SEARCH_DEBOUNCE_MS` or the query options; if one fails, read it before changing it.
Run: `pnpm run typecheck`
Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add artifacts/edc/src/components/roster/hooks/use-roster-data.ts artifacts/edc/src/mobile/screens/deals/deals-screen.tsx
git commit -m "Keep the deal list on screen while a search reloads it"
```

---

### Task 3: The dock joins the rest of the chrome

**Files:**
- Modify: `artifacts/edc/src/mobile/styles/motion.css:208-216`
- Modify: `artifacts/edc/src/mobile/shell/m-dock.tsx:50-55`

**Interfaces:**
- Consumes: nothing.
- Produces: nothing consumed by later tasks.

Measured on the running app: a Command → Deals switch produces `::view-transition-group(root)`, `(m-navbar)` and `(m-tabbar)` — and **no** `m-dock`, confirming the dock rides inside the root snapshot and is dragged along with the content.

- [ ] **Step 1: Add the class**

In `motion.css`, after the `.m-vt-capsule` rule (line 214–216), add:

```css
/* The docked bar — the search fields on Deals and Memory, the composer on Ask.
   Without a name of its own it rode inside the root snapshot, so switching
   Memory ↔ Deals faded out a bar and faded in a visually identical one.
   Only one dock is ever in the real DOM at a time (the outgoing screen is a
   snapshot), so one shared name cannot collide. */
.m-vt-dock {
  view-transition-name: m-dock;
}
```

- [ ] **Step 2: Apply it in `MDock`, not in the callers**

In `m-dock.tsx`, add `"m-vt-dock"` to the component's own `cn()` call:

```tsx
    <div
      className={cn(
        "m-glass m-glass-bottom m-vt-dock absolute inset-x-0 z-30 border-t border-border",
        className,
      )}
    >
```

It goes here for the reason the file already states about `position`: so a screen edit cannot quietly drop it.

- [ ] **Step 3: Run the style/token suites**

Run: `pnpm --filter @workspace/edc exec vitest run src/mobile/class-scan.test.ts src/mobile/dock-static.test.ts src/mobile/tokens.test.ts`
Expected: PASS. `class-scan.test.ts` checks that `.m-*` classes used in TSX exist in CSS — this task adds both halves, so it should stay green.

- [ ] **Step 4: Commit**

```bash
git add artifacts/edc/src/mobile/styles/motion.css artifacts/edc/src/mobile/shell/m-dock.tsx
git commit -m "Hold the docked bar still through a route change"
```

---

### Task 4: The fade predicate and its hook

**Files:**
- Create: `artifacts/edc/src/mobile/lib/appear.ts`
- Create: `artifacts/edc/src/mobile/lib/appear.test.ts`
- Create: `artifacts/edc/src/mobile/hooks/use-appear-on-settle.ts`

**Interfaces:**
- Consumes: nothing.
- Produces: `appearsOnSettle(everLoaded: boolean, loading: boolean): boolean` and `useAppearOnSettle(loading: boolean): string | undefined` (returns the literal `"m-appear"` or `undefined`). **Every later task in this plan calls the hook and spreads its result into a `cn()`.**

- [ ] **Step 1: Write the failing test**

Create `artifacts/edc/src/mobile/lib/appear.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { appearsOnSettle } from "./appear";

describe("appearsOnSettle", () => {
  it("fades on the loading -> settled edge", () => {
    expect(appearsOnSettle(true, false)).toBe(true);
  });

  it("does not fade while still loading", () => {
    expect(appearsOnSettle(true, true)).toBe(false);
    expect(appearsOnSettle(false, true)).toBe(false);
  });

  it("does not fade when the first render was already settled", () => {
    // A warm cache. The route transition is already animating this screen's
    // arrival, and a second animation on top of it is the "second load" reading
    // .m-appear exists to avoid — and it would start a shared-card morph target
    // at opacity 0.
    expect(appearsOnSettle(false, false)).toBe(false);
  });
});
```

- [ ] **Step 2: Run it and confirm it fails**

Run: `pnpm --filter @workspace/edc exec vitest run src/mobile/lib/appear.test.ts`
Expected: FAIL — cannot resolve `./appear`.

- [ ] **Step 3: Write the pure module**

Create `artifacts/edc/src/mobile/lib/appear.ts`:

```ts
/**
 * Whether a settled render should fade its content in.
 *
 * The shell already cross-fades a page switch, and it already draws a skeleton
 * while a screen's queries are in flight. What it never animated is the moment
 * BETWEEN those two — the skeleton being replaced by real content. Measured on a
 * Command → Deals switch: the cross-fade delivers a screen holding five shimmer
 * blocks and zero deals, and the deals then appear with no transition at all.
 *
 * Two states must NOT fade, and both are why this is a function rather than
 * `!loading`:
 *
 *  - still loading — there is nothing to fade in yet;
 *  - a first render that was ALREADY settled, i.e. a warm cache. There the route
 *    transition is animating the arrival, so a second animation on top of it
 *    reads as a second load — and on the deal brief it would start the
 *    shared-card morph target at opacity 0 and fly the hero into nothing.
 *
 * Pure and parameterised rather than reading a ref, because vitest runs this
 * package with `environment: "node"` and collects only `*.test.ts` — there is no
 * DOM and no React renderer, so anything that must be verified has to be pure.
 */
export function appearsOnSettle(everLoaded: boolean, loading: boolean): boolean {
  return everLoaded && !loading;
}
```

- [ ] **Step 4: Run it and confirm it passes**

Run: `pnpm --filter @workspace/edc exec vitest run src/mobile/lib/appear.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Write the hook**

Create `artifacts/edc/src/mobile/hooks/use-appear-on-settle.ts`:

```ts
import { useRef } from "react";
import { appearsOnSettle } from "@/mobile/lib/appear";

/**
 * The class that fades content in when it replaces its own skeleton, or
 * undefined when it must not.
 *
 * Returns `.m-appear` — motion.css's existing "content replacing its own
 * skeleton" animation, used unchanged. The class is applied to the container
 * that was already there rather than to a new wrapper, which is enough: adding
 * an `animation-name` to an element that had none starts the animation, so the
 * fade runs on the same commit that swaps the content in.
 *
 * Deliberately sticky. Once a screen has faded, the class stays, so the
 * animation does not replay when an unrelated re-render happens. A screen
 * unmounts on a route change, so returning to it starts this over — which is
 * correct in both directions: cold cache fades, warm cache does not.
 *
 * The ref write during render is idempotent (it only ever sets true), so
 * StrictMode's double render cannot change the outcome.
 */
export function useAppearOnSettle(loading: boolean): string | undefined {
  const everLoaded = useRef(false);
  if (loading) everLoaded.current = true;
  return appearsOnSettle(everLoaded.current, loading) ? "m-appear" : undefined;
}
```

- [ ] **Step 6: Typecheck**

Run: `pnpm run typecheck`
Expected: no errors.

- [ ] **Step 7: Commit**

```bash
git add artifacts/edc/src/mobile/lib/appear.ts artifacts/edc/src/mobile/lib/appear.test.ts artifacts/edc/src/mobile/hooks/use-appear-on-settle.ts
git commit -m "Add the rule for fading content in over its own skeleton"
```

---

### Task 5: Fade all sixteen deal panels at once

**Files:**
- Modify: `artifacts/edc/src/mobile/screens/deal/panel-screen.tsx:100-135`

**Interfaces:**
- Consumes: `useAppearOnSettle(loading: boolean): string | undefined` from Task 4.
- Produces: no prop change. `PanelBody`'s public signature is untouched, so none of the sixteen panels change.

`PanelBody` already owns the `error → loading → empty → content` ladder for every deal panel, for the reason its own doc gives. One edit here is sixteen screens.

- [ ] **Step 1: Add the imports**

At the top of `panel-screen.tsx`, add:

```ts
import { cn } from "@/lib/utils";
import { useAppearOnSettle } from "@/mobile/hooks/use-appear-on-settle";
```

(If `cn` is already imported, do not duplicate it.)

- [ ] **Step 2: Fade the content branch**

Replace the body of `PanelBody` from the `if (error)` line through the final `return`:

```tsx
  // Called before any early return — a hook cannot sit behind a branch.
  const appear = useAppearOnSettle(loading);

  if (error) return <ErrorState title="Couldn't load this" body={errorBody} />;

  if (loading) {
    return (
      <div className="space-y-3">
        <Shimmer className="h-24 rounded-xl" />
        <div className="m-card p-4">
          <ShimmerLines lines={4} />
        </div>
      </div>
    );
  }

  if (empty) {
    return <EmptyState title={emptyTitle ?? "Nothing here yet"} body={emptyBody ?? ""} />;
  }

  // A wrapper rather than the class on `children`, because children is whatever
  // sixteen panels pass and cannot be assumed to accept a className.
  //
  // It MUST carry space-y-3. The cards were direct children of panel-screen's
  // own `space-y-3` container, which puts the gap between them; a bare wrapper
  // makes them grandchildren and collapses every gap on all sixteen panels.
  // Reproducing it here is also symmetric with the loading branch above, which
  // wraps its shimmers in exactly this class for exactly this reason.
  //
  // Empty and error states deliberately do not fade: they are destinations, not
  // populations.
  return <div className={cn("space-y-3", appear)}>{children}</div>;
```

- [ ] **Step 3: Run the panel suites and typecheck**

Run: `pnpm --filter @workspace/edc exec vitest run src/mobile/panel-loading-gate.test.ts src/mobile/class-scan.test.ts`
Expected: PASS.
Run: `pnpm run typecheck`
Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add artifacts/edc/src/mobile/screens/deal/panel-screen.tsx
git commit -m "Fade a deal panel in over its own skeleton"
```

---

### Task 6: Fade every chart card

**Files:**
- Modify: `artifacts/edc/src/mobile/charts/m-chart-frame.tsx:61-69`

**Interfaces:**
- Consumes: `useAppearOnSettle` from Task 4.
- Produces: no prop change. `MChartFrame`'s `loading?: boolean` is unchanged.

This is the boundary that makes the multi-query screens work. Pipeline has four independent gates (sim, winLoss, funnel, velocity) and Flow has its own; gating those screens' *containers* would replay a fade over cards that had already popped in. The card is the correct unit, and `MChartFrame` is every card.

- [ ] **Step 1: Add the import**

`cn` is already imported in this file. Add:

```ts
import { useAppearOnSettle } from "@/mobile/hooks/use-appear-on-settle";
```

- [ ] **Step 2: Fade the body**

Replace the `body` assignment (lines 61–69):

```tsx
  // `loading` is optional here: a chart that never renders a skeleton never
  // fades, which is correct.
  const appear = useAppearOnSettle(loading === true);

  const body = error ? (
    <p className="m-body m-muted py-6 text-center">{error}</p>
  ) : loading ? (
    <div className="m-skeleton h-40 w-full" aria-hidden="true" />
  ) : empty ? (
    <p className="m-body m-muted py-6 text-center">{empty}</p>
  ) : (
    // `className={appear}` rather than `cn(appear)`: undefined omits the
    // attribute entirely, where cn() would emit className="". No spacing class
    // is needed here — unlike PanelBody, a chart's body is a single child and
    // its parent section is not a space-y container.
    <div className={appear}>{children}</div>
  );
```

- [ ] **Step 3: Typecheck and run the suite**

Run: `pnpm run typecheck`
Expected: no errors.
Run: `pnpm --filter @workspace/edc run test`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add artifacts/edc/src/mobile/charts/m-chart-frame.tsx
git commit -m "Fade a chart in over its own skeleton"
```

---

### Task 7: The Intelligence lenses

**Files:**
- Modify: `artifacts/edc/src/mobile/screens/intelligence/lens-screen.tsx:32-72`
- Modify: `artifacts/edc/src/mobile/screens/intelligence/portfolio-screen.tsx:85-90`
- Modify: `artifacts/edc/src/mobile/screens/intelligence/losses-screen.tsx:89`
- Modify: `artifacts/edc/src/mobile/screens/intelligence/pipeline-screen.tsx:201`

**Interfaces:**
- Consumes: `useAppearOnSettle` from Task 4.
- Produces: `LensScreen` gains an optional prop `loading?: boolean`. Omitting it means "this lens's cards fade themselves" — which is what Pipeline does, because its charts go through `MChartFrame`.

- [ ] **Step 1: Add `loading` to `LensScreen`**

In `lens-screen.tsx`, add the imports:

```ts
import { cn } from "@/lib/utils";
import { useAppearOnSettle } from "@/mobile/hooks/use-appear-on-settle";
```

Change the signature and the container. Replace lines 32–41 (the `export function LensScreen({...})` head through `const [path] = useLocation();`):

```tsx
export function LensScreen({
  subtitle,
  onRefresh,
  /**
   * The lens's single loading gate, when it has one — Portfolio and Losses each
   * hang their whole body off one query, so the container fades once.
   *
   * OMIT IT when the lens has several independent gates. Pipeline does: its four
   * charts settle at different moments and each fades itself through
   * MChartFrame. A container fade there would replay over cards already on
   * screen.
   */
  loading,
  children,
}: {
  subtitle?: ReactNode;
  onRefresh: () => Promise<unknown> | unknown;
  loading?: boolean;
  children: ReactNode;
}) {
  const [path] = useLocation();
  const appear = useAppearOnSettle(loading === true);
```

Then change line 69 to:

```tsx
        <div className={cn("space-y-3 p-4", appear)}>{children}</div>
```

- [ ] **Step 2: Pass it from Portfolio**

In `portfolio-screen.tsx`, add `loading` to the `LensScreen` props (after `onRefresh={refresh}` on line 89):

```tsx
      onRefresh={refresh}
      loading={analysisQuery.isLoading}
```

- [ ] **Step 3: Pass it from Losses**

In `losses-screen.tsx`, on the `<LensScreen` element beginning at line 89, add:

```tsx
      loading={dashboardQuery.isLoading}
```

- [ ] **Step 4: Fade Pipeline's one non-chart block**

Pipeline passes **no** `loading` to `LensScreen`. Its three chart cards are already covered by Task 6; only the velocity block at line 201 is not. Add the imports to `pipeline-screen.tsx`:

```ts
import { cn } from "@/lib/utils";
import { useAppearOnSettle } from "@/mobile/hooks/use-appear-on-settle";
```

Add near the other hook calls in the component body:

```ts
  const velocityAppear = useAppearOnSettle(velocityQuery.isLoading);
```

The card at lines 199–201 is `<MobileCard><CardHeader label="Slowest against benchmark" />{velocityQuery.isLoading ? <Shimmer className="h-20" /> : slowest.length === 0 ? <p…> : <ul>…</ul>}`. Put the class on that `<ul>`, leaving the skeleton and empty branches untouched:

```tsx
        ) : (
          <ul className={velocityAppear}>
```

That `<ul>` opens on line 206 in the current file. `className={velocityAppear}` rather than `cn(...)`: the `<ul>` carries no other class, and `undefined` omits the attribute where `cn()` would emit `className=""`. `cn` is therefore not needed in this file unless another edit introduces it.

- [ ] **Step 5: Typecheck and run the suite**

Run: `pnpm run typecheck`
Expected: no errors.
Run: `pnpm --filter @workspace/edc run test`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add artifacts/edc/src/mobile/screens/intelligence/
git commit -m "Fade the Intelligence lenses in as they populate"
```

---

### Task 8: The four Memory lens screens

**Files:**
- Modify: `artifacts/edc/src/mobile/screens/memory/lens-screens.tsx:22-39` (`LensFrame`) and its four callers

**Interfaces:**
- Consumes: `useAppearOnSettle` from Task 4.
- Produces: `LensFrame` gains a required `loading: boolean` prop. It is module-private, so the only callers are the four screens in this same file — making it required is safe and stops the fifth screen forgetting.

- [ ] **Step 1: Add `loading` to `LensFrame`**

`cn` is already imported in this file. Add:

```ts
import { useAppearOnSettle } from "@/mobile/hooks/use-appear-on-settle";
```

Replace `LensFrame` (lines 22–39):

```tsx
/** Shared chrome: a pushed screen under Memory with a back chevron and nothing else. */
function LensFrame({
  title,
  onRefresh,
  /** Required, not optional: every one of these screens is a single query, and a
   *  required prop is what stops the next one being added without a fade. */
  loading,
  children,
}: {
  title: string;
  onRefresh: () => Promise<unknown> | unknown;
  loading: boolean;
  children: React.ReactNode;
}) {
  const appear = useAppearOnSettle(loading);

  return (
    <>
      <MNavBar title={title} backHref="/memory" backLabel="Back to memory" />
      <PullToRefresh onRefresh={onRefresh}>
        <div className={cn("space-y-3 p-4", appear)}>{children}</div>
      </PullToRefresh>
    </>
  );
}
```

- [ ] **Step 2: Pass it from all four callers**

There are exactly four, at these lines in the current file:

```tsx
// line 62 — MemoryHealthScreen, query = useGetMemoryHealth()
<LensFrame title="Archive health" onRefresh={query.refetch} loading={query.isLoading}>

// line 143 — RevivalScreen, query = useListRevivalCandidates()
<LensFrame title="Revival candidates" onRefresh={query.refetch} loading={query.isLoading}>

// line 233 — CompetitorIntelScreen, query = useGetCompetitorIntel()
<LensFrame title="Competitor intel" onRefresh={query.refetch} loading={query.isLoading}>

// line 334 — PricingBenchmarksScreen, TWO queries (benchmarksQuery, playbookQuery).
// `||` so the screen arrives in one piece — the rule panel-loading-gate.test.ts
// enforces, because `&&` clears the skeleton when the FIRST query resolves and
// lets the second card land above content already on screen.
<LensFrame
  title="Pricing benchmarks"
  onRefresh={refresh}
  loading={benchmarksQuery.isLoading || playbookQuery.isLoading}
>
```

- [ ] **Step 3: Typecheck**

Run: `pnpm run typecheck`
Expected: no errors. Because `loading` is required, a missed call site is a type error naming the exact line.

- [ ] **Step 4: Run the suite**

Run: `pnpm --filter @workspace/edc run test`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add artifacts/edc/src/mobile/screens/memory/lens-screens.tsx
git commit -m "Fade the Memory lenses in as they populate"
```

---

### Task 9: The tab roots — Deals, Memory, Command

**Files:**
- Modify: `artifacts/edc/src/mobile/screens/deals/deals-screen.tsx:170`
- Modify: `artifacts/edc/src/mobile/screens/memory/memory-screen.tsx:190`
- Modify: `artifacts/edc/src/mobile/screens/command/needs-block.tsx:84`

**Interfaces:**
- Consumes: `useAppearOnSettle` from Task 4.
- Produces: nothing consumed later.

These are the screens the reported problem is about — a tab switch is exactly when a screen is in its loading state.

- [ ] **Step 1: Deals**

In `deals-screen.tsx`, add the imports:

```ts
import { cn } from "@/lib/utils";
import { useAppearOnSettle } from "@/mobile/hooks/use-appear-on-settle";
```

Add after the `useRosterData` call:

```ts
  const appear = useAppearOnSettle(isLoading);
```

Change line 170:

```tsx
        <div className={cn("space-y-3 p-4", appear)}>
```

- [ ] **Step 2: Memory**

In `memory-screen.tsx`, add the same two imports (add only what is missing), then after the `useSearchDealMemory` call:

```ts
  const appear = useAppearOnSettle(isLoading);
```

Change line 190:

```tsx
        <div className={cn("space-y-3 p-4", appear)}>
```

Note this composes correctly with Memory's existing `keepPreviousData`: `isLoading` is true only on the genuine first load, so the archive fades in once and search results afterwards update in place — which is the intent.

- [ ] **Step 3: Command's Needs block**

`NeedsBlock` is Command's only skeleton→content boundary (`PulseBlock` and `VerdictBlock` already use `.m-appear`, and the other three blocks take data directly with no loading gate).

In `needs-block.tsx`, add:

```ts
import { useAppearOnSettle } from "@/mobile/hooks/use-appear-on-settle";
```

`cn` is already imported. Add at the top of the component body:

```ts
  const appear = useAppearOnSettle(loading);
```

Change the `<ul>` on line 84 to:

```tsx
            <ul className={appear}>
```

`className={appear}` rather than `cn(appear)`: the `<ul>` carries no other class, and `undefined` omits the attribute. This file's existing `cn` import stays for the uses already in it.

The fade goes on the `<ul>`, inside the fixed `min-h-[336px]` box. That box exists because the swap must happen *inside* it or the box itself moves — 224px of measured shift. A fade on the `<ul>` changes opacity and a 4px translate only, so it cannot reintroduce that.

- [ ] **Step 4: Typecheck and run the suite**

Run: `pnpm run typecheck`
Expected: no errors.
Run: `pnpm --filter @workspace/edc run test`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add artifacts/edc/src/mobile/screens/deals/deals-screen.tsx artifacts/edc/src/mobile/screens/memory/memory-screen.tsx artifacts/edc/src/mobile/screens/command/needs-block.tsx
git commit -m "Fade the tab roots in as they populate"
```

---

### Task 10: The coverage test, with a shrinking pending list

**Files:**
- Create: `artifacts/edc/src/mobile/appear-coverage.test.ts`

**Interfaces:**
- Consumes: `SRC` from `./module-graph` (already exported: `artifacts/edc/src`).
- Produces: a `PENDING` array that Task 13 empties and deletes.

Modelled on `panel-loading-gate.test.ts`, and for the same reason: it is what stops screen #27 forgetting.

- [ ] **Step 1: Write the test**

Create `artifacts/edc/src/mobile/appear-coverage.test.ts`:

```ts
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, sep } from "node:path";
import { describe, expect, it } from "vitest";
import { SRC } from "./module-graph";

/**
 * Every skeleton→content boundary in the mobile shell fades.
 *
 * The shell cross-fades a page switch and draws a skeleton while queries are in
 * flight, but for a long time it never animated the moment BETWEEN them.
 * Measured on a Command → Deals switch: the cross-fade delivered a screen
 * holding five shimmer blocks and zero deals, and the deals then appeared with
 * no transition at all.
 *
 * A file satisfies this if it calls useAppearOnSettle, applies .m-appear
 * directly, or hands its loading state to a shared component that does
 * (PanelBody, MChartFrame, LensScreen, LensFrame all take `loading=`).
 *
 * Detection keys on `Shimmer`, NOT on `isLoading`. Several screens gate on data
 * presence instead — flow-screen writes `{!health ? <Shimmer/> : …}` and
 * deal-brief-screen does not reference isLoading at all — so an isLoading grep
 * silently exempts exactly the screens most likely to be missed.
 */

const SCREENS = join(SRC, "mobile", "screens");

/**
 * Screens whose skeleton→content swap is deliberately NOT faded. Each needs a
 * reason, because an unexplained entry is indistinguishable from an oversight.
 */
const EXEMPT: Record<string, string> = {
  "deal/brief-hero.tsx":
    "holds the shared-card view-transition-name; opacity 0 animates the morph target into nothing",
  "memory/ask-screen.tsx":
    "its Shimmer is a pending-answer placeholder in a chat thread, not a screen populating",
};

/**
 * Screens not yet converted. This list must only ever shrink; the final task of
 * the plan that introduced this test empties it and deletes it.
 */
const PENDING: string[] = [
  "account/settings-screen.tsx",
  "command/movement-block.tsx",
  "deal/deal-brief-screen.tsx",
  "intelligence/flow-screen.tsx",
  "intelligence/loss-detail-screen.tsx",
  "intelligence/portfolio-alerts-screen.tsx",
  "memory/compare-screen.tsx",
  "memory/memory-detail-screen.tsx",
  "memory/memory-panel-screen.tsx",
];

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((entry) => {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) return walk(full);
    return entry.endsWith(".tsx") && !entry.includes(".test.") ? [full] : [];
  });
}

const FILES = walk(SCREENS).map((f) => ({
  id: relative(SCREENS, f).split(sep).join("/"),
  source: readFileSync(f, "utf8"),
}));

/** Files that draw a skeleton, i.e. that have a swap to fade. */
const WITH_SKELETON = FILES.filter(({ source }) => {
  const code = source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
  return /\bShimmer\b/.test(code) || /\bm-skeleton\b/.test(code);
});

const CHECKED = WITH_SKELETON.filter(({ id }) => !(id in EXEMPT));

describe("content fades in over its own skeleton", () => {
  it("finds screens to check", () => {
    // Guards the guard: a rename that empties this list must not read as a pass.
    expect(CHECKED.length).toBeGreaterThan(10);
    expect(CHECKED.map((f) => f.id)).toContain("deals/deals-screen.tsx");
  });

  it.each(CHECKED.map((f) => f.id))("%s participates in the fade", (id) => {
    if (PENDING.includes(id)) return;
    const { source } = CHECKED.find((f) => f.id === id)!;
    const participates =
      source.includes("useAppearOnSettle") ||
      source.includes("m-appear") ||
      /\bloading=\{/.test(source);
    expect(
      participates,
      `${id} draws a skeleton but neither calls useAppearOnSettle, applies ` +
        `.m-appear, nor hands its loading state to a component that does ` +
        `(PanelBody, MChartFrame, LensScreen, LensFrame). Content there ` +
        `replaces its skeleton with a hard cut. If the cut is deliberate, add ` +
        `it to EXEMPT with a reason.`,
    ).toBe(true);
  });

  it("keeps the pending and exempt lists honest", () => {
    // A stale entry hides a screen that no longer needs an exemption.
    const ids = new Set(WITH_SKELETON.map((f) => f.id));
    for (const id of PENDING) {
      expect(ids.has(id), `${id} is in PENDING but draws no skeleton`).toBe(true);
    }
    for (const id of Object.keys(EXEMPT)) {
      expect(ids.has(id), `${id} is in EXEMPT but draws no skeleton`).toBe(true);
    }
  });
});
```

- [ ] **Step 2: Run it**

Run: `pnpm --filter @workspace/edc exec vitest run src/mobile/appear-coverage.test.ts`
Expected: PASS. If a file outside `PENDING` fails, either it was missed in Tasks 5–9 — fix the screen, not the list — or it genuinely belongs in `PENDING`; add it and carry it into Task 13.

- [ ] **Step 3: Commit**

```bash
git add artifacts/edc/src/mobile/appear-coverage.test.ts
git commit -m "Assert every loading branch in the shell fades its content in"
```

---

### Task 11: Phase 1 verification on the running app

**Files:** none — this task changes nothing.

Tests cannot see a fade. Two things must be confirmed in a browser.

- [ ] **Step 1: Start the frontend (PowerShell, not Git Bash)**

```powershell
$env:PORT='5173'; $env:BASE_PATH='/'; pnpm --filter @workspace/edc run dev
```

Git Bash mangles `BASE_PATH=/` into a Windows path via MSYS conversion.

- [ ] **Step 2: Mount the authenticated shell without signing in**

Local sign-in is impossible by construction. Use the route-stub recipe — catch-all **first**, since Playwright matches the last-registered route first:

```js
await page.setViewportSize({ width: 390, height: 844 });
await page.route('**/api/**', () => new Promise(() => {}));
await page.route('**/api/v1/auth/me', r => r.fulfill({ status: 200,
  contentType: 'application/json',
  body: JSON.stringify({ id:'u1', email:'x@y.z', role:'admin', displayName:'Demo' }) }));
await page.goto('http://localhost:5173/');
await page.waitForTimeout(3000);   // warm-up: Vite's first per-shell transform is slow
await page.goto('http://localhost:5173/');
```

- [ ] **Step 3: Confirm a typed search runs no transition**

Hook `document.startViewTransition` to count calls, then type into `#deals-search`. Expected: **0 calls** and no `data-m-nav` attribute on `<html>` while typing, where before there was one transition per settled keystroke.

Two mechanics that will otherwise cost time: click via `page.evaluate(() => el.click())`, because Playwright's own `click` waits on a stability signal a view transition never reports; and install instrumentation **once per document**, because a second `page.evaluate` override wraps the first and every count comes back doubled — that artifact already produced a false "two navigations per tab tap" reading during this investigation.

- [ ] **Step 4: Confirm the list survives a keystroke**

While typing, assert `document.querySelectorAll('.m-skeleton').length === 0` once results have loaded once. Before this work it was 5 between every letter.

- [ ] **Step 5: Confirm the fade, and that the morph still runs**

Switch Command → Deals and confirm `.m-appear` is present on the content container when the deals land. Then open a deal card and confirm the card→hero morph still runs — this is the regression `appearsOnSettle`'s warm-cache case exists to prevent.

- [ ] **Step 6: Report what was and was not confirmed**

State plainly which of the five checks passed. Do not claim the fade "looks right" without having asserted the class.

---

# Phase 2 — the remaining pushed screens

Each task below follows the identical shape as Task 9: import `cn` (where missing) and `useAppearOnSettle`, call the hook with that screen's loading flag, and add `appear` to the content container's `cn()`. The exact container line is given per file. **Do not add the class to a skeleton container** — several of these screens put the same `space-y-3 p-4` classes on both.

### Task 12: Settings, Portfolio alerts, Loss detail

**Files:**
- Modify: `artifacts/edc/src/mobile/screens/account/settings-screen.tsx` — five sub-screens, content containers at lines 72, 141, 198, 249, 310, each gated on that sub-screen's `query.isLoading`
- Modify: `artifacts/edc/src/mobile/screens/intelligence/portfolio-alerts-screen.tsx:60` — gated on `query.isLoading` (the ternary opens at line 61)
- Modify: `artifacts/edc/src/mobile/screens/intelligence/loss-detail-screen.tsx` — three sub-screens, containers at 62, 136, 247, each gated on that sub-screen's `query.isLoading`

**Interfaces:**
- Consumes: `useAppearOnSettle` from Task 4.
- Produces: nothing.

- [ ] **Step 1: Apply the identical edit at all nine sites**

Every one of these nine is the same shape: a module-private sub-component holding `const query = use…()`, whose container `<div className="space-y-3 p-4">` sits *outside* an `isError → isLoading → empty → content` ternary. So the class on that container is correct and covers the whole gate.

In each of the three files add the imports (skip any already present):

```ts
import { cn } from "@/lib/utils";
import { useAppearOnSettle } from "@/mobile/hooks/use-appear-on-settle";
```

Then in each sub-component below, add `const appear = useAppearOnSettle(query.isLoading);` after its `const query = …` line, and change its container to:

```tsx
      <div className={cn("space-y-3 p-4", appear)}>
```

| File | Sub-component | `query` from | Container line |
| --- | --- | --- | --- |
| `settings-screen.tsx` | `ChangeLog` | `useListSettingsChangeLog({ limit: CHANGE_LOG_LIMIT })` | 72 |
| `settings-screen.tsx` | `Users` | `useListUsers()` | 141 |
| `settings-screen.tsx` | `Team` | `useListTeamMembers()` | 198 |
| `settings-screen.tsx` | `Targets` | `useListPipelineTargets()` | 249 |
| `settings-screen.tsx` | `Achievements` | `useGetEngagement()` | 310 |
| `loss-detail-screen.tsx` | `EarlyWarning` | `useGetLossRisk()` | 62 |
| `loss-detail-screen.tsx` | `Archetypes` | `useGetAutopsy()` | 136 |
| `loss-detail-screen.tsx` | `ProductGaps` | `useGetProductGaps()` | 247 |
| `portfolio-alerts-screen.tsx` | `PortfolioAlertsScreen` | `useGetPortfolioAnalysis()` | 60 |

Line numbers are pre-edit; each earlier insertion shifts the ones below it in the same file, so work bottom-up within a file or re-locate by the container's class string.

- [ ] **Step 2: Confirm no site was missed**

Run: `pnpm --filter @workspace/edc exec vitest run src/mobile/appear-coverage.test.ts`
Expected: still PASS (these three files are in `PENDING` until Step 4). Then grep to confirm nine hook calls landed:

Run: `grep -c useAppearOnSettle artifacts/edc/src/mobile/screens/account/settings-screen.tsx artifacts/edc/src/mobile/screens/intelligence/loss-detail-screen.tsx artifacts/edc/src/mobile/screens/intelligence/portfolio-alerts-screen.tsx`
Expected: 6, 4, 2 respectively (5+1 import, 3+1 import, 1+1 import).

- [ ] **Step 3: Typecheck and run the suite**

Run: `pnpm run typecheck` then `pnpm --filter @workspace/edc run test`
Expected: PASS.

- [ ] **Step 4: Remove these three from `PENDING`**

Delete `"account/settings-screen.tsx"`, `"intelligence/portfolio-alerts-screen.tsx"` and `"intelligence/loss-detail-screen.tsx"` from the `PENDING` array in `appear-coverage.test.ts`, then re-run it.

Run: `pnpm --filter @workspace/edc exec vitest run src/mobile/appear-coverage.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add artifacts/edc/src/mobile/screens/account/settings-screen.tsx artifacts/edc/src/mobile/screens/intelligence/portfolio-alerts-screen.tsx artifacts/edc/src/mobile/screens/intelligence/loss-detail-screen.tsx artifacts/edc/src/mobile/appear-coverage.test.ts
git commit -m "Fade the settings, alerts and loss-detail screens in"
```

---

### Task 13: Memory detail, Memory panel, Compare, Flow, Movement, Deal brief

**Files:**
- Modify: `artifacts/edc/src/mobile/screens/memory/memory-detail-screen.tsx`
- Modify: `artifacts/edc/src/mobile/screens/memory/memory-panel-screen.tsx`
- Modify: `artifacts/edc/src/mobile/screens/memory/compare-screen.tsx`
- Modify: `artifacts/edc/src/mobile/screens/intelligence/flow-screen.tsx`
- Modify: `artifacts/edc/src/mobile/screens/command/movement-block.tsx`
- Modify: `artifacts/edc/src/mobile/screens/deal/deal-brief-screen.tsx`

**Interfaces:**
- Consumes: `useAppearOnSettle` from Task 4.
- Produces: `ComparisonTable` gains `className?: string`. Nothing else changes signature.

Each of these six is individually shaped. Add the two imports to every file (skipping any already present), then apply the specific edit.

- [ ] **Step 1: Memory detail — fade the body, never the hero**

`query = useGetDealMemory(id)`. The content container is line 114, `<div className="space-y-3 px-4 pb-6 pt-2">`:

```tsx
  const appear = useAppearOnSettle(query.isLoading);
  …
        <div className={cn("space-y-3 px-4 pb-6 pt-2", appear)}>
```

The hero block above it (the `Shimmer`s at lines 71–72 and what replaces them) must **not** be wrapped: it carries the shared-card `view-transition-name`, and starting it at `opacity: 0` animates the morph target into nothing.

- [ ] **Step 2: Memory panel — three independent gates, three fades**

This screen has three separate skeleton boundaries, and they are separate *cards*, so each fades itself. Do **not** combine them onto the outer container at line 48 — that would replay a fade over cards already on screen, the same trap that keeps Pipeline off `LensScreen`'s `loading` prop.

- `MemoryPanelScreen` — `query = useGetDealMemory(id)`, skeleton at line 55. Put `useAppearOnSettle(query.isLoading)` on the container at line 48.
- `Timeline` — `query = useListDealHealthHistory(memory.dealId)`, gate at line 159. Fade the settled branch of that ternary.
- `Connections` — `journeyQuery = useGetPlaybookJourney(…)`, gate at line 287. Fade the settled branch of that ternary.

- [ ] **Step 3: Compare — a prop, not a wrapper**

`query = useGetDealMemory`-shaped; the settled branch is `<ComparisonTable rows={rows} />` at line 125, and line 116's container is the **skeleton**, not the content. Give `ComparisonTable` a `className` prop merged into its own root div (line 135):

```tsx
function ComparisonTable({ rows, className }: { rows: DealMemory[]; className?: string }) {
  return (
    <div className={cn("overflow-x-auto overscroll-x-contain px-4 pb-6 pt-3", className)}>
```

and at the call site:

```tsx
        <ComparisonTable rows={rows} className={appear} />
```

with `const appear = useAppearOnSettle(query.isLoading);` in `CompareScreen`. Do not add a wrapper div — it would break the sideways scroll the sticky first column depends on.

- [ ] **Step 4: Flow — two data-presence gates**

Flow's chart cards are already covered by Task 6. Two hand-rolled gates remain, and neither uses `isLoading`:

- `flow-health` card, line 110: `{!health ? <Shimmer className="h-24" /> : <>…</>}`. Use `const healthAppear = useAppearOnSettle(!health);` and put `cn(healthAppear)` on a wrapper around the settled fragment's contents — replace the bare `<>` with `<div className={cn(healthAppear)}>`.
- `flow-transitions` card, line 145: `{matrixQuery.isLoading ? <Shimmer className="h-32" /> : …}`. Use `const matrixAppear = useAppearOnSettle(matrixQuery.isLoading);` and fade the settled branch.

Leave the outer container at line 107 alone.

- [ ] **Step 5: Movement block — the gate is not a query**

`MovementBlock` takes `ready: boolean` and gates on `!ready && rows.length === 0` (line 72). The settled branch is the else:

```tsx
  const appear = useAppearOnSettle(!ready && rows.length === 0);
```

and put `cn(appear)` on the element opening that else branch.

- [ ] **Step 6: Deal brief — it must first ask for `isLoading`**

`deal-brief-screen.tsx` never references `isLoading`: line 55 destructures `const { intel, score, tags, enrichment, isError, refresh } = useDealBrief(id);`. `useDealBrief` does return `isLoading` (`use-deal-brief.ts:65`), so add it:

```tsx
  const { intel, score, tags, enrichment, isError, isLoading, refresh } = useDealBrief(id);
  const appear = useAppearOnSettle(isLoading);
```

Then fade the content container at line 131, `<div className="space-y-3 px-4 pb-6 pt-2">`:

```tsx
        <div className={cn("space-y-3 px-4 pb-6 pt-2", appear)}>
```

Leave the containers at lines 102 and 107 alone — those are the loading state. And leave `BriefHero` untouched for the morph reason above.

- [ ] **Step 7: Typecheck and run the suite**

Run: `pnpm run typecheck` then `pnpm --filter @workspace/edc run test`
Expected: PASS.

- [ ] **Step 8: Empty and delete `PENDING`**

Remove the remaining six entries from `PENDING` in `appear-coverage.test.ts`, then delete the `PENDING` constant itself and the `if (PENDING.includes(id)) return;` line. In the "keeps the pending and exempt lists honest" test, drop the `PENDING` loop and rename it to "keeps the exempt list honest".

**`EXEMPT` stays.** Its two entries are permanent design decisions, not deferred work: `brief-hero.tsx` holds the morph's `view-transition-name`, and `ask-screen.tsx`'s shimmer is a pending chat answer.

Run: `pnpm --filter @workspace/edc exec vitest run src/mobile/appear-coverage.test.ts`
Expected: PASS with no early returns — every checked screen now asserts for real.

- [ ] **Step 9: Commit**

```bash
git add artifacts/edc/src/mobile/screens/ artifacts/edc/src/mobile/appear-coverage.test.ts
git commit -m "Fade the last pushed screens in, and drop the pending list"
```

---

### Task 14: Phase 2 verification

**Files:** none.

- [ ] **Step 1: Re-run the full suite and typecheck**

Run: `pnpm run typecheck` then `pnpm --filter @workspace/edc run test`
Expected: PASS.

- [ ] **Step 2: Walk the pushed screens in the browser**

Using the Task 11 setup, visit a deal panel, a memory detail, a memory panel, `/memory/compare`, `/analytics/flow`, `/portfolio/alerts`, a settings sub-screen and a loss detail. Assert `.m-appear` appears on each as its content lands.

- [ ] **Step 3: Confirm the morph one more time**

Open a deal from the Deals list and go back. The card→hero morph must run in both directions. This is the single interaction the fade could break.

- [ ] **Step 4: Deploy, or say plainly that it is not deployed**

A change is not verified until it is deployed, and deploying is Console-only (drivable with browser MCP — see the verify skill). If the work stops here, report it as "typechecked, suite green, verified on localhost against a stubbed shell; not deployed."

---

## Out of scope, and worth recording

`runTransition`'s first branch is `if (quiet || !start || prefersReducedMotion())`, where `start` is `document.startViewTransition`. iOS Safari only got that in **18.0**, and there is no fallback — so on iOS 17 or with Reduce Motion on, *every* route change in the shell is a hard cut, tab switches included. That is not what was reported (the transition was measured running correctly, `m-lateral-in`/`m-lateral-out` at 200ms), and adding a non-view-transition fallback is a separate piece of work. Recorded here so it is not rediscovered as a bug.
