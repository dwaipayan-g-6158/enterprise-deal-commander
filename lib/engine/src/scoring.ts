// Predictive Deal Scoring Engine (V2 F3) — pure & isomorphic.
//
// An 8-factor weighted model producing a 0–100 probability-of-close score.
// Weights are the PRD defaults and sum to 100. Each factor extracts a raw
// 0.0–1.0 sub-score from the deal; the final score is the weighted average.

export interface ScoringInput {
  /** Technical gate completion, 0–100. */
  progressPct: number;
  /** Calendar days the deal has spent in its current stage. */
  daysInStage: number;
  productRevenue: number;
  servicesRevenue: number;
  /** Gate G5 (CTO sign-off) completed? */
  ctoSignedOff: boolean;
  /** Gate G1 (executive agreement) completed? */
  executiveAgreed: boolean;
  totalBlockerCount: number;
  highBlockerCount: number;
  calculatedTCV: number;
  /** Days until expected close, or null when no close date is set. */
  daysToClose: number | null;
  /** Deal profile key for historical win-rate lookup (e.g. "Commercial|Multi-Year"). */
  profileKey: string;
  // Playbook execution (optional — populated server-side from the edc_v2 playbook
  // engine). When there is no active assignment these are undefined and the
  // playbook_adherence factor returns a neutral score, so deals without a playbook
  // and non-DB callers (Risk Simulator) are neither rewarded nor penalised.
  /** Completed (non-skipped, non-blocked) steps / total steps, 0–100. */
  playbookAdherencePct?: number;
  /** Critical steps that were skipped OR blocked. */
  playbookCriticalGaps?: number;
  /** Steps past their expected-duration deadline. */
  playbookOverdueCount?: number;
}

export interface ScoringContext {
  /** Median days a deal spends in this stage, from historical closed deals. */
  stageBenchmarkDays?: number | null;
  /** Average TCV of historically won deals. */
  avgWonTCV?: number | null;
  /** Win rate (0–1) keyed by deal profile. */
  winRateByProfile?: Record<string, number>;
}

export interface ScoreFactorResult {
  featureId: string;
  description: string;
  rawScore: number; // 0–100
  weight: number;
  contribution: number; // 0–100
}

export type ScoreConfidence = "LOW" | "MEDIUM" | "HIGH";

export interface PredictiveScore {
  score: number; // 0–100
  breakdown: ScoreFactorResult[];
  confidence: ScoreConfidence;
}

/** Logistic curve centred at 0.5; rewards near-completion disproportionately. */
export function sigmoid(x: number): number {
  return 1 / (1 + Math.exp(-10 * (x - 0.5)));
}

interface Factor {
  id: string;
  description: string;
  weight: number;
  extract: (d: ScoringInput, c: ScoringContext) => number;
}

const FACTORS: Factor[] = [
  {
    id: "gate_momentum",
    description: "Technical validation progress",
    weight: 22,
    extract: (d) => sigmoid(clamp01(d.progressPct / 100)),
  },
  {
    id: "stage_velocity",
    description: "Pace vs. stage benchmark",
    weight: 13,
    extract: (d, c) => {
      if (!c.stageBenchmarkDays || c.stageBenchmarkDays <= 0) return 0.5;
      const ratio = d.daysInStage / c.stageBenchmarkDays;
      if (ratio <= 0.5) return 1.0;
      if (ratio <= 1.0) return 0.7;
      if (ratio <= 1.5) return 0.4;
      if (ratio <= 2.0) return 0.2;
      return 0.05;
    },
  },
  {
    id: "services_attachment",
    description: "Financial protection via services",
    weight: 10,
    extract: (d) => {
      if (d.productRevenue <= 0) return 0.4;
      const ratio = d.servicesRevenue / d.productRevenue;
      if (ratio >= 0.3) return 1.0;
      if (ratio >= 0.15) return 0.7;
      return 0.4;
    },
  },
  {
    id: "executive_alignment",
    description: "Executive champion sign-off",
    weight: 13,
    extract: (d) => (d.ctoSignedOff ? 1.0 : d.executiveAgreed ? 0.7 : 0.15),
  },
  {
    id: "blocker_load",
    description: "Unresolved blocker burden",
    weight: 9,
    extract: (d) => {
      if (d.highBlockerCount >= 3) return 0.0;
      if (d.highBlockerCount >= 1) return 0.3;
      if (d.totalBlockerCount >= 3) return 0.5;
      if (d.totalBlockerCount >= 1) return 0.7;
      return 1.0;
    },
  },
  {
    id: "deal_size_confidence",
    description: "Closeness to historical won TCV",
    weight: 5,
    extract: (d, c) => {
      if (!c.avgWonTCV || c.avgWonTCV <= 0) return 0.5;
      const distance = Math.abs(d.calculatedTCV - c.avgWonTCV) / c.avgWonTCV;
      return Math.max(0, 1 - distance);
    },
  },
  {
    id: "close_pressure",
    description: "Close date realism vs. progress",
    weight: 10,
    extract: (d) => {
      if (d.daysToClose == null) return 0.5;
      const remainingPoints = Math.max(1, 100 - d.progressPct);
      const daysPerPoint = d.daysToClose / remainingPoints;
      if (daysPerPoint >= 3) return 0.9;
      if (daysPerPoint >= 1.5) return 0.6;
      if (daysPerPoint >= 0.5) return 0.3;
      return 0.05;
    },
  },
  {
    id: "historical_win_rate",
    description: "Baseline win rate for deal profile",
    weight: 8,
    extract: (d, c) => c.winRateByProfile?.[d.profileKey] ?? 0.3,
  },
  {
    id: "playbook_adherence",
    description: "Stage playbook executed to plan",
    weight: 10,
    extract: (d) => {
      // No active playbook → neutral (neither reward nor penalise).
      if (d.playbookAdherencePct == null) return 0.5;
      const adherence = clamp01(d.playbookAdherencePct / 100);
      // Blend with a floor so an early-stage playbook isn't over-penalised, then
      // subtract execution-risk penalties for skipped/blocked-critical + overdue steps.
      const base = 0.4 + 0.6 * adherence; // 0% → 0.4, 100% → 1.0
      const penalty = Math.min(
        0.5,
        (d.playbookCriticalGaps ?? 0) * 0.2 + (d.playbookOverdueCount ?? 0) * 0.1,
      );
      return clamp01(base - penalty);
    },
  },
];

/** Default weight per factor id, keyed for override lookups. Sums to 100 — see TOTAL_SCORING_WEIGHT. */
export const DEFAULT_SCORING_WEIGHTS: Record<string, number> = Object.fromEntries(
  FACTORS.map((f) => [f.id, f.weight]),
);

function clamp01(n: number): number {
  return Math.max(0, Math.min(1, n));
}

export function computePredictiveScore(
  input: ScoringInput,
  context: ScoringContext = {},
  weights?: Record<string, number>,
): PredictiveScore {
  let weightedSum = 0;
  let totalWeight = 0;
  const breakdown: ScoreFactorResult[] = [];

  for (const f of FACTORS) {
    const w = weights?.[f.id] ?? f.weight;
    const raw = clamp01(f.extract(input, context));
    const contribution = raw * w;
    weightedSum += contribution;
    totalWeight += w;
    breakdown.push({
      featureId: f.id,
      description: f.description,
      rawScore: Math.round(raw * 100),
      weight: w,
      contribution: Math.round(contribution),
    });
  }

  const score = totalWeight > 0 ? Math.round((weightedSum / totalWeight) * 100) : 0;

  const dataPoints = [
    input.daysToClose != null,
    !!context.avgWonTCV,
    !!context.stageBenchmarkDays,
  ].filter(Boolean).length;
  const confidence: ScoreConfidence =
    dataPoints >= 3 ? "HIGH" : dataPoints >= 2 ? "MEDIUM" : "LOW";

  return { score, breakdown, confidence };
}

/** Total of all factor weights — exposed so callers/tests can assert it is 100. */
export const TOTAL_SCORING_WEIGHT = FACTORS.reduce((s, f) => s + f.weight, 0);
