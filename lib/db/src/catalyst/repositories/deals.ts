// Repository for the 13 "deal core" tables (lib/db/src/schema/deals.ts),
// ported onto Catalyst Data Store. See docs/CATALYST_SCHEMA.md for the type
// mapping and docs/catalyst-datastore-constraints.md for the architecture
// (Row API + in-memory joins, no ZCQL, explicit ordered cascades instead of
// native FK cascade).
//
// Scope note: enterprise_deals is never hard-deleted through the API (only
// soft-deleted via `deleted_at` — see routes/deals.ts DELETE /deals/:id), so
// this repo does not implement an ordered cascade-delete for it.

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
  fromJson,
  toJson,
  isDuplicateValueError,
  type CatalystApp,
  type RawRow,
} from "../sdk";

const TABLE = {
  enterpriseDeals: "enterprise_deals",
  dealTechnicalGates: "deal_technical_gates",
  dealCrossSells: "deal_cross_sells",
  dealComplianceDrivers: "deal_compliance_drivers",
  dealProductInterests: "deal_product_interests",
  dealAd360Features: "deal_ad360_features",
  dealBlockers: "deal_blockers",
  dealAuditLog: "deal_audit_log",
  dealAlertDispositions: "deal_alert_dispositions",
  dealInterventions: "deal_interventions",
  dealStageOverrides: "deal_stage_overrides",
  batSignals: "bat_signals",
  dealReviewMarkers: "deal_review_markers",
} as const;

export class DuplicateDealError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "DuplicateDealError";
  }
}


function optDate(raw: string | null | undefined): Date | null {
  return raw ? parseCatalystDateTime(raw) : null;
}

// -------------------------------------------------------------- Enterprise deals

export interface EnterpriseDeal {
  id: string;
  dealName: string;
  accountName: string;
  crmRecordUrl: string | null;
  accountManager: string;
  technicalLead: string;
  salesStageId: number;
  stageEnteredAt: Date;
  productRevenue: string;
  pricingModelId: number;
  contractTermYears: number;
  dealCurrency: string;
  expectedCloseDate: string | null;
  landedAt: string | null;
  winProbabilityPct: number | null;
  committed: boolean;
  servicesRevenue: string;
  servicesTierId: number;
  managerStrategicBlueprint: string | null;
  lossReason: string | null;
  speakerNotes: string | null;
  lossArchetypeId: number | null;
  competitorId: number | null;
  complianceDriverId: number | null;
  complianceDeadline: string | null;
  estimatedLogSources: number | null;
  ad360SeatCount: number | null;
  ad360FeatureNotes: string | null;
  archivedAt: Date | null;
  deletedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

function rowToEnterpriseDeal(r: RawRow): EnterpriseDeal {
  return {
    id: r["id"],
    dealName: r["deal_name"],
    accountName: r["account_name"],
    crmRecordUrl: r["crm_record_url"] || null,
    accountManager: r["account_manager"],
    technicalLead: r["technical_lead"],
    salesStageId: Number(r["sales_stage_id"]),
    stageEnteredAt: parseCatalystDateTime(r["stage_entered_at"]),
    productRevenue: r["product_revenue"],
    pricingModelId: Number(r["pricing_model_id"]),
    contractTermYears: Number(r["contract_term_years"]),
    dealCurrency: r["deal_currency"],
    expectedCloseDate: r["expected_close_date"] || null,
    landedAt: r["landed_at"] || null,
    winProbabilityPct: parseNullableNumber(r["win_probability_pct"]),
    committed: parseBoolean(r["committed"]),
    servicesRevenue: r["services_revenue"],
    servicesTierId: Number(r["services_tier_id"]),
    managerStrategicBlueprint: r["manager_strategic_blueprint"] || null,
    lossReason: r["loss_reason"] || null,
    speakerNotes: r["speaker_notes"] || null,
    lossArchetypeId: parseNullableNumber(r["loss_archetype_id"]),
    competitorId: parseNullableNumber(r["competitor_id"]),
    complianceDriverId: parseNullableNumber(r["compliance_driver_id"]),
    complianceDeadline: r["compliance_deadline"] || null,
    estimatedLogSources: parseNullableNumber(r["estimated_log_sources"]),
    ad360SeatCount: parseNullableNumber(r["ad360_seat_count"]),
    ad360FeatureNotes: r["ad360_feature_notes"] || null,
    archivedAt: optDate(r["archived_at"]),
    deletedAt: optDate(r["deleted_at"]),
    createdAt: parseCatalystDateTime(r["created_at"]),
    updatedAt: parseCatalystDateTime(r["updated_at"]),
  };
}

export interface CreateEnterpriseDealInput {
  dealName: string;
  accountName: string;
  crmRecordUrl?: string | null;
  accountManager: string;
  technicalLead: string;
  salesStageId: number;
  productRevenue: string;
  pricingModelId: number;
  contractTermYears: number;
  dealCurrency: string;
  expectedCloseDate?: string | null;
  landedAt?: string | null;
  winProbabilityPct?: number | null;
  committed?: boolean;
  servicesRevenue: string;
  servicesTierId: number;
  managerStrategicBlueprint?: string | null;
  speakerNotes?: string | null;
  lossArchetypeId?: number | null;
  competitorId?: number | null;
  complianceDriverId?: number | null;
  estimatedLogSources?: number | null;
  ad360SeatCount?: number | null;
  ad360FeatureNotes?: string | null;
}

export type UpdateEnterpriseDealInput = Partial<
  Omit<CreateEnterpriseDealInput, "committed"> & {
    committed: boolean;
    lossReason: string | null;
    complianceDeadline: string | null;
    stageEnteredAt: Date;
    archivedAt: Date | null;
    deletedAt: Date | null;
  }
>;

export function createEnterpriseDealsRepo(catalystApp: CatalystApp) {
  return {
    async list(): Promise<EnterpriseDeal[]> {
      const rows = await fetchAllRows(catalystApp, TABLE.enterpriseDeals);
      return rows.map(rowToEnterpriseDeal);
    },
    async getById(id: string): Promise<EnterpriseDeal | null> {
      const rows = await fetchAllRows(catalystApp, TABLE.enterpriseDeals);
      const row = rows.find((r) => r["id"] === id);
      return row ? rowToEnterpriseDeal(row) : null;
    },
    async create(input: CreateEnterpriseDealInput): Promise<EnterpriseDeal> {
      const id = crypto.randomUUID();
      const now = formatCatalystDateTime(new Date());
      try {
        const created = await insertRow(catalystApp, TABLE.enterpriseDeals, {
          id,
          deal_name: input.dealName,
          account_name: input.accountName,
          crm_record_url: input.crmRecordUrl ?? null,
          account_manager: input.accountManager,
          technical_lead: input.technicalLead,
          sales_stage_id: String(input.salesStageId),
          stage_entered_at: now,
          product_revenue: input.productRevenue,
          pricing_model_id: String(input.pricingModelId),
          contract_term_years: input.contractTermYears,
          deal_currency: input.dealCurrency,
          expected_close_date: input.expectedCloseDate ?? null,
          landed_at: input.landedAt ?? new Date().toISOString().slice(0, 10),
          win_probability_pct: input.winProbabilityPct ?? null,
          committed: formatBoolean(input.committed ?? false),
          services_revenue: input.servicesRevenue,
          services_tier_id: String(input.servicesTierId),
          manager_strategic_blueprint: input.managerStrategicBlueprint ?? null,
          speaker_notes: input.speakerNotes ?? null,
          loss_archetype_id: input.lossArchetypeId != null ? String(input.lossArchetypeId) : null,
          competitor_id: input.competitorId != null ? String(input.competitorId) : null,
          compliance_driver_id:
            input.complianceDriverId != null ? String(input.complianceDriverId) : null,
          estimated_log_sources: input.estimatedLogSources ?? null,
          ad360_seat_count: input.ad360SeatCount ?? null,
          ad360_feature_notes: input.ad360FeatureNotes ?? null,
          created_at: now,
          updated_at: now,
          natural_key: `${input.accountName}:${input.dealName}`,
        });
        return rowToEnterpriseDeal(created);
      } catch (err) {
        if (isDuplicateValueError(err)) {
          throw new DuplicateDealError("A deal with this account and name already exists");
        }
        throw err;
      }
    },
    /** Partial update. Pass the CURRENT dealName/accountName too when neither changes, so natural_key stays correct. */
    async update(
      id: string,
      current: Pick<EnterpriseDeal, "dealName" | "accountName">,
      updates: UpdateEnterpriseDealInput,
    ): Promise<void> {
      const rows = await fetchAllRows(catalystApp, TABLE.enterpriseDeals);
      const existing = rows.find((r) => r["id"] === id);
      if (!existing) return;

      const values: Record<string, unknown> = {};
      if (updates.dealName !== undefined) values["deal_name"] = updates.dealName;
      if (updates.accountName !== undefined) values["account_name"] = updates.accountName;
      if (updates.crmRecordUrl !== undefined) values["crm_record_url"] = updates.crmRecordUrl;
      if (updates.accountManager !== undefined) values["account_manager"] = updates.accountManager;
      if (updates.technicalLead !== undefined) values["technical_lead"] = updates.technicalLead;
      if (updates.salesStageId !== undefined) values["sales_stage_id"] = String(updates.salesStageId);
      if (updates.stageEnteredAt !== undefined)
        values["stage_entered_at"] = formatCatalystDateTime(updates.stageEnteredAt);
      if (updates.productRevenue !== undefined) values["product_revenue"] = updates.productRevenue;
      if (updates.pricingModelId !== undefined) values["pricing_model_id"] = String(updates.pricingModelId);
      if (updates.contractTermYears !== undefined) values["contract_term_years"] = updates.contractTermYears;
      if (updates.dealCurrency !== undefined) values["deal_currency"] = updates.dealCurrency;
      if (updates.expectedCloseDate !== undefined) values["expected_close_date"] = updates.expectedCloseDate;
      if (updates.landedAt !== undefined) values["landed_at"] = updates.landedAt;
      if (updates.winProbabilityPct !== undefined) values["win_probability_pct"] = updates.winProbabilityPct;
      if (updates.committed !== undefined) values["committed"] = formatBoolean(updates.committed);
      if (updates.servicesRevenue !== undefined) values["services_revenue"] = updates.servicesRevenue;
      if (updates.servicesTierId !== undefined) values["services_tier_id"] = String(updates.servicesTierId);
      if (updates.managerStrategicBlueprint !== undefined)
        values["manager_strategic_blueprint"] = updates.managerStrategicBlueprint;
      if (updates.speakerNotes !== undefined) values["speaker_notes"] = updates.speakerNotes;
      if (updates.lossArchetypeId !== undefined)
        values["loss_archetype_id"] = updates.lossArchetypeId != null ? String(updates.lossArchetypeId) : null;
      if (updates.lossReason !== undefined) values["loss_reason"] = updates.lossReason;
      if (updates.competitorId !== undefined)
        values["competitor_id"] = updates.competitorId != null ? String(updates.competitorId) : null;
      if (updates.complianceDriverId !== undefined)
        values["compliance_driver_id"] =
          updates.complianceDriverId != null ? String(updates.complianceDriverId) : null;
      if (updates.complianceDeadline !== undefined) values["compliance_deadline"] = updates.complianceDeadline;
      if (updates.estimatedLogSources !== undefined) values["estimated_log_sources"] = updates.estimatedLogSources;
      if (updates.ad360SeatCount !== undefined) values["ad360_seat_count"] = updates.ad360SeatCount;
      if (updates.ad360FeatureNotes !== undefined) values["ad360_feature_notes"] = updates.ad360FeatureNotes;
      if (updates.archivedAt !== undefined)
        values["archived_at"] = updates.archivedAt ? formatCatalystDateTime(updates.archivedAt) : null;
      if (updates.deletedAt !== undefined)
        values["deleted_at"] = updates.deletedAt ? formatCatalystDateTime(updates.deletedAt) : null;

      const nextDealName = updates.dealName ?? current.dealName;
      const nextAccountName = updates.accountName ?? current.accountName;
      if (updates.dealName !== undefined || updates.accountName !== undefined) {
        values["natural_key"] = `${nextAccountName}:${nextDealName}`;
      }
      values["updated_at"] = formatCatalystDateTime(new Date());

      try {
        await updateRow(catalystApp, TABLE.enterpriseDeals, existing["ROWID"], values);
      } catch (err) {
        if (isDuplicateValueError(err)) {
          throw new DuplicateDealError("A deal with this account and name already exists");
        }
        throw err;
      }
    },
  };
}

// -------------------------------------------------------------- Technical gates

export interface DealTechnicalGate {
  dealId: string;
  gateCode: string;
  isCompleted: boolean;
  completedAt: Date | null;
  completedBy: string | null;
  notes: string | null;
}

function rowToGate(r: RawRow): DealTechnicalGate {
  return {
    dealId: r["deal_id"],
    gateCode: r["gate_code"],
    isCompleted: parseBoolean(r["is_completed"]),
    completedAt: optDate(r["completed_at"]),
    completedBy: r["completed_by"] || null,
    notes: r["notes"] || null,
  };
}

export function createDealTechnicalGatesRepo(catalystApp: CatalystApp) {
  return {
    async list(dealId: string): Promise<DealTechnicalGate[]> {
      const rows = await fetchAllRows(catalystApp, TABLE.dealTechnicalGates);
      return rows.filter((r) => r["deal_id"] === dealId).map(rowToGate);
    },
    /** Every gate row across every deal — used by the analytics gate-completion funnel and roster gatesPct. */
    async listAll(): Promise<DealTechnicalGate[]> {
      const rows = await fetchAllRows(catalystApp, TABLE.dealTechnicalGates);
      return rows.map(rowToGate);
    },
    /** Insert-or-update by (dealId, gateCode) — mirrors the natural_key. */
    async upsert(
      dealId: string,
      gateCode: string,
      values: { isCompleted: boolean; completedAt: Date | null; completedBy: string | null; notes: string | null },
    ): Promise<void> {
      const naturalKey = `${dealId}:${gateCode}`;
      const rows = await fetchAllRows(catalystApp, TABLE.dealTechnicalGates);
      const existing = rows.find((r) => r["natural_key"] === naturalKey);
      const payload = {
        is_completed: formatBoolean(values.isCompleted),
        completed_at: values.completedAt ? formatCatalystDateTime(values.completedAt) : null,
        completed_by: values.completedBy,
        notes: values.notes,
        updated_at: formatCatalystDateTime(new Date()),
      };
      if (existing) {
        await updateRow(catalystApp, TABLE.dealTechnicalGates, existing["ROWID"], payload);
      } else {
        const now = formatCatalystDateTime(new Date());
        await insertRow(catalystApp, TABLE.dealTechnicalGates, {
          id: crypto.randomUUID(),
          deal_id: dealId,
          gate_code: gateCode,
          created_at: now,
          natural_key: naturalKey,
          ...payload,
        });
      }
    },
    /** Seed one row per active gate definition for a newly-created deal — skips gates that already exist. */
    async seedForDeal(dealId: string, gateCodes: string[]): Promise<void> {
      if (gateCodes.length === 0) return;
      const rows = await fetchAllRows(catalystApp, TABLE.dealTechnicalGates);
      const existingCodes = new Set(rows.filter((r) => r["deal_id"] === dealId).map((r) => r["gate_code"]));
      const now = formatCatalystDateTime(new Date());
      for (const gateCode of gateCodes) {
        if (existingCodes.has(gateCode)) continue;
        await insertRow(catalystApp, TABLE.dealTechnicalGates, {
          id: crypto.randomUUID(),
          deal_id: dealId,
          gate_code: gateCode,
          is_completed: formatBoolean(false),
          created_at: now,
          updated_at: now,
          natural_key: `${dealId}:${gateCode}`,
        });
      }
    },
  };
}

// -------------------------------------------------------------- Cross-sells / product interests / ad360 / compliance drivers (join tables)

export interface DealCrossSell {
  dealId: string;
  productId: string;
  isPitched: boolean;
  notes: string | null;
}

export function createDealCrossSellsRepo(catalystApp: CatalystApp) {
  return {
    async list(dealId: string): Promise<DealCrossSell[]> {
      const rows = await fetchAllRows(catalystApp, TABLE.dealCrossSells);
      return rows
        .filter((r) => r["deal_id"] === dealId)
        .map((r) => ({
          dealId: r["deal_id"],
          productId: r["product_id"],
          isPitched: parseBoolean(r["is_pitched"]),
          notes: r["notes"] || null,
        }));
    },
    /** Replace the full pitched-product set for a deal (matches the Drizzle delete-then-insert semantics). */
    async replaceSet(dealId: string, productIds: string[]): Promise<void> {
      const rows = await fetchAllRows(catalystApp, TABLE.dealCrossSells);
      const existing = rows.filter((r) => r["deal_id"] === dealId);
      for (const row of existing) {
        await deleteRow(catalystApp, TABLE.dealCrossSells, row["ROWID"]);
      }
      const now = formatCatalystDateTime(new Date());
      for (const productId of productIds) {
        await insertRow(catalystApp, TABLE.dealCrossSells, {
          deal_id: dealId,
          product_id: productId,
          is_pitched: formatBoolean(true),
          pitched_at: now,
          natural_key: `${dealId}:${productId}`,
        });
      }
    },
  };
}

export function createDealProductInterestsRepo(catalystApp: CatalystApp) {
  return {
    async list(dealId: string): Promise<{ dealId: string; productId: string }[]> {
      const rows = await fetchAllRows(catalystApp, TABLE.dealProductInterests);
      return rows
        .filter((r) => r["deal_id"] === dealId)
        .map((r) => ({ dealId: r["deal_id"], productId: r["product_id"] }));
    },
    /** Every (deal, product) interest link across every deal — used by the competitive-loss suite join. */
    async listAll(): Promise<{ dealId: string; productId: string }[]> {
      const rows = await fetchAllRows(catalystApp, TABLE.dealProductInterests);
      return rows.map((r) => ({ dealId: r["deal_id"], productId: r["product_id"] }));
    },
    async replaceSet(dealId: string, productIds: string[]): Promise<void> {
      const rows = await fetchAllRows(catalystApp, TABLE.dealProductInterests);
      const existing = rows.filter((r) => r["deal_id"] === dealId);
      for (const row of existing) {
        await deleteRow(catalystApp, TABLE.dealProductInterests, row["ROWID"]);
      }
      const now = formatCatalystDateTime(new Date());
      for (const productId of productIds) {
        await insertRow(catalystApp, TABLE.dealProductInterests, {
          deal_id: dealId,
          product_id: productId,
          noted_at: now,
          natural_key: `${dealId}:${productId}`,
        });
      }
    },
  };
}

export function createDealAd360FeaturesRepo(catalystApp: CatalystApp) {
  return {
    async list(dealId: string): Promise<{ dealId: string; featureId: number }[]> {
      const rows = await fetchAllRows(catalystApp, TABLE.dealAd360Features);
      return rows
        .filter((r) => r["deal_id"] === dealId)
        .map((r) => ({ dealId: r["deal_id"], featureId: Number(r["feature_id"]) }));
    },
    async replaceSet(dealId: string, featureIds: number[]): Promise<void> {
      const rows = await fetchAllRows(catalystApp, TABLE.dealAd360Features);
      const existing = rows.filter((r) => r["deal_id"] === dealId);
      for (const row of existing) {
        await deleteRow(catalystApp, TABLE.dealAd360Features, row["ROWID"]);
      }
      for (const featureId of featureIds) {
        await insertRow(catalystApp, TABLE.dealAd360Features, {
          deal_id: dealId,
          feature_id: String(featureId),
          natural_key: `${dealId}:${featureId}`,
        });
      }
    },
  };
}

export function createDealComplianceDriversRepo(catalystApp: CatalystApp) {
  return {
    async list(dealId: string): Promise<{ dealId: string; complianceDriverId: number }[]> {
      const rows = await fetchAllRows(catalystApp, TABLE.dealComplianceDrivers);
      return rows
        .filter((r) => r["deal_id"] === dealId)
        .map((r) => ({ dealId: r["deal_id"], complianceDriverId: Number(r["compliance_driver_id"]) }));
    },
    async replaceSet(dealId: string, driverIds: number[]): Promise<void> {
      const rows = await fetchAllRows(catalystApp, TABLE.dealComplianceDrivers);
      const existing = rows.filter((r) => r["deal_id"] === dealId);
      for (const row of existing) {
        await deleteRow(catalystApp, TABLE.dealComplianceDrivers, row["ROWID"]);
      }
      for (const complianceDriverId of driverIds) {
        await insertRow(catalystApp, TABLE.dealComplianceDrivers, {
          deal_id: dealId,
          compliance_driver_id: String(complianceDriverId),
          natural_key: `${dealId}:${complianceDriverId}`,
        });
      }
    },
  };
}

// -------------------------------------------------------------- Blockers

export interface DealBlocker {
  id: string;
  dealId: string;
  categoryId: number;
  severityId: number;
  description: string;
  isResolved: boolean;
  resolvedAt: Date | null;
  resolutionNotes: string | null;
  loggedAt: Date;
}

function rowToBlocker(r: RawRow): DealBlocker {
  return {
    id: r["id"],
    dealId: r["deal_id"],
    categoryId: Number(r["category_id"]),
    severityId: Number(r["severity_id"]),
    description: r["description"],
    isResolved: parseBoolean(r["is_resolved"]),
    resolvedAt: optDate(r["resolved_at"]),
    resolutionNotes: r["resolution_notes"] || null,
    loggedAt: parseCatalystDateTime(r["logged_at"]),
  };
}

export function createDealBlockersRepo(catalystApp: CatalystApp) {
  return {
    async list(dealId: string): Promise<DealBlocker[]> {
      const rows = await fetchAllRows(catalystApp, TABLE.dealBlockers);
      return rows.filter((r) => r["deal_id"] === dealId).map(rowToBlocker);
    },
    /** Every blocker across every deal — used only for the deal-roster free-text search. */
    async listAll(): Promise<DealBlocker[]> {
      const rows = await fetchAllRows(catalystApp, TABLE.dealBlockers);
      return rows.map(rowToBlocker);
    },
    async getById(id: string): Promise<DealBlocker | null> {
      const rows = await fetchAllRows(catalystApp, TABLE.dealBlockers);
      const row = rows.find((r) => r["id"] === id);
      return row ? rowToBlocker(row) : null;
    },
    async create(input: { dealId: string; categoryId: number; severityId: number; description: string }): Promise<DealBlocker> {
      const now = formatCatalystDateTime(new Date());
      const created = await insertRow(catalystApp, TABLE.dealBlockers, {
        id: crypto.randomUUID(),
        deal_id: input.dealId,
        category_id: String(input.categoryId),
        severity_id: String(input.severityId),
        description: input.description,
        is_resolved: formatBoolean(false),
        logged_at: now,
        updated_at: now,
      });
      return rowToBlocker(created);
    },
    async update(
      id: string,
      updates: { isResolved?: boolean; resolutionNotes?: string | null; severityId?: number },
    ): Promise<void> {
      const rows = await fetchAllRows(catalystApp, TABLE.dealBlockers);
      const existing = rows.find((r) => r["id"] === id);
      if (!existing) return;
      const values: Record<string, unknown> = { updated_at: formatCatalystDateTime(new Date()) };
      if (updates.isResolved !== undefined) {
        values["is_resolved"] = formatBoolean(updates.isResolved);
        values["resolved_at"] = updates.isResolved ? formatCatalystDateTime(new Date()) : null;
      }
      if (updates.resolutionNotes !== undefined) values["resolution_notes"] = updates.resolutionNotes;
      if (updates.severityId !== undefined) values["severity_id"] = String(updates.severityId);
      await updateRow(catalystApp, TABLE.dealBlockers, existing["ROWID"], values);
    },
    async delete(id: string, dealId: string): Promise<boolean> {
      const rows = await fetchAllRows(catalystApp, TABLE.dealBlockers);
      const existing = rows.find((r) => r["id"] === id && r["deal_id"] === dealId);
      if (!existing) return false;
      await deleteRow(catalystApp, TABLE.dealBlockers, existing["ROWID"]);
      return true;
    },
  };
}

// -------------------------------------------------------------- Audit log

export interface DealAuditEntry {
  id: string;
  dealId: string;
  entityType: string;
  entityId: string | null;
  fieldChanged: string;
  oldValue: string | null;
  newValue: string | null;
  changedBy: string;
  changedAt: Date;
}

function rowToAuditEntry(r: RawRow): DealAuditEntry {
  return {
    id: r["id"],
    dealId: r["deal_id"],
    entityType: r["entity_type"],
    entityId: r["entity_id"] || null,
    fieldChanged: r["field_changed"],
    oldValue: r["old_value"] || null,
    newValue: r["new_value"] || null,
    changedBy: r["changed_by"],
    changedAt: parseCatalystDateTime(r["changed_at"]),
  };
}

export interface WriteAuditEntry {
  dealId: string;
  entityType: string;
  entityId?: string | null;
  fieldChanged: string;
  oldValue?: string | null;
  newValue?: string | null;
  changedBy: string;
}

export function createDealAuditLogRepo(catalystApp: CatalystApp) {
  return {
    async list(dealId: string): Promise<DealAuditEntry[]> {
      const rows = await fetchAllRows(catalystApp, TABLE.dealAuditLog);
      return rows
        .filter((r) => r["deal_id"] === dealId)
        .map(rowToAuditEntry)
        .sort((a, b) => b.changedAt.getTime() - a.changedAt.getTime());
    },
    /** Every audit entry across every deal — used by the portfolio summary's "changes since review" batch query. */
    async listAll(): Promise<DealAuditEntry[]> {
      const rows = await fetchAllRows(catalystApp, TABLE.dealAuditLog);
      return rows.map(rowToAuditEntry);
    },
    async write(entries: WriteAuditEntry | WriteAuditEntry[]): Promise<void> {
      const list = Array.isArray(entries) ? entries : [entries];
      if (list.length === 0) return;
      const now = formatCatalystDateTime(new Date());
      for (const e of list) {
        await insertRow(catalystApp, TABLE.dealAuditLog, {
          id: crypto.randomUUID(),
          deal_id: e.dealId,
          entity_type: e.entityType,
          entity_id: e.entityId ?? null,
          field_changed: e.fieldChanged,
          old_value: e.oldValue ?? null,
          new_value: e.newValue ?? null,
          changed_by: e.changedBy,
          changed_at: now,
        });
      }
    },
  };
}

// -------------------------------------------------------------- Alert dispositions

export interface DealAlertDisposition {
  id: string;
  dealId: string;
  patternCode: string;
  disposition: "acknowledge" | "accept" | "snooze";
  rationale: string | null;
  snoozeUntilFieldChange: string | null;
  snoozeUntil: Date | null;
  snoozeFieldBaseline: string | null;
  createdBy: string;
  createdAt: Date;
}

function rowToDisposition(r: RawRow): DealAlertDisposition {
  return {
    id: r["id"],
    dealId: r["deal_id"],
    patternCode: r["pattern_code"],
    disposition: r["disposition"] as DealAlertDisposition["disposition"],
    rationale: r["rationale"] || null,
    snoozeUntilFieldChange: r["snooze_until_field_change"] || null,
    snoozeUntil: optDate(r["snooze_until"]),
    snoozeFieldBaseline: r["snooze_field_baseline"] || null,
    createdBy: r["created_by"],
    createdAt: parseCatalystDateTime(r["created_at"]),
  };
}

export function createDealAlertDispositionsRepo(catalystApp: CatalystApp) {
  return {
    async list(dealId: string): Promise<DealAlertDisposition[]> {
      const rows = await fetchAllRows(catalystApp, TABLE.dealAlertDispositions);
      return rows.filter((r) => r["deal_id"] === dealId).map(rowToDisposition);
    },
    /** Insert-or-update by (dealId, patternCode). */
    async upsert(input: {
      dealId: string;
      patternCode: string;
      disposition: "acknowledge" | "accept" | "snooze";
      rationale: string | null;
      snoozeUntilFieldChange: string | null;
      snoozeUntil: Date | null;
      snoozeFieldBaseline: string | null;
      createdBy: string;
    }): Promise<DealAlertDisposition> {
      const naturalKey = `${input.dealId}:${input.patternCode}`;
      const rows = await fetchAllRows(catalystApp, TABLE.dealAlertDispositions);
      const existing = rows.find((r) => r["natural_key"] === naturalKey);
      const payload = {
        disposition: input.disposition,
        rationale: input.rationale,
        snooze_until_field_change: input.snoozeUntilFieldChange,
        snooze_until: input.snoozeUntil ? formatCatalystDateTime(input.snoozeUntil) : null,
        snooze_field_baseline: input.snoozeFieldBaseline,
        created_by: input.createdBy,
        updated_at: formatCatalystDateTime(new Date()),
      };
      if (existing) {
        const updated = await updateRow(catalystApp, TABLE.dealAlertDispositions, existing["ROWID"], payload);
        return rowToDisposition(updated);
      }
      const now = formatCatalystDateTime(new Date());
      const created = await insertRow(catalystApp, TABLE.dealAlertDispositions, {
        id: crypto.randomUUID(),
        deal_id: input.dealId,
        pattern_code: input.patternCode,
        created_at: now,
        natural_key: naturalKey,
        ...payload,
      });
      return rowToDisposition(created);
    },
    async delete(dealId: string, patternCode: string): Promise<boolean> {
      const naturalKey = `${dealId}:${patternCode}`;
      const rows = await fetchAllRows(catalystApp, TABLE.dealAlertDispositions);
      const existing = rows.find((r) => r["natural_key"] === naturalKey);
      if (!existing) return false;
      await deleteRow(catalystApp, TABLE.dealAlertDispositions, existing["ROWID"]);
      return true;
    },
    /** Best-effort delete of lapsed snoozes found during a read — mirrors the fire-and-forget `.catch(() => {})` in the original. */
    async deleteByIds(ids: string[]): Promise<void> {
      if (ids.length === 0) return;
      try {
        const rows = await fetchAllRows(catalystApp, TABLE.dealAlertDispositions);
        const idSet = new Set(ids);
        for (const row of rows) {
          if (idSet.has(row["id"])) {
            await deleteRow(catalystApp, TABLE.dealAlertDispositions, row["ROWID"]);
          }
        }
      } catch {
        // Best-effort — same lapsed row is simply re-evaluated (and re-deleted) next read.
      }
    },
  };
}

// -------------------------------------------------------------- Interventions

export interface DealIntervention {
  id: string;
  dealId: string;
  patternCode: string;
  checklistId: number;
  launchedBy: string;
  launchedAt: Date;
}

export function createDealInterventionsRepo(catalystApp: CatalystApp) {
  return {
    async create(input: { dealId: string; patternCode: string; checklistId: number; launchedBy: string }): Promise<DealIntervention> {
      const now = formatCatalystDateTime(new Date());
      const created = await insertRow(catalystApp, TABLE.dealInterventions, {
        id: crypto.randomUUID(),
        deal_id: input.dealId,
        pattern_code: input.patternCode,
        checklist_id: String(input.checklistId),
        launched_by: input.launchedBy,
        launched_at: now,
      });
      return {
        id: created["id"],
        dealId: created["deal_id"],
        patternCode: created["pattern_code"],
        checklistId: Number(created["checklist_id"]),
        launchedBy: created["launched_by"],
        launchedAt: parseCatalystDateTime(created["launched_at"]),
      };
    },
  };
}

// -------------------------------------------------------------- Stage overrides

export function createDealStageOverridesRepo(catalystApp: CatalystApp) {
  return {
    async create(input: {
      dealId: string;
      fromStage: number;
      toStage: number;
      patternCodes: string[];
      overrideReason: string;
      createdBy: string;
    }): Promise<void> {
      await insertRow(catalystApp, TABLE.dealStageOverrides, {
        id: crypto.randomUUID(),
        deal_id: input.dealId,
        from_stage: String(input.fromStage),
        to_stage: String(input.toStage),
        pattern_codes: toJson(input.patternCodes),
        override_reason: input.overrideReason,
        created_by: input.createdBy,
        created_at: formatCatalystDateTime(new Date()),
      });
    },
  };
}

// -------------------------------------------------------------- Bat-signals (share links)

export interface BatSignal {
  token: string;
  dealId: string;
  createdBy: string;
  expiresAt: Date;
  createdAt: Date;
}

export function createBatSignalsRepo(catalystApp: CatalystApp) {
  return {
    async getByToken(token: string): Promise<BatSignal | null> {
      const rows = await fetchAllRows(catalystApp, TABLE.batSignals);
      const row = rows.find((r) => r["token"] === token);
      if (!row) return null;
      return {
        token: row["token"],
        dealId: row["deal_id"],
        createdBy: row["created_by"],
        expiresAt: parseCatalystDateTime(row["expires_at"]),
        createdAt: parseCatalystDateTime(row["created_at"]),
      };
    },
    async create(input: { dealId: string; createdBy: string; expiresAt: Date }): Promise<{ token: string }> {
      const token = crypto.randomUUID();
      const now = formatCatalystDateTime(new Date());
      await insertRow(catalystApp, TABLE.batSignals, {
        token,
        deal_id: input.dealId,
        created_by: input.createdBy,
        expires_at: formatCatalystDateTime(input.expiresAt),
        created_at: now,
      });
      return { token };
    },
  };
}

// -------------------------------------------------------------- Review markers

export function createDealReviewMarkersRepo(catalystApp: CatalystApp) {
  return {
    async upsert(dealId: string, reviewedBy: string): Promise<{ lastReviewedAt: Date; reviewedBy: string }> {
      const rows = await fetchAllRows(catalystApp, TABLE.dealReviewMarkers);
      const existing = rows.find((r) => r["deal_id"] === dealId);
      const now = new Date();
      const values = { last_reviewed_at: formatCatalystDateTime(now), reviewed_by: reviewedBy };
      if (existing) {
        await updateRow(catalystApp, TABLE.dealReviewMarkers, existing["ROWID"], values);
      } else {
        await insertRow(catalystApp, TABLE.dealReviewMarkers, { deal_id: dealId, ...values });
      }
      return { lastReviewedAt: now, reviewedBy };
    },
    /** Returns a Map of dealId -> lastReviewedAt, for the batched "changes since review" query. */
    async mapByDeal(): Promise<Map<string, Date>> {
      const rows = await fetchAllRows(catalystApp, TABLE.dealReviewMarkers);
      return new Map(rows.map((r) => [r["deal_id"], parseCatalystDateTime(r["last_reviewed_at"])]));
    },
  };
}
