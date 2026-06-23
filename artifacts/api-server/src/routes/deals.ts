import { Router, type IRouter, type Request, type Response } from "express";
import { and, desc, eq, isNull, isNotNull } from "drizzle-orm";
import {
  db,
  enterpriseDeals,
  dealTechnicalGates,
  gateDefinitions,
  pipelineStages,
  dealStageOverrides,
} from "@workspace/db";
import {
  ListDealsQueryParams,
  ListDealsResponse,
  CreateDealBody,
  GetDealParams,
  GetDealResponse,
  UpdateDealParams,
  UpdateDealBody,
  UpdateDealResponse,
  DeleteDealParams,
  RestoreDealParams,
  RestoreDealResponse,
  ArchiveDealParams,
  ArchiveDealResponse,
} from "@workspace/api-zod";
import { requireAuth, getActor } from "../lib/auth";
import { badRequest, notFound, conflict, stageGuardrail } from "../lib/http";
import { serializeDeal, assembleDealIntelligence } from "../lib/intelligence";
import { writeAudit } from "../lib/audit";

const router: IRouter = Router();

router.use(requireAuth);

router.get("/deals", async (req: Request, res: Response) => {
  const q = ListDealsQueryParams.parse(req.query);
  const state = q.state ?? "active";

  const conditions = [];
  if (state === "active") {
    conditions.push(isNull(enterpriseDeals.deletedAt));
    conditions.push(isNull(enterpriseDeals.archivedAt));
  } else if (state === "archived") {
    conditions.push(isNotNull(enterpriseDeals.archivedAt));
    conditions.push(isNull(enterpriseDeals.deletedAt));
  } else if (state === "deleted") {
    conditions.push(isNotNull(enterpriseDeals.deletedAt));
  }
  if (q.stage) {
    conditions.push(eq(pipelineStages.stageName, q.stage));
  }

  const whereClause = conditions.length ? and(...conditions) : undefined;

  const rows = await db
    .select({ id: enterpriseDeals.id })
    .from(enterpriseDeals)
    .innerJoin(
      pipelineStages,
      eq(enterpriseDeals.salesStageId, pipelineStages.id),
    )
    .where(whereClause)
    .orderBy(desc(enterpriseDeals.updatedAt));

  let items = (
    await Promise.all(rows.map((r) => serializeDeal(r.id)))
  ).filter((d): d is NonNullable<typeof d> => d !== null);

  if (q.health) {
    items = items.filter((d) => d.healthStatus === q.health);
  }

  if (q.sort) {
    const desc_ = q.sort.startsWith("-");
    const key = desc_ ? q.sort.slice(1) : q.sort;
    items.sort((a, b) => {
      const av = (a as Record<string, unknown>)[key];
      const bv = (b as Record<string, unknown>)[key];
      if (typeof av === "number" && typeof bv === "number") {
        return desc_ ? bv - av : av - bv;
      }
      return desc_
        ? String(bv).localeCompare(String(av))
        : String(av).localeCompare(String(bv));
    });
  }

  const total = items.length;
  const offset = q.offset ?? 0;
  const limit = q.limit ?? 50;
  const paged = items.slice(offset, offset + limit);

  res.json(
    ListDealsResponse.parse({
      data: paged,
      meta: { total, limit, offset },
    }),
  );
});

async function seedGatesForDeal(dealId: string) {
  const defs = await db
    .select({ gateCode: gateDefinitions.gateCode })
    .from(gateDefinitions)
    .where(eq(gateDefinitions.isActive, true));
  if (defs.length === 0) return;
  await db
    .insert(dealTechnicalGates)
    .values(defs.map((d) => ({ dealId, gateCode: d.gateCode })))
    .onConflictDoNothing();
}

router.post("/deals", async (req: Request, res: Response) => {
  const parsed = CreateDealBody.safeParse(req.body);
  if (!parsed.success) {
    throw badRequest("Invalid deal payload", parsed.error.issues);
  }
  const actor = getActor(req);
  const body = parsed.data;

  let created;
  try {
    const inserted = await db
      .insert(enterpriseDeals)
      .values({
        dealName: body.deal_name,
        accountName: body.account_name,
        crmRecordUrl: body.crm_record_url ?? null,
        accountManager: body.account_manager,
        technicalLead: body.technical_lead,
        salesStageId: body.sales_stage_id,
        productRevenue: String(body.product_revenue),
        pricingModelId: body.pricing_model_id,
        contractTermYears: body.contract_term_years,
        dealCurrency: body.deal_currency ?? "USD",
        expectedCloseDate: body.expected_close_date ?? null,
        winProbabilityPct: body.win_probability_pct ?? null,
        servicesRevenue: String(body.services_revenue),
        servicesTierId: body.services_tier_id,
        managerStrategicBlueprint: body.manager_strategic_blueprint ?? null,
        speakerNotes: body.speaker_notes ?? null,
        lossArchetypeId: body.loss_archetype_id ?? null,
      })
      .returning({ id: enterpriseDeals.id });
    created = inserted[0];
  } catch (err) {
    if (
      err instanceof Error &&
      "code" in err &&
      (err as { code?: string }).code === "23505"
    ) {
      throw conflict("A deal with this account and name already exists");
    }
    throw err;
  }

  await seedGatesForDeal(created.id);
  await writeAudit({
    dealId: created.id,
    entityType: "deal",
    fieldChanged: "created",
    newValue: body.deal_name,
    changedBy: actor.displayName,
  });

  const data = await serializeDeal(created.id);
  res.status(201).json(GetDealResponse.parse({ data }));
});

router.get("/deals/:id", async (req: Request, res: Response) => {
  const { id } = GetDealParams.parse(req.params);
  const data = await serializeDeal(id);
  if (!data) throw notFound("Deal not found");
  res.json(GetDealResponse.parse({ data }));
});

const updateDealHandler = async (req: Request, res: Response) => {
  const { id } = UpdateDealParams.parse(req.params);
  const parsed = UpdateDealBody.safeParse(req.body);
  if (!parsed.success) {
    throw badRequest("Invalid deal update payload", parsed.error.issues);
  }
  const actor = getActor(req);
  const body = parsed.data;

  const existingRows = await db
    .select()
    .from(enterpriseDeals)
    .where(eq(enterpriseDeals.id, id))
    .limit(1);
  const existing = existingRows[0];
  if (!existing) throw notFound("Deal not found");

  const updates: Partial<typeof enterpriseDeals.$inferInsert> = {};
  const audits: Parameters<typeof writeAudit>[0] = [];

  const track = (
    field: string,
    oldValue: unknown,
    newValue: unknown,
  ) => {
    if (String(oldValue ?? "") !== String(newValue ?? "")) {
      audits.push({
        dealId: id,
        entityType: "deal",
        fieldChanged: field,
        oldValue: oldValue == null ? null : String(oldValue),
        newValue: newValue == null ? null : String(newValue),
        changedBy: actor.displayName,
      });
    }
  };

  if (body.deal_name !== undefined) {
    track("deal_name", existing.dealName, body.deal_name);
    updates.dealName = body.deal_name;
  }
  if (body.account_name !== undefined) {
    track("account_name", existing.accountName, body.account_name);
    updates.accountName = body.account_name;
  }
  if (body.crm_record_url !== undefined) {
    updates.crmRecordUrl = body.crm_record_url ?? null;
  }
  if (body.account_manager !== undefined) {
    track("account_manager", existing.accountManager, body.account_manager);
    updates.accountManager = body.account_manager;
  }
  if (body.technical_lead !== undefined) {
    track("technical_lead", existing.technicalLead, body.technical_lead);
    updates.technicalLead = body.technical_lead;
  }
  if (body.sales_stage_id !== undefined) {
    track("sales_stage_id", existing.salesStageId, body.sales_stage_id);
    if (body.sales_stage_id !== existing.salesStageId) {
      updates.stageEnteredAt = new Date();
    }
    updates.salesStageId = body.sales_stage_id;
  }
  if (body.product_revenue !== undefined) {
    track("product_revenue", existing.productRevenue, body.product_revenue);
    updates.productRevenue = String(body.product_revenue);
  }
  if (body.pricing_model_id !== undefined) {
    updates.pricingModelId = body.pricing_model_id;
  }
  if (body.contract_term_years !== undefined) {
    updates.contractTermYears = body.contract_term_years;
  }
  if (body.deal_currency !== undefined) {
    updates.dealCurrency = body.deal_currency;
  }
  if (body.expected_close_date !== undefined) {
    track(
      "expected_close_date",
      existing.expectedCloseDate,
      body.expected_close_date,
    );
    updates.expectedCloseDate = body.expected_close_date ?? null;
  }
  if (body.win_probability_pct !== undefined) {
    updates.winProbabilityPct = body.win_probability_pct ?? null;
  }
  if (body.services_revenue !== undefined) {
    track("services_revenue", existing.servicesRevenue, body.services_revenue);
    updates.servicesRevenue = String(body.services_revenue);
  }
  if (body.services_tier_id !== undefined) {
    track("services_tier_id", existing.servicesTierId, body.services_tier_id);
    updates.servicesTierId = body.services_tier_id;
  }
  if (body.manager_strategic_blueprint !== undefined) {
    updates.managerStrategicBlueprint = body.manager_strategic_blueprint ?? null;
  }
  if (body.speaker_notes !== undefined) {
    updates.speakerNotes = body.speaker_notes ?? null;
  }
  if (body.loss_archetype_id !== undefined) {
    updates.lossArchetypeId = body.loss_archetype_id ?? null;
  }

  // Stage guardrail: block advancing the sales stage past active unmanaged RED
  // risk patterns unless a valid override reason is supplied. Backward stage
  // moves (e.g. to remediate) are never blocked.
  let stageOverride: {
    fromStage: number;
    toStage: number;
    patternCodes: string[];
  } | null = null;
  if (
    body.sales_stage_id !== undefined &&
    body.sales_stage_id !== existing.salesStageId
  ) {
    const stageRows = await db
      .select({ id: pipelineStages.id, sortOrder: pipelineStages.sortOrder })
      .from(pipelineStages);
    const fromStage = stageRows.find((s) => s.id === existing.salesStageId);
    const toStage = stageRows.find((s) => s.id === body.sales_stage_id);
    const isAdvancing =
      !!fromStage && !!toStage && toStage.sortOrder > fromStage.sortOrder;
    if (isAdvancing) {
      const intel = await assembleDealIntelligence(id);
      const blockingCodes =
        intel?.governance.alerts
          .filter((a) => a.severity === "RED")
          .map((a) => a.code) ?? [];
      if (blockingCodes.length > 0) {
        const reason = body.override_reason?.trim();
        if (!reason || reason.length < 10) {
          throw stageGuardrail(
            "Stage advancement is blocked by active RED risk patterns. Provide an override reason (10+ chars) to proceed.",
            blockingCodes,
          );
        }
        stageOverride = {
          fromStage: existing.salesStageId,
          toStage: body.sales_stage_id,
          patternCodes: blockingCodes,
        };
      }
    }
  }

  if (Object.keys(updates).length > 0) {
    try {
      await db
        .update(enterpriseDeals)
        .set(updates)
        .where(eq(enterpriseDeals.id, id));
    } catch (err) {
      if (
        err instanceof Error &&
        "code" in err &&
        (err as { code?: string }).code === "23505"
      ) {
        throw conflict("A deal with this account and name already exists");
      }
      throw err;
    }
  }
  if (stageOverride) {
    await db.insert(dealStageOverrides).values({
      dealId: id,
      fromStage: stageOverride.fromStage,
      toStage: stageOverride.toStage,
      patternCodes: stageOverride.patternCodes,
      overrideReason: body.override_reason!.trim(),
      createdBy: actor.displayName,
    });
    audits.push({
      dealId: id,
      entityType: "deal",
      fieldChanged: "stage_override",
      newValue: stageOverride.patternCodes.join(","),
      changedBy: actor.displayName,
    });
  }
  if (audits.length > 0) await writeAudit(audits);

  const data = await serializeDeal(id);
  res.json(UpdateDealResponse.parse({ data }));
};

router.put("/deals/:id", updateDealHandler);
router.patch("/deals/:id", updateDealHandler);

router.delete("/deals/:id", async (req: Request, res: Response) => {
  const { id } = DeleteDealParams.parse(req.params);
  const actor = getActor(req);
  const result = await db
    .update(enterpriseDeals)
    .set({ deletedAt: new Date() })
    .where(and(eq(enterpriseDeals.id, id), isNull(enterpriseDeals.deletedAt)))
    .returning({ id: enterpriseDeals.id });
  if (result.length === 0) throw notFound("Deal not found");
  await writeAudit({
    dealId: id,
    entityType: "deal",
    fieldChanged: "deleted_at",
    newValue: "deleted",
    changedBy: actor.displayName,
  });
  res.status(204).end();
});

router.post("/deals/:id/restore", async (req: Request, res: Response) => {
  const { id } = RestoreDealParams.parse(req.params);
  const actor = getActor(req);
  const result = await db
    .update(enterpriseDeals)
    .set({ deletedAt: null, archivedAt: null })
    .where(eq(enterpriseDeals.id, id))
    .returning({ id: enterpriseDeals.id });
  if (result.length === 0) throw notFound("Deal not found");
  await writeAudit({
    dealId: id,
    entityType: "deal",
    fieldChanged: "deleted_at",
    newValue: "restored",
    changedBy: actor.displayName,
  });
  const data = await serializeDeal(id);
  res.json(RestoreDealResponse.parse({ data }));
});

router.post("/deals/:id/archive", async (req: Request, res: Response) => {
  const { id } = ArchiveDealParams.parse(req.params);
  const actor = getActor(req);
  const result = await db
    .update(enterpriseDeals)
    .set({ archivedAt: new Date() })
    .where(and(eq(enterpriseDeals.id, id), isNull(enterpriseDeals.deletedAt)))
    .returning({ id: enterpriseDeals.id });
  if (result.length === 0) throw notFound("Deal not found");
  await writeAudit({
    dealId: id,
    entityType: "deal",
    fieldChanged: "archived_at",
    newValue: "archived",
    changedBy: actor.displayName,
  });
  const data = await serializeDeal(id);
  res.json(ArchiveDealResponse.parse({ data }));
});

export default router;
