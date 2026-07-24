# Deal Strip Scroll Momentum Design

Date: 2026-07-25
Status: Approved, pending implementation plan.

## Problem

The deal-strip wheel-scroll feature (see
`2026-07-24-deal-strip-wheel-scroll-design.md`, shipped on this same branch)
deliberately applies each wheel tick's step to `scrollLeft` instantly, with no
easing — an explicit choice made during that feature's own brainstorming
("Instant / 1:1" over "Smooth/eased"). Having used it live, the feedback is
that this reads as jerky: each wheel notch snaps the strip straight to its new
position with no motion in between, rather than gliding. This spec replaces
the instant-jump behavior with a momentum glide, without touching the parts of
the feature that already work correctly (the decision gate and the
`deltaMode` normalization).

## Decision

Replace the direct `viewport.scrollLeft += step` with an accumulating **target**
position plus a `requestAnimationFrame` loop that eases the actual `scrollLeft`
toward that target every frame. Rapid consecutive wheel notches push the
target further rather than each restarting an animation, so a burst of ticks
reads as one continuous glide.

Two new pure functions are added to the existing
`artifacts/edc/src/components/cockpit/wheel-horizontal-scroll.ts` (not a new
file — this is still the same "wheel-driven horizontal scrolling of the
strip" concern the file already owns, not a distinct one):

```ts
/** One frame's step of linear interpolation from current toward target. */
export function lerpScrollPosition(
  current: number,
  target: number,
  factor: number,
): number {
  return current + (target - current) * factor;
}

/** Clamp a scroll target to the viewport's valid scroll range. */
export function clampScrollTarget(target: number, max: number): number {
  return Math.max(0, Math.min(target, max));
}
```

The existing `shouldConvertWheelToHorizontalScroll` gate (overflow check,
`ctrlKey` guard, dominant-axis check) and the `deltaMode` normalization in
`account-navigation-array.tsx` are both unchanged — this spec only replaces
what happens with a qualifying step (instant jump → accumulate-and-glide), not
whether one happens.

## Scope

Frontend-only, two files:
- `artifacts/edc/src/components/cockpit/wheel-horizontal-scroll.ts` (+ its
  `.test.ts`) — add `lerpScrollPosition` and `clampScrollTarget`.
- `artifacts/edc/src/components/cockpit/account-navigation-array.tsx` — replace
  the wheel handler's direct assignment with the accumulate-and-glide loop.

No backend, schema, or API changes.

## Behavior

**Mechanism:** the wheel handler keeps a ref-held `targetScrollLeft`. On a
qualifying wheel event, if no animation loop is currently running, the target
is first (re-)initialized from the viewport's actual current `scrollLeft` —
so a gesture always starts from where the strip really is, not a stale
remembered value (see "Staying in sync" below). The event's step (after
`deltaMode` normalization, unchanged from the existing feature) is added to
the target, then clamped via `clampScrollTarget(target, viewport.scrollWidth -
viewport.clientWidth)`. If no rAF loop is currently scheduled, one is started.

Each animation frame: `viewport.scrollLeft = lerpScrollPosition(viewport.scrollLeft,
targetScrollLeft, FACTOR)`. When `Math.abs(targetScrollLeft -
viewport.scrollLeft) < EPSILON`, the loop snaps `scrollLeft` to the exact
target and stops (`cancelAnimationFrame`, clear the scheduled-frame ref) —
no idle frames continue after the glide settles.

**Tuning constants:** `FACTOR = 0.2`, `EPSILON = 0.5` (pixels). At 60fps this
settles a typical single-notch step in roughly 150–200ms, matching this
file's existing micro-interaction durations (e.g. the card entrance
animation's `duration: 0.18`).

**`prefers-reduced-motion`:** `AccountNavigationArray` already computes
`reduce` via `useReducedMotion()` for its other animations. When `reduce` is
true, the handler skips the rAF loop entirely and sets `viewport.scrollLeft`
straight to the clamped target — identical to the feature's original instant
behavior. No new motion is introduced for users who've asked to avoid it.

**Staying in sync with other scrollLeft movers:** the strip's `scrollLeft`
can also change from the draggable scrollbar thumb or the existing
`scrollIntoView` centering effect (on active-deal change / fan toggle).
Because the target is only (re-)seeded from the actual `scrollLeft` when no
loop is currently running, a new wheel gesture that starts after one of those
other movers has run always accumulates from wherever the strip actually is,
never from a stale target left over from an earlier gesture.

**Cleanup:** the effect's cleanup cancels any in-flight animation frame
(`cancelAnimationFrame`) alongside the existing `removeEventListener`, so nothing
fires after the component unmounts.

## Testing

`lerpScrollPosition` and `clampScrollTarget` get direct Vitest unit tests
(pure math, no DOM), added to the existing
`wheel-horizontal-scroll.test.ts`. Suggested cases:
- `lerpScrollPosition`: moves partway toward target by `factor`; returns
  `current` unchanged when `target === current`; handles negative direction
  (target below current) the same way as positive.
- `clampScrollTarget`: clamps a target above `max` down to `max`; clamps a
  negative target up to `0`; passes an in-range target through unchanged.

The rAF loop and event wiring themselves are DOM/timing behavior with no
automated coverage (this package's Vitest runs `environment: "node"`, per the
original feature's spec) — verified manually/live in-browser, same as the
rest of this feature: wheel-scrolling over an overflowing strip should visibly
glide rather than jump; a quick burst of notches should read as one smooth
motion, not a stutter; `prefers-reduced-motion` (emulated) should show the
original instant snap with no glide; scrollbar-drag and `scrollIntoView`
centering should remain unaffected.

## Out of scope

- No change to `shouldConvertWheelToHorizontalScroll` or the `deltaMode`
  normalization — both already correct and already reviewed.
- No rubber-banding/overscroll bounce past the clamped range.
- No change to vertical scroll behavior anywhere else in the app — this is
  scoped to this one component's horizontal wheel handling.
