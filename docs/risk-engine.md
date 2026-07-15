# The Intelligence / Risk Engine

The engine (`lib/engine`, package `@workspace/engine`) is the analytical heart of EDC. It is
**pure and isomorphic**: no database or network calls, no `Date.now()`/`new Date()`/`Math.random()`
in scoring paths — every input arrives as a function argument, so the same code produces the same
result on the server and in the browser Risk Simulator.

- [Two layers of one system](#two-layers-of-one-system)
- [Entry point](#entry-point)
- [Layer A — the 15 named risk patterns](#layer-a--the-15-named-risk-patterns)
- [Glass-box explanations (F2)](#glass-box-explanations-f2)
- [Dispositions & managed risk (F3)](#dispositions--managed-risk-f3)
- [Layer B — Risk Engine v2 (7 dimensions)](#layer-b--risk-engine-v2-7-dimensions)
- [Composite risk → governance health](#composite-risk--governance-health)
- [Self-referential momentum (F8)](#self-referential-momentum-f8)
- [The opportunity engine (recommendations)](#the-opportunity-engine-recommendations)
- [TCV & normalization](#tcv--normalization)

## Two layers of one system

EDC deliberately runs **two complementary risk models** that coexist (think *diagnoses* vs
*vital signs*):

- **Named patterns** — discrete, binary conditions with a code and a fixed remediation
  ("PREMATURE_COMMERCIAL is firing"). Good for *actionable diagnosis*.
- **Dimensional scores (Risk Engine v2)** — a continuous 0–100 score across seven independent
  dimensions, synthesized into one composite level. Good for *contextual, trend-aware severity*.

A firing pattern **amplifies** its corresponding dimension, and the composite level is what drives
the deal's health color. Named RED patterns *also* independently gate stage advancement.

> **Doc note:** the repo's `CLAUDE.md` describes a "12-pattern" engine — that phrasing predates
> the current code, which defines **15** patterns (12 governance + 3 IAM/SIEM) plus Risk Engine
> v2. This document reflects the code.

## Entry point

```ts
processDealIntelligence(deal, gates, activeBlockers, thresholds, ctx?) → IntelligenceOutput
```

It computes economics (TCV, normalized TCV), gate progression and milestone, F4 integrity
warnings, temporal values, cross-sell attach rate, evaluates all patterns, applies dispositions,
runs the 7 dimensional scorers, synthesizes the composite risk, derives health, and produces
opportunity recommendations. The output object includes `financials`, `technicalTrack`,
`governance` (health + alerts + managed alerts), `recommendations`, and `risk` (composite +
dimensions + drivers + recommended actions).

## Layer A — the 15 named risk patterns

Each pattern has a stable `code`, a base `severity`, a `weight` (used for ordering, ties broken
after severity), an `evaluate` predicate, a `formatMessage`, and an `explain`. Patterns are sorted
RED-first, then by descending weight. `PATTERN_CODES` exports the full list.

| # | Code | Severity | Weight | Fires when… |
|---|---|---|---|---|
| 1 | `PREMATURE_COMMERCIAL` | RED | 100 | Stage is Commercial/Procurement but Gate 3 (performance) isn't passed. |
| 2 | `MISSING_STRUCTURAL_ANCHOR` | RED | 90 | Past Discovery but Gate 1 criteria aren't locked. |
| 3 | `DISCOUNT_TRAP` | RED | 85 | Mega-deal in Commercial with zero services attachment. |
| 4 | `COMPETITIVE_DISPLACEMENT_STALL` | YELLOW→RED | 80 | Displacement deal (has competitor) stalled in Validation/Commercial past `competitive_stall_days`. Escalates to RED if own momentum is collapsing. |
| 5 | `SLOW_MOTION_COLLISION` | YELLOW→RED | 75 | The deal's own gate velocity has dropped, close date is near, and gates are under-complete. Escalates to RED very near close. |
| 6 | `UNPROTECTED_ELEPHANT` | YELLOW | 70 | Normalized TCV ≥ elephant threshold but services tier is None. |
| 7 | `CLOSE_DATE_PRESSURE` | YELLOW | 65 | Close date within the warning window but gate completion below the warn %. |
| 8 | `PHANTOM_CHAMPION` | YELLOW | 60 | Past Discovery, no executive agreement gate, and active longer than `phantom_champion_days`. |
| 9 | `POC_DEATH_MARCH` | YELLOW | 58 | In Validation past `poc_max_validation_days` with Gate 1 criteria still unlocked. |
| 10 | `STALLED_VALIDATION` | YELLOW | 55 | In-stage longer than `stale_stage_days` with technical progress < 100%. |
| 11 | `GHOST_PIPELINE` | YELLOW | 50 | No blockers, no strategic notes, and no updates in `ghost_pipeline_days`. |
| 12 | `SIEM_UNDERSCOPED` | YELLOW | 48 | A Log360/SIEM deal with a large log-source estimate but a TCV below the elephant threshold. |
| 13 | `LOW_ATTACH_ELEPHANT` | YELLOW | 45 | Large deal with a cross-sell attach rate at/below `low_attach_rate_threshold`. |
| 14 | `UNRESOLVED_CRITICAL_BLOCKERS` | YELLOW | 40 | One or more high-severity blockers remain unresolved. |
| 15 | `NO_CLOSE_DATE` | YELLOW | 30 | Advanced past Discovery (and not closed) with no expected close date. |

Patterns 1–3, 6–8, 11, 14–15 are the original governance set; 4/5/13 add momentum and cross-sell
logic; 4/9/12 (`COMPETITIVE_DISPLACEMENT_STALL`, `POC_DEATH_MARCH`, `SIEM_UNDERSCOPED`) are the
IAM/SIEM-specific additions.

## Glass-box explanations (F2)

Every pattern exposes an `explain()` returning:

- **`inputs`** — the exact field values that led to the verdict (e.g. sales stage, days in stage,
  Gate 3 status).
- **`thresholdsUsed`** — each threshold with its value and a **provenance** flag: `default` or
  `tuned` (computed by comparing the active value to the seeded default).
- **`clearsWhen`** — a static, plain-English remediation string ("Complete Gate 3, or move the
  deal back out of Commercial/Procurement.").

This is what makes every alert defensible in front of executives — no black boxes.

## Dispositions & managed risk (F3)

The Commander can attach a **disposition** to any alert: `acknowledge`, `accept`, or `snooze`
(with an optional `snooze_until_field_change`). A disposed alert moves from `governance.alerts`
to `governance.managedAlerts` and no longer counts toward the unmanaged/critical total.
Importantly, **only unmanaged patterns amplify Risk Engine v2** — accepting or snoozing a pattern
removes its amplification, too.

## Layer B — Risk Engine v2 (7 dimensions)

Seven independent dimensional scorers (`lib/engine/src/dimensions.ts`) each return a 0–100 risk
score (0 = no risk, 100 = maximum) as a weighted mean of internal **signals**. Dimensions degrade
gracefully — when their inputs are absent they return a low default and mark themselves
`assessable: false`.

| Dimension | Signals (weight) |
|---|---|
| **Technical Readiness** | Gate completion % (0.30), time since last gate (0.30), gate-sequence integrity (0.15), critical-gate status — G3/G5 (0.25). |
| **Commercial Alignment** | Stage-vs-gates gap (0.45), services attachment on large deals (0.30), probability-vs-reality gap (0.25). |
| **Stakeholder Coverage** | Champion ratio (0.30), hostile decision-makers (0.35), decision-maker coverage (0.35). *Not assessable without stakeholders.* |
| **Temporal Pressure** | Stage duration vs benchmark (0.35), close-date proximity vs remaining progress (0.45), close-date existence (0.20). |
| **Financial Structure** | Services protection (0.35), cross-sell overextension (0.30), contract-term appropriateness (0.35). |
| **Competitive Exposure** | Active-competitor count (0.35), historical win-rate vs active competitors (0.45), competition late in cycle (0.20). *Not assessable without competitors.* |
| **Engagement Vitality** | Time since last update (0.35), strategic notes present (0.20), blocker stagnation proxy (0.25). |

`computeUnifiedRisk` (`risk-v2.ts`) combines the seven dimension scores (optionally re-weighted via
`ctx.riskWeights`), amplifies dimensions whose corresponding **unmanaged** patterns are firing,
factors the RED guardrail patterns (`PREMATURE_COMMERCIAL`, `MISSING_STRUCTURAL_ANCHOR`,
`DISCOUNT_TRAP`), and emits a `compositeScore`, a `riskLevel`, ranked `topDrivers`, and
`recommendedActions`.

## Composite risk → governance health

The composite `riskLevel` maps to the three-state health badge via `riskLevelToHealth`:

| Composite risk level | Health color |
|---|---|
| `HIGH` | 🔴 RED |
| `ELEVATED` | 🟡 YELLOW |
| `MODERATE` | 🟡 YELLOW |
| `LOW` | 🟢 GREEN |

`ELEVATED` deliberately collapses to YELLOW ("heading toward red, not red yet") while staying
fully visible through `risk.riskLevel` / `risk.compositeScore`. The health enum is intentionally
**not** widened. Governance health is sourced from this composite level — **not** the legacy
pattern-weight roll-up — but RED *patterns* still gate stage advancement independently (the `409
STAGE_GUARDRAIL`).

## Self-referential momentum (F8)

`calculateOwnMomentum` derives a deal's recent vs earlier **gate-completion rate** purely from its
**own** audit rows (no cohort data — that would be Phase 2). The resulting `dropPct` feeds
`SLOW_MOTION_COLLISION` and can escalate `COMPETITIVE_DISPLACEMENT_STALL` to RED. Windowing is
controlled by `momentum_window_days`, sensitivity by `momentum_drop_pct`, and the gate floor by
`momentum_min_gate_pct`.

## The opportunity engine (recommendations)

Separate from risk (and never folded into health), `generateRecommendations` derives upsell
opportunities from the deal's anchor + pitched product mix, keyed to **real AD360/Log360 product
codes**:

- **`NEXT_BEST_PRODUCT`** — affinity of owned products + compliance-driven picks (e.g. SOX →
  ADAudit Plus + EventLog Analyzer).
- **`RECOVERY_GAP`** — an AD/M365 footprint with no backup/recovery line → RecoveryManager Plus.
- **`SUITE_BUNDLE`** — enough à-la-carte components of a suite (≥ `suite_bundle_min_components`) to
  justify positioning the AD360 or Log360 bundle.

Product affinity, suite membership, and compliance→product maps are pure constants in
`lib/engine/src/index.ts`.

## TCV & normalization

Total Contract Value is computed as:

```
Multi-Year Committed:  TCV = product_revenue × term_years + services_revenue
otherwise:             TCV = product_revenue + services_revenue
```

**Normalization (F1):** if the deal currency differs from the reporting currency, `normalizedTCV`
= `TCV × fxRate`. If no FX rate is available, the native value is shown and a `MISSING_FX_RATE`
data-quality note is attached. All thresholds are compared against the **normalized** value.

## Testing the engine

The engine has isomorphic parity tests (server vs browser produce identical output) and per-pattern
tests. Run them with:

```bash
pnpm --filter @workspace/engine run test
```
