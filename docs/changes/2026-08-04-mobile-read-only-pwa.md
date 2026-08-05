# Mobile-First Read-Only PWA Shell

**Date:** 2026-08-04
**Branch:** `feat/mobile-pwa-shell` (7 commits)
**Baseline:** `542186f`
**Scope:** `56 files changed, +4,401 / −235`

A purpose-built mobile experience for the installed iOS PWA. Phones previously
got the desktop pages scaled down; they now get their own shell, chosen at the
top of the tree rather than adapted page by page. The mobile surface is
**read-only for everyone, admins included** — it renders no write control and
ships no mutation code.

---

## 1. Shell selection

`ShellGate` (`src/App.tsx`) picks a shell by viewport at **767px**, the exact
complement of the 768px breakpoint the sidebar and `AppShellSkeleton` already
use. It reads through `useMediaQuery`, **not** `useIsMobile` — the latter
returns `false` on its first render, which would make every phone briefly
mount and download the desktop shell.

Both shells are `React.lazy`. Measured effect: the mobile chunk is **82 kB**
against the desktop's **1.41 MB**.

Both serve the **same URLs**, so a deep link shared between a phone and a
laptop opens the right experience on each with no redirect and one manifest
`start_url`. Routes with no mobile equivalent (`/portfolio`, `/autopsy`,
`/settings`) resolve to an explanation of why that view needs a desktop rather
than a 404.

The session check moved into `src/lib/auth/use-auth-guard.ts` so both shells
share one `/auth/me` request and one set of offline semantics.
`AppShellSkeleton` moved to `src/components/app-shell-skeleton.tsx` so it can
be the Suspense fallback without pulling the desktop chunk in eagerly.

_Also removed:_ `src/pages/mobile.tsx`, the retired V2 mobile companion that
nothing had imported since `/m` started redirecting.

## 2. Mobile design system

Tokens live in `src/mobile/mobile.css`, scoped to `.m-shell` rather than
`:root`, so the desktop theme is untouched by construction. Health, risk and
outcome colour is **not** redefined there — `semantic-colors.ts` stays the
single source of truth.

Dark mode steps surface lightness as well as shadow, because a shadow against
a near-black canvas separates nothing. Type hierarchy is carried by weight and
tracking rather than size alone, which is why Geist is now requested as a
variable axis (see §5).

## 3. Screens

| Screen | Notes |
|---|---|
| Command Center | Weighted pipeline, health split, red alerts, avg score, critical alerts, stalled deals, activity. The desktop's nine rows do not survive the trip; this is a deliberate subset. |
| Deals | Card list via `useRosterData` — the same two calls and merge the desktop roster uses. Four segments replace the toolbar's filter set. |
| Deal Detail | Nine sections in war-room priority order, each stating a verdict at rest and opening in place for evidence. Cockpit controls render as state. |
| Analytics | Forecast as three percentiles, win/loss as a rate plus bands, funnel as proportional bars. **Sankey and conversion matrix are not ported** — a 2-D flow diagram at thumb scale is decoration. |
| Memory | Search-first with the input **docked at the bottom**, so the keyboard rises to meet the thumb. |

## 4. Commander capsule

One thumb-zone control that morphs with context (`src/mobile/commander/`).
Collapses to a circle on scroll-down, re-expands when you stop. Opens a vaul
bottom sheet with fuzzy deal search, natural-language questions, navigation and
the two account actions. Hidden on Memory, where the docked search already owns
the thumb zone.

Natural-language matching moved to **`src/lib/nlc-filter.ts`** and both the
desktop palette and the mobile sheet now call it. It was inline in
`command-palette.tsx`; a second copy would have drifted one operator at a time.

## 5. PWA / iOS

- Added `apple-mobile-web-app-capable`, `-status-bar-style: black-translucent`,
  `-title`, and `mobile-web-app-capable`.
- **`apple-touch-icon` href was relative** — installing from `/deals/123` asked
  iOS for `/deals/apple-touch-icon.png` and it fell back to a page screenshot.
  Now root-absolute.
- **`theme-color` was dark-only while the app defaulted to light.** Now a
  `prefers-color-scheme` pair for first paint, plus `ThemeColorSync` which
  re-points it when the in-app theme disagrees with the OS. Manifest colours
  moved to the light token for the same reason.
- **System dark mode is now followed** (`enableSystem`, `defaultTheme: system`).
  This breaks any `theme === "dark"` check, since next-themes reports
  `"system"` until the user picks a side — `theme-toggle.tsx` and
  `command-palette.tsx` now read `resolvedTheme`. Verified the ambient
  time-band tints still apply (they key off the `.dark` class plus an
  independent `data-time-band`).
- Workbox: webfonts cached; lookups split into `edc-api-lookups` (7 days);
  `edc-api-reads` raised 60 → 200 entries. **`useSignOut` now purges by the
  `edc-api-` prefix** — matching one bucket name would leave the new one
  holding the previous session's data on a shared device.
- Dropped the Inter webfont, which was downloaded and assigned to nothing.
- Safe-area utilities (`pt-safe`, `pb-safe`, `pb-tabbar`) in `index.css`.
- Two bottom-anchored overlays were landing on the tab bar: the offline banner
  now rides above it below `md`, and the toast viewport flips to
  bottom-anchored at `md` rather than `sm`.

## 6. The read-only guarantee

`src/mobile/read-only.test.ts` walks every module reachable from `src/mobile`
— **transitively**, following imports out into shared code — and fails on any
React Query mutation primitive, any non-read hook from the generated client
outside a named allowlist (`useLogin`, `useLogout`, `useDashboardVisit`), or a
raw fetch with a write method. Modelled on the server's
`routes/index.rbac.test.ts`, which walks routes rather than trusting a list.

The transitive walk is the point: a per-file scan would pass a mobile screen
that imports a desktop component which itself imports `edit-deal-sheet.tsx`.
**Verified it fails** — pointing one mobile file at `risk-governance.tsx`
surfaced three violations, one of them two hops away in `managed-risks.tsx`.

The server's deny-by-default `requireWriteRole` remains the second, independent
guarantee. No backend change was needed for any of this.

## 7. Bugs found while driving the running app

- **Deals listed closed deals.** `state: "active"` excludes archived/deleted
  but still returns Closed-Won/Closed-Lost; the desktop roster drops those via
  its default `closure: "open"`. The header claimed 13 deals / $8.30M against
  the dashboard's 5 / $4.2M. Also switched the total to `normalizedTCV`, so it
  isn't summing across currencies.
- **Every archived deal rendered as Lost.** The memory API returns
  display-cased `"Won"`/`"Lost"`; a strict `=== "won"` fell through for all of
  them. `src/mobile/lib/outcome.ts` now normalizes case-insensitively.
- **The memory outcome filter returned nothing.** The server matches the
  filter exactly against the display-cased value, so `"won"` found zero rows.
- **The Commander capsule covered the last card.** `pb-tabbar` cleared the tab
  bar but not the furniture floating above it.

## 8. Verification

`pnpm run typecheck` clean across all packages; `pnpm --filter @workspace/edc
run test` 593 tests / 44 files passing; production build clean from PowerShell.
Driven in a real browser at 375 / 390 / 1440 px in both themes: every API call
across a full mobile session (home → deals → detail → analytics → memory) was a
GET. Mobile figures cross-checked against the desktop dashboard and they agree.

## 9. Not done

**iOS splash screens.** They need `@vite-pwa/assets-generator` as a
devDependency plus a one-off generation step. Until then the install falls back
to the manifest `background_color` — cosmetic, not broken.
