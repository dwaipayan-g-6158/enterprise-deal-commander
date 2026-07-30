// MEDDPICC Auto-Scoring — pure & isomorphic. 8 questions (one per MEDDPICC
// pillar), each scored 0-3; 7 are computed live from deal data server-side.

export type MeddpiccPillar =
  | "Metrics"
  | "EconomicBuyer"
  | "DecisionCriteria"
  | "DecisionProcess"
  | "PaperProcess"
  | "IdentifyPain"
  | "Champion"
  | "Competition";

export type StageTag = "Q" | "P" | "N";

export interface MeddpiccQuestion {
  questionOrder: number; // 1-8
  pillar: MeddpiccPillar;
  stageTag: StageTag;
  questionText: string;
  helpText?: string;
}

export const QUESTION_CATALOG: MeddpiccQuestion[] = [
  { questionOrder: 1, pillar: "Metrics", stageTag: "Q", questionText: "Is there a clear, quantifiable business case (ROI/value) for this deal?" },
  { questionOrder: 2, pillar: "EconomicBuyer", stageTag: "P", questionText: "Have we identified the Economic Buyer and secured executive agreement on evaluation criteria?", helpText: "Auto-computed from a stakeholder tagged Economic Buyer and the G1_EXECUTIVE_AGREED gate." },
  { questionOrder: 3, pillar: "DecisionCriteria", stageTag: "Q", questionText: "Are the customer's technical success criteria locked and documented?", helpText: "Auto-computed from the G1_CRITERIA_LOCKED gate." },
  { questionOrder: 4, pillar: "DecisionProcess", stageTag: "Q", questionText: "Have we identified the individuals with decision-making power in this deal?", helpText: "Auto-computed from stakeholders flagged as decision-makers." },
  { questionOrder: 5, pillar: "PaperProcess", stageTag: "N", questionText: "Is the legal/paper process (redlines, NDA/DPA, compliance) on track?", helpText: "Auto-computed from Procurement/Legal playbook steps and the G4_COMPLIANCE_VALIDATED gate." },
  { questionOrder: 6, pillar: "IdentifyPain", stageTag: "Q", questionText: "Do we understand the customer's pain and is this an existing relationship?", helpText: "Auto-computed from prior Won deals with this account." },
  { questionOrder: 7, pillar: "Champion", stageTag: "P", questionText: "Have we identified a Champion who can defend us internally?", helpText: "Auto-computed from a stakeholder tagged Champion and the G2_CHAMPION_DEFENSIBLE gate." },
  { questionOrder: 8, pillar: "Competition", stageTag: "Q", questionText: "Do we have a demonstrated competitive advantage against tracked competitors?", helpText: "Auto-computed from tracked competitors and historical win-rate." },
];

const PILLAR_ORDER: MeddpiccPillar[] = [
  "Metrics",
  "EconomicBuyer",
  "DecisionCriteria",
  "DecisionProcess",
  "PaperProcess",
  "IdentifyPain",
  "Champion",
  "Competition",
];

const TOTAL_MAX = QUESTION_CATALOG.length * 3; // 8 * 3 = 24

export type StageBucket = "Qualification" | "Proposition" | "Negotiation";

const STAGE_BUCKET_MAP: Record<string, StageBucket> = {
  Discovery: "Qualification",
  Validation: "Proposition",
  Commercial: "Proposition",
  Procurement: "Negotiation",
  "Closed-Won": "Negotiation",
  "Closed-Lost": "Negotiation",
};

/** Unknown/future stage names default to the full model (safest — no under-counting). */
export function stageBucketForStageName(stageName: string): StageBucket {
  return STAGE_BUCKET_MAP[stageName] ?? "Negotiation";
}

function stageFilter(bucket: StageBucket): (q: MeddpiccQuestion) => boolean {
  if (bucket === "Qualification") return (q) => q.stageTag === "Q";
  if (bucket === "Proposition") return (q) => q.stageTag !== "N";
  return () => true;
}

export interface MeddpiccThresholds {
  redMax: number;
  greenMin: number;
}

export const DEFAULT_MEDDPICC_THRESHOLDS: MeddpiccThresholds = { redMax: 40, greenMin: 75 };

export interface PillarBreakdownEntry {
  pillar: MeddpiccPillar;
  raw: number;
  max: number;
  pct: number;
}

export type RagStatus = "Red" | "Amber" | "Green";

export interface MeddpiccScoreResult {
  overallScore: number;
  overallPct: number;
  stagePct: number;
  ragStatus: RagStatus;
  pillarBreakdown: PillarBreakdownEntry[];
  strongNoCount: number;
  unknownCount: number;
}

function ragFor(pct: number, thresholds: MeddpiccThresholds): RagStatus {
  if (pct < thresholds.redMax) return "Red";
  if (pct >= thresholds.greenMin) return "Green";
  return "Amber";
}

export function computeMeddpiccScore(
  answers: Record<number, number | null | undefined>,
  stageBucket: StageBucket,
  thresholds: MeddpiccThresholds = DEFAULT_MEDDPICC_THRESHOLDS,
): MeddpiccScoreResult {
  let overallScore = 0;
  let strongNoCount = 0;
  let unknownCount = 0;
  const pillarTotals = new Map<MeddpiccPillar, { raw: number; max: number }>();

  for (const q of QUESTION_CATALOG) {
    const raw = answers[q.questionOrder];
    const score = typeof raw === "number" ? raw : 0; // unanswered counts as 0, fixed denominator
    overallScore += score;
    if (raw === 1) strongNoCount++;
    if (raw == null || raw === 0) unknownCount++;

    const bucket = pillarTotals.get(q.pillar) ?? { raw: 0, max: 0 };
    bucket.raw += score;
    bucket.max += 3;
    pillarTotals.set(q.pillar, bucket);
  }

  const pillarBreakdown: PillarBreakdownEntry[] = PILLAR_ORDER.map((pillar) => {
    const t = pillarTotals.get(pillar) ?? { raw: 0, max: 0 };
    return { pillar, raw: t.raw, max: t.max, pct: t.max > 0 ? Math.round((t.raw / t.max) * 100) : 0 };
  });

  const overallPct = Math.round((overallScore / TOTAL_MAX) * 100);

  const stageQuestions = QUESTION_CATALOG.filter(stageFilter(stageBucket));
  const stageMax = stageQuestions.length * 3;
  const stageRaw = stageQuestions.reduce((sum, q) => {
    const raw = answers[q.questionOrder];
    return sum + (typeof raw === "number" ? raw : 0);
  }, 0);
  const stagePct = stageMax > 0 ? Math.round((stageRaw / stageMax) * 100) : 0;

  return {
    overallScore,
    overallPct,
    stagePct,
    ragStatus: ragFor(stagePct, thresholds),
    pillarBreakdown,
    strongNoCount,
    unknownCount,
  };
}
