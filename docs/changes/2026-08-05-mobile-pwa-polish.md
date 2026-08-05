# Mobile PWA — Native Feel, Motion System & Brand Moment

**Date:** 2026-08-05
**Branch:** `feat/mobile-pwa-polish` (6 commits, cut from `feat/mobile-pwa-shell`)
**Baseline:** `6a1c28c`

Phase 2 of the mobile work. The read-only shell was correct and fast but
visually plain — flat cards, one shimmer, no route transitions, and no brand
presence at all. This is the polish layer, plus the two real bugs an audit of
that area turned up.

---

## 1. The two bugs

**The mark was absent on mobile.** `EdcLogoMark` was imported by zero files
under `src/mobile/`. `MobileHeader` had no slot for it and
`mobile-shell-skeleton.tsx` drew a grey `h-6 w-6` box exactly where a 24px
mark belongs, so the only mark a phone could reach was the static one on
`/login` — a mobile user never saw the animation, and the skeleton handover
popped because the box had no counterpart.

`MobileHeader` now takes a `leading` slot (ignored when `backHref` is set —
the chevron owns that corner), the Command Center fills it, and the skeleton
draws the real mark at the same size. Both static: the draw-in belongs to the
launch, not to every tap on Home.

**The time-of-day system was computed and discarded.** `AmbientBackground`
stamps `data-time-band` on `<html>` and `index.css` tints the desktop canvas
from it, but `.m-shell` set its own opaque `--m-surface-0` and occluded the
tint completely. Both halves shift now — the canvas by a hair, and a radial
wash overhead by rather more, warm at dawn and cool after dark. The wash is a
`background-image` on the shell, not a `::before`: a positioned pseudo-element
would paint over every non-positioned card in the scroll container and tint
the cards too.

## 2. Motion foundation

`src/mobile/motion.css` holds four durations and four curves. Declared on
`:root` rather than `.m-shell`, because the `::view-transition-*` pseudos are
children of the document root and cannot see anything scoped to the shell —
and the stylesheet only loads inside the lazy mobile chunk anyway.

Three tiers, chosen per job: CSS transitions for state, `animation-timeline`
for anything tied to scroll position, and **no animation library at all**. The
plan called for framer-motion on the scrubber; pointer events plus one CSS
transition turned out to cover it, and the mobile chunk stays free of a
runtime it would use in one place.

Reduced motion is a first-class path, not an afterthought: `aroundNav` bails
before starting a transition, the scroll-driven rules sit inside `@media not
(prefers-reduced-motion: reduce)`, the boot splash does not render, and
`CountUp` renders its final value. Verified end to end (§7).

## 3. Route and shared-element transitions

wouter 3.10 ships an `aroundNav` router option built for view transitions, so
there is no click interception and no wrapper `Link`: a nested `<Router
aroundNav>` inside `MobileApp` installs one handler and every `navigate()`
below it goes through `document.startViewTransition`. The nested router
declares no `base`, so it inherits App.tsx's and the desktop shell is
untouched.

Direction comes from route depth, with **every tab root counting as the same
level** — Home included, despite having one fewer segment — so a tab switch
reads as lateral rather than as a step down into Deals and back up out of it.
Forward/back get an 8px directional slide; lateral gets a plain cross-fade.
The nav bar, tab bar and Commander capsule carry their own
`view-transition-name`, so they hold still while the content moves under them.

**The card morph** (`src/mobile/lib/shared-card.ts`) stamps its two sides
differently. The leaving card is already on screen and React will not
re-render it before the snapshot, so its names go straight to the DOM from the
`Link`'s own `onClick` — which wouter runs before it navigates. The arriving
screen renders inside the transition's `flushSync`, so it reads the armed id
from a store and stamps itself with style props, then re-renders clean when
`aroundNav` disarms on `finished`. Without that disarm a later navigation
would find two elements claiming one name and the transition would abort.

Forward-only, deliberately: going back the list remounts at the top of its
scroll, so the card the hero would morph into is often nowhere near where it
was tapped.

Two opt-outs: reduced motion, and `<Redirect>` — it navigates from a layout
effect where `flushSync` is not safe to call, so it passes wouter's own
`transition={false}`.

### The seed

A card hands its account, name and value forward when tapped. The detail
screen's query has not resolved by the time a 260ms transition is over, so
without this the morph would land on a shimmer. It earns its place twice: the
morph has something to arrive at, and the loading state shows the deal's own
name and value instead of a grey box.

## 4. Liquid Glass

`.m-glass` went from two properties to four layers: blurred saturated
backdrop, a flat tint over it, a specular hairline along the light-facing
edge, and the keyline each caller already carried. The tint does most of the
opacity work, which lets the base surface drop and more content show through.
`.m-glass-top` / `.m-glass-bottom` pick which way it casts.

Built from background layers, not a `::before`: `.m-glass` lands on sticky,
absolute and fixed elements and a pseudo-element would need every one of them
to establish a containing block.

**No SVG refraction.** Every Liquid Glass tutorial reaches for
`feTurbulence`/`feDisplacementMap` as a `backdrop-filter`, and **Safari does
not support it** — it would render as nothing on the target device and cost a
filter pass everywhere else.

## 5. Systemic motion

| What | How |
|---|---|
| Card reveals | `animation-timeline: view()`, 8px rise, `@supports`-gated |
| Header elevation | `animation-timeline: scroll(nearest)` over the first 72px |
| Section expand | 0fr→1fr grid row; body stays mounted, `inert` when closed |
| Count-up | rAF, once per session per key, skipped when morphing or scrubbing |
| Tab icon spring | only when the navigation actually changed tab |
| Pull-to-refresh | spring release, ring closes and pulses on success |
| Skeleton→content | 160ms `m-appear` on the sections that replace shimmer |
| Sheet | iOS-proportioned grabber; vaul's snap curve already is `--m-ease-ios` |

Three things worth keeping:

- **`animation-timeline` must be declared after `animation`.** The shorthand
  resets it to `auto` and the rule fails silently.
- **The reveal moves with `translate`, not `transform`.** A filled animation
  beats a normal declaration, so a finished reveal holding `transform: none`
  would have cancelled `.m-press`'s tap compression for the rest of the
  session. `translate` is an independent property and composes.
- **A non-scrollable container makes the timeline inactive**, and an inactive
  timeline means the animation does not apply at all — verified, because the
  failure mode would be invisible content on a short screen.

`content-visibility: auto` was dropped from the plan. It pairs badly with a
scroll-driven reveal on the same element, and the lists it would help here are
dozens of rows, not thousands.

## 6. Native capabilities

- **Icon badge**, opt-in from a row in the Commander sheet. iOS routes the
  badge through notification permission and only ever asks once, so a launch
  prompt would burn the request before the user knows what it is for. The row
  says what it does, asks only on tap, and explains the Settings trip on a
  decline. It publishes the red-alert count the Command Center already
  fetched, and clears on sign-out — a count left on the icon reports someone
  else's pipeline on a shared device.
- **Manifest shortcuts**: Red alerts and All deals. Red alerts needed the
  Deals screen to restore a filter from the URL, which it now does, read once
  as an initial value so a chip tap does not push a filter change into the
  back stack.
- **Haptics** (`src/mobile/lib/haptics.ts`): the hidden `switch` trick,
  feature-detected on the IDL attribute. It worked from iOS 17.4 and **Apple
  closed it in 26.5**, so on a current device it is a silent no-op. Nothing
  depends on it — every call site keeps its visual feedback and fires this
  alongside.
- **Boot splash** (`src/mobile/shell/boot-splash.tsx`) runs the mark at
  `timeScale: 2.2` and leaves once both the mark has arrived and the first
  queries have gone quiet, with a hard 2.5s ceiling behind both. It borrows
  `.m-shell`, so the launch canvas is the same time-of-day sky the app wears.
  Gated three ways: once per app launch, installed app only, and not at all
  under reduced motion.

`EdcLogoMark` gained exactly one prop, `timeScale`, defaulting to `1` — every
existing call site produces byte-identical timing. Only the one-shot entrance
scales; the resting breathe stays at 8s.

## 7. Verification

`pnpm run typecheck` clean; `pnpm --filter @workspace/edc run test` 593 tests /
44 files passing, including `read-only.test.ts`; production build clean from
PowerShell (mobile chunk **93.58 kB** + 7.48 kB CSS, desktop unchanged at
1,409.71 kB — no animation runtime pulled in).

Driven in a real browser:

- **Transitions** instrumented, not eyeballed: forward/back/lateral resolved
  correctly, all four shared names present at snapshot, `data-m-nav` and every
  name cleaned up on finish.
- **Both bugs proven fixed**: the mark is in the mobile header, and overriding
  `data-time-band` between `morning` and `night` visibly changes the canvas.
- **Boot splash**: plays once, not again after navigation or reload in the
  same session; with the API blocked outright it still dismissed at ~2.8s
  after mount, so a dead network cannot trap the user.
- **Seeded loading** verified under 600ms latency on both Deals and Memory.
- **Reduced motion**: no splash, no reveals registered, zero view transitions,
  no count-up; every screen fully usable.
- **375 / 390 / 430 px in both themes**: no horizontal overflow anywhere.
- **4× CPU throttle**: median frame 17ms scrolling the deal screen and
  dragging the scrubber, one frame over 32ms across the whole scroll. Stacked
  `backdrop-filter` is not costing frames.
- **Desktop at 1440px** (`/`, `/deals/:id`, `/settings`): unchanged, no mobile
  shell or splash leaking in, no console errors.

## 8. Bug found on the way

`score-section.tsx` keyed its breakdown rows by label, and `readBreakdown`
falls back to `"Other"` for any factor the server sends without a string
label — two of those collide. It was latent because the section body only
rendered while open; mounting bodies for the height animation surfaced it as
24 React key warnings. Keyed by position now.

## 9. Not done

- **iOS splash screens** still need `@vite-pwa/assets-generator` (carried over
  from Phase 1).
- **Manifest shortcuts are unverified on a real device.** iOS home-screen web
  app support for `shortcuts` is inconsistent; the manifest is correct and the
  target route works, which is as far as this host can check.
