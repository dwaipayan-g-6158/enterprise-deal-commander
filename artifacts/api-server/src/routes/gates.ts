import { Router, type IRouter, type Request, type Response } from "express";
import { and, eq } from "drizzle-orm";
import { db, enterpriseDeals, dealTechnicalGates } from "@workspace/db";
import {
  ListGatesParams,
  ListGatesResponse,
  UpdateGateParams,
  UpdateGateBody,
  UpdateGateResponse,
  UpdateGatesBatchParams,
  UpdateGatesBatchBody,
  UpdateGatesBatchResponse,
} from "@workspace/api-zod";
import { requireAuth, getActor } from "../lib/auth";
import { badRequest, notFound } from "../lib/http";
import { getDealGates } from "../lib/intelligence";
import { writeAudit, type AuditEntry } from "../lib/audit";
import { emitDealEvent } from "../lib/events";

const router: IRouter = Router();

router.use(requireAuth);

interface GateView {
  gateCode: string;
  isCompleted: boolean;
  prerequisiteGateCodes: string[];
}

function computeIntegrityWarnings(gates: GateView[]) {
  const map = new Map(gates.map((g) => [g.gateCode, g.isCompleted]));
  const warnings: { gateCode: string; type: "out_of_order"; message: string }[] =
    [];
  for (const gate of gates) {
    if (!gate.isCompleted) continue;
    for (const prereq of gate.prerequisiteGateCodes) {
      if (!map.get(prereq)) {
        warnings.push({
          gateCode: gate.gateCode,
          type: "out_of_order",
          message: `${gate.gateCode} is complete but prerequisite ${prereq} is not.`,
        });
      }
    }
  }
  return warnings;
}

async function ensureDeal(dealId: string) {
  const rows = await db
    .select({ id: enterpriseDeals.id })
    .from(enterpriseDeals)
    .where(eq(enterpriseDeals.id, dealId))
    .limit(1);
  if (rows.length === 0) throw notFound("Deal not found");
}

router.get("/deals/:dealId/gates", async (req: Request, res: Response) => {
  const { dealId } = ListGatesParams.parse(req.params);
  await ensureDeal(dealId);
  const gates = await getDealGates(dealId);
  res.json(ListGatesResponse.parse({ data: gates }));
});

router.put(
  "/deals/:dealId/gates/batch",
  async (req: Request, res: Response) => {
    const { dealId } = UpdateGatesBatchParams.parse(req.params);
    const parsed = UpdateGatesBatchBody.safeParse(req.body);
    if (!parsed.success) {
      throw badRequest("Invalid batch gate payload", parsed.error.issues);
    }
    await ensureDeal(dealId);
    const actor = getActor(req);

    const existing = await db
      .select()
      .from(dealTechnicalGates)
      .where(eq(dealTechnicalGates.dealId, dealId));
    const existingMap = new Map(existing.map((g) => [g.gateCode, g]));

    const audits: AuditEntry[] = [];
    for (const update of parsed.data.updates) {
      const prev = existingMap.get(update.gate_code);
      const wasCompleted = prev?.isCompleted ?? false;
      const values = {
        isCompleted: update.is_completed,
        completedAt: update.is_completed ? new Date() : null,
        completedBy: update.is_completed ? actor.displayName : null,
        notes: update.notes ?? prev?.notes ?? null,
      };
      if (!prev) {
        await db
          .insert(dealTechnicalGates)
          .values({ dealId, gateCode: update.gate_code, ...values });
      } else {
        await db
          .update(dealTechnicalGates)
          .set(values)
          .where(
            and(
              eq(dealTechnicalGates.dealId, dealId),
              eq(dealTechnicalGates.gateCode, update.gate_code),
            ),
          );
      }
      if (wasCompleted !== update.is_completed) {
        audits.push({
          dealId,
          entityType: "gate",
          entityId: update.gate_code,
          fieldChanged: "is_completed",
          oldValue: String(wasCompleted),
          newValue: String(update.is_completed),
          changedBy: actor.displayName,
        });
      }
    }
    if (audits.length > 0) await writeAudit(audits);
    for (const a of audits) {
      if (a.entityType === "gate" && a.entityId) {
        emitDealEvent("gate.toggled", {
          dealId,
          actor: actor.displayName,
          gateCode: a.entityId,
          isCompleted: a.newValue === "true",
        });
      }
    }

    const gates = await getDealGates(dealId);
    res.json(
      UpdateGatesBatchResponse.parse({
        data: gates,
        integrityWarnings: computeIntegrityWarnings(gates),
      }),
    );
  },
);

router.put(
  "/deals/:dealId/gates/:gateCode",
  async (req: Request, res: Response) => {
    const { dealId, gateCode } = UpdateGateParams.parse(req.params);
    const parsed = UpdateGateBody.safeParse(req.body);
    if (!parsed.success) {
      throw badRequest("Invalid gate payload", parsed.error.issues);
    }
    await ensureDeal(dealId);
    const actor = getActor(req);
    const body = parsed.data;

    const existingRows = await db
      .select()
      .from(dealTechnicalGates)
      .where(
        and(
          eq(dealTechnicalGates.dealId, dealId),
          eq(dealTechnicalGates.gateCode, gateCode),
        ),
      )
      .limit(1);

    const wasCompleted = existingRows[0]?.isCompleted ?? false;

    const values = {
      isCompleted: body.is_completed,
      completedAt: body.is_completed ? new Date() : null,
      completedBy: body.is_completed ? actor.displayName : null,
      notes: body.notes ?? existingRows[0]?.notes ?? null,
    };

    if (existingRows.length === 0) {
      await db
        .insert(dealTechnicalGates)
        .values({ dealId, gateCode, ...values });
    } else {
      await db
        .update(dealTechnicalGates)
        .set(values)
        .where(
          and(
            eq(dealTechnicalGates.dealId, dealId),
            eq(dealTechnicalGates.gateCode, gateCode),
          ),
        );
    }

    if (wasCompleted !== body.is_completed) {
      await writeAudit({
        dealId,
        entityType: "gate",
        entityId: gateCode,
        fieldChanged: "is_completed",
        oldValue: String(wasCompleted),
        newValue: String(body.is_completed),
        changedBy: actor.displayName,
      });
      emitDealEvent("gate.toggled", {
        dealId,
        actor: actor.displayName,
        gateCode,
        isCompleted: body.is_completed,
      });
    }

    const gates = await getDealGates(dealId);
    const updated = gates.find((g) => g.gateCode === gateCode);
    if (!updated) throw notFound("Gate not found");
    res.json(
      UpdateGateResponse.parse({
        data: updated,
        integrityWarnings: computeIntegrityWarnings(gates),
      }),
    );
  },
);

export default router;
