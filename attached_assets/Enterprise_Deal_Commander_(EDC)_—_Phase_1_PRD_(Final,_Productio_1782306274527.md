---

# Product Requirement Document (PRD)

## Enterprise Deal Commander (EDC) — Phase 1 (Final, Production-Ready)

**Document Version:** 4.0 (Production-Ready Phase 1 Baseline)
**Status:** Final — Engineering-Ready
**Author:** Presales Enterprise Manager
**Target Audience:** Engineering Team / Full-Stack Developers
**Last Revised:** June 2026

> **Version note.** This document is **v4.0**. It **supersedes v3.0 ("Executive War Room Edition")** and is the **production-ready Phase 1 baseline**. It preserves every section of v3.0 in full and integrates fourteen carved, non-overlapping enhancements (F1–F14). All v3.0 schema, API, engine, UI, testing, deployment, and milestone content remains intact; new capabilities are additive.
>
> **Companion document.** This PRD pairs with **"Enterprise Deal Commander (EDC) — Phase 2 PRD (Final, Production-Ready).md"** (the *Sovereign Intelligence Edition*). The two are governed by a single shared **Phase Boundary & Non-Overlap Charter**, embedded verbatim below as Section 1A. Where any text here appears to conflict with that charter, **the charter governs**.

---

## Table of Contents

```
 1. Document Overview & Strategic Objective
1A. Phase Boundary & Non-Overlap Charter   ← (embedded verbatim; authoritative)
 2. Glossary & Canonical Terminology
 3. Technical Architecture Blueprint
 4. Database Schema (PostgreSQL Production Code)
 5. RESTful API Contract Specification
 6. Analytical Intelligence & Pattern Engine
 7. Frontend Architecture & State Management
 8. Cockpit UI — Interface Specification
 9. Executive Briefing Mode (Presentation View)
10. Access Boundaries & Security Model
11. Testing Strategy & Quality Assurance
12. Monitoring, Observability & Reliability
13. Deployment, Infrastructure & Disaster Recovery
14. Delivery Milestones, Phased Execution & Acceptance Criteria
15. Risk Register & Mitigation Strategies
16. Appendices
17. Enhanced Capabilities — Detailed Specifications (F1–F14)
       F1  Multi-Currency Normalization & Reporting-Currency Rollup
       F2  Glass-Box Explainable Alerts
       F3  Risk Advisory Governance (Acknowledge/Accept/Snooze) + Audit Trail Viewer
       F4  Gate Dependency & Integrity Model
       F5  Presenter-Grade Briefing Ergonomics
       F6  Temporal Intelligence: Change Digest + Deal Replay
       F7  Rapid Intervention Checklists + Bat-Signal
       F8  Self-Referential Momentum Pattern (SLOW_MOTION_COLLISION)
       F9  Ephemeral Risk Simulator
       F10 Closed-Lost Structured Autopsy
       F11 Portfolio Correlation Dashboard
       F12 Stage-Transition Guardrails with Governed Overrides
       F13 Cross-Sell Whitespace & Attach-Rate (LOW_ATTACH_ELEPHANT)
       F14 Deal Soft-Delete, Archive & Restore
```

---

## 1. Document Overview & Strategic Objective

### 1.1 Context & Intent

In enterprise tech deployment cycles (at the scale of Microsoft, Google, or AWS), large-scale Total Contract Value (TCV) pipelines fail not from a lack of sales activity, but from a **disconnect between commercial progression and technical validation**.

Traditional CRMs (Salesforce, HubSpot) prioritize sales forecasting milestones (e.g., "Negotiation", "Verbal Agreement") while leaving leadership blind to technical hurdles, un-scoped Proof of Concepts (PoCs), and architecture vetoes.

### 1.2 Objective

The **Enterprise Deal Commander (EDC)** is an exclusive, high-impact executive overlay platform designed to act as a **Single-Manager Command Cockpit**.

The Deal Commander retains absolute administrative authority over data inputs. Frontline solutions architects or account managers do not access this system. Instead, the Commander updates records during strategic deep-dives to drive pattern analysis, organize high-value interventions, and transition instantly into a streamlined presentation interface for C-suite executive alignment briefings.

### 1.3 Operational Flow

```
+-----------------------------------------------------------------------------------+
|                            THE EDC OPERATIONAL ENGINE                             |
+-----------------------------------------------------------------------------------+
|  1. STANDUPS & 1-ON-1S  -->  2. COMMANDER EXCLUSIVE CRUD  --> 3. PATTERN DETECT  |
|  Commander gathers deal       Direct structural data entry   System flags tech   |
|  realities from team.         into the Cockpit.              & sales mismatches.  |
+-----------------------------------------------------------------------------------+
                                                                     |
                                                                     v
                                                       +----------------------------+
                                                       | 4. EXECUTIVE BRIEFING MODE |
                                                       |   One-click transform into |
                                                       |   executive-ready deck.    |
                                                       +----------------------------+

```

### 1.4 Key Design Principles

| Principle | Description |
|---|---|
| **Single Source of Truth** | One Commander, one authenticated session, zero data drift between parallel edits |
| **Temporal Awareness** | Every state change is timestamped; staleness and time-in-stage are first-class risk signals |
| **Compound Risk Visibility** | Multiple risk patterns can fire simultaneously; the worst severity drives the health indicator |
| **Presentation-Grade Output** | Every screen is designed to be projected in a boardroom without modification |
| **Extensible by Data, Not Schema** | Adding gates, patterns, products, or pipeline stages requires data inserts, not `ALTER TABLE` statements |
| **Deterministic, In-the-Moment** | Every Phase 1 capability computes from a single deal's own data (or a current cross-section), uses deterministic logic, persists nothing speculative, and needs no asynchronous infrastructure (see §1A) |

### 1.5 Success Criteria

| Metric | Target |
|---|---|
| Time to prepare an executive deal review | < 5 minutes (down from 45+ minutes in spreadsheets) |
| Deals with complete technical gate tracking | 100% of monitored deals |
| Risk detection before commercial-stage damage | At least 80% of premature commercial pushes flagged within same business day |
| Commander adoption (daily active usage) | 5+ days per week within 2 weeks of launch |

---

## 1A. Phase Boundary & Non-Overlap Charter

> The following section is the **authoritative charter**, embedded **verbatim**. It is the single source of truth for Phase 1 ↔ Phase 2 scope. Every F1–F14 enhancement in §17 cites the charter row (Cx) it satisfies and the Phase 2 section it stays clear of.

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

## 2. Glossary & Canonical Terminology

All engineering communication, code comments, UI labels, and database identifiers must use these canonical terms.

| Term | Definition | Notes |
|---|---|---|
| **Deal Commander** | The authenticated user — the Presales Enterprise Manager who owns this tool | The only user with CRUD access |
| **Account Manager** | The sales-line owner responsible for commercial progression on a deal | Read-only reference; does not access EDC |
| **Technical Lead** | The presales-line owner responsible for architecture validation | Read-only reference; does not access EDC |
| **Enterprise Deal** | A single tracked opportunity with commercial and technical dimensions | Identified by `(account_name, deal_name)` |
| **Technical Gate** | A verifiable milestone in the technical validation track | Grouped into Gate Groups 1–5 |
| **Gate Group** | A logical cluster of 2–3 technical gates representing a validation phase | All gates in a group must complete to advance |
| **Milestone** | The highest completed Gate Group, used as a progress label | "Gate 2: Core MVP Validated" |
| **Blocker** | A logged impediment categorized by type and severity | Can be resolved; resolution is timestamped |
| **Pattern Alert** | A risk condition triggered by the Intelligence Engine | Multiple can fire per deal |
| **Health Status** | The aggregate risk color for a deal: `GREEN`, `YELLOW`, or `RED` | Derived from the worst active Pattern Alert |
| **TCV** | Total Contract Value — the computed financial footprint of a deal | `(product_revenue × term_years) + services_revenue` for multi-year |
| **Huddle Mode** | The executive-optimized presentation overlay | Official name: **Executive Briefing Mode** |
| **Cockpit** | The full-featured operational workspace used by the Commander day-to-day | Default view |
| **Reporting Currency** | The single Commander-selected currency in which all portfolio rollups and threshold comparisons are computed | Tunable via `engine_thresholds`; see F1 |
| **Normalized TCV** | A deal's TCV converted from its native `deal_currency` into the reporting currency via `fx_rates` | Drives the header sum, summary, and all threshold comparisons; see F1 |
| **Glass-Box Explanation** | A built-in pattern's machine-readable `explain()` output: evaluated inputs, thresholds used (with provenance), and a `clearsWhen` remediation string | Built-in patterns only; see F2 |
| **Risk Disposition** | A Commander judgment on a fired advisory: `acknowledge`, `accept` (rationale required), or `snooze` (state-based: until a named field changes) | Recorded to `deal_audit_log`; see F3 |
| **Managed Risk** | An alert with an active disposition; shown separately and (by default) excluded from the headline Critical Alerts count | See F3 |
| **Integrity Warning** | A non-blocking write-time flag that a gate toggle is `out_of_order` or a `regression` | Warning, not a hard block; see F4 |
| **Speaker Notes** | A Commander-private per-deal note, never projected and never exported in the briefing PDF | See F5 |
| **Change Digest** | A human-readable read-time projection of `deal_audit_log` rows since a review marker | See F6 |
| **Deal Replay** | A read-time reconstruction of a deal's state at a past date by reverse-applying audit deltas | No stored snapshots; see F6 |
| **Intervention Checklist** | A static, pre-defined set of steps keyed to a built-in alert code | Launch is logged only; see F7 |
| **Bat-Signal** | A 48-hour signed-JWT read-only public share link to a single deal's risk card | Distinct token audience/claims; see F7 |
| **Risk Simulator** | An ephemeral, client-side, non-persisted preview of Health + Alerts on unbound inputs | Saves nothing; see F9 |
| **Loss Archetype** | A structured categorical reason a deal was Closed-Lost | Mandatory on Closed-Lost; see F10 |
| **Cross-Sell Whitespace** | The set of catalog products not yet pitched on a deal (`product_catalog` minus `deal_cross_sells`) | See F13 |
| **Attach Rate** | Pitched cross-sell products ÷ catalog size for a deal | See F13 |
| **Soft-Delete / Archive** | A recoverable deletion lifecycle via `deleted_at` / `archived_at`, with `restore` | Distinct from P2 Deal Memory; see F14 |

---

## 3. Technical Architecture Blueprint

### 3.1 System Architecture Overview

```
                         ┌──────────────────────────────────────────┐
                         │          PRESENTATION LAYER              │
                         │                                          │
                         │   React 19 SPA  +  Vite  +  Tailwind v4 │
                         │   State: Zustand (fine-grained stores)   │
                         │   Routing: React Router v7               │
                         │   Forms: react-hook-form + zod           │
                         └─────────────────┬────────────────────────┘
                                           │ HTTPS (REST API)
                                           │ JSON payloads
                                           │ JWT in httpOnly cookie
                         ┌─────────────────▼────────────────────────┐
                         │         APPLICATION TIER                 │
                         │                                          │
                         │   Node.js 20 LTS  +  Express 5          │
                         │   Validation: zod (shared schemas)       │
                         │   Auth: JWT (RS256) + bcrypt             │
                         │   Rate limiting: express-rate-limit      │
                         │   Logging: pino (structured JSON)        │
                         │   Error tracking: Sentry SDK             │
                         └─────────────────┬────────────────────────┘
                                           │ Connection pool (pg)
                         ┌─────────────────▼────────────────────────┐
                         │       DATABASE INFRASTRUCTURE            │
                         │                                          │
                         │   PostgreSQL 16                          │
                         │   Schema: edc (isolated namespace)       │
                         │   Migrations: node-pg-migrate            │
                         │   Backups: pg_dump (daily) + WAL archiving│
                         └──────────────────────────────────────────┘
```

> **Phase 1 invariant (per §1A, C16):** the tier diagram above is complete for Phase 1. No event bus, queue, Redis, materialized view, or headless-browser service is introduced by any F1–F14 enhancement. The client-side risk simulator (F9) runs **in the browser** by reusing a pure extraction of the existing engine; no new server tier is added.

### 3.2 Technology Stack Rationale

| Layer | Choice | Rationale |
|---|---|---|
| **Frontend Framework** | React 19 + Vite | Fast HMR, modern React features (Server Components not needed for SPA), Vite's sub-second builds |
| **Styling** | Tailwind CSS v4 | Utility-first for rapid iteration; deterministic class names prevent CSS drift |
| **State Management** | Zustand | 1KB footprint, selector-based subscriptions prevent unnecessary re-renders, no boilerplate |
| **Form Management** | react-hook-form + zod | Dirty-field tracking, validation co-located with schema, minimal re-renders |
| **Backend Framework** | Express 5 (async-native) | Battle-tested, minimal abstractions, large middleware ecosystem |
| **Input Validation** | zod (shared between FE + BE) | Single schema definition used for both client-side form validation and server-side API validation |
| **Database** | PostgreSQL 16 | Strict constraints, enum-like lookup tables, array support, JSON columns for future flexibility |
| **Authentication** | JWT (RS256) | Asymmetric keys allow future service-to-service auth without sharing secrets |
| **Logging** | pino | Structured JSON logging, extremely low overhead (~5x faster than winston) |
| **Error Tracking** | Sentry | Automatic stack traces, breadcrumb trails, release tracking |

### 3.3 Environment Tiers

| Environment | Purpose | Infrastructure |
|---|---|---|
| `development` | Local developer workstation | Docker Compose (PostgreSQL + app) |
| `staging` | Pre-production validation | Cloud VM or container, staging database with synthetic data |
| `production` | Live operational use | Cloud VM or container, production database, HTTPS enforced |

---

## 4. Database Schema (PostgreSQL Production Code)

### 4.1 Design Principles

- **Lookup tables over enums:** PostgreSQL `ENUM` types require `ALTER TYPE` to add values. Lookup tables allow adding new stages, tiers, or products via `INSERT` with zero downtime.
- **Normalized gates:** Gate completions are stored in a dedicated table with timestamps and attribution, enabling temporal analysis and audit trails.
- **Composite uniqueness:** `(account_name, deal_name)` as the natural key prevents duplicate entries while allowing multiple deals per enterprise account.
- **Temporal fields:** `stage_entered_at`, `expected_close_date`, and `completed_at` enable time-based risk detection.

### 4.2 Complete Schema

```sql
-- ============================================================
-- 1. EXTENSIONS & SCHEMA ISOLATION
-- ============================================================
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

CREATE SCHEMA IF NOT EXISTS edc;
SET search_path TO edc, public;

-- ============================================================
-- 2. LOOKUP TABLES (Replacing ENUMs for Extensibility)
-- ============================================================

-- Pipeline Stages
CREATE TABLE pipeline_stages (
    id SERIAL PRIMARY KEY,
    stage_name VARCHAR(50) NOT NULL UNIQUE,
    sort_order SMALLINT NOT NULL,
    description TEXT,
    is_active BOOLEAN NOT NULL DEFAULT TRUE
);

INSERT INTO pipeline_stages (stage_name, sort_order, description) VALUES
    ('Discovery',     1, 'Initial technical and business discovery'),
    ('Validation',    2, 'PoC execution and technical proof points'),
    ('Commercial',    3, 'Pricing negotiation and SOW drafting'),
    ('Procurement',   4, 'Legal review, security questionnaire, redlines'),
    ('Closed-Won',    5, 'Contract fully executed'),
    ('Closed-Lost',   6, 'Deal did not close — reason captured in notes');

-- Pricing Models
CREATE TABLE pricing_models (
    id SERIAL PRIMARY KEY,
    model_name VARCHAR(50) NOT NULL UNIQUE,
    is_active BOOLEAN NOT NULL DEFAULT TRUE
);

INSERT INTO pricing_models (model_name) VALUES
    ('Annual Subscription'),
    ('Multi-Year Committed'),
    ('Perpetual License'),
    ('Usage-Based'),
    ('Hybrid');

-- Services Tiers
CREATE TABLE services_tiers (
    id SERIAL PRIMARY KEY,
    tier_name VARCHAR(60) NOT NULL UNIQUE,
    is_active BOOLEAN NOT NULL DEFAULT TRUE
);

INSERT INTO services_tiers (tier_name) VALUES
    ('None'),
    ('Professional Services Pitched'),
    ('Premium Support Pitched'),
    ('Combined SOW Shared'),
    ('Managed Services Contract');

-- Product Catalog
CREATE TABLE product_catalog (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    product_name VARCHAR(255) NOT NULL UNIQUE,
    product_category VARCHAR(100),
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

INSERT INTO product_catalog (product_name, product_category) VALUES
    ('Core Platform License', 'Platform'),
    ('Advanced Analytics Package', 'Analytics'),
    ('Dedicated Edge Node Gateway', 'Infrastructure'),
    ('Threat Detection Engine', 'Security'),
    ('API Management Suite', 'Integration'),
    ('Data Residency Module', 'Compliance');

-- Blocker Categories
CREATE TABLE blocker_categories (
    id SERIAL PRIMARY KEY,
    category_name VARCHAR(30) NOT NULL UNIQUE,
    is_active BOOLEAN NOT NULL DEFAULT TRUE
);

INSERT INTO blocker_categories (category_name) VALUES
    ('Technical'),
    ('Sales'),
    ('Procurement'),
    ('Legal'),
    ('Executive');

-- Blocker Severities
CREATE TABLE blocker_severities (
    id SERIAL PRIMARY KEY,
    severity_name VARCHAR(10) NOT NULL UNIQUE,
    sort_order SMALLINT NOT NULL
);

INSERT INTO blocker_severities (severity_name, sort_order) VALUES
    ('Low', 1),
    ('Medium', 2),
    ('High', 3);

-- ============================================================
-- 3. GATE DEFINITIONS (Configurable Technical Validation Steps)
-- ============================================================

CREATE TABLE gate_definitions (
    id SERIAL PRIMARY KEY,
    gate_group SMALLINT NOT NULL CHECK (gate_group BETWEEN 1 AND 5),
    gate_code VARCHAR(30) NOT NULL UNIQUE,
    label VARCHAR(150) NOT NULL,
    description TEXT,
    sort_order SMALLINT NOT NULL,
    is_active BOOLEAN NOT NULL DEFAULT TRUE
);

INSERT INTO gate_definitions (gate_group, gate_code, label, description, sort_order) VALUES
    (1, 'G1_CRITERIA_LOCKED',
        'Minimum Viable Requirements Locked',
        'Technical success criteria agreed upon and documented with the customer',
        1),
    (1, 'G1_EXECUTIVE_AGREED',
        'Executive Champion Agrees on Criteria',
        'Customer executive sponsor has formally signed off on evaluation criteria',
        2),
    (2, 'G2_WORKFLOW_VERIFIED',
        'Core Workflow Demonstration Verified',
        'Primary use case workflows demonstrated and validated in a controlled environment',
        3),
    (2, 'G2_CHAMPION_DEFENSIBLE',
        'Champion Can Defend Internally',
        'Internal champion has the technical ammunition and political capital to advocate',
        4),
    (3, 'G3_PERFORMANCE_PASSED',
        'Load/Performance Stress Passed',
        'Platform performance validated under production-representative load conditions',
        5),
    (3, 'G3_INTEGRATIONS_MAPPED',
        'Integration Interfaces Mapped',
        'All required integrations identified, API contracts scoped, and data flows documented',
        6),
    (4, 'G4_INFOSEC_CLEARED',
        'InfoSec Review Panel Approved',
        'Customer security team has reviewed and approved the platform architecture',
        7),
    (4, 'G4_COMPLIANCE_VALIDATED',
        'Compliance Validated',
        'Regulatory and compliance requirements (SOC2, GDPR, HIPAA as applicable) confirmed met',
        8),
    (5, 'G5_CTO_SIGNED_OFF',
        'CTO/VP Engineering Win Signed-Off',
        'Technical decision-maker has formally approved the platform for procurement',
        9);

-- ── F4: Gate Dependency & Integrity Model (see §17.F4) ───────
-- Declarative prerequisites enable write-time integrity warnings.
ALTER TABLE gate_definitions
    ADD COLUMN prerequisite_gate_codes TEXT[] NOT NULL DEFAULT '{}';

UPDATE gate_definitions SET prerequisite_gate_codes = '{G1_CRITERIA_LOCKED}'      WHERE gate_code = 'G1_EXECUTIVE_AGREED';
UPDATE gate_definitions SET prerequisite_gate_codes = '{G1_EXECUTIVE_AGREED}'     WHERE gate_code = 'G2_WORKFLOW_VERIFIED';
UPDATE gate_definitions SET prerequisite_gate_codes = '{G2_WORKFLOW_VERIFIED}'    WHERE gate_code = 'G2_CHAMPION_DEFENSIBLE';
UPDATE gate_definitions SET prerequisite_gate_codes = '{G2_CHAMPION_DEFENSIBLE}'  WHERE gate_code = 'G3_PERFORMANCE_PASSED';
UPDATE gate_definitions SET prerequisite_gate_codes = '{G3_PERFORMANCE_PASSED}'   WHERE gate_code = 'G3_INTEGRATIONS_MAPPED';
UPDATE gate_definitions SET prerequisite_gate_codes = '{G3_INTEGRATIONS_MAPPED}'  WHERE gate_code = 'G4_INFOSEC_CLEARED';
UPDATE gate_definitions SET prerequisite_gate_codes = '{G4_INFOSEC_CLEARED}'      WHERE gate_code = 'G4_COMPLIANCE_VALIDATED';
UPDATE gate_definitions SET prerequisite_gate_codes = '{G4_COMPLIANCE_VALIDATED}' WHERE gate_code = 'G5_CTO_SIGNED_OFF';

-- ============================================================
-- 4. INTELLIGENCE ENGINE CONFIGURATION
-- ============================================================

CREATE TABLE engine_thresholds (
    id SERIAL PRIMARY KEY,
    parameter_key VARCHAR(100) NOT NULL UNIQUE,
    parameter_value TEXT NOT NULL,
    data_type VARCHAR(20) NOT NULL DEFAULT 'number',
    description TEXT,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

INSERT INTO engine_thresholds (parameter_key, parameter_value, data_type, description) VALUES
    ('elephant_tcv_threshold',      '500000',  'number',  'TCV above which a deal is classified as an elephant deal'),
    ('mega_deal_tcv_threshold',     '1000000', 'number',  'TCV above which a deal is classified as a mega deal'),
    ('stale_stage_days',            '21',      'number',  'Days in current stage before a staleness alert fires'),
    ('ghost_pipeline_days',         '14',      'number',  'Days without updates before a ghost pipeline alert fires'),
    ('phantom_champion_days',       '30',      'number',  'Days active without executive agreement before phantom champion alert fires'),
    ('close_date_warning_days',     '30',      'number',  'Days before expected close date to trigger proximity alert'),
    ('gate_completion_warn_pct',    '50',      'number',  'Minimum gate completion percentage expected when within close_date_warning_days');

-- ── F1: Reporting currency for multi-currency rollups (see §17.F1) ──
INSERT INTO engine_thresholds (parameter_key, parameter_value, data_type, description) VALUES
    ('reporting_currency', 'USD', 'string', 'Currency used for all portfolio rollups and threshold comparisons');

-- ── F8: Self-referential momentum thresholds (see §17.F8) ──────────
INSERT INTO engine_thresholds (parameter_key, parameter_value, data_type, description) VALUES
    ('momentum_drop_pct',      '50', 'number', 'Pct drop in the deal''s own gate-completion velocity (recent vs earlier window) that signals deceleration'),
    ('momentum_window_days',   '30', 'number', 'Window size in days used to split the deal''s own history into recent vs earlier gate-completion rates'),
    ('momentum_min_gate_pct',  '60', 'number', 'Gate-completion pct below which a decelerating deal nearing close fires SLOW_MOTION_COLLISION');

-- ── F13: Low cross-sell attach rate on large deals (see §17.F13) ───
INSERT INTO engine_thresholds (parameter_key, parameter_value, data_type, description) VALUES
    ('low_attach_rate_threshold', '0.34', 'number', 'Attach rate (pitched / catalog) at or below which a large (elephant) deal fires LOW_ATTACH_ELEPHANT');

-- ============================================================
-- 5. CORE TABLES
-- ============================================================

-- The Master Enterprise Deals Table
CREATE TABLE enterprise_deals (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    deal_name VARCHAR(255) NOT NULL,
    account_name VARCHAR(255) NOT NULL,
    crm_record_url TEXT CHECK (crm_record_url IS NULL OR crm_record_url ~ '^https?://.+'),

    -- Dual-Accountability Deal Team
    account_manager VARCHAR(255) NOT NULL,
    technical_lead VARCHAR(255) NOT NULL,

    -- Commercial Progression
    sales_stage_id INT NOT NULL REFERENCES pipeline_stages(id),
    stage_entered_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,

    -- Financial Architecture
    product_revenue NUMERIC(15, 2) NOT NULL DEFAULT 0.00 CHECK (product_revenue >= 0),
    pricing_model_id INT NOT NULL REFERENCES pricing_models(id),
    contract_term_years INT NOT NULL DEFAULT 1 CHECK (contract_term_years >= 1),
    deal_currency CHAR(3) NOT NULL DEFAULT 'USD',
    expected_close_date DATE,
    win_probability_pct SMALLINT CHECK (win_probability_pct IS NULL OR win_probability_pct BETWEEN 0 AND 100),

    -- Services Attachment
    services_revenue NUMERIC(15, 2) NOT NULL DEFAULT 0.00 CHECK (services_revenue >= 0),
    services_tier_id INT NOT NULL REFERENCES services_tiers(id),

    -- Strategic Notes
    manager_strategic_blueprint TEXT,
    loss_reason TEXT,                       -- Populated only when stage = Closed-Lost

    -- F5: Commander-private speaker notes; NEVER projected/exported (see §17.F5)
    speaker_notes TEXT,

    -- F10: Structured Closed-Lost archetype; mandatory when stage = Closed-Lost (see §17.F10)
    loss_archetype_id INT REFERENCES loss_archetypes(id),

    -- F14: Recoverable deletion lifecycle (see §17.F14)
    archived_at TIMESTAMP WITH TIME ZONE,
    deleted_at  TIMESTAMP WITH TIME ZONE,

    -- Metadata
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,

    UNIQUE(account_name, deal_name)
);

-- Technical Gate Completions (Normalized)
CREATE TABLE deal_technical_gates (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    deal_id UUID NOT NULL REFERENCES enterprise_deals(id) ON DELETE CASCADE,
    gate_code VARCHAR(30) NOT NULL REFERENCES gate_definitions(gate_code),
    is_completed BOOLEAN NOT NULL DEFAULT FALSE,
    completed_at TIMESTAMP WITH TIME ZONE,
    completed_by VARCHAR(255),
    notes TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(deal_id, gate_code)
);

-- Cross-Sell Product Junction
CREATE TABLE deal_cross_sells (
    deal_id UUID NOT NULL REFERENCES enterprise_deals(id) ON DELETE CASCADE,
    product_id UUID NOT NULL REFERENCES product_catalog(id),
    is_pitched BOOLEAN NOT NULL DEFAULT TRUE,
    pitched_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    notes TEXT,
    PRIMARY KEY (deal_id, product_id)
);

-- Blockers Registry
CREATE TABLE deal_blockers (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    deal_id UUID NOT NULL REFERENCES enterprise_deals(id) ON DELETE CASCADE,
    category_id INT NOT NULL REFERENCES blocker_categories(id),
    severity_id INT NOT NULL REFERENCES blocker_severities(id),
    description TEXT NOT NULL CHECK (char_length(description) > 5),
    is_resolved BOOLEAN NOT NULL DEFAULT FALSE,
    resolved_at TIMESTAMP WITH TIME ZONE,
    resolution_notes TEXT,
    logged_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Comprehensive Audit Trail
CREATE TABLE deal_audit_log (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    deal_id UUID NOT NULL REFERENCES enterprise_deals(id) ON DELETE CASCADE,
    entity_type VARCHAR(50) NOT NULL,
    field_changed VARCHAR(100) NOT NULL,
    old_value TEXT,
    new_value TEXT,
    changed_by VARCHAR(255) NOT NULL,
    changed_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- ============================================================
-- 5A. ENHANCEMENT TABLES (F1, F3, F6, F7, F10, F12) — see §17
-- ============================================================

-- ── F1: FX rate lookup (extensible by data) ───────────────────────
CREATE TABLE fx_rates (
    id SERIAL PRIMARY KEY,
    base_currency  CHAR(3) NOT NULL,     -- e.g. 'EUR'
    quote_currency CHAR(3) NOT NULL,     -- reporting currency, e.g. 'USD'
    rate NUMERIC(18,8) NOT NULL CHECK (rate > 0),
    as_of DATE NOT NULL,
    UNIQUE (base_currency, quote_currency, as_of)
);

-- ── F3: Risk advisory dispositions (state-based snooze) ───────────
CREATE TABLE deal_alert_dispositions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    deal_id UUID NOT NULL REFERENCES enterprise_deals(id) ON DELETE CASCADE,
    pattern_code VARCHAR(50) NOT NULL,                  -- matches riskPatterns[].code
    disposition VARCHAR(20) NOT NULL CHECK (disposition IN ('acknowledge','accept','snooze')),
    rationale TEXT,                                     -- required for 'accept' (zod + handler enforced)
    snooze_until_field_change TEXT,                     -- state-based snooze, e.g. 'G3_PERFORMANCE_PASSED' or 'sales_stage_id'
    created_by VARCHAR(255) NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    UNIQUE (deal_id, pattern_code)
);

-- ── F6: Change Digest — review markers ────────────────────────────
CREATE TABLE deal_review_markers (
    deal_id UUID PRIMARY KEY REFERENCES enterprise_deals(id) ON DELETE CASCADE,
    last_reviewed_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    reviewed_by VARCHAR(255) NOT NULL
);

-- ── F7: Static intervention checklists (lookup, JSONB steps) ──────
CREATE TABLE intervention_checklists (
    id SERIAL PRIMARY KEY,
    trigger_pattern_code VARCHAR(50) NOT NULL,          -- a built-in riskPatterns[].code
    name VARCHAR(150) NOT NULL,
    steps JSONB NOT NULL,                               -- e.g. ["Pause quoting","Schedule CTO sync", ...]
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    UNIQUE (trigger_pattern_code, name)
);

INSERT INTO intervention_checklists (trigger_pattern_code, name, steps) VALUES
    ('PREMATURE_COMMERCIAL', 'Premature Commercial Containment',
        '["Pause quoting", "Schedule CTO sync", "Send architecture whitepaper", "Re-baseline close date after Gate 3"]'),
    ('DISCOUNT_TRAP', 'Discount Trap Recovery',
        '["Freeze discount approval", "Build services-attached business case", "Escalate to deal desk"]'),
    ('UNPROTECTED_ELEPHANT', 'Elephant Protection',
        '["Draft Professional Services SOW", "Confirm deployment ownership", "Add Premium Support line"]'),
    ('MISSING_STRUCTURAL_ANCHOR', 'Anchor Reset',
        '["Convene success-criteria workshop", "Lock Gate 1 criteria", "Obtain executive sign-off"]');

-- ── F7: Intervention launch log (log only; no lifecycle) ──────────
CREATE TABLE deal_interventions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    deal_id UUID NOT NULL REFERENCES enterprise_deals(id) ON DELETE CASCADE,
    pattern_code VARCHAR(50) NOT NULL,
    checklist_id INT NOT NULL REFERENCES intervention_checklists(id),
    launched_by VARCHAR(255) NOT NULL,
    launched_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- ── F10: Closed-Lost loss archetypes (structured taxonomy) ────────
CREATE TABLE loss_archetypes (
    id SERIAL PRIMARY KEY,
    archetype_name VARCHAR(80) NOT NULL UNIQUE,
    is_active BOOLEAN NOT NULL DEFAULT TRUE
);

INSERT INTO loss_archetypes (archetype_name) VALUES
    ('Technical Disqualification'),
    ('Budget Freeze'),
    ('Loss to Incumbent'),
    ('Compliance Gap'),
    ('Champion Departure'),
    ('No Decision');

-- ── F12: Stage-transition guardrail override ledger ───────────────
CREATE TABLE deal_stage_overrides (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    deal_id UUID NOT NULL REFERENCES enterprise_deals(id) ON DELETE CASCADE,
    from_stage INT NOT NULL REFERENCES pipeline_stages(id),
    to_stage   INT NOT NULL REFERENCES pipeline_stages(id),
    pattern_codes TEXT[] NOT NULL DEFAULT '{}',         -- RED patterns overridden
    override_reason TEXT NOT NULL,
    created_by VARCHAR(255) NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- NOTE (F10): loss_archetypes is created above enterprise_deals in the actual
-- migration ordering so the FK on enterprise_deals.loss_archetype_id resolves.
-- It is shown here grouped with enhancement tables for readability; the
-- node-pg-migrate migration sequences loss_archetypes FIRST.

-- ============================================================
-- 6. AUTOMATED TRIGGERS
-- ============================================================

-- Updated_at trigger function
CREATE OR REPLACE FUNCTION update_modified_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Apply to all tables with updated_at
CREATE TRIGGER trg_enterprise_deals_updated
    BEFORE UPDATE ON enterprise_deals
    FOR EACH ROW EXECUTE FUNCTION update_modified_column();

CREATE TRIGGER trg_deal_technical_gates_updated
    BEFORE UPDATE ON deal_technical_gates
    FOR EACH ROW EXECUTE FUNCTION update_modified_column();

CREATE TRIGGER trg_deal_blockers_updated
    BEFORE UPDATE ON deal_blockers
    FOR EACH ROW EXECUTE FUNCTION update_modified_column();

-- F3: keep disposition updated_at fresh
CREATE TRIGGER trg_deal_alert_dispositions_updated
    BEFORE UPDATE ON deal_alert_dispositions
    FOR EACH ROW EXECUTE FUNCTION update_modified_column();

-- ============================================================
-- 7. PERFORMANCE INDEXES
-- ============================================================

CREATE INDEX idx_deals_stage ON enterprise_deals(sales_stage_id);
CREATE INDEX idx_deals_account ON enterprise_deals(account_name);
CREATE INDEX idx_deals_close_date ON enterprise_deals(expected_close_date);
CREATE INDEX idx_deals_updated ON enterprise_deals(updated_at DESC);
CREATE INDEX idx_gates_deal ON deal_technical_gates(deal_id, is_completed);
CREATE INDEX idx_blockers_deal ON deal_blockers(deal_id, is_resolved);
CREATE INDEX idx_blockers_severity ON deal_blockers(severity_id) WHERE NOT is_resolved;
CREATE INDEX idx_audit_deal_time ON deal_audit_log(deal_id, changed_at DESC);
CREATE INDEX idx_audit_entity ON deal_audit_log(entity_type, changed_at DESC);

-- F14: default list queries filter out soft-deleted / archived rows fast
CREATE INDEX idx_deals_live ON enterprise_deals(updated_at DESC)
    WHERE deleted_at IS NULL AND archived_at IS NULL;
-- F1: latest applicable FX rate lookup
CREATE INDEX idx_fx_rates_lookup ON fx_rates(base_currency, quote_currency, as_of DESC);
-- F3: dispositions per deal
CREATE INDEX idx_dispositions_deal ON deal_alert_dispositions(deal_id);
-- F7: interventions per deal
CREATE INDEX idx_interventions_deal ON deal_interventions(deal_id, launched_at DESC);

-- ============================================================
-- 8. ROW-LEVEL SECURITY (Defense in Depth)
-- ============================================================

ALTER TABLE enterprise_deals ENABLE ROW LEVEL SECURITY;
ALTER TABLE deal_technical_gates ENABLE ROW LEVEL SECURITY;
ALTER TABLE deal_cross_sells ENABLE ROW LEVEL SECURITY;
ALTER TABLE deal_blockers ENABLE ROW LEVEL SECURITY;
ALTER TABLE deal_audit_log ENABLE ROW LEVEL SECURITY;
-- Enhancement tables inherit the same single-actor policy
ALTER TABLE deal_alert_dispositions ENABLE ROW LEVEL SECURITY;
ALTER TABLE deal_interventions ENABLE ROW LEVEL SECURITY;
ALTER TABLE deal_stage_overrides ENABLE ROW LEVEL SECURITY;
ALTER TABLE deal_review_markers ENABLE ROW LEVEL SECURITY;

-- Policy: Only the application role can access data
CREATE POLICY edc_app_policy ON enterprise_deals
    FOR ALL
    TO edc_app_role
    USING (true);

-- Repeat for other tables (identical pattern)
CREATE POLICY edc_app_policy ON deal_technical_gates
    FOR ALL TO edc_app_role USING (true);

CREATE POLICY edc_app_policy ON deal_cross_sells
    FOR ALL TO edc_app_role USING (true);

CREATE POLICY edc_app_policy ON deal_blockers
    FOR ALL TO edc_app_role USING (true);

CREATE POLICY edc_app_policy ON deal_audit_log
    FOR ALL TO edc_app_role USING (true);

CREATE POLICY edc_app_policy ON deal_alert_dispositions
    FOR ALL TO edc_app_role USING (true);

CREATE POLICY edc_app_policy ON deal_interventions
    FOR ALL TO edc_app_role USING (true);

CREATE POLICY edc_app_policy ON deal_stage_overrides
    FOR ALL TO edc_app_role USING (true);

CREATE POLICY edc_app_policy ON deal_review_markers
    FOR ALL TO edc_app_role USING (true);

-- Audit log is append-only for the app role
CREATE POLICY edc_audit_no_delete ON deal_audit_log
    FOR DELETE TO edc_app_role USING (false);

CREATE POLICY edc_audit_no_update ON deal_audit_log
    FOR UPDATE TO edc_app_role USING (false);
```

### 4.3 Entity Relationship Diagram

```
pipeline_stages (1)───────(M) enterprise_deals (1)───────(M) deal_technical_gates
pricing_models (1)───────(M)      │    (1)                   │
services_tiers (1)───────(M)      │                          │
                                   │    (1)                   │
gate_definitions (1)──────────────│──────────────────────(M)─┘
                                   │
                                   │    (1)───────(M) deal_blockers
                                   │                   │
blocker_categories (1)────────────│───────────────(M)─┘
blocker_severities (1)────────────│───────────────(M)─┘
                                   │
                                   │    (M)───────(M) deal_cross_sells
                                   │                   │
product_catalog (1)────────────────│───────────────(M)─┘
                                   │
                                   │    (1)───────(M) deal_audit_log
                                   │
   ── Phase 1 enhancement relations ─────────────────────────────
                                   │    (1)───────(M) deal_alert_dispositions   (F3)
                                   │    (1)───────(M) deal_interventions        (F7)
                                   │    (1)───────(M) deal_stage_overrides      (F12)
                                   │    (1)───────(1) deal_review_markers       (F6)
loss_archetypes (1)────────────────│───────────────(M)─ enterprise_deals.loss_archetype_id (F10)
intervention_checklists (1)────────│───────────────(M)─ deal_interventions     (F7)
fx_rates (currency lookup, no FK; resolved at read time)                       (F1)
```

> **§4 enhancement summary.** New tables added in Phase 1: `fx_rates` (F1), `deal_alert_dispositions` (F3), `deal_review_markers` (F6), `intervention_checklists` + `deal_interventions` (F7), `loss_archetypes` (F10), `deal_stage_overrides` (F12). New columns on `enterprise_deals`: `speaker_notes` (F5), `loss_archetype_id` (F10), `archived_at` / `deleted_at` (F14). New column on `gate_definitions`: `prerequisite_gate_codes` (F4). New `engine_thresholds` rows: `reporting_currency` (F1); `momentum_drop_pct` / `momentum_window_days` / `momentum_min_gate_pct` (F8); `low_attach_rate_threshold` (F13). Full specs in §17.

---

## 5. RESTful API Contract Specification

### 5.1 Base Configuration

| Property | Value |
|---|---|
| Base URL | `/api/v1` |
| Content-Type | `application/json` |
| Authentication | JWT in `httpOnly`, `Secure`, `SameSite=Strict` cookie |
| Rate Limit | 100 requests per 15-minute window per IP |
| Error Format | `{ "error": { "code": "STRING_CODE", "message": "Human-readable", "details": [...] } }` |

### 5.2 Authentication Endpoints

```
POST /api/v1/auth/login
  Request:  { "email": string, "password": string }
  Response: 200 { "message": "Authenticated" }
            Sets httpOnly cookie: edc_session=<JWT>
  Errors:   401 INVALID_CREDENTIALS

POST /api/v1/auth/logout
  Response: 200 { "message": "Logged out" }
            Clears edc_session cookie

GET /api/v1/auth/me
  Response: 200 { "id": uuid, "email": string, "role": "commander" }
  Errors:   401 UNAUTHORIZED
```

### 5.3 Deal Endpoints

```
GET /api/v1/deals
  Query:    ?stage=Commercial&health=RED&sort=-updated_at&limit=50&offset=0
            &state=active|archived|deleted        (F14 — default: active)
  Response: 200 {
    "data": [ DealObject, ... ],
    "meta": { "total": number, "limit": number, "offset": number }
  }
  Notes:    (F14) Default list/aggregate queries EXCLUDE rows with a non-null
            deleted_at or archived_at. `state=archived` / `state=deleted` opt in
            to the Recycle Bin / Archive view.

GET /api/v1/deals/:id
  Response: 200 { "data": DealObject }
  Errors:   404 DEAL_NOT_FOUND

POST /api/v1/deals
  Request:  CreateDealSchema (validated via zod — see 5.7)
  Response: 201 { "data": DealObject }
  Errors:   400 VALIDATION_ERROR, 409 DEAL_ALREADY_EXISTS

PUT /api/v1/deals/:id
  Request:  UpdateDealSchema (partial update)
  Response: 200 { "data": DealObject }
  Errors:   400 VALIDATION_ERROR, 404 DEAL_NOT_FOUND,
            409 STAGE_GUARDRAIL  (F12 — see below),
            422 LOSS_ARCHETYPE_REQUIRED (F10 — Closed-Lost needs loss_archetype_id)
  Side Effect: Writes to deal_audit_log for each changed field
  (F12) When sales_stage_id changes, the engine runs against the PROSPECTIVE
        state; if a RED built-in pattern would fire (or required fields such as
        a missing close date past Discovery are blank), the request is rejected
        with 409 STAGE_GUARDRAIL listing offending pattern(s) UNLESS the request
        body includes a non-empty override_reason. A successful override writes
        a deal_stage_overrides row AND a deal_audit_log row.
  (F5)  speaker_notes is accepted here and is Commander-private (excluded from
        briefing projection + PDF assembly).

DELETE /api/v1/deals/:id
  Response: 204 No Content
  Errors:   404 DEAL_NOT_FOUND
  Notes:    (F14) Now a SOFT delete — sets deleted_at = NOW(); the row becomes
            invisible to default queries but recoverable via POST /restore.

POST /api/v1/deals/:id/restore                              (F14)
  Request:  { }   (restores from archived OR deleted state)
  Response: 200 { "data": DealObject }   (clears deleted_at / archived_at)
  Errors:   404 DEAL_NOT_FOUND, 409 DEAL_NOT_REMOVED (row was already active)

POST /api/v1/deals/:id/archive                              (F14)
  Response: 200 { "data": DealObject }   (sets archived_at = NOW())
```

### 5.4 Technical Gate Endpoints

```
GET /api/v1/deals/:dealId/gates
  Response: 200 { "data": [ GateObject, ... ] }

PUT /api/v1/deals/:dealId/gates/:gateCode
  Request:  { "is_completed": boolean, "notes"?: string }
  Response: 200 { "data": GateObject, "integrityWarnings": [ ... ] }   (F4)
  Side Effects:
    - Sets completed_at = NOW() when is_completed transitions to true
    - Clears completed_at when is_completed transitions to false
    - Writes audit log entry
    - (F4) Returns integrityWarnings[] of type 'out_of_order' | 'regression';
      a regression also writes a deal_audit_log row. Warnings are NON-BLOCKING.
  Errors:   400 VALIDATION_ERROR, 404 GATE_NOT_FOUND

PUT /api/v1/deals/:dealId/gates/batch
  Request:  { "updates": [{ "gate_code": string, "is_completed": boolean, "notes"?: string }, ...] }
  Response: 200 { "data": [ GateObject, ... ], "integrityWarnings": [ ... ] }   (F4)
  Notes:    Used for rapid checkbox toggling with debounced client batching
```

### 5.5 Blocker Endpoints

```
GET /api/v1/deals/:dealId/blockers
  Query:    ?resolved=false
  Response: 200 { "data": [ BlockerObject, ... ] }

POST /api/v1/deals/:dealId/blockers
  Request:  { "category": string, "severity": string, "description": string }
  Response: 201 { "data": BlockerObject }

PUT /api/v1/deals/:dealId/blockers/:blockerId
  Request:  { "is_resolved"?: boolean, "resolution_notes"?: string, "severity"?: string }
  Response: 200 { "data": BlockerObject }
  Side Effect: Sets resolved_at = NOW() when is_resolved transitions to true

DELETE /api/v1/deals/:dealId/blockers/:blockerId
  Response: 204 No Content
```

### 5.6 Cross-Sell Endpoints

```
GET /api/v1/deals/:dealId/cross-sells
  Response: 200 { "data": [ CrossSellObject, ... ] }

PUT /api/v1/deals/:dealId/cross-sells
  Request:  { "product_ids": [ uuid, ... ] }
  Response: 200 { "data": [ CrossSellObject, ... ] }
  Notes:    Replaces entire cross-sell set (idempotent).
            (F13) Whitespace = product_catalog minus pitched products; surfaced
            in the /intelligence payload (no schema change).
```

### 5.7 Intelligence Endpoint

```
GET /api/v1/deals/:dealId/intelligence
  Response: 200 {
    "data": {
      "id": uuid,
      "accountName": string,
      "dealName": string,
      "crmRecordUrl": string | null,
      "team": {
        "accountManager": string,
        "technicalLead": string
      },
      "salesStage": string,
      "stageEnteredAt": ISO-8601,
      "daysInStage": number,
      "financials": {
        "calculatedTCV": number,             // native deal_currency (unchanged)
        "normalizedTCV": number,             // F1 — in reporting currency
        "reportingCurrency": string,         // F1
        "fxRateApplied": number | null,      // F1 — null if MISSING_FX_RATE
        "productRevenue": number,
        "servicesRevenue": number,
        "pricingModel": string,
        "termYears": number,
        "dealCurrency": string,
        "expectedCloseDate": ISO-8601 | null,
        "daysToClose": number | null,
        "winProbability": number | null,
        "servicesTier": string,
        "crossSells": [ { "productId": uuid, "productName": string } ],
        "crossSell": {                       // F13
          "pitchedCount": number,
          "catalogCount": number,
          "attachRate": number,              // pitchedCount / catalogCount
          "whitespace": [ { "productId": uuid, "productName": string } ]
        }
      },
      "technicalTrack": {
        "progressPercentage": number,
        "currentMilestone": string,
        "stepsCompleted": number,
        "totalSteps": number,
        "gates": [ { "gateCode": string, "label": string, "isCompleted": boolean, "completedAt": ISO-8601 | null } ],
        "integrityWarnings": [ { "gateCode": string, "type": "out_of_order"|"regression", "message": string } ]  // F4
      },
      "governance": {
        "healthStatus": "GREEN" | "YELLOW" | "RED",   // computed from UNMANAGED alerts (F3)
        "alerts": [ {
          "code": string,
          "severity": string,
          "message": string,
          "explanation": {                    // F2
            "inputs": [ { "label": string, "value": any } ],
            "thresholdsUsed": [ { "key": string, "value": any, "source": "default"|"tuned" } ],
            "clearsWhen": string
          },
          "disposition": { "state": "acknowledge"|"accept"|"snooze", "rationale": string|null, "snoozeUntilFieldChange": string|null } | null,  // F3
          "intervention": { "checklistId": number, "name": string } | null   // F7 — present when a checklist is keyed to this code
        } ],
        "managedAlerts": [ AlertObject, ... ],        // F3 — dispositioned alerts, shown separately
        "unmanagedAlertCount": number,                // F3
        "activeBlockerCount": number,
        "highSeverityBlockerCount": number,
        "blueprintNotes": string | null,
        "dataQualityNotes": [ { "code": "MISSING_FX_RATE", "message": string } ]  // F1 — non-blocking
      }
    }
  }

GET /api/v1/intelligence/summary
  Response: 200 {
    "data": {
      "totalDealsMonitored": number,                  // excludes archived/deleted (F14)
      "totalTCV": number,                             // F1 — sum of normalizedTCV
      "reportingCurrency": string,                    // F1
      "dealsByHealth": { "GREEN": number, "YELLOW": number, "RED": number },
      "dealsByStage": { "Discovery": number, "Validation": number, ... },
      "criticalAlerts": [ { "dealId": uuid, "dealName": string, "accountName": string, "alert": AlertObject } ],
      "staleDeals": [ { "dealId": uuid, "dealName": string, "daysInStage": number } ],
      "changesSinceLastReview": {                     // F6 — optional rollup
        "dealsWithChanges": number,
        "topMovers": [ { "dealId": uuid, "dealName": string, "changeCount": number } ]
      }
    }
  }

GET /api/v1/intelligence/portfolio-analysis            // F11
  Response: 200 {
    "data": {
      "byAccountManager": [ { "accountManager": string, "dealCount": number,
                              "alertCorrelations": [ { "code": string, "share": number, "lift": number } ],
                              "avgCycleTimeDays": number } ],
      "byTechnicalLead":  [ { "technicalLead": string,  ... } ],
      "byProduct":        [ { "productName": string, "presentInStalledShare": number, ... } ],
      "noTechnicalLeadCycleTimeDays": number | null
    }
  }

GET /api/v1/analytics/autopsy                          // F10
  Query:    ?archetypeId=<int>   (optional filter)
  Response: 200 {
    "data": {
      "byArchetype": [ {
        "archetypeId": number, "archetypeName": string, "lossCount": number,
        "avgGateCompletionPct": number,
        "servicesAttachShare": number,                // share with any services attached
        "patternsThatFired": [ { "code": string, "share": number } ],
        "neverPassedGate2Share": number
      } ]
    }
  }
```

### 5.8 Audit Log Endpoint

```
GET /api/v1/deals/:dealId/audit
  Query:    ?entity_type=gate&field_changed=expected_close_date&since=<ISO>&until=<ISO>
            &limit=50&offset=0
  Response: 200 {
    "data": [ AuditLogObject, ... ],
    "meta": { "total": number, "limit": number, "offset": number }
  }
  Notes:    (F3) Dispositions, (F12) overrides, and (F4) gate regressions all
            write here, so this endpoint is the single visible home consumed by
            the AuditTrailViewer (F3). New optional field/date filters added.

-- F6: Change Digest + Deal Replay (read-only over deal_audit_log) ---
GET /api/v1/deals/:dealId/changes?since=<ISO>          // F6
  Response: 200 { "data": [ { "line": string, "field": string, "at": ISO-8601 } ] }
  Notes:    Default `since` = this deal's deal_review_markers.last_reviewed_at.
            Projects audit rows into human-readable change lines, reverse-chron.

POST /api/v1/deals/:dealId/review-marker               // F6
  Response: 200 { "data": { "lastReviewedAt": ISO-8601, "reviewedBy": string } }
  Side Effect: Upserts deal_review_markers; stamps last_reviewed_at = NOW().

GET /api/v1/deals/:dealId/snapshot?date=YYYY-MM-DD      // F6 (Deal Replay)
  Response: 200 { "data": { "asOf": "YYYY-MM-DD", "deal": {...}, "gates": [...],
                            "financials": {...}, "salesStage": string,
                            "reconstructed": true } }
  Notes:    Reconstructs deal state at `date` by reverse-applying deal_audit_log
            deltas to CURRENT state. Pure read-time; NO stored snapshot table.
```

### 5.9 Lookup Data Endpoints

```
GET /api/v1/lookups/pipeline-stages
GET /api/v1/lookups/pricing-models
GET /api/v1/lookups/services-tiers
GET /api/v1/lookups/product-catalog
GET /api/v1/lookups/gate-definitions          // (F4) now includes prerequisite_gate_codes
GET /api/v1/lookups/blocker-categories
GET /api/v1/lookups/blocker-severities
GET /api/v1/lookups/loss-archetypes           // F10
GET /api/v1/lookups/intervention-checklists   // F7
GET /api/v1/lookups/engine-thresholds
PUT /api/v1/lookups/engine-thresholds
  Request:  { "updates": [{ "parameter_key": string, "parameter_value": string }, ...] }
  Notes:    Allows the Commander to tune intelligence engine thresholds without
            code deployment. Invalidates the in-memory threshold cache.

GET /api/v1/lookups/fx-rates                  // F1
  Response: 200 { "data": [ { "baseCurrency": string, "quoteCurrency": string, "rate": number, "asOf": "YYYY-MM-DD" } ] }
PUT /api/v1/lookups/fx-rates                  // F1
  Request:  { "updates": [{ "base_currency": string, "quote_currency": string, "rate": number, "as_of": "YYYY-MM-DD" }, ...] }
  Notes:    Upserts on (base_currency, quote_currency, as_of); invalidates the
            threshold cache via the existing invalidateThresholdCache() path so
            normalizedTCV recomputes on the next read.
```

### 5.9A Disposition, Intervention & Bat-Signal Endpoints

```
-- F3: Risk advisory governance --------------------------------------
PUT /api/v1/deals/:dealId/alerts/:patternCode/disposition
  Request:  { "disposition": "acknowledge"|"accept"|"snooze",
              "rationale"?: string,                    // REQUIRED for 'accept' (zod-enforced)
              "snooze_until_field_change"?: string }   // REQUIRED for 'snooze' (e.g. 'G3_PERFORMANCE_PASSED')
  Response: 200 { "data": DispositionObject }
  Errors:   400 VALIDATION_ERROR (accept without rationale; snooze without field)
  Side Effect: Upserts deal_alert_dispositions; writes deal_audit_log
               (entity_type 'alert_disposition').

DELETE /api/v1/deals/:dealId/alerts/:patternCode/disposition
  Response: 204 No Content   (re-activates the alert; writes audit row)

-- F7: Interventions (log only) -------------------------------------
POST /api/v1/deals/:dealId/interventions
  Request:  { "pattern_code": string, "checklist_id": number }
  Response: 201 { "data": InterventionObject }
  Notes:    LOG ONLY — records that an intervention was launched. NO step
            lifecycle, NO assignment, NO next-best-action.

-- F7: Bat-Signal (48h read-only share) -----------------------------
POST /api/v1/deals/:dealId/bat-signal
  Response: 201 { "data": { "shareUrl": string, "expiresAt": ISO-8601 } }
  Notes:    Mints a short-lived (48h) RS256 JWT with a DISTINCT audience/claims
            from the session JWT (aud:'edc-batsignal', scope:'risk-card:read',
            dealId bound). Returns a public URL the Commander copies manually.

GET /api/v1/share/:token                       // PUBLIC route — no session auth
  Response: 200 (renders ONLY the single deal's Briefing risk card; read-only)
  Errors:   401 BATSIGNAL_EXPIRED, 403 BATSIGNAL_INVALID
  Notes:    Verifies the Bat-Signal token only (never the session cookie).
            Enforces single-deal, read-only, expiring access. No cockpit, no
            other deals, no mutation routes reachable from this token.
```

### 5.10 Shared Validation Schema (zod — used by both frontend and backend)

```typescript
// shared/validation/dealSchemas.ts

import { z } from 'zod';

export const CreateDealSchema = z.object({
    deal_name: z.string().min(1).max(255),
    account_name: z.string().min(1).max(255),
    crm_record_url: z.string().url().nullable().optional(),
    account_manager: z.string().min(1).max(255),
    technical_lead: z.string().min(1).max(255),
    sales_stage_id: z.number().int().positive(),
    product_revenue: z.number().min(0),
    pricing_model_id: z.number().int().positive(),
    contract_term_years: z.number().int().min(1).max(10),
    deal_currency: z.string().length(3).default('USD'),
    expected_close_date: z.string().datetime().nullable().optional(),
    win_probability_pct: z.number().int().min(0).max(100).nullable().optional(),
    services_revenue: z.number().min(0),
    services_tier_id: z.number().int().positive(),
    manager_strategic_blueprint: z.string().nullable().optional(),
    speaker_notes: z.string().max(4000).nullable().optional(),        // F5
    loss_archetype_id: z.number().int().positive().nullable().optional(), // F10
});

// F12: a stage change to a RED-guarded stage requires an override_reason.
// F10: a change to Closed-Lost requires loss_archetype_id (refined in handler
//      against the resolved stage name).
export const UpdateDealSchema = CreateDealSchema.partial().extend({
    override_reason: z.string().min(10).max(1000).optional(),         // F12
});

export const CreateBlockerSchema = z.object({
    category_id: z.number().int().positive(),
    severity_id: z.number().int().positive(),
    description: z.string().min(6).max(2000),
});

export const UpdateBlockerSchema = z.object({
    is_resolved: z.boolean().optional(),
    resolution_notes: z.string().max(2000).optional(),
    severity_id: z.number().int().positive().optional(),
});

export const GateUpdateSchema = z.object({
    is_completed: z.boolean(),
    notes: z.string().max(1000).optional(),
});

export const BatchGateUpdateSchema = z.object({
    updates: z.array(z.object({
        gate_code: z.string(),
        is_completed: z.boolean(),
        notes: z.string().max(1000).optional(),
    })).min(1).max(9),
});

// ── F3: Disposition schemas (discriminated by disposition) ──────────
export const DispositionSchema = z.discriminatedUnion('disposition', [
    z.object({ disposition: z.literal('acknowledge') }),
    z.object({ disposition: z.literal('accept'),
               rationale: z.string().min(10).max(2000) }),           // REQUIRED
    z.object({ disposition: z.literal('snooze'),
               snooze_until_field_change: z.string().min(1).max(100) }), // state-based
]);

// ── F1: FX rate updates ─────────────────────────────────────────────
export const FxRatesUpdateSchema = z.object({
    updates: z.array(z.object({
        base_currency: z.string().length(3),
        quote_currency: z.string().length(3),
        rate: z.number().positive(),
        as_of: z.string(),  // YYYY-MM-DD
    })).min(1),
});

// ── F7: Intervention launch ─────────────────────────────────────────
export const LaunchInterventionSchema = z.object({
    pattern_code: z.string().min(1).max(50),
    checklist_id: z.number().int().positive(),
});
```

---

## 6. Analytical Intelligence & Pattern Engine

### 6.1 Architecture

The Intelligence Engine is a **composable rule evaluation system**. Each risk pattern is defined as an independent rule object with an evaluation function, a severity classification, a priority weight, and a message formatter. The engine evaluates all rules against a deal and returns the full set of triggered alerts, sorted by severity and weight.

This design ensures:
- **Multiple alerts can fire simultaneously** (compound risk visibility)
- **New patterns are added by appending to an array** (no refactoring existing logic)
- **Each pattern is independently testable** (unit tests per pattern)
- **Thresholds are externally configurable** (via the `engine_thresholds` table)

> **Phase 1 enhancement notes (per §1A).** Each built-in pattern now also exposes an **`explain()`** method (F2). Two new built-in patterns are appended to `riskPatterns[]`: **`SLOW_MOTION_COLLISION`** (F8, self-referential momentum) and **`LOW_ATTACH_ELEPHANT`** (F13, cross-sell whitespace). All threshold comparisons operate on **`normalizedTCV`** (F1). `processDealIntelligence` is refactored into a **pure function** (F9) so the identical logic runs server-side and client-side (the Risk Simulator). Per charter C2, Phase 1 ships a **fixed, engineer-defined** array — there is **no** runtime rule-authoring UI (that is Phase 2 §12).

### 6.2 Complete Engine Implementation

```javascript
// services/dealIntelligenceEngine.js

const { Pool } = require('pg');
const pool = new Pool({ connectionString: process.env.DATABASE_URL });

/**
 * Fetches configurable thresholds from the database.
 * Cached for 60 seconds to avoid per-request queries.
 */
let thresholdCache = null;
let thresholdCacheExpiry = 0;

async function getThresholds() {
    if (thresholdCache && Date.now() < thresholdCacheExpiry) {
        return thresholdCache;
    }

    const result = await pool.query(
        'SELECT parameter_key, parameter_value, data_type FROM edc.engine_thresholds'
    );

    thresholdCache = {};
    for (const row of result.rows) {
        thresholdCache[row.parameter_key] = row.data_type === 'number'
            ? parseFloat(row.parameter_value)
            : row.parameter_value;
    }
    thresholdCacheExpiry = Date.now() + 60000;
    return thresholdCache;
}

/**
 * Invalidates the threshold cache when thresholds are updated.
 * (F1) Also invoked by PUT /lookups/fx-rates so normalizedTCV recomputes.
 */
function invalidateThresholdCache() {
    thresholdCache = null;
    thresholdCacheExpiry = 0;
}

// ──────────────────────────────────────────────────────────
// RISK PATTERN DEFINITIONS
// ──────────────────────────────────────────────────────────

const riskPatterns = [
    // ── PATTERN ALPHA: Premature Commercial Push ──────────
    {
        code: 'PREMATURE_COMMERCIAL',
        severity: 'RED',
        weight: 100,
        evaluate: (deal, blockers, thresholds, context) => {
            const commercialStages = ['Commercial', 'Procurement'];
            return commercialStages.includes(deal.salesStage)
                && !deal.gateMap['G3_PERFORMANCE_PASSED'];
        },
        formatMessage: (deal, thresholds) =>
            `PREMATURE COMMERCIAL DISCONNECT: Sales line has moved to ${deal.salesStage} ` +
            `stage before completing Gate 3 (Scalability/Performance validation). ` +
            `High risk of deep margin discounts or late-stage technical disqualification.`,
        // F2 — glass-box explanation
        explain: (deal, thresholds) => ({
            inputs: [
                { label: 'Sales Stage', value: deal.salesStage },
                { label: 'Gate 3 (Performance) passed', value: !!deal.gateMap['G3_PERFORMANCE_PASSED'] }
            ],
            thresholdsUsed: [],
            clearsWhen: 'Complete Gate 3 (Load/Performance Stress Passed), or move the deal back out of Commercial/Procurement.'
        })
    },

    // ── PATTERN BETA: Unprotected Elephant ────────────────
    {
        code: 'UNPROTECTED_ELEPHANT',
        severity: 'YELLOW',
        weight: 70,
        evaluate: (deal, blockers, thresholds) => {
            // F1 — threshold comparison uses normalizedTCV
            return deal.normalizedTCV >= thresholds.elephant_tcv_threshold
                && deal.servicesTier === 'None';
        },
        formatMessage: (deal, thresholds) =>
            `UNPROTECTED ELEPHANT RUN: Deal TCV (${deal.reportingCurrency} ${deal.normalizedTCV.toLocaleString()}) ` +
            `exceeds ${thresholds.elephant_tcv_threshold.toLocaleString()} but lacks an attached ` +
            `Professional Services SOW or Premium Support infrastructure. High risk of post-sale ` +
            `implementation friction and deployment failure.`,
        explain: (deal, thresholds, _blockers, provenance) => ({
            inputs: [
                { label: 'Normalized TCV', value: deal.normalizedTCV },
                { label: 'Services Tier', value: deal.servicesTier }
            ],
            thresholdsUsed: [
                { key: 'elephant_tcv_threshold', value: thresholds.elephant_tcv_threshold,
                  source: provenance('elephant_tcv_threshold') }
            ],
            clearsWhen: 'Attach a Professional Services SOW or Premium Support tier, or the normalized TCV falls below the elephant threshold.'
        })
    },

    // ── PATTERN GAMMA: Missing Structural Anchor ──────────
    {
        code: 'MISSING_STRUCTURAL_ANCHOR',
        severity: 'RED',
        weight: 90,
        evaluate: (deal, blockers, thresholds) => {
            return deal.salesStage !== 'Discovery'
                && !deal.gateMap['G1_CRITERIA_LOCKED'];
        },
        formatMessage: () =>
            `MISSING STRUCTURAL ANCHOR: Deal has transitioned past initial Discovery but ` +
            `minimum technical success criteria remain unverified and unlocked. The ` +
            `evaluation is running on assumptions.`,
        explain: (deal) => ({
            inputs: [
                { label: 'Sales Stage', value: deal.salesStage },
                { label: 'Gate 1 Criteria Locked', value: !!deal.gateMap['G1_CRITERIA_LOCKED'] }
            ],
            thresholdsUsed: [],
            clearsWhen: 'Complete Gate 1 (Minimum Viable Requirements Locked).'
        })
    },

    // ── PATTERN DELTA: Phantom Champion ───────────────────
    {
        code: 'PHANTOM_CHAMPION',
        severity: 'YELLOW',
        weight: 60,
        evaluate: (deal, blockers, thresholds) => {
            return deal.salesStage !== 'Discovery'
                && !deal.gateMap['G1_EXECUTIVE_AGREED']
                && deal.daysSinceCreation > thresholds.phantom_champion_days;
        },
        formatMessage: (deal, thresholds) =>
            `PHANTOM CHAMPION: Deal has been active for ${deal.daysSinceCreation} days ` +
            `without executive alignment on evaluation criteria. The current point of contact ` +
            `may lack decision-making authority. Risk of silent deal death.`,
        explain: (deal, thresholds, _b, provenance) => ({
            inputs: [
                { label: 'Days Since Creation', value: deal.daysSinceCreation },
                { label: 'Gate 1 Executive Agreed', value: !!deal.gateMap['G1_EXECUTIVE_AGREED'] }
            ],
            thresholdsUsed: [
                { key: 'phantom_champion_days', value: thresholds.phantom_champion_days,
                  source: provenance('phantom_champion_days') }
            ],
            clearsWhen: 'Complete Gate 1 Executive Champion Agreement, or confirm the executive sponsor.'
        })
    },

    // ── PATTERN EPSILON: Ghost Pipeline ───────────────────
    {
        code: 'GHOST_PIPELINE',
        severity: 'YELLOW',
        weight: 50,
        evaluate: (deal, blockers, thresholds) => {
            const hasNotes = deal.blueprintNotes && deal.blueprintNotes.trim().length >= 20;
            return blockers.active.length === 0
                && !hasNotes
                && deal.daysSinceLastUpdate > thresholds.ghost_pipeline_days;
        },
        formatMessage: (deal, thresholds) =>
            `GHOST PIPELINE: No blockers logged, no strategic notes, and no updates in ` +
            `${deal.daysSinceLastUpdate} days. This deal may be running on autopilot ` +
            `without active oversight.`,
        explain: (deal, thresholds, blockers, provenance) => ({
            inputs: [
                { label: 'Active Blockers', value: blockers.active.length },
                { label: 'Has Strategic Notes', value: !!(deal.blueprintNotes && deal.blueprintNotes.trim().length >= 20) },
                { label: 'Days Since Last Update', value: deal.daysSinceLastUpdate }
            ],
            thresholdsUsed: [
                { key: 'ghost_pipeline_days', value: thresholds.ghost_pipeline_days,
                  source: provenance('ghost_pipeline_days') }
            ],
            clearsWhen: 'Log a blocker, add strategic notes, or make any deal update to refresh activity.'
        })
    },

    // ── PATTERN ZETA: Discount Trap ───────────────────────
    {
        code: 'DISCOUNT_TRAP',
        severity: 'RED',
        weight: 85,
        evaluate: (deal, blockers, thresholds) => {
            // F1 — threshold comparison uses normalizedTCV
            return deal.normalizedTCV >= thresholds.mega_deal_tcv_threshold
                && deal.servicesRevenue === 0
                && deal.servicesTier === 'None'
                && deal.salesStage === 'Commercial';
        },
        formatMessage: (deal) =>
            `DISCOUNT TRAP: Mega-deal (${deal.reportingCurrency} ${deal.normalizedTCV.toLocaleString()}) in Commercial ` +
            `stage with zero services attachment. Likely indicates aggressive pricing cuts to ` +
            `hit a number. Post-sale implementation risk is extreme — customer will underdeploy ` +
            `and churn within 18 months.`,
        explain: (deal, thresholds, _b, provenance) => ({
            inputs: [
                { label: 'Normalized TCV', value: deal.normalizedTCV },
                { label: 'Services Revenue', value: deal.servicesRevenue },
                { label: 'Services Tier', value: deal.servicesTier },
                { label: 'Sales Stage', value: deal.salesStage }
            ],
            thresholdsUsed: [
                { key: 'mega_deal_tcv_threshold', value: thresholds.mega_deal_tcv_threshold,
                  source: provenance('mega_deal_tcv_threshold') }
            ],
            clearsWhen: 'Attach services revenue/tier, or the normalized TCV falls below the mega-deal threshold, or move out of Commercial.'
        })
    },

    // ── PATTERN ETA: Stalled Gate Progression ─────────────
    {
        code: 'STALLED_VALIDATION',
        severity: 'YELLOW',
        weight: 55,
        evaluate: (deal, blockers, thresholds) => {
            return deal.daysInStage > thresholds.stale_stage_days
                && deal.technicalProgressPct < 100;
        },
        formatMessage: (deal, thresholds) =>
            `STALLED VALIDATION: Technical validation has not reached completion in ` +
            `${deal.daysInStage} days while in ${deal.salesStage} stage ` +
            `(${deal.technicalProgressPct}% gates complete). Recommend a forced ` +
            `escalation review.`,
        explain: (deal, thresholds, _b, provenance) => ({
            inputs: [
                { label: 'Days In Stage', value: deal.daysInStage },
                { label: 'Technical Progress %', value: deal.technicalProgressPct }
            ],
            thresholdsUsed: [
                { key: 'stale_stage_days', value: thresholds.stale_stage_days,
                  source: provenance('stale_stage_days') }
            ],
            clearsWhen: 'Advance gate completion to 100%, or progress the deal to the next stage.'
        })
    },

    // ── PATTERN THETA: Close Date Pressure ────────────────
    {
        code: 'CLOSE_DATE_PRESSURE',
        severity: 'YELLOW',
        weight: 65,
        evaluate: (deal, blockers, thresholds) => {
            if (!deal.daysToClose || deal.daysToClose === null) return false;
            return deal.daysToClose <= thresholds.close_date_warning_days
                && deal.technicalProgressPct < thresholds.gate_completion_warn_pct;
        },
        formatMessage: (deal, thresholds) =>
            `CLOSE DATE PRESSURE: Expected close date is ${deal.daysToClose} days away ` +
            `but only ${deal.technicalProgressPct}% of technical gates are complete ` +
            `(expected: ≥${thresholds.gate_completion_warn_pct}%). High risk of close ` +
            `date slip or premature forced closure.`,
        explain: (deal, thresholds, _b, provenance) => ({
            inputs: [
                { label: 'Days To Close', value: deal.daysToClose },
                { label: 'Technical Progress %', value: deal.technicalProgressPct }
            ],
            thresholdsUsed: [
                { key: 'close_date_warning_days', value: thresholds.close_date_warning_days,
                  source: provenance('close_date_warning_days') },
                { key: 'gate_completion_warn_pct', value: thresholds.gate_completion_warn_pct,
                  source: provenance('gate_completion_warn_pct') }
            ],
            clearsWhen: 'Raise gate completion above the warning percentage, or extend the expected close date.'
        })
    },

    // ── PATTERN IOTA: Unresolved Critical Blockers ────────
    {
        code: 'UNRESOLVED_CRITICAL_BLOCKERS',
        severity: 'YELLOW',
        weight: 40,
        evaluate: (deal, blockers) => {
            return blockers.highSeverityCount > 0;
        },
        formatMessage: (deal, blockers) =>
            `UNRESOLVED CRITICAL BLOCKERS: ${blockers.highSeverityCount} high-severity ` +
            `blocker(s) remain unresolved. Executive review recommended to clear path.`,
        explain: (deal, thresholds, blockers) => ({
            inputs: [
                { label: 'High-Severity Blockers', value: blockers.highSeverityCount }
            ],
            thresholdsUsed: [],
            clearsWhen: 'Resolve all high-severity blockers on the deal.'
        })
    },

    // ── PATTERN KAPPA: No Close Date Set ──────────────────
    {
        code: 'NO_CLOSE_DATE',
        severity: 'YELLOW',
        weight: 30,
        evaluate: (deal) => {
            return deal.salesStage !== 'Discovery'
                && deal.salesStage !== 'Closed-Won'
                && deal.salesStage !== 'Closed-Lost'
                && !deal.expectedCloseDate;
        },
        formatMessage: () =>
            `NO CLOSE DATE SET: Deal has advanced past Discovery without an expected ` +
            `close date. Without a target date, pipeline forecasting is unreliable.`,
        explain: (deal) => ({
            inputs: [
                { label: 'Sales Stage', value: deal.salesStage },
                { label: 'Expected Close Date', value: deal.expectedCloseDate || '(none)' }
            ],
            thresholdsUsed: [],
            clearsWhen: 'Set an expected close date on the deal.'
        })
    },

    // ── PATTERN LAMBDA: Slow-Motion Collision ─────────────  (F8)
    // Self-referential momentum: the deal's OWN gate-completion rate is
    // decelerating while its close date is near and gates remain incomplete.
    // NO cohort/portfolio benchmark (per charter C9).
    {
        code: 'SLOW_MOTION_COLLISION',
        severity: 'YELLOW',   // escalates to RED in formatMessage context when very close
        weight: 75,
        evaluate: (deal, blockers, thresholds, context) => {
            const m = (context && context.ownMomentum) || null;
            if (!m) return false;
            if (deal.daysToClose == null) return false;
            const decelerating = m.dropPct >= thresholds.momentum_drop_pct;
            const nearClose = deal.daysToClose <= thresholds.close_date_warning_days;
            const underGated = deal.technicalProgressPct < thresholds.momentum_min_gate_pct;
            return decelerating && nearClose && underGated;
        },
        // Severity is promoted to RED for very near close dates via the engine's
        // severity-promotion hook (see processDealIntelligence).
        formatMessage: (deal, thresholds, _b, context) => {
            const m = (context && context.ownMomentum) || {};
            return `SLOW-MOTION COLLISION: This deal's own gate-completion velocity has ` +
            `dropped ~${Math.round(m.dropPct)}% (recent vs earlier window) while the close ` +
            `date is ${deal.daysToClose} days away and only ${deal.technicalProgressPct}% of ` +
            `gates are complete. On its current self-trajectory it will not finish validation in time.`;
        },
        explain: (deal, thresholds, _b, contextOrProvenance) => {
            // engine passes ownMomentum context; provenance resolved separately
            return {
                inputs: [
                    { label: 'Own Velocity Drop %', value: 'see ownMomentum' },
                    { label: 'Days To Close', value: deal.daysToClose },
                    { label: 'Technical Progress %', value: deal.technicalProgressPct }
                ],
                thresholdsUsed: [
                    { key: 'momentum_drop_pct', value: thresholds.momentum_drop_pct, source: 'default' },
                    { key: 'momentum_window_days', value: thresholds.momentum_window_days, source: 'default' },
                    { key: 'momentum_min_gate_pct', value: thresholds.momentum_min_gate_pct, source: 'default' }
                ],
                clearsWhen: 'Re-accelerate gate completion (close gates this week), or extend the close date to match the deal\'s own pace.'
            };
        }
    },

    // ── PATTERN MU: Low-Attach Elephant ───────────────────  (F13)
    // Large normalized TCV with a low cross-sell attach rate.
    {
        code: 'LOW_ATTACH_ELEPHANT',
        severity: 'YELLOW',
        weight: 45,
        evaluate: (deal, blockers, thresholds) => {
            if (deal.normalizedTCV < thresholds.elephant_tcv_threshold) return false;
            if (deal.attachRate == null) return false;
            return deal.attachRate <= thresholds.low_attach_rate_threshold;
        },
        formatMessage: (deal, thresholds) =>
            `LOW-ATTACH ELEPHANT: A large deal (${deal.reportingCurrency} ${deal.normalizedTCV.toLocaleString()}) ` +
            `has a cross-sell attach rate of only ${Math.round(deal.attachRate * 100)}% ` +
            `(≤ ${Math.round(thresholds.low_attach_rate_threshold * 100)}%). Significant whitespace ` +
            `is being left on the table on a strategic account.`,
        explain: (deal, thresholds, _b, provenance) => ({
            inputs: [
                { label: 'Normalized TCV', value: deal.normalizedTCV },
                { label: 'Attach Rate', value: deal.attachRate }
            ],
            thresholdsUsed: [
                { key: 'elephant_tcv_threshold', value: thresholds.elephant_tcv_threshold,
                  source: provenance('elephant_tcv_threshold') },
                { key: 'low_attach_rate_threshold', value: thresholds.low_attach_rate_threshold,
                  source: provenance('low_attach_rate_threshold') }
            ],
            clearsWhen: 'Pitch additional catalog products to raise the attach rate above the threshold.'
        })
    }
];

// ──────────────────────────────────────────────────────────
// F8 HELPER — self-referential momentum from the deal's OWN history
// ──────────────────────────────────────────────────────────
/**
 * Computes the deal's own recent gate-completion rate vs its earlier rate
 * from its OWN audit rows (and gate completed_at timestamps). NO cohort data.
 *
 * @param {Object} deal - deal context (needs created_at, thresholds via caller)
 * @param {Array} auditRows - this deal's deal_audit_log rows (gate completions, stage changes)
 * @param {Object} thresholds - engine thresholds (momentum_window_days, ...)
 * @returns {{ recentRate:number, earlierRate:number, dropPct:number }}
 */
function calculateOwnMomentum(deal, auditRows, thresholds) {
    const windowDays = thresholds.momentum_window_days || 30;
    const now = Date.now();
    const windowStart = now - windowDays * 86400000;

    // Gate-completion events derived from this deal's own audit rows.
    const completions = (auditRows || [])
        .filter(r => r.entity_type === 'gate'
            && r.field_changed === 'is_completed'
            && (r.new_value === 'true' || r.new_value === true))
        .map(r => new Date(r.changed_at).getTime());

    const recentCount  = completions.filter(t => t >= windowStart).length;
    const earlierCount = completions.filter(t => t <  windowStart).length;

    // Rate = completions per window-length. Earlier window may span multiple
    // windows; normalize by elapsed earlier span (in window units, min 1).
    const earlierSpanDays = Math.max(
        windowDays,
        (windowStart - new Date(deal.created_at).getTime()) / 86400000
    );
    const earlierRate = earlierCount / Math.max(1, earlierSpanDays / windowDays);
    const recentRate  = recentCount; // completions within the most recent window

    const dropPct = earlierRate > 0
        ? Math.max(0, (1 - (recentRate / earlierRate)) * 100)
        : 0;

    return { recentRate, earlierRate, dropPct };
}

// ──────────────────────────────────────────────────────────
// CORE PROCESSING FUNCTION
// ──────────────────────────────────────────────────────────

/**
 * Processes a raw deal record through the full intelligence pipeline.
 *
 * (F9) This function is PURE: it performs NO database calls. All external data
 *      (thresholds, fx rate, catalog size, own-momentum context, dispositions)
 *      is passed in via arguments. The identical function runs on the server
 *      and in the browser (the Risk Simulator) with no code divergence.
 *
 * @param {Object} deal - Raw deal row (joined with lookup tables)
 * @param {Array}  gates - Gate completion rows for this deal
 * @param {Array}  activeBlockers - Unresolved blocker rows for this deal
 * @param {Object} thresholds - Parameter thresholds from engine_thresholds table
 * @param {Object} [ctx] - { fxRate, reportingCurrency, catalogCount, ownMomentum,
 *                            dispositions[], thresholdProvenance(fn) }  (F1/F3/F8/F13)
 * @returns {Object} Processed intelligence output
 */
function processDealIntelligence(deal, gates, activeBlockers, thresholds, ctx = {}) {
    // ── Financial Calculations ──────────────────────────
    const baseProductRevenue = parseFloat(deal.product_revenue || 0);
    const termYears = parseInt(deal.contract_term_years || 1);
    const attachedServicesRevenue = parseFloat(deal.services_revenue || 0);

    let calculatedTCV;
    if (deal.pricing_model === 'Multi-Year Committed') {
        calculatedTCV = (baseProductRevenue * termYears) + attachedServicesRevenue;
    } else {
        calculatedTCV = baseProductRevenue + attachedServicesRevenue;
    }

    // ── F1: Currency normalization ──────────────────────
    const reportingCurrency = ctx.reportingCurrency || thresholds.reporting_currency || 'USD';
    const fxRate = (deal.deal_currency === reportingCurrency)
        ? 1
        : (ctx.fxRate != null ? ctx.fxRate : null);
    const dataQualityNotes = [];
    let normalizedTCV;
    if (fxRate == null) {
        normalizedTCV = calculatedTCV; // fall back to native value
        dataQualityNotes.push({
            code: 'MISSING_FX_RATE',
            message: `No FX rate found for ${deal.deal_currency} → ${reportingCurrency}; showing native value.`
        });
    } else {
        normalizedTCV = calculatedTCV * fxRate;
    }

    // ── Gate Progression ────────────────────────────────
    const gateMap = {};
    for (const gate of gates) {
        gateMap[gate.gate_code] = gate.is_completed;
    }

    const stepsCompleted = gates.filter(g => g.is_completed).length;
    const totalSteps = gates.length;
    const technicalProgressPct = totalSteps > 0
        ? Math.round((stepsCompleted / totalSteps) * 100)
        : 0;

    // Milestone: advance only when ALL gates in a group are complete
    const gateGroups = {};
    for (const gate of gates) {
        const group = gate.gate_group;
        if (!gateGroups[group]) gateGroups[group] = [];
        gateGroups[group].push(gate);
    }

    let highestCompletedGroup = 0;
    for (const [group, groupGates] of Object.entries(gateGroups)) {
        if (groupGates.every(g => g.is_completed)) {
            highestCompletedGroup = Math.max(highestCompletedGroup, parseInt(group));
        }
    }

    const milestoneLabels = {
        0: 'Gate 1: Success Criteria Pending',
        1: 'Gate 1: Success Criteria Frozen',
        2: 'Gate 2: Core MVP Validated',
        3: 'Gate 3: Scalability Confirmed',
        4: 'Gate 4: InfoSec Cleared',
        5: 'Gate 5: Technical Win Signed'
    };
    const currentMilestone = milestoneLabels[highestCompletedGroup] || milestoneLabels[0];

    // ── F4: Gate integrity warnings (data-driven prerequisites) ──
    const integrityWarnings = [];
    for (const gate of gates) {
        if (gate.is_completed && Array.isArray(gate.prerequisite_gate_codes)) {
            for (const prereq of gate.prerequisite_gate_codes) {
                if (!gateMap[prereq]) {
                    integrityWarnings.push({
                        gateCode: gate.gate_code, type: 'out_of_order',
                        message: `${gate.gate_code} is complete but prerequisite ${prereq} is not.`
                    });
                }
            }
        }
    }
    // (regression warnings are produced at write-time in the gate handler and
    //  surfaced via the same array on the PUT response.)

    // ── Temporal Calculations ───────────────────────────
    const now = new Date();
    const createdAt = new Date(deal.created_at);
    const updatedAt = new Date(deal.updated_at);
    const stageEnteredAt = new Date(deal.stage_entered_at);

    const daysSinceCreation = Math.floor((now - createdAt) / (1000 * 60 * 60 * 24));
    const daysSinceLastUpdate = Math.floor((now - updatedAt) / (1000 * 60 * 60 * 24));
    const daysInStage = Math.floor((now - stageEnteredAt) / (1000 * 60 * 60 * 24));

    let daysToClose = null;
    if (deal.expected_close_date) {
        daysToClose = Math.floor((new Date(deal.expected_close_date) - now) / (1000 * 60 * 60 * 24));
        if (daysToClose < 0) daysToClose = 0;
    }

    // ── F13: cross-sell whitespace + attach rate ────────
    const pitchedCount = (deal.cross_sells || []).length;
    const catalogCount = ctx.catalogCount || 0;
    const attachRate = catalogCount > 0 ? (pitchedCount / catalogCount) : null;

    // ── Blocker Analysis ────────────────────────────────
    const highSeverityBlockers = activeBlockers.filter(b => b.severity_name === 'High');
    const blockersContext = {
        active: activeBlockers,
        highSeverityCount: highSeverityBlockers.length
    };

    // ── Build Evaluation Context ────────────────────────
    const dealContext = {
        salesStage: deal.sales_stage,
        calculatedTCV,
        normalizedTCV,                 // F1
        reportingCurrency,             // F1
        servicesRevenue: attachedServicesRevenue,
        servicesTier: deal.services_tier,
        pricingModel: deal.pricing_model,
        termYears,
        expectedCloseDate: deal.expected_close_date,
        blueprintNotes: deal.manager_strategic_blueprint,
        daysSinceCreation,
        daysSinceLastUpdate,
        daysInStage,
        daysToClose,
        technicalProgressPct,
        attachRate,                    // F13
        gateMap
    };

    // Provenance helper (F2): default vs tuned, by comparing to seeded constants
    const SEEDED = ctx.seededDefaults || {};
    const provenance = (key) =>
        (SEEDED[key] !== undefined && String(SEEDED[key]) !== String(thresholds[key]))
            ? 'tuned' : 'default';

    const evalContext = { ownMomentum: ctx.ownMomentum || null };  // F8

    // ── Run Pattern Evaluation ──────────────────────────
    let triggered = riskPatterns
        .filter(pattern => pattern.evaluate(dealContext, blockersContext, thresholds, evalContext))
        .map(pattern => {
            // F8 severity promotion: SLOW_MOTION_COLLISION → RED when very near close
            let severity = pattern.severity;
            if (pattern.code === 'SLOW_MOTION_COLLISION'
                && dealContext.daysToClose != null
                && dealContext.daysToClose <= Math.round(thresholds.close_date_warning_days / 2)) {
                severity = 'RED';
            }
            return { pattern, severity };
        })
        .sort((a, b) => {
            const severityOrder = { RED: 0, YELLOW: 1, GREEN: 2 };
            const severityDiff = severityOrder[a.severity] - severityOrder[b.severity];
            if (severityDiff !== 0) return severityDiff;
            return b.pattern.weight - a.pattern.weight;
        });

    // ── F3: apply dispositions (managed vs unmanaged) ───
    const dispositions = ctx.dispositions || [];
    const dispMap = {};
    for (const d of dispositions) dispMap[d.pattern_code] = d;

    const buildAlert = ({ pattern, severity }) => {
        const disp = dispMap[pattern.code] || null;
        return {
            code: pattern.code,
            severity,
            message: pattern.formatMessage(dealContext, thresholds, blockersContext, evalContext),
            explanation: pattern.explain
                ? pattern.explain(dealContext, thresholds, blockersContext, provenance)
                : null,
            disposition: disp ? {
                state: disp.disposition,
                rationale: disp.rationale || null,
                snoozeUntilFieldChange: disp.snooze_until_field_change || null
            } : null
        };
    };

    const allAlerts = triggered.map(buildAlert);
    // A disposition is ACTIVE (managed) for acknowledge/accept; a state-based
    // snooze stays managed until the named field changes (the engine simply
    // honors the stored snooze; clearing happens when the field-change handler
    // deletes the disposition — see §17.F3).
    const managedAlerts   = allAlerts.filter(a => a.disposition !== null);
    const unmanagedAlerts = allAlerts.filter(a => a.disposition === null);

    const healthStatus = unmanagedAlerts.some(a => a.severity === 'RED') ? 'RED'
        : unmanagedAlerts.length > 0 ? 'YELLOW' : 'GREEN';

    // ── Assemble Output ─────────────────────────────────
    return {
        id: deal.id,
        accountName: deal.account_name,
        dealName: deal.deal_name,
        crmRecordUrl: deal.crm_record_url,
        team: {
            accountManager: deal.account_manager,
            technicalLead: deal.technical_lead
        },
        salesStage: deal.sales_stage,
        stageEnteredAt: deal.stage_entered_at,
        daysInStage,
        financials: {
            calculatedTCV,
            normalizedTCV,             // F1
            reportingCurrency,         // F1
            fxRateApplied: fxRate,     // F1
            productRevenue: baseProductRevenue,
            servicesRevenue: attachedServicesRevenue,
            pricingModel: deal.pricing_model,
            termYears,
            dealCurrency: deal.deal_currency,
            expectedCloseDate: deal.expected_close_date,
            daysToClose,
            winProbability: deal.win_probability_pct,
            servicesTier: deal.services_tier,
            crossSells: deal.cross_sells || [],
            crossSell: {               // F13
                pitchedCount,
                catalogCount,
                attachRate,
                whitespace: ctx.whitespace || []
            }
        },
        technicalTrack: {
            progressPercentage: technicalProgressPct,
            currentMilestone,
            stepsCompleted,
            totalSteps,
            gates: gates.map(g => ({
                gateCode: g.gate_code,
                gateGroup: g.gate_group,
                label: g.label,
                isCompleted: g.is_completed,
                completedAt: g.completed_at,
                prerequisiteGateCodes: g.prerequisite_gate_codes || []  // F4
            })),
            integrityWarnings        // F4
        },
        governance: {
            healthStatus,
            alerts: unmanagedAlerts,
            managedAlerts,            // F3
            unmanagedAlertCount: unmanagedAlerts.length,  // F3
            activeBlockerCount: activeBlockers.length,
            highSeverityBlockerCount: highSeverityBlockers.length,
            blueprintNotes: deal.manager_strategic_blueprint,
            dataQualityNotes          // F1
        }
    };
}

module.exports = {
    processDealIntelligence,
    riskPatterns,
    calculateOwnMomentum,    // F8
    getThresholds,
    invalidateThresholdCache
};
```

### 6.3 Pattern Summary Reference

| Code | Severity | Weight | Description |
|---|---|---|---|
| `PREMATURE_COMMERCIAL` | RED | 100 | Sales stage advanced before Gate 3 performance validation |
| `MISSING_STRUCTURAL_ANCHOR` | RED | 90 | Past Discovery without locked success criteria |
| `DISCOUNT_TRAP` | RED | 85 | Mega-deal in Commercial with zero services attachment (on `normalizedTCV`) |
| `SLOW_MOTION_COLLISION` | YELLOW→RED | 75 | **(F8)** The deal's own gate velocity decelerating with a near close date |
| `UNPROTECTED_ELEPHANT` | YELLOW | 70 | Large `normalizedTCV` deal without services SOW |
| `CLOSE_DATE_PRESSURE` | YELLOW | 65 | Approaching close date with insufficient gate completion |
| `PHANTOM_CHAMPION` | YELLOW | 60 | Long-running deal without executive alignment |
| `STALLED_VALIDATION` | YELLOW | 55 | Technical progress stalled beyond configurable threshold |
| `GHOST_PIPELINE` | YELLOW | 50 | No activity indicators (blockers, notes, updates) |
| `LOW_ATTACH_ELEPHANT` | YELLOW | 45 | **(F13)** Large `normalizedTCV` deal with a low cross-sell attach rate |
| `UNRESOLVED_CRITICAL_BLOCKERS` | YELLOW | 40 | High-severity blockers remain open |
| `NO_CLOSE_DATE` | YELLOW | 30 | Advanced stage without an expected close date |

> Every built-in pattern above exposes a glass-box `explain()` (F2). Two patterns (`SLOW_MOTION_COLLISION`, `LOW_ATTACH_ELEPHANT`) are new in v4.0. All TCV comparisons use `normalizedTCV` (F1). Per charter C2, this array is fixed and engineer-defined; no runtime authoring exists in Phase 1.

---

## 7. Frontend Architecture & State Management

### 7.1 Technology Decisions

| Concern | Choice | Rationale |
|---|---|---|
| Build Tool | Vite 6 | Sub-second HMR, native ESM, optimized production builds |
| Framework | React 19 | Latest concurrent features, improved hydration |
| Routing | React Router v7 | File-based routing, nested layouts, loader/action patterns |
| State Management | Zustand | Selector-based subscriptions prevent cascade re-renders |
| Form Management | react-hook-form + zod | Dirty-field tracking, co-located validation, minimal re-renders |
| HTTP Client | fetch + custom wrapper | Native fetch with interceptors for auth, error handling, retry |
| Styling | Tailwind CSS v4 | Utility-first, deterministic class output |
| Icons | Lucide React | Tree-shakeable, consistent stroke-based icon set |
| Charts | Recharts | Declarative, React-native API; powers F10 autopsy + F11 portfolio correlation views |

### 7.2 State Architecture (Zustand Stores)

The application state is divided into isolated stores. Each store uses selectors so components only re-render when their specific slice changes.

> **Phase 1 enhancement notes.** `useUIStore` is extended with an ordered `briefingQueue[]` and a session pacing timer (F5). `useActiveDealStore` gains a lightweight **Replay state-override** (F6 Deal Replay) and a `dispositions[]` slice (F3). A new **`useSimulatorStore`** mirrors `useActiveDealStore` for the ephemeral client-side Risk Simulator (F9). No store persists speculative data.

```typescript
// stores/useGlobalStore.ts
// Manages: deal list, total TCV, alert counts, engine thresholds

interface GlobalState {
    deals: DealSummary[];
    totalTCV: number;                 // F1 — sum of normalizedTCV
    reportingCurrency: string;        // F1
    healthCounts: { GREEN: number; YELLOW: number; RED: number };
    criticalAlertCount: number;       // F3 — reflects UNMANAGED counts
    thresholds: Record<string, number>;
    fxRates: FxRate[];                 // F1
    isLoading: boolean;
    lastFetchedAt: number | null;

    // Actions
    fetchDeals: () => Promise<void>;
    fetchThresholds: () => Promise<void>;
    updateThreshold: (key: string, value: string) => Promise<void>;
    fetchFxRates: () => Promise<void>;          // F1
    updateFxRates: (updates: FxRateUpdate[]) => Promise<void>;  // F1
}
```

```typescript
// stores/useActiveDealStore.ts
// Manages: currently selected deal's full data, gates, blockers, intelligence

interface ActiveDealState {
    deal: DealDetail | null;
    gates: GateObject[];
    blockers: BlockerObject[];
    crossSells: CrossSellObject[];
    intelligence: IntelligenceResult | null;
    auditLog: AuditLogEntry[];
    dispositions: DispositionObject[];      // F3
    replayOverride: ReplaySnapshot | null;  // F6 — when set, UI shows reconstructed state
    isLoading: boolean;
    isDirty: boolean;
    dirtyFields: Set<string>;

    // Actions
    selectDeal: (dealId: string) => Promise<void>;
    updateDealField: (field: string, value: any) => void;
    saveDeal: () => Promise<void>;
    toggleGate: (gateCode: string, value: boolean) => void;
    flushGateUpdates: () => Promise<void>;
    addBlocker: (blocker: CreateBlockerInput) => Promise<void>;
    resolveBlocker: (blockerId: string, notes: string) => Promise<void>;
    setCrossSells: (productIds: string[]) => Promise<void>;
    fetchIntelligence: () => Promise<void>;
    fetchAuditLog: () => Promise<void>;
    setDisposition: (patternCode: string, d: DispositionInput) => Promise<void>;  // F3
    clearDisposition: (patternCode: string) => Promise<void>;                     // F3
    enterReplay: (date: string) => Promise<void>;                                 // F6
    exitReplay: () => void;                                                        // F6
    launchIntervention: (patternCode: string, checklistId: number) => Promise<void>; // F7
}
```

```typescript
// stores/useUIStore.ts
// Manages: presentation mode, sidebar state, modal state, notifications

interface UIState {
    isBriefingMode: boolean;
    briefingDealIndex: number;
    briefingQueue: string[];          // F5 — curated, ordered, include/exclude
    pacing: { startedAt: number | null; totalDeals: number };  // F5
    sidebarCollapsed: boolean;
    activeModal: string | null;       // e.g. 'intervention', 'lossArchetype', 'override' (F7/F10/F12)
    toasts: Toast[];

    // Actions
    toggleBriefingMode: () => void;
    nextBriefingDeal: () => void;
    prevBriefingDeal: () => void;
    setBriefingQueue: (order: string[]) => void;       // F5
    toggleBriefingInclusion: (dealId: string) => void; // F5
    addToast: (toast: Toast) => void;
    dismissToast: (id: string) => void;
}
```

```typescript
// stores/useSimulatorStore.ts   (F9 — ephemeral, non-persisted)
// Mirrors useActiveDealStore inputs; runs the CLIENT-SIDE pure engine.
interface SimulatorState {
    active: boolean;                  // "Simulate" toggle
    draftDeal: DealDetail | null;     // unbound copy of the active deal
    draftGates: GateObject[];
    preview: { healthStatus: string; alerts: AlertObject[] } | null; // HEALTH + ALERTS only
    enter: (seed: { deal: DealDetail; gates: GateObject[] }) => void;
    setField: (field: string, value: any) => void;
    toggleGate: (code: string, value: boolean) => void;
    recompute: (thresholds: Record<string, number>, ctx: EngineCtx) => void; // calls processDealIntelligence
    exit: () => void;                 // discards ALL simulated state
}
```

### 7.3 Gate Update Batching Strategy

To handle rapid checkbox toggling during live meetings without flooding the API:

```typescript
// hooks/useGateBatch.ts

const pendingUpdates = useRef<Map<string, boolean>>(new Map());
const flushTimer = useRef<NodeJS.Timeout | null>(null);

function handleGateToggle(gateCode: string, isCompleted: boolean) {
    // 1. Optimistic local update (instant UI feedback)
    updateLocalGateState(gateCode, isCompleted);

    // 2. Queue the server-side update
    pendingUpdates.current.set(gateCode, isCompleted);

    // 3. Debounce: flush after 500ms of inactivity
    if (flushTimer.current) clearTimeout(flushTimer.current);
    flushTimer.current = setTimeout(async () => {
        const updates = Array.from(pendingUpdates.current.entries()).map(
            ([code, value]) => ({ gate_code: code, is_completed: value })
        );
        pendingUpdates.current.clear();

        try {
            const res = await api.batchUpdateGates(dealId, updates);
            // 4. After server confirms, re-fetch intelligence
            await fetchIntelligence();
            // (F4) Surface any integrityWarnings returned by the batch handler
            if (res.integrityWarnings?.length) showIntegrityStrip(res.integrityWarnings);
        } catch (error) {
            // 5. Rollback optimistic updates on failure
            rollbackGateUpdates(updates);
            addToast({ type: 'error', message: 'Gate update failed. Changes reverted.' });
        }
    }, 500);
}
```

### 7.4 Deal Switching Behavior

```typescript
// When the Commander clicks a different deal tab:

async function handleDealSwitch(newDealId: string) {
    // 1. Check for unsaved changes
    if (activeDealStore.isDirty) {
        const confirmed = await showConfirmDialog(
            'Unsaved Changes',
            'You have unsaved changes. Save before switching?'
        );
        if (confirmed) {
            await activeDealStore.saveDeal();
        }
    }

    // 2. Flush any pending gate updates
    await activeDealStore.flushGateUpdates();

    // (F9) If the Risk Simulator is active, discard its ephemeral state
    if (simulatorStore.active) simulatorStore.exit();
    // (F6) Exit Replay mode when switching deals
    activeDealStore.exitReplay();

    // 3. Clear intelligence (prevent stale advisory flash)
    clearIntelligenceDisplay();

    // 4. Show skeleton loading state
    setActiveDealLoading(true);

    // 5. Hydrate new deal data
    await activeDealStore.selectDeal(newDealId);
}
```

### 7.5 Auto-Save with Undo

```typescript
// hooks/useAutoSave.ts

const undoStack = useRef<Map<string, { previous: any; current: any }>>(new Map());
const saveTimer = useRef<NodeJS.Timeout | null>(null);

function handleFieldBlur(field: string, value: any) {
    // Record previous value for undo
    const previousValue = activeDealStore.deal?.[field];
    undoStack.current.set(field, { previous: previousValue, current: value });

    // Update local state
    activeDealStore.updateDealField(field, value);

    // Debounce save by 1 second
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(async () => {
        try {
            await activeDealStore.saveDeal();
            addToast({
                type: 'success',
                message: 'Changes saved',
                action: { label: 'Undo', onClick: () => handleUndo(field) }
            });
        } catch (error) {
            // (F12) A 409 STAGE_GUARDRAIL surfaces an override dialog rather
            // than a generic failure — see §17.F12 UI deltas.
            if (error.code === 'STAGE_GUARDRAIL') return openOverrideDialog(error.details);
            addToast({ type: 'error', message: 'Auto-save failed. Please save manually.' });
        }
    }, 1000);
}

function handleUndo(field: string) {
    const entry = undoStack.current.get(field);
    if (entry) {
        activeDealStore.updateDealField(field, entry.previous);
        activeDealStore.saveDeal();
    }
}
```

---

## 8. Cockpit UI — Interface Specification

### 8.1 Component Hierarchy

```
<App>
  <AuthProvider>
    <Router>
      <CockpitLayout>
        <CockpitHeader />                     ← Global TCV (reporting currency), alert count, briefing mode toggle
        <AccountNavigationArray />            ← Deal selector tabs + new deal button
        <main>
          <DealWorkspace>
            <ChangeDigestStrip />              ← (F6) collapsible "Since last review"
            <TeamAndInfrastructure />          ← AM, TL, CRM link
            <TechnicalGateMatrix />            ← 9-point checkbox grid + prerequisite chains (F4)
            <FinancialSplitArchitecture />     ← Revenue + normalized TCV (F1), cross-sells + whitespace (F13)
            <PatternEngineAdvisory />          ← Risk alerts + glass-box disclosure (F2) + disposition controls (F3) + Launch Intervention (F7)
            <StrategicBlueprintNotes />        ← Free-text manager notes (projected)
            <SpeakerNotesEditor />             ← (F5) Commander-private notes (never projected/exported)
            <RiskSimulatorToggle />            ← (F9) "Simulate" sandbox
          </DealWorkspace>
        </main>
        <AuditTrailViewer />                  ← (F3) filterable audit log: dispositions + overrides + regressions
        <RecycleBinView />                    ← (F14) archived/deleted deals + Restore
        <PortfolioHealthView />               ← (F11) correlation matrix; <ClosedLostAutopsyView/> (F10)
      </CockpitLayout>
    </Router>
  </AuthProvider>
</App>
```

### 8.2 Wireframe Specification

```
+-------------------------------------------------------------------------------------------------------------------------+
| [EDC COCKPIT]                       TOTAL TCV MONITORED (USD): $8.45M   |   CRITICAL ALERTS: 2   |  [BRIEFING MODE]      |
+-------------------------------------------------------------------------------------------------------------------------+
| SELECT STRATEGIC ACCOUNT:                                                                                               |
| [▶ ACME CORP ($1.45M)] [HORIZON FINTECH ($970K)] [GLOBAL OMNI ($3.1M)] [ATLAS HEALTH ($1.93M)] [  + NEW DEAL  ]       |
+-------------------------------------------------------------------------------------------------------------------------+
| ▾ SINCE LAST REVIEW (F6): Gate 4 cleared · close date pulled in 14 days · 1 high-severity blocker added  [Mark reviewed]|
+-------------------------------------------------------------------------------------------------------------------------+
| ■ ACCOUNT TEAM & INFRASTRUCTURE                                                                                         |
|   Account Manager (Sales):    [ John Doe            ]                                                                  |
|   Technical Lead (Presales):  [ Sarah Jenkins        ]                                                                  |
|   CRM Record Link:            [ https://sf.lightning.force.com/... ] [↗ OPEN CRM]                                      |
+-------------------------------------------------------------------------------------------------------------------------+
| ■ TECHNICAL GATE PROGRESSION (9-POINT QUANTIFIABLE LEDGER)            [⚠ 1 out-of-order (F4)]                          |
|   GATE 1: SUCCESS CRITERIA          GATE 3: SCALABILITY           GATE 4: GOVERNANCE                                    |
|   [✓] Min Viable Reqs Locked        [ ] Load/Perf Stress Passed   [ ] InfoSec Panel Approved                            |
|   [✓] Exec Champion Agrees          [ ] Integration Ifaces Mapped [ ] Compliance Validated                              |
|   GATE 2: CORE VALIDATION           GATE 5: TECHNICAL WIN                                                             |
|   [✓] Core Workflow Verified         [ ] CTO Win Signed-Off                                                            |
|   [ ] Champion Defensible                                                                                               |
|   PROGRESS: [██████████░░░░░░░░░░░░░░░░░░░░] 33% (3/9)  |  Milestone: Gate 2 Core MVP Validated                        |
+-------------------------------------------------------------------------------------------------------------------------+
| ■ FINANCIAL SPLIT ARCHITECTURE                                                                                          |
|   Product Revenue:    $ [ 400,000.00 ]    Pricing Model:  [●] Annual Sub  ○ Multi-Year  ○ Perpetual  ○ Usage  ○ Hybrid  |
|   Services Revenue:   $ [ 250,000.00 ]    Services Tier:  [ Combined SOW Shared ▾ ]    Term: [ 3 ] yrs  Currency: [EUR]  |
|   Expected Close:     [ 2025-09-15  ]    Win Probability:  [ 65 ]%                                                      |
|   Cross-Sell Track:   [✓] Advanced Analytics   [ ] Edge Node Gateway   [✓] Threat Detection   [ ] API Mgmt   [ ] Data Res|
|   WHITESPACE (F13): Edge Node Gateway · API Mgmt · Data Residency      ATTACH RATE: 33% (2/6)                          |
|   ──────────────────────────────────────────────────────────────────────────────────────────────────────────────────────  |
|   CALCULATED TCV (native):  € 1,330,000.00       NORMALIZED TCV (USD ≈): $ 1,449,700.00  (F1 @ 1.09)                   |
+-------------------------------------------------------------------------------------------------------------------------+
| ⚠ PATTERN ENGINE RISK ADVISORY (1 ACTIVE · 1 MANAGED)                                          [● Simulate (F9)]       |
|   [RED]  PREMATURE COMMERCIAL DISCONNECT: Sales line has initiated contract quoting before Gate 3...                     |
|         ▸ Why this fired (F2) | Clears when: Complete Gate 3... | [Acknowledge][Accept…][Snooze…] (F3) [Launch Intervention (F7)]|
|   MANAGED RISKS (F3): UNPROTECTED_ELEPHANT — Accepted: "Services SOW committed to Phase-2 rollout."                     |
+-------------------------------------------------------------------------------------------------------------------------+
| ■ MANAGER STRATEGIC BLUEPRINT NOTES (projected as "Ask to Executive")                                                   |
|   [ Override pricing window. Force architecture validation workshop with customer CTO next Tuesday.                     ] |
+-------------------------------------------------------------------------------------------------------------------------+
| ■ SPEAKER NOTES (F5 — PRIVATE; never projected or exported)                                                            |
|   [ Remind the CFO that legal redlines are the real blocker; do NOT show this slide's discount math.                   ] |
+-------------------------------------------------------------------------------------------------------------------------+
```

### 8.3 Component Behavioral Specifications

#### 8.3.1 CockpitHeader

- Displays `Total Monitored TCV` — **(F1)** the sum of `normalizedTCV` across all active (non-archived/non-deleted) deals, labelled with the reporting currency (e.g., "Total Monitored TCV (USD)").
- Displays `Critical Alerts` count — **(F3)** the sum of deals with an **unmanaged** `healthStatus === 'RED'`.
- Displays `Briefing Mode` toggle button.
- Fixed position at the top of the viewport.
- Minimum height: 56px, background: `--surface` color.
- All values update in real-time when underlying data changes (via Zustand selectors).

#### 8.3.2 AccountNavigationArray

- Horizontal scrollable tab row.
- Each tab shows: Account Name + TCV (e.g., "ACME CORP ($1.45M)") — TCV shown in reporting currency (F1).
- Color-coded left border on each tab: GREEN/YELLOW/RED based on **unmanaged** deal health (F3).
- Tabs sorted by `normalizedTCV` descending by default (F1).
- Excludes archived/deleted deals (F14); they live in the Recycle Bin view.
- `[+ NEW DEAL]` button opens a modal with `CreateDealSchema` form.
- Keyboard navigation: Left/Right arrows to switch tabs.
- Active tab has elevated visual weight (bold text, accent border, subtle shadow).
- Keyboard shortcut: `Ctrl+K` opens a search/filter command palette overlay.

#### 8.3.3 TechnicalGateMatrix

- Organized into labeled groups (Gate 1 through Gate 5).
- Each checkbox is a custom-styled toggle (not a raw HTML checkbox).
- Checkbox animations: 200ms ease-out scale + color transition on toggle.
- When a checkbox is toggled:
  1. Immediate optimistic UI update
  2. Add to debounce batch queue (500ms)
  3. On flush: batch API call → intelligence re-fetch
  4. Progress bar animates smoothly to new percentage
  5. Milestone label cross-fades if it changed
  6. **(F4)** Render any returned `integrityWarnings` — subtle prerequisite connectors, an "out-of-order" badge on gates completed ahead of prerequisites, and a distinct style for regressed gates.
- Progress bar: smooth CSS transition (300ms ease) on width change.
- Milestone label: fade-out/fade-in transition (200ms) on text change.

#### 8.3.4 FinancialSplitArchitecture

- All financial fields use locale-aware currency formatting (e.g., `$1,450,000.00`).
- Numeric inputs accept raw numbers; display formats on blur.
- Pricing model: radio button group (only one selectable).
- Services tier: dropdown select.
- Cross-sell products: checkbox list sourced from `product_catalog` lookup. **(F13)** A whitespace list and attach-rate badge are rendered beside the cross-sell track.
- `Calculated TCV` is a read-only computed field — highlighted with accent border. **(F1)** A secondary "Normalized TCV (≈ reporting currency)" line is shown beneath the native value.
- `Expected Close Date`: date picker (native HTML5 or lightweight library).
- `Win Probability`: slider or numeric input with 0-100 range validation.
- All fields trigger auto-save on blur (see section 7.5).

#### 8.3.5 PatternEngineAdvisory

- Displays all active (unmanaged) alerts (not just the first).
- Each alert is a card with severity-colored left border (RED or YELLOW).
- Alert count shown in section header (active + managed counts, F3).
- Alerts sorted by severity then weight (RED alerts first).
- **(F2)** Each card has an expandable "Why this fired" disclosure showing inputs, thresholds (with a small "tuned" badge where applicable), and a highlighted **Clears when** line.
- **(F3)** Each card has a disposition control (Acknowledge / Accept… / Snooze…). Accepted/snoozed/acknowledged alerts move to a visually distinct "Managed Risks" subsection showing the rationale and who set it.
- **(F7)** When a static intervention checklist is keyed to the alert's pattern code, the card shows a "Launch Intervention" button opening the checklist modal.
- When new alerts arrive (after intelligence re-fetch), cards animate in with a 200ms fade-up.
- GREEN state shows a subtle "No active risk advisories" confirmation.

#### 8.3.6 StrategicBlueprintNotes

- Multi-line textarea, auto-expanding (min 3 rows, max 12 rows before scroll).
- Character count displayed (soft limit at 2000 characters).
- Auto-save on blur with undo toast.
- Monospace or semi-monospace font for readability of tactical notes.
- **(F5)** A separate `SpeakerNotesEditor` (Commander-private) sits below; visually distinct and labeled "PRIVATE — never projected or exported."

### 8.4 Empty States

| Scenario | Display |
|---|---|
| No deals created | Centered illustration + "Create your first strategic account to begin monitoring" + prominent `[+ CREATE DEAL]` button |
| Deal selected but no blockers | "No blockers logged. This is either great news or an oversight — use your 1:1s to verify." |
| All gates complete (100%) | Progress bar shows full with GREEN accent + "Technical Win Achieved — Ready for Executive Briefing" |
| Intelligence returns GREEN | "No active risk advisories. Pipeline health is nominal." with subtle GREEN indicator |
| No changes since last review (F6) | "No changes since your last review on <date>." |
| Recycle Bin empty (F14) | "No archived or deleted deals. Removed deals appear here and can be restored." |

### 8.5 Keyboard Shortcuts

| Shortcut | Action |
|---|---|
| `Ctrl+K` | Open deal search/command palette |
| `←` / `→` | Navigate between deal tabs (when no input focused) |
| `Ctrl+B` | Toggle Briefing Mode |
| `Ctrl+S` | Force save current deal |
| `1` – `9` | Toggle corresponding gate checkbox (when gate section focused) |
| `Escape` | Close modal / exit search / exit Briefing Mode / **exit Replay or Simulator (F6/F9)** |

---

## 9. Executive Briefing Mode (Presentation View)

### 9.1 Design Philosophy

Executive Briefing Mode transforms the Cockpit from an operational workspace into a **presentation-grade visual narrative**. It answers one question for the executive audience: **"What do I need to decide right now?"**

> **Phase 1 ergonomics (F5, charter C15).** Briefing Mode gains presenter-side meeting-running tools — a curated agenda/queue, a session pacing timer, and a private speaker-notes pane — without adding any new *on-screen executive data* (which is reserved for Phase 2 Briefing Mode V2, §20).

### 9.2 Entry & Exit

- **Entry:** Click `Briefing Mode` button in header, or press `Ctrl+B`
- **Exit:** Press `Escape`, click `Exit Briefing` overlay button, or press `Ctrl+B` again
- **Transition:** 300ms cross-fade from Cockpit to Briefing layout
- **Fullscreen:** Briefing Mode requests browser fullscreen API on entry (with fallback)
- **(F5)** A pre-briefing "Build Agenda" panel lets the Commander reorder deals and include/exclude them for this session before entering.

### 9.3 Briefing Mode Component Tree

```
<BriefingModeLayout>
  <BriefingHeader />                   ← Deal name, TCV (reporting currency), health badge
  <BriefingProgressBar />              ← Gate completion with milestone
  <BriefingRiskAdvisory />             ← Enlarged, high-contrast risk cards; enlarged "Clears when" (F2)
  <BriefingStrategicAsk />             ← Blueprint notes as "Ask to Executive" (speaker_notes EXCLUDED, F5)
  <BriefingSpeakerNotes />             ← (F5) presenter-only pane; never in projected layout or PDF
  <BriefingNavigation />               ← Left/right arrows, deal queue indicator + pacing "N of M · MM:SS" (F5)
</BriefingModeLayout>
```

### 9.4 Wireframe

```
+-------------------------------------------------------------------------+
|  ACME CORP — $1.45M TCV (USD)                       [RED] AT RISK      |
|  Account Manager: John Doe  |  Technical Lead: Sarah Jenkins           |
|  TECHNICAL VALIDATION: 33% COMPLETE (3 of 9 gates)                     |
|  ██████░░░░░░░░░░░░░░░░░░░░░░░░░░░░  Stalled at Gate 2               |
|  ┌─────────────────────────────────────────────────────────────────┐    |
|  │  ⚠  CRITICAL RISK — PREMATURE COMMERCIAL DISCONNECT             │    |
|  │  Sales has initiated contract quoting before completing Gate 3  │    |
|  │  (Scalability Testing). Risk of late-stage technical            │    |
|  │  disqualification or deep margin discounting.                   │    |
|  │  CLEARS WHEN: Complete Gate 3, or move out of Commercial. (F2)   │    |
|  └─────────────────────────────────────────────────────────────────┘    |
|  ┌─────────────────────────────────────────────────────────────────┐    |
|  │  ASK TO EXECUTIVE — Force an architecture validation workshop   │    |
|  │  with customer CTO before allowing commercial terms to proceed. │    |
|  └─────────────────────────────────────────────────────────────────┘    |
|  BLOCKERS: 2 active (1 high severity)                                  |
|                ◀  2 of 7 deals  ▶        · 12:34 elapsed (F5)          |
+-------------------------------------------------------------------------+
   (Presenter-only overlay, not projected: SPEAKER NOTES — "Lead with the
    CTO workshop ask; do not surface discount math." )
```

### 9.5 Briefing Mode Specifications

| Element | Specification |
|---|---|
| **Minimum font size** | 18px body, 28px headings, 16px secondary |
| **Color contrast** | WCAG AAA (7:1 ratio minimum for all text) |
| **Resolution target** | Optimized for 1920x1080; scales gracefully to 4K |
| **Viewing distance** | Designed for 8-12 feet (conference room projection) |
| **Interaction model** | Keyboard + click only; no hover-dependent interactions |
| **Deal navigation** | Left/Right arrow keys, on-screen arrows, or presenter remote; honors the curated `briefingQueue` order (F5) |
| **Deal queue** | "2 of 7 deals" indicator; skip GREEN via filter toggle; curated include/exclude (F5) |
| **Session pacing** | "N of M · MM:SS elapsed" indicator, ephemeral; resets on briefing exit (F5) |
| **Speaker notes** | Presenter-only pane; absent from the projected layout and the PDF export (F5) |
| **Animations** | Smooth cross-fade (300ms) between deals; risk card entrance animation (200ms fade-up); progress bar smooth transition |
| **Information density** | Maximum 6 distinct data points visible at once; everything else is accessible via drill-down or omitted |

### 9.6 PDF Export

Briefing Mode includes a `Export PDF` button that generates a printable document:

- Uses browser print stylesheet (`@media print`) or `html2pdf.js` library.
- Page 1: Cover page with date, Commander name, "CONFIDENTIAL" watermark.
- Page 2+: One page per deal with the same layout as Briefing Mode.
- Final page: Summary table of all deals (Account, TCV in reporting currency, Health, Stage, Milestone).
- **(F5)** `speaker_notes` is **never** selected into the PDF assembly path. The export pipeline omits the field entirely (enforced by not querying it into the briefing data set).

> **Note.** Phase 2's board-report generation via Puppeteer (§19) and Briefing Mode V2 overlays (§20) are out of Phase 1 scope; the export here remains the basic print-based PDF.

---

## 10. Access Boundaries & Security Model

### 10.1 Authentication Flow

```
┌──────────────┐     POST /auth/login      ┌──────────────────┐
│   Browser     │ ───────────────────────── │   Express Server  │
│  Login Form   │  ◀── 200 + Set-Cookie ── │  Validate creds   │
│  (email+pwd)  │     (httpOnly, Secure,    │  (bcrypt compare) │
│               │      SameSite=Strict)     │  Generate JWT     │
│               │                           │  (RS256, 8hr exp) │
└──────────────┘                           └──────────────────┘
        │  Subsequent requests:  Cookie: edc_session=<JWT>   │
        │  ──────────────────────────────────────▶           │
        │              Auth Middleware                        │
        │              ├─ Verify JWT signature                │
        │              ├─ Check expiration                    │
        │              ├─ Attach user to req context          │
        │              └─ Reject if invalid → 401             │
```

> **(F7) Bat-Signal token.** In addition to the session JWT above, EDC mints a **separate, short-lived (48h) RS256 token** for the Bat-Signal share link. It carries a **distinct audience** (`aud: 'edc-batsignal'`) and **narrow claims** (`scope: 'risk-card:read'`, `dealId` bound). The public `GET /share/:token` route verifies **only** this token (never the session cookie) and resolves to a read-only render of a single deal's Briefing risk card. Session-auth middleware rejects Bat-Signal tokens and vice-versa, so the share token can never reach the cockpit or any mutation route.

### 10.2 JWT Configuration

| Property | Value |
|---|---|
| Algorithm | RS256 (asymmetric) |
| Expiry | 8 hours (single workday session) |
| Refresh | Sliding window: new token issued on each authenticated request if > 4 hours elapsed |
| Storage | `httpOnly`, `Secure`, `SameSite=Strict` cookie |
| Secret Management | Private key stored in environment variable `EDC_JWT_PRIVATE_KEY`; public key in `EDC_JWT_PUBLIC_KEY` |
| Token Claims | `{ sub: userId, email, role: 'commander', iat, exp }` |
| **Bat-Signal token (F7)** | RS256, 48h expiry, `{ aud: 'edc-batsignal', scope: 'risk-card:read', dealId, iat, exp }`; signed with the same `EDC_JWT_PRIVATE_KEY`; verified ONLY on `GET /share/:token` |

### 10.3 Password Policy

| Property | Value |
|---|---|
| Hashing | bcrypt with cost factor 12 |
| Minimum length | 12 characters |
| Complexity | At least 1 uppercase, 1 lowercase, 1 digit, 1 special character |
| Account lockout | 5 failed attempts triggers 15-minute lockout |
| Storage | Only bcrypt hash stored; plaintext never persisted |

### 10.4 API Security Middleware Stack

```javascript
// middleware/security.js (applied in order)

const express = require('express');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const cors = require('cors');
const { z } = require('zod');

// 1. Security headers
app.use(helmet({
    contentSecurityPolicy: {
        directives: {
            defaultSrc: ["'self'"],
            scriptSrc: ["'self'"],
            styleSrc: ["'self'", "'unsafe-inline'"],  // Tailwind requires inline
            imgSrc: ["'self'", "data:", "https:"],
            connectSrc: ["'self'"],
            fontSrc: ["'self'", "https://fonts.gstatic.com"],
            objectSrc: ["'none'"],
            frameSrc: ["'none'"],
        }
    },
    hsts: { maxAge: 31536000, includeSubDomains: true, preload: true }
}));

// 2. CORS (locked to application origin)
app.use(cors({
    origin: process.env.EDC_APP_ORIGIN,  // e.g., 'https://edc.internal.company.com'
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE'],
    allowedHeaders: ['Content-Type']
}));

// 3. Rate limiting
const apiLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,  // 15 minutes
    max: 100,                   // 100 requests per window
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: { code: 'RATE_LIMITED', message: 'Too many requests' } }
});
app.use('/api/', apiLimiter);

// 4. Auth-strict limiter for login
const authLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 10,
    message: { error: { code: 'RATE_LIMITED', message: 'Too many login attempts' } }
});
app.use('/api/v1/auth/login', authLimiter);

// (F7) Bat-Signal public share route gets its own conservative limiter to
// deter token-guessing on the public surface.
const shareLimiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 60 });
app.use('/api/v1/share/', shareLimiter);

// 5. Request body size limit
app.use(express.json({ limit: '1mb' }));

// 6. Zod validation middleware factory
function validate(schema) {
    return (req, res, next) => {
        const result = schema.safeParse(req.body);
        if (!result.success) {
            return res.status(400).json({
                error: {
                    code: 'VALIDATION_ERROR',
                    message: 'Request body validation failed',
                    details: result.error.issues
                }
            });
        }
        req.validatedBody = result.data;
        next();
    };
}

// 7. HTTPS enforcement (production only)
if (process.env.NODE_ENV === 'production') {
    app.use((req, res, next) => {
        if (req.headers['x-forwarded-proto'] !== 'https') {
            return res.redirect(301, `https://${req.headers.host}${req.url}`);
        }
        next();
    });
}
```

### 10.5 Database Access Control

| Principle | Implementation |
|---|---|
| Dedicated DB role | Application connects via `edc_app_role` with limited privileges |
| No superuser access | Application never uses `postgres` or superuser credentials |
| Row-Level Security | Enabled on all data tables, including enhancement tables (see schema section 4.2.8) |
| Audit log immutable | `UPDATE` and `DELETE` policies deny all on `deal_audit_log` |
| Connection pooling | `pg.Pool` with max 10 connections, idle timeout 30s |
| Credential rotation | DB password stored in secrets manager; rotated quarterly |

### 10.6 Secrets Management

| Secret | Storage | Rotation |
|---|---|---|
| `DATABASE_URL` | Environment variable / secrets manager | Quarterly |
| `EDC_JWT_PRIVATE_KEY` | Environment variable / secrets manager | Annually |
| `EDC_JWT_PUBLIC_KEY` | Environment variable / secrets manager | Annually |
| `EDC_APP_ORIGIN` | Environment variable | Per deployment |
| `SENTRY_DSN` | Environment variable | Per project |

**Never in:** source code, `.env` files committed to git, Docker image layers, client-side JavaScript.

---

## 11. Testing Strategy & Quality Assurance

### 11.1 Testing Pyramid

```
                          ┌───────────┐
                          │   E2E     │    5-10 critical user journeys
                          │  (Playwright)│  (login → create deal → toggle gates → briefing mode)
                          ├───────────┤
                        ┌─┤Integration─┤  API route tests with real PostgreSQL
                        │ │  (supertest)│  (CRUD operations, constraint violations, auth flow)
                        │ ├───────────┤
                      ┌─┤ │   Unit     │  Intelligence engine patterns, utility functions,
                      │ │ │  (vitest)  │  zod schema validation, financial calculations
                      │ │ └───────────┘
                      │ │
                 ~70% │ │ ~25%        ~5%
```

### 11.2 Intelligence Engine Test Coverage (Critical)

The intelligence engine drives executive decisions. Every pattern must have comprehensive test coverage:

```javascript
// __tests__/patterns/prematureCommercial.test.js

describe('PREMATURE_COMMERCIAL pattern', () => {
    it('fires RED alert when stage is Commercial and Gate 3 performance not passed', () => {
        const deal = buildDeal({ salesStage: 'Commercial', gateMap: { G3_PERFORMANCE_PASSED: false } });
        const result = evaluatePattern('PREMATURE_COMMERCIAL', deal);
        expect(result.triggered).toBe(true);
        expect(result.severity).toBe('RED');
    });

    it('fires RED alert when stage is Procurement and Gate 3 performance not passed', () => {
        const deal = buildDeal({ salesStage: 'Procurement', gateMap: { G3_PERFORMANCE_PASSED: false } });
        expect(evaluatePattern('PREMATURE_COMMERCIAL', deal).triggered).toBe(true);
    });

    it('does not fire when Gate 3 performance is passed', () => {
        const deal = buildDeal({ salesStage: 'Commercial', gateMap: { G3_PERFORMANCE_PASSED: true } });
        expect(evaluatePattern('PREMATURE_COMMERCIAL', deal).triggered).toBe(false);
    });

    it('does not fire when stage is Discovery', () => {
        const deal = buildDeal({ salesStage: 'Discovery' });
        expect(evaluatePattern('PREMATURE_COMMERCIAL', deal).triggered).toBe(false);
    });

    it('does not fire when stage is Validation', () => {
        const deal = buildDeal({ salesStage: 'Validation' });
        expect(evaluatePattern('PREMATURE_COMMERCIAL', deal).triggered).toBe(false);
    });
});

// Repeat for every pattern (12 patterns × 3-5 test cases each = 36-60 tests).
// NEW in v4.0: SLOW_MOTION_COLLISION (F8) and LOW_ATTACH_ELEPHANT (F13) each
// require their own pattern test files; every pattern's explain() (F2) is also
// asserted to return ≥1 input and a non-empty clearsWhen string.
```

### 11.3 API Integration Tests

```javascript
// __tests__/api/deals.test.js

describe('PUT /api/v1/deals/:id', () => {
    it('returns 200 and updates the deal', async () => {
        const deal = await createTestDeal();
        const res = await request(app)
            .put(`/api/v1/deals/${deal.id}`)
            .set('Cookie', validAuthCookie)
            .send({ product_revenue: 500000 });
        expect(res.status).toBe(200);
        expect(res.body.data.product_revenue).toBe('500000.00');
    });

    it('returns 400 for negative product_revenue', async () => {
        const deal = await createTestDeal();
        const res = await request(app)
            .put(`/api/v1/deals/${deal.id}`)
            .set('Cookie', validAuthCookie)
            .send({ product_revenue: -100 });
        expect(res.status).toBe(400);
    });

    it('writes to audit log on field change', async () => {
        const deal = await createTestDeal();
        await request(app)
            .put(`/api/v1/deals/${deal.id}`)
            .set('Cookie', validAuthCookie)
            .send({ product_revenue: 500000 });

        const audit = await db.query(
            'SELECT * FROM edc.deal_audit_log WHERE deal_id = $1 AND field_changed = $2',
            [deal.id, 'product_revenue']
        );
        expect(audit.rows.length).toBe(1);
        expect(audit.rows[0].old_value).toBe('0.00');
        expect(audit.rows[0].new_value).toBe('500000.00');
    });

    it('returns 401 without authentication', async () => {
        const deal = await createTestDeal();
        const res = await request(app)
            .put(`/api/v1/deals/${deal.id}`)
            .send({ product_revenue: 500000 });
        expect(res.status).toBe(401);
    });

    // F12: stage-transition guardrail
    it('returns 409 STAGE_GUARDRAIL when advancing into a RED-pattern stage without override_reason', async () => {
        const deal = await createTestDeal({ /* no Gate 3 */ });
        const res = await request(app)
            .put(`/api/v1/deals/${deal.id}`)
            .set('Cookie', validAuthCookie)
            .send({ sales_stage_id: COMMERCIAL_ID });
        expect(res.status).toBe(409);
        expect(res.body.error.code).toBe('STAGE_GUARDRAIL');
    });

    it('allows the stage change and writes deal_stage_overrides + audit when override_reason supplied', async () => {
        const deal = await createTestDeal();
        const res = await request(app)
            .put(`/api/v1/deals/${deal.id}`)
            .set('Cookie', validAuthCookie)
            .send({ sales_stage_id: COMMERCIAL_ID, override_reason: 'CFO accepts technical risk for FY-close.' });
        expect(res.status).toBe(200);
        const ov = await db.query('SELECT * FROM edc.deal_stage_overrides WHERE deal_id=$1', [deal.id]);
        expect(ov.rows.length).toBe(1);
    });

    // F10: Closed-Lost requires a loss archetype
    it('returns 422 LOSS_ARCHETYPE_REQUIRED when moving to Closed-Lost without loss_archetype_id', async () => {
        const deal = await createTestDeal();
        const res = await request(app)
            .put(`/api/v1/deals/${deal.id}`)
            .set('Cookie', validAuthCookie)
            .send({ sales_stage_id: CLOSED_LOST_ID });
        expect(res.status).toBe(422);
    });
});

// F14: soft-delete & restore
describe('DELETE/restore lifecycle', () => {
    it('soft-deletes (sets deleted_at) and hides from default list', async () => {
        const deal = await createTestDeal();
        await request(app).delete(`/api/v1/deals/${deal.id}`).set('Cookie', validAuthCookie).expect(204);
        const list = await request(app).get('/api/v1/deals').set('Cookie', validAuthCookie);
        expect(list.body.data.find(d => d.id === deal.id)).toBeUndefined();
    });
    it('restores a soft-deleted deal', async () => {
        const deal = await createTestDeal();
        await request(app).delete(`/api/v1/deals/${deal.id}`).set('Cookie', validAuthCookie);
        const res = await request(app).post(`/api/v1/deals/${deal.id}/restore`).set('Cookie', validAuthCookie);
        expect(res.status).toBe(200);
        expect(res.body.data.deletedAt).toBeNull();
    });
});

// F1: multi-currency normalization
describe('multi-currency rollup', () => {
    it('totals header TCV using normalizedTCV across USD/EUR/GBP', async () => { /* ... */ });
    it('UNPROTECTED_ELEPHANT fires on a €480K deal @1.09 (→ $523K) crossing the 500K threshold', async () => { /* ... */ });
    it('surfaces MISSING_FX_RATE non-blocking note when no rate exists', async () => { /* ... */ });
});
```

### 11.4 End-to-End Tests (Critical User Journeys)

```javascript
// e2e/criticalJourneys.spec.js (Playwright)

test('Commander creates deal, toggles gates, views intelligence, enters briefing mode', async ({ page }) => {
    // 1. Login
    await page.goto('/login');
    await page.fill('[name="email"]', 'commander@company.com');
    await page.fill('[name="password"]', 'SecurePassword123!');
    await page.click('button[type="submit"]');
    await expect(page).toHaveURL('/cockpit');

    // 2. Create new deal
    await page.click('[data-testid="new-deal-button"]');
    await page.fill('[name="deal_name"]', 'Platform Modernization');
    await page.fill('[name="account_name"]', 'TestCorp');
    await page.fill('[name="account_manager"]', 'Jane Smith');
    await page.fill('[name="technical_lead"]', 'Bob Wilson');
    await page.click('button[type="submit"]');
    await expect(page.locator('[data-testid="deal-tab-TestCorp"]')).toBeVisible();

    // 3. Toggle gates
    await page.click('[data-testid="gate-G1_CRITERIA_LOCKED"]');
    await page.click('[data-testid="gate-G1_EXECUTIVE_AGREED"]');
    await page.waitForTimeout(600); // Wait for debounce flush
    await expect(page.locator('[data-testid="progress-bar"]')).toHaveAttribute('aria-valuenow', '22');

    // 4. Verify intelligence
    await expect(page.locator('[data-testid="milestone-label"]')).toContainText('Gate 1: Success Criteria Frozen');

    // 5. Enter briefing mode
    await page.click('[data-testid="briefing-mode-toggle"]');
    await expect(page.locator('[data-testid="briefing-layout"]')).toBeVisible();
    await expect(page.locator('[data-testid="briefing-deal-name"]')).toContainText('TestCorp');
});

// NEW v4.0 journeys (one E2E each):
//  F3  disposition flow: Accept a RED with rationale → header Critical Alerts decrements, card moves to Managed Risks
//  F5  speaker notes present on presenter view but ABSENT from exported PDF DOM + projected layout
//  F6  Deal Replay: open Rewind, scrub date, verify amber "Replay Mode" border + reconstructed gate state
//  F9  Risk Simulator: toggle Simulate, flip a gate, see Health/Alerts update instantly, exit discards all
//  F12 stage guardrail: attempt blocked stage change → override dialog → typed reason persists
//  F14 Recycle Bin: delete deal → appears in Recycle Bin → Restore → reappears in nav
```

### 11.5 Coverage Targets

| Component | Target | Enforcement |
|---|---|---|
| Intelligence Engine (incl. F2 explain, F8/F13 patterns) | ≥ 95% line, ≥ 90% branch | CI gate: build fails below threshold |
| API Routes (incl. F1/F3/F6/F10/F12/F14 endpoints) | ≥ 85% line | CI gate |
| Validation Schemas (incl. DispositionSchema, FxRatesUpdateSchema) | 100% (all fields tested with valid + invalid inputs) | CI gate |
| Frontend Components | ≥ 70% line | Warning (not blocking) |
| E2E Critical Journeys | 100% of listed journeys pass | CI gate |

### 11.6 Test Data Factories

```javascript
// __tests__/factories/dealFactory.js

function buildDeal(overrides = {}) {
    return {
        id: uuid(),
        deal_name: 'Test Deal',
        account_name: 'TestCorp',
        sales_stage: 'Discovery',
        product_revenue: 400000,
        services_revenue: 100000,
        pricing_model: 'Annual Subscription',
        contract_term_years: 1,
        services_tier: 'None',
        deal_currency: 'USD',
        expected_close_date: null,
        win_probability_pct: 50,
        manager_strategic_blueprint: null,
        speaker_notes: null,          // F5
        loss_archetype_id: null,      // F10
        archived_at: null,            // F14
        deleted_at: null,             // F14
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        stage_entered_at: new Date().toISOString(),
        ...overrides
    };
}

function buildGateMap(overrides = {}) {
    return {
        G1_CRITERIA_LOCKED: false,
        G1_EXECUTIVE_AGREED: false,
        G2_WORKFLOW_VERIFIED: false,
        G2_CHAMPION_DEFENSIBLE: false,
        G3_PERFORMANCE_PASSED: false,
        G3_INTEGRATIONS_MAPPED: false,
        G4_INFOSEC_CLEARED: false,
        G4_COMPLIANCE_VALIDATED: false,
        G5_CTO_SIGNED_OFF: false,
        ...overrides
    };
}
```

---

## 12. Monitoring, Observability & Reliability

### 12.1 Structured Logging (pino)

```javascript
// lib/logger.js

const pino = require('pino');

const logger = pino({
    level: process.env.LOG_LEVEL || 'info',
    formatters: {
        level: (label) => ({ level: label }),
    },
    timestamp: pino.stdTimeFunctions.isoTime,
    serializers: {
        err: pino.stdSerializers.err,
        req: (req) => ({
            method: req.method,
            url: req.url,
            requestId: req.id,
            userAgent: req.headers['user-agent']
        }),
        res: (res) => ({ statusCode: res.statusCode })
    }
});

// Request logging middleware
function requestLoggingMiddleware(req, res, next) {
    req.id = crypto.randomUUID();
    const startTime = Date.now();

    res.on('finish', () => {
        logger.info({
            req,
            res,
            responseTime: Date.now() - startTime
        }, `${req.method} ${req.url} ${res.statusCode} ${Date.now() - startTime}ms`);
    });

    next();
}
```

### 12.2 Health Check Endpoint

```javascript
// GET /api/v1/health
// Returns 200 if all dependencies are healthy, 503 if any are degraded

app.get('/api/v1/health', async (req, res) => {
    const checks = {};

    // Database connectivity
    try {
        const start = Date.now();
        await pool.query('SELECT 1');
        checks.database = { status: 'healthy', latencyMs: Date.now() - start };
    } catch (err) {
        checks.database = { status: 'unhealthy', error: err.message };
    }

    const overallStatus = Object.values(checks).every(c => c.status === 'healthy')
        ? 'healthy' : 'degraded';

    res.status(overallStatus === 'healthy' ? 200 : 503).json({
        status: overallStatus,
        timestamp: new Date().toISOString(),
        uptime: process.uptime(),
        checks
    });
});
```

### 12.3 Error Tracking (Sentry)

```javascript
const Sentry = require('@sentry/node');

Sentry.init({
    dsn: process.env.SENTRY_DSN,
    environment: process.env.NODE_ENV,
    tracesSampleRate: process.env.NODE_ENV === 'production' ? 0.1 : 1.0,
    beforeSend(event) {
        // Scrub any accidental PII
        if (event.request?.headers) {
            delete event.request.headers['cookie'];
        }
        return event;
    }
});

// Error handler (must be after all routes)
app.use(Sentry.Handlers.errorHandler());

// Fallback error handler
app.use((err, req, res, next) => {
    logger.error({ err, requestId: req.id }, 'Unhandled error');
    res.status(500).json({
        error: {
            code: 'INTERNAL_ERROR',
            message: 'An unexpected error occurred',
            requestId: req.id
        }
    });
});
```

### 12.4 Key Metrics to Monitor

| Metric | Source | Alert Threshold |
|---|---|---|
| API response time (p95) | Application logs | > 500ms |
| Error rate (5xx) | Application logs | > 1% of requests |
| Database query time (p95) | pg_stat_statements | > 200ms |
| Database connection pool utilization | pg.Pool events | > 80% of max |
| Intelligence engine computation time | Application logs | > 100ms |
| Failed authentication attempts | Application logs | > 5 in 15 minutes |
| Disk usage (database server) | System metrics | > 80% |
| Bat-Signal token verification failures (F7) | Application logs | > 20 in 15 minutes (possible token-guessing) |
| Deal Replay reconstruction time (F6) | Application logs | > 250ms (audit-log replay depth) |

---

## 13. Deployment, Infrastructure & Disaster Recovery

### 13.1 Infrastructure Architecture

```
┌──────────────────────────────────────────────────────────────┐
│                     PRODUCTION ENVIRONMENT                    │
│  ┌──────────────┐      ┌──────────────────────────────────┐  │
│  │   Reverse    │      │    Application Server            │  │
│  │   Proxy      │──────│  Node.js 20 + Express 5         │  │
│  │  (nginx)     │      │  PM2 process manager             │  │
│  │  SSL/TLS     │      │  2 instances (cluster mode)      │  │
│  └──────────────┘      └──────────────┬───────────────────┘  │
│                                       │                      │
│                              ┌────────▼────────┐            │
│                              │   PostgreSQL 16  │            │
│                              │   Primary +      │            │
│                              │   Read Replica   │            │
│                              │   (optional V2)  │            │
│                              └─────────────────┘            │
│  ┌──────────────┐      ┌─────────────────┐                  │
│  │   Secrets    │      │   Backup Store   │                  │
│  │   Manager    │      │  (S3 / GCS)     │                  │
│  └──────────────┘      └─────────────────┘                  │
└──────────────────────────────────────────────────────────────┘
```

> **Phase 1 invariant.** This topology is unchanged by F1–F14. No Redis, message queue, event bus, or headless-browser worker is introduced (those are Phase 2, §26–29). The F9 simulator runs in the browser; F6 Replay is read-time computation in the existing app tier.

### 13.2 Deployment Process

```bash
# CI/CD Pipeline (GitHub Actions or equivalent)

# 1. On push to main:
npm run lint                     # ESLint + Prettier check
npm run test:unit                # Vitest unit tests
npm run test:integration         # Supertest API tests (against test DB)
npm run build                    # Vite production build

# 2. On release tag (v*.*.*):
npm run test:e2e                 # Playwright E2E tests (against staging)
npm run db:migrate               # Run pending migrations against staging
npm run deploy:staging           # Deploy to staging environment

# 3. Manual promotion to production:
npm run db:migrate:prod          # Run pending migrations (with --dry-run first)
npm run deploy:prod              # Blue-green deployment via PM2 reload
```

### 13.3 Database Migration Strategy

```bash
# Using node-pg-migrate

# Create a new migration
npx node-pg-migrate create add-deal-tags-table

# Run migrations (development)
DATABASE_URL=postgresql://localhost:5432/edc_dev npx node-pg-migrate up

# Run migrations (staging)
DATABASE_URL=$STAGING_DB_URL npx node-pg-migrate up

# Run migrations (production — with dry run first)
DATABASE_URL=$PROD_DB_URL npx node-pg-migrate up --dry-run
DATABASE_URL=$PROD_DB_URL npx node-pg-migrate up
```

> **v4.0 migration ordering note.** The F10 `loss_archetypes` table must be created **before** the `enterprise_deals.loss_archetype_id` FK is added (sequence the migration accordingly). All other enhancement tables (F1/F3/F6/F7/F12) and columns (F4/F5/F14) are additive and may be applied in a single forward migration with no data backfill required.

### 13.4 Backup & Disaster Recovery

| Component | Strategy | RPO | RTO |
|---|---|---|---|
| **Database** | Daily full dump (`pg_dump`) + continuous WAL archiving to object storage | 5 minutes (WAL) / 24 hours (full dump) | 1 hour |
| **Application** | Stateless; redeploy from CI/CD pipeline | N/A (no state) | 15 minutes |
| **Secrets** | Stored in secrets manager with automatic versioning | Immediate | 15 minutes |
| **Static Assets** | Built in CI; served from nginx with cache | N/A | 5 minutes |

#### Backup Procedures

```bash
# Daily full backup (cron job: 0 2 * * *)
pg_dump -h $DB_HOST -U $DB_USER -d edc -F c -f /backups/edc_$(date +%Y%m%d).dump

# Backup retention: 30 days rolling
find /backups -name "edc_*.dump" -mtime +30 -delete

# WAL archiving (PostgreSQL config)
# archive_mode = on
# archive_command = 'cp %p /wal_archive/%f'
# Configure periodic upload to S3/GCS via cron

# Point-in-time recovery test (quarterly)
# 1. Restore full dump
# 2. Replay WAL files to target timestamp
# 3. Verify data integrity
```

> **F14 retention window note.** Soft-deleted rows (`deleted_at` set) remain in the database and are recoverable via `POST /deals/:id/restore`. A recommended **90-day** retention window applies before a maintenance job may hard-purge `deleted_at < now() - 90 days` (purge is an operational decision, out of the request/response path). Archived rows (`archived_at`) are retained indefinitely and are always restorable.

### 13.5 Environment Variables Reference

```bash
# Application
NODE_ENV=production
PORT=3000
EDC_APP_ORIGIN=https://edc.internal.company.com

# Database
DATABASE_URL=postgresql://edc_app:***@db-host:5432/edc

# Authentication
EDC_JWT_PRIVATE_KEY="-----BEGIN RSA PRIVATE KEY-----\n..."
EDC_JWT_PUBLIC_KEY="-----BEGIN PUBLIC KEY-----\n..."
EDC_JWT_EXPIRY=8h
EDC_BATSIGNAL_EXPIRY=48h          # F7 — Bat-Signal share token lifetime
EDC_SHARE_BASE_URL=https://edc.internal.company.com/share  # F7 — public link base

# Monitoring
SENTRY_DSN=https://***@sentry.io/***
LOG_LEVEL=info

# Rate Limiting
RATE_LIMIT_WINDOW_MS=900000
RATE_LIMIT_MAX=100
```

---

## 14. Delivery Milestones, Phased Execution & Acceptance Criteria

### 14.1 Overview

```
+--------------------------------------------------------------------------------------------+
|                                    DELIVERY TIMELINE                                       |
+--------------------------------------------------------------------------------------------+
|  PHASE 1: FOUNDATION                                              [ WEEK 1 – 2 ]          |
|  PHASE 2: COCKPIT UI                                              [ WEEK 3 – 4 ]          |
|  PHASE 3: INTELLIGENCE ENGINE & BLOCKERS                          [ WEEK 5 ]              |
|  PHASE 4: EXECUTIVE BRIEFING MODE                                 [ WEEK 6 ]              |
|  PHASE 5: HARDENING & TESTING                                     [ WEEK 7 ]              |
|  PHASE 6: UAT & LAUNCH                                            [ WEEK 8 ]              |
+--------------------------------------------------------------------------------------------+
```

> **v4.0 enhancement mapping (no new phase).** The 14 enhancements slot into the existing 6 phases:
> - **Phase 1 (Foundation):** F1 `fx_rates`/`reporting_currency`, F4 `prerequisite_gate_codes`, F3 `deal_alert_dispositions`, F6 `deal_review_markers`, F7 `intervention_checklists`/`deal_interventions`, F10 `loss_archetypes` + `loss_archetype_id`, F12 `deal_stage_overrides`, F14 `deleted_at`/`archived_at` + soft-delete/restore endpoints, F5 `speaker_notes` column.
> - **Phase 2 (Cockpit UI):** F1 normalized-TCV display + FX panel, F4 gate prerequisite chains, F5 `SpeakerNotesEditor`, F13 whitespace/attach-rate UI, F14 Recycle Bin view.
> - **Phase 3 (Intelligence Engine):** F1 normalized threshold comparisons, F2 `explain()`, F3 disposition logic + `AuditTrailViewer`, F8 `SLOW_MOTION_COLLISION` + `calculateOwnMomentum`, F9 pure-function refactor + `useSimulatorStore` + Simulate toggle, F12 synchronous guardrail, F13 `LOW_ATTACH_ELEPHANT`, F11 `portfolio-analysis`, F10 `analytics/autopsy`.
> - **Phase 4 (Briefing Mode):** F5 agenda/queue + pacing + private speaker-notes pane (and PDF exclusion), F6 Change Digest strip + Deal Replay Rewind, F7 Bat-Signal share + intervention modal.
> - **Phase 5 (Hardening):** all new pattern/endpoint/component tests folded into the coverage gates (§11.5).
> - **Phase 6 (UAT & Launch):** F-feature acceptance folded into the observed UAT workflow.

### 14.2 Phase Details & Acceptance Criteria

#### PHASE 1: Foundation (Weeks 1–2)

**Deliverables:**
- PostgreSQL schema (revised v4.0) deployed via `node-pg-migrate`, including all enhancement tables/columns
- Seed data for all lookup tables (incl. `loss_archetypes`, `intervention_checklists`, gate `prerequisite_gate_codes`)
- Express application scaffold with middleware stack (helmet, cors, rate-limit, request logging)
- Authentication system (JWT issuance, login/logout, auth middleware) + Bat-Signal token machinery (F7)
- Full CRUD API for `enterprise_deals` with zod validation, soft-delete/restore (F14), stage guardrail (F12), Closed-Lost archetype enforcement (F10)
- Full CRUD API for `deal_technical_gates` (individual + batch) with integrity warnings (F4)
- Full CRUD API for `deal_blockers`, `deal_cross_sells`
- Disposition (F3), intervention-launch (F7), review-marker (F6), FX-rate (F1) endpoints
- Audit log middleware (writes to `deal_audit_log` on every field mutation; also dispositions/overrides/regressions)
- Lookup data endpoints (incl. FX rates, loss archetypes, intervention checklists)
- Health check endpoint
- `Docker Compose` for local development (app + PostgreSQL)

**Acceptance Criteria:**
| # | Criterion | Verification |
|---|---|---|
| 1.1 | All PostgreSQL constraints fire on invalid data | Integration tests that violate each constraint and verify rejection |
| 1.2 | All API routes return correct HTTP status codes for valid, invalid, and unauthorized requests | Supertest integration tests (≥ 85% coverage) |
| 1.3 | Authentication flow works end-to-end | E2E: login → receive cookie → authenticated request → logout → request rejected |
| 1.4 | Audit log records every field change with old/new values and user attribution | Integration test: update deal → verify audit row |
| 1.5 | Batch gate update works correctly + returns integrity warnings (F4) | Integration test: batch update 3 gates → verify all 3 changed; out-of-order produces warning |
| 1.6 | Rate limiting rejects excessive requests | Integration test: 101 requests in 15 minutes → verify 429 |
| 1.7 | Soft-delete hides + restore recovers (F14) | Integration test: delete → absent from default list → restore → present |
| 1.8 | Stage guardrail blocks without reason / allows with reason (F12) | Integration test: 409 then 200 + override row |

#### PHASE 2: Cockpit UI (Weeks 3–4)

**Deliverables:**
- React application scaffold (Vite, Tailwind, routing)
- Zustand store architecture (global, active deal, UI state) + `useSimulatorStore` scaffold (F9)
- Cockpit layout shell (header, navigation, workspace)
- Account Navigation Array (deal tabs with health indicators; sorted by normalizedTCV)
- New Deal modal form
- Team & Infrastructure section (AM, TL, CRM link fields)
- Technical Gate Matrix (9-point checkbox grid, progress bar, milestone label, prerequisite chains F4)
- Financial Split Architecture (all financial fields, radio groups, dropdowns, normalized-TCV line F1, whitespace/attach-rate F13)
- Cross-sell product selector
- Strategic Blueprint Notes textarea + private Speaker Notes editor (F5)
- FX Rates panel beside threshold-tuning UI (F1)
- Recycle Bin / Archive view (F14)
- Auto-save with debounce and undo
- Dirty-field visual indicators; deal switching with unsaved-changes prompt
- Keyboard shortcuts (`Ctrl+K`, arrow keys, `Ctrl+S`)
- All lookup data integrated; empty states for all scenarios (incl. new ones)

**Acceptance Criteria:**
| # | Criterion | Verification |
|---|---|---|
| 2.1 | Commander can create a deal, fill all fields, and see it in the navigation | Manual test + E2E |
| 2.2 | Checkbox toggles update optimistically and sync to server within 1 second | E2E with network interception |
| 2.3 | Auto-save fires on field blur and shows undo toast | Manual test + component test |
| 2.4 | Dirty fields show visual indicator | Component test |
| 2.5 | Deal switch with unsaved changes shows confirmation prompt | E2E |
| 2.6 | Currency fields format correctly on blur; normalized line shows (F1) | Component test |
| 2.7 | All keyboard shortcuts function correctly | E2E |
| 2.8 | No console errors in development mode | Manual verification |
| 2.9 | Recycle Bin lists removed deals and restores them (F14) | E2E |

#### PHASE 3: Intelligence Engine & Blockers (Week 5)

**Deliverables:**
- Intelligence Engine service (composable pattern system with all 12 patterns, incl. F8/F13)
- Pure-function refactor of `processDealIntelligence` for client-side reuse (F9)
- `explain()` on every built-in pattern (F2)
- `GET /api/v1/deals/:id/intelligence` endpoint (with normalizedTCV, crossSell, explanation, dispositions, integrityWarnings)
- `GET /api/v1/intelligence/summary` endpoint (normalized totals + changesSinceLastReview)
- `GET /api/v1/intelligence/portfolio-analysis` (F11) and `GET /api/v1/analytics/autopsy` (F10)
- Threshold configuration UI + FX rates UI (accessible from cockpit settings)
- Pattern Engine Advisory section with glass-box disclosure + disposition controls + Launch Intervention (F2/F3/F7)
- AuditTrailViewer over the existing audit endpoint (F3)
- Risk Simulator (Simulate toggle + `useSimulatorStore`) (F9)
- Synchronous stage guardrail + override dialog (F12)
- Blocker CRUD UI within deal workspace
- Global TCV and alert count in CockpitHeader (normalized + unmanaged)

**Acceptance Criteria:**
| # | Criterion | Verification |
|---|---|---|
| 3.1 | Each of the 12 risk patterns fires correctly with expected severity | Unit tests (36+ test cases) |
| 3.2 | Multiple patterns fire simultaneously for a single deal | Unit test: construct deal matching ≥3 patterns → verify all returned |
| 3.3 | Milestone advances only when ALL gates in a group are complete | Unit test |
| 3.4 | Threshold changes via UI immediately affect pattern evaluation | Integration test |
| 3.5 | Blocker CRUD operations work in the UI | E2E |
| 3.6 | Global TCV in header updates when deal financials change | E2E |
| 3.7 | Every pattern returns a non-empty explanation with ≥1 input + clearsWhen (F2) | Unit test per pattern |
| 3.8 | Accepting a deal's only RED moves it to Managed and recomputes health (F3) | Unit + integration test |
| 3.9 | normalizedTCV drives elephant/mega comparisons (F1) | Unit test (€480K @1.09 crosses 500K) |
| 3.10 | Risk Simulator previews Health+Alerts client-side and persists nothing (F9) | Component + E2E test |
| 3.11 | Portfolio analysis + autopsy return deterministic aggregates (F10/F11) | Integration test against seeded data |

#### PHASE 4: Executive Briefing Mode (Week 6)

**Deliverables:**
- Briefing Mode component tree (separate route or overlay)
- Briefing Mode layout (header, progress bar, risk advisory with enlarged clearsWhen F2, strategic ask, navigation)
- Curated agenda/queue builder + session pacing timer + private speaker-notes pane (F5)
- Fullscreen API integration
- Deal navigation (left/right, queue indicator, GREEN deal skip, curated order F5)
- Cross-fade transitions between deals
- Change Digest "Since last review" strip + pre-briefing "What moved" summary (F6)
- Deal Replay Rewind timeline slider + amber Replay-Mode border (F6)
- Bat-Signal share link mint/copy + public risk-card route + intervention modal (F7)
- PDF export functionality (speaker_notes excluded, F5)
- Print stylesheet

**Acceptance Criteria:**
| # | Criterion | Verification |
|---|---|---|
| 4.1 | Briefing Mode displays correct data for the selected deal | E2E |
| 4.2 | Left/right navigation cycles through deals, honoring curated order (F5) | E2E |
| 4.3 | GREEN deals can be filtered out + curated include/exclude works (F5) | Manual test |
| 4.4 | Text is readable at 1080p from 8 feet (minimum 18px body) | Manual test on projector |
| 4.5 | PDF export generates clean document; speaker_notes ABSENT from PDF DOM (F5) | Manual + snapshot of PDF DOM |
| 4.6 | Entry/exit transitions are smooth (300ms, no jank) | Manual test |
| 4.7 | Change Digest returns readable lines since marker; Mark reviewed resets (F6) | Integration test |
| 4.8 | Deal Replay reconstructs past state from audit deltas; distinct Replay border (F6) | E2E + unit test |
| 4.9 | Bat-Signal link renders only the risk card, read-only, and expires at 48h (F7) | Integration test (valid, expired, tampered token) |

#### PHASE 5: Hardening & Testing (Week 7)

**Deliverables:**
- Unit test suite at ≥ 95% coverage for Intelligence Engine (all 12 patterns + explain + momentum helper)
- Integration test suite at ≥ 85% coverage for API routes (incl. all enhancement endpoints)
- E2E test suite covering all critical user journeys (incl. F3/F5/F6/F9/F12/F14 journeys)
- Sentry integration verified (test error → appears in Sentry dashboard)
- Performance profiling (API response times, query times, Deal Replay reconstruction time F6)
- Database index verification (EXPLAIN ANALYZE on key queries incl. idx_deals_live, idx_fx_rates_lookup)
- Security audit (OWASP top 10 checklist) + Bat-Signal token isolation review (F7)
- Load testing (simulate 100 concurrent requests)

**Acceptance Criteria:**
| # | Criterion | Verification |
|---|---|---|
| 5.1 | All CI tests pass on clean checkout | CI pipeline green |
| 5.2 | Intelligence Engine coverage ≥ 95% | Coverage report |
| 5.3 | API route coverage ≥ 85% | Coverage report |
| 5.4 | E2E critical journeys pass | Playwright report |
| 5.5 | API p95 response time < 200ms for read operations | Load test report |
| 5.6 | API p95 response time < 500ms for write operations | Load test report |
| 5.7 | No OWASP top 10 vulnerabilities; Bat-Signal token cannot reach cockpit/mutations (F7) | Security checklist |
| 5.8 | Sentry captures test errors correctly | Manual verification |

#### PHASE 6: UAT & Launch (Week 8)

**Deliverables:**
- Staging environment with production-like data (10-15 realistic deals seeded, multiple currencies for F1)
- Commander user acceptance testing (2-3 sessions)
- Bug fixes from UAT feedback
- Production environment provisioning
- Database migration executed on production
- Production deployment
- Monitoring dashboards verified
- Backup verification (first production backup + restore test)

**Acceptance Criteria:**
| # | Criterion | Verification |
|---|---|---|
| 6.1 | Commander completes a full workflow without assistance (create deal → track gates → govern risk → run briefing → export PDF) | Observed UAT session |
| 6.2 | Commander rates usability ≥ 8/10 for daily use | Feedback form |
| 6.3 | Production deployment completes without errors | Deployment log |
| 6.4 | Health check returns 200 in production | curl verification |
| 6.5 | First production backup completes and is verified | Backup log + restore test |

---

## 15. Risk Register & Mitigation Strategies

| # | Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|---|
| R1 | Gate schema normalization increases initial development complexity | Medium | Low | Well-defined schema provided in PRD; seed data included; migration tooling specified |
| R2 | Intelligence engine pattern rules produce false positives, eroding Commander trust | Medium | High | Comprehensive test suite per pattern; threshold tuning UI; F2 glass-box explanations make every alert auditable; F3 disposition lets the Commander govern accepted risk |
| R3 | Auto-save creates data integrity issues (partial saves, race conditions) | Low | High | Debounce prevents rapid-fire saves; optimistic updates with rollback on failure; batch gate updates use atomic server-side transactions |
| R4 | Briefing Mode fails during live executive presentation (network error, rendering bug) | Low | Critical | Pre-fetch all deal data before entering Briefing Mode; cache locally; provide offline fallback; test with airplane-mode simulation |
| R5 | Commander leaves the organization; no one else can operate the system | Medium | Medium | Document operational runbook; export capability (PDF, CSV) ensures portability; design allows adding Commander roles in V2 |
| R6 | Database performance degrades as deal count grows beyond 100 | Low | Medium | Indexes on all high-query columns (incl. idx_deals_live); intelligence results could be cached for V2; current query patterns simple for 1000+ deals |
| R7 | Revised 8-week timeline may face pressure | Medium | Medium | Phased delivery allows launching a functional product at Week 6; Phases 5-6 are hardening, not features |
| R8 | Security breach exposes sensitive deal financial data | Low | Critical | Defense in depth: JWT auth, HTTPS, rate limiting, input validation, RLS, audit log, Sentry, secrets management, security audit |
| **R9** | **Missing or stale FX rates silently distort the headline TCV and threshold-based alerts (F1)** | Medium | High | `MISSING_FX_RATE` is a **non-blocking, visible** data-quality note (never silent fallback to a wrong number); FX rates are Commander-tunable via `PUT /lookups/fx-rates`; unit tests cover the missing-rate path; reporting currency is explicit in every header label |
| **R10** | **Bat-Signal share link leaks deal data beyond its intended recipient (F7)** | Low | High | Distinct token audience/claims, 48-hour hard expiry, single-deal + read-only scope, dedicated rate limiter, public route renders only the risk card; session middleware rejects the token and the share route rejects session cookies; verification-failure metric alerts on guessing |
| **R11** | **Deal Replay reconstructs an inaccurate past state because the audit log lacks a delta for some field (F6)** | Medium | Medium | Replay is explicitly a **best-effort read-time projection** with an amber "Replay Mode" treatment signalling reconstruction (not authoritative); fields without audit coverage display "as-of-now" with a caveat; P2's durable snapshot backbone supersedes Replay where exactness is required |
| **R12** | **Commanders over-use the F12 override to bypass guardrails, hollowing out the control** | Medium | Medium | Every override requires a typed rationale (≥10 chars), is written to `deal_stage_overrides` AND `deal_audit_log`, and is surfaced in the `AuditTrailViewer` (F3) for periodic self-review; guardrail remains a **warning-with-friction**, preserving Commander authority per design principle 1.4 |
| **R13** | **Scope creep: an enhancement drifts into Phase 2 territory (e.g., notifications, saved scenarios, cohort benchmarks)** | Medium | High | The §1A charter is authoritative and embedded in both PRDs; every §17 subsection states its charter row (Cx) and the exact V2 section it avoids; code review checklist asserts no persistence of scenarios/scores, no delivery/escalation, no cross-deal benchmarks |

---

## 16. Appendices

### Appendix A: File & Directory Structure

```
edc/
├── .github/
│   └── workflows/
│       ├── ci.yml                    # Lint, test, build on every push
│       └── deploy.yml                # Deploy on release tag
├── docker-compose.yml                # Local development (app + PostgreSQL)
├── Dockerfile                        # Multi-stage production build
├── docs/
│   ├── PRD-v4.0.md                   # This document
│   ├── API.md                        # OpenAPI/Swagger specification
│   └── RUNBOOK.md                    # Operational runbook
├── server/
│   ├── src/
│   │   ├── index.js                  # Express app entry point
│   │   ├── config/
│   │   │   ├── database.js           # pg.Pool configuration
│   │   │   ├── auth.js               # JWT key loading (session + bat-signal, F7)
│   │   │   └── env.js                # Environment variable validation
│   │   ├── middleware/
│   │   │   ├── auth.js               # JWT verification middleware
│   │   │   ├── batSignalAuth.js      # F7 — verifies the share token only
│   │   │   ├── audit.js              # Audit log writer middleware
│   │   │   ├── stageGuardrail.js     # F12 — synchronous prospective-state check
│   │   │   ├── security.js           # Helmet, CORS, rate-limit
│   │   │   ├── validation.js         # Zod validation factory
│   │   │   ├── errorHandler.js       # Global error handler
│   │   │   └── requestLogger.js      # pino request logging
│   │   ├── routes/
│   │   │   ├── auth.js
│   │   │   ├── deals.js              # incl. restore/archive (F14)
│   │   │   ├── gates.js              # incl. integrityWarnings (F4)
│   │   │   ├── blockers.js
│   │   │   ├── crossSells.js
│   │   │   ├── dispositions.js       # F3
│   │   │   ├── interventions.js      # F7
│   │   │   ├── batSignal.js          # F7 — mint + public /share/:token
│   │   │   ├── intelligence.js       # incl. portfolio-analysis (F11)
│   │   │   ├── analytics.js          # F10 — autopsy
│   │   │   ├── changes.js            # F6 — changes + review-marker + snapshot
│   │   │   ├── audit.js
│   │   │   ├── lookups.js            # incl. fx-rates (F1), loss-archetypes (F10), checklists (F7)
│   │   │   └── health.js
│   │   ├── services/
│   │   │   ├── dealIntelligenceEngine.js   # pure processDealIntelligence (F9), explain (F2), momentum (F8)
│   │   │   ├── fxService.js                # F1 — rate resolution
│   │   │   ├── changeProjection.js         # F6 — audit-row → readable lines
│   │   │   └── replayService.js            # F6 — reverse-apply audit deltas
│   │   └── db/
│   │       └── migrations/           # node-pg-migrate migration files
│   └── __tests__/
│       ├── factories/
│       │   ├── dealFactory.js
│       │   └── gateFactory.js
│       ├── unit/
│       │   └── patterns/             # One test file per risk pattern (12)
│       ├── integration/
│       │   ├── deals.test.js
│       │   ├── gates.test.js
│       │   ├── blockers.test.js
│       │   ├── dispositions.test.js  # F3
│       │   ├── fxRates.test.js        # F1
│       │   └── auth.test.js
│       └── setup.js                  # Test database setup/teardown
├── client/
│   ├── index.html
│   ├── src/
│   │   ├── main.tsx
│   │   ├── App.tsx
│   │   ├── api/
│   │   │   ├── client.ts             # Fetch wrapper with auth
│   │   │   ├── deals.ts
│   │   │   ├── gates.ts
│   │   │   ├── blockers.ts
│   │   │   └── intelligence.ts
│   │   ├── stores/
│   │   │   ├── useGlobalStore.ts
│   │   │   ├── useActiveDealStore.ts
│   │   │   ├── useUIStore.ts
│   │   │   └── useSimulatorStore.ts  # F9
│   │   ├── hooks/
│   │   │   ├── useGateBatch.ts
│   │   │   ├── useAutoSave.ts
│   │   │   └── useKeyboardShortcuts.ts
│   │   ├── components/
│   │   │   ├── cockpit/
│   │   │   │   ├── CockpitHeader.tsx
│   │   │   │   ├── AccountNavigationArray.tsx
│   │   │   │   ├── DealWorkspace.tsx
│   │   │   │   ├── ChangeDigestStrip.tsx        # F6
│   │   │   │   ├── TeamAndInfrastructure.tsx
│   │   │   │   ├── TechnicalGateMatrix.tsx
│   │   │   │   ├── FinancialSplitArchitecture.tsx
│   │   │   │   ├── PatternEngineAdvisory.tsx
│   │   │   │   ├── StrategicBlueprintNotes.tsx
│   │   │   │   ├── SpeakerNotesEditor.tsx       # F5
│   │   │   │   ├── RiskSimulatorToggle.tsx      # F9
│   │   │   │   ├── AuditTrailViewer.tsx         # F3
│   │   │   │   ├── RecycleBinView.tsx           # F14
│   │   │   │   ├── PortfolioHealthView.tsx      # F11
│   │   │   │   └── ClosedLostAutopsyView.tsx    # F10
│   │   │   ├── briefing/
│   │   │   │   ├── BriefingModeLayout.tsx
│   │   │   │   ├── BriefingHeader.tsx
│   │   │   │   ├── BriefingProgressBar.tsx
│   │   │   │   ├── BriefingRiskAdvisory.tsx
│   │   │   │   ├── BriefingStrategicAsk.tsx
│   │   │   │   ├── BriefingSpeakerNotes.tsx     # F5
│   │   │   │   └── BriefingNavigation.tsx
│   │   │   ├── shared/
│   │   │   │   ├── LoadingSkeleton.tsx
│   │   │   │   ├── Toast.tsx
│   │   │   │   ├── ConfirmDialog.tsx
│   │   │   │   ├── OverrideDialog.tsx           # F12
│   │   │   │   ├── InterventionModal.tsx        # F7
│   │   │   │   ├── CommandPalette.tsx
│   │   │   │   └── EmptyState.tsx
│   │   │   └── auth/
│   │   │       └── LoginPage.tsx
│   │   ├── pages/
│   │   │   ├── CockpitPage.tsx
│   │   │   ├── BriefingPage.tsx
│   │   │   └── SharePage.tsx          # F7 — public Bat-Signal risk card
│   │   ├── styles/
│   │   │   └── globals.css
│   │   └── lib/
│   │       ├── formatCurrency.ts
│   │       └── formatDate.ts
│   └── e2e/
│       └── criticalJourneys.spec.js
├── shared/
│   └── validation/
│       └── dealSchemas.ts            # Shared zod schemas (FE + BE)
├── .env.example
├── .eslintrc.js
├── .prettierrc
├── package.json
├── tsconfig.json                     # Client TypeScript config
└── vite.config.ts
```

### Appendix B: Technology Version Matrix

| Technology | Version | Pinning Strategy |
|---|---|---|
| Node.js | 20 LTS | `.nvmrc` file |
| PostgreSQL | 16 | Docker image tag + server provisioning |
| React | 19.x | `package.json` |
| Vite | 6.x | `package.json` |
| Tailwind CSS | 4.x | `package.json` |
| Express | 5.x | `package.json` |
| Zustand | 5.x | `package.json` |
| zod | 3.x | `package.json` (shared between FE + BE) |
| pino | 9.x | `package.json` |
| vitest | 2.x | `package.json` |
| Playwright | 1.x | `package.json` |
| Recharts | 2.x | `package.json` (F10 autopsy + F11 portfolio views) |

### Appendix C: Future Roadmap (Phase 2 — Sovereign Intelligence Edition)

> **v4.0 update.** The items below are **reserved for Phase 2**. Several capabilities that appeared on the original v3.0 roadmap have been **delivered in Phase 1** and are therefore **removed from this roadmap** — see the "Moved into Phase 1" note that follows the table. All remaining items are governed by the §1A charter and detailed in the companion **Phase 2 PRD**.

| Feature | Description | Complexity |
|---|---|---|
| **Salesforce API Integration** | Read-only sync of pipeline stages and TCV from Salesforce | High |
| **Predictive Close Scoring** | Learned/weighted 0–100 probability with feature breakdown (Phase 2 §4) | High |
| **Velocity & Cohort Benchmarks** | Median stage durations, Pipeline Velocity Index, velocity heatmap vs cohort, via materialized views (Phase 2 §5) | High |
| **Competitive Intelligence** | Competitor module + competitor-triggered patterns (Phase 2 §6) | Medium |
| **Deal Memory / Institutional KB** | Searchable knowledge base of closed deals with lessons (Phase 2 §7) | High |
| **Narrative Win/Loss Post-Mortem** | Free-text narrative + key lessons + recommended playbook, consuming the F10 loss archetype (Phase 2 §8) | Medium |
| **Multi-Commander Mode** | Territory RLS, delegation, regional/product-line roles (Phase 2 §9) | High |
| **Stakeholder Influence Mapping** | Stakeholder maps + stakeholder-triggered patterns (Phase 2 §10) | Medium |
| **Decision Log & Meeting Intelligence** | Structured decision records, meeting capture (Phase 2 §11) | Medium |
| **Custom Risk Pattern Rule Builder** | No-code, Commander-authored runtime rules (Phase 2 §12) | High |
| **Automated Playbook Engine / Next-Best-Action** | Stage-auto-assigned, stateful multi-step lifecycle (Phase 2 §13) | High |
| **Natural-Language Command Interface** | NL commands over deals (Phase 2 §14) | High |
| **Smart Alerts + Escalation + Notifications** | Escalation chains, in-app notification center, notification log (Phase 2 §15) | High |
| **Ramp / Per-Year Pricing** | Per-year pricing schedule for multi-year deals (Phase 2 §16) | Medium |
| **Financial Scenario / What-If Engine** | Saved, persisted financial scenarios; TCV/discount/term modeling (Phase 2 §17) | High |
| **Monte-Carlo Pipeline Simulation** | Probabilistic pipeline-wide simulation (Phase 2 §18) | High |
| **Board-Ready Report Generation** | Puppeteer multi-template PDF (Phase 2 §19) | Medium |
| **Briefing Mode V2 (on-screen data)** | Side-by-side comparison, predictive/competitive overlays, decision/memory context, scenario indicators, drill-down (Phase 2 §20) | High |
| **Email Digest / Scheduled Reporting** | Weekly automated email summaries (Phase 2 §21) | Low |
| **Custom Fields & Tags** | Flexible per-deal metadata (Phase 2 §22) | Medium |
| **Data Import/Export Engine** | CSV/Excel/JSON/PDF import-export (Phase 2 §23) | Medium |
| **Webhook & Integration Framework** | Machine-to-machine event webhooks, incl. Slack/Teams push (Phase 2 §24) | Medium |
| **Mobile Companion / PWA** | Push + offline (Phase 2 §25) | High |
| **Time-Series Backbone** | `deal_snapshots`, `deal_activity_log`, `deal_health_history`, event bus (Phase 2 §26/§28) | High |
| **Redis & Materialized Views** | Caching + analytics materialization, `edc_v2` schema (Phase 2 §29) | High |

> **Moved into Phase 1 (removed from this roadmap):**
> - **Deal Tagging / Custom Fields → partially:** *(remains Phase 2 §22)* — NOT moved; listed above for clarity.
> - **Time-Series Analytics (lightweight "what changed"):** the original roadmap's "historical trend charts" ambition is **not** delivered; however, the honest, read-time "what changed since last review" + point-in-time **Deal Replay** is now delivered in Phase 1 as **F6** (audit-log projection only; the durable time-series backbone remains Phase 2 §26/§29).
> - **Email Digest → reframed:** the original "Weekly Email Digest" is **not** delivered (delivery/notifications are Phase 2 §15/§21); its in-cockpit, non-delivered equivalent — the **Change Digest** prep view — is delivered in Phase 1 as **F6**.
> - **Deal Cloning:** retired from the roadmap; superseded by the recoverable **soft-delete / archive / restore** lifecycle delivered in Phase 1 as **F14** (and by Phase 2 Deal Memory §7 for closed-deal knowledge).
> - **AI-Assisted Notes:** remains Phase 2 (subsumed by NL commands §14 and Briefing V2 §20).
>
> Net effect: the v3.0 roadmap items that were genuinely deliverable as deterministic, self-contained, in-the-moment capabilities (per §1A) have been pulled forward into Phase 1 (F1–F14); everything predictive, persisted-speculative, narrative, automated, multi-actor, or event-driven remains Phase 2.

---

*Continued in Section 17 — Enhanced Capabilities — Detailed Specifications.*

---

## 17. Enhanced Capabilities — Detailed Specifications (F1–F14)

> Each subsection is self-contained and includes: (a) Gap/Rationale, (b) Schema deltas, (c) API deltas, (d) Engine/Logic deltas, (e) UI deltas, (f) Acceptance Criteria, (g) Non-Overlap with Phase 2 (citing the charter row Cx and the V2 section avoided). The §4–§16 inline integrations above are the canonical implementation touch-points; this section is the per-feature design of record.

---

### F1 — Multi-Currency Normalization & Reporting-Currency Rollup

**(a) Gap / Rationale.** v3.0 stores a per-deal `deal_currency CHAR(3)` but `processDealIntelligence()` computes `calculatedTCV` with no currency awareness, `GET /intelligence/summary` sums raw mixed-currency numbers, and the elephant/mega thresholds are implicitly USD. The instant a pipeline contains one non-USD deal (a near-certainty at the targeted scale), the headline number is arithmetically meaningless and `UNPROTECTED_ELEPHANT`/`DISCOUNT_TRAP` fire on unconverted values. This is a **correctness defect**, not a feature gap.

**(b) Schema deltas (SQL DDL).**
```sql
CREATE TABLE edc.fx_rates (
    id SERIAL PRIMARY KEY,
    base_currency  CHAR(3) NOT NULL,
    quote_currency CHAR(3) NOT NULL,
    rate NUMERIC(18,8) NOT NULL CHECK (rate > 0),
    as_of DATE NOT NULL,
    UNIQUE (base_currency, quote_currency, as_of)
);
CREATE INDEX idx_fx_rates_lookup ON edc.fx_rates(base_currency, quote_currency, as_of DESC);

INSERT INTO edc.engine_thresholds (parameter_key, parameter_value, data_type, description) VALUES
    ('reporting_currency', 'USD', 'string', 'Currency used for all portfolio rollups and threshold comparisons');
```

**(c) API deltas.**
- `GET /deals/:dealId/intelligence` → `financials.normalizedTCV`, `financials.reportingCurrency`, `financials.fxRateApplied`; `governance.dataQualityNotes[]` may include `MISSING_FX_RATE`. `calculatedTCV` (native) retained for backward compatibility.
- `GET /intelligence/summary` → `totalTCV` becomes the sum of `normalizedTCV`; adds `reportingCurrency`.
- `GET /lookups/fx-rates` and `PUT /lookups/fx-rates` (`{ updates: [{ base_currency, quote_currency, rate, as_of }] }`) — upsert on the unique key; invokes `invalidateThresholdCache()` so the next read recomputes.

**(d) Engine / Logic deltas.** In `processDealIntelligence`, after native `calculatedTCV`, resolve `fxRate` for `deal_currency → reporting_currency` (newest `as_of ≤ today`, passed in via `ctx.fxRate` so the function stays pure — see F9) and compute `normalizedTCV = calculatedTCV × fxRate`. **All** threshold comparisons (`elephant_tcv_threshold`, `mega_deal_tcv_threshold`) switch to `normalizedTCV`. When no rate exists, fall back to the native value and push a non-blocking `MISSING_FX_RATE` note.

**(e) UI deltas.** An **FX Rates** panel beside the existing threshold-tuning UI (reporting-currency selector + `base → quote @ rate (as_of)` table), in `useGlobalStore` (`fxRates`, `updateFxRates`). `FinancialSplitArchitecture` adds the secondary normalized line beneath the native value. `CockpitHeader` label becomes "Total Monitored TCV (USD)".

**(f) Acceptance Criteria.**
- F1.1 A USD/EUR/GBP pipeline produces a header total equal to the sum of each deal converted at its applicable rate.
- F1.2 `UNPROTECTED_ELEPHANT` fires on the **normalized** value (€480K @1.09 → $523K crosses 500K).
- F1.3 Changing `reporting_currency` re-rolls totals and re-evaluates thresholds without redeploy (cache invalidation reused).
- F1.4 A deal with no FX row shows native value + a non-blocking `MISSING_FX_RATE` note.

**(g) Non-Overlap with Phase 2.** Satisfies **charter C1**. Stays clear of **Phase 2 §16 (ramp/per-year pricing)** and **§17 (persisted financial scenarios)**: F1 aggregates *today's flat committed* TCV across currencies into one rollup; V2 models *future per-year* and *alternative* values within a currency. Different axis; `fx_rates` is unique to Phase 1 and shares no table with V2 finance.

---

### F2 — Glass-Box Explainable Alerts

**(a) Gap / Rationale.** Each `riskPatterns[]` entry exposes only `evaluate()` and `formatMessage()`. The advisory shows message text but not which field/threshold values triggered it, whether a threshold was default or tuned, or what would clear it. The Commander must mentally re-derive the rule to defend a RED to executives.

**(b) Schema deltas.** None. (Provenance is computed by comparing the live `engine_thresholds` value to the seeded constant; no storage needed.)

**(c) API deltas.** Widen `governance.alerts[]` from `{ code, severity, message }` to add `explanation: { inputs[], thresholdsUsed[] (each with source: 'default'|'tuned'), clearsWhen }`. Additive and backward-compatible.

**(d) Engine / Logic deltas.** Every **built-in** pattern gains an `explain(deal, thresholds, blockers, provenance) => { inputs[], thresholdsUsed[], clearsWhen }` method (implemented for all 12 patterns in §6.2). The engine threads a `provenance(key)` helper that returns `'tuned'` when `String(seededDefault) !== String(liveThreshold)`, else `'default'`.

**(e) UI deltas.** `PatternEngineAdvisory` adds an expandable "Why this fired" disclosure (inputs, thresholds with a "tuned" badge, highlighted **Clears when** line) — no new route. `BriefingRiskAdvisory` shows the enlarged `clearsWhen` prominently (executive-facing), with inputs available on the presenter screen.

**(f) Acceptance Criteria.**
- F2.1 Every one of the 12 patterns returns a non-empty `explanation` with ≥1 input and a `clearsWhen` string.
- F2.2 A tuned threshold is labeled `tuned`; an untouched one `default`.
- F2.3 The disclosure renders without a new route or page.
- F2.4 `clearsWhen` for `PREMATURE_COMMERCIAL` names Gate 3 explicitly (snapshot test).

**(g) Non-Overlap with Phase 2.** Satisfies **charter C3**. Explains the **fixed built-in** patterns only; it is NOT **Phase 2 §4 predictive close score** (no probability, no learned weighting) and NOT **Phase 2 §12 rule builder** (authors no new rules). `clearsWhen` is a static remediation string, not a what-if recomputation (§17 untouched).

---

### F3 — Risk Advisory Governance (Acknowledge/Accept/Snooze) + Audit Trail Viewer

**(a) Gap / Rationale.** The advisory is fire-only: a Commander who has consciously accepted a YELLOW has nowhere to record that judgment, so the same alerts re-surface as noise and the `healthStatus` rollup cannot distinguish **unmanaged** risk from **knowingly managed** risk. Executives see undifferentiated red. Separately, dispositions (and the F12 override reasons) have no visible home in the cockpit.

**(b) Schema deltas (SQL DDL).**
```sql
CREATE TABLE edc.deal_alert_dispositions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    deal_id UUID NOT NULL REFERENCES edc.enterprise_deals(id) ON DELETE CASCADE,
    pattern_code VARCHAR(50) NOT NULL,
    disposition VARCHAR(20) NOT NULL CHECK (disposition IN ('acknowledge','accept','snooze')),
    rationale TEXT,                                 -- required for 'accept'
    snooze_until_field_change TEXT,                 -- state-based: e.g. 'G3_PERFORMANCE_PASSED'
    created_by VARCHAR(255) NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    UNIQUE (deal_id, pattern_code)
);
```
Snooze is **state-based** (mute until a named field changes), deliberately avoiding any timer/escalation semantics. Disposition changes are written to the existing `deal_audit_log` (entity_type `alert_disposition`) — no new audit infrastructure.

**(c) API deltas.**
- `PUT /deals/:dealId/alerts/:patternCode/disposition` — `{ disposition, rationale?, snooze_until_field_change? }`; validated by `DispositionSchema` (discriminated union; `accept` requires `rationale` (≥10 chars), `snooze` requires `snooze_until_field_change`).
- `DELETE /deals/:dealId/alerts/:patternCode/disposition` — clears a disposition (re-activates the alert; audited).
- `GET /deals/:dealId/intelligence` → each alert gains `disposition: { state, rationale, snoozeUntilFieldChange } | null`; `governance` gains `managedAlerts[]` and `unmanagedAlertCount`.
- `GET /deals/:dealId/audit` gains optional `field_changed`, `since`, `until` filters (consumed by the AuditTrailViewer).

**(d) Engine / Logic deltas.** After evaluation, fetch dispositions (passed in via `ctx.dispositions` to keep the engine pure). An alert with `acknowledge`/`accept`, or a `snooze` whose named field has not yet changed, is **managed**. `healthStatus` is computed from **unmanaged** alerts only; the managed RED still appears under Managed Risks. State-based snoozes auto-clear when the named field changes: the deal PUT/gate handlers detect that `snooze_until_field_change` matches a changed field and `DELETE` the disposition (re-activating the alert) — no scheduler required.

**(e) UI deltas.** `PatternEngineAdvisory` adds a disposition control (Acknowledge / Accept… / Snooze…); managed alerts move to a distinct "Managed Risks" subsection showing rationale + actor. `CockpitHeader` "Critical Alerts" and tab health borders reflect **unmanaged** counts. A new cockpit **`AuditTrailViewer`** component consumes the existing `GET /deals/:dealId/audit` (filter by field/date) — giving dispositions **and** the F12 override reasons a single visible home.

**(f) Acceptance Criteria.**
- F3.1 `Accept` without a rationale is rejected with 400.
- F3.2 A deal whose only RED is accepted reports a downgraded `healthStatus`, while the accepted RED still appears under Managed Risks.
- F3.3 A state-based snooze remains managed until the named field changes, then auto-re-activates.
- F3.4 Every disposition action writes a `deal_audit_log` row with actor and old/new values; the AuditTrailViewer renders dispositions + overrides + regressions.

**(g) Non-Overlap with Phase 2.** Satisfies **charter C4**. In-cockpit advisory state + audit only — NO notifications, escalation chains, recipients, or delivery, all of which are **Phase 2 §15 (Smart Alerts + Escalation Chains)** and **§21 (email digests)**. `deal_alert_dispositions` is distinct from V2's `notification_rules`/`notification_log`. V2's "acknowledgment" cancels escalation steps; F3's disposition governs the cockpit pattern itself and is meaningful with no notification system present.

---

### F4 — Gate Dependency & Integrity Model

**(a) Gap / Rationale.** The nine gates are toggled independently. Nothing prevents or flags logically impossible states: `G3_PERFORMANCE_PASSED` can be checked while `G1_CRITERIA_LOCKED` is not, and a passed gate can be silently un-checked (regression). The gate framework is EDC's signature IP, yet it can tell a story that cannot be true.

**(b) Schema deltas (SQL DDL).**
```sql
ALTER TABLE edc.gate_definitions
    ADD COLUMN prerequisite_gate_codes TEXT[] NOT NULL DEFAULT '{}';
-- Seed natural G1→G5 ordering (data, not schema change) — full seed in §4.2.
UPDATE edc.gate_definitions SET prerequisite_gate_codes = '{G1_CRITERIA_LOCKED}'  WHERE gate_code = 'G1_EXECUTIVE_AGREED';
-- … through G5_CTO_SIGNED_OFF
```

**(c) API deltas.**
- `PUT /deals/:dealId/gates/:gateCode` and `.../gates/batch` → response gains `integrityWarnings: [{ gateCode, type: 'out_of_order'|'regression', message }]`.
- `GET /deals/:dealId/intelligence` → `technicalTrack.integrityWarnings[]`.

**(d) Engine / Logic deltas.** On gate write, compare against `prerequisite_gate_codes`: completing a gate while a prerequisite is incomplete → `out_of_order`; a complete → incomplete transition → `regression` (also audited). These are **non-blocking warnings**, preserving Commander authority (design principle 1.4). Read-time `out_of_order` warnings are also recomputed inside `processDealIntelligence` (see §6.2) so they render in the cockpit and briefing.

**(e) UI deltas.** `TechnicalGateMatrix` renders prerequisite chains (subtle connectors), an "out-of-order" badge on prematurely-completed gates, and a distinct style for regressed gates. A distinctly-styled integrity strip in the advisory area (separate from risk patterns — this is data-quality, not deal risk).

**(f) Acceptance Criteria.**
- F4.1 Marking `G3_PERFORMANCE_PASSED` while `G1_CRITERIA_LOCKED` is incomplete returns `out_of_order` but still persists the toggle.
- F4.2 Un-checking a completed gate returns `regression` and writes an audit row.
- F4.3 Prerequisites are data-driven: editing `prerequisite_gate_codes` changes validation with no code change.
- F4.4 A correctly-ordered completion produces zero integrity warnings.

**(g) Non-Overlap with Phase 2.** Satisfies **charter C5** (entirely Phase 1). Structural gate metadata + write-time validation native to the existing gate engine. NOT **Phase 2 §12 rule builder** (which authors arbitrary new risk patterns over deal fields); F4 adds no authorable rules and no new pattern type — it enforces the prerequisite structure of the fixed gate set, which V2 never touches.

---

### F5 — Presenter-Grade Briefing Ergonomics

**(a) Gap / Rationale.** Briefing Mode renders deals but gives the Commander no tools to *run the meeting*: no curated review order (only TCV sort + skip-GREEN), no private talking points (the only notes field, `manager_strategic_blueprint`, is projected *to* executives as the "Strategic Ask"), and no sense of pacing. For a product branded "War Room," these are the missing affordances.

**(b) Schema deltas (SQL DDL).**
```sql
ALTER TABLE edc.enterprise_deals
    ADD COLUMN speaker_notes TEXT;   -- Commander-private; excluded from projection + PDF
```
(Agenda ordering and the timer are session/UI state — no persistence required.)

**(c) API deltas.** `speaker_notes` added to `UpdateDealSchema`/`CreateDealSchema` (zod) and the deal PUT handler; auto-saved via the existing blur/debounce path. **Explicitly excluded** from the briefing/PDF assembly path — enforced by not selecting it into `BriefingStrategicAsk` data or the PDF query.

**(d) Engine / Logic deltas.** None to the intelligence engine. The briefing data assembler omits `speaker_notes` from the projected/exported data set; the presenter pane queries it separately.

**(e) UI deltas.**
- **Agenda:** a pre-briefing "Build Agenda" panel — reorder deals (drag handles) and toggle per-deal inclusion; `useUIStore` gains an ordered `briefingQueue[]` plus `setBriefingQueue`/`toggleBriefingInclusion`.
- **Speaker notes:** a presenter-only pane in Briefing Mode (`BriefingSpeakerNotes`) and a `SpeakerNotesEditor` in the cockpit, visually separated from `BriefingStrategicAsk`; the PDF export and projected view omit it entirely.
- **Pacing:** an unobtrusive "N of M · MM:SS elapsed" indicator in `BriefingNavigation` (`pacing` in `useUIStore`); ephemeral, resets on exit.

**(f) Acceptance Criteria.**
- F5.1 The Commander can reorder/exclude deals; Briefing Mode honors the curated `briefingQueue` order.
- F5.2 `speaker_notes` appears on the presenter view but is absent from the exported PDF DOM and the projected layout.
- F5.3 The pacing indicator advances with navigation and resets on exit.
- F5.4 Speaker notes auto-save on blur with the existing undo toast.

**(g) Non-Overlap with Phase 2.** Satisfies **charter C15**. Operates on the presenter-ergonomics axis; NOT **Phase 2 §20 Briefing Mode V2** (which adds *on-screen data*: comparison, predictive/competitive overlays, decision/memory context, scenario indicators, drill-down) and NOT **§11 decision log**. `speaker_notes` is a single private text field with no V2 analog; the agenda orders existing deals (not V2's comparison view); the timer is ephemeral.

---

### F6 — Temporal Intelligence: Change Digest + Deal Replay

**(a) Gap / Rationale.** EDC captures a comprehensive, immutable `deal_audit_log` but never surfaces it as a review aid. The most common prep question — *"what moved on this deal since I last looked?"* — has no fast answer, and there is no way to see a deal's *past* state. The most valuable data EDC already stores is effectively invisible.

**(b) Schema deltas (SQL DDL).**
```sql
CREATE TABLE edc.deal_review_markers (
    deal_id UUID PRIMARY KEY REFERENCES edc.enterprise_deals(id) ON DELETE CASCADE,
    last_reviewed_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    reviewed_by VARCHAR(255) NOT NULL
);
```
**Explicitly NO** `deal_snapshots`, event bus, `deal_health_history`, `deal_activity_log`, or materialized views. Both Change Digest and Deal Replay are pure read-time projections of `deal_audit_log`.

**(c) API deltas.**
- (Change Digest) `GET /deals/:dealId/changes?since=<ISO>` (default `since` = `last_reviewed_at`) → grouped human-readable change lines, reverse-chron; `POST /deals/:dealId/review-marker` upserts `last_reviewed_at = NOW()`; `GET /intelligence/summary` → optional `changesSinceLastReview` rollup.
- (Deal Replay) `GET /deals/:dealId/snapshot?date=YYYY-MM-DD` reconstructs the deal's state at that date by reverse-applying `deal_audit_log` deltas to current state (gates, financials, stage).

**(d) Engine / Logic deltas.** A `changeProjection` module maps raw audit rows to readable lines (`expected_close_date` old/new → "close date pulled in 14 days"; gate completion → "Gate N cleared"; blocker insert → "high-severity blocker added"). A `replayService` walks `deal_audit_log` newest→oldest from current state, inverting each delta until the target date, producing a reconstructed snapshot object. Both are pure functions over existing data.

**(e) UI deltas.** A collapsible **"Since last review"** strip atop `DealWorkspace` (`ChangeDigestStrip`) with a "Mark reviewed" action; a pre-briefing "What moved" summary. A **"Rewind"** button opens a timeline slider; `useActiveDealStore.replayOverride` swaps live data for reconstructed snapshot data, rendered with a distinct amber/"retro" **Replay-Mode** border. `Escape`/deal-switch exits Replay.

**(f) Acceptance Criteria.**
- F6.1 With three audited changes since the marker, `/changes` returns exactly three readable lines, reverse-chron.
- F6.2 "Mark reviewed" advances `last_reviewed_at`; a subsequent call returns zero changes until new edits occur.
- F6.3 The projection renders gate, financial, and blocker changes in plain language (unit tests per field type).
- F6.4 `GET /snapshot?date=` reconstructs a past gate/financial/stage state; entering Replay shows the amber border and no write path beyond the review marker exists.

**(g) Non-Overlap with Phase 2.** Satisfies **charter C8**. Reads **only** the existing `deal_audit_log` + a tiny marker table. NO event bus (**Phase 2 §28**), NO `deal_snapshots`/`deal_health_history`/`deal_activity_log` (**§26**), NO materialized views (**§29**), NO velocity/trend analytics (**§5**). It is a deliberately lightweight read-time projection that V2's durable snapshot/analytics backbone later **supersedes** (replaces, not duplicates).

---

### F7 — Rapid Intervention Checklists + Bat-Signal

**(a) Gap / Rationale.** When a RED fires, the Commander has no structured, repeatable first response, and no fast way to put one deal's risk in front of an executive who is not an EDC user — without exposing the cockpit or minting a real session.

**(b) Schema deltas (SQL DDL).**
```sql
CREATE TABLE edc.intervention_checklists (
    id SERIAL PRIMARY KEY,
    trigger_pattern_code VARCHAR(50) NOT NULL,   -- a built-in riskPatterns[].code
    name VARCHAR(150) NOT NULL,
    steps JSONB NOT NULL,                        -- STATIC pre-defined steps
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    UNIQUE (trigger_pattern_code, name)
);
CREATE TABLE edc.deal_interventions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    deal_id UUID NOT NULL REFERENCES edc.enterprise_deals(id) ON DELETE CASCADE,
    pattern_code VARCHAR(50) NOT NULL,
    checklist_id INT NOT NULL REFERENCES edc.intervention_checklists(id),
    launched_by VARCHAR(255) NOT NULL,
    launched_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);
```
Checklists are **static** and keyed to a built-in alert code (e.g., `PREMATURE_COMMERCIAL` → ["Pause quoting","Schedule CTO sync","Send architecture whitepaper", …]). `deal_interventions` is a **launch log only**.

**(c) API deltas.**
- (Interventions) `POST /deals/:id/interventions` `{ pattern_code, checklist_id }` → logs that an intervention was initiated (log only). `GET /lookups/intervention-checklists` lists checklists; `/intelligence` alerts include `intervention: { checklistId, name } | null` when a checklist matches the code.
- (Bat-Signal) `POST /deals/:id/bat-signal` → mints a 48h RS256 token (distinct `aud:'edc-batsignal'`, `scope:'risk-card:read'`, bound `dealId`) and returns `{ shareUrl, expiresAt }`. `GET /share/:token` is a **public** route (own rate limiter, own auth middleware) rendering ONLY the single deal's Briefing risk card, read-only, with no cockpit and no session.

**(d) Engine / Logic deltas.** None to risk evaluation. Bat-Signal reuses the existing RS256 JWT machinery with a distinct short-expiry token and a dedicated `batSignalAuth` middleware that verifies audience/scope/dealId and explicitly refuses session cookies (and the session middleware refuses Bat-Signal tokens). The share renderer pulls a single deal's intelligence and projects only the risk card — **NO** step-completion lifecycle, **NO** auto-assignment, **NO** next-best-action.

**(e) UI deltas.** When an alert with a matching checklist fires, `PatternEngineAdvisory` shows a "Launch Intervention" button opening an `InterventionModal` listing the static steps; confirming calls `POST /interventions`. A "Bat-Signal" action mints the link and copies it to the clipboard for manual paste into Slack/Teams. A public `SharePage` renders the read-only risk card.

**(f) Acceptance Criteria.**
- F7.1 Launching an intervention writes one `deal_interventions` row and no lifecycle/assignment state is created.
- F7.2 A checklist is shown only for alerts whose `code` matches `trigger_pattern_code`.
- F7.3 `GET /share/:token` renders only the risk card; with an expired or tampered token it returns 401/403.
- F7.4 A Bat-Signal token cannot reach the cockpit or any mutation route (session middleware rejects it).

**(g) Non-Overlap with Phase 2.** Satisfies **charter C7**. A static checklist a human launches + logs, and an ad-hoc human share link. NOT **Phase 2 §13 Playbook Engine** (stage-auto-assigned, stateful multi-step lifecycle, completion/skip, next-best-action, critical-step alerts) and NOT **§24 webhooks/integrations** (machine-to-machine). NOT **§15 notifications** — the Commander copies the link manually; nothing is delivered or escalated.

---

### F8 — Self-Referential Momentum Pattern (`SLOW_MOTION_COLLISION`)

**(a) Gap / Rationale.** EDC flags *static* risk (stage-vs-gate mismatches, staleness thresholds) but never the *dynamics* of a single deal: a deal whose own pace is decelerating while its close date approaches is silently sliding toward a missed date. v3.0 has no momentum signal at all.

**(b) Schema deltas (SQL DDL).** No new tables. New `engine_thresholds` rows:
```sql
INSERT INTO edc.engine_thresholds (parameter_key, parameter_value, data_type, description) VALUES
    ('momentum_drop_pct',     '50', 'number', 'Pct drop in the deal''s own gate-completion velocity (recent vs earlier) signalling deceleration'),
    ('momentum_window_days',  '30', 'number', 'Window size splitting the deal''s own history into recent vs earlier rates'),
    ('momentum_min_gate_pct', '60', 'number', 'Gate-completion pct below which a decelerating, near-close deal fires SLOW_MOTION_COLLISION');
```

**(c) API deltas.** None new. The pattern surfaces through the existing `governance.alerts[]` in `GET /deals/:dealId/intelligence` (and `/summary` critical alerts), with its glass-box `explanation` (F2).

**(d) Engine / Logic deltas.** Append **one** deterministic rule object `SLOW_MOTION_COLLISION` to `riskPatterns[]` (full implementation in §6.2). A new helper `calculateOwnMomentum(deal, auditRows, thresholds)` derives gate-completion timestamps from the deal's **own** `deal_audit_log` rows, splits them into a recent window vs an earlier span, computes the deal's own recent rate vs earlier rate, and returns `{ recentRate, earlierRate, dropPct }`. The pattern fires when `dropPct ≥ momentum_drop_pct` AND `daysToClose ≤ close_date_warning_days` AND `technicalProgressPct < momentum_min_gate_pct`; severity is YELLOW, promoted to RED when `daysToClose ≤ close_date_warning_days / 2`. The momentum context is passed in via `ctx.ownMomentum` to keep `processDealIntelligence` pure (F9).

**(e) UI deltas.** No new components — the alert renders in the existing `PatternEngineAdvisory` and `BriefingRiskAdvisory`, with its explanation disclosure (F2) and (if a checklist is keyed) a Launch Intervention button (F7).

**(f) Acceptance Criteria.**
- F8.1 A deal whose recent-window completion rate is ≥`momentum_drop_pct` below its earlier rate, with a near close date and sub-`momentum_min_gate_pct` gates, fires the pattern.
- F8.2 The same deal far from close (or above the gate floor) does NOT fire.
- F8.3 Severity promotes to RED inside half the close-date warning window.
- F8.4 `calculateOwnMomentum` uses ONLY this deal's own audit rows (no other deal's data is read) — verified by a unit test that injects a single deal's audit set.

**(g) Non-Overlap with Phase 2.** Satisfies **charter C9**. Self-referential momentum (this deal vs itself). ABSOLUTELY NO cohort/portfolio/historical-average benchmark, NO velocity *score*, NO materialized views — those are **Phase 2 §5 (velocity/cohort benchmarks)** and **§4 (predictive scoring)**. P1 never computes a cross-deal benchmark.

---

### F9 — Ephemeral Risk Simulator

**(a) Gap / Rationale.** Before committing a change (advancing a stage, toggling a gate, editing revenue), the Commander cannot see its risk consequence without saving it and triggering real audit/intelligence writes. There is no safe sandbox to ask "what would this do to the deal's health and alerts?"

**(b) Schema deltas.** None. The simulator is non-persisted by design.

**(c) API deltas.** None new. The simulator reuses the **client-extracted** engine; it makes no server calls while simulating (thresholds and FX are already in `useGlobalStore`).

**(d) Engine / Logic deltas.** `processDealIntelligence` is refactored to be a **pure function** runnable client-side: it performs no DB calls, and all external data (thresholds, `fxRate`, `catalogCount`, `ownMomentum`, `dispositions`) is passed in via the `ctx` argument (see §6.2). The identical module is imported by both the server route and the browser. The simulator runs only the Health + Alerts portion — it computes nothing financial beyond what the engine already returns and saves nothing.

**(e) UI deltas.** A `useSimulatorStore` (Zustand) mirrors `useActiveDealStore` inputs. A **"Simulate"** toggle on the Deal Workspace unbinds the inputs into `draftDeal`/`draftGates`; as the Commander toggles gates / changes stage / edits revenue, the client-side engine re-renders the resulting **Health Status + Alerts** instantly into `preview`. A distinct "sandbox" visual treatment wraps the workspace. Exiting (`exit()`, `Escape`, or deal switch) discards all simulated state; nothing is written.

**(f) Acceptance Criteria.**
- F9.1 Toggling Simulate and flipping a gate updates the previewed Health + Alerts within one render frame, with no network request.
- F9.2 The preview shows **only** Health Status + Alerts (no TCV projection, no saved scenario).
- F9.3 Exiting the simulator restores the live deal exactly; no audit/intelligence writes occurred.
- F9.4 The server route and the simulator import the **same** `processDealIntelligence` (no logic divergence) — verified by a shared unit test fixture run in both contexts.

**(g) Non-Overlap with Phase 2.** Satisfies **charter C10**. Ephemeral, non-persisted, single-deal, client-side, Health+Alerts preview only. NOT **Phase 2 §17 (persisted financial what-if scenario engine)** — no saved scenarios, no TCV/discount/term/services modeling, no pipeline-wide application — and NOT **§18 (Monte-Carlo pipeline simulation)**. P1 produces no TCV projection and no saved scenario.

---

### F10 — Closed-Lost Structured Autopsy

**(a) Gap / Rationale.** When a deal is lost, v3.0 captures only a free-text `loss_reason`. There is no structured taxonomy and therefore no way to deterministically correlate *why* deals are lost with their final technical/commercial state — the single most valuable institutional question a presales org asks.

**(b) Schema deltas (SQL DDL).**
```sql
CREATE TABLE edc.loss_archetypes (
    id SERIAL PRIMARY KEY,
    archetype_name VARCHAR(80) NOT NULL UNIQUE,
    is_active BOOLEAN NOT NULL DEFAULT TRUE
);
INSERT INTO edc.loss_archetypes (archetype_name) VALUES
    ('Technical Disqualification'), ('Budget Freeze'), ('Loss to Incumbent'),
    ('Compliance Gap'), ('Champion Departure'), ('No Decision');

ALTER TABLE edc.enterprise_deals
    ADD COLUMN loss_archetype_id INT REFERENCES edc.loss_archetypes(id);
```

**(c) API deltas.**
- `PUT /deals/:id` → moving `sales_stage_id` to Closed-Lost without `loss_archetype_id` returns `422 LOSS_ARCHETYPE_REQUIRED` (server-validated against the resolved stage name).
- `GET /lookups/loss-archetypes` lists the taxonomy.
- `GET /analytics/autopsy?archetypeId=<int>?` → deterministic aggregation correlating each archetype with final intelligence state (avg gate-completion %, services-attach share, which patterns had fired, never-passed-Gate-2 share).

**(d) Engine / Logic deltas.** No risk-engine change. The autopsy is a deterministic SQL/aggregation service over Closed-Lost deals joined to their final gate completions, services tier, cross-sells, and (where retained) the last-evaluated pattern set. Example output: "80% of 'Technical Disqualification' losses never passed Gate 2 and had no services attached."

**(e) UI deltas.** When `sales_stage_id` → Closed-Lost, a **mandatory modal** requires selecting an archetype before the save completes (`activeModal: 'lossArchetype'`). A new `ClosedLostAutopsyView` renders the aggregation with Recharts (bar/stacked-bar by archetype).

**(f) Acceptance Criteria.**
- F10.1 Saving a Closed-Lost transition without an archetype is rejected (422); with an archetype it succeeds.
- F10.2 The mandatory modal blocks the stage save until an archetype is chosen.
- F10.3 `GET /analytics/autopsy` returns deterministic per-archetype correlations over seeded data (integration test).
- F10.4 No free-text narrative field is added; the capture is purely categorical.

**(g) Non-Overlap with Phase 2.** Satisfies **charter C11**. Structured categorical capture + deterministic correlation only. NO free-text narrative, NO key-lessons KB, NO deal-memory archival, NO competitor win/loss — all **Phase 2 §8 (win/loss post-mortem)**, **§7 (Deal Memory)**, **§6 (competitive)**. P2 *consumes* this archetype (and never redefines the taxonomy).

---

### F11 — Portfolio Correlation Dashboard

**(a) Gap / Rationale.** `GET /intelligence/summary` gives counts but no cross-entity insight. The Commander cannot see which people or products correlate with risk — e.g., whether one AM's deals disproportionately trigger premature-commercial pushes, or which product shows up in stalled deals.

**(b) Schema deltas.** None. All inputs are current-state fields plus stage-transition timestamps already in `deal_audit_log`.

**(c) API deltas.** `GET /intelligence/portfolio-analysis` → deterministic aggregation grouping **active** deals by `account_manager`, `technical_lead`, and cross-sell `product` against **currently** triggered built-in alerts, plus simple cycle-time computed from `deal_audit_log` stage transitions. Payload shape in §5.7.

**(d) Engine / Logic deltas.** A deterministic aggregation service: for each grouping key it computes the share of that group's deals carrying each alert code and a simple "lift" vs the portfolio baseline, plus a mean cycle-time (sum of stage-dwell durations derived from `deal_audit_log` `sales_stage_id` transitions). Surfaces correlations like "Deals led by AM X are 3× more likely to trigger `PREMATURE_COMMERCIAL`", "Product Y present in 80% of Gate-4-stalled deals", "Deals with no Technical Lead run 40% longer". Current-state cross-section only — no time bucketing, no trend.

**(e) UI deltas.** A new **"Portfolio Health"** view (`PortfolioHealthView`) renders a Recharts heat-map / correlation matrix (group key × alert code, shaded by share/lift) plus a cycle-time table.

**(f) Acceptance Criteria.**
- F11.1 The endpoint returns deterministic correlations for seeded data (same input → same output).
- F11.2 Cycle-time is derived only from `deal_audit_log` stage transitions (unit test on a known transition sequence).
- F11.3 Only active (non-archived/non-deleted) deals are included.
- F11.4 No time-series buckets, trend lines, or forecasts appear in the payload or view.

**(g) Non-Overlap with Phase 2.** Satisfies **charter C12**. Current-state cross-sectional correlation only. NO velocity benchmarks, NO time-series trends, NO predictive — those are **Phase 2 §5 (velocity/pipeline analytics)** and **§4 (predictive scoring)**, which own all longitudinal analytics. P1's portfolio view has no time-series.

---

### F12 — Stage-Transition Guardrails with Governed Overrides

**(a) Gap / Rationale.** Nothing stops the Commander from advancing a deal into a stage where a RED pattern is guaranteed (e.g., into Commercial without Gate 3, or past Discovery with no close date). The mismatch is only flagged *after* the fact in the advisory. There is no synchronous moment of friction that forces a conscious, recorded decision.

**(b) Schema deltas (SQL DDL).**
```sql
CREATE TABLE edc.deal_stage_overrides (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    deal_id UUID NOT NULL REFERENCES edc.enterprise_deals(id) ON DELETE CASCADE,
    from_stage INT NOT NULL REFERENCES edc.pipeline_stages(id),
    to_stage   INT NOT NULL REFERENCES edc.pipeline_stages(id),
    pattern_codes TEXT[] NOT NULL DEFAULT '{}',
    override_reason TEXT NOT NULL,
    created_by VARCHAR(255) NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);
```

**(c) API deltas.** `PUT /deals/:id`: when `sales_stage_id` changes, the engine runs against the **prospective** state. If a RED built-in pattern would fire (or a required field is blank, e.g., no close date past Discovery) and no `override_reason` is supplied → `409 STAGE_GUARDRAIL` listing the offending pattern codes. When `override_reason` (≥10 chars, zod-enforced) is present, the change is applied **and** a `deal_stage_overrides` row + a `deal_audit_log` row are written. `UpdateDealSchema` gains `override_reason?`.

**(d) Engine / Logic deltas.** A synchronous `stageGuardrail` middleware (or in-handler step) constructs the prospective deal state, runs `processDealIntelligence` against it, filters for RED patterns + required-field checks, and either rejects (409) or records the override. This is **synchronous interception** — it happens inside the request, before the write commits.

**(e) UI deltas.** A 409 surfaces an `OverrideDialog` (instead of a generic error) listing the offending patterns and requiring a typed reason; submitting re-issues the PUT with `override_reason`. The override appears in the `AuditTrailViewer` (F3) for self-review.

**(f) Acceptance Criteria.**
- F12.1 A guarded stage change with no reason returns `409 STAGE_GUARDRAIL` listing the offending pattern(s).
- F12.2 The same change with a valid `override_reason` succeeds and writes a `deal_stage_overrides` + `deal_audit_log` row.
- F12.3 A non-guarded stage change (no RED, required fields present) proceeds with no override prompt.
- F12.4 An `override_reason` shorter than 10 chars is rejected by validation.

**(g) Non-Overlap with Phase 2.** Satisfies **charter C6**. Synchronous interception that forces an override decision at edit time. Distinct from **Phase 2 §28 async event bus** / **§15 escalation** (which *react after the fact*) and from **§11 free-form Decision Log** (a meeting-decision record). The override row is a narrow system artifact, not a P2 decision-log entry.

---

### F13 — Cross-Sell Whitespace & Attach-Rate (`LOW_ATTACH_ELEPHANT`)

**(a) Gap / Rationale.** `deal_cross_sells` records what was pitched but the cockpit never shows what *wasn't* — the whitespace — nor an attach rate, and no risk pattern flags a large account being under-pitched. Strategic revenue is left invisible.

**(b) Schema deltas.** No schema change. Whitespace is derived as `product_catalog` minus the deal's pitched `deal_cross_sells`. One new `engine_thresholds` row:
```sql
INSERT INTO edc.engine_thresholds (parameter_key, parameter_value, data_type, description) VALUES
    ('low_attach_rate_threshold', '0.34', 'number', 'Attach rate at/below which a large deal fires LOW_ATTACH_ELEPHANT');
```

**(c) API deltas.** `GET /deals/:dealId/intelligence` → `financials.crossSell: { pitchedCount, catalogCount, attachRate, whitespace[] }`. No new endpoint.

**(d) Engine / Logic deltas.** `processDealIntelligence` computes `attachRate = pitchedCount / catalogCount` (catalog size passed in via `ctx.catalogCount`; whitespace via `ctx.whitespace`). Append **one** built-in pattern `LOW_ATTACH_ELEPHANT` to `riskPatterns[]` (full impl in §6.2): fires when `normalizedTCV ≥ elephant_tcv_threshold` (F1) AND `attachRate ≤ low_attach_rate_threshold`. Glass-box `explain()` included (F2).

**(e) UI deltas.** `FinancialSplitArchitecture` renders the whitespace list and an attach-rate badge beside the cross-sell track. The new pattern renders in the existing advisory.

**(f) Acceptance Criteria.**
- F13.1 `crossSell.attachRate` equals pitched ÷ catalog size, and `whitespace` lists exactly the unpitched catalog products.
- F13.2 `LOW_ATTACH_ELEPHANT` fires for a large normalized-TCV deal with attach rate ≤ threshold; not otherwise.
- F13.3 The pattern uses `normalizedTCV` (F1), not native TCV.
- F13.4 The whitespace list + attach rate render in the workspace.

**(g) Non-Overlap with Phase 2.** Satisfies **charter C13** (entirely Phase 1). P2 never extends cross-sells; built-in patterns are P1's domain (**Phase 2 §12** is Commander-authored *custom* rules). Attach-rate later *feeds* P2 scoring/reports as an input, but the feature itself is Phase 1's.

---

### F14 — Deal Soft-Delete, Archive & Restore

**(a) Gap / Rationale.** v3.0's `DELETE /deals/:id` is a hard delete (its own §5.3 note recommends soft-delete for V1). An accidental deletion is unrecoverable and cascades through gates/blockers/audit. The Commander needs a recoverable lifecycle and a way to set aside (archive) deals without losing them.

**(b) Schema deltas (SQL DDL).**
```sql
ALTER TABLE edc.enterprise_deals
    ADD COLUMN deleted_at  TIMESTAMP WITH TIME ZONE,
    ADD COLUMN archived_at TIMESTAMP WITH TIME ZONE;
CREATE INDEX idx_deals_live ON edc.enterprise_deals(updated_at DESC)
    WHERE deleted_at IS NULL AND archived_at IS NULL;
```

**(c) API deltas.**
- Default `GET /deals` and all aggregate queries (`/intelligence/summary`, `portfolio-analysis`) **exclude** rows with non-null `deleted_at`/`archived_at`.
- `GET /deals?state=archived|deleted` opts into the removed sets.
- `DELETE /deals/:id` now sets `deleted_at` (soft); `POST /deals/:id/archive` sets `archived_at`; `POST /deals/:id/restore` clears both (recovers from either state).

**(d) Engine / Logic deltas.** No risk-engine change. The repository layer applies the live-filter predicate by default and a state predicate when `state` is supplied. Restore is idempotent (409 `DEAL_NOT_REMOVED` if already active).

**(e) UI deltas.** A **"Recycle Bin / Archive"** view (`RecycleBinView`) lists archived/deleted deals with a **Restore** action and a retention-window note. The Account Navigation Array excludes removed deals.

**(f) Acceptance Criteria.**
- F14.1 `DELETE` sets `deleted_at` and the deal disappears from the default list and aggregates.
- F14.2 `POST /restore` clears `deleted_at`/`archived_at` and the deal reappears.
- F14.3 `GET /deals?state=deleted` returns soft-deleted deals; `?state=archived` returns archived ones.
- F14.4 The Recycle Bin view restores a deal end-to-end (E2E).

**(g) Non-Overlap with Phase 2.** Satisfies **charter C14**. A recoverable deletion lifecycle of *any* deal. Distinct from **Phase 2 §7 Deal Memory** — a searchable knowledge base of *closed* deals with lessons (different lifecycle, different schema `edc_v2.deal_memory`). F14 is about recoverable removal, not knowledge archival.

---

### 17.X Consolidated Non-Overlap Matrix (F1–F14 → Charter Rows)

| Feature | Charter row | Phase 2 section(s) deliberately avoided |
|---|---|---|
| F1 Multi-currency normalization | C1 | §16 ramp pricing · §17 financial scenarios |
| F2 Glass-box explainable alerts | C3 | §4 predictive score · §12 rule builder · §17 what-if |
| F3 Advisory governance + AuditTrailViewer | C4 | §15 escalation/notifications · §21 digests · §24 webhooks |
| F4 Gate dependency & integrity | C5 | §12 rule builder (no new authorable rules) |
| F5 Presenter-grade briefing ergonomics | C15 | §20 Briefing V2 on-screen data · §11 decision log |
| F6 Change Digest + Deal Replay | C8 | §26 snapshots/activity/health-history · §28 event bus · §29 mat. views · §5 velocity |
| F7 Intervention checklists + Bat-Signal | C7 | §13 playbook engine/NBA · §24 webhooks · §15 notifications |
| F8 `SLOW_MOTION_COLLISION` | C9 | §5 cohort velocity benchmarks · §4 predictive scoring |
| F9 Ephemeral risk simulator | C10 | §17 persisted financial scenarios · §18 Monte-Carlo |
| F10 Closed-Lost structured autopsy | C11 | §8 narrative win/loss · §7 Deal Memory · §6 competitive |
| F11 Portfolio correlation dashboard | C12 | §5 velocity/pipeline analytics · §4 predictive |
| F12 Stage guardrails + governed overrides | C6 | §28 event bus · §15 escalation · §11 decision log |
| F13 Cross-sell whitespace + `LOW_ATTACH_ELEPHANT` | C13 | §12 custom rule builder (built-ins are P1's) |
| F14 Soft-delete / archive / restore | C14 | §7 Deal Memory (`edc_v2.deal_memory`) |

> **Conclusion.** All 14 enhancements deepen assets EDC already owns, compute deterministically from a single deal's own data or a current cross-section, persist nothing speculative, and add no asynchronous infrastructure — fully satisfying the §1A governing principle and clearing every reserved Phase 2 surface. This document is the production-ready Phase 1 baseline (v4.0) and pairs with the companion **"Enterprise Deal Commander (EDC) — Phase 2 PRD (Final, Production-Ready).md"**.

---

*End of Document — Enterprise Deal Commander PRD v4.0 (Final, Production-Ready Phase 1 Baseline). Supersedes v3.0.*

