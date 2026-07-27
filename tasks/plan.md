# Portfolio page — eliminate the hard-reload loading flash

Status: **Implemented and verified** (2026-07-27).

## Context

On a hard reload of `/portfolio`, a bare "Correlating risk patterns…" line flashed for a split second before the real page appeared. The cause was a **shape swap**, not a missing transition — three frames rendered in sequence with two hard cuts:

| # | What rendered | Source |
|---|---|---|
| 1 | Full-screen `Warming up…`, no sidebar | `App.tsx` — `useGetMe` pending |
| 2 | `p-8 space-y-2` + one line of text, top-left | `portfolio.tsx` — `useGetPortfolioAnalysis` pending |
| 3 | `p-8 max-w-[1600px] mx-auto space-y-8` — full page | `portfolio.tsx` loaded state |

A second, larger shift also existed after frame 3: `ProductMixSection` fired its own `useGetProductMix` query on mount (serialised behind `portfolio-analysis`), replacing a small text card with two tall cards.

**Outcome:** hard reload of `/portfolio` now goes shell skeleton → portfolio skeleton → content fade-in, with CLS = 0 after first paint.

## Scope (as approved)

3 files:
- `artifacts/edc/src/pages/portfolio.tsx` — `PortfolioSkeleton`, parallelized `useGetProductMix`, fade-only entrance.
- `artifacts/edc/src/App.tsx` — standalone `AppShellSkeleton` replacing the bare `Warming up…` / `null` branches.
- `artifacts/edc/src/components/cockpit/portfolio-summary-cards.tsx` — dropped the `slide-in-from-bottom-2` stagger so the 4 summary cards don't pop in one-by-one after the geometry-matched skeleton disappears.

## Architecture decisions

- Skeletons are local to their page (house pattern — matches `CockpitSkeleton` in `deal-cockpit.tsx`). No shared `PageSkeleton` abstraction for a 2-page change.
- CSS `animate-in`/`tw-animate-css`, not framer-motion — matches house vocabulary and is covered by the global `prefers-reduced-motion` kill-switch (`index.css:227-234`).
- Loaded content uses `animate-in fade-in duration-300` (no slide) — geometry is already matched by the skeleton, so a slide would read as a jump.
- `Layout` could not be reused for the shell skeleton (`useCommandPalette()` throws before `CommandPaletteProvider` mounts) — `AppShellSkeleton` is standalone, mirroring `layout.tsx`'s chrome class-for-class.
- Frame 1's content (shell skeleton) is a strict subset of frame 2's (page skeleton) at identical coordinates — the transition is additive, not a swap.
- No artificial delay before showing a skeleton — on hard reload the alternative is a blank white document.
- `hidden md:flex` (768px) for the shell's sidebar, not `useIsMobile()` — exact breakpoint match, and correct on the very first paint (the hook returns `false` initially).

## Verification performed

- `pnpm --filter @workspace/edc run typecheck` — clean.
- Chrome DevTools MCP performance trace on a throttled (4× CPU / Slow 4G) reload of `/portfolio`: **CLS after FCP = 0.00**.
- Network waterfall: `/api/v1/intelligence/portfolio-analysis` and `/api/v1/intelligence/product-mix` now resolve concurrently (previously serialized).
- Screenshots (via a `fetch` delay injected through `initScript`, since Vite dev's ~300 unbundled module requests dominate DevTools network/CPU throttling and made the real loading window uncatchable otherwise) confirm:
  - `PortfolioSkeleton` renders with matching geometry (4 summary cards, heatmap, `PersonalityLine` in the header slot).
  - `AppShellSkeleton` renders with the sidebar silhouette, and its title bar aligns pixel-for-pixel with the Portfolio skeleton's title bar — confirming the additive-transition design.
  - 767px shows the mobile header (no sidebar silhouette); 768px shows the full sidebar silhouette.
  - 390×844 mobile viewport confirmed via accessibility-tree snapshot (single header, no duplicates).
- Offline path: the `if (!offline)` conditional wrapping the shell-skeleton branches was not touched by this change (only the return values inside it were swapped), so the existing offline bypass is preserved by construction. Live re-test wasn't possible — the DevTools MCP "Offline" preset throttles bandwidth but does not flip `navigator.onLine` in this environment.

## Follow-ups (out of scope, noted but not actioned)

- `dashboard.tsx`'s skeleton omits `max-w-[1600px] mx-auto`, so content snaps narrower on load.
- `settings.tsx` and `share.tsx` still use bare-text loading states.
- `ProductMixSection`'s own loading branch (`components/cockpit/product-mix-section.tsx`) is still bare text; not a visible issue for Portfolio anymore since the query is now parallelized and gated, but other consumers of that component would still see it.
