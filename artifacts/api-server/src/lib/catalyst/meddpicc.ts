// Catalyst-backed reimplementation of ../meddpicc.ts — see the module
// docstring in ./intelligence.ts for why this is a parallel file rather than
// an in-place rewrite: the original's `getLatestMeddpiccScore` is called
// directly by lib/subscribers/snapshot-service.ts's Drizzle-based
// `captureSnapshot`, which serves the periodic hourly snapshot timer — a
// caller with no per-request `req` at all, so it cannot migrate in this pass.
import {
  type CatalystApp,
  createEnterpriseDealsRepo,
  createPipelineStagesRepo,
  createEngineThresholdsRepo,
  createMeddpiccQuestionsRepo,
  createDealMeddpiccAnswersRepo,
  createDealMeddpiccScoresRepo,
} from "@workspace/db/catalyst";
import {
  computeMeddpiccScore,
  stageBucketForStageName,
  DEFAULT_MEDDPICC_THRESHOLDS,
  QUESTION_CATALOG,
  type MeddpiccThresholds,
  type MeddpiccScoreResult,
} from "@workspace/engine";
import { getMeddpiccComputedAnswers } from "./meddpicc-signals";
import { syncMeddpiccPlaybookGate } from "./meddpicc-playbook-gate";
import { notFound, badRequest } from "../http";
import type { MeddpiccAnswerView, MeddpiccAssessment } from "../meddpicc";

export type { MeddpiccAnswerView, MeddpiccAssessment };

async function loadThresholds(catalystApp: CatalystApp): Promise<MeddpiccThresholds> {
  const rows = await createEngineThresholdsRepo(catalystApp).listAll();
  const byKey = new Map(rows.map((r) => [r.parameterKey, r.parameterValue]));
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

async function loadDeal(catalystApp: CatalystApp, dealId: string): Promise<DealForMeddpicc | null> {
  const deal = await createEnterpriseDealsRepo(catalystApp).getById(dealId);
  if (!deal) return null;
  // Every stage, active or not — matches the original left join, which never
  // filtered on is_active (a deal parked in a since-deactivated stage still
  // needs that stage's name to resolve).
  const stages = await createPipelineStagesRepo(catalystApp).listAll();
  const stage = stages.find((s) => s.id === deal.salesStageId);
  return { accountName: deal.accountName, stageName: stage?.stageName ?? null };
}

async function loadEffectiveAnswers(
  catalystApp: CatalystApp,
  dealId: string,
  accountName: string,
): Promise<MeddpiccAnswerView[]> {
  const [questions, answers, computed] = await Promise.all([
    createMeddpiccQuestionsRepo(catalystApp).listAll(),
    createDealMeddpiccAnswersRepo(catalystApp).listByDealId(dealId),
    getMeddpiccComputedAnswers(catalystApp, dealId, accountName),
  ]);

  const questionIdToOrder = new Map(questions.map((q) => [q.id, q.questionOrder]));
  const manualByOrder = new Map<number, { score: number; note: string | null }>();
  for (const a of answers) {
    if (a.score == null) continue;
    const order = questionIdToOrder.get(a.questionId);
    if (order === undefined) continue;
    manualByOrder.set(order, { score: a.score, note: a.note });
  }
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

interface ComputedAssessment {
  deal: DealForMeddpicc;
  result: MeddpiccScoreResult;
  effectiveAnswers: MeddpiccAnswerView[];
}

/** Pure scoring computation shared by the read and write paths below — see ../meddpicc.ts's twin. Performs NO writes. */
async function computeAssessment(catalystApp: CatalystApp, dealId: string): Promise<ComputedAssessment | null> {
  const deal = await loadDeal(catalystApp, dealId);
  if (!deal) return null;

  const [effectiveAnswers, thresholds] = await Promise.all([
    loadEffectiveAnswers(catalystApp, dealId, deal.accountName),
    loadThresholds(catalystApp),
  ]);
  const answers: Record<number, number | null> = {};
  for (const a of effectiveAnswers) answers[a.questionOrder] = a.score;

  const stageBucket = stageBucketForStageName(deal.stageName ?? "");
  const result = computeMeddpiccScore(answers, stageBucket, thresholds);

  return { deal, result, effectiveAnswers };
}

/** Read-only: current MEDDPICC score without persisting a row or syncing the playbook gate. */
export async function assessMeddpicc(catalystApp: CatalystApp, dealId: string): Promise<MeddpiccScoreResult | null> {
  const computed = await computeAssessment(catalystApp, dealId);
  return computed?.result ?? null;
}

/** Persists to deal_meddpicc_scores (append-only history) and syncs the playbook gate. */
export async function computeMeddpiccScoreForDeal(
  catalystApp: CatalystApp,
  dealId: string,
): Promise<MeddpiccScoreResult | null> {
  const computed = await computeAssessment(catalystApp, dealId);
  if (!computed) return null;
  const { result } = computed;

  await createDealMeddpiccScoresRepo(catalystApp).create({
    dealId,
    overallScore: result.overallScore,
    overallPct: result.overallPct,
    stagePct: result.stagePct,
    ragStatus: result.ragStatus,
    pillarBreakdown: result.pillarBreakdown,
    strongNoCount: result.strongNoCount,
    unknownCount: result.unknownCount,
  });

  await syncMeddpiccPlaybookGate(catalystApp, dealId, result.ragStatus, result.overallPct);

  return result;
}

/** Used by lib/subscribers/snapshot-service.ts's Catalyst-backed capture path. */
export async function getLatestMeddpiccScore(
  catalystApp: CatalystApp,
  dealId: string,
): Promise<{ overallPct: number; stagePct: number; ragStatus: string } | null> {
  return createDealMeddpiccScoresRepo(catalystApp).latestByDealId(dealId);
}

/** Read-only assessment (questions + effective answers + computed score) — used by GET /v2/deals/:dealId/meddpicc. */
export async function getMeddpiccAssessment(catalystApp: CatalystApp, dealId: string): Promise<MeddpiccAssessment | null> {
  const deal = await loadDeal(catalystApp, dealId);
  if (!deal) return null;

  const [answers, score] = await Promise.all([
    loadEffectiveAnswers(catalystApp, dealId, deal.accountName),
    assessMeddpicc(catalystApp, dealId),
  ]);
  if (!score) return null;

  return { questions: QUESTION_CATALOG, answers, score };
}

/** Assessment AND a fresh persisted score row + playbook-gate sync — used by PATCH /v2/deals/:dealId/meddpicc. */
export async function recalculateMeddpiccAssessment(
  catalystApp: CatalystApp,
  dealId: string,
): Promise<MeddpiccAssessment | null> {
  const deal = await loadDeal(catalystApp, dealId);
  if (!deal) return null;

  const answers = await loadEffectiveAnswers(catalystApp, dealId, deal.accountName);
  const score = await computeMeddpiccScoreForDeal(catalystApp, dealId);
  if (!score) return null;

  return { questions: QUESTION_CATALOG, answers, score };
}

export async function upsertMeddpiccAnswer(
  catalystApp: CatalystApp,
  dealId: string,
  questionOrder: number,
  input: { score: number; note?: string | null },
  actor: string,
): Promise<void> {
  const deal = await createEnterpriseDealsRepo(catalystApp).getById(dealId);
  if (!deal) throw notFound(`No deal with id ${dealId}`);

  const question = (await createMeddpiccQuestionsRepo(catalystApp).listAll()).find(
    (q) => q.questionOrder === questionOrder,
  );
  if (!question) throw notFound(`No MEDDPICC question with order ${questionOrder}`);

  if (!Number.isInteger(input.score) || input.score < 0 || input.score > 3) {
    throw badRequest(`score must be an integer between 0 and 3, got ${input.score}`);
  }

  await createDealMeddpiccAnswersRepo(catalystApp).upsertByDealAndQuestion(dealId, question.id, {
    score: input.score,
    note: input.note ?? null,
    answeredBy: actor,
  });
}
