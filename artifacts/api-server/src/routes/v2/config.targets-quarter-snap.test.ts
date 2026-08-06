import { describe, it, expect, beforeAll, beforeEach } from "vitest";
import type { Request, Response } from "express";
import { initCatalystApp, createSettingsChangeLogRepo } from "@workspace/db/catalyst";
import { quarterStartUTC } from "@workspace/engine";
import {
  installCatalystFake,
  seedStandardLookups,
  type CatalystTestStore,
} from "../../test-support/catalyst-test-app";
import configRouter from "./config";
import analyticsRouter from "./analytics";

// Same technique as config.test.ts: no supertest harness exists in this repo,
// so pull the real handler off each router's stack and call it directly — this
// exercises the real production PUT upsert AND the real production GET coverage
// read, proving the fix end-to-end rather than reimplementing either side.
// Runs against the in-memory Data Store (test-support/catalyst-test-app.ts).
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
    params: {},
    query: {},
    headers: {},
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
  const fakeReq = { headers: {}, params: {}, query: {} } as unknown as Request;
  const fakeRes = { json: (b: CoverageResponse) => { captured = b; } } as unknown as Response;
  await handler(fakeReq, fakeRes);
  if (!captured) throw new Error("Handler did not call res.json");
  return captured.data;
}

const NO_TARGET_CAVEAT = "No target set for the active period.";
const TEST_TARGET_VALUE = 4_242_424.24;
const DECOY_TARGET_VALUE = 1_111_111.11;

let store: CatalystTestStore;

beforeAll(() => {
  ({ store } = installCatalystFake());
});

beforeEach(() => {
  store.reset();
  seedStandardLookups(store);
});

describe("PUT /config/targets -> GET /analytics/flow/coverage — quarter-snap round trip (F4)", () => {
  it("a same-dated 'month' row is NOT read by coverage — only the periodType-filtered 'quarter' row satisfies it", async () => {
    // quarterStartUTC is the exact shared formula both the server's
    // activeQuarterStart() and the browser's quarterStartISO() call (see
    // lib/engine/src/flow.ts) — used here only to build fixture data, not to
    // assert anything about itself (a self-referential assertion would prove
    // nothing about production behavior).
    const quarterStart = quarterStartUTC(new Date());

    // Step 1: seed ONLY a decoy row sharing the exact same periodStart but a
    // DIFFERENT periodType ("month"). Written straight into the store rather
    // than through the PUT route (which defaults periodType to "quarter") so
    // this proves the read side's discrimination independent of how the row
    // got written. `natural_key` is the upsert's conflict key — the same
    // "<periodType>:<periodStart>" shape the repository writes.
    store.seedRaw("v2_pipeline_targets", [
      {
        id: "decoy-month-row",
        period_type: "month",
        period_start: quarterStart,
        target_value: String(DECOY_TARGET_VALUE),
        natural_key: `month:${quarterStart}`,
        updated_at: "2026-01-01 00:00:00",
      },
    ]);

    // Baseline: with only the same-dated "month" row present, the
    // "quarter"-scoped coverage read must find no target at all. Before the
    // periodType filter existed, an unfiltered periodStart match WOULD have
    // matched this month row (same date) and returned a non-null total here —
    // this assertion is exactly what falls over on that pre-fix code, proving
    // the filter actually discriminates rather than merely being present but
    // never exercised.
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
    expect(saved.periodType).toBe("quarter");
    expect(saved.periodStart).toBe(quarterStart);

    // The PUT is audited, and the decoy is left alone rather than overwritten
    // (the upsert keys on periodType too, not just the date).
    const auditRows = (await createSettingsChangeLogRepo(initCatalystApp({ headers: {} })).listAll())
      .filter((r) => r.module === "pipeline_targets" && r.entityId === String(saved.id));
    expect(auditRows).toHaveLength(1);
    expect(store.count("v2_pipeline_targets")).toBe(2);

    // With the "quarter" row now present alongside the still-present "month"
    // decoy at the same date, coverage must find the "quarter" row — proving
    // the periodType filter picks the right row rather than just any row at
    // that periodStart.
    const afterQuarterRow = await getCoverage();
    expect(afterQuarterRow.caveats).not.toContain(NO_TARGET_CAVEAT);
    expect(afterQuarterRow.total).not.toBeNull();
  });
});
