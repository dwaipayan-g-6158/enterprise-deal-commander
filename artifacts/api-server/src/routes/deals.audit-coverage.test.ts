import { describe, it, expect, afterAll } from "vitest";
import type { Request, Response } from "express";
import { asc, eq, inArray } from "drizzle-orm";
import {
  db,
  pool,
  enterpriseDeals,
  pricingModels,
  servicesTiers,
  pipelineStages,
  competitors,
  complianceDrivers,
  lossArchetypes,
  dealAuditLog,
} from "@workspace/db";
import { UpdateDealBody } from "@workspace/api-zod";
import router from "./deals";

// Guards the audit coverage of the deal update handler.
//
// The failure this exists to prevent is silent: assigning a column into
// `updates` without a matching `track()` call changes the deal, emits
// deal.updated, returns 200 — and writes no deal_audit_log row, so Record ->
// History -> "Field changes" simply omits the edit. Eight fields drifted that
// way before anyone noticed (pricing model, contract term, currency, win
// probability, CRM url, blueprint, speaker notes, loss archetype).
//
// So the field list is DERIVED FROM THE CONTRACT rather than hardcoded: adding
// a property to DealUpdate in openapi.yaml puts it in scope here automatically,
// and the test fails until it is either tracked or explicitly allowlisted
// below. A hardcoded list would have to be remembered, which is exactly the
// thing that failed.
//
// Harness (router-stack walk + fake req/res) is the same one used by
// deals.lifecycle.test.ts — there is no supertest in this repo.

/**
 * Properties of DealUpdate that deliberately produce no row keyed to their own
 * name. Every entry needs a reason; "we didn't get to it" is not one.
 */
const NOT_AUDITED = new Set([
  // Join-table writes, not columns on enterprise_deals. replaceAd360Features
  // already writes its own `ad360_feature/selected_features` summary row;
  // per-id rows for a multi-select would bury the scalar edits.
  "product_interest_ids",
  "compliance_driver_ids",
  "ad360_feature_ids",
  // Persisted to deal_stage_overrides and audited under `stage_override`, so
  // the reason text is recorded — just not under this property name.
  "override_reason",
]);

function getHandler(method: "get" | "post" | "put" | "delete", path: string) {
  const stack = (router as unknown as {
    stack: Array<{
      route?: {
        path: string;
        methods: Record<string, boolean>;
        stack: Array<{ handle: (req: Request, res: Response) => unknown }>;
      };
    }>;
  }).stack;
  const layer = stack.find((l) => l.route?.path === path && l.route.methods[method]);
  if (!layer?.route) throw new Error(`Route ${method.toUpperCase()} ${path} not registered`);
  return layer.route.stack[0].handle;
}

const actor = { id: "test-actor", username: "test", displayName: "Audit Coverage Test" };
const createdDealIds: string[] = [];

afterAll(async () => {
  // deal_audit_log.deal_id is ON DELETE CASCADE, so this clears the rows too.
  if (createdDealIds.length > 0) {
    await db.delete(enterpriseDeals).where(inArray(enterpriseDeals.id, createdDealIds));
  }
  await pool.end();
});

/** Two distinct rows from each lookup, so "change it to something else" is possible. */
async function loadSeedFixtures() {
  const models = await db.select().from(pricingModels).orderBy(asc(pricingModels.id));
  const tiers = await db.select().from(servicesTiers).orderBy(asc(servicesTiers.id));
  const stages = await db
    .select()
    .from(pipelineStages)
    .orderBy(asc(pipelineStages.sortOrder));
  const [competitor] = await db.select().from(competitors).limit(1);
  const [driver] = await db.select().from(complianceDrivers).limit(1);
  const [archetype] = await db.select().from(lossArchetypes).limit(1);

  if (models.length < 2 || tiers.length < 2 || stages.length < 2) {
    throw new Error(
      "Seed data needs >=2 pricing models, services tiers and pipeline stages " +
        "so every field can be changed to a different value — run `pnpm --filter @workspace/api-server run seed`",
    );
  }
  if (!competitor || !driver || !archetype) {
    throw new Error(
      "Seed data missing competitors / compliance drivers / loss archetypes — " +
        "run `pnpm --filter @workspace/api-server run seed`",
    );
  }
  return { models, tiers, stages, competitor, driver, archetype };
}

describe("PUT /deals/:id — audit coverage", () => {
  it("writes a deal_audit_log row for every auditable field of DealUpdate", async () => {
    const { models, tiers, stages, competitor, driver, archetype } =
      await loadSeedFixtures();

    // Created at the LAST stage and moved to the FIRST, so the stage change is
    // backward. Advancing would hit the RED-pattern guardrail and need an
    // override_reason, which is a different code path than the one under test.
    const firstStage = stages[0];
    const lastStage = stages[stages.length - 1];
    const tag = `${Date.now()}`;

    const [deal] = await db
      .insert(enterpriseDeals)
      .values({
        dealName: `Audit Coverage ${tag}`,
        accountName: `Audit Coverage Acct ${tag}`,
        accountManager: "Original AM",
        technicalLead: "Original TL",
        salesStageId: lastStage.id,
        pricingModelId: models[0].id,
        servicesTierId: tiers[0].id,
        productRevenue: "1000.00",
        servicesRevenue: "250.00",
        contractTermYears: 1,
        dealCurrency: "USD",
        committed: false,
      })
      .returning({ id: enterpriseDeals.id });
    createdDealIds.push(deal.id);

    // Every value here differs from the row inserted above — track() no-ops on
    // an unchanged value, so a same-value field would look like a coverage gap.
    const body: Record<string, unknown> = {
      deal_name: `Audit Coverage Renamed ${tag}`,
      account_name: `Audit Coverage Acct Renamed ${tag}`,
      crm_record_url: "https://crm.example.com/opportunity/audit-coverage",
      account_manager: "Updated AM",
      technical_lead: "Updated TL",
      sales_stage_id: firstStage.id,
      product_revenue: 4242,
      pricing_model_id: models[1].id,
      contract_term_years: 3,
      deal_currency: "EUR",
      expected_close_date: "2027-03-31",
      landed_at: "2026-01-15",
      win_probability_pct: 65,
      committed: true,
      services_revenue: 815,
      services_tier_id: tiers[1].id,
      // Multi-paragraph on purpose: these two are the long-text fields, and the
      // audit log stores them verbatim (see the note by track() in deals.ts).
      manager_strategic_blueprint:
        "Displace the incumbent on audit evidence, not price. Land the SIEM " +
        "footprint first, then expand into identity governance once the CISO " +
        "has a clean quarter of reporting.",
      speaker_notes: "Open on the compliance deadline. Do not lead with discount.",
      loss_archetype_id: archetype.id,
      loss_reason: "Recorded for audit-coverage purposes only.",
      competitor_id: competitor.id,
      compliance_driver_id: driver.id,
      estimated_log_sources: 4200,
      ad360_seat_count: 750,
      ad360_feature_notes: "Needs delegated password reset for the helpdesk tier.",
    };

    // Fail loudly if the contract grew a property this test doesn't exercise —
    // otherwise a new untracked field would pass by simply not being sent.
    const expected = Object.keys(UpdateDealBody.shape).filter((f) => !NOT_AUDITED.has(f));
    const notExercised = expected.filter((f) => !(f in body));
    expect(
      notExercised,
      "DealUpdate gained properties this test doesn't send — add them to `body` " +
        "with a changed value, or to NOT_AUDITED with a reason",
    ).toEqual([]);

    const handler = getHandler("put", "/deals/:id");
    let thrown: (Error & { status?: number }) | undefined;
    const fakeReq = { params: { id: deal.id }, body, actor } as unknown as Request;
    const fakeRes = { json: () => {} } as unknown as Response;
    try {
      await handler(fakeReq, fakeRes);
    } catch (err) {
      thrown = err as Error & { status?: number };
    }
    expect(thrown).toBeUndefined();

    const rows = await db
      .select({ fieldChanged: dealAuditLog.fieldChanged })
      .from(dealAuditLog)
      .where(eq(dealAuditLog.dealId, deal.id));
    const audited = new Set(rows.map((r) => r.fieldChanged));

    const missing = expected.filter((f) => !audited.has(f));
    expect(
      missing,
      "These DealUpdate fields were written to the deal but produced no " +
        "deal_audit_log row — add a track() call in updateDealHandler",
    ).toEqual([]);
  });

  it("writes no audit row when a field is submitted unchanged", async () => {
    const { models, tiers, stages } = await loadSeedFixtures();
    const tag = `${Date.now()}-noop`;

    const [deal] = await db
      .insert(enterpriseDeals)
      .values({
        dealName: `Audit Noop ${tag}`,
        accountName: `Audit Noop Acct ${tag}`,
        accountManager: "AM",
        technicalLead: "TL",
        salesStageId: stages[0].id,
        pricingModelId: models[0].id,
        servicesTierId: tiers[0].id,
        productRevenue: "1000.00",
        servicesRevenue: "0",
        contractTermYears: 2,
        dealCurrency: "USD",
      })
      .returning({ id: enterpriseDeals.id });
    createdDealIds.push(deal.id);

    // The Edit sheet auto-saves the WHOLE payload every second while open
    // (edit-deal-sheet.tsx), so this is the common case, not an edge case: if
    // track() didn't compare values, typing one character would log every field.
    const handler = getHandler("put", "/deals/:id");
    await handler(
      {
        params: { id: deal.id },
        body: {
          pricing_model_id: models[0].id,
          contract_term_years: 2,
          deal_currency: "USD",
          crm_record_url: null,
          speaker_notes: null,
          manager_strategic_blueprint: null,
          loss_archetype_id: null,
          win_probability_pct: null,
        },
        actor,
      } as unknown as Request,
      { json: () => {} } as unknown as Response,
    );

    const rows = await db
      .select({ fieldChanged: dealAuditLog.fieldChanged })
      .from(dealAuditLog)
      .where(eq(dealAuditLog.dealId, deal.id));
    expect(rows).toEqual([]);
  });
});
