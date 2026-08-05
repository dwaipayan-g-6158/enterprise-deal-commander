# Mobile PWA — Finishing the Reset

**Date:** 2026-08-06
**Branch:** `feat/mobile-finish-reset` (6 commits, cut from `feat/mobile-design-system`)
**Baseline:** `b7cc504`

The design-system reset stopped at the shell's edge. Three surfaces never got
it, two of the shell's own defects were visible on screen, and some capability
had been built and never wired. This is the sweep-up, and like the round before
it, everything here came from driving the running app rather than reading it.

Worth stating up front, because it inverted the expectation: **the PWA
infrastructure was already in good shape.** Runtime caching per bucket with a
sign-out purge, a service-worker update prompt, manifest shortcuts, icon
badging, an offline banner, fonts cached for an offline cold launch. Nothing to
add there. The gaps were all above it.

---

## 1. Sign-in

The first screen every user sees, and the pre-reset design in miniature:
monospace on the only two fields anyone types into, `IDENTIFICATION` and
`PASSCODE` in tracked capitals, "Initialize Session" on the button, 44px
targets against the shell's 48px floor, no safe-area padding, `min-h-screen`
rather than `dvh`.

Plain words now. The credential is labelled **"Email or username"**, not
"Email": the field maps to `commanders.username` matched case-insensitively, so
an address works because usernames look like one, not because the server checks
a mail field. "Email" alone would be a promise the API doesn't keep. The
failure message says what to do rather than reporting `Authentication failed`,
and the 10px tracked `EDC · CONFIDENTIAL / INTERNAL USE ONLY` band is replaced
by the one fact in it a reader could act on.

The lockup above the card is untouched. A wordmark is allowed to be uppercase —
it is a logotype, not a label.

The mechanical half only shows up on a device: `100dvh`, safe-area insets on
all four sides, 48px targets. The route is wrapped in a bare `.m-shell` on
mobile so the page inherits the shell's palette and radius — the mechanism
`SectionSheet` already uses for vaul's portalled drawer. Desktop renders the
same component from its own tree and gets the type, target and viewport fixes
without the mobile tokens.

## 2. The offline notice, and the 404

**The offline banner cut through the Commander capsule** — banner at y 756–788,
capsule at 720–776, a measured 20px overlap. It is pinned to the bottom of the
viewport, and the bottom of a phone is the busiest part of it; it already wore
a `max-md:` offset to clear the tab bar and still hit the capsule. Desktop-only
now, with the hack gone.

Below `md` the same words come from a strip inside `MobileHeader`. **Inside,
not above**, for two reasons that both bite: the header already owns `pt-safe`,
so a sibling strip would double the status-bar inset or have to negotiate for
it; and the header carries `m-vt-header`, which lifts it out of the route
transition's snapshot — a strip outside that name would slide away with the
content on every navigation.

**The 404 was painted in hardcoded greys**, so a dark-mode reader who mistyped
a URL got a white page with near-black text. Tokens fix it on both shells, and
it is rebuilt on `Empty` so a wrong address and an empty list look like the
same product.

## 3. The deal screen

**The nav bar said exactly what the hero said, 8px lower** — "Project Cobalt /
Umbrella Holdings" twice, ~56px of an 852px screen. The title now arrives as
the hero leaves, over the same 72px `.m-header-lift` already uses for the
header's shadow, so the bar gains its title and its lift as one movement.

**The polarity is the whole risk, and it is set by what the class does without
the rule: nothing.** The resting state is plain visible; only the scroll-driven
block hides it near the top. The three cases where the animation never applies
— a container too short to scroll, reduced motion, no `animation-timeline` —
therefore all fall through to a visible title. Written the other way round,
every one of them would lose the title for good. All three measured: a
non-scrollable container reports the animation with a null `currentTime` and
opacity 1.

Only the text fades. The chevron holds still, and the `<h1>` is never removed
from the tree — invisible, not absent.

**Memory detail deliberately does not get this**, though the plan said it
would. Its hero shows the outcome, the value and the archive date; the deal
name appears only in the bar, so collapsing it would hide the one thing
identifying the record.

**Risk opens on arrival.** Seven shut doors is what the screen used to be.

## 4. The drill-down that could not be honest

`StatTile` carried an `onPress` prop with a `<button>` branch and no caller
anywhere. The obvious fix was to wire the drill-down it had clearly been built
for — "Red alerts: 1" to the Deals screen's Critical filter, a route the
installed app's home-screen shortcut already depends on.

So it was wired, tapped, and landed on **"Nothing in this filter"**. The tile
counts *alerts*; the filter matches *deals whose health is RED*. Different
units, and on the seed data 1 and 0 — one red alert on an amber-health deal. A
figure that promises a list and delivers an empty one is worse than one that
promises nothing, so the prop is deleted rather than connected. The alert it
counts is already named, with its deal, in the Critical alerts card two hundred
pixels below.

Memory gained pull-to-refresh, which the other three tabs have had since they
shipped.

## 5. The palette

Six known AA failures were carried over from the last round. Measuring properly
found **nineteen**.

The previous audit sampled the DOM, so it only ever saw MODERATE and YELLOW —
the two levels the seed data happened to render. This one imports the maps from
the dev server and paints every level on every surface it is used on: the
desktop canvas, a card, its own tint, the heatmap cell, and the solid badges.

The whole risk ramp was under AA on white: sky 3.66, amber 2.91, orange 3.27,
red 4.34. The file's own header already recorded why (`-600` chromatic text
fails on white) and had already moved `HEALTH_CLASS` to `-700`; it was never
carried across to the risk ramp. **Rule 6** now: light text `-700`, heatmap cell
text `-800`, tints `/8` — amber `/6`, yellow's text `-800`.

Two judgement calls:

- **Amber was last to clear and darkening it was rejected.** `amber-800`'s
  luminance (0.098) drops below `orange-700` (0.151) and `red-700` (0.114),
  which would make MODERATE the visually heaviest level on a ramp where HIGH
  has to be. Lightening its tint bought the same margin for nothing.
- **OUTCOME is exempt from the `-700` floor, measured rather than assumed.**
  Slate is neutral, so `slate-600` already reads 7.26 on a card and 6.05 on its
  own tint.

The existing tests were written to assert *hue*, not shade, so bumping shades
kept every one green by construction. 25 new cases pin the floors.

---

## 6. Three things this got wrong first

**The sweep that called itself exhaustive missed a map.**
`HEALTH_BADGE_CLASS.GREEN` is white on `emerald-600` — 3.65:1 — and it is the
"Healthy" chip on every roster card. It escaped because a solid badge carries
its own fill and so lives in a different map from the tinted `text`/`bg` pairs.
Auditing "the palette" has to mean every map in the file, not every map you
remembered.

**A palette can be provably correct in isolation and still fail on a screen.**
After the token harness reported zero, driving the six mobile screens left one
pair short — "Moderate" at 4.47. The harness measures against a card, which is
pure white; the deal hero puts its pills on the mobile canvas, which is a hair
off white with an ambient wash over it. Both harnesses are needed: the token one
to reach levels no fixture renders, the DOM one to catch the surfaces the token
one had to assume.

**The unit test's first version was wrong in a way the browser wasn't.** A
blanket "`-700` or darker" floor failed `OUTCOME.lost` at `slate-600` — which
measures 7.26 and is entirely fine, because a neutral has no chroma to pay for.
The rule had to be scoped to the chromatic ramps and the exemption evidenced.

## 7. Verification

`pnpm run typecheck` clean. **618 tests / 44 files** (593 + 25 new AA cases),
including `read-only.test.ts`. Production build clean from PowerShell; mobile
chunk 93.55 kB, desktop 1,392.16 kB.

- **Token audit** (`palette.js`): 38 pairs across three class maps and both
  badge maps, both themes — **zero failures**. Tightest 4.54.
- **DOM audit** (`audit.js`): six screens × two themes — **zero failures**,
  **zero Geist Mono**, six prose styles per screen.
- **Collapsing title** instrumented, not eyeballed: opacity 0 at scrollTop 0,
  0.5 at 40px, 1 at 200px; **1** under reduced motion and **1** in a
  non-scrollable container.
- **Offline**: strip inside the header at y 64–90, no collision with the
  capsule or tab bar; desktop keeps its bottom banner at 1440px.
- **Sign-in** at 393 / 1440: no monospace anywhere on the page, 48px inputs and
  button, sentence-case labels, no vertical overflow.
- **Desktop sweep** across all eight routes at 1440px: every route renders, no
  console errors, badges painting from the new shades on the dashboard, roster
  and portfolio heatmap.

## 8. Not done

- **Dynamic Type is still unverified on a device.** Playwright cannot emulate
  the iOS text-size setting. The no-op path is confirmed: on a non-Apple engine
  the probe is guarded and `--m-type-scale` stays exactly `1`.
- **Offline is not announced on sign-in or the 404**, the two screens outside
  `MobileHeader`. Auth must reach the network by design — the service worker
  deliberately never serves `/api/v1/auth/` — so a sign-in attempt while offline
  fails with its own message, and a 404 has nothing for a stale cache to be
  stale about.
- **iOS splash screens** still need `@vite-pwa/assets-generator`, and manifest
  shortcuts remain unverified on a real device. Both carried from Phase 2.
