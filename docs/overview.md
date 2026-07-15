# Project Overview

- [Executive summary](#executive-summary)
- [The problem](#the-problem)
- [What EDC does](#what-edc-does)
- [Who it's for (personas)](#who-its-for-personas)
- [The two-phase product model](#the-two-phase-product-model)
- [Feature catalog](#feature-catalog)
- [Success metrics](#success-metrics)
- [Related reading](#related-reading)

## Executive summary

**Enterprise Deal Commander (EDC)** is a single-operator "command cockpit" for managing the
health of large enterprise software deals. It is purpose-built around the ManageEngine
**AD360 / Log360** identity (IAM) and security-information (SIEM) sales motion.

Where a CRM tracks the *commercial* pipeline, EDC layers a **parallel technical-validation
track** on top of it and continuously reconciles the two. A deterministic intelligence engine
watches every deal for risk conditions — a sales stage that has raced ahead of technical
proof, a proof-of-concept with no agreed success criteria, a mega-deal with no services
attached — and rolls each deal up to a single **GREEN / YELLOW / RED** health color. The whole
portfolio can then be projected in a boardroom as an **Executive Briefing** with zero
reformatting.

EDC is deliberately **single-user** in its foundational form: one authenticated *Deal
Commander* with full control over the data, "one Commander, one authenticated session, zero
data drift."

## The problem

In the product's own framing:

> Large-scale Total Contract Value (TCV) pipelines fail not from a lack of sales activity, but
> from a **disconnect between commercial progression and technical validation.**

Traditional CRMs (Salesforce, HubSpot) optimize for the sales forecast. They record which
commercial stage a deal is in, but they are blind to:

- **Un-scoped Proofs of Concept** that drag on with no exit criteria.
- **Architecture vetoes** and InfoSec blockers that will kill a deal late.
- **Premature commercial pushes** — moving to "Commercial / Procurement" before the technology
  has actually been validated.

The result is forecast surprises, margin-destroying discounts to rescue late deals, and
post-sale churn from under-deployed customers. EDC's thesis is that these failures are
*detectable in advance* if you track the technical track as rigorously as the commercial one.

## What EDC does

1. **Records each deal on two tracks.** Commercial stage (Discovery → Validation → Commercial →
   Procurement → Closed-Won/Lost) *and* a 9-point technical **gate matrix** grouped into gate
   groups / milestones (criteria locked → MVP validated → scalability confirmed → InfoSec
   cleared → technical win signed).
2. **Computes deal economics.** Total Contract Value with multi-currency **normalization** into
   a single reporting currency, services attachment, and cross-sell whitespace/attach-rate.
3. **Runs a deterministic risk engine.** 15 named risk patterns plus a 7-dimension composite
   **Risk Engine v2**; each alert is **glass-box explainable** (the exact inputs, the thresholds
   used and whether they were tuned, and a plain-English "clears when"). See
   [risk-engine.md](./risk-engine.md).
4. **Governs risk.** The Commander can acknowledge / accept / snooze any alert with a mandatory
   rationale; the action is written to an immutable audit log and the alert becomes "Managed
   Risk."
5. **Guards stage transitions.** Advancing a deal past an active RED-triggering risk returns
   `409 STAGE_GUARDRAIL` unless the Commander supplies a typed override reason (recorded).
6. **Presents to executives.** A curated Executive Briefing / War Room mode with speaker notes,
   a pacing timer, and a client-side Risk Simulator for ephemeral what-if analysis.
7. **Remembers and analyzes** (Phase 2). Durable history, predictive scoring, pipeline flow
   analytics, competitive intelligence, and an institutional Deal Memory knowledge base.

## Who it's for (personas)

| Persona | Role in EDC |
|---|---|
| **Deal Commander** | The **only** authenticated CRUD user — a Presales Enterprise Manager who owns technical-validation health and updates records during strategic deep-dives. The primary user. |
| **Account Manager** | Sales-line owner of commercial progression. Referenced on each deal, but **does not log in** to EDC. |
| **Technical Lead** | Presales-line owner of architecture validation. Referenced on each deal, but **does not log in**. |
| **C-suite executives** | The **audience** for the Executive Briefing output — not users of the tool. |
| **RevOps / technical operators** | (Phase 2) Configure and tune the platform's parameters via the settings layer. |

Phase 2 expands the actor model to **Regional Commander**, **Global Commander / Superuser**,
and **Deal Delegate** (temporary edit access, e.g. vacation coverage), motivated by the fact
that a single person bottlenecks at roughly 15–20 active deals.

## The two-phase product model

EDC is governed by an explicit **Phase Boundary & Non-Overlap Charter** (embedded in both
PRDs). The governing principle:

> **Phase 1 = correct, deterministic, self-contained, in-the-moment.**
> **Phase 2 = predictive, cohort-benchmarked, persisted, narrative, automated, multi-actor,
> event-driven.**

The litmus test for where a capability belongs:

- Needs history beyond a single deal's own audit log? A persisted model/score/scenario?
  Delivery / escalation / notification? Auto-assignment or lifecycle automation? → **Phase 2.**
- Deterministic, single-deal (or current cross-section), and ephemeral/recoverable? → **Phase 1.**

See [roadmap.md](./roadmap.md) for what has actually shipped versus what remains proposed.

## Feature catalog

### Phase 1 — "Executive War Room Edition"

Foundational assets plus 14 carved enhancements (F1–F14):

| Feature | Summary |
|---|---|
| Technical gate matrix | 9-point verifiable validation milestones, grouped into gate groups |
| Risk pattern engine | Deterministic, engineer-defined patterns; worst active signal drives health |
| Executive Briefing Mode | Boardroom-ready presentation overlay |
| Immutable audit log | Every mutation recorded with `entity_id` for point-in-time reconstruction |
| **F1** Multi-currency normalization | FX rates → one reporting currency → `normalizedTCV` |
| **F2** Glass-box explainable alerts | `explain()` on every pattern: inputs, thresholds-with-provenance, `clearsWhen` |
| **F3** Risk advisory governance | Acknowledge / Accept / Snooze with required rationale + audit |
| **F4** Gate dependency & integrity | Declarative prerequisites + out-of-order/regression warnings (non-blocking) |
| **F5** Presenter-grade briefing ergonomics | Agenda queue, private speaker notes, pacing timer |
| **F6** Temporal intelligence | Change Digest + Deal Replay, as read-time projections of the audit log |
| **F7** Rapid intervention checklists + Bat-Signal | Static checklists per alert + 48h signed share link |
| **F8** Self-referential momentum | `SLOW_MOTION_COLLISION` — a deal's own gate velocity vs its own close date |
| **F9** Ephemeral risk simulator | Client-side what-if; previews health + alerts only, never persisted |
| **F10** Closed-Lost structured autopsy | Loss archetype taxonomy + deterministic correlation |
| **F11** Portfolio correlation dashboard | Current-state cross-section by AM / TL / product |
| **F12** Stage-transition guardrails | `409 STAGE_GUARDRAIL` on RED transitions unless overridden |
| **F13** Cross-sell whitespace & attach-rate | `LOW_ATTACH_ELEPHANT` pattern |
| **F14** Soft-delete, archive & restore | Recoverable deletion lifecycle |

### Phase 2 — "Sovereign Intelligence Edition"

Grouped into six themes:

- **Deep intelligence:** predictive deal scoring, velocity & pipeline analytics, competitive
  intelligence, Deal Memory knowledge base, win/loss post-mortems.
- **Collaboration:** multi-commander access & delegation, stakeholder influence mapping,
  decision log & meeting intelligence.
- **Automation & AI:** custom risk-pattern builder, automated playbooks / next-best-action,
  natural-language command interface, smart alerts with escalation chains.
- **Financial modeling:** ramp/per-year pricing, financial scenario engine, Monte-Carlo
  pipeline simulation.
- **Executive communication:** board-ready PDF reports, Briefing Mode V2, scheduled email
  digests.
- **Platform:** custom fields/tags, import/export, webhook & integration framework, mobile PWA,
  and the durable event-driven backbone (`edc_v2` schema, event bus, caching).

The verified, shipped subset is detailed in [roadmap.md](./roadmap.md).

## Success metrics

From the Phase 1 PRD, the target outcomes are:

- Executive-review prep time: **from 45+ minutes to under 5 minutes.**
- **100%** technical-gate tracking coverage across active deals.
- Same-day flagging of **≥80%** of premature commercial pushes.

## Related reading

- [Architecture](./architecture.md) — how the pieces fit together.
- [The risk engine](./risk-engine.md) — the analytical core.
- [Glossary](./glossary.md) — precise definitions of every term used above.
