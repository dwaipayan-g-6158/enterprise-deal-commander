# Mobile PWA — Design System Reset

**Date:** 2026-08-06
**Branch:** `feat/mobile-design-system` (5 commits, cut from `feat/mobile-pwa-polish`)
**Baseline:** `8bc0d3f`

Phase 3 of the mobile work. The shell was correct (Phase 1) and it moved
nicely (Phase 2), and it still did not look like a professional application.
This is why, and what changed.

Motion and material were never the problem. The typography and the component
layer were, and that is measurable — this round started by walking every text
node in `.m-shell` at 393 × 852 and bucketing it by family, size, weight,
tracking and case.

| What the inventory found | Evidence |
|---|---|
| The app was set in a monospace face | `Geist Mono 13px/500` was the single most-used style on every screen — 80 instances on the deal screen, 34 on memory, 29 on home |
| A defect on the most important number in the app | A monospace period occupies a full character cell, so `$3.82M` rendered as `$3 . 82M` |
| No type discipline | 18 distinct styles on the deal screen, 13 on home, against the six a system runs on |
| Shouty labels | `12px/550 +0.06em uppercase`, six of them stacked down the Command Center |
| 58 shadcn primitives installed, 3 used by mobile | Every row, chip, pill, bar and empty state hand-rolled |
| …and they *couldn't* be used | `.m-shell` defined a parallel `--m-*` palette no primitive could see |

---

## 1. One token system, not two

`.m-shell` stopped defining a private palette and now **re-points the shadcn
semantic tokens** for its own subtree. `index.css` consumes them as
`hsl(var(--card))` through Tailwind v4's `@theme inline`, which keeps the
`var()` live at the use site, so an override scoped to the shell reaches every
utility and every primitive rendered below it. `<Item>` inside `.m-shell` is
simply correct.

That forces HSL triplets — `hsl(#14171c)` is not a colour — so the values are
the ones `--m-*` carried, converted. The colour tokens are **deleted, not
aliased**: a compatibility layer would leave two systems in the tree and this
would drift straight back. 74 references across 24 files swept to the standard
utilities.

`--radius: 0.875rem` is the highest-leverage line in the file. Desktop runs
`0.25rem`, and re-pointing it moves every primitive's corners onto iOS
proportions at once — 10 / 12 / 14 / 18 across the sm→xl ladder.

What survives as `--m-*` is what has no shadcn equivalent and a real job: the
glass material (a colour slot has no alpha channel, and the translucent base is
the whole point), the ambient sky wash, the obsidian capsule, the shimmer.
Health, risk and outcome colour still comes from `semantic-colors.ts`.

Nothing looked different after this commit except corner radii. That was the
point — the one change that can break everything at once is isolated, so a
regression bisects to a token rather than to a redesign.

## 2. Six type styles, no monospace

| Role | Treatment | Used for |
|---|---|---|
| Display | 34 / 640 / −0.03em | The one hero figure per screen |
| Title | 22 / 640 / −0.02em | Screen title, deal name, a card's lead figure |
| Headline | 17 / 600 / −0.01em | A row's or a card's lead line |
| Body | 16 / 400 | Prose, narratives, alert messages |
| Label | 13 / 550 | Card labels, and the weight every pill is set in |
| Caption | 13 / 450 | Metadata, dates, counts, deltas |

Mono is gone from the shell entirely. The shell already sets
`font-variant-numeric: tabular-nums`, so figures still align in a column and
the decimal point sits where a reader expects it — mono was buying the terminal
look and the broken decimal, nothing else.

Labels are sentence case. The strings were always written that way;
`.m-eyebrow` uppercased them in CSS, and uppercase plus 0.06em tracking is the
most dated signal a mobile interface can carry.

**Two properties of these classes are load-bearing**, and together they are
what lets the shell sit on shadcn primitives at all:

- **They are unlayered.** Unlayered rules beat every `@layer`, so `.m-headline`
  on an `<ItemTitle>` overrides the `text-sm font-medium` baked into that
  primitive and `.m-label` on a `<Badge>` overrides its `text-xs font-semibold`.
  Put them in `@layer components` and every primitive silently keeps its
  desktop sizing.
- **None of them carries a colour.** The same precedence would otherwise grey
  out every health, risk and outcome pill by beating the `semantic-colors.ts`
  utility beside it. Colour is a per-site decision: labels pair with
  `.m-muted`, pills pair with their semantic class.

**Body stays at 16px**, not the 15 the plan proposed. Body size was never what
the inventory faulted, and 16 is the documented floor for mobile body text;
going under it to buy a tighter scale would be a regression dressed as a
refinement. This is the one deliberate deviation from the approved plan.

## 3. Rebuilt on the primitives that were already installed

| Was | Is | Why |
|---|---|---|
| Six hand-rolled row layouts | `ListRow`, built on `Item` | They didn't agree on gaps, truncation or right-column alignment, and a list that disagrees with the list above it is what reads as amateur |
| `EmptyState` / `ErrorState` | `Empty` + slots | Correct structure; the icon gains a filled plate instead of floating as grey line-art |
| Five hand-rolled bars | `Progress` | The real win — the divs announced nothing at all |
| `HealthPill` / `RiskPill` / `MetaChip` / outcome pills | `Badge` via `MobilePill` | One object, colour still passed in from `semantic-colors.ts` |
| `SegmentChips` (`role="tablist"`, no panels) | `ToggleGroup type="single"` | See below |
| Analytics Forecast / Flow | `Tabs` | See below |
| Tag chips | `Badge variant="secondary"` | |

Rows stay inside the caller's own `<ul>`/`<li>` rather than moving to
`ItemGroup` — native list semantics beat a `role="list"` div, and `ItemGroup`
does not mark its children as list items anyway.

**Telling a filter from a tablist is the point of the control work.** The chips
declared `role="tablist"` with no `tabpanel` anywhere to point at: a screen
reader was promised tabs and handed a list. They are radios in a named
`radiogroup` now. The one control that genuinely swaps panels — Forecast/Flow —
is the one that uses `Tabs`.

The selected chip's tint is `data-[state=on]:bg-accent` straight out of
`toggleVariants`, untouched. It lands on the right colour because `.m-shell`
re-points `--accent` — §1 earning its keep rather than an override on top of it.

**Bundle went down.** Mobile chunk 93.58 → 92.85 kB; desktop 1,409.71 →
1,391.82 kB, because Rollup moved the now-shared primitives into the common
chunk. The markup these replaced weighed more than sharing them costs.

## 4. The four defects

- **A ⌘ glyph on a touch device.** The capsule drew lucide's `Command`, the
  Apple *keyboard* key. It now carries a glyph per surface that agrees with the
  label it already showed.
- **The capsule covered content mid-scroll.** It only shrank to a circle, and a
  circle parked over the row you are reading is still parked over it. It leaves
  downward now and returns 420ms after scrolling stops. That settle timer is
  what makes hiding safe rather than hostile — the previous comment already
  claimed this behaviour and there was no timer behind it.
- **Every alert said its name twice** — `humanizeCode(alert.code)` above a
  message the engine prefixes with the same words in block caps.
  `lib/alert-text.ts` strips the prefix, but only when it demonstrably *is* the
  code: the head has to be all upper case and match the alert's own code once
  both are reduced to letters and digits, so `TCV: 3.8M` survives untouched.
- **Ragged stat tiles.** Tiles lay out as a column with the footnote on the
  floor, so a pair whose footnotes wrap differently still agrees on where the
  figure sits.

## 5. Inclusivity

**Dynamic Type.** Every size was a fixed `rem` and iOS Safari does not scale
`rem`, so a reader who had turned text up in Settings got nothing.
`font: -apple-system-body` on a throwaway probe reports their setting; the
ratio drives `--m-type-scale`, which the six styles multiply through, and line
heights are unitless now so they follow. Clamped to 0.92–1.35 — past 1.35 the
tab bar's four labels stop fitting across 375px.

The first version had no support check, so every non-Apple browser fell back to
its 16px default, measured 16/17 and shrank the whole interface by 6%. The
contrast audit caught it by reporting 13px captions rendering at 12. Guarded
twice now: `CSS.supports`, and a 1px sentinel the shorthand has to overwrite.

**Contrast**, computed from resolved tokens across six screens in both themes.
Three real failures, all mobile-local: `text-emerald-600` at 3.44:1 on a white
card, `text-orange-600` at 3.60:1, and the delta label stacking `opacity-70` on
an already-muted token for 4.08:1. The three sites that show direction of travel
share `lib/tones.ts` at −700 in light now, and the redundant opacity is gone.

**Accessibility tree**, per screen: rows expose one named link inside a real
`<li>`; chips expose `radiogroup` + `aria-checked`; tabs expose `tablist` with
resolving `aria-controls` and two panels; eleven progressbars on the deal
screen, all named, all with a value.

---

## 6. Two bugs found in shared code

**`Progress` never passed `value` to the Radix root.** It destructured `value`
out and used it only for the indicator's transform, so Radix saw `undefined`,
reported `data-state="indeterminate"` and emitted no `aria-valuenow`. Every bar
in the app — desktop included — drew the right width and announced "busy". One
line; purely additive, since nothing is styled off the state attribute.
Verified unchanged visually on `/autopsy` and the dashboard.

**The contrast audit was lying to itself.** Tailwind v4 authors its palette in
oklch, and an alpha modifier (`bg-amber-500/12`) makes the browser compute the
result as *oklab*. The first parser handled neither and scored every tinted
pill as near-black, producing two false failures. A contrast script that cannot
read the colour space its framework emits reports confident nonsense.

## 7. Verification

`pnpm run typecheck` clean. `pnpm --filter @workspace/edc run test` — 593 tests
/ 44 files, including `read-only.test.ts`. Production build clean from
PowerShell.

Driven in a real browser at 393 × 852:

- **Type inventory re-run**, the same script that produced the evidence above:
  **zero Geist Mono entries** on any screen in either theme, and **six prose
  styles per screen** (from 18 on the deal screen, 13 on home). The two extra
  entries the script counts are the tab bar's 11px active/inactive labels,
  which are platform chrome rather than part of the reading scale.
- **Contrast**: 42–98 distinct pairs per screen, both themes. All clean except
  §8 below.
- **Capsule**: measured off-screen and `aria-hidden` while scrolling down, back
  in place after the settle; no `lucide-command` anywhere in the DOM.
- **Reduced motion**: no splash, no reveals, all content at full opacity.
- **375 / 393 / 430 px**: no horizontal overflow.
- **Desktop at 1440px** (`/`, `/settings`, `/analytics`, `/autopsy`, `/memory`):
  no mobile shell, no splash, `--radius` still `0.25rem`, `--m-type-scale`
  unset, Progress bars at identical geometry.

## 8. Not done, and why

**Six light-mode contrast failures remain on the deal screen**, all tracing to
`semantic-colors.ts`:

| Element | Ratio | Token |
|---|---|---|
| "Moderate" pill on its own amber tint | 2.76 | `RISK_LEVEL_CLASS.MODERATE.text` = `text-amber-600` |
| "Moderate Risk" verdict, 22px/640 | 3.20 | same |
| Three YELLOW alert codes, 17px/600 | 3.20 | `SEVERITY_TONE.YELLOW` → same |
| "Needs Attention" pill | 4.32 | `HEALTH_CLASS.YELLOW.text` = `text-yellow-700` on its tint |

These are pre-existing and shared with the whole desktop cockpit. The file's own
header comment already records that "yellow-600 … are each under 4.5:1 on
white" and moved `HEALTH_CLASS` to `-700` for exactly this reason;
`RISK_LEVEL_CLASS` was never followed through. The fix is one line —
`text-amber-600` → `text-amber-700`, which clears five of the six — but it
changes every risk badge in the application, and `semantic-colors.ts` has its
own test file. **It belongs in its own change, reviewed against desktop, not
riding along in a mobile design commit.**

**Dynamic Type is unverified on a device.** Playwright cannot emulate the iOS
text-size setting. What this host can confirm is the no-op path: on a non-Apple
engine the probe is guarded and `--m-type-scale` stays exactly `1`.

Carried over from earlier phases: iOS splash screens still need
`@vite-pwa/assets-generator`, and manifest shortcuts remain unverified on a
real device.
