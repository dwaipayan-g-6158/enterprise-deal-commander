# Usage Guide

How to use each screen of the cockpit. This complements the [Quick Start](./quickstart.md)
tutorial with screen-by-screen detail and common workflows.

- [Navigation map](#navigation-map)
- [Dashboard](#dashboard)
- [Deals list & Roster](#deals-list--roster)
- [Deal Cockpit](#deal-cockpit)
- [Risk governance & the Simulator](#risk-governance--the-simulator)
- [Executive Briefing / War Room](#executive-briefing--war-room)
- [Portfolio](#portfolio)
- [Autopsy (Closed-Lost)](#autopsy-closed-lost)
- [Analytics](#analytics)
- [Deal Memory](#deal-memory)
- [Settings](#settings)
- [Common workflows](#common-workflows)
- [Screenshots](#screenshots)

## Navigation map

The SPA routes (from `artifacts/edc/src/App.tsx`):

| Route | Screen | Auth |
|---|---|---|
| `/login` | Login | public |
| `/share/:token` | Bat-Signal shared risk card | public (token) |
| `/` | Dashboard | protected |
| `/deals` | Deals list / Roster | protected |
| `/deals/:id` | Deal Cockpit | protected |
| `/portfolio` | Portfolio correlation | protected |
| `/autopsy` | Closed-Lost autopsy | protected |
| `/analytics` | Analytics (velocity, pipeline, flow) | protected |
| `/memory` | Deal Memory knowledge hub | protected |
| `/memory/:id` | Deal Memory detail | protected |
| `/settings` | Settings / configuration | protected |

Protected routes are wrapped by `ProtectedRoute`, which checks the session (`/auth/me`) and is
offline-aware (the PWA keeps showing cached reads when the network drops). A **command palette**
(⌘K / Ctrl-K style) is available on every protected screen.

## Dashboard

The landing decision surface. It answers, at a glance: how much money is at stake, what's
broken, where deals are stuck, what to do next, whether the forecast is real, and what changed.
Expect a "Pipeline Vital Signs" big-numbers bar plus health, forecast, velocity and win/loss
visuals.

## Deals list & Roster

`/deals` is the page the Commander lives on — a triage surface that replaces a spreadsheet. It
supports filtering (by stage / health / velocity), saved views, an inline preview, and a
**Kanban board** where dragging a card between stages performs a stage transition (subject to the
`409` guardrail + override). Deals carry health color, per-deal risk score, forecast flags, and
score-trend arrows.

## Deal Cockpit

`/deals/:id` is the full operational workspace for a single deal. Typical panels:

- **Header / economics** — account, stage, TCV and normalized TCV, close date, win probability.
- **Technical gates** — the 9-point matrix grouped into gate groups; toggle to complete, with
  prerequisite integrity warnings.
- **Risk** — health color, pattern alerts (expandable to glass-box explanations), risk radar and
  score card across the 7 dimensions, recommended actions.
- **Blockers** — log/resolve blockers by category and severity; high-severity blockers raise
  risk.
- **Cross-sell** — pitched vs whitespace products and attach-rate; product-mix recommendations
  (next-best-product, suite bundle, recovery gap).
- **Trajectory / history** — deal trajectory, activity feed, point-in-time snapshot viewer, and
  change digest (Phase 2 / temporal features).

## Risk governance & the Simulator

- **Disposition an alert:** choose Acknowledge / Accept / Snooze and enter a required rationale.
  The alert becomes "Managed Risk" and leaves the headline critical count. Everything is audited
  and visible in the in-cockpit audit-trail viewer.
- **Risk Simulator:** a client-side, non-persisted what-if. Adjust stage/gates/economics and
  preview the resulting health and alerts. It runs the *same* engine as the server, so the
  preview matches what a real save would produce (minus persistence).

## Executive Briefing / War Room

A presentation overlay designed to be projected without reformatting:

- **Agenda queue** — curate which deals to walk through and in what order.
- **Speaker notes** — private notes that are **never projected or exported** (two export paths
  exist — an image capture and a print path — and presenter-private content is kept outside both;
  see the `briefing-export-privacy` memory note).
- **Pacing timer** — keep the review on schedule.
- **Bat-Signal** — generate a 48-hour signed, read-only link to one deal's risk card for a
  stakeholder who doesn't use EDC.

## Portfolio

`/portfolio` gives a current-state cross-section: which account managers, technical leads, and
products correlate with currently-triggered alerts, plus simple cycle-time views and a Pipeline
Risk Overview.

## Autopsy (Closed-Lost)

`/autopsy` is the structured loss analysis. When a deal is Closed-Lost, a **loss archetype** is
required. The autopsy view runs deterministic correlation across losses (by archetype, AM, TL,
product, competitor) so patterns in *why* deals are lost become visible.

## Analytics

`/analytics` hosts the Phase 2 analytical modules: **velocity** and **pipeline** analytics, and
the **Flow** tab — funnel, conversion matrix, Sankey stage transitions, recycle/exit analysis, a
coverage tracker, pipeline pulse, and a composite health score.

## Deal Memory

`/memory` is the institutional knowledge hub — a tabbed, faceted, highlighted search over closed
deals with detail pages (`/memory/:id`), narrative & autopsy, competitive and pricing
intelligence, playbook-effectiveness, deal comparison, and an "Ask Deal Memory" deterministic
advisor.

## Settings

`/settings` is the configuration surface: engine thresholds and dimension/model weights,
automation rules, and integrations — with an auditable change log (list / get / rollback /
export). See [configuration.md](./configuration.md).

## Common workflows

| Goal | Path |
|---|---|
| Onboard a new deal | Deals → New → fill economics → start in Discovery |
| Advance a stage safely | Deal Cockpit → change stage → resolve or override any `409` guardrail |
| Clear a risk alert | Complete the action in the alert's "clears when", or disposition it with a rationale |
| Prepare a board review | Briefing mode → build agenda → add speaker notes → run the timer |
| Loop in a non-user | Deal Cockpit → Bat-Signal → share the 48h link |
| Understand a loss | Close-Lost with an archetype → Autopsy → review correlations |
| Tune the engine | Settings → adjust thresholds/weights → review change log |

## Screenshots

> 📸 _Placeholders — capture real screenshots by running the stack ([quickstart.md](./quickstart.md))
> and driving each screen. Store under `docs/assets/` and reference them here._

- `docs/assets/dashboard.png` — Dashboard / Pipeline Vital Signs
- `docs/assets/deal-cockpit.png` — Deal Cockpit with gates + risk
- `docs/assets/briefing-mode.png` — Executive Briefing / War Room
- `docs/assets/risk-radar.png` — Risk Engine v2 radar
- `docs/assets/flow-analytics.png` — Pipeline Flow (funnel + Sankey)
