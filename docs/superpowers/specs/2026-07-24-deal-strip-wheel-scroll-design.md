# Deal Strip Wheel-to-Horizontal Scroll Design

Date: 2026-07-24
Status: Approved, pending implementation plan.

## Problem

The deal strip at the top of the Deal Cockpit page (`AccountNavigationArray` in
`artifacts/edc/src/components/cockpit/account-navigation-array.tsx`) renders all
deals in a single horizontal row inside a Radix `ScrollArea` with a horizontal
scrollbar (`components/ui/scroll-area.tsx`). When the row overflows, the only
ways to reach deals off-screen today are: drag the scrollbar thumb, hold
Shift+wheel, or use a trackpad's horizontal swipe. A plain vertical mouse-wheel
scroll — the default gesture most mice support — does nothing while the
pointer is over the strip. The ask is for that ordinary wheel scroll to move
the strip horizontally when the pointer is over it, so a deal can then be
clicked to open it exactly as today (click already navigates to
`/deals/:id` — unchanged).

## Decision

Add a wheel handler scoped entirely to `AccountNavigationArray` that converts a
vertical wheel gesture into horizontal scrolling of the strip's own Radix
viewport, implemented as a real (non-React-synthetic) `addEventListener`.

Considered and rejected:
- **Plain JSX `onWheel` prop** — simpler to write, but React's synthetic wheel
  handling has a known history of `preventDefault()` not reliably blocking the
  browser's native scroll in every engine. That would risk a half-broken
  result (the strip scrolls horizontally *and* the page scrolls vertically
  underneath it at the same time), which would only surface as an in-browser
  bug, not a type or lint error.
- **CSS-only** — not viable; CSS cannot listen to or remap wheel events, so
  there is no way to satisfy the ask without a JS event handler.

A native listener is registered with `{ passive: false }` in a `useEffect` so
`preventDefault()` is guaranteed to work, and it targets only this component —
the shared `ScrollArea`/`ScrollBar` primitive used elsewhere in the app
(tables, other panels) is not touched, so no other screen gains
wheel-scrolls-horizontally behavior it didn't ask for.

## Scope

Frontend-only, one file: `artifacts/edc/src/components/cockpit/account-navigation-array.tsx`.
No backend, schema, or API changes.

## Behavior

- **Trigger:** any vertical wheel gesture while the pointer is anywhere over
  the strip's `<nav>` (deal cards, the Open/Closed piles, the "New Deal"
  button) — wheel events bubble, so no per-child wiring is needed.
- **Effect:** the strip's Radix scroll viewport (the DOM node carrying
  `data-radix-scroll-area-viewport`, located once via the existing `navRef`)
  scrolls horizontally: `viewport.scrollLeft += event.deltaY`. Instant, no
  easing/animation — matches the "1:1, precise, same feel as a trackpad's
  native horizontal scroll" preference.
- **`preventDefault()`** is called only when the handler actually converts the
  gesture, so the page doesn't also scroll vertically underneath the strip at
  the same time.

## Pass-through cases (handler takes no action; native browser behavior applies)

- **No overflow:** `viewport.scrollWidth <= viewport.clientWidth` (few enough
  deals that the strip already shows everything) — wheel scroll passes
  through and the page scrolls normally, as it does today.
- **Pinch-zoom:** `event.ctrlKey` is true (trackpad pinch-to-zoom also fires as
  a wheel event) — left alone so zooming over the strip still works.
- **Native horizontal gestures:** when `|deltaX| > |deltaY|` (trackpad
  horizontal swipe, Shift+wheel) — already scroll the strip correctly via the
  browser's own handling, so the new code defers to it rather than
  double-applying.

## Unaffected

Click-to-navigate, keyboard arrow-key deal switching, the existing
`scrollIntoView` effect that re-centers the active deal's card on
selection/fan-toggle, and the draggable horizontal scrollbar thumb — none of
these are touched by this change.

## Testing

Manual, in-browser (no automated test — this is pointer/wheel-event behavior
not meaningfully covered by Vitest):

- With enough deals to overflow the strip: wheel-scrolling over it moves the
  strip horizontally; the page underneath does not also scroll.
- With a short deal list (no overflow): wheel-scrolling over the strip scrolls
  the page normally.
- Shift+wheel and trackpad horizontal swipe still scroll the strip as before.
- Ctrl+wheel (trackpad pinch-zoom) still zooms the page.
- Clicking a card after wheel-scrolling still opens that deal's cockpit.

## Out of scope

- No change to the shared `ScrollArea`/`ScrollBar` primitive
  (`components/ui/scroll-area.tsx`) — other consumers of it elsewhere in the
  app are unaffected.
- No drag-to-scroll (click-and-drag the row itself) — not requested; the
  scrollbar thumb already provides a drag affordance.
- No change to scroll speed/acceleration curves beyond the 1:1 mapping above.
