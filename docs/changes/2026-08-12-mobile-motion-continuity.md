# Mobile PWA — Continuity: the Launch, the Morph, and the Live Values

**Date:** 2026-08-12
**Branch:** `feat/mobile-motion-continuity` (6 commits, cut from `main`)
**Baseline:** `a442a67`

Phase 5 made the app information-complete on a phone. What it was not yet was
*continuous* — it had seams where a native app has movement, and this closes
five of them. The brief was "surreal", and the example given was Dynamic Island.

**Dynamic Island is not reachable from a PWA.** It is ActivityKit — native
Swift, Live Activities — and Safari exposes no web API for it. What *is*
reachable is the thing it actually does: one persistent surface that changes
shape to report what the app is doing. §3 is that, built from parts EDC already
had scattered across three components.

`styles/motion.css` says: *"Five kinds of motion, and there is no sixth. Anything
that does not fit one of those is decoration and does not ship."* Nothing here
needed a sixth. A value changing, a fill catching up, a capsule reshaping and a
tint moving are all STATE.

---

## 1. The launch

`apple-touch-startup-image` had been deferred across **all five** prior mobile
phases, so a cold launch painted flat white until the bundle booted — in dark
mode too.

**76 images**: 19 devices × portrait/landscape × light/dark, written by
`scripts/generate-splash.mjs`, which also rewrites the link block in
`index.html` between markers. Seventy-six hand-maintained links would disagree
with the files on disk inside a week.

Two decisions that are the substance rather than the packaging:

**They carry no logo.** The frame that replaces the launch image is
`BootSplash`'s first, where the mark sits at the start of its draw-in and the
wordmark is at `opacity: 0`. A launch image with a logo on it would cut to a
logo that then draws itself in from nothing — a worse seam than the colour one
it was meant to remove. Apple's own guidance arrives at the same place from the
other direction: a launch screen approximates the first screen, it is not a
brand splash. So it is the flat canvas, read from the `--background` token
rather than typed.

**They are 1-bit palette PNGs.** The colour lives in `PLTE` and every pixel is
index 0, so the entire pixel stream — filter bytes included — is zeroes.
Measured across the set: **35.5 KB against 931.7 KB** for identical output
pixels, largest single file 779 bytes. Truecolour was the obvious first attempt
and it is 26× larger, because LZ77 caps a match at 258 bytes and a 2048-wide
flat row still costs two dozen tokens either way. No image library, no native
postinstall, and a public repo that gains 35 KB instead of a megabyte.

The remaining seam is closed from the other side. `.m-boot` used to borrow
`.m-shell` and therefore wore the full time-of-day sky from frame one; a static
PNG cannot know the hour. Now the splash starts on exactly what the PNG shows
and a `.m-boot-sky` layer fades the identical gradient stack in over it — so
there is nothing to cover up, because both surfaces begin on the same colour.

That needed the wash to be addressable, which it was not: the three gradients
were written inline on `.m-shell`. They are `--m-sky-image` now. As a
consequence `prefers-contrast: more` nulls the **token** rather than
`background-image`, which — custom properties inheriting — means it now reaches
every consumer of the sky instead of only `.m-shell` itself.

## 2. Colour, honestly

The PNG shows the neutral canvas; the app's canvas shifts by band. Measured, the
worst case is a difference of about 5/255 per channel between the neutral base
and a band base (both sit at 96–97% lightness in light mode, 5–6% in dark). It is
below the threshold of noticing during a sub-100ms handoff, and it is the reason
the sky *blooms* rather than being baked in.

## 3. The live capsule

`OfflineStrip` could report one binary. Nothing anywhere told you a write was in
flight: a tap flipped a control optimistically and the app went silent until —
and unless — it failed. That gap is worse than it sounds on current iOS, because
`lib/haptics.ts` has been a **documented no-op since 26.5**, so the confirmation
the write layer fires beside every success reaches nobody.

`MLiveCapsule` takes the same slot inside `MNavBar` and reports **offline,
saving, saved**, morphing between them. The state machine is pure and
clock-injected (`shell/live-status.ts`), so every boundary is a test rather than
a timer.

**Offline outranks saving, and that is a correctness rule.**
`MOBILE_WRITE_OPTIONS` sets `networkMode: "always"` precisely so an offline write
*rejects* instead of queueing; "Saving…" over a dead connection would promise the
queue-and-retry behaviour the write layer refuses to implement.

**"Saved" comes from a new `noteSaved()`**, called beside the success-path haptic
in all five places, never from `end` — which runs in a `finally` and fires just
as readily for a write that failed. A confirmation derived from `end` would
announce "Saved" over a rolled-back optimistic patch.

### What it deliberately does not absorb

The plan said this would swallow three surfaces. Reading them, two of those were
already right and said so:

- **A failed write stays in `WriteErrorInline`**, under the control that failed.
  Hoisting it would leave the reader looking at a control whose state is now a
  lie with the explanation elsewhere on screen — the exact reason that component
  is not a toast.
- **The undo offer stays bottom-anchored in `UndoBar`.** It is an action needing
  a thumb, not a status, and `undo.ts` clears it on navigation on purpose: "an
  undo bar that outlives the screen it belongs to offers to reverse something the
  reader can no longer see."

Only `offline` carries a fill. `saving` and `saved` paint onto the bar's glass
with `--muted-foreground` and `--primary`, two of the three foregrounds
`tokens.test.ts` already measures composited over glass — a new tinted chrome
surface would mean a new pair to audit for the sake of two words.

The spinner is **removed** under reduced motion rather than slowed: the global
clamp sets `animation-iteration-count: 1`, which turns an infinite spin into one
instant pop. Nothing is lost, because the strip says "Saving…" in words.

## 4. The morph, both ways — and the chevron

`shared-card.ts` was forward-only and its comment named a real reason: the list
remounted at the top of its scroll, so the card the hero would fly to was often
nowhere near where it was tapped. `scroll-memory.ts` removed that, and its own
header already recorded that restoring scroll *"is what makes the reverse morph
possible at all."*

The two directions mirror each other rather than sharing a path, because which
side React controls is reversed. Forward: the leaving card is stamped from the
`Link`'s `onClick`, the arriving screen reads the store inside `flushSync`.
Backward: the leaving hero is stamped from the navigation handler, the arriving
list's cards read the store the same way.

**Armed from both back paths**, which are genuinely different code — `aroundNav`
sees programmatic navigations only, while a hardware back or an iOS edge swipe
arrives as `popstate` in `back-gesture.ts`. In `back-gesture` it is armed *after*
the stand-down checks: under reduced motion, without view transitions, or while
Chromium drives its own predictive-back preview there is no transition to attach
a morph to, and stamping there would leave names on an element nothing clears.

The guard is `hasRememberedScroll` — a screen never left cannot be holding a card
where the hero would land. It is a proxy for a warm cache, **not a proof**: a
cache evicted while the app sat in the background would pass it and still render
a shimmer, degrading to a lone fade. Accepted rather than threading the query
client through two navigation handlers.

### The bug that blocked all of it

**The back chevron was pushing.** It is a wouter `<Link>`, so it went through
`pushState` with index+1 — meaning the journey back to a list was animated as a
*forward push*, the outgoing screen sliding left and the list arriving from the
right, which is the choreography for going deeper. Worse, the pushed entry meant
the OS back button then returned you *into* the detail screen you had just left,
so hardware back and the chevron walked in opposite directions forever.

It pops now when there is an in-app entry behind it (`canPopWithinApp`), and
keeps its `href` as the fallback for a deep link or a home-screen shortcut, where
there is nothing to pop to. The chevron and the edge swipe are one code path,
which is right — they are the same intent. One fix, 22 `backHref` call sites.

## 5. Values that move from where they were

Nothing in the shell held a previous value, so every animated figure was an
entrance and never a delta: `CountUp` ramped from a hard-coded zero, and a
pipeline going from $3.1M to $3.4M counted up from nothing exactly as if it had
just been created. Motion carrying no information is decoration.

`lib/previous-values.ts` is the missing half. `rampFrom` distinguishes three
cases and the middle one is why it is a function rather than a `?? 0`: **unseen**
ramps from zero, **unchanged** does not ramp at all, **changed** ramps from where
it was — so the ramp's length is the size of the move and its direction is the
sign of it. That also subsumes the old `once` flag, which existed to stop a tab
switch replaying the entrance, without suppressing the deltas that are the point.

Four surfaces gained a finite transition, each one where a **write** changes the
value rather than anywhere a number happens to appear: `m-ring`'s segments
(finally using the "one animatable property per segment" the shape was drawn with
`stroke-dasharray` to get), the gate and playbook fills, the roster card's gate
hairline, and the health/risk/stage-rail tints.

All transitions, never animations: the global reduced-motion clamp zeroes a
transition duration, which lands the element on its destination instantly. That
is the correct answer here, and it is why none of these need the explicit guard
`.m-spin` does. **Shade values are untouched** — `lib/semantic-colors.ts` remains
their single tested source, rule 6 and all.

## 6. Ambient presence — smaller than scoped, and why

Two of the four things this was scoped for **already shipped**, and the honest
report is that they did:

- `shell/m-theme-color.tsx` already tracks the time band correctly, reading the
  `--background` *token* rather than `getComputedStyle().backgroundColor`, which
  during a theme switch is the interpolated in-flight value. Verified, not
  rebuilt.
- The icon badge survived Phase 5 intact.

Two real gaps remained. `syncBadge` ran in an effect on the Command screen, so
the count froze the moment you switched tabs — an ambient signal that only
updates while you are looking at the screen it summarises is not ambient.
`MAppBadge` moves it into the shell and costs **no requests**: `enabled: false`
stops the hook fetching while leaving the observer subscribed to the cache, so it
mirrors whatever Command has already loaded. Before Home has been visited once
there is nothing cached and nothing to publish, which is right — a badge invented
from no data is worse than a stale one.

And the opt-in row moved from the Commander sheet to `/account`. Its outcome is
reported in the row's own subtitle rather than in a toast, because `<Toaster/>`
renders outside `.m-shell` and paints desktop tokens on a phone. **That was the
last `use-toast` import under `src/mobile/`.**

**Deferred, with the reason:** crossfading the wash at a band boundary.
`background-image` cannot transition, so it needs a second sky layer inside the
shell's fixed frame — touching the stacking context, the one place a mistake
tints every card in the scroller. The band changes four times a day and nobody is
watching when it snaps.

## 7. Two things this got wrong first

**The plan said the capsule would absorb three surfaces.** Two of those had
already been argued the other way, in the files themselves, correctly. Reading
`undo.ts` and `write-error-inline.tsx` before writing the capsule turned a
consolidation into a smaller and better change — the capsule replaces one
component and adds two states nothing had.

**The first ordering guard passed against a deliberately broken
implementation.** `armSharedReturn` must run before `runTransition`, and the test
located the call with `indexOf` — which finds the *first* one, so a correct early
arm plus a stray late one satisfied a position check while doing the wrong thing.
It counts calls as well as locating them now. `scroll-memory.test.ts` records the
same trap one line away; I read it and still wrote it the weak way.

## 8. A defect this surfaced but did not cause — now fixed

**A successful write visibly bounced back.** Driving a real gate toggle on the
deployed app: the optimistic patch moved the fill 56% → 67%, the capsule said
*Saving…* then *Saved*, and the fill then slid **back to 56%** with the gate
un-ticked. The `PUT` returned **200**, so the capsule was telling the truth and
the write did land.

**The first diagnosis in this document was wrong, and is corrected here.** It
blamed `invalidate.ts` refetching into the Data Store's documented ~1–2s read
lag. Measured, there is no lag on this path: the `PUT`'s own response carries
the new value, the first uncached `GET` agrees **203ms** later, `/intelligence`
agrees too and holds for 12s, and the per-request read cache in `sdk.ts` is
correctly invalidated on every write path. The server was never stale.

**The real cause was the service worker.** `edc-api-reads` used
`StaleWhileRevalidate`, which answers from cache and revalidates behind it —
exactly wrong for the read that follows a write. Asked twice at the same
instant, plainly and with a cache-buster:

| moment | plain URL | cache-busted |
|---|---|---|
| before the write | `false` | `false` |
| **immediately after** | **`false`** | **`true`** |
| 1.5s later | `true` | `true` |

React Query committed the stale body and had no reason to fetch again; the
revalidation landed too late to matter. It affected **every write in the app, on
both shells** — anything that writes and then reads its own change.

Fixed in `fix/sw-stale-reads-revert-writes`: `NetworkFirst` with a 3s timeout,
which keeps the offline story whole (a rejected fetch falls straight through to
cache) and gives up only the instant paint from cache while *online* — which
costs little, because React Query's in-memory cache already covers repeat views
within a session. The lookups bucket deliberately stays `StaleWhileRevalidate`:
nothing in this app authors a stage or a gate definition, so there is no
write-then-read-your-own-write to get wrong there.
`service-worker-caching.test.ts` pins it and fails closed.

Re-verified after deploying the fix: the gate now **sticks** — `Saving…` →
`Saved`, fill holds at 67%, plain and cache-busted reads agree immediately. Seed
data restored either way; `G3_INTEGRATIONS_MAPPED` is `false`, as it started.

## 9. Verification

`pnpm run typecheck` clean. **1,188 tests / 82 files** (1,166 at baseline; adds
`splash`, `shared-card`, `previous-values`, `live-status`, plus a case in
`tokens`). Production build clean from PowerShell; mobile chunk **235.27 kB** +
15.26 kB CSS. AppSail bundle 3.41 MB.

Guards verified to **fail closed** by planting violations, not by inspection:

- retuning `--background` without regenerating → 38 splash cases red
- changing one device's geometry → 5 red
- `prefers-contrast: more` reverted to killing the property → tokens suite red
- `armSharedReturn` moved after `runTransition` → position assertion red
- `armSharedReturn` duplicated late → count assertion red

Static checks: 76 images ship, **0 precached** (iOS reads them from the OS before
a service worker exists, so manifest entries would be unreachable by fetch), 76
links in the built `index.html` with root-absolute hrefs. Two PNGs decoded in a
real browser — correct dimensions, uniform fill, exact expected colours.

### On the deployed app

Deployed twice via the Catalyst Console, each time asserting the **served bundle
hash** rather than a 200. That mattered both times: the first check read
`mobile-app-EoFdM3Nh.css` (the previous build) because the service worker was
replaying it, and a later one read a stale `index.html` from the browser's own
disk cache. Neither was a deploy failure — ten consecutive server fetches were
consistent, and the superseded asset had stopped existing entirely.

- **All 76 launch images serve as real PNGs.** Asserted on `content-type` and
  size, not status: the SPA catch-all returns `200 text/html` for any invented
  filename, which is exactly how a missing asset was once reported as present. A
  made-up name was used as the control and does return HTML.
- **`--m-sky-image` resolves on the shell, and `.m-boot-sky`'s computed
  `background-image` is byte-identical to it** — the actual proof the bloom shows
  the same sky rather than a similar one. `.m-boot.m-shell` is `none`.
- **`prefers-contrast: more` nulls the token and the sky disappears from BOTH**
  the shell and the boot layer. Killing `background-image` instead would have
  left the boot layer painting.
- **Reduced motion**: `.m-spin` → `animation: none` (removed, not clamped to a
  single pop); `.m-fill` → duration `1e-05s`, i.e. lands instantly.
- **The live capsule, driven for real**: idle 0px and empty; offline 26px with
  the right copy; and across a real gate toggle — `Saving…` → `Saved` → collapsed
  at ~1.8s, with `.m-fill` moving 56% → 67% underneath it.
- **The reverse morph, instrumented at the snapshot** rather than eyeballed.
  Forward: `data-m-nav="forward"`, names on `a / p / span / span` (the card).
  Back: `data-m-nav="back"`, names on `header / p / h1 / p` (the hero).
- **The chevron pops**: `/deals` idx 1 → deal idx 2 → chevron → **idx 1**. Before
  this change it went to 3.
- **Sweep**: 5 routes × 3 widths (375/393/430) × 2 themes = 30 combinations, zero
  horizontal overflow, all rendered. The `/deals` "offenders" are chips inside
  their own horizontal scroller, which is the documented false positive.
- **`/account`** carries the relocated badge row with its permission copy intact.

## 10. Not verified on this host

- **The iOS launch images themselves.** The files exist, the media queries are
  exhaustive per device and colour scheme, the tags are well-formed and the
  bytes decode — none of which proves iOS picks them. Needs hardware.
- **iOS edge-swipe** and Android predictive back, for the same reason. The
  committed-pop path they share with the chevron *is* verified.
- **Scroll restoration under the reverse morph.** The seeded dataset is three
  deals, so the list fits an 852px viewport (`scrollHeight === clientHeight`) and
  there is no scroll to restore. The morph was verified without it; the two
  together need a longer list.
- **`/pwa-review`** was not re-run this phase. The last score was 136/192 (B).
