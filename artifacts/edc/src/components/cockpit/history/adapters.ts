// Pure adapters that flatten the Record tab's two history sources onto one row
// shape for <TimelineList>. No React, no data fetching, no "@/" imports —
// artifacts/edc/vitest.config.ts is standalone with no resolve.alias and only
// picks up *.test.ts, so anything reachable from adapters.test.ts must import
// by relative path (same constraint documented in
// components/dashboard/widgets/_shared.tsx and lib/close-timeline-model.ts).
import {
  formatDate,
  humanizeCode,
  humanizeField,
  humanizeEventType,
  humanizeIsoDates,
} from "../../../lib/format";

export type TimelineKind =
  | "field"
  | "stage"
  | "health"
  | "gate"
  | "blocker"
  | "playbook"
  | "meddpicc"
  | "system";

export interface TimelineDetail {
  /** Humanized — never a raw column name. */
  label: string;
  from?: string | null;
  to?: string | null;
  /** Free text with no before/after, e.g. a health reason. */
  text?: string | null;
}

export interface TimelineRow {
  /** Source-prefixed ("aud:" / "act:") so keys can't collide across views. */
  id: string;
  kind: TimelineKind;
  /** Already humanized — the list renders this verbatim. */
  title: string;
  at: string;
  actor: string;
  /** Health status for the row's badge; colour is reserved for this only. */
  health?: { from: string | null; to: string } | null;
  details: TimelineDetail[];
}

// ---- Inputs ------------------------------------------------------------
//
// Declared structurally rather than imported from @workspace/api-client-react
// so tests can build plain literals; the generated types satisfy these.

export interface AuditRowInput {
  id: string;
  entityType: string;
  entityId?: string | null;
  fieldChanged: string;
  oldValue?: string | null;
  newValue?: string | null;
  changedBy: string;
  changedAt: string;
}

export interface ActivityRowInput {
  id: string;
  eventType: string;
  entityType: string;
  entityId?: string | null;
  summary: string;
  metadata?: Record<string, unknown> | null;
  actor: string;
  occurredAt: string;
}

/** Lookup tables used to turn raw foreign keys into names. */
export interface AuditLookups {
  stages?: { id: number; stageName: string }[];
  pricingModels?: { id: number; modelName: string }[];
  servicesTiers?: { id: number; tierName: string }[];
  lossArchetypes?: { id: number; archetypeName: string }[];
  currency?: string;
  /** Gate code → human label, for naming rows of a batch gate save. */
  gateLabels?: Record<string, string>;
}

// ---- Value formatting --------------------------------------------------

/**
 * Audit columns whose humanizeField() output reads badly. Only overrides — a
 * field absent here falls through to humanizeField, so this stays short.
 *
 * Kept next to the audit adapter rather than in lib/format.ts because it is
 * this log's vocabulary, not a general rule: humanizeField has to stay generic
 * for the camelCase activity-stream path (humanizeCamelField) too.
 */
const AUDIT_FIELD_LABELS: Record<string, string> = {
  // "Win Probability Pct" — the unit is already in the formatted value.
  win_probability_pct: "Win Probability",
  // Acronyms humanizeField can't know about; it would title-case them to
  // "Crm Record Url" / "Ad360 Seat Count".
  crm_record_url: "CRM Record URL",
  ad360_seat_count: "AD360 Seat Count",
  ad360_feature_notes: "AD360 Feature Notes",
};

/** An audit column name as a person reads it. */
function fieldLabel(field: string): string {
  return AUDIT_FIELD_LABELS[field] ?? humanizeField(field);
}

const MONEY_FIELDS = new Set([
  "product_revenue",
  "services_revenue",
  "calculated_tcv",
  "normalized_tcv",
]);

const PERCENT_FIELDS = new Set(["win_probability_pct"]);

const DATE_FIELDS = new Set([
  "expected_close_date",
  "landed_at",
  "compliance_deadline",
  "deleted_at",
  "archived_at",
  "stage_entered_at",
]);

function fkName(field: string, raw: string, lookups: AuditLookups): string | null {
  const id = Number(raw);
  if (!Number.isFinite(id)) return null;
  const table =
    field === "sales_stage_id"
      ? lookups.stages?.map((s) => ({ id: s.id, name: s.stageName }))
      : field === "pricing_model_id"
        ? lookups.pricingModels?.map((m) => ({ id: m.id, name: m.modelName }))
        : field === "services_tier_id"
          ? lookups.servicesTiers?.map((t) => ({ id: t.id, name: t.tierName }))
          : field === "loss_archetype_id"
            ? lookups.lossArchetypes?.map((a) => ({ id: a.id, name: a.archetypeName }))
            : undefined;
  return table?.find((r) => r.id === id)?.name ?? null;
}

/**
 * Render one `deal_audit_log` old/new value the way a person reads it. The
 * audit log stores everything as text and stores raw foreign keys, so without
 * this a stage change displayed as literally "2 → 3".
 */
export function formatAuditValue(
  entityType: string,
  field: string,
  value: string | null | undefined,
  lookups: AuditLookups = {},
): string {
  if (value == null || value === "") return "—";

  // Gate completion is the most common audit row in this app.
  if (entityType === "gate" && field === "is_completed") {
    return value === "true" ? "Complete" : "Incomplete";
  }
  if (value === "true") return "Yes";
  if (value === "false") return "No";

  if (field.endsWith("_id")) {
    const name = fkName(field, value, lookups);
    // Never blank out an id we can't resolve — show it as an id, visibly.
    if (name) return name;
    return `#${value}`;
  }

  if (MONEY_FIELDS.has(field)) {
    const n = Number(value);
    if (Number.isFinite(n)) {
      return new Intl.NumberFormat("en-US", {
        style: "currency",
        currency: lookups.currency ?? "USD",
        maximumFractionDigits: 0,
      }).format(n);
    }
  }

  if (PERCENT_FIELDS.has(field)) {
    const n = Number(value);
    if (Number.isFinite(n)) return `${n}%`;
  }

  if (DATE_FIELDS.has(field)) return formatDate(value, value);

  return value;
}

// ---- Audit → change-sets ----------------------------------------------

function auditKind(entityType: string, field: string): TimelineKind {
  if (entityType === "gate") return "gate";
  if (entityType === "blocker") return "blocker";
  if (field === "sales_stage_id") return "stage";
  if (
    entityType === "bat_signal" ||
    entityType === "cross_sell" ||
    entityType === "intervention" ||
    field === "created" ||
    field === "deleted_at" ||
    field === "archived_at"
  ) {
    return "system";
  }
  return "field";
}

/**
 * Label one audit row's detail line. Gate rows are labelled by the gate
 * itself, not by the column name: a batch gate save writes every row with
 * fieldChanged="is_completed" and one shared timestamp, so entityId (the gate
 * code) is the only thing separating them.
 */
function detailLabel(row: AuditRowInput, lookups: AuditLookups): string {
  if (row.entityType === "gate" && row.entityId) {
    return lookups.gateLabels?.[row.entityId] ?? humanizeCode(row.entityId);
  }
  return fieldLabel(row.fieldChanged);
}

/** Title for a change-set that turned out to hold exactly one audit row. */
function singleRowTitle(row: AuditRowInput, lookups: AuditLookups): string {
  const { entityType, fieldChanged: f, newValue } = row;
  if (f === "created") {
    return entityType === "deal" ? "Deal created" : `${humanizeCode(entityType)} created`;
  }
  if (f === "deleted_at") return newValue ? "Deal deleted" : "Deal restored";
  if (f === "archived_at") return newValue ? "Deal archived" : "Deal unarchived";
  if (entityType === "gate" && f === "is_completed") {
    const gate = row.entityId
      ? (lookups.gateLabels?.[row.entityId] ?? humanizeCode(row.entityId))
      : "Gate";
    return newValue === "true" ? `Completed ${gate}` : `Reopened ${gate}`;
  }
  if (entityType === "cross_sell") return "Cross-sell products updated";
  if (f === "stage_override") return "Stage guardrail overridden";
  return `Changed ${fieldLabel(f)}`;
}

/** Title for a change-set of many rows, e.g. a batch gate save. */
function groupTitle(bucket: AuditRowInput[], lookups: AuditLookups): string {
  if (bucket.length === 1) return singleRowTitle(bucket[0], lookups);
  const allGates = bucket.every(
    (r) => r.entityType === "gate" && r.fieldChanged === "is_completed",
  );
  if (allGates) return `Updated ${bucket.length} technical gates`;
  return `Updated ${bucket.length} fields`;
}

/**
 * Collapse per-field audit rows into one row per save.
 *
 * Grouping on `(changedBy, changedAt)` is exact rather than a heuristic:
 * `deal_audit_log.changed_at` is `DEFAULT now()` and lib/audit.ts writeAudit()
 * inserts every field of one save in a single multi-row INSERT, and Postgres
 * now() is transaction-stable — so one save shares one identical timestamp.
 *
 * Input is expected newest-first (the API orders by `changed_at DESC`);
 * insertion order is preserved.
 */
export function auditToRows(
  rows: AuditRowInput[],
  lookups: AuditLookups = {},
): TimelineRow[] {
  const groups = new Map<string, AuditRowInput[]>();
  for (const r of rows) {
    // Timestamp first, then actor: changedAt is a fixed-format ISO string that
    // cannot contain "|", so this key stays unambiguous for any display name
    // (actor names contain spaces, so an actor-first key would not).
    const key = `${r.changedAt}|${r.changedBy}`;
    const bucket = groups.get(key);
    if (bucket) bucket.push(r);
    else groups.set(key, [r]);
  }

  return [...groups.values()].map((bucket) => {
    const first = bucket[0];
    return {
      id: `aud:${first.id}`,
      kind: auditKind(first.entityType, first.fieldChanged),
      title: groupTitle(bucket, lookups),
      at: first.changedAt,
      actor: first.changedBy,
      details: bucket.map((r) => ({
        label: detailLabel(r, lookups),
        from: formatAuditValue(r.entityType, r.fieldChanged, r.oldValue, lookups),
        to: formatAuditValue(r.entityType, r.fieldChanged, r.newValue, lookups),
      })),
    };
  });
}

// ---- Activity → rows ---------------------------------------------------

function activityKind(eventType: string): TimelineKind {
  if (eventType === "health.changed") return "health";
  if (eventType === "deal.stage_changed") return "stage";
  if (eventType === "deal.updated") return "field";
  if (eventType.startsWith("gate.")) return "gate";
  if (eventType.startsWith("blocker.")) return "blocker";
  if (eventType.startsWith("playbook.")) return "playbook";
  if (eventType.startsWith("meddpicc.")) return "meddpicc";
  return "system";
}

const str = (v: unknown): string | null => (typeof v === "string" && v ? v : null);

/**
 * Read a `health.changed` row's own metadata rather than correlating against
 * the health-history table. The activity row already carries the transition
 * verbatim: activity-logger's metadataOf() spreads the event minus
 * type/dealId/actor/occurredAt, and the health.changed event is emitted with
 * { fromStatus, toStatus, reason } — so no cross-table match is needed. That
 * matters because the two tables are written off different clocks (audit /
 * health via Postgres now(), activity via a Node Date at emit time), so
 * timestamp correlation between them would be unreliable by seconds.
 *
 * metadata is server-controlled JSONB typed as unknown, so this guards rather
 * than casts and returns null when the shape isn't what we expect.
 */
export function readHealthMeta(
  metadata: Record<string, unknown> | null | undefined,
): { from: string | null; to: string; reason: string | null } | null {
  if (!metadata || typeof metadata !== "object") return null;
  const to = str(metadata.toStatus);
  if (!to) return null;
  return {
    from: str(metadata.fromStatus),
    to,
    // The reason is the engine's own alert message, which is kept pure and can
    // carry bare YYYY-MM-DD tokens — humanizeIsoDates is exactly for this
    // render boundary (see its comment in lib/format.ts).
    reason: str(metadata.reason) ? humanizeIsoDates(str(metadata.reason)!) : null,
  };
}

/** Field names in `deal.updated` metadata are camelCase (Object.keys(updates)). */
function changedFieldNames(metadata: Record<string, unknown> | null | undefined): string[] {
  const raw = metadata?.changedFields;
  if (!Array.isArray(raw)) return [];
  return raw.filter((f): f is string => typeof f === "string" && f.length > 0);
}

/**
 * "salesStageId" → "Sales Stage" (camelCase counterpart of fieldLabel).
 * Goes through fieldLabel, not humanizeField, so the Timeline's deal.updated
 * detail lines read identically to the same field in Field changes —
 * "crmRecordUrl" and "crm_record_url" both land on "CRM Record URL".
 */
function humanizeCamelField(field: string): string {
  return fieldLabel(field.replace(/([a-z0-9])([A-Z])/g, "$1_$2").toLowerCase());
}

/**
 * Map the v2 activity stream onto timeline rows, folding each health
 * transition in from its own metadata.
 *
 * This replaces the separate "Health Timeline" card, which was redundant: the
 * activity-logger subscriber writes a row for ALL event types including
 * health.changed, so every transition was already listed in the activity
 * stream — the card only added the from→to pair and reason, which are folded
 * in here from the same event's metadata.
 */
export function activityToRows(events: ActivityRowInput[]): TimelineRow[] {
  return events.map((e) => {
    const kind = activityKind(e.eventType);
    const row: TimelineRow = {
      id: `act:${e.id}`,
      kind,
      title: e.summary?.trim() || humanizeEventType(e.eventType),
      at: e.occurredAt,
      actor: e.actor,
      details: [],
    };

    if (kind === "health") {
      const meta = readHealthMeta(e.metadata);
      if (meta) {
        // The from/to pair renders as colour-coded chips, so the title drops
        // the statuses the server summary repeats ("Health changed G -> Y").
        row.health = { from: meta.from, to: meta.to };
        row.title = "Health changed";
        if (meta.reason) row.details = [{ label: "Reason", text: meta.reason }];
      }
      return row;
    }

    if (e.eventType === "deal.updated") {
      // The server summary for this event is Object.keys(updates).join(", "),
      // i.e. a raw camelCase dump ("Updated dealName, accountName, ..."), so
      // this is the one event whose title is better derived client-side.
      const fields = changedFieldNames(e.metadata);
      if (fields.length > 0) {
        row.title =
          fields.length === 1
            ? `Changed ${humanizeCamelField(fields[0])}`
            : `Updated ${fields.length} fields`;
        row.details = fields.map((f) => ({ label: humanizeCamelField(f) }));
      }
      return row;
    }

    return row;
  });
}
