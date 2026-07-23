import { and, asc, eq, desc } from "drizzle-orm";
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
import { getMeddpiccSuggestions, type MeddpiccSuggestion } from "./meddpicc-signals";
import { notFound } from "./http";

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

async function loadAnswerMap(dealId: string): Promise<Record<number, number | null>> {
  const rows = await db
    .select({ questionOrder: meddpiccQuestions.questionOrder, score: dealMeddpiccAnswers.score })
    .from(meddpiccQuestions)
    .leftJoin(
      dealMeddpiccAnswers,
      and(eq(dealMeddpiccAnswers.questionId, meddpiccQuestions.id), eq(dealMeddpiccAnswers.dealId, dealId)),
    );
  const answers: Record<number, number | null> = {};
  for (const r of rows) answers[r.questionOrder] = r.score ?? null;
  return answers;
}

export async function computeMeddpiccScoreForDeal(dealId: string): Promise<MeddpiccScoreResult | null> {
  const [deal] = await db
    .select({ stageName: pipelineStages.stageName })
    .from(enterpriseDeals)
    .leftJoin(pipelineStages, eq(enterpriseDeals.salesStageId, pipelineStages.id))
    .where(eq(enterpriseDeals.id, dealId))
    .limit(1);
  if (!deal) return null;

  const [answers, thresholds] = await Promise.all([loadAnswerMap(dealId), loadThresholds()]);
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

export interface MeddpiccAnswerView {
  questionOrder: number;
  score: number | null;
  note: string | null;
  isAutoSuggested: boolean;
}

export interface MeddpiccAssessment {
  questions: typeof QUESTION_CATALOG;
  answers: MeddpiccAnswerView[];
  suggestions: MeddpiccSuggestion[];
  score: MeddpiccScoreResult;
}

export async function getMeddpiccAssessment(dealId: string): Promise<MeddpiccAssessment | null> {
  const [deal] = await db
    .select({ id: enterpriseDeals.id })
    .from(enterpriseDeals)
    .where(eq(enterpriseDeals.id, dealId))
    .limit(1);
  if (!deal) return null;

  const rows = await db
    .select({
      questionOrder: meddpiccQuestions.questionOrder,
      score: dealMeddpiccAnswers.score,
      note: dealMeddpiccAnswers.note,
      isAutoSuggested: dealMeddpiccAnswers.isAutoSuggested,
    })
    .from(meddpiccQuestions)
    .leftJoin(
      dealMeddpiccAnswers,
      and(eq(dealMeddpiccAnswers.questionId, meddpiccQuestions.id), eq(dealMeddpiccAnswers.dealId, dealId)),
    )
    .orderBy(asc(meddpiccQuestions.questionOrder));

  const [suggestions, score] = await Promise.all([
    getMeddpiccSuggestions(dealId),
    computeMeddpiccScoreForDeal(dealId),
  ]);
  if (!score) return null;

  return {
    questions: QUESTION_CATALOG,
    answers: rows.map((r) => ({
      questionOrder: r.questionOrder,
      score: r.score ?? null,
      note: r.note ?? null,
      isAutoSuggested: r.isAutoSuggested ?? false,
    })),
    suggestions,
    score,
  };
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

  const suggestions = await getMeddpiccSuggestions(dealId);
  const suggestion = suggestions.find((s) => s.questionOrder === questionOrder);
  const isAutoSuggested = suggestion?.suggestedScore === input.score;

  await db
    .insert(dealMeddpiccAnswers)
    .values({
      dealId,
      questionId: question.id,
      score: input.score,
      note: input.note ?? null,
      isAutoSuggested,
      suggestedScore: suggestion?.suggestedScore ?? null,
      answeredAt: new Date(),
      answeredBy: actor,
    })
    .onConflictDoUpdate({
      target: [dealMeddpiccAnswers.dealId, dealMeddpiccAnswers.questionId],
      set: {
        score: input.score,
        note: input.note ?? null,
        isAutoSuggested,
        suggestedScore: suggestion?.suggestedScore ?? null,
        answeredAt: new Date(),
        answeredBy: actor,
      },
    });
}
