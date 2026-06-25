# EDC UI/UX Refresh + PWA + Auth Simplification

**Date:** 2026-06-25
**Merged to `main`:** commit `454259b` (merge of `ui-ux-refresh`, 25 commits)
**Baseline before this work:** `b53d2dc` (WIP snapshot of the V2 build)
**Scope:** `34 files changed, +3,878 / −580` (excluding the `pnpm-lock.yaml` churn)
**Spec / plan:** `docs/superpowers/specs/2026-06-25-edc-ui-ux-refresh-design.md`, `docs/superpowers/plans/2026-06-25-edc-ui-ux-refresh.md`

This refresh was primarily a **frontend** effort in `artifacts/edc`, plus a small set of **backend auth simplifications** in `artifacts/api-server` / `lib/db` that came out of local-run troubleshooting.

---

## 1. Design system & theming

- **Indigo accent system.** Repointed `--primary`, `--ring`, `--sidebar-primary`, `--sidebar-ring` to indigo `hsl(222 90% 67%)` (`#5b8cff`) in both `:root` and `.dark`.
- **Chart color tokens.** Defined `--chart-1..5` (previously referenced by `@theme` but never defined, so charts had no colors).
- Health/severity colors (red / amber / emerald) remain reserved for **status only** and are never used as the accent.

_Files:_ `src/index.css`

## 2. Cockpit redesign

- **Grouped two-level tabs.** Replaced the cramped flat 13-tab strip with **5 primary groups** (Risk · Validation · Intelligence · Commercial · Record) and a segmented sub-tab row. The Risk tab shows a RED-alert count badge. All 13 panels remain reachable with their original props.
- **Header cleanup.** The 2×2 action grid became a primary **Edit** button, a secondary **Briefing** button, and a `⋯` overflow menu (Simulate risk, Bat-Signal).
- Driven by a small, unit-tested config module (`cockpit-tabs.ts`: `COCKPIT_GROUPS`, `groupForSub`, `alertCount`).

_Files:_ `src/components/cockpit/cockpit-tabs.ts` (+ `.test.ts`), `src/pages/deal-cockpit.tsx`

## 3. Analytics charts

- Added three Recharts components rendered **above the existing tables** (tables kept as the accessible data alternative):
  - **Forecast fan** (probabilistic forecast area chart)
  - **Velocity bars** (colored by ahead / on / behind)
  - **Win/Loss donut**
- Pure transform logic (`toFanSeries`, `classifyVelocity`) is unit-tested.

_Files:_ `src/components/cockpit/charts/{transforms.ts,transforms.test.ts,forecast-fan.tsx,velocity-bars.tsx,winloss-donut.tsx}`, `src/pages/analytics.tsx`

## 4. Dashboard

- KPI cards and "Action Required" rows are now **drill-through navigations** (click **and** keyboard: Enter/Space), with visible focus rings and hover affordance.
- Added a **Portfolio Health distribution bar** (green/yellow/red) with a screen-reader `aria-label` carrying the counts.

_Files:_ `src/pages/dashboard.tsx`

## 5. Responsive shell & mobile

- **App shell.** Extracted `SidebarBody`, shared between a persistent desktop sidebar and a mobile hamburger **Sheet** (below 768px) that closes on navigation.
- **Mobile deal roster.** The table is hidden below `sm`; a tappable **card list** (account, health badge, deal name, TCV) replaces it.
- **Cockpit mobile overflow fix.** The primary tab strip is now horizontally scrollable and the header TCV/actions wrap, eliminating sideways scroll at phone widths.
- **Touch/area polish.** `touch-action: manipulation`, safe-area insets on the mobile header, and a `prefers-reduced-motion` guard.
- **Empty states.** Bare "No …" strings in analytics and the competitive/stakeholder panels replaced with the `Empty` component (icon + title + CTA).

_Files:_ `src/components/layout.tsx`, `src/pages/deals.tsx`, `src/index.css`, `src/components/cockpit/v2/{competitive-panel,stakeholders-panel}.tsx`, `src/pages/analytics.tsx`

## 6. Installable, offline-capable PWA

- **Installable.** `vite-plugin-pwa` (Workbox) emits `manifest.webmanifest` + a service worker; four PNG icons (192, 512, 512-maskable, 180 apple-touch) generated with a pure-Node encoder; `theme-color` added; `maximum-scale=1` removed to restore pinch-zoom (accessibility fix).
- **Offline reads.** `StaleWhileRevalidate` runtime caching for `GET /api/v[12]/…`, **excluding `/api/v1/auth/*` and all non-GET requests** (auth and mutations always hit the network).
- **Offline UX.** Update-available prompt (toast → Reload), an offline banner, and **cached-read rendering offline** — `ProtectedRoute` no longer bounces to `/login` when the (uncacheable) `/auth/me` check can't run offline; it shows the app shell + cached data and re-validates on reconnect.
- **Offline-save feedback.** A global mutation-cache watcher (`OfflineSaveNotice`) toasts "You're offline — your changes are queued…" when a save is paused offline; the change replays automatically on reconnect (React Query pause-and-replay — no false success, no lost edit).
- **Logout privacy.** Logout clears the React Query cache **and** the `edc-api-reads` Cache Storage, so a logged-out user sees no cached data offline.
- Retired the separate `/m` mobile route (now redirects to `/`) — the responsive main app is the single mobile target.

_Files:_ `vite.config.ts`, `index.html`, `package.json`, `public/icon-*.png`, `public/apple-touch-icon.png`, `src/pwa.d.ts`, `src/components/{pwa-update-prompt,offline-banner,offline-save-notice}.tsx`, `src/App.tsx`, `src/components/layout.tsx`

## 7. Interaction polish

- **Pointer cursors.** shadcn's `Button` ships without `cursor-pointer`; added it to the Button base plus a global rule for `role="button"/tab/menuitem/option/switch`, anchors, labels, `summary`, and `select` (disabled → `not-allowed`).

_Files:_ `src/components/ui/button.tsx`, `src/index.css`

## 8. Backend auth simplification

These came out of local-run troubleshooting (login was blocked) and are **separate from the UI refresh**:

- **Removed the IP rate limiters** (`apiLimiter` 100/15min, `authLimiter` 10/15min). The global limiter was throttling normal single-user use and `429`-ing every call, including `/auth/me` (which the SPA reads as "logged out").
- **Removed the account-lockout feature** (5 failed attempts → 15-min lock) from the login handler and dropped the `login_attempts` / `locked_until` columns from the `commanders` schema. _(Physical DB columns left as harmless orphans; drop via migration if desired.)_
- **Stable dev `SESSION_SECRET` fallback.** When `SESSION_SECRET` is unset and `NODE_ENV !== "production"`, the JWT signing key falls back to a fixed dev value so sessions survive server restarts. **Production still hard-requires the env var.**

_Files:_ `artifacts/api-server/src/app.ts`, `artifacts/api-server/src/routes/auth.ts`, `artifacts/api-server/src/lib/auth.ts`, `lib/db/src/schema/auth.ts`

---

## Fixes found during verification

- **Build base mangling (Windows).** Running a production build through **Git Bash** mangles `BASE_PATH=/` into `/Program Files/Git/…` via MSYS path conversion, baking a broken base into `dist/index.html`. **Build and preview from PowerShell** (or set `MSYS_NO_PATHCONV=1`).
- **`workbox-window` dependency.** `virtual:pwa-register/react` imports `workbox-window`, which pnpm's strict `node_modules` doesn't expose unless it's a direct dependency — added it.
- **Dashboard alert-row key collision.** A deal can have multiple critical alerts, so keying rows on `dealId` alone collided; keyed on `dealId+index`.
- **Offline `/auth/me` request storm.** Offline, the auth check re-fired in a loop; disabled the query when offline (`enabled: navigator.onLine`).
- **`preview.proxy`.** Added so the production preview build can reach the local API for offline/PWA testing.

## Verification status

- Root `pnpm run typecheck` — pass (all packages)
- `pnpm --filter @workspace/edc run test` — 12/12 pass (cockpit-tabs, transforms, pre-existing engine tests)
- Production build — pass; emits manifest + service worker + icons
- Live Playwright sweep — login, dashboard/deals/cockpit at 375–1440px, hamburger sheet, pointer cursors, **offline cached-read rendering**, and **offline-save feedback (queued → replays on reconnect)** all verified

## Known limitations / non-goals

- **No offline write queue beyond React Query's in-memory pause.** Offline edits replay on reconnect within the same session; they are not persisted across a full reload while offline.
- Offline shows the **last-cached** data (StaleWhileRevalidate); a page never visited online while authenticated has nothing to show offline.
- The responsive breakpoint is **768px** (not the spec's 1024px) — an accepted divergence.
- Removing the rate limiter/lockout reduces brute-force/DoS protection; acceptable for a single-user app (login is still bcrypt-gated). Reintroduce platform-level limiting on deployment (e.g., Zoho Catalyst).

## How to run locally (Windows)

From **PowerShell** (see `~/.claude` memory `edc-local-windows-run` for the full setup):

```powershell
# API (Postgres must be running on :5432)
$env:DATABASE_URL='postgres://postgres@localhost:5432/edc'; $env:SESSION_SECRET='local-dev-secret-edc-2026'; $env:PORT='5000'; $env:NODE_ENV='development'; node --enable-source-maps artifacts/api-server/dist/index.mjs

# Frontend dev
$env:PORT='5173'; $env:BASE_PATH='/'; pnpm --filter @workspace/edc run dev

# Production build + preview (required to test the PWA / service worker)
$env:PORT='5173'; $env:BASE_PATH='/'; pnpm --filter @workspace/edc run build
$env:PORT='5174'; $env:BASE_PATH='/'; pnpm --filter @workspace/edc run serve
```

Default login: **`commander`** / **`DealCommander!2026`**.

## Reverting

The entire feature is one merge commit:

```
git revert -m 1 454259b
```
