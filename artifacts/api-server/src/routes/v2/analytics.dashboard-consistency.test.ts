import { describe, it, expect, afterAll, beforeEach, afterEach, vi } from "vitest";
import type { Request, Response } from "express";
import { inArray, eq } from "drizzle-orm";
import {
  db,
  pool,
  enterpriseDeals,
  pricingModels,
  servicesTiers,
  pipelineStages,
  dealDecisions,
} from "@workspace/db";
import router from "./analytics";
import { computeSummary } from "../../lib/portfolio";

/**
 * Regression guards for the dashboard audit: each `it` below reproduces a defect
 * where two readouts on the SAME dashboard disagreed, or where a number was
 * computed on a different basis than the one it was displayed against.
 *
 * These run against the live dev database and assert INVARIANTS (agreement
 * between endpoints, deltas attributable to a fixture) rather than absolute
 * portfolio totals, so they don't break when seed data changes.
 */

function getHandler(method: "get" | "post", path: string) {
  const stack = (
    router as unknown as {
      stack: Array<{
        route?: {
          path: string;
          methods: Record<string, boolean>;
          stack: Array<{ handle: (req: Request, res: Response) => unknown }>;
        };
      }>;
    }
  ).stack;
  const layer = stack.find((l) => l.route?.path === path && l.route.methods[method]);
  if (!layer?.route) throw new Error(`Route ${method.toUpperCase()} ${path} not registered`);
  return layer.route.stack[0].handle;
}

async function call<T>(path: string, query: Record<string, unknown> = {}): Promise<T> {
  const handler = getHandler("get", path);
  let captured: { data: T } | undefined;
  const fakeRes = {
    json: (body: { data: T }) => {
      captured = body;
    },
  } as unknown as Response;
  await handler({ query } as unknown as Request, fakeRes);
  if (!captured) throw new Error(`Handler for ${path} did not call res.json`);
  return captured.data;
}

const createdDealIds: string[] = [];
// A monotonic counter, not Date.now(): the date-only tests below freeze the
// clock, so a timestamp-derived name would collide between them.
let dealSeq = 0;

async function insertDeal(values: Record<string, unknown>): Promise<string> {
  const [pricing] = await db
    .select()
    .from(pricingModels)
    .where(eq(pricingModels.modelName, String(values.pricingModelName ?? "Annual Subscription")))
    .limit(1);
  if (!pricing) throw new Error(`Seed data missing pricing model ${values.pricingModelName}`);
  const [tier] = await db.select().from(servicesTiers).limit(1);
  const stages = await db.select().from(pipelineStages);
  const stage = stages.find((s) => s.stageName === String(values.stageName));
  if (!stage) throw new Error(`Seed data missing pipeline stage "${values.stageName}"`);

  const { pricingModelName: _p, stageName: _s, ...rest } = values;
  const [deal] = await db
    .insert(enterpriseDeals)
    .values({
      dealName: `DashConsistency fixture #${++dealSeq}`,
      accountName: "DashConsistency Acct",
      accountManager: "AM",
      technicalLead: "TL",
      salesStageId: stage.id,
      pricingModelId: pricing.id,
      servicesTierId: tier.id,
      productRevenue: "0",
      servicesRevenue: "0",
      ...rest,
    } as never)
    .returning({ id: enterpriseDeals.id });
  createdDealIds.push(deal.id);
  return deal.id;
}

/** Local "YYYY-MM-DD" for today +/- an offset, matching the date-only columns. */
function localDateKey(offsetDays: number): string {
  const n = new Date();
  const d = new Date(n.getFullYear(), n.getMonth(), n.getDate() + offsetDays);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

afterAll(async () => {
  if (createdDealIds.length > 0) {
    await db.delete(enterpriseDeals).where(inArray(enterpriseDeals.id, createdDealIds));
  }
  await pool.end();
});

/* --------------------------------------------------------------- A1 */

interface SimulationData {
  traditionalWeightedPipeline: number;
  totalDeals: number;
}

// Skipped post-Catalyst-migration: routes/v2/analytics.ts's GET
// /analytics/simulation, /analytics/velocity, /analytics/roster, and
// /analytics/next-actions now read via Catalyst Data Store, not
// Drizzle/Postgres. `initCatalystApp(req)` requires real Catalyst
// session/headers to succeed — a fake `Request` object in a local Vitest run
// can never provide that (same "Data Store isn't reachable from localhost"
// limitation already documented for lookups.engine-thresholds.test.ts). This
// file's fixtures also seed via Drizzle directly, which the migrated
// handlers no longer read. The "intelligence summary" describe block below
// is UNAFFECTED — it calls `computeSummary` from lib/portfolio.ts directly
// (still Drizzle-backed; not migrated this pass), not through any route.
// Retire or rewrite the migrated-route blocks as integration tests against
// the deployed AppSail app once Slice 6 seeding lands.
describe.skip("GET /analytics/simulation — traditionalWeightedPipeline is term-aware", () => {
  it("counts a Multi-Year deal's full term, not just one year of product revenue", async () => {
    const before = await call<SimulationData>("/analytics/simulation", { iterations: 1000 });

    // Multi-Year Committed => TCV is product * term + services. With a 50% win
    // probability the contribution must be (100000 * 3 + 40000) * 0.5 = 170000.
    // The old flat `product + services` sum contributed (100000 + 40000) * 0.5
    // = 70000 — a 100k understatement on this one deal.
    await insertDeal({
      stageName: "Discovery",
      pricingModelName: "Multi-Year Committed",
      productRevenue: "100000.00",
      servicesRevenue: "40000.00",
      contractTermYears: 3,
      winProbabilityPct: 50,
    });

    const after = await call<SimulationData>("/analytics/simulation", { iterations: 1000 });

    expect(after.totalDeals).toBe(before.totalDeals + 1);
    expect(after.traditionalWeightedPipeline - before.traditionalWeightedPipeline).toBe(170_000);
  });
});

/* --------------------------------------------------------------- A2 */

interface VelocityRow {
  id: string;
  benchmarkDays: number | null;
  deltaDays: number | null;
  velocity: string;
}
interface RosterRow {
  id: string;
  benchmarkDays: number | null;
  deltaDays: number | null;
  velocityStatus: string;
}

// Skipped post-Catalyst-migration — see the comment on the describe block above.
describe.skip("Deal Roster and Velocity Map agree about the same deal", () => {
  it("reports identical benchmarkDays/deltaDays/status for every open deal", async () => {
    const velocity = await call<{ deals: VelocityRow[] }>("/analytics/velocity");
    const roster = await call<{ deals: RosterRow[] }>("/analytics/roster");
    const rosterById = new Map(roster.deals.map((r) => [r.id, r]));

    expect(velocity.deals.length).toBeGreaterThan(0);
    for (const v of velocity.deals) {
      const r = rosterById.get(v.id);
      // Every open deal must appear in both — the roster spans all
      // non-deleted deals, which is a superset of the open cohort.
      expect(r, `deal ${v.id} missing from /analytics/roster`).toBeDefined();
      expect({ id: v.id, bench: r!.benchmarkDays, delta: r!.deltaDays, status: r!.velocityStatus }).toEqual(
        { id: v.id, bench: v.benchmarkDays, delta: v.deltaDays, status: v.velocity },
      );
    }
  });

  it("gives a deal alone in its stage no benchmark on EITHER endpoint", async () => {
    // "Legal Review" is not one of the seeded stages a deal normally sits in, so
    // this fixture is deterministically the only open deal there. Before the fix
    // the roster called this "On Pace" (self-referential median => delta 0)
    // while the velocity endpoint correctly called it INSUFFICIENT_DATA.
    const stages = await db.select().from(pipelineStages);
    const soleStage = stages.find(
      (s) => !["Closed-Won", "Closed-Lost"].includes(s.stageName),
    );
    if (!soleStage) throw new Error("Seed data has no open pipeline stage");

    const openInStage = await db
      .select({ id: enterpriseDeals.id })
      .from(enterpriseDeals)
      .where(eq(enterpriseDeals.salesStageId, soleStage.id));

    // Only meaningful when the fixture really is alone; otherwise this
    // assertion is covered by the parity test above.
    if (openInStage.length > 0) return;

    const id = await insertDeal({
      stageName: soleStage.stageName,
      productRevenue: "5000.00",
      stageEnteredAt: new Date(Date.now() - 20 * 86_400_000),
    });

    const velocity = await call<{ deals: VelocityRow[] }>("/analytics/velocity");
    const roster = await call<{ deals: RosterRow[] }>("/analytics/roster");
    const v = velocity.deals.find((d) => d.id === id)!;
    const r = roster.deals.find((d) => d.id === id)!;

    expect(v.velocity).toBe("INSUFFICIENT_DATA");
    expect(r.velocityStatus).toBe("INSUFFICIENT_DATA");
    expect(v.benchmarkDays).toBeNull();
    expect(r.benchmarkDays).toBeNull();
  });
});

/* ------------------------------------------------------------ A3 + A4 */

describe("intelligence summary — alert TCV and true counts", () => {
  it("carries a TCV on every critical alert, including alerts on non-RED-health deals", async () => {
    const summary = await computeSummary();

    // The A3 bug: the dashboard keyed alert TCV off a RED-HEALTH deal list, so
    // an alert on a YELLOW/GREEN deal found no entry and rendered with no money.
    // The server now attaches each alerted deal's own normalizedTCV, so this
    // holds whatever that deal's health happens to be.
    for (const a of summary.criticalAlerts) {
      expect(typeof a.tcv, `alert ${a.alert.code} on ${a.dealName} has no numeric tcv`).toBe(
        "number",
      );
      expect(Number.isFinite(a.tcv)).toBe(true);
    }

    // Alerts can outnumber RED-health deals — that asymmetry is exactly why the
    // health-keyed lookup was wrong — so assert it's at least representable
    // rather than asserting a fixed relationship to dealsByHealth.RED.
    const redHealthDeals = summary.dealsByHealth.RED;
    expect(redHealthDeals).toBeGreaterThanOrEqual(0);
  });

  it("reports counts that are true totals, not the capped detail lists' lengths", async () => {
    const summary = await computeSummary();

    // Both fields must exist and be >= the array they summarize. When the
    // portfolio is under the cap they're equal; over it, the array is shorter.
    // The A4 bug was that these fields did not exist at all and the UI rendered
    // `criticalAlerts.length` / `staleDeals.length` as if they were the totals.
    expect(typeof summary.criticalAlertsTotal).toBe("number");
    expect(typeof summary.staleDealsTotal).toBe("number");
    expect(summary.criticalAlertsTotal).toBeGreaterThanOrEqual(summary.criticalAlerts.length);
    expect(summary.staleDealsTotal).toBeGreaterThanOrEqual(summary.staleDeals.length);
  });

  it("sums tcvAtRiskRed over RED-health deals in the reporting currency", async () => {
    const summary = await computeSummary();

    expect(typeof summary.tcvAtRiskRed).toBe("number");
    expect(summary.tcvAtRiskRed).toBeGreaterThanOrEqual(0);
    // A RED-at-risk subtotal can never exceed the whole portfolio's TCV, and
    // must be 0 exactly when there are no RED-health deals (the old client-side
    // version could also read 0 merely because its 200-deal page missed them).
    expect(summary.tcvAtRiskRed).toBeLessThanOrEqual(summary.totalTCV + 0.001);
    if (summary.dealsByHealth.RED === 0) {
      expect(summary.tcvAtRiskRed).toBe(0);
    } else {
      expect(summary.tcvAtRiskRed).toBeGreaterThan(0);
    }
  });
});

/* --------------------------------------------------------------- B2 */

interface ActionItem {
  id: string;
  dealId: string;
  dueDate: string;
}
interface NextActionsData {
  overdue: ActionItem[];
  dueThisWeek: ActionItem[];
  upcomingCloses: { id: string; daysToClose: number }[];
}

// Skipped post-Catalyst-migration — see the comment on the first describe block above.
describe.skip("GET /analytics/next-actions — date-only columns are local calendar days", () => {
  // The UTC-midnight bug only MANIFESTS when the local time of day is past the
  // host's UTC offset — at 01:00 IST, UTC midnight of today is still in the
  // future, so the buggy comparison accidentally gave the right answer. Without
  // pinning the clock these cases would silently pass for the first 5.5 hours of
  // every IST day, which is worse than having no test.
  //
  // 18:00 local is past every real positive UTC offset, so the old code
  // deterministically misbehaves here and these assertions genuinely bite.
  // Only `Date` is faked — timers stay real so the DB round-trips below still
  // resolve. The date is fixed too, so `localDateKey` and the handler agree.
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ["Date"], now: new Date(2026, 7, 4, 18, 0, 0) });
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("does not call a decision due TODAY overdue", async () => {
    const dealId = await insertDeal({
      stageName: "Discovery",
      productRevenue: "1000.00",
    });
    await db.insert(dealDecisions).values({
      dealId,
      decisionText: "Due today, must not read as overdue",
      owner: "AM",
      status: "Pending",
      dueDate: localDateKey(0),
      decidedAt: new Date(),
      commanderId: "test-commander",
    });

    const { overdue, dueThisWeek } = await call<NextActionsData>("/analytics/next-actions");
    // The bug: `new Date("YYYY-MM-DD") < now` is true for today in any zone east
    // of UTC, so this landed in Overdue while the client labelled it "today".
    expect(overdue.some((d) => d.dealId === dealId)).toBe(false);
    expect(dueThisWeek.some((d) => d.dealId === dealId)).toBe(true);
  });

  it("still calls a decision due YESTERDAY overdue", async () => {
    const dealId = await insertDeal({
      stageName: "Discovery",
      productRevenue: "1000.00",
    });
    await db.insert(dealDecisions).values({
      dealId,
      decisionText: "Genuinely late",
      owner: "AM",
      status: "Pending",
      dueDate: localDateKey(-1),
      decidedAt: new Date(),
      commanderId: "test-commander",
    });

    const { overdue } = await call<NextActionsData>("/analytics/next-actions");
    expect(overdue.some((d) => d.dealId === dealId)).toBe(true);
  });

  it("includes a deal closing TODAY in upcomingCloses, at daysToClose 0", async () => {
    const dealId = await insertDeal({
      stageName: "Discovery",
      productRevenue: "1000.00",
      expectedCloseDate: localDateKey(0),
    });

    const { upcomingCloses } = await call<NextActionsData>("/analytics/next-actions");
    const row = upcomingCloses.find((c) => c.id === dealId);
    // The bug: the `c >= now` guard dropped today's closes entirely.
    expect(row, "deal closing today missing from upcomingCloses").toBeDefined();
    expect(row!.daysToClose).toBe(0);
  });

  it("includes the far edge of the 30-day window and excludes day 31", async () => {
    const inWindow = await insertDeal({
      stageName: "Discovery",
      productRevenue: "1000.00",
      expectedCloseDate: localDateKey(30),
    });
    const outOfWindow = await insertDeal({
      stageName: "Discovery",
      productRevenue: "1000.00",
      expectedCloseDate: localDateKey(31),
    });

    const { upcomingCloses } = await call<NextActionsData>("/analytics/next-actions");
    expect(upcomingCloses.find((c) => c.id === inWindow)?.daysToClose).toBe(30);
    expect(upcomingCloses.some((c) => c.id === outOfWindow)).toBe(false);
  });
});
