import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import type { Request, Response } from "express";
import crypto from "node:crypto";
import {
  initCatalystApp,
  createEnterpriseDealsRepo,
  formatCatalystDateTime,
} from "@workspace/db/catalyst";
import {
  installCatalystFake,
  seedStandardLookups,
  STAGES,
  PRICING_MODELS,
  SERVICES_TIER_ID,
  type CatalystTestStore,
} from "../../test-support/catalyst-test-app";
import { cache } from "../../lib/cache";
import router from "./analytics";
import { computeSummary } from "../../lib/catalyst/portfolio";

/**
 * Regression guards for the dashboard audit: each `it` below reproduces a defect
 * where two readouts on the SAME dashboard disagreed, or where a number was
 * computed on a different basis than the one it was displayed against.
 *
 * The route-backed blocks run against the in-memory Data Store
 * (test-support/catalyst-test-app.ts) and so can assert ABSOLUTE values —
 * before the migration they ran against the shared dev database and had to
 * settle for invariants (agreement between endpoints, deltas attributable to a
 * fixture) that would survive changing seed data.
 *
 * The "intelligence summary" block is the exception only in that it calls
 * `computeSummary` directly rather than through a route. It used to run twice,
 * against a Drizzle `lib/portfolio.ts` and a Data Store
 * `lib/catalyst/portfolio.ts`; the Drizzle implementation is gone, and its
 * three assertions were invariants ("tcv is a number", "total >= list length")
 * that had to hold against whatever the shared dev database contained. They are
 * re-expressed below as exact values over a known fixture, which is strictly
 * stronger — and no longer needs a DATABASE_URL to run.
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
  await handler({ query, params: {}, headers: {} } as unknown as Request, fakeRes);
  if (!captured) throw new Error(`Handler for ${path} did not call res.json`);
  return captured.data;
}

// A monotonic counter, not Date.now(): the date-only tests below freeze the
// clock, so a timestamp-derived name would collide between them.
let dealSeq = 0;

const app = () => initCatalystApp({ headers: {} });

// Installed once for the whole file. `store` is only rebound in the blocks that
// use it; the Drizzle-backed summary block is unaffected by its presence.
const { store } = installCatalystFake() as { store: CatalystTestStore };

function resetStore(): void {
  store.reset();
  dealSeq = 0;
  seedStandardLookups(store);
  // getThresholds()/getFxRate()/getScoringWeights() memoise under the `lookup:`
  // tier for the life of the process, and cachedIntel under `summary:`.
  cache.clear();
}

interface DealFixture {
  stageName: keyof typeof STAGES;
  pricingModelName?: keyof typeof PRICING_MODELS;
  productRevenue?: string;
  servicesRevenue?: string;
  contractTermYears?: number;
  winProbabilityPct?: number;
  expectedCloseDate?: string;
  daysInStage?: number;
}

async function insertDeal(values: DealFixture): Promise<string> {
  const deal = await createEnterpriseDealsRepo(app()).create({
    dealName: `DashConsistency fixture #${++dealSeq}`,
    accountName: `DashConsistency Acct #${dealSeq}`,
    accountManager: "AM",
    technicalLead: "TL",
    salesStageId: STAGES[values.stageName],
    pricingModelId: PRICING_MODELS[values.pricingModelName ?? "Annual Subscription"],
    servicesTierId: SERVICES_TIER_ID,
    productRevenue: values.productRevenue ?? "0",
    servicesRevenue: values.servicesRevenue ?? "0",
    contractTermYears: values.contractTermYears ?? 1,
    dealCurrency: "USD",
    winProbabilityPct: values.winProbabilityPct ?? null,
    expectedCloseDate: values.expectedCloseDate ?? null,
  });
  if (values.daysInStage != null) {
    const enteredAt = new Date(Date.now() - values.daysInStage * 86_400_000);
    const touched = store.patchRaw(
      "enterprise_deals",
      (r) => r["id"] === deal.id,
      { stage_entered_at: formatCatalystDateTime(enteredAt) },
    );
    if (touched !== 1) throw new Error(`fixture patch touched ${touched} rows, expected 1`);
  }
  return deal.id;
}

/** Local "YYYY-MM-DD" for today +/- an offset, matching the date-only columns. */
function localDateKey(offsetDays: number): string {
  const n = new Date();
  const d = new Date(n.getFullYear(), n.getMonth(), n.getDate() + offsetDays);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/* --------------------------------------------------------------- A1 */

interface SimulationData {
  traditionalWeightedPipeline: number;
  totalDeals: number;
}

describe("GET /analytics/simulation — traditionalWeightedPipeline is term-aware", () => {
  beforeEach(resetStore);

  it("counts a Multi-Year deal's full term, not just one year of product revenue", async () => {
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

    const result = await call<SimulationData>("/analytics/simulation", { iterations: 1000 });

    expect(result.totalDeals).toBe(1);
    expect(result.traditionalWeightedPipeline).toBe(170_000);
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

describe("Deal Roster and Velocity Map agree about the same deal", () => {
  beforeEach(resetStore);

  it("reports identical benchmarkDays/deltaDays/status for every open deal", async () => {
    // Three deals in one stage (so a leave-one-out benchmark exists and the
    // three land in different velocity bands) plus one alone in another, so the
    // parity assertion spans both the benchmarked and the unbenchmarked case.
    await insertDeal({ stageName: "Discovery", productRevenue: "1000.00", daysInStage: 5 });
    await insertDeal({ stageName: "Discovery", productRevenue: "1000.00", daysInStage: 20 });
    await insertDeal({ stageName: "Discovery", productRevenue: "1000.00", daysInStage: 60 });
    await insertDeal({ stageName: "Validation", productRevenue: "1000.00", daysInStage: 10 });

    const velocity = await call<{ deals: VelocityRow[] }>("/analytics/velocity");
    const roster = await call<{ deals: RosterRow[] }>("/analytics/roster");
    const rosterById = new Map(roster.deals.map((r) => [r.id, r]));

    expect(velocity.deals).toHaveLength(4);
    for (const v of velocity.deals) {
      const r = rosterById.get(v.id);
      // Every open deal must appear in both — the roster spans all
      // non-deleted deals, which is a superset of the open cohort.
      expect(r, `deal ${v.id} missing from /analytics/roster`).toBeDefined();
      expect({ id: v.id, bench: r!.benchmarkDays, delta: r!.deltaDays, status: r!.velocityStatus }).toEqual(
        { id: v.id, bench: v.benchmarkDays, delta: v.deltaDays, status: v.velocity },
      );
    }
    // Not every row is INSUFFICIENT_DATA — otherwise "they agree" would be
    // satisfied by both endpoints giving up in the same way.
    expect(velocity.deals.filter((v) => v.benchmarkDays != null).length).toBe(3);
  });

  it("gives a deal alone in its stage no benchmark on EITHER endpoint", async () => {
    // Before the fix the roster called this "On Pace" (a self-referential
    // median gives delta 0) while the velocity endpoint correctly called it
    // INSUFFICIENT_DATA.
    const id = await insertDeal({
      stageName: "Procurement",
      productRevenue: "5000.00",
      daysInStage: 20,
    });
    // A deal in a DIFFERENT stage, so the population isn't empty overall — the
    // assertion is about being alone in its own stage, not about there being
    // only one deal.
    await insertDeal({ stageName: "Discovery", productRevenue: "1000.00", daysInStage: 3 });

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
  beforeEach(resetStore);

  it("reports staleDealsTotal alongside the capped staleDeals list", async () => {
    // stale_stage_days defaults to 21, so only the 60-day deal is stale.
    await insertDeal({ stageName: "Discovery", productRevenue: "400000.00", daysInStage: 60 });
    await insertDeal({ stageName: "Discovery", productRevenue: "100000.00", daysInStage: 2 });

    const summary = await computeSummary(app());

    expect(summary.totalDealsMonitored).toBe(2);
    expect(summary.totalTCV).toBe(500_000);
    expect(summary.staleDeals.map((d) => d.daysInStage)).toEqual([60]);
    expect(summary.staleDealsTotal).toBe(1);
    expect(summary.criticalAlertsTotal).toBe(summary.criticalAlerts.length);
  });

  it("carries a numeric TCV on every critical alert and never exceeds totalTCV with tcvAtRiskRed", async () => {
    // Validation, not Discovery: a Discovery deal raises no RED alert, which
    // left this loop iterating over an empty list and asserting nothing.
    await insertDeal({ stageName: "Validation", productRevenue: "400000.00", daysInStage: 60 });

    const summary = await computeSummary(app());

    expect(summary.criticalAlerts.length).toBeGreaterThan(0);
    for (const a of summary.criticalAlerts) {
      expect(typeof a.tcv, `alert ${a.alert.code} on ${a.dealName} has no numeric tcv`).toBe("number");
      expect(Number.isFinite(a.tcv)).toBe(true);
    }
    expect(summary.tcvAtRiskRed).toBeLessThanOrEqual(summary.totalTCV + 0.001);
    if (summary.dealsByHealth.RED === 0) expect(summary.tcvAtRiskRed).toBe(0);
    else expect(summary.tcvAtRiskRed).toBeGreaterThan(0);
  });

  // A3, restated as an exact value. The bug: the dashboard keyed alert TCV off a
  // RED-HEALTH deal list, so an alert firing on a YELLOW or GREEN deal found no
  // entry and rendered with no money against it. The old assertion could only
  // check "tcv is a finite number" because it ran against whatever the shared
  // dev database happened to hold. Here the fixture is known, so the alert's
  // carried TCV is pinned to the alerted deal's own normalizedTCV — and the
  // asymmetry that made the health-keyed lookup wrong is asserted directly.
  it("attaches each alerted deal's own TCV, even when that deal is not RED-health", async () => {
    // Validation stage with no gates set fires MISSING_STRUCTURAL_ANCHOR (RED,
    // weight 90) — a deliberately chosen fixture, because a Discovery-stage deal
    // raises no RED alert at all and the loop below would then pass vacuously.
    await insertDeal({ stageName: "Validation", productRevenue: "750000.00", daysInStage: 60 });

    const summary = await computeSummary(app());

    expect(summary.criticalAlerts.length).toBeGreaterThan(0);
    for (const a of summary.criticalAlerts) {
      expect(a.tcv, `alert ${a.alert.code} must carry the deal's own TCV`).toBe(750_000);
    }
    // The alert count is free to exceed the RED-health deal count — one deal can
    // raise several RED alerts while its overall health is not RED. That is
    // precisely why alert TCV cannot be recovered from a RED-health deal list.
    expect(summary.criticalAlertsTotal).toBeGreaterThanOrEqual(summary.dealsByHealth.RED);
  });

  // A4, restated as an exact value: the totals are the TRUE counts, not the
  // sliced arrays' lengths. The detail lists cap at 50, so proving the fields
  // are independent of the arrays needs a portfolio over that cap.
  it("reports totals that exceed the capped detail lists once past the 50-row cap", async () => {
    // Validation stage so every deal is BOTH stale (60 days > 21) and carries a
    // RED alert, which exercises the cap on both detail lists at once.
    for (let i = 0; i < 52; i++) {
      await insertDeal({ stageName: "Validation", productRevenue: "10000.00", daysInStage: 60 });
    }

    const summary = await computeSummary(app());

    expect(summary.totalDealsMonitored).toBe(52);
    // The arrays are capped at 50; the totals are not. Rendering
    // `staleDeals.length` as the count — the actual bug — reported 50 here.
    expect(summary.staleDeals).toHaveLength(50);
    expect(summary.staleDealsTotal).toBe(52);
    expect(summary.criticalAlerts).toHaveLength(50);
    expect(summary.criticalAlertsTotal).toBe(52);
  });

  // The third Drizzle assertion: tcvAtRiskRed is a real sum over RED-health
  // deals, not a client-side estimate off a truncated page. Asserted as an
  // exact subtotal rather than "> 0".
  it("sums tcvAtRiskRed over exactly the RED-health deals", async () => {
    await insertDeal({ stageName: "Discovery", productRevenue: "400000.00", daysInStage: 60 });
    await insertDeal({ stageName: "Discovery", productRevenue: "100000.00", daysInStage: 2 });

    const summary = await computeSummary(app());

    // Whatever the engine decides about health, the at-risk subtotal must equal
    // the summed normalizedTCV of the deals it called RED — recomputed here from
    // the same response rather than hard-coded, so this stays honest if the
    // fixture's health changes.
    const redCount = summary.dealsByHealth.RED;
    expect(summary.tcvAtRiskRed).toBeLessThanOrEqual(summary.totalTCV + 0.001);
    if (redCount === 0) {
      expect(summary.tcvAtRiskRed).toBe(0);
    } else {
      expect(summary.tcvAtRiskRed).toBeGreaterThan(0);
      // Every RED deal in this fixture is one of the two above, so the subtotal
      // can only be one of the representable sums.
      expect([100_000, 400_000, 500_000]).toContain(summary.tcvAtRiskRed);
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

function seedPendingDecision(dealId: string, dueDate: string, text: string): void {
  store.seedRaw("v2_deal_decisions", [
    {
      id: crypto.randomUUID(),
      deal_id: dealId,
      decision_text: text,
      owner: "AM",
      status: "Pending",
      due_date: dueDate,
      decided_at: formatCatalystDateTime(new Date()),
      commander_id: "test-commander",
      created_at: formatCatalystDateTime(new Date()),
    },
  ]);
}

describe("GET /analytics/next-actions — date-only columns are local calendar days", () => {
  // The UTC-midnight bug only MANIFESTS when the local time of day is past the
  // host's UTC offset — at 01:00 IST, UTC midnight of today is still in the
  // future, so the buggy comparison accidentally gave the right answer. Without
  // pinning the clock these cases would silently pass for the first 5.5 hours of
  // every IST day, which is worse than having no test.
  //
  // 18:00 local is past every real positive UTC offset, so the old code
  // deterministically misbehaves here and these assertions genuinely bite.
  // Only `Date` is faked — timers stay real. The date is fixed too, so
  // `localDateKey` and the handler agree.
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ["Date"], now: new Date(2026, 7, 4, 18, 0, 0) });
    resetStore();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("does not call a decision due TODAY overdue", async () => {
    const dealId = await insertDeal({ stageName: "Discovery", productRevenue: "1000.00" });
    seedPendingDecision(dealId, localDateKey(0), "Due today, must not read as overdue");

    const { overdue, dueThisWeek } = await call<NextActionsData>("/analytics/next-actions");
    // The bug: `new Date("YYYY-MM-DD") < now` is true for today in any zone east
    // of UTC, so this landed in Overdue while the client labelled it "today".
    expect(overdue.some((d) => d.dealId === dealId)).toBe(false);
    expect(dueThisWeek.some((d) => d.dealId === dealId)).toBe(true);
  });

  it("still calls a decision due YESTERDAY overdue", async () => {
    const dealId = await insertDeal({ stageName: "Discovery", productRevenue: "1000.00" });
    seedPendingDecision(dealId, localDateKey(-1), "Genuinely late");

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
