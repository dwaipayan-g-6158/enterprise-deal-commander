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

**74 test files, 1026 tests.**

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

## Still to verify on the deployed app

Local sign-in is impossible — `/__catalyst/sdk/init.js` is gateway-only — so
everything behind auth needs the deployed build. Outstanding:

1. Sweep every screen at 375 / 390 / 430px, light and dark, all four time bands.
2. Offline write: copy must say *not saved*, never *queued*.
3. Reader 403: no write controls render.
4. 409 override: the guardrail branch, and that a typed reason survives a failure.
5. Back gesture: Android predictive back and iOS edge swipe both animate and
   restore scroll.

**Screenshots: never capture Settings → Users.** `docs/assets/` is a public
repository and that screen lists real names and email addresses.
`SETTINGS_SCREENS` carries a `sensitive` flag for exactly this check.
