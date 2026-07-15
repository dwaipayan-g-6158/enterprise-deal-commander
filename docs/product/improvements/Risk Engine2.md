This is the most important architectural question for the risk engine, and the answer is: **the 15 patterns and the dimensional scoring system serve fundamentally different purposes and must coexist as two layers of a single unified system.** Neither replaces the other.

Let me explain why, and then show exactly how they fit together.

---

## The Core Insight

Think of it like medicine.

**The 15 patterns are diagnoses.** "This patient has hypertension." "This patient has a fractured femur." They are named, specific, recognizable conditions. When a doctor hears "hypertension," they know exactly what it means, what the risks are, and what to do about it. That is what `PREMATURE_COMMERCIAL` does — it names a specific, known failure mode.

**The dimensional scores are vital signs.** Blood pressure, heart rate, temperature, oxygen saturation. They are continuous measurements across broad categories of health. No single vital sign tells you the diagnosis, but together they give you a holistic picture.

A hospital that only runs diagnoses without vital signs misses the patient who has no named condition but is slowly deteriorating across every metric. A hospital that only measures vital signs without diagnoses can tell you the patient is unwell but can't tell you *why* or *what to do*.

You need both. EDC needs both.

---

## The Three-Layer Architecture

```
┌─────────────────────────────────────────────────────────────────────────┐
│                                                                         │
│  LAYER 1: DIMENSIONAL RISK SCORES (Continuous, Holistic)               │
│  "How healthy is this deal across 7 dimensions?"                       │
│  Output: 7 scores, each 0-100, trend-aware                            │
│  Purpose: Early detection, trend analysis, pipeline-level insights     │
│                                                                         │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                         │
│  LAYER 2: NAMED RISK PATTERNS (Discrete, Specific)                     │
│  "What exactly is wrong with this deal?"                               │
│  Output: 15+ binary fire/don't-fire conditions                        │
│  Purpose: Specific diagnosis, stage guardrails, team communication     │
│                                                                         │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                         │
│  LAYER 3: UNIFIED RISK OUTPUT (Synthesized, Actionable)                │
│  "What is the overall risk, what's causing it, and what do I do?"      │
│  Output: Composite score + active patterns + recommended actions       │
│  Purpose: Commander decision-making                                    │
│                                                                         │
└─────────────────────────────────────────────────────────────────────────┘
```

### How the Layers Interact

The key connection: **when a named pattern fires, it amplifies the corresponding dimension score.** This means the dimensional scores are not purely computed from raw signals — they are also influenced by the pattern layer's expert knowledge.

```
                    RAW DEAL DATA
                         │
                         ▼
              ┌─────────────────────┐
              │                     │
              │   LAYER 1:          │
              │   DIMENSIONAL       │──── 7 scores (0-100)
              │   SCORING           │     based on raw signals
              │                     │
              └─────────┬───────────┘
                        │
                        │ base scores
                        ▼
              ┌─────────────────────┐
              │                     │
              │   LAYER 2:          │
              │   PATTERN           │──── 15 binary flags
              │   EVALUATION        │     (fire / don't fire)
              │                     │
              └─────────┬───────────┘
                        │
                        │ pattern amplification
                        ▼
              ┌─────────────────────┐
              │                     │
              │   LAYER 3:          │
              │   SCORE             │──── final composite score
              │   ADJUSTMENT        │     + active pattern list
              │                     │     + recommended actions
              └─────────────────────┘
```

---

## Pattern-to-Dimension Mapping

Each of the 15 patterns maps to one or more dimensions. When a pattern fires, it pushes the corresponding dimension score up by a defined amount (the "amplification").

```javascript
const PATTERN_DIMENSION_MAP = {

    // ── RED PATTERNS (Stage Guardrails) ──────────────────

    PREMATURE_COMMERCIAL: {
        amplifications: [
            { dimension: 'Commercial Alignment', boost: 25 },
            { dimension: 'Technical Readiness',  boost: 15 }
        ],
        isStageGuardrail: true,
        guardrailMessage: 'Cannot advance stage: Gate 3 (Performance) must be passed before entering Commercial/Procurement.'
    },

    MISSING_STRUCTURAL_ANCHOR: {
        amplifications: [
            { dimension: 'Technical Readiness',  boost: 20 },
            { dimension: 'Commercial Alignment', boost: 15 }
        ],
        isStageGuardrail: true,
        guardrailMessage: 'Cannot advance stage: Gate 1 (Success Criteria) must be locked.'
    },

    DISCOUNT_TRAP: {
        amplifications: [
            { dimension: 'Financial Structure',    boost: 30 },
            { dimension: 'Commercial Alignment',   boost: 20 }
        ],
        isStageGuardrail: true,
        guardrailMessage: 'Cannot advance stage: Mega-deal in Commercial with zero services requires executive pricing override.'
    },

    // ── YELLOW PATTERNS (Advisory) ──────────────────────

    COMPLIANCE_DEADLINE_RISK: {
        amplifications: [
            { dimension: 'Temporal Pressure',      boost: 25 },
            { dimension: 'Technical Readiness',    boost: 15 }
        ],
        isStageGuardrail: false
    },

    COMPETITIVE_DISPLACEMENT_STALL: {
        amplifications: [
            { dimension: 'Competitive Exposure',   boost: 25 },
            { dimension: 'Temporal Pressure',      boost: 15 }
        ],
        isStageGuardrail: false
    },

    SLOW_MOTION_COLLISION: {
        amplifications: [
            { dimension: 'Temporal Pressure',      boost: 25 },
            { dimension: 'Technical Readiness',    boost: 15 },
            { dimension: 'Engagement Vitality',    boost: 10 }
        ],
        isStageGuardrail: false
    },

    UNPROTECTED_ELEPHANT: {
        amplifications: [
            { dimension: 'Financial Structure',    boost: 25 }
        ],
        isStageGuardrail: false
    },

    CLOSE_DATE_PRESSURE: {
        amplifications: [
            { dimension: 'Temporal Pressure',      boost: 20 }
        ],
        isStageGuardrail: false
    },

    PHANTOM_CHAMPION: {
        amplifications: [
            { dimension: 'Stakeholder Coverage',   boost: 20 },
            { dimension: 'Engagement Vitality',    boost: 10 }
        ],
        isStageGuardrail: false
    },

    POC_DEATH_MARCH: {
        amplifications: [
            { dimension: 'Temporal Pressure',      boost: 20 },
            { dimension: 'Technical Readiness',    boost: 15 },
            { dimension: 'Engagement Vitality',    boost: 10 }
        ],
        isStageGuardrail: false
    },

    GHOST_PIPELINE: {
        amplifications: [
            { dimension: 'Engagement Vitality',    boost: 30 }
        ],
        isStageGuardrail: false
    },

    SIEM_UNDERSCOPED: {
        amplifications: [
            { dimension: 'Financial Structure',    boost: 15 }
        ],
        isStageGuardrail: false
    },

    LOW_ATTACH_ELEPHANT: {
        amplifications: [
            { dimension: 'Financial Structure',    boost: 20 }
        ],
        isStageGuardrail: false
    },

    UNRESOLVED_CRITICAL_BLOCKERS: {
        amplifications: [
            { dimension: 'Engagement Vitality',    boost: 20 },
            { dimension: 'Technical Readiness',    boost: 10 }
        ],
        isStageGuardrail: false
    },

    NO_CLOSE_DATE: {
        amplifications: [
            { dimension: 'Temporal Pressure',      boost: 15 },
            { dimension: 'Engagement Vitality',    boost: 10 }
        ],
        isStageGuardrail: false
    }
};
```

---

## The Unified Engine Implementation

Here is the complete engine that runs all three layers and produces a single unified output:

```javascript
// services/unifiedRiskEngine.js

/**
 * UNIFIED RISK ENGINE v2.0
 *
 * Three-layer architecture:
 *   Layer 1: Dimensional scoring (7 dimensions, continuous)
 *   Layer 2: Named pattern evaluation (15+ patterns, binary)
 *   Layer 3: Score adjustment + synthesis
 */

// ══════════════════════════════════════════════════════════
// CONFIGURATION
// ══════════════════════════════════════════════════════════

const DIMENSION_WEIGHTS = {
    'Technical Readiness':    0.20,
    'Commercial Alignment':   0.15,
    'Stakeholder Coverage':   0.15,
    'Temporal Pressure':      0.15,
    'Financial Structure':    0.10,
    'Competitive Exposure':   0.10,
    'Engagement Vitality':    0.15
};

// Cap: a single pattern can never push a dimension above this value
const DIMENSION_SCORE_CAP = 100;

// Amplification dampening: prevent multiple patterns from
// double-counting the same underlying problem
const MAX_AMPLIFICATION_PER_DIMENSION = 40;

// ══════════════════════════════════════════════════════════
// LAYER 1: DIMENSIONAL SCORING (unchanged from previous spec)
// ══════════════════════════════════════════════════════════

// Each function returns: { name, score, signals, assessable }
// (Full implementations from the previous spec — abbreviated here for space)

function scoreTechnicalReadiness(deal, gates, benchmarks) { /* ... */ }
function scoreCommercialAlignment(deal, gates) { /* ... */ }
function scoreStakeholderCoverage(deal, stakeholders) { /* ... */ }
function scoreTemporalPressure(deal, benchmarks) { /* ... */ }
function scoreFinancialStructure(deal, crossSells) { /* ... */ }
function scoreCompetitiveExposure(deal, competitors, history) { /* ... */ }
function scoreEngagementVitality(deal, blockers, decisions) { /* ... */ }


// ══════════════════════════════════════════════════════════
// LAYER 2: NAMED PATTERN EVALUATION
// ══════════════════════════════════════════════════════════

/**
 * Each pattern is evaluated independently.
 * Returns an array of active pattern objects.
 */

const namedPatterns = [
    // ── RED PATTERNS ───────────────────────────────────

    {
        code: 'PREMATURE_COMMERCIAL',
        severity: 'RED',
        weight: 100,
        category: 'Stage Guardrail',
        evaluate: (ctx) => {
            return ['Commercial', 'Procurement'].includes(ctx.deal.salesStage)
                && !ctx.gateMap['G3_PERFORMANCE_PASSED'];
        },
        message: (ctx) =>
            `Sales has moved to ${ctx.deal.salesStage} before Gate 3 ` +
            `(Performance/Scalability) is validated. Risk of late-stage ` +
            `technical disqualification or deep margin discounting.`
    },

    {
        code: 'MISSING_STRUCTURAL_ANCHOR',
        severity: 'RED',
        weight: 90,
        category: 'Stage Guardrail',
        evaluate: (ctx) => {
            return ctx.deal.salesStage !== 'Discovery'
                && !ctx.gateMap['G1_CRITERIA_LOCKED'];
        },
        message: () =>
            `Deal has advanced past Discovery without locking minimum viable ` +
            `success criteria. The evaluation has no defined success conditions.`
    },

    {
        code: 'DISCOUNT_TRAP',
        severity: 'RED',
        weight: 85,
        category: 'Stage Guardrail',
        evaluate: (ctx) => {
            return ctx.deal.financials.calculatedTCV >= ctx.thresholds.mega_deal_tcv_threshold
                && ctx.deal.financials.servicesRevenue === 0
                && ctx.deal.financials.servicesTier === 'None'
                && ctx.deal.salesStage === 'Commercial';
        },
        message: (ctx) =>
            `Mega-deal ($${(ctx.deal.financials.calculatedTCV / 1000000).toFixed(1)}M) ` +
            `in Commercial with zero services attachment. Likely aggressive pricing ` +
            `cuts. Post-sale implementation risk is extreme.`
    },

    // ── YELLOW PATTERNS ────────────────────────────────

    {
        code: 'COMPLIANCE_DEADLINE_RISK',
        severity: 'YELLOW',
        weight: 82,
        category: 'Temporal',
        evaluate: (ctx) => {
            if (!ctx.deal.compliance_deadline) return false;
            const daysToDeadline = daysBetween(new Date(), new Date(ctx.deal.compliance_deadline));
            return daysToDeadline <= (ctx.thresholds.compliance_warning_days || 30)
                && ctx.deal.technicalTrack.progressPercentage < (ctx.thresholds.compliance_min_gates_pct || 60);
        },
        message: (ctx) => {
            const days = daysBetween(new Date(), new Date(ctx.deal.compliance_deadline));
            return `Compliance deadline in ${days} days but only ` +
                `${ctx.deal.technicalTrack.progressPercentage}% of gates are complete. ` +
                `Risk of missing regulatory submission window.`;
        }
    },

    {
        code: 'COMPETITIVE_DISPLACEMENT_STALL',
        severity: 'YELLOW',
        weight: 80,
        category: 'Competitive',
        evaluate: (ctx) => {
            const hasCompetitor = ctx.competitors && ctx.competitors.some(c => c.status === 'Active');
            const stalledInRelevantStage = ['Validation', 'Commercial'].includes(ctx.deal.salesStage)
                && ctx.deal.daysInStage > (ctx.thresholds.stall_competitive_days || 35);
            return hasCompetitor && stalledInRelevantStage;
        },
        message: (ctx) => {
            const active = ctx.competitors.filter(c => c.status === 'Active').map(c => c.competitor_name);
            return `Stalled ${ctx.deal.daysInStage} days in ${ctx.deal.salesStage} ` +
                `while competing against ${active.join(', ')}. Every day of stall ` +
                `advantages the competitor.`;
        }
    },

    {
        code: 'SLOW_MOTION_COLLISION',
        severity: 'YELLOW',
        weight: 75,
        category: 'Temporal',
        evaluate: (ctx) => {
            if (!ctx.deal.financials.daysToClose || ctx.deal.financials.daysToClose <= 0) return false;
            // Gate velocity has dropped: recent velocity < historical velocity * threshold
            const velocityDrop = ctx.deal.velocityData?.velocityChangePct || 0;
            return velocityDrop <= -50  // Velocity dropped by 50%+
                && ctx.deal.financials.daysToClose <= 45
                && ctx.deal.technicalTrack.progressPercentage < 80;
        },
        message: (ctx) =>
            `Gate velocity has dropped ${Math.abs(ctx.deal.velocityData.velocityChangePct)}% ` +
            `with only ${ctx.deal.financials.daysToClose} days to close and ` +
            `${ctx.deal.technicalTrack.progressPercentage}% gates done. ` +
            `At current pace, deal will not be technically validated in time.`
    },

    {
        code: 'UNPROTECTED_ELEPHANT',
        severity: 'YELLOW',
        weight: 70,
        category: 'Financial',
        evaluate: (ctx) => {
            return ctx.deal.financials.calculatedTCV >= ctx.thresholds.elephant_tcv_threshold
                && ctx.deal.financials.servicesTier === 'None';
        },
        message: (ctx) =>
            `Deal TCV ($${(ctx.deal.financials.calculatedTCV / 1000000).toFixed(1)}M) ` +
            `exceeds elephant threshold but has no Professional Services or ` +
            `Premium Support attached. High risk of post-sale deployment failure.`
    },

    {
        code: 'CLOSE_DATE_PRESSURE',
        severity: 'YELLOW',
        weight: 65,
        category: 'Temporal',
        evaluate: (ctx) => {
            if (!ctx.deal.financials.daysToClose || ctx.deal.financials.daysToClose <= 0) return false;
            return ctx.deal.financials.daysToClose <= (ctx.thresholds.close_date_warning_days || 30)
                && ctx.deal.technicalTrack.progressPercentage < (ctx.thresholds.gate_completion_warn_pct || 50);
        },
        message: (ctx) =>
            `Expected close in ${ctx.deal.financials.daysToClose} days but only ` +
            `${ctx.deal.technicalTrack.progressPercentage}% of gates complete ` +
            `(expected: ≥${ctx.thresholds.gate_completion_warn_pct || 50}%). ` +
            `High risk of close date slip.`
    },

    {
        code: 'PHANTOM_CHAMPION',
        severity: 'YELLOW',
        weight: 60,
        category: 'Stakeholder',
        evaluate: (ctx) => {
            return ctx.deal.salesStage !== 'Discovery'
                && !ctx.gateMap['G1_EXECUTIVE_AGREED']
                && ctx.deal.daysSinceCreation > (ctx.thresholds.phantom_champion_days || 30);
        },
        message: (ctx) =>
            `${ctx.deal.daysSinceCreation} days active without executive alignment. ` +
            `Current point of contact may lack decision-making authority. ` +
            `Risk of silent deal death.`
    },

    {
        code: 'POC_DEATH_MARCH',
        severity: 'YELLOW',
        weight: 58,
        category: 'Technical',
        evaluate: (ctx) => {
            return ctx.deal.salesStage === 'Validation'
                && ctx.deal.daysInStage > (ctx.thresholds.max_poc_days || 45)
                && !ctx.gateMap['G1_CRITERIA_LOCKED'];
        },
        message: (ctx) =>
            `In Validation for ${ctx.deal.daysInStage} days (max recommended: ` +
            `${ctx.thresholds.max_poc_days || 45}) without locked success criteria. ` +
            `The PoC has no defined completion conditions — it may run indefinitely.`
    },

    {
        code: 'GHOST_PIPELINE',
        severity: 'YELLOW',
        weight: 50,
        category: 'Engagement',
        evaluate: (ctx) => {
            const hasNotes = ctx.deal.blueprintNotes && ctx.deal.blueprintNotes.trim().length >= 20;
            const hasBlockers = ctx.blockers && ctx.blockers.filter(b => !b.is_resolved).length > 0;
            return !hasBlockers && !hasNotes
                && ctx.deal.daysSinceLastUpdate > (ctx.thresholds.ghost_pipeline_days || 14);
        },
        message: (ctx) =>
            `No blockers logged, no strategic notes, and no updates in ` +
            `${ctx.deal.daysSinceLastUpdate} days. Deal may be running on autopilot.`
    },

    {
        code: 'SIEM_UNDERSCOPED',
        severity: 'YELLOW',
        weight: 48,
        category: 'Financial',
        evaluate: (ctx) => {
            // Product-specific: Log360 deal with high log source count
            // but TCV below expected threshold for that scope
            if (!ctx.deal.product_metadata) return false;
            const { product_type, log_source_count } = ctx.deal.product_metadata;
            return product_type === 'Log360'
                && log_source_count > (ctx.thresholds.siem_high_source_count || 500)
                && ctx.deal.financials.calculatedTCV < ctx.thresholds.elephant_tcv_threshold;
        },
        message: (ctx) =>
            `Log360 deployment with ${ctx.deal.product_metadata.log_source_count} log ` +
            `sources but TCV ($${(ctx.deal.financials.calculatedTCV / 1000).toFixed(0)}K) ` +
            `is below elephant threshold. Likely underscoped — high risk of ` +
            `post-sale resource overrun.`
    },

    {
        code: 'LOW_ATTACH_ELEPHANT',
        severity: 'YELLOW',
        weight: 45,
        category: 'Financial',
        evaluate: (ctx) => {
            if (ctx.deal.financials.calculatedTCV < ctx.thresholds.elephant_tcv_threshold) return false;
            const crossSellCount = ctx.crossSells ? ctx.crossSells.filter(c => c.is_pitched).length : 0;
            // Attach rate: cross-sells pitched vs. products in catalog
            const catalogSize = ctx.productCatalogSize || 6;
            return crossSellCount / catalogSize <= 0.34;
        },
        message: (ctx) =>
            `Elephant deal with low cross-sell attach rate ` +
            `(${ctx.crossSells?.filter(c => c.is_pitched).length || 0} products pitched). ` +
            `Opportunity to expand deal scope and increase stickiness.`
    },

    {
        code: 'UNRESOLVED_CRITICAL_BLOCKERS',
        severity: 'YELLOW',
        weight: 40,
        category: 'Engagement',
        evaluate: (ctx) => {
            return ctx.blockers && ctx.blockers.some(b => !b.is_resolved && b.severity_name === 'High');
        },
        message: (ctx) => {
            const count = ctx.blockers.filter(b => !b.is_resolved && b.severity_name === 'High').length;
            return `${count} high-severity blocker(s) remain unresolved. ` +
                `Executive review recommended to clear path.`;
        }
    },

    {
        code: 'NO_CLOSE_DATE',
        severity: 'YELLOW',
        weight: 30,
        category: 'Temporal',
        evaluate: (ctx) => {
            return ctx.deal.salesStage !== 'Discovery'
                && ctx.deal.salesStage !== 'Closed-Won'
                && ctx.deal.salesStage !== 'Closed-Lost'
                && !ctx.deal.financials.expectedCloseDate;
        },
        message: () =>
            `Deal has advanced past Discovery without an expected close date. ` +
            `Pipeline forecasting is unreliable without target dates.`
    },

    // ── DATA QUALITY (not a risk pattern — special handling) ──

    {
        code: 'MISSING_FX_RATE',
        severity: 'INFO',
        weight: 0,
        category: 'Data Quality',
        evaluate: (ctx) => {
            return ctx.deal.financials.dealCurrency !== 'USD'
                && !ctx.deal.fx_rate;
        },
        message: (ctx) =>
            `Non-USD deal (${ctx.deal.financials.dealCurrency}) has no FX rate configured. ` +
            `TCV normalization to USD is unreliable. This is a data quality issue, not a risk signal.`
    }
];


// ══════════════════════════════════════════════════════════
// LAYER 3: UNIFIED ENGINE ORCHESTRATION
// ══════════════════════════════════════════════════════════

async function computeUnifiedRisk(dealId, pool) {
    // ── Fetch all data in parallel ─────────────────────
    const [
        deal, gates, blockers, competitors, competitiveHistory,
        stakeholders, decisions, crossSells, benchmarks,
        previousScore, thresholds, velocityData
    ] = await Promise.all([
        fetchDealWithIntelligence(dealId, pool),
        fetchGates(dealId, pool),
        fetchAllBlockers(dealId, pool),
        fetchCompetitors(dealId, pool),
        fetchCompetitiveHistory(pool),
        fetchStakeholders(dealId, pool),
        fetchDecisions(dealId, pool),
        fetchCrossSells(dealId, pool),
        fetchVelocityBenchmarks(pool),
        fetchPreviousScore(dealId, pool),
        fetchThresholds(pool),
        fetchVelocityData(dealId, pool)
    ]);

    // Build context object for pattern evaluation
    const gateMap = {};
    for (const gate of gates) {
        gateMap[gate.gate_code] = gate.is_completed;
    }

    const ctx = {
        deal: { ...deal, velocityData },
        gates,
        gateMap,
        blockers,
        competitors,
        stakeholders,
        decisions,
        crossSells,
        thresholds,
        productCatalogSize: 6 // Fetch from product_catalog count
    };

    // ──────────────────────────────────────────────────
    // LAYER 1: Compute base dimensional scores
    // ──────────────────────────────────────────────────
    const baseDimensions = [
        scoreTechnicalReadiness(deal, gates, benchmarks),
        scoreCommercialAlignment(deal, gates),
        scoreStakeholderCoverage(deal, stakeholders),
        scoreTemporalPressure(deal, benchmarks),
        scoreFinancialStructure(deal, crossSells),
        scoreCompetitiveExposure(deal, competitors, competitiveHistory),
        scoreEngagementVitality(deal, blockers, decisions)
    ];

    // ──────────────────────────────────────────────────
    // LAYER 2: Evaluate all named patterns
    // ──────────────────────────────────────────────────
    const activePatterns = [];
    const dataQualityWarnings = [];

    for (const pattern of namedPatterns) {
        const isFired = pattern.evaluate(ctx);

        if (pattern.category === 'Data Quality' && isFired) {
            dataQualityWarnings.push({
                code: pattern.code,
                severity: pattern.severity,
                message: pattern.message(ctx)
            });
            continue;
        }

        if (isFired) {
            activePatterns.push({
                code: pattern.code,
                severity: pattern.severity,
                weight: pattern.weight,
                category: pattern.category,
                message: pattern.message(ctx),
                isStageGuardrail: pattern.isStageGuardrail || false,
                guardrailMessage: pattern.guardrailMessage || null
            });
        }
    }

    // Sort patterns: RED first, then by weight descending
    activePatterns.sort((a, b) => {
        if (a.severity === 'RED' && b.severity !== 'RED') return -1;
        if (b.severity === 'RED' && a.severity !== 'RED') return 1;
        return b.weight - a.weight;
    });

    // ──────────────────────────────────────────────────
    // LAYER 3: Apply pattern amplification to dimensions
    // ──────────────────────────────────────────────────
    const amplificationAccumulator = {};
    for (const dim of baseDimensions) {
        amplificationAccumulator[dim.name] = 0;
    }

    for (const pattern of activePatterns) {
        const mapping = PATTERN_DIMENSION_MAP[pattern.code];
        if (!mapping) continue;

        for (const amp of mapping.amplifications) {
            amplificationAccumulator[amp.dimension] =
                Math.min(
                    (amplificationAccumulator[amp.dimension] || 0) + amp.boost,
                    MAX_AMPLIFICATION_PER_DIMENSION  // Cap per-dimension amplification
                );
        }
    }

    // Apply amplifications to dimension scores
    const adjustedDimensions = baseDimensions.map(dim => {
        const amplification = amplificationAccumulator[dim.name] || 0;
        const rawAdjusted = dim.score + amplification;
        const adjustedScore = Math.min(rawAdjusted, DIMENSION_SCORE_CAP);

        return {
            ...dim,
            baseScore: dim.score,           // Score before pattern amplification
            amplification,                   // How much patterns boosted this dimension
            score: adjustedScore,            // Final score after amplification
            activePatterns: activePatterns    // Which patterns are contributing
                .filter(p => {
                    const mapping = PATTERN_DIMENSION_MAP[p.code];
                    return mapping?.amplifications?.some(a => a.dimension === dim.name);
                })
                .map(p => p.code)
        };
    });

    // ──────────────────────────────────────────────────
    // Compute composite score
    // ──────────────────────────────────────────────────
    let weightedSum = 0;
    let totalWeight = 0;

    for (const dim of adjustedDimensions) {
        const weight = DIMENSION_WEIGHTS[dim.name] || 0;
        weightedSum += dim.score * weight;
        if (dim.assessable) {
            totalWeight += weight;
        }
    }

    const compositeScore = totalWeight > 0
        ? Math.min(100, Math.round(weightedSum / totalWeight))
        : 0;

    const riskLevel = classifyRiskLevel(compositeScore);

    // ──────────────────────────────────────────────────
    // Trend computation
    // ──────────────────────────────────────────────────
    const historicalScores = await fetchRiskHistory(dealId, 14, pool);
    const trend = computeTrend(compositeScore, historicalScores);

    // ──────────────────────────────────────────────────
    // Stage guardrail determination
    // ──────────────────────────────────────────────────
    const stageGuardrail = activePatterns.find(p => p.isStageGuardrail);
    const stageGuardrailActive = !!stageGuardrail;

    // ──────────────────────────────────────────────────
    // Top risk drivers (ranked by impact)
    // ──────────────────────────────────────────────────
    const topDrivers = adjustedDimensions
        .flatMap(dim =>
            dim.signals.map(s => ({
                dimension: dim.name,
                factor: s.factor,
                baseImpact: Math.round(s.rawScore * s.weight * (DIMENSION_WEIGHTS[dim.name] || 0) * 100) / 100,
                adjustedImpact: Math.round(
                    (s.rawScore + (dim.amplification * s.weight)) * s.weight *
                    (DIMENSION_WEIGHTS[dim.name] || 0) * 100
                ) / 100
            }))
        )
        .sort((a, b) => b.adjustedImpact - a.adjustedImpact)
        .slice(0, 5);

    // ──────────────────────────────────────────────────
    // Recommended actions (from both layers)
    // ──────────────────────────────────────────────────
    const actions = generateUnifiedActions(adjustedDimensions, activePatterns, deal);

    // ──────────────────────────────────────────────────
    // Assemble final output
    // ──────────────────────────────────────────────────
    const result = {
        dealId: deal.id,
        accountName: deal.account_name,
        dealName: deal.deal_name,

        // Composite
        compositeScore,
        riskLevel: riskLevel.level,
        riskLabel: riskLevel.label,
        riskColor: riskLevel.color,
        trend: trend.trend,
        trendDelta: trend.delta,
        sparkline: trend.sparkline,

        // Layer 1 output
        dimensions: adjustedDimensions.map(d => ({
            name: d.name,
            score: d.score,
            baseScore: d.baseScore,
            amplification: d.amplification,
            weight: DIMENSION_WEIGHTS[d.name],
            assessable: d.assessable,
            signals: d.signals,
            contributingPatterns: d.activePatterns
        })),

        // Layer 2 output
        activePatterns: activePatterns.map(p => ({
            code: p.code,
            severity: p.severity,
            weight: p.weight,
            category: p.category,
            message: p.message,
            isStageGuardrail: p.isStageGuardrail
        })),

        // Stage guardrail
        stageGuardrail: {
            active: stageGuardrailActive,
            blockingPattern: stageGuardrail?.code || null,
            message: stageGuardrail?.guardrailMessage || null
        },

        // Layer 3 output
        topDrivers,
        recommendedActions: actions,
        dataQualityWarnings,

        computedAt: new Date().toISOString()
    };

    // Store snapshot for trend analysis
    await storeRiskSnapshot(result, pool);

    return result;
}


// ══════════════════════════════════════════════════════════
// UNIFIED ACTION GENERATOR
// ══════════════════════════════════════════════════════════

function generateUnifiedActions(dimensions, patterns, deal) {
    const actions = [];

    // ── Actions from Stage Guardrails (highest priority) ──
    const guardrails = patterns.filter(p => p.isStageGuardrail);
    for (const g of guardrails) {
        actions.push({
            source: 'STAGE_GUARDRAIL',
            priority: 'BLOCKER',
            action: g.guardrailMessage,
            patternCode: g.code,
            dimension: null
        });
    }

    // ── Actions from Patterns (specific diagnoses) ────────
    for (const pattern of patterns.filter(p => !p.isStageGuardrail)) {
        switch (pattern.code) {
            case 'GHOST_PIPELINE':
                actions.push({
                    source: 'PATTERN',
                    priority: 'CRITICAL',
                    action: 'Schedule a 1:1 deep-dive with the Account Manager and Technical Lead. This deal has no active management.',
                    patternCode: pattern.code,
                    dimension: 'Engagement Vitality'
                });
                break;

            case 'COMPETITIVE_DISPLACEMENT_STALL':
                actions.push({
                    source: 'PATTERN',
                    priority: 'CRITICAL',
                    action: 'Accelerate differentiation proof points. Every day of stall advantages the competitor. Set a hard deadline for gate advancement.',
                    patternCode: pattern.code,
                    dimension: 'Competitive Exposure'
                });
                break;

            case 'SLOW_MOTION_COLLISION':
                actions.push({
                    source: 'PATTERN',
                    priority: 'CRITICAL',
                    action: 'Negotiate close date extension immediately. Current velocity makes the existing close date mathematically impossible.',
                    patternCode: pattern.code,
                    dimension: 'Temporal Pressure'
                });
                break;

            case 'POC_DEATH_MARCH':
                actions.push({
                    source: 'PATTERN',
                    priority: 'HIGH',
                    action: 'Define PoC exit criteria NOW. Either lock Gate 1 success criteria or terminate the PoC. An undefined PoC is a resource drain.',
                    patternCode: pattern.code,
                    dimension: 'Technical Readiness'
                });
                break;

            case 'COMPLIANCE_DEADLINE_RISK':
                actions.push({
                    source: 'PATTERN',
                    priority: 'HIGH',
                    action: 'Fast-track compliance documentation. Assign a dedicated resource to the InfoSec/compliance workstream.',
                    patternCode: pattern.code,
                    dimension: 'Temporal Pressure'
                });
                break;

            case 'PHANTOM_CHAMPION':
                actions.push({
                    source: 'PATTERN',
                    priority: 'HIGH',
                    action: 'Request a C-suite introduction. The current contact may lack buying authority — escalate to find the real decision maker.',
                    patternCode: pattern.code,
                    dimension: 'Stakeholder Coverage'
                });
                break;

            case 'UNPROTECTED_ELEPHANT':
                actions.push({
                    source: 'PATTERN',
                    priority: 'HIGH',
                    action: 'Draft and present a Professional Services SOW. At this TCV level, the customer needs implementation support to succeed.',
                    patternCode: pattern.code,
                    dimension: 'Financial Structure'
                });
                break;

            case 'CLOSE_DATE_PRESSURE':
                actions.push({
                    source: 'PATTERN',
                    priority: 'HIGH',
                    action: `Either accelerate gate completion (need ${Math.round((100 - deal.technicalTrack.progressPercentage) / Math.max(deal.financials.daysToClose, 1) * 7)} gates/week) or negotiate a close date extension.`,
                    patternCode: pattern.code,
                    dimension: 'Temporal Pressure'
                });
                break;

            case 'UNRESOLVED_CRITICAL_BLOCKERS':
                actions.push({
                    source: 'PATTERN',
                    priority: 'HIGH',
                    action: 'Escalate high-severity blockers to the Commander for executive intervention.',
                    patternCode: pattern.code,
                    dimension: 'Engagement Vitality'
                });
                break;

            case 'LOW_ATTACH_ELEPHANT':
                actions.push({
                    source: 'PATTERN',
                    priority: 'MEDIUM',
                    action: 'Identify cross-sell opportunities. At this TCV, additional product attach increases stickiness and deal value.',
                    patternCode: pattern.code,
                    dimension: 'Financial Structure'
                });
                break;

            case 'SIEM_UNDERSCOPED':
                actions.push({
                    source: 'PATTERN',
                    priority: 'MEDIUM',
                    action: 'Revisit deal scope with the customer. High log source count at current TCV suggests the deployment is underscoped.',
                    patternCode: pattern.code,
                    dimension: 'Financial Structure'
                });
                break;

            case 'NO_CLOSE_DATE':
                actions.push({
                    source: 'PATTERN',
                    priority: 'MEDIUM',
                    action: 'Set an expected close date. Without a target, there is no accountability for pace.',
                    patternCode: pattern.code,
                    dimension: 'Temporal Pressure'
                });
                break;
        }
    }

    // ── Actions from Dimensions (continuous signals not
    //    already covered by patterns) ──────────────────────

    for (const dim of dimensions) {
        if (dim.score < 40) continue; // Only for meaningful risk

        // Check if a pattern already covers this dimension
        const alreadyCovered = actions.some(a => a.dimension === dim.name);
        if (alreadyCovered) continue;

        // Generate a generic dimension-based action
        switch (dim.name) {
            case 'Stakeholder Coverage':
                if (dim.score >= 50) {
                    const hasHostile = dim.signals.some(s =>
                        s.factor.toLowerCase().includes('hostile')
                    );
                    if (hasHostile) {
                        actions.push({
                            source: 'DIMENSION',
                            priority: 'CRITICAL',
                            action: 'Initiate executive-to-executive engagement to address hostile stakeholder.',
                            patternCode: null,
                            dimension: dim.name
                        });
                    } else {
                        actions.push({
                            source: 'DIMENSION',
                            priority: 'HIGH',
                            action: 'Map the full stakeholder landscape. Identify economic buyer and champion.',
                            patternCode: null,
                            dimension: dim.name
                        });
                    }
                }
                break;

            case 'Commercial Alignment':
                if (dim.score >= 50) {
                    actions.push({
                        source: 'DIMENSION',
                        priority: 'HIGH',
                        action: 'Commercial motion is ahead of technical readiness. Present gate status to the Account Manager as evidence for pausing contract negotiations.',
                        patternCode: null,
                        dimension: dim.name
                    });
                }
                break;

            case 'Technical Readiness':
                if (dim.score >= 50) {
                    actions.push({
                        source: 'DIMENSION',
                        priority: 'HIGH',
                        action: 'Technical validation is lagging. Schedule a focused technical work session to unblock gate progression.',
                        patternCode: null,
                        dimension: dim.name
                    });
                }
                break;
        }
    }

    // Sort: BLOCKER → CRITICAL → HIGH → MEDIUM
    const order = { 'BLOCKER': 0, 'CRITICAL': 1, 'HIGH': 2, 'MEDIUM': 3, 'LOW': 4 };
    return actions.sort((a, b) => order[a.priority] - order[b.priority]);
}


// ══════════════════════════════════════════════════════════
// HELPERS
// ══════════════════════════════════════════════════════════

function classifyRiskLevel(score) {
    if (score <= 25) return { level: 'LOW',      label: 'LOW RISK',       color: '#22C55E' };
    if (score <= 50) return { level: 'MODERATE',  label: 'MODERATE RISK',  color: '#F59E0B' };
    if (score <= 75) return { level: 'ELEVATED',  label: 'ELEVATED RISK',  color: '#F97316' };
    return                   { level: 'HIGH',      label: 'HIGH RISK',      color: '#EF4444' };
}

function daysBetween(a, b) {
    return Math.floor((b - a) / (1000 * 60 * 60 * 24));
}

function computeTrend(currentScore, historicalScores) {
    if (!historicalScores || historicalScores.length < 2) {
        return { trend: 'INSUFFICIENT_DATA', delta: 0, sparkline: [currentScore] };
    }
    const scores = [...historicalScores.map(h => h.composite_score), currentScore];
    const sevenDaysAgo = new Date(Date.now() - 7 * 86400000);
    const recent = historicalScores.filter(h => new Date(h.computed_at) >= sevenDaysAgo);
    const oldest = recent.length > 0 ? recent[0].composite_score : currentScore;
    const delta = currentScore - oldest;

    let trend;
    if (delta >= 8) trend = 'INCREASING';
    else if (delta <= -8) trend = 'DECREASING';
    else trend = 'STABLE';

    return { trend, delta, sparkline: scores };
}

module.exports = { computeUnifiedRisk, namedPatterns, PATTERN_DIMENSION_MAP };
```

---

## What Changes for the Existing 15 Patterns

**Nothing.** They remain exactly as defined. The evaluation logic, the trigger conditions, the messages, the weights — all preserved. Here is what *is* new:

| Aspect | Before (V1) | After (Unified Engine) |
|---|---|---|
| Pattern evaluation | Identical | Identical — same code, same conditions |
| Pattern output | Listed as alerts in a flat array | Same list, PLUS each pattern now contributes amplification to dimension scores |
| Health score | Computed from pattern weights alone | Computed from dimensional scores (which are amplified by patterns) |
| Stage guardrails | 3 RED patterns returned 409 | Same 3 patterns still return 409 — guardrail logic unchanged |
| Pattern visibility | Shown in "Risk Advisory" section | Shown in "Active Patterns" section, linked to their contributing dimensions |
| MISSING_FX_RATE | Special data quality warning | Same — classified as `category: 'Data Quality'`, excluded from risk scoring |

The 15 patterns are not replaced. They are **elevated** — from being the entire risk system to being one layer of a richer system.

---

## What the Commander Sees

### Deal Risk Card (Unified View)

```
┌──────────────────────────────────────────────────────────────────────────┐
│                                                                           │
│  ACME CORP — $1.45M                           RISK SCORE: 67  ELEVATED  │
│                                                   ▲ +12 (7 days)         │
│                                                   ▁▂▃▃▄▅▅▆              │
│                                                                           │
│  ── DIMENSION SCORES ────────────────────────────────────────────────── │
│                                                                           │
│  Commercial Alignment   82  ████████████████████████████████░░░░░░       │
│     ▲ +25 (PREMATURE_COMMERCIAL active)                                  │
│                                                                           │
│  Temporal Pressure      68  ████████████████████████████░░░░░░░░░░       │
│     ▲ +15 (COMPETITIVE_DISPLACEMENT_STALL active)                       │
│                                                                           │
│  Technical Readiness    55  ██████████████████████░░░░░░░░░░░░░░░░       │
│     ▲ +15 (PREMATURE_COMMERCIAL active)                                  │
│                                                                           │
│  Engagement Vitality    45  ██████████████████░░░░░░░░░░░░░░░░░░░░       │
│                                                                           │
│  Stakeholder Coverage   40  ████████████████░░░░░░░░░░░░░░░░░░░░░░       │
│                                                                           │
│  Financial Structure    30  ████████████░░░░░░░░░░░░░░░░░░░░░░░░░░       │
│                                                                           │
│  Competitive Exposure   25  ██████████░░░░░░░░░░░░░░░░░░░░░░░░░░░░       │
│                                                                           │
│  ── ACTIVE PATTERNS (2) ─────────────────────────────────────────────── │
│                                                                           │
│  🔴 PREMATURE_COMMERCIAL (Stage Guardrail — blocks advancement)          │
│     Sales moved to Commercial before Gate 3 performance validation.      │
│     → Boosts: Commercial Alignment +25, Technical Readiness +15          │
│                                                                           │
│  🟡 COMPETITIVE_DISPLACEMENT_STALL                                        │
│     Stalled 35 days in Commercial while competing against AWS.           │
│     → Boosts: Competitive Exposure +25, Temporal Pressure +15            │
│                                                                           │
│  ── STAGE GUARDRAIL ──────────────────────────────────────────────────── │
│  ⛔ ACTIVE: Cannot advance to Procurement. Gate 3 must be passed first.  │
│                                                                           │
│  ── RECOMMENDED ACTIONS ──────────────────────────────────────────────── │
│                                                                           │
│  ⛔ BLOCKER: Pause commercial advancement until Gate 3 is complete.      │
│  🔴 CRITICAL: Accelerate differentiation vs. AWS. Set hard deadline.     │
│  🟠 HIGH: Negotiate close date extension — current pace unsustainable.  │
│                                                                           │
└──────────────────────────────────────────────────────────────────────────┘
```

Notice what changed: the Commander now sees **why** each dimension score is what it is. The "Commercial Alignment" dimension is 82 *because* `PREMATURE_COMMERCIAL` added 25 points. Without that pattern firing, the base score would be 57 — still concerning, but not critical. The pattern names the specific problem. The dimension shows its continuous effect. Together, they tell a complete story.

---

## API Output Structure (Unified)

```json
{
    "dealId": "uuid",
    "accountName": "ACME CORP",
    "compositeScore": 67,
    "riskLevel": "ELEVATED",
    "riskLabel": "ELEVATED RISK",
    "riskColor": "#F97316",
    "trend": "INCREASING",
    "trendDelta": 12,
    "sparkline": [38, 40, 42, 45, 48, 52, 55, 67],

    "dimensions": [
        {
            "name": "Commercial Alignment",
            "score": 82,
            "baseScore": 57,
            "amplification": 25,
            "weight": 0.15,
            "assessable": true,
            "signals": [
                { "factor": "Stage: Commercial, expected ~50% gates, actual: 33%", "rawScore": 75, "weight": 0.45 },
                { "factor": "Reported probability: 65% vs. gate progress: 33%", "rawScore": 50, "weight": 0.25 }
            ],
            "contributingPatterns": ["PREMATURE_COMMERCIAL"]
        }
    ],

    "activePatterns": [
        {
            "code": "PREMATURE_COMMERCIAL",
            "severity": "RED",
            "weight": 100,
            "category": "Stage Guardrail",
            "message": "Sales has moved to Commercial before Gate 3 (Performance/Scalability) is validated.",
            "isStageGuardrail": true
        },
        {
            "code": "COMPETITIVE_DISPLACEMENT_STALL",
            "severity": "YELLOW",
            "weight": 80,
            "category": "Competitive",
            "message": "Stalled 35 days in Commercial while competing against AWS.",
            "isStageGuardrail": false
        }
    ],

    "stageGuardrail": {
        "active": true,
        "blockingPattern": "PREMATURE_COMMERCIAL",
        "message": "Cannot advance stage: Gate 3 (Performance) must be passed before entering Procurement."
    },

    "topDrivers": [
        { "dimension": "Commercial Alignment", "factor": "Stage ahead of gates", "adjustedImpact": 6.75 },
        { "dimension": "Technical Readiness", "factor": "33% gates complete", "adjustedImpact": 4.80 },
        { "dimension": "Temporal Pressure", "factor": "35 days in Commercial", "adjustedImpact": 3.20 }
    ],

    "recommendedActions": [
        { "source": "STAGE_GUARDRAIL", "priority": "BLOCKER", "action": "Cannot advance: Gate 3 required.", "patternCode": "PREMATURE_COMMERCIAL" },
        { "source": "PATTERN", "priority": "CRITICAL", "action": "Accelerate differentiation vs. AWS.", "patternCode": "COMPETITIVE_DISPLACEMENT_STALL" },
        { "source": "DIMENSION", "priority": "HIGH", "action": "Negotiate close date extension.", "patternCode": null }
    ],

    "dataQualityWarnings": [],

    "computedAt": "2025-06-21T10:30:00Z"
}
```

---

## Why This Architecture Is Better Than Either System Alone

**Dimensional scores without patterns** would tell the Commander "Commercial Alignment is 57" — a moderately concerning number. But it wouldn't name the specific failure mode. The Commander would have to dig into the signal details to understand *why*.

**Patterns without dimensional scores** would tell the Commander "PREMATURE_COMMERCIAL is active" — a specific diagnosis. But it wouldn't show that the deal also has slow engagement, temporal pressure, and weak stakeholder coverage. It wouldn't show that the Commercial Alignment dimension has been climbing for two weeks. It wouldn't let the Commander compare the overall health of this deal to other deals on a continuous scale.

**Together**, the system tells the Commander: "This deal's Commercial Alignment is 82 out of 100, and it's 82 specifically *because* sales pushed to Commercial before Gate 3 was done. Here's the named pattern, here's the continuous score, here's the trend, here's the stage guardrail, and here's what to do about it."

That is a system that turns data into decisions.