import { Router, type IRouter, type Request, type Response } from "express";
import {
  initCatalystApp,
  type CatalystApp,
  createEnterpriseDealsRepo,
  createDealTechnicalGatesRepo,
  createDealProductInterestsRepo,
  createDealAd360FeaturesRepo,
  createDealComplianceDriversRepo,
  createDealBlockersRepo,
  createDealStageOverridesRepo,
  createDealCompetitorsRepo,
  createStakeholdersRepo,
  createDealDecisionsRepo,
  createDealTagsRepo,
  createPipelineStagesRepo,
  createGateDefinitionsRepo,
  DuplicateDealError,
  type EnterpriseDeal,
  type UpdateEnterpriseDealInput,
} from "@workspace/db/catalyst";
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
import { getActor } from "../lib/auth";
import { badRequest, notFound, conflict, stageGuardrail, archiveGuardrail } from "../lib/http";
import { serializeDeal, assembleDealIntelligence, isBlockingRedAlert } from "../lib/catalyst/intelligence";
import { cachedIntel, mapWithConcurrency, INTEL_CONCURRENCY } from "../lib/catalyst/portfolio";
import { contextualAlertsFor } from "../lib/catalyst/contextual-alerts";
import { writeAudit } from "../lib/catalyst/audit";
import { emitDealEvent } from "../lib/events";

// Auth + write-role enforcement is applied ONCE, centrally, in
// routes/index.ts (requireAuth + requireWriteRole). Do not re-add
// router.use(requireAuth) here — see the comment block above the gate in
// routes/index.ts for why a per-router copy is worse than none.
const router: IRouter = Router();

// Allowlist for GET /deals?sort=<key>. Previously any string was accepted and
// used as a raw property lookup on the serialized deal — an unrecognized key
// silently sorted nothing (every comparison undefined === undefined), and a
// legitimate numeric key with any null value (e.g. winProbabilityPct) fell
// through to `String(...)` comparison, which orders "10" before "9". Mirrors
// the parameter_key allowlist rejection already used for engine thresholds
// (routes/lookups.ts).
const SORTABLE_DEAL_KEYS = new Set([
  "dealName",
  "accountName",
  "salesStage",
  "accountManager",
  "technicalLead",
  "calculatedTCV",
  "normalizedTCV",
  "healthStatus",
  "expectedCloseDate",
  "winProbabilityPct",
  "createdAt",
  "updatedAt",
]);

function contains(haystack: string | null | undefined, needle: string): boolean {
  return !!haystack && haystack.toLowerCase().includes(needle);
}

router.get("/deals", async (req: Request, res: Response) => {
  const q = ListDealsQueryParams.parse(req.query);
  const state = q.state ?? "active";
  const catalystApp = initCatalystApp(req);

  const [allDeals, stages] = await Promise.all([
    createEnterpriseDealsRepo(catalystApp).list(),
    createPipelineStagesRepo(catalystApp).listAll(),
  ]);
  const stageNameById = new Map(stages.map((s) => [s.id, s.stageName]));

  let candidates = allDeals.filter((d) => {
    if (state === "active") return d.deletedAt == null && d.archivedAt == null;
    if (state === "archived") return d.archivedAt != null && d.deletedAt == null;
    if (state === "deleted") return d.deletedAt != null;
    if (state === "all") return d.deletedAt == null; // active + archived, excludes only the trash
    return true;
  });
  // Mirrors the original innerJoin(pipelineStages): a dangling stage id drops the row.
  candidates = candidates.filter((d) => stageNameById.has(d.salesStageId));
  if (q.stage) {
    candidates = candidates.filter((d) => stageNameById.get(d.salesStageId) === q.stage);
  }

  // Full-text-ish search spans deal name fields, strategic notes, stakeholders,
  // decisions and blockers — and reports WHERE each deal matched via `matchedIn`.
  const searchTerm = q.search?.trim() ?? "";
  const doSearch = searchTerm.length >= 2;
  const needle = searchTerm.toLowerCase();

  let matchedInById: Map<string, string[]> | null = null;

  if (doSearch) {
    const [allStakeholders, allDecisions, allBlockers] = await Promise.all([
      createStakeholdersRepo(catalystApp).listAll(),
      createDealDecisionsRepo(catalystApp).listAll(),
      createDealBlockersRepo(catalystApp).listAll(),
    ]);
    const stakeholderMatchDeals = new Set(
      allStakeholders
        .filter((s) => contains(s.name, needle) || contains(s.notes, needle))
        .map((s) => s.dealId),
    );
    const decisionMatchDeals = new Set(
      allDecisions
        .filter((d) => contains(d.decisionText, needle) || contains(d.rationale, needle))
        .map((d) => d.dealId),
    );
    const blockerMatchDeals = new Set(
      allBlockers.filter((b) => contains(b.description, needle)).map((b) => b.dealId),
    );

    matchedInById = new Map();
    candidates = candidates.filter((d) => {
      const sources: string[] = [];
      if (
        contains(d.dealName, needle) ||
        contains(d.accountName, needle) ||
        contains(d.accountManager, needle) ||
        contains(d.technicalLead, needle)
      ) {
        sources.push("name");
      }
      if (contains(d.managerStrategicBlueprint, needle) || contains(d.speakerNotes, needle)) {
        sources.push("notes");
      }
      if (stakeholderMatchDeals.has(d.id)) sources.push("stakeholder");
      if (decisionMatchDeals.has(d.id)) sources.push("decision");
      if (blockerMatchDeals.has(d.id)) sources.push("blocker");
      if (sources.length === 0) return false;
      matchedInById!.set(d.id, sources);
      return true;
    });
  }

  // `cachedIntel`, not the raw assembler: this is a read path, and the engine run
  // dominates the cost of serializing a deal. One dashboard load fires five of
  // these (limit=500/200/200/50/32), so uncached it re-ran the 12-pattern engine
  // for every deal five times over. The cache is dropped by the event bus on any
  // deal mutation, so a write is still reflected on the very next read.
  //
  // Bounded concurrency for the same reason the portfolio summary uses it —
  // `Promise.all` over an unbounded page (limit can reach 500) opened one engine
  // run plus several queries per deal simultaneously and starved the pool.
  let items = (
    await mapWithConcurrency(candidates, INTEL_CONCURRENCY, (d) =>
      serializeDeal(catalystApp, d.id, cachedIntel),
    )
  ).filter((d): d is NonNullable<typeof d> => d !== null);

  // Attach the per-deal match provenance for the search dropdown.
  if (matchedInById) {
    items = items.map((d) => ({ ...d, matchedIn: matchedInById!.get(d.id) ?? [] }));
  }

  // Attach applied tags so the roster can filter/display by tag (one batched
  // query over the result set — no per-deal N+1).
  if (items.length) {
    const tagsByDeal = await createDealTagsRepo(catalystApp).listForDeals(items.map((d) => d.id));
    items = items.map((d) => ({ ...d, tags: tagsByDeal.get(d.id) ?? [] }));
  }

  if (q.health) {
    items = items.filter((d) => d.healthStatus === q.health);
  }

  if (q.sort) {
    const desc_ = q.sort.startsWith("-");
    const key = desc_ ? q.sort.slice(1) : q.sort;
    if (!SORTABLE_DEAL_KEYS.has(key)) {
      throw badRequest(`Unrecognized sort key: ${key}`);
    }
    items.sort((a, b) => {
      const av = (a as Record<string, unknown>)[key];
      const bv = (b as Record<string, unknown>)[key];
      // Numeric fields (calculatedTCV, winProbabilityPct, ...) can be null —
      // that used to fall through to `String(av).localeCompare(String(bv))`,
      // which for a null vs. a real number compares the literal strings
      // "null"/"undefined" against a numeral lexicographically (so, e.g., a
      // real value of 9 could sort after 10). Null now sorts last in both
      // directions, matching the roster's own client-side comparator
      // convention (roster-columns.ts's numCompare).
      if (typeof av === "number" || typeof bv === "number" || av == null || bv == null) {
        if (av == null && bv == null) return 0;
        if (av == null) return 1;
        if (bv == null) return -1;
        const an = Number(av);
        const bn = Number(bv);
        return desc_ ? bn - an : an - bn;
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
async function replaceProductInterests(catalystApp: CatalystApp, dealId: string, productIds: string[]) {
  await createDealProductInterestsRepo(catalystApp).replaceSet(dealId, productIds);
}

// Replace the deal's selected AD360 Enterprise platform-customization features,
// mirroring the product-interest / cross-sell replace-set semantics.
async function replaceAd360Features(catalystApp: CatalystApp, dealId: string, featureIds: number[]) {
  await createDealAd360FeaturesRepo(catalystApp).replaceSet(dealId, featureIds);
}

// Replace the deal's additional compliance drivers (beyond the primary driver).
async function replaceComplianceDrivers(catalystApp: CatalystApp, dealId: string, driverIds: number[]) {
  await createDealComplianceDriversRepo(catalystApp).replaceSet(dealId, driverIds);
}

// Mirror the deal's single "incumbent" FK into the Competitive Landscape
// (v2_deal_competitors) so it doesn't have to be re-added by hand. Additive
// only — never removes a landscape row, including when the incumbent changes.
// Idempotent via the deal_competitor_uq (deal_id, competitor_id) natural key.
async function seedIncumbentCompetitor(
  catalystApp: CatalystApp,
  dealId: string,
  competitorId: number | null | undefined,
) {
  if (!competitorId) return;
  await createDealCompetitorsRepo(catalystApp).createIfMissing(dealId, competitorId, "Active");
}

async function seedGatesForDeal(catalystApp: CatalystApp, dealId: string) {
  const defs = await createGateDefinitionsRepo(catalystApp).listActive();
  if (defs.length === 0) return;
  await createDealTechnicalGatesRepo(catalystApp).seedForDeal(dealId, defs.map((d) => d.gateCode));
}

router.post("/deals", async (req: Request, res: Response) => {
  const parsed = CreateDealBody.safeParse(req.body);
  if (!parsed.success) {
    throw badRequest("Invalid deal payload", parsed.error.issues);
  }
  const catalystApp = initCatalystApp(req);
  const actor = getActor(req);
  const body = parsed.data;

  // B6: the UI sends only the multi-select `compliance_driver_ids`. Derive the
  // single `compliance_driver_id` (engine read) as the first selected, falling
  // back to any explicit single value the caller still sends.
  const derivedComplianceDriverId =
    body.compliance_driver_ids && body.compliance_driver_ids.length > 0
      ? body.compliance_driver_ids[0]
      : (body.compliance_driver_id ?? null);

  let created: EnterpriseDeal;
  try {
    created = await createEnterpriseDealsRepo(catalystApp).create({
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
      ad360SeatCount: body.ad360_seat_count ?? null,
      ad360FeatureNotes: body.ad360_feature_notes ?? null,
    });
  } catch (err) {
    if (err instanceof DuplicateDealError) {
      throw conflict("A deal with this account and name already exists");
    }
    throw err;
  }

  await seedGatesForDeal(catalystApp, created.id);
  if (body.product_interest_ids && body.product_interest_ids.length > 0) {
    await replaceProductInterests(catalystApp, created.id, body.product_interest_ids);
  }
  if (body.compliance_driver_ids && body.compliance_driver_ids.length > 0) {
    await replaceComplianceDrivers(catalystApp, created.id, body.compliance_driver_ids);
  }
  if (body.ad360_feature_ids && body.ad360_feature_ids.length > 0) {
    await replaceAd360Features(catalystApp, created.id, body.ad360_feature_ids);
  }
  await seedIncumbentCompetitor(catalystApp, created.id, body.competitor_id);
  await writeAudit(catalystApp, {
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
    catalystApp,
  });

  const data = await serializeDeal(catalystApp, created.id);
  res.status(201).json(GetDealResponse.parse({ data }));
});

router.get("/deals/:id", async (req: Request, res: Response) => {
  const { id } = GetDealParams.parse(req.params);
  const catalystApp = initCatalystApp(req);
  const data = await serializeDeal(catalystApp, id);
  if (!data) throw notFound("Deal not found");
  res.json(GetDealResponse.parse({ data }));
});

const updateDealHandler = async (req: Request, res: Response) => {
  const { id } = UpdateDealParams.parse(req.params);
  const parsed = UpdateDealBody.safeParse(req.body);
  if (!parsed.success) {
    throw badRequest("Invalid deal update payload", parsed.error.issues);
  }
  const catalystApp = initCatalystApp(req);
  const actor = getActor(req);
  const body = parsed.data;

  const dealsRepo = createEnterpriseDealsRepo(catalystApp);
  const existing = await dealsRepo.getById(id);
  if (!existing) throw notFound("Deal not found");

  const updates: UpdateEnterpriseDealInput = {};
  const auditEntries: {
    dealId: string;
    entityType: string;
    entityId?: string | null;
    fieldChanged: string;
    oldValue?: string | null;
    newValue?: string | null;
    changedBy: string;
  }[] = [];

  // Every scalar field of UpdateDealBody must call track() — an assignment into
  // `updates` without one changes the deal but leaves no row in deal_audit_log,
  // so Record -> History -> "Field changes" silently omits it. That gap went
  // unnoticed for eight fields (pricing model, contract term, currency, win
  // probability, CRM url, blueprint, speaker notes, loss archetype), so it is
  // now enforced by deals.audit-coverage.test.ts, which walks
  // UpdateDealBody.shape and requires either a track() or an explicit entry in
  // that test's NOT_AUDITED allowlist.
  const track = (
    field: string,
    oldValue: unknown,
    newValue: unknown,
  ) => {
    if (String(oldValue ?? "") !== String(newValue ?? "")) {
      auditEntries.push({
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
    track("crm_record_url", existing.crmRecordUrl, body.crm_record_url);
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
    track("pricing_model_id", existing.pricingModelId, body.pricing_model_id);
    updates.pricingModelId = body.pricing_model_id;
  }
  if (body.contract_term_years !== undefined) {
    track(
      "contract_term_years",
      existing.contractTermYears,
      body.contract_term_years,
    );
    updates.contractTermYears = body.contract_term_years;
  }
  if (body.deal_currency !== undefined) {
    track("deal_currency", existing.dealCurrency, body.deal_currency);
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
    track(
      "win_probability_pct",
      existing.winProbabilityPct,
      body.win_probability_pct,
    );
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
  // The two long-text fields are audited verbatim, like loss_reason below —
  // old_value/new_value are unbounded `text`, and the audit endpoint sits behind
  // the same requireAuth gate as GET /deals/:id, which already returns
  // speaker_notes. Keeping the full value here means the log stays the record;
  // the Record tab truncates for display (history/timeline-list.tsx DetailValue).
  if (body.manager_strategic_blueprint !== undefined) {
    track(
      "manager_strategic_blueprint",
      existing.managerStrategicBlueprint,
      body.manager_strategic_blueprint,
    );
    updates.managerStrategicBlueprint = body.manager_strategic_blueprint ?? null;
  }
  if (body.speaker_notes !== undefined) {
    track("speaker_notes", existing.speakerNotes, body.speaker_notes);
    updates.speakerNotes = body.speaker_notes ?? null;
  }
  if (body.loss_archetype_id !== undefined) {
    track("loss_archetype_id", existing.lossArchetypeId, body.loss_archetype_id);
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
  if (body.ad360_seat_count !== undefined) {
    track("ad360_seat_count", existing.ad360SeatCount, body.ad360_seat_count);
    updates.ad360SeatCount = body.ad360_seat_count ?? null;
  }
  if (body.ad360_feature_notes !== undefined) {
    track(
      "ad360_feature_notes",
      existing.ad360FeatureNotes,
      body.ad360_feature_notes,
    );
    updates.ad360FeatureNotes = body.ad360_feature_notes ?? null;
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
    const stageRows = await createPipelineStagesRepo(catalystApp).listAll();
    const fromStage = stageRows.find((s) => s.id === existing.salesStageId);
    const toStage = stageRows.find((s) => s.id === body.sales_stage_id);

    // Archived implies closed (enforced at archive time in the /archive
    // handler below) — that invariant would otherwise silently break if an
    // archived deal could be PATCHed to an open stage without first being
    // restored. Guard it here too, not just at archive time.
    if (
      existing.archivedAt &&
      toStage &&
      toStage.stageName !== "Closed-Won" &&
      toStage.stageName !== "Closed-Lost"
    ) {
      throw archiveGuardrail(
        "Restore this deal before moving it out of a closed stage.",
      );
    }

    const isAdvancing =
      !!fromStage && !!toStage && toStage.sortOrder > fromStage.sortOrder;
    if (isAdvancing) {
      const intel = await assembleDealIntelligence(catalystApp, id);
      // Blocking RED alerts come from three sources, all funneled through the
      // shared isBlockingRedAlert predicate (lib/catalyst/intelligence.ts) so
      // this can't silently diverge from the read-path intelligence route again:
      //   - intel.governance.alerts: unmanaged (no disposition at all).
      //   - intel.governance.managedAlerts: has a disposition, but only
      //     `accept` (its own mandatory rationale) legitimately clears a RED
      //     alert — `acknowledge`/`snooze` do not.
      //   - contextualAlertsFor: V2 competitive/stakeholder patterns (e.g.
      //     HOSTILE_STAKEHOLDER) that never flow through
      //     assembleDealIntelligence — previously only ever surfaced on the
      //     GET .../intelligence read route, never enforced here.
      const contextual = await contextualAlertsFor(catalystApp, id);
      const candidateAlerts = [
        ...(intel?.governance.alerts ?? []),
        ...(intel?.governance.managedAlerts ?? []),
        ...contextual,
      ];
      const blockingCodes = [
        ...new Set(
          candidateAlerts.filter(isBlockingRedAlert).map((a) => a.code),
        ),
      ];
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
      await dealsRepo.update(
        id,
        { dealName: existing.dealName, accountName: existing.accountName },
        updates,
      );
    } catch (err) {
      if (err instanceof DuplicateDealError) {
        throw conflict("A deal with this account and name already exists");
      }
      throw err;
    }
  }
  if (stageOverride) {
    await createDealStageOverridesRepo(catalystApp).create({
      dealId: id,
      fromStage: stageOverride.fromStage,
      toStage: stageOverride.toStage,
      patternCodes: stageOverride.patternCodes,
      overrideReason: body.override_reason!.trim(),
      createdBy: actor.displayName,
    });
    auditEntries.push({
      dealId: id,
      entityType: "deal",
      fieldChanged: "stage_override",
      newValue: stageOverride.patternCodes.join(","),
      changedBy: actor.displayName,
    });
  }
  if (body.product_interest_ids !== undefined) {
    await replaceProductInterests(catalystApp, id, body.product_interest_ids);
  }
  if (body.compliance_driver_ids !== undefined) {
    await replaceComplianceDrivers(catalystApp, id, body.compliance_driver_ids);
  }
  if (body.ad360_feature_ids !== undefined) {
    await replaceAd360Features(catalystApp, id, body.ad360_feature_ids);
    auditEntries.push({
      dealId: id,
      entityType: "ad360_feature",
      fieldChanged: "selected_features",
      newValue: String(body.ad360_feature_ids.length),
      changedBy: actor.displayName,
    });
  }
  if (body.competitor_id !== undefined) {
    await seedIncumbentCompetitor(catalystApp, id, body.competitor_id);
  }
  if (auditEntries.length > 0) await writeAudit(catalystApp, auditEntries);

  const changedFields = Object.keys(updates);
  if (changedFields.length > 0) {
    emitDealEvent("deal.updated", {
      dealId: id,
      actor: actor.displayName,
      changedFields,
      catalystApp,
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
      catalystApp,
    });
  }

  const data = await serializeDeal(catalystApp, id);
  res.json(UpdateDealResponse.parse({ data }));
};

router.put("/deals/:id", updateDealHandler);
router.patch("/deals/:id", updateDealHandler);

router.delete("/deals/:id", async (req: Request, res: Response) => {
  const { id } = DeleteDealParams.parse(req.params);
  const catalystApp = initCatalystApp(req);
  const actor = getActor(req);
  const dealsRepo = createEnterpriseDealsRepo(catalystApp);
  const existing = await dealsRepo.getById(id);
  if (!existing || existing.deletedAt) throw notFound("Deal not found");
  await dealsRepo.update(
    id,
    { dealName: existing.dealName, accountName: existing.accountName },
    { deletedAt: new Date() },
  );
  await writeAudit(catalystApp, {
    dealId: id,
    entityType: "deal",
    fieldChanged: "deleted_at",
    newValue: "deleted",
    changedBy: actor.displayName,
  });
  emitDealEvent("deal.deleted", { dealId: id, actor: actor.displayName, catalystApp });
  res.status(204).end();
});

router.post("/deals/:id/restore", async (req: Request, res: Response) => {
  const { id } = RestoreDealParams.parse(req.params);
  const catalystApp = initCatalystApp(req);
  const actor = getActor(req);
  const dealsRepo = createEnterpriseDealsRepo(catalystApp);

  const existing = await dealsRepo.getById(id);
  if (!existing) throw notFound("Deal not found");
  if (!existing.deletedAt && !existing.archivedAt) {
    throw conflict("Deal is already active");
  }

  // Undo exactly one level: a deleted-and-archived deal returns to Archived,
  // not straight to Active. Only a plain archived (or plain deleted) deal
  // returns to Active. This is what makes the round-trip lossless — see
  // docs/superpowers/plans/2026-07-27-archive-lifecycle-and-semantics.md.
  const clearingDeleted = existing.deletedAt !== null;
  await dealsRepo.update(
    id,
    { dealName: existing.dealName, accountName: existing.accountName },
    clearingDeleted ? { deletedAt: null } : { archivedAt: null },
  );

  await writeAudit(catalystApp, {
    dealId: id,
    entityType: "deal",
    fieldChanged: clearingDeleted ? "deleted_at" : "archived_at",
    newValue: clearingDeleted ? "restored" : "unarchived",
    changedBy: actor.displayName,
  });
  // Still archived after this operation (the deleted-and-archived → Archived
  // case)? Then nothing new happened for a snapshot or health check to
  // capture — the deal was already archived, and shouldSkipSnapshot /
  // shouldSkipHealthReconcile exist specifically to avoid wasted work on
  // archived deals. A restore that lands on genuine Active (from
  // deleted-only or archived-only) DOES emit normally — the deal is live
  // again and a fresh snapshot/health-check is wanted there.
  const stillArchived = clearingDeleted && existing.archivedAt !== null;
  if (!stillArchived) {
    emitDealEvent("deal.restored", { dealId: id, actor: actor.displayName, catalystApp });
  }
  const data = await serializeDeal(catalystApp, id);
  res.json(RestoreDealResponse.parse({ data }));
});

router.post("/deals/:id/archive", async (req: Request, res: Response) => {
  const { id } = ArchiveDealParams.parse(req.params);
  const catalystApp = initCatalystApp(req);
  const actor = getActor(req);
  const dealsRepo = createEnterpriseDealsRepo(catalystApp);

  const existing = await dealsRepo.getById(id);
  if (!existing || existing.deletedAt) throw notFound("Deal not found");
  if (existing.archivedAt) throw conflict("Deal is already archived");

  const stages = await createPipelineStagesRepo(catalystApp).listAll();
  const stageName = stages.find((s) => s.id === existing.salesStageId)?.stageName;
  if (stageName !== "Closed-Won" && stageName !== "Closed-Lost") {
    throw archiveGuardrail(
      "Only Closed-Won or Closed-Lost deals can be archived. Move the deal to a closed stage first.",
    );
  }

  await dealsRepo.update(
    id,
    { dealName: existing.dealName, accountName: existing.accountName },
    { archivedAt: new Date() },
  );
  await writeAudit(catalystApp, {
    dealId: id,
    entityType: "deal",
    fieldChanged: "archived_at",
    newValue: "archived",
    changedBy: actor.displayName,
  });
  emitDealEvent("deal.archived", { dealId: id, actor: actor.displayName, catalystApp });
  const data = await serializeDeal(catalystApp, id);
  res.json(ArchiveDealResponse.parse({ data }));
});

export default router;
