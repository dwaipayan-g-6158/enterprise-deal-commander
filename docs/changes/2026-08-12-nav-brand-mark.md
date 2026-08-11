# The brand mark on every tab root, and it draws

**Date:** 2026-08-12
**Scope:** mobile shell only. Desktop untouched.

## What changed

The EDC mark appeared on **one** of the four tab roots (Command), and **static**. It is now in the
leading slot of all four — Command, Deals, Intelligence, Memory — and plays the desktop sidebar's
draw-in. The account avatar keeps the trailing slot on all four, unchanged.

New `shell/m-nav-brand.tsx` holds the mark and its timing constant, so the four tab roots stay
identical: `leading={<MNavBrand />} right={<MAvatar />}`. A test enforces both halves — a screen
that lost the mark, and a screen that lost the avatar, fail separately.

**`leading` is what keeps the mark off pushed screens.** `MNavBar` ignores it whenever `backHref` is
set, because the chevron owns that corner and a brand mark competing with a back button is how a nav
bar starts to read as a toolbar. That precedence is the only thing preventing the mark from
appearing beside a chevron on every detail screen, so it is now asserted rather than assumed.

## The reversal, stated rather than deleted

`command-screen.tsx` carried this: *"the draw-in belongs to the launch moment (BootSplash), and
replaying it every time someone taps Command turns a signature into a tic."* That was a real
concern. It is restated in the new component rather than quietly removed, because this is a
deliberate reversal and the next person deserves to know it was argued once.

Two things make it defensible at this size: the mark is 24px in a corner rather than 96px
mid-screen, so the draw reads as chrome waking up rather than as a title card; and the sequence is
sped up so it is never caught half-drawn.

## Timing

`MARK_TIME_SCALE = 2.2` — the same value BootSplash uses, for the same reason: a fixed window it has
to finish inside. The desktop sidebar plays the full 3.22s once per app load and never again,
because it is a persistent element. This one lives on a screen, so it replays on every tab switch,
and **3.22s is longer than a tab switch**. At 2.2 the sequence lands in ~1.46s.

## There is no replay mechanism, deliberately

MShell mounts once, but each screen renders its own `MNavBar` below it. Navigating therefore
unmounts one mark and mounts another, and the animation restarts because the component is new —
which is also exactly when it should. A reload plays it for the same reason. Anything cleverer would
be state tracking a remount already expresses.

## The skeleton gained the avatar's stand-in

`m-shell-skeleton.tsx` renders a static mark at first paint so the handover to the live shell moves
nothing. The mark's position is unchanged — leading, as before — but the row previously had no
avatar at all, so the title skeleton stretched into space the live bar reserves.

The stand-in sits inside the same **48px** tap box `.m-tap` gives the live avatar. Sizing it to the
visible 32px disc would hand over 16px narrower and shift the row on the swap — the exact class of
bug this file exists to prevent. The skeleton's mark stays static: it is torn down within a few
hundred milliseconds, and a draw-in that dies mid-sequence reads as a glitch.

## Verified

`pnpm run typecheck` clean. Suite **1,219** / 85 files (+16). Four planted violations fail closed:
a screen with no `leading`, a screen with no avatar, the time scale back at 1, and `MNavBar`
rendering `leading` alongside the back chevron instead of yielding to it.

On the deployed build (`index-DRw56cQq.js`, asserted served before measuring — the service worker
had re-registered itself and replayed the previous `index.html` first):

- **Present on all four roots**, at 390px wide.
- **It draws on navigation.** Sampling from inside the page across a tab switch: fills reset to
  `0,0,0,0`, then `0.10` → `0.77` → `0.99` on petal 1 while petal 2 is at `0.32` (the stagger), all
  four settled at 1.00 by ~1.9s.
- **Reduced motion** (`prefers-reduced-motion: reduce`): no partial fill in any sample across a tab
  switch — the mark is filled from its first frame.

Placement was measured on the deployed build in both positions: trailing first (mark x=283, avatar
x=311), then corrected to leading.
