import { Router, type IRouter, type Request, type Response } from "express";
import { and, desc, eq, inArray, isNull, isNotNull, or, sql, type SQL } from "drizzle-orm";
import {
  db,
  enterpriseDeals,
  dealTechnicalGates,
  dealProductInterests,
  dealComplianceDrivers,
  gateDefinitions,
  pipelineStages,
  dealStageOverrides,
  stakeholders,
  dealDecisions,
  dealBlockers,
  dealTags,
  tagDefinitions,
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
import { emitDealEvent } from "../lib/events";

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

  // Full-text-ish search now also spans strategic notes, stakeholders,
  // decisions and blockers — and reports WHERE each deal matched via `matchedIn`.
  // We resolve matching ids in ONE SQL pass (ILIKE + EXISTS subqueries) so the
  // serialize loop only runs for matched deals (also fixes the old search N+1).
  const searchTerm = q.search?.trim() ?? "";
  const doSearch = searchTerm.length >= 2;

  let matchedInById: Map<string, string[]> | null = null;
  let rows: { id: string }[];

  if (doSearch) {
    // Escape LIKE metacharacters so a literal % / _ / \ in the query stays literal.
    const esc = searchTerm.replace(/[\\%_]/g, (c) => `\\${c}`);
    const pat = `%${esc}%`;

    const nameExpr = sql`(${enterpriseDeals.dealName} ILIKE ${pat} OR ${enterpriseDeals.accountName} ILIKE ${pat} OR ${enterpriseDeals.accountManager} ILIKE ${pat} OR ${enterpriseDeals.technicalLead} ILIKE ${pat})`;
    const notesExpr = sql`(${enterpriseDeals.managerStrategicBlueprint} ILIKE ${pat} OR ${enterpriseDeals.speakerNotes} ILIKE ${pat})`;
    const stakeExpr = sql`EXISTS (SELECT 1 FROM ${stakeholders} s WHERE s.deal_id = ${enterpriseDeals.id} AND (s.name ILIKE ${pat} OR s.notes ILIKE ${pat}))`;
    const decisionExpr = sql`EXISTS (SELECT 1 FROM ${dealDecisions} dd WHERE dd.deal_id = ${enterpriseDeals.id} AND (dd.decision_text ILIKE ${pat} OR dd.rationale ILIKE ${pat}))`;
    const blockerExpr = sql`EXISTS (SELECT 1 FROM ${dealBlockers} b WHERE b.deal_id = ${enterpriseDeals.id} AND b.description ILIKE ${pat})`;

    const searchWhere = and(...conditions, or(nameExpr, notesExpr, stakeExpr, decisionExpr, blockerExpr));

    const flagRows = await db
      .select({
        id: enterpriseDeals.id,
        mName: sql<boolean>`${nameExpr}`,
        mNotes: sql<boolean>`${notesExpr}`,
        mStakeholder: sql<boolean>`${stakeExpr}`,
        mDecision: sql<boolean>`${decisionExpr}`,
        mBlocker: sql<boolean>`${blockerExpr}`,
      })
      .from(enterpriseDeals)
      .innerJoin(pipelineStages, eq(enterpriseDeals.salesStageId, pipelineStages.id))
      .where(searchWhere)
      .orderBy(desc(enterpriseDeals.updatedAt));

    matchedInById = new Map();
    rows = [];
    for (const r of flagRows) {
      const sources: string[] = [];
      if (r.mName) sources.push("name");
      if (r.mNotes) sources.push("notes");
      if (r.mStakeholder) sources.push("stakeholder");
      if (r.mDecision) sources.push("decision");
      if (r.mBlocker) sources.push("blocker");
      if (sources.length) {
        rows.push({ id: r.id });
        matchedInById.set(r.id, sources);
      }
    }
  } else {
    const whereClause: SQL | undefined = conditions.length ? and(...conditions) : undefined;
    rows = await db
      .select({ id: enterpriseDeals.id })
      .from(enterpriseDeals)
      .innerJoin(pipelineStages, eq(enterpriseDeals.salesStageId, pipelineStages.id))
      .where(whereClause)
      .orderBy(desc(enterpriseDeals.updatedAt));
  }

  let items = (
    await Promise.all(rows.map((r) => serializeDeal(r.id)))
  ).filter((d): d is NonNullable<typeof d> => d !== null);

  // Attach the per-deal match provenance for the search dropdown.
  if (matchedInById) {
    items = items.map((d) => ({ ...d, matchedIn: matchedInById!.get(d.id) ?? [] }));
  }

  // Attach applied tags so the roster can filter/display by tag (one batched
  // query over the result set — no per-deal N+1).
  if (items.length) {
    const tagRows = await db
      .select({
        dealId: dealTags.dealId,
        id: tagDefinitions.id,
        tagName: tagDefinitions.tagName,
        color: tagDefinitions.color,
      })
      .from(dealTags)
      .innerJoin(tagDefinitions, eq(dealTags.tagId, tagDefinitions.id))
      .where(inArray(dealTags.dealId, items.map((d) => d.id)));
    const tagsByDeal = new Map<string, { id: string; tagName: string; color: string }[]>();
    for (const t of tagRows) {
      const list = tagsByDeal.get(t.dealId) ?? [];
      list.push({ id: t.id, tagName: t.tagName, color: t.color });
      tagsByDeal.set(t.dealId, list);
    }
    items = items.map((d) => ({ ...d, tags: tagsByDeal.get(d.id) ?? [] }));
  }

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

// Replace the deal's "products of interest" (anchor) set, mirroring the
// cross-sell replace-set semantics in routes/crosssells.ts.
async function replaceProductInterests(dealId: string, productIds: string[]) {
  await db
    .delete(dealProductInterests)
    .where(eq(dealProductInterests.dealId, dealId));
  if (productIds.length > 0) {
    await db
      .insert(dealProductInterests)
      .values(productIds.map((productId) => ({ dealId, productId })))
      .onConflictDoNothing();
  }
}

// Replace the deal's additional compliance drivers (beyond the primary driver).
async function replaceComplianceDrivers(dealId: string, driverIds: number[]) {
  await db
    .delete(dealComplianceDrivers)
    .where(eq(dealComplianceDrivers.dealId, dealId));
  if (driverIds.length > 0) {
    await db
      .insert(dealComplianceDrivers)
      .values(driverIds.map((complianceDriverId) => ({ dealId, complianceDriverId })))
      .onConflictDoNothing();
  }
}

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

  // B6: the UI sends only the multi-select `compliance_driver_ids`. Derive the
  // single `compliance_driver_id` (engine read) as the first selected, falling
  // back to any explicit single value the caller still sends.
  const derivedComplianceDriverId =
    body.compliance_driver_ids && body.compliance_driver_ids.length > 0
      ? body.compliance_driver_ids[0]
      : (body.compliance_driver_id ?? null);

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
        landedAt: body.landed_at ?? new Date().toISOString().slice(0, 10),
        winProbabilityPct: body.win_probability_pct ?? null,
        committed: body.committed ?? false,
        servicesRevenue: String(body.services_revenue),
        servicesTierId: body.services_tier_id,
        managerStrategicBlueprint: body.manager_strategic_blueprint ?? null,
        speakerNotes: body.speaker_notes ?? null,
        lossArchetypeId: body.loss_archetype_id ?? null,
        competitorId: body.competitor_id ?? null,
        complianceDriverId: derivedComplianceDriverId,
        estimatedLogSources: body.estimated_log_sources ?? null,
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
  if (body.product_interest_ids && body.product_interest_ids.length > 0) {
    await replaceProductInterests(created.id, body.product_interest_ids);
  }
  if (body.compliance_driver_ids && body.compliance_driver_ids.length > 0) {
    await replaceComplianceDrivers(created.id, body.compliance_driver_ids);
  }
  await writeAudit({
    dealId: created.id,
    entityType: "deal",
    fieldChanged: "created",
    newValue: body.deal_name,
    changedBy: actor.displayName,
  });
  emitDealEvent("deal.created", {
    dealId: created.id,
    actor: actor.displayName,
    dealName: body.deal_name,
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
  if (body.landed_at !== undefined) {
    track("landed_at", existing.landedAt, body.landed_at);
    updates.landedAt = body.landed_at ?? null;
  }
  if (body.win_probability_pct !== undefined) {
    updates.winProbabilityPct = body.win_probability_pct ?? null;
  }
  if (body.committed !== undefined) {
    track("committed", existing.committed, body.committed);
    updates.committed = body.committed;
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
  if (body.loss_reason !== undefined) {
    track("loss_reason", existing.lossReason, body.loss_reason);
    updates.lossReason = body.loss_reason ?? null;
  }
  if (body.competitor_id !== undefined) {
    track("competitor_id", existing.competitorId, body.competitor_id);
    updates.competitorId = body.competitor_id ?? null;
  }
  // B6: derive the single `compliance_driver_id` (engine read) from the
  // multi-select `compliance_driver_ids` (first element, or null if empty) when
  // the array is supplied; otherwise honor an explicit single value.
  if (body.compliance_driver_ids !== undefined) {
    const derived =
      body.compliance_driver_ids.length > 0
        ? body.compliance_driver_ids[0]
        : null;
    track("compliance_driver_id", existing.complianceDriverId, derived);
    updates.complianceDriverId = derived;
  } else if (body.compliance_driver_id !== undefined) {
    track(
      "compliance_driver_id",
      existing.complianceDriverId,
      body.compliance_driver_id,
    );
    updates.complianceDriverId = body.compliance_driver_id ?? null;
  }
  if (body.estimated_log_sources !== undefined) {
    track(
      "estimated_log_sources",
      existing.estimatedLogSources,
      body.estimated_log_sources,
    );
    updates.estimatedLogSources = body.estimated_log_sources ?? null;
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
  if (body.product_interest_ids !== undefined) {
    await replaceProductInterests(id, body.product_interest_ids);
  }
  if (body.compliance_driver_ids !== undefined) {
    await replaceComplianceDrivers(id, body.compliance_driver_ids);
  }
  if (audits.length > 0) await writeAudit(audits);

  const changedFields = Object.keys(updates);
  if (changedFields.length > 0) {
    emitDealEvent("deal.updated", {
      dealId: id,
      actor: actor.displayName,
      changedFields,
    });
  }
  if (
    body.sales_stage_id !== undefined &&
    body.sales_stage_id !== existing.salesStageId
  ) {
    emitDealEvent("deal.stage_changed", {
      dealId: id,
      actor: actor.displayName,
      fromStageId: existing.salesStageId,
      toStageId: body.sales_stage_id,
      overridden: stageOverride !== null,
    });
  }

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
  emitDealEvent("deal.deleted", { dealId: id, actor: actor.displayName });
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
  emitDealEvent("deal.restored", { dealId: id, actor: actor.displayName });
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
  emitDealEvent("deal.archived", { dealId: id, actor: actor.displayName });
  const data = await serializeDeal(id);
  res.json(ArchiveDealResponse.parse({ data }));
});

export default router;
