import { and, eq, desc, inArray } from "drizzle-orm";
import {
  db,
  enterpriseDeals,
  pipelineStages,
  meddpiccQuestions,
  dealMeddpiccAnswers,
  dealMeddpiccScores,
  engineThresholds,
} from "@workspace/db";
import {
  computeMeddpiccScore,
  stageBucketForStageName,
  DEFAULT_MEDDPICC_THRESHOLDS,
  QUESTION_CATALOG,
  type MeddpiccThresholds,
  type MeddpiccScoreResult,
} from "@workspace/engine";
import { getMeddpiccComputedAnswers } from "./meddpicc-signals";
import { autoCompleteMeddpiccStepIfGreen } from "./meddpicc-playbook-gate";
import { notFound, badRequest } from "./http";

async function loadThresholds(): Promise<MeddpiccThresholds> {
  const rows = await db
    .select({ key: engineThresholds.parameterKey, value: engineThresholds.parameterValue })
    .from(engineThresholds);
  const byKey = new Map(rows.map((r) => [r.key, r.value]));
  const redMax = Number(byKey.get("meddpicc_red_max"));
  const greenMin = Number(byKey.get("meddpicc_green_min"));
  return {
    redMax: Number.isFinite(redMax) ? redMax : DEFAULT_MEDDPICC_THRESHOLDS.redMax,
    greenMin: Number.isFinite(greenMin) ? greenMin : DEFAULT_MEDDPICC_THRESHOLDS.greenMin,
  };
}

interface DealForMeddpicc {
  accountName: string;
  stageName: string | null;
}

async function loadDeal(dealId: string): Promise<DealForMeddpicc | null> {
  const [deal] = await db
    .select({ accountName: enterpriseDeals.accountName, stageName: pipelineStages.stageName })
    .from(enterpriseDeals)
    .leftJoin(pipelineStages, eq(enterpriseDeals.salesStageId, pipelineStages.id))
    .where(eq(enterpriseDeals.id, dealId))
    .limit(1);
  return deal ?? null;
}

export interface MeddpiccAnswerView {
  questionOrder: number;
  score: number | null;
  note: string | null;
  source: "manual" | "computed" | "unanswered";
  reason: string | null;
}

async function loadEffectiveAnswers(dealId: string, accountName: string): Promise<MeddpiccAnswerView[]> {
  const questionOrders = QUESTION_CATALOG.map((q) => q.questionOrder);
  const [manualRows, computed] = await Promise.all([
    db
      .select({
        questionOrder: meddpiccQuestions.questionOrder,
        score: dealMeddpiccAnswers.score,
        note: dealMeddpiccAnswers.note,
      })
      .from(meddpiccQuestions)
      .leftJoin(
        dealMeddpiccAnswers,
        and(eq(dealMeddpiccAnswers.questionId, meddpiccQuestions.id), eq(dealMeddpiccAnswers.dealId, dealId)),
      )
      .where(inArray(meddpiccQuestions.questionOrder, questionOrders)),
    getMeddpiccComputedAnswers(dealId, accountName),
  ]);

  const manualByOrder = new Map(manualRows.filter((r) => r.score != null).map((r) => [r.questionOrder, r]));
  const computedByOrder = new Map(computed.map((c) => [c.questionOrder, c]));

  return QUESTION_CATALOG.map((q): MeddpiccAnswerView => {
    const manual = manualByOrder.get(q.questionOrder);
    const auto = computedByOrder.get(q.questionOrder);
    if (manual) {
      return {
        questionOrder: q.questionOrder,
        score: manual.score,
        note: manual.note ?? null,
        source: "manual",
        reason: auto?.reason ?? null,
      };
    }
    if (auto) {
      return {
        questionOrder: q.questionOrder,
        score: auto.score,
        note: null,
        source: "computed",
        reason: auto.reason,
      };
    }
    return { questionOrder: q.questionOrder, score: null, note: null, source: "unanswered", reason: null };
  });
}

export async function computeMeddpiccScoreForDeal(dealId: string): Promise<MeddpiccScoreResult | null> {
  const deal = await loadDeal(dealId);
  if (!deal) return null;

  const [effectiveAnswers, thresholds] = await Promise.all([
    loadEffectiveAnswers(dealId, deal.accountName),
    loadThresholds(),
  ]);
  const answers: Record<number, number | null> = {};
  for (const a of effectiveAnswers) answers[a.questionOrder] = a.score;

  const stageBucket = stageBucketForStageName(deal.stageName ?? "");
  const result = computeMeddpiccScore(answers, stageBucket, thresholds);

  await db.insert(dealMeddpiccScores).values({
    dealId,
    overallScore: result.overallScore,
    overallPct: String(result.overallPct),
    stagePct: String(result.stagePct),
    ragStatus: result.ragStatus,
    pillarBreakdown: result.pillarBreakdown,
    strongNoCount: result.strongNoCount,
    unknownCount: result.unknownCount,
  });

  if (result.ragStatus === "Green") {
    await autoCompleteMeddpiccStepIfGreen(dealId, result.overallPct);
  }

  return result;
}

export async function getLatestMeddpiccScore(
  dealId: string,
): Promise<{ overallPct: number; stagePct: number; ragStatus: string } | null> {
  const [row] = await db
    .select({
      overallPct: dealMeddpiccScores.overallPct,
      stagePct: dealMeddpiccScores.stagePct,
      ragStatus: dealMeddpiccScores.ragStatus,
    })
    .from(dealMeddpiccScores)
    .where(eq(dealMeddpiccScores.dealId, dealId))
    .orderBy(desc(dealMeddpiccScores.computedAt))
    .limit(1);
  if (!row) return null;
  return {
    overallPct: Number(row.overallPct),
    stagePct: row.stagePct != null ? Number(row.stagePct) : 0,
    ragStatus: row.ragStatus,
  };
}

export interface MeddpiccAssessment {
  questions: typeof QUESTION_CATALOG;
  answers: MeddpiccAnswerView[];
  score: MeddpiccScoreResult;
}

export async function getMeddpiccAssessment(dealId: string): Promise<MeddpiccAssessment | null> {
  const deal = await loadDeal(dealId);
  if (!deal) return null;

  const [answers, score] = await Promise.all([
    loadEffectiveAnswers(dealId, deal.accountName),
    computeMeddpiccScoreForDeal(dealId),
  ]);
  if (!score) return null;

  return { questions: QUESTION_CATALOG, answers, score };
}

export async function upsertMeddpiccAnswer(
  dealId: string,
  questionOrder: number,
  input: { score: number; note?: string | null },
  actor: string,
): Promise<void> {
  const [deal] = await db
    .select({ id: enterpriseDeals.id })
    .from(enterpriseDeals)
    .where(eq(enterpriseDeals.id, dealId))
    .limit(1);
  if (!deal) throw notFound(`No deal with id ${dealId}`);

  const [question] = await db
    .select({ id: meddpiccQuestions.id })
    .from(meddpiccQuestions)
    .where(eq(meddpiccQuestions.questionOrder, questionOrder))
    .limit(1);
  if (!question) throw notFound(`No MEDDPICC question with order ${questionOrder}`);

  if (!Number.isInteger(input.score) || input.score < 0 || input.score > 3) {
    throw badRequest(`score must be an integer between 0 and 3, got ${input.score}`);
  }

  await db
    .insert(dealMeddpiccAnswers)
    .values({
      dealId,
      questionId: question.id,
      score: input.score,
      note: input.note ?? null,
      answeredAt: new Date(),
      answeredBy: actor,
    })
    .onConflictDoUpdate({
      target: [dealMeddpiccAnswers.dealId, dealMeddpiccAnswers.questionId],
      set: {
        score: input.score,
        note: input.note ?? null,
        answeredAt: new Date(),
        answeredBy: actor,
      },
    });
}
