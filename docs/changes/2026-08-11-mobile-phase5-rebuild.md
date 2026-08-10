# Mobile PWA — Phase 5: rebuild the visible layer

**Date:** 2026-08-11
**Branch:** `feat/mobile-phase5-rebuild`
**Scope:** `artifacts/edc/src/mobile/**`, plus five additive changes outside it.

## Why

The installed PWA read as a shrunken desktop app. The diagnosis was measurable
rather than aesthetic:

| Area | Desktop | Mobile before |
|---|---|---|
| Deal detail | 13 sub-tabs in 5 groups | 8 collapsible sections in one scroll — 7 subjects absent entirely |
| Dashboard | ~14 widgets, 5 popover segments, 8 drill-down dialogs | one 299-line screen |
| Analytics | 2 tabs, ~10 charts | one 310-line screen |
| Memory | 6 tabs incl. Ask Advisor and comparison | one 178-line screen |
| Areas reachable | 7 | 4 — Portfolio, Autopsy and Settings were "needs desktop" stubs |

The token layer built across phases 1–4 was the good part and was kept. This
phase rebuilt everything visible on top of it.

## What shipped

**Four tabs for seven desktop areas.** Command · Deals · Intelligence · Memory,
with Settings and Users behind the nav-bar avatar. Intelligence merges Analytics,
Portfolio and Autopsy — one activity wearing three hats.

**All seven areas now ship.** Nothing is a "needs desktop" stub except the five
settings tabs that are authoring surfaces, and those say why.

- **Command Center** — six editorial blocks (Verdict, Needs, Pulse, Movement,
  Read, Week) replacing 14 widgets, 5 segments and 8 dialogs. The reorder control
  went with them.
- **Deals** — a card list whose filters, sort and grouping live in the URL via the
  desktop roster's own codec, so back undoes a filter and a filtered list is
  shareable. Search docked in the thumb zone.
- **Deal Brief + 16 pushed panels** — the iOS Health pattern. Sixteen against
  desktop's thirteen sub-tabs; parity is a superset. Four queries on the Brief
  instead of six.
- **Intelligence** — three lenses on the real desktop URLs (`/analytics`,
  `/portfolio`, `/autopsy`), five pushed screens.
- **Memory** — search-first root, five lenses, comparison, and Ask Advisor as a
  real chat.
- **Account** — five read-only settings screens.

**Four write actions**, and provably only four: playbook step state, risk
disposition, technical gate toggle, stage advance (including the 409
`STAGE_GUARDRAIL` override).

**A touch chart kit** — hand-rolled SVG in `src/mobile/charts/`. recharts,
framer-motion and cmdk are all absent from the mobile chunk, enforced at the
import.

## Decisions worth keeping

**Undo stops before `accept`.** Server-side, `isBlockingRedAlert` treats an
accepted alert as clearing the stage guardrail, so accepting is an authorization
carrying a mandatory rationale. Acknowledge and snooze get a six-second undo;
accept asks for its rationale on a full screen, states its consequence, and
offers none.

**`networkMode: "always"` on every mobile write.** React Query's default *pauses*
a mutation offline, which triggers the globally-mounted `OfflineSaveNotice`'s
"queued, will save automatically" toast. There is no outbox and both service
worker caching rules test `method === "GET"`, so that promise was never kept. A
test bans the words.

**Terminal stages are unreachable from the phone.** Closing a deal collects a
loss archetype, reason and competitor, and those write the Deal Memory record the
whole Memory tab is built on.

**No new runtime dependencies.** The planned shadcn chat kit
(`message`/`bubble`/`message-scroller`) was NOT installed: `bubble` pulls the
unified `radix-ui` package (this app uses the scoped `@radix-ui/react-*` ones)
and `message-scroller` pulls `@shadcn/react`. Written out, the chat surface is
about sixty lines.

## Guards added

Every one of these was verified to fail closed by planting a violation.

| Suite | What it stops |
|---|---|
| `write-allowlist.test.ts` | Derives the ~70 write ops from the generated client's actual HTTP methods; bans `useMutation` everywhere including `write/`; pins seven hooks to five owning modules |
| `nav/routes.test.ts` | Route table vs. `mobile-app.tsx` agreement, literal-before-param ordering, tab ownership, and that every deal panel claims a cockpit sub-tab |
| `screens/deal/panels.test.ts` | Registry vs. table both ways, and WHICH panel files may import a write hook |
| `manifest.test.ts` | Manifest shortcut URLs decode to genuinely filtered views |
| `theme-color.test.ts` | The OS chrome reads the token, never the transitioning background |
| `tokens.test.ts`, `type-usage.test.ts`, `deps.test.ts`, `class-scan.ts` | Contrast, type-rung collisions, banned imports, thin-glass misuse |

**74 test files, 1026 tests** at the end of the build phase; 76 / 1041 after the
deployed sweep added the guards below.

## Bugs the guards caught during the work

- `type-usage.test.ts` twice found two unlayered type rungs on one element
  (`cn("m-body", cond && "m-headline")`) — they fight over the same properties.
- **The manifest's "Red alerts" shortcut had silently broken.** It read
  `?filter=critical`; when Deals moved onto `roster-url.ts`, the decoder began
  dropping that key — as a decoder should — and the shortcut started opening the
  whole pipeline while still calling itself Red alerts. Nothing threw.
- **`AdminOnly` renders `null`.** Wrapping a gate row or a playbook step in it
  would have deleted the entire list for a read-only user rather than removing
  the control. Both branch on `useCanWrite` instead.
- **`theme-color` read a transitioning value.** `.m-shell` transitions its
  background, so `getComputedStyle(el).backgroundColor` during a theme switch
  returns the interpolated in-flight colour. Measured two frames after adding
  `.dark`: token already `231 28% 6%`, resolved background still
  `rgb(240, 241, 248)` — a near-white status bar over an app turning black.
  Custom properties are not transitioned; the token is read instead.
- **"Exactly one owning pattern" was testing the wrong thing.** It held only
  while no literal shared a depth with a param. Overlap is expected; first-match
  ordering resolves it. It now asserts the most specific pattern wins.

## Deliberately not done

- **The Sankey.** A two-dimensional flow diagram's value is its crossings, and
  the crossings are the first thing to vanish when you narrow it.
- **iOS startup images.** They need a new dev dependency and ~20 device-specific
  binaries committed to a public repo, and they can only be verified on a real
  iOS device in standalone mode. Left as a deliberate, separate decision.
- **Editing anything.** Narratives, autopsies, thresholds, deal fields — all
  forms, all desktop.

## Files changed outside `src/mobile/`

All additive or behaviour-preserving.

| File | Change |
|---|---|
| `src/desktop/desktop-app.tsx` | Five redirect routes, so a phone-shared deep link resolves on a laptop |
| `src/index.css` | `pl-safe` / `pr-safe` utilities |
| `index.html` | `apple-mobile-web-app-status-bar-style`: `black-translucent` → `default` |
| `src/components/roster/model/board.ts` | `patchDealStage` lifted in from `use-stage-move.ts` |
| `src/components/theme-color-sync.tsx` | Exported `THEME_COLOR` and `themeColorTag()` so the mobile shell writes the same tag |
| `vite.config.ts` | Manifest shortcuts corrected and extended |

## Verified on the deployed app

Local sign-in is impossible — `/__catalyst/sdk/init.js` is gateway-only — so this
had to wait for a deploy. Driven signed in at 390px against
`index-DWQAqhM4.js`.

| Check | Result |
|---|---|
| Offline write | Says **"Not saved — you're offline"**; the words *queued* and *will save automatically* never appear, and the optimistic patch rolls back |
| 409 override | Guardrail renders in place with tappable pattern rows, "Fix it first" primary, override behind a disclosure, 10-character gate live-counted |
| Back gesture | popstate back runs a view transition and restores scroll exactly (420 → push → back → 420) |
| theme-color | Resolves to `#0b0c14`, the shell's actual night-band canvas |
| Reader 403 | Signed in as a reader: **zero** write controls anywhere, and every list still renders in full |

**The reader check, in detail.** `/stage` shows the whole pipeline rail with no
advance control; `/gates` shows all 9 gates with no toggles; `/playbook` shows all
26 steps; `/alerts` shows all 8 alerts with no disposition buttons. That last
column is the payoff of the `AdminOnly`-renders-`null` fix: a read-only user gets
the lists, not empty cards.

**Four defects that only the running app could show** — each fixed, each with a
guard that was verified to fail closed by planting the regression.

1. **`ListRow`'s content column could not shrink.** shadcn's `ItemContent` is
   `flex flex-1 flex-col` and sets no min-width, so it keeps a flex item's
   default `min-width: auto` and cannot go below its min-content width — which,
   for a `nowrap` title, is the whole title. Measured at 390px on the deal
   Brief: the column grew to **1003px** and the coaching sentences painted off
   the right edge of the card and the screen. On the Command Center the row
   wrapped instead, dropping the icon and the trailing destination onto their
   own lines — 3 of 3 rows. `truncate` on the title rescued neither: text-overflow
   only ellipsises a box something has constrained.
2. **`theme-color` was written to a tag the browser never reads.** index.html
   ships a media-scoped light/dark pair for first paint; both syncs wrote a
   third, unscoped tag on the belief — written into a comment — that being last
   in the document made it win. The spec takes the *first* candidate in tree
   order whose media matches, and the pair covers both schemes exhaustively.
   Measured in dark/night: the shell had correctly computed `#0b0c14` while the
   resolvable tag was the static `#15171a`. This was a **pre-existing desktop
   bug** that the mobile component inherited.
3. **Forward navigation recorded the wrong scroll position.** `aroundNav` called
   `rememberScroll` in the after-commit callback — the same slot
   `back-gesture.ts` uses to *restore* — so the shared container had already
   moved and every push stored 0 against the entry it was leaving. Back always
   landed at the top. `back-gesture.ts` had it right and says why; the two paths
   simply disagreed.
4. **The 409 guardrail rendered below the fold**, putting both its actions in the
   band the Commander capsule floats in. A hit test at the centre of "Advance
   anyway" returned the Intelligence tab. The first fix aligned to the scroll
   container's bottom edge — which is *behind* the tab bar — so it made the block
   visible and still untappable; the second subtracts the scroller's own
   `padding-bottom`.

5. **Sign out had no tappable pixels** — found by trying to use it, when
   switching to the reader account. On `/account` at rest the 48px row sat 28px
   under the tab bar with the Commander capsule over the remaining 20px: a tap
   at its centre switched tabs, one at its top edge opened search, and the
   screen's 128px of scroll made it look complete. The capsule now hides on
   `/account` and `/settings/*` (nothing there to search or jump to), and Sign
   out moved above the engine-settings note — **floating chrome may cover prose,
   never the one destructive control on the screen.**

**76 test files, 1046 tests.**

### Still unverified

- **Real iOS and Android devices.** The sweep ran in emulated Chromium, which
  cannot show iOS edge-swipe, Android predictive back, or standalone-mode chrome.
- **375px and 430px, light mode, and the other three time bands.** Only 390px
  dark/night was swept.

**Screenshots: never capture Settings → Users.** `docs/assets/` is a public
repository and that screen lists real names and email addresses.
`SETTINGS_SCREENS` carries a `sensitive` flag for exactly this check.
