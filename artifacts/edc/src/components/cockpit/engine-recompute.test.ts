import { describe, it, expect, vi } from "vitest";
import {
  processDealIntelligence,
  calculateOwnMomentum,
  type RawDeal,
  type RawGate,
  type RawBlocker,
  type RawDisposition,
  type EngineThresholds,
  type IntelligenceOutput,
  type AuditRow,
} from "@workspace/engine";

/**
 * Parity test: the browser Risk Simulator (engine-recompute.ts) must produce
 * the exact same engine output as the server's intelligence assembly
 * (artifacts/api-server/src/lib/intelligence.ts) for the same underlying deal.
 *
 * Both layers transform raw data into the pure engine's input shape
 * independently, then call the SAME `processDealIntelligence`. The risk this
 * test guards against is a drift in those two adapter layers: a field the
 * server feeds the engine that the client fails to reconstruct from the
 * serialized API payload (or builds differently) would make the simulator's
 * "what-if" baseline silently disagree with the live cockpit.
 *
 * Strategy:
 *   1. Define one representative deal as "ground truth" (the DB-equivalent).
 *   2. SERVER REFERENCE: build the engine inputs exactly as intelligence.ts
 *      does and call the engine. This is the canonical server result.
 *   3. Serialize that result into the API payload shape the server actually
 *      returns to the browser (mirroring serializeDeal + shapeIntelligence).
 *   4. CLIENT PATH: run the real `useEngineContext` + `recomputeIntelligence`
 *      over that serialized payload (no overrides).
 *   5. Assert the client's alerts/health/financials match the server's.
 *
 * `useEngineContext` is a React hook; we stub `react`'s `useMemo` so it can be
 * invoked as a plain function, and stub `@workspace/api-client-react` so its
 * data hooks return the same threshold/audit rows the server read. This keeps
 * the real client reconstruction logic under test while staying hermetic.
 */

const DAY = 1000 * 60 * 60 * 24;
const daysFromNow = (n: number) => new Date(Date.now() + n * DAY).toISOString();
const daysAgo = (n: number) => daysFromNow(-n);

interface ThresholdRow {
  parameterKey: string;
  parameterValue: string;
  dataType: string;
}

interface AuditRowCamel {
  entityType: string;
  fieldChanged: string;
  newValue: string | boolean | null;
  changedAt: string;
}

// Controllable data the stubbed api-client-react hooks return. Set per-test
// before invoking useEngineContext.
const hookState = vi.hoisted(() => ({
  thresholdRows: [] as ThresholdRow[],
  auditRows: [] as AuditRowCamel[],
}));

vi.mock("react", () => ({
  // useEngineContext only uses useMemo; invoke the factory eagerly so the hook
  // runs as a plain function outside a React render.
  useMemo: (fn: () => unknown) => fn(),
}));

vi.mock("@workspace/api-client-react", () => ({
  useListEngineThresholds: () => ({ data: { data: hookState.thresholdRows } }),
  useListAudit: () => ({ data: { data: hookState.auditRows } }),
}));

// Imported after the mocks so the stubbed react/api-client-react are used.
import {
  useEngineContext,
  recomputeIntelligence,
  DEFAULT_THRESHOLDS,
} from "./engine-recompute";

interface GroundTruth {
  rawDeal: RawDeal;
  gates: RawGate[];
  blockers: RawBlocker[];
  /** engine_thresholds rows that override the seeded defaults. */
  thresholdRows: ThresholdRow[];
  /** deal_audit_log rows that drive own-momentum. */
  auditRows: AuditRowCamel[];
  dispositions: RawDisposition[];
  catalogCount: number;
  fxRate: number | null;
}

/** Parse threshold rows on top of defaults — identical to both adapters. */
function buildThresholds(rows: ThresholdRow[]): EngineThresholds {
  const t: EngineThresholds = { ...DEFAULT_THRESHOLDS };
  for (const row of rows) {
    const num = Number(row.parameterValue);
    t[row.parameterKey] =
      row.dataType === "string" || Number.isNaN(num)
        ? row.parameterValue
        : num;
  }
  return t;
}

/**
 * SERVER REFERENCE — mirrors artifacts/api-server/src/lib/intelligence.ts
 * (assembleDealIntelligence): assemble engine inputs from raw data and run the
 * pure engine. Kept intentionally close to the server adapter so a change in
 * how the server feeds the engine would break this test.
 */
function runServer(gt: GroundTruth): IntelligenceOutput {
  const thresholds = buildThresholds(gt.thresholdRows);
  const reportingCurrency = String(thresholds.reporting_currency || "USD");

  // Server computes momentum from snake_case audit rows.
  const auditForMomentum: AuditRow[] = gt.auditRows.map((a) => ({
    entity_type: a.entityType,
    field_changed: a.fieldChanged,
    new_value: a.newValue,
    changed_at: a.changedAt,
  }));
  const ownMomentum = calculateOwnMomentum(
    { created_at: gt.rawDeal.created_at },
    auditForMomentum,
    thresholds,
  );

  return processDealIntelligence(gt.rawDeal, gt.gates, gt.blockers, thresholds, {
    fxRate: gt.fxRate,
    reportingCurrency,
    catalogCount: gt.catalogCount,
    ownMomentum,
    dispositions: gt.dispositions,
    seededDefaults: { ...DEFAULT_THRESHOLDS } as Record<string, string | number>,
  });
}

/**
 * Serialize the server's engine output into the API payload the browser
 * receives — mirrors serializeDeal (the Deal) and shapeIntelligence (the
 * Intelligence). Only fields the server actually emits are included, so the
 * client reading a field the server never serializes would be caught.
 */
function serialize(gt: GroundTruth, server: IntelligenceOutput) {
  const deal = {
    id: gt.rawDeal.id,
    dealName: gt.rawDeal.deal_name,
    accountName: gt.rawDeal.account_name,
    crmRecordUrl: gt.rawDeal.crm_record_url,
    accountManager: gt.rawDeal.account_manager,
    technicalLead: gt.rawDeal.technical_lead,
    salesStage: gt.rawDeal.sales_stage,
    stageEnteredAt: gt.rawDeal.stage_entered_at,
    productRevenue: Number(gt.rawDeal.product_revenue),
    pricingModel: gt.rawDeal.pricing_model,
    contractTermYears: Number(gt.rawDeal.contract_term_years),
    dealCurrency: gt.rawDeal.deal_currency,
    expectedCloseDate: gt.rawDeal.expected_close_date,
    winProbabilityPct: gt.rawDeal.win_probability_pct,
    servicesRevenue: Number(gt.rawDeal.services_revenue),
    servicesTier: gt.rawDeal.services_tier,
    managerStrategicBlueprint: gt.rawDeal.manager_strategic_blueprint,
    createdAt: gt.rawDeal.created_at,
    updatedAt: gt.rawDeal.updated_at,
  };

  // shapeIntelligence spreads the engine output and overlays crossSell
  // whitespace + gates; the client reads back crossSells, catalogCount, gates,
  // and the blocker counts.
  const intel = {
    ...server,
    financials: {
      ...server.financials,
      crossSell: {
        ...server.financials.crossSell,
        attachRate: server.financials.crossSell.attachRate ?? 0,
        whitespace: [],
      },
    },
    technicalTrack: {
      ...server.technicalTrack,
      gates: server.technicalTrack.gates,
    },
    governance: {
      ...server.governance,
      alerts: server.governance.alerts,
      managedAlerts: server.governance.managedAlerts,
    },
  };

  return { deal, intel };
}

/** CLIENT PATH — real useEngineContext + recomputeIntelligence, no overrides. */
function runClient(
  gt: GroundTruth,
  deal: ReturnType<typeof serialize>["deal"],
  intel: ReturnType<typeof serialize>["intel"],
): IntelligenceOutput {
  hookState.thresholdRows = gt.thresholdRows;
  hookState.auditRows = gt.auditRows;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const ctx = useEngineContext(deal as any, intel as any);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return recomputeIntelligence(deal as any, intel as any, {}, ctx);
}

/** Compares the engine-relevant surface of two outputs. */
function assertParity(client: IntelligenceOutput, server: IntelligenceOutput) {
  // Full governance surface: codes, severities, messages, explanations
  // (incl. threshold provenance) and disposition state.
  expect(client.governance).toEqual(server.governance);

  // Financials that drive the risk patterns.
  expect(client.financials.calculatedTCV).toBe(server.financials.calculatedTCV);
  expect(client.financials.normalizedTCV).toBe(server.financials.normalizedTCV);
  expect(client.financials.fxRateApplied).toBe(server.financials.fxRateApplied);
  expect(client.financials.crossSell.pitchedCount).toBe(
    server.financials.crossSell.pitchedCount,
  );
  expect(client.financials.crossSell.catalogCount).toBe(
    server.financials.crossSell.catalogCount,
  );
  expect(client.financials.crossSell.attachRate).toBe(
    server.financials.crossSell.attachRate,
  );

  // Technical track roll-up.
  expect(client.technicalTrack.progressPercentage).toBe(
    server.technicalTrack.progressPercentage,
  );
  expect(client.technicalTrack.stepsCompleted).toBe(
    server.technicalTrack.stepsCompleted,
  );
  expect(client.technicalTrack.totalSteps).toBe(
    server.technicalTrack.totalSteps,
  );
  expect(client.technicalTrack.currentMilestone).toBe(
    server.technicalTrack.currentMilestone,
  );
}

function alertByCode(out: IntelligenceOutput, code: string) {
  return [...out.governance.alerts, ...out.governance.managedAlerts].find(
    (a) => a.code === code,
  );
}

function provenanceOf(
  out: IntelligenceOutput,
  code: string,
  key: string,
): "default" | "tuned" | undefined {
  return alertByCode(out, code)?.explanation?.thresholdsUsed.find(
    (t) => t.key === key,
  )?.source;
}

/**
 * A rich, decelerating mega-deal that fires many patterns at once and exercises
 * tuned thresholds, own-momentum, cross-sell attach, blockers and a disposition.
 */
function richDeal(): GroundTruth {
  const rawDeal: RawDeal = {
    id: "deal-rich",
    deal_name: "Globex Platform Expansion",
    account_name: "Globex",
    crm_record_url: "https://crm.example.com/deal-rich",
    account_manager: "Alice",
    technical_lead: "Bob",
    sales_stage: "Commercial",
    stage_entered_at: daysAgo(30),
    product_revenue: 1_200_000,
    pricing_model: "Annual",
    contract_term_years: 1,
    deal_currency: "USD",
    expected_close_date: daysFromNow(20),
    win_probability_pct: 60,
    services_revenue: 0,
    services_tier: "None",
    manager_strategic_blueprint: null,
    created_at: daysAgo(90),
    updated_at: daysAgo(2),
    cross_sells: [
      {
        productId: "p1",
        productName: "Analytics",
        productCategory: "Add-on",
        isPitched: true,
      },
      {
        productId: "p2",
        productName: "Support+",
        productCategory: "Service",
        isPitched: false,
      },
      {
        productId: "p3",
        productName: "Connector",
        productCategory: "Add-on",
        isPitched: false,
      },
    ],
  };

  const gates: RawGate[] = [
    {
      gate_code: "G1_CRITERIA_LOCKED",
      gate_group: 1,
      label: "Criteria Locked",
      is_completed: false,
      completed_at: null,
      prerequisite_gate_codes: [],
    },
    {
      gate_code: "G1_EXECUTIVE_AGREED",
      gate_group: 1,
      label: "Executive Agreed",
      is_completed: false,
      completed_at: null,
      prerequisite_gate_codes: [],
    },
    {
      gate_code: "G2_CORE_VALIDATED",
      gate_group: 2,
      label: "Core Validated",
      is_completed: true,
      completed_at: daysAgo(45),
      prerequisite_gate_codes: [],
    },
    {
      gate_code: "G3_PERFORMANCE_PASSED",
      gate_group: 3,
      label: "Performance Passed",
      is_completed: false,
      completed_at: null,
      prerequisite_gate_codes: [],
    },
    {
      gate_code: "G4_INFOSEC_CLEARED",
      gate_group: 4,
      label: "InfoSec Cleared",
      is_completed: true,
      completed_at: daysAgo(50),
      prerequisite_gate_codes: [],
    },
  ];

  const blockers: RawBlocker[] = [
    { severity_name: "High" },
    { severity_name: "High" },
    { severity_name: "Medium" },
  ];

  // Gate completions clustered 45-55 days ago and none recently -> a sharp
  // momentum drop that, with a near close date and low gate %, fires
  // SLOW_MOTION_COLLISION.
  const auditRows: AuditRowCamel[] = [40, 45, 48, 52, 55, 60].map((d) => ({
    entityType: "gate",
    fieldChanged: "is_completed",
    newValue: true,
    changedAt: daysAgo(d),
  }));

  return {
    rawDeal,
    gates,
    blockers,
    thresholdRows: [
      // Tuned away from the seeded defaults -> provenance "tuned".
      {
        parameterKey: "elephant_tcv_threshold",
        parameterValue: "300000",
        dataType: "number",
      },
      {
        parameterKey: "stale_stage_days",
        parameterValue: "20",
        dataType: "number",
      },
    ],
    auditRows,
    dispositions: [
      {
        pattern_code: "UNPROTECTED_ELEPHANT",
        disposition: "acknowledge",
        rationale: "Known, services attach planned post-sale.",
        snooze_until_field_change: null,
      },
    ],
    catalogCount: 10,
    fxRate: 1,
  };
}

/** A healthy deal that fires nothing and uses only seeded defaults. */
function cleanDeal(): GroundTruth {
  const rawDeal: RawDeal = {
    id: "deal-clean",
    deal_name: "Initech Pilot",
    account_name: "Initech",
    crm_record_url: null,
    account_manager: "Carol",
    technical_lead: "Dave",
    sales_stage: "Discovery",
    stage_entered_at: daysAgo(1),
    product_revenue: 80_000,
    pricing_model: "Annual",
    contract_term_years: 1,
    deal_currency: "EUR",
    expected_close_date: daysFromNow(120),
    win_probability_pct: 40,
    services_revenue: 20_000,
    services_tier: "Premium",
    manager_strategic_blueprint:
      "Strategic blueprint notes comfortably longer than twenty characters.",
    created_at: daysAgo(3),
    updated_at: daysAgo(1),
    cross_sells: [],
  };

  return {
    rawDeal,
    gates: [
      {
        gate_code: "G1_CRITERIA_LOCKED",
        gate_group: 1,
        label: "Criteria Locked",
        is_completed: false,
        completed_at: null,
        prerequisite_gate_codes: [],
      },
    ],
    blockers: [],
    thresholdRows: [],
    auditRows: [],
    dispositions: [],
    catalogCount: 8,
    // Non-USD deal converted at a non-trivial FX rate to exercise normalization.
    fxRate: 1.1,
  };
}

describe("Risk Simulator vs server intelligence parity", () => {
  it("matches alerts, health and financials for a rich decelerating deal", () => {
    const gt = richDeal();
    const server = runServer(gt);
    const { deal, intel } = serialize(gt, server);
    const client = runClient(gt, deal, intel);

    assertParity(client, server);

    // Sanity: this scenario is genuinely exercising the engine, not an
    // accidental empty match.
    const firedCodes = [
      ...server.governance.alerts,
      ...server.governance.managedAlerts,
    ].map((a) => a.code);
    expect(firedCodes).toEqual(
      expect.arrayContaining([
        "PREMATURE_COMMERCIAL",
        "DISCOUNT_TRAP",
        "UNPROTECTED_ELEPHANT",
        "STALLED_VALIDATION",
        "CLOSE_DATE_PRESSURE",
        "UNRESOLVED_CRITICAL_BLOCKERS",
        "SLOW_MOTION_COLLISION",
        "LOW_ATTACH_ELEPHANT",
      ]),
    );
  });

  it("reconstructs the blocker counts so blocker-driven patterns agree", () => {
    const gt = richDeal();
    const server = runServer(gt);
    const { deal, intel } = serialize(gt, server);
    const client = runClient(gt, deal, intel);

    // Client only receives counts and rebuilds synthetic blockers; the engine
    // must still see the same active total and high-severity count.
    expect(client.governance.activeBlockerCount).toBe(3);
    expect(client.governance.highSeverityBlockerCount).toBe(2);
    expect(client.governance.activeBlockerCount).toBe(
      server.governance.activeBlockerCount,
    );
    expect(client.governance.highSeverityBlockerCount).toBe(
      server.governance.highSeverityBlockerCount,
    );
    expect(alertByCode(client, "UNRESOLVED_CRITICAL_BLOCKERS")).toBeDefined();
  });

  it("preserves threshold provenance (tuned vs default) across both paths", () => {
    const gt = richDeal();
    const server = runServer(gt);
    const { deal, intel } = serialize(gt, server);
    const client = runClient(gt, deal, intel);

    // Tuned thresholds report "tuned" on both sides.
    expect(provenanceOf(server, "UNPROTECTED_ELEPHANT", "elephant_tcv_threshold")).toBe("tuned");
    expect(provenanceOf(client, "UNPROTECTED_ELEPHANT", "elephant_tcv_threshold")).toBe("tuned");
    expect(provenanceOf(server, "STALLED_VALIDATION", "stale_stage_days")).toBe("tuned");
    expect(provenanceOf(client, "STALLED_VALIDATION", "stale_stage_days")).toBe("tuned");

    // An untouched threshold reports "default" on both sides.
    expect(provenanceOf(server, "CLOSE_DATE_PRESSURE", "close_date_warning_days")).toBe("default");
    expect(provenanceOf(client, "CLOSE_DATE_PRESSURE", "close_date_warning_days")).toBe("default");
  });

  it("derives identical own-momentum so the what-if SLOW_MOTION_COLLISION agrees", () => {
    const gt = richDeal();
    const server = runServer(gt);
    const { deal, intel } = serialize(gt, server);
    const client = runClient(gt, deal, intel);

    const serverAlert = alertByCode(server, "SLOW_MOTION_COLLISION");
    const clientAlert = alertByCode(client, "SLOW_MOTION_COLLISION");
    expect(serverAlert).toBeDefined();
    expect(clientAlert).toBeDefined();
    // The message embeds the computed momentum drop %, so equal messages prove
    // both paths derived the same momentum from the same audit history.
    expect(clientAlert!.message).toBe(serverAlert!.message);
  });

  it("matches a clean deal (GREEN, no alerts) with FX normalization", () => {
    const gt = cleanDeal();
    const server = runServer(gt);
    const { deal, intel } = serialize(gt, server);
    const client = runClient(gt, deal, intel);

    expect(server.governance.healthStatus).toBe("GREEN");
    expect(server.governance.alerts).toHaveLength(0);
    assertParity(client, server);
    // FX normalization carried faithfully (EUR -> USD at 1.1).
    expect(client.financials.normalizedTCV).toBe(server.financials.normalizedTCV);
    expect(client.financials.normalizedTCV).not.toBe(
      client.financials.calculatedTCV,
    );
  });

  it("stays faithful under a simulator what-if override (passing Gate 3)", () => {
    const gt = richDeal();
    const server = runServer(gt);
    const { deal, intel } = serialize(gt, server);

    hookState.thresholdRows = gt.thresholdRows;
    hookState.auditRows = gt.auditRows;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const ctx = useEngineContext(deal as any, intel as any);
    // What-if: mark Gate 3 complete in the simulator.
    const client = recomputeIntelligence(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      deal as any,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      intel as any,
      { gates: { G3_PERFORMANCE_PASSED: true } },
      ctx,
    );

    // The override must clear PREMATURE_COMMERCIAL relative to the server
    // baseline, while the server reference (no override) still shows it.
    expect(alertByCode(server, "PREMATURE_COMMERCIAL")).toBeDefined();
    expect(alertByCode(client, "PREMATURE_COMMERCIAL")).toBeUndefined();

    // Re-run the server with the same override applied to its raw gates; the
    // simulator's result must match that hypothetical server result exactly.
    const overridden: GroundTruth = {
      ...gt,
      gates: gt.gates.map((g) =>
        g.gate_code === "G3_PERFORMANCE_PASSED"
          ? { ...g, is_completed: true }
          : g,
      ),
    };
    const serverOverridden = runServer(overridden);
    assertParity(client, serverOverridden);
  });
});
