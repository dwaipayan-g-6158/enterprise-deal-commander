# Deal Strip Wheel-to-Horizontal Scroll Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the deal strip at the top of the Deal Cockpit page (`AccountNavigationArray`) scroll horizontally in response to a plain vertical mouse-wheel gesture, so deals off-screen can be reached without dragging the scrollbar or using Shift+wheel.

**Architecture:** A pure decision function (`shouldConvertWheelToHorizontalScroll`) decides whether a given wheel event should be converted; a real (non-React-synthetic) `wheel` event listener, registered with `{ passive: false }` on the strip's Radix scroll viewport, calls that function and — when it returns true — calls `preventDefault()` and adds `deltaY` to `scrollLeft`.

**Tech Stack:** React 19, TypeScript, Vitest (`environment: "node"` — no DOM/jsdom available in this test run, per `artifacts/edc/vitest.config.ts`), Radix `@radix-ui/react-scroll-area` (already wrapped by `components/ui/scroll-area.tsx`).

## Global Constraints

- Frontend-only; no backend, schema, or API changes (spec: Scope).
- Do not modify the shared `ScrollArea`/`ScrollBar` primitive (`components/ui/scroll-area.tsx`) — the change is scoped entirely to `account-navigation-array.tsx` and its new sibling module (spec: Decision, Out of scope).
- Scroll mapping is instant 1:1 (`scrollLeft += deltaY`), no animation/easing (spec: Behavior).
- Must not change click-to-navigate, keyboard arrow-key navigation, the existing `scrollIntoView` centering effect, or the draggable scrollbar thumb (spec: Unaffected).
- Pass-through cases (handler must decline, letting the browser handle the event): no horizontal overflow; `ctrlKey` (pinch-zoom); horizontal delta already dominant (trackpad swipe / Shift+wheel) (spec: Pass-through cases).
- Run `pnpm --filter @workspace/edc exec tsc --noEmit -p .` before considering any task done — this package must typecheck clean (project CLAUDE.md).

---

### Task 1: Pure wheel-conversion decision function

**Files:**
- Create: `artifacts/edc/src/components/cockpit/wheel-horizontal-scroll.ts`
- Test: `artifacts/edc/src/components/cockpit/wheel-horizontal-scroll.test.ts`

**Interfaces:**
- Consumes: nothing (pure, no imports from other new/existing modules).
- Produces:
  - `interface WheelGesture { deltaX: number; deltaY: number; ctrlKey: boolean }`
  - `interface ViewportSize { scrollWidth: number; clientWidth: number }`
  - `function shouldConvertWheelToHorizontalScroll(wheel: WheelGesture, viewport: ViewportSize): boolean`
  - Task 2 imports all three from `./wheel-horizontal-scroll`.

- [ ] **Step 1: Write the failing tests**

Create `artifacts/edc/src/components/cockpit/wheel-horizontal-scroll.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { shouldConvertWheelToHorizontalScroll } from "./wheel-horizontal-scroll";

const overflowing = { scrollWidth: 2000, clientWidth: 800 };
const notOverflowing = { scrollWidth: 800, clientWidth: 800 };

describe("shouldConvertWheelToHorizontalScroll", () => {
  it("converts a plain vertical wheel tick when the strip overflows", () => {
    const result = shouldConvertWheelToHorizontalScroll(
      { deltaX: 0, deltaY: 100, ctrlKey: false },
      overflowing,
    );
    expect(result).toBe(true);
  });

  it("declines when the strip has no horizontal overflow", () => {
    const result = shouldConvertWheelToHorizontalScroll(
      { deltaX: 0, deltaY: 100, ctrlKey: false },
      notOverflowing,
    );
    expect(result).toBe(false);
  });

  it("declines a pinch-zoom gesture even when the strip overflows", () => {
    const result = shouldConvertWheelToHorizontalScroll(
      { deltaX: 0, deltaY: 100, ctrlKey: true },
      overflowing,
    );
    expect(result).toBe(false);
  });

  it("declines when the horizontal delta already dominates (trackpad swipe / Shift+wheel)", () => {
    const result = shouldConvertWheelToHorizontalScroll(
      { deltaX: 50, deltaY: 5, ctrlKey: false },
      overflowing,
    );
    expect(result).toBe(false);
  });

  it("converts when the vertical and horizontal deltas are equal", () => {
    const result = shouldConvertWheelToHorizontalScroll(
      { deltaX: 30, deltaY: 30, ctrlKey: false },
      overflowing,
    );
    expect(result).toBe(true);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `pnpm --filter @workspace/edc exec vitest run src/components/cockpit/wheel-horizontal-scroll.test.ts`
Expected: FAIL — `Cannot find module './wheel-horizontal-scroll'` (the implementation file doesn't exist yet).

- [ ] **Step 3: Write the implementation**

Create `artifacts/edc/src/components/cockpit/wheel-horizontal-scroll.ts`:

```ts
// Pure decision for converting a vertical wheel gesture into horizontal
// scrolling of the deal strip. Kept free of React/DOM so it stays
// node-testable, mirroring deal-strip-model.ts.

export interface WheelGesture {
  deltaX: number;
  deltaY: number;
  ctrlKey: boolean;
}

export interface ViewportSize {
  scrollWidth: number;
  clientWidth: number;
}

/**
 * True when a wheel event over the strip should be converted into a
 * horizontal scroll instead of the browser's default handling.
 *
 * Declines (returns false, letting the browser do its default thing) when:
 * - the gesture is a pinch-zoom (ctrlKey)
 * - the strip has nothing to scroll (no horizontal overflow)
 * - the gesture is already horizontal-dominant (trackpad swipe, Shift+wheel)
 */
export function shouldConvertWheelToHorizontalScroll(
  wheel: WheelGesture,
  viewport: ViewportSize,
): boolean {
  if (wheel.ctrlKey) return false;
  if (viewport.scrollWidth <= viewport.clientWidth) return false;
  return Math.abs(wheel.deltaY) >= Math.abs(wheel.deltaX);
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `pnpm --filter @workspace/edc exec vitest run src/components/cockpit/wheel-horizontal-scroll.test.ts`
Expected: PASS — 5 tests passed.

- [ ] **Step 5: Typecheck**

Run: `pnpm --filter @workspace/edc exec tsc --noEmit -p .`
Expected: no output (clean).

- [ ] **Step 6: Commit**

```bash
git add artifacts/edc/src/components/cockpit/wheel-horizontal-scroll.ts artifacts/edc/src/components/cockpit/wheel-horizontal-scroll.test.ts
git commit -m "Add pure decision function for wheel-to-horizontal scroll conversion"
```

---

### Task 2: Wire the wheel listener into the deal strip

**Files:**
- Modify: `artifacts/edc/src/components/cockpit/account-navigation-array.tsx`

**Interfaces:**
- Consumes: `shouldConvertWheelToHorizontalScroll`, `WheelGesture`, `ViewportSize` from `./wheel-horizontal-scroll` (Task 1). Also reuses the existing `navRef` (`useRef<HTMLElement>(null)`, declared at the top of `AccountNavigationArray`, already attached to the `<nav>` element).
- Produces: no new exports — this is the final consumer.

**Context (verified against the installed package):** the Radix scroll viewport DOM node carries the attribute `data-radix-scroll-area-viewport` (confirmed in `@radix-ui/react-scroll-area`'s `dist/index.mjs`) and is given `overflowX: "scroll"` inline whenever a horizontal `ScrollBar` is rendered — which `AccountNavigationArray` already does. Its `scrollLeft` is a normal, writable DOM property.

- [ ] **Step 1: Add the import**

In `artifacts/edc/src/components/cockpit/account-navigation-array.tsx`, find this existing import (line 11):

```ts
import { groupDeals, type StripDeal, type StripGroupId } from "./deal-strip-model";
```

Add directly below it:

```ts
import { shouldConvertWheelToHorizontalScroll } from "./wheel-horizontal-scroll";
```

- [ ] **Step 2: Add the wheel-listener effect**

Find the existing focus-follow effect that ends here (around lines 73-86):

```ts
  useEffect(() => {
    if (!userToggled.current) return;
    userToggled.current = false;
    requestAnimationFrame(() => {
      // Scope to the newly fanned group's own fan (its id carries the group) so
      // a fan from the previous group that is still animating out can't capture
      // focus. Prefer the active card; fall back to the first card in the group.
      const fan = navRef.current?.querySelector(`#deal-strip-fan-${expandedGroup}`);
      const target =
        fan?.querySelector<HTMLElement>('[aria-current="true"]') ??
        fan?.querySelector<HTMLElement>("[data-strip-card]");
      target?.focus({ preventScroll: true });
    });
  }, [expandedGroup]);
```

Immediately after it (still before `const renderCard = (deal: StripDealItem, ...`), add:

```ts
  // Convert a plain vertical wheel scroll into horizontal scroll of the
  // strip's own viewport, so an ordinary mouse wheel works like a trackpad's
  // horizontal swipe while hovering the strip. Registered as a real DOM
  // listener with { passive: false } — React's synthetic onWheel can't
  // reliably preventDefault() the page's own scroll in every browser — and
  // scoped to this component's viewport only, so no other ScrollArea in the
  // app is affected.
  useEffect(() => {
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
      viewport.scrollLeft += event.deltaY;
    };

    viewport.addEventListener("wheel", handleWheel, { passive: false });
    return () => viewport.removeEventListener("wheel", handleWheel);
  }, []);
```

- [ ] **Step 3: Typecheck**

Run: `pnpm --filter @workspace/edc exec tsc --noEmit -p .`
Expected: no output (clean).

- [ ] **Step 4: Manual verification in-browser**

Start the frontend (`pnpm --filter @workspace/edc run dev`) and the API server if not already running, open a deal's cockpit page with enough deals to overflow the strip (or temporarily narrow the browser window), then check each of these (all from the spec's Testing section):

- Wheel-scrolling with the pointer over the strip moves it horizontally; the page underneath does not also scroll vertically.
- With a short deal list (no overflow), wheel-scrolling over the strip scrolls the page normally.
- Shift+wheel and/or a trackpad's horizontal swipe still scroll the strip (unchanged from before).
- Ctrl+wheel (trackpad pinch-zoom) still zooms the page — not intercepted.
- Clicking a deal card after wheel-scrolling still navigates to that deal's cockpit.
- Arrow-key navigation and the scrollbar-thumb drag still work as before.

- [ ] **Step 5: Commit**

```bash
git add artifacts/edc/src/components/cockpit/account-navigation-array.tsx
git commit -m "Scroll the deal strip horizontally on mouse wheel"
```
