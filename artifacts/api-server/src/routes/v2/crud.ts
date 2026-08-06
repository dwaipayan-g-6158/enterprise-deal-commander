import { Router, type IRouter, type Request, type Response } from "express";
import crypto from "node:crypto";
import {
  initCatalystApp,
  createEnterpriseDealsRepo,
  createPricingModelsRepo,
  createDealCompetitorsRepo,
  createCompetitorsRepo,
  createStakeholdersRepo,
  createDealDecisionsRepo,
  createMeetingSessionsRepo,
  createWebhooksRepo,
  createWebhookDeliveryLogRepo,
  createNotificationRulesRepo,
  createNotificationLogRepo,
  createCustomFieldDefinitionsRepo,
  createCustomFieldValuesRepo,
  createTagDefinitionsRepo,
  createDealTagsRepo,
  createDealMemoryRepo,
  type DealMemoryRow,
} from "@workspace/db/catalyst";
import { calculateFlatTCV } from "@workspace/engine";
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
  CompareDealMemoryQueryParams,
  AskDealMemoryQueryParams,
} from "@workspace/api-zod";
import { getActor } from "../../lib/auth";
import { notFound, badRequest } from "../../lib/http";
import { logSettingsChange } from "../../lib/catalyst/settings-audit";
import { emitDealEvent } from "../../lib/events";
import { classifyAdvisorIntent, confidenceFor, composeNoDataAnswer, withLowSampleCaveat, type AdvisorCitation } from "../../lib/advisor";
import { computeCompetitorIntel, percentiles, type MemoryRow } from "../../lib/memory-intel";
import { selectRevivalCandidates } from "../../lib/revival";
import { memorySearchScore, memorySnippetText, buildSnippet } from "../../lib/memory-search";
import { getThresholds } from "../../lib/catalyst/intelligence";
import { num } from "../../lib/engine-config";

const router: IRouter = Router();

/* ------------------------------------------------------------- F2 Competitors */

router.get("/deals/:dealId/competitors", async (req: Request, res: Response) => {
  const { dealId } = ListDealCompetitorsParams.parse(req.params);
  const catalystApp = initCatalystApp(req);
  const [links, competitors] = await Promise.all([
    createDealCompetitorsRepo(catalystApp).list(dealId),
    createCompetitorsRepo(catalystApp).listAll(),
  ]);
  const nameById = new Map(competitors.map((c) => [c.id, c.name]));
  res.json({
    data: links.map((l) => ({
      id: l.id,
      dealId: l.dealId,
      competitorId: l.competitorId,
      competitorName: nameById.get(l.competitorId) ?? null,
      status: l.status,
      displacementStrategy: l.displacementStrategy,
      outcomeNotes: l.outcomeNotes,
    })),
  });
});

router.post("/deals/:dealId/competitors", async (req: Request, res: Response) => {
  const { dealId } = AddDealCompetitorParams.parse(req.params);
  const body = AddDealCompetitorBody.parse(req.body);
  const catalystApp = initCatalystApp(req);
  const row = await createDealCompetitorsRepo(catalystApp).create({
    dealId,
    competitorId: body.competitor_id,
    status: body.status ?? "Active",
    displacementStrategy: body.displacement_strategy ?? null,
    outcomeNotes: body.outcome_notes ?? null,
  });
  res.status(201).json({ data: { ...row, competitorName: null } });
});

router.put("/deals/:dealId/competitors/:id", async (req: Request, res: Response) => {
  const { id } = UpdateDealCompetitorParams.parse(req.params);
  const body = UpdateDealCompetitorBody.parse(req.body);
  const catalystApp = initCatalystApp(req);
  const row = await createDealCompetitorsRepo(catalystApp).update(id, {
    status: body.status ?? undefined,
    displacementStrategy: body.displacement_strategy ?? null,
    outcomeNotes: body.outcome_notes ?? null,
  });
  if (!row) throw notFound("Competitor link not found");
  res.json({ data: { ...row, competitorName: null } });
});

router.delete("/deals/:dealId/competitors/:id", async (req: Request, res: Response) => {
  const { id } = DeleteDealCompetitorParams.parse(req.params);
  const catalystApp = initCatalystApp(req);
  await createDealCompetitorsRepo(catalystApp).delete(id);
  res.json({ message: "Competitor removed" });
});

/* ------------------------------------------------------------ F8 Stakeholders */

router.get("/deals/:dealId/stakeholders", async (req: Request, res: Response) => {
  const { dealId } = ListStakeholdersParams.parse(req.params);
  const catalystApp = initCatalystApp(req);
  const rows = await createStakeholdersRepo(catalystApp).list(dealId);
  const sorted = [...rows].sort((a, b) => {
    if (a.isDecisionMaker !== b.isDecisionMaker) return a.isDecisionMaker ? -1 : 1;
    return a.name.localeCompare(b.name);
  });
  res.json({ data: sorted });
});

router.post("/deals/:dealId/stakeholders", async (req: Request, res: Response) => {
  const { dealId } = CreateStakeholderParams.parse(req.params);
  const b = CreateStakeholderBody.parse(req.body);
  const catalystApp = initCatalystApp(req);
  const row = await createStakeholdersRepo(catalystApp).create(dealId, {
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
  });
  res.status(201).json({ data: row });
});

router.put("/deals/:dealId/stakeholders/:id", async (req: Request, res: Response) => {
  const { id } = UpdateStakeholderParams.parse(req.params);
  const b = UpdateStakeholderBody.parse(req.body);
  const catalystApp = initCatalystApp(req);
  const row = await createStakeholdersRepo(catalystApp).update(id, {
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
  });
  if (!row) throw notFound("Stakeholder not found");
  res.json({ data: row });
});

router.delete("/deals/:dealId/stakeholders/:id", async (req: Request, res: Response) => {
  const { id } = DeleteStakeholderParams.parse(req.params);
  const catalystApp = initCatalystApp(req);
  await createStakeholdersRepo(catalystApp).delete(id);
  res.json({ message: "Stakeholder removed" });
});

/* -------------------------------------------------------------- F9 Decisions */

function decisionOut(r: {
  id: string;
  dealId: string;
  meetingSessionId: string | null;
  decisionText: string;
  rationale: string | null;
  owner: string;
  status: string;
  decidedAt: Date;
  dueDate: string | null;
  completedAt: Date | null;
}) {
  return {
    id: r.id,
    dealId: r.dealId,
    meetingSessionId: r.meetingSessionId,
    decisionText: r.decisionText,
    rationale: r.rationale,
    owner: r.owner,
    status: r.status,
    decidedAt: r.decidedAt.toISOString(),
    dueDate: r.dueDate,
    completedAt: r.completedAt ? r.completedAt.toISOString() : null,
  };
}

router.get("/deals/:dealId/decisions", async (req: Request, res: Response) => {
  const { dealId } = ListDecisionsParams.parse(req.params);
  const catalystApp = initCatalystApp(req);
  const rows = await createDealDecisionsRepo(catalystApp).list(dealId);
  res.json({ data: rows.map(decisionOut) });
});

router.post("/deals/:dealId/decisions", async (req: Request, res: Response) => {
  const { dealId } = CreateDecisionParams.parse(req.params);
  const b = CreateDecisionBody.parse(req.body);
  const actor = getActor(req);
  const catalystApp = initCatalystApp(req);
  const row = await createDealDecisionsRepo(catalystApp).create({
    dealId,
    decisionText: b.decision_text,
    rationale: b.rationale ?? null,
    owner: b.owner,
    decidedAt: b.decided_at ?? null,
    dueDate: b.due_date ?? null,
    meetingSessionId: b.meeting_session_id ?? null,
    commanderId: actor.username,
  });
  res.status(201).json({ data: decisionOut(row) });
});

router.put("/deals/:dealId/decisions/:id", async (req: Request, res: Response) => {
  const { id } = UpdateDecisionParams.parse(req.params);
  const b = UpdateDecisionBody.parse(req.body);
  const catalystApp = initCatalystApp(req);
  const row = await createDealDecisionsRepo(catalystApp).update(id, {
    status: b.status ?? undefined,
    rationale: b.rationale ?? undefined,
    dueDate: b.due_date ?? undefined,
  });
  if (!row) throw notFound("Decision not found");
  res.json({ data: decisionOut(row) });
});

router.get("/meeting-sessions", async (req: Request, res: Response) => {
  const catalystApp = initCatalystApp(req);
  const rows = await createMeetingSessionsRepo(catalystApp).listAll();
  res.json({
    data: rows.map((r) => ({
      id: r.id,
      sessionType: r.sessionType,
      title: r.title,
      occurredAt: r.occurredAt.toISOString(),
      durationMinutes: r.durationMinutes,
      attendees: r.attendees,
      notes: r.notes,
    })),
  });
});

router.post("/meeting-sessions", async (req: Request, res: Response) => {
  const b = CreateMeetingSessionBody.parse(req.body);
  const actor = getActor(req);
  const catalystApp = initCatalystApp(req);
  const row = await createMeetingSessionsRepo(catalystApp).create({
    sessionType: b.session_type,
    title: b.title ?? null,
    occurredAt: b.occurred_at,
    durationMinutes: b.duration_minutes ?? null,
    attendees: b.attendees ?? null,
    notes: b.notes ?? null,
    commanderId: actor.username,
  });
  res.status(201).json({
    data: {
      id: row.id,
      sessionType: row.sessionType,
      title: row.title,
      occurredAt: row.occurredAt.toISOString(),
      durationMinutes: row.durationMinutes,
      attendees: row.attendees,
      notes: row.notes,
    },
  });
});

/* --------------------------------------------------------------- F1 Webhooks */

function webhookOut(r: {
  id: string;
  webhookName: string;
  targetUrl: string;
  events: string[];
  isActive: boolean;
  failureCount: number;
  lastTriggeredAt: Date | null;
  createdAt: Date;
}) {
  return {
    id: r.id,
    webhookName: r.webhookName,
    targetUrl: r.targetUrl,
    events: r.events,
    isActive: r.isActive,
    failureCount: r.failureCount,
    lastTriggeredAt: r.lastTriggeredAt ? r.lastTriggeredAt.toISOString() : null,
    createdAt: r.createdAt.toISOString(),
  };
}

router.get("/webhooks", async (req: Request, res: Response) => {
  const catalystApp = initCatalystApp(req);
  const rows = await createWebhooksRepo(catalystApp).listAll();
  res.json({ data: rows.map(webhookOut) });
});

router.post("/webhooks", async (req: Request, res: Response) => {
  const b = CreateWebhookBody.parse(req.body);
  const actor = getActor(req);
  const catalystApp = initCatalystApp(req);
  const row = await createWebhooksRepo(catalystApp).create({
    webhookName: b.webhook_name,
    targetUrl: b.target_url,
    secretKey: b.secret_key ?? crypto.randomBytes(24).toString("hex"),
    events: b.events,
    isActive: b.is_active ?? true,
    createdBy: actor.username,
  });
  await logSettingsChange(req, {
    module: "webhooks",
    settingKey: b.webhook_name,
    entityId: String(row.id),
    action: "create",
    oldValue: null,
    newValue: { webhookName: b.webhook_name, targetUrl: b.target_url, events: b.events },
    actor: actor.username,
  });
  res.status(201).json({ data: webhookOut(row) });
});

router.put("/webhooks/:id", async (req: Request, res: Response) => {
  const { id } = UpdateWebhookParams.parse(req.params);
  const b = UpdateWebhookBody.parse(req.body);
  const actor = getActor(req);
  const catalystApp = initCatalystApp(req);
  const webhooksRepo = createWebhooksRepo(catalystApp);
  const prior = await webhooksRepo.getById(id);
  // Re-enabling a webhook (false -> true) clears the failure count it was
  // auto-disabled with — otherwise the only recourse for a user is delete +
  // recreate, which discards delivery history. Any other update (including
  // leaving an active webhook active) must NOT touch failureCount.
  const reactivating = !!prior && prior.isActive === false && b.is_active === true;
  const row = await webhooksRepo.update(id, {
    webhookName: b.webhook_name,
    targetUrl: b.target_url,
    events: b.events,
    isActive: b.is_active ?? undefined,
    ...(reactivating ? { failureCount: 0 } : {}),
    ...(b.secret_key ? { secretKey: b.secret_key } : {}),
  });
  if (!row) throw notFound("Webhook not found");
  await logSettingsChange(req, {
    module: "webhooks",
    settingKey: b.webhook_name,
    entityId: String(id),
    action: "update",
    oldValue: prior ? { webhookName: prior.webhookName, targetUrl: prior.targetUrl, events: prior.events } : null,
    newValue: { webhookName: row.webhookName, targetUrl: row.targetUrl, events: row.events },
    actor: actor.username,
  });
  res.json({ data: webhookOut(row) });
});

router.delete("/webhooks/:id", async (req: Request, res: Response) => {
  const { id } = DeleteWebhookParams.parse(req.params);
  const actor = getActor(req);
  const catalystApp = initCatalystApp(req);
  const webhooksRepo = createWebhooksRepo(catalystApp);
  const prior = await webhooksRepo.getById(id);
  await webhooksRepo.delete(id);
  if (prior) {
    await logSettingsChange(req, {
      module: "webhooks",
      settingKey: prior.webhookName,
      entityId: String(id),
      action: "delete",
      oldValue: { webhookName: prior.webhookName, targetUrl: prior.targetUrl, events: prior.events },
      newValue: null,
      actor: actor.username,
    });
  }
  res.json({ message: "Webhook deleted" });
});

router.get("/webhooks/:id/deliveries", async (req: Request, res: Response) => {
  const { id } = ListWebhookDeliveriesParams.parse(req.params);
  const catalystApp = initCatalystApp(req);
  const rows = await createWebhookDeliveryLogRepo(catalystApp).listByWebhookId(id, 100);
  res.json({
    data: rows.map((r) => ({
      id: r.id,
      eventType: r.eventType,
      responseStatus: r.responseStatus,
      success: r.success,
      deliveredAt: r.deliveredAt.toISOString(),
    })),
  });
});

/* ---------------------------------------------------------- F12 Notifications */

router.get("/notification-rules", async (req: Request, res: Response) => {
  const catalystApp = initCatalystApp(req);
  const rows = await createNotificationRulesRepo(catalystApp).listAll();
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
  const catalystApp = initCatalystApp(req);
  const row = await createNotificationRulesRepo(catalystApp).create({
    commanderId: actor.username,
    ruleName: b.rule_name,
    triggerEvent: b.trigger_event,
    triggerConditions: (b.trigger_conditions ?? null) as Record<string, unknown> | null,
    channel: b.channel ?? "in_app",
    isActive: b.is_active ?? true,
  });
  await logSettingsChange(req, {
    module: "notification_rules",
    settingKey: b.rule_name,
    entityId: String(row.id),
    action: "create",
    oldValue: null,
    newValue: { ruleName: b.rule_name, triggerEvent: b.trigger_event, channel: row.channel },
    actor: actor.username,
  });
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
  const actor = getActor(req);
  const catalystApp = initCatalystApp(req);
  const rulesRepo = createNotificationRulesRepo(catalystApp);
  const prior = await rulesRepo.getById(id);
  const row = await rulesRepo.update(id, {
    ruleName: b.rule_name,
    triggerEvent: b.trigger_event,
    triggerConditions: (b.trigger_conditions ?? null) as Record<string, unknown> | null,
    channel: b.channel ?? undefined,
    isActive: b.is_active ?? undefined,
  });
  if (!row) throw notFound("Rule not found");
  await logSettingsChange(req, {
    module: "notification_rules",
    settingKey: b.rule_name,
    entityId: String(id),
    action: "update",
    oldValue: prior ? { ruleName: prior.ruleName, triggerEvent: prior.triggerEvent, channel: prior.channel } : null,
    newValue: { ruleName: row.ruleName, triggerEvent: row.triggerEvent, channel: row.channel },
    actor: actor.username,
  });
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
  const actor = getActor(req);
  const catalystApp = initCatalystApp(req);
  const rulesRepo = createNotificationRulesRepo(catalystApp);
  const prior = await rulesRepo.getById(id);
  await rulesRepo.delete(id);
  if (prior) {
    await logSettingsChange(req, {
      module: "notification_rules",
      settingKey: prior.ruleName,
      entityId: String(id),
      action: "delete",
      oldValue: { ruleName: prior.ruleName, triggerEvent: prior.triggerEvent, channel: prior.channel },
      newValue: null,
      actor: actor.username,
    });
  }
  res.json({ message: "Rule deleted" });
});

router.get("/notifications", async (req: Request, res: Response) => {
  const unack = req.query.unacknowledged === "true";
  const catalystApp = initCatalystApp(req);
  const rows = await createNotificationLogRepo(catalystApp).list(unack, 100);
  res.json({
    data: rows.map((r) => ({
      id: r.id,
      dealId: r.dealId,
      channel: r.channel,
      subject: r.subject,
      message: r.message,
      sentAt: r.sentAt.toISOString(),
      acknowledgedAt: r.acknowledgedAt ? r.acknowledgedAt.toISOString() : null,
    })),
  });
});

router.post("/notifications/:id/ack", async (req: Request, res: Response) => {
  const id = String(req.params.id);
  const catalystApp = initCatalystApp(req);
  await createNotificationLogRepo(catalystApp).acknowledge(id);
  res.json({ message: "Acknowledged" });
});

/* -------------------------------------------------------- F16 Custom fields/tags */

router.get("/custom-fields", async (req: Request, res: Response) => {
  const catalystApp = initCatalystApp(req);
  const rows = await createCustomFieldDefinitionsRepo(catalystApp).listAll();
  res.json({ data: rows });
});

router.post("/custom-fields", async (req: Request, res: Response) => {
  const b = CreateCustomFieldBody.parse(req.body);
  const actor = getActor(req);
  const catalystApp = initCatalystApp(req);
  const row = await createCustomFieldDefinitionsRepo(catalystApp).create({
    fieldName: b.field_name,
    fieldKey: b.field_key,
    fieldType: b.field_type,
    options: b.options ?? null,
    isRequired: b.is_required ?? false,
    displayOrder: b.display_order ?? 0,
    createdBy: actor.username,
  });
  res.status(201).json({ data: row });
});

router.get("/deals/:dealId/custom-fields", async (req: Request, res: Response) => {
  const { dealId } = GetDealCustomFieldsParams.parse(req.params);
  const catalystApp = initCatalystApp(req);
  const values = await createCustomFieldValuesRepo(catalystApp).listForDeal(dealId);
  res.json({ data: { values } });
});

router.put("/deals/:dealId/custom-fields/:fieldId", async (req: Request, res: Response) => {
  const { dealId, fieldId } = SetDealCustomFieldParams.parse(req.params);
  const b = SetDealCustomFieldBody.parse(req.body);
  const catalystApp = initCatalystApp(req);
  await createCustomFieldValuesRepo(catalystApp).upsert({
    dealId,
    fieldId,
    valueText: b.value_text ?? null,
    valueNumber: b.value_number ?? null,
    valueDate: b.value_date ?? null,
    valueSelect: b.value_select ?? null,
    valueMultiSelect: b.value_multi_select ?? null,
  });
  res.json({ message: "Saved" });
});

router.get("/tags", async (req: Request, res: Response) => {
  const catalystApp = initCatalystApp(req);
  const rows = await createTagDefinitionsRepo(catalystApp).listAll();
  res.json({ data: rows });
});

router.post("/tags", async (req: Request, res: Response) => {
  const b = CreateTagBody.parse(req.body);
  const catalystApp = initCatalystApp(req);
  const row = await createTagDefinitionsRepo(catalystApp).create(b.tag_name, b.color);
  res.status(201).json({ data: row });
});

// Delete a tag definition outright. Data Store has no native FK cascade, so
// deal_tags associations are cleared explicitly first — same behaviour the
// original ON DELETE CASCADE + defensive transaction produced.
router.delete("/tags/:tagId", async (req: Request, res: Response) => {
  const { tagId } = DeleteTagParams.parse(req.params);
  const catalystApp = initCatalystApp(req);
  const dealTagsRepo = createDealTagsRepo(catalystApp);
  await dealTagsRepo.removeAllForTag(tagId);
  await createTagDefinitionsRepo(catalystApp).delete(tagId);
  res.json({ message: "Tag deleted" });
});

router.get("/deals/:dealId/tags", async (req: Request, res: Response) => {
  const { dealId } = GetDealTagsParams.parse(req.params);
  const catalystApp = initCatalystApp(req);
  const rows = await createDealTagsRepo(catalystApp).listForDeal(dealId);
  res.json({ data: rows });
});

router.post("/deals/:dealId/tags/:tagId", async (req: Request, res: Response) => {
  const { dealId, tagId } = ApplyDealTagParams.parse(req.params);
  const catalystApp = initCatalystApp(req);
  await createDealTagsRepo(catalystApp).apply(dealId, tagId);
  res.json({ message: "Tag applied" });
});

router.delete("/deals/:dealId/tags/:tagId", async (req: Request, res: Response) => {
  const { dealId, tagId } = RemoveDealTagParams.parse(req.params);
  const catalystApp = initCatalystApp(req);
  await createDealTagsRepo(catalystApp).remove(dealId, tagId);
  res.json({ message: "Tag removed" });
});

/* ------------------------------------------------------------- F5/F6 Memory */

function memoryOut(r: DealMemoryRow) {
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
    archivedAt: r.archivedAt.toISOString(),
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
    autopsyCompletedAt: r.autopsyCompletedAt ? r.autopsyCompletedAt.toISOString() : null,
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

router.get("/memory", async (req: Request, res: Response) => {
  const catalystApp = initCatalystApp(req);
  const rows = await createDealMemoryRepo(catalystApp).listAll();
  const sorted = [...rows].sort((a, b) => b.archivedAt.getTime() - a.archivedAt.getTime()).slice(0, 200);
  res.json({ data: sorted.map(memoryOut) });
});

// Search scoring/highlighting lives in lib/memory-search.ts so it can be unit
// tested without Data Store — see that file for why the field list and the
// snippet source are deliberately different, and what broke when they weren't.

router.get("/memory/search", async (req: Request, res: Response) => {
  const q = SearchDealMemoryQueryParams.parse(req.query);
  const term = (q.q ?? "").trim();
  const catalystApp = initCatalystApp(req);
  const all = await createDealMemoryRepo(catalystApp).listAll();

  let candidates = all;
  // deal_memory.deal_id is unique, so this always resolves to at most one row.
  if (q.dealId) candidates = candidates.filter((r) => r.dealId === q.dealId);
  if (q.outcome) candidates = candidates.filter((r) => r.outcome === q.outcome);
  if (q.competitor) candidates = candidates.filter((r) => r.competitorsFaced?.includes(q.competitor as string));
  if (q.pricingModel) candidates = candidates.filter((r) => r.pricingModel === q.pricingModel);
  if (q.servicesTier) candidates = candidates.filter((r) => r.servicesTier === q.servicesTier);
  if (q.minTcv != null) candidates = candidates.filter((r) => (r.finalTcv ?? 0) >= q.minTcv!);
  if (q.maxTcv != null) candidates = candidates.filter((r) => (r.finalTcv ?? 0) <= q.maxTcv!);
  if (q.archivedFrom) {
    const from = new Date(q.archivedFrom).getTime();
    candidates = candidates.filter((r) => r.archivedAt.getTime() >= from);
  }
  if (q.archivedTo) {
    const to = new Date(q.archivedTo).getTime();
    candidates = candidates.filter((r) => r.archivedAt.getTime() <= to);
  }
  if (q.hasNarrative === true) candidates = candidates.filter((r) => !!r.winLossNarrative);

  let list: { row: DealMemoryRow; snippet: string | null }[];
  if (term) {
    list = candidates
      .map((row) => ({ row, score: memorySearchScore(row, term) }))
      .filter((x) => x.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, 50)
      .map(({ row }) => ({ row, snippet: buildSnippet(memorySnippetText(row), term) }));
  } else {
    list = [...candidates]
      .sort((a, b) => b.archivedAt.getTime() - a.archivedAt.getTime())
      .slice(0, 50)
      .map((row) => ({ row, snippet: null }));
  }

  res.json({ data: list.map(({ row, snippet }) => ({ ...memoryOut(row), snippet })) });
});

router.get("/memory/facets", async (req: Request, res: Response) => {
  const catalystApp = initCatalystApp(req);
  const rows = await createDealMemoryRepo(catalystApp).listAll();

  const bump = (m: Map<string, number>, k: string | null | undefined) => {
    if (!k) return;
    m.set(k, (m.get(k) ?? 0) + 1);
  };
  const outcomes = new Map<string, number>();
  const pricingModels = new Map<string, number>();
  const servicesTiers = new Map<string, number>();
  const competitorCounts = new Map<string, number>();
  for (const r of rows) {
    bump(outcomes, r.outcome);
    bump(pricingModels, r.pricingModel);
    bump(servicesTiers, r.servicesTier);
    for (const c of r.competitorsFaced ?? []) bump(competitorCounts, c);
  }
  const toList = (m: Map<string, number>) =>
    [...m.entries()].map(([value, count]) => ({ value, count })).sort((a, b) => b.count - a.count);

  res.json({
    data: {
      outcomes: toList(outcomes),
      pricingModels: toList(pricingModels),
      servicesTiers: toList(servicesTiers),
      competitors: toList(competitorCounts),
      total: rows.length,
    },
  });
});

router.get("/memory/ask", async (req: Request, res: Response) => {
  const { q } = AskDealMemoryQueryParams.parse(req.query);
  const catalystApp = initCatalystApp(req);
  const memory = await createDealMemoryRepo(catalystApp).listAll();
  if (memory.length === 0) return res.json({ data: composeNoDataAnswer() });

  const knownCompetitors = [...new Set(memory.flatMap((m) => m.competitorsFaced ?? []))];
  const intent = classifyAdvisorIntent(q, knownCompetitors);
  const cite = (rows: DealMemoryRow[]): AdvisorCitation[] =>
    rows.slice(0, 5).map((r) => ({ id: r.id, dealName: r.dealName, accountName: r.accountName }));
  const asMemoryRow = (r: DealMemoryRow): MemoryRow => ({
    id: r.id,
    outcome: r.outcome,
    finalTcv: r.finalTcv != null ? String(r.finalTcv) : null,
    totalDaysActive: r.totalDaysActive,
    competitorsFaced: r.competitorsFaced,
    pricingModel: r.pricingModel,
    servicesTier: r.servicesTier,
    primaryLossCategory: r.primaryLossCategory,
  });

  if (intent.type === "competitive") {
    const intel = computeCompetitorIntel(memory.map(asMemoryRow)).find((c) => c.name === intent.competitor);
    const encounters = memory.filter((m) => m.competitorsFaced?.includes(intent.competitor));
    if (!intel) return res.json({ data: composeNoDataAnswer() });
    const citations = cite(encounters);
    const answer = {
      answer: `Against ${intel.name}, the historical win rate is ${intel.winRatePct}% across ${intel.encounterCount} archived encounters.${intel.topLossCategory ? ` The most common loss reason is "${intel.topLossCategory}".` : ""}`,
      confidence: confidenceFor(citations.length),
      citations,
    };
    return res.json({ data: intel.lowConfidence ? withLowSampleCaveat(answer, intel.encounterCount) : answer });
  }

  if (intent.type === "pricing") {
    const won = memory.filter((m) => m.outcome === "Won" && (m.finalTcv ?? 0) > 0);
    if (won.length === 0) return res.json({ data: composeNoDataAnswer() });
    const median = percentiles(won.map((m) => m.finalTcv ?? 0)).median;
    const citations = cite(won);
    const answer = {
      answer: `Across ${won.length} won archived deals, the median total contract value is $${Math.round(median).toLocaleString("en-US")}. Check the Pricing tab for percentile breakdowns filtered by pricing model or services tier.`,
      confidence: confidenceFor(citations.length),
      citations,
    };
    return res.json({ data: won.length < 3 ? withLowSampleCaveat(answer, won.length) : answer });
  }

  if (intent.type === "biggest") {
    const sorted = [...memory].sort((a, b) => (b.finalTcv ?? 0) - (a.finalTcv ?? 0)).slice(0, 3);
    const citations = cite(sorted);
    if (citations.length === 0) return res.json({ data: composeNoDataAnswer() });
    const top = sorted[0];
    return res.json({
      data: {
        answer: `The largest archived deal is ${top.dealName} (${top.accountName}) at $${Math.round(top.finalTcv ?? 0).toLocaleString("en-US")}, outcome: ${top.outcome}.`,
        confidence: confidenceFor(citations.length),
        citations,
      },
    });
  }

  // fulltext fallback — reuse the same in-memory search as /memory/search.
  const matches = memory
    .map((row) => ({ row, score: memorySearchScore(row, q) }))
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, 3)
    .map((x) => x.row);
  if (matches.length === 0) return res.json({ data: composeNoDataAnswer() });
  const lessons = matches.flatMap((r) => r.keyLessons ?? []).slice(0, 5);
  return res.json({
    data: {
      answer: lessons.length > 0
        ? `The closest archived matches surfaced these lessons: ${lessons.join("; ")}.`
        : `The closest archived matches are cited below — no structured lessons were captured for them yet.`,
      confidence: confidenceFor(matches.length),
      citations: matches.map((r) => ({ id: r.id, dealName: r.dealName, accountName: r.accountName })),
    },
  });
});

router.get("/memory/similar/:dealId", async (req: Request, res: Response) => {
  const { dealId } = GetSimilarDealsParams.parse(req.params);
  const catalystApp = initCatalystApp(req);
  const [deal, pricingModelList, all] = await Promise.all([
    createEnterpriseDealsRepo(catalystApp).getById(dealId),
    createPricingModelsRepo(catalystApp).listAll(),
    createDealMemoryRepo(catalystApp).listAll(),
  ]);
  if (!deal) throw notFound("Deal not found");
  const pricingModelName = pricingModelList.find((p) => p.id === deal.pricingModelId)?.modelName ?? "";
  // Compare like with like: `dealMemory.finalTcv` is written via calculateFlatTCV
  // (term-multiplied for Multi-Year Committed deals), so deriving this deal's
  // side from raw productRevenue alone would mis-scale a multi-year deal by its
  // term and stop it from matching correctly-sized archived deals.
  const tcv = calculateFlatTCV({
    productRevenue: Number(deal.productRevenue) || 0,
    servicesRevenue: Number(deal.servicesRevenue) || 0,
    contractTermYears: deal.contractTermYears,
    pricingModel: pricingModelName,
  });
  const similar = all.filter((m) => {
    if (m.accountName === deal.accountName) return true;
    const mt = m.finalTcv ?? 0;
    return tcv > 0 && Math.abs(mt - tcv) / tcv <= 0.5;
  });
  res.json({ data: similar.slice(0, 10).map(memoryOut) });
});

router.get("/memory/compare", async (req: Request, res: Response) => {
  const { ids } = CompareDealMemoryQueryParams.parse(req.query);
  const idList = new Set(ids.split(",").map((s) => s.trim()).filter(Boolean).slice(0, 4));
  if (idList.size === 0) return res.json({ data: [] });
  const catalystApp = initCatalystApp(req);
  const all = await createDealMemoryRepo(catalystApp).listAll();
  const rows = all.filter((r) => idList.has(r.id));
  return res.json({ data: rows.map(memoryOut) });
});

// Literal route — MUST stay above "/memory/:id" so it isn't captured as an id.
router.get("/memory/revival-candidates", async (req: Request, res: Response) => {
  const catalystApp = initCatalystApp(req);
  const { thresholds } = await getThresholds(catalystApp);
  const cfg = {
    minWinBack: num(thresholds, "revival_min_win_back", 3),
    cooloffDays: num(thresholds, "revival_cooloff_days", 60),
    maxAgeDays: num(thresholds, "revival_max_age_days", 365),
  };
  const all = await createDealMemoryRepo(catalystApp).listAll();
  const rows = all.filter((r) => r.outcome === "Lost");

  const candidates = selectRevivalCandidates(
    rows.map((r) => ({
      id: r.id,
      dealId: r.dealId,
      accountName: r.accountName,
      dealName: r.dealName,
      outcome: r.outcome,
      finalTcv: r.finalTcv,
      winBackPotential: r.winBackPotential,
      winBackTimeline: r.winBackTimeline,
      primaryLossCategory: r.primaryLossCategory,
      archivedAt: r.archivedAt,
    })),
    cfg,
    Date.now(),
  );
  res.json({ data: candidates });
});

router.get("/memory/:id", async (req: Request, res: Response) => {
  const { id } = GetDealMemoryParams.parse(req.params);
  const catalystApp = initCatalystApp(req);
  const row = await createDealMemoryRepo(catalystApp).getById(id);
  if (!row) throw notFound("Memory not found");
  res.json({ data: memoryOut(row) });
});

router.put("/memory/:id", async (req: Request, res: Response) => {
  const { id } = UpdateDealMemoryParams.parse(req.params);
  const b = UpdateDealMemoryBody.parse(req.body);
  const catalystApp = initCatalystApp(req);
  const memoryRepo = createDealMemoryRepo(catalystApp);

  const existing = await memoryRepo.getById(id);
  if (!existing) throw notFound("Memory not found");

  // `"x" in b` (not `b.x ?? existing.x`) so an explicit null CLEARS a field.
  // `??` treats an explicit null the same as "field omitted" and silently
  // falls back to the existing value — so a narrative/category/competitor/
  // timeline, once set, could never be unset again. Presence-checking the
  // key distinguishes "omitted → keep existing" from "sent null → clear".
  const merged = {
    primaryLossCategory: "primary_loss_category" in b ? (b.primary_loss_category ?? null) : existing.primaryLossCategory,
    lossSubcategory: "loss_subcategory" in b ? (b.loss_subcategory ?? null) : existing.lossSubcategory,
    lossNarrative: "loss_narrative" in b ? (b.loss_narrative ?? null) : existing.lossNarrative,
    winningCompetitorId: "winning_competitor_id" in b ? (b.winning_competitor_id ?? null) : existing.winningCompetitorId,
    winBackPotential: b.win_back_potential ?? existing.winBackPotential,
    winBackTimeline: "win_back_timeline" in b ? (b.win_back_timeline ?? null) : existing.winBackTimeline,
    causalChain: b.causal_chain ?? existing.causalChain,
    decisionMakerEngaged: b.decision_maker_engaged ?? existing.decisionMakerEngaged,
    championIdentified: b.champion_identified ?? existing.championIdentified,
    productGaps: b.product_gaps ?? existing.productGaps,
  };
  const isAutopsyUpdate = Object.keys(b).some((k) => k !== "win_loss_narrative" && k !== "key_lessons" && k !== "tags");
  const qualityScore = computeAutopsyQualityScore(merged);
  // Only stamp autopsyCompletedAt (and fire the activity event) when the save
  // actually captured something — an autopsy body with every field blank/
  // cleared used to still mark the autopsy "complete" and inflate the Loss
  // Dashboard's autopsyCompletenessPct.
  const autopsyCaptured = isAutopsyUpdate && qualityScore > 0;

  const row = await memoryRepo.update(id, {
    ...(b.win_loss_narrative !== undefined ? { winLossNarrative: b.win_loss_narrative } : {}),
    ...(b.key_lessons !== undefined ? { keyLessons: b.key_lessons } : {}),
    ...(b.tags !== undefined ? { tags: b.tags } : {}),
    ...merged,
    qualityScore,
    ...(autopsyCaptured ? { autopsyCompletedAt: new Date() } : {}),
  });
  if (!row) throw notFound("Memory not found");
  if (autopsyCaptured) {
    emitDealEvent("deal.autopsy_captured", {
      dealId: row.dealId,
      actor: getActor(req).displayName,
      qualityScore: row.qualityScore ?? 0,
      catalystApp,
    });
  }
  res.json({ data: memoryOut(row) });
});

void badRequest;

export default router;
