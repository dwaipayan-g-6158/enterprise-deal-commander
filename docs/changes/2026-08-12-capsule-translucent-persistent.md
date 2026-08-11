# The Commander capsule: translucent, and never hidden

**Date:** 2026-08-12
**Scope:** mobile shell only. Desktop untouched.

## What was wrong

The floating capsule — "Search or jump" on Command and deal detail, "Jump to metric" on
Intelligence — disappeared. The previous session fixed one cause: it could not tell a thumb from a
programmatic scroll, so scroll restoration and its own jump list hid it. But the underlying
behaviour remained: **it ducked away on any downward scroll past 24px** and returned 420ms after the
scroll stopped.

That hide existed for a stated reason. An **opaque** pill parked over the row you are reading is
occlusion; in the Phase 5 captures it sat across a critical alert on Home and the Playbook card on
the deal screen.

## What changed

**The pill is glass, so there is nothing to get out of the way of.** `--m-capsule-alpha` drops from
0.88 → **0.70** in light and 0.95 → **0.82** in dark, and the backdrop blur rises from 20px to 24px.
The scroll listener, the hysteresis and the settle timer are gone; the capsule is now a static
element that never changes state.

### The alphas are measurements, not preferences

Swept in 0.01 steps against every canvas, time band and wash, asserting the label at 4.5:1 and the
pill as a shape at 3:1:

| | AA floor | shipped | worst label | worst shape |
|---|---|---|---|---|
| light | 0.59 fails | **0.70** | 6.70:1 (`--card`) | 5.60:1 (night bg + sky) |
| dark | 0.74 fails | **0.82** | 5.20:1 (afternoon bg) | 3.88:1 (morning bg + sky) |

**Dark cannot go as sheer as light, and that asymmetry is forced by the same fact that already makes
the capsule's polarity invert.** Light's pill is dark on a near-white canvas, so thinning it moves it
*away* from its white label. Dark's pill is light and carries a *dark* label on a near-black canvas,
so thinning it moves it *toward* its own label — the label fails first, and it fails at 0.74.

The margin above each floor is deliberate: the sweep models a flat alpha composite, while the real
pill also runs `backdrop-filter: saturate(160%)`, which can push the backdrop past anything a token
describes.

### Two new guards, because the existing ones only had a floor

`tokens.test.ts` already composited the capsule over every surface and asserted both contrast
floors. Neither could notice the capsule turning back into a solid fill — **opaque is the easiest
case either assertion will ever see**. Added:

- `MAX_CAPSULE_ALPHA = 0.85` as a ceiling, per mode. Floor and ceiling together are the contract.
- `prefers-reduced-transparency: reduce` restores an opaque capsule *and* drops the blur. That block
  already existed as a courtesy while the pill was effectively opaque; it is now the accessibility
  contract, and nothing asserted it.

All four planted violations fail closed: alpha at 0.95 (ceiling), alpha at 0.55 (floor, 9 surfaces),
the media block deleted, and the block kept with the blur left on.

### The label shipped at an opacity nothing measured

`opacity-90` on the label span meant the contrast assertion measured a pixel that does not ship —
trap 1 in that file's own list. As rendered it lands roughly 0.5:1 lower, which was slack on an
opaque pill and is margin the dark theme no longer has. Removed; it was also the only thing making
the label lighter than the icon beside it.

## What was removed with it

**The capsule was the only consumer of `isProgrammaticScroll`.** With the hide gone, the timestamp
window shipped one day earlier, its four `markProgrammaticScroll` call sites and the completeness
guard over the mobile tree were protecting nothing, so all of it is deleted:
`lib/scroll-memory.ts`, `commander-sheet.tsx`, `m-tab-bar.tsx`, `stage-panel.tsx`, `ask-screen.tsx`,
and three describes in `scroll-memory.test.ts`.

The two describes that pin **restore ordering** are kept — they are unrelated and still load-bearing
for the reverse card morph.

If a scroll-reactive component ever returns, this is one `git revert` away.

## A finding that did not become a change

The obvious strengthening here is to widen the capsule's contrast assertion from `surfaces(mode)` to
`backdrops(mode)`, which adds the solid fills — the same set the glass weights are measured against,
for the same reason ("a chart shape scrolling under the header is a real pixel").

**It cannot pass, at any alpha, including 1.** The capsule *is* primary-coloured, so a fully
saturated primary fill directly behind it measures 2.51:1 in light and **1.00:1** in dark. What
carries the boundary in that case is the ring and the elevation, neither of which a token audit can
measure. Recorded in the test file so the next person does not re-derive it and then widen the set.

## Not in this change

- `hidesCommander` is unchanged: Deals and Memory keep their docked search, Account and Settings
  stay clear.
- **The "jump" half of "Search or jump" is still inert.** `commander/use-jump-targets.ts` has zero
  callers anywhere in `src`, so `jumpTargets` is permanently `[]`: the sheet's "On this screen"
  group never renders and the "Navigate deal" affordance is unreachable. Two branches of
  `affordanceFor` are dead code — `/deals` (unreachable behind `hidesCommander`) and the
  jump-target variant. Still open.

## Verification

`pnpm run typecheck` clean. Suite **1,203** tests / 84 files (from 1,213: −14 scroll-marking cases,
+4 token assertions).
