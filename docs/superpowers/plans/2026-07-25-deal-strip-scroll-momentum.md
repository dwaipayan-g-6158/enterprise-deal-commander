# Deal Strip Scroll Momentum Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the deal strip's instant per-wheel-tick `scrollLeft` jump with a momentum glide, so rapid wheel notches compound into one continuous motion instead of stepped jumps.

**Architecture:** A wheel event accumulates into a target `scrollLeft` value (clamped to the viewport's valid scroll range); a `requestAnimationFrame` loop eases the actual `scrollLeft` toward that target every frame until it's within a small epsilon, then snaps and stops. Two new pure functions (`lerpScrollPosition`, `clampScrollTarget`) do the math; the loop itself is DOM wiring in the same file the wheel listener already lives in.

**Tech Stack:** React 19, TypeScript, Vitest (`environment: "node"` — no DOM, per `artifacts/edc/vitest.config.ts`), `requestAnimationFrame`/`cancelAnimationFrame` (browser APIs, no library).

## Global Constraints

- Frontend-only; no backend, schema, or API changes (spec: Scope).
- Exactly two files change: `artifacts/edc/src/components/cockpit/wheel-horizontal-scroll.ts` (+ its `.test.ts`) and `artifacts/edc/src/components/cockpit/account-navigation-array.tsx` (spec: Scope).
- Do not change `shouldConvertWheelToHorizontalScroll` or the `deltaMode` normalization already in `account-navigation-array.tsx` — both are correct and already reviewed (spec: Out of scope).
- Tuning constants are exact: lerp factor `0.2`, snap epsilon `0.5` pixels (spec: Behavior).
- When `useReducedMotion()` reports true, skip the glide entirely and set `scrollLeft` straight to the clamped target — no new motion for reduced-motion users (spec: Behavior).
- A new wheel gesture must (re-)seed its target from the viewport's actual current `scrollLeft` whenever no glide is already running, so scrollbar drags and the existing `scrollIntoView` centering effect are never overridden by a stale target (spec: Behavior — "Staying in sync").
- The effect's cleanup must cancel any in-flight animation frame in addition to removing the wheel listener (spec: Behavior — "Cleanup").
- Run `pnpm --filter @workspace/edc exec tsc --noEmit -p .` before considering any task done — this package must typecheck clean (project CLAUDE.md).

---

### Task 1: Momentum-glide pure functions

**Files:**
- Modify: `artifacts/edc/src/components/cockpit/wheel-horizontal-scroll.ts`
- Modify: `artifacts/edc/src/components/cockpit/wheel-horizontal-scroll.test.ts`

**Interfaces:**
- Consumes: nothing new (pure, no imports beyond what the file already needs).
- Produces:
  - `function lerpScrollPosition(current: number, target: number, factor: number): number`
  - `function clampScrollTarget(target: number, max: number): number`
  - Task 2 imports both, exact names, from `./wheel-horizontal-scroll`.

- [ ] **Step 1: Write the failing tests**

Append to `artifacts/edc/src/components/cockpit/wheel-horizontal-scroll.test.ts` (add the import to the existing `import { shouldConvertWheelToHorizontalScroll } from "./wheel-horizontal-scroll";` line, and add these two new `describe` blocks after the existing `describe("shouldConvertWheelToHorizontalScroll", ...)` block):

```ts
import { describe, it, expect } from "vitest";
import {
  shouldConvertWheelToHorizontalScroll,
  lerpScrollPosition,
  clampScrollTarget,
} from "./wheel-horizontal-scroll";
```

```ts
describe("lerpScrollPosition", () => {
  it("moves partway toward target by factor", () => {
    expect(lerpScrollPosition(0, 100, 0.2)).toBeCloseTo(20);
  });

  it("returns current unchanged when target equals current", () => {
    expect(lerpScrollPosition(50, 50, 0.2)).toBe(50);
  });

  it("moves partway toward a target below current (negative direction)", () => {
    expect(lerpScrollPosition(100, 0, 0.2)).toBeCloseTo(80);
  });
});

describe("clampScrollTarget", () => {
  it("clamps a target above max down to max", () => {
    expect(clampScrollTarget(500, 300)).toBe(300);
  });

  it("clamps a negative target up to 0", () => {
    expect(clampScrollTarget(-50, 300)).toBe(0);
  });

  it("passes an in-range target through unchanged", () => {
    expect(clampScrollTarget(150, 300)).toBe(150);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm --filter @workspace/edc exec vitest run src/components/cockpit/wheel-horizontal-scroll.test.ts`
Expected: FAIL — `lerpScrollPosition`/`clampScrollTarget` are not exported from `./wheel-horizontal-scroll` yet.

- [ ] **Step 3: Write the implementation**

Append to `artifacts/edc/src/components/cockpit/wheel-horizontal-scroll.ts` (after the existing `shouldConvertWheelToHorizontalScroll` function):

```ts

/**
 * One animation frame's step of linear interpolation from current toward
 * target. `factor` is the fraction of the remaining distance to close per
 * frame (e.g. 0.2 closes 20% of the gap each frame).
 */
export function lerpScrollPosition(
  current: number,
  target: number,
  factor: number,
): number {
  return current + (target - current) * factor;
}

/** Clamp a scroll target to a viewport's valid scroll range of [0, max]. */
export function clampScrollTarget(target: number, max: number): number {
  return Math.max(0, Math.min(target, max));
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm --filter @workspace/edc exec vitest run src/components/cockpit/wheel-horizontal-scroll.test.ts`
Expected: PASS — 11 tests passed (5 existing + 6 new).

- [ ] **Step 5: Typecheck**

Run: `pnpm --filter @workspace/edc exec tsc --noEmit -p .`
Expected: no output (clean).

- [ ] **Step 6: Commit**

```bash
git add artifacts/edc/src/components/cockpit/wheel-horizontal-scroll.ts artifacts/edc/src/components/cockpit/wheel-horizontal-scroll.test.ts
git commit -m "Add lerp/clamp pure functions for deal-strip scroll momentum"
```

---

### Task 2: Wire the momentum glide into the deal strip

**Files:**
- Modify: `artifacts/edc/src/components/cockpit/account-navigation-array.tsx`

**Interfaces:**
- Consumes: `lerpScrollPosition`, `clampScrollTarget` from `./wheel-horizontal-scroll` (Task 1). Also uses `shouldConvertWheelToHorizontalScroll` (unchanged, already imported) and the component's existing `reduce` variable (`const reduce = !!useReducedMotion();`, already declared near the top of `AccountNavigationArray`).
- Produces: no new exports — this is the final consumer.

- [ ] **Step 1: Update the import**

Find this line (line 12):

```ts
import { shouldConvertWheelToHorizontalScroll } from "./wheel-horizontal-scroll";
```

Replace with:

```ts
import {
  shouldConvertWheelToHorizontalScroll,
  lerpScrollPosition,
  clampScrollTarget,
} from "./wheel-horizontal-scroll";
```

- [ ] **Step 2: Add the tuning constants**

Find this line (module-level, above `export function AccountNavigationArray`):

```ts
const GROUP_LABEL: Record<StripGroupId, string> = { open: "Open", closed: "Closed" };
```

Add directly below it:

```ts

// Momentum-glide tuning: fraction of the remaining gap closed per animation
// frame, and the pixel threshold below which the glide snaps to its exact
// target and stops (no idle frames after settling).
const SCROLL_MOMENTUM_FACTOR = 0.2;
const SCROLL_MOMENTUM_EPSILON = 0.5;
```

- [ ] **Step 3: Replace the wheel effect**

Find this entire effect (it currently reads, with an empty `[]` dependency array):

```ts
  useEffect(() => {
    // One-shot: assumes the Radix viewport exists at mount, true today since
    // <nav>/ScrollArea always render unconditionally with no loading guard.
    const viewport = navRef.current?.querySelector<HTMLDivElement>(
      "[data-radix-scroll-area-viewport]",
    );
    if (!viewport) return;

    const handleWheel = (event: WheelEvent) => {
      const shouldConvert = shouldConvertWheelToHorizontalScroll(
        { deltaX: event.deltaX, deltaY: event.deltaY, ctrlKey: event.ctrlKey },
        { scrollWidth: viewport.scrollWidth, clientWidth: viewport.clientWidth },
      );
      if (!shouldConvert) return;
      event.preventDefault();
      // In Chrome (unlike Firefox), Shift+wheel arrives as deltaY-dominant, so
      // it also lands here — still the correct horizontal-scroll outcome.
      // Normalize by deltaMode: Firefox reports line deltas (~3), not pixels.
      const step =
        event.deltaMode === 1
          ? event.deltaY * 16
          : event.deltaMode === 2
            ? event.deltaY * viewport.clientWidth
            : event.deltaY;
      viewport.scrollLeft += step;
    };

    viewport.addEventListener("wheel", handleWheel, { passive: false });
    return () => viewport.removeEventListener("wheel", handleWheel);
  }, []);
```

Replace it with:

```ts
  useEffect(() => {
    // One-shot: assumes the Radix viewport exists at mount, true today since
    // <nav>/ScrollArea always render unconditionally with no loading guard.
    const viewport = navRef.current?.querySelector<HTMLDivElement>(
      "[data-radix-scroll-area-viewport]",
    );
    if (!viewport) return;

    // Accumulating target for the momentum glide; null means no glide is
    // currently in flight, so the next wheel event should seed it from the
    // viewport's actual scrollLeft rather than a stale prior value.
    let targetScrollLeft: number | null = null;
    let animationFrame: number | null = null;

    const glide = () => {
      if (targetScrollLeft === null) return;
      const target = targetScrollLeft;
      const next = lerpScrollPosition(viewport.scrollLeft, target, SCROLL_MOMENTUM_FACTOR);
      if (Math.abs(target - next) < SCROLL_MOMENTUM_EPSILON) {
        viewport.scrollLeft = target;
        targetScrollLeft = null;
        animationFrame = null;
        return;
      }
      viewport.scrollLeft = next;
      animationFrame = requestAnimationFrame(glide);
    };

    const handleWheel = (event: WheelEvent) => {
      const shouldConvert = shouldConvertWheelToHorizontalScroll(
        { deltaX: event.deltaX, deltaY: event.deltaY, ctrlKey: event.ctrlKey },
        { scrollWidth: viewport.scrollWidth, clientWidth: viewport.clientWidth },
      );
      if (!shouldConvert) return;
      event.preventDefault();
      // In Chrome (unlike Firefox), Shift+wheel arrives as deltaY-dominant, so
      // it also lands here — still the correct horizontal-scroll outcome.
      // Normalize by deltaMode: Firefox reports line deltas (~3), not pixels.
      const step =
        event.deltaMode === 1
          ? event.deltaY * 16
          : event.deltaMode === 2
            ? event.deltaY * viewport.clientWidth
            : event.deltaY;
      const max = viewport.scrollWidth - viewport.clientWidth;

      if (reduce) {
        viewport.scrollLeft = clampScrollTarget(viewport.scrollLeft + step, max);
        return;
      }

      // Seed the target from the strip's actual position only when no glide
      // is in flight, so a fresh gesture always starts from wherever the
      // strip really is (e.g. after a scrollbar drag or scrollIntoView), not
      // a stale target left over from an earlier gesture.
      if (targetScrollLeft === null) targetScrollLeft = viewport.scrollLeft;
      targetScrollLeft = clampScrollTarget(targetScrollLeft + step, max);
      if (animationFrame === null) animationFrame = requestAnimationFrame(glide);
    };

    viewport.addEventListener("wheel", handleWheel, { passive: false });
    return () => {
      viewport.removeEventListener("wheel", handleWheel);
      if (animationFrame !== null) cancelAnimationFrame(animationFrame);
    };
  }, [reduce]);
```

Note the dependency array changed from `[]` to `[reduce]` — matching the pattern the file's own `scrollIntoView` effect already uses (it depends on `reduce` too) — so the listener is correctly re-attached (via the same cleanup path) if the user's reduced-motion preference changes while the page is open.

- [ ] **Step 4: Typecheck**

Run: `pnpm --filter @workspace/edc exec tsc --noEmit -p .`
Expected: no output (clean).

- [ ] **Step 5: Run the full test suite**

Run: `pnpm --filter @workspace/edc run test`
Expected: same pass count as before this task (293 existing + the 6 new from Task 1 = 299 tests), no regressions.

- [ ] **Step 6: Manual verification in-browser**

Start the frontend (`pnpm --filter @workspace/edc run dev`) against the already-running API server, open a deal cockpit with the strip overflowing (or fan out the Closed pile), then check:

- A single wheel notch now glides to its new position over a few frames rather than snapping instantly.
- A quick burst of wheel notches reads as one continuous glide, not a stutter or a series of restarts.
- With the OS/browser's reduced-motion preference emulated on, wheel-scrolling snaps instantly (no glide) — same as the feature's original behavior.
- Dragging the scrollbar thumb, then wheel-scrolling immediately after, starts the glide from the dragged-to position (not a stale target).
- Switching the active deal (which re-triggers the existing `scrollIntoView` centering effect), then wheel-scrolling immediately after, starts the glide from the centered position.
- Clicking a deal card after wheel-scrolling still navigates to that deal's cockpit.
- No console errors.

- [ ] **Step 7: Commit**

```bash
git add artifacts/edc/src/components/cockpit/account-navigation-array.tsx
git commit -m "Replace deal-strip wheel-scroll instant jump with a momentum glide"
```
