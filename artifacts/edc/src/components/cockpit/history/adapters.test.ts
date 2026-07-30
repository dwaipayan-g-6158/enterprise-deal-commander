import { describe, it, expect } from "vitest";
import {
  auditToRows,
  activityToRows,
  formatAuditValue,
  readHealthMeta,
  type AuditRowInput,
  type ActivityRowInput,
  type AuditLookups,
} from "./adapters";

const LOOKUPS: AuditLookups = {
  stages: [
    { id: 2, stageName: "Discovery" },
    { id: 3, stageName: "Validation" },
  ],
  pricingModels: [{ id: 1, modelName: "Multi-Year Committed" }],
  servicesTiers: [{ id: 4, tierName: "Combined SOW Shared" }],
  lossArchetypes: [{ id: 7, archetypeName: "Premature Commercial Disconnect" }],
  currency: "USD",
  gateLabels: { G1_CRITERIA_LOCKED: "Minimum Viable Requirements Locked" },
};

function audit(over: Partial<AuditRowInput> = {}): AuditRowInput {
  return {
    id: "a1",
    entityType: "deal",
    fieldChanged: "deal_name",
    oldValue: "Old",
    newValue: "New",
    changedBy: "Sarah Chen",
    changedAt: "2026-07-30T10:00:00.000Z",
    ...over,
  };
}

describe("formatAuditValue", () => {
  it("resolves foreign keys to names", () => {
    expect(formatAuditValue("deal", "sales_stage_id", "2", LOOKUPS)).toBe("Discovery");
    expect(formatAuditValue("deal", "sales_stage_id", "3", LOOKUPS)).toBe("Validation");
    expect(formatAuditValue("deal", "pricing_model_id", "1", LOOKUPS)).toBe(
      "Multi-Year Committed",
    );
    expect(formatAuditValue("deal", "services_tier_id", "4", LOOKUPS)).toBe(
      "Combined SOW Shared",
    );
    expect(formatAuditValue("deal", "loss_archetype_id", "7", LOOKUPS)).toBe(
      "Premature Commercial Disconnect",
    );
  });

  it("falls back to a visible id for a loss archetype before the lookup loads", () => {
    // The archetype list is its own query, so a change-set can render a beat
    // before it resolves — and closing a deal as Lost writes this row.
    expect(formatAuditValue("deal", "loss_archetype_id", "7", {})).toBe("#7");
  });

  it("formats a win probability as a percentage", () => {
    expect(formatAuditValue("deal", "win_probability_pct", "65")).toBe("65%");
    expect(formatAuditValue("deal", "win_probability_pct", "0")).toBe("0%");
    // Null still reads as "not set", not "0%".
    expect(formatAuditValue("deal", "win_probability_pct", null)).toBe("—");
  });

  it("shows an unresolvable foreign key visibly as an id, never blank", () => {
    expect(formatAuditValue("deal", "sales_stage_id", "99", LOOKUPS)).toBe("#99");
    expect(formatAuditValue("deal", "sales_stage_id", "2", {})).toBe("#2");
  });

  it("renders gate completion as words, not true/false", () => {
    expect(formatAuditValue("gate", "is_completed", "true")).toBe("Complete");
    expect(formatAuditValue("gate", "is_completed", "false")).toBe("Incomplete");
  });

  it("renders other booleans as Yes/No", () => {
    expect(formatAuditValue("deal", "committed", "true")).toBe("Yes");
    expect(formatAuditValue("deal", "committed", "false")).toBe("No");
  });

  it("formats money fields as currency", () => {
    expect(formatAuditValue("deal", "product_revenue", "1200000", LOOKUPS)).toBe(
      "$1,200,000",
    );
  });

  it("formats date fields as DD/MM/YYYY", () => {
    expect(formatAuditValue("deal", "expected_close_date", "2026-07-13")).toBe(
      "13/07/2026",
    );
  });

  it("renders missing values as an em dash", () => {
    expect(formatAuditValue("deal", "deal_name", null)).toBe("—");
    expect(formatAuditValue("deal", "deal_name", "")).toBe("—");
  });
});

describe("auditToRows", () => {
  it("collapses rows sharing actor+timestamp into one change-set", () => {
    const rows = auditToRows(
      [
        audit({ id: "1", fieldChanged: "deal_name" }),
        audit({ id: "2", fieldChanged: "account_name" }),
        audit({ id: "3", fieldChanged: "product_revenue", newValue: "500" }),
      ],
      LOOKUPS,
    );

    expect(rows).toHaveLength(1);
    expect(rows[0].title).toBe("Updated 3 fields");
    expect(rows[0].details).toHaveLength(3);
    expect(rows[0].actor).toBe("Sarah Chen");
    expect(rows[0].id).toBe("aud:1");
  });

  it("keeps timestamps 1ms apart as separate change-sets", () => {
    const rows = auditToRows([
      audit({ id: "1", changedAt: "2026-07-30T10:00:00.001Z" }),
      audit({ id: "2", changedAt: "2026-07-30T10:00:00.000Z" }),
    ]);
    expect(rows).toHaveLength(2);
  });

  it("keeps different actors at the same instant separate", () => {
    const rows = auditToRows([
      audit({ id: "1", changedBy: "Sarah Chen" }),
      audit({ id: "2", changedBy: "Marcus Webb" }),
    ]);
    expect(rows).toHaveLength(2);
  });

  it("is not confused by an actor name that looks like part of the key", () => {
    const rows = auditToRows([
      audit({ id: "1", changedBy: "A" }),
      audit({ id: "2", changedBy: "A|2026-07-30T10:00:00.000Z" }),
    ]);
    expect(rows).toHaveLength(2);
  });

  it("preserves newest-first input order", () => {
    const rows = auditToRows([
      audit({ id: "new", changedAt: "2026-07-30T10:00:00.000Z" }),
      audit({ id: "old", changedAt: "2026-07-01T10:00:00.000Z" }),
    ]);
    expect(rows.map((r) => r.id)).toEqual(["aud:new", "aud:old"]);
  });

  it("titles a single field change by its humanized field name", () => {
    const rows = auditToRows(
      [audit({ fieldChanged: "sales_stage_id", oldValue: "2", newValue: "3" })],
      LOOKUPS,
    );
    expect(rows[0].title).toBe("Changed Sales Stage");
    expect(rows[0].kind).toBe("stage");
    expect(rows[0].details[0]).toEqual({
      label: "Sales Stage",
      from: "Discovery",
      to: "Validation",
    });
  });

  it("overrides the labels that humanizeField would mangle", () => {
    const label = (fieldChanged: string) =>
      auditToRows([audit({ fieldChanged })], LOOKUPS)[0].details[0].label;
    expect(label("crm_record_url")).toBe("CRM Record URL");
    expect(label("ad360_seat_count")).toBe("AD360 Seat Count");
    expect(label("ad360_feature_notes")).toBe("AD360 Feature Notes");
    // The unit lives in the formatted value ("65%"), not the label.
    expect(label("win_probability_pct")).toBe("Win Probability");
    // Titles use the same vocabulary as the detail labels.
    expect(auditToRows([audit({ fieldChanged: "crm_record_url" })])[0].title).toBe(
      "Changed CRM Record URL",
    );
  });

  it("leaves fields humanizeField already handles alone", () => {
    const label = (fieldChanged: string) =>
      auditToRows([audit({ fieldChanged })], LOOKUPS)[0].details[0].label;
    expect(label("pricing_model_id")).toBe("Pricing Model");
    expect(label("contract_term_years")).toBe("Contract Term Years");
    expect(label("deal_currency")).toBe("Deal Currency");
    expect(label("loss_archetype_id")).toBe("Loss Archetype");
    expect(label("manager_strategic_blueprint")).toBe("Manager Strategic Blueprint");
    expect(label("speaker_notes")).toBe("Speaker Notes");
  });

  it("names gate rows by the gate, not the column, using entityId", () => {
    const rows = auditToRows(
      [
        audit({
          entityType: "gate",
          entityId: "G1_CRITERIA_LOCKED",
          fieldChanged: "is_completed",
          oldValue: "false",
          newValue: "true",
        }),
      ],
      LOOKUPS,
    );
    expect(rows[0].title).toBe("Completed Minimum Viable Requirements Locked");
    expect(rows[0].details[0].label).toBe("Minimum Viable Requirements Locked");
  });

  it("falls back to a humanized gate code when no label is supplied", () => {
    const rows = auditToRows([
      audit({
        entityType: "gate",
        entityId: "G3_PERFORMANCE_PASSED",
        fieldChanged: "is_completed",
        newValue: "false",
      }),
    ]);
    expect(rows[0].title).toBe("Reopened G3 Performance Passed");
  });

  it("distinguishes the rows of a batch gate save", () => {
    // One writeAudit() call, so one shared timestamp and every row
    // fieldChanged="is_completed" — entityId is the only discriminator.
    const rows = auditToRows(
      [
        audit({ id: "1", entityType: "gate", entityId: "G1_CRITERIA_LOCKED", fieldChanged: "is_completed", oldValue: "false", newValue: "true" }),
        audit({ id: "2", entityType: "gate", entityId: "G3_PERFORMANCE_PASSED", fieldChanged: "is_completed", oldValue: "false", newValue: "true" }),
      ],
      LOOKUPS,
    );

    expect(rows).toHaveLength(1);
    expect(rows[0].title).toBe("Updated 2 technical gates");
    expect(rows[0].details.map((d) => d.label)).toEqual([
      "Minimum Viable Requirements Locked",
      "G3 Performance Passed",
    ]);
  });

  it("titles lifecycle rows", () => {
    expect(auditToRows([audit({ fieldChanged: "created", newValue: null })])[0].title).toBe(
      "Deal created",
    );
    expect(
      auditToRows([audit({ fieldChanged: "deleted_at", newValue: "2026-07-30" })])[0].title,
    ).toBe("Deal deleted");
    expect(
      auditToRows([audit({ fieldChanged: "deleted_at", newValue: null })])[0].title,
    ).toBe("Deal restored");
  });

  it("maps entity types to kinds", () => {
    expect(auditToRows([audit({ entityType: "gate" })])[0].kind).toBe("gate");
    expect(auditToRows([audit({ entityType: "blocker" })])[0].kind).toBe("blocker");
    expect(auditToRows([audit({ entityType: "cross_sell" })])[0].kind).toBe("system");
    expect(auditToRows([audit({ fieldChanged: "deal_name" })])[0].kind).toBe("field");
  });

  it("returns nothing for no rows", () => {
    expect(auditToRows([])).toEqual([]);
  });
});

describe("readHealthMeta", () => {
  it("reads a transition straight off the event metadata", () => {
    expect(
      readHealthMeta({ fromStatus: "GREEN", toStatus: "YELLOW", reason: "Gate slipped" }),
    ).toEqual({ from: "GREEN", to: "YELLOW", reason: "Gate slipped" });
  });

  it("treats a null fromStatus as a first transition", () => {
    expect(readHealthMeta({ fromStatus: null, toStatus: "GREEN" })).toEqual({
      from: null,
      to: "GREEN",
      reason: null,
    });
  });

  it("humanizes ISO dates inside the engine-authored reason", () => {
    expect(
      readHealthMeta({ toStatus: "RED", reason: "Close date 2026-07-13 has passed" })?.reason,
    ).toBe("Close date 13/07/2026 has passed");
  });

  it("guards rather than casts unexpected shapes", () => {
    expect(readHealthMeta(null)).toBeNull();
    expect(readHealthMeta(undefined)).toBeNull();
    expect(readHealthMeta({})).toBeNull();
    expect(readHealthMeta({ toStatus: 42 })).toBeNull();
    expect(readHealthMeta({ fromStatus: "GREEN" })).toBeNull();
  });
});

function activity(over: Partial<ActivityRowInput> = {}): ActivityRowInput {
  return {
    id: "e1",
    eventType: "deal.updated",
    entityType: "deal",
    summary: "Updated dealName",
    actor: "Sarah Chen",
    occurredAt: "2026-07-30T10:00:00.000Z",
    ...over,
  };
}

describe("activityToRows", () => {
  it("maps event types to kinds", () => {
    const kindOf = (eventType: string) => activityToRows([activity({ eventType })])[0].kind;
    expect(kindOf("health.changed")).toBe("health");
    expect(kindOf("deal.stage_changed")).toBe("stage");
    expect(kindOf("deal.updated")).toBe("field");
    expect(kindOf("gate.toggled")).toBe("gate");
    expect(kindOf("blocker.created")).toBe("blocker");
    expect(kindOf("playbook.assigned")).toBe("playbook");
    expect(kindOf("meddpicc.answer_changed")).toBe("meddpicc");
    expect(kindOf("deal.created")).toBe("system");
    expect(kindOf("something.brand_new")).toBe("system");
  });

  it("prefixes ids so they cannot collide with audit rows", () => {
    expect(activityToRows([activity({ id: "1" })])[0].id).toBe("act:1");
  });

  it("uses the server summary as the title", () => {
    expect(
      activityToRows([
        activity({ eventType: "gate.toggled", summary: "Gate G1_CRITERIA_LOCKED marked complete" }),
      ])[0].title,
    ).toBe("Gate G1_CRITERIA_LOCKED marked complete");
  });

  it("falls back to a humanized event type when summary is blank", () => {
    expect(
      activityToRows([activity({ summary: "  ", eventType: "deal.stage_changed" })])[0].title,
    ).toBe("Stage changed");
  });

  it("replaces the raw camelCase deal.updated summary with a field count", () => {
    // The server writes Object.keys(updates).join(", ") for this one event,
    // i.e. "Updated dealName, accountName, crmRecordUrl" — unreadable.
    const row = activityToRows([
      activity({
        eventType: "deal.updated",
        summary: "Updated dealName, accountName, salesStageId",
        metadata: { changedFields: ["dealName", "accountName", "salesStageId"] },
      }),
    ])[0];

    expect(row.title).toBe("Updated 3 fields");
    expect(row.details.map((d) => d.label)).toEqual([
      "Deal Name",
      "Account Name",
      "Sales Stage",
    ]);
  });

  it("names a single-field update rather than counting it", () => {
    const row = activityToRows([
      activity({ eventType: "deal.updated", metadata: { changedFields: ["salesStageId"] } }),
    ])[0];
    expect(row.title).toBe("Changed Sales Stage");
  });

  it("labels camelCase fields the same way the audit view labels snake_case ones", () => {
    // The same edit shows up in both views — Timeline via deal.updated's
    // changedFields (camelCase) and Field changes via deal_audit_log
    // (snake_case). They must not disagree on what the field is called.
    const row = activityToRows([
      activity({
        eventType: "deal.updated",
        metadata: {
          changedFields: [
            "crmRecordUrl",
            "winProbabilityPct",
            "ad360SeatCount",
            "pricingModelId",
          ],
        },
      }),
    ])[0];
    expect(row.details.map((d) => d.label)).toEqual([
      "CRM Record URL",
      "Win Probability",
      "AD360 Seat Count",
      "Pricing Model",
    ]);
  });

  it("keeps the server summary when deal.updated has no changedFields", () => {
    const row = activityToRows([
      activity({ eventType: "deal.updated", summary: "Updated deal", metadata: {} }),
    ])[0];
    expect(row.title).toBe("Updated deal");
  });

  it("folds a health transition in from the event's own metadata", () => {
    const row = activityToRows([
      activity({
        eventType: "health.changed",
        summary: "Health changed GREEN → YELLOW",
        metadata: { fromStatus: "GREEN", toStatus: "YELLOW", reason: "Gate slipped" },
      }),
    ])[0];

    expect(row.health).toEqual({ from: "GREEN", to: "YELLOW" });
    // Statuses live in the chips, so the title doesn't repeat them.
    expect(row.title).toBe("Health changed");
    expect(row.details[0]).toEqual({ label: "Reason", text: "Gate slipped" });
  });

  it("still renders a health row when metadata is unusable", () => {
    const row = activityToRows([
      activity({
        eventType: "health.changed",
        summary: "Health changed GREEN → RED",
        metadata: { garbage: true },
      }),
    ])[0];

    expect(row.health).toBeUndefined();
    expect(row.title).toBe("Health changed GREEN → RED");
    expect(row.details).toEqual([]);
  });

  it("returns nothing for no events", () => {
    expect(activityToRows([])).toEqual([]);
  });
});
