# Changelog

All notable changes to Enterprise Deal Commander are documented here.

The format is loosely based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and the project aims to follow [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

> **Note on provenance:** This project has **no git tags or prior releases** yet, and the
> package version is pinned at `0.0.0`. The milestone versions below are **inferred from the
> commit history** (~159 commits between 2026-06-10 and 2026-07-16) and grouped by feature epoch
> for readability. Version numbers and dates are approximate, not authoritative release markers.
> See [`docs/release-process.md`](./docs/release-process.md) for the intended versioning strategy.

## [Unreleased]

### Added
- **Deal Roster & Kanban.** Roster page with a Kanban board (drag-to-move stages with `409` override handling), timeline view, forecast flags, next-best-action, and score-trend arrows.
- **Deal-revival watch** and a **product-gap register** feeding roster enrichment.
- Single-origin hosting: the built SPA is served directly from the Express API process.

### Changed
- Engine tuning weights (predictive scoring, portfolio risk, pipeline health, risk dimensions) are now read from configuration instead of hardcoded values.

## [0.6.0] — Settings backend foundation (inferred)

### Added
- **Settings audit API**: list / get / rollback / export of configuration changes.
- Audit-log wiring across mutation types; audit + automation database schema.
- Configurable engine thresholds and dimension/model weights persisted and surfaced through the settings layer.

## [0.5.0] — Deal Memory & Knowledge Hub (inferred)

### Added
- Tabbed **Knowledge Hub** with faceted, highlighted search and deal detail pages.
- **Narrative & Autopsy**, **Competitive Intelligence**, and **Pricing Intelligence** views.
- **"Ask Deal Memory"** deterministic advisor and side-by-side **deal comparison**.
- Playbook-effectiveness analytics.

## [0.4.0] — Pipeline Flow Analytics (inferred)

### Added
- Flow analytics: **funnel**, **conversion matrix**, **Sankey transitions**, **recycle/exit** analysis, **coverage tracker**, **pipeline pulse**, and a composite **health score**.
- `pipeline_transitions` and `pipeline_targets` tables (in `edc_v2`) with an event subscriber that records stage transitions, plus a backfill script.
- New `/api/v2/analytics/flow/*` endpoints in the OpenAPI contract.

## [0.3.0] — Risk Engine v2.0 (inferred)

### Added
- **Risk Engine v2**: a continuous 0–100 composite score across **7 independent risk dimensions** (technical readiness, commercial alignment, stakeholder coverage, temporal pressure, financial structure, competitive exposure, engagement vitality).
- **Risk radar** chart, `RiskScoreCard`, per-deal risk in the roster, and a Pipeline Risk Overview widget.
- Isomorphic Risk Simulator parity tests.

### Changed
- Governance health (RED / YELLOW / GREEN) is now derived from the composite risk level rather than the legacy pattern-weight roll-up. RED risk patterns still gate stage advancement independently.

## [0.2.0] — UI/UX refresh, PWA & Phase 2 backbone (inferred)

### Added
- **PWA**: installable app with manifest, `vite-plugin-pwa`, and offline caching of read endpoints.
- UI refresh: indigo accent + chart tokens, grouped cockpit tabs, forecast / velocity / win-loss charts, responsive app shell, animated EDC logo, redesigned login.
- **Phase 2 durable backbone**: in-process event bus, activity/health history, snapshot service, precomputed portfolio rollups, and a cache layer with a generation guard.
- Point-in-time **snapshot viewer** and intelligence-engine pattern tests.

### Removed
- Account-lockout and IP-based rate limiters (see [`docs/security.md`](./docs/security.md) for the current posture).

## [0.1.0] — Phase 1 foundation (inferred)

### Added
- Initial monorepo bootstrap (pnpm workspace, contract-first codegen, Drizzle schema).
- Core API + cookie-session authentication (HS256 JWT + bcrypt).
- Deal cockpit, 9-point technical gate matrix, blockers, cross-sell whitespace.
- Deterministic intelligence engine (risk patterns) with glass-box explanations.
- Ephemeral **Risk Simulator** and Executive Briefing ergonomics.

[Unreleased]: https://github.com/dwaipayan-g-6158/enterprise-deal-commander/commits/main
