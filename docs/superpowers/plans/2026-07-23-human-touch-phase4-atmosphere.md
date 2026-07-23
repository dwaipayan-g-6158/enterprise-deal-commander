# Human Touch Layer — Phase 4 (Atmosphere) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship the 5 in-scope PRD "Phase 4: Atmosphere" features — lightweight Adaptive Dashboard (4.8), Personalized Profile Presence (4.12), Ambient Background (4.21), Random Professional Quotes (4.5), and rotating Personality Messages (4.19) — per the approved design at `docs/superpowers/specs/2026-07-23-human-touch-phase4-atmosphere-design.md`, scattering them across the app shell and the 5 non-dashboard pages rather than piling them onto the dashboard.

**Architecture:** Entirely frontend-only — no schema, API, or backend changes of any kind. Every feature is either a pure, dependency-injected module under `src/lib/*` (following the established `KeyValueStore`/`now: Date` convention from Phases 1-3) or a small presentational/CSS change. Two new pieces of global state are introduced: a `FocusModeProvider` React Context (mounted once in `App.tsx`, read by four consumers) and an `AmbientBackground` non-visual component (also mounted once in `App.tsx`) that stamps `data-time-band` on `<html>`.

**Deviations from the design spec, found while writing this plan (both mechanical, same intent — not scope changes):**
1. The spec's placement map names `InsightBanner`, `DailyMission`, and `EndOfDayReflection` as the dashboard's "fixed top block." Reading the current `pages/dashboard.tsx`, those three were consolidated (after the spec was written) into a single `<DailyBar />` with three popover segments (`daily-bar/{mission,today,insight}-segment.tsx`). This has zero effect on Phase 4's actual work — Phase 4 never touches the fixed top block, only the 9 rows below it (confirmed unchanged, see Task 10) — except that Focus Mode's "suppress the Insight Banner" target is now `daily-bar/insight-segment.tsx`, not a standalone `insight-banner.tsx` (Task 8).
2. The spec assumed all 5 non-dashboard pages have "a bare `<Skeleton>` loading moment" to place Personality Messages into. In practice only `deals.tsx` and `portfolio.tsx` have a page-level loading branch; `autopsy.tsx`, `analytics.tsx`, and `memory.tsx` render their tabs immediately with no top-level `isLoading` state (loading, if any, is handled inside child panels). Task 9 places the personality line in the loading branch for the first two, and in the static page header for the other three — same rotating-message feature, same "currently zero human-touch copy" pages, adapted to what's actually there instead of manufacturing a loading state that doesn't exist.
3. The spec named `getRowOrder`/`moveRow`/`resetRowOrder` for the row-order module but didn't name the function that persists a reorder — `saveRowOrder` (Task 1) fills that obvious gap.
4. The spec capped Ambient Background's shift at "≤5% perceptual change" without exact values — Task 6 below fixes concrete HSL deltas (small hue/lightness shifts, no override for the afternoon band, which uses the existing baseline tokens as-is).

## Global Constraints

- Spec: `docs/superpowers/specs/2026-07-23-human-touch-phase4-atmosphere-design.md` — read it if anything below is ambiguous.
- Single-user app — no multi-tenant/privacy logic.
- Tone: warm, professional, concise; quotes may carry occasional wryness (per spec), personality messages stay plainly warm, no sarcasm.
- No schema/API changes of any kind in this phase.
- Pure modules follow the established `src/lib/{greetings,mission,weekly,streak,reflection}/*` convention exactly: dependencies injected (`now: Date`, `store: KeyValueStore` from `@/lib/storage`), never throw, defensive `JSON.parse`/`Array.isArray`/type-guards, storage keys `edc.<feature>.<thing>`. TDD — failing test first.
- No automated component/hook tests (this repo's only automated tests are Vitest pure-function unit tests, no DOM/component-mocking infra) — hooks and components are verified live against the running dev stack.
- Local dev stack is Windows/**PowerShell**.
- Touch targets: this repo's existing convention is 44px for primary interactive controls (buttons, dismiss icons), but the already-approved plan at `.claude/plans` (compacting Today's Mission / Insight Banner) established that WCAG 2.5.8 AA's actual floor is 24×24px, and quiet inline-text utility controls in tight layouts (e.g. a sidebar status line) may use a smaller comfortable target instead of the full 44px "comfort" figure — apply that same reasoning below (noted per-task where it applies). `prefers-reduced-motion` is respected (this app already zeroes all transition/animation durations globally under that preference — see `index.css` — so no new work is needed for it beyond not fighting that rule).
- WCAG AA contrast for all new text/UI.
- Commits: Conventional-Commits with scope (`feat(edc):`, `content(edc):`), imperative, lowercase, no trailing period, one per task.

## Dependency Graph & Parallelization

```
Task 1  (dashboard-layout/row-order.ts, pure)              ──────────────────────► Task 10 (dashboard.tsx reorder)
Task 2  (presence/idle-tracker.ts + use-idle-status.ts)     ──────────┐
Task 3  (presence/focus-mode.ts + context + App.tsx mount) ──────────┼──► Task 7 (layout.tsx: presence + quote)
Task 4  (quotes/quote-pool.json + quote-rotation.ts)        ──────────┘
Task 3  ─────────────────────────────────────────────────────────────► Task 8 (focus-mode suppression)
Task 5  (personality pool + rotation.ts + PersonalityLine) ──────────────────────► Task 9 (5-page wiring)
Task 6  (ambient background: hook + component + CSS + App.tsx mount) ──(independent)

All of Tasks 1-6 touch disjoint new files except that Tasks 3 and 6 both
edit App.tsx — done in that order (3 before 6) to avoid two tasks racing on
the same file. Task 7 combines both layout.tsx changes (presence + quote)
into one task since the spec's two sidebar features share one file and one
function (SidebarBody). Task 11 is live verification only, after everything.
```

Tasks 1-6 are file-disjoint pure/independent additions and would be safe to run in parallel — this plan still executes them strictly sequentially (one implementer + reviewer at a time), per this project's established practice of avoiding the git-commit race a prior phase hit when parallelizing.

---

## Task 1: `dashboard-layout/row-order.ts` (pure)

**Files:**
- Create: `artifacts/edc/src/lib/dashboard-layout/row-order.ts`
- Test: `artifacts/edc/src/lib/dashboard-layout/row-order.test.ts`

**Interfaces:**
- Produces: `DEFAULT_ROW_ORDER: string[]`, `getRowOrder(store): string[]`, `saveRowOrder(store, order): void`, `moveRow(order, id, direction): string[]`, `resetRowOrder(store): void`. Consumed by Task 10.

- [ ] **Step 1: Write the failing test**

Create `artifacts/edc/src/lib/dashboard-layout/row-order.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import {
  DEFAULT_ROW_ORDER,
  getRowOrder,
  saveRowOrder,
  moveRow,
  resetRowOrder,
} from "./row-order";
import type { KeyValueStore } from "@/lib/storage";

function fakeStore(initial: Record<string, string> = {}): KeyValueStore {
  const data = { ...initial };
  return {
    getItem: (key) => data[key] ?? null,
    setItem: (key, value) => {
      data[key] = value;
    },
  };
}

describe("getRowOrder", () => {
  it("returns the default order when nothing is stored", () => {
    expect(getRowOrder(fakeStore())).toEqual(DEFAULT_ROW_ORDER);
  });

  it("returns a stored valid permutation as-is", () => {
    const reversed = [...DEFAULT_ROW_ORDER].reverse();
    const store = fakeStore({ "edc.dashboard.rowOrder": JSON.stringify(reversed) });
    expect(getRowOrder(store)).toEqual(reversed);
  });

  it("falls back to default when the stored value has a different length", () => {
    const store = fakeStore({
      "edc.dashboard.rowOrder": JSON.stringify(DEFAULT_ROW_ORDER.slice(0, 3)),
    });
    expect(getRowOrder(store)).toEqual(DEFAULT_ROW_ORDER);
  });

  it("falls back to default when the stored value has a duplicate id", () => {
    const bad = [...DEFAULT_ROW_ORDER.slice(0, -1), DEFAULT_ROW_ORDER[0]];
    const store = fakeStore({ "edc.dashboard.rowOrder": JSON.stringify(bad) });
    expect(getRowOrder(store)).toEqual(DEFAULT_ROW_ORDER);
  });

  it("falls back to default when the stored value contains an unknown id", () => {
    const bad = [...DEFAULT_ROW_ORDER.slice(0, -1), "not-a-real-row"];
    const store = fakeStore({ "edc.dashboard.rowOrder": JSON.stringify(bad) });
    expect(getRowOrder(store)).toEqual(DEFAULT_ROW_ORDER);
  });

  it("falls back to default on corrupt JSON", () => {
    const store = fakeStore({ "edc.dashboard.rowOrder": "{not json" });
    expect(getRowOrder(store)).toEqual(DEFAULT_ROW_ORDER);
  });

  it("never throws when the store throws", () => {
    const throwing: KeyValueStore = {
      getItem: () => {
        throw new Error("boom");
      },
      setItem: () => {
        throw new Error("boom");
      },
    };
    expect(() => getRowOrder(throwing)).not.toThrow();
    expect(getRowOrder(throwing)).toEqual(DEFAULT_ROW_ORDER);
  });
});

describe("saveRowOrder / getRowOrder round-trip", () => {
  it("persists and reads back a reordered array", () => {
    const store = fakeStore();
    const reordered = [...DEFAULT_ROW_ORDER].reverse();
    saveRowOrder(store, reordered);
    expect(getRowOrder(store)).toEqual(reordered);
  });

  it("never throws when the store throws", () => {
    const throwing: KeyValueStore = {
      getItem: () => null,
      setItem: () => {
        throw new Error("boom");
      },
    };
    expect(() => saveRowOrder(throwing, DEFAULT_ROW_ORDER)).not.toThrow();
  });
});

describe("moveRow", () => {
  it("moves a row up by one position", () => {
    const order = ["a", "b", "c"];
    expect(moveRow(order, "b", "up")).toEqual(["b", "a", "c"]);
  });

  it("moves a row down by one position", () => {
    const order = ["a", "b", "c"];
    expect(moveRow(order, "b", "down")).toEqual(["a", "c", "b"]);
  });

  it("no-ops moving the first row up", () => {
    const order = ["a", "b", "c"];
    expect(moveRow(order, "a", "up")).toEqual(order);
  });

  it("no-ops moving the last row down", () => {
    const order = ["a", "b", "c"];
    expect(moveRow(order, "c", "down")).toEqual(order);
  });

  it("no-ops on an id that isn't present", () => {
    const order = ["a", "b", "c"];
    expect(moveRow(order, "z", "up")).toEqual(order);
  });
});

describe("resetRowOrder", () => {
  it("clears the stored override so getRowOrder falls back to default", () => {
    const store = fakeStore({
      "edc.dashboard.rowOrder": JSON.stringify([...DEFAULT_ROW_ORDER].reverse()),
    });
    resetRowOrder(store);
    expect(getRowOrder(store)).toEqual(DEFAULT_ROW_ORDER);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm --filter @workspace/edc exec vitest run src/lib/dashboard-layout/row-order.test.ts`
Expected: FAIL — cannot find module `./row-order`.

- [ ] **Step 3: Implement row-order.ts**

Create `artifacts/edc/src/lib/dashboard-layout/row-order.ts`:

```ts
/**
 * Lightweight manual dashboard layout control (PRD 4.8, descoped from the
 * PRD's literal behavioral auto-adapt engine — see the design spec). The 9
 * ids below are the dashboard's structural rows in their shipped order;
 * `pages/dashboard.tsx` maps each id to its JSX at render time. Nothing ever
 * reorders itself — this only ever changes when the commander clicks an
 * up/down control.
 */

import type { KeyValueStore } from "@/lib/storage";

const ROW_ORDER_KEY = "edc.dashboard.rowOrder";

export const DEFAULT_ROW_ORDER: string[] = [
  "vital-signs",
  "health-risk-alerts",
  "actions-forecast",
  "stage-gate-funnel",
  "deal-roster",
  "close-timeline-activity",
  "velocity-competitive",
  "simulation-band",
  "memory-insights",
];

function isValidPermutation(candidate: unknown): candidate is string[] {
  if (!Array.isArray(candidate)) return false;
  if (candidate.length !== DEFAULT_ROW_ORDER.length) return false;
  if (!candidate.every((id) => typeof id === "string")) return false;
  const candidateSet = new Set(candidate);
  if (candidateSet.size !== candidate.length) return false; // no duplicates
  const defaultSet = new Set(DEFAULT_ROW_ORDER);
  return candidate.every((id) => defaultSet.has(id));
}

/** Reads the stored row order, falling back to the default on any drift (added/removed/renamed row, corrupt storage). Never throws. */
export function getRowOrder(store: KeyValueStore): string[] {
  let raw: string | null;
  try {
    raw = store.getItem(ROW_ORDER_KEY);
  } catch {
    return DEFAULT_ROW_ORDER;
  }
  if (!raw) return DEFAULT_ROW_ORDER;
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return DEFAULT_ROW_ORDER;
  }
  return isValidPermutation(parsed) ? parsed : DEFAULT_ROW_ORDER;
}

/** Persists a row order. Never throws. */
export function saveRowOrder(store: KeyValueStore, order: string[]): void {
  try {
    store.setItem(ROW_ORDER_KEY, JSON.stringify(order));
  } catch {
    // localStorage full/unavailable — the reorder just won't persist this round.
  }
}

/** Pure array reorder; no-ops if `id` is missing or already at the requested boundary. */
export function moveRow(order: string[], id: string, direction: "up" | "down"): string[] {
  const index = order.indexOf(id);
  if (index === -1) return order;
  const targetIndex = direction === "up" ? index - 1 : index + 1;
  if (targetIndex < 0 || targetIndex >= order.length) return order;
  const next = [...order];
  [next[index], next[targetIndex]] = [next[targetIndex], next[index]];
  return next;
}

/** Clears the stored override, reverting to the default order. Never throws. */
export function resetRowOrder(store: KeyValueStore): void {
  try {
    store.setItem(ROW_ORDER_KEY, JSON.stringify(DEFAULT_ROW_ORDER));
  } catch {
    // localStorage full/unavailable — the reset just won't persist this round.
  }
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm --filter @workspace/edc exec vitest run src/lib/dashboard-layout/row-order.test.ts`
Expected: PASS (14 tests).

- [ ] **Step 5: Commit**

```bash
git add artifacts/edc/src/lib/dashboard-layout/row-order.ts artifacts/edc/src/lib/dashboard-layout/row-order.test.ts
git commit -m "feat(edc): add pure dashboard row-order module"
```

---

## Task 2: `presence/idle-tracker.ts` (pure) + `presence/use-idle-status.ts` (hook)

**Files:**
- Create: `artifacts/edc/src/lib/presence/idle-tracker.ts`
- Test: `artifacts/edc/src/lib/presence/idle-tracker.test.ts`
- Create: `artifacts/edc/src/lib/presence/use-idle-status.ts`

**Interfaces:**
- Produces: `DEFAULT_IDLE_THRESHOLD_MS: number`, `computeStatus(lastActivityAt, now, idleThresholdMs): "active" | "away"`, `useIdleStatus(idleThresholdMs?): "active" | "away"`. Consumed by Task 7.

- [ ] **Step 1: Write the failing test**

Create `artifacts/edc/src/lib/presence/idle-tracker.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { computeStatus, DEFAULT_IDLE_THRESHOLD_MS } from "./idle-tracker";

describe("computeStatus", () => {
  it("is active just under the threshold", () => {
    const lastActivityAt = new Date(2026, 6, 23, 12, 0, 0);
    const now = new Date(lastActivityAt.getTime() + DEFAULT_IDLE_THRESHOLD_MS - 1);
    expect(computeStatus(lastActivityAt, now, DEFAULT_IDLE_THRESHOLD_MS)).toBe("active");
  });

  it("is away exactly at the threshold", () => {
    const lastActivityAt = new Date(2026, 6, 23, 12, 0, 0);
    const now = new Date(lastActivityAt.getTime() + DEFAULT_IDLE_THRESHOLD_MS);
    expect(computeStatus(lastActivityAt, now, DEFAULT_IDLE_THRESHOLD_MS)).toBe("away");
  });

  it("is away well past the threshold", () => {
    const lastActivityAt = new Date(2026, 6, 23, 12, 0, 0);
    const now = new Date(lastActivityAt.getTime() + DEFAULT_IDLE_THRESHOLD_MS * 10);
    expect(computeStatus(lastActivityAt, now, DEFAULT_IDLE_THRESHOLD_MS)).toBe("away");
  });

  it("is active at zero elapsed time", () => {
    const lastActivityAt = new Date(2026, 6, 23, 12, 0, 0);
    expect(computeStatus(lastActivityAt, lastActivityAt, DEFAULT_IDLE_THRESHOLD_MS)).toBe("active");
  });

  it("respects a custom threshold", () => {
    const lastActivityAt = new Date(2026, 6, 23, 12, 0, 0);
    const now = new Date(lastActivityAt.getTime() + 1000);
    expect(computeStatus(lastActivityAt, now, 500)).toBe("away");
    expect(computeStatus(lastActivityAt, now, 2000)).toBe("active");
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm --filter @workspace/edc exec vitest run src/lib/presence/idle-tracker.test.ts`
Expected: FAIL — cannot find module `./idle-tracker`.

- [ ] **Step 3: Implement idle-tracker.ts**

Create `artifacts/edc/src/lib/presence/idle-tracker.ts`:

```ts
/** Pure idle/active boundary check for Profile Presence (PRD 4.12). */

export const DEFAULT_IDLE_THRESHOLD_MS = 5 * 60 * 1000;

export function computeStatus(
  lastActivityAt: Date,
  now: Date,
  idleThresholdMs: number,
): "active" | "away" {
  return now.getTime() - lastActivityAt.getTime() >= idleThresholdMs ? "away" : "active";
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm --filter @workspace/edc exec vitest run src/lib/presence/idle-tracker.test.ts`
Expected: PASS (5 tests).

- [ ] **Step 5: Implement the hook (no test — hooks aren't unit-tested in this repo; verified live in Task 11)**

Create `artifacts/edc/src/lib/presence/use-idle-status.ts`:

```tsx
import { useEffect, useState } from "react";
import { computeStatus, DEFAULT_IDLE_THRESHOLD_MS } from "./idle-tracker";

const REEVALUATE_INTERVAL_MS = 30 * 1000;
const ACTIVITY_EVENTS = ["mousemove", "keydown"] as const;

/**
 * Tracks Active/Away for Profile Presence. Re-evaluates on a 30s interval
 * (not only on the next render) so "Away" appears within 30s of the
 * threshold passing, per the design spec. Per-tab only, by design — see
 * the spec's "Idle tracker across tabs/windows" edge case.
 */
export function useIdleStatus(
  idleThresholdMs: number = DEFAULT_IDLE_THRESHOLD_MS,
): "active" | "away" {
  const [lastActivityAt, setLastActivityAt] = useState(() => new Date());
  const [status, setStatus] = useState<"active" | "away">("active");

  useEffect(() => {
    function handleActivity() {
      setLastActivityAt(new Date());
    }
    function handleVisibility() {
      if (document.visibilityState === "visible") handleActivity();
    }
    ACTIVITY_EVENTS.forEach((evt) => window.addEventListener(evt, handleActivity));
    document.addEventListener("visibilitychange", handleVisibility);
    return () => {
      ACTIVITY_EVENTS.forEach((evt) => window.removeEventListener(evt, handleActivity));
      document.removeEventListener("visibilitychange", handleVisibility);
    };
  }, []);

  useEffect(() => {
    const id = setInterval(() => {
      setStatus(computeStatus(lastActivityAt, new Date(), idleThresholdMs));
    }, REEVALUATE_INTERVAL_MS);
    return () => clearInterval(id);
  }, [lastActivityAt, idleThresholdMs]);

  return status;
}
```

- [ ] **Step 6: Typecheck**

Run: `pnpm --filter @workspace/edc run typecheck`
Expected: no errors.

- [ ] **Step 7: Commit**

```bash
git add artifacts/edc/src/lib/presence/idle-tracker.ts artifacts/edc/src/lib/presence/idle-tracker.test.ts artifacts/edc/src/lib/presence/use-idle-status.ts
git commit -m "feat(edc): add idle/active status tracker for Profile Presence"
```

---

## Task 3: `presence/focus-mode.ts` (pure) + Focus Mode context + App.tsx mount

**Files:**
- Create: `artifacts/edc/src/lib/presence/focus-mode.ts`
- Test: `artifacts/edc/src/lib/presence/focus-mode.test.ts`
- Create: `artifacts/edc/src/lib/presence/focus-mode-context.tsx`
- Modify: `artifacts/edc/src/App.tsx`

**Interfaces:**
- Produces: `isFocusModeEnabled(store): boolean`, `setFocusMode(store, enabled): void`, `FocusModeProvider`, `useFocusMode(): {enabled: boolean; toggle: () => void}`. Consumed by Tasks 5, 7, 8, and by `personality-line.tsx`.

- [ ] **Step 1: Write the failing test**

Create `artifacts/edc/src/lib/presence/focus-mode.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { isFocusModeEnabled, setFocusMode } from "./focus-mode";
import type { KeyValueStore } from "@/lib/storage";

function fakeStore(initial: Record<string, string> = {}): KeyValueStore {
  const data = { ...initial };
  return {
    getItem: (key) => data[key] ?? null,
    setItem: (key, value) => {
      data[key] = value;
    },
  };
}

describe("isFocusModeEnabled / setFocusMode", () => {
  it("defaults to disabled when nothing is stored", () => {
    expect(isFocusModeEnabled(fakeStore())).toBe(false);
  });

  it("round-trips enabling and disabling", () => {
    const store = fakeStore();
    setFocusMode(store, true);
    expect(isFocusModeEnabled(store)).toBe(true);
    setFocusMode(store, false);
    expect(isFocusModeEnabled(store)).toBe(false);
  });

  it("treats any non-'true' stored value as disabled", () => {
    const store = fakeStore({ "edc.presence.focusMode": "garbage" });
    expect(isFocusModeEnabled(store)).toBe(false);
  });

  it("never throws when the store throws", () => {
    const throwing: KeyValueStore = {
      getItem: () => {
        throw new Error("boom");
      },
      setItem: () => {
        throw new Error("boom");
      },
    };
    expect(() => isFocusModeEnabled(throwing)).not.toThrow();
    expect(isFocusModeEnabled(throwing)).toBe(false);
    expect(() => setFocusMode(throwing, true)).not.toThrow();
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm --filter @workspace/edc exec vitest run src/lib/presence/focus-mode.test.ts`
Expected: FAIL — cannot find module `./focus-mode`.

- [ ] **Step 3: Implement focus-mode.ts**

Create `artifacts/edc/src/lib/presence/focus-mode.ts`:

```ts
/**
 * Focus Mode (part of PRD 4.12): a manual override that suppresses the
 * "soft" human-touch layer (celebration toasts, the daily insight, the
 * sidebar quote, personality messages) while leaving all functional UI
 * untouched. See `focus-mode-context.tsx` for the reactive hook consumers
 * actually use — this module is the underlying storage primitive.
 */

import type { KeyValueStore } from "@/lib/storage";

const FOCUS_MODE_KEY = "edc.presence.focusMode";

export function isFocusModeEnabled(store: KeyValueStore): boolean {
  try {
    return store.getItem(FOCUS_MODE_KEY) === "true";
  } catch {
    return false;
  }
}

export function setFocusMode(store: KeyValueStore, enabled: boolean): void {
  try {
    store.setItem(FOCUS_MODE_KEY, enabled ? "true" : "false");
  } catch {
    // localStorage full/unavailable — the toggle just won't persist this round.
  }
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm --filter @workspace/edc exec vitest run src/lib/presence/focus-mode.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Implement the reactive context**

Create `artifacts/edc/src/lib/presence/focus-mode-context.tsx`:

```tsx
import { createContext, useContext, useState, type ReactNode } from "react";
import { defaultStore } from "@/lib/storage";
import { isFocusModeEnabled, setFocusMode } from "./focus-mode";

interface FocusModeContextValue {
  enabled: boolean;
  toggle: () => void;
}

const FocusModeContext = createContext<FocusModeContextValue | undefined>(undefined);

// Mounted once at the app root (see App.tsx) so every consumer — the sidebar
// toggle, CelebrationWatcher, the DailyBar insight segment, the sidebar
// quote, PersonalityLine — shares one live value instead of each reading
// localStorage independently (which wouldn't react to a same-tab toggle).
export function FocusModeProvider({ children }: { children: ReactNode }) {
  const [enabled, setEnabled] = useState(() => isFocusModeEnabled(defaultStore));

  function toggle() {
    setEnabled((prev) => {
      const next = !prev;
      setFocusMode(defaultStore, next);
      return next;
    });
  }

  return (
    <FocusModeContext.Provider value={{ enabled, toggle }}>{children}</FocusModeContext.Provider>
  );
}

export function useFocusMode(): FocusModeContextValue {
  const ctx = useContext(FocusModeContext);
  if (!ctx) throw new Error("useFocusMode must be used within a FocusModeProvider");
  return ctx;
}
```

- [ ] **Step 6: Mount the provider in App.tsx**

In `artifacts/edc/src/App.tsx`, add the import (alongside `ThemeProvider`):

```tsx
import { FocusModeProvider } from "@/lib/presence/focus-mode-context";
```

Change the `App()` function's return (currently `<ThemeProvider>...</ThemeProvider>`) to wrap the existing tree with `FocusModeProvider` immediately inside `ThemeProvider`:

```tsx
function App() {
  return (
    <ThemeProvider>
      <FocusModeProvider>
        <QueryClientProvider client={queryClient}>
          <TooltipProvider>
            <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, "")}>
              <Router />
            </WouterRouter>
            <Toaster />
            <PwaUpdatePrompt />
            <OfflineBanner />
            <OfflineSaveNotice />
          </TooltipProvider>
        </QueryClientProvider>
      </FocusModeProvider>
    </ThemeProvider>
  );
}
```

- [ ] **Step 7: Typecheck**

Run: `pnpm --filter @workspace/edc run typecheck`
Expected: no errors.

- [ ] **Step 8: Commit**

```bash
git add artifacts/edc/src/lib/presence/focus-mode.ts artifacts/edc/src/lib/presence/focus-mode.test.ts artifacts/edc/src/lib/presence/focus-mode-context.tsx artifacts/edc/src/App.tsx
git commit -m "feat(edc): add Focus Mode store and app-wide reactive context"
```

---

## Task 4: `quotes/quote-pool.json` + `quotes/quote-rotation.ts` (pure)

**Files:**
- Create: `artifacts/edc/src/lib/quotes/quote-pool.json`
- Create: `artifacts/edc/src/lib/quotes/quote-rotation.ts`
- Test: `artifacts/edc/src/lib/quotes/quote-rotation.test.ts`

**Interfaces:**
- Produces: `Quote {id, text, author?}`, `pickDailyQuote(store, now, pool?): Quote`. Consumed by Task 7.

- [ ] **Step 1: Create the quote pool**

Create `artifacts/edc/src/lib/quotes/quote-pool.json`:

```json
[
  { "id": "q01", "text": "The best way to predict the future is to create it.", "author": "Peter Drucker" },
  { "id": "q02", "text": "Amateurs sit and wait for inspiration; the rest of us just get up and go to work.", "author": "Stephen King" },
  { "id": "q03", "text": "Sales are contingent upon the attitude of the salesman, not the attitude of the prospect.", "author": "William Clement Stone" },
  { "id": "q04", "text": "In the middle of difficulty lies opportunity.", "author": "Albert Einstein" },
  { "id": "q05", "text": "Quality is remembered long after the price is forgotten.", "author": "Aldo Gucci" },
  { "id": "q06", "text": "A goal is not always meant to be reached; it often serves simply as something to aim at.", "author": "Bruce Lee" },
  { "id": "q07", "text": "People don't buy what you do; they buy why you do it.", "author": "Simon Sinek" },
  { "id": "q08", "text": "If you are not taking care of your customer, your competitor will.", "author": "Bob Hooey" },
  { "id": "q09", "text": "Don't watch the clock; do what it does. Keep going.", "author": "Sam Levenson" },
  { "id": "q10", "text": "Every sale has five basic obstacles: no need, no money, no hurry, no desire, no trust.", "author": "Zig Ziglar" },
  { "id": "q11", "text": "Great things in business are never done by one person; they're done by a team.", "author": "Steve Jobs" },
  { "id": "q12", "text": "Efforts and courage are not enough without purpose and direction.", "author": "John F. Kennedy" },
  { "id": "q13", "text": "The perfect deal waits for no one — do not wait for it either." },
  { "id": "q14", "text": "A pipeline forgives no procrastination." },
  { "id": "q15", "text": "The pessimist sees difficulty in every opportunity; the optimist sees opportunity in every difficulty.", "author": "Winston Churchill" },
  { "id": "q16", "text": "You miss 100% of the deals you don't follow up on." },
  { "id": "q17", "text": "Discipline is choosing between what you want now and what you want most.", "author": "Abraham Lincoln" },
  { "id": "q18", "text": "Trust is built in drops and lost in buckets." },
  { "id": "q19", "text": "The pipeline doesn't lie — but it will exaggerate a little if you let it." },
  { "id": "q20", "text": "Slow is smooth, and smooth is fast." },
  { "id": "q21", "text": "Nothing is particularly hard if you divide it into small jobs.", "author": "Henry Ford" },
  { "id": "q22", "text": "Whether you think you can, or you think you can't, you're right.", "author": "Henry Ford" },
  { "id": "q23", "text": "The secret of getting ahead is getting started.", "author": "Mark Twain" },
  { "id": "q24", "text": "Show up, do the work, repeat — momentum is a compounding asset." },
  { "id": "q25", "text": "A prospect's silence is not a no; it's an unanswered question." },
  { "id": "q26", "text": "Excellence is not an act, but a habit.", "author": "Aristotle" },
  { "id": "q27", "text": "The customer's perception is your reality.", "author": "Kate Zabriskie" },
  { "id": "q28", "text": "Well done is better than well said.", "author": "Benjamin Franklin" },
  { "id": "q29", "text": "Momentum solves most problems, and quietly hides the rest — for now." },
  { "id": "q30", "text": "Every closed-lost deal is tuition, not a loss." },
  { "id": "q31", "text": "Focus on the few things that actually move the pipeline." },
  { "id": "q32", "text": "Well-run deals are boring on purpose." }
]
```

- [ ] **Step 2: Write the failing test**

Create `artifacts/edc/src/lib/quotes/quote-rotation.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { pickDailyQuote, type Quote } from "./quote-rotation";
import type { KeyValueStore } from "@/lib/storage";

function fakeStore(initial: Record<string, string> = {}): KeyValueStore {
  const data = { ...initial };
  return {
    getItem: (key) => data[key] ?? null,
    setItem: (key, value) => {
      data[key] = value;
    },
  };
}

const TWO_QUOTES: Quote[] = [
  { id: "a", text: "Quote A" },
  { id: "b", text: "Quote B" },
];

describe("pickDailyQuote", () => {
  it("returns a quote from the given pool", () => {
    const store = fakeStore();
    const picked = pickDailyQuote(store, new Date(2026, 6, 23, 9), TWO_QUOTES);
    expect(TWO_QUOTES.map((q) => q.id)).toContain(picked.id);
  });

  it("returns the same quote on repeated calls the same local day", () => {
    const store = fakeStore();
    const first = pickDailyQuote(store, new Date(2026, 6, 23, 9), TWO_QUOTES);
    const second = pickDailyQuote(store, new Date(2026, 6, 23, 20), TWO_QUOTES);
    expect(second.id).toBe(first.id);
  });

  it("picks the sole remaining unseen quote on the next day (pool of 2)", () => {
    const store = fakeStore();
    const day1 = pickDailyQuote(store, new Date(2026, 6, 23, 9), TWO_QUOTES);
    const day2 = pickDailyQuote(store, new Date(2026, 6, 24, 9), TWO_QUOTES);
    expect(day2.id).not.toBe(day1.id);
  });

  it("resets the exhaustion cycle once every quote has been shown", () => {
    const store = fakeStore();
    pickDailyQuote(store, new Date(2026, 6, 23, 9), TWO_QUOTES);
    pickDailyQuote(store, new Date(2026, 6, 24, 9), TWO_QUOTES);
    // Both ids have now been shown; day 3 must reset and pick from the full pool again.
    const day3 = pickDailyQuote(store, new Date(2026, 6, 25, 9), TWO_QUOTES);
    expect(TWO_QUOTES.map((q) => q.id)).toContain(day3.id);
    const raw = store.getItem("edc.quotes.shown");
    expect(raw).not.toBeNull();
    const state = JSON.parse(raw as string);
    expect(state.shownIds).toEqual([day3.id]);
  });

  it("falls back to a fresh pick on corrupt storage", () => {
    const store = fakeStore({ "edc.quotes.shown": "{not json" });
    const picked = pickDailyQuote(store, new Date(2026, 6, 23, 9), TWO_QUOTES);
    expect(TWO_QUOTES.map((q) => q.id)).toContain(picked.id);
  });

  it("never throws when the store throws", () => {
    const throwing: KeyValueStore = {
      getItem: () => {
        throw new Error("boom");
      },
      setItem: () => {
        throw new Error("boom");
      },
    };
    expect(() => pickDailyQuote(throwing, new Date(), TWO_QUOTES)).not.toThrow();
  });
});
```

- [ ] **Step 3: Run the test to verify it fails**

Run: `pnpm --filter @workspace/edc exec vitest run src/lib/quotes/quote-rotation.test.ts`
Expected: FAIL — cannot find module `./quote-rotation`.

- [ ] **Step 4: Implement quote-rotation.ts**

Create `artifacts/edc/src/lib/quotes/quote-rotation.ts`:

```ts
/**
 * Random Professional Quotes (PRD 4.5): one quote per local calendar day,
 * non-repeating until the pool is exhausted. Domain-owned dedup module,
 * mirroring the shape of `lib/greetings/shown-history.ts` but keyed to a
 * calendar day rather than a rolling time window — this codebase keeps one
 * small pure file per feature rather than a shared generic rotation utility.
 */

import type { KeyValueStore } from "@/lib/storage";
import quotePoolJson from "./quote-pool.json";

export interface Quote {
  id: string;
  text: string;
  author?: string;
}

const defaultQuotePool = quotePoolJson as Quote[];

const SHOWN_KEY = "edc.quotes.shown";

interface QuoteRotationState {
  lastPickedDate: string;
  lastPickedId: string;
  shownIds: string[];
}

function isQuoteRotationState(value: unknown): value is QuoteRotationState {
  const v = value as QuoteRotationState;
  return (
    typeof value === "object" &&
    value !== null &&
    typeof v.lastPickedDate === "string" &&
    typeof v.lastPickedId === "string" &&
    Array.isArray(v.shownIds) &&
    v.shownIds.every((id) => typeof id === "string")
  );
}

function localDateKey(now: Date): string {
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, "0");
  const d = String(now.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function readState(store: KeyValueStore): QuoteRotationState | null {
  let raw: string | null;
  try {
    raw = store.getItem(SHOWN_KEY);
  } catch {
    return null;
  }
  if (!raw) return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }
  return isQuoteRotationState(parsed) ? parsed : null;
}

function writeState(store: KeyValueStore, state: QuoteRotationState): void {
  try {
    store.setItem(SHOWN_KEY, JSON.stringify(state));
  } catch {
    // localStorage full/unavailable — the rotation just won't persist this round.
  }
}

/** Picks (and memoizes for the rest of the local day) today's quote. Never throws. */
export function pickDailyQuote(
  store: KeyValueStore,
  now: Date,
  pool: Quote[] = defaultQuotePool,
): Quote {
  const todayKey = localDateKey(now);
  const state = readState(store);

  if (state && state.lastPickedDate === todayKey) {
    const cached = pool.find((q) => q.id === state.lastPickedId);
    if (cached) return cached;
  }

  const priorShown = state?.shownIds ?? [];
  const unseenPool = pool.filter((q) => !priorShown.includes(q.id));
  const candidates = unseenPool.length > 0 ? unseenPool : pool;
  const picked = candidates[Math.floor(Math.random() * candidates.length)];
  const shownIds = unseenPool.length > 0 ? [...priorShown, picked.id] : [picked.id];

  writeState(store, { lastPickedDate: todayKey, lastPickedId: picked.id, shownIds });
  return picked;
}
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `pnpm --filter @workspace/edc exec vitest run src/lib/quotes/quote-rotation.test.ts`
Expected: PASS (6 tests).

- [ ] **Step 6: Typecheck**

Run: `pnpm --filter @workspace/edc run typecheck`
Expected: no errors. (If importing a `.json` file requires `resolveJsonModule` and it isn't already enabled in this package's `tsconfig.json`, check `artifacts/edc/tsconfig.json` — this repo's Vite/TS setup already imports JSON elsewhere in the frontend, so this should already work; only add the compiler option if typecheck actually fails on this specific import.)

- [ ] **Step 7: Commit**

```bash
git add artifacts/edc/src/lib/quotes/quote-pool.json artifacts/edc/src/lib/quotes/quote-rotation.ts artifacts/edc/src/lib/quotes/quote-rotation.test.ts
git commit -m "feat(edc): add daily quote pool and rotation"
```

---

## Task 5: `personality/message-pool.json` + `personality/rotation.ts` (pure) + `<PersonalityLine />`

**Files:**
- Create: `artifacts/edc/src/lib/personality/message-pool.json`
- Create: `artifacts/edc/src/lib/personality/rotation.ts`
- Test: `artifacts/edc/src/lib/personality/rotation.test.ts`
- Create: `artifacts/edc/src/components/personality-line.tsx`

**Interfaces:**
- Consumes: `useFocusMode` (Task 3).
- Produces: `PersonalityMessage {id, text}`, `pickPersonalityMessage(store, now, pool?): PersonalityMessage`, `<PersonalityLine className?/>`. Consumed by Task 9.

- [ ] **Step 1: Create the message pool**

Create `artifacts/edc/src/lib/personality/message-pool.json`:

```json
[
  { "id": "m01", "text": "Good to see you again." },
  { "id": "m02", "text": "Ready when you are." },
  { "id": "m03", "text": "One deal at a time." },
  { "id": "m04", "text": "Let's make today count." },
  { "id": "m05", "text": "Steady hands win long games." },
  { "id": "m06", "text": "Back at it — nice." },
  { "id": "m07", "text": "The pipeline's glad you're here." },
  { "id": "m08", "text": "Small steps, real progress." },
  { "id": "m09", "text": "Everything's exactly where you left it." },
  { "id": "m10", "text": "Onward." },
  { "id": "m11", "text": "Here's to a productive stretch." },
  { "id": "m12", "text": "Loading — not much longer." },
  { "id": "m13", "text": "Good things take a moment." },
  { "id": "m14", "text": "Settling in." },
  { "id": "m15", "text": "Almost there." },
  { "id": "m16", "text": "Quiet confidence gets deals done." },
  { "id": "m17", "text": "You've got this." },
  { "id": "m18", "text": "Fresh data, coming right up." },
  { "id": "m19", "text": "Nice to have you back at the console." },
  { "id": "m20", "text": "Let's see where things stand." },
  { "id": "m21", "text": "Getting the full picture ready." },
  { "id": "m22", "text": "Every visit moves something forward." },
  { "id": "m23", "text": "Bringing everything up to date." },
  { "id": "m24", "text": "The details are worth the wait." },
  { "id": "m25", "text": "Consistency is the whole game." },
  { "id": "m26", "text": "Good pace so far." },
  { "id": "m27", "text": "Right this way." },
  { "id": "m28", "text": "One click closer." },
  { "id": "m29", "text": "Building the current picture." },
  { "id": "m30", "text": "Thanks for sticking with it." },
  { "id": "m31", "text": "Precision takes a beat — worth it." },
  { "id": "m32", "text": "Here's today's view." }
]
```

- [ ] **Step 2: Write the failing test**

Create `artifacts/edc/src/lib/personality/rotation.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { pickPersonalityMessage, type PersonalityMessage } from "./rotation";
import type { KeyValueStore } from "@/lib/storage";

function fakeStore(initial: Record<string, string> = {}): KeyValueStore {
  const data = { ...initial };
  return {
    getItem: (key) => data[key] ?? null,
    setItem: (key, value) => {
      data[key] = value;
    },
  };
}

const TWO_MESSAGES: PersonalityMessage[] = [
  { id: "a", text: "Message A" },
  { id: "b", text: "Message B" },
];

describe("pickPersonalityMessage", () => {
  it("returns a message from the given pool", () => {
    const store = fakeStore();
    const picked = pickPersonalityMessage(store, new Date(2026, 6, 23, 9), TWO_MESSAGES);
    expect(TWO_MESSAGES.map((m) => m.id)).toContain(picked.id);
  });

  it("avoids repeating within the 72h dedup window (pool of 2)", () => {
    const store = fakeStore();
    const first = pickPersonalityMessage(store, new Date(2026, 6, 23, 9), TWO_MESSAGES);
    const second = pickPersonalityMessage(store, new Date(2026, 6, 23, 10), TWO_MESSAGES);
    expect(second.id).not.toBe(first.id);
  });

  it("allows repeats once the dedup window has passed", () => {
    const store = fakeStore();
    pickPersonalityMessage(store, new Date(2026, 6, 23, 9), TWO_MESSAGES);
    pickPersonalityMessage(store, new Date(2026, 6, 23, 10), TWO_MESSAGES);
    // Both ids shown; 73h later the window has fully elapsed for both entries.
    const afterWindow = pickPersonalityMessage(
      store,
      new Date(2026, 6, 26, 11),
      TWO_MESSAGES,
    );
    expect(TWO_MESSAGES.map((m) => m.id)).toContain(afterWindow.id);
  });

  it("falls back to a fresh pick on corrupt storage", () => {
    const store = fakeStore({ "edc.personality.shown": "{not json" });
    const picked = pickPersonalityMessage(store, new Date(2026, 6, 23, 9), TWO_MESSAGES);
    expect(TWO_MESSAGES.map((m) => m.id)).toContain(picked.id);
  });

  it("never throws when the store throws", () => {
    const throwing: KeyValueStore = {
      getItem: () => {
        throw new Error("boom");
      },
      setItem: () => {
        throw new Error("boom");
      },
    };
    expect(() => pickPersonalityMessage(throwing, new Date(), TWO_MESSAGES)).not.toThrow();
  });
});
```

- [ ] **Step 3: Run the test to verify it fails**

Run: `pnpm --filter @workspace/edc exec vitest run src/lib/personality/rotation.test.ts`
Expected: FAIL — cannot find module `./rotation`.

- [ ] **Step 4: Implement rotation.ts**

Create `artifacts/edc/src/lib/personality/rotation.ts`:

```ts
/**
 * Personality Messages, Rotating (PRD 4.19): generic warm filler for a
 * moment that currently shows nothing, distinct from Phase 1's
 * state-*specific* empty-state copy. Mirrors `lib/greetings/shown-history.ts`'s
 * rolling-window dedup shape (here 72h instead of 48h), with its own key.
 */

import type { KeyValueStore } from "@/lib/storage";
import messagePoolJson from "./message-pool.json";

export interface PersonalityMessage {
  id: string;
  text: string;
}

const defaultMessagePool = messagePoolJson as PersonalityMessage[];

const SHOWN_KEY = "edc.personality.shown";
const DEDUP_WINDOW_MS = 72 * 60 * 60 * 1000;

interface ShownEntry {
  id: string;
  shownAt: string;
}

function isShownEntry(value: unknown): value is ShownEntry {
  const v = value as ShownEntry;
  return (
    typeof value === "object" &&
    value !== null &&
    typeof v.id === "string" &&
    typeof v.shownAt === "string"
  );
}

function readShownHistory(store: KeyValueStore, now: Date): ShownEntry[] {
  let raw: string | null;
  try {
    raw = store.getItem(SHOWN_KEY);
  } catch {
    return [];
  }
  if (!raw) return [];
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return [];
  }
  if (!Array.isArray(parsed)) return [];
  const cutoff = now.getTime() - DEDUP_WINDOW_MS;
  return parsed.filter((e) => isShownEntry(e) && new Date(e.shownAt).getTime() >= cutoff);
}

function recordShown(store: KeyValueStore, pruned: ShownEntry[], id: string, now: Date): void {
  const next = [...pruned, { id, shownAt: now.toISOString() }];
  try {
    store.setItem(SHOWN_KEY, JSON.stringify(next));
  } catch {
    // localStorage full/unavailable — dedup just won't persist this round.
  }
}

/** Picks an unseen-within-72h personality message, resetting once the pool is exhausted. Never throws. */
export function pickPersonalityMessage(
  store: KeyValueStore,
  now: Date,
  pool: PersonalityMessage[] = defaultMessagePool,
): PersonalityMessage {
  const pruned = readShownHistory(store, now);
  const shownIds = pruned.map((e) => e.id);
  const unseen = pool.filter((m) => !shownIds.includes(m.id));
  const candidates = unseen.length > 0 ? unseen : pool;
  const picked = candidates[Math.floor(Math.random() * candidates.length)];
  const historyBase = unseen.length > 0 ? pruned : [];
  recordShown(store, historyBase, picked.id, now);
  return picked;
}
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `pnpm --filter @workspace/edc exec vitest run src/lib/personality/rotation.test.ts`
Expected: PASS (5 tests).

- [ ] **Step 6: Implement `<PersonalityLine />`**

Create `artifacts/edc/src/components/personality-line.tsx`:

```tsx
import { useState } from "react";
import { pickPersonalityMessage } from "@/lib/personality/rotation";
import { defaultStore } from "@/lib/storage";
import { useFocusMode } from "@/lib/presence/focus-mode-context";

// One rotating line of warm filler for a moment that otherwise shows
// nothing (PRD 4.19). Locks its pick once per mount — a fresh message per
// page load, not per re-render. Self-suppresses under Focus Mode so every
// call site (Task 9) needs no extra guard.
export function PersonalityLine({ className }: { className?: string }) {
  const { enabled: focusMode } = useFocusMode();
  const [message] = useState(() => pickPersonalityMessage(defaultStore, new Date()));

  if (focusMode) return null;

  return <p className={className ?? "text-sm text-muted-foreground italic"}>{message.text}</p>;
}
```

- [ ] **Step 7: Typecheck**

Run: `pnpm --filter @workspace/edc run typecheck`
Expected: no errors.

- [ ] **Step 8: Commit**

```bash
git add artifacts/edc/src/lib/personality/message-pool.json artifacts/edc/src/lib/personality/rotation.ts artifacts/edc/src/lib/personality/rotation.test.ts artifacts/edc/src/components/personality-line.tsx
git commit -m "feat(edc): add rotating personality message pool and PersonalityLine"
```

---

## Task 6: Ambient Background (PRD 4.21)

**Files:**
- Create: `artifacts/edc/src/hooks/use-time-band.ts`
- Create: `artifacts/edc/src/components/ambient-background.tsx`
- Modify: `artifacts/edc/src/index.css`
- Modify: `artifacts/edc/src/App.tsx`

**Interfaces:**
- Consumes: `getTimeBand` (`@/lib/greetings/time-bands`, existing).
- Produces: `useTimeBand(): TimeBand`, `<AmbientBackground />` (non-visual). Mounted once in `App.tsx`.

- [ ] **Step 1: Implement the hook (no test — thin wrapper over an already-tested pure function + a timer; verified live in Task 11)**

Create `artifacts/edc/src/hooks/use-time-band.ts`:

```ts
import { useEffect, useState } from "react";
import { getTimeBand, type TimeBand } from "@/lib/greetings/time-bands";

const REEVALUATE_INTERVAL_MS = 5 * 60 * 1000;

/** Re-evaluates the current time band every 5 minutes so a band transition is caught without a page reload. */
export function useTimeBand(): TimeBand {
  const [band, setBand] = useState<TimeBand>(() => getTimeBand(new Date()));

  useEffect(() => {
    const id = setInterval(() => setBand(getTimeBand(new Date())), REEVALUATE_INTERVAL_MS);
    return () => clearInterval(id);
  }, []);

  return band;
}
```

- [ ] **Step 2: Implement the non-visual component**

Create `artifacts/edc/src/components/ambient-background.tsx`:

```tsx
import { useEffect } from "react";
import { useTimeBand } from "@/hooks/use-time-band";

// Non-visual. Stamps data-time-band on <html> so index.css can apply a
// subtle (<=5% perceptual) tint per band — see the design spec's Ambient
// Background section. Reuses the same getTimeBand() Phase 1's greeting
// already relies on, not a second competing time-banding scheme.
export function AmbientBackground() {
  const band = useTimeBand();

  useEffect(() => {
    document.documentElement.setAttribute("data-time-band", band);
  }, [band]);

  return null;
}
```

- [ ] **Step 3: Add the CSS overrides**

In `artifacts/edc/src/index.css`, insert the following immediately after the closing `}` of the existing `.dark { ... }` block (after line 166, before `@layer base`):

```css

/* Ambient Background (PRD 4.21) — a genuinely subtle (<=5% perceptual)
   tint per time-of-day band, reusing lib/greetings/time-bands.ts's exact
   boundaries so this never competes with Phase 1's greeting logic.
   Afternoon has no override block — it uses the baseline tokens above
   as-is. `.dark[data-time-band=...]` rules are listed after the
   `:root[data-time-band=...]` rules (same ordering `.dark` already uses
   against `:root`), so dark mode correctly wins when both apply. The
   transition itself lives on `body` below; prefers-reduced-motion already
   zeroes all transition durations globally (see the media query further
   down), so no extra handling is needed here for that. */
:root[data-time-band="morning"] {
  --background: 205 22% 98%;
  --card: 210 15% 99%;
}
:root[data-time-band="evening"] {
  --background: 30 18% 97%;
  --card: 30 12% 98%;
}
:root[data-time-band="night"] {
  --background: 225 22% 96%;
  --card: 225 15% 98%;
}
.dark[data-time-band="morning"] {
  --background: 215 10% 11%;
  --card: 215 10% 13%;
}
.dark[data-time-band="evening"] {
  --background: 20 10% 10%;
  --card: 20 10% 12%;
}
.dark[data-time-band="night"] {
  --background: 225 12% 8%;
  --card: 225 12% 10%;
}
```

Then, in the existing `@layer base { body { ... } }` rule (currently `@apply bg-background text-foreground font-sans antialiased;` at line 173), add a transition so the shift animates over ~2s at the moment a band changes rather than snapping:

```diff
   body {
     @apply bg-background text-foreground font-sans antialiased;
+    transition: background-color 2s ease;
   }
```

- [ ] **Step 4: Mount `<AmbientBackground />` in App.tsx**

In `artifacts/edc/src/App.tsx`, add the import (alongside the other non-visual mounts):

```tsx
import { AmbientBackground } from "@/components/ambient-background";
```

Add `<AmbientBackground />` alongside the other always-mounted non-visual components in `App()`'s return (next to `<PwaUpdatePrompt />`):

```diff
             <Toaster />
+            <AmbientBackground />
             <PwaUpdatePrompt />
             <OfflineBanner />
             <OfflineSaveNotice />
```

- [ ] **Step 5: Typecheck**

Run: `pnpm --filter @workspace/edc run typecheck`
Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add artifacts/edc/src/hooks/use-time-band.ts artifacts/edc/src/components/ambient-background.tsx artifacts/edc/src/index.css artifacts/edc/src/App.tsx
git commit -m "feat(edc): add ambient time-of-day background tint"
```

---

## Task 7: Sidebar — Profile Presence (4.12) + Quote line (4.5)

**Files:**
- Modify: `artifacts/edc/src/components/layout.tsx`

**Interfaces:**
- Consumes: `useIdleStatus` (Task 2), `useFocusMode` (Task 3), `pickDailyQuote` (Task 4), `defaultStore` (`@/lib/storage`).

Both features land in `SidebarBody` in one task since they share this one file and function — done as a single combined change, same reasoning Phase 3 used for its shared-file wiring task.

**Touch-target note:** the sidebar's existing quiet-utility controls (the "Press ⌘K" hint, and per the already-approved plan compacting Today's Mission/Insight Banner) establish that inline text-based status controls in this app use the WCAG 2.5.8 AA 24×24px floor, not the 44px comfort figure, when a full 44px row would look oversized in a narrow sidebar. The presence status line below follows that same precedent; the Focus Mode toggle button inside its popover — a deliberate primary action, not a quiet inline control — keeps the full 44px.

- [ ] **Step 1: Add the new imports**

In `artifacts/edc/src/components/layout.tsx`, add to the existing import block:

```tsx
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { useIdleStatus } from "@/lib/presence/use-idle-status";
import { useFocusMode } from "@/lib/presence/focus-mode-context";
import { pickDailyQuote } from "@/lib/quotes/quote-rotation";
import { defaultStore } from "@/lib/storage";
import { useState } from "react";
```

(`useState` is not currently imported in this file — line 1 currently reads `import { useState, ReactNode } from "react";`; it already is. No change needed there.)

- [ ] **Step 2: Add the initials helper and two small subcomponents**

Above the `SidebarBody` function definition (after the `navItems` array, before `function SidebarBody`), add:

```tsx
function initialsFrom(displayName?: string, email?: string): string {
  if (displayName && displayName.trim().length > 0) {
    const parts = displayName.trim().split(/\s+/);
    const first = parts[0]?.[0] ?? "";
    const last = parts.length > 1 ? parts[parts.length - 1][0] : "";
    return (first + last).toUpperCase();
  }
  if (email && email.length > 0) return email[0].toUpperCase();
  return "?";
}

// Profile Presence status line (PRD 4.12). Active/Away is auto-detected;
// Focus Mode is a manual override the commander toggles here — it also
// suppresses the sidebar quote, CelebrationWatcher's toasts, and the
// DailyBar insight segment (see Task 8), so this doubles as a real "just
// show me the work" control, not a cosmetic label.
function PresenceStatusLine() {
  const { enabled: focusMode, toggle } = useFocusMode();
  const idleStatus = useIdleStatus();
  const label = focusMode ? "Focus Mode" : idleStatus === "active" ? "Active" : "Away";
  const dotClass = focusMode
    ? "bg-primary"
    : idleStatus === "active"
      ? "bg-emerald-500"
      : "bg-muted-foreground";

  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded-sm"
        >
          <span className={`h-1.5 w-1.5 rounded-full ${dotClass}`} aria-hidden />
          {label}
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-64">
        <p className="text-sm font-medium">Focus Mode</p>
        <p className="mt-1 text-xs text-muted-foreground">
          Hides celebration toasts, the daily insight, the quote line, and personality messages.
          Alerts, next actions, and deal data stay exactly as they are.
        </p>
        <Button
          type="button"
          variant={focusMode ? "default" : "outline"}
          size="sm"
          className="mt-3 w-full min-h-[44px]"
          onClick={toggle}
        >
          {focusMode ? "Turn off Focus Mode" : "Turn on Focus Mode"}
        </Button>
      </PopoverContent>
    </Popover>
  );
}

// Random Professional Quotes (PRD 4.5) — one per local day, hidden under
// Focus Mode. Locked once per mount, matching PersonalityLine's convention.
function SidebarQuoteLine() {
  const { enabled: focusMode } = useFocusMode();
  const [quote] = useState(() => pickDailyQuote(defaultStore, new Date()));

  if (focusMode) return null;

  return (
    <p className="text-[11px] text-muted-foreground italic mt-2 leading-snug">
      &ldquo;{quote.text}&rdquo;
      {quote.author && <span className="not-italic"> — {quote.author}</span>}
    </p>
  );
}
```

- [ ] **Step 3: Update `SidebarBody`'s `user` prop type**

Change (line 24):

```diff
-  user: { email?: string; role?: string } | undefined;
+  user: { email?: string; role?: string; displayName?: string } | undefined;
```

- [ ] **Step 4: Render the quote line in the header zone**

Replace the header block:

```tsx
      <div className="p-6 border-b border-border flex items-center gap-3">
        <EdcLogoMark size={52} animated={true} className="shrink-0" />
        <div className="min-w-0">
          <Link href="/" onClick={onNavigate}>
            <h1 className="text-sm font-bold tracking-tight text-foreground leading-snug cursor-pointer hover:text-primary transition-colors">Enterprise Deal Commander</h1>
          </Link>
          <p className="text-[10px] text-muted-foreground mt-1 uppercase tracking-widest font-mono">Commander Console</p>
        </div>
      </div>
```

with:

```tsx
      <div className="p-6 border-b border-border flex items-center gap-3">
        <EdcLogoMark size={52} animated={true} className="shrink-0" />
        <div className="min-w-0">
          <Link href="/" onClick={onNavigate}>
            <h1 className="text-sm font-bold tracking-tight text-foreground leading-snug cursor-pointer hover:text-primary transition-colors">Enterprise Deal Commander</h1>
          </Link>
          <p className="text-[10px] text-muted-foreground mt-1 uppercase tracking-widest font-mono">Commander Console</p>
          <SidebarQuoteLine />
        </div>
      </div>
```

- [ ] **Step 5: Replace the footer's plain email/role block with Profile Presence**

Replace (lines 72-75):

```tsx
        <div className="mb-2">
          <p className="text-sm font-medium">{user?.email}</p>
          <p className="text-xs text-muted-foreground capitalize">{user?.role}</p>
        </div>
```

with:

```tsx
        <div className="mb-2 flex items-center gap-2.5">
          <span
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary/15 text-xs font-semibold text-primary"
            aria-hidden
          >
            {initialsFrom(user?.displayName, user?.email)}
          </span>
          <div className="min-w-0">
            <p className="truncate text-sm font-medium">{user?.displayName || user?.email}</p>
            <PresenceStatusLine />
          </div>
        </div>
```

- [ ] **Step 6: Typecheck**

Run: `pnpm --filter @workspace/edc run typecheck`
Expected: no errors.

- [ ] **Step 7: Commit**

```bash
git add artifacts/edc/src/components/layout.tsx
git commit -m "feat(edc): add Profile Presence and daily quote to the sidebar"
```

---

## Task 8: Focus Mode suppression on the soft UI layer

**Files:**
- Modify: `artifacts/edc/src/components/dashboard/celebration-watcher.tsx`
- Modify: `artifacts/edc/src/components/dashboard/daily-bar/insight-segment.tsx`

**Interfaces:**
- Consumes: `useFocusMode` (Task 3).

- [ ] **Step 1: Suppress celebration toasts under Focus Mode**

In `artifacts/edc/src/components/dashboard/celebration-watcher.tsx`, add the import:

```tsx
import { useFocusMode } from "@/lib/presence/focus-mode-context";
```

Add the hook call at the top of `CelebrationWatcher`, right after `const { toast } = useToast();`:

```tsx
  const { enabled: focusMode } = useFocusMode();
```

Update the drain effect's guard condition from:

```tsx
    if (!queue || queue.length === 0 || drainedRef.current) return;
```

to:

```tsx
    if (!queue || queue.length === 0 || drainedRef.current || focusMode) return;
```

- [ ] **Step 2: Suppress the DailyBar insight segment under Focus Mode**

In `artifacts/edc/src/components/dashboard/daily-bar/insight-segment.tsx`, add the import:

```tsx
import { useFocusMode } from "@/lib/presence/focus-mode-context";
```

Add the hook call near the top of `InsightSegment`, alongside the other hook calls (before the `dataReady`/`lockedInsightRef` block):

```tsx
  const { enabled: focusMode } = useFocusMode();
```

Update the existing early return:

```diff
-  if (!insight) return null;
+  if (!insight || focusMode) return null;
```

- [ ] **Step 3: Typecheck**

Run: `pnpm --filter @workspace/edc run typecheck`
Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add artifacts/edc/src/components/dashboard/celebration-watcher.tsx artifacts/edc/src/components/dashboard/daily-bar/insight-segment.tsx
git commit -m "feat(edc): suppress celebrations and the daily insight under Focus Mode"
```

---

## Task 9: Personality Messages wiring on the 5 non-dashboard pages

**Files:**
- Modify: `artifacts/edc/src/pages/deals.tsx`
- Modify: `artifacts/edc/src/pages/portfolio.tsx`
- Modify: `artifacts/edc/src/pages/autopsy.tsx`
- Modify: `artifacts/edc/src/pages/analytics.tsx`
- Modify: `artifacts/edc/src/pages/memory.tsx`

**Interfaces:**
- Consumes: `<PersonalityLine />` (Task 5, self-suppresses under Focus Mode — no extra guard needed at any of these 5 call sites).

`deals.tsx` and `portfolio.tsx` have a real page-level loading branch; `autopsy.tsx`, `analytics.tsx`, and `memory.tsx` do not (see the plan header's "Deviations" note) — those three get the line in their static header instead.

- [ ] **Step 1: `deals.tsx` — inside the loading skeleton**

Add the import:

```tsx
import { PersonalityLine } from "@/components/personality-line";
```

Replace the loading branch (around line 366-371):

```tsx
      {isLoading ? (
        <Card className="p-4 space-y-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-9 w-full" />
          ))}
        </Card>
      ) : isError ? (
```

with:

```tsx
      {isLoading ? (
        <Card className="p-4 space-y-3">
          <PersonalityLine className="text-xs text-muted-foreground italic" />
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-9 w-full" />
          ))}
        </Card>
      ) : isError ? (
```

- [ ] **Step 2: `portfolio.tsx` — inside the loading branch**

Add the import:

```tsx
import { PersonalityLine } from "@/components/personality-line";
```

Replace:

```tsx
  if (isLoading) return <div className="p-8">Correlating risk patterns…</div>;
```

with:

```tsx
  if (isLoading)
    return (
      <div className="p-8 space-y-2">
        <p>Correlating risk patterns…</p>
        <PersonalityLine />
      </div>
    );
```

- [ ] **Step 3: `autopsy.tsx` — static header**

Add the import:

```tsx
import { PersonalityLine } from "@/components/personality-line";
```

Replace the header block:

```tsx
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Closed-Lost Autopsy</h1>
        <p className="text-muted-foreground mt-2">Learn from loss: post-mortem analysis and pattern recognition</p>
      </div>
```

with:

```tsx
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Closed-Lost Autopsy</h1>
        <p className="text-muted-foreground mt-2">Learn from loss: post-mortem analysis and pattern recognition</p>
        <PersonalityLine className="text-xs text-muted-foreground italic mt-1" />
      </div>
```

- [ ] **Step 4: `analytics.tsx` — static header (this page currently has none)**

Add the import:

```tsx
import { PersonalityLine } from "@/components/personality-line";
```

Replace:

```tsx
    <div className="max-w-[1600px] mx-auto px-6 py-6">
      <Tabs defaultValue="overview">
```

with:

```tsx
    <div className="max-w-[1600px] mx-auto px-6 py-6">
      <PersonalityLine className="text-xs text-muted-foreground italic mb-4" />
      <Tabs defaultValue="overview">
```

- [ ] **Step 5: `memory.tsx` — static header**

Add the import:

```tsx
import { PersonalityLine } from "@/components/personality-line";
```

Replace the header block:

```tsx
      <div>
        <h1 className="text-3xl font-bold">Deal Memory</h1>
        <p className="text-muted-foreground">Institutional knowledge base — searchable archive of closed deals.</p>
      </div>
```

with:

```tsx
      <div>
        <h1 className="text-3xl font-bold">Deal Memory</h1>
        <p className="text-muted-foreground">Institutional knowledge base — searchable archive of closed deals.</p>
        <PersonalityLine className="text-xs text-muted-foreground italic mt-1" />
      </div>
```

- [ ] **Step 6: Typecheck**

Run: `pnpm --filter @workspace/edc run typecheck`
Expected: no errors.

- [ ] **Step 7: Commit**

```bash
git add artifacts/edc/src/pages/deals.tsx artifacts/edc/src/pages/portfolio.tsx artifacts/edc/src/pages/autopsy.tsx artifacts/edc/src/pages/analytics.tsx artifacts/edc/src/pages/memory.tsx
git commit -m "content(edc): add rotating personality messages to the 5 non-dashboard pages"
```

---

## Task 10: Adaptive Dashboard, lightweight (4.8)

**Files:**
- Create: `artifacts/edc/src/components/dashboard/customize-layout-control.tsx`
- Modify: `artifacts/edc/src/pages/dashboard.tsx`

**Interfaces:**
- Consumes: `DEFAULT_ROW_ORDER`, `getRowOrder`, `saveRowOrder`, `moveRow`, `resetRowOrder` (Task 1), `defaultStore` (`@/lib/storage`).

Per the spec, the 9 rows themselves stay inline in `pages/dashboard.tsx` (they close over local state — `openDialog`, `healthInitial`, `stageSelected` and their setters — that would need awkward re-plumbing if extracted). The popover control itself has no such dependency, so it's a separate file.

- [ ] **Step 1: Implement the popover control**

Create `artifacts/edc/src/components/dashboard/customize-layout-control.tsx`:

```tsx
import { Settings2, ArrowUp, ArrowDown } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import { moveRow } from "@/lib/dashboard-layout/row-order";

const ROW_LABELS: Record<string, string> = {
  "vital-signs": "Pipeline Vital Signs",
  "health-risk-alerts": "Health, Risk & Alerts",
  "actions-forecast": "Next Actions & Forecast",
  "stage-gate-funnel": "Stage & Gate Funnels",
  "deal-roster": "Deal Roster",
  "close-timeline-activity": "Close Timeline & Activity",
  "velocity-competitive": "Velocity & Competitive",
  "simulation-band": "Simulation Band",
  "memory-insights": "Deal Memory Insights",
};

// Adaptive Dashboard, lightweight (PRD 4.8, descoped from the PRD's literal
// behavioral tracking engine — see the design spec). Purely a manual
// pin/reorder control: nothing here ever moves on its own.
export function CustomizeLayoutControl({
  rowOrder,
  onReorder,
  onReset,
}: {
  rowOrder: string[];
  onReorder: (next: string[]) => void;
  onReset: () => void;
}) {
  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded-sm"
        >
          <Settings2 className="h-3 w-3" />
          Customize Layout
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-80">
        <p className="text-sm font-medium mb-2">Dashboard layout</p>
        <ul className="space-y-1">
          {rowOrder.map((id, index) => (
            <li key={id} className="flex items-center justify-between gap-2 text-sm">
              <span className="truncate">{ROW_LABELS[id] ?? id}</span>
              <span className="flex gap-1 shrink-0">
                <button
                  type="button"
                  aria-label={`Move ${ROW_LABELS[id] ?? id} up`}
                  disabled={index === 0}
                  onClick={() => onReorder(moveRow(rowOrder, id, "up"))}
                  className="inline-flex min-h-[44px] min-w-[44px] items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted/50 hover:text-foreground disabled:opacity-30 disabled:pointer-events-none cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  <ArrowUp className="h-4 w-4" />
                </button>
                <button
                  type="button"
                  aria-label={`Move ${ROW_LABELS[id] ?? id} down`}
                  disabled={index === rowOrder.length - 1}
                  onClick={() => onReorder(moveRow(rowOrder, id, "down"))}
                  className="inline-flex min-h-[44px] min-w-[44px] items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted/50 hover:text-foreground disabled:opacity-30 disabled:pointer-events-none cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  <ArrowDown className="h-4 w-4" />
                </button>
              </span>
            </li>
          ))}
        </ul>
        <Button type="button" variant="outline" size="sm" className="mt-3 w-full min-h-[44px]" onClick={onReset}>
          Reset to Default
        </Button>
      </PopoverContent>
    </Popover>
  );
}
```

- [ ] **Step 2: Wire the reorderable rows into `pages/dashboard.tsx`**

Change the React import (line 1) from:

```tsx
import { useEffect, useRef, useState } from "react";
```

to:

```tsx
import { Fragment, useEffect, useRef, useState, type ReactNode } from "react";
```

Add the new imports (alongside the other `@/components/dashboard/*` imports):

```tsx
import { CustomizeLayoutControl } from "@/components/dashboard/customize-layout-control";
import { getRowOrder, saveRowOrder, resetRowOrder } from "@/lib/dashboard-layout/row-order";
import { defaultStore } from "@/lib/storage";
```

Inside the `Dashboard` component, add the row-order state (near the other `useState` calls, before the `if (isLoading)` early return):

```tsx
  const [rowOrder, setRowOrder] = useState<string[]>(() => getRowOrder(defaultStore));

  function handleReorder(next: string[]) {
    setRowOrder(next);
    saveRowOrder(defaultStore, next);
  }
  function handleResetLayout() {
    resetRowOrder(defaultStore);
    setRowOrder(getRowOrder(defaultStore));
  }
```

Replace the block from `{/* Row 1 — Pipeline Vital Signs */}` through the end of `{/* Row 9 — Deal Memory Insights */}` (i.e. everything currently between the `<DailyBar />` line and the `<TotalTcvDialog` line) with a `rowsById` map plus the ordered render:

```tsx
      {(() => {
        const rowsById: Record<string, ReactNode> = {
          "vital-signs": (
            <VitalSignsBar
              totalTCV={totalTCV}
              activeDeals={activeDeals}
              redAlerts={counts.RED}
              staleCount={staleCount}
              reportingCurrency={reportingCurrency}
              onOpenTcv={() => setOpenDialog("tcv")}
              onOpenRed={() => openHealth("RED")}
              onOpenStale={() => setOpenDialog("stale")}
              onOpenWeightedPipeline={() => setOpenDialog("weightedPipeline")}
              onOpenAvgScore={() => setOpenDialog("avgScore")}
            />
          ),
          "health-risk-alerts": (
            <div className="grid grid-cols-1 @3xl:grid-cols-2 @5xl:grid-cols-3 gap-6">
              <HealthDistribution
                counts={counts}
                tcvAtRisk={tcvAtRisk}
                reportingCurrency={reportingCurrency}
                onSelect={openHealth}
              />
              <PipelineRiskOverview reportingCurrency={reportingCurrency} />
              <CriticalAlertsFeed
                alerts={summary?.criticalAlerts ?? []}
                tcvByDealId={tcvByDealId}
                reportingCurrency={reportingCurrency}
                onViewAll={() => setOpenDialog("alerts")}
                onSelect={(dealId) => navigate(`/deals/${dealId}`)}
              />
            </div>
          ),
          "actions-forecast": (
            <div className="grid grid-cols-1 @3xl:grid-cols-2 gap-6">
              <NextActions onViewAll={() => setOpenDialog("actions")} />
              <ForecastSnapshot reportingCurrency={reportingCurrency} />
            </div>
          ),
          "stage-gate-funnel": (
            <div className="grid grid-cols-1 @3xl:grid-cols-2 gap-6">
              <StageFunnel reportingCurrency={reportingCurrency} onSelectStage={openStage} />
              <GateFunnel />
            </div>
          ),
          "deal-roster": <DealRoster reportingCurrency={reportingCurrency} />,
          "close-timeline-activity": (
            <div className="grid grid-cols-1 @3xl:grid-cols-2 gap-6">
              <CloseTimeline reportingCurrency={reportingCurrency} />
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-base">Recent Activity</CardTitle>
                </CardHeader>
                <CardContent>
                  {activity.length > 0 ? (
                    <ul className="space-y-3">
                      {activity.map((e) => (
                        <li key={e.id} className="text-sm border-l-2 border-primary/40 pl-3">
                          <div className="flex justify-between gap-2">
                            <button
                              type="button"
                              onClick={() => navigate(`/deals/${e.dealId}`)}
                              className="font-medium text-left hover:underline cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded-sm"
                            >
                              {e.summary}
                            </button>
                            <span className="text-xs text-muted-foreground whitespace-nowrap">
                              {relativeTime(e.occurredAt)}
                            </span>
                          </div>
                          <p className="text-xs text-muted-foreground">
                            {e.dealName ?? "Deal"} · by {e.actor}
                          </p>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="text-sm text-muted-foreground">It's quiet in here. Let's change that.</p>
                  )}
                </CardContent>
              </Card>
            </div>
          ),
          "velocity-competitive": (
            <div className="grid grid-cols-1 @3xl:grid-cols-2 gap-6">
              <VelocitySummary />
              <CompetitiveSummary />
            </div>
          ),
          "simulation-band": <SimulationBand reportingCurrency={reportingCurrency} />,
          "memory-insights": <MemoryInsights />,
        };

        return (
          <>
            <div className="flex justify-end">
              <CustomizeLayoutControl
                rowOrder={rowOrder}
                onReorder={handleReorder}
                onReset={handleResetLayout}
              />
            </div>
            {rowOrder.map((id) => (
              <Fragment key={id}>{rowsById[id]}</Fragment>
            ))}
          </>
        );
      })()}
```

- [ ] **Step 3: Typecheck**

Run: `pnpm --filter @workspace/edc run typecheck`
Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add artifacts/edc/src/components/dashboard/customize-layout-control.tsx artifacts/edc/src/pages/dashboard.tsx
git commit -m "feat(edc): add lightweight manual dashboard row reordering"
```

---

## Task 11: Live verification + full suite (no commit — verification only)

- [ ] **Step 1: Ensure the dev stack is up (PowerShell)**

This phase makes no backend changes, so the API server does not need a rebuild/restart — only the frontend needs to be running:

```powershell
$env:PORT='5173'; $env:BASE_PATH='/'; pnpm --filter @workspace/edc run dev
```

- [ ] **Step 2: Verify Adaptive Dashboard**

Using Playwright/chrome-devtools MCP: log in, open the dashboard, click "Customize Layout." Move a row up and down, confirm the dashboard reflows live behind the popover. Click "Reset to Default." Reload the page — confirm the last saved order (not the reset-to-default state, unless that was the last action) persists across reload.

- [ ] **Step 3: Verify Profile Presence**

Confirm the sidebar footer shows an initials circle + display name + "● Active" status line. Move the mouse and wait — confirm status stays "Active." Click the status line, confirm the Focus Mode popover opens with an explanation and a toggle button. Turn Focus Mode on: confirm the label changes to "● Focus Mode," the sidebar quote line disappears, and (if a DailyBar insight is currently showing) the insight segment disappears too. Turn it back off.

- [ ] **Step 4: Verify Random Professional Quotes**

Confirm a quote (with attribution where present) renders below "Commander Console" in the sidebar header, on both desktop and the mobile `Sheet` (resize to ~390px, open the nav sheet). Confirm it's hidden while Focus Mode is on (from Step 3).

- [ ] **Step 5: Verify Ambient Background**

Confirm `document.documentElement` carries a `data-time-band` attribute matching the current local hour (via `mcp__plugin_playwright_playwright__browser_evaluate` or chrome-devtools' `evaluate_script`, e.g. `document.documentElement.getAttribute('data-time-band')`). Toggle dark/light theme and confirm both still render a plausible, WCAG-AA-legible background — no contrast regression in either theme.

- [ ] **Step 6: Verify Personality Messages**

Visit `/deals`, `/portfolio`, `/autopsy`, `/analytics`, `/memory` (a hard reload or throttled network may be needed to actually observe `/deals` and `/portfolio`'s loading branches). Confirm a personality line renders at each of the 5 locations described in Task 9, and disappears when Focus Mode is on.

- [ ] **Step 7: Mobile + reduced motion**

Resize to ~390×844: confirm no horizontal scroll on the dashboard, sidebar `Sheet`, and all 5 non-dashboard pages; confirm the Customize Layout and Focus Mode popovers fit comfortably and their up/down/toggle buttons remain ≥44px. Emulate `prefers-reduced-motion`: confirm the ambient background tint still applies (attribute + colors) but with no animated transition (instant swap).

- [ ] **Step 8: Full checks**

```powershell
pnpm run typecheck
pnpm --filter @workspace/edc exec vitest run
```

Expected: both exit 0.

- [ ] **Step 9: Report results**

Summarize what was confirmed live; flag anything not exercisable in this pass (e.g. an actual band transition requires either waiting or a manual system-clock/query-param override during verification, since `useTimeBand()` reads the real clock).

### ✔ Final Checkpoint
- [ ] Every task's acceptance criteria met; full typecheck + test suite green; all 5 features verified live; ready to commit/push.
