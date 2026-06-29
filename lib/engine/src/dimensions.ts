// Risk Engine v2.0 — Layer 1: dimensional scoring (PURE, ISOMORPHIC).
//
// Each function scores ONE risk dimension on a 0–100 scale (0 = no risk,
// 100 = maximum risk) from a small explicit input object. Ported faithfully
// from `Risk Engine.md` §3, adapted to this codebase's real field names.
//
// PURITY: no Date.now()/new Date()/Math.random(); every temporal value
// (daysSinceLastGate, daysInStage, daysToClose, …) arrives as a pre-computed
// number. Same input → same output. Inputs are never mutated.

import type { RawGate } from "./index";
import type {
  DimensionFnResult,
  DimensionSignal,
  StakeholderInput,
  CompetitorInput,
} from "./risk-v2-types";

// Stable expected-progress map for stage-vs-gates reasoning (spec §3 Dim 2).
const STAGE_ORDER: Record<string, number> = {
  Discovery: 1,
  Validation: 2,
  Commercial: 3,
  Procurement: 4,
  "Closed-Won": 5,
};

const CRITICAL_GATES = ["G3_PERFORMANCE_PASSED", "G5_CTO_SIGNED_OFF"];

/** Weighted-mean of signal raw scores, normalized by the weights actually present. */
function weightedDimensionScore(signals: DimensionSignal[]): number {
  const totalWeight = signals.reduce((sum, s) => sum + s.weight, 0);
  if (totalWeight <= 0) return 0;
  const weightedSum = signals.reduce((sum, s) => sum + s.rawScore * s.weight, 0);
  return Math.round(weightedSum / totalWeight);
}

/** Sort signals by weighted contribution descending (matches spec presentation). */
function sortSignals(signals: DimensionSignal[]): DimensionSignal[] {
  return [...signals].sort((a, b) => b.rawScore * b.weight - a.rawScore * a.weight);
}

// ───────────────────────────────────────────────────────────────────────────
// Dimension 1: Technical Readiness
// ───────────────────────────────────────────────────────────────────────────
export function scoreTechnicalReadiness(i: {
  progressPct: number;
  stepsCompleted: number;
  totalSteps: number;
  salesStage: string;
  gates: RawGate[];
  gateMap: Record<string, boolean>;
  daysSinceLastGate: number | null;
}): DimensionFnResult {
  const signals: DimensionSignal[] = [];

  // Signal 1.1: Gate Completion Percentage (weight 0.30)
  const completionPct = i.progressPct;
  const completionRisk = (1 - completionPct / 100) * 100;
  signals.push({
    factor: `${completionPct}% gates complete (${i.stepsCompleted}/${i.totalSteps})`,
    rawScore: completionRisk,
    weight: 0.3,
  });

  // Signal 1.2: Time Since Last Gate Completion (weight 0.30)
  let staleRisk = 0;
  if (i.daysSinceLastGate !== null) {
    const d = i.daysSinceLastGate;
    if (d <= 7) staleRisk = 0;
    else if (d <= 14) staleRisk = 25;
    else if (d <= 21) staleRisk = 50;
    else if (d <= 30) staleRisk = 75;
    else staleRisk = 95;
  } else if (completionPct === 0) {
    // No gates completed: past Discovery is concerning, in Discovery is fine.
    staleRisk = i.salesStage !== "Discovery" ? 60 : 10;
  }
  signals.push({
    factor:
      i.daysSinceLastGate !== null
        ? `Last gate completed ${i.daysSinceLastGate} days ago`
        : "No gates completed yet",
    rawScore: staleRisk,
    weight: 0.3,
  });

  // Signal 1.3: Gate Sequence Integrity (weight 0.15)
  const gateGroups: Record<number, RawGate[]> = {};
  for (const g of i.gates) {
    (gateGroups[g.gate_group] ||= []).push(g);
  }
  let sequencePenalty = 0;
  for (let g = 5; g >= 1; g--) {
    const group = gateGroups[g];
    if (!group) continue;
    if (group.every((gate) => gate.is_completed)) {
      for (let prev = g - 1; prev >= 1; prev--) {
        const prevGroup = gateGroups[prev];
        if (prevGroup && !prevGroup.every((gate) => gate.is_completed)) {
          sequencePenalty = 40;
          break;
        }
      }
    }
    if (sequencePenalty > 0) break;
  }
  signals.push({
    factor:
      sequencePenalty > 0
        ? "Gate sequence violation detected — later gates completed before earlier ones"
        : "Gate sequence is clean",
    rawScore: sequencePenalty,
    weight: 0.15,
  });

  // Signal 1.4: Critical Gate Status (weight 0.25)
  let criticalPenalty = 0;
  const missingCritical: string[] = [];
  for (const code of CRITICAL_GATES) {
    if (!i.gateMap[code]) {
      criticalPenalty += 35;
      missingCritical.push(code);
    }
  }
  criticalPenalty = Math.min(criticalPenalty, 80);
  signals.push({
    factor:
      missingCritical.length > 0
        ? `Critical gates incomplete: ${missingCritical.join(", ")}`
        : "All critical gates complete",
    rawScore: criticalPenalty,
    weight: 0.25,
  });

  return {
    name: "Technical Readiness",
    score: weightedDimensionScore(signals),
    signals: sortSignals(signals),
    assessable: true,
  };
}

// ───────────────────────────────────────────────────────────────────────────
// Dimension 2: Commercial Alignment
// ───────────────────────────────────────────────────────────────────────────
export function scoreCommercialAlignment(i: {
  salesStage: string;
  progressPct: number;
  normalizedTCV: number;
  servicesRevenue: number;
  productRevenue: number;
  servicesTier: string;
  winProbability: number | null;
}): DimensionFnResult {
  const signals: DimensionSignal[] = [];

  // Signal 2.1: Stage-vs-Gates Gap (weight 0.45)
  const currentStageNum = STAGE_ORDER[i.salesStage] || 1;
  const expectedGatePct = ((currentStageNum - 1) / 4) * 100;
  const actualGatePct = i.progressPct;
  const gap = expectedGatePct - actualGatePct;

  let stageGapRisk = 0;
  if (gap <= 0) stageGapRisk = 0;
  else if (gap <= 20) stageGapRisk = 20;
  else if (gap <= 40) stageGapRisk = 50;
  else if (gap <= 60) stageGapRisk = 75;
  else stageGapRisk = 95;
  signals.push({
    factor: `Stage: ${i.salesStage} (expected ~${Math.round(expectedGatePct)}% gates), actual: ${actualGatePct}%`,
    rawScore: stageGapRisk,
    weight: 0.45,
  });

  // Signal 2.2: Services Attachment on Large Deals (weight 0.30)
  const tcv = i.normalizedTCV;
  const hasServices = i.servicesRevenue > 0;
  const servicesRatio = i.productRevenue > 0 ? i.servicesRevenue / i.productRevenue : 0;
  let servicesRisk = 0;
  if (tcv < 300000) servicesRisk = 0;
  else if (tcv >= 300000 && !hasServices)
    servicesRisk = tcv >= 1000000 ? 85 : tcv >= 500000 ? 65 : 40;
  else if (hasServices && servicesRatio < 0.15) servicesRisk = 25;
  else servicesRisk = 0;
  signals.push({
    factor: hasServices
      ? `Services: ${Math.round(servicesRatio * 100)}% of product revenue`
      : `No services attached on a ${tcv} TCV deal`,
    rawScore: servicesRisk,
    weight: 0.3,
  });

  // Signal 2.3: Probability-Reality Gap (weight 0.25)
  let optimismRisk = 0;
  if (i.winProbability !== null) {
    const optimismGap = i.winProbability - i.progressPct;
    if (optimismGap <= 0) optimismRisk = 0;
    else if (optimismGap <= 15) optimismRisk = 10;
    else if (optimismGap <= 30) optimismRisk = 35;
    else if (optimismGap <= 50) optimismRisk = 60;
    else optimismRisk = 85;
  }
  signals.push({
    factor:
      i.winProbability !== null
        ? `Reported probability: ${i.winProbability}% vs. gate progress: ${actualGatePct}%`
        : "No win probability set",
    rawScore: optimismRisk,
    weight: 0.25,
  });

  return {
    name: "Commercial Alignment",
    score: weightedDimensionScore(signals),
    signals: sortSignals(signals),
    assessable: true,
  };
}

// ───────────────────────────────────────────────────────────────────────────
// Dimension 3: Stakeholder Coverage
// ───────────────────────────────────────────────────────────────────────────
export function scoreStakeholderCoverage(i: {
  salesStage: string;
  stakeholders: StakeholderInput[];
}): DimensionFnResult {
  // Graceful degradation: no stakeholders → not assessable.
  if (!i.stakeholders || i.stakeholders.length === 0) {
    if (i.salesStage === "Discovery") {
      return {
        name: "Stakeholder Coverage",
        score: 10,
        signals: [
          { factor: "No stakeholders tracked (acceptable in Discovery)", rawScore: 10, weight: 1 },
        ],
        assessable: false,
      };
    }
    return {
      name: "Stakeholder Coverage",
      score: 60,
      signals: [
        {
          factor: "No stakeholders tracked past Discovery stage — cannot assess coverage",
          rawScore: 60,
          weight: 1,
        },
      ],
      assessable: false,
    };
  }

  const total = i.stakeholders.length;
  const champions = i.stakeholders.filter((s) => s.sentiment === "Champion").length;
  const hostile = i.stakeholders.filter((s) => s.sentiment === "Hostile");
  const hostileDecisionMakers = hostile.filter((s) => s.isDecisionMaker);
  const decisionMakers = i.stakeholders.filter((s) => s.isDecisionMaker);

  const signals: DimensionSignal[] = [];

  // Signal 3.1: Champion Ratio (weight 0.30)
  const championRatio = champions / total;
  let championRisk: number;
  if (championRatio >= 0.4) championRisk = 0;
  else if (championRatio >= 0.2) championRisk = 30;
  else if (championRatio >= 0.1) championRisk = 55;
  else championRisk = 80;
  signals.push({
    factor: `${champions} of ${total} stakeholders are champions (${Math.round(championRatio * 100)}%)`,
    rawScore: championRisk,
    weight: 0.3,
  });

  // Signal 3.2: Hostile Decision Makers (weight 0.35)
  let hostileRisk = 0;
  if (hostileDecisionMakers.length > 0) hostileRisk = 90;
  else if (hostile.length > 0) hostileRisk = 45;
  signals.push({
    factor:
      hostileDecisionMakers.length > 0
        ? `${hostileDecisionMakers.map((s) => s.name).join(", ")} — hostile decision maker(s)`
        : hostile.length > 0
          ? `${hostile.length} hostile non-decision-maker(s)`
          : "No hostile stakeholders",
    rawScore: hostileRisk,
    weight: 0.35,
  });

  // Signal 3.3: Decision-Maker Coverage (weight 0.35). "unknown" sentiment = Neutral.
  let dmRisk = 0;
  if (decisionMakers.length === 0) {
    dmRisk = 55;
  } else {
    const dmUnknown = decisionMakers.filter((s) => s.sentiment === "Neutral" || !s.sentiment);
    if (dmUnknown.length === decisionMakers.length) dmRisk = 45;
    else if (dmUnknown.length > 0) dmRisk = 20;
    else dmRisk = 0;
  }
  signals.push({
    factor:
      decisionMakers.length === 0
        ? "No decision makers identified"
        : `${decisionMakers.length} decision maker(s) identified, ${decisionMakers.filter((s) => s.sentiment !== "Neutral").length} with known sentiment`,
    rawScore: dmRisk,
    weight: 0.35,
  });

  return {
    name: "Stakeholder Coverage",
    score: weightedDimensionScore(signals),
    signals: sortSignals(signals),
    assessable: true,
  };
}

// ───────────────────────────────────────────────────────────────────────────
// Dimension 4: Temporal Pressure
// ───────────────────────────────────────────────────────────────────────────
const ACTIVE_STAGES_FOR_DATE = (stage: string) =>
  stage !== "Discovery" && stage !== "Closed-Won" && stage !== "Closed-Lost";

export function scoreTemporalPressure(i: {
  salesStage: string;
  daysInStage: number;
  daysToClose: number | null;
  expectedCloseDate: string | null;
  progressPct: number;
  benchmarkMedianDays: number | null;
}): DimensionFnResult {
  const signals: DimensionSignal[] = [];

  // Signal 4.1: Stage Duration vs. Benchmark (weight 0.35)
  let stageDurationRisk = 0;
  if (i.benchmarkMedianDays && i.daysInStage > 0) {
    const ratio = i.daysInStage / i.benchmarkMedianDays;
    if (ratio <= 0.75) stageDurationRisk = 0;
    else if (ratio <= 1.0) stageDurationRisk = 10;
    else if (ratio <= 1.25) stageDurationRisk = 30;
    else if (ratio <= 1.5) stageDurationRisk = 55;
    else if (ratio <= 2.0) stageDurationRisk = 75;
    else stageDurationRisk = 95;
  } else {
    // No benchmark: absolute-day fallback.
    if (i.daysInStage <= 14) stageDurationRisk = 5;
    else if (i.daysInStage <= 30) stageDurationRisk = 25;
    else if (i.daysInStage <= 60) stageDurationRisk = 55;
    else stageDurationRisk = 80;
  }
  signals.push({
    factor: i.benchmarkMedianDays
      ? `${i.daysInStage} days in ${i.salesStage} (benchmark: ${Math.round(i.benchmarkMedianDays)} days)`
      : `${i.daysInStage} days in ${i.salesStage} (no benchmark available)`,
    rawScore: stageDurationRisk,
    weight: 0.35,
  });

  // Signal 4.2: Close Date Proximity vs. Progress (weight 0.45)
  let closeDateRisk = 0;
  if (i.daysToClose !== null && i.daysToClose >= 0) {
    const daysLeft = i.daysToClose;
    const progressRemaining = 100 - i.progressPct;
    const daysPerPoint = progressRemaining > 0 ? daysLeft / progressRemaining : 0;
    if (daysPerPoint >= 3) closeDateRisk = 5;
    else if (daysPerPoint >= 2) closeDateRisk = 20;
    else if (daysPerPoint >= 1) closeDateRisk = 50;
    else if (daysPerPoint >= 0.5) closeDateRisk = 75;
    else closeDateRisk = 95;
    if (daysLeft <= 0 && i.progressPct < 100) closeDateRisk = 100;
  } else if (ACTIVE_STAGES_FOR_DATE(i.salesStage)) {
    closeDateRisk = 35;
  }
  signals.push({
    factor:
      i.daysToClose !== null
        ? `${i.daysToClose} days to close, ${100 - i.progressPct}% progress remaining`
        : "No close date set",
    rawScore: closeDateRisk,
    weight: 0.45,
  });

  // Signal 4.3: Close Date Existence (weight 0.20)
  let dateExistenceRisk = 0;
  if (!i.expectedCloseDate && ACTIVE_STAGES_FOR_DATE(i.salesStage)) {
    dateExistenceRisk = 50;
  }
  signals.push({
    factor: i.expectedCloseDate ? `Close date: ${i.expectedCloseDate}` : "No expected close date",
    rawScore: dateExistenceRisk,
    weight: 0.2,
  });

  return {
    name: "Temporal Pressure",
    score: weightedDimensionScore(signals),
    signals: sortSignals(signals),
    assessable: true,
  };
}

// ───────────────────────────────────────────────────────────────────────────
// Dimension 5: Financial Structure
// ───────────────────────────────────────────────────────────────────────────
export function scoreFinancialStructure(i: {
  normalizedTCV: number;
  productRevenue: number;
  servicesRevenue: number;
  servicesTier: string;
  pricingModel: string;
  termYears: number;
  crossSellPitchedCount: number;
  progressPct: number;
}): DimensionFnResult {
  const signals: DimensionSignal[] = [];
  const tcv = i.normalizedTCV;

  // Signal 5.1: Services Protection (weight 0.35)
  const servicesRatio = i.productRevenue > 0 ? i.servicesRevenue / i.productRevenue : 0;
  let servicesStructuralRisk = 0;
  if (tcv < 200000) servicesStructuralRisk = 0;
  else if (i.servicesTier === "None" && tcv >= 1000000) servicesStructuralRisk = 75;
  else if (i.servicesTier === "None" && tcv >= 500000) servicesStructuralRisk = 50;
  else if (servicesRatio < 0.1 && tcv >= 300000) servicesStructuralRisk = 30;
  else servicesStructuralRisk = 0;
  signals.push({
    factor:
      i.servicesTier === "None"
        ? `No services tier on a ${tcv} TCV deal`
        : `Services tier: ${i.servicesTier}`,
    rawScore: servicesStructuralRisk,
    weight: 0.35,
  });

  // Signal 5.2: Cross-Sell Overextension (weight 0.30)
  const crossSellCount = i.crossSellPitchedCount;
  const gatesComplete = i.progressPct;
  let crossSellRisk = 0;
  if (crossSellCount >= 3 && gatesComplete < 50) crossSellRisk = 60;
  else if (crossSellCount >= 2 && gatesComplete < 30) crossSellRisk = 45;
  else if (crossSellCount >= 1 && gatesComplete < 20) crossSellRisk = 25;
  signals.push({
    factor:
      crossSellCount > 0
        ? `${crossSellCount} cross-sell(s) pitched at ${gatesComplete}% gate completion`
        : "No cross-sells pitched",
    rawScore: crossSellRisk,
    weight: 0.3,
  });

  // Signal 5.3: Contract Term Appropriateness (weight 0.35)
  let termRisk = 0;
  const term = i.termYears;
  const model = i.pricingModel;
  if (model === "Perpetual License") termRisk = 20;
  else if (model === "Annual Subscription" && tcv >= 1000000) termRisk = 30;
  else if (model === "Multi-Year Committed" && term < 2 && tcv >= 500000) termRisk = 25;
  signals.push({
    factor: `${model}, ${term}-year term, ${tcv} TCV`,
    rawScore: termRisk,
    weight: 0.35,
  });

  // NOTE: the spec's 4th signal (ramp/backloading) is intentionally DROPPED —
  // we have no per-year revenue schedule. The weighted-mean normalization
  // absorbs the removed weight (we simply never push that signal).

  return {
    name: "Financial Structure",
    score: weightedDimensionScore(signals),
    signals: sortSignals(signals),
    assessable: true,
  };
}

// ───────────────────────────────────────────────────────────────────────────
// Dimension 6: Competitive Exposure
// ───────────────────────────────────────────────────────────────────────────
export function scoreCompetitiveExposure(i: {
  competitors: CompetitorInput[];
  progressPct: number;
}): DimensionFnResult {
  // Graceful degradation: no competitors tracked → low default, not assessable.
  if (!i.competitors || i.competitors.length === 0) {
    return {
      name: "Competitive Exposure",
      score: 5,
      signals: [{ factor: "No competitors tracked", rawScore: 5, weight: 1 }],
      assessable: false,
    };
  }

  const active = i.competitors.filter((c) => c.status === "Active");
  const signals: DimensionSignal[] = [];

  // Signal 6.1: Active Competitor Count (weight 0.35)
  let countRisk = 0;
  if (active.length === 0) countRisk = 0;
  else if (active.length === 1) countRisk = 20;
  else if (active.length === 2) countRisk = 45;
  else countRisk = 70;
  signals.push({
    factor:
      active.length > 0
        ? `${active.length} active competitor(s): ${active.map((c) => c.name).join(", ")}`
        : "No active competitors",
    rawScore: countRisk,
    weight: 0.35,
  });

  // Signal 6.2: Historical Win Rate Against Active Competitors (weight 0.45).
  // winRate is 0–1 = OUR win rate. null → this signal contributes 0.
  let winRateRisk = 0;
  const knownRates = active
    .map((c) => c.winRate)
    .filter((r): r is number => r !== null && r !== undefined);
  let minWinRate: number | null = null;
  if (knownRates.length > 0) {
    minWinRate = Math.min(...knownRates);
    if (minWinRate >= 0.6) winRateRisk = 10;
    else if (minWinRate >= 0.4) winRateRisk = 35;
    else if (minWinRate >= 0.2) winRateRisk = 60;
    else winRateRisk = 85;
  }
  signals.push({
    factor:
      minWinRate !== null
        ? `Lowest historical win rate against active competitors: ${Math.round(minWinRate * 100)}%`
        : "No historical win rate data for active competitors",
    rawScore: winRateRisk,
    weight: 0.45,
  });

  // Signal 6.3: Competition Late in Cycle (weight 0.20)
  let lateRisk = 0;
  if (active.length >= 2 && i.progressPct >= 50) lateRisk = 50;
  else if (active.length >= 1 && i.progressPct >= 75) lateRisk = 40;
  signals.push({
    factor:
      lateRisk > 0
        ? `${active.length} competitor(s) still active at ${i.progressPct}% gate completion`
        : "Competition is appropriate for deal stage",
    rawScore: lateRisk,
    weight: 0.2,
  });

  return {
    name: "Competitive Exposure",
    score: weightedDimensionScore(signals),
    signals: sortSignals(signals),
    assessable: true,
  };
}

// ───────────────────────────────────────────────────────────────────────────
// Dimension 7: Engagement Vitality
// ───────────────────────────────────────────────────────────────────────────
export function scoreEngagementVitality(i: {
  salesStage: string;
  daysSinceLastUpdate: number;
  blueprintNotes: string | null;
  activeBlockerCount: number;
  highSeverityBlockerCount: number;
}): DimensionFnResult {
  const signals: DimensionSignal[] = [];

  // Signal 7.1: Time Since Last Update (weight 0.35) — full fidelity per spec.
  const d = i.daysSinceLastUpdate;
  let stalenessRisk: number;
  if (d <= 2) stalenessRisk = 0;
  else if (d <= 5) stalenessRisk = 10;
  else if (d <= 10) stalenessRisk = 30;
  else if (d <= 14) stalenessRisk = 50;
  else if (d <= 21) stalenessRisk = 70;
  else stalenessRisk = 90;
  signals.push({
    factor: `Last updated ${d} day${d !== 1 ? "s" : ""} ago`,
    rawScore: stalenessRisk,
    weight: 0.35,
  });

  // Signal 7.2: Strategic Notes (weight 0.20) — full fidelity per spec.
  const hasNotes = !!(i.blueprintNotes && i.blueprintNotes.trim().length >= 20);
  const notesRisk = !hasNotes && i.salesStage !== "Discovery" ? 40 : 0;
  signals.push({
    factor: hasNotes ? "Strategic notes present" : "No strategic notes (expected after Discovery)",
    rawScore: notesRisk,
    weight: 0.2,
  });

  // Signal 7.3: Blocker Stagnation PROXY (weight 0.25).
  // The spec's blocker-age branch needs per-blocker `logged_at`, which we do not
  // have. Substitute a proxy: high-severity blockers present → moderate risk;
  // a pile of active blockers → small risk.
  let blockerRisk = 0;
  if (i.highSeverityBlockerCount >= 2) blockerRisk = 70;
  else if (i.highSeverityBlockerCount >= 1) blockerRisk = 45;
  else if (i.activeBlockerCount >= 3) blockerRisk = 35;
  else if (i.activeBlockerCount >= 1) blockerRisk = 15;
  signals.push({
    factor:
      i.activeBlockerCount > 0
        ? `${i.activeBlockerCount} active blocker(s), ${i.highSeverityBlockerCount} high-severity`
        : "No blockers logged",
    rawScore: blockerRisk,
    weight: 0.25,
  });

  // NOTE: the spec's 4th signal (decision-log activity) is DROPPED — we have no
  // decisions in this input. The weighted-mean normalization absorbs the weight.

  return {
    name: "Engagement Vitality",
    score: weightedDimensionScore(signals),
    signals: sortSignals(signals),
    assessable: true,
  };
}
