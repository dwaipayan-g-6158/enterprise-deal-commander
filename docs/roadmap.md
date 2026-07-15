# Roadmap & Product Proposals

This page maps the product vision to what has actually shipped, and indexes the standalone
improvement proposals. Product intent lives in the PRDs under [`product/`](./product/); shipped
status is inferred from the code, commit history, and engineering memory — treat it as a guide,
not a contract.

- [Phase 1 — shipped](#phase-1--shipped)
- [Phase 2 — status](#phase-2--status)
- [Improvement proposals](#improvement-proposals)
- [Planned: Zoho Catalyst migration](#planned-zoho-catalyst-migration)

## Phase 1 — shipped

Phase 1 ("Executive War Room Edition") is functionally complete: the deal cockpit, 9-point gate
matrix, blockers, cross-sell whitespace, the deterministic risk engine with glass-box
explanations, risk governance (dispositions), stage guardrails, the ephemeral Risk Simulator,
Closed-Lost autopsy, portfolio correlation, soft-delete/archive/restore, and the Executive
Briefing / Bat-Signal surfaces all exist in the codebase. See [overview.md](./overview.md#feature-catalog)
for the F1–F14 breakdown.

## Phase 2 — status

Phase 2 ("Sovereign Intelligence Edition") is partially delivered. Verified as present in the
codebase (routes, engine modules, schema, and UI):

| Area | Status | Evidence |
|---|---|---|
| Durable history backbone (event bus, activity, health history, snapshots, rollups) | ✅ Shipped | `edc_v2` schema, `events.ts`, subscribers, `/api/v2` history routes |
| **Risk Engine v2** (7-dimension composite, radar, drives health) | ✅ Shipped | `dimensions.ts`, `risk-v2.ts`, `risk/` components |
| Predictive scoring | ✅ Shipped | `scoring.ts`, `/api/v2/deals/{id}/score`, `scores/recalculate` |
| **Pipeline Flow Analytics** (funnel, conversion matrix, Sankey, recycle, coverage, health-score) | ✅ Shipped | `flow.ts`, `/api/v2/analytics/flow/*`, Analytics → Flow tab |
| Velocity & pipeline analytics | ✅ Shipped | `/api/v2/analytics/velocity`, `pipeline`, `simulation` |
| **Deal Memory** knowledge hub (tabs, faceted search, detail, compare, "Ask") | ✅ Shipped | `/api/v2/memory/*`, `/memory` + `/memory/:id` pages |
| Competitive intelligence | ✅ Shipped | `competitive.ts`, `/api/v2/analytics/competitive*`, `v2/competitive-panel` |
| Win/loss post-mortem & loss-risk | ✅ Shipped | `/api/v2/analytics/win-loss`, `loss-risk`, post-mortem subscriber |
| Stakeholders, decisions, meetings | ✅ Shipped | `/api/v2/deals/{id}/stakeholders`, `decisions`, `meeting-sessions` |
| Playbooks & next-best-action | ✅ Shipped | `playbooks`, `playbook-assignments`, `next-actions` |
| Custom risk-pattern builder | ✅ Shipped | `custom-patterns.ts`, `/api/v2/custom-patterns*` |
| Ramp/per-year pricing & financial scenarios | ✅ Shipped | `ramp.ts`, `/api/v2/deals/{id}/pricing-schedule`, `scenarios` |
| Webhooks & integration framework | ✅ Shipped | `webhooks`, `webhook-dispatcher` subscriber |
| Notifications & escalation | ✅ Shipped (in-app) | `notification-rules`, `notifications`, `notification-service` |
| Custom fields & tags | ✅ Shipped | `custom-fields`, `tags` routes |
| Natural-language command parsing | ✅ Shipped | `nlc.ts`, `/api/v2/nlc/parse` |
| Settings backend (change-log, rollback, automation) | ✅ Shipped | `settings.ts`, `settings-audit`, `/api/v1/settings/*` |
| Deal Roster & Kanban | ✅ Shipped | roster enrichment, roster/Kanban UI |
| PWA / mobile companion | ✅ Shipped | `vite-plugin-pwa`, offline caching |
| Board-ready PDF / scheduled email digests | ◻️ Partial / see exports | `/api/v2` exports (`export/deals`, `reports/pipeline`, `digest/preview`) |
| Multi-commander access & delegation (Regional/Global/Delegate) | ◻️ Partial | actor model present; full territory scoping per PRD may be incomplete |

Legend: ✅ present in code · ◻️ partial or needs verification. Confirm against the source before
relying on any single row; the PRDs describe the *target*, not necessarily the current state.

## Improvement proposals

Nine standalone proposals live in [`product/improvements/`](./product/improvements/). They
describe *proposed* designs; several have since shipped (cross-reference the table above):

| Proposal | Theme | Shipped? |
|---|---|---|
| Closed-Lost Autopsy | Loss intelligence: causal chains, cross-loss patterns, loss-risk scoring | Largely (autopsy + loss-risk) |
| Dashboard widget suggestions | Dashboard as a decision surface (vital signs, ship-blocker widgets) | Largely |
| Deal Memory Module | Living institutional knowledge system | Yes (Knowledge Hub) |
| Deal Roster suggestions | Full Roster page UX (triage table, Kanban, saved views) | Yes |
| Risk Engine | v2.0 redesign: continuous 7-dimension scoring | Yes (Risk Engine v2) |
| Risk Engine2 | Reconcile patterns + dimensions as one unified 3-layer system | Yes (patterns amplify dimensions) |
| Portfolio Risk Analysis | Correlated risk across team members & product lines | Partial (portfolio correlation) |
| Pipeline Analytics | Flow dynamics, forecast reliability, bottlenecks | Partial (Flow slice 1) |
| Settings Engine Tuning, Automation & Integrations | Control panel for 200+ parameters + automation + integrations | Partial (settings backend) |

## Planned: Zoho Catalyst migration

A migration of the full stack to **Zoho Catalyst** (serverless functions + hosted data) is a
planned future step. No Catalyst configuration exists in the repository yet. New work should favor
stateless handlers and environment-driven configuration to ease that transition. See
[build-and-deploy.md](./build-and-deploy.md#planned-zoho-catalyst) and
[release-process.md](./release-process.md#planned-migration-to-zoho-catalyst).
