# Todo: Portfolio hard-reload loading flash

See `tasks/plan.md` for full detail, acceptance criteria, and verification steps.

## Phase 1: Portfolio skeleton + kill query waterfall
- [x] Add `PortfolioSkeleton` to `portfolio.tsx`, matching real page geometry
- [x] Subscribe to `useGetProductMix` in parallel with `useGetPortfolioAnalysis`; gate on both
- [x] Loaded state: fade-only entrance (`animate-in fade-in duration-300`)
- [x] Typecheck

## Checkpoint A
- [x] CLS after FCP = 0.00 on throttled reload (Chrome DevTools MCP trace)
- [x] Network waterfall confirms concurrent intelligence requests
- [x] Screenshot confirms skeleton geometry (cards, heatmap, PersonalityLine)

## Phase 2: App shell gate
- [x] Add standalone `AppShellSkeleton` to `App.tsx`, mirroring `layout.tsx` chrome
- [x] Replace `Warming up…` and `null` branches with it

## Checkpoint B
- [x] Shell skeleton title bar aligns with page skeleton title bar (additive transition)
- [x] 767px shows mobile header, no sidebar silhouette
- [x] 768px shows full sidebar silhouette
- [x] Mobile viewport (390×844) confirmed via a11y snapshot
- [x] Offline bypass preserved by construction (conditional untouched); live re-test not possible with available tooling

## Phase 3: Summary-card stagger
- [x] Drop `slide-in-from-bottom-2` from `portfolio-summary-cards.tsx`
- [x] Compress `delayMs` from 0/100/200/300 to 0/40/80/120

## Checkpoint C (Complete)
- [x] Typecheck clean
- [x] CLS = 0 confirmed
- [x] Skeletons visually verified end-to-end
- [x] Ready for review
