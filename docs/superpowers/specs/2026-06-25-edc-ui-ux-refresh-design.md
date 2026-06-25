# Deal-Commander UI/UX Refresh — Design Spec

**Date:** 2026-06-25
**Status:** Approved (design)
**Scope:** Frontend-only refresh of `artifacts/edc` (P0–P3 from the UI/UX audit)

---

## Goal

Make the Deal Commander cockpit and surrounding pages legible, navigable, and visually intentional — without touching the API contract, database schema, or engine. The two headline problems: a 13-tab cockpit strip that wraps and cramps, and an "analytics" page with zero charts. Plus hierarchy, drill-through, responsiveness, and accessibility fixes — and shipping the result as an installable, offline-capable PWA optimized for phones.

## Non-Goals (YAGNI)

- No new API endpoints, Zod schemas, Orval codegen, or Drizzle schema changes. This is a pure client refresh.
- No icon-library swap (keep `lucide-react`).
- No rework of the Briefing Mode internals. (The standalone `/m` route is **retired** and redirected to the responsive main app — see Section 8.)
- No new product data — charts/visuals render from data already returned by existing endpoints.
- No offline write/sync queue — offline is read-only (app-shell + cached GETs). Mutations require a live connection.

## Constraints

- Stack: React 19 + Vite + Tailwind v4 + shadcn/ui + wouter + @tanstack/react-query (unchanged).
- Reuse primitives already vendored in `artifacts/edc/src/components/ui/*`: `tabs`, `sidebar`, `sheet`, `chart` (Recharts), `empty`, `dropdown-menu`, `badge`, `card`.
- The repo is **not** a git repo — verification is `pnpm run typecheck` + `pnpm run build` + Vitest + Playwright screenshots, not commits.
- Health/severity semantic colors (red/amber/emerald) are reserved and must never be reused as the UI accent.
- PWA tooling: add `vite-plugin-pwa` (dev dependency; Workbox under the hood). It honors the workspace `minimumReleaseAge: 1440` supply-chain policy (established package) and is Catalyst-portable — it emits a static manifest + service worker served as plain assets.
- Decisions locked: **Grouped two-level tabs · All P0–P3 · restrained indigo accent (`#5b8cff`) · installable PWA with app-shell + cached-read offline · responsive main app as the single mobile target**.

---

## Decisions (locked)

| Fork | Decision |
|------|----------|
| Cockpit tab pattern | Grouped two-level tabs (5 primary groups → segmented sub-tabs) |
| Plan scope | All P0–P3 + PWA |
| Color direction | Single restrained indigo accent `#5b8cff`; semantic colors stay separate |
| Offline depth | App-shell cached + cached reads (stale-while-revalidate GETs); no offline writes/sync |
| Mobile/PWA target | Responsive main app is the installed PWA; `/m` route retired/redirected |

---

## Architecture

All changes live under `artifacts/edc/src` (plus `vite.config.ts`, `index.html`, and `public/` for the PWA). Work proceeds in eight slices, each independently shippable and testable, in this order:

```
1. Tokens/color  → index.css
2. Cockpit tabs  → cockpit/cockpit-tabs.ts (new) + deal-cockpit.tsx
3. Header        → deal-cockpit.tsx
4. Charts        → cockpit/charts/* (new) + pages/analytics.tsx
5. Dashboard     → pages/dashboard.tsx
6. Responsive    → components/layout.tsx
7. Polish        → empty states, typography, a11y (cross-cutting)
8. PWA/offline   → vite.config.ts, index.html, public/icons, App.tsx (retire /m)
```

Slice 8 (PWA) runs last because it depends on the responsive shell (6) and the touch-target/a11y work (7) being in place — an installable app that isn't mobile-usable is not done.

Pure logic (tab config shape, severity counts, chart data transforms) is extracted into small functions with Vitest unit tests. Visual/interaction changes are verified with Playwright at 375 / 768 / 1024 / 1440 px plus click-throughs.

---

## Section 1 — Color & token foundation

**Files:** `artifacts/edc/src/index.css`

Today `--primary` is a desaturated slate (`220 20% 25%` light / `210 20% 98%` dark) so buttons, active nav, and focus rings read as grey-on-grey. Introduce an indigo accent and repoint primary + ring to it.

Add to both `:root` and `.dark` blocks (HSL channels, matching existing convention):

```css
/* :root (light) */
--primary: 222 90% 67%;        /* #5b8cff */
--primary-foreground: 0 0% 100%;
--ring: 222 90% 67%;

/* .dark */
--primary: 222 90% 67%;
--primary-foreground: 220 10% 10%;
--ring: 222 90% 67%;
```

Notes:
- The solid accent IS `--primary` after this repoint — `bg-primary` / `text-primary` (shadcn Button default + active nav) light up automatically. No new token is introduced.
- Leave `--accent` / `--accent-foreground` untouched: shadcn uses those for *hover surfaces* (muted grey), a different role. Do not repurpose them as the indigo.
- Keep neutrals on their current 220 cool hue (already biased toward the accent — leave as-is).
- Soft/border tints are expressed inline in Tailwind as `bg-primary/10`, `border-primary/40` — no extra tokens needed.

**Acceptance:** Default `Button`, active sidebar nav item, and keyboard focus rings render indigo in both themes; no health badge changes color.

---

## Section 2 — Cockpit tab restructure (P0)

**Files:** create `artifacts/edc/src/components/cockpit/cockpit-tabs.ts`; modify `artifacts/edc/src/pages/deal-cockpit.tsx:298-444`.

### Config module

`cockpit-tabs.ts` exports the grouping as data so the JSX stays declarative:

```ts
import type { LucideIcon } from "lucide-react";
import { ShieldAlert, Activity, Gauge, DollarSign, ScrollText } from "lucide-react";

export interface SubTab { id: string; label: string }
export interface TabGroup { id: string; label: string; icon: LucideIcon; subs: SubTab[] }

export const COCKPIT_GROUPS: TabGroup[] = [
  { id: "risk",       label: "Risk",         icon: ShieldAlert, subs: [
      { id: "risk", label: "Alerts" }, { id: "coaching", label: "Coaching" }, { id: "blockers", label: "Blockers" } ] },
  { id: "validation", label: "Validation",   icon: Activity,    subs: [
      { id: "technical", label: "Technical Gates" }, { id: "playbook", label: "Playbook" } ] },
  { id: "intel",      label: "Intelligence", icon: Gauge,       subs: [
      { id: "score", label: "Score" }, { id: "competitive", label: "Competitive" }, { id: "stakeholders", label: "Stakeholders" } ] },
  { id: "commercial", label: "Commercial",   icon: DollarSign,  subs: [
      { id: "pricing", label: "Pricing" }, { id: "crosssell", label: "Cross-Sell" } ] },
  { id: "record",     label: "Record",       icon: ScrollText,  subs: [
      { id: "activity", label: "Activity" }, { id: "decisions", label: "Decisions" }, { id: "history", label: "History" } ] },
];

/** Map a sub-tab id back to its group id (for deep-linking / default selection). */
export function groupForSub(subId: string): string | undefined {
  return COCKPIT_GROUPS.find((g) => g.subs.some((s) => s.id === subId))?.id;
}
```

Sub-tab ids reuse the existing `TabsContent` value strings already in `deal-cockpit.tsx` (`risk`, `coaching`, `technical`, `blockers`, `crosssell`, `activity`, `history`, `score`, `competitive`, `stakeholders`, `decisions`, `playbook`, `pricing`) so the panel components below need no prop changes.

### Cockpit JSX

Replace the single flat `TabsList` (13 `TabsTrigger`) with nested Tabs:

- Outer `Tabs value={group} onValueChange={setGroup}` renders one `TabsTrigger` per `COCKPIT_GROUPS` entry (icon + label + optional count badge).
- Inside the active group, a second segmented `Tabs value={sub} onValueChange={setSub}` renders that group's sub-tabs, then the matching panel.
- State: `const [group, setGroup] = useState("risk")` and `const [sub, setSub] = useState("risk")`. When `group` changes, set `sub` to that group's first sub id.
- The 13 existing panel components (`RiskGovernance`, `NextBestAction`, `TechnicalGates`, `BlockersPanel`, `CrossSellPanel`, `ActivityFeed`, `HistoryPanel`, `ScorePanel`, `CompetitivePanel`, `StakeholdersPanel`, `DecisionsPanel`, `PlaybookPanel`, `PricingPanel`) are rendered under their sub-tab, unchanged.

### Severity badges

Add a pure helper (unit-tested) that counts open RED/critical items for badge display:

```ts
// in cockpit-tabs.ts or a sibling
export function alertCount(alerts: { severity?: string }[] | undefined): number {
  return (alerts ?? []).filter((a) => a.severity === "RED").length; // engine Severity = "RED"|"YELLOW"|"GREEN"
}
```

The Risk group trigger shows `alertCount(intel.governance.alerts)` when > 0, styled `bg-primary/10 text-primary`-style pill (or red pill for severity). Blockers badge is deferred if no count is available client-side without an extra fetch — acceptable to show Risk badge only in v1.

**Acceptance:** cockpit shows exactly 5 primary tabs that never wrap at ≥768px; clicking a group shows its sub-tabs and defaults to the first; all 13 panels reachable; Risk is the landing tab with a count badge when alerts are RED.

---

## Section 3 — Cockpit header cleanup (P1)

**Files:** `artifacts/edc/src/pages/deal-cockpit.tsx:212-233`.

Replace the 2×2 `grid grid-cols-2` of four equal buttons with:
- `Edit` — solid primary (`<Button>`).
- `Briefing` — `<Button variant="secondary">`.
- A `DropdownMenu` triggered by a `⋯` icon button (`MoreHorizontal`) containing `Simulate`, `Bat-Signal`, and `Export & share`.

Wire the menu items to the existing handlers (`setSimOpen`, `setBatOpen`, and the briefing/export path). Keyboard shortcuts (Ctrl+B briefing, Ctrl+S save) are unaffected.

**Acceptance:** header shows one primary + one secondary + overflow menu; all four original actions still reachable; no layout shift on narrow widths.

---

## Section 4 — Analytics visualizations (P0)

**Files:** create `artifacts/edc/src/components/cockpit/charts/forecast-fan.tsx`, `velocity-bars.tsx`, `winloss-donut.tsx`; modify `artifacts/edc/src/pages/analytics.tsx`.

Use the vendored `components/ui/chart.tsx` (Recharts wrapper). Chart series use the existing `--chart-1..5` CSS vars; set the primary series (forecast median, velocity bars) to the indigo accent so charts read as part of the refreshed system. Verify the current `--chart-*` values in `index.css` first and adjust `--chart-1` to the accent if needed.

- **Probabilistic forecast → area "fan" chart.** Transform the p10/p25/p50/p75/p90 object into a series; render a layered Area (p10–p90 band, p25–p75 band, p50 line). The existing number row becomes a small caption beneath. Transform is a pure function:

```ts
export interface Forecast { p10: number; p25: number; p50: number; p75: number; p90: number }
export function toFanSeries(f: Forecast) {
  return [
    { k: "P10", band: f.p10 }, { k: "P25", band: f.p25 }, { k: "P50", band: f.p50 },
    { k: "P75", band: f.p75 }, { k: "P90", band: f.p90 },
  ];
}
```

- **Velocity → horizontal bar chart** with a benchmark `ReferenceLine`; the delta (days − benchmark) drives bar color (over benchmark = amber/red, at/under = neutral/emerald). Keep the table below the chart as the accessible data alternative (`data-table` guideline).
- **Win/Loss → donut** when closed deals exist; otherwise the Section 7 empty-state component.

All three chart components accept already-fetched data as props (the page keeps its existing hooks); they own no data fetching.

**Acceptance:** analytics page renders three visualizations from live data; forecast band and velocity benchmark are visible; empty win/loss shows a proper empty state; underlying tables remain for accessibility.

---

## Section 5 — Dashboard drill-through + fill (P1)

**Files:** `artifacts/edc/src/pages/dashboard.tsx`.

- Make the four KPI cards clickable and keyboard-activatable (wrap in `<button>`/`role` + `cursor-pointer` + hover + focus-visible): Total TCV → `/portfolio`; Critical Alerts → `/deals` (health filter where supported); Stale Deals → `/deals`; Health Status → `/portfolio`.
- Make each "Action Required" row a link to `/deals/:id` (the summary already carries `dealId`).
- Fill the empty lower half: add a compact health-distribution bar (GREEN/YELLOW/RED) or pipeline-by-stage mini-chart using the same Recharts wrapper and the summary data already fetched.

**Acceptance:** every KPI card and alert row navigates on click and Enter; visible hover/focus affordance; no large dead vertical band at 1440px.

---

## Section 6 — Responsive app shell (P1)

**Files:** `artifacts/edc/src/components/layout.tsx`.

Below the `lg` breakpoint, the fixed 256px sidebar collapses:
- Add a slim top bar (visible `< lg`) with the EDC wordmark and a hamburger button.
- Hamburger opens the existing nav inside a `Sheet` (left side).
- `≥ lg`: current persistent sidebar unchanged; main content full-width on small screens.
- Use `use-mobile` hook + `sheet.tsx`. Active-route highlighting and logout/theme/user block move into the sheet on small screens.

This responsive shell is the **PWA target** (Section 8) — the experience users install on phones. The dedicated `/m` route is retired there.

**Acceptance:** at 375/768 the sidebar is a hamburger→sheet; at 1024/1440 the persistent sidebar shows; no horizontal body scroll at any width.

---

## Section 7 — Empty states, typography, accessibility (P2 + P3)

**Files:** `pages/analytics.tsx`, `components/cockpit/v2/competitive-panel.tsx`, `components/cockpit/v2/stakeholders-panel.tsx`, `index.css`, and clickable rows across `pages/deals.tsx` / `pages/dashboard.tsx`.

- **Empty states:** replace bare strings ("No competitor encounters logged.", "No closed deals yet…") with the `empty.tsx` pattern: icon + one line + a CTA (e.g. "Log a competitor"). Apply to analytics win/loss + competitive, cockpit competitive + stakeholders.
- **Typography:** reserve uppercase `tracking-wider` for section/KPI labels; convert inline field labels to normal-case `text-muted-foreground`; ensure body text ≥16px on mobile; keep long advisory text within a readable measure.
- **Accessibility:**
  - `cursor-pointer` + hover + `focus-visible` on every clickable row/card (deal roster rows, dashboard cards/alerts).
  - Pair color-only health indicators (dashboard health counts) with a text label or `aria-label`.
  - Gate the `animate-in fade-in slide-in-*` page transitions behind `@media (prefers-reduced-motion: no-preference)` (or remove for reduced-motion users).
  - Deal roster rows become keyboard-activatable (Enter navigates).

**Acceptance:** no bare-string empty states on the listed surfaces; clickable elements show affordance and take keyboard focus; reduced-motion users get no slide/fade; health is not conveyed by color alone.

---

## Section 8 — PWA & mobile optimization

**Files:** modify `artifacts/edc/vite.config.ts`, `artifacts/edc/index.html`, `artifacts/edc/src/App.tsx`; create app icons under `artifacts/edc/public/` (`icon-192.png`, `icon-512.png`, `icon-512-maskable.png`, `apple-touch-icon.png`); add `artifacts/edc/src/components/pwa-update-prompt.tsx` and `artifacts/edc/src/components/offline-banner.tsx`; add `vite-plugin-pwa` to `artifacts/edc/package.json` (dev dep).

### Installability (manifest)

Add `VitePWA` to `vite.config.ts` with `registerType: "prompt"` and an inline manifest:

```ts
VitePWA({
  registerType: "prompt",
  includeAssets: ["apple-touch-icon.png", "favicon.ico"],
  manifest: {
    name: "Enterprise Deal Commander",
    short_name: "EDC",
    description: "Deal Commander cockpit — economics, validation gates, and risk intelligence.",
    theme_color: "#15171a",
    background_color: "#15171a",
    display: "standalone",
    start_url: "/",
    scope: "/",
    icons: [
      { src: "/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png" },
      { src: "/icon-512-maskable.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  },
  workbox: { /* see below */ },
})
```

`index.html` gets/keeps: `<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">`, `<meta name="theme-color" content="#15171a">`, and an `apple-touch-icon` link (the plugin injects the manifest link).

### Offline strategy (Workbox runtime caching)

App shell (built JS/CSS/HTML/icons) is precached by the plugin's `generateSW`. SPA navigation falls back to the precached `index.html`. Runtime caching rules:

- **Read APIs → `StaleWhileRevalidate`.** Match GETs to read endpoints only: `/api/v1/deals`, `/api/v1/deals/:id`, `/api/v1/deals/:id/intelligence`, `/api/v1/intelligence/summary`, `/api/v1/lookups/*`, `/api/v2/*` GETs. Cache name `edc-api-reads`, `maxEntries: 60`, `maxAgeSeconds: 86400`. This makes last-seen data viewable offline.
- **Auth + mutations → `NetworkOnly`.** Never cache `/api/v1/auth/*` (login/logout/me) or any non-GET (POST/PUT/PATCH/DELETE). Stale auth or stale writes would be wrong/dangerous.
- Workbox config sketch:

```ts
workbox: {
  navigateFallback: "/index.html",
  navigateFallbackDenylist: [/^\/api\//],
  runtimeCaching: [
    { urlPattern: ({url, request}) => request.method === "GET" && /\/api\/v[12]\//.test(url.pathname)
        && !/\/api\/v1\/auth\//.test(url.pathname),
      handler: "StaleWhileRevalidate",
      options: { cacheName: "edc-api-reads", expiration: { maxEntries: 60, maxAgeSeconds: 86400 } } },
  ],
}
```

### Privacy: clear caches on logout

Because cached API responses persist in CacheStorage on the device, the logout handler (`components/layout.tsx` `handleLogout`) must clear them: `caches.keys()` → delete `edc-api-reads` (and call `queryClient.clear()`). This prevents the next user on a shared device from reading the previous commander's cached deals.

### Update flow

With `registerType: "prompt"`, a new service worker waits instead of auto-activating. `pwa-update-prompt.tsx` uses `virtual:pwa-register/react`'s `useRegisterSW` to detect `needRefresh` and shows a toast (existing `use-toast`) — "New version available" with a **Reload** action calling `updateServiceWorker(true)`. Mount it once in `App.tsx`.

### Offline indicator

`offline-banner.tsx` listens to `online`/`offline` events and renders a slim, non-blocking banner ("Offline — showing last-synced data") when `navigator.onLine` is false. Mount once in `App.tsx` (or `layout.tsx`). Respects `prefers-reduced-motion`.

### Mobile UI optimization (beyond the Section 6 shell)

- **Retire `/m`:** remove the `MobileHome` route from `App.tsx` and add a redirect `/m` → `/`. Delete the nav entry if any. (`pages/mobile.tsx` may stay in-tree unused or be removed; the read-first card pattern is folded into the responsive deals roster below.)
- **Deal roster on phones:** below `sm`, the roster table (`pages/deals.tsx`) renders as a stacked card list (account, deal, health badge, TCV) instead of a horizontally-cramped table — reusing the card shape from the old `/m` view. Other wide tables (pricing, velocity) keep an `overflow-x: auto` container.
- **Touch targets ≥44×44px:** audit and pad icon buttons, the cockpit sub-tab segmented control, header `⋯` menu, and nav rows for comfortable tapping.
- **Safe areas:** apply `env(safe-area-inset-*)` padding to the mobile top bar and any sticky elements so content clears notches/home indicators (paired with `viewport-fit=cover`).
- **Tap behavior:** set `touch-action: manipulation` on interactive controls to remove tap delay; ensure momentum scrolling on scroll containers.

### Acceptance

- `pnpm --filter @workspace/edc run build` emits `manifest.webmanifest` + `sw.js`; manifest fetches 200 with all icons.
- In a mobile-emulated Playwright context: app installable criteria met (manifest + SW registered); after one online load, toggling the context offline and reloading still renders the app shell and last-cached deal data; mutations while offline fail gracefully (no silent success).
- Logout clears `edc-api-reads`; a subsequent offline reload shows no cached deal data.
- `/m` redirects to `/`; the deals roster is a usable card list at 375px with no horizontal scroll; primary touch targets are ≥44px.

---

## Testing strategy

- **Unit (Vitest, TDD):** `groupForSub`, `alertCount`, `toFanSeries`, velocity-delta classifier, any health-distribution transform. Test files sit beside source as `*.test.ts(x)`.
- **Typecheck/build gate:** `pnpm run typecheck` then `pnpm run build` after every slice.
- **Visual/interaction (Playwright):** screenshot cockpit (5 tabs, sub-tab switching, header menu), analytics (three charts), dashboard (drill-through + filled layout), shell at 375/768/1024/1440. Confirm zero console errors.
- **PWA/offline (Playwright):** build the app; assert `manifest.webmanifest` + `sw.js` exist and the manifest serves 200 with all icons; in a mobile-emulated context confirm SW registration, then toggle the context offline, reload, and assert the app shell + last-cached deal data render; assert an offline mutation fails (no false success); assert logout clears `edc-api-reads`.
- No backend/codegen tests — contract is untouched.

## Risks & mitigations

- **Token repoint touches many components at once.** Mitigate by shipping Section 1 first and screenshotting key pages before/after; health colors are independent so they can't regress.
- **Nested Tabs state.** Keep state minimal (`group` + `sub`, reset sub on group change) — covered by the config helper's unit test and a Playwright click-through.
- **Recharts bundle size.** Already a dependency (`chart.tsx`); no new top-level dep.
- **Service worker serves stale assets after deploy.** `registerType: "prompt"` + the update toast forces an explicit reload; never use a silent cache that pins old builds. In dev, the SW is disabled by default (only built/preview output registers it) to avoid HMR interference.
- **Cached deal data on a shared device.** Logout clears `edc-api-reads` and the React Query cache; only GET reads are cached, never auth or writes.
- **`vite-plugin-pwa` is a new dependency.** Dev-only, established package, satisfies `minimumReleaseAge: 1440`; emits static assets so it doesn't affect the planned Catalyst migration.
