# Mobile search flicker, and a fade for content arriving late

Two reported problems on the installed PWA, and they turn out to share a theme:
the shell animates the wrong moments. Typing in the Deals search animates when it
should be still, and data landing after a tab switch is still when it should
animate.

Scope is the mobile shell only — everything under `artifacts/edc/src/mobile/**`,
plus one shared hook under `components/roster/`. The desktop cockpit is not
restyled, though it inherits one strict improvement (see Fix B).

---

## Problem 1 — the Deals search bar flickers on every letter

### What was reported

> While searching deals in Deals, the "Deal, account, competitor" search bar
> looks janky and flickers after every letter I type.

### Two independent causes

Both are visible on one keystroke and compound into a single perceived flicker.

**Cause 1 — every settled keystroke runs a full-screen view transition.**

`useRosterUrl.setSearch` (`mobile/screens/deals/use-roster-url.ts:100`) writes the
term into the address with `navigate(..., { replace: true })`. That call passes
through `aroundNav`, and `isLateralMove` returns `"lateral"` for any change of
query on the path you are already on — so `runTransition` calls
`document.startViewTransition` and the root cross-fades under
`m-lateral-out` / `m-lateral-in` (`mobile/styles/motion.css:161`).

The nav bar, tab bar and Commander capsule each hold their own
`view-transition-name` and so sit out the root snapshot. **The docked search bar
does not.** The result is that the field being typed into fades to nothing, rises
6px, and fades back — 200ms out, 200ms in, once per settled keystroke.

**Cause 2 — the list tears itself down to shimmer between letters.**

`useRosterData` (`components/roster/hooks/use-roster-data.ts:18`) puts `search`
into the React Query key and sets no `placeholderData`. A new key is a new query
with no cached data, so `isLoading` is `true`: the list is replaced by five
`Shimmer` blocks, the nav subtitle blanks (it is gated on `isLoading`), and
"No matches" can flash for a term that is merely half-typed.

### Why this diagnosis is trustworthy

The Memory screen is the control. It has the identical docked-search UI and does
not flicker, and it differs in exactly these two respects:

- it sets `placeholderData: keepPreviousData`, with a comment
  (`mobile/screens/memory/memory-screen.tsx:104`) describing Cause 2 verbatim —
  "every settled keystroke is a brand-new query key, and a brand-new key means
  isLoading — which tears the whole result list down to shimmer between each
  character";
- it holds its query in component state, so it never writes the URL and never
  triggers Cause 1.

Deals has neither mitigation. Memory has one of them and lacks the trigger for
the other.

### Fix A — a replace on the path you are already on does not animate

New pure predicate in `mobile/nav/mobile-nav.ts`, beside `isLateralMove`:

```ts
export function isQuietMove(fromPath: string, toPath: string, replace: boolean): boolean {
  return replace && pathnameOf(fromPath) === pathnameOf(toPath);
}
```

This is a design statement, not an optimisation. A **push** carrying a new query
is a discrete act the reader chose — a filter, a sort, a saved view — and
cross-fading it is correct and stays. A **replace** on the path already underfoot
is a continuous adjustment of the list in front of them, and continuous
adjustments do not animate.

`replace` is the discriminator rather than "same path", because filter, sort and
group changes deliberately push (`use-roster-url.ts` documents why: so the back
gesture undoes them) and must keep their cross-fade.

The shell has exactly two replace call sites, both grep-verified:

| Call site | Paths | Verdict |
| --- | --- | --- |
| `setSearch` (Deals) | `/deals` → `/deals?q=…` | same path → **quiet** |
| `MSegmented` (Intelligence lenses) | `/analytics` → `/portfolio` | different path → still cross-fades |

So nothing but typing changes behaviour.

`runTransition` (`mobile/lib/nav-transition.ts:62`) gains a `quiet` flag. When
set it takes the no-transition path it already has for reduced motion —
`update(); afterCommit?.()` — and does not set `data-m-nav` at all. `aroundNav`
computes `quiet` from `isQuietMove` and passes it through.

**`aroundNav` must not reuse the existing `options.transition === false` route.**
That branch returns early and skips `stampIndex`, so the replaced history entry
loses its `__mIndex`. `currentIndex()` then falls back to `0`
(`mobile/lib/history-index.ts:60`), `canPopWithinApp()` reports `false`, and the
back chevron disappears from every screen reached from a searched list. The quiet
path must keep all three pieces of bookkeeping — `rememberScroll`, `stampIndex`,
`noteNavigation` — and only drop the animation. This is the one regression the
work can plausibly introduce, so it gets a dedicated test.

A second benefit falls out: skipping `startViewTransition` also skips its
`flushSync`, which removes a synchronous commit of the whole card list from every
keystroke.

### Fix B — hold the previous results while the next ones load

Add `placeholderData: keepPreviousData` to the `useListDeals` query in
`use-roster-data.ts`, with a comment pointing at the Memory precedent rather than
re-deriving the reasoning.

`useGetRosterEnrichment` takes no params, so its key never changes and it needs
nothing.

This also fixes the subtitle blink and the premature "No matches" for free, since
both are gated on `isLoading`.

**Desktop blast radius, deliberately accepted.** `pages/deals.tsx:134` shares the
hook and already renders `· updating…` gated on `isFetching` (line 596) — a hint
that currently never appears during a search, because the list is torn down to
`isLoading` instead. Adding `keepPreviousData` is what makes that existing
affordance work as it was written to. No desktop markup changes.

### Fix C — raise the debounce to 350ms

`SEARCH_DEBOUNCE_MS` goes 280 → 350 (`mobile/screens/deals/deals-screen.tsx:25`).

This is about backend load, not the flicker, which A and B remove on their own.
Each settled keystroke is a 500-row Data Store read; Catalyst enforces a hard
concurrency limit whose 429 surfaces as a fast 500, and read lag is ~1–2s anyway,
so 70ms more is imperceptible to the reader and materially fewer requests.

### Fix D — the dock joins the rest of the chrome

Give the portalled dock a `view-transition-name` (`m-dock`, via a `.m-vt-dock`
class in `motion.css` beside `.m-vt-navbar` / `.m-vt-tabbar` / `.m-vt-capsule`)
so it holds still through a genuine route change instead of being dragged along
in the root snapshot. Memory ↔ Deals currently fades out a bar and fades in a
visually identical one.

The class goes in `MDock`'s own `cn()` call, never in a caller's `className` —
same rule the component already states for `position`, so that a screen edit
cannot quietly drop it.

Only one dock is ever in the real DOM at a time — the outgoing screen is a
snapshot — so a single shared name cannot collide, which is the failure mode
`motion.css:206` warns about ("two elements sharing one silently disables the
transition for both").

### Explicitly not changing

- **Search stays in the URL.** It is what makes a filtered list shareable and the
  back gesture able to undo it.
- **Search stays server-side.** The API owns matching and returns `matchedIn`;
  reimplementing it client-side would be the phone-and-laptop divergence
  `useRosterData` exists to prevent.
- **No "refreshing" spinner.** Memory sets the precedent of updating in place,
  and desktop already has `· updating…` for the case where a hint is wanted.

---

## Problem 2 — content arrives with a hard cut

### What was reported

> While populating the contents during switching from Command to Deals tab etc.,
> use fade in or any other subtle way to show the information being populated
> globally in the PWA app.

### Why it currently cuts

A tab switch cross-fades correctly, but the snapshot it takes is of the screen's
**loading** state, because the data has not arrived yet. When it does, the
skeleton is replaced with no transition whatsoever.

Cards carry `.m-reveal`, which is scroll-driven — and its own doc note explains
why it cannot help here: "cards already on screen at load are past the end of
their range and render normally." Everything above the fold, which is everything
the reader is looking at, hard-cuts.

`.m-appear` (`motion.css:335`) is already the right primitive, documented as
"content replacing its own skeleton. Short enough to read as the skeleton
dissolving rather than as a second load." It is used in three files. This work
makes it the shell-wide convention.

### The animation

`.m-appear` is used **unchanged**: `opacity` 0→1, `translate` `0 4px`→`none`,
`var(--m-dur-quick)` (200ms), `var(--m-ease-enter)`, `both`. No stagger — a
per-item delay lands the last row of a long list ~400ms late, which reads slower
than it is, and it would need an index prop on every list.

### The rule, and where it lives

New pure module `mobile/lib/appear.ts`:

```ts
/** Whether a settled render should fade its content in. */
export function appearsOnSettle(everLoaded: boolean, loading: boolean): boolean {
  return everLoaded && !loading;
}
```

and a thin ref wrapper `mobile/hooks/use-appear-on-settle.ts` returning
`"m-appear"` or `undefined`.

The class applies **only on a `loading → settled` edge**. A screen whose very
first render is already settled from a warm cache gets `undefined`, because there
the route transition is already animating the arrival and a second animation on
top of it is exactly the "second load" reading `.m-appear` exists to avoid.

No `key` juggling is needed to replay the animation: the content subtree is
genuinely newly-mounted on that edge (the skeletons unmount), and a CSS animation
runs on insertion.

The logic is a pure function because `vitest.config.ts` sets
`environment: "node"` and `include: ["src/**/*.test.ts"]` — this package has no
React-rendering tests, so anything that must be verified has to be pure or
grep-asserted.

### Rollout

**One shared component covers sixteen screens.** `PanelBody`
(`mobile/screens/deal/panel-screen.tsx:100`) already owns the
error → loading → empty → content ladder for all sixteen deal panels, for the
reason its doc gives: "sixteen panels each hand-rolling a shimmer, an error and
an empty state is sixteen chances for them to disagree." One edit there is
sixteen screens.

**The remaining screens wrap their content branch.** Fourteen files:
`deals-screen`, `memory-screen`, `command-screen` (partly done — `PulseBlock` and
`VerdictBlock` already use `.m-appear`), `pipeline-screen`, `flow-screen`,
`portfolio-screen`, `portfolio-alerts-screen`, `losses-screen`,
`loss-detail-screen`, `lens-screens`, `memory-detail-screen`,
`memory-panel-screen`, `compare-screen`, `settings-screen`.

Error and empty states are left alone. They are destinations, not populations.

### Three traps, each of which fails silently

1. **Never on an element carrying a `view-transition-name`.** The shared-card
   morph target would start at `opacity: 0` and the browser would animate the
   hero out into nothing — the failure `lib/shared-card.ts:145` already
   describes for the shimmer case. In practice the deal-brief and memory-detail
   heroes render immediately from the `SharedCardSeed` and are never inside the
   loading branch, so only the content below the hero is wrapped. The rule is
   written down anyway.

2. **Never on first-mount-already-settled.** Doubles up with the route
   transition. This is what `appearsOnSettle` exists to encode.

3. **Reduced motion needs no guard here.** `.m-appear` is finite and uses `both`,
   so the global clamp lands it on its end state. This is unlike `.m-spin`, which
   had to be removed outright because the clamp turns an infinite animation into
   one instant pop rather than a slow one.

A fourth, checked and benign: `.m-appear` on a container of `.m-reveal` cards
multiplies two opacities, but cards in view are past their range at 1 and cards
below the fold are at 0 regardless. Nothing to do.

---

## Tests

Every one is a node-environment `.test.ts`, matching what this package can run.

| Test | Asserts |
| --- | --- |
| `mobile-nav.test.ts` (extend) | `isQuietMove` truth table: same path + replace → true; same path + push → false; different path + replace (the lens switch) → false; query/hash stripped before comparison. |
| `nav-transition` index stamping | A quiet navigation still stamps `__mIndex`. This is the guard against reaching for `transition: false`, which would break the back chevron. |
| `appear.test.ts` | `appearsOnSettle` truth table, including the first-render-already-settled case. |
| appear-coverage grep test | Every screen under `mobile/screens/**` that renders a loading branch applies the appear class to its content branch. Modelled on `panel-loading-gate.test.ts`, and for the same reason: it is what stops screen #27 from forgetting. |

## Verification

Typecheck and the full suite, then drive the running app per the
`Deal-Commander:verify` skill. Two things must be confirmed in a browser and
cannot be confirmed by tests:

- typing in the Deals search produces **no** visible fade on the field or the
  list, and the results update in place;
- switching Command → Deals fades the content in once when it lands, and the
  deal-card → brief-hero morph still runs.

Assert the bundle hash before trusting either observation — the service worker
has replayed a previous build during exactly this kind of check before.

## Branch

Continues `fix/mobile-pwa-nine-issues`, whose recent commits are the same
territory ("Move the docked bars out of the scroll container", "Hold the docked
search bars still during a pull"). 12 commits ahead of `main`, not behind.
