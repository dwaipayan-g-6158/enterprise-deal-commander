import { Router, type IRouter, type Request, type Response } from "express";
import {
  initCatalystApp,
  createEnterpriseDealsRepo,
  createDealTechnicalGatesRepo,
  type CatalystApp,
} from "@workspace/db/catalyst";
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
import { getActor } from "../lib/auth";
import { badRequest, notFound } from "../lib/http";
import { getDealGates } from "../lib/catalyst/intelligence";
import { writeAudit, type AuditEntry } from "../lib/catalyst/audit";
import { emitDealEvent } from "../lib/events";

// Auth + write-role enforcement is applied centrally in routes/index.ts.
const router: IRouter = Router();

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

async function ensureDeal(catalystApp: CatalystApp, dealId: string) {
  const deal = await createEnterpriseDealsRepo(catalystApp).getById(dealId);
  if (!deal) throw notFound("Deal not found");
}

router.get("/deals/:dealId/gates", async (req: Request, res: Response) => {
  const { dealId } = ListGatesParams.parse(req.params);
  const catalystApp = initCatalystApp(req);
  await ensureDeal(catalystApp, dealId);
  const gates = await getDealGates(catalystApp, dealId);
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
    const catalystApp = initCatalystApp(req);
    await ensureDeal(catalystApp, dealId);
    const actor = getActor(req);

    const gatesRepo = createDealTechnicalGatesRepo(catalystApp);
    const existing = await gatesRepo.list(dealId);
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
      await gatesRepo.upsert(dealId, update.gate_code, values);
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
    if (audits.length > 0) await writeAudit(catalystApp, audits);
    for (const a of audits) {
      if (a.entityType === "gate" && a.entityId) {
        emitDealEvent("gate.toggled", {
          dealId,
          actor: actor.displayName,
          gateCode: a.entityId,
          isCompleted: a.newValue === "true",
          catalystApp,
        });
      }
    }

    const gates = await getDealGates(catalystApp, dealId);
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
    const catalystApp = initCatalystApp(req);
    await ensureDeal(catalystApp, dealId);
    const actor = getActor(req);
    const body = parsed.data;

    const gatesRepo = createDealTechnicalGatesRepo(catalystApp);
    const existing = await gatesRepo.list(dealId);
    const existingGate = existing.find((g) => g.gateCode === gateCode);
    const wasCompleted = existingGate?.isCompleted ?? false;

    const values = {
      isCompleted: body.is_completed,
      completedAt: body.is_completed ? new Date() : null,
      completedBy: body.is_completed ? actor.displayName : null,
      notes: body.notes ?? existingGate?.notes ?? null,
    };
    await gatesRepo.upsert(dealId, gateCode, values);

    if (wasCompleted !== body.is_completed) {
      await writeAudit(catalystApp, {
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
        catalystApp,
      });
    }

    const gates = await getDealGates(catalystApp, dealId);
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
