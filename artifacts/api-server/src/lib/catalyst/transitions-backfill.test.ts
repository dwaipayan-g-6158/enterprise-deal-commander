import { describe, it, expect, beforeAll, beforeEach } from "vitest";
import crypto from "node:crypto";
import {
  initCatalystApp,
  createEnterpriseDealsRepo,
  createPipelineTransitionsRepo,
  formatCatalystDateTime,
} from "@workspace/db/catalyst";
import type { StageDef } from "@workspace/engine";
import {
  installCatalystFake,
  seedStandardLookups,
  STAGES,
  PRICING_MODEL_ID,
  SERVICES_TIER_ID,
  type CatalystTestStore,
} from "../../test-support/catalyst-test-app";
import {
  planTransitionBackfill,
  runTransitionBackfill,
  type BackfillDeal,
  type BackfillAuditRow,
  type BackfillSnapshot,
  type ExistingTransition,
} from "./transitions-backfill";
import { cache } from "../cache";

// The Flow tab is built entirely on v2_pipeline_transitions, and on Catalyst
// that table held one row for twelve deals because the only backfill that
// existed was a Postgres CLI script. Most of what matters here is decided by
// the pure planner, so most of these tests need no fake at all.

const STAGE_DEFS: StageDef[] = [
  { id: STAGES.Discovery, name: "Discovery", sortOrder: 1 },
  { id: STAGES.Validation, name: "Validation", sortOrder: 2 },
  { id: STAGES.Commercial, name: "Commercial", sortOrder: 3 },
  { id: STAGES.Procurement, name: "Procurement", sortOrder: 4 },
  { id: STAGES["Closed-Won"], name: "Closed-Won", sortOrder: 5, terminal: "won" },
  { id: STAGES["Closed-Lost"], name: "Closed-Lost", sortOrder: 6, terminal: "lost" },
];

const DAY = 86_400_000;
const T0 = new Date("2026-01-01T00:00:00Z");
const at = (days: number) => new Date(T0.getTime() + days * DAY);

function deal(over: Partial<BackfillDeal> = {}): BackfillDeal {
  return {
    id: over.id ?? crypto.randomUUID(),
    createdAt: over.createdAt ?? T0,
    salesStageId: over.salesStageId ?? STAGES.Discovery,
    stageEnteredAt: over.stageEnteredAt ?? T0,
    termAwareTcv: over.termAwareTcv ?? 100_000,
  };
}

function plan(input: {
  deals: BackfillDeal[];
  auditRows?: BackfillAuditRow[];
  snapshotsByDeal?: Map<string, BackfillSnapshot[]>;
  existing?: ExistingTransition[];
}) {
  return planTransitionBackfill({
    deals: input.deals,
    stages: STAGE_DEFS,
    auditRows: input.auditRows ?? [],
    snapshotsByDeal: input.snapshotsByDeal ?? new Map(),
    existing: input.existing ?? [],
  });
}

describe("planTransitionBackfill — Pass A (deal_audit_log)", () => {
  it("emits a synthetic create from the first row's oldValue, then each real move", () => {
    const d = deal({ createdAt: at(0) });
    const rows = plan({
      deals: [d],
      auditRows: [
        {
          dealId: d.id,
          oldValue: String(STAGES.Discovery),
          newValue: String(STAGES.Validation),
          changedAt: at(10),
        },
        {
          dealId: d.id,
          oldValue: String(STAGES.Validation),
          newValue: String(STAGES.Commercial),
          changedAt: at(25),
        },
      ],
    });

    expect(rows.map((r) => r.transitionType)).toEqual(["create", "forward", "forward"]);
    // The audit log records changes, not the insert — the create is the stage
    // the deal STARTED in, dated to createdAt.
    expect(rows[0]).toMatchObject({ fromStageId: null, toStageId: STAGES.Discovery });
    expect(rows[0].transitionedAt).toEqual(at(0));
    expect(rows[1]).toMatchObject({
      fromStageId: STAGES.Discovery,
      toStageId: STAGES.Validation,
      daysInFromStage: 10,
    });
    expect(rows[2]).toMatchObject({
      fromStageId: STAGES.Validation,
      toStageId: STAGES.Commercial,
      daysInFromStage: 15,
    });
    expect(rows.every((r) => r.tcvAtTransition === 100_000)).toBe(true);
  });

  it("classifies a move to a terminal stage as exit_won / exit_lost, and a step back as backward", () => {
    const won = deal();
    const lost = deal();
    const back = deal();
    const rows = plan({
      deals: [won, lost, back],
      auditRows: [
        {
          dealId: won.id,
          oldValue: String(STAGES.Procurement),
          newValue: String(STAGES["Closed-Won"]),
          changedAt: at(5),
        },
        {
          dealId: lost.id,
          oldValue: String(STAGES.Commercial),
          newValue: String(STAGES["Closed-Lost"]),
          changedAt: at(5),
        },
        {
          dealId: back.id,
          oldValue: String(STAGES.Commercial),
          newValue: String(STAGES.Validation),
          changedAt: at(5),
        },
      ],
    });
    const typeFor = (id: string) =>
      rows.filter((r) => r.dealId === id).map((r) => r.transitionType);
    expect(typeFor(won.id)).toEqual(["create", "exit_won"]);
    expect(typeFor(lost.id)).toEqual(["create", "exit_lost"]);
    expect(typeFor(back.id)).toEqual(["create", "backward"]);
  });

  it("ignores audit rows for a deal that no longer exists", () => {
    const d = deal();
    const rows = plan({
      deals: [d],
      auditRows: [
        {
          dealId: "ghost-deal",
          oldValue: String(STAGES.Discovery),
          newValue: String(STAGES.Validation),
          changedAt: at(3),
        },
      ],
    });
    // Only the Pass C floor for the surviving deal.
    expect(rows.every((r) => r.dealId === d.id)).toBe(true);
  });
});

describe("planTransitionBackfill — the 5-minute dedupe window", () => {
  // A deal updated through the live path writes an audit row AND fires the
  // subscriber for the same change; the two timestamps are generated
  // independently and land apart, so an exact-key check does not catch it.
  const d = deal({ createdAt: at(0) });
  const auditRows: BackfillAuditRow[] = [
    {
      dealId: d.id,
      oldValue: String(STAGES.Discovery),
      newValue: String(STAGES.Validation),
      changedAt: at(10),
    },
    {
      dealId: d.id,
      oldValue: String(STAGES.Validation),
      newValue: String(STAGES.Commercial),
      changedAt: at(25),
    },
  ];

  it("does not re-insert a move already recorded live a few seconds off", () => {
    const liveAt = new Date(at(10).getTime() + 4000); // subscriber's own clock
    const rows = plan({
      deals: [d],
      auditRows,
      existing: [
        { dealId: d.id, fromStageId: null, toStageId: STAGES.Discovery, transitionType: "create", transitionedAt: at(0) },
        {
          dealId: d.id,
          fromStageId: STAGES.Discovery,
          toStageId: STAGES.Validation,
          transitionType: "forward",
          transitionedAt: liveAt,
        },
      ],
    });

    // Only the second hop is new.
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      fromStageId: STAGES.Validation,
      toStageId: STAGES.Commercial,
    });
    // ...and its daysInFromStage is measured from the AUTHORITATIVE live
    // timestamp that was adopted, not from the reconstructed one.
    expect(rows[0].daysInFromStage).toBe(daysFrom(liveAt, at(25)));
  });

  it("DOES insert the same stage pair when it falls outside the window", () => {
    const longAgo = new Date(at(10).getTime() - 60 * 60 * 1000); // an hour off
    const rows = plan({
      deals: [d],
      auditRows: [auditRows[0]],
      existing: [
        {
          dealId: d.id,
          fromStageId: STAGES.Discovery,
          toStageId: STAGES.Validation,
          transitionType: "forward",
          transitionedAt: longAgo,
        },
      ],
    });
    expect(rows.some((r) => r.toStageId === STAGES.Validation && r.transitionType === "forward")).toBe(true);
  });

  function daysFrom(from: Date, to: Date): number {
    return Math.max(0, Math.round((to.getTime() - from.getTime()) / DAY));
  }
});

describe("planTransitionBackfill — Pass B (snapshots, fallback only)", () => {
  it("reconstructs from snapshots for a deal with no audit history", () => {
    const d = deal({ createdAt: at(0) });
    const snaps = new Map<string, BackfillSnapshot[]>([
      [
        d.id,
        [
          { salesStageId: STAGES.Discovery, normalizedTcv: 5000, snapshotAt: at(1), createdBy: "system" },
          // Repeated stage — not a transition.
          { salesStageId: STAGES.Discovery, normalizedTcv: 5000, snapshotAt: at(2), createdBy: "system" },
          { salesStageId: STAGES.Validation, normalizedTcv: 7000, snapshotAt: at(9), createdBy: "system" },
        ],
      ],
    ]);
    const rows = plan({ deals: [d], snapshotsByDeal: snaps });

    expect(rows.map((r) => r.toStageId)).toEqual([STAGES.Discovery, STAGES.Validation]);
    // Snapshots DO carry their own TCV, unlike the audit log.
    expect(rows.map((r) => r.tcvAtTransition)).toEqual([5000, 7000]);
    expect(rows[1].daysInFromStage).toBe(8);
  });

  it("skips a deal Pass A already covered, so one deal never gets two partial histories", () => {
    const d = deal({ createdAt: at(0) });
    const snaps = new Map<string, BackfillSnapshot[]>([
      [d.id, [{ salesStageId: STAGES.Procurement, normalizedTcv: 1, snapshotAt: at(50), createdBy: "system" }]],
    ]);
    const rows = plan({
      deals: [d],
      auditRows: [
        {
          dealId: d.id,
          oldValue: String(STAGES.Discovery),
          newValue: String(STAGES.Validation),
          changedAt: at(10),
        },
      ],
      snapshotsByDeal: snaps,
    });
    expect(rows.every((r) => r.pass === "A")).toBe(true);
    expect(rows.some((r) => r.toStageId === STAGES.Procurement)).toBe(false);
  });
});

describe("planTransitionBackfill — Pass C/D floors", () => {
  it("gives a never-touched open deal a synthetic create and no exit", () => {
    const d = deal({ salesStageId: STAGES.Commercial, createdAt: at(3) });
    const rows = plan({ deals: [d] });
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      transitionType: "create",
      fromStageId: null,
      toStageId: STAGES.Commercial,
      pass: "C",
    });
    expect(rows[0].transitionedAt).toEqual(at(3));
  });

  it("gives a never-touched CLOSED deal both a create and an exit", () => {
    const d = deal({ salesStageId: STAGES["Closed-Won"], createdAt: at(3), stageEnteredAt: at(3) });
    const rows = plan({ deals: [d] });
    expect(rows.map((r) => r.transitionType)).toEqual(["create", "exit_won"]);
    expect(rows.map((r) => r.pass)).toEqual(["C", "D"]);
  });

  it("backs the synthetic create off by a FULL SECOND, not a millisecond", () => {
    // The Postgres original used -1ms. formatCatalystDateTime truncates to the
    // second, so a 1ms offset formats identically, both rows synthesize the
    // same natural key `dealId:transitionedAt`, and create() silently drops the
    // second one. This is the assertion that fails if the offset regresses.
    const sameInstant = at(3);
    const d = deal({
      salesStageId: STAGES["Closed-Lost"],
      createdAt: sameInstant,
      stageEnteredAt: sameInstant,
    });
    const rows = plan({ deals: [d] });

    const [create, exit] = rows;
    expect(exit.transitionedAt.getTime() - create.transitionedAt.getTime()).toBeGreaterThanOrEqual(1000);
    // The property that actually matters: the two rows survive as DISTINCT rows
    // in the Data Store, which is decided by the formatted second, not the ms.
    expect(formatCatalystDateTime(create.transitionedAt)).not.toBe(
      formatCatalystDateTime(exit.transitionedAt),
    );
  });

  it("does not add a floor when the deal already has one on record", () => {
    const d = deal({ salesStageId: STAGES["Closed-Won"] });
    const rows = plan({
      deals: [d],
      existing: [
        { dealId: d.id, fromStageId: null, toStageId: STAGES.Discovery, transitionType: "create", transitionedAt: at(0) },
        { dealId: d.id, fromStageId: STAGES.Procurement, toStageId: STAGES["Closed-Won"], transitionType: "exit_won", transitionedAt: at(9) },
      ],
    });
    expect(rows).toHaveLength(0);
  });
});

describe("planTransitionBackfill — natural-key collisions within one second", () => {
  it("shifts a second transition rather than letting it be silently dropped", () => {
    // Two genuinely distinct moves inside the same second synthesize the same
    // natural key. Postgres never hit this (microsecond timestamps); here the
    // later row would vanish inside create(). Losing a real transition is worse
    // than recording it a second late.
    const d = deal({ createdAt: at(0) });
    const sameSecond = new Date("2026-01-11T09:00:00.100Z");
    const alsoSameSecond = new Date("2026-01-11T09:00:00.800Z");
    const rows = plan({
      deals: [d],
      auditRows: [
        { dealId: d.id, oldValue: String(STAGES.Discovery), newValue: String(STAGES.Validation), changedAt: sameSecond },
        { dealId: d.id, oldValue: String(STAGES.Validation), newValue: String(STAGES.Commercial), changedAt: alsoSameSecond },
      ],
    });

    const keys = rows.map((r) => formatCatalystDateTime(r.transitionedAt));
    expect(new Set(keys).size).toBe(keys.length); // every row survives
    expect(rows.map((r) => r.toStageId)).toEqual([
      STAGES.Discovery,
      STAGES.Validation,
      STAGES.Commercial,
    ]);
  });
});

describe("planTransitionBackfill — idempotency", () => {
  it("plans nothing on a second pass over its own output", () => {
    const open = deal({ createdAt: at(0), salesStageId: STAGES.Commercial });
    const closed = deal({ createdAt: at(0), salesStageId: STAGES["Closed-Won"], stageEnteredAt: at(0) });
    const withHistory = deal({ createdAt: at(0), salesStageId: STAGES.Validation });
    const auditRows: BackfillAuditRow[] = [
      {
        dealId: withHistory.id,
        oldValue: String(STAGES.Discovery),
        newValue: String(STAGES.Validation),
        changedAt: at(6),
      },
    ];
    const deals = [open, closed, withHistory];

    const first = plan({ deals, auditRows });
    expect(first.length).toBeGreaterThan(0);

    const asExisting: ExistingTransition[] = first.map((r) => ({
      dealId: r.dealId,
      fromStageId: r.fromStageId,
      toStageId: r.toStageId,
      transitionType: r.transitionType,
      transitionedAt: r.transitionedAt,
    }));
    const second = plan({ deals, auditRows, existing: asExisting });
    expect(second).toEqual([]);
  });
});

describe("runTransitionBackfill — against the in-memory Data Store", () => {
  let store: CatalystTestStore;
  const app = () => initCatalystApp({ headers: {} });

  beforeAll(() => {
    ({ store } = installCatalystFake());
  });

  beforeEach(() => {
    store.reset();
    seedStandardLookups(store);
    cache.clear();
  });

  async function makeDeal(stageName: keyof typeof STAGES, tag: string): Promise<string> {
    const d = await createEnterpriseDealsRepo(app()).create({
      dealName: `Backfill ${tag}`,
      accountName: `Backfill Acct ${tag}`,
      accountManager: "AM",
      technicalLead: "TL",
      salesStageId: STAGES[stageName],
      pricingModelId: PRICING_MODEL_ID,
      servicesTierId: SERVICES_TIER_ID,
      productRevenue: "250000.00",
      servicesRevenue: "0",
      contractTermYears: 1,
      dealCurrency: "USD",
    });
    return d.id;
  }

  it("writes a create for every deal and an exit for every closed one, then is a no-op", async () => {
    await makeDeal("Commercial", "open-1");
    await makeDeal("Validation", "open-2");
    await makeDeal("Closed-Won", "won-1");
    await makeDeal("Closed-Lost", "lost-1");

    const first = await runTransitionBackfill(app());
    expect(first.deals).toBe(4);
    expect(first.failed).toBe(0);
    expect(first.remaining).toBe(0);
    // 4 creates + 2 exits.
    expect(first.written).toBe(6);
    expect(first.byPass.C).toBe(4);
    expect(first.byPass.D).toBe(2);

    const written = await createPipelineTransitionsRepo(app()).listAll();
    expect(written).toHaveLength(6);
    expect(written.filter((r) => r.transitionType === "create")).toHaveLength(4);
    expect(written.filter((r) => r.transitionType === "exit_won")).toHaveLength(1);
    expect(written.filter((r) => r.transitionType === "exit_lost")).toHaveLength(1);
    // Every row carries the deal's term-aware TCV, not a null that would
    // contribute 0 to the value bridge.
    expect(written.every((r) => r.tcvAtTransition === 250_000)).toBe(true);

    // The property that makes this safe to leave callable in production.
    const second = await runTransitionBackfill(app());
    expect(second.planned).toBe(0);
    expect(second.written).toBe(0);
    expect(await createPipelineTransitionsRepo(app()).listAll()).toHaveLength(6);
  });

  it("keeps a closed deal's create and exit as two distinct stored rows", async () => {
    // The second-granularity collision, end to end: createdAt and
    // stageEnteredAt are the same instant for a never-updated deal.
    await makeDeal("Closed-Won", "same-instant");
    await runTransitionBackfill(app());

    const rows = store.rows("v2_pipeline_transitions");
    expect(rows).toHaveLength(2);
    expect(new Set(rows.map((r) => r["natural_key"])).size).toBe(2);
  });
});
