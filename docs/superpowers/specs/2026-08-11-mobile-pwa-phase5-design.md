# Design: Mobile PWA Phase 5 — Rebuild the Visible Layer

**Date:** 2026-08-11
**Status:** Shipped and verified on the deployed app
**Branch:** `feat/mobile-phase5-rebuild` (18 commits)
**Write-up:** `docs/changes/2026-08-11-mobile-phase5-rebuild.md`

> Written after the fact. Phases 1–4 of the mobile work left no spec, and the plan for this
> phase called for one so the reasoning outlives the diff. Where a decision changed during
> implementation, this records what was actually built and why — not the original intent.

## Problem

The installed PWA read as a shrunken desktop app. The complaint — "less detail in dashboard,
analytics, Memory… Deal looks like a miniature and less effort version of desktop" — was
measurable, not aesthetic:

| Area | Desktop | Mobile before |
|---|---|---|
| Deal detail | 13 sub-tabs in 5 groups | 8 collapsible sections in one scroll; 7 subjects absent |
| Dashboard | ~14 widgets, 5 popover segments, 8 drill-down dialogs | one 299-line screen |
| Analytics | 2 tabs, ~10 charts | one 310-line screen |
| Memory | 6 tabs incl. Ask Advisor and comparison | one 178-line screen |
| Areas reachable | 7 | 4 — Portfolio, Autopsy and Settings were "needs desktop" stubs |

Mobile was **not** greenfield: `artifacts/edc/src/mobile/` already held ~53 files from four
completed phases. The failure was information architecture and screen composition. The token
layer was the good part and was expensive to get right.

## Goals

1. Full information parity with desktop, reached through phone-native navigation.
2. Every one of the seven desktop areas ships; no "needs desktop" stub without a stated reason.
3. Four high-value field write actions, and provably only four.
4. Desktop does not regress. Mobile CSS/JS load only in the lazy mobile chunk.

## Non-goals

- **Editing anything.** Narratives, autopsies, thresholds, deal fields — all forms, all desktop.
- **Replacing the token layer.** `.m-shell`'s re-pointing mechanism, the view-transition wiring,
  the SW/manifest plumbing and the transitive-import test harness were kept.
- **New runtime dependencies.** None were added; see the chat-kit decision below.
- Desktop behaviour changes. Six files outside `src/mobile/` were touched, all additive.

## Architecture

**Four tabs for seven areas** — Command · Deals · Intelligence · Memory, with Settings and Users
behind the nav-bar avatar. Intelligence merges Analytics, Portfolio and Autopsy: one activity
wearing three hats. It keeps the **real desktop URLs** (`/analytics`, `/portfolio`, `/autopsy`) —
there is no `/intelligence` — which preserves deep-link parity for free.

**Deal detail is a Brief plus 16 pushed panels** (the iOS Health pattern), each deep-linkable.
Sixteen against desktop's thirteen sub-tabs: parity is a superset. The Brief loads four queries
instead of six; playbook, trajectory and activity load on their own screens. That is the single
biggest perceived-speed win in the redesign.

**Command Center is editorial** — six blocks (Verdict, Needs, Pulse, Movement, Read, Week)
replacing 14 widgets, 5 popover segments and 8 drill-down dialogs. Each figure links to a
filtered `/deals` instead of opening a dialog. The reorder control went with them: a customise
affordance on a six-block screen admits the order is wrong.

**Deals is a card list whose filters, sort and grouping live in the URL**, via the desktop
roster's own codec. That is what makes back undo a filter change and a filtered list shareable.
It reuses `useRosterData` and `computeDerivedRows` wholesale, so a phone and a laptop cannot
disagree about a score.

**A hand-rolled touch chart kit** in `src/mobile/charts/`. recharts, framer-motion and cmdk are
absent from the mobile chunk, enforced at the import by `deps.test.ts` — a banned-specifier test
rather than a size assertion, because a size limit tells you *after* someone imported recharts.

## Decisions worth keeping

**Undo stops before `accept`.** Server-side, `isBlockingRedAlert` treats an accepted alert as
clearing the stage guardrail, so accepting is an authorization carrying a mandatory rationale.
Acknowledge and snooze get a six-second undo; accept asks for its rationale on a full screen,
states its consequence, and offers none.

**`networkMode: "always"` on every mobile write.** React Query's default *pauses* a mutation
offline, which triggers the globally-mounted `OfflineSaveNotice`'s "queued, will save
automatically". There is no outbox and both service-worker caching rules test `method === "GET"`,
so that promise was never kept. A test bans the words.

**Terminal stages are unreachable from the phone.** Closing collects a loss archetype, reason and
competitor, and those write the Deal Memory record the whole Memory tab is built on.

**A heatmap becomes a ranked list, a matrix becomes a ranked list, the Sankey stays off.** Ranked
by volume, not rate — 100% off one deal is arithmetic, not a signal. A two-dimensional flow
diagram's value is its crossings, and the crossings are the first thing to vanish when narrowed.

**The shadcn chat kit was not installed.** `bubble` pulls the unified `radix-ui` package (this app
uses the scoped `@radix-ui/react-*` ones) and `message-scroller` pulls `@shadcn/react`. Two new
runtime dependencies for about sixty lines of markup.

**No iOS startup images.** They need a new dev dependency and ~20 device-specific binaries
committed to a public repo, and can only be verified on a real iOS device in standalone mode.
Left as a deliberate, separate decision rather than slipped in unverified.

## Testing strategy

Pure-model vitest (`environment: "node"`, no jsdom/RTL) plus browser verification against the
deployed app — local sign-in is impossible because `/__catalyst/sdk/init.js` is gateway-only.

Guard suites, each verified to fail closed by planting the regression it pins:
`write-allowlist` (derives the ~70 write ops from the generated client's actual HTTP methods and
bans `useMutation` everywhere), `nav/routes`, `screens/deal/panels`, `manifest`, `theme-color`,
`scroll-memory`, `tokens`, `type-usage`, `deps`.

**76 test files, 1046 tests.**

## What the deployed sweep changed about this design

Five defects survived typechecking, 1026 tests and review, and were found only by driving the
running app. They are recorded in full in the change write-up; three of them altered the design
rather than just the code:

- **A flex child with no `min-w-0` bursts rather than truncates.** `ListRow` gained a `titleLines`
  option, because a one-line clamp spends the row on the destination hint — the least useful text
  in it — when the title *is* the content.
- **`theme-color` is resolved first-match-in-tree-order.** The runtime sync now removes
  index.html's media-scoped pair, which wins under either ordering rule so the fix does not rest
  on a reading of the spec.
- **Floating chrome may cover prose, never a control.** `pb-tabbar` reserves the band only at
  maximum scroll, so a screen slightly taller than the usable area renders its tail under the tab
  bar at rest — and an interactive tail there is worse than hidden, it is mis-tappable. Both the
  409 guardrail and the Account screen were fixed against this rule.

## Verification status

Verified on the deployed build: offline-write copy, the 409 override branch, the animated back
gesture with scroll restoration, `theme-color`, and the reader 403 (zero write controls, every
list still rendering in full).

Not verified: real iOS and Android devices, and 375/430px, light mode and the other three time
bands. `/pwa-review` has not been run.
