// Risk Engine v2.0 — Layer 3: synthesis (PURE, ISOMORPHIC).
//
// Combines Layer-1 dimensional scores with the Layer-2 named-pattern flags into
// a single unified risk assessment: pattern amplification → composite score →
// risk-level classification → top drivers → recommended actions.
//
// PURITY: no Date.now()/new Date()/Math.random(); no DB/network. All inputs are
// explicit. Ported from `Risk Engine2.md` (amplification, composite, classify,
// topDrivers, generateUnifiedActions) and `Risk Engine.md` §4/§6.
//
// EXPLICITLY OUT OF SCOPE: trend / sparkline / snapshot — none of it lives here.

import type {
  DimensionName,
  DimensionFnResult,
  DimensionScore,
  RiskLevel,
  RiskDriver,
  RecommendedAction,
  ActionPriority,
  UnifiedRisk,
  RiskV2Weights,
  RiskLevelBoundaries,
} from "./risk-v2-types";

export * from "./risk-v2-types";

// ── Configuration ──────────────────────────────────────────────────────────

export const HARDCODED_WEIGHTS: RiskV2Weights = {
  technical: 0.2,
  commercial: 0.15,
  stakeholder: 0.15,
  temporal: 0.15,
  financial: 0.1,
  competitive: 0.1,
  engagement: 0.15,
};

export const HARDCODED_BOUNDARIES: RiskLevelBoundaries = {
  lowMax: 25,
  moderateMax: 50,
  elevatedMax: 75,
};

/** A single pattern can never push a dimension above this absolute value. */
export const DIMENSION_SCORE_CAP = 100;

/** Cap on the total amplification any one dimension can accumulate. */
export const MAX_AMPLIFICATION_PER_DIMENSION = 40;

/** Maps a `DimensionName` to its weight in the supplied `RiskV2Weights`. */
const DIMENSION_WEIGHT_KEY: Record<DimensionName, keyof RiskV2Weights> = {
  "Technical Readiness": "technical",
  "Commercial Alignment": "commercial",
  "Stakeholder Coverage": "stakeholder",
  "Temporal Pressure": "temporal",
  "Financial Structure": "financial",
  "Competitive Exposure": "competitive",
  "Engagement Vitality": "engagement",
};

function weightFor(name: DimensionName, weights: RiskV2Weights): number {
  return weights[DIMENSION_WEIGHT_KEY[name]] ?? 0;
}

// ── Pattern → Dimension amplification map ────────────────────────────────────
// Ported verbatim from Risk Engine2.md, reconciled to our REAL 16 pattern
// codes. STALLED_VALIDATION is ADDED (the spec map omits it) per the brief.

interface PatternMapEntry {
  amplifications: { dimension: DimensionName; boost: number }[];
  isStageGuardrail: boolean;
  guardrailMessage?: string;
}

export const PATTERN_DIMENSION_MAP: Record<string, PatternMapEntry> = {
  // ── RED / Stage Guardrails ──
  PREMATURE_COMMERCIAL: {
    amplifications: [
      { dimension: "Commercial Alignment", boost: 25 },
      { dimension: "Technical Readiness", boost: 15 },
    ],
    isStageGuardrail: true,
    guardrailMessage:
      "Cannot advance stage: Gate 3 (Performance) must be passed before entering Commercial/Procurement.",
  },
  MISSING_STRUCTURAL_ANCHOR: {
    amplifications: [
      { dimension: "Technical Readiness", boost: 20 },
      { dimension: "Commercial Alignment", boost: 15 },
    ],
    isStageGuardrail: true,
    guardrailMessage: "Cannot advance stage: Gate 1 (Success Criteria) must be locked.",
  },
  DISCOUNT_TRAP: {
    amplifications: [
      { dimension: "Financial Structure", boost: 30 },
      { dimension: "Commercial Alignment", boost: 20 },
    ],
    isStageGuardrail: true,
    guardrailMessage:
      "Cannot advance stage: Mega-deal in Commercial with zero services requires executive pricing override.",
  },

  // ── YELLOW / Advisory ──
  COMPETITIVE_DISPLACEMENT_STALL: {
    amplifications: [
      { dimension: "Competitive Exposure", boost: 25 },
      { dimension: "Temporal Pressure", boost: 15 },
    ],
    isStageGuardrail: false,
  },
  SLOW_MOTION_COLLISION: {
    amplifications: [
      { dimension: "Temporal Pressure", boost: 25 },
      { dimension: "Technical Readiness", boost: 15 },
      { dimension: "Engagement Vitality", boost: 10 },
    ],
    isStageGuardrail: false,
  },
  UNPROTECTED_ELEPHANT: {
    amplifications: [{ dimension: "Financial Structure", boost: 25 }],
    isStageGuardrail: false,
  },
  CLOSE_DATE_PRESSURE: {
    amplifications: [{ dimension: "Temporal Pressure", boost: 20 }],
    isStageGuardrail: false,
  },
  PHANTOM_CHAMPION: {
    amplifications: [
      { dimension: "Stakeholder Coverage", boost: 20 },
      { dimension: "Engagement Vitality", boost: 10 },
    ],
    isStageGuardrail: false,
  },
  POC_DEATH_MARCH: {
    amplifications: [
      { dimension: "Temporal Pressure", boost: 20 },
      { dimension: "Technical Readiness", boost: 15 },
      { dimension: "Engagement Vitality", boost: 10 },
    ],
    isStageGuardrail: false,
  },
  GHOST_PIPELINE: {
    amplifications: [{ dimension: "Engagement Vitality", boost: 30 }],
    isStageGuardrail: false,
  },
  SIEM_UNDERSCOPED: {
    amplifications: [{ dimension: "Financial Structure", boost: 15 }],
    isStageGuardrail: false,
  },
  LOW_ATTACH_ELEPHANT: {
    amplifications: [{ dimension: "Financial Structure", boost: 20 }],
    isStageGuardrail: false,
  },
  UNRESOLVED_CRITICAL_BLOCKERS: {
    amplifications: [
      { dimension: "Engagement Vitality", boost: 20 },
      { dimension: "Technical Readiness", boost: 10 },
    ],
    isStageGuardrail: false,
  },
  NO_CLOSE_DATE: {
    amplifications: [
      { dimension: "Temporal Pressure", boost: 15 },
      { dimension: "Engagement Vitality", boost: 10 },
    ],
    isStageGuardrail: false,
  },
  // ADDED — the spec map omits STALLED_VALIDATION; the brief specifies this entry.
  STALLED_VALIDATION: {
    amplifications: [
      { dimension: "Temporal Pressure", boost: 20 },
      { dimension: "Technical Readiness", boost: 15 },
    ],
    isStageGuardrail: false,
  },
  PLAYBOOK_EXECUTION_GAP: {
    amplifications: [
      { dimension: "Engagement Vitality", boost: 20 },
      { dimension: "Temporal Pressure", boost: 10 },
    ],
    isStageGuardrail: false,
  },
};

// ── Risk-level classification ────────────────────────────────────────────────

export function classifyRiskLevel(
  score: number,
  b: RiskLevelBoundaries = HARDCODED_BOUNDARIES,
): RiskLevel {
  if (score <= b.lowMax) return "LOW";
  if (score <= b.moderateMax) return "MODERATE";
  if (score <= b.elevatedMax) return "ELEVATED";
  return "HIGH";
}

// ── Composite score (assessable-only normalization) ──────────────────────────

export function computeComposite(
  adjustedDims: DimensionScore[],
  weights: RiskV2Weights,
): number {
  let weightedSum = 0;
  let totalWeight = 0;
  for (const dim of adjustedDims) {
    const weight = weightFor(dim.name, weights);
    if (dim.assessable) {
      weightedSum += dim.score * weight;
      totalWeight += weight;
    }
  }
  const normalized = totalWeight > 0 ? Math.round(weightedSum / totalWeight) : 0;
  return Math.min(100, Math.max(0, normalized));
}

// ── Pattern amplification ────────────────────────────────────────────────────

export function applyAmplification(
  baseDims: DimensionFnResult[],
  activePatternCodes: string[],
  map: Record<string, PatternMapEntry> = PATTERN_DIMENSION_MAP,
): DimensionScore[] {
  // Accumulate boost per dimension, capped, and remember which codes contributed.
  const accumulator: Partial<Record<DimensionName, number>> = {};
  const contributors: Partial<Record<DimensionName, string[]>> = {};

  for (const code of activePatternCodes) {
    const entry = map[code];
    if (!entry) continue;
    for (const amp of entry.amplifications) {
      const next = Math.min(
        (accumulator[amp.dimension] || 0) + amp.boost,
        MAX_AMPLIFICATION_PER_DIMENSION,
      );
      accumulator[amp.dimension] = next;
      (contributors[amp.dimension] ||= []).push(code);
    }
  }

  return baseDims.map((dim) => {
    const amplification = accumulator[dim.name] || 0;
    const score = Math.min(dim.score + amplification, DIMENSION_SCORE_CAP);
    return {
      ...dim,
      baseScore: dim.score,
      amplification,
      score,
      weight: 0, // populated by computeUnifiedRisk against the active weights
      contributingPatterns: contributors[dim.name] ? [...contributors[dim.name]!] : [],
    };
  });
}

// ── Top risk drivers ─────────────────────────────────────────────────────────
// adjustedImpact per Risk Engine2.md: a signal's raw score is nudged by the
// dimension's amplification (scaled by the signal weight), then weighted by the
// signal weight and the dimension's global weight.

export function topDrivers(
  adjustedDims: DimensionScore[],
  weights: RiskV2Weights = HARDCODED_WEIGHTS,
): RiskDriver[] {
  const drivers: RiskDriver[] = adjustedDims.flatMap((dim) => {
    const dimWeight = weightFor(dim.name, weights);
    return dim.signals.map((s) => ({
      dimension: dim.name,
      factor: s.factor,
      impact:
        Math.round(
          (s.rawScore + dim.amplification * s.weight) * s.weight * dimWeight * 100,
        ) / 100,
    }));
  });
  return drivers.sort((a, b) => b.impact - a.impact).slice(0, 5);
}

// ── Unified action generator ─────────────────────────────────────────────────

/** The minimal deal view the action strings need (no temporal computation). */
export interface RiskActionDealView {
  tcv: number;
  daysToClose: number | null;
  progressPct: number;
}

const PRIORITY_ORDER: Record<ActionPriority, number> = {
  BLOCKER: 0,
  CRITICAL: 1,
  HIGH: 2,
  MEDIUM: 3,
  LOW: 4,
};

export function generateUnifiedActions(
  adjustedDims: DimensionScore[],
  activePatternCodes: string[],
  guardrailCodes: string[],
  dealView: RiskActionDealView,
): RecommendedAction[] {
  const actions: RecommendedAction[] = [];

  // ── Stage guardrails (highest priority) ──
  for (const code of guardrailCodes) {
    const entry = PATTERN_DIMENSION_MAP[code];
    actions.push({
      source: "STAGE_GUARDRAIL",
      priority: "BLOCKER",
      action:
        entry?.guardrailMessage ?? `Cannot advance stage: ${code} must be resolved first.`,
      patternCode: code,
      dimension: null,
    });
  }

  // Patterns acting as guardrails are surfaced as BLOCKERs above; the per-pattern
  // diagnoses below cover the non-guardrail set.
  const guardrailSet = new Set(guardrailCodes);

  for (const code of activePatternCodes) {
    if (guardrailSet.has(code)) continue;
    switch (code) {
      case "GHOST_PIPELINE":
        actions.push({
          source: "PATTERN",
          priority: "CRITICAL",
          action:
            "Schedule a 1:1 deep-dive with the Account Manager and Technical Lead. This deal has no active management.",
          patternCode: code,
          dimension: "Engagement Vitality",
        });
        break;
      case "COMPETITIVE_DISPLACEMENT_STALL":
        actions.push({
          source: "PATTERN",
          priority: "CRITICAL",
          action:
            "Accelerate differentiation proof points. Every day of stall advantages the competitor. Set a hard deadline for gate advancement.",
          patternCode: code,
          dimension: "Competitive Exposure",
        });
        break;
      case "SLOW_MOTION_COLLISION":
        actions.push({
          source: "PATTERN",
          priority: "CRITICAL",
          action:
            "Negotiate close date extension immediately. Current velocity makes the existing close date mathematically impossible.",
          patternCode: code,
          dimension: "Temporal Pressure",
        });
        break;
      case "POC_DEATH_MARCH":
        actions.push({
          source: "PATTERN",
          priority: "HIGH",
          action:
            "Define PoC exit criteria NOW. Either lock Gate 1 success criteria or terminate the PoC. An undefined PoC is a resource drain.",
          patternCode: code,
          dimension: "Technical Readiness",
        });
        break;
      case "STALLED_VALIDATION":
        actions.push({
          source: "PATTERN",
          priority: "HIGH",
          action:
            "Force an escalation review on the stalled validation. Identify the specific blocker and set a gate-completion deadline.",
          patternCode: code,
          dimension: "Temporal Pressure",
        });
        break;
      case "PHANTOM_CHAMPION":
        actions.push({
          source: "PATTERN",
          priority: "HIGH",
          action:
            "Request a C-suite introduction. The current contact may lack buying authority — escalate to find the real decision maker.",
          patternCode: code,
          dimension: "Stakeholder Coverage",
        });
        break;
      case "UNPROTECTED_ELEPHANT":
        actions.push({
          source: "PATTERN",
          priority: "HIGH",
          action:
            "Draft and present a Professional Services SOW. At this TCV level, the customer needs implementation support to succeed.",
          patternCode: code,
          dimension: "Financial Structure",
        });
        break;
      case "CLOSE_DATE_PRESSURE": {
        const remaining = 100 - dealView.progressPct;
        const perWeek = Math.round(
          (remaining / Math.max(dealView.daysToClose ?? 1, 1)) * 7,
        );
        actions.push({
          source: "PATTERN",
          priority: "HIGH",
          action: `Either accelerate gate completion (need ~${perWeek} gate-points/week) or negotiate a close date extension.`,
          patternCode: code,
          dimension: "Temporal Pressure",
        });
        break;
      }
      case "UNRESOLVED_CRITICAL_BLOCKERS":
        actions.push({
          source: "PATTERN",
          priority: "HIGH",
          action:
            "Escalate high-severity blockers to the Commander for executive intervention.",
          patternCode: code,
          dimension: "Engagement Vitality",
        });
        break;
      case "LOW_ATTACH_ELEPHANT":
        actions.push({
          source: "PATTERN",
          priority: "MEDIUM",
          action:
            "Identify cross-sell opportunities. At this TCV, additional product attach increases stickiness and deal value.",
          patternCode: code,
          dimension: "Financial Structure",
        });
        break;
      case "SIEM_UNDERSCOPED":
        actions.push({
          source: "PATTERN",
          priority: "MEDIUM",
          action:
            "Revisit deal scope with the customer. High log source count at current TCV suggests the deployment is underscoped.",
          patternCode: code,
          dimension: "Financial Structure",
        });
        break;
      case "NO_CLOSE_DATE":
        actions.push({
          source: "PATTERN",
          priority: "MEDIUM",
          action:
            "Set an expected close date. Without a target, there is no accountability for pace.",
          patternCode: code,
          dimension: "Temporal Pressure",
        });
        break;
    }
  }

  // ── Dimension-driven actions (continuous signals not already covered) ──
  for (const d of adjustedDims) {
    if (d.score < 40) continue;
    if (actions.some((a) => a.dimension === d.name)) continue;

    switch (d.name) {
      case "Stakeholder Coverage":
        if (d.score >= 50) {
          const hasHostile = d.signals.some((s) =>
            s.factor.toLowerCase().includes("hostile"),
          );
          actions.push(
            hasHostile
              ? {
                  source: "DIMENSION",
                  priority: "CRITICAL",
                  action:
                    "Initiate executive-to-executive engagement to address hostile stakeholder.",
                  patternCode: null,
                  dimension: d.name,
                }
              : {
                  source: "DIMENSION",
                  priority: "HIGH",
                  action:
                    "Map the full stakeholder landscape. Identify economic buyer and champion.",
                  patternCode: null,
                  dimension: d.name,
                },
          );
        }
        break;
      case "Commercial Alignment":
        if (d.score >= 50) {
          actions.push({
            source: "DIMENSION",
            priority: "HIGH",
            action:
              "Commercial motion is ahead of technical readiness. Present gate status to the Account Manager as evidence for pausing contract negotiations.",
            patternCode: null,
            dimension: d.name,
          });
        }
        break;
      case "Technical Readiness":
        if (d.score >= 50) {
          actions.push({
            source: "DIMENSION",
            priority: "HIGH",
            action:
              "Technical validation is lagging. Schedule a focused technical work session to unblock gate progression.",
            patternCode: null,
            dimension: d.name,
          });
        }
        break;
    }
  }

  return actions.sort((a, b) => PRIORITY_ORDER[a.priority] - PRIORITY_ORDER[b.priority]);
}

// ── Orchestration ────────────────────────────────────────────────────────────

export function computeUnifiedRisk(args: {
  dimensionResults: DimensionFnResult[];
  activePatternCodes: string[];
  guardrailCodes: string[];
  weights?: RiskV2Weights;
  boundaries?: RiskLevelBoundaries;
  dealView: RiskActionDealView;
}): UnifiedRisk {
  const weights = args.weights ?? HARDCODED_WEIGHTS;
  const boundaries = args.boundaries ?? HARDCODED_BOUNDARIES;

  // Layer 3: amplify, then stamp each dimension's global weight.
  const adjusted = applyAmplification(args.dimensionResults, args.activePatternCodes).map(
    (d) => ({ ...d, weight: weightFor(d.name, weights) }),
  );

  const compositeScore = computeComposite(adjusted, weights);
  const riskLevel = classifyRiskLevel(compositeScore, boundaries);
  const drivers = topDrivers(adjusted, weights);
  const recommendedActions = generateUnifiedActions(
    adjusted,
    args.activePatternCodes,
    args.guardrailCodes,
    args.dealView,
  );

  return {
    compositeScore,
    riskLevel,
    dimensions: adjusted,
    topDrivers: drivers,
    recommendedActions,
  };
}
