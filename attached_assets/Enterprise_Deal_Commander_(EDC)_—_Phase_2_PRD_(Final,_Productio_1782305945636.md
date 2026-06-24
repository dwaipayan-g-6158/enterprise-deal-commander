---

# Product Requirement Document (PRD)

## Enterprise Deal Commander (EDC) — Phase 2 PRD (Final, Production-Ready)
### Sovereign Intelligence Edition

**Document Version:** 3.0 (Phase 2 — Final, Production-Ready Specification)
**Supersedes:** EDC V2 PRD v2.0 (Sovereign Intelligence Edition). This document is the production-ready Phase 2 baseline.
**Predecessor lineage:** EDC V1 PRD v3.0 → EDC V2 PRD v2.0 → **this document (v3.0)**
**Status:** Final — Engineering-Ready
**Author:** Deal Commander Office
**Target Audience:** Engineering Team / Full-Stack Developers / Data Engineers
**Last Revised:** June 2026

> **Companion document.** This PRD pairs with **"Enterprise Deal Commander (EDC) — Phase 1 PRD (Final, Production-Ready).md"** (the *Executive War Room Edition*). The two are governed by a single shared **Phase Boundary & Non-Overlap Charter**, embedded verbatim below as **Section 1A** (and identically as Section 1A of the Phase 1 PRD). Where any text in this document appears to conflict with that charter, **the charter governs**.

> **What changed in v3.0.** Phase 1 has been *expanded* with 14 new capabilities (F1–F14). Those capabilities now own a body of work that earlier V2 drafts loosely claimed (ephemeral risk simulation, self-referential momentum, structured loss autopsy, current-state portfolio correlation, static intervention checklists + manual share, audit-log Deal Replay/Change Digest, multi-currency rollup, glass-box rule explanations). This Phase 2 baseline has therefore been **refined** so that no Phase 2 deliverable re-builds a Phase-1-owned feature. Every section that touches the boundary now carries a **"Relationship to Phase 1 (Non-Overlap)"** note citing the charter row (Cx). All original V2 capability content — schema, code, SQL, UI/ASCII mockups, API contracts — is preserved in full; the refinements are added as framing and scoping, not as deletions of substance.

---

## Table of Contents

```
 ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  PART I — VISION & FOUNDATION
 ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  1.  Phase 2 Strategic Vision & Differentiation Thesis
  1A. Phase Boundary & Non-Overlap Charter   ← (embedded verbatim; authoritative)
  2.  Phase 2 Glossary & New Terminology
  3.  Architecture Evolution — Event-Driven, Multi-Commander

 ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  PART II — DEEP INTELLIGENCE LAYER
 ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  4.  Predictive Deal Scoring Engine
  5.  Deal Velocity & Pipeline Analytics (Cohort / Longitudinal Layer)
  6.  Competitive Intelligence Module
  7.  Deal Memory & Institutional Knowledge Base
  8.  Win/Loss Post-Mortem & Pattern Analysis (Narrative Layer)

 ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  PART III — MULTI-COMMANDER & COLLABORATION
 ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  9.  Multi-Commander Access Model & Delegation
  10. Stakeholder Influence Mapping
  11. Decision Log & Meeting Intelligence

 ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  PART IV — ADVANCED AUTOMATION & AI
 ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  12. Custom Risk Pattern Builder (Visual Rule Engine)
  13. Automated Playbook Engine & Next-Best-Action (Dynamic Superset)
  14. Natural Language Command Interface
  15. Smart Alerts with Escalation Chains (Delivery & Escalation Layer)

 ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  PART V — FINANCIAL MODELING & FORECASTING
 ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  16. Ramp Deal Pricing & Per-Year Financial Modeling
  17. Financial Scenario Engine (Persisted, Financial, Pipeline-Wide)
  18. Pipeline Simulation & Probabilistic Forecasting

 ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  PART VI — EXECUTIVE COMMUNICATION & REPORTING
 ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  19. Board-Ready Report Generation Engine
  20. Executive Briefing Mode V2 (On-Screen Data Layer)
  21. Automated Email Digest & Scheduled Reporting

 ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  PART VII — PLATFORM & EXTENSIBILITY
 ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  22. Custom Fields, Tags & Flexible Metadata
  23. Data Import & Export Engine
  24. Webhook & Generic Integration Framework
  25. Mobile Companion View

 ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  PART VIII — TECHNICAL SPECIFICATIONS
 ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  26. Phase 2 Database Schema Extensions (PostgreSQL)
  27. Phase 2 API Extensions
  28. Event-Driven Architecture & Internal Event Bus
  29. Performance, Caching & Scalability

 ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  PART IX — DELIVERY
 ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  30. Phased Execution & Acceptance Criteria
  31. Risk Register & Mitigation
  32. Appendices
```

---

## PART I — VISION & FOUNDATION

---

## 1. Phase 2 Strategic Vision & Differentiation Thesis

### 1.1 What Phase 1 Now Solves

EDC began as a single-source-of-truth for technical–commercial deal alignment: a 9-point quantifiable gate framework, a composable risk pattern engine, an executive briefing mode, and an immutable audit trail. **Phase 1 (Executive War Room Edition) then deepened that foundation with 14 new capabilities (F1–F14)** — all deterministic, self-contained, in-the-moment, and built on assets EDC already owned. As a result, the baseline Phase 2 inherits is materially stronger than the original V1 state recorder.

Phase 1 now owns, end to end:

| Phase 1 capability | What it delivers (deterministic, single-deal or current cross-section, no new async infra) | Charter |
|---|---|---|
| **F1 Multi-currency normalization** | `fx_rates`, a single `reporting_currency`, `normalizedTCV`; all thresholds compared in the reporting currency | C1 |
| **F2 Glass-box explainability** | `explain()` on every built-in pattern: evaluated inputs, thresholds-with-provenance, static `clearsWhen` string | C3 |
| **F3 Advisory governance** | Acknowledge / Accept / Snooze (state-based) with rationale → `deal_audit_log`; in-cockpit `AuditTrailViewer` | C4 |
| **F4 Gate dependency/integrity** | Declarative `prerequisite_gate_codes` + write-time out-of-order / regression integrity warnings | C5 |
| **F5 Presenter ergonomics** | Curated session agenda/queue, private speaker notes (never projected/exported), session pacing timer | C15 |
| **F6 Temporal Intelligence** | Change Digest + Deal Replay built **only** on `deal_audit_log` (read-time projection, no new infra) | C8 |
| **F7 Interventions + Bat-Signal** | Static intervention checklists + manual `POST /interventions` log; 48h signed read-only share link | C7 |
| **F8 Self-referential momentum** | Built-in pattern `SLOW_MOTION_COLLISION` (the deal's own audit-derived timing vs its own close date) | C9 |
| **F9 Ephemeral risk simulator** | Client-side, non-persisted single-deal preview of Health Status + Alerts only (no save, no financials) | C10 |
| **F10 Structured loss autopsy** | `loss_archetypes` taxonomy + mandatory `loss_archetype_id`; deterministic `GET /analytics/autopsy` correlation | C11 |
| **F11 Portfolio correlation** | Deterministic current-state cross-section: AM / TL / product vs *currently* triggered alerts + simple cycle-time | C12 |
| **F12 Stage-transition guardrails** | Synchronous `409 STAGE_GUARDRAIL` on RED-triggering transitions unless typed override; `deal_stage_overrides` ledger | C6 |
| **F13 Cross-sell whitespace** | Whitespace + attach-rate in `/intelligence`; built-in `LOW_ATTACH_ELEPHANT` pattern | C13 |
| **F14 Deal lifecycle** | Soft-delete / archive / restore (`deleted_at` / `archived_at`, `POST /restore`, `?state=archived`) | C14 |

### 1.2 What Phase 1 Cannot Do — and Phase 2 Completes

Phase 1 is **correct, deterministic, self-contained, and in-the-moment**. It computes from a single deal's own data (or a simple cross-section of current state), persists nothing speculative, and requires no new asynchronous infrastructure. That discipline is exactly what makes it solid — and exactly what bounds it.

Phase 2 is the **superset** that adds the reasoning / scale / automation / time-series layer on top of that now-solid foundation. The table below is split into two groups: capabilities Phase 1 *partially* delivers (Phase 2 completes the missing axis) and gaps that are *genuinely Phase-2-only*.

**A. Phase 1 delivers the foundation; Phase 2 completes the missing axis**

| Phase 1 already has… | …and Phase 2 adds (the superset) | Charter |
|---|---|---|
| Ephemeral, non-persisted, single-deal, client-side **risk** preview (health + alerts only) | **Persisted FINANCIAL + pipeline-wide scenarios** — saved/reusable models, TCV/discount/term/services modeling, cached `computed_results`, pipeline impact (§17), Monte-Carlo (§18) | C10 |
| Self-referential **momentum** built-in pattern `SLOW_MOTION_COLLISION` (deal vs itself) | **Cohort BENCHMARKS + predictive scoring** — median stage durations, Pipeline Velocity Index, velocity heatmap vs cohort, learned 0–100 close score (§4/§5) | C9 / C3 |
| Structured **loss autopsy** — `loss_archetypes` taxonomy + deterministic correlation | **Narrative / lessons / memory + competitor win-loss** — free-text post-mortem, searchable lessons, recommended playbook, Deal Memory archival, competitor analytics (§7/§8/§6) | C11 |
| Current-state **portfolio correlation** (AM/TL/product vs current alerts) | **Longitudinal velocity / forecast** — time-series velocity, pipeline analytics, win/loss analytics over time (§5/§8) | C12 |
| **Static intervention checklists** + manual share link | **Automated playbook lifecycle engine** + notifications/escalation + machine webhooks — auto-assignment, multi-step lifecycle, next-best-action, critical-step alerts (§13/§15/§24) | C7 |
| Audit-log **Deal Replay / Change Digest** (read-time projection) | **Durable snapshot / activity / health-history analytics backbone** — `deal_snapshots`, `deal_activity_log`, `deal_health_history`, materialized views, Redis (§26/§28/§29) | C8 |
| **Multi-currency rollup** of today's flat TCV | **Ramp / per-year + scenario finance** (distinct axis: future and alternative values, not currency conversion) (§16/§17) | C1 |
| **Glass-box rule explanations** (why a deterministic rule fired) | **Probabilistic score + custom rule builder** — the learned/weighted score (§4) and Commander-authored no-code rules (§12) | C3 / C2 |

**B. Genuinely Phase-2-only gaps (no Phase 1 footprint at all)**

| Gap | Business Impact | Phase 2 Section |
|---|---|---|
| Scale beyond one Commander | A single person bottlenecks at ~15–20 active deals | §9 Multi-Commander |
| Natural-language ad-hoc querying | Manual scanning to answer "RED deals above $1M closing this quarter" | §14 NLC |
| Board-grade portable output | Executives need formatted, multi-page PDFs, not screen-only views | §19 Board Reports |
| Stakeholder influence mapping | 8–15 stakeholders tracked informally, no structured graph | §10 |
| Free-form meeting / decision capture | Decisions made in huddles evaporate | §11 |
| Scheduled push communication | No automated email digest cadence | §21 |
| Commander-defined metadata, import/export, mobile/PWA | Fixed schema, no bulk migration, unusable on a phone | §22 / §23 / §25 |

### 1.3 Phase 2 Thesis

> **Phase 1 made EDC a *correct, deep, deterministic* deal recorder. Phase 2 transforms it into a *deal reasoning engine at scale*.** It predicts what will happen (learned scoring, cohort benchmarks), models the financial impact of alternatives (persisted scenarios, Monte-Carlo), preserves and searches institutional knowledge (Deal Memory, narrative post-mortems), automates the response (playbook lifecycle, escalation, webhooks), and ensures nothing falls through the cracks regardless of how many Commanders are operating — all built **on top of**, never duplicating, the Phase 1 foundation.

> **The litmus test (from the charter).** If a capability needs history beyond the current deal's own audit log, a cohort/portfolio benchmark over time, a persisted model/scenario/score/knowledge artifact, delivery/escalation/notification, or auto-assignment/lifecycle/next-best-action — it is Phase 2. If it is deterministic, computed from one deal (or current cross-section), and ephemeral/recoverable — it is Phase 1.

### 1.4 Phase 2 Design Pillars

| Pillar | Definition | Key Phase 2 Features |
|---|---|---|
| **Deepest Insight** | See what no other tool can show you | Predictive scoring, cohort velocity analytics, competitive intelligence, deal memory |
| **Fastest Decision** | From data to decision in seconds | Natural language commands, automated playbooks, contextual dashboards |
| **Highest Confidence** | Every recommendation is backed by evidence | Scenario modeling, pipeline simulation, financial what-if engine |
| **Zero Blind Spots** | Nothing falls through the cracks | Smart alerts with escalation, stakeholder mapping, decision log, activity intelligence |
| **Effortless Scale** | Works for 10 deals or 100 | Multi-commander delegation, bulk operations, mobile companion, data import/export |

---

## 1A. Phase Boundary & Non-Overlap Charter

> The following charter is embedded **verbatim** and is identical to Section 1A of the Phase 1 PRD. It is the single source of truth for the Phase 1 ↔ Phase 2 boundary. Where any other text in either PRD appears to conflict with this charter, **this charter governs**.

# Phase Boundary & Non-Overlap Charter (EDC Phase 1 ↔ Phase 2)

> **Authoritative.** This charter is the single source of truth for what belongs to Phase 1 (Executive War Room Edition) versus Phase 2 (Sovereign Intelligence Edition). It is embedded verbatim in **both** PRDs. Where any other text in either PRD appears to conflict with this charter, **this charter governs**. Every capability area below states the Phase 1 scope, the Phase 2 scope, and the exact boundary line between them.

## Governing principle

**Phase 1 = correct, deterministic, self-contained, in-the-moment.** It deepens assets EDC already owns (TCV math, the fixed built-in pattern engine, the immutable `deal_audit_log`, the 9-gate matrix, Executive Briefing Mode, the cross-sell junction). Every Phase 1 capability computes from a *single deal's own data* (or a simple cross-sectional aggregate of *current* state) using *deterministic* logic, persists nothing speculative, and requires *no* new asynchronous infrastructure.

**Phase 2 = predictive, cohort-benchmarked, persisted, narrative, automated, multi-actor, event-driven.** It adds the reasoning/scale/automation layer on top of a now-solid Phase 1 foundation: learned/weighted scoring, cross-deal historical benchmarks, saved models, knowledge bases, automation engines, notifications/escalation, multi-commander scale, and the durable time-series backbone (event bus, snapshots, activity log, health history, materialized views, Redis).

## Capability-by-capability boundary

| # | Capability area | **Phase 1 owns** | **Phase 2 owns** | Boundary line |
|---|---|---|---|---|
| C1 | **Currency & TCV** | Multi-currency normalization: `fx_rates`, a single `reporting_currency`, `normalizedTCV`, and all threshold comparisons in the reporting currency | Ramp/per-year pricing (§16); persisted financial scenarios (§17) | P1 converts *today's flat* TCV across currencies into one rollup currency. P2 models *future per-year* and *alternative* values. Different axis; no shared table. |
| C2 | **Built-in risk patterns** | The complete engineering-defined built-in pattern set, including new `SLOW_MOTION_COLLISION` (own-history momentum) and `LOW_ATTACH_ELEPHANT` (cross-sell whitespace) | Custom **rule builder** (§12): Commander-authored, no-code custom patterns; competitor-/stakeholder-triggered patterns (§6/§10) | P1 ships the fixed built-in array (engineers add rules in code). P2 lets Commanders *author* new rules at runtime. P1 never gains a rule-authoring UI. |
| C3 | **Alert explainability** | Glass-box `explain()` on every built-in pattern: evaluated inputs, thresholds used (with default/tuned provenance), and a static `clearsWhen` remediation string | Predictive close **score** (§4): learned/weighted 0–100 probability with feature breakdown | P1 explains *why a deterministic rule fired*. P2 produces a *probabilistic score*. P1 has no score; P2's breakdown is not a rule explanation. |
| C4 | **Advisory governance** | Acknowledge / Accept / Snooze a built-in advisory on a deal, with required rationale (snooze is **state-based**: "until G3 changes"), recorded to `deal_audit_log`; in-cockpit `AuditTrailViewer` over the existing audit log | Smart alerts + **escalation chains** + email/in-app **notifications** + delivery acknowledgement + notification log (§15) | P1 governs the *cockpit advisory state* (no delivery anywhere). P2 *delivers and escalates* notifications and acks *delivered messages*. No notification infra in P1. |
| C5 | **Gate framework** | Declarative `prerequisite_gate_codes` + write-time **integrity warnings** (out-of-order, regression) | — (P2 does not modify gate structure) | Entirely P1. P2 consumes gate state but never re-specs gate prerequisites. |
| C6 | **Stage progression control** | **Synchronous** stage-transition guardrail: `409 STAGE_GUARDRAIL` when a stage change would trigger a RED built-in pattern unless a typed `override_reason` is supplied; `deal_stage_overrides` ledger | Asynchronous reaction to changes: event bus (§28), escalation (§15), playbook critical-step alerts (§13); free-form Decision Log (§11) | P1 *intercepts the edit synchronously and forces an override decision*. P2 *reacts after the fact*. The override record is a narrow system artifact, not a P2 meeting decision. |
| C7 | **Interventions / sharing** | **Static** intervention checklists attached to built-in alert codes (`intervention_checklists` lookup, JSONB steps); manual "Launch Intervention" + `POST /interventions` **log only**; **Bat-Signal**: 48-hour signed-JWT read-only share link to one deal's risk card | **Dynamic Playbook Engine** (§13): stage-auto-assigned, multi-step lifecycle tracking, completion/skip, next-best-action, critical-step alerts; automated event **webhooks** (§24) | P1 = a static checklist a human launches + logs, and an ad-hoc human share link. P2 = an automated, stateful playbook lifecycle engine + machine-to-machine webhooks. P1 has no auto-assignment, no step lifecycle, no next-best-action. |
| C8 | **Temporal / history** | **Deal Replay** + **Change Digest** built **only** on `deal_audit_log`: point-in-time state reconstruction by reverse-applying audit deltas, and a "since last review" diff via `deal_review_markers` | Durable time-series backbone: `deal_snapshots`, `deal_activity_log`, `deal_health_history`, event bus (§26/§28); velocity benchmarks via materialized views (§5) | P1 is a *read-time projection of the existing audit log* (no new write/event infra). P2 is the *stored, queryable, analytics-grade* time-series. P2 supersedes, never duplicates. |
| C9 | **Velocity / momentum** | One deterministic built-in pattern (`SLOW_MOTION_COLLISION`) using **the deal's own** audit-derived stage/gate timing vs its own close date | Cohort/historical **benchmarks** (median stage durations, Pipeline Velocity Index, velocity heatmap vs cohort) via materialized views; predictive scoring (§4/§5) | P1 = *self-referential* momentum (this deal vs itself). P2 = *comparative* velocity (this deal vs the cohort/history). P1 never computes a cross-deal benchmark. |
| C10 | **What-if / simulation** | **Ephemeral, non-persisted, single-deal, client-side** risk simulator: re-runs the (client-extracted) intelligence engine on unbound inputs to preview **Health Status + Alerts** only | **Persisted, financial, pipeline-wide** scenario engine (§17): saved scenarios, TCV/discount/term/services modeling, pipeline impact; Monte-Carlo simulation (§18) | P1 previews *risk/health* and saves nothing. P2 *models financials, saves scenarios, and runs them pipeline-wide*. P1 produces no TCV projection and no saved scenario. |
| C11 | **Closed-Lost analysis** | **Structured** capture: `loss_archetypes` lookup + mandatory `loss_archetype_id` on Closed-Lost; deterministic `GET /analytics/autopsy` correlating archetype with final gate/services/intelligence state | **Narrative** win/loss post-mortem (§8): free-text narrative, searchable key lessons, recommended playbook, **Deal Memory** archival (§7), competitor win/loss analytics (§6) | P1 owns the *categorical taxonomy + deterministic correlation*. P2 *consumes the archetype* and adds the narrative/lessons/memory/competitor layer. P2 does not redefine the loss taxonomy. |
| C12 | **Portfolio analytics** | Deterministic `GET /intelligence/portfolio-analysis`: cross-entity correlation grouping by `account_manager` / `technical_lead` / `product` against **currently** triggered built-in alerts + simple cycle-time from audit log | Time-series **velocity/pipeline analytics** (§5), predictive scoring (§4), win/loss analytics (§8) | P1 = *current-state cross-sectional correlation* (who/what correlates with active alerts). P2 = *longitudinal* velocity/forecast analytics. No time-series in P1's portfolio view. |
| C13 | **Cross-sell** | Whitespace (catalog minus pitched) + attach-rate in `/intelligence`; built-in `LOW_ATTACH_ELEPHANT` pattern | — (P2 never extends cross-sells) | Entirely P1. Attach-rate later *feeds* P2 scoring/reports as an input, but the feature is P1's. |
| C14 | **Deal lifecycle** | Soft-delete / archive / restore (`deleted_at`/`archived_at`, `POST /restore`, `?state=archived`) — recoverable deletion | **Deal Memory** (§7): searchable knowledge base of *closed* deals with lessons | P1 = *recoverable deletion lifecycle* of any deal. P2 = *knowledge archival* of closed deals. Different lifecycle, different schema (`edc_v2.deal_memory`). |
| C15 | **Briefing Mode** | Presenter ergonomics: curated session **agenda/queue**, **private speaker notes** (never projected/exported), session **pacing** timer; Bat-Signal share (see C7) | **Briefing Mode V2** (§20): on-screen data — side-by-side comparison, predictive/competitive overlays, decision/memory context, scenario indicators, drill-down | P1 adds *presenter-side meeting-running tools*. P2 adds *more on-screen data*. Orthogonal axes; no shared surface. |
| C16 | **Multi-actor & platform** | Single Commander; request/response; one `edc` schema; in-memory threshold cache | Multi-commander/territory/delegation (§9); event bus, snapshots, Redis, materialized views, `edc_v2` schema (§26–29); import/export (§23); custom fields/tags (§22); mobile/PWA (§25); board reports (§19); email digests (§21); NLC (§14); stakeholder maps (§10); decision log (§11) | Entirely P2. P1 remains single-actor and synchronous. |

## One-line litmus tests

- If it needs **history beyond the current deal's own audit log**, or a **cohort/portfolio benchmark over time** → Phase 2.
- If it **persists a model, scenario, score, or knowledge artifact** → Phase 2.
- If it **delivers, escalates, or notifies** anything to anyone → Phase 2.
- If it **auto-assigns, tracks a lifecycle, or recommends a next action** → Phase 2.
- If it is **deterministic, computed from one deal (or current cross-section), and ephemeral/recoverable** → Phase 1.

---

## 2. Phase 2 Glossary & New Terminology

*Inherits all V1 and Phase 1 terminology. New Phase 2 terms below. Terms reframed in v3.0 are marked **(reframed v3.0)** to align with the charter.*

| Term | Definition |
|---|---|
| **Commander** | An authenticated presales leader with deal ownership. Phase 2 supports multiple Commanders with role-based access (Phase 1 is single-Commander; charter C16) |
| **Regional Commander** | A Commander scoped to a geographic or business unit territory |
| **Global Commander (Superuser)** | Full cross-territory visibility, can delegate deals, configure system-wide settings |
| **Deal Delegate** | A Commander temporarily granted edit access to another Commander's deal (for vacation coverage, escalation support) |
| **Predictive Score** | A learned/weighted 0–100 probability-of-close score computed by the Phase 2 scoring engine from historical and real-time features. **Distinct from Phase 1's glass-box rule `explain()`** — it is a probabilistic score, not a deterministic rule explanation (charter C3) |
| **Velocity Metric (reframed v3.0)** | A **comparative / cohort** measurement of how quickly a deal progresses through stages and gates, benchmarked against the historical cohort. Phase 2's velocity is *longitudinal*; Phase 1's `SLOW_MOTION_COLLISION` is the *self-referential* (deal-vs-itself) momentum pattern (charter C9) |
| **Pipeline Velocity Index** | An aggregate cohort-benchmarked health metric: how fast is the overall pipeline moving relative to historical medians |
| **Competitor Profile** | A record of a competing vendor tracked across multiple deals |
| **Deal Competitor** | A junction linking a specific competitor to a specific deal, with win/loss outcome |
| **Stakeholder** | A person (customer-side or internal) involved in a deal, with role, influence level, and sentiment |
| **Influence Map** | A visual graph of stakeholders and their relationships (reports-to, champions, blockers) |
| **Decision Entry (reframed v3.0)** | A timestamped record of a **free-form meeting decision** about a deal, with rationale and owner. Distinct from Phase 1's narrow system artifacts — the `deal_stage_overrides` override ledger (C6) and the `deal_interventions` launch log (C7) |
| **Meeting Session** | A record of a standup or huddle during which deal decisions were made |
| **Playbook (reframed v3.0)** | A predefined, **dynamically auto-assigned, stateful** sequence of recommended actions mapped to deal stages and conditions. The Phase 2 *Dynamic Playbook Engine* supersedes Phase 1's *static* intervention checklists (charter C7) |
| **Playbook Step** | An individual recommended action within a playbook, with lifecycle state (active / completed / skipped) |
| **Custom Risk Pattern** | A Commander-defined risk rule created via the Visual Rule Engine at runtime. **Distinct from Phase 1's fixed engineer-defined built-in pattern set** (charter C2) |
| **Rule Condition** | A single predicate in a custom risk pattern (e.g., "TCV > $500K") |
| **Natural Language Command (NLC)** | A plain-English query parsed into a structured database query |
| **Escalation Chain** | A sequence of alert recipients and channels that activate when a condition persists beyond a deadline. Part of Phase 2's **delivery/escalation layer** — Phase 1 has no notification infrastructure (charter C4) |
| **Notification** | A delivered message (email / in-app) with a recorded delivery and acknowledgement-of-delivery. Phase-2-only (charter C4) |
| **Financial Scenario (reframed v3.0)** | A **saved, persisted** what-if model modifying pricing, term, services, or discount parameters, with cached `computed_results` and pipeline-wide application. Distinct from Phase 1's *ephemeral, non-persisted, risk-only* client-side simulator (charter C10) |
| **Pipeline Simulation** | A Monte Carlo-style probabilistic forecast of aggregate pipeline outcomes |
| **Ramp Schedule** | A per-year pricing breakdown for multi-year deals with variable annual values. Distinct from Phase 1 multi-currency normalization (charter C1) |
| **Deal Snapshot** | A periodic **durable, stored** immutable capture of a deal's state, used for time-series analytics. Part of Phase 2's time-series backbone; **supersedes** Phase 1's read-time audit-log Deal Replay (charter C8) |
| **Deal Activity Log** | A granular, stored event stream of deal mutations (`edc_v2.deal_activity_log`). Part of the Phase 2 backbone (charter C8) |
| **Deal Health History** | A stored time-series of health-status transitions (`edc_v2.deal_health_history`). Part of the Phase 2 backbone (charter C8) |
| **Deal Memory (reframed v3.0)** | The searchable **NARRATIVE knowledge base** of *closed* deals with structured metadata and lessons learned. Distinct from Phase 1 soft-delete/archive/restore (recoverable deletion, C14) and from Phase 1's structured loss autopsy (categorical correlation, C11) |
| **Board Report** | A multi-page, professionally formatted PDF generated from pipeline data (Phase-2-only) |
| **Email Digest** | A scheduled automated email summarizing pipeline health and critical alerts (Phase-2-only) |
| **Custom Field** | A Commander-defined metadata column attached to deals (text, number, date, select) |
| **Tag** | A flexible label applied to deals for categorization and filtering |
| **Webhook** | An automated, event-driven, machine-to-machine outbound HTTP notification triggered by EDC events, HMAC-signed. **Distinct from Phase 1's human-initiated, expiring, read-only Bat-Signal share link** (charter C7) |
| **Activity Event** | A discrete, timestamped action recorded on a deal (field change, gate toggle, blocker added, etc.) |
| **Loss Archetype (Phase 1, referenced)** | The categorical loss taxonomy (`loss_archetypes`, mandatory `loss_archetype_id`) **owned by Phase 1** (F10/C11). Phase 2 *consumes* it as the categorical dimension of win/loss analytics; Phase 2 does not redefine it |

---

## 3. Architecture Evolution — Event-Driven, Multi-Commander

### 3.1 V1/Phase-1 vs. Phase 2 Architecture Delta

Both V1 and Phase 1 use a request-response architecture: frontend calls API, API writes to database, returns result. This is sufficient for a single Commander performing sequential operations, and Phase 1 deliberately preserves it (charter C16) — even Phase 1's Temporal Intelligence (Deal Replay + Change Digest) is a *read-time projection of the existing `deal_audit_log`* with no new write or event infrastructure (charter C8).

Phase 2 introduces three architectural shifts:

**Shift 1: Event Bus (Internal)**
Many Phase 2 features need to react to data changes asynchronously:
- Smart alerts need to evaluate conditions when a deal updates
- Deal snapshots need to be captured on stage transitions
- Webhooks need to fire on configurable events
- Activity feed needs to record every mutation
- Deal health history needs to track state changes

Instead of scattering this logic across route handlers, Phase 2 introduces an internal event bus. When a deal is mutated, an event is emitted. Subscribers react independently.

> **Relationship to Phase 1 (Non-Overlap) — charter C8.** This event bus and the durable time-series tables it feeds (`deal_snapshots`, `deal_activity_log`, `deal_health_history`) are the **net-new Phase 2 backbone**. They **supersede, never duplicate**, Phase 1's read-time audit-log projection: Phase 1 reconstructs the past on demand from `deal_audit_log`; Phase 2 stores a queryable, analytics-grade time-series. See §28 for the boundary detail.

**Shift 2: Multi-Commander Isolation**
Phase 2 supports multiple authenticated Commanders. Data visibility must be scoped:
- Regional Commanders see only their territory's deals
- Global Commanders see everything
- Delegates see assigned deals temporarily
- All audit trails attribute actions to the acting Commander

**Shift 3: Materialized Analytics**
Time-series analytics, velocity metrics, and pipeline simulations require pre-computed data. Phase 2 introduces periodic snapshot jobs and materialized views to avoid expensive real-time computation on every page load.

### 3.2 Phase 2 System Architecture

```
┌─────────────────────────────────────────────────────────────────────┐
│                       PRESENTATION LAYER                            │
│                                                                     │
│   React 19 SPA (Cockpit, Analytics, Reports)                       │
│   Mobile Companion View (Responsive / PWA)                         │
│   Zustand Stores (Global, ActiveDeal, Analytics, Commander)        │
└──────────────────────────────┬──────────────────────────────────────┘
                               │ HTTPS / REST
                               │ WebSocket (real-time alerts)
┌──────────────────────────────▼──────────────────────────────────────┐
│                      APPLICATION TIER                               │
│                                                                     │
│   Express 5 API Server                                             │
│   ┌─────────────────────────────────────────────────────────────┐  │
│   │  Route Handlers (CRUD, Intelligence, Analytics, Reports)    │  │
│   │  Auth Middleware (JWT, RBAC, Territory Scoping)             │  │
│   │  Validation Middleware (zod shared schemas)                 │  │
│   │  Audit Middleware (auto-log all mutations)                  │  │
│   └──────────────────────────┬──────────────────────────────────┘  │
│                              │                                      │
│   ┌──────────────────────────▼──────────────────────────────────┐  │
│   │              INTERNAL EVENT BUS                              │  │
│   │  (Node.js EventEmitter, in-process)                         │  │
│   │                                                             │  │
│   │  Events: deal.created, deal.updated, deal.stage_changed,   │  │
│   │  gate.toggled, blocker.created, blocker.resolved,          │  │
│   │  health.changed, alert.triggered, alert.escalated          │  │
│   │                                                             │  │
│   │  Subscribers:                                               │  │
│   │  ├── Activity Logger (writes to deal_activity_log)          │  │
│   │  ├── Snapshot Service (captures deal state)                 │  │
│   │  ├── Health History Tracker                                 │  │
│   │  ├── Alert Evaluator (re-runs custom patterns)             │  │
│   │  ├── Escalation Engine (checks timer-based rules)          │  │
│   │  ├── Webhook Dispatcher (outbound HTTP)                     │  │
│   │  └── Notification Service (email digest queue)             │  │
│   └─────────────────────────────────────────────────────────────┘  │
│                                                                     │
│   ┌─────────────────────────────────────────────────────────────┐  │
│   │  BACKGROUND JOBS (node-cron / BullMQ)                       │  │
│   │                                                             │  │
│   │  ├── Snapshot Scheduler (hourly deal state capture)         │  │
│   │  ├── Velocity Calculator (daily cohort benchmarks)          │  │
│   │  ├── Predictive Score Refresher (nightly re-score)          │  │
│   │  ├── Email Digest Sender (scheduled per Commander prefs)    │  │
│   │  ├── Pipeline Simulation Runner (on-demand + nightly)       │  │
│   │  └── Deal Memory Indexer (full-text search rebuild)         │  │
│   └─────────────────────────────────────────────────────────────┘  │
└──────────────────────────────┬──────────────────────────────────────┘
                               │ pg Pool (connection: max 20)
┌──────────────────────────────▼──────────────────────────────────────┐
│                    DATABASE INFRASTRUCTURE                          │
│                                                                     │
│   PostgreSQL 16                                                     │
│   ├── Schema: edc (core deal data, V1 + Phase 1 tables)            │
│   ├── Schema: edc_v2 (Phase 2 extensions: analytics, memory, custom)│
│   ├── Materialized Views (velocity benchmarks, pipeline aggregates)│
│   ├── Full-Text Search (tsvector on deal memory, notes, decisions) │
│   └── Row-Level Security (territory-scoped for Regional Commanders)│
│                                                                     │
│   Redis (Phase 2 addition)                                         │
│   ├── Session cache                                                │
│   ├── Threshold cache (replaces in-memory cache from V1/Phase 1)   │
│   ├── Real-time alert state                                        │
│   └── Rate limiting counters                                       │
└─────────────────────────────────────────────────────────────────────┘
```

> **Relationship to Phase 1 (Non-Overlap) — charter C16/C8.** Everything in the *Application Tier* event bus, the *Background Jobs* lane, the `edc_v2` schema, the materialized views, and Redis is **Phase-2-only**. Phase 1 runs entirely synchronously against the `edc` schema with an in-memory threshold cache. Phase 2 layers this infrastructure on top without altering Phase 1's synchronous paths (Phase 1's gate integrity warnings, stage guardrails, and advisory governance remain in-request).

---

## PART II — DEEP INTELLIGENCE LAYER

---

## 4. Predictive Deal Scoring Engine

> **Relationship to Phase 1 (Non-Overlap) — charter C3 / C9.** Phase 1 has **no score**. Phase 1 provides only (a) glass-box `explain()` on every *deterministic* built-in pattern — evaluated inputs, thresholds-with-provenance, and a static `clearsWhen` remediation string (F2/C3) — and (b) the *self-referential* momentum built-in pattern `SLOW_MOTION_COLLISION` (F8/C9). This Phase 2 engine adds the **learned/weighted probabilistic 0–100 close score** with a feature breakdown. The two are different artifacts: Phase 1 explains *why a deterministic rule fired*; Phase 2 produces *a probability*. Per the charter, Phase 2's feature inputs **may consume** Phase 1 signals — notably the `SLOW_MOTION_COLLISION` momentum signal and the Phase 1 cross-sell attach-rate (F13/C13) — as features, but the score itself, its weights, and its calibration are wholly Phase 2. Phase 1 never gains a score.

### 4.1 Problem Statement

V1's pattern engine flags *known risk conditions* (premature commercial, unprotected elephant, etc.) but cannot estimate *the probability that a deal will close*. The Commander must rely on gut feel or the Account Manager's self-reported `win_probability_pct` — which is notoriously biased (sandbagging or optimism). Phase 1's glass-box explanations make every *deterministic* alert auditable, but they are not a probability — so the forecasting gap remains until Phase 2.

### 4.2 Approach: Feature-Based Statistical Scoring

Phase 2 introduces a predictive scoring engine that computes a data-driven `predicted_close_score` (0–100) for each deal. The model uses **feature engineering from deal attributes** — not external ML model training, which requires thousands of historical deals most organizations don't have.

The scoring engine uses a **weighted multi-factor model** calibrated against the Commander's own historical closed deals:

### 4.3 Scoring Features & Weights

```javascript
// services/predictiveScoringEngine.js

/**
 * Feature definitions for the predictive scoring model.
 * Each feature extracts a signal from deal data and returns a score contribution.
 * Weights are calibrated from historical win/loss data.
 * Default weights are pre-set; the engine refines them as closed deals accumulate.
 *
 * NOTE (charter C3/C9/C13): feature inputs MAY consume Phase 1 signals
 * (e.g. the SLOW_MOTION_COLLISION momentum signal, the cross-sell attach-rate)
 * as features. The score, weights, and calibration are Phase 2 only.
 */

const scoringFeatures = [
    // ── FEATURE 1: Gate Completion Momentum ──────────────
    {
        id: 'gate_momentum',
        description: 'How far along is technical validation?',
        weight: 0.25,   // 25% of total score
        extract: (deal, context) => {
            // Raw percentage contribution, but with a sigmoid curve
            // to reward completeness disproportionately
            const pct = deal.technicalTrack.progressPercentage;
            return sigmoid(pct / 100);  // 0.5 at 50%, 0.88 at 80%, 0.98 at 95%
        }
    },

    // ── FEATURE 2: Stage Velocity vs. Benchmark ─────────
    {
        id: 'stage_velocity',
        description: 'Is the deal moving faster or slower than the cohort average?',
        weight: 0.15,
        extract: (deal, context) => {
            const benchmarkDays = context.velocityBenchmarks[deal.salesStage];
            if (!benchmarkDays) return 0.5;  // No benchmark: neutral
            const ratio = deal.daysInStage / benchmarkDays;
            if (ratio <= 0.5) return 1.0;     // Moving 2x faster than average
            if (ratio <= 1.0) return 0.7;     // On pace
            if (ratio <= 1.5) return 0.4;     // Slow
            if (ratio <= 2.0) return 0.2;     // Stalling
            return 0.05;                      // Frozen
        }
    },

    // ── FEATURE 3: Services Attachment ───────────────────
    {
        id: 'services_attachment',
        description: 'Is the deal financially protected with services?',
        weight: 0.10,
        extract: (deal) => {
            if (deal.financials.servicesRevenue === 0) return 0.2;
            const ratio = deal.financials.servicesRevenue / deal.financials.productRevenue;
            if (ratio >= 0.3) return 1.0;    // Strong services attach
            if (ratio >= 0.15) return 0.7;   // Moderate
            return 0.4;                       // Minimal
        }
    },

    // ── FEATURE 4: Executive Alignment ───────────────────
    {
        id: 'executive_alignment',
        description: 'Has the customer executive champion signed off?',
        weight: 0.15,
        extract: (deal) => {
            const g1Agreed = deal.technicalTrack.gates.find(g => g.gateCode === 'G1_EXECUTIVE_AGREED');
            const g5Signed = deal.technicalTrack.gates.find(g => g.gateCode === 'G5_CTO_SIGNED_OFF');
            if (g5Signed?.isCompleted) return 1.0;
            if (g1Agreed?.isCompleted) return 0.7;
            return 0.15;
        }
    },

    // ── FEATURE 5: Blocker Severity Load ─────────────────
    {
        id: 'blocker_load',
        description: 'What is the unresolved blocker burden?',
        weight: 0.10,
        extract: (deal) => {
            const high = deal.governance.highSeverityBlockerCount;
            const total = deal.governance.activeBlockerCount;
            if (high >= 3) return 0.0;
            if (high >= 1) return 0.3;
            if (total >= 3) return 0.5;
            if (total >= 1) return 0.7;
            return 1.0;
        }
    },

    // ── FEATURE 6: Deal Size Confidence ──────────────────
    {
        id: 'deal_size_confidence',
        description: 'Larger deals have lower close rates historically.',
        weight: 0.05,
        extract: (deal, context) => {
            const tcv = deal.financials.calculatedTCV;
            const avgWonTCV = context.historicalMetrics?.avgWonTCV || 500000;
            // Deals closer to the historical won average score higher
            const distance = Math.abs(tcv - avgWonTCV) / avgWonTCV;
            return Math.max(0, 1 - distance);
        }
    },

    // ── FEATURE 7: Days to Close Pressure ────────────────
    {
        id: 'close_pressure',
        description: 'Is the expected close date realistic given current progress?',
        weight: 0.10,
        extract: (deal) => {
            if (!deal.financials.daysToClose) return 0.3;  // No date set: penalized
            const days = deal.financials.daysToClose;
            const pctComplete = deal.technicalTrack.progressPercentage;
            // If close date is far away relative to progress: good
            // If close date is imminent but progress is low: bad
            const expectedProgressAtClose = 100;
            const progressGap = expectedProgressAtClose - pctComplete;
            const daysPerPoint = days > 0 ? days / Math.max(progressGap, 1) : 0;
            if (daysPerPoint >= 3) return 0.9;   // Comfortable pace
            if (daysPerPoint >= 1.5) return 0.6;  // Tight
            if (daysPerPoint >= 0.5) return 0.3;  // Very tight
            return 0.05;                           // Impossible
        }
    },

    // ── FEATURE 8: Historical Win Rate (Commander/Org) ───
    {
        id: 'historical_win_rate',
        description: 'Baseline close rate for this deal profile.',
        weight: 0.10,
        extract: (deal, context) => {
            const profile = `${deal.salesStage}_${deal.financials.pricingModel}`;
            const historicalRate = context.historicalMetrics?.winRateByProfile?.[profile];
            return historicalRate ?? 0.3;  // Default 30% if no history
        }
    }
];

/**
 * Sigmoid function: maps linear progress to an S-curve.
 * Rewards near-completion disproportionately.
 */
function sigmoid(x) {
    return 1 / (1 + Math.exp(-10 * (x - 0.5)));
}

/**
 * Computes the predictive score for a deal.
 *
 * @param {Object} deal - Processed intelligence output from V1/Phase 1 engine
 * @param {Object} context - Historical metrics and velocity benchmarks
 * @returns {Object} { score: number, breakdown: FeatureBreakdown[], confidence: string }
 */
function computePredictiveScore(deal, context) {
    let weightedSum = 0;
    let totalWeight = 0;
    const breakdown = [];

    for (const feature of scoringFeatures) {
        const rawScore = feature.extract(deal, context);
        const contribution = rawScore * feature.weight;
        weightedSum += contribution;
        totalWeight += feature.weight;

        breakdown.push({
            featureId: feature.id,
            description: feature.description,
            rawScore: Math.round(rawScore * 100),
            weight: feature.weight,
            contribution: Math.round(contribution * 100)
        });
    }

    const normalizedScore = Math.round((weightedSum / totalWeight) * 100);

    // Confidence: based on data completeness
    const hasCloseDate = !!deal.financials.expectedCloseDate;
    const hasHistory = !!context.historicalMetrics?.avgWonTCV;
    const hasBenchmarks = !!context.velocityBenchmarks?.[deal.salesStage];
    const dataPoints = [hasCloseDate, hasHistory, hasBenchmarks].filter(Boolean).length;
    const confidence = dataPoints >= 3 ? 'HIGH' : dataPoints >= 2 ? 'MEDIUM' : 'LOW';

    return {
        score: normalizedScore,
        breakdown,
        confidence,
        computedAt: new Date().toISOString()
    };
}

module.exports = { computePredictiveScore, scoringFeatures };
```

### 4.4 Cold Start Strategy

When EDC Phase 2 is first deployed, there are no historical win/loss records. The engine handles this with a **three-phase calibration**:

| Phase | Trigger | Strategy |
|---|---|---|
| **Phase 1: Bootstrap** | 0 closed deals | Use default weights (pre-set in code above). Confidence label: `LOW` for all scores. |
| **Phase 2: Calibration** | 1–20 closed deals | Use simple win-rate calculations per stage. Weights remain default. Confidence: `MEDIUM` when historical data is available for the specific feature. |
| **Phase 3: Mature** | 20+ closed deals | Run nightly regression analysis against historical outcomes. Adjust feature weights automatically. Confidence: `HIGH` when sufficient training data exists. |

### 4.5 Score Display in UI

```
┌─────────────────────────────────────────────────────────────┐
│  PREDICTIVE CLOSE SCORE                                     │
│                                                              │
│  ████████████████████████████████░░░░░░░░░░  72 / 100       │
│                                                              │
│  Confidence: MEDIUM                                          │
│                                                              │
│  Top Positive Factors:          Top Risk Factors:            │
│  ▲ Gate Momentum      (+25)    ▼ Close Pressure    (-8)     │
│  ▲ Executive Align.   (+15)    ▼ Blocker Load      (-5)     │
│  ▲ Services Attached  (+10)                                   │
│                                                              │
│  [View Full Breakdown]                                       │
└─────────────────────────────────────────────────────────────┘
```

### 4.6 Score Breakdown Modal

When "View Full Breakdown" is clicked, a modal shows the full feature matrix:

```
┌─────────────────────────────────────────────────────────────┐
│  SCORING BREAKDOWN — ACME CORP                              │
│                                                              │
│  Feature                    Raw Score  Weight  Contribution  │
│  ─────────────────────────────────────────────────────────── │
│  Gate Momentum                    88%   25%         22       │
│  Stage Velocity                   70%   15%         11       │
│  Services Attachment             100%   10%         10       │
│  Executive Alignment              70%   15%         11       │
│  Blocker Load                     30%   10%          3       │
│  Deal Size Confidence             65%    5%          3       │
│  Close Pressure                   25%   10%          3       │
│  Historical Win Rate              45%   10%          5       │
│  ─────────────────────────────────────────────────────────── │
│  WEIGHTED TOTAL (normalized)                        72/100   │
│                                                              │
│  Model Confidence: MEDIUM                                    │
│  Based on: 12 closed deals in historical dataset             │
│  Next recalibration: Tonight 02:00 UTC                       │
└─────────────────────────────────────────────────────────────┘
```

> **Boundary note.** The breakdown above is a *probabilistic feature attribution*, not a rule explanation. It is intentionally separate from Phase 1's `explain()` payload (charter C3). A deal may simultaneously show: (a) a Phase 1 `SLOW_MOTION_COLLISION` advisory with a glass-box `explain()` and (b) a Phase 2 predictive score of 72 whose `stage_velocity` feature *consumed* the same momentum signal. Both surfaces are correct and complementary; neither restates the other.

---

## 5. Deal Velocity & Pipeline Analytics (Cohort / Longitudinal Layer)

> **Relationship to Phase 1 (Non-Overlap) — charter C9 / C12.** This section is the **comparative, cohort-benchmarked, time-series** velocity layer. The **per-deal own-history momentum pattern `SLOW_MOTION_COLLISION` lives entirely in Phase 1** (F8/C9): it uses *the deal's own* audit-derived stage/gate timing versus its own close date and computes **no cross-deal benchmark**. Phase 2 adds the **COMPARATIVE dimension only**: cohort median stage durations via materialized views, the Pipeline Velocity Index, the velocity heatmap *vs the cohort*, and expected-stage-exit benchmarks. Phase 2 introduces **no per-deal-only momentum pattern** — that would duplicate Phase 1. Phase 2 velocity is also distinct from Phase 1's deterministic *current-state* portfolio correlation (F11/C12, AM/TL/product vs *currently* triggered alerts): Phase 2 velocity is **longitudinal** (computed over the stored snapshot history), whereas Phase 1's portfolio view is a current cross-section with no time-series.

### 5.1 Problem Statement

Phase 1's `SLOW_MOTION_COLLISION` tells the Commander when *this deal* is decelerating relative to *its own* trajectory and close date — a correct, self-contained signal. But it cannot answer the *comparative* question: "how long do deals like this one *typically* take at each stage, and is this deal faster or slower than that cohort?" Without a data-driven cohort benchmark, any global "stalled" threshold is a guess. Phase 2 supplies the cohort benchmark.

### 5.2 Velocity Metrics (Cohort-Benchmarked)

Phase 2 computes and tracks the following **comparative** velocity metrics. Every metric here is a cross-deal/historical computation — none of it duplicates the single-deal `SLOW_MOTION_COLLISION` pattern.

| Metric | Definition | Computation |
|---|---|---|
| **Stage Duration** | Calendar days a deal has been in its current stage | `NOW() - stage_entered_at` |
| **Gate Velocity** | Average days between gate completions | `(last_gate_completion - first_gate_completion) / gates_completed` |
| **Stage Velocity Benchmark** *(cohort)* | Median days spent in each stage across all closed deals (won + lost) | Computed from `deal_snapshots` history |
| **Expected Stage Exit Date** *(cohort)* | Date by which a deal should have left its current stage (based on benchmark) | `stage_entered_at + benchmark_days_for_stage` |
| **Velocity Delta** *(cohort)* | Difference between actual and expected progress vs the cohort | `expected_exit_date - today` (negative = overdue) |
| **Pipeline Velocity Index** *(cohort)* | Aggregate health metric: how fast is the overall pipeline moving relative to historical medians | Weighted average of velocity deltas across all active deals |

> **Boundary note.** "Stage Duration" and "Gate Velocity" are raw single-deal measurements (no cohort comparison) included here as inputs; the *benchmark* / *expected-exit* / *delta* / *index* rows are the genuinely Phase-2 cohort comparisons. The act of flagging a single deal as decelerating against *itself* remains Phase 1's `SLOW_MOTION_COLLISION` and is **not** re-implemented here.

### 5.3 Velocity Benchmarks — Computation

```sql
-- Materialized view: refreshed nightly by background job
-- (Phase 2 only: built on the stored deal_snapshots time-series, charter C8/C9)

CREATE MATERIALIZED VIEW edc_v2.velocity_benchmarks AS
WITH stage_durations AS (
    SELECT
        ps.stage_name,
        ed.sales_stage_id,
        -- For closed deals, compute time from stage entry to close
        EXTRACT(EPOCH FROM (ss_next.snapshot_at - ss.snapshot_at)) / 86400 AS days_in_stage
    FROM edc.deal_snapshots ss
    JOIN edc.enterprise_deals ed ON ed.id = ss.deal_id
    JOIN edc.pipeline_stages ps ON ps.id = ss.stage_id
    -- Join to next snapshot where stage changed
    LEFT JOIN LATERAL (
        SELECT MIN(snapshot_at) AS snapshot_at
        FROM edc.deal_snapshots ss2
        WHERE ss2.deal_id = ss.deal_id
          AND ss2.snapshot_at > ss.snapshot_at
          AND ss2.stage_id != ss.stage_id
    ) ss_next ON true
    WHERE ss_next.snapshot_at IS NOT NULL  -- Only completed stage transitions
)
SELECT
    stage_name,
    PERCENTILE_CONT(0.25) WITHIN GROUP (ORDER BY days_in_stage) AS p25_days,
    PERCENTILE_CONT(0.50) WITHIN GROUP (ORDER BY days_in_stage) AS median_days,
    PERCENTILE_CONT(0.75) WITHIN GROUP (ORDER BY days_in_stage) AS p75_days,
    PERCENTILE_CONT(0.90) WITHIN GROUP (ORDER BY days_in_stage) AS p90_days,
    COUNT(*) AS sample_size
FROM stage_durations
WHERE days_in_stage > 0 AND days_in_stage < 365  -- Exclude outliers
GROUP BY stage_name;

-- Refresh nightly
-- REFRESH MATERIALIZED VIEW CONCURRENTLY edc_v2.velocity_benchmarks;
```

### 5.4 Velocity Display in Cockpit

Each deal in the Account Navigation Array shows a velocity indicator (the `▼ N days overdue` / `On pace` value is the **cohort** Velocity Delta from §5.2, not the Phase 1 self-referential pattern):

```
┌─────────────────────────────────────────────────────────────────────┐
│  ACME CORP                                                          │
│  $1.45M TCV  │  Commercial  │  Predicted: 72  │  ▼ 5 days overdue  │
│  ██████████░░░░░░░░░░░░░░░░░░░░░░░  33% gates  │  Velocity: SLOW   │
└─────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────┐
│  GLOBAL OMNI                                                        │
│  $3.1M TCV   │  Validation  │  Predicted: 45  │  ● On pace         │
│  ████████████████░░░░░░░░░░░░░░░░░░  56% gates  │  Velocity: NORMAL │
└─────────────────────────────────────────────────────────────────────┘
```

### 5.5 Pipeline Analytics Dashboard

A dedicated analytics page accessible from the Cockpit header. This dashboard is the **longitudinal** companion to Phase 1's current-state `GET /intelligence/portfolio-analysis` (F11/C12): where Phase 1 correlates AM/TL/product against *currently* triggered alerts, this dashboard renders cohort velocity and stage flow over time.

```
┌─────────────────────────────────────────────────────────────────────────────┐
│  PIPELINE ANALYTICS                                        [Date Range ▾]  │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐        │
│  │  $8.45M     │  │  12         │  │  68%        │  │  4          │        │
│  │  Total TCV  │  │  Active     │  │  Weighted   │  │  Overdue    │        │
│  │  Monitored  │  │  Deals      │  │  Pipeline   │  │  Deals      │        │
│  └─────────────┘  └─────────────┘  └─────────────┘  └─────────────┘        │
│                                                                             │
│  ┌─────────────────────────────────────────────────────────────────┐        │
│  │  PIPELINE BY STAGE (Stacked Bar Chart)                          │        │
│  │                                                                  │        │
│  │  Discovery   ████████░░░░░░░░░░░░░░░░░░░  $1.2M  (2 deals)     │        │
│  │  Validation  ████████████████░░░░░░░░░░░  $2.4M  (3 deals)     │        │
│  │  Commercial  ██████████████████████░░░░░  $3.1M  (4 deals)     │        │
│  │  Procurement ██████████░░░░░░░░░░░░░░░░░  $1.75M (3 deals)     │        │
│  └─────────────────────────────────────────────────────────────────┘        │
│                                                                             │
│  ┌──────────────────────────────────────────┐  ┌────────────────────────┐   │
│  │  VELOCITY HEATMAP (vs cohort median)     │  │  HEALTH DISTRIBUTION   │   │
│  │                                          │  │                        │   │
│  │  Stage        Median  Your Avg  Delta    │  │  ████████  GREEN: 6    │   │
│  │  Discovery    14d     12d      ▲ -2d     │  │  ██████    YELLOW: 4   │   │
│  │  Validation   28d     35d      ▼ +7d     │  │  ████      RED: 2      │   │
│  │  Commercial   21d     18d      ▲ -3d     │  │                        │   │
│  │  Procurement  14d     22d      ▼ +8d     │  │  (pie chart)           │   │
│  └──────────────────────────────────────────┘  └────────────────────────┘   │
│                                                                             │
│  ┌─────────────────────────────────────────────────────────────────┐        │
│  │  DEALS SORTED BY VELOCITY DELTA (most overdue first, vs cohort)  │        │
│  │                                                                  │        │
│  │  1. Atlas Health     Commercial  35d overdue  [RED] Predicted: 31│        │
│  │  2. Fintech Horizon  Procure.    22d overdue  [RED] Predicted: 28│        │
│  │  3. Acme Corp        Commercial   5d overdue  [YEL] Predicted: 72│        │
│  └─────────────────────────────────────────────────────────────────┘        │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## 6. Competitive Intelligence Module

> **Relationship to Phase 1 (Non-Overlap) — charter C2 / C11.** Competitor data and competitor-/stakeholder-triggered patterns are **Phase-2-only**. Phase 1's built-in pattern set is fixed and engineer-defined and contains no competitor-aware patterns (C2). The competitor win/loss analytics here are the *narrative/competitor* layer of win/loss (C11) — they **consume** Phase 1's categorical `loss_archetype` taxonomy as one dimension but do not redefine it.

### 6.1 Problem Statement

Enterprise deals are not evaluated in a vacuum. The Commander routinely learns during 1:1s that a competitor is also being evaluated — but this intelligence lives in memory and meeting notes, never in a structured system. Patterns like "We lose 80% of deals where Competitor X is also in the evaluation" are invisible.

### 6.2 Data Model

```sql
-- Competitor catalog
CREATE TABLE edc_v2.competitors (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    competitor_name VARCHAR(255) NOT NULL UNIQUE,
    category VARCHAR(100),              -- 'Direct Competitor', 'Adjacent', 'Open Source Alternative'
    known_strengths TEXT,               -- Commander's notes on where they win
    known_weaknesses TEXT,              -- Commander's notes on where they lose
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Junction: competitors linked to deals
CREATE TABLE edc_v2.deal_competitors (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    deal_id UUID NOT NULL REFERENCES edc.enterprise_deals(id) ON DELETE CASCADE,
    competitor_id UUID NOT NULL REFERENCES edc_v2.competitors(id),
    status VARCHAR(30) NOT NULL DEFAULT 'Active',  -- 'Active', 'Displaced', 'Lost To', 'Won Against'
    displacement_strategy TEXT,          -- Commander's plan to beat this competitor on this deal
    outcome_notes TEXT,                  -- Post-close notes on competitive outcome
    logged_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(deal_id, competitor_id)
);
```

### 6.3 Competitive Intelligence Features

**6.3.1 Per-Deal Competitor Tracking**
In the deal workspace, a new "Competitive Landscape" section:

```
┌─────────────────────────────────────────────────────────────┐
│  COMPETITIVE LANDSCAPE                                       │
│                                                              │
│  ┌──────────────────────────────────────────────────────┐   │
│  │  Competitor A  [AWS]         Status: ACTIVE           │   │
│  │  Strategy: Emphasize data sovereignty and TCO model   │   │
│  │  [Edit Strategy]  [Mark as Displaced]                 │   │
│  └──────────────────────────────────────────────────────┘   │
│                                                              │
│  ┌──────────────────────────────────────────────────────┐   │
│  │  Competitor B  [Snowflake]   Status: DISPLACED        │   │
│  │  Displaced on: 2025-04-12                             │   │
│  │  Notes: Customer preferred our real-time streaming    │   │
│  └──────────────────────────────────────────────────────┘   │
│                                                              │
│  [+ Add Competitor]                                          │
└─────────────────────────────────────────────────────────────┘
```

**6.3.2 Aggregate Competitive Analytics**

```sql
-- Win rate by competitor (computed from closed deals)
CREATE VIEW edc_v2.competitive_win_rates AS
SELECT
    c.competitor_name,
    COUNT(*) AS total_encounters,
    COUNT(*) FILTER (WHERE dc.status = 'Won Against') AS wins,
    COUNT(*) FILTER (WHERE dc.status = 'Lost To') AS losses,
    ROUND(
        COUNT(*) FILTER (WHERE dc.status = 'Won Against')::numeric /
        NULLIF(COUNT(*) FILTER (WHERE dc.status IN ('Won Against', 'Lost To')), 0) * 100,
        1
    ) AS win_rate_pct
FROM edc_v2.deal_competitors dc
JOIN edc_v2.competitors c ON c.id = dc.competitor_id
WHERE dc.status IN ('Won Against', 'Lost To')
GROUP BY c.competitor_name
ORDER BY total_encounters DESC;
```

Dashboard display:

```
┌─────────────────────────────────────────────────────────────┐
│  COMPETITIVE INTELLIGENCE SUMMARY                            │
│                                                              │
│  Competitor        Encounters   Wins   Losses   Win Rate     │
│  ────────────────────────────────────────────────────────── │
│  AWS               14           9      5        64%          │
│  Snowflake         8            6      2        75%          │
│  Databricks        5            2      3        40%          │
│  Informatica       3            3      0        100%         │
│                                                              │
│  [View Detailed Competitive Playbooks]                       │
└─────────────────────────────────────────────────────────────┘
```

**6.3.3 Competitor-Triggered Risk Patterns**

The Intelligence Engine adds two new patterns when competitive data exists. Per charter C2, these are **Phase 2** additions (the engine runs them alongside, and after, Phase 1's fixed built-in array; they are not added to Phase 1's pattern set):

```javascript
// Pattern Lambda: Multi-Vendor Bake-Off
{
    code: 'BAKE_OFF_RISK',
    severity: 'YELLOW',
    weight: 45,
    evaluate: (deal, blockers, thresholds, context) => {
        return context.activeCompetitors >= 2 && deal.technicalProgressPct < 50;
    },
    formatMessage: (deal, thresholds, context) =>
        `BAKE-OFF RISK: ${context.activeCompetitors} active competitors in this ` +
        `evaluation with only ${deal.technicalProgressPct}% gate completion. ` +
        `Accelerate differentiation or risk losing to a faster-moving vendor.`
},

// Pattern Mu: Lost-To Pattern
{
    code: 'LOST_TO_PATTERN',
    severity: 'YELLOW',
    weight: 50,
    evaluate: (deal, blockers, thresholds, context) => {
        // If any active competitor has historically won > 60% against us
        return context.competitorProfiles?.some(cp =>
            cp.status === 'Active' && cp.historicalWinRate > 0.6
        );
    },
    formatMessage: (deal, thresholds, context) => {
        const threat = context.competitorProfiles.find(cp =>
            cp.status === 'Active' && cp.historicalWinRate > 0.6
        );
        return `COMPETITIVE DISADVANTAGE: ${threat.competitorName} has won ` +
            `${Math.round(threat.historicalWinRate * 100)}% of head-to-head encounters. ` +
            `Review competitive playbook and escalate differentiation strategy.`;
    }
}
```

---

## 7. Deal Memory & Institutional Knowledge Base

> **Relationship to Phase 1 (Non-Overlap) — charter C14 / C11.** Deal Memory is the searchable **NARRATIVE knowledge base of *closed* deals**. It is distinct from two Phase 1 capabilities it might be confused with: (1) Phase 1's **soft-delete / archive / restore** (F14/C14) is a *recoverable deletion lifecycle* of any deal (`deleted_at` / `archived_at` / `POST /restore`) — a different lifecycle on a different surface (the `edc` schema), not a knowledge base; and (2) Phase 1's **structured loss autopsy** (F10/C11) is the *categorical* taxonomy + deterministic correlation. Deal Memory (`edc_v2.deal_memory`) adds the *free-text, full-text-searchable, lessons-and-playbook* layer on top of closed deals. The two never share a table.

### 7.1 Problem Statement

When a deal closes (win or lose), the strategic notes, blocker history, competitive intelligence, and lessons learned become inaccessible. Six months later, when a similar deal appears at the same account (or a similar profile account), the Commander starts from scratch.

### 7.2 Deal Memory Architecture

Every closed deal is automatically archived into the Deal Memory with its full structured data plus Commander-entered narrative:

```sql
CREATE TABLE edc_v2.deal_memory (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    deal_id UUID NOT NULL REFERENCES edc.enterprise_deals(id),
    account_name VARCHAR(255) NOT NULL,
    deal_name VARCHAR(255) NOT NULL,
    outcome VARCHAR(20) NOT NULL,          -- 'Won' or 'Lost'
    final_tcv NUMERIC(15, 2),
    pricing_model VARCHAR(50),
    services_tier VARCHAR(60),
    total_gates_completed INT,
    total_blockers_encountered INT,
    total_days_active INT,
    stage_durations JSONB,                 -- {"Discovery": 12, "Validation": 28, ...}
    competitors_faced TEXT[],              -- List of competitor names
    win_loss_narrative TEXT,               -- Commander's post-mortem write-up
    key_lessons TEXT[],                    -- Extracted lessons (array)
    recommended_playbook_id UUID,          -- Which playbook would apply to similar future deals
    tags TEXT[],                           -- Tags for searchability
    searchable_vector TSVECTOR,            -- Full-text search vector
    archived_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- NOTE (charter C11): the categorical loss reason is NOT redefined here.
-- The authoritative loss taxonomy is Phase 1's loss_archetypes / loss_archetype_id.
-- Deal Memory references it for the narrative dimension; it does not duplicate it.

-- Full-text search index
CREATE INDEX idx_memory_search ON edc_v2.deal_memory USING GIN(searchable_vector);

-- Composite search vector: includes narrative, lessons, tags, account name
CREATE OR REPLACE FUNCTION edc_v2.update_memory_search_vector()
RETURNS TRIGGER AS $$
BEGIN
    NEW.searchable_vector :=
        setweight(to_tsvector('english', COALESCE(NEW.account_name, '')), 'A') ||
        setweight(to_tsvector('english', COALESCE(NEW.deal_name, '')), 'A') ||
        setweight(to_tsvector('english', COALESCE(NEW.win_loss_narrative, '')), 'B') ||
        setweight(to_tsvector('english', COALESCE(array_to_string(NEW.key_lessons, ' '), '')), 'B') ||
        setweight(to_tsvector('english', COALESCE(array_to_string(NEW.tags, ' '), '')), 'C');
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_memory_search_vector
    BEFORE INSERT OR UPDATE ON edc_v2.deal_memory
    FOR EACH ROW EXECUTE FUNCTION edc_v2.update_memory_search_vector();
```

### 7.3 Deal Memory Search Interface

The Commander accesses Deal Memory through a dedicated search interface (accessible via `Ctrl+Shift+M` or menu):

```
┌─────────────────────────────────────────────────────────────────────┐
│  DEAL MEMORY — INSTITUTIONAL KNOWLEDGE BASE        [Ctrl+Shift+M]  │
├─────────────────────────────────────────────────────────────────────┤
│                                                                     │
│  Search: [ financial services CTO deployment risk         ]  🔍    │
│                                                                     │
│  Filters: Outcome [All ▾]  Min TCV [____]  Competitor [All ▾]      │
│           Tags [All ▾]     Date Range [Last 12 months ▾]           │
│                                                                     │
│  ┌─────────────────────────────────────────────────────────────┐   │
│  │  🔍 MATCH: "Horizon Fintech — Platform Modernization"       │   │
│  │     Outcome: WON  │  TCV: $970K  │  Active: 94 days        │   │
│  │     Competitor: AWS (Displaced in Week 6)                   │   │
│  │     Key Lesson: "CTO required hands-on architecture review  │   │
│  │     before approving. Budget 2 weeks for this in similar    │   │
│  │     financial services deals."                              │   │
│  │     [View Full Archive]  [Apply Playbook to Current Deal]   │   │
│  └─────────────────────────────────────────────────────────────┘   │
│                                                                     │
│  ┌─────────────────────────────────────────────────────────────┐   │
│  │  🔍 MATCH: "Atlas Health — Data Platform"                   │   │
│  │     Outcome: LOST  │  TCV: $1.93M  │  Active: 142 days     │   │
│  │     Competitor: Snowflake (Lost to in Week 11)              │   │
│  │     Key Lesson: "Deal stalled at Gate 4 (compliance) for    │   │
│  │     45 days. Customer procurement required HIPAA BAA which  │   │
│  │     our legal couldn't turn around in time. Pre-stage BAA   │   │
│  │     template for healthcare deals."                         │   │
│  │     [View Full Archive]  [Apply Playbook to Current Deal]   │   │
│  └─────────────────────────────────────────────────────────────┘   │
│                                                                     │
│  Results: 2 of 7 matching archives                                  │
└─────────────────────────────────────────────────────────────────────┘
```

### 7.4 Similar Deal Detection

When viewing an active deal, the system automatically searches Deal Memory for similar past deals using:

- Same `account_name` (exact match)
- Same pricing model + similar TCV range (within 50%)
- Same services tier
- Same competitors

A "Similar Past Deals" widget appears in the active deal workspace:

```
┌─────────────────────────────────────────────────────────────┐
│  📚 SIMILAR PAST DEALS                                       │
│                                                              │
│  Found 2 archived deals matching this profile:               │
│                                                              │
│  1. Horizon Fintech — Platform Modernization (WON, $970K)    │
│     Same account. Similar pricing model.                     │
│     → "CTO architecture review was the critical milestone"   │
│                                                              │
│  2. Regional Bank — Cloud Migration (LOST, $850K)            │
│     Similar TCV. Same competitor (AWS).                      │
│     → "Pre-stage compliance docs to avoid procurement stall" │
│                                                              │
│  [Browse Full Deal Memory Archive]                           │
└─────────────────────────────────────────────────────────────┘
```

---

## 8. Win/Loss Post-Mortem & Pattern Analysis (Narrative Layer)

> **Relationship to Phase 1 (Non-Overlap) — charter C11.** This section is the **NARRATIVE** win/loss layer and it **consumes** Phase 1's categorical taxonomy; it does not duplicate it. Phase 1 owns the *structured* capture: the `loss_archetypes` lookup, the mandatory `loss_archetype_id` on every Closed-Lost deal, and the deterministic `GET /analytics/autopsy` correlation of archetype with final gate/services/intelligence state (F10/C11). Phase 2 adds the layer Phase 1 deliberately does not have: the **free-text win/loss narrative, searchable key lessons, recommended playbook, Deal Memory archival, and competitor win/loss analytics**. The win/loss analytics dashboard below is Phase 2, but **its categorical "loss reason" dimension originates in Phase 1's `loss_archetype`** — Phase 2 reads that field; it defines no loss taxonomy of its own.

### 8.1 Post-Mortem Workflow

When a deal moves to `Closed-Won` or `Closed-Lost`, the system triggers a post-mortem workflow. (For `Closed-Lost`, Phase 1 has **already** enforced selection of a mandatory `loss_archetype_id` at write time, per F10/C11 — its `422 LOSS_ARCHETYPE_REQUIRED` guard fires first. Phase 2's workflow begins *after* that, consuming the chosen archetype.)

1. **Automated Summary Generation:** The system pre-populates a summary with structured data (days active, gates completed, blockers encountered, competitors faced, financials, **and the Phase 1 `loss_archetype` for lost deals**).

2. **Commander Narrative Prompt:** The Commander is prompted to enter the **narrative layer** (Phase 2):
   - Win/Loss narrative (free text)
   - Key lessons (tagged, searchable)
   - Recommended playbook for similar deals
   - Tags for categorization

   > The Commander is **not** asked to re-tag the loss reason here — that categorical taxonomy is Phase 1's `loss_archetype`, already captured. Phase 2 only collects the free-form narrative around it.

3. **Archive to Deal Memory:** The completed post-mortem is stored in the knowledge base (§7).

### 8.2 Win/Loss Analytics Dashboard

The "Top Loss Reasons (tagged)" panel below is rendered **from Phase 1's `loss_archetypes` dimension** (the categorical taxonomy), enriched with Phase 2's narrative/competitor data. The competitor and lessons-learned panels are Phase 2.

```
┌─────────────────────────────────────────────────────────────────────────┐
│  WIN/LOSS ANALYTICS                                           [Q2 2025]│
├─────────────────────────────────────────────────────────────────────────┤
│                                                                         │
│  Overall Win Rate: 62% (8 won / 13 closed)                             │
│                                                                         │
│  ┌─────────────────────────────┐  ┌──────────────────────────────────┐  │
│  │  WIN RATE BY STAGE AT LOSS  │  │  WIN RATE BY COMPETITOR          │  │
│  │                             │  │                                  │  │
│  │  Discovery:    3 losses     │  │  No competitor:     83% (5/6)    │  │
│  │  Validation:   2 losses     │  │  AWS:               60% (3/5)    │  │
│  │  Commercial:   1 loss       │  │  Snowflake:         50% (1/2)    │  │
│  │  Procurement:  2 losses     │  │  Databricks:        0% (0/2)     │  │
│  │                             │  │                                  │  │
│  └─────────────────────────────┘  └──────────────────────────────────┘  │
│                                                                         │
│  ┌─────────────────────────────┐  ┌──────────────────────────────────┐  │
│  │  WIN RATE BY TCV RANGE      │  │  TOP LOSS REASONS                │  │
│  │                             │  │  (from Phase 1 loss_archetypes)  │  │
│  │  < $500K:       75% (3/4)   │  │  1. Price/budget mismatch  (3)  │  │
│  │  $500K - $1M:   67% (2/3)   │  │  2. Compliance gap         (2)  │  │
│  │  $1M - $2M:     50% (2/4)   │  │  3. Competitor feature gap (2)  │  │
│  │  > $2M:         33% (1/3)   │  │  4. Internal priority shift(1)  │  │
│  │                             │  │  5. Champion departure      (1)  │  │
│  └─────────────────────────────┘  └──────────────────────────────────┘  │
│                                                                         │
│  LESSONS LEARNED (Most Referenced from Deal Memory)                     │
│  ─────────────────────────────────────────────────────────────────────  │
│  1. "Pre-stage compliance documentation for regulated industries"       │
│     Referenced by: 4 deals | Applied to: 2 active deals                │
│  2. "CTO architecture review is non-negotiable for deals > $1M"        │
│     Referenced by: 3 deals | Applied to: 1 active deal                 │
│  3. "Always attach professional services for first-year deployments"   │
│     Referenced by: 3 deals | Applied to: 3 active deals                │
└─────────────────────────────────────────────────────────────────────────┘
```

> **Boundary note.** The "Top Loss Reasons" categories (`Price/budget mismatch`, `Compliance gap`, …) are **values of Phase 1's `loss_archetypes` lookup**, not a Phase 2 taxonomy. Phase 2 aggregates and visualizes them; it never adds, renames, or re-defines an archetype.

---

## PART III — MULTI-COMMANDER & COLLABORATION

---

## 9. Multi-Commander Access Model & Delegation

> **Relationship to Phase 1 (Non-Overlap) — charter C16.** Multi-commander, territory scoping, and delegation are **entirely Phase 2**. Phase 1 is single-Commander, request/response, one `edc` schema. Phase 2 layers the multi-actor model on top; it does not change Phase 1's single-actor synchronous paths.

### 9.1 Problem Statement

V1/Phase 1 assume a single Commander. In organizations with multiple presales regions (Americas, EMEA, APAC) or product lines (Platform, Analytics, Security), a single person cannot manage 50+ deals. Phase 2 needs multi-Commander support with territory isolation and delegation.

### 9.2 Access Model

```sql
-- Commander profiles
CREATE TABLE edc_v2.commander_profiles (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES edc.auth_users(id) ON DELETE CASCADE,
    display_name VARCHAR(255) NOT NULL,
    role VARCHAR(30) NOT NULL CHECK (role IN ('global_commander', 'regional_commander')),
    territory VARCHAR(100),               -- 'Americas', 'EMEA', 'APAC', 'Global'
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    email_notifications BOOLEAN NOT NULL DEFAULT TRUE,
    digest_frequency VARCHAR(20) DEFAULT 'weekly',  -- 'daily', 'weekly', 'none'
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Deal-to-Commander assignment
CREATE TABLE edc_v2.deal_commander_assignments (
    deal_id UUID NOT NULL REFERENCES edc.enterprise_deals(id) ON DELETE CASCADE,
    commander_id UUID NOT NULL REFERENCES edc_v2.commander_profiles(id),
    is_primary BOOLEAN NOT NULL DEFAULT TRUE,
    assigned_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (deal_id, commander_id)
);

-- Temporary delegation
CREATE TABLE edc_v2.deal_delegations (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    deal_id UUID NOT NULL REFERENCES edc.enterprise_deals(id) ON DELETE CASCADE,
    delegator_id UUID NOT NULL REFERENCES edc_v2.commander_profiles(id),
    delegate_id UUID NOT NULL REFERENCES edc_v2.commander_profiles(id),
    reason TEXT,
    granted_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
    revoked_at TIMESTAMP WITH TIME ZONE,
    is_active BOOLEAN NOT NULL DEFAULT TRUE
);
```

### 9.3 Access Control Rules

| Role | Scope | Can Do | Cannot Do |
|---|---|---|---|
| **Global Commander** | All deals, all territories | Full CRUD on all deals. Configure system settings. View analytics for all territories. Delegate deals. | — |
| **Regional Commander** | Deals assigned to their territory | Full CRUD on assigned deals. View analytics for own territory. Request delegation. | View/edit other territories' deals. Change system settings. |

### 9.4 Territory-Scoped Row-Level Security

```sql
-- Updated RLS policy for multi-commander territory isolation
CREATE POLICY edc_territory_isolation ON enterprise_deals
    FOR ALL
    TO edc_regional_commander
    USING (
        id IN (
            SELECT deal_id FROM edc_v2.deal_commander_assignments dca
            JOIN edc_v2.commander_profiles cp ON cp.id = dca.commander_id
            WHERE cp.user_id = current_setting('app.current_user_id')::uuid
               OR cp.territory = current_setting('app.current_territory')
        )
    );
```

### 9.5 Commander Switcher UI

```
┌─────────────────────────────────────────────────────────────────────┐
│ [EDC COCKPIT]  Commander: [Sarah Jenkins ▾]    Territory: [Americas ▾] │
│                                                                       │
│  Switch Commander:  ● Sarah Jenkins (Americas)                       │
│                     ○ Raj Patel (EMEA)                               │
│                     ○ Yuki Tanaka (APAC)                             │
│                     ○ Global View (Superuser only)                   │
└─────────────────────────────────────────────────────────────────────┘
```

---

## 10. Stakeholder Influence Mapping

> **Relationship to Phase 1 (Non-Overlap) — charter C2 / C16.** Stakeholder mapping and the stakeholder-triggered patterns below are **Phase-2-only**. Phase 1's fixed built-in pattern set contains no stakeholder-aware patterns; these run alongside the Phase 1 array as Phase 2 additions.

### 10.1 Problem Statement

Enterprise deals involve 8–15 stakeholders on the customer side, each with different roles (economic buyer, technical evaluator, end user, legal, procurement) and varying levels of influence. The Commander tracks this informally; Phase 2 makes it structured and visual.

### 10.2 Data Model

```sql
CREATE TABLE edc_v2.stakeholders (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    deal_id UUID NOT NULL REFERENCES edc.enterprise_deals(id) ON DELETE CASCADE,
    name VARCHAR(255) NOT NULL,
    title VARCHAR(255),
    company VARCHAR(255),                    -- Customer company name
    role_type VARCHAR(50) NOT NULL,          -- 'Economic Buyer', 'Technical Evaluator', 'Champion',
                                             -- 'End User', 'Blocker', 'Influencer', 'Legal', 'Procurement'
    influence_level VARCHAR(20) NOT NULL,    -- 'High', 'Medium', 'Low'
    sentiment VARCHAR(20) NOT NULL DEFAULT 'Neutral',  -- 'Champion', 'Supportive', 'Neutral', 'Skeptical', 'Hostile'
    email VARCHAR(255),
    phone VARCHAR(50),
    notes TEXT,
    reports_to_id UUID REFERENCES edc_v2.stakeholders(id),  -- Org chart relationship
    is_decision_maker BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);
```

### 10.3 Stakeholder Influence Map Visualization

```
┌─────────────────────────────────────────────────────────────────────────────┐
│  STAKEHOLDER INFLUENCE MAP — ACME CORP                                     │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│                     ┌─────────────────────┐                                 │
│                     │   CTO               │                                 │
│                     │   David Chen        │                                 │
│                     │   Economic Buyer    │                                 │
│                     │   Influence: HIGH   │                                 │
│                     │   Sentiment: ● Neutral                                │
│                     └──────────┬──────────┘                                 │
│                                │ reports to                                 │
│               ┌────────────────┼────────────────┐                           │
│               │                │                │                           │
│     ┌─────────▼────────┐  ┌───▼──────────────┐ │                           │
│     │  VP Engineering  │  │  CISO            │ │                           │
│     │  Maria Santos    │  │  James Wright    │ │                           │
│     │  Tech Evaluator  │  │  Blocker         │ │                           │
│     │  Influence: HIGH │  │  Influence: MED  │ │                           │
│     │  Sentiment:      │  │  Sentiment:      │ │                           │
│     │  ● Champion      │  │  ● Skeptical     │ │                           │
│     └──────────────────┘  └──────────────────┘ │                           │
│               │                                  │                           │
│     ┌─────────▼────────┐                       │                           │
│     │  Lead Engineer   │                       │                           │
│     │  Tom Park        │                       │                           │
│     │  End User        │                       │                           │
│     │  Influence: LOW  │                       │                           │
│     │  Sentiment:      │                       │                           │
│     │  ● Supportive    │                       │                           │
│     └──────────────────┘                       │                           │
│                                                 │                           │
│  LEGEND:                                        │                           │
│  ● Champion  ● Supportive  ● Neutral  ● Skeptical  ● Hostile               │
│                                                                             │
│  CHAMPION COVERAGE: 1 of 5 stakeholders = 20% ⚠ Below recommended 40%      │
│  DECISION MAKER ALIGNMENT: Economic Buyer is Neutral — needs engagement     │
│  [Add Stakeholder]  [Edit Relationships]                                    │
└─────────────────────────────────────────────────────────────────────────────┘
```

### 10.4 Stakeholder-Triggered Risk Patterns

```javascript
// Pattern Nu: Champion Gap
{
    code: 'CHAMPION_GAP',
    severity: 'YELLOW',
    weight: 55,
    evaluate: (deal, blockers, thresholds, context) => {
        if (!context.stakeholders || context.stakeholders.length === 0) return false;
        const champions = context.stakeholders.filter(s => s.sentiment === 'Champion');
        const ratio = champions.length / context.stakeholders.length;
        return ratio < 0.2;  // Less than 20% champions
    },
    formatMessage: (deal, thresholds, context) => {
        const total = context.stakeholders.length;
        const champions = context.stakeholders.filter(s => s.sentiment === 'Champion').length;
        return `CHAMPION GAP: Only ${champions} of ${total} tracked stakeholders ` +
            `(${Math.round(champions/total*100)}%) are champions. Recommended minimum: 40%. ` +
            `Risk of internal consensus collapse during procurement.`;
    }
},

// Pattern Xi: Hostile Blocker
{
    code: 'HOSTILE_STAKEHOLDER',
    severity: 'RED',
    weight: 80,
    evaluate: (deal, blockers, thresholds, context) => {
        if (!context.stakeholders) return false;
        return context.stakeholders.some(s =>
            s.sentiment === 'Hostile' && s.is_decision_maker
        );
    },
    formatMessage: (deal, thresholds, context) => {
        const hostile = context.stakeholders.find(s =>
            s.sentiment === 'Hostile' && s.is_decision_maker
        );
        return `HOSTILE DECISION MAKER: ${hostile.name} (${hostile.title}) is a decision ` +
            `maker with hostile sentiment. This stakeholder has veto power. ` +
            `Immediate executive-to-executive engagement required.`;
    }
}
```

---

## 11. Decision Log & Meeting Intelligence

> **Relationship to Phase 1 (Non-Overlap) — charter C6 / C7.** The Decision Log is a **free-form meeting decision** capture and is Phase-2-only. It is explicitly **distinct from Phase 1's two narrow, system-generated artifacts**: (1) the **stage-override ledger** `deal_stage_overrides` (F12/C6) — a typed `override_reason` recorded when a synchronous `409 STAGE_GUARDRAIL` is overridden; and (2) the **intervention launch log** `deal_interventions` (F7/C7) — the log-only record produced when a Commander launches a static intervention checklist. Those are guardrail / intervention *system records* tied to specific machine events; the Decision Log here is *human-authored, free-text* meeting reasoning unconnected to any single forced decision point. They never share a table, and Phase 2's Decision Log does not subsume or replace either Phase 1 ledger.

### 11.1 Problem Statement

Critical decisions are made during standups, 1:1s, and executive huddles — but they're not captured anywhere. "Who decided to skip Gate 3?" or "When was the pricing discount approved?" are questions that can't be answered from V1 data. (Note: Phase 1's `deal_stage_overrides` ledger answers the narrower "who overrode a *guarded stage transition*" question; the Decision Log answers the broader free-form question.)

### 11.2 Data Model

```sql
-- Meeting sessions
CREATE TABLE edc_v2.meeting_sessions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    session_type VARCHAR(30) NOT NULL,      -- 'Standup', 'One-on-One', 'Executive Huddle', 'Ad-Hoc'
    title VARCHAR(255),
    occurred_at TIMESTAMP WITH TIME ZONE NOT NULL,
    duration_minutes INT,
    attendees TEXT[],                        -- Names of attendees
    notes TEXT,
    commander_id UUID NOT NULL REFERENCES edc_v2.commander_profiles(id),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Decision entries
CREATE TABLE edc_v2.deal_decisions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    deal_id UUID NOT NULL REFERENCES edc.enterprise_deals(id) ON DELETE CASCADE,
    meeting_session_id UUID REFERENCES edc_v2.meeting_sessions(id),
    decision_text TEXT NOT NULL,
    rationale TEXT,
    owner VARCHAR(255) NOT NULL,            -- Who is responsible for executing
    status VARCHAR(20) NOT NULL DEFAULT 'Pending',  -- 'Pending', 'In Progress', 'Completed', 'Overridden'
    decided_at TIMESTAMP WITH TIME ZONE NOT NULL,
    due_date DATE,
    completed_at TIMESTAMP WITH TIME ZONE,
    commander_id UUID NOT NULL REFERENCES edc_v2.commander_profiles(id),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- NOTE (charter C6/C7): this is NOT edc.deal_stage_overrides (Phase 1 F12) and NOT
-- edc.deal_interventions (Phase 1 F7). Free-form meeting decisions only.
```

### 11.3 Decision Log UI

A tab within the deal workspace:

```
┌─────────────────────────────────────────────────────────────────────────────┐
│  DECISION LOG — ACME CORP                                    [+ New Decision]│
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │  2025-06-18  │  Executive Huddle  │  Status: IN PROGRESS           │   │
│  │  Decision: Override pricing window. Cap discount at 15%.            │   │
│  │  Rationale: Customer procurement pushing for 25% discount.          │   │
│  │  AM would lose margin floor. Presales value justifies 15% cap.      │   │
│  │  Owner: John Doe (AM)  │  Due: 2025-06-25                          │   │
│  │  [Mark Complete]  [Override]                                        │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                                                                             │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │  2025-06-10  │  One-on-One  │  Status: COMPLETED                   │   │
│  │  Decision: Skip Gate 3 performance test. Accept risk.               │   │
│  │  Rationale: Customer has their own load testing infra. Will run     │   │
│  │  independently. Documented in email trail.                          │   │
│  │  Owner: Sarah Jenkins (TL)  │  Completed: 2025-06-12               │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                                                                             │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │  2025-05-28  │  Standup  │  Status: OVERRIDDEN                     │   │
│  │  Decision: Proceed with single-region deployment.                   │   │
│  │  Overridden by: 2025-06-05 decision to go multi-region.             │   │
│  │  Rationale for override: Customer expanded scope after board review. │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────────────────┘
```

> **Boundary note.** The "Skip Gate 3" decision above is a *narrative record of a meeting decision*. If skipping Gate 3 also triggered a guarded stage transition, Phase 1 would *separately* have written a typed `override_reason` to `deal_stage_overrides` at the moment of the edit (C6). The two coexist: Phase 1's ledger is the authoritative system record of the forced override; the Decision Log is the human context around it.

---

## PART IV — ADVANCED AUTOMATION & AI

---

## 12. Custom Risk Pattern Builder (Visual Rule Engine)

> **Relationship to Phase 1 (Non-Overlap) — charter C2.** Phase 1 owns the complete **engineering-defined BUILT-IN pattern set** — now 12 patterns, including the two added in Phase 1 v4.0: `SLOW_MOTION_COLLISION` (F8, self-referential momentum) and `LOW_ATTACH_ELEPHANT` (F13, cross-sell whitespace). That array is fixed: engineers add rules in code; **Phase 1 never gains a rule-authoring UI**. Phase 2 adds the orthogonal capability of **Commander-authored, no-code custom rules** at runtime, plus the competitor-/stakeholder-triggered patterns of §6/§10. Custom patterns are evaluated *alongside and after* the Phase 1 built-in array; they do not modify, replace, or re-implement any built-in pattern. A custom rule may *reference* fields produced by Phase 1 (e.g. `predictiveScore.score`, `financials.crossSellCount`) but the built-in catalog remains Phase 1's.

### 12.1 Problem Statement

Phase 1's built-in risk patterns are hard-coded (by design — they are the deterministic, auditable core). When the Commander identifies a new risk archetype (e.g., "Deals with >3 cross-sell pitches but <$500K TCV are always overscoped"), they cannot add it without an engineering change. Phase 2 puts *additional* pattern creation in the Commander's hands without touching the built-in catalog.

### 12.2 Custom Pattern Data Model

```sql
-- Custom risk patterns defined by Commanders (Phase 2; the built-in array stays in code per C2)
CREATE TABLE edc_v2.custom_risk_patterns (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    pattern_name VARCHAR(100) NOT NULL,
    description TEXT,
    severity VARCHAR(10) NOT NULL CHECK (severity IN ('RED', 'YELLOW')),
    weight SMALLINT NOT NULL DEFAULT 50 CHECK (weight BETWEEN 1 AND 100),
    alert_message_template TEXT NOT NULL,    -- Supports {{placeholders}}
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_by UUID NOT NULL REFERENCES edc_v2.commander_profiles(id),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    last_triggered_at TIMESTAMP WITH TIME ZONE,
    trigger_count INT NOT NULL DEFAULT 0
);

-- Conditions within a custom pattern (AND logic between conditions)
CREATE TABLE edc_v2.custom_pattern_conditions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    pattern_id UUID NOT NULL REFERENCES edc_v2.custom_risk_patterns(id) ON DELETE CASCADE,
    field_path VARCHAR(100) NOT NULL,       -- e.g., 'financials.calculatedTCV', 'technicalTrack.progressPercentage'
    operator VARCHAR(20) NOT NULL,          -- 'gt', 'lt', 'eq', 'gte', 'lte', 'contains', 'not_contains', 'is_null', 'is_not_null'
    comparison_value TEXT NOT NULL,
    sort_order SMALLINT NOT NULL,
    UNIQUE(pattern_id, sort_order)
);
```

### 12.3 Supported Field Paths for Conditions

| Category | Field Path | Type | Example Values |
|---|---|---|---|
| **Financial** | `financials.calculatedTCV` | number | `500000` |
| | `financials.productRevenue` | number | `400000` |
| | `financials.servicesRevenue` | number | `100000` |
| | `financials.termYears` | number | `3` |
| | `financials.daysToClose` | number | `30` |
| | `financials.winProbability` | number | `65` |
| **Stage** | `salesStage` | string | `Commercial` |
| | `daysInStage` | number | `45` |
| **Gates** | `technicalTrack.progressPercentage` | number | `50` |
| | `technicalTrack.stepsCompleted` | number | `3` |
| | `gate.G1_CRITERIA_LOCKED` | boolean | `true` / `false` |
| | *(any gate code)* | boolean | |
| **Blockers** | `governance.activeBlockerCount` | number | `2` |
| | `governance.highSeverityBlockerCount` | number | `1` |
| **Services** | `financials.servicesTier` | string | `None` |
| **Predictive** | `predictiveScore.score` | number | `72` |
| **Cross-sell** | `financials.crossSellCount` | number | `3` |
| **Stakeholder** | `stakeholderCount` | number | `5` |
| | `championCount` | number | `1` |
| | `hostileDecisionMakerCount` | number | `0` |
| **Competitive** | `activeCompetitorCount` | number | `2` |

> The `predictiveScore.score` and `financials.crossSellCount` field paths illustrate the one-directional dependency the charter permits: a Phase 2 custom rule may *read* a Phase 2 score or a Phase 1 cross-sell metric as an input. The built-in catalog itself remains Phase 1 and is not edited through this UI.

### 12.4 Visual Rule Builder UI

```
┌─────────────────────────────────────────────────────────────────────────────┐
│  CUSTOM RISK PATTERN BUILDER                                        [Save] │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  Pattern Name:  [ Mega Deal Without Executive Alignment          ]          │
│  Severity:      [●] RED    ○ YELLOW                                        │
│  Weight:        [ 80 ] (1-100, higher = more critical)                      │
│                                                                             │
│  CONDITIONS (ALL must be true — AND logic):                                │
│  ───────────────────────────────────────────────────────────────────────    │
│                                                                             │
│  [1]  financials.calculatedTCV          [is greater than ▾]  [ 500000 ]     │
│                                                                             │
│  [2]  gate.G1_EXECUTIVE_AGREED          [is equal to ▾]      [ false  ]     │
│                                                                             │
│  [3]  daysInStage                       [is greater than ▾]  [ 30     ]     │
│                                                                             │
│                          [+ Add Condition]  [Remove Last]                   │
│                                                                             │
│  ALERT MESSAGE TEMPLATE:                                                    │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │ MEGA DEAL WITHOUT EXECUTIVE ALIGNMENT: {{accountName}} (${{TCV}})  │   │
│  │ has been active for {{daysInStage}} days with no executive         │   │
│  │ champion agreement. At this TCV level, executive sponsorship is    │   │
│  │ non-negotiable. Recommend immediate C-suite introduction.         │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                                                                             │
│  AVAILABLE PLACEHOLDERS: {{accountName}} {{dealName}} {{TCV}}              │
│  {{daysInStage}} {{salesStage}} {{progressPct}} {{closeDate}}             │
│                                                                             │
│  ───────────────────────────────────────────────────────────────────────    │
│  TEST AGAINST CURRENT DEALS:                                               │
│  [Run Test]                                                                │
│                                                                             │
│  Results: 3 of 12 active deals would trigger this pattern:                 │
│  • ACME CORP ($1.45M, 45 days in Commercial)                              │
│  • Atlas Health ($1.93M, 38 days in Validation)                            │
│  • Meridian Logistics ($2.1M, 52 days in Discovery)                        │
│                                                                             │
│  [Save Pattern]  [Save & Activate]  [Cancel]                               │
└─────────────────────────────────────────────────────────────────────────────┘
```

### 12.5 Custom Pattern Evaluation

```javascript
// services/customPatternEvaluator.js

/**
 * Evaluates all active custom risk patterns against a deal.
 * Called AFTER the Phase 1 built-in patterns run (charter C2: built-ins are
 * the fixed engineer-defined array and are never authored through this path).
 */
async function evaluateCustomPatterns(dealIntelligence, pool) {
    const { rows: patterns } = await pool.query(`
        SELECT c.*, json_agg(cc.* ORDER BY cc.sort_order) as conditions
        FROM edc_v2.custom_risk_patterns c
        JOIN edc_v2.custom_pattern_conditions cc ON cc.pattern_id = c.id
        WHERE c.is_active = true
        GROUP BY c.id
    `);

    const customAlerts = [];

    for (const pattern of patterns) {
        const conditionsMet = pattern.conditions.every(condition => {
            const fieldValue = resolveFieldPath(dealIntelligence, condition.field_path);
            return evaluateCondition(fieldValue, condition.operator, condition.comparison_value);
        });

        if (conditionsMet) {
            const message = renderTemplate(pattern.alert_message_template, dealIntelligence);
            customAlerts.push({
                code: `CUSTOM_${pattern.id}`,
                severity: pattern.severity,
                weight: pattern.weight,
                message,
                isCustom: true,
                patternName: pattern.pattern_name
            });

            // Update trigger count (fire-and-forget)
            pool.query(
                'UPDATE edc_v2.custom_risk_patterns SET trigger_count = trigger_count + 1, last_triggered_at = NOW() WHERE id = $1',
                [pattern.id]
            ).catch(() => {});
        }
    }

    return customAlerts;
}

function resolveFieldPath(obj, path) {
    return path.split('.').reduce((o, key) => {
        // Handle gate-specific paths like 'gate.G1_CRITERIA_LOCKED'
        if (key.startsWith('gate.')) {
            const gateCode = key.replace('gate.', '');
            return obj.technicalTrack?.gates?.find(g => g.gateCode === gateCode)?.isCompleted;
        }
        return o?.[key];
    }, obj);
}

function evaluateCondition(fieldValue, operator, comparisonValue) {
    switch (operator) {
        case 'gt':  return parseFloat(fieldValue) > parseFloat(comparisonValue);
        case 'lt':  return parseFloat(fieldValue) < parseFloat(comparisonValue);
        case 'gte': return parseFloat(fieldValue) >= parseFloat(comparisonValue);
        case 'lte': return parseFloat(fieldValue) <= parseFloat(comparisonValue);
        case 'eq':  return String(fieldValue) === comparisonValue;
        case 'neq': return String(fieldValue) !== comparisonValue;
        case 'contains': return String(fieldValue).toLowerCase().includes(comparisonValue.toLowerCase());
        case 'not_contains': return !String(fieldValue).toLowerCase().includes(comparisonValue.toLowerCase());
        case 'is_null': return fieldValue == null;
        case 'is_not_null': return fieldValue != null;
        default: return false;
    }
}

function renderTemplate(template, dealIntelligence) {
    return template.replace(/\{\{(\w+)\}\}/g, (match, key) => {
        const mapping = {
            accountName: dealIntelligence.accountName,
            dealName: dealIntelligence.dealName,
            TCV: dealIntelligence.financials?.calculatedTCV?.toLocaleString(),
            daysInStage: dealIntelligence.daysInStage,
            salesStage: dealIntelligence.salesStage,
            progressPct: dealIntelligence.technicalTrack?.progressPercentage,
            closeDate: dealIntelligence.financials?.expectedCloseDate
        };
        return mapping[key] ?? match;
    });
}
```

---

## 13. Automated Playbook Engine & Next-Best-Action (Dynamic Superset)

> **Relationship to Phase 1 (Non-Overlap) — charter C7.** This engine is the **DYNAMIC SUPERSET** of Phase 1's static intervention model. **Phase 1 owns** the *static* side (F7/C7): intervention checklists attached to built-in alert codes (`intervention_checklists` lookup with JSONB steps), a manual "Launch Intervention" action, and a `POST /interventions` endpoint that **logs only** (no lifecycle, no auto-assignment, no next-best-action). **Phase 2 adds**: auto-assignment on stage match, multi-step lifecycle tracking, step completion/skip with reasons, next-best-action recommendation, and critical-step alerts. Phase 2's engine **may build on / supersede** the Phase 1 static checklists — a Phase 1 `intervention_checklists` entry can seed the first steps of a Phase 2 playbook — but Phase 1's launch-and-log behavior is never removed, and Phase 1 never gains lifecycle state.

### 13.1 Problem Statement

The Commander knows what *should* happen at each stage of a deal. Phase 1 lets them launch a *static* checklist against a fired alert and log that they did so — useful, but stateless. When reviewing 15 deals in a session, it's easy to miss the *next* action because the checklist doesn't track where you are. Phase 2 codifies best practices into stateful playbooks and automatically recommends the next action.

### 13.2 Data Model

```sql
-- Playbook definitions
CREATE TABLE edc_v2.playbooks (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    playbook_name VARCHAR(205) NOT NULL,
    description TEXT,
    applicable_stage VARCHAR(50),           -- Stage where this playbook activates
    applicable_deal_profile JSONB,          -- Optional: conditions for auto-assignment
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_by UUID REFERENCES edc_v2.commander_profiles(id),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Steps within a playbook
CREATE TABLE edc_v2.playbook_steps (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    playbook_id UUID NOT NULL REFERENCES edc_v2.playbooks(id) ON DELETE CASCADE,
    step_order SMALLINT NOT NULL,
    step_name VARCHAR(255) NOT NULL,
    description TEXT,
    trigger_condition TEXT,                 -- When this step should surface (e.g., "When Gate 2 completes")
    recommended_action TEXT NOT NULL,       -- What the Commander should do
    expected_duration_days INT,             -- How long this step typically takes
    is_critical BOOLEAN NOT NULL DEFAULT FALSE,  -- If true, blocking alert if not completed
    UNIQUE(playbook_id, step_order)
);

-- Assignment of playbooks to deals
CREATE TABLE edc_v2.deal_playbook_assignments (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    deal_id UUID NOT NULL REFERENCES edc.enterprise_deals(id) ON DELETE CASCADE,
    playbook_id UUID NOT NULL REFERENCES edc_v2.playbooks(id),
    current_step_id UUID REFERENCES edc_v2.playbook_steps(id),
    status VARCHAR(20) NOT NULL DEFAULT 'Active',  -- 'Active', 'Completed', 'Abandoned'
    assigned_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    completed_at TIMESTAMP WITH TIME ZONE
);

-- Step completion tracking
CREATE TABLE edc_v2.playbook_step_completions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    assignment_id UUID NOT NULL REFERENCES edc_v2.deal_playbook_assignments(id) ON DELETE CASCADE,
    step_id UUID NOT NULL REFERENCES edc_v2.playbook_steps(id),
    completed_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    notes TEXT,
    skipped BOOLEAN NOT NULL DEFAULT FALSE,
    skip_reason TEXT
);
```

### 13.3 Playbook Display in Deal Workspace

```
┌─────────────────────────────────────────────────────────────────────────────┐
│  ACTIVE PLAYBOOK: "Enterprise Platform Deal — Validation Phase"             │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  CURRENT RECOMMENDATION:                                                    │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │  ▶ Step 4 of 7: Schedule Architecture Deep-Dive with CTO           │   │
│  │                                                                      │   │
│  │  Once Gate 2 (Core Workflow) is complete, the next critical action  │   │
│  │  is to schedule a 90-minute architecture review with the customer's │   │
│  │  CTO. This session should cover: scaling strategy, integration      │   │
│  │  architecture, and data residency requirements.                     │   │
│  │                                                                      │   │
│  │  Expected duration: 7 days                                          │   │
│  │  Status: ⚠ OVERDUE by 3 days                                       │   │
│  │                                                                      │   │
│  │  [Mark Complete]  [Skip (with reason)]                              │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                                                                             │
│  PLAYBOOK PROGRESS:                                                         │
│  [✓] Step 1: Define Success Criteria with Customer          (Completed)    │
│  [✓] Step 2: Execute Core Workflow Demo                     (Completed)    │
│  [✓] Step 3: Validate Champion Internal Advocacy            (Completed)    │
│  [▸] Step 4: Schedule Architecture Deep-Dive with CTO       ← CURRENT     │
│  [ ] Step 5: Run Performance Benchmark                      (Upcoming)     │
│  [ ] Step 6: Submit InfoSec Package                         (Upcoming)     │
│  [ ] Step 7: Obtain CTO Written Approval                    (Upcoming)     │
│                                                                             │
│  [View Full Playbook Library]  [Switch Playbook]                            │
└─────────────────────────────────────────────────────────────────────────────┘
```

> **Boundary note.** The *stateful progress tracker* above (current step, completed/upcoming, overdue, next-best-action) is the Phase 2 superset. Phase 1's equivalent is a *flat, stateless* intervention checklist the Commander launches and logs; it never shows a "current step" or "overdue" state. A Phase 1 checklist may be imported as the seed steps of a Phase 2 playbook, but the lifecycle machinery is Phase 2's alone.

### 13.4 Auto-Assignment Logic

When a deal's stage changes, the system checks for applicable playbooks (auto-assignment is Phase-2-only; Phase 1 interventions are always human-launched, per C7):

```javascript
// services/playbookEngine.js

async function autoAssignPlaybook(dealId, newStage, pool) {
    // Find playbooks matching this stage
    const { rows: candidates } = await pool.query(
        'SELECT * FROM edc_v2.playbooks WHERE applicable_stage = $1 AND is_active = true',
        [newStage]
    );

    // Check if deal already has an active playbook for this stage
    const { rows: existing } = await pool.query(
        `SELECT id FROM edc_v2.deal_playbook_assignments
         WHERE deal_id = $1 AND status = 'Active'`,
        [dealId]
    );

    if (existing.length > 0 || candidates.length === 0) return;

    // Auto-assign the first matching playbook
    const playbook = candidates[0];
    const { rows: firstStep } = await pool.query(
        'SELECT id FROM edc_v2.playbook_steps WHERE playbook_id = $1 ORDER BY step_order LIMIT 1',
        [playbook.id]
    );

    await pool.query(
        `INSERT INTO edc_v2.deal_playbook_assignments (deal_id, playbook_id, current_step_id)
         VALUES ($1, $2, $3)`,
        [dealId, playbook.id, firstStep[0]?.id]
    );
}
```

---

## 14. Natural Language Command Interface

> **Relationship to Phase 1 (Non-Overlap) — charter C16.** The NLC interface is **entirely Phase 2**. Phase 1 has no natural-language querying. NLC reads existing Phase 1 / Phase 2 fields (including the Phase 2 `predictive_score` and Phase 1 health/gate state) but adds no new data model.

### 14.1 Problem Statement

The Commander needs to answer ad-hoc questions like "Which deals are RED and above $1M?" or "Show me all deals closing this quarter with less than 50% gate completion." In V1/Phase 1, this requires manual scanning. Phase 2 introduces a search bar that parses natural language into structured queries.

### 14.2 NLC Parser Architecture

The Natural Language Command (NLC) parser is a keyword-based query translator — not a full LLM. This ensures deterministic results, zero hallucination, and offline operation. It handles a defined grammar of query patterns.

```javascript
// services/nlcParser.js

/**
 * Supported query grammar:
 *
 * SHOW [ME] [ALL] <entity> [WHERE <condition> [AND <condition>...]]
 * COMPARE <deal1> AND <deal2>
 * COUNT <entity> [WHERE <condition>]
 * SORT [BY] <field> [ASC|DESC]
 *
 * Conditions:
 *   <field> <operator> <value>
 *   field: stage, health, tcv, revenue, gates, progress, competitor, tag, days, close, score, blocker
 *   operator: >, <, >=, <=, =, is, contains, above, below, over, under, between, in
 *   value: number, string, date expression (this quarter, next month, today, etc.)
 */

const fieldMappings = {
    'stage': 'sales_stage_name',
    'health': 'health_status',
    'tcv': 'calculated_tcv',
    'revenue': 'calculated_tcv',
    'product_revenue': 'product_revenue',
    'services_revenue': 'services_revenue',
    'gates': 'steps_completed',
    'progress': 'progress_percentage',
    'days': 'days_in_stage',
    'close': 'days_to_close',
    'close_date': 'expected_close_date',
    'score': 'predictive_score',
    'probability': 'win_probability',
    'blocker': 'active_blocker_count',
    'blockers': 'active_blocker_count',
    'high_blockers': 'high_severity_blocker_count',
    'competitor': 'active_competitor_count',
    'commander': 'commander_name',
    'am': 'account_manager',
    'tl': 'technical_lead',
    'pricing': 'pricing_model',
    'currency': 'deal_currency',
    'tag': 'tags'
};

const operatorMappings = {
    '>': 'gt', 'above': 'gt', 'over': 'gt', 'greater': 'gt',
    '<': 'lt', 'below': 'lt', 'under': 'lt', 'less': 'lt',
    '>=': 'gte', 'at least': 'gte',
    '<=': 'lte', 'at most': 'lte',
    '=': 'eq', 'is': 'eq', 'equals': 'eq',
    '!=': 'neq', 'is not': 'neq', 'not': 'neq',
    'contains': 'contains', 'includes': 'contains',
    'in': 'in', 'between': 'between'
};

const dateExpressions = {
    'this quarter': () => getCurrentQuarterRange(),
    'next quarter': () => getNextQuarterRange(),
    'this month': () => getCurrentMonthRange(),
    'this year': () => getCurrentYearRange(),
    'today': () => ({ start: new Date(), end: new Date() }),
    'this week': () => getCurrentWeekRange()
};

/**
 * Parses a natural language query string into a structured query object.
 * Returns null if the query cannot be parsed (falls back to text search).
 */
function parseNLC(input) {
    const normalized = input.toLowerCase().trim();

    // Pattern: "show [me] [all] deals [where ...]"
    const showMatch = normalized.match(
        /^show\s+(?:me\s+)?(?:all\s+)?(?:deals|accounts|pipeline)\s*(?:where\s+(.+))?$/
    );
    if (showMatch) {
        const conditions = showMatch[1] ? parseConditions(showMatch[1]) : [];
        return { type: 'LIST', entity: 'deals', conditions };
    }

    // Pattern: "count [deals] [where ...]"
    const countMatch = normalized.match(
        /^count\s+(?:deals\s+)?(?:where\s+(.+))?$/
    );
    if (countMatch) {
        const conditions = countMatch[1] ? parseConditions(countMatch[1]) : [];
        return { type: 'COUNT', entity: 'deals', conditions };
    }

    // Pattern: "compare <deal1> and <deal2>"
    const compareMatch = normalized.match(
        /^compare\s+(.+?)\s+and\s+(.+)$/
    );
    if (compareMatch) {
        return { type: 'COMPARE', deals: [compareMatch[1].trim(), compareMatch[2].trim()] };
    }

    // Pattern: "red deals above $1M"
    const quickFilter = parseQuickFilter(normalized);
    if (quickFilter) return quickFilter;

    // Fallback: full-text search
    return { type: 'SEARCH', query: input };
}

function parseConditions(conditionStr) {
    // Split on "and" but not within quoted strings
    const parts = conditionSplit(conditionStr);
    return parts.map(part => {
        // Try to match: <field> <operator> <value>
        for (const [keyword, dbField] of Object.entries(fieldMappings)) {
            if (part.includes(keyword)) {
                const remainder = part.replace(keyword, '').trim();
                for (const [opKeyword, opSymbol] of Object.entries(operatorMappings)) {
                    if (remainder.includes(opKeyword)) {
                        const valueStr = remainder.replace(opKeyword, '').trim();
                        const value = parseValue(valueStr);
                        return { field: dbField, operator: opSymbol, value };
                    }
                }
            }
        }
        return null;
    }).filter(Boolean);
}

function parseValue(str) {
    // Dollar amounts: "$1M", "$500k", "$1,450,000"
    const dollarMatch = str.match(/\$?([\d,.]+)\s*(m|k|million|thousand)?/i);
    if (dollarMatch) {
        let num = parseFloat(dollarMatch[1].replace(/,/g, ''));
        const suffix = (dollarMatch[2] || '').toLowerCase();
        if (suffix === 'm' || suffix === 'million') num *= 1000000;
        if (suffix === 'k' || suffix === 'thousand') num *= 1000;
        return num;
    }

    // Percentages: "50%", "75 percent"
    const pctMatch = str.match(/([\d.]+)\s*%?/);
    if (pctMatch && str.includes('%')) return parseFloat(pctMatch[1]);

    // Numbers
    const num = parseFloat(str.replace(/,/g, ''));
    if (!isNaN(num)) return num;

    // Date expressions
    for (const [expr, resolver] of Object.entries(dateExpressions)) {
        if (str.includes(expr)) return resolver();
    }

    // String
    return str.replace(/['"]/g, '').trim();
}
```

### 14.3 NLC UI (Command Palette)

Activated via `Ctrl+K`:

```
┌─────────────────────────────────────────────────────────────────────────────┐
│  🔍  [ red deals above $1M closing this quarter                    ]       │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  INTERPRETED AS:                                                            │
│  Show deals WHERE health = RED AND tcv > $1,000,000                        │
│                AND close_date BETWEEN (Q3 start) AND (Q3 end)              │
│                                                                             │
│  RESULTS: 2 deals matched                                                  │
│                                                                             │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │  ACME CORP         $1.45M   RED   Commercial   Close: 2025-08-15   │   │
│  │  Atlas Health      $1.93M   RED   Validation   Close: 2025-09-30   │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                                                                             │
│  [Open in Cockpit]  [Export as PDF]  [Pin to Dashboard]                    │
│                                                                             │
│  ─────────────────────────────────────────────────────────────────────     │
│  RECENT QUERIES:                                                            │
│  • "deals with > 2 high blockers"                                          │
│  • "compare acme and atlas"                                                │
│  • "count deals where progress below 30%"                                  │
└─────────────────────────────────────────────────────────────────────────────┘
```

### 14.4 Query Examples

| Natural Language Query | Interpreted As |
|---|---|
| `show red deals above $1M` | `WHERE health = 'RED' AND tcv > 1000000` |
| `deals closing this quarter with less than 50% progress` | `WHERE close_date IN this_quarter AND progress < 50` |
| `count deals where stage is commercial and blockers > 2` | `COUNT WHERE stage = 'Commercial' AND blockers > 2` |
| `compare acme corp and horizon fintech` | Side-by-side deal comparison view |
| `deals with snowflake as competitor` | `WHERE competitor = 'Snowflake'` |
| `stale deals over 30 days` | `WHERE days_in_stage > 30` |
| `my deals with no close date` | `WHERE expected_close_date IS NULL` |
| `highest tcv deals` | `SORT BY tcv DESC LIMIT 10` |

---

## 15. Smart Alerts with Escalation Chains (Delivery & Escalation Layer)

> **Relationship to Phase 1 (Non-Overlap) — charter C4 / C7.** This is the **delivery / escalation layer**, and it is the part Phase 1 deliberately lacks. **Phase 1 owns** the *in-cockpit advisory dispositions* — Acknowledge / Accept / Snooze (state-based, e.g. "until G3 changes") with required rationale recorded to `deal_audit_log`, surfaced via the in-cockpit `AuditTrailViewer` (F3/C4) — and the *manual 48-hour Bat-Signal* read-only share link (F7/C7). Critically, **Phase 1 delivers nothing anywhere and has zero notification infrastructure**. Phase 2 adds notification rules, escalation chains, the in-app notification center, email/in-app delivery, acknowledgement-*of-delivery*, and the notification log. Note the two distinct "acknowledge" verbs: Phase 1 acknowledges *an advisory's cockpit state*; Phase 2 acknowledges *receipt of a delivered message*.

### 15.1 Problem Statement

Phase 1's risk advisories sit in the cockpit. A Commander can Acknowledge / Accept / Snooze them — but if a deal turns RED and the Commander doesn't log in for two days, no message goes out and no one is alerted. Phase 1 has no delivery channel by design. Phase 2 introduces active alerting with configurable escalation chains.

### 15.2 Data Model

```sql
-- Notification rules defined by Commanders
CREATE TABLE edc_v2.notification_rules (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    commander_id UUID NOT NULL REFERENCES edc_v2.commander_profiles(id),
    rule_name VARCHAR(255) NOT NULL,
    trigger_event VARCHAR(50) NOT NULL,      -- 'health_changed', 'alert_fired', 'stage_changed',
                                             -- 'blocker_created', 'close_date_approaching', 'decision_overdue'
    trigger_conditions JSONB,                -- Additional filters (e.g., only RED, only TCV > $500K)
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Escalation steps within a rule
CREATE TABLE edc_v2.notification_escalation_steps (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    rule_id UUID NOT NULL REFERENCES edc_v2.notification_rules(id) ON DELETE CASCADE,
    step_order SMALLINT NOT NULL,
    delay_hours INT NOT NULL DEFAULT 0,      -- Hours after trigger before this step fires
    channel VARCHAR(20) NOT NULL,            -- 'email', 'in_app'
    recipient VARCHAR(255) NOT NULL,         -- Email address or commander ID
    message_template TEXT NOT NULL,
    UNIQUE(rule_id, step_order)
);

-- Notification log (audit trail of sent notifications)
CREATE TABLE edc_v2.notification_log (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    rule_id UUID REFERENCES edc_v2.notification_rules(id),
    deal_id UUID REFERENCES edc.enterprise_deals(id),
    escalation_step_id UUID REFERENCES edc_v2.notification_escalation_steps(id),
    channel VARCHAR(20) NOT NULL,
    recipient VARCHAR(255) NOT NULL,
    subject TEXT,
    message TEXT NOT NULL,
    sent_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    acknowledged_at TIMESTAMP WITH TIME ZONE   -- acknowledgement OF DELIVERY (distinct from Phase 1 advisory ack)
);
```

### 15.3 Escalation Chain Example

```
┌─────────────────────────────────────────────────────────────────────────────┐
│  ESCALATION RULE: "RED Deal Alert — Above $500K"                            │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  TRIGGER: health_changed TO 'RED' WHERE tcv > $500,000                     │
│                                                                             │
│  ESCALATION CHAIN:                                                          │
│                                                                             │
│  Step 1 (Immediate):                                                        │
│  → Email to Commander: "Deal {accountName} turned RED. {alertMessage}"     │
│                                                                             │
│  Step 2 (+24 hours, if still RED):                                          │
│  → Email to Commander + In-App notification:                                │
│    "URGENT: {accountName} has been RED for 24 hours without resolution."   │
│                                                                             │
│  Step 3 (+72 hours, if still RED):                                          │
│  → Email to Commander's VP (cc Commander):                                  │
│    "ESCALATION: {accountName} (${TCV}) has been RED for 3 days.            │
│     {alertMessage}. Commander notes: {blueprintNotes}"                     │
│                                                                             │
│  Step 3 only fires if deal is not yet addressed.                            │
│  Acknowledgment (Commander clicks "I'm handling it") cancels further steps.│
│                                                                             │
│  [Save Rule]  [Test with Current RED Deals]                                │
└─────────────────────────────────────────────────────────────────────────────┘
```

### 15.4 In-App Notification Center

```
┌─────────────────────────────────────────────────────────────────────────────┐
│  🔔 NOTIFICATIONS (3 unread)                                    [Mark All Read]│
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  🔴  2 hours ago                                                            │
│  ACME CORP turned RED — "Premature Commercial Disconnect"                   │
│  [View Deal]  [Acknowledge]                                                │
│                                                                             │
│  🟡  6 hours ago                                                            │
│  Decision overdue: "Schedule Architecture Deep-Dive" for Atlas Health       │
│  Due: 2 days ago  │  Owner: Sarah Jenkins                                  │
│  [View Decision]  [Extend Deadline]                                        │
│                                                                             │
│  🟡  1 day ago                                                              │
│  Close date approaching: Horizon Fintech closes in 12 days                 │
│  Gate progress: 44% (expected: 50%+)                                       │
│  [View Deal]                                                               │
│                                                                             │
│  [View All Notifications]                                                  │
└─────────────────────────────────────────────────────────────────────────────┘
```

> **Boundary note.** The `[Acknowledge]` button here acknowledges *receipt of a delivered notification* and writes `notification_log.acknowledged_at` (Phase 2). It is **not** the Phase 1 advisory Acknowledge/Accept/Snooze disposition, which mutates the cockpit advisory state and writes to `deal_audit_log` (C4). Both can apply to the same underlying RED condition without conflict.

---

## PART V — FINANCIAL MODELING & FORECASTING

---

## 16. Ramp Deal Pricing & Per-Year Financial Modeling

> **Relationship to Phase 1 (Non-Overlap) — charter C1.** Ramp/per-year pricing is **Phase 2** and is on a **different axis** from Phase 1's multi-currency normalization. Phase 1 (F1/C1) converts *today's flat* TCV across currencies into a single `reporting_currency` rollup (`fx_rates`, `normalizedTCV`, all thresholds compared in the reporting currency). Phase 2 here models *future per-year* values (Year 1 $300K → Year 3 $500K, graduated discounts). **FX normalization of a flat TCV ≠ a per-year ramp schedule**; they share no table and answer different questions. A ramp deal's per-year totals can themselves be expressed in the deal currency and then normalized by Phase 1's FX layer — the two compose cleanly, with currency conversion (P1) wrapping the ramp computation (P2).

### 16.1 Problem Statement

V1 computes TCV as `product_revenue × term_years + services_revenue`, assuming flat annual pricing. In reality, enterprise multi-year deals frequently use ramp pricing (Year 1: $300K, Year 2: $400K, Year 3: $500K) or graduated discounting. The flat calculation overstates or understates TCV.

### 16.2 Data Model

```sql
-- Per-year pricing breakdown for ramp deals
CREATE TABLE edc_v2.deal_pricing_schedule (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    deal_id UUID NOT NULL REFERENCES edc.enterprise_deals(id) ON DELETE CASCADE,
    year_number SMALLINT NOT NULL CHECK (year_number BETWEEN 1 AND 10),
    product_revenue NUMERIC(15, 2) NOT NULL CHECK (product_revenue >= 0),
    services_revenue NUMERIC(15, 2) NOT NULL DEFAULT 0 CHECK (services_revenue >= 0),
    discount_pct NUMERIC(5, 2) DEFAULT 0 CHECK (discount_pct BETWEEN 0 AND 100),
    notes TEXT,
    UNIQUE(deal_id, year_number)
);
```

### 16.3 Ramp Pricing UI

A tab within the Financial Split Architecture section:

```
┌─────────────────────────────────────────────────────────────────────────────┐
│  MULTI-YEAR PRICING SCHEDULE                                                │
│  Pricing Model: Multi-Year Committed  │  Term: 3 Years                     │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  Year    Product Revenue    Services Revenue    Discount    Net Annual      │
│  ──────────────────────────────────────────────────────────────────────     │
│  Y1      $300,000.00        $100,000.00         10%         $360,000.00    │
│  Y2      $400,000.00        $100,000.00          5%         $475,000.00    │
│  Y3      $500,000.00        $100,000.00          0%         $600,000.00    │
│  ──────────────────────────────────────────────────────────────────────     │
│  TOTAL   $1,200,000.00      $300,000.00                    $1,435,000.00  │
│                                                                             │
│  Computed TCV (ramp-aware): $1,435,000.00                                  │
│  Flat TCV (if annual sub):  $1,500,000.00                                  │
│  Delta: -$65,000.00 (-4.3%)                                                │
│                                                                             │
│  [Auto-fill from Year 1]  [Add Year]  [Remove Last Year]                  │
└─────────────────────────────────────────────────────────────────────────────┘
```

### 16.4 TCV Computation Update

```javascript
// Updated TCV calculation in intelligence engine
// (Ramp-aware; the resulting value can then flow through Phase 1's FX
//  normalization to produce normalizedTCV in the reporting currency — charter C1.)

function computeTCV(deal, pricingSchedule) {
    if (pricingSchedule && pricingSchedule.length > 0) {
        // Ramp-aware TCV
        return pricingSchedule.reduce((sum, year) => {
            const discount = year.discount_pct || 0;
            const netProduct = year.product_revenue * (1 - discount / 100);
            return sum + netProduct + year.services_revenue;
        }, 0);
    }

    // Fallback to flat calculation (V1 behavior)
    const base = parseFloat(deal.product_revenue || 0);
    const services = parseFloat(deal.services_revenue || 0);
    const term = parseInt(deal.contract_term_years || 1);

    if (deal.pricing_model === 'Multi-Year Committed') {
        return (base * term) + services;
    }
    return base + services;
}
```

---

## 17. Financial Scenario Engine (Persisted, Financial, Pipeline-Wide)

> **Relationship to Phase 1 (Non-Overlap) — charter C10.** This is the **PERSISTED + FINANCIAL + PIPELINE-WIDE** scenario engine, and it is precisely the half of "what-if" that Phase 1 does not have. **Phase 1 owns** the *ephemeral, non-persisted, single-deal, client-side RISK-preview simulator* (F9/C10): it re-runs the client-extracted intelligence engine on unbound inputs to preview **Health Status + Alerts only** — no financial projection, no saved scenario, no pipeline-wide application, nothing written to the database. **Phase 2 adds** everything Phase 1 deliberately omits: saved/reusable scenarios (`financial_scenarios`), TCV/discount/term/services *financial* modeling, pipeline-wide application across many deals, and cached `computed_results`. The two are complementary: a Commander can preview *risk* instantly client-side (P1), then, when they want to *model the money and save it*, reach for this engine (P2).

### 17.1 Problem Statement

The Commander needs to answer questions like:
- "What if we give them a 20% discount instead of 15%?"
- "What if they drop the Professional Services SOW?"
- "What if the deal slips to next quarter and we lose the multi-year commitment?"
- "What's the revenue impact if 3 of our RED deals don't close?"

Phase 1's ephemeral simulator can show how such a change would move *health and alerts* for a single deal in the moment, but it computes no TCV, saves nothing, and cannot span the pipeline. Phase 2 introduces the financial, persisted, pipeline-wide scenario engine.

### 17.2 Data Model

```sql
CREATE TABLE edc_v2.financial_scenarios (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    scenario_name VARCHAR(255) NOT NULL,
    description TEXT,
    deal_id UUID REFERENCES edc.enterprise_deals(id),     -- Per-deal scenario (nullable)
    is_global BOOLEAN NOT NULL DEFAULT FALSE,              -- Pipeline-wide scenario
    modifications JSONB NOT NULL,                          -- List of parameter overrides
    computed_results JSONB,                                -- Cached computation results
    created_by UUID NOT NULL REFERENCES edc_v2.commander_profiles(id),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- NOTE (charter C10): persistence (this table), financial projection, and the
-- is_global pipeline-wide flag are exactly what distinguishes this from Phase 1's
-- ephemeral, risk-only, single-deal, client-side simulator (which saves nothing).
```

### 17.3 Modification Schema

```json
{
    "modifications": [
        {
            "type": "parameter_override",
            "target": "product_revenue",
            "operation": "set",
            "value": 350000
        },
        {
            "type": "parameter_override",
            "target": "services_revenue",
            "operation": "set",
            "value": 0
        },
        {
            "type": "stage_override",
            "target": "sales_stage",
            "value": "Closed-Lost"
        },
        {
            "type": "probability_override",
            "target": "win_probability",
            "value": 30
        }
    ]
}
```

### 17.4 Scenario Builder UI

```
┌─────────────────────────────────────────────────────────────────────────────┐
│  FINANCIAL SCENARIO ENGINE                                                  │
│  Scenario: "What if ACME drops services and we discount 20%?"              │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  BASE DEAL: ACME CORP (Current TCV: $1,450,000)                            │
│                                                                             │
│  MODIFICATIONS:                                                             │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │  Product Revenue:    $400,000  →  [ $340,000 ]  (−15% discount)     │   │
│  │  Services Revenue:   $250,000  →  [ $0 ]        (dropped)           │   │
│  │  Pricing Model:      Annual Subscription  (unchanged)               │   │
│  │  Term:               3 years  (unchanged)                           │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                                                                             │
│  ┌──────────────────────────────────┐  ┌───────────────────────────────┐   │
│  │  SCENARIO RESULT                 │  │  COMPARISON                   │   │
│  │                                  │  │                               │   │
│  │  Scenario TCV:    $1,020,000    │  │  Current TCV:   $1,450,000    │   │
│  │  Delta:           −$430,000     │  │  Scenario TCV:  $1,020,000    │   │
│  │  % Change:        −29.7%        │  │  Impact:        −$430,000     │   │
│  │                                  │  │                               │   │
│  │  Annual Revenue:  $340,000      │  │  Per-year breakdown:          │   │
│  │  (vs. $650,000 current)         │  │  Y1: $340K vs $650K          │   │
│  │                                  │  │  Y2: $340K vs $650K          │   │
│  │                                  │  │  Y3: $340K vs $650K          │   │
│  └──────────────────────────────────┘  └───────────────────────────────┘   │
│                                                                             │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │  PIPELINE-WIDE IMPACT (if this scenario applied to ACME only)      │   │
│  │                                                                      │   │
│  │  Current Monitored TCV:   $8,450,000                                │   │
│  │  Scenario Monitored TCV:  $8,020,000                                │   │
│  │  Pipeline Impact:         −$430,000 (−5.1%)                         │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                                                                             │
│  [Save Scenario]  [Apply to Pipeline Forecast]  [Reset]                    │
└─────────────────────────────────────────────────────────────────────────────┘
```

> **Boundary note.** `[Save Scenario]`, the TCV/per-year financial computation, and `[Apply to Pipeline Forecast]` (pipeline-wide) are the three things that mark this as Phase 2 (C10). The Phase 1 simulator has none of them — it would only show how these modifications change ACME's *health badge and alert list*, in memory, then discard the result.

### 17.5 Pipeline-Wide Scenarios

Global scenarios apply a modification across multiple deals (pipeline-wide is Phase-2-only; Phase 1's simulator is strictly single-deal):

```
┌─────────────────────────────────────────────────────────────────────────────┐
│  PIPELINE SCENARIO: "What if all RED deals don't close?"                    │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  MODIFICATION: Set health_status = RED deals to Closed-Lost                │
│                                                                             │
│  AFFECTED DEALS (2):                                                        │
│  • ACME CORP        $1,450,000  →  $0                                     │
│  • Atlas Health     $1,930,000  →  $0                                     │
│                                                                             │
│  ┌────────────────────────────────────────┐                                │
│  │  Current Pipeline:      $8,450,000     │                                │
│  │  Scenario Pipeline:     $5,070,000     │                                │
│  │  Revenue at Risk:       $3,380,000     │                                │
│  │  Pipeline Reduction:    40.0%          │                                │
│  └────────────────────────────────────────┘                                │
│                                                                             │
│  RECOMMENDATION: Prioritize ACME CORP and Atlas Health for executive       │
│  intervention. Combined $3.38M is 40% of monitored pipeline.              │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## 18. Pipeline Simulation & Probabilistic Forecasting

> **Relationship to Phase 1 (Non-Overlap) — charter C10.** Monte-Carlo pipeline simulation is **Phase 2** (it consumes the Phase 2 predictive score and applies it across the whole pipeline over many iterations). Phase 1 has no probabilistic forecasting and no pipeline-wide computation.

### 18.1 Problem Statement

Traditional pipeline forecasting uses a single number per deal (win probability × TCV = weighted pipeline). This doesn't capture the range of possible outcomes. A deal with 60% probability and $1M TCV contributes $600K to the weighted pipeline — but the actual outcome is binary: $0 or $1M. The aggregate weighted pipeline is a misleading average.

### 18.2 Monte Carlo Simulation Engine

```javascript
// services/pipelineSimulation.js

/**
 * Runs a Monte Carlo simulation on the active pipeline.
 * For each simulation iteration, each deal is "played" based on its
 * predicted close probability. The result is a distribution of
 * possible total pipeline outcomes.
 *
 * @param {Array} deals - Array of deal intelligence objects with predictive scores
 * @param {number} iterations - Number of simulation runs (default: 10,000)
 * @returns {Object} Distribution of outcomes with percentiles
 */
function runPipelineSimulation(deals, iterations = 10000) {
    const outcomes = [];

    for (let i = 0; i < iterations; i++) {
        let totalClosed = 0;

        for (const deal of deals) {
            const probability = (deal.predictiveScore?.score || deal.financials.winProbability || 30) / 100;
            const tcv = deal.financials.calculatedTCV;

            // Roll the dice
            if (Math.random() < probability) {
                totalClosed += tcv;
            }
        }

        outcomes.push(totalClosed);
    }

    // Sort outcomes for percentile calculation
    outcomes.sort((a, b) => a - b);

    const percentile = (p) => outcomes[Math.floor(iterations * p)];

    return {
        iterations,
        totalDeals: deals.length,
        percentiles: {
            p10: percentile(0.10),    // 10th percentile (worst realistic case)
            p25: percentile(0.25),    // 25th percentile
            p50: percentile(0.50),    // Median (50/50 outcome)
            p75: percentile(0.75),    // 75th percentile
            p90: percentile(0.90),    // 90th percentile (best realistic case)
        },
        mean: outcomes.reduce((a, b) => a + b, 0) / iterations,
        weightedPipeline: deals.reduce((sum, d) =>
            sum + (d.financials.calculatedTCV * ((d.predictiveScore?.score || 30) / 100)), 0
        ),
        worstCase: outcomes[0],
        bestCase: outcomes[outcomes.length - 1]
    };
}

module.exports = { runPipelineSimulation };
```

### 18.3 Simulation Results UI

```
┌─────────────────────────────────────────────────────────────────────────────┐
│  PIPELINE SIMULATION RESULTS                                 [Re-Run ▾]    │
│  Based on 10,000 iterations  │  12 active deals  │  Total: $8.45M          │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  OUTCOME DISTRIBUTION:                                                      │
│                                                                             │
│  Probability                                                                │
│  │                                                                          │
│  │           ┌───┐                                                          │
│  │          ┌┤   ├┐                                                         │
│  │         ┌┤│   │├┐                                                        │
│  │        ┌┤││   ││├┐                                                       │
│  │       ┌┤│││   │││├┐                                                      │
│  │      ┌┤││││   ││││├┐                                                     │
│  │     ┌┤│││││   │││││├┐                                                    │
│  │    ┌┤││││││   ││││││├┐                                                   │
│  │  ──┤│││││││   │││││││├────────────────                                   │
│  └────┴┴┴┴┴┴┴┴───┴┴┴┴┴┴┴┴───────────────── $                              │
│      $0        $4.2M      $8.45M                                            │
│      ◄── Worst Case     Median     Best Case ──►                            │
│                                                                             │
│  KEY PERCENTILES:                                                           │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │  Percentile    Expected Closed Revenue    Interpretation            │   │
│  │  ──────────────────────────────────────────────────────────────    │   │
│  │  P10 (Bear)    $2,100,000                "If things go badly"      │   │
│  │  P25           $3,400,000                "Conservative forecast"   │   │
│  │  P50 (Median)  $4,200,000                "Most likely outcome"     │   │
│  │  P75           $5,800,000                "Optimistic forecast"     │   │
│  │  P90 (Bull)    $7,200,000                "If things go well"       │   │
│  │  ──────────────────────────────────────────────────────────────    │   │
│  │  Weighted Pipeline (traditional): $5,230,000                       │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                                                                             │
│  INSIGHT: Traditional weighted pipeline ($5.23M) overestimates the         │
│  median outcome ($4.2M) by $1.03M. Use P50 for planning, P25 for          │
│  conservative budgeting.                                                    │
│                                                                             │
│  [Export Report]  [Save to Dashboard]  [Compare with Last Month]           │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## PART VI — EXECUTIVE COMMUNICATION & REPORTING

---

## 19. Board-Ready Report Generation Engine

> **Relationship to Phase 1 (Non-Overlap) — charter C15.** Portable multi-page PDF report generation is **entirely Phase 2**. Phase 1's Briefing Mode is screen-only with presenter ergonomics (agenda, private speaker notes, pacing) — it produces no document. Phase 1 has no report generation of any kind.

### 19.1 Problem Statement

Phase 1's Briefing Mode is screen-based. Executives and board members need portable, formatted documents: multi-page PDFs with charts, tables, and narrative summaries. The Commander currently builds these manually in PowerPoint or Google Slides — a process that takes 2-3 hours per board meeting.

### 19.2 Report Generation Architecture

Phase 2 generates PDF reports using a template engine:

```
┌──────────────────┐     ┌──────────────────┐     ┌──────────────────┐
│  Report Template │────▶│  Data Assembly   │────▶│  PDF Renderer    │
│  (HTML/CSS)      │     │  (Aggregation)   │     │  (Puppeteer)     │
└──────────────────┘     └──────────────────┘     └──────────────────┘
```

**Template Engine:** HTML/CSS templates rendered server-side via a headless Chromium instance (Puppeteer). Charts rendered with Chart.js in the HTML template before PDF capture.

### 19.3 Report Types

| Report | Pages | Content |
|---|---|---|
| **Executive Pipeline Summary** | 4-6 | Cover page, pipeline by stage, health distribution, top 5 deals by TCV, critical alerts, predictive forecast |
| **Deal Deep-Dive** | 2-3 | Single deal detail: team, gates, financials, risks, stakeholders, competitive landscape, decision log |
| **Quarterly Business Review (QBR)** | 8-12 | Multi-section: pipeline evolution, win/loss analytics, velocity benchmarks, competitive intelligence, lessons learned, next-quarter forecast |
| **Board Deck** | 10-15 | Full pipeline narrative with Monte Carlo simulation results, risk register, strategic recommendations |

### 19.4 Report Generation UI

```
┌─────────────────────────────────────────────────────────────────────────────┐
│  GENERATE REPORT                                                            │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  Report Type:    [ Executive Pipeline Summary ▾ ]                           │
│  Date Range:     [ 2025-04-01 ] to [ 2025-06-30 ]                          │
│  Scope:          [●] All Deals   ○ Selected Deals Only                     │
│  Include:        [✓] Financials   [✓] Risk Alerts   [✓] Predictions       │
│                  [✓] Velocity     [✓] Competitive   [ ] Decision Log       │
│  Format:         [●] PDF   ○ HTML (for screen)                             │
│                                                                             │
│  PREVIEW (first page):                                                      │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │                                                                      │   │
│  │          ENTERPRISE PIPELINE SUMMARY                                 │   │
│  │          Q2 2025                                                     │   │
│  │                                                                      │   │
│  │          Prepared for: Executive Leadership Team                     │   │
│  │          Prepared by: Sarah Jenkins, Presales Enterprise Manager     │   │
│  │          Date: June 21, 2025                                         │   │
│  │          Classification: CONFIDENTIAL                                │   │
│  │                                                                      │   │
│  │          ─────────────────────────────────                           │   │
│  │                                                                      │   │
│  │          Total Pipeline Monitored:  $8.45M                           │   │
│  │          Weighted Pipeline:         $5.23M                           │   │
│  │          Active Deals:              12                               │   │
│  │          Critical Alerts:           2 RED                            │   │
│  │                                                                      │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                                                                             │
│  [Generate PDF]  [Schedule Recurring]  [Email to Recipients]               │
└─────────────────────────────────────────────────────────────────────────────┘
```

### 19.5 Report Data Assembly

```javascript
// services/reportGenerator.js

async function assembleReportData(reportType, dateRange, scope, pool) {
    const data = {};

    // Pipeline summary
    data.pipeline = await pool.query(`
        SELECT
            ps.stage_name,
            COUNT(*) as deal_count,
            SUM(ed.product_revenue + ed.services_revenue) as total_tcv
        FROM edc.enterprise_deals ed
        JOIN edc.pipeline_stages ps ON ps.id = ed.sales_stage_id
        WHERE ps.stage_name NOT IN ('Closed-Won', 'Closed-Lost')
        GROUP BY ps.stage_name
        ORDER BY ps.sort_order
    `);

    // Health distribution
    data.health = await computeHealthDistribution(pool);

    // Top deals
    data.topDeals = await pool.query(`
        SELECT ed.account_name, ed.deal_name, ed.product_revenue + ed.services_revenue as tcv,
               ps.stage_name
        FROM edc.enterprise_deals ed
        JOIN edc.pipeline_stages ps ON ps.id = ed.sales_stage_id
        WHERE ps.stage_name NOT IN ('Closed-Won', 'Closed-Lost')
        ORDER BY tcv DESC LIMIT 5
    `);

    // Critical alerts
    data.criticalAlerts = await getActiveAlerts(pool, 'RED');

    // Simulation results (cached from last run)
    data.simulation = await getCachedSimulation(pool);

    // Win/loss for period
    data.winLoss = await pool.query(`
        SELECT
            COUNT(*) FILTER (WHERE ps.stage_name = 'Closed-Won') as wins,
            COUNT(*) FILTER (WHERE ps.stage_name = 'Closed-Lost') as losses
        FROM edc.enterprise_deals ed
        JOIN edc.pipeline_stages ps ON ps.id = ed.sales_stage_id
        WHERE ed.updated_at BETWEEN $1 AND $2
    `, [dateRange.start, dateRange.end]);

    return data;
}
```

---

## 20. Executive Briefing Mode V2 (On-Screen Data Layer)

> **Relationship to Phase 1 (Non-Overlap) — charter C15 / C8.** Briefing Mode V2 and Phase 1's Briefing enhancements are on **orthogonal axes** with no shared surface. **Phase 1 owns presenter ergonomics** (F5/C15): the curated session **agenda/queue**, **private speaker notes** (never projected or exported), and the session **pacing timer** — the tools for *running* the meeting. Phase 1 also owns the audit-log **Deal Replay** (F6/C8), a read-time reconstruction. **Phase 2 Briefing V2 adds ON-SCREEN DATA**: side-by-side comparison, predictive/competitive overlays, decision/memory context, scenario indicators, and drill-down — i.e., *more information shown to the room*. Crucially, where Briefing V2 needs historical state it draws on the **durable snapshot backbone** (`deal_snapshots`, §26/§28), **not** audit-log reconstruction — that keeps it cleanly separate from Phase 1's Deal Replay (which remains a read-time projection of `deal_audit_log`). Presenter ergonomics (P1) and on-screen data (P2) compose in the same Briefing session without overlapping.

### 20.1 Phase 2 Enhancements

Building on V1/Phase 1's Briefing Mode, Phase 2 adds:

| Enhancement | Description |
|---|---|
| **Side-by-Side Comparison** | Compare two deals simultaneously on a split screen |
| **Competitive Overlay** | Show competitor information alongside deal details |
| **Predictive Score Display** | Show data-driven close probability prominently |
| **Decision Context** | Surface recent decisions from the Decision Log |
| **Deal Memory References** | Show relevant past deals with lessons learned |
| **Scenario Impact** | "If this deal closes at current TCV, pipeline impact is +$1.45M" |
| **Drill-Down Capability** | Click any element to expand detail without leaving Briefing Mode |

> None of the above touches Phase 1's agenda/queue, private speaker notes, or pacing timer (C15), and none of it reconstructs state from the audit log (Deal Replay, C8). On-screen historical context here is read from `deal_snapshots`.

### 20.2 Comparison Mode

```
┌─────────────────────────────────────────────────────────────────────────────┐
│  BRIEFING MODE — COMPARISON                                    [Exit ▾]    │
├─────────────────────────────┬───────────────────────────────────────────────┤
│  ACME CORP                  │  ATLAS HEALTH                                │
│  $1.45M  │  [RED] AT RISK  │  $1.93M  │  [RED] AT RISK                   │
│                              │                                               │
│  Gates: 33% (3/9)           │  Gates: 44% (4/9)                            │
│  ██████░░░░░░░░░░░░░░░░    │  ████████░░░░░░░░░░░░░                       │
│  Stalled at Gate 2          │  Stalled at Gate 3                           │
│                              │                                               │
│  Predicted Score: 72        │  Predicted Score: 45                         │
│  Velocity: SLOW (5d over)   │  Velocity: STALLED (18d over)                │
│                              │                                               │
│  ⚠ Premature Commercial     │  ⚠ Close Date Pressure                      │
│  ⚠ Champion Gap             │  ⚠ Hostile Decision Maker                   │
│                              │                                               │
│  Competitors: AWS (active)  │  Competitors: Snowflake (active)             │
│                              │                                               │
│  Decision: Cap discount 15% │  Decision: Escalate InfoSec BAA              │
│  Owner: John Doe            │  Owner: Sarah Jenkins                        │
│                              │                                               │
│  Similar Past Deal:         │  Similar Past Deal:                          │
│  Horizon Fintech (WON)      │  Regional Bank (LOST)                        │
│  "CTO review was key"       │  "Compliance delay killed it"               │
├─────────────────────────────┴───────────────────────────────────────────────┤
│                     ◀  1 of 3 comparisons  ▶                                │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## 21. Automated Email Digest & Scheduled Reporting

> **Relationship to Phase 1 (Non-Overlap) — charter C4.** Scheduled email digests are **entirely Phase 2** — they are part of the delivery layer Phase 1 lacks (C4). Phase 1 sends nothing on a schedule and has no email infrastructure.

### 21.1 Digest Configuration

Each Commander configures their digest preferences:

```
┌─────────────────────────────────────────────────────────────────────────────┐
│  EMAIL DIGEST SETTINGS                                                      │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  Frequency:     [●] Weekly (Monday 8:00 AM)   ○ Daily   ○ None            │
│                                                                             │
│  Include:                                                                   │
│  [✓] Pipeline summary (total TCV, deal count by stage)                     │
│  [✓] Health distribution (GREEN/YELLOW/RED counts)                         │
│  [✓] Critical alerts (RED deals with alert messages)                       │
│  [✓] Predictive forecast (P50 simulation result)                           │
│  [✓] Overdue decisions                                                     │
│  [✓] Deals with approaching close dates (next 30 days)                    │
│  [ ] Velocity benchmarks                                                  │
│  [ ] Competitive intelligence summary                                     │
│                                                                             │
│  Recipients:                                                                │
│  [sarah.jenkins@company.com         ]  (self)                              │
│  [vp.presales@company.com           ]  (VP)                                │
│  [+ Add Recipient]                                                         │
│                                                                             │
│  [Save Preferences]  [Send Test Digest Now]                                │
└─────────────────────────────────────────────────────────────────────────────┘
```

### 21.2 Digest Email Template (Rendered)

```html
<!-- Simplified email HTML structure -->
<div style="font-family: 'Georgia', serif; max-width: 640px; margin: 0 auto;">

    <div style="background: #0d0d0d; color: #f0ece4; padding: 32px; text-align: center;">
        <h1 style="font-size: 24px; margin: 0;">Enterprise Pipeline Digest</h1>
        <p style="color: #7a7570; margin-top: 8px;">Week of June 16–22, 2025</p>
    </div>

    <div style="padding: 24px;">
        <table style="width: 100%; text-align: center;">
            <tr>
                <td><h2 style="color: #e8c547;">$8.45M</h2><p>Total TCV</p></td>
                <td><h2>12</h2><p>Active Deals</p></td>
                <td><h2 style="color: #dc2626;">2</h2><p>RED Alerts</p></td>
                <td><h2>$4.2M</h2><p>Median Forecast</p></td>
            </tr>
        </table>

        <hr style="border: 1px solid #1a1a1a; margin: 24px 0;">

        <h3>Critical Alerts Requiring Attention</h3>
        <div style="border-left: 4px solid #dc2626; padding-left: 16px; margin: 16px 0;">
            <strong>ACME CORP — $1.45M</strong><br>
            Premature Commercial Disconnect: Sales has moved to contract quoting
            before Gate 3 completion.
        </div>
        <div style="border-left: 4px solid #dc2626; padding-left: 16px; margin: 16px 0;">
            <strong>Atlas Health — $1.93M</strong><br>
            Close Date Pressure: Expected close in 18 days with only 44% gate
            completion.
        </div>

        <hr style="border: 1px solid #1a1a1a; margin: 24px 0;">

        <h3>Pipeline by Stage</h3>
        <table style="width: 100%; border-collapse: collapse;">
            <tr><td>Discovery</td><td style="text-align: right;">$1.2M (2)</td></tr>
            <tr><td>Validation</td><td style="text-align: right;">$2.4M (3)</td></tr>
            <tr><td>Commercial</td><td style="text-align: right;">$3.1M (4)</td></tr>
            <tr><td>Procurement</td><td style="text-align: right;">$1.75M (3)</td></tr>
        </table>

        <hr style="border: 1px solid #1a1a1a; margin: 24px 0;">

        <h3>Overdue Decisions</h3>
        <ul>
            <li><strong>ACME CORP:</strong> "Schedule Architecture Deep-Dive" — overdue by 3 days</li>
            <li><strong>Atlas Health:</strong> "Submit InfoSec BAA" — overdue by 7 days</li>
        </ul>

        <p style="color: #7a7570; font-size: 12px; text-align: center; margin-top: 32px;">
            Generated by Enterprise Deal Commander • Confidential
        </p>
    </div>
</div>
```

### 21.3 Scheduling Implementation

```javascript
// services/digestScheduler.js

const cron = require('node-cron');
const nodemailer = require('nodemailer');

// Run every Monday at 7:55 AM UTC (to deliver at 8:00 AM)
cron.schedule('55 7 * * 1', async () => {
    const { rows: commanders } = await pool.query(`
        SELECT * FROM edc_v2.commander_profiles
        WHERE email_notifications = true
          AND digest_frequency = 'weekly'
          AND is_active = true
    `);

    for (const commander of commanders) {
        try {
            const digestData = await assembleDigestData(commander);
            const html = renderDigestTemplate(digestData);
            await sendEmail(commander.email, 'Enterprise Pipeline Digest', html);
        } catch (err) {
            logger.error({ err, commanderId: commander.id }, 'Failed to send digest');
        }
    }
});
```

---

## PART VII — PLATFORM & EXTENSIBILITY

---

## 22. Custom Fields, Tags & Flexible Metadata

> **Relationship to Phase 1 (Non-Overlap) — charter C16.** Commander-defined custom fields and tags are **entirely Phase 2**. Phase 1's schema is fixed.

### 22.1 Problem Statement

Different Commanders need different metadata fields. One might track "Industry Vertical" while another tracks "Deployment Model" (cloud vs. on-prem). The Phase 1 schema is fixed; Phase 2 adds Commander-defined extensibility.

### 22.2 Custom Fields

```sql
CREATE TABLE edc_v2.custom_field_definitions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    field_name VARCHAR(100) NOT NULL,
    field_key VARCHAR(100) NOT NULL UNIQUE,    -- Machine-readable key
    field_type VARCHAR(20) NOT NULL CHECK (field_type IN ('text', 'number', 'date', 'select', 'multi_select')),
    options JSONB,                              -- For select/multi_select: ["Option A", "Option B", ...]
    is_required BOOLEAN NOT NULL DEFAULT FALSE,
    display_order SMALLINT NOT NULL DEFAULT 0,
    created_by UUID REFERENCES edc_v2.commander_profiles(id),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE edc_v2.custom_field_values (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    deal_id UUID NOT NULL REFERENCES edc.enterprise_deals(id) ON DELETE CASCADE,
    field_id UUID NOT NULL REFERENCES edc_v2.custom_field_definitions(id) ON DELETE CASCADE,
    value_text TEXT,
    value_number NUMERIC(15, 2),
    value_date DATE,
    value_select TEXT,
    value_multi_select TEXT[],
    UNIQUE(deal_id, field_id)
);
```

### 22.3 Tags

```sql
CREATE TABLE edc_v2.tag_definitions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tag_name VARCHAR(50) NOT NULL UNIQUE,
    color VARCHAR(7) NOT NULL DEFAULT '#6B7280',  -- Hex color for UI display
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE edc_v2.deal_tags (
    deal_id UUID NOT NULL REFERENCES edc.enterprise_deals(id) ON DELETE CASCADE,
    tag_id UUID NOT NULL REFERENCES edc_v2.tag_definitions(id) ON DELETE CASCADE,
    applied_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (deal_id, tag_id)
);

-- Seed common tags
INSERT INTO edc_v2.tag_definitions (tag_name, color) VALUES
    ('Net-New', '#3B82F6'),
    ('Renewal', '#10B981'),
    ('Expansion', '#8B5CF6'),
    ('At-Risk', '#EF4444'),
    ('Strategic', '#F59E0B'),
    ('Compliance-Heavy', '#6366F1'),
    ('Multi-Region', '#EC4899'),
    ('First-Deal', '#14B8A6');
```

### 22.4 Custom Field & Tag UI

```
┌─────────────────────────────────────────────────────────────────────────────┐
│  CUSTOM FIELDS & TAGS                                            [+ Add Field]│
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  CUSTOM FIELDS:                                                             │
│  Industry Vertical:    [ Financial Services ▾ ]                             │
│  Deployment Model:     [●] Cloud   ○ On-Prem   ○ Hybrid                    │
│  Annual ACV Target:    [ $450,000 ]                                        │
│  Contract Start Date:  [ 2025-10-01 ]                                      │
│                                                                             │
│  TAGS:                                                                      │
│  [Net-New ×]  [Strategic ×]  [Compliance-Heavy ×]  [+ Add Tag]            │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## 23. Data Import & Export Engine

> **Relationship to Phase 1 (Non-Overlap) — charter C16.** Bulk import/export is **entirely Phase 2**. Phase 1 has only its single-Commander CRUD; it does not bulk-import spreadsheets or produce export bundles.

### 23.1 Import (Spreadsheet → EDC)

The Commander can bulk-import deals from a spreadsheet (common when migrating from a spreadsheet-based workflow):

```
┌─────────────────────────────────────────────────────────────────────────────┐
│  IMPORT DEALS FROM SPREADSHEET                                              │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  Step 1: Upload                                                             │
│  [Choose File]  Accepted: .csv, .xlsx                                       │
│                                                                             │
│  Step 2: Column Mapping                                                     │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │  Spreadsheet Column    →    EDC Field                               │   │
│  │  ───────────────────────────────────────────────────────────────    │   │
│  │  "Account Name"        →    account_name ✓                          │   │
│  │  "Deal Name"           →    deal_name ✓                             │   │
│  │  "Sales Rep"           →    account_manager ✓                       │   │
│  │  "SA Name"             →    technical_lead ✓                        │   │
│  │  "Stage"               →    sales_stage_id ✓ (auto-mapping)         │   │
│  │  "ARR"                 →    product_revenue ✓                       │   │
│  │  "Close Date"          →    expected_close_date ✓                   │   │
│  │  "Notes"               →    manager_strategic_blueprint ✓           │   │
│  │  (unmapped) "Region"   →    [Skip ▾]                                │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                                                                             │
│  Step 3: Preview & Validate                                                 │
│  12 rows detected. 2 validation warnings:                                   │
│  ⚠ Row 5: "Close Date" format ambiguous (06/15/25 vs 15/06/25)           │
│  ⚠ Row 8: "ARR" contains non-numeric value "$N/A"                         │
│                                                                             │
│  [Import 10 Valid Rows]  [Fix & Re-upload]                                 │
└─────────────────────────────────────────────────────────────────────────────┘
```

### 23.2 Export

| Export Format | Content | Use Case |
|---|---|---|
| **CSV** | All deal fields, gates, financials | Board reporting, external analysis |
| **JSON** | Full deal objects with intelligence | API integration, backup |
| **PDF** | Board-ready report (see section 19) | Executive distribution |
| **Excel (.xlsx)** | Multi-sheet: Deals, Gates, Blockers, Decisions | Deep analysis |

### 23.3 API Export Endpoint

```
GET /api/v2/export/deals
  Query:    ?format=csv&stage=Commercial&health=RED
  Response: 200 (file download with Content-Disposition header)
  Content-Type: text/csv | application/json | application/vnd.openxmlformats-officedocument.spreadsheetml.sheet
```

---

## 24. Webhook & Generic Integration Framework

> **Relationship to Phase 1 (Non-Overlap) — charter C7.** Webhooks are **automated, event-driven, machine-to-machine outbound notifications** with HMAC signing — and they are explicitly **distinct from Phase 1's Bat-Signal** (F7/C7). Phase 1's Bat-Signal is an *ad-hoc, human-initiated, 48-hour-expiring, read-only SHARE LINK* to one deal's risk card (a signed JWT a person sends to a person). Phase 2 webhooks are the opposite shape: *system-initiated, continuous, machine-consumed* event POSTs to a configured endpoint. Different audience (machine vs human), different trigger (event-bus vs manual click), different lifetime (persistent subscription vs 48h token), different payload (full event JSON vs read-only card view). They never share a code path.

### 24.1 Problem Statement

While direct integrations (Salesforce, Slack) are excluded from Phase 2 scope, the Commander may need to connect EDC events to external systems: a custom BI dashboard, an internal notification system, a Zapier/Make.com workflow, or a data warehouse. Phase 1's Bat-Signal cannot serve this — it is a one-off human share link, not a machine feed.

### 24.2 Webhook Configuration

```sql
CREATE TABLE edc_v2.webhooks (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    webhook_name VARCHAR(255) NOT NULL,
    target_url TEXT NOT NULL CHECK (target_url ~ '^https?://.+'),
    secret_key VARCHAR(255) NOT NULL,       -- For HMAC signature verification
    events TEXT[] NOT NULL,                  -- ['deal.created', 'deal.stage_changed', 'health.changed', ...]
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_by UUID REFERENCES edc_v2.commander_profiles(id),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    last_triggered_at TIMESTAMP WITH TIME ZONE,
    failure_count INT NOT NULL DEFAULT 0
);

CREATE TABLE edc_v2.webhook_delivery_log (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    webhook_id UUID NOT NULL REFERENCES edc_v2.webhooks(id) ON DELETE CASCADE,
    event_type VARCHAR(50) NOT NULL,
    payload JSONB NOT NULL,
    response_status INT,
    response_body TEXT,
    delivered_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    success BOOLEAN NOT NULL DEFAULT FALSE
);
```

### 24.3 Supported Events

| Event | Trigger | Payload |
|---|---|---|
| `deal.created` | New deal added | Deal object |
| `deal.updated` | Any deal field changed | `{ deal_id, changed_fields: [...], old_values: {...}, new_values: {...} }` |
| `deal.stage_changed` | Pipeline stage transition | `{ deal_id, old_stage, new_stage, days_in_previous_stage }` |
| `deal.deleted` | Deal removed | `{ deal_id, account_name, deal_name }` |
| `gate.toggled` | Gate checkbox toggled | `{ deal_id, gate_code, is_completed, progress_percentage }` |
| `health.changed` | Health status transitions | `{ deal_id, old_health, new_health, alerts: [...] }` |
| `alert.fired` | New risk pattern triggered | `{ deal_id, alert_code, severity, message }` |
| `blocker.created` | New blocker logged | Blocker object |
| `blocker.resolved` | Blocker resolved | Blocker object with resolution_notes |
| `decision.created` | New decision logged | Decision object |
| `decision.overdue` | Decision past due date | Decision object |

### 24.4 Webhook Dispatcher

```javascript
// services/webhookDispatcher.js

const crypto = require('crypto');
const https = require('https');

async function dispatchWebhook(eventType, payload, pool) {
    const { rows: webhooks } = await pool.query(
        `SELECT * FROM edc_v2.webhooks WHERE is_active = true AND $1 = ANY(events)`,
        [eventType]
    );

    for (const webhook of webhooks) {
        // Fire-and-forget with retry
        deliverWithRetry(webhook, eventType, payload, pool).catch(() => {});
    }
}

async function deliverWithRetry(webhook, eventType, payload, pool, attempt = 1) {
    const maxAttempts = 3;
    const body = JSON.stringify({
        event: eventType,
        timestamp: new Date().toISOString(),
        data: payload
    });

    // HMAC-SHA256 signature
    const signature = crypto
        .createHmac('sha256', webhook.secret_key)
        .update(body)
        .digest('hex');

    try {
        const response = await fetch(webhook.target_url, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'X-EDC-Signature': `sha256=${signature}`,
                'X-EDC-Event': eventType,
                'X-EDC-Delivery': crypto.randomUUID()
            },
            body,
            signal: AbortSignal.timeout(10000)  // 10 second timeout
        });

        // Log delivery
        await pool.query(
            `INSERT INTO edc_v2.webhook_delivery_log
             (webhook_id, event_type, payload, response_status, success)
             VALUES ($1, $2, $3, $4, $5)`,
            [webhook.id, eventType, payload, response.status, response.ok]
        );

        if (!response.ok && attempt < maxAttempts) {
            setTimeout(() => deliverWithRetry(webhook, eventType, payload, pool, attempt + 1), attempt * 5000);
        }

        // Update webhook stats
        await pool.query(
            'UPDATE edc_v2.webhooks SET last_triggered_at = NOW(), failure_count = 0 WHERE id = $1',
            [webhook.id]
        );
    } catch (err) {
        await pool.query(
            `UPDATE edc_v2.webhooks SET failure_count = failure_count + 1 WHERE id = $1`,
            [webhook.id]
        );

        // Disable webhook after 10 consecutive failures
        if (webhook.failure_count >= 9) {
            await pool.query(
                'UPDATE edc_v2.webhooks SET is_active = false WHERE id = $1',
                [webhook.id]
            );
        }

        if (attempt < maxAttempts) {
            setTimeout(() => deliverWithRetry(webhook, eventType, payload, pool, attempt + 1), attempt * 5000);
        }
    }
}

module.exports = { dispatchWebhook };
```

---

## 25. Mobile Companion View

> **Relationship to Phase 1 (Non-Overlap) — charter C16.** The mobile companion / PWA is **entirely Phase 2**. Phase 1 is a desktop cockpit. Note the mobile deal cards surface the Phase 2 `Predictive Score`; on a Phase-1-only deployment those fields would simply be absent.

### 25.1 Problem Statement

The Commander conducts 1:1s and standups in meeting rooms, hallways, and airports — not always at a desk. The desktop cockpit UI is unusable on a phone. Phase 2 adds a responsive companion view optimized for quick status checks and note capture.

### 25.2 Mobile Design Principles

| Principle | Implementation |
|---|---|
| **Read-first, write-second** | Mobile view prioritizes read-only status display. Editing is limited to quick actions (toggle gate, add blocker, add note). |
| **Progressive Web App (PWA)** | Installable on home screen, works offline with cached data, push notifications |
| **4 data points max per screen** | Account name, TCV, health, predictive score — everything else is a tap away |
| **Swipe navigation** | Swipe left/right to navigate between deals |
| **Quick capture** | Floating action button for rapid blocker logging or decision entry |

### 25.3 Mobile Wireframes

```
┌──────────────────────────┐
│  EDC                     │
│  Pipeline: $8.45M        │
│  Alerts: 2 RED           │
├──────────────────────────┤
│                          │
│  ┌────────────────────┐  │
│  │ ACME CORP          │  │
│  │ $1.45M             │  │
│  │ [RED] AT RISK      │  │
│  │ Score: 72          │  │
│  │ Gates: 33% (3/9)   │  │
│  │ ██████░░░░░░░░░░░  │  │
│  └────────────────────┘  │
│                          │
│  ┌────────────────────┐  │
│  │ GLOBAL OMNI        │  │
│  │ $3.1M              │  │
│  │ [GREEN]            │  │
│  │ Score: 81          │  │
│  │ Gates: 56% (5/9)   │  │
│  │ ███████████░░░░░░  │  │
│  └────────────────────┘  │
│                          │
│  ┌────────────────────┐  │
│  │ ATLAS HEALTH       │  │
│  │ $1.93M             │  │
│  │ [RED] AT RISK      │  │
│  │ Score: 31          │  │
│  │ Gates: 44% (4/9)   │  │
│  │ ████████░░░░░░░░░  │  │
│  └────────────────────┘  │
│                          │
│                          │
│            [+ Quick Add] │
└──────────────────────────┘
```

**Deal Detail (Mobile):**

```
┌──────────────────────────┐
│  ← ACME CORP             │
│  $1.45M │ [RED] AT RISK  │
│  Score: 72/100            │
├──────────────────────────┤
│                          │
│  ALERTS                  │
│  ⚠ Premature Commercial  │
│    Sales moved to...     │
│                          │
│  GATES (3/9 = 33%)       │
│  [✓] G1: Reqs Locked    │
│  [✓] G1: Exec Agreed    │
│  [✓] G2: Workflow OK    │
│  [ ] G2: Champ. Def.    │
│  [ ] G3: Performance    │
│  [ ] G3: Integrations   │
│  [ ] G4: InfoSec        │
│  [ ] G4: Compliance     │
│  [ ] G5: CTO Sign-off   │
│                          │
│  NEXT ACTION             │
│  ▶ Schedule Arch Review  │
│  (3 days overdue)        │
│                          │
│  [View Full Cockpit →]  │
│                          │
│            [+ Quick Add] │
└──────────────────────────┘
```

---

## PART VIII — TECHNICAL SPECIFICATIONS

---

## 26. Phase 2 Database Schema Extensions (PostgreSQL)

> **Relationship to Phase 1 (Non-Overlap) — charter C8 / C16.** The entire `edc_v2` schema below is **net-new Phase 2 infrastructure**. The three time-series tables in particular — `deal_snapshots`, `deal_activity_log`, `deal_health_history` — are the **durable backbone that SUPERSEDES (does not duplicate) Phase 1's read-time projection**. Phase 1's Temporal Intelligence (Deal Replay + Change Digest, F6/C8) reads the *existing* `deal_audit_log` at request time and stores nothing new; Phase 2 stores a queryable, analytics-grade time-series. The two are intentionally non-redundant: Phase 1 answers "reconstruct this one deal's past state from the audit log, on demand"; Phase 2 answers "query stored snapshots/activity/health across all deals over time for benchmarks and analytics." A Phase-1-only deployment runs with **no** `edc_v2` schema and **no** `deal_snapshots`; Phase 2 adds them without altering `deal_audit_log`.

### 26.1 Schema Organization

Phase 2 uses a separate schema namespace (`edc_v2`) to isolate Phase 2 tables from the V1/Phase 1 core tables. This allows Phase 1 to operate independently if Phase 2 features are deployed incrementally.

### 26.2 Complete Phase 2 Schema

```sql
-- ============================================================
-- PHASE 2 SCHEMA CREATION
-- ============================================================
CREATE SCHEMA IF NOT EXISTS edc_v2;

-- ============================================================
-- MULTI-COMMANDER & AUTHENTICATION
-- ============================================================

CREATE TABLE edc_v2.commander_profiles (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES edc.auth_users(id) ON DELETE CASCADE,
    display_name VARCHAR(255) NOT NULL,
    role VARCHAR(30) NOT NULL CHECK (role IN ('global_commander', 'regional_commander')),
    territory VARCHAR(100),
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    email_notifications BOOLEAN NOT NULL DEFAULT TRUE,
    digest_frequency VARCHAR(20) DEFAULT 'weekly' CHECK (digest_frequency IN ('daily', 'weekly', 'none')),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE edc_v2.deal_commander_assignments (
    deal_id UUID NOT NULL REFERENCES edc.enterprise_deals(id) ON DELETE CASCADE,
    commander_id UUID NOT NULL REFERENCES edc_v2.commander_profiles(id),
    is_primary BOOLEAN NOT NULL DEFAULT TRUE,
    assigned_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (deal_id, commander_id)
);

CREATE TABLE edc_v2.deal_delegations (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    deal_id UUID NOT NULL REFERENCES edc.enterprise_deals(id) ON DELETE CASCADE,
    delegator_id UUID NOT NULL REFERENCES edc_v2.commander_profiles(id),
    delegate_id UUID NOT NULL REFERENCES edc_v2.commander_profiles(id),
    reason TEXT,
    granted_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
    revoked_at TIMESTAMP WITH TIME ZONE,
    is_active BOOLEAN NOT NULL DEFAULT TRUE
);

-- ============================================================
-- DEAL SNAPSHOTS (Time-Series Foundation)
-- Phase 2 durable backbone — SUPERSEDES Phase 1's read-time
-- audit-log Deal Replay (charter C8). Does not touch deal_audit_log.
-- ============================================================

CREATE TABLE edc_v2.deal_snapshots (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    deal_id UUID NOT NULL REFERENCES edc.enterprise_deals(id) ON DELETE CASCADE,
    snapshot_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    stage_id INT NOT NULL,
    stage_name VARCHAR(50) NOT NULL,
    product_revenue NUMERIC(15, 2),
    services_revenue NUMERIC(15, 2),
    calculated_tcv NUMERIC(15, 2),
    gates_completed INT,
    gates_total INT,
    progress_percentage INT,
    active_blocker_count INT,
    high_blocker_count INT,
    health_status VARCHAR(10),
    predictive_score INT,
    snapshot_data JSONB         -- Full deal state for detailed reconstruction
);

CREATE INDEX idx_snapshots_deal_time ON edc_v2.deal_snapshots(deal_id, snapshot_at DESC);

-- ============================================================
-- DEAL ACTIVITY LOG (Granular Event Stream)
-- Phase 2 backbone (charter C8). Distinct from edc.deal_audit_log,
-- which Phase 1's Change Digest/Deal Replay read at request time.
-- ============================================================

CREATE TABLE edc_v2.deal_activity_log (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    deal_id UUID NOT NULL REFERENCES edc.enterprise_deals(id) ON DELETE CASCADE,
    event_type VARCHAR(50) NOT NULL,
    event_data JSONB NOT NULL,
    actor_id UUID REFERENCES edc_v2.commander_profiles(id),
    occurred_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_activity_deal_time ON edc_v2.deal_activity_log(deal_id, occurred_at DESC);
CREATE INDEX idx_activity_type ON edc_v2.deal_activity_log(event_type, occurred_at DESC);

-- ============================================================
-- DEAL HEALTH HISTORY (Phase 2 backbone, charter C8)
-- ============================================================

CREATE TABLE edc_v2.deal_health_history (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    deal_id UUID NOT NULL REFERENCES edc.enterprise_deals(id) ON DELETE CASCADE,
    previous_health VARCHAR(10),
    new_health VARCHAR(10) NOT NULL,
    trigger_alert_codes TEXT[],
    changed_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_health_history_deal ON edc_v2.deal_health_history(deal_id, changed_at DESC);

-- ============================================================
-- PREDICTIVE SCORING
-- ============================================================

CREATE TABLE edc_v2.deal_scores (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    deal_id UUID NOT NULL REFERENCES edc.enterprise_deals(id) ON DELETE CASCADE,
    score INT NOT NULL CHECK (score BETWEEN 0 AND 100),
    confidence VARCHAR(10) NOT NULL CHECK (confidence IN ('LOW', 'MEDIUM', 'HIGH')),
    breakdown JSONB NOT NULL,
    computed_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_scores_deal ON edc_v2.deal_scores(deal_id, computed_at DESC);

-- Historical model calibration data
CREATE TABLE edc_v2.scoring_model_weights (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    feature_id VARCHAR(50) NOT NULL,
    calibrated_weight NUMERIC(5, 4) NOT NULL,
    sample_size INT NOT NULL,
    calibration_date DATE NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- ============================================================
-- COMPETITIVE INTELLIGENCE
-- ============================================================

CREATE TABLE edc_v2.competitors (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    competitor_name VARCHAR(255) NOT NULL UNIQUE,
    category VARCHAR(100),
    known_strengths TEXT,
    known_weaknesses TEXT,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE edc_v2.deal_competitors (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    deal_id UUID NOT NULL REFERENCES edc.enterprise_deals(id) ON DELETE CASCADE,
    competitor_id UUID NOT NULL REFERENCES edc_v2.competitors(id),
    status VARCHAR(30) NOT NULL DEFAULT 'Active'
        CHECK (status IN ('Active', 'Displaced', 'Lost To', 'Won Against')),
    displacement_strategy TEXT,
    outcome_notes TEXT,
    logged_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(deal_id, competitor_id)
);

-- ============================================================
-- STAKEHOLDER MAPPING
-- ============================================================

CREATE TABLE edc_v2.stakeholders (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    deal_id UUID NOT NULL REFERENCES edc.enterprise_deals(id) ON DELETE CASCADE,
    name VARCHAR(255) NOT NULL,
    title VARCHAR(255),
    company VARCHAR(255),
    role_type VARCHAR(50) NOT NULL,
    influence_level VARCHAR(20) NOT NULL CHECK (influence_level IN ('High', 'Medium', 'Low')),
    sentiment VARCHAR(20) NOT NULL DEFAULT 'Neutral'
        CHECK (sentiment IN ('Champion', 'Supportive', 'Neutral', 'Skeptical', 'Hostile')),
    email VARCHAR(255),
    phone VARCHAR(50),
    notes TEXT,
    reports_to_id UUID REFERENCES edc_v2.stakeholders(id),
    is_decision_maker BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- ============================================================
-- DECISION LOG & MEETINGS
-- (charter C6/C7: distinct from Phase 1 deal_stage_overrides and deal_interventions)
-- ============================================================

CREATE TABLE edc_v2.meeting_sessions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    session_type VARCHAR(30) NOT NULL,
    title VARCHAR(255),
    occurred_at TIMESTAMP WITH TIME ZONE NOT NULL,
    duration_minutes INT,
    attendees TEXT[],
    notes TEXT,
    commander_id UUID NOT NULL REFERENCES edc_v2.commander_profiles(id),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE edc_v2.deal_decisions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    deal_id UUID NOT NULL REFERENCES edc.enterprise_deals(id) ON DELETE CASCADE,
    meeting_session_id UUID REFERENCES edc_v2.meeting_sessions(id),
    decision_text TEXT NOT NULL,
    rationale TEXT,
    owner VARCHAR(255) NOT NULL,
    status VARCHAR(20) NOT NULL DEFAULT 'Pending'
        CHECK (status IN ('Pending', 'In Progress', 'Completed', 'Overridden')),
    decided_at TIMESTAMP WITH TIME ZONE NOT NULL,
    due_date DATE,
    completed_at TIMESTAMP WITH TIME ZONE,
    commander_id UUID NOT NULL REFERENCES edc_v2.commander_profiles(id),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- ============================================================
-- CUSTOM RISK PATTERNS (Visual Rule Engine)
-- charter C2: the BUILT-IN pattern array remains in code (Phase 1). These are
-- Commander-authored runtime rules only.
-- ============================================================

CREATE TABLE edc_v2.custom_risk_patterns (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    pattern_name VARCHAR(100) NOT NULL,
    description TEXT,
    severity VARCHAR(10) NOT NULL CHECK (severity IN ('RED', 'YELLOW')),
    weight SMALLINT NOT NULL DEFAULT 50 CHECK (weight BETWEEN 1 AND 100),
    alert_message_template TEXT NOT NULL,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_by UUID NOT NULL REFERENCES edc_v2.commander_profiles(id),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    last_triggered_at TIMESTAMP WITH TIME ZONE,
    trigger_count INT NOT NULL DEFAULT 0
);

CREATE TABLE edc_v2.custom_pattern_conditions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    pattern_id UUID NOT NULL REFERENCES edc_v2.custom_risk_patterns(id) ON DELETE CASCADE,
    field_path VARCHAR(100) NOT NULL,
    operator VARCHAR(20) NOT NULL,
    comparison_value TEXT NOT NULL,
    sort_order SMALLINT NOT NULL,
    UNIQUE(pattern_id, sort_order)
);

-- ============================================================
-- PLAYBOOK ENGINE
-- charter C7: dynamic superset of Phase 1's static intervention_checklists.
-- ============================================================

CREATE TABLE edc_v2.playbooks (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    playbook_name VARCHAR(255) NOT NULL,
    description TEXT,
    applicable_stage VARCHAR(50),
    applicable_deal_profile JSONB,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_by UUID REFERENCES edc_v2.commander_profiles(id),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE edc_v2.playbook_steps (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    playbook_id UUID NOT NULL REFERENCES edc_v2.playbooks(id) ON DELETE CASCADE,
    step_order SMALLINT NOT NULL,
    step_name VARCHAR(255) NOT NULL,
    description TEXT,
    trigger_condition TEXT,
    recommended_action TEXT NOT NULL,
    expected_duration_days INT,
    is_critical BOOLEAN NOT NULL DEFAULT FALSE,
    UNIQUE(playbook_id, step_order)
);

CREATE TABLE edc_v2.deal_playbook_assignments (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    deal_id UUID NOT NULL REFERENCES edc.enterprise_deals(id) ON DELETE CASCADE,
    playbook_id UUID NOT NULL REFERENCES edc_v2.playbooks(id),
    current_step_id UUID REFERENCES edc_v2.playbook_steps(id),
    status VARCHAR(20) NOT NULL DEFAULT 'Active'
        CHECK (status IN ('Active', 'Completed', 'Abandoned')),
    assigned_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    completed_at TIMESTAMP WITH TIME ZONE
);

CREATE TABLE edc_v2.playbook_step_completions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    assignment_id UUID NOT NULL REFERENCES edc_v2.deal_playbook_assignments(id) ON DELETE CASCADE,
    step_id UUID NOT NULL REFERENCES edc_v2.playbook_steps(id),
    completed_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    notes TEXT,
    skipped BOOLEAN NOT NULL DEFAULT FALSE,
    skip_reason TEXT
);

-- ============================================================
-- RAMP DEAL PRICING (charter C1: distinct from Phase 1 multi-currency)
-- ============================================================

CREATE TABLE edc_v2.deal_pricing_schedule (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    deal_id UUID NOT NULL REFERENCES edc.enterprise_deals(id) ON DELETE CASCADE,
    year_number SMALLINT NOT NULL CHECK (year_number BETWEEN 1 AND 10),
    product_revenue NUMERIC(15, 2) NOT NULL CHECK (product_revenue >= 0),
    services_revenue NUMERIC(15, 2) NOT NULL DEFAULT 0 CHECK (services_revenue >= 0),
    discount_pct NUMERIC(5, 2) DEFAULT 0 CHECK (discount_pct BETWEEN 0 AND 100),
    notes TEXT,
    UNIQUE(deal_id, year_number)
);

-- ============================================================
-- FINANCIAL SCENARIOS (charter C10: persisted + financial + pipeline-wide;
-- distinct from Phase 1 ephemeral risk simulator)
-- ============================================================

CREATE TABLE edc_v2.financial_scenarios (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    scenario_name VARCHAR(255) NOT NULL,
    description TEXT,
    deal_id UUID REFERENCES edc.enterprise_deals(id),
    is_global BOOLEAN NOT NULL DEFAULT FALSE,
    modifications JSONB NOT NULL,
    computed_results JSONB,
    created_by UUID NOT NULL REFERENCES edc_v2.commander_profiles(id),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- ============================================================
-- DEAL MEMORY (Archived Knowledge)
-- charter C14/C11: searchable narrative knowledge base of CLOSED deals;
-- distinct from Phase 1 soft-delete/archive/restore and loss_archetypes.
-- ============================================================

CREATE TABLE edc_v2.deal_memory (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    deal_id UUID NOT NULL REFERENCES edc.enterprise_deals(id),
    account_name VARCHAR(255) NOT NULL,
    deal_name VARCHAR(255) NOT NULL,
    outcome VARCHAR(20) NOT NULL,
    final_tcv NUMERIC(15, 2),
    pricing_model VARCHAR(50),
    services_tier VARCHAR(60),
    total_gates_completed INT,
    total_blockers_encountered INT,
    total_days_active INT,
    stage_durations JSONB,
    competitors_faced TEXT[],
    win_loss_narrative TEXT,
    key_lessons TEXT[],
    recommended_playbook_id UUID,
    tags TEXT[],
    searchable_vector TSVECTOR,
    archived_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_memory_search ON edc_v2.deal_memory USING GIN(searchable_vector);
CREATE INDEX idx_memory_outcome ON edc_v2.deal_memory(outcome);
CREATE INDEX idx_memory_tcv ON edc_v2.deal_memory(final_tcv DESC);

-- Full-text search trigger
CREATE OR REPLACE FUNCTION edc_v2.update_memory_search_vector()
RETURNS TRIGGER AS $$
BEGIN
    NEW.searchable_vector :=
        setweight(to_tsvector('english', COALESCE(NEW.account_name, '')), 'A') ||
        setweight(to_tsvector('english', COALESCE(NEW.deal_name, '')), 'A') ||
        setweight(to_tsvector('english', COALESCE(NEW.win_loss_narrative, '')), 'B') ||
        setweight(to_tsvector('english', COALESCE(array_to_string(NEW.key_lessons, ' '), '')), 'B') ||
        setweight(to_tsvector('english', COALESCE(array_to_string(NEW.tags, ' '), '')), 'C');
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_memory_search_vector
    BEFORE INSERT OR UPDATE ON edc_v2.deal_memory
    FOR EACH ROW EXECUTE FUNCTION edc_v2.update_memory_search_vector();

-- ============================================================
-- CUSTOM FIELDS & TAGS
-- ============================================================

CREATE TABLE edc_v2.custom_field_definitions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    field_name VARCHAR(100) NOT NULL,
    field_key VARCHAR(100) NOT NULL UNIQUE,
    field_type VARCHAR(20) NOT NULL CHECK (field_type IN ('text', 'number', 'date', 'select', 'multi_select')),
    options JSONB,
    is_required BOOLEAN NOT NULL DEFAULT FALSE,
    display_order SMALLINT NOT NULL DEFAULT 0,
    created_by UUID REFERENCES edc_v2.commander_profiles(id),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE edc_v2.custom_field_values (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    deal_id UUID NOT NULL REFERENCES edc.enterprise_deals(id) ON DELETE CASCADE,
    field_id UUID NOT NULL REFERENCES edc_v2.custom_field_definitions(id) ON DELETE CASCADE,
    value_text TEXT,
    value_number NUMERIC(15, 2),
    value_date DATE,
    value_select TEXT,
    value_multi_select TEXT[],
    UNIQUE(deal_id, field_id)
);

CREATE TABLE edc_v2.tag_definitions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tag_name VARCHAR(50) NOT NULL UNIQUE,
    color VARCHAR(7) NOT NULL DEFAULT '#6B7280',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE edc_v2.deal_tags (
    deal_id UUID NOT NULL REFERENCES edc.enterprise_deals(id) ON DELETE CASCADE,
    tag_id UUID NOT NULL REFERENCES edc_v2.tag_definitions(id) ON DELETE CASCADE,
    applied_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (deal_id, tag_id)
);

-- ============================================================
-- NOTIFICATIONS & ESCALATION
-- charter C4: the delivery/escalation layer Phase 1 lacks.
-- ============================================================

CREATE TABLE edc_v2.notification_rules (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    commander_id UUID NOT NULL REFERENCES edc_v2.commander_profiles(id),
    rule_name VARCHAR(255) NOT NULL,
    trigger_event VARCHAR(50) NOT NULL,
    trigger_conditions JSONB,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE edc_v2.notification_escalation_steps (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    rule_id UUID NOT NULL REFERENCES edc_v2.notification_rules(id) ON DELETE CASCADE,
    step_order SMALLINT NOT NULL,
    delay_hours INT NOT NULL DEFAULT 0,
    channel VARCHAR(20) NOT NULL CHECK (channel IN ('email', 'in_app')),
    recipient VARCHAR(255) NOT NULL,
    message_template TEXT NOT NULL,
    UNIQUE(rule_id, step_order)
);

CREATE TABLE edc_v2.notification_log (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    rule_id UUID REFERENCES edc_v2.notification_rules(id),
    deal_id UUID REFERENCES edc.enterprise_deals(id),
    escalation_step_id UUID REFERENCES edc_v2.notification_escalation_steps(id),
    channel VARCHAR(20) NOT NULL,
    recipient VARCHAR(255) NOT NULL,
    subject TEXT,
    message TEXT NOT NULL,
    sent_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    acknowledged_at TIMESTAMP WITH TIME ZONE
);

-- ============================================================
-- WEBHOOKS (charter C7: machine-to-machine; distinct from Phase 1 Bat-Signal)
-- ============================================================

CREATE TABLE edc_v2.webhooks (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    webhook_name VARCHAR(255) NOT NULL,
    target_url TEXT NOT NULL CHECK (target_url ~ '^https?://.+'),
    secret_key VARCHAR(255) NOT NULL,
    events TEXT[] NOT NULL,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_by UUID REFERENCES edc_v2.commander_profiles(id),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    last_triggered_at TIMESTAMP WITH TIME ZONE,
    failure_count INT NOT NULL DEFAULT 0
);

CREATE TABLE edc_v2.webhook_delivery_log (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    webhook_id UUID NOT NULL REFERENCES edc_v2.webhooks(id) ON DELETE CASCADE,
    event_type VARCHAR(50) NOT NULL,
    payload JSONB NOT NULL,
    response_status INT,
    response_body TEXT,
    delivered_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    success BOOLEAN NOT NULL DEFAULT FALSE
);

-- ============================================================
-- PHASE 2 PERFORMANCE INDEXES
-- ============================================================

CREATE INDEX idx_commander_territory ON edc_v2.commander_profiles(territory) WHERE is_active = true;
CREATE INDEX idx_assignments_commander ON edc_v2.deal_commander_assignments(commander_id);
CREATE INDEX idx_delegations_active ON edc_v2.deal_delegations(deal_id) WHERE is_active = true;
CREATE INDEX idx_competitors_deal ON edc_v2.deal_competitors(deal_id);
CREATE INDEX idx_stakeholders_deal ON edc_v2.stakeholders(deal_id);
CREATE INDEX idx_stakeholders_sentiment ON edc_v2.stakeholders(deal_id, sentiment);
CREATE INDEX idx_decisions_deal ON edc_v2.deal_decisions(deal_id, decided_at DESC);
CREATE INDEX idx_decisions_overdue ON edc_v2.deal_decisions(due_date) WHERE status = 'Pending';
CREATE INDEX idx_custom_patterns_active ON edc_v2.custom_risk_patterns(is_active) WHERE is_active = true;
CREATE INDEX idx_playbooks_stage ON edc_v2.playbooks(applicable_stage) WHERE is_active = true;
CREATE INDEX idx_pricing_schedule_deal ON edc_v2.deal_pricing_schedule(deal_id, year_number);
CREATE INDEX idx_custom_field_values_deal ON edc_v2.custom_field_values(deal_id);
CREATE INDEX idx_deal_tags_deal ON edc_v2.deal_tags(deal_id);
CREATE INDEX idx_notification_log_time ON edc_v2.notification_log(sent_at DESC);
CREATE INDEX idx_webhook_log_time ON edc_v2.webhook_delivery_log(delivered_at DESC);
```

---

## 27. Phase 2 API Extensions

> **Relationship to Phase 1 (Non-Overlap) — charter C16.** All Phase 2 endpoints are prefixed `/api/v2/`. The V1/Phase 1 endpoints (including the Phase 1 `/api/v1/...` Change Digest, Deal Replay snapshot, disposition, intervention, Bat-Signal, autopsy, portfolio-analysis, and restore endpoints) remain operational and unchanged. No Phase 2 endpoint replaces a Phase-1-owned endpoint.

### 27.1 New Endpoints Summary

All Phase 2 endpoints are prefixed with `/api/v2/`. V1/Phase 1 endpoints remain operational.

```
-- Predictive Scoring
GET    /api/v2/deals/:dealId/score
POST   /api/v2/scores/recalculate            (admin: re-score all deals)

-- Competitive Intelligence
GET    /api/v2/competitors
POST   /api/v2/competitors
PUT    /api/v2/competitors/:id
GET    /api/v2/deals/:dealId/competitors
PUT    /api/v2/deals/:dealId/competitors
GET    /api/v2/analytics/competitive          (win rates by competitor)

-- Stakeholders
GET    /api/v2/deals/:dealId/stakeholders
POST   /api/v2/deals/:dealId/stakeholders
PUT    /api/v2/deals/:dealId/stakeholders/:id
DELETE /api/v2/deals/:dealId/stakeholders/:id

-- Decision Log & Meetings
GET    /api/v2/deals/:dealId/decisions
POST   /api/v2/deals/:dealId/decisions
PUT    /api/v2/deals/:dealId/decisions/:id
GET    /api/v2/meetings
POST   /api/v2/meetings
GET    /api/v2/meetings/:id/decisions

-- Custom Risk Patterns (Commander-authored; built-in array stays in code — C2)
GET    /api/v2/risk-patterns
POST   /api/v2/risk-patterns
PUT    /api/v2/risk-patterns/:id
DELETE /api/v2/risk-patterns/:id
POST   /api/v2/risk-patterns/:id/test         (test against current deals)

-- Playbooks (dynamic lifecycle; supersedes Phase 1 static checklists — C7)
GET    /api/v2/playbooks
POST   /api/v2/playbooks
PUT    /api/v2/playbooks/:id
GET    /api/v2/deals/:dealId/playbook
POST   /api/v2/deals/:dealId/playbook/assign
PUT    /api/v2/deals/:dealId/playbook/steps/:stepId/complete

-- Velocity Analytics (cohort / longitudinal — C9/C12)
GET    /api/v2/analytics/velocity
GET    /api/v2/analytics/velocity/benchmarks
GET    /api/v2/analytics/pipeline

-- Pipeline Simulation
POST   /api/v2/analytics/simulate
GET    /api/v2/analytics/simulate/latest       (cached result)

-- Deal Memory (narrative knowledge base — C14/C11)
GET    /api/v2/memory/search
GET    /api/v2/memory/:id
GET    /api/v2/memory/similar/:dealId          (find similar archived deals)
GET    /api/v2/analytics/win-loss

-- Ramp Pricing (C1: distinct from Phase 1 multi-currency)
GET    /api/v2/deals/:dealId/pricing-schedule
PUT    /api/v2/deals/:dealId/pricing-schedule

-- Financial Scenarios (persisted/financial/pipeline-wide — C10)
GET    /api/v2/scenarios
POST   /api/v2/scenarios
PUT    /api/v2/scenarios/:id
POST   /api/v2/scenarios/:id/run
DELETE /api/v2/scenarios/:id

-- Custom Fields
GET    /api/v2/custom-fields
POST   /api/v2/custom-fields
PUT    /api/v2/custom-fields/:id
DELETE /api/v2/custom-fields/:id
GET    /api/v2/deals/:dealId/custom-fields
PUT    /api/v2/deals/:dealId/custom-fields

-- Tags
GET    /api/v2/tags
POST   /api/v2/tags
PUT    /api/v2/deals/:dealId/tags
GET    /api/v2/deals/by-tag/:tagId

-- Reports
POST   /api/v2/reports/generate
GET    /api/v2/reports/:id/download

-- Export
GET    /api/v2/export/deals?format=csv|json|xlsx

-- Import
POST   /api/v2/import/deals                   (multipart/form-data with file)
POST   /api/v2/import/validate                 (dry-run validation)

-- Notifications (delivery/escalation — C4; distinct from Phase 1 advisory dispositions)
GET    /api/v2/notifications
PUT    /api/v2/notifications/:id/acknowledge
GET    /api/v2/notification-rules
POST   /api/v2/notification-rules
PUT    /api/v2/notification-rules/:id

-- Webhooks (machine-to-machine — C7; distinct from Phase 1 Bat-Signal share link)
GET    /api/v2/webhooks
POST   /api/v2/webhooks
PUT    /api/v2/webhooks/:id
DELETE /api/v2/webhooks/:id
GET    /api/v2/webhooks/:id/deliveries

-- Commander Management
GET    /api/v2/commanders
POST   /api/v2/commanders
PUT    /api/v2/commanders/:id
POST   /api/v2/deals/:dealId/delegate

-- Deal Activity (Phase 2 stored time-series — C8; distinct from Phase 1 audit-log Deal Replay)
GET    /api/v2/deals/:dealId/activity
GET    /api/v2/deals/:dealId/health-history

-- Snapshots (Phase 2 durable backbone — C8)
GET    /api/v2/deals/:dealId/snapshots
GET    /api/v2/deals/:dealId/snapshots/:snapshotId
```

---

## 28. Event-Driven Architecture & Internal Event Bus

> **Relationship to Phase 1 (Non-Overlap) — charter C8.** The event bus and its subscribers are **net-new Phase 2 infrastructure** and the foundation of the durable time-series backbone (`deal_snapshots`, `deal_activity_log`, `deal_health_history`). They **SUPERSEDE, never duplicate**, Phase 1's Temporal Intelligence: Phase 1's Change Digest and Deal Replay (F6/C8) are a **read-time projection of the existing `deal_audit_log`** with NO new write or event infrastructure. Phase 1 will continue to function with no event bus at all. Phase 2 introduces the bus to *store* the analytics-grade time-series Phase 1 only *reconstructs on demand*. The `deal_audit_log` remains the immutable system of record for both; Phase 2 adds stored projections beside it, it does not rewrite it.

### 28.1 Event Bus Implementation

```javascript
// lib/eventBus.js

const EventEmitter = require('events');

class EDCEventBus extends EventEmitter {
    constructor() {
        super();
        this.setMaxListeners(50);
        this.eventLog = [];
    }

    emit(eventType, payload) {
        // Log for debugging
        this.eventLog.push({
            event: eventType,
            timestamp: new Date().toISOString(),
            payload: typeof payload === 'object' ? JSON.stringify(payload).substring(0, 500) : payload
        });

        // Keep last 1000 events in memory
        if (this.eventLog.length > 1000) {
            this.eventLog = this.eventLog.slice(-500);
        }

        return super.emit(eventType, payload);
    }
}

const eventBus = new EDCEventBus();

module.exports = eventBus;
```

### 28.2 Event Subscribers

```javascript
// subscribers/index.js

const eventBus = require('../lib/eventBus');
const activityLogger = require('./activityLogger');
const snapshotService = require('./snapshotService');
const healthTracker = require('./healthTracker');
const alertEvaluator = require('./alertEvaluator');
const escalationEngine = require('./escalationEngine');
const webhookDispatcher = require('./webhookDispatcher');

// Register all subscribers
function initializeSubscribers(pool) {
    // Activity logging (every mutation) — writes to the Phase 2 deal_activity_log,
    // NOT to the Phase 1 deal_audit_log (charter C8).
    eventBus.on('deal.updated', (data) => activityLogger.logDealUpdate(data, pool));
    eventBus.on('gate.toggled', (data) => activityLogger.logGateToggle(data, pool));
    eventBus.on('blocker.created', (data) => activityLogger.logBlockerCreated(data, pool));
    eventBus.on('blocker.resolved', (data) => activityLogger.logBlockerResolved(data, pool));
    eventBus.on('decision.created', (data) => activityLogger.logDecisionCreated(data, pool));

    // Snapshot on significant state changes (the stored time-series Phase 1 lacks)
    eventBus.on('deal.stage_changed', (data) => snapshotService.captureSnapshot(data.dealId, pool));
    eventBus.on('gate.toggled', (data) => snapshotService.captureIfSignificant(data, pool));

    // Health tracking
    eventBus.on('health.changed', (data) => healthTracker.recordTransition(data, pool));

    // Alert re-evaluation on deal changes (custom Phase 2 patterns alongside Phase 1 built-ins)
    eventBus.on('deal.updated', (data) => alertEvaluator.reevaluate(data.dealId, pool));
    eventBus.on('gate.toggled', (data) => alertEvaluator.reevaluate(data.dealId, pool));

    // Escalation check (the delivery layer — C4)
    eventBus.on('health.changed', (data) => escalationEngine.checkRules(data, pool));
    eventBus.on('decision.overdue', (data) => escalationEngine.checkRules(data, pool));

    // Webhook dispatch (machine-to-machine — C7)
    eventBus.on('deal.created', (data) => webhookDispatcher.dispatch('deal.created', data, pool));
    eventBus.on('deal.stage_changed', (data) => webhookDispatcher.dispatch('deal.stage_changed', data, pool));
    eventBus.on('health.changed', (data) => webhookDispatcher.dispatch('health.changed', data, pool));
    eventBus.on('alert.fired', (data) => webhookDispatcher.dispatch('alert.fired', data, pool));
    eventBus.on('blocker.created', (data) => webhookDispatcher.dispatch('blocker.created', data, pool));
    eventBus.on('gate.toggled', (data) => webhookDispatcher.dispatch('gate.toggled', data, pool));
    eventBus.on('decision.created', (data) => webhookDispatcher.dispatch('decision.created', data, pool));
}

module.exports = { initializeSubscribers };
```

### 28.3 Event Emission Points (in Route Handlers)

```javascript
// routes/deals.js (excerpt)

const eventBus = require('../lib/eventBus');

// In PUT /api/v1/deals/:id
// NOTE: Phase 1's synchronous stage-transition guardrail (409 STAGE_GUARDRAIL, C6) and
// gate integrity warnings (C5) run BEFORE this emission, in-request. The event bus is the
// ASYNCHRONOUS reaction layer (C6) — it never intercepts or replaces the synchronous guardrail.
router.put('/:id', validate(UpdateDealSchema), async (req, res) => {
    const oldDeal = await getDeal(req.params.id);
    const updatedDeal = await updateDeal(req.params.id, req.validatedBody);

    // Detect stage change
    if (oldDeal.sales_stage_id !== updatedDeal.sales_stage_id) {
        eventBus.emit('deal.stage_changed', {
            dealId: updatedDeal.id,
            oldStage: oldDeal.stage_name,
            newStage: updatedDeal.stage_name,
            daysInPreviousStage: daysBetween(oldDeal.stage_entered_at, new Date())
        });
    }

    // Generic update event
    eventBus.emit('deal.updated', {
        dealId: updatedDeal.id,
        changedFields: getChangedFields(oldDeal, req.validatedBody),
        oldValues: extractOldValues(oldDeal, req.validatedBody),
        newValues: req.validatedBody
    });

    res.json({ data: updatedDeal });
});
```

---

## 29. Performance, Caching & Scalability

> **Relationship to Phase 1 (Non-Overlap) — charter C8 / C16.** Redis, the materialized views, the snapshot time-series, and the cached simulation/scoring artifacts below are **Phase 2 infrastructure**. Phase 1 runs with an in-memory threshold cache and no Redis. Where this table caches "Velocity Benchmarks" and "Simulation Results," those are Phase 2 cohort/forecast artifacts — they do not cache or duplicate Phase 1's read-time audit-log projections.

### 29.1 Caching Strategy

| Layer | What's Cached | TTL | Technology |
|---|---|---|---|
| **Engine Thresholds** | `engine_thresholds` table | 60 seconds | In-memory (module-level) — same as Phase 1 |
| **Lookup Data** | Pipeline stages, pricing models, services tiers, products | 5 minutes | In-memory or Redis |
| **Intelligence Results** | Per-deal intelligence output | Until next mutation | Redis (invalidated on deal update) |
| **Summary Dashboard** | `/api/v1/intelligence/summary` | 30 seconds | Redis |
| **Simulation Results** | Latest Monte Carlo run | Until next run | PostgreSQL (`computed_results` column) |
| **Velocity Benchmarks** | Materialized view | Nightly refresh | PostgreSQL materialized view |
| **Scoring Model** | Calibration weights | Nightly refresh | PostgreSQL table |

### 29.2 Database Query Optimization

```sql
-- Key query patterns that need index support

-- 1. Deal list with stage and health filtering
-- Uses: idx_deals_stage, idx_deals_updated
EXPLAIN ANALYZE
SELECT ed.*, ps.stage_name
FROM edc.enterprise_deals ed
JOIN edc.pipeline_stages ps ON ps.id = ed.sales_stage_id
WHERE ps.stage_name = 'Commercial'
ORDER BY ed.updated_at DESC
LIMIT 50;

-- 2. Gate completion query for intelligence engine
-- Uses: idx_gates_deal
EXPLAIN ANALYZE
SELECT dtg.*, gd.gate_group, gd.label, gd.sort_order
FROM edc.deal_technical_gates dtg
JOIN edc.gate_definitions gd ON gd.gate_code = dtg.gate_code
WHERE dtg.deal_id = '...';

-- 3. Active blockers for intelligence
-- Uses: idx_blockers_deal
EXPLAIN ANALYZE
SELECT db.*, bc.category_name, bs.severity_name
FROM edc.deal_blockers db
JOIN edc.blocker_categories bc ON bc.id = db.category_id
JOIN edc.blocker_severities bs ON bs.id = db.severity_id
WHERE db.deal_id = '...' AND db.is_resolved = false;

-- 4. Full-text search in deal memory
-- Uses: idx_memory_search
EXPLAIN ANALYZE
SELECT *, ts_rank(searchable_vector, query) AS rank
FROM edc_v2.deal_memory, plainto_tsquery('english', 'financial services CTO risk') query
WHERE searchable_vector @@ query
ORDER BY rank DESC
LIMIT 10;

-- 5. Snapshot time-series for a deal (Phase 2 stored backbone)
-- Uses: idx_snapshots_deal_time
EXPLAIN ANALYZE
SELECT *
FROM edc_v2.deal_snapshots
WHERE deal_id = '...'
ORDER BY snapshot_at DESC
LIMIT 100;
```

### 29.3 Scalability Projections

| Data Volume | Expected Performance | Notes |
|---|---|---|
| 50 active deals | All queries < 50ms | Comfortable for single PostgreSQL instance |
| 200 active deals | All queries < 100ms | Add connection pooling tuning |
| 500 active deals | Read queries < 200ms | Consider read replica for analytics queries |
| 1000+ active deals | Materialized views required for dashboards | Intelligence engine per-deal remains fast; aggregate queries need pre-computation |

---

## PART IX — DELIVERY

---

## 30. Phased Execution & Acceptance Criteria

> **Baseline assumption (v3.0).** This plan assumes the **expanded Phase 1 baseline (F1–F14) is already shipped and in production.** No Phase 2 deliverable below re-builds a Phase-1-owned capability. Each phase's acceptance criteria include a **boundary-integrity gate** verifying the new work consumes, rather than duplicates, the relevant Phase 1 feature (per the charter row noted).

### 30.1 Overview

```
+────────────────────────────────────────────────────────────────────────────+
|                          PHASE 2 DELIVERY TIMELINE                        |
|              (on top of the shipped Phase 1 F1–F14 baseline)              |
+────────────────────────────────────────────────────────────────────────────+
|  STAGE P2-1: MULTI-COMMANDER & DATA FOUNDATION           [ WEEKS 1 – 3 ]  |
|  STAGE P2-2: INTELLIGENCE & ANALYTICS ENGINE              [ WEEKS 4 – 6 ]  |
|  STAGE P2-3: AUTOMATION & AI FEATURES                     [ WEEKS 7 – 9 ]  |
|  STAGE P2-4: FINANCIAL MODELING & REPORTING               [ WEEKS 10 – 12] |
|  STAGE P2-5: PLATFORM & EXTENSIBILITY                     [ WEEKS 13 – 15] |
|  STAGE P2-6: HARDENING & UAT                              [ WEEKS 16 – 18] |
+────────────────────────────────────────────────────────────────────────────+
```

### 30.2 Stage Details

#### STAGE P2-1: Multi-Commander & Data Foundation (Weeks 1–3)

**Deliverables:**
- Phase 2 database schema deployment (all `edc_v2` tables)
- Multi-commander authentication with territory-scoped RLS
- Commander profile management (create, edit, activate/deactivate)
- Deal assignment and delegation system
- Deal snapshot service (hourly capture via background job) — the **durable backbone** that supersedes Phase 1's read-time Deal Replay (C8); Phase 1's audit-log projection is left intact
- Activity log (event-driven writes for all mutations) to `edc_v2.deal_activity_log` (distinct from `edc.deal_audit_log`)
- Deal health history tracking
- Event bus infrastructure (`initializeSubscribers`)
- Ramp deal pricing CRUD + TCV computation update (C1: distinct from Phase 1 multi-currency; ramp totals still normalize through Phase 1 FX)
- Tags and custom fields CRUD

**Acceptance Criteria:**
| # | Criterion |
|---|---|
| P2-1.1 | Regional Commander can see only deals in their territory |
| P2-1.2 | Global Commander can see all deals across territories |
| P2-1.3 | Deal delegation grants temporary access that expires correctly |
| P2-1.4 | Snapshots are captured automatically on stage changes |
| P2-1.5 | Activity log records all mutations with timestamps and actor attribution |
| P2-1.6 | Ramp pricing correctly computes TCV from per-year schedules |
| P2-1.7 | Custom fields can be created and populated per deal |
| P2-1.8 | Tags can be created, applied, and used for filtering |
| **P2-1.9 (boundary)** | **`deal_snapshots`/`deal_activity_log` are NET-NEW and `edc.deal_audit_log` is unmodified; Phase 1 Deal Replay/Change Digest still work as a read-time projection (C8)** |
| **P2-1.10 (boundary)** | **Ramp pricing writes only to `edc_v2.deal_pricing_schedule`; Phase 1's `fx_rates`/`reporting_currency`/`normalizedTCV` path is untouched (C1)** |

---

#### STAGE P2-2: Intelligence & Analytics Engine (Weeks 4–6)

**Deliverables:**
- Predictive scoring engine (feature-based model, cold-start strategy) — the learned score Phase 1 deliberately lacks (C3)
- Deal velocity metrics and **cohort** benchmark computation (C9: comparative only; the per-deal `SLOW_MOTION_COLLISION` momentum stays in Phase 1)
- Velocity benchmarks materialized view (nightly refresh)
- Competitive intelligence module (competitor catalog, deal-competitor junction, win-rate analytics)
- Stakeholder influence mapping (CRUD, org chart relationships)
- Pipeline analytics dashboard page (longitudinal companion to Phase 1's current-state portfolio correlation — C12)
- Win/Loss post-mortem **narrative** workflow (consumes Phase 1 `loss_archetype` — C11)
- Deal Memory archive system (auto-archive on close, full-text search)
- Similar deal detection

**Acceptance Criteria:**
| # | Criterion |
|---|---|
| P2-2.1 | Predictive score computed for every active deal with breakdown visible |
| P2-2.2 | Velocity benchmarks computed from historical snapshots (need ≥ 5 closed deals) |
| P2-2.3 | Competitive win rates displayed per competitor |
| P2-2.4 | Stakeholder influence map renders org chart with sentiment colors |
| P2-2.5 | Pipeline analytics dashboard shows TCV by stage, health distribution, velocity heatmap |
| P2-2.6 | Win/Loss post-mortem prompts on stage change to Closed-Won/Closed-Lost |
| P2-2.7 | Deal Memory search returns relevant results with full-text ranking |
| P2-2.8 | Similar deal detection surfaces matching archived deals |
| **P2-2.9 (boundary)** | **Predictive score is a separate artifact from Phase 1 `explain()`; no Phase 1 pattern is converted to a score, and the score may consume but does not re-implement `SLOW_MOTION_COLLISION`/attach-rate (C3/C9/C13)** |
| **P2-2.10 (boundary)** | **The win/loss "loss reason" dimension reads Phase 1 `loss_archetypes`; Phase 2 defines no loss taxonomy (C11)** |
| **P2-2.11 (boundary)** | **Velocity layer computes only cohort/longitudinal metrics; no new per-deal-only momentum pattern is introduced (C9)** |

---

#### STAGE P2-3: Automation & AI Features (Weeks 7–9)

**Deliverables:**
- Custom Risk Pattern Builder (visual rule engine UI + evaluation engine) — Commander-authored only; the built-in array stays in code (C2)
- Playbook engine (definitions, steps, auto-assignment, step completion tracking) — the dynamic superset of Phase 1 static intervention checklists (C7)
- Natural Language Command Interface (NLC parser + Command Palette UI)
- Smart alerts with escalation chains (notification rules, escalation steps, email sending) — the delivery/escalation layer Phase 1 lacks (C4)
- In-app notification center
- Decision log with meeting sessions (free-form; distinct from Phase 1 override/intervention ledgers — C6/C7)
- New risk patterns from competitive and stakeholder data

**Acceptance Criteria:**
| # | Criterion |
|---|---|
| P2-3.1 | Commander can create a custom risk pattern with conditions and test it against current deals |
| P2-3.2 | Custom patterns fire correctly in the intelligence engine alongside built-in patterns |
| P2-3.3 | Playbooks auto-assign on stage change and track step completion |
| P2-3.4 | NLC parser correctly interprets ≥ 80% of documented query patterns |
| P2-3.5 | Escalation chain fires email at configured delay when alert condition persists |
| P2-3.6 | In-app notifications appear for triggered alerts and overdue decisions |
| P2-3.7 | Decisions can be logged, tracked, and flagged when overdue |
| **P2-3.8 (boundary)** | **The built-in pattern array remains engineer-defined in code and is not editable via the rule builder UI; Phase 1 gains no rule-authoring UI (C2)** |
| **P2-3.9 (boundary)** | **Playbook auto-assignment/lifecycle is additive; Phase 1's launch-and-log `POST /interventions` behavior is unchanged (C7)** |
| **P2-3.10 (boundary)** | **Notification "acknowledge" writes `notification_log.acknowledged_at`; the Phase 1 advisory Acknowledge/Accept/Snooze on `deal_audit_log` is a separate disposition (C4)** |
| **P2-3.11 (boundary)** | **`deal_decisions` is free-form meeting capture; it does not write to or replace `deal_stage_overrides` or `deal_interventions` (C6/C7)** |

---

#### STAGE P2-4: Financial Modeling & Reporting (Weeks 10–12)

**Deliverables:**
- Financial scenario engine (per-deal and pipeline-wide what-if analysis) — persisted + financial + pipeline-wide (C10)
- Pipeline simulation (Monte Carlo engine, visualization)
- Board-ready report generation (HTML template → PDF via Puppeteer)
- Executive Briefing Mode V2 (comparison mode, predictive overlay, deal memory references) — on-screen data, drawing historical context from `deal_snapshots` not Deal Replay (C15/C8)
- Automated email digest (weekly scheduler, template rendering)
- Report scheduling and recipient management

**Acceptance Criteria:**
| # | Criterion |
|---|---|
| P2-4.1 | Financial scenarios produce correct TCV deltas for parameter overrides |
| P2-4.2 | Pipeline simulation produces stable percentile distributions across runs |
| P2-4.3 | Board report PDF renders correctly with charts, tables, and narrative |
| P2-4.4 | Briefing Mode comparison view shows two deals side-by-side |
| P2-4.5 | Email digest sends on schedule with correct pipeline summary |
| P2-4.6 | Digest can be sent to multiple recipients including external addresses |
| **P2-4.7 (boundary)** | **Financial scenarios persist to `financial_scenarios` and model financials/pipeline-wide; Phase 1's ephemeral risk-only client simulator still saves nothing and computes no TCV (C10)** |
| **P2-4.8 (boundary)** | **Briefing V2 reads `deal_snapshots` for historical context and never reconstructs from `deal_audit_log`; Phase 1 presenter ergonomics (agenda/notes/pacing) are untouched (C15/C8)** |

---

#### STAGE P2-5: Platform & Extensibility (Weeks 13–15)

**Deliverables:**
- Data import engine (CSV/Excel upload with column mapping and validation)
- Data export engine (CSV, JSON, Excel, PDF formats)
- Webhook management (CRUD, event subscription, HMAC signing, delivery logging, auto-disable) — machine-to-machine; distinct from Phase 1 Bat-Signal (C7)
- Mobile companion view (responsive PWA, read-first layout, swipe navigation)
- PWA manifest and service worker for offline caching
- Push notification support for mobile

**Acceptance Criteria:**
| # | Criterion |
|---|---|
| P2-5.1 | CSV import with 10+ rows correctly maps columns and creates deals |
| P2-5.2 | Export produces valid CSV/JSON/Excel files with correct data |
| P2-5.3 | Webhook fires on subscribed events with valid HMAC signature |
| P2-5.4 | Webhook auto-disables after 10 consecutive failures |
| P2-5.5 | Mobile companion displays deal list and details readable on iPhone 14+ |
| P2-5.6 | PWA installs on home screen and caches last-viewed data |
| **P2-5.7 (boundary)** | **Webhooks are automated machine-to-machine event POSTs; Phase 1's Bat-Signal remains a separate human-initiated 48h read-only share link with its own token audience (C7)** |

---

#### STAGE P2-6: Hardening & UAT (Weeks 16–18)

**Deliverables:**
- Unit tests for all new services (predictive scoring, custom patterns, NLC parser, simulation engine)
- Integration tests for all Phase 2 API endpoints
- E2E tests for Phase 2 critical journeys (multi-commander workflow, custom pattern creation, report generation)
- **Boundary-integrity test suite** verifying no Phase 2 feature duplicates a Phase-1-owned capability (one assertion per charter row C1–C16)
- Performance profiling (Phase 2 queries, snapshot volume, simulation speed)
- Security audit (new endpoints, multi-commander isolation, webhook secret handling)
- UAT with Commander team (2-3 Commanders if multi-commander, otherwise single Commander)
- Production deployment with Phase 2 migration (additive over the live Phase 1 schema)

**Acceptance Criteria:**
| # | Criterion |
|---|---|
| P2-6.1 | All CI tests pass on clean checkout |
| P2-6.2 | Predictive scoring coverage ≥ 95% |
| P2-6.3 | Custom pattern evaluation coverage ≥ 95% |
| P2-6.4 | NLC parser coverage ≥ 90% |
| P2-6.5 | Multi-commander isolation verified (Regional Commander cannot access other territories) |
| P2-6.6 | API p95 response time < 300ms for Phase 2 endpoints (excluding simulation and report generation) |
| P2-6.7 | Monte Carlo simulation completes in < 5 seconds for 100 deals × 10,000 iterations |
| P2-6.8 | Board report PDF generates in < 10 seconds |
| **P2-6.9 (boundary)** | **Boundary-integrity suite passes: every charter row C1–C16 has an automated assertion that the Phase 2 surface consumes — not duplicates — the Phase 1 capability; Phase 1 endpoints/tables remain unmodified** |
| P2-6.10 | UAT sign-off from Commander(s) |

---

## 31. Risk Register & Mitigation

| # | Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|---|
| P2-R1 | Multi-commander RLS introduces query complexity and performance overhead | Medium | Medium | Use materialized views for aggregate queries; test RLS policies with EXPLAIN ANALYZE at expected data volumes |
| P2-R2 | Predictive scoring produces inaccurate scores, eroding Commander trust | Medium | High | Display confidence label prominently; default to conservative weights; allow Commander to override score manually; keep it visibly separate from Phase 1 glass-box `explain()` so deterministic and probabilistic signals are not conflated |
| P2-R3 | Custom risk pattern builder allows patterns that always fire (false positives) | Medium | Medium | "Test Against Current Deals" button before activating; show trigger count on pattern dashboard |
| P2-R4 | NLC parser misinterprets queries, returning wrong results | Medium | Medium | Show interpreted query before executing results; allow Commander to confirm/correct; fallback to text search |
| P2-R5 | Snapshot volume grows rapidly (12 deals × 24 snapshots/day × 365 days = ~105K rows/year) | Low | Low | Partition snapshots table by month; archive snapshots older than 12 months |
| P2-R6 | Email digest delivery failures (spam filters, SMTP issues) | Medium | Low | Use transactional email service (SendGrid, SES); log delivery failures; Commander can view last sent digest in-app |
| P2-R7 | Mobile companion adds frontend development burden | Medium | Medium | Build responsive breakpoints into existing cockpit; don't build a separate app; use CSS media queries |
| P2-R8 | Board report PDF rendering breaks on edge cases (very long notes, many deals) | Low | Medium | Test with 50+ deal reports; paginate correctly; truncate long text with "..." |
| P2-R9 | 18-week timeline faces pressure to cut scope | High | Medium | Phased delivery allows launching P2-1 through P2-3 at week 9 (midpoint); remaining stages are progressive enhancement |
| P2-R10 | Webhook security (shared secret exposure, replay attacks) | Low | High | HMAC-SHA256 signatures; rotate secrets via API; include timestamp in signature payload to prevent replay |
| **P2-R11 (boundary)** | **A Phase 2 feature accidentally duplicates a Phase-1-owned capability** (e.g. a velocity "momentum" pattern that re-implements `SLOW_MOTION_COLLISION`; a Phase 2 loss-reason taxonomy shadowing `loss_archetypes`; a snapshot store that the Change Digest is rewired to read instead of `deal_audit_log`) | Medium | High | The boundary-integrity test suite (one assertion per charter row C1–C16) runs in CI and gates merge; PR template requires citing the charter row for any feature touching a boundary; design review checks the "Relationship to Phase 1" note exists before implementation |
| **P2-R12 (boundary)** | **The two "acknowledge" verbs are conflated** — a developer wires the Phase 2 notification-delivery ack to mutate the Phase 1 advisory disposition (or vice-versa), corrupting `deal_audit_log` or `notification_log` | Medium | Medium | Separate endpoints, separate tables, separate UI affordances; integration test asserts a notification ack writes only `notification_log.acknowledged_at` and an advisory disposition writes only `deal_audit_log` (C4) |
| **P2-R13 (boundary)** | **Phase 2 migration alters live Phase 1 schema/endpoints** rather than being purely additive, breaking the shipped Phase 1 baseline | Low | High | Phase 2 lives entirely in the `edc_v2` schema and `/api/v2/*`; migrations are forward-only and additive over the `edc` schema; a pre-deploy check fails the pipeline if any migration touches a Phase 1 table or `/api/v1/*` route (C8/C16) |

---

## 32. Appendices

### Appendix A: Phase 2 File & Directory Structure (New Additions)

> All paths below are **net-new Phase 2** additions over the shipped Phase 1 tree. Phase 1's `routes/v1/*`, the built-in pattern array, the audit-log Temporal Intelligence, the intervention/Bat-Signal handlers, and the autopsy/portfolio-analysis routes are unchanged.

```
edc/
├── server/
│   ├── src/
│   │   ├── services/
│   │   │   ├── predictiveScoringEngine.js      (NEW)
│   │   │   ├── velocityAnalytics.js             (NEW — cohort/longitudinal only, C9)
│   │   │   ├── competitiveIntelligence.js       (NEW)
│   │   │   ├── customPatternEvaluator.js        (NEW — runs alongside the Phase 1 built-in array, C2)
│   │   │   ├── playbookEngine.js                (NEW — dynamic superset of Phase 1 checklists, C7)
│   │   │   ├── nlcParser.js                     (NEW)
│   │   │   ├── pipelineSimulation.js            (NEW)
│   │   │   ├── reportGenerator.js               (NEW)
│   │   │   ├── digestScheduler.js               (NEW)
│   │   │   ├── webhookDispatcher.js             (NEW — machine-to-machine, distinct from Bat-Signal, C7)
│   │   │   ├── importEngine.js                  (NEW)
│   │   │   ├── exportEngine.js                  (NEW)
│   │   │   └── dealIntelligenceEngine.js        (UPDATED — invokes custom patterns after built-ins)
│   │   ├── subscribers/                         (NEW — Phase 2 event backbone, C8)
│   │   │   ├── index.js
│   │   │   ├── activityLogger.js
│   │   │   ├── snapshotService.js
│   │   │   ├── healthTracker.js
│   │   │   ├── alertEvaluator.js
│   │   │   └── escalationEngine.js
│   │   ├── lib/
│   │   │   ├── eventBus.js                      (NEW)
│   │   │   └── logger.js
│   │   └── routes/
│   │       ├── v2/                              (NEW)
│   │       │   ├── scores.js
│   │       │   ├── competitors.js
│   │       │   ├── stakeholders.js
│   │       │   ├── decisions.js
│   │       │   ├── meetings.js
│   │       │   ├── riskPatterns.js
│   │       │   ├── playbooks.js
│   │       │   ├── scenarios.js
│   │       │   ├── simulation.js
│   │       │   ├── memory.js
│   │       │   ├── analytics.js
│   │       │   ├── customFields.js
│   │       │   ├── tags.js
│   │       │   ├── reports.js
│   │       │   ├── export.js
│   │       │   ├── import.js
│   │       │   ├── notifications.js
│   │       │   ├── webhooks.js
│   │       │   └── commanders.js
│   │       └── v1/                              (Phase 1 — UNCHANGED)
│   │           ├── auth.js
│   │           ├── deals.js
│   │           ├── gates.js
│   │           ├── blockers.js
│   │           ├── crossSells.js
│   │           ├── intelligence.js
│   │           ├── audit.js
│   │           ├── lookups.js
│   │           └── health.js
│   └── __tests__/
│       ├── unit/
│       │   ├── predictiveScoring.test.js        (NEW)
│       │   ├── customPatternEvaluator.test.js   (NEW)
│       │   ├── nlcParser.test.js                (NEW)
│       │   ├── pipelineSimulation.test.js       (NEW)
│       │   └── velocityAnalytics.test.js        (NEW)
│       └── integration/
│           └── v2/                              (NEW)
│               ├── scores.test.js
│               ├── competitors.test.js
│               ├── stakeholders.test.js
│               ├── decisions.test.js
│               ├── riskPatterns.test.js
│               ├── playbooks.test.js
│               ├── scenarios.test.js
│               ├── memory.test.js
│               ├── webhooks.test.js
│               ├── multiCommander.test.js
│               └── boundaryIntegrity.test.js    (NEW — one assertion per charter row C1–C16)
├── client/
│   ├── src/
│   │   ├── components/
│   │   │   ├── analytics/                       (NEW)
│   │   │   │   ├── PipelineAnalyticsPage.tsx
│   │   │   │   ├── VelocityHeatmap.tsx
│   │   │   │   ├── CompetitiveSummary.tsx
│   │   │   │   ├── WinLossDashboard.tsx
│   │   │   │   └── SimulationResults.tsx
│   │   │   ├── cockpit/
│   │   │   │   ├── PredictiveScoreWidget.tsx    (NEW)
│   │   │   │   ├── CompetitorTracker.tsx        (NEW)
│   │   │   │   ├── StakeholderMap.tsx           (NEW)
│   │   │   │   ├── DecisionLog.tsx              (NEW)
│   │   │   │   ├── PlaybookTracker.tsx          (NEW)
│   │   │   │   ├── SimilarDealsWidget.tsx       (NEW)
│   │   │   │   └── CustomFieldRenderer.tsx      (NEW)
│   │   │   ├── briefing/
│   │   │   │   ├── ComparisonMode.tsx           (NEW)
│   │   │   │   └── BriefingScoreOverlay.tsx     (NEW)
│   │   │   ├── automation/                      (NEW)
│   │   │   │   ├── RuleBuilder.tsx
│   │   │   │   ├── NotificationCenter.tsx
│   │   │   │   └── CommandPalette.tsx
│   │   │   ├── reports/                         (NEW)
│   │   │   │   ├── ReportGenerator.tsx
│   │   │   │   └── ReportPreview.tsx
│   │   │   ├── import-export/                   (NEW)
│   │   │   │   ├── ImportWizard.tsx
│   │   │   │   └── ExportDialog.tsx
│   │   │   ├── mobile/                          (NEW)
│   │   │   │   ├── MobileDealList.tsx
│   │   │   │   ├── MobileDealDetail.tsx
│   │   │   │   └── MobileQuickActions.tsx
│   │   │   └── settings/                        (NEW)
│   │   │       ├── CommanderProfile.tsx
│   │   │       ├── WebhookManager.tsx
│   │   │       ├── DigestSettings.tsx
│   │   │       └── CustomFieldManager.tsx
│   │   ├── stores/
│   │   │   ├── useAnalyticsStore.ts             (NEW)
│   │   │   ├── useCommanderStore.ts             (NEW)
│   │   │   └── useNotificationStore.ts          (NEW)
│   │   └── hooks/
│   │       ├── useCommandPalette.ts             (NEW)
│   │       ├── useNLCQuery.ts                   (NEW)
│   │       └── useResponsive.ts                 (NEW)
├── server/src/db/
│   └── migrations/
│       ├── 001_v2_multi_commander.sql           (NEW — additive over Phase 1 edc schema)
│       ├── 002_v2_snapshots_activity.sql        (NEW)
│       ├── 003_v2_competitive_stakeholders.sql  (NEW)
│       ├── 004_v2_custom_patterns_playbooks.sql (NEW)
│       ├── 005_v2_financial_scenarios.sql       (NEW)
│       ├── 006_v2_memory_custom_fields.sql      (NEW)
│       ├── 007_v2_notifications_webhooks.sql    (NEW)
│       └── 008_v2_seed_data.sql                 (NEW)
└── templates/                                   (NEW)
    └── reports/
        ├── executive-pipeline-summary.html
        ├── deal-deep-dive.html
        ├── quarterly-business-review.html
        ├── board-deck.html
        └── email-digest.html
```

### Appendix B: Phase 2 Technology Additions

| Technology | Version | Purpose |
|---|---|---|
| Puppeteer | 22.x | Server-side PDF generation from HTML templates |
| Chart.js | 4.x | Charts in report HTML templates (rendered server-side) |
| node-cron | 3.x | Scheduled jobs (snapshots, digests, benchmarks) |
| nodemailer | 6.x | Email delivery for digests and escalation alerts |
| xlsx (SheetJS) | 0.20.x | Excel import/export |
| multer | 1.x | File upload handling for import |
| Redis | 7.x | Session/threshold/intelligence cache, real-time alert state, rate limiting |
| PWA (service worker) | — | Offline caching and mobile installability |

### Appendix C: Phase 2 Coverage Targets

| Component | Target |
|---|---|
| Predictive Scoring Engine | ≥ 95% line, ≥ 90% branch |
| Custom Pattern Evaluator | ≥ 95% line |
| NLC Parser | ≥ 90% line (all documented query patterns) |
| Pipeline Simulation | ≥ 90% line |
| All Phase 2 API Routes | ≥ 85% line |
| Boundary-Integrity Suite | 100% — one passing assertion per charter row C1–C16 |
| E2E Critical Journeys | 100% pass rate |

### Appendix D: Charter Cross-Reference Index (Phase 2 sections → charter rows)

| Phase 2 Section | Charter row(s) | Phase 2 owns | Phase 1 owns (do not duplicate) |
|---|---|---|---|
| §4 Predictive Scoring | C3, C9, C13 | Learned 0–100 score + feature breakdown | Glass-box `explain()`, `SLOW_MOTION_COLLISION`, attach-rate (consumed as inputs) |
| §5 Velocity & Pipeline Analytics | C9, C12 | Cohort benchmarks, Pipeline Velocity Index, longitudinal analytics | Self-referential `SLOW_MOTION_COLLISION`; current-state portfolio correlation |
| §6 Competitive Intelligence | C2, C11 | Competitor data + competitor/stakeholder patterns + competitor win/loss | Fixed built-in pattern array; `loss_archetypes` taxonomy |
| §7 Deal Memory | C14, C11 | Narrative searchable knowledge base of closed deals | Soft-delete/archive/restore; structured autopsy correlation |
| §8 Win/Loss Post-Mortem | C11 | Narrative, lessons, recommended playbook, archival | `loss_archetypes` + deterministic autopsy |
| §11 Decision Log | C6, C7 | Free-form meeting decisions | `deal_stage_overrides` ledger; `deal_interventions` log |
| §12 Custom Pattern Builder | C2 | Commander-authored no-code runtime rules | Engineer-defined built-in array (12 patterns) |
| §13 Playbook Engine | C7 | Auto-assign, lifecycle, next-best-action, critical-step alerts | Static intervention checklists + launch/log |
| §15 Smart Alerts & Escalation | C4, C7 | Notification rules, escalation, delivery, in-app center, notification log | Advisory Acknowledge/Accept/Snooze; manual Bat-Signal |
| §16 Ramp Pricing | C1 | Per-year ramp schedule + ramp-aware TCV | Multi-currency normalization (`normalizedTCV`) |
| §17 Financial Scenario Engine | C10 | Persisted, financial, pipeline-wide scenarios | Ephemeral client-side risk-only simulator |
| §18 Pipeline Simulation | C10 | Monte-Carlo probabilistic forecast | — (Phase 1 has none) |
| §19 Board Reports | C15 | Portable multi-page PDFs | — (Phase 1 screen-only) |
| §20 Briefing Mode V2 | C15, C8 | On-screen comparison/overlays/drill-down via snapshots | Presenter ergonomics; audit-log Deal Replay |
| §21 Email Digest | C4 | Scheduled email delivery | — (Phase 1 has none) |
| §24 Webhooks | C7 | Automated machine-to-machine HMAC events | Human-initiated 48h Bat-Signal share link |
| §26/§28/§29 Backbone | C8, C16 | Event bus, snapshots, activity log, health history, materialized views, Redis | Read-time audit-log projection; in-memory cache |
| §9/§10/§14/§22/§23/§25 | C16 | Multi-commander, stakeholder maps, NLC, custom fields/tags, import/export, mobile/PWA | — (entirely Phase 2; Phase 1 single-actor/synchronous) |

---

*End of Document — Enterprise Deal Commander (EDC) — Phase 2 PRD v3.0 (Final, Production-Ready). Supersedes V2 PRD v2.0. Pairs with "Enterprise Deal Commander (EDC) — Phase 1 PRD (Final, Production-Ready).md" under the shared Phase Boundary & Non-Overlap Charter (§1A).*
