// Repository for the subset of edc_v2 / edc_v2_intel tables (schema/edc_v2.ts,
// schema/edc_v2_intel.ts) that the deal-core intelligence engine and its
// direct dependents (lib/intelligence.ts, lib/competitive.ts,
// lib/contextual-alerts.ts, lib/playbook-signals.ts, routes/deals.ts search,
// routes/v2/crud.ts) read or write. See docs/CATALYST_SCHEMA.md.

import {
  fetchAllRows,
  insertRow,
  updateRow,
  deleteRow,
  parseBoolean,
  formatBoolean,
  parseNullableNumber,
  parseCatalystDateTime,
  formatCatalystDateTime,
  toJson,
  fromJson,
  isDuplicateValueError,
  type CatalystApp,
  type RawRow,
} from "../sdk";
import { SNAPSHOT_BUCKET, putJsonObject, getJsonObject } from "../stratus";

const TABLE = {
  dealCompetitors: "v2_deal_competitors",
  stakeholders: "v2_stakeholders",
  dealDecisions: "v2_deal_decisions",
  meetingSessions: "v2_meeting_sessions",
  webhooks: "v2_webhooks",
  webhookDeliveryLog: "v2_webhook_delivery_log",
  notificationRules: "v2_notification_rules",
  notificationLog: "v2_notification_log",
  customFieldDefinitions: "v2_custom_field_definitions",
  customFieldValues: "v2_custom_field_values",
  dealTags: "v2_deal_tags",
  tagDefinitions: "v2_tag_definitions",
  velocityBenchmarks: "v2_velocity_benchmarks",
  playbooks: "v2_playbooks",
  playbookSteps: "v2_playbook_steps",
  playbookStepCompletions: "v2_playbook_step_completions",
  dealPlaybookAssignments: "v2_deal_playbook_assignments",
  dealPricingSchedule: "v2_deal_pricing_schedule",
  financialScenarios: "v2_financial_scenarios",
  customRiskPatterns: "v2_custom_risk_patterns",
  customPatternConditions: "v2_custom_pattern_conditions",
  pipelineTargets: "v2_pipeline_targets",
  scoringModelWeights: "v2_scoring_model_weights",
  dealScores: "v2_deal_scores",
  dealMemory: "v2_deal_memory",
  dealActivityLog: "v2_deal_activity_log",
  dealSnapshots: "v2_deal_snapshots",
  dealHealthHistory: "v2_deal_health_history",
  pipelineTransitions: "v2_pipeline_transitions",
  commanderAchievements: "v2_commander_achievements",
} as const;


function optDate(raw: string | null | undefined): Date | null {
  return raw ? parseCatalystDateTime(raw) : null;
}

/**
 * Above this, a snapshot payload is written to Stratus instead of inline.
 *
 * Data Store caps a `text` column at 10,000 chars. 9,800 leaves the same
 * multi-byte margin Periscope's `INLINE_THRESHOLD` uses
 * (docs/catalyst-datastore-constraints.md) â€” `.length` counts UTF-16 units,
 * and the cap is applied to the stored bytes.
 *
 * Exported so a test can lower it and exercise the offload without having to
 * synthesize a 10KB payload.
 */
export const SNAPSHOT_PAYLOAD_LIMIT = 9_800;

// -------------------------------------------------------------- Deal competitors (F2)

export interface DealCompetitorLink {
  id: string;
  dealId: string;
  competitorId: number;
  status: string;
  displacementStrategy: string | null;
  outcomeNotes: string | null;
}

function rowToDealCompetitorLink(r: RawRow): DealCompetitorLink {
  return {
    id: r["id"],
    dealId: r["deal_id"],
    competitorId: Number(r["competitor_id"]),
    status: r["status"],
    displacementStrategy: r["displacement_strategy"] || null,
    outcomeNotes: r["outcome_notes"] || null,
  };
}

export function createDealCompetitorsRepo(catalystApp: CatalystApp) {
  return {
    async list(dealId: string): Promise<DealCompetitorLink[]> {
      const rows = await fetchAllRows(catalystApp, TABLE.dealCompetitors);
      return rows.filter((r) => r["deal_id"] === dealId).map(rowToDealCompetitorLink);
    },
    /** Every deal<->competitor link, for the global win-rate tally (competitorWinRates). */
    async listAll(): Promise<DealCompetitorLink[]> {
      const rows = await fetchAllRows(catalystApp, TABLE.dealCompetitors);
      return rows.map(rowToDealCompetitorLink);
    },
    async getById(id: string): Promise<DealCompetitorLink | null> {
      const rows = await fetchAllRows(catalystApp, TABLE.dealCompetitors);
      const row = rows.find((r) => r["id"] === id);
      return row ? rowToDealCompetitorLink(row) : null;
    },
    /** Insert-if-missing (mirrors the original `onConflictDoNothing` on deal_competitor_uq) â€” never updates an existing link. */
    async createIfMissing(dealId: string, competitorId: number, status = "Active"): Promise<void> {
      const naturalKey = `${dealId}:${competitorId}`;
      const rows = await fetchAllRows(catalystApp, TABLE.dealCompetitors);
      if (rows.some((r) => r["natural_key"] === naturalKey)) return;
      const now = formatCatalystDateTime(new Date());
      try {
        await insertRow(catalystApp, TABLE.dealCompetitors, {
          id: crypto.randomUUID(),
          deal_id: dealId,
          competitor_id: String(competitorId),
          status,
          logged_at: now,
          updated_at: now,
          natural_key: naturalKey,
        });
      } catch (err) {
        // Raced insert against the same natural key â€” matches onConflictDoNothing.
        if (!isDuplicateValueError(err)) throw err;
      }
    },
    /** The F2 "log a competitor on this deal" form â€” unlike createIfMissing, this always inserts (the route's own conflict handling, if any, is the caller's job). */
    async create(input: {
      dealId: string;
      competitorId: number;
      status?: string;
      displacementStrategy?: string | null;
      outcomeNotes?: string | null;
    }): Promise<DealCompetitorLink> {
      const now = formatCatalystDateTime(new Date());
      const created = await insertRow(catalystApp, TABLE.dealCompetitors, {
        id: crypto.randomUUID(),
        deal_id: input.dealId,
        competitor_id: String(input.competitorId),
        status: input.status ?? "Active",
        displacement_strategy: input.displacementStrategy ?? null,
        outcome_notes: input.outcomeNotes ?? null,
        logged_at: now,
        updated_at: now,
        natural_key: `${input.dealId}:${input.competitorId}`,
      });
      return rowToDealCompetitorLink(created);
    },
    async update(
      id: string,
      updates: { status?: string; displacementStrategy?: string | null; outcomeNotes?: string | null },
    ): Promise<DealCompetitorLink | null> {
      const rows = await fetchAllRows(catalystApp, TABLE.dealCompetitors);
      const existing = rows.find((r) => r["id"] === id);
      if (!existing) return null;
      const values: Record<string, unknown> = { updated_at: formatCatalystDateTime(new Date()) };
      if (updates.status !== undefined) values["status"] = updates.status;
      if (updates.displacementStrategy !== undefined) values["displacement_strategy"] = updates.displacementStrategy;
      if (updates.outcomeNotes !== undefined) values["outcome_notes"] = updates.outcomeNotes;
      const updated = await updateRow(catalystApp, TABLE.dealCompetitors, existing["ROWID"], values);
      return rowToDealCompetitorLink(updated);
    },
    async delete(id: string): Promise<void> {
      const rows = await fetchAllRows(catalystApp, TABLE.dealCompetitors);
      const existing = rows.find((r) => r["id"] === id);
      if (existing) await deleteRow(catalystApp, TABLE.dealCompetitors, existing["ROWID"]);
    },
  };
}

// -------------------------------------------------------------- Stakeholders (F8, full CRUD)

export interface StakeholderRow {
  id: string;
  dealId: string;
  name: string;
  title: string | null;
  company: string | null;
  roleType: string;
  influenceLevel: string;
  sentiment: string;
  email: string | null;
  phone: string | null;
  notes: string | null;
  reportsToId: string | null;
  isDecisionMaker: boolean;
}

function rowToStakeholder(r: RawRow): StakeholderRow {
  return {
    id: r["id"],
    dealId: r["deal_id"],
    name: r["name"],
    title: r["title"] || null,
    company: r["company"] || null,
    roleType: r["role_type"],
    influenceLevel: r["influence_level"],
    sentiment: r["sentiment"],
    email: r["email"] || null,
    phone: r["phone"] || null,
    notes: r["notes"] || null,
    reportsToId: r["reports_to_id"] || null,
    isDecisionMaker: parseBoolean(r["is_decision_maker"]),
  };
}

export interface StakeholderInput {
  name: string;
  title?: string | null;
  company?: string | null;
  roleType: string;
  influenceLevel: string;
  sentiment: string;
  email?: string | null;
  phone?: string | null;
  notes?: string | null;
  reportsToId?: string | null;
  isDecisionMaker?: boolean;
}

export function createStakeholdersRepo(catalystApp: CatalystApp) {
  return {
    async list(dealId: string): Promise<StakeholderRow[]> {
      const rows = await fetchAllRows(catalystApp, TABLE.stakeholders);
      return rows.filter((r) => r["deal_id"] === dealId).map(rowToStakeholder);
    },
    /** Every stakeholder across every deal â€” used only for the deal-roster free-text search. */
    async listAll(): Promise<StakeholderRow[]> {
      const rows = await fetchAllRows(catalystApp, TABLE.stakeholders);
      return rows.map(rowToStakeholder);
    },
    async create(dealId: string, input: StakeholderInput): Promise<StakeholderRow> {
      const now = formatCatalystDateTime(new Date());
      const created = await insertRow(catalystApp, TABLE.stakeholders, {
        id: crypto.randomUUID(),
        deal_id: dealId,
        name: input.name,
        title: input.title ?? null,
        company: input.company ?? null,
        role_type: input.roleType,
        influence_level: input.influenceLevel,
        sentiment: input.sentiment,
        email: input.email ?? null,
        phone: input.phone ?? null,
        notes: input.notes ?? null,
        reports_to_id: input.reportsToId ?? null,
        is_decision_maker: formatBoolean(input.isDecisionMaker ?? false),
        created_at: now,
        updated_at: now,
      });
      return rowToStakeholder(created);
    },
    async update(id: string, input: StakeholderInput): Promise<StakeholderRow | null> {
      const rows = await fetchAllRows(catalystApp, TABLE.stakeholders);
      const existing = rows.find((r) => r["id"] === id);
      if (!existing) return null;
      const updated = await updateRow(catalystApp, TABLE.stakeholders, existing["ROWID"], {
        name: input.name,
        title: input.title ?? null,
        company: input.company ?? null,
        role_type: input.roleType,
        influence_level: input.influenceLevel,
        sentiment: input.sentiment,
        email: input.email ?? null,
        phone: input.phone ?? null,
        notes: input.notes ?? null,
        reports_to_id: input.reportsToId ?? null,
        is_decision_maker: formatBoolean(input.isDecisionMaker ?? false),
        updated_at: formatCatalystDateTime(new Date()),
      });
      return rowToStakeholder(updated);
    },
    async delete(id: string): Promise<void> {
      const rows = await fetchAllRows(catalystApp, TABLE.stakeholders);
      const existing = rows.find((r) => r["id"] === id);
      if (existing) await deleteRow(catalystApp, TABLE.stakeholders, existing["ROWID"]);
    },
  };
}

// -------------------------------------------------------------- Deal decisions (F9, full CRUD)

export interface DealDecisionRow {
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
}

function rowToDealDecision(r: RawRow): DealDecisionRow {
  return {
    id: r["id"],
    dealId: r["deal_id"],
    meetingSessionId: r["meeting_session_id"] || null,
    decisionText: r["decision_text"],
    rationale: r["rationale"] || null,
    owner: r["owner"],
    status: r["status"],
    decidedAt: parseCatalystDateTime(r["decided_at"]),
    dueDate: r["due_date"] || null,
    completedAt: r["completed_at"] ? parseCatalystDateTime(r["completed_at"]) : null,
  };
}

export function createDealDecisionsRepo(catalystApp: CatalystApp) {
  return {
    async list(dealId: string): Promise<DealDecisionRow[]> {
      const rows = await fetchAllRows(catalystApp, TABLE.dealDecisions);
      return rows
        .filter((r) => r["deal_id"] === dealId)
        .map(rowToDealDecision)
        .sort((a, b) => b.decidedAt.getTime() - a.decidedAt.getTime());
    },
    /** Every decision across every deal â€” used only for the deal-roster free-text search. */
    async listAll(): Promise<DealDecisionRow[]> {
      const rows = await fetchAllRows(catalystApp, TABLE.dealDecisions);
      return rows.map(rowToDealDecision);
    },
    async getById(id: string): Promise<DealDecisionRow | null> {
      const rows = await fetchAllRows(catalystApp, TABLE.dealDecisions);
      const row = rows.find((r) => r["id"] === id);
      return row ? rowToDealDecision(row) : null;
    },
    async create(input: {
      dealId: string;
      decisionText: string;
      rationale?: string | null;
      owner: string;
      decidedAt?: string | null;
      dueDate?: string | null;
      meetingSessionId?: string | null;
      commanderId: string;
    }): Promise<DealDecisionRow> {
      const now = formatCatalystDateTime(new Date());
      const created = await insertRow(catalystApp, TABLE.dealDecisions, {
        id: crypto.randomUUID(),
        deal_id: input.dealId,
        meeting_session_id: input.meetingSessionId ?? null,
        decision_text: input.decisionText,
        rationale: input.rationale ?? null,
        owner: input.owner,
        status: "Pending",
        decided_at: input.decidedAt ? formatCatalystDateTime(new Date(input.decidedAt)) : now,
        due_date: input.dueDate ?? null,
        commander_id: input.commanderId,
        created_at: now,
        updated_at: now,
      });
      return rowToDealDecision(created);
    },
    async update(
      id: string,
      updates: { status?: string; rationale?: string | null; dueDate?: string | null },
    ): Promise<DealDecisionRow | null> {
      const rows = await fetchAllRows(catalystApp, TABLE.dealDecisions);
      const existing = rows.find((r) => r["id"] === id);
      if (!existing) return null;
      const values: Record<string, unknown> = { updated_at: formatCatalystDateTime(new Date()) };
      if (updates.status !== undefined) values["status"] = updates.status;
      if (updates.rationale !== undefined) values["rationale"] = updates.rationale;
      if (updates.dueDate !== undefined) values["due_date"] = updates.dueDate;
      if (updates.status === "Completed") values["completed_at"] = formatCatalystDateTime(new Date());
      const updated = await updateRow(catalystApp, TABLE.dealDecisions, existing["ROWID"], values);
      return rowToDealDecision(updated);
    },
  };
}

// -------------------------------------------------------------- Meeting sessions (F9)

export interface MeetingSessionRow {
  id: string;
  sessionType: string;
  title: string | null;
  occurredAt: Date;
  durationMinutes: number | null;
  attendees: string[] | null;
  notes: string | null;
}

function rowToMeetingSession(r: RawRow): MeetingSessionRow {
  return {
    id: r["id"],
    sessionType: r["session_type"],
    title: r["title"] || null,
    occurredAt: parseCatalystDateTime(r["occurred_at"]),
    durationMinutes: parseNullableNumber(r["duration_minutes"]),
    attendees: r["attendees"] ? fromJson<string[]>(r["attendees"], []) : null,
    notes: r["notes"] || null,
  };
}

export function createMeetingSessionsRepo(catalystApp: CatalystApp) {
  return {
    async listAll(): Promise<MeetingSessionRow[]> {
      const rows = await fetchAllRows(catalystApp, TABLE.meetingSessions);
      return rows.map(rowToMeetingSession).sort((a, b) => b.occurredAt.getTime() - a.occurredAt.getTime());
    },
    async create(input: {
      sessionType: string;
      title?: string | null;
      occurredAt: string;
      durationMinutes?: number | null;
      attendees?: string[] | null;
      notes?: string | null;
      commanderId: string;
    }): Promise<MeetingSessionRow> {
      const created = await insertRow(catalystApp, TABLE.meetingSessions, {
        id: crypto.randomUUID(),
        session_type: input.sessionType,
        title: input.title ?? null,
        occurred_at: formatCatalystDateTime(new Date(input.occurredAt)),
        duration_minutes: input.durationMinutes ?? null,
        attendees: input.attendees ? toJson(input.attendees) : null,
        notes: input.notes ?? null,
        commander_id: input.commanderId,
        created_at: formatCatalystDateTime(new Date()),
      });
      return rowToMeetingSession(created);
    },
  };
}

// -------------------------------------------------------------- Webhooks (F1)

export interface WebhookRow {
  id: string;
  webhookName: string;
  targetUrl: string;
  secretKey: string;
  events: string[];
  isActive: boolean;
  createdBy: string;
  createdAt: Date;
  lastTriggeredAt: Date | null;
  failureCount: number;
}

function rowToWebhook(r: RawRow): WebhookRow {
  return {
    id: r["id"],
    webhookName: r["webhook_name"],
    targetUrl: r["target_url"],
    secretKey: r["secret_key"],
    events: fromJson<string[]>(r["events"], []),
    isActive: parseBoolean(r["is_active"]),
    createdBy: r["created_by"],
    createdAt: parseCatalystDateTime(r["created_at"]),
    lastTriggeredAt: r["last_triggered_at"] ? parseCatalystDateTime(r["last_triggered_at"]) : null,
    failureCount: Number(r["failure_count"]) || 0,
  };
}

export function createWebhooksRepo(catalystApp: CatalystApp) {
  return {
    async listAll(): Promise<WebhookRow[]> {
      const rows = await fetchAllRows(catalystApp, TABLE.webhooks);
      return rows.map(rowToWebhook).sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
    },
    async getById(id: string): Promise<WebhookRow | null> {
      const rows = await fetchAllRows(catalystApp, TABLE.webhooks);
      const row = rows.find((r) => r["id"] === id);
      return row ? rowToWebhook(row) : null;
    },
    async create(input: {
      webhookName: string;
      targetUrl: string;
      secretKey: string;
      events: string[];
      isActive?: boolean;
      createdBy: string;
    }): Promise<WebhookRow> {
      const created = await insertRow(catalystApp, TABLE.webhooks, {
        id: crypto.randomUUID(),
        webhook_name: input.webhookName,
        target_url: input.targetUrl,
        secret_key: input.secretKey,
        events: toJson(input.events),
        is_active: formatBoolean(input.isActive ?? true),
        created_by: input.createdBy,
        created_at: formatCatalystDateTime(new Date()),
        failure_count: 0,
      });
      return rowToWebhook(created);
    },
    async update(
      id: string,
      updates: {
        webhookName?: string;
        targetUrl?: string;
        events?: string[];
        isActive?: boolean;
        secretKey?: string;
        failureCount?: number;
      },
    ): Promise<WebhookRow | null> {
      const rows = await fetchAllRows(catalystApp, TABLE.webhooks);
      const existing = rows.find((r) => r["id"] === id);
      if (!existing) return null;
      const values: Record<string, unknown> = {};
      if (updates.webhookName !== undefined) values["webhook_name"] = updates.webhookName;
      if (updates.targetUrl !== undefined) values["target_url"] = updates.targetUrl;
      if (updates.events !== undefined) values["events"] = toJson(updates.events);
      if (updates.isActive !== undefined) values["is_active"] = formatBoolean(updates.isActive);
      if (updates.secretKey !== undefined) values["secret_key"] = updates.secretKey;
      if (updates.failureCount !== undefined) values["failure_count"] = updates.failureCount;
      const updated = await updateRow(catalystApp, TABLE.webhooks, existing["ROWID"], values);
      return rowToWebhook(updated);
    },
    async delete(id: string): Promise<void> {
      const rows = await fetchAllRows(catalystApp, TABLE.webhooks);
      const existing = rows.find((r) => r["id"] === id);
      if (existing) await deleteRow(catalystApp, TABLE.webhooks, existing["ROWID"]);
    },
  };
}

export interface WebhookDeliveryRow {
  id: string;
  eventType: string;
  responseStatus: number | null;
  success: boolean;
  deliveredAt: Date;
}

/**
 * A failed delivery still owed a retry. This is the whole retry queue â€” there is
 * no separate table: a row is pending iff it failed AND carries a
 * `next_attempt_at` in the past. Drained by POST /api/v1/jobs/webhook-retries.
 */
export interface PendingWebhookRetryRow {
  id: string;
  webhookId: string;
  eventType: string;
  payload: Record<string, unknown>;
  attemptCount: number;
  nextAttemptAt: Date;
}

export function createWebhookDeliveryLogRepo(catalystApp: CatalystApp) {
  return {
    async listByWebhookId(webhookId: string, limit = 100): Promise<WebhookDeliveryRow[]> {
      const rows = await fetchAllRows(catalystApp, TABLE.webhookDeliveryLog);
      return rows
        .filter((r) => r["webhook_id"] === webhookId)
        .map((r) => ({
          id: r["id"],
          eventType: r["event_type"],
          responseStatus: parseNullableNumber(r["response_status"]),
          success: parseBoolean(r["success"]),
          deliveredAt: parseCatalystDateTime(r["delivered_at"]),
        }))
        .sort((a, b) => b.deliveredAt.getTime() - a.deliveredAt.getTime())
        .slice(0, limit);
    },
    /**
     * Every failed delivery whose retry is due at or before `now`, oldest first.
     *
     * Rows written before the retry columns existed have no `next_attempt_at`
     * and are therefore invisible here â€” correct, not a gap: they were logged
     * under the old in-memory retry scheme, which had already given up on them
     * by the time the process that owned the timer went away.
     */
    async listDueRetries(now: Date): Promise<PendingWebhookRetryRow[]> {
      const rows = await fetchAllRows(catalystApp, TABLE.webhookDeliveryLog);
      return rows
        .filter((r) => !parseBoolean(r["success"]) && !!r["next_attempt_at"])
        .map((r) => ({
          id: r["id"],
          webhookId: r["webhook_id"],
          eventType: r["event_type"],
          payload: fromJson<Record<string, unknown>>(r["payload"], {}),
          attemptCount: Number(r["attempt_count"]) || 1,
          nextAttemptAt: parseCatalystDateTime(r["next_attempt_at"]),
        }))
        .filter((r) => r.nextAttemptAt.getTime() <= now.getTime())
        .sort((a, b) => a.nextAttemptAt.getTime() - b.nextAttemptAt.getTime());
    },
    /**
     * Take a row out of the retry queue without touching its outcome â€” the log
     * stays an honest record of the attempt that failed; it just stops being
     * owed another try. Called once the drain has spawned the next attempt, so
     * a slow drain can never hand the same row out twice.
     */
    async clearRetry(id: string): Promise<void> {
      const rows = await fetchAllRows(catalystApp, TABLE.webhookDeliveryLog);
      const existing = rows.find((r) => r["id"] === id);
      if (!existing) return;
      await updateRow(catalystApp, TABLE.webhookDeliveryLog, existing["ROWID"], {
        next_attempt_at: null,
      });
    },
    async create(entry: {
      webhookId: string;
      eventType: string;
      payload: Record<string, unknown>;
      responseStatus: number | null;
      responseBody: string | null;
      success: boolean;
      attemptCount: number;
      /** Null when this attempt succeeded or the retry budget is spent. */
      nextAttemptAt: Date | null;
    }): Promise<void> {
      await insertRow(catalystApp, TABLE.webhookDeliveryLog, {
        id: crypto.randomUUID(),
        webhook_id: entry.webhookId,
        event_type: entry.eventType,
        payload: toJson(entry.payload),
        response_status: entry.responseStatus,
        response_body: entry.responseBody,
        success: formatBoolean(entry.success),
        delivered_at: formatCatalystDateTime(new Date()),
        attempt_count: entry.attemptCount,
        next_attempt_at: entry.nextAttemptAt ? formatCatalystDateTime(entry.nextAttemptAt) : null,
      });
    },
  };
}

// -------------------------------------------------------------- Notification rules + log (F12)

export interface NotificationRuleRow {
  id: string;
  ruleName: string;
  triggerEvent: string;
  triggerConditions: Record<string, unknown> | null;
  channel: string;
  isActive: boolean;
  createdBy: string;
}

function rowToNotificationRule(r: RawRow): NotificationRuleRow {
  return {
    id: r["id"],
    ruleName: r["rule_name"],
    triggerEvent: r["trigger_event"],
    triggerConditions: r["trigger_conditions"] ? fromJson<Record<string, unknown>>(r["trigger_conditions"], {}) : null,
    channel: r["channel"],
    isActive: parseBoolean(r["is_active"]),
    createdBy: r["commander_id"],
  };
}

export function createNotificationRulesRepo(catalystApp: CatalystApp) {
  return {
    async listAll(): Promise<NotificationRuleRow[]> {
      const rows = await fetchAllRows(catalystApp, TABLE.notificationRules);
      return rows.map(rowToNotificationRule);
    },
    async getById(id: string): Promise<NotificationRuleRow | null> {
      const rows = await fetchAllRows(catalystApp, TABLE.notificationRules);
      const row = rows.find((r) => r["id"] === id);
      return row ? rowToNotificationRule(row) : null;
    },
    async create(input: {
      commanderId: string;
      ruleName: string;
      triggerEvent: string;
      triggerConditions?: Record<string, unknown> | null;
      channel?: string;
      isActive?: boolean;
    }): Promise<NotificationRuleRow> {
      const created = await insertRow(catalystApp, TABLE.notificationRules, {
        id: crypto.randomUUID(),
        commander_id: input.commanderId,
        rule_name: input.ruleName,
        trigger_event: input.triggerEvent,
        trigger_conditions: input.triggerConditions != null ? toJson(input.triggerConditions) : null,
        channel: input.channel ?? "in_app",
        is_active: formatBoolean(input.isActive ?? true),
        created_at: formatCatalystDateTime(new Date()),
      });
      return rowToNotificationRule(created);
    },
    async update(
      id: string,
      updates: {
        ruleName?: string;
        triggerEvent?: string;
        triggerConditions?: Record<string, unknown> | null;
        channel?: string;
        isActive?: boolean;
      },
    ): Promise<NotificationRuleRow | null> {
      const rows = await fetchAllRows(catalystApp, TABLE.notificationRules);
      const existing = rows.find((r) => r["id"] === id);
      if (!existing) return null;
      const values: Record<string, unknown> = {};
      if (updates.ruleName !== undefined) values["rule_name"] = updates.ruleName;
      if (updates.triggerEvent !== undefined) values["trigger_event"] = updates.triggerEvent;
      if (updates.triggerConditions !== undefined)
        values["trigger_conditions"] = updates.triggerConditions != null ? toJson(updates.triggerConditions) : null;
      if (updates.channel !== undefined) values["channel"] = updates.channel;
      if (updates.isActive !== undefined) values["is_active"] = formatBoolean(updates.isActive);
      const updated = await updateRow(catalystApp, TABLE.notificationRules, existing["ROWID"], values);
      return rowToNotificationRule(updated);
    },
    async delete(id: string): Promise<void> {
      const rows = await fetchAllRows(catalystApp, TABLE.notificationRules);
      const existing = rows.find((r) => r["id"] === id);
      if (existing) await deleteRow(catalystApp, TABLE.notificationRules, existing["ROWID"]);
    },
  };
}

export interface NotificationLogRow {
  id: string;
  dealId: string | null;
  channel: string;
  subject: string | null;
  message: string;
  sentAt: Date;
  acknowledgedAt: Date | null;
}

export function createNotificationLogRepo(catalystApp: CatalystApp) {
  return {
    async list(onlyUnacknowledged: boolean, limit = 100): Promise<NotificationLogRow[]> {
      const rows = await fetchAllRows(catalystApp, TABLE.notificationLog);
      return rows
        .filter((r) => !onlyUnacknowledged || !r["acknowledged_at"])
        .map((r) => ({
          id: r["id"],
          dealId: r["deal_id"] || null,
          channel: r["channel"],
          subject: r["subject"] || null,
          message: r["message"],
          sentAt: parseCatalystDateTime(r["sent_at"]),
          acknowledgedAt: r["acknowledged_at"] ? parseCatalystDateTime(r["acknowledged_at"]) : null,
        }))
        .sort((a, b) => b.sentAt.getTime() - a.sentAt.getTime())
        .slice(0, limit);
    },
    async create(entry: {
      ruleId: string | null;
      dealId: string | null;
      channel: string;
      recipient: string | null;
      subject: string | null;
      message: string;
    }): Promise<void> {
      await insertRow(catalystApp, TABLE.notificationLog, {
        id: crypto.randomUUID(),
        rule_id: entry.ruleId,
        deal_id: entry.dealId,
        channel: entry.channel,
        recipient: entry.recipient,
        subject: entry.subject,
        message: entry.message,
        sent_at: formatCatalystDateTime(new Date()),
      });
    },
    async acknowledge(id: string): Promise<void> {
      const rows = await fetchAllRows(catalystApp, TABLE.notificationLog);
      const existing = rows.find((r) => r["id"] === id);
      if (existing) {
        await updateRow(catalystApp, TABLE.notificationLog, existing["ROWID"], {
          acknowledged_at: formatCatalystDateTime(new Date()),
        });
      }
    },
  };
}

// -------------------------------------------------------------- Custom fields (F16)

export interface CustomFieldDefinitionRow {
  id: string;
  fieldName: string;
  fieldKey: string;
  fieldType: string;
  options: string[] | null;
  isRequired: boolean;
  displayOrder: number;
}

export function createCustomFieldDefinitionsRepo(catalystApp: CatalystApp) {
  return {
    async listAll(): Promise<CustomFieldDefinitionRow[]> {
      const rows = await fetchAllRows(catalystApp, TABLE.customFieldDefinitions);
      return rows
        .map((r) => ({
          id: r["id"],
          fieldName: r["field_name"],
          fieldKey: r["field_key"],
          fieldType: r["field_type"],
          options: r["options"] ? fromJson<string[]>(r["options"], []) : null,
          isRequired: parseBoolean(r["is_required"]),
          displayOrder: Number(r["display_order"]) || 0,
        }))
        .sort((a, b) => a.displayOrder - b.displayOrder);
    },
    async create(input: {
      fieldName: string;
      fieldKey: string;
      fieldType: string;
      options?: string[] | null;
      isRequired?: boolean;
      displayOrder?: number;
      createdBy: string;
    }): Promise<CustomFieldDefinitionRow> {
      const created = await insertRow(catalystApp, TABLE.customFieldDefinitions, {
        id: crypto.randomUUID(),
        field_name: input.fieldName,
        field_key: input.fieldKey,
        field_type: input.fieldType,
        options: input.options ? toJson(input.options) : null,
        is_required: formatBoolean(input.isRequired ?? false),
        display_order: input.displayOrder ?? 0,
        created_by: input.createdBy,
        created_at: formatCatalystDateTime(new Date()),
      });
      return {
        id: created["id"],
        fieldName: created["field_name"],
        fieldKey: created["field_key"],
        fieldType: created["field_type"],
        options: created["options"] ? fromJson<string[]>(created["options"], []) : null,
        isRequired: parseBoolean(created["is_required"]),
        displayOrder: Number(created["display_order"]) || 0,
      };
    },
  };
}

export interface CustomFieldValueRow {
  id: string;
  dealId: string;
  fieldId: string;
  valueText: string | null;
  valueNumber: number | null;
  valueDate: string | null;
  valueSelect: string | null;
  valueMultiSelect: string[] | null;
}

function rowToCustomFieldValue(r: RawRow): CustomFieldValueRow {
  return {
    id: r["id"],
    dealId: r["deal_id"],
    fieldId: r["field_id"],
    valueText: r["value_text"] || null,
    valueNumber: parseNullableNumber(r["value_number"]),
    valueDate: r["value_date"] || null,
    valueSelect: r["value_select"] || null,
    valueMultiSelect: r["value_multi_select"] ? fromJson<string[]>(r["value_multi_select"], []) : null,
  };
}

export function createCustomFieldValuesRepo(catalystApp: CatalystApp) {
  return {
    async listForDeal(dealId: string): Promise<CustomFieldValueRow[]> {
      const rows = await fetchAllRows(catalystApp, TABLE.customFieldValues);
      return rows.filter((r) => r["deal_id"] === dealId).map(rowToCustomFieldValue);
    },
    /** Insert-or-update by (dealId, fieldId) â€” mirrors the original onConflictDoUpdate. */
    async upsert(input: {
      dealId: string;
      fieldId: string;
      valueText?: string | null;
      valueNumber?: number | null;
      valueDate?: string | null;
      valueSelect?: string | null;
      valueMultiSelect?: string[] | null;
    }): Promise<void> {
      const naturalKey = `${input.dealId}:${input.fieldId}`;
      const rows = await fetchAllRows(catalystApp, TABLE.customFieldValues);
      const existing = rows.find((r) => r["natural_key"] === naturalKey);
      const values = {
        value_text: input.valueText ?? null,
        value_number: input.valueNumber != null ? String(input.valueNumber) : null,
        value_date: input.valueDate ?? null,
        value_select: input.valueSelect ?? null,
        value_multi_select: input.valueMultiSelect ? toJson(input.valueMultiSelect) : null,
      };
      if (existing) {
        await updateRow(catalystApp, TABLE.customFieldValues, existing["ROWID"], values);
        return;
      }
      try {
        await insertRow(catalystApp, TABLE.customFieldValues, {
          id: crypto.randomUUID(),
          deal_id: input.dealId,
          field_id: input.fieldId,
          natural_key: naturalKey,
          ...values,
        });
      } catch (err) {
        if (!isDuplicateValueError(err)) throw err;
        const retryRows = await fetchAllRows(catalystApp, TABLE.customFieldValues);
        const retryExisting = retryRows.find((r) => r["natural_key"] === naturalKey);
        if (retryExisting) await updateRow(catalystApp, TABLE.customFieldValues, retryExisting["ROWID"], values);
      }
    },
  };
}

// -------------------------------------------------------------- Tags (F16, full CRUD)

export interface TagDefinitionRow {
  id: string;
  tagName: string;
  color: string;
}

export function createTagDefinitionsRepo(catalystApp: CatalystApp) {
  return {
    async listAll(): Promise<TagDefinitionRow[]> {
      const rows = await fetchAllRows(catalystApp, TABLE.tagDefinitions);
      return rows
        .map((r) => ({ id: r["id"], tagName: r["tag_name"], color: r["color"] }))
        .sort((a, b) => a.tagName.localeCompare(b.tagName));
    },
    async create(tagName: string, color: string): Promise<TagDefinitionRow> {
      const created = await insertRow(catalystApp, TABLE.tagDefinitions, {
        id: crypto.randomUUID(),
        tag_name: tagName,
        color,
        created_at: formatCatalystDateTime(new Date()),
      });
      return { id: created["id"], tagName: created["tag_name"], color: created["color"] };
    },
    /** Delete a tag definition. Callers must clear deal_tags associations first â€” Data Store has no native FK cascade (see createDealTagsRepo.removeAllForTag). */
    async delete(id: string): Promise<void> {
      const rows = await fetchAllRows(catalystApp, TABLE.tagDefinitions);
      const existing = rows.find((r) => r["id"] === id);
      if (existing) await deleteRow(catalystApp, TABLE.tagDefinitions, existing["ROWID"]);
    },
  };
}

export interface DealTagView {
  id: string;
  tagName: string;
  color: string;
}

export function createDealTagsRepo(catalystApp: CatalystApp) {
  return {
    /** Tags applied to a single deal. */
    async listForDeal(dealId: string): Promise<DealTagView[]> {
      const map = await this.listForDeals([dealId]);
      return map.get(dealId) ?? [];
    },
    /** Tags applied to a set of deals, batched â€” mirrors the roster's single joined query. */
    async listForDeals(dealIds: string[]): Promise<Map<string, DealTagView[]>> {
      const dealIdSet = new Set(dealIds);
      const [links, defs] = await Promise.all([
        fetchAllRows(catalystApp, TABLE.dealTags),
        fetchAllRows(catalystApp, TABLE.tagDefinitions),
      ]);
      const defById = new Map(defs.map((d) => [d["id"], { id: d["id"], tagName: d["tag_name"], color: d["color"] }]));
      const out = new Map<string, DealTagView[]>();
      for (const link of links) {
        if (!dealIdSet.has(link["deal_id"])) continue;
        const def = defById.get(link["tag_id"]);
        if (!def) continue;
        const list = out.get(link["deal_id"]) ?? [];
        list.push(def);
        out.set(link["deal_id"], list);
      }
      return out;
    },
    /** Insert-if-missing (mirrors the original `onConflictDoNothing` on deal_tag_pk). */
    async apply(dealId: string, tagId: string): Promise<void> {
      const naturalKey = `${dealId}:${tagId}`;
      const rows = await fetchAllRows(catalystApp, TABLE.dealTags);
      if (rows.some((r) => r["natural_key"] === naturalKey)) return;
      try {
        await insertRow(catalystApp, TABLE.dealTags, {
          id: crypto.randomUUID(),
          deal_id: dealId,
          tag_id: tagId,
          applied_at: formatCatalystDateTime(new Date()),
          natural_key: naturalKey,
        });
      } catch (err) {
        if (!isDuplicateValueError(err)) throw err;
      }
    },
    async remove(dealId: string, tagId: string): Promise<void> {
      const rows = await fetchAllRows(catalystApp, TABLE.dealTags);
      const existing = rows.find((r) => r["deal_id"] === dealId && r["tag_id"] === tagId);
      if (existing) await deleteRow(catalystApp, TABLE.dealTags, existing["ROWID"]);
    },
    /** Explicit cascade: clear every deal_tags row for a tag before its definition is deleted (no native FK cascade in Data Store). */
    async removeAllForTag(tagId: string): Promise<void> {
      const rows = await fetchAllRows(catalystApp, TABLE.dealTags);
      for (const row of rows.filter((r) => r["tag_id"] === tagId)) {
        await deleteRow(catalystApp, TABLE.dealTags, row["ROWID"]);
      }
    },
  };
}

// -------------------------------------------------------------- Velocity benchmarks (F4, read-only)

export function createVelocityBenchmarksRepo(catalystApp: CatalystApp) {
  return {
    async getMedianDaysForStage(stageName: string): Promise<number | null> {
      const rows = await fetchAllRows(catalystApp, TABLE.velocityBenchmarks);
      const row = rows.find((r) => r["stage_name"] === stageName);
      return row ? parseNullableNumber(row["median_days"]) : null;
    },
  };
}

// -------------------------------------------------------------- Playbooks catalog (F11, read-only in this pass)

export interface PlaybookRow {
  id: string;
  playbookName: string;
  description: string | null;
  applicableStage: string | null;
  isActive: boolean;
}

export interface PlaybookStepRow {
  id: string;
  playbookId: string;
  stepOrder: number;
  stepName: string;
  description: string | null;
  triggerCondition: string | null;
  recommendedAction: string;
  expectedDurationDays: number | null;
  isCritical: boolean;
}

function rowToPlaybook(r: RawRow): PlaybookRow {
  return {
    id: r["id"],
    playbookName: r["playbook_name"],
    description: r["description"] || null,
    applicableStage: r["applicable_stage"] || null,
    isActive: parseBoolean(r["is_active"]),
  };
}

export interface CreatePlaybookInput {
  playbookName: string;
  description?: string | null;
  applicableStage?: string | null;
  isActive?: boolean;
  createdBy: string;
}

export function createPlaybooksRepo(catalystApp: CatalystApp) {
  return {
    async listActive(): Promise<PlaybookRow[]> {
      const rows = await fetchAllRows(catalystApp, TABLE.playbooks);
      return rows.filter((r) => parseBoolean(r["is_active"])).map(rowToPlaybook);
    },
    /**
     * Every playbook, active or not â€” the original Drizzle join in
     * `supersedeStalePlaybookAssignments` never filtered on `is_active`, so a
     * since-deactivated playbook's existing assignment can still be superseded.
     */
    async listAll(): Promise<PlaybookRow[]> {
      const rows = await fetchAllRows(catalystApp, TABLE.playbooks);
      return rows.map(rowToPlaybook).sort((a, b) => a.playbookName.localeCompare(b.playbookName));
    },
    async getById(id: string): Promise<PlaybookRow | null> {
      const rows = await fetchAllRows(catalystApp, TABLE.playbooks);
      const row = rows.find((r) => r["id"] === id);
      return row ? rowToPlaybook(row) : null;
    },
    async create(input: CreatePlaybookInput): Promise<PlaybookRow> {
      const now = formatCatalystDateTime(new Date());
      const created = await insertRow(catalystApp, TABLE.playbooks, {
        id: crypto.randomUUID(),
        playbook_name: input.playbookName,
        description: input.description ?? null,
        applicable_stage: input.applicableStage ?? null,
        is_active: formatBoolean(input.isActive ?? true),
        created_by: input.createdBy,
        created_at: now,
      });
      return rowToPlaybook(created);
    },
    async update(
      id: string,
      updates: { playbookName?: string; description?: string | null; applicableStage?: string | null; isActive?: boolean },
    ): Promise<PlaybookRow | null> {
      const rows = await fetchAllRows(catalystApp, TABLE.playbooks);
      const existing = rows.find((r) => r["id"] === id);
      if (!existing) return null;
      const values: Record<string, unknown> = {};
      if (updates.playbookName !== undefined) values["playbook_name"] = updates.playbookName;
      if (updates.description !== undefined) values["description"] = updates.description;
      if (updates.applicableStage !== undefined) values["applicable_stage"] = updates.applicableStage;
      if (updates.isActive !== undefined) values["is_active"] = formatBoolean(updates.isActive);
      const updated = await updateRow(catalystApp, TABLE.playbooks, existing["ROWID"], values);
      return rowToPlaybook(updated);
    },
    async delete(id: string): Promise<void> {
      const rows = await fetchAllRows(catalystApp, TABLE.playbooks);
      const existing = rows.find((r) => r["id"] === id);
      if (existing) await deleteRow(catalystApp, TABLE.playbooks, existing["ROWID"]);
    },
  };
}

export interface PlaybookStepInput {
  stepOrder: number;
  stepName: string;
  description?: string | null;
  triggerCondition?: string | null;
  recommendedAction: string;
  expectedDurationDays?: number | null;
  isCritical?: boolean;
}

export function createPlaybookStepsRepo(catalystApp: CatalystApp) {
  return {
    async listByPlaybookId(playbookId: string): Promise<PlaybookStepRow[]> {
      const rows = await fetchAllRows(catalystApp, TABLE.playbookSteps);
      return rows
        .filter((r) => r["playbook_id"] === playbookId)
        .map((r) => ({
          id: r["id"],
          playbookId: r["playbook_id"],
          stepOrder: Number(r["step_order"]),
          stepName: r["step_name"],
          description: r["description"] || null,
          triggerCondition: r["trigger_condition"] || null,
          recommendedAction: r["recommended_action"],
          expectedDurationDays: parseNullableNumber(r["expected_duration_days"]),
          isCritical: parseBoolean(r["is_critical"]),
        }))
        .sort((a, b) => a.stepOrder - b.stepOrder);
    },
    /** Replace every step of a playbook â€” mirrors the original delete-all-then-insert semantics. */
    async replaceForPlaybook(playbookId: string, steps: PlaybookStepInput[]): Promise<void> {
      const rows = await fetchAllRows(catalystApp, TABLE.playbookSteps);
      for (const row of rows.filter((r) => r["playbook_id"] === playbookId)) {
        await deleteRow(catalystApp, TABLE.playbookSteps, row["ROWID"]);
      }
      for (const s of steps) {
        await insertRow(catalystApp, TABLE.playbookSteps, {
          id: crypto.randomUUID(),
          playbook_id: playbookId,
          step_order: s.stepOrder,
          step_name: s.stepName,
          description: s.description ?? null,
          trigger_condition: s.triggerCondition ?? null,
          recommended_action: s.recommendedAction,
          expected_duration_days: s.expectedDurationDays ?? null,
          is_critical: formatBoolean(s.isCritical ?? false),
          natural_key: `${playbookId}:${s.stepOrder}`,
        });
      }
    },
  };
}

// -------------------------------------------------------------- Playbook step completions (read-only in this pass)

export interface PlaybookStepCompletionRow {
  stepId: string;
  status: string | null;
  skipped: boolean;
  notes: string | null;
  skipReason: string | null;
  completedAt: Date | null;
  completedBy: string | null;
}

export function createPlaybookStepCompletionsRepo(catalystApp: CatalystApp) {
  return {
    async listByAssignmentId(assignmentId: string): Promise<PlaybookStepCompletionRow[]> {
      const rows = await fetchAllRows(catalystApp, TABLE.playbookStepCompletions);
      return rows
        .filter((r) => r["assignment_id"] === assignmentId)
        .map((r) => ({
          stepId: r["step_id"],
          status: r["status"] || null,
          skipped: parseBoolean(r["skipped"]),
          notes: r["notes"] || null,
          skipReason: r["skip_reason"] || null,
          completedAt: optDate(r["completed_at"]),
          // Added for the MEDDPICC playbook-gate sync (lib/catalyst/meddpicc-playbook-gate.ts):
          // it must only reopen a step the SYSTEM_ACTOR itself auto-completed, never a rep's
          // manual completion â€” additive field, existing callers are unaffected.
          completedBy: r["completed_by"] || null,
        }));
    },
    /**
     * Set a step's action state â€” mirrors the original delete-then-insert
     * (one ledger row per step, replaced wholesale on every action).
     */
    async upsertForStep(input: {
      assignmentId: string;
      stepId: string;
      status: string;
      note: string | null;
      completedBy: string;
    }): Promise<void> {
      const rows = await fetchAllRows(catalystApp, TABLE.playbookStepCompletions);
      for (const row of rows.filter(
        (r) => r["assignment_id"] === input.assignmentId && r["step_id"] === input.stepId,
      )) {
        await deleteRow(catalystApp, TABLE.playbookStepCompletions, row["ROWID"]);
      }
      await insertRow(catalystApp, TABLE.playbookStepCompletions, {
        id: crypto.randomUUID(),
        assignment_id: input.assignmentId,
        step_id: input.stepId,
        completed_at: formatCatalystDateTime(new Date()),
        status: input.status,
        skipped: formatBoolean(input.status === "skipped"),
        notes: input.note,
        skip_reason: input.status === "skipped" ? input.note : null,
        completed_by: input.completedBy,
      });
    },
    /** Reopen a step â€” remove its action so it returns to "not started". */
    async deleteForStep(assignmentId: string, stepId: string): Promise<void> {
      const rows = await fetchAllRows(catalystApp, TABLE.playbookStepCompletions);
      for (const row of rows.filter(
        (r) => r["assignment_id"] === assignmentId && r["step_id"] === stepId,
      )) {
        await deleteRow(catalystApp, TABLE.playbookStepCompletions, row["ROWID"]);
      }
    },
  };
}

// -------------------------------------------------------------- Deal playbook assignments (F11, full CRUD)

export interface DealPlaybookAssignment {
  id: string;
  dealId: string;
  playbookId: string;
  currentStepId: string | null;
  status: string;
  assignedAt: Date;
  completedAt: Date | null;
}

function rowToAssignment(r: RawRow): DealPlaybookAssignment {
  return {
    id: r["id"],
    dealId: r["deal_id"],
    playbookId: r["playbook_id"],
    currentStepId: r["current_step_id"] || null,
    status: r["status"],
    assignedAt: parseCatalystDateTime(r["assigned_at"]),
    completedAt: optDate(r["completed_at"]),
  };
}

export function createDealPlaybookAssignmentsRepo(catalystApp: CatalystApp) {
  return {
    async list(dealId: string): Promise<DealPlaybookAssignment[]> {
      const rows = await fetchAllRows(catalystApp, TABLE.dealPlaybookAssignments);
      return rows.filter((r) => r["deal_id"] === dealId).map(rowToAssignment);
    },
    /** Every assignment across every deal â€” used by the next-actions dashboard and the engagement achievement check. */
    async listAll(): Promise<DealPlaybookAssignment[]> {
      const rows = await fetchAllRows(catalystApp, TABLE.dealPlaybookAssignments);
      return rows.map(rowToAssignment);
    },
    async getById(id: string): Promise<DealPlaybookAssignment | null> {
      const rows = await fetchAllRows(catalystApp, TABLE.dealPlaybookAssignments);
      const row = rows.find((r) => r["id"] === id);
      return row ? rowToAssignment(row) : null;
    },
    async getByDealAndPlaybook(dealId: string, playbookId: string): Promise<DealPlaybookAssignment | null> {
      const naturalKey = `${dealId}:${playbookId}`;
      const rows = await fetchAllRows(catalystApp, TABLE.dealPlaybookAssignments);
      const row = rows.find((r) => r["natural_key"] === naturalKey);
      return row ? rowToAssignment(row) : null;
    },
    async create(input: { dealId: string; playbookId: string; currentStepId: string | null }): Promise<DealPlaybookAssignment> {
      const now = formatCatalystDateTime(new Date());
      const created = await insertRow(catalystApp, TABLE.dealPlaybookAssignments, {
        id: crypto.randomUUID(),
        deal_id: input.dealId,
        playbook_id: input.playbookId,
        current_step_id: input.currentStepId,
        status: "Active",
        assigned_at: now,
        natural_key: `${input.dealId}:${input.playbookId}`,
      });
      return rowToAssignment(created);
    },
    async update(
      id: string,
      updates: { status?: string; currentStepId?: string | null; completedAt?: Date | null },
    ): Promise<void> {
      const rows = await fetchAllRows(catalystApp, TABLE.dealPlaybookAssignments);
      const existing = rows.find((r) => r["id"] === id);
      if (!existing) return;
      const values: Record<string, unknown> = {};
      if (updates.status !== undefined) values["status"] = updates.status;
      if (updates.currentStepId !== undefined) values["current_step_id"] = updates.currentStepId;
      if (updates.completedAt !== undefined)
        values["completed_at"] = updates.completedAt ? formatCatalystDateTime(updates.completedAt) : null;
      await updateRow(catalystApp, TABLE.dealPlaybookAssignments, existing["ROWID"], values);
    },
  };
}

// -------------------------------------------------------------- Deal pricing schedule (F13)

export interface PricingYearRow {
  yearNumber: number;
  productRevenue: number;
  servicesRevenue: number;
  discountPct: number;
}

export function createDealPricingScheduleRepo(catalystApp: CatalystApp) {
  return {
    async list(dealId: string): Promise<PricingYearRow[]> {
      const rows = await fetchAllRows(catalystApp, TABLE.dealPricingSchedule);
      return rows
        .filter((r) => r["deal_id"] === dealId)
        .map((r) => ({
          yearNumber: Number(r["year_number"]),
          productRevenue: Number(r["product_revenue"]) || 0,
          servicesRevenue: Number(r["services_revenue"]) || 0,
          discountPct: Number(r["discount_pct"]) || 0,
        }))
        .sort((a, b) => a.yearNumber - b.yearNumber);
    },
    /** Replace the full schedule for a deal â€” mirrors the original delete-all-then-insert semantics. */
    async replaceSet(
      dealId: string,
      years: { yearNumber: number; productRevenue: number; servicesRevenue: number; discountPct: number; notes?: string | null }[],
    ): Promise<void> {
      const rows = await fetchAllRows(catalystApp, TABLE.dealPricingSchedule);
      for (const row of rows.filter((r) => r["deal_id"] === dealId)) {
        await deleteRow(catalystApp, TABLE.dealPricingSchedule, row["ROWID"]);
      }
      for (const y of years) {
        await insertRow(catalystApp, TABLE.dealPricingSchedule, {
          id: crypto.randomUUID(),
          deal_id: dealId,
          year_number: y.yearNumber,
          product_revenue: String(y.productRevenue),
          services_revenue: String(y.servicesRevenue),
          discount_pct: String(y.discountPct),
          notes: y.notes ?? null,
          natural_key: `${dealId}:${y.yearNumber}`,
        });
      }
    },
  };
}

// -------------------------------------------------------------- Financial scenarios (F13)

export interface FinancialScenarioRow {
  id: string;
  scenarioName: string;
  description: string | null;
  dealId: string | null;
  isGlobal: boolean;
  modifications: unknown[];
  computedResults: Record<string, unknown> | null;
}

function rowToScenario(r: RawRow): FinancialScenarioRow {
  return {
    id: r["id"],
    scenarioName: r["scenario_name"],
    description: r["description"] || null,
    dealId: r["deal_id"] || null,
    isGlobal: parseBoolean(r["is_global"]),
    modifications: fromJson<unknown[]>(r["modifications"], []),
    computedResults: r["computed_results"] ? fromJson<Record<string, unknown>>(r["computed_results"], {}) : null,
  };
}

export function createFinancialScenariosRepo(catalystApp: CatalystApp) {
  return {
    async list(dealId?: string): Promise<FinancialScenarioRow[]> {
      const rows = await fetchAllRows(catalystApp, TABLE.financialScenarios);
      return rows.filter((r) => !dealId || r["deal_id"] === dealId).map(rowToScenario);
    },
    async create(input: {
      scenarioName: string;
      description?: string | null;
      dealId?: string | null;
      isGlobal?: boolean;
      modifications: unknown[];
      createdBy: string;
    }): Promise<FinancialScenarioRow> {
      const now = formatCatalystDateTime(new Date());
      const created = await insertRow(catalystApp, TABLE.financialScenarios, {
        id: crypto.randomUUID(),
        scenario_name: input.scenarioName,
        description: input.description ?? null,
        deal_id: input.dealId ?? null,
        is_global: formatBoolean(input.isGlobal ?? false),
        modifications: toJson(input.modifications),
        created_by: input.createdBy,
        created_at: now,
        updated_at: now,
      });
      return rowToScenario(created);
    },
    async delete(id: string): Promise<void> {
      const rows = await fetchAllRows(catalystApp, TABLE.financialScenarios);
      const existing = rows.find((r) => r["id"] === id);
      if (existing) await deleteRow(catalystApp, TABLE.financialScenarios, existing["ROWID"]);
    },
  };
}

// -------------------------------------------------------------- Custom risk patterns (F10)

export interface CustomRiskPatternRow {
  id: string;
  patternName: string;
  description: string | null;
  severity: string;
  weight: number;
  alertMessageTemplate: string;
  isActive: boolean;
  triggerCount: number;
}

export interface CustomPatternConditionRow {
  fieldPath: string;
  operator: string;
  comparisonValue: string;
  sortOrder: number;
}

function rowToCustomPattern(r: RawRow): CustomRiskPatternRow {
  return {
    id: r["id"],
    patternName: r["pattern_name"],
    description: r["description"] || null,
    severity: r["severity"],
    weight: Number(r["weight"]),
    alertMessageTemplate: r["alert_message_template"],
    isActive: parseBoolean(r["is_active"]),
    triggerCount: Number(r["trigger_count"]) || 0,
  };
}

export function createCustomRiskPatternsRepo(catalystApp: CatalystApp) {
  return {
    async listAll(): Promise<CustomRiskPatternRow[]> {
      const rows = await fetchAllRows(catalystApp, TABLE.customRiskPatterns);
      return rows.map(rowToCustomPattern);
    },
    async getById(id: string): Promise<CustomRiskPatternRow | null> {
      const rows = await fetchAllRows(catalystApp, TABLE.customRiskPatterns);
      const row = rows.find((r) => r["id"] === id);
      return row ? rowToCustomPattern(row) : null;
    },
    async create(input: {
      patternName: string;
      description?: string | null;
      severity: string;
      weight: number;
      alertMessageTemplate: string;
      isActive?: boolean;
      createdBy: string;
    }): Promise<CustomRiskPatternRow> {
      const now = formatCatalystDateTime(new Date());
      const created = await insertRow(catalystApp, TABLE.customRiskPatterns, {
        id: crypto.randomUUID(),
        pattern_name: input.patternName,
        description: input.description ?? null,
        severity: input.severity,
        weight: input.weight,
        alert_message_template: input.alertMessageTemplate,
        is_active: formatBoolean(input.isActive ?? true),
        created_by: input.createdBy,
        created_at: now,
        updated_at: now,
      });
      return rowToCustomPattern(created);
    },
    async update(
      id: string,
      updates: {
        patternName?: string;
        description?: string | null;
        severity?: string;
        weight?: number;
        alertMessageTemplate?: string;
        isActive?: boolean;
      },
    ): Promise<CustomRiskPatternRow | null> {
      const rows = await fetchAllRows(catalystApp, TABLE.customRiskPatterns);
      const existing = rows.find((r) => r["id"] === id);
      if (!existing) return null;
      const values: Record<string, unknown> = { updated_at: formatCatalystDateTime(new Date()) };
      if (updates.patternName !== undefined) values["pattern_name"] = updates.patternName;
      if (updates.description !== undefined) values["description"] = updates.description;
      if (updates.severity !== undefined) values["severity"] = updates.severity;
      if (updates.weight !== undefined) values["weight"] = updates.weight;
      if (updates.alertMessageTemplate !== undefined) values["alert_message_template"] = updates.alertMessageTemplate;
      if (updates.isActive !== undefined) values["is_active"] = formatBoolean(updates.isActive);
      const updated = await updateRow(catalystApp, TABLE.customRiskPatterns, existing["ROWID"], values);
      return rowToCustomPattern(updated);
    },
    async delete(id: string): Promise<void> {
      const rows = await fetchAllRows(catalystApp, TABLE.customRiskPatterns);
      const existing = rows.find((r) => r["id"] === id);
      if (existing) await deleteRow(catalystApp, TABLE.customRiskPatterns, existing["ROWID"]);
    },
  };
}

export function createCustomPatternConditionsRepo(catalystApp: CatalystApp) {
  return {
    async listByPatternId(patternId: string): Promise<CustomPatternConditionRow[]> {
      const rows = await fetchAllRows(catalystApp, TABLE.customPatternConditions);
      return rows
        .filter((r) => r["pattern_id"] === patternId)
        .map((r) => ({
          fieldPath: r["field_path"],
          operator: r["operator"],
          comparisonValue: r["comparison_value"],
          sortOrder: Number(r["sort_order"]),
        }))
        .sort((a, b) => a.sortOrder - b.sortOrder);
    },
    /** Replace all conditions for a pattern â€” mirrors the original delete-all-then-insert semantics. */
    async replaceForPattern(patternId: string, conditions: CustomPatternConditionRow[]): Promise<void> {
      const rows = await fetchAllRows(catalystApp, TABLE.customPatternConditions);
      for (const row of rows.filter((r) => r["pattern_id"] === patternId)) {
        await deleteRow(catalystApp, TABLE.customPatternConditions, row["ROWID"]);
      }
      for (const c of conditions) {
        await insertRow(catalystApp, TABLE.customPatternConditions, {
          id: crypto.randomUUID(),
          pattern_id: patternId,
          field_path: c.fieldPath,
          operator: c.operator,
          comparison_value: c.comparisonValue,
          sort_order: c.sortOrder,
          natural_key: `${patternId}:${c.sortOrder}`,
        });
      }
    },
  };
}

// -------------------------------------------------------------- Pipeline targets (config)

export interface PipelineTargetRow {
  id: string;
  periodType: string;
  periodStart: string;
  targetValue: number;
}

export function createPipelineTargetsRepo(catalystApp: CatalystApp) {
  return {
    async listAll(): Promise<PipelineTargetRow[]> {
      const rows = await fetchAllRows(catalystApp, TABLE.pipelineTargets);
      return rows
        .map((r) => ({
          id: r["id"],
          periodType: r["period_type"],
          periodStart: r["period_start"],
          targetValue: Number(r["target_value"]),
        }))
        .sort((a, b) => b.periodStart.localeCompare(a.periodStart));
    },
    /** Insert-or-update by (periodType, periodStart). Returns the row plus whether one already existed. */
    async upsert(
      periodType: string,
      periodStart: string,
      targetValue: number,
    ): Promise<{ row: PipelineTargetRow; prior: PipelineTargetRow | null }> {
      const naturalKey = `${periodType}:${periodStart}`;
      const rows = await fetchAllRows(catalystApp, TABLE.pipelineTargets);
      const existing = rows.find((r) => r["natural_key"] === naturalKey);
      const prior = existing
        ? {
            id: existing["id"],
            periodType: existing["period_type"],
            periodStart: existing["period_start"],
            targetValue: Number(existing["target_value"]),
          }
        : null;
      const now = formatCatalystDateTime(new Date());
      if (existing) {
        const updated = await updateRow(catalystApp, TABLE.pipelineTargets, existing["ROWID"], {
          target_value: String(targetValue),
          updated_at: now,
        });
        return {
          row: {
            id: updated["id"],
            periodType: updated["period_type"],
            periodStart: updated["period_start"],
            targetValue: Number(updated["target_value"]),
          },
          prior,
        };
      }
      const created = await insertRow(catalystApp, TABLE.pipelineTargets, {
        id: crypto.randomUUID(),
        period_type: periodType,
        period_start: periodStart,
        target_value: String(targetValue),
        updated_at: now,
        natural_key: naturalKey,
      });
      return {
        row: {
          id: created["id"],
          periodType: created["period_type"],
          periodStart: created["period_start"],
          targetValue: Number(created["target_value"]),
        },
        prior,
      };
    },
  };
}

// -------------------------------------------------------------- Scoring model weights (F3)

export interface ScoringWeightRow {
  featureId: string;
  calibratedWeight: number;
  calibrationDate: string;
}

export function createScoringModelWeightsRepo(catalystApp: CatalystApp) {
  return {
    /** Every calibration row, newest first â€” callers dedupe to "latest per featureId" themselves. */
    async listAll(): Promise<ScoringWeightRow[]> {
      const rows = await fetchAllRows(catalystApp, TABLE.scoringModelWeights);
      return rows
        .map((r) => ({
          featureId: r["feature_id"],
          calibratedWeight: Number(r["calibrated_weight"]),
          calibrationDate: r["calibration_date"],
        }))
        .sort((a, b) => b.calibrationDate.localeCompare(a.calibrationDate));
    },
    /** Append-only: always inserts a new calibration row (latest wins on read). */
    async append(featureId: string, calibratedWeight: number, calibrationDate: string): Promise<void> {
      await insertRow(catalystApp, TABLE.scoringModelWeights, {
        id: crypto.randomUUID(),
        feature_id: featureId,
        calibrated_weight: String(calibratedWeight),
        sample_size: 0,
        calibration_date: calibrationDate,
        created_at: formatCatalystDateTime(new Date()),
      });
    },
  };
}

// -------------------------------------------------------------- Deal scores (F3)

export function createDealScoresRepo(catalystApp: CatalystApp) {
  return {
    async append(input: { dealId: string; score: number; confidence: string; breakdown: unknown[] }): Promise<void> {
      await insertRow(catalystApp, TABLE.dealScores, {
        id: crypto.randomUUID(),
        deal_id: input.dealId,
        score: input.score,
        confidence: input.confidence,
        breakdown: toJson(input.breakdown),
        computed_at: formatCatalystDateTime(new Date()),
      });
    },
    /** Every score row across every deal, newest first â€” callers reduce to "latest per deal" (or "latest at/before a cutoff") themselves. */
    async listAll(): Promise<{ dealId: string; score: number; computedAt: Date }[]> {
      const rows = await fetchAllRows(catalystApp, TABLE.dealScores);
      return rows
        .map((r) => ({ dealId: r["deal_id"], score: Number(r["score"]), computedAt: parseCatalystDateTime(r["computed_at"]) }))
        .sort((a, b) => b.computedAt.getTime() - a.computedAt.getTime());
    },
  };
}

// -------------------------------------------------------------- Deal memory (F5/F6, full read + autopsy write)
//
// Writes here are limited to the F5/F6 "autopsy" fields (PUT /v2/memory/:id)
// â€” the auto-populated fields (outcome, finalTcv, stageDurations, etc.) are
// written only by the post-mortem subscriber, which is not migrated this
// pass (see lib/subscribers/post-mortem.ts, still Drizzle-backed).

export interface DealMemoryRow {
  id: string;
  dealId: string;
  accountName: string;
  dealName: string;
  outcome: string;
  finalTcv: number | null;
  pricingModel: string | null;
  servicesTier: string | null;
  totalGatesCompleted: number | null;
  totalBlockersEncountered: number | null;
  totalDaysActive: number | null;
  competitorsFaced: string[] | null;
  winLossNarrative: string | null;
  keyLessons: string[] | null;
  tags: string[] | null;
  archivedAt: Date;
  primaryLossCategory: string | null;
  lossSubcategory: string | null;
  lossNarrative: string | null;
  winningCompetitorId: number | null;
  winBackPotential: number | null;
  winBackTimeline: string | null;
  causalChain: string[] | null;
  decisionMakerEngaged: boolean | null;
  championIdentified: boolean | null;
  productGaps: string[] | null;
  qualityScore: number | null;
  autopsyCompletedAt: Date | null;
}

function rowToDealMemory(r: RawRow): DealMemoryRow {
  return {
    id: r["id"],
    dealId: r["deal_id"],
    accountName: r["account_name"],
    dealName: r["deal_name"],
    outcome: r["outcome"],
    finalTcv: r["final_tcv"] ? Number(r["final_tcv"]) : null,
    pricingModel: r["pricing_model"] || null,
    servicesTier: r["services_tier"] || null,
    totalGatesCompleted: parseNullableNumber(r["total_gates_completed"]),
    totalBlockersEncountered: parseNullableNumber(r["total_blockers_encountered"]),
    totalDaysActive: parseNullableNumber(r["total_days_active"]),
    competitorsFaced: r["competitors_faced"] ? fromJson<string[]>(r["competitors_faced"], []) : null,
    winLossNarrative: r["win_loss_narrative"] || null,
    keyLessons: r["key_lessons"] ? fromJson<string[]>(r["key_lessons"], []) : null,
    tags: r["tags"] ? fromJson<string[]>(r["tags"], []) : null,
    archivedAt: parseCatalystDateTime(r["archived_at"]),
    primaryLossCategory: r["primary_loss_category"] || null,
    lossSubcategory: r["loss_subcategory"] || null,
    lossNarrative: r["loss_narrative"] || null,
    winningCompetitorId: parseNullableNumber(r["winning_competitor_id"]),
    winBackPotential: parseNullableNumber(r["win_back_potential"]),
    winBackTimeline: r["win_back_timeline"] || null,
    causalChain: r["causal_chain"] ? fromJson<string[]>(r["causal_chain"], []) : null,
    decisionMakerEngaged: r["decision_maker_engaged"] != null && r["decision_maker_engaged"] !== ""
      ? parseBoolean(r["decision_maker_engaged"])
      : null,
    championIdentified: r["champion_identified"] != null && r["champion_identified"] !== ""
      ? parseBoolean(r["champion_identified"])
      : null,
    productGaps: r["product_gaps"] ? fromJson<string[]>(r["product_gaps"], []) : null,
    qualityScore: parseNullableNumber(r["quality_score"]),
    autopsyCompletedAt: r["autopsy_completed_at"] ? parseCatalystDateTime(r["autopsy_completed_at"]) : null,
  };
}

export function createDealMemoryRepo(catalystApp: CatalystApp) {
  return {
    /** Every deal_memory row with one of the given outcomes â€” used by lib/catalyst/competitive.ts and lib/catalyst/playbook-signals.ts. */
    async listByOutcomes(outcomes: string[]): Promise<{ dealId: string; outcome: string; finalTcv: number | null; pricingModel: string | null }[]> {
      const rows = await fetchAllRows(catalystApp, TABLE.dealMemory);
      const wanted = new Set(outcomes);
      return rows
        .filter((r) => wanted.has(r["outcome"]))
        .map((r) => ({
          dealId: r["deal_id"],
          outcome: r["outcome"],
          finalTcv: r["final_tcv"] ? Number(r["final_tcv"]) : null,
          pricingModel: r["pricing_model"] || null,
        }));
    },
    /** Every archived deal record â€” the F5/F6 routes do their own in-memory filter/sort/search over this (no ZCQL/tsvector; see docs/CATALYST_SCHEMA.md's "Known open items"). */
    async listAll(): Promise<DealMemoryRow[]> {
      const rows = await fetchAllRows(catalystApp, TABLE.dealMemory);
      return rows.map(rowToDealMemory);
    },
    async getById(id: string): Promise<DealMemoryRow | null> {
      const rows = await fetchAllRows(catalystApp, TABLE.dealMemory);
      const row = rows.find((r) => r["id"] === id);
      return row ? rowToDealMemory(row) : null;
    },
    /**
     * Insert-or-update by `deal_id` (natively `is_unique` in Data Store â€” see
     * docs/CATALYST_SCHEMA.md's natural-key table). Used by the post-mortem
     * subscriber on Closed-Won/Closed-Lost: refreshes every auto-populated
     * field on a re-close, but never touches the hand-curated autopsy fields
     * (winLossNarrative, tags, primaryLossCategory, ...) â€” matching the
     * original Drizzle `onConflictDoUpdate`'s field set exactly. Not built on
     * the shared `upsert()` sdk helper: that helper reuses one `values`
     * object for both branches, but `id` must be freshly generated on INSERT
     * and left completely untouched on UPDATE (regenerating it on every
     * re-close would silently change this row's identity out from under
     * anything that had linked to it).
     */
    async upsertByDealId(input: {
      dealId: string;
      accountName: string;
      dealName: string;
      outcome: string;
      finalTcv: number;
      pricingModel: string | null;
      servicesTier: string | null;
      totalGatesCompleted: number;
      totalBlockersEncountered: number;
      totalDaysActive: number;
      competitorsFaced: string[];
    }): Promise<void> {
      const shared = {
        account_name: input.accountName,
        deal_name: input.dealName,
        outcome: input.outcome,
        final_tcv: String(input.finalTcv),
        pricing_model: input.pricingModel,
        services_tier: input.servicesTier,
        total_gates_completed: input.totalGatesCompleted,
        total_blockers_encountered: input.totalBlockersEncountered,
        total_days_active: input.totalDaysActive,
        competitors_faced: toJson(input.competitorsFaced),
        archived_at: formatCatalystDateTime(new Date()),
      };
      const rows = await fetchAllRows(catalystApp, TABLE.dealMemory);
      const existing = rows.find((r) => r["deal_id"] === input.dealId);
      if (existing) {
        await updateRow(catalystApp, TABLE.dealMemory, existing["ROWID"], shared);
        return;
      }
      try {
        await insertRow(catalystApp, TABLE.dealMemory, {
          id: crypto.randomUUID(),
          deal_id: input.dealId,
          ...shared,
        });
      } catch (err) {
        // Raced insert against the same deal_id â€” retry as an update.
        if (!isDuplicateValueError(err)) throw err;
        const retryRows = await fetchAllRows(catalystApp, TABLE.dealMemory);
        const retryExisting = retryRows.find((r) => r["deal_id"] === input.dealId);
        if (retryExisting) await updateRow(catalystApp, TABLE.dealMemory, retryExisting["ROWID"], shared);
      }
    },
    /** Update the F5/F6 autopsy fields (plus the narrative/lessons/tags fields the same PUT allows editing). */
    async update(
      id: string,
      values: Partial<{
        winLossNarrative: string | null;
        keyLessons: string[] | null;
        tags: string[] | null;
        primaryLossCategory: string | null;
        lossSubcategory: string | null;
        lossNarrative: string | null;
        winningCompetitorId: number | null;
        winBackPotential: number | null;
        winBackTimeline: string | null;
        causalChain: string[] | null;
        decisionMakerEngaged: boolean | null;
        championIdentified: boolean | null;
        productGaps: string[] | null;
        qualityScore: number;
        autopsyCompletedAt: Date | null;
      }>,
    ): Promise<DealMemoryRow | null> {
      const rows = await fetchAllRows(catalystApp, TABLE.dealMemory);
      const existing = rows.find((r) => r["id"] === id);
      if (!existing) return null;
      const out: Record<string, unknown> = {};
      if ("winLossNarrative" in values) out["win_loss_narrative"] = values.winLossNarrative ?? null;
      if ("keyLessons" in values) out["key_lessons"] = values.keyLessons ? toJson(values.keyLessons) : null;
      if ("tags" in values) out["tags"] = values.tags ? toJson(values.tags) : null;
      if ("primaryLossCategory" in values) out["primary_loss_category"] = values.primaryLossCategory ?? null;
      if ("lossSubcategory" in values) out["loss_subcategory"] = values.lossSubcategory ?? null;
      if ("lossNarrative" in values) out["loss_narrative"] = values.lossNarrative ?? null;
      if ("winningCompetitorId" in values)
        out["winning_competitor_id"] = values.winningCompetitorId != null ? String(values.winningCompetitorId) : null;
      if ("winBackPotential" in values)
        out["win_back_potential"] = values.winBackPotential != null ? String(values.winBackPotential) : null;
      if ("winBackTimeline" in values) out["win_back_timeline"] = values.winBackTimeline ?? null;
      if ("causalChain" in values) out["causal_chain"] = values.causalChain ? toJson(values.causalChain) : null;
      if ("decisionMakerEngaged" in values)
        out["decision_maker_engaged"] = values.decisionMakerEngaged != null ? formatBoolean(values.decisionMakerEngaged) : null;
      if ("championIdentified" in values)
        out["champion_identified"] = values.championIdentified != null ? formatBoolean(values.championIdentified) : null;
      if ("productGaps" in values) out["product_gaps"] = values.productGaps ? toJson(values.productGaps) : null;
      if ("qualityScore" in values) out["quality_score"] = values.qualityScore;
      if ("autopsyCompletedAt" in values)
        out["autopsy_completed_at"] = values.autopsyCompletedAt ? formatCatalystDateTime(values.autopsyCompletedAt) : null;
      const updated = await updateRow(catalystApp, TABLE.dealMemory, existing["ROWID"], out);
      return rowToDealMemory(updated);
    },
  };
}

// -------------------------------------------------------------- Deal activity log (analytics: last-activity age)

export interface DealActivityLogRow {
  id: string;
  dealId: string;
  eventType: string;
  entityType: string;
  entityId: string | null;
  summary: string;
  metadata: Record<string, unknown> | null;
  actor: string;
  occurredAt: Date;
}

function rowToActivityLogEntry(r: RawRow): DealActivityLogRow {
  return {
    id: r["id"],
    dealId: r["deal_id"],
    eventType: r["event_type"],
    entityType: r["entity_type"],
    entityId: r["entity_id"] || null,
    summary: r["summary"],
    metadata: r["metadata"] ? fromJson<Record<string, unknown>>(r["metadata"], {}) : null,
    actor: r["actor"],
    occurredAt: parseCatalystDateTime(r["occurred_at"]),
  };
}

export interface WriteActivityLogEntry {
  dealId: string;
  eventType: string;
  entityType: string;
  entityId: string | null;
  summary: string;
  metadata: Record<string, unknown>;
  actor: string;
  occurredAt: Date;
}

export function createDealActivityLogRepo(catalystApp: CatalystApp) {
  return {
    /** Every activity-log row across every deal â€” callers (the analytics roster, /v2/activity, /v2/deals/:dealId/activity) each do their own filter/join/sort in JS. */
    async listAll(): Promise<DealActivityLogRow[]> {
      const rows = await fetchAllRows(catalystApp, TABLE.dealActivityLog);
      return rows.map(rowToActivityLogEntry);
    },
    async create(entry: WriteActivityLogEntry): Promise<void> {
      await insertRow(catalystApp, TABLE.dealActivityLog, {
        id: crypto.randomUUID(),
        deal_id: entry.dealId,
        event_type: entry.eventType,
        entity_type: entry.entityType,
        entity_id: entry.entityId,
        summary: entry.summary,
        metadata: toJson(entry.metadata),
        actor: entry.actor,
        occurred_at: formatCatalystDateTime(entry.occurredAt),
      });
    },
  };
}

// -------------------------------------------------------------- Deal snapshots (analytics: vital-signs baseline + trajectory)
//
// `payload` is split into `payload_inline` (text, <=10,000 chars) + `payload_key`
// (varchar, a Stratus object key for an offloaded payload too large to inline)
// â€” see docs/CATALYST_SCHEMA.md's "Large text fields" section. Wiring the
// actual Stratus read path is Slice 5 scope; until then this repo only reads
// `payload_inline`, matching every snapshot this app itself has ever written
// (Slice 3 doesn't write the offloaded path either).

export interface DealSnapshotRow {
  id: string;
  dealId: string;
  reason: string;
  triggerEvent: string | null;
  healthStatus: string;
  salesStageId: number | null;
  salesStage: string | null;
  calculatedTcv: number | null;
  normalizedTcv: number | null;
  payload: Record<string, unknown> | null;
  createdBy: string;
  snapshotAt: Date;
}

function rowToSnapshot(r: RawRow): DealSnapshotRow & { payloadKey: string | null } {
  return {
    id: r["id"],
    dealId: r["deal_id"],
    reason: r["reason"],
    triggerEvent: r["trigger_event"] || null,
    healthStatus: r["health_status"],
    salesStageId: parseNullableNumber(r["sales_stage_id"]),
    salesStage: r["sales_stage"] || null,
    calculatedTcv: parseNullableNumber(r["calculated_tcv"]),
    normalizedTcv: parseNullableNumber(r["normalized_tcv"]),
    payload: r["payload_inline"] ? fromJson<Record<string, unknown>>(r["payload_inline"], {}) : null,
    payloadKey: r["payload_key"] || null,
    createdBy: r["created_by"],
    snapshotAt: parseCatalystDateTime(r["snapshot_at"]),
  };
}

/**
 * Fill in payloads that live in Stratus rather than inline.
 *
 * This runs INSIDE the repository, on every method that returns snapshots,
 * rather than being a `hydrate()` helper callers must remember to call. A
 * caller that forgot would silently read `payload: null` and quietly lose a
 * trajectory point or undercount the vital-signs baseline â€” the exact
 * swallowed-failure shape that produced the missing `key_lessons` column, the
 * deal-list 500, and the portfolio-rollup waste. Correctness here should not
 * depend on remembering anything.
 *
 * Cost on the common path is **zero network calls**: nothing is fetched unless
 * a row actually carries a `payload_key`, and payloads only exceed
 * SNAPSHOT_PAYLOAD_LIMIT in the rare case the offload exists for.
 */
async function hydratePayloads(
  catalystApp: CatalystApp,
  rows: Array<DealSnapshotRow & { payloadKey: string | null }>,
): Promise<DealSnapshotRow[]> {
  const offloaded = rows.filter((r) => r.payload === null && r.payloadKey !== null);
  if (offloaded.length > 0) {
    await Promise.all(
      offloaded.map(async (row) => {
        row.payload = await getJsonObject<Record<string, unknown>>(
          catalystApp,
          SNAPSHOT_BUCKET,
          row.payloadKey as string,
        );
      }),
    );
  }
  return rows.map(({ payloadKey: _ignored, ...snapshot }) => snapshot);
}

export function createDealSnapshotsRepo(catalystApp: CatalystApp) {
  return {
    /** Every snapshot for one deal, oldest first â€” feeds the deal trajectory time series; /v2/deals/:dealId/snapshots re-sorts/filters/paginates its own copy. */
    async listByDealId(dealId: string): Promise<DealSnapshotRow[]> {
      const rows = await fetchAllRows(catalystApp, TABLE.dealSnapshots);
      return hydratePayloads(
        catalystApp,
        rows
          .filter((r) => r["deal_id"] === dealId)
          .map(rowToSnapshot)
          .sort((a, b) => a.snapshotAt.getTime() - b.snapshotAt.getTime()),
      );
    },
    async getById(id: string): Promise<DealSnapshotRow | null> {
      const rows = await fetchAllRows(catalystApp, TABLE.dealSnapshots);
      const row = rows.find((r) => r["id"] === id);
      if (!row) return null;
      return (await hydratePayloads(catalystApp, [rowToSnapshot(row)]))[0];
    },
    /**
     * The newest snapshot at or before `cutoff`, per deal in `dealIds` â€” the
     * in-memory equivalent of the original `SELECT DISTINCT ON (deal_id) ...
     * ORDER BY deal_id, snapshot_at DESC` query, restricted to the same
     * cutoff + deal-id-set filter (see /analytics/vital-signs's baseline).
     */
    async latestAtOrBeforePerDeal(dealIds: string[], cutoff: Date): Promise<DealSnapshotRow[]> {
      if (dealIds.length === 0) return [];
      const wanted = new Set(dealIds);
      const rows = await fetchAllRows(catalystApp, TABLE.dealSnapshots);
      const latestByDeal = new Map<string, DealSnapshotRow & { payloadKey: string | null }>();
      for (const raw of rows) {
        if (!wanted.has(raw["deal_id"])) continue;
        const snap = rowToSnapshot(raw);
        if (snap.snapshotAt.getTime() > cutoff.getTime()) continue;
        const existing = latestByDeal.get(snap.dealId);
        if (!existing || snap.snapshotAt.getTime() > existing.snapshotAt.getTime()) {
          latestByDeal.set(snap.dealId, snap);
        }
      }
      // Hydrated AFTER the per-deal reduction, not before: only the winning
      // snapshot per deal is ever fetched, so a deal with a long offloaded
      // history still costs exactly one object read.
      return hydratePayloads(catalystApp, [...latestByDeal.values()]);
    },
    /** The newest snapshot at or before `cutoff` for a single deal â€” the pipeline-transitions subscriber's tcvAtTransition lookup. */
    async latestAtOrBefore(dealId: string, cutoff: Date): Promise<DealSnapshotRow | null> {
      const rows = await this.latestAtOrBeforePerDeal([dealId], cutoff);
      return rows[0] ?? null;
    },
    /**
     * Insert a new snapshot, inline or offloaded depending on payload size.
     *
     * `payload_inline` has the same 10,000-char Data Store `text` cap as every
     * other Text column (docs/catalyst-datastore-constraints.md). Over
     * SNAPSHOT_PAYLOAD_LIMIT the payload goes to Stratus and the row carries a
     * `payload_key` instead; `hydratePayloads` above puts it back on read.
     *
     * The offload is threshold-triggered, NOT unconditional, and that is the
     * whole design. Sending every payload to Stratus would turn the vital-signs
     * baseline (one snapshot per open deal, every dashboard load) and the deal
     * trajectory (every snapshot for a deal) into N and M object reads, to fix
     * a cap that is almost never hit. The cap is the problem; the storage
     * location is not.
     *
     * Note what is deliberately NOT done: dropping or truncating an oversize
     * blob to keep the row. The payload is not decoration â€” three live features
     * read it:
     *   - the deal trajectory chart (gatePct/playbookPct/meddpiccPct,
     *     routes/v2/analytics.ts),
     *   - the vital-signs 7-day baseline RED-alert count (same file),
     *   - `snapshotFingerprint`, which is how the hourly cron decides a
     *     snapshot is unchanged. Lose the payload and the fingerprint differs
     *     every run, so the dedupe inverts into writing a duplicate row per
     *     deal per hour â€” exactly the bloat it exists to prevent.
     */
    async create(input: {
      dealId: string;
      reason: string;
      triggerEvent: string | null;
      healthStatus: string;
      salesStageId: number | null;
      salesStage: string | null;
      calculatedTcv: number;
      normalizedTcv: number;
      payload: Record<string, unknown>;
      createdBy: string;
    }): Promise<void> {
      const id = crypto.randomUUID();
      const serialized = toJson(input.payload);
      const offload = serialized.length > SNAPSHOT_PAYLOAD_LIMIT;

      let payloadKey: string | null = null;
      if (offload) {
        // Written BEFORE the row, so a Stratus failure aborts the insert rather
        // than leaving a row pointing at an object that was never stored.
        payloadKey = `deal-snapshots/${input.dealId}/${id}.json`;
        await putJsonObject(catalystApp, SNAPSHOT_BUCKET, payloadKey, serialized);
      }

      await insertRow(catalystApp, TABLE.dealSnapshots, {
        id,
        deal_id: input.dealId,
        reason: input.reason,
        trigger_event: input.triggerEvent,
        health_status: input.healthStatus,
        sales_stage_id: input.salesStageId != null ? String(input.salesStageId) : null,
        sales_stage: input.salesStage,
        calculated_tcv: input.calculatedTcv,
        normalized_tcv: input.normalizedTcv,
        payload_inline: offload ? null : serialized,
        payload_key: payloadKey,
        created_by: input.createdBy,
        snapshot_at: formatCatalystDateTime(new Date()),
      });
    },
  };
}

// -------------------------------------------------------------- Deal health history

export interface DealHealthHistoryRow {
  id: string;
  dealId: string;
  fromStatus: string | null;
  toStatus: string;
  reason: string | null;
  actor: string;
  changedAt: Date;
}

export interface WriteHealthHistoryEntry {
  dealId: string;
  fromStatus: string | null;
  toStatus: string;
  reason: string | null;
  actor: string;
}

export function createDealHealthHistoryRepo(catalystApp: CatalystApp) {
  return {
    async listByDealId(dealId: string): Promise<DealHealthHistoryRow[]> {
      const rows = await fetchAllRows(catalystApp, TABLE.dealHealthHistory);
      return rows
        .filter((r) => r["deal_id"] === dealId)
        .map((r) => ({
          id: r["id"],
          dealId: r["deal_id"],
          fromStatus: r["from_status"] || null,
          toStatus: r["to_status"],
          reason: r["reason"] || null,
          actor: r["actor"],
          changedAt: parseCatalystDateTime(r["changed_at"]),
        }))
        .sort((a, b) => b.changedAt.getTime() - a.changedAt.getTime());
    },
    /** The newest recorded health status for a deal (`toStatus` of its latest row), or null if it has never changed. */
    async lastRecordedStatus(dealId: string): Promise<string | null> {
      const rows = await fetchAllRows(catalystApp, TABLE.dealHealthHistory);
      const forDeal = rows.filter((r) => r["deal_id"] === dealId);
      if (forDeal.length === 0) return null;
      forDeal.sort((a, b) => parseCatalystDateTime(b["changed_at"]).getTime() - parseCatalystDateTime(a["changed_at"]).getTime());
      return forDeal[0]["to_status"];
    },
    async create(entry: WriteHealthHistoryEntry): Promise<void> {
      await insertRow(catalystApp, TABLE.dealHealthHistory, {
        id: crypto.randomUUID(),
        deal_id: entry.dealId,
        from_status: entry.fromStatus,
        to_status: entry.toStatus,
        reason: entry.reason,
        actor: entry.actor,
        changed_at: formatCatalystDateTime(new Date()),
      });
    },
  };
}

// -------------------------------------------------------------- Pipeline transitions (Pipeline Flow Analytics)

export interface PipelineTransitionRow {
  dealId: string;
  fromStageId: number | null;
  toStageId: number | null;
  transitionType: string;
  tcvAtTransition: number | null;
  daysInFromStage: number | null;
  transitionedAt: Date;
}

export function createPipelineTransitionsRepo(catalystApp: CatalystApp) {
  return {
    /** Every transition across every deal, oldest first â€” matches the original ORDER BY transitioned_at ASC. Callers join against the live deal set to exclude soft-deleted deals themselves (Data Store has no server-side join). */
    async listAll(): Promise<PipelineTransitionRow[]> {
      const rows = await fetchAllRows(catalystApp, TABLE.pipelineTransitions);
      return rows
        .map((r) => ({
          dealId: r["deal_id"],
          fromStageId: parseNullableNumber(r["from_stage_id"]),
          toStageId: parseNullableNumber(r["to_stage_id"]),
          transitionType: r["transition_type"],
          tcvAtTransition: parseNullableNumber(r["tcv_at_transition"]),
          daysInFromStage: parseNullableNumber(r["days_in_from_stage"]),
          transitionedAt: parseCatalystDateTime(r["transitioned_at"]),
        }))
        .sort((a, b) => a.transitionedAt.getTime() - b.transitionedAt.getTime());
    },
    /**
     * Insert a transition row, silently no-op'ing on a raced duplicate â€” the
     * original Drizzle `onConflictDoNothing({ target: [dealId, transitionedAt] })`.
     * `natural_key` (`dealId:transitionedAt`) is the synthesized composite
     * unique backing this (see docs/CATALYST_SCHEMA.md's natural-key table).
     */
    async create(input: {
      dealId: string;
      fromStageId: number | null;
      toStageId: number;
      transitionType: string;
      tcvAtTransition: number | null;
      daysInFromStage: number | null;
      overridden: boolean;
      transitionedAt: Date;
      createdBy: string;
    }): Promise<void> {
      const transitionedAtStr = formatCatalystDateTime(input.transitionedAt);
      const naturalKey = `${input.dealId}:${transitionedAtStr}`;
      const rows = await fetchAllRows(catalystApp, TABLE.pipelineTransitions);
      if (rows.some((r) => r["natural_key"] === naturalKey)) return;
      try {
        await insertRow(catalystApp, TABLE.pipelineTransitions, {
          id: crypto.randomUUID(),
          deal_id: input.dealId,
          from_stage_id: input.fromStageId != null ? String(input.fromStageId) : null,
          to_stage_id: String(input.toStageId),
          transition_type: input.transitionType,
          tcv_at_transition: input.tcvAtTransition,
          days_in_from_stage: input.daysInFromStage,
          overridden: formatBoolean(input.overridden),
          transitioned_at: transitionedAtStr,
          created_by: input.createdBy,
          natural_key: naturalKey,
        });
      } catch (err) {
        if (!isDuplicateValueError(err)) throw err;
      }
    },
  };
}

// -------------------------------------------------------------- Commander achievements (Engagement)

export interface CommanderAchievementRow {
  achievementCode: string;
  earnedAt: Date;
}

export function createCommanderAchievementsRepo(catalystApp: CatalystApp) {
  return {
    async listAll(): Promise<CommanderAchievementRow[]> {
      const rows = await fetchAllRows(catalystApp, TABLE.commanderAchievements);
      return rows.map((r) => ({ achievementCode: r["achievement_code"], earnedAt: parseCatalystDateTime(r["earned_at"]) }));
    },
    /** Insert-if-missing (mirrors the original `onConflictDoNothing` on the achievement_code PK) â€” an achievement, once earned, is never re-earned or overwritten. */
    async earnIfMissing(achievementCode: string): Promise<void> {
      const rows = await fetchAllRows(catalystApp, TABLE.commanderAchievements);
      if (rows.some((r) => r["achievement_code"] === achievementCode)) return;
      try {
        await insertRow(catalystApp, TABLE.commanderAchievements, {
          achievement_code: achievementCode,
          earned_at: formatCatalystDateTime(new Date()),
        });
      } catch (err) {
        if (!isDuplicateValueError(err)) throw err;
      }
    },
  };
}
