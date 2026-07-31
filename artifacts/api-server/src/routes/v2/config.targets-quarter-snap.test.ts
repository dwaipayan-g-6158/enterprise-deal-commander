import { describe, it, expect, afterAll } from "vitest";
import type { Request, Response } from "express";
import { and, eq } from "drizzle-orm";
import { db, pool, pipelineTargets, settingsChangeLog } from "@workspace/db";
import { quarterStartUTC } from "@workspace/engine";
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

const NO_TARGET_CAVEAT = "No target set for the active period.";
const TEST_TARGET_VALUE = 4_242_424.24;
const DECOY_TARGET_VALUE = 1_111_111.11;

describe("PUT /config/targets -> GET /analytics/flow/coverage — quarter-snap round trip (F4)", () => {
  let quarterStart = "";
  // Rows THIS test creates, captured by id so cleanup deletes exactly them —
  // never a pattern match that could sweep up unrelated rows (see below).
  let createdQuarterRowId: string | undefined;
  let createdMonthRowId: string | undefined;
  let createdChangeLogId: string | undefined;
  // Whatever (if anything) already occupied these exact (periodType, periodStart)
  // slots before this test ran, so it can be put back afterward — the upsert's
  // conflict key means this test's writes would otherwise clobber a real row.
  let priorQuarterRow: (typeof pipelineTargets.$inferSelect) | undefined;
  let priorMonthRow: (typeof pipelineTargets.$inferSelect) | undefined;

  afterAll(async () => {
    // Delete ONLY the exact rows this test created, by primary key — never by
    // a settingKey/periodStart pattern match, which could destroy unrelated
    // history in whatever DB this suite runs against (a genuine data-loss bug
    // in an earlier version of this test — settings_change_log is an audit
    // trail, not scratch data, and nothing here restores it once deleted).
    if (createdQuarterRowId) {
      await db.delete(pipelineTargets).where(eq(pipelineTargets.id, createdQuarterRowId));
    }
    if (createdMonthRowId) {
      await db.delete(pipelineTargets).where(eq(pipelineTargets.id, createdMonthRowId));
    }
    if (createdChangeLogId) {
      await db.delete(settingsChangeLog).where(eq(settingsChangeLog.id, createdChangeLogId));
    }
    // Restore whatever real rows previously occupied these slots.
    if (priorQuarterRow) await db.insert(pipelineTargets).values(priorQuarterRow);
    if (priorMonthRow) await db.insert(pipelineTargets).values(priorMonthRow);
    await pool.end();
  });

  it("a same-dated 'month' row is NOT read by coverage — only the periodType-filtered 'quarter' row satisfies it", async () => {
    // quarterStartUTC is the exact shared formula both the server's
    // activeQuarterStart() and the browser's quarterStartISO() call (see
    // lib/engine/src/flow.ts) — used here only to build fixture data, not to
    // assert anything about itself (a self-referential assertion would prove
    // nothing about production behavior).
    quarterStart = quarterStartUTC(new Date());

    // Capture + clear any pre-existing row at this exact (periodType,
    // periodStart) slot so the "before" baseline below starts from a known,
    // clean absence rather than a leftover from a previous test run or real
    // admin data.
    const [existingQuarter] = await db
      .select()
      .from(pipelineTargets)
      .where(and(eq(pipelineTargets.periodType, "quarter"), eq(pipelineTargets.periodStart, quarterStart)));
    priorQuarterRow = existingQuarter;
    if (existingQuarter) {
      await db.delete(pipelineTargets).where(eq(pipelineTargets.id, existingQuarter.id));
    }
    const [existingMonth] = await db
      .select()
      .from(pipelineTargets)
      .where(and(eq(pipelineTargets.periodType, "month"), eq(pipelineTargets.periodStart, quarterStart)));
    priorMonthRow = existingMonth;
    if (existingMonth) {
      await db.delete(pipelineTargets).where(eq(pipelineTargets.id, existingMonth.id));
    }

    // Step 1: insert ONLY a decoy row sharing the exact same periodStart but
    // a DIFFERENT periodType ("month"). Inserted directly (bypassing the PUT
    // route, which defaults periodType to "quarter") so this proves the read
    // side's discrimination independent of how the row got written.
    const [monthRow] = await db
      .insert(pipelineTargets)
      .values({ periodType: "month", periodStart: quarterStart, targetValue: String(DECOY_TARGET_VALUE) })
      .returning();
    createdMonthRowId = monthRow.id;

    // Baseline: with only the same-dated "month" row present, the
    // "quarter"-scoped coverage read must find no target at all. Before the
    // periodType filter existed, an unfiltered `eq(periodStart, ...)` read
    // WOULD have matched this month row (same date) and returned a non-null
    // total here — this assertion is exactly what falls over on that
    // pre-fix code, proving the filter actually discriminates rather than
    // merely being present but never exercised.
    const beforeQuarterRow = await getCoverage();
    expect(beforeQuarterRow.caveats).toContain(NO_TARGET_CAVEAT);
    expect(beforeQuarterRow.total).toBeNull();

    // Step 2: now PUT a real "quarter" row at the IDENTICAL periodStart
    // through the real production route.
    const saved = await putTarget({
      periodType: "quarter",
      periodStart: quarterStart,
      targetValue: TEST_TARGET_VALUE,
    });
    createdQuarterRowId = saved.id;
    expect(saved.periodType).toBe("quarter");
    expect(saved.periodStart).toBe(quarterStart);

    // The change-log row this PUT wrote — captured by its own id (not a
    // settingKey pattern) so cleanup can delete exactly this row and nothing
    // else that might share the same "quarter:<periodStart>" key.
    const [changeLogRow] = await db
      .select()
      .from(settingsChangeLog)
      .where(
        and(
          eq(settingsChangeLog.module, "pipeline_targets"),
          eq(settingsChangeLog.entityId, String(saved.id)),
        ),
      )
      .orderBy(settingsChangeLog.changedAt)
      .limit(1);
    createdChangeLogId = changeLogRow?.id;

    // With the "quarter" row now present alongside the still-present "month"
    // decoy at the same date, coverage must find the "quarter" row — proving
    // the periodType filter picks the right row rather than just any row at
    // that periodStart.
    const afterQuarterRow = await getCoverage();
    expect(afterQuarterRow.caveats).not.toContain(NO_TARGET_CAVEAT);
    expect(afterQuarterRow.total).not.toBeNull();
  });
});
