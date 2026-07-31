import { describe, it, expect, afterAll } from "vitest";
import type { Request, Response } from "express";
import { and, eq } from "drizzle-orm";
import { db, pool, pipelineTargets, settingsChangeLog } from "@workspace/db";
import configRouter from "./config";
import analyticsRouter from "./analytics";

// Same technique as config.test.ts / config.validation.test.ts: no supertest
// harness exists in this repo, so pull the real handler off each router's
// stack and call it directly — this exercises the real production PUT
// upsert AND the real production GET coverage read, proving the fix
// end-to-end rather than reimplementing either side.
function getHandler(
  router: typeof configRouter | typeof analyticsRouter,
  method: "get" | "put",
  path: string,
) {
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

interface UpsertTargetResponse {
  data: { id: string; periodType: string; periodStart: string; targetValue: number };
}

async function putTarget(body: unknown): Promise<UpsertTargetResponse["data"]> {
  const handler = getHandler(configRouter, "put", "/config/targets");
  let captured: UpsertTargetResponse | undefined;
  const fakeReq = {
    body,
    actor: { id: "test-actor", username: "test-actor", displayName: "Test Actor", role: "admin" },
  } as unknown as Request;
  const fakeRes = { json: (b: UpsertTargetResponse) => { captured = b; } } as unknown as Response;
  await handler(fakeReq, fakeRes);
  if (!captured) throw new Error("Handler did not call res.json");
  return captured.data;
}

interface CoverageResponse {
  data: {
    total: number | null;
    qualified: number | null;
    weighted: number | null;
    aiAdjusted: number | null;
    netNew: number | null;
    caveats: string[];
  };
}

async function getCoverage(): Promise<CoverageResponse["data"]> {
  const handler = getHandler(analyticsRouter, "get", "/analytics/flow/coverage");
  let captured: CoverageResponse | undefined;
  const fakeRes = { json: (b: CoverageResponse) => { captured = b; } } as unknown as Response;
  await handler({} as Request, fakeRes);
  if (!captured) throw new Error("Handler did not call res.json");
  return captured.data;
}

// Pure UTC quarter-flooring — the exact convention both routes/v2/analytics.ts
// (activeQuarterStart) and artifacts/edc's targets-settings.tsx
// (quarterStartISO) now share (duplicated, not imported, per task-4-report.md
// — a literal shared module isn't possible across the browser/Node
// boundary). Reproduced here (rather than importing a private route-file
// function) purely to build this test's fixture data.
function utcQuarterStart(d: Date): string {
  const q = Math.floor(d.getUTCMonth() / 3);
  return new Date(Date.UTC(d.getUTCFullYear(), q * 3, 1)).toISOString().slice(0, 10);
}

const TEST_TARGET_VALUE = 4_242_424.24;

describe("PUT /config/targets -> GET /analytics/flow/coverage — quarter-snap round trip (F4)", () => {
  let quarterStart = "";
  let priorRow: (typeof pipelineTargets.$inferSelect) | undefined;

  afterAll(async () => {
    if (quarterStart) {
      await db
        .delete(pipelineTargets)
        .where(and(eq(pipelineTargets.periodType, "quarter"), eq(pipelineTargets.periodStart, quarterStart)));
      if (priorRow) {
        // Restore whatever real target (if any) existed for the active
        // quarter before this test overwrote it via the upsert conflict key.
        await db.insert(pipelineTargets).values(priorRow);
      }
      await db.delete(settingsChangeLog).where(eq(settingsChangeLog.settingKey, `quarter:${quarterStart}`));
    }
    await pool.end();
  });

  it("a target saved for an off-quarter (snapped) date is found by coverage's periodType-filtered read", async () => {
    // Simulate an admin picking an arbitrary mid-quarter day — the 11th of
    // the quarter's first month, deliberately not the 1st — which is exactly
    // the scenario that used to save a row /analytics/flow/coverage and
    // /analytics/flow/health-score could never read back (wrong day, and
    // previously no periodType filter at all).
    const now = new Date();
    quarterStart = utcQuarterStart(now);
    const [qYear, qMonth] = quarterStart.split("-").map(Number);
    const midQuarterPick = new Date(Date.UTC(qYear, qMonth - 1, 11));
    const snappedPeriodStart = utcQuarterStart(midQuarterPick); // what the fixed frontend now sends

    // Sanity: the 11th of the quarter's first month is always still inside
    // that same quarter, so this should equal the real active quarter.
    expect(snappedPeriodStart).toBe(quarterStart);

    const [existing] = await db
      .select()
      .from(pipelineTargets)
      .where(and(eq(pipelineTargets.periodType, "quarter"), eq(pipelineTargets.periodStart, quarterStart)));
    priorRow = existing;

    const saved = await putTarget({
      periodType: "quarter",
      periodStart: snappedPeriodStart,
      targetValue: TEST_TARGET_VALUE,
    });
    expect(saved.periodType).toBe("quarter");
    expect(saved.periodStart).toBe(quarterStart);

    const coverage = await getCoverage();
    // Before the fix this would come back null with "No target set for the
    // active period." — either because the row was saved under the raw
    // picked date instead of the quarter start, or because the read had no
    // periodType filter to reliably match against.
    expect(coverage.caveats).not.toContain("No target set for the active period.");
    expect(coverage.total).not.toBeNull();
  });
});
