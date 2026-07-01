import { Router, type IRouter, type Request, type Response } from "express";
import { and, asc, desc, eq, sql } from "drizzle-orm";
import crypto from "node:crypto";
import {
  db,
  enterpriseDeals,
  competitors,
  dealCompetitors,
  stakeholders,
  dealDecisions,
  meetingSessions,
  webhooks,
  webhookDeliveryLog,
  notificationRules,
  notificationLog,
  customFieldDefinitions,
  customFieldValues,
  tagDefinitions,
  dealTags,
  dealMemory,
} from "@workspace/db";
import {
  ListDealCompetitorsParams,
  AddDealCompetitorParams,
  AddDealCompetitorBody,
  UpdateDealCompetitorParams,
  UpdateDealCompetitorBody,
  DeleteDealCompetitorParams,
  ListStakeholdersParams,
  CreateStakeholderParams,
  CreateStakeholderBody,
  UpdateStakeholderParams,
  UpdateStakeholderBody,
  DeleteStakeholderParams,
  ListDecisionsParams,
  CreateDecisionParams,
  CreateDecisionBody,
  UpdateDecisionParams,
  UpdateDecisionBody,
  CreateMeetingSessionBody,
  CreateWebhookBody,
  UpdateWebhookParams,
  UpdateWebhookBody,
  DeleteWebhookParams,
  ListWebhookDeliveriesParams,
  CreateNotificationRuleBody,
  UpdateNotificationRuleParams,
  UpdateNotificationRuleBody,
  DeleteNotificationRuleParams,
  CreateCustomFieldBody,
  GetDealCustomFieldsParams,
  SetDealCustomFieldParams,
  SetDealCustomFieldBody,
  CreateTagBody,
  DeleteTagParams,
  GetDealTagsParams,
  ApplyDealTagParams,
  RemoveDealTagParams,
  SearchDealMemoryQueryParams,
  GetDealMemoryParams,
  UpdateDealMemoryParams,
  UpdateDealMemoryBody,
  GetSimilarDealsParams,
} from "@workspace/api-zod";
import { getActor } from "../../lib/auth";
import { notFound, badRequest } from "../../lib/http";
import { emitDealEvent } from "../../lib/events";

const router: IRouter = Router();

/* ------------------------------------------------------------- F2 Competitors */

router.get("/deals/:dealId/competitors", async (req: Request, res: Response) => {
  const { dealId } = ListDealCompetitorsParams.parse(req.params);
  const rows = await db
    .select({
      id: dealCompetitors.id,
      dealId: dealCompetitors.dealId,
      competitorId: dealCompetitors.competitorId,
      competitorName: competitors.name,
      status: dealCompetitors.status,
      displacementStrategy: dealCompetitors.displacementStrategy,
      outcomeNotes: dealCompetitors.outcomeNotes,
    })
    .from(dealCompetitors)
    .leftJoin(competitors, eq(dealCompetitors.competitorId, competitors.id))
    .where(eq(dealCompetitors.dealId, dealId));
  res.json({ data: rows });
});

router.post("/deals/:dealId/competitors", async (req: Request, res: Response) => {
  const { dealId } = AddDealCompetitorParams.parse(req.params);
  const body = AddDealCompetitorBody.parse(req.body);
  const [row] = await db
    .insert(dealCompetitors)
    .values({
      dealId,
      competitorId: body.competitor_id,
      status: body.status ?? "Active",
      displacementStrategy: body.displacement_strategy ?? null,
      outcomeNotes: body.outcome_notes ?? null,
    })
    .returning();
  res.status(201).json({ data: { ...row, competitorName: null } });
});

router.put("/deals/:dealId/competitors/:id", async (req: Request, res: Response) => {
  const { id } = UpdateDealCompetitorParams.parse(req.params);
  const body = UpdateDealCompetitorBody.parse(req.body);
  const [row] = await db
    .update(dealCompetitors)
    .set({
      status: body.status ?? undefined,
      displacementStrategy: body.displacement_strategy ?? null,
      outcomeNotes: body.outcome_notes ?? null,
      updatedAt: new Date(),
    })
    .where(eq(dealCompetitors.id, id))
    .returning();
  if (!row) throw notFound("Competitor link not found");
  res.json({ data: { ...row, competitorName: null } });
});

router.delete("/deals/:dealId/competitors/:id", async (req: Request, res: Response) => {
  const { id } = DeleteDealCompetitorParams.parse(req.params);
  await db.delete(dealCompetitors).where(eq(dealCompetitors.id, id));
  res.json({ message: "Competitor removed" });
});

/* ------------------------------------------------------------ F8 Stakeholders */

router.get("/deals/:dealId/stakeholders", async (req: Request, res: Response) => {
  const { dealId } = ListStakeholdersParams.parse(req.params);
  const rows = await db
    .select()
    .from(stakeholders)
    .where(eq(stakeholders.dealId, dealId))
    .orderBy(desc(stakeholders.isDecisionMaker), asc(stakeholders.name));
  res.json({ data: rows });
});

router.post("/deals/:dealId/stakeholders", async (req: Request, res: Response) => {
  const { dealId } = CreateStakeholderParams.parse(req.params);
  const b = CreateStakeholderBody.parse(req.body);
  const [row] = await db
    .insert(stakeholders)
    .values({
      dealId,
      name: b.name,
      title: b.title ?? null,
      company: b.company ?? null,
      roleType: b.role_type,
      influenceLevel: b.influence_level,
      sentiment: b.sentiment,
      email: b.email ?? null,
      phone: b.phone ?? null,
      notes: b.notes ?? null,
      reportsToId: b.reports_to_id ?? null,
      isDecisionMaker: b.is_decision_maker ?? false,
    })
    .returning();
  res.status(201).json({ data: row });
});

router.put("/deals/:dealId/stakeholders/:id", async (req: Request, res: Response) => {
  const { id } = UpdateStakeholderParams.parse(req.params);
  const b = UpdateStakeholderBody.parse(req.body);
  const [row] = await db
    .update(stakeholders)
    .set({
      name: b.name,
      title: b.title ?? null,
      company: b.company ?? null,
      roleType: b.role_type,
      influenceLevel: b.influence_level,
      sentiment: b.sentiment,
      email: b.email ?? null,
      phone: b.phone ?? null,
      notes: b.notes ?? null,
      reportsToId: b.reports_to_id ?? null,
      isDecisionMaker: b.is_decision_maker ?? false,
      updatedAt: new Date(),
    })
    .where(eq(stakeholders.id, id))
    .returning();
  if (!row) throw notFound("Stakeholder not found");
  res.json({ data: row });
});

router.delete("/deals/:dealId/stakeholders/:id", async (req: Request, res: Response) => {
  const { id } = DeleteStakeholderParams.parse(req.params);
  await db.delete(stakeholders).where(eq(stakeholders.id, id));
  res.json({ message: "Stakeholder removed" });
});

/* -------------------------------------------------------------- F9 Decisions */

function decisionOut(r: typeof dealDecisions.$inferSelect) {
  return {
    id: r.id,
    dealId: r.dealId,
    meetingSessionId: r.meetingSessionId,
    decisionText: r.decisionText,
    rationale: r.rationale,
    owner: r.owner,
    status: r.status,
    decidedAt: (r.decidedAt instanceof Date ? r.decidedAt.toISOString() : String(r.decidedAt)),
    dueDate: r.dueDate,
    completedAt: r.completedAt instanceof Date ? r.completedAt.toISOString() : r.completedAt,
  };
}

router.get("/deals/:dealId/decisions", async (req: Request, res: Response) => {
  const { dealId } = ListDecisionsParams.parse(req.params);
  const rows = await db
    .select()
    .from(dealDecisions)
    .where(eq(dealDecisions.dealId, dealId))
    .orderBy(desc(dealDecisions.decidedAt));
  res.json({ data: rows.map(decisionOut) });
});

router.post("/deals/:dealId/decisions", async (req: Request, res: Response) => {
  const { dealId } = CreateDecisionParams.parse(req.params);
  const b = CreateDecisionBody.parse(req.body);
  const actor = getActor(req);
  const [row] = await db
    .insert(dealDecisions)
    .values({
      dealId,
      decisionText: b.decision_text,
      rationale: b.rationale ?? null,
      owner: b.owner,
      decidedAt: b.decided_at ? new Date(b.decided_at) : new Date(),
      dueDate: b.due_date ?? null,
      meetingSessionId: b.meeting_session_id ?? null,
      commanderId: actor.username,
    })
    .returning();
  res.status(201).json({ data: decisionOut(row) });
});

router.put("/deals/:dealId/decisions/:id", async (req: Request, res: Response) => {
  const { id } = UpdateDecisionParams.parse(req.params);
  const b = UpdateDecisionBody.parse(req.body);
  const [row] = await db
    .update(dealDecisions)
    .set({
      status: b.status ?? undefined,
      rationale: b.rationale ?? undefined,
      dueDate: b.due_date ?? undefined,
      completedAt: b.status === "Completed" ? new Date() : undefined,
      updatedAt: new Date(),
    })
    .where(eq(dealDecisions.id, id))
    .returning();
  if (!row) throw notFound("Decision not found");
  res.json({ data: decisionOut(row) });
});

router.get("/meeting-sessions", async (_req: Request, res: Response) => {
  const rows = await db.select().from(meetingSessions).orderBy(desc(meetingSessions.occurredAt));
  res.json({
    data: rows.map((r) => ({
      id: r.id,
      sessionType: r.sessionType,
      title: r.title,
      occurredAt: r.occurredAt instanceof Date ? r.occurredAt.toISOString() : String(r.occurredAt),
      durationMinutes: r.durationMinutes,
      attendees: r.attendees,
      notes: r.notes,
    })),
  });
});

router.post("/meeting-sessions", async (req: Request, res: Response) => {
  const b = CreateMeetingSessionBody.parse(req.body);
  const actor = getActor(req);
  const [row] = await db
    .insert(meetingSessions)
    .values({
      sessionType: b.session_type,
      title: b.title ?? null,
      occurredAt: new Date(b.occurred_at),
      durationMinutes: b.duration_minutes ?? null,
      attendees: b.attendees ?? null,
      notes: b.notes ?? null,
      commanderId: actor.username,
    })
    .returning();
  res.status(201).json({
    data: {
      id: row.id,
      sessionType: row.sessionType,
      title: row.title,
      occurredAt: row.occurredAt instanceof Date ? row.occurredAt.toISOString() : String(row.occurredAt),
      durationMinutes: row.durationMinutes,
      attendees: row.attendees,
      notes: row.notes,
    },
  });
});

/* --------------------------------------------------------------- F1 Webhooks */

function webhookOut(r: typeof webhooks.$inferSelect) {
  return {
    id: r.id,
    webhookName: r.webhookName,
    targetUrl: r.targetUrl,
    events: r.events,
    isActive: r.isActive,
    failureCount: r.failureCount,
    lastTriggeredAt: r.lastTriggeredAt instanceof Date ? r.lastTriggeredAt.toISOString() : r.lastTriggeredAt,
    createdAt: r.createdAt instanceof Date ? r.createdAt.toISOString() : String(r.createdAt),
  };
}

router.get("/webhooks", async (_req: Request, res: Response) => {
  const rows = await db.select().from(webhooks).orderBy(desc(webhooks.createdAt));
  res.json({ data: rows.map(webhookOut) });
});

router.post("/webhooks", async (req: Request, res: Response) => {
  const b = CreateWebhookBody.parse(req.body);
  const actor = getActor(req);
  const [row] = await db
    .insert(webhooks)
    .values({
      webhookName: b.webhook_name,
      targetUrl: b.target_url,
      secretKey: b.secret_key ?? crypto.randomBytes(24).toString("hex"),
      events: b.events,
      isActive: b.is_active ?? true,
      createdBy: actor.username,
    })
    .returning();
  res.status(201).json({ data: webhookOut(row) });
});

router.put("/webhooks/:id", async (req: Request, res: Response) => {
  const { id } = UpdateWebhookParams.parse(req.params);
  const b = UpdateWebhookBody.parse(req.body);
  const [row] = await db
    .update(webhooks)
    .set({
      webhookName: b.webhook_name,
      targetUrl: b.target_url,
      events: b.events,
      isActive: b.is_active ?? undefined,
      ...(b.secret_key ? { secretKey: b.secret_key } : {}),
    })
    .where(eq(webhooks.id, id))
    .returning();
  if (!row) throw notFound("Webhook not found");
  res.json({ data: webhookOut(row) });
});

router.delete("/webhooks/:id", async (req: Request, res: Response) => {
  const { id } = DeleteWebhookParams.parse(req.params);
  await db.delete(webhooks).where(eq(webhooks.id, id));
  res.json({ message: "Webhook deleted" });
});

router.get("/webhooks/:id/deliveries", async (req: Request, res: Response) => {
  const { id } = ListWebhookDeliveriesParams.parse(req.params);
  const rows = await db
    .select()
    .from(webhookDeliveryLog)
    .where(eq(webhookDeliveryLog.webhookId, id))
    .orderBy(desc(webhookDeliveryLog.deliveredAt))
    .limit(100);
  res.json({
    data: rows.map((r) => ({
      id: r.id,
      eventType: r.eventType,
      responseStatus: r.responseStatus,
      success: r.success,
      deliveredAt: r.deliveredAt instanceof Date ? r.deliveredAt.toISOString() : String(r.deliveredAt),
    })),
  });
});

/* ---------------------------------------------------------- F12 Notifications */

router.get("/notification-rules", async (_req: Request, res: Response) => {
  const rows = await db.select().from(notificationRules).orderBy(desc(notificationRules.createdAt));
  res.json({
    data: rows.map((r) => ({
      id: r.id,
      ruleName: r.ruleName,
      triggerEvent: r.triggerEvent,
      triggerConditions: r.triggerConditions,
      channel: r.channel,
      isActive: r.isActive,
    })),
  });
});

router.post("/notification-rules", async (req: Request, res: Response) => {
  const b = CreateNotificationRuleBody.parse(req.body);
  const actor = getActor(req);
  const [row] = await db
    .insert(notificationRules)
    .values({
      commanderId: actor.username,
      ruleName: b.rule_name,
      triggerEvent: b.trigger_event,
      triggerConditions: (b.trigger_conditions ?? null) as Record<string, unknown> | null,
      channel: b.channel ?? "in_app",
      isActive: b.is_active ?? true,
    })
    .returning();
  res.status(201).json({
    data: {
      id: row.id,
      ruleName: row.ruleName,
      triggerEvent: row.triggerEvent,
      triggerConditions: row.triggerConditions,
      channel: row.channel,
      isActive: row.isActive,
    },
  });
});

router.put("/notification-rules/:id", async (req: Request, res: Response) => {
  const { id } = UpdateNotificationRuleParams.parse(req.params);
  const b = UpdateNotificationRuleBody.parse(req.body);
  const [row] = await db
    .update(notificationRules)
    .set({
      ruleName: b.rule_name,
      triggerEvent: b.trigger_event,
      triggerConditions: (b.trigger_conditions ?? null) as Record<string, unknown> | null,
      channel: b.channel ?? undefined,
      isActive: b.is_active ?? undefined,
    })
    .where(eq(notificationRules.id, id))
    .returning();
  if (!row) throw notFound("Rule not found");
  res.json({
    data: {
      id: row.id,
      ruleName: row.ruleName,
      triggerEvent: row.triggerEvent,
      triggerConditions: row.triggerConditions,
      channel: row.channel,
      isActive: row.isActive,
    },
  });
});

router.delete("/notification-rules/:id", async (req: Request, res: Response) => {
  const { id } = DeleteNotificationRuleParams.parse(req.params);
  await db.delete(notificationRules).where(eq(notificationRules.id, id));
  res.json({ message: "Rule deleted" });
});

router.get("/notifications", async (req: Request, res: Response) => {
  const unack = req.query.unacknowledged === "true";
  const rows = await db
    .select()
    .from(notificationLog)
    .where(unack ? sql`${notificationLog.acknowledgedAt} is null` : sql`true`)
    .orderBy(desc(notificationLog.sentAt))
    .limit(100);
  res.json({
    data: rows.map((r) => ({
      id: r.id,
      dealId: r.dealId,
      channel: r.channel,
      subject: r.subject,
      message: r.message,
      sentAt: r.sentAt instanceof Date ? r.sentAt.toISOString() : String(r.sentAt),
      acknowledgedAt: r.acknowledgedAt instanceof Date ? r.acknowledgedAt.toISOString() : r.acknowledgedAt,
    })),
  });
});

router.post("/notifications/:id/ack", async (req: Request, res: Response) => {
  const id = String(req.params.id);
  await db.update(notificationLog).set({ acknowledgedAt: new Date() }).where(eq(notificationLog.id, id));
  res.json({ message: "Acknowledged" });
});

/* -------------------------------------------------------- F16 Custom fields/tags */

router.get("/custom-fields", async (_req: Request, res: Response) => {
  const rows = await db
    .select()
    .from(customFieldDefinitions)
    .orderBy(asc(customFieldDefinitions.displayOrder));
  res.json({
    data: rows.map((r) => ({
      id: r.id,
      fieldName: r.fieldName,
      fieldKey: r.fieldKey,
      fieldType: r.fieldType,
      options: r.options,
      isRequired: r.isRequired,
      displayOrder: r.displayOrder,
    })),
  });
});

router.post("/custom-fields", async (req: Request, res: Response) => {
  const b = CreateCustomFieldBody.parse(req.body);
  const actor = getActor(req);
  const [row] = await db
    .insert(customFieldDefinitions)
    .values({
      fieldName: b.field_name,
      fieldKey: b.field_key,
      fieldType: b.field_type,
      options: b.options ?? null,
      isRequired: b.is_required ?? false,
      displayOrder: b.display_order ?? 0,
      createdBy: actor.username,
    })
    .returning();
  res.status(201).json({
    data: {
      id: row.id,
      fieldName: row.fieldName,
      fieldKey: row.fieldKey,
      fieldType: row.fieldType,
      options: row.options,
      isRequired: row.isRequired,
      displayOrder: row.displayOrder,
    },
  });
});

router.get("/deals/:dealId/custom-fields", async (req: Request, res: Response) => {
  const { dealId } = GetDealCustomFieldsParams.parse(req.params);
  const rows = await db
    .select()
    .from(customFieldValues)
    .where(eq(customFieldValues.dealId, dealId));
  res.json({ data: { values: rows } });
});

router.put("/deals/:dealId/custom-fields/:fieldId", async (req: Request, res: Response) => {
  const { dealId, fieldId } = SetDealCustomFieldParams.parse(req.params);
  const b = SetDealCustomFieldBody.parse(req.body);
  await db
    .insert(customFieldValues)
    .values({
      dealId,
      fieldId,
      valueText: b.value_text ?? null,
      valueNumber: b.value_number != null ? String(b.value_number) : null,
      valueDate: b.value_date ?? null,
      valueSelect: b.value_select ?? null,
      valueMultiSelect: b.value_multi_select ?? null,
    })
    .onConflictDoUpdate({
      target: [customFieldValues.dealId, customFieldValues.fieldId],
      set: {
        valueText: b.value_text ?? null,
        valueNumber: b.value_number != null ? String(b.value_number) : null,
        valueDate: b.value_date ?? null,
        valueSelect: b.value_select ?? null,
        valueMultiSelect: b.value_multi_select ?? null,
      },
    });
  res.json({ message: "Saved" });
});

router.get("/tags", async (_req: Request, res: Response) => {
  const rows = await db.select().from(tagDefinitions).orderBy(asc(tagDefinitions.tagName));
  res.json({ data: rows.map((r) => ({ id: r.id, tagName: r.tagName, color: r.color })) });
});

router.post("/tags", async (req: Request, res: Response) => {
  const b = CreateTagBody.parse(req.body);
  const [row] = await db
    .insert(tagDefinitions)
    .values({ tagName: b.tag_name, color: b.color })
    .returning();
  res.status(201).json({ data: { id: row.id, tagName: row.tagName, color: row.color } });
});

// Delete a tag definition outright. The deal_tags FK cascades, but we also clear
// associations explicitly inside the transaction so the behaviour is the same
// even if a given DB lacks the ON DELETE CASCADE constraint.
router.delete("/tags/:tagId", async (req: Request, res: Response) => {
  const { tagId } = DeleteTagParams.parse(req.params);
  await db.transaction(async (tx) => {
    await tx.delete(dealTags).where(eq(dealTags.tagId, tagId));
    await tx.delete(tagDefinitions).where(eq(tagDefinitions.id, tagId));
  });
  res.json({ message: "Tag deleted" });
});

router.get("/deals/:dealId/tags", async (req: Request, res: Response) => {
  const { dealId } = GetDealTagsParams.parse(req.params);
  const rows = await db
    .select({ id: tagDefinitions.id, tagName: tagDefinitions.tagName, color: tagDefinitions.color })
    .from(dealTags)
    .innerJoin(tagDefinitions, eq(dealTags.tagId, tagDefinitions.id))
    .where(eq(dealTags.dealId, dealId));
  res.json({ data: rows });
});

router.post("/deals/:dealId/tags/:tagId", async (req: Request, res: Response) => {
  const { dealId, tagId } = ApplyDealTagParams.parse(req.params);
  await db.insert(dealTags).values({ dealId, tagId }).onConflictDoNothing();
  res.json({ message: "Tag applied" });
});

router.delete("/deals/:dealId/tags/:tagId", async (req: Request, res: Response) => {
  const { dealId, tagId } = RemoveDealTagParams.parse(req.params);
  await db.delete(dealTags).where(and(eq(dealTags.dealId, dealId), eq(dealTags.tagId, tagId)));
  res.json({ message: "Tag removed" });
});

/* ------------------------------------------------------------- F5/F6 Memory */

function memoryOut(r: typeof dealMemory.$inferSelect) {
  return {
    id: r.id,
    dealId: r.dealId,
    accountName: r.accountName,
    dealName: r.dealName,
    outcome: r.outcome,
    finalTcv: r.finalTcv,
    pricingModel: r.pricingModel,
    servicesTier: r.servicesTier,
    totalGatesCompleted: r.totalGatesCompleted,
    totalBlockersEncountered: r.totalBlockersEncountered,
    totalDaysActive: r.totalDaysActive,
    competitorsFaced: r.competitorsFaced,
    winLossNarrative: r.winLossNarrative,
    keyLessons: r.keyLessons,
    tags: r.tags,
    archivedAt: r.archivedAt instanceof Date ? r.archivedAt.toISOString() : String(r.archivedAt),
    primaryLossCategory: r.primaryLossCategory,
    lossSubcategory: r.lossSubcategory,
    lossNarrative: r.lossNarrative,
    winningCompetitorId: r.winningCompetitorId,
    winBackPotential: r.winBackPotential,
    winBackTimeline: r.winBackTimeline,
    causalChain: r.causalChain,
    decisionMakerEngaged: r.decisionMakerEngaged,
    championIdentified: r.championIdentified,
    productGaps: r.productGaps,
    qualityScore: r.qualityScore,
    autopsyCompletedAt: r.autopsyCompletedAt instanceof Date ? r.autopsyCompletedAt.toISOString() : r.autopsyCompletedAt,
  };
}

// Completeness score over the curated autopsy fields (never trusted from the
// client) — a simple filled-field count, not a weighted rubric; false
// precision would be worse than an honest completeness percentage at this
// data volume.
function computeAutopsyQualityScore(f: {
  primaryLossCategory?: string | null;
  lossSubcategory?: string | null;
  lossNarrative?: string | null;
  winningCompetitorId?: number | null;
  winBackPotential?: number | null;
  winBackTimeline?: string | null;
  causalChain?: string[] | null;
  decisionMakerEngaged?: boolean | null;
  championIdentified?: boolean | null;
  productGaps?: string[] | null;
}): number {
  const checks = [
    !!f.primaryLossCategory,
    !!f.lossSubcategory,
    !!f.lossNarrative,
    f.winningCompetitorId != null,
    f.winBackPotential != null,
    !!f.winBackTimeline,
    !!f.causalChain?.length,
    f.decisionMakerEngaged != null,
    f.championIdentified != null,
    !!f.productGaps?.length,
  ];
  const filled = checks.filter(Boolean).length;
  return Math.round((filled / checks.length) * 100);
}

router.get("/memory", async (_req: Request, res: Response) => {
  const rows = await db.select().from(dealMemory).orderBy(desc(dealMemory.archivedAt)).limit(200);
  res.json({ data: rows.map(memoryOut) });
});

router.get("/memory/search", async (req: Request, res: Response) => {
  const q = SearchDealMemoryQueryParams.parse(req.query);
  const term = (q.q ?? "").trim();
  const rows = term
    ? await db.execute(sql`
        SELECT * FROM edc_v2.deal_memory
        WHERE searchable_vector @@ plainto_tsquery('english', ${term})
        ${q.outcome ? sql`AND outcome = ${q.outcome}` : sql``}
        ORDER BY ts_rank(searchable_vector, plainto_tsquery('english', ${term})) DESC
        LIMIT 50`)
    : await db
        .select()
        .from(dealMemory)
        .where(q.outcome ? eq(dealMemory.outcome, q.outcome) : sql`true`)
        .orderBy(desc(dealMemory.archivedAt))
        .limit(50);
  const list = Array.isArray(rows) ? rows : (rows as { rows: unknown[] }).rows ?? [];
  res.json({ data: (list as Record<string, unknown>[]).map(normalizeMemoryRow) });
});

// Raw SQL rows come back snake_cased; normalize to the API shape.
function normalizeMemoryRow(r: Record<string, unknown>) {
  return {
    id: r.id ?? r["id"],
    dealId: r.dealId ?? r["deal_id"],
    accountName: r.accountName ?? r["account_name"],
    dealName: r.dealName ?? r["deal_name"],
    outcome: r.outcome,
    finalTcv: r.finalTcv ?? r["final_tcv"] ?? null,
    pricingModel: r.pricingModel ?? r["pricing_model"] ?? null,
    servicesTier: r.servicesTier ?? r["services_tier"] ?? null,
    totalGatesCompleted: r.totalGatesCompleted ?? r["total_gates_completed"] ?? null,
    totalBlockersEncountered: r.totalBlockersEncountered ?? r["total_blockers_encountered"] ?? null,
    totalDaysActive: r.totalDaysActive ?? r["total_days_active"] ?? null,
    competitorsFaced: r.competitorsFaced ?? r["competitors_faced"] ?? null,
    winLossNarrative: r.winLossNarrative ?? r["win_loss_narrative"] ?? null,
    keyLessons: r.keyLessons ?? r["key_lessons"] ?? null,
    tags: r.tags ?? null,
    archivedAt:
      (r.archivedAt as string) ??
      (r["archived_at"] instanceof Date
        ? (r["archived_at"] as Date).toISOString()
        : String(r["archived_at"] ?? "")),
  };
}

router.get("/memory/similar/:dealId", async (req: Request, res: Response) => {
  const { dealId } = GetSimilarDealsParams.parse(req.params);
  const dealRows = await db
    .select({ accountName: enterpriseDeals.accountName, productRevenue: enterpriseDeals.productRevenue })
    .from(enterpriseDeals)
    .where(eq(enterpriseDeals.id, dealId))
    .limit(1);
  const deal = dealRows[0];
  if (!deal) throw notFound("Deal not found");
  const all = await db.select().from(dealMemory).limit(200);
  const tcv = Number(deal.productRevenue) || 0;
  const similar = all.filter((m) => {
    if (m.accountName === deal.accountName) return true;
    const mt = Number(m.finalTcv) || 0;
    return tcv > 0 && Math.abs(mt - tcv) / tcv <= 0.5;
  });
  res.json({ data: similar.slice(0, 10).map(memoryOut) });
});

router.get("/memory/:id", async (req: Request, res: Response) => {
  const { id } = GetDealMemoryParams.parse(req.params);
  const rows = await db.select().from(dealMemory).where(eq(dealMemory.id, id)).limit(1);
  if (!rows[0]) throw notFound("Memory not found");
  res.json({ data: memoryOut(rows[0]) });
});

router.put("/memory/:id", async (req: Request, res: Response) => {
  const { id } = UpdateDealMemoryParams.parse(req.params);
  const b = UpdateDealMemoryBody.parse(req.body);

  const existingRows = await db.select().from(dealMemory).where(eq(dealMemory.id, id)).limit(1);
  if (!existingRows[0]) throw notFound("Memory not found");
  const existing = existingRows[0];

  const merged = {
    primaryLossCategory: b.primary_loss_category ?? existing.primaryLossCategory,
    lossSubcategory: b.loss_subcategory ?? existing.lossSubcategory,
    lossNarrative: b.loss_narrative ?? existing.lossNarrative,
    winningCompetitorId: b.winning_competitor_id ?? existing.winningCompetitorId,
    winBackPotential: b.win_back_potential ?? existing.winBackPotential,
    winBackTimeline: b.win_back_timeline ?? existing.winBackTimeline,
    causalChain: b.causal_chain ?? existing.causalChain,
    decisionMakerEngaged: b.decision_maker_engaged ?? existing.decisionMakerEngaged,
    championIdentified: b.champion_identified ?? existing.championIdentified,
    productGaps: b.product_gaps ?? existing.productGaps,
  };
  const isAutopsyUpdate = Object.keys(b).some((k) => k !== "win_loss_narrative" && k !== "key_lessons" && k !== "tags");

  const [row] = await db
    .update(dealMemory)
    .set({
      winLossNarrative: b.win_loss_narrative ?? undefined,
      keyLessons: b.key_lessons ?? undefined,
      tags: b.tags ?? undefined,
      ...merged,
      qualityScore: computeAutopsyQualityScore(merged),
      autopsyCompletedAt: isAutopsyUpdate ? new Date() : undefined,
    })
    .where(eq(dealMemory.id, id))
    .returning();
  if (!row) throw notFound("Memory not found");
  if (isAutopsyUpdate) {
    emitDealEvent("deal.autopsy_captured", {
      dealId: row.dealId,
      actor: getActor(req).displayName,
      qualityScore: row.qualityScore ?? 0,
    });
  }
  res.json({ data: memoryOut(row) });
});

void badRequest;

export default router;
