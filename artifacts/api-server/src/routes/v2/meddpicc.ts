import { Router, type IRouter, type Request, type Response } from "express";
import {
  GetMeddpiccAssessmentParams,
  UpsertMeddpiccAnswerParams,
  UpsertMeddpiccAnswerBody,
} from "@workspace/api-zod";
import { getActor } from "../../lib/auth";
import { notFound } from "../../lib/http";
import { emitDealEvent } from "../../lib/events";
import { getMeddpiccAssessment, recalculateMeddpiccAssessment, upsertMeddpiccAnswer } from "../../lib/meddpicc";

const router: IRouter = Router();

router.get("/deals/:dealId/meddpicc", async (req: Request, res: Response) => {
  const { dealId } = GetMeddpiccAssessmentParams.parse(req.params);
  const assessment = await getMeddpiccAssessment(dealId);
  if (!assessment) throw notFound("Deal not found");
  res.json({ data: assessment });
});

router.patch("/deals/:dealId/meddpicc", async (req: Request, res: Response) => {
  const { dealId } = UpsertMeddpiccAnswerParams.parse(req.params);
  const body = UpsertMeddpiccAnswerBody.parse(req.body ?? {});
  const actor = getActor(req);

  await upsertMeddpiccAnswer(dealId, body.questionOrder, { score: body.score, note: body.note }, actor.displayName);
  emitDealEvent("meddpicc.answer_changed", {
    dealId,
    actor: actor.displayName,
    questionOrder: body.questionOrder,
    score: body.score,
  });

  const assessment = await recalculateMeddpiccAssessment(dealId);
  if (!assessment) throw notFound("Deal not found");
  res.json({ data: assessment });
});

export default router;
