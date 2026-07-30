import { describe, it, expect } from "vitest";
import {
  activityTitle,
  changedFieldNames,
  fieldLabel,
  humanizeCamelField,
} from "./activity-title";

// The real payload that motivated this module: a full-form Edit-sheet save
// emits deal.updated with Object.keys(updates) as its summary, so the four
// surfaces rendering this feed showed twenty raw camelCase identifiers.
const FULL_FORM_SAVE = {
  eventType: "deal.updated",
  summary:
    "Updated dealName, accountName, crmRecordUrl, accountManager, technicalLead, " +
    "salesStageId, productRevenue, pricingModelId, contractTermYears, " +
    "expectedCloseDate, landedAt, winProbabilityPct, committed, servicesRevenue, " +
    "servicesTierId, managerStrategicBlueprint, speakerNotes, competitorId, " +
    "complianceDriverId, estimatedLogSources",
  metadata: {
    changedFields: [
      "dealName", "accountName", "crmRecordUrl", "accountManager", "technicalLead",
      "salesStageId", "productRevenue", "pricingModelId", "contractTermYears",
      "expectedCloseDate", "landedAt", "winProbabilityPct", "committed",
      "servicesRevenue", "servicesTierId", "managerStrategicBlueprint",
      "speakerNotes", "competitorId", "complianceDriverId", "estimatedLogSources",
    ],
  },
};

describe("fieldLabel", () => {
  it("overrides what humanizeField would mangle", () => {
    expect(fieldLabel("crm_record_url")).toBe("CRM Record URL");
    expect(fieldLabel("ad360_seat_count")).toBe("AD360 Seat Count");
    expect(fieldLabel("ad360_feature_notes")).toBe("AD360 Feature Notes");
    expect(fieldLabel("win_probability_pct")).toBe("Win Probability");
  });

  it("falls through to humanizeField for everything else", () => {
    expect(fieldLabel("pricing_model_id")).toBe("Pricing Model");
    expect(fieldLabel("deal_currency")).toBe("Deal Currency");
    expect(fieldLabel("is_completed")).toBe("Completed");
  });
});

describe("humanizeCamelField", () => {
  it("routes camelCase through the same overrides as snake_case", () => {
    // Both spellings of one column must produce one label — the audit log is
    // snake_case and the activity log's changedFields is camelCase, and they
    // render side by side in Record -> History.
    expect(humanizeCamelField("crmRecordUrl")).toBe(fieldLabel("crm_record_url"));
    expect(humanizeCamelField("winProbabilityPct")).toBe(fieldLabel("win_probability_pct"));
    expect(humanizeCamelField("ad360SeatCount")).toBe(fieldLabel("ad360_seat_count"));
    expect(humanizeCamelField("salesStageId")).toBe(fieldLabel("sales_stage_id"));
  });

  it("handles a digit-to-uppercase boundary", () => {
    // "ad360SeatCount" splits on 0->S, not on d->3 — otherwise the override
    // key would never match.
    expect(humanizeCamelField("ad360SeatCount")).toBe("AD360 Seat Count");
  });
});

describe("changedFieldNames", () => {
  it("reads the camelCase list off deal.updated metadata", () => {
    expect(changedFieldNames({ changedFields: ["a", "b"] })).toEqual(["a", "b"]);
  });

  it("guards rather than casts, since metadata is server-controlled JSONB", () => {
    expect(changedFieldNames(null)).toEqual([]);
    expect(changedFieldNames(undefined)).toEqual([]);
    expect(changedFieldNames({})).toEqual([]);
    expect(changedFieldNames({ changedFields: "dealName" })).toEqual([]);
    expect(changedFieldNames({ changedFields: [1, "", null, "ok"] })).toEqual(["ok"]);
  });
});

describe("activityTitle", () => {
  it("replaces the raw camelCase dump with a count", () => {
    expect(activityTitle(FULL_FORM_SAVE)).toBe("Updated 20 fields");
    // The one thing that must never happen again on any surface.
    expect(activityTitle(FULL_FORM_SAVE)).not.toContain("dealName");
  });

  it("names a single changed field", () => {
    const e = { eventType: "deal.updated", metadata: { changedFields: ["salesStageId"] } };
    expect(activityTitle(e)).toBe("Changed Sales Stage");
  });

  it("names up to maxNamedFields for rows that cannot expand", () => {
    const two = {
      eventType: "deal.updated",
      summary: "Updated productRevenue, servicesRevenue",
      metadata: { changedFields: ["productRevenue", "servicesRevenue"] },
    };
    // Default (1) counts, because the cockpit row lists the fields underneath.
    expect(activityTitle(two)).toBe("Updated 2 fields");
    // Terminal rows name them instead.
    expect(activityTitle(two, { maxNamedFields: 3 })).toBe(
      "Changed Product Revenue and Services Revenue",
    );
    expect(
      activityTitle(
        { eventType: "deal.updated", metadata: { changedFields: ["a1", "b2", "c3"] } },
        { maxNamedFields: 3 },
      ),
    ).toBe("Changed A1, B2 and C3");
  });

  it("still counts past maxNamedFields", () => {
    expect(activityTitle(FULL_FORM_SAVE, { maxNamedFields: 3 })).toBe("Updated 20 fields");
  });

  it("leaves every other event type's server summary alone", () => {
    // These are hand-written plain English server-side — second-guessing them
    // would be a regression, not a fix.
    for (const e of [
      { eventType: "health.changed", summary: "Health changed GREEN → YELLOW" },
      { eventType: "gate.toggled", summary: "Gate G1_CRITERIA_LOCKED marked complete" },
      { eventType: "deal.stage_changed", summary: "Advanced stage (guardrail overridden)" },
      { eventType: "meddpicc.answer_changed", summary: "MEDDPICC question 2 scored 2" },
      { eventType: "playbook.assigned", summary: "Playbook started" },
    ]) {
      expect(activityTitle(e, { maxNamedFields: 3 })).toBe(e.summary);
    }
  });

  it("keeps the server summary when deal.updated carries no changedFields", () => {
    expect(
      activityTitle({ eventType: "deal.updated", summary: "Updated deal", metadata: {} }),
    ).toBe("Updated deal");
  });

  it("humanizes the event type when there is no summary at all", () => {
    expect(activityTitle({ eventType: "deal.stage_changed", summary: "" })).toBe(
      "Stage changed",
    );
    expect(activityTitle({ eventType: "blocker.resolved" })).toBe("Resolved");
  });
});
