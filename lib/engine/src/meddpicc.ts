// MEDDPICC Auto-Scoring — pure & isomorphic, ported from the dealpad.io
// MEDDPICC Analysis Template (43 questions, 8 pillars, 0-3 scored).

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
  questionOrder: number; // 1-43
  pillar: MeddpiccPillar;
  stageTag: StageTag;
  questionText: string;
  helpText?: string;
}

export const QUESTION_CATALOG: MeddpiccQuestion[] = [
  { questionOrder: 1, pillar: "Metrics", stageTag: "Q", questionText: "Does our solution make the project viable and will it deliver significant improvements?" },
  { questionOrder: 2, pillar: "Metrics", stageTag: "Q", questionText: "Do we fully understand what value the customer is seeking to get? Business outcomes, measurements or results known." },
  { questionOrder: 3, pillar: "Metrics", stageTag: "Q", questionText: "Are there serious business/technical/financial implications if the project is not executed?" },
  { questionOrder: 4, pillar: "Metrics", stageTag: "Q", questionText: "Is there an on-going benefit to the customer's business?" },
  { questionOrder: 5, pillar: "Metrics", stageTag: "Q", questionText: "Is there a pertinent ROI story that can be translated into $ value?" },

  { questionOrder: 6, pillar: "EconomicBuyer", stageTag: "P", questionText: "Do we know who has the power to spend the budget?" },
  { questionOrder: 7, pillar: "EconomicBuyer", stageTag: "P", questionText: "Additional financial approvers identified?" },
  { questionOrder: 8, pillar: "EconomicBuyer", stageTag: "P", questionText: "Do we understand the economic buyer's mindset, expectations and priorities?" },
  { questionOrder: 9, pillar: "EconomicBuyer", stageTag: "Q", questionText: "Has budget been approved internally?" },
  { questionOrder: 10, pillar: "EconomicBuyer", stageTag: "P", questionText: "Do we understand the economic buyer's challenges and buying criteria?" },

  { questionOrder: 11, pillar: "DecisionCriteria", stageTag: "Q", questionText: "Do we understand the vendor evaluation/selection criteria and how it will be weighted?" },
  { questionOrder: 12, pillar: "DecisionCriteria", stageTag: "Q", questionText: "Do we understand the customer's decision criteria for each stage in their purchasing cycle?" },
  { questionOrder: 13, pillar: "DecisionCriteria", stageTag: "Q", questionText: "Do we understand who or what organization will influence each decision criteria?" },
  { questionOrder: 14, pillar: "DecisionCriteria", stageTag: "Q", questionText: "The customer is not buying on the lowest price." },
  { questionOrder: 15, pillar: "DecisionCriteria", stageTag: "P", questionText: "The contract terms and conditions are acceptable to us and to the customer?" },

  { questionOrder: 16, pillar: "DecisionProcess", stageTag: "N", questionText: "Have we met with the key decision makers (C-level) to discuss their needs and the strengths of our solution?" },
  { questionOrder: 17, pillar: "DecisionProcess", stageTag: "Q", questionText: "Have we identified the individuals with decision-making powers and the roles each play in this specific opportunity?" },
  { questionOrder: 18, pillar: "DecisionProcess", stageTag: "Q", questionText: "Do we fully understand the customer timeline and is it realistic?" },
  { questionOrder: 19, pillar: "DecisionProcess", stageTag: "Q", questionText: "Do we understand what decision will be made at each stage of the process, when it will happen and who will be involved?" },
  { questionOrder: 20, pillar: "DecisionProcess", stageTag: "P", questionText: "Do we have internal teams on-board to support the customer with any queries at each stage of the process?" },

  { questionOrder: 21, pillar: "PaperProcess", stageTag: "P", questionText: "Do we understand their signature process and identified all the signatories?" },
  { questionOrder: 22, pillar: "PaperProcess", stageTag: "Q", questionText: "Do we have an existing MSA that we can leverage? If not, have we submitted our MSA for review?" },
  { questionOrder: 23, pillar: "PaperProcess", stageTag: "N", questionText: "SOW or CO drafted and ready or with the customer for review?" },

  { questionOrder: 24, pillar: "IdentifyPain", stageTag: "Q", questionText: "Are they an existing customer or new customer?", helpText: "Score 3 if already a customer with a won deal on record, otherwise 2 — this is never a real \"no.\"" },
  { questionOrder: 25, pillar: "IdentifyPain", stageTag: "P", questionText: "Do we fully understand the customer's requirements, the problem they are trying to address and the outcome they want to achieve?" },
  { questionOrder: 26, pillar: "IdentifyPain", stageTag: "N", questionText: "Our proposal contains win themes, competitive advantages and addresses the concerns of discriminators and distractors." },
  { questionOrder: 27, pillar: "IdentifyPain", stageTag: "Q", questionText: "Is there a compelling event to close within the timeframe identified — will the project reduce cost, improve agility, or mitigate risk?", helpText: "Score 3 if yes and you can name the compelling event, 0 if you're still just checking." },
  { questionOrder: 28, pillar: "IdentifyPain", stageTag: "N", questionText: "The technical, operational and commercial proposal satisfies requirements and fits the customer's business strategy." },
  { questionOrder: 29, pillar: "IdentifyPain", stageTag: "Q", questionText: "Does our standard solution solve the customer's problem?" },
  { questionOrder: 30, pillar: "IdentifyPain", stageTag: "Q", questionText: "Can we fully deliver on all mandatory requirements?" },
  { questionOrder: 31, pillar: "IdentifyPain", stageTag: "Q", questionText: "Are any non-compliant areas not show-stoppers?" },
  { questionOrder: 32, pillar: "IdentifyPain", stageTag: "Q", questionText: "Can we deliver any non-standard requirements?" },
  { questionOrder: 33, pillar: "IdentifyPain", stageTag: "Q", questionText: "Are partners needed, and if so, have they been identified and on-boarded?", helpText: "Score 3 if not needed or already engaged, 1-2 if in process, 0 if needed but not yet identified." },

  { questionOrder: 34, pillar: "Champion", stageTag: "P", questionText: "Have we identified champion(s)?" },
  { questionOrder: 35, pillar: "Champion", stageTag: "N", questionText: "Do they fully understand the value we will deliver and are they most likely to benefit from our solution?" },
  { questionOrder: 36, pillar: "Champion", stageTag: "N", questionText: "Are the champions prepared to become true defenders of the cause and sell our solution within their organization on our behalf?" },
  { questionOrder: 37, pillar: "Champion", stageTag: "N", questionText: "Do the champions have the influencing power, good track record, and acceptance by peers/decision makers to swing the decision in our favor?" },

  { questionOrder: 38, pillar: "Competition", stageTag: "Q", questionText: "Have we had early engagement to influence the client against the competition?" },
  { questionOrder: 39, pillar: "Competition", stageTag: "Q", questionText: "Do we have a strong relationship with the customer and a distinct competitive advantage from the start?" },
  { questionOrder: 40, pillar: "Competition", stageTag: "Q", questionText: "Is there a compelling event needing them to move away from their incumbent?" },
  { questionOrder: 41, pillar: "Competition", stageTag: "Q", questionText: "If a competitor is favored by the customer, can we overcome this?" },
  { questionOrder: 42, pillar: "Competition", stageTag: "Q", questionText: "Do we have reference customers with similar outcomes in the same sector?" },
  { questionOrder: 43, pillar: "Competition", stageTag: "Q", questionText: "Will winning open up new market opportunities for us?" },
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

const TOTAL_MAX = QUESTION_CATALOG.length * 3; // 129

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
  if (pct > thresholds.greenMin) return "Green";
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
    ragStatus: ragFor(overallPct, thresholds),
    pillarBreakdown,
    strongNoCount,
    unknownCount,
  };
}
