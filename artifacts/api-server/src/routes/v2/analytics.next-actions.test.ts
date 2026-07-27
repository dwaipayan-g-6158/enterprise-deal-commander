import { describe, it, expect, afterAll } from "vitest";
import type { Request, Response } from "express";
import { inArray } from "drizzle-orm";
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

// NOTE: The originating task brief's test assumed a `{ data: { decisions } }`
// response shape with `dealId` items. Neither is true after reading the real
// handler (routes/v2/analytics.ts ~L356-489): the response has no top-level
// `decisions` field — pending decisions land in either `overdue` or
// `dueThisWeek` (both arrays of ActionItem, keyed by `dealId`) depending on
// whether the due date has passed. Adjusted below per the brief's own
// instruction not to guess.
//
// The brief's test insert for `dealDecisions` was also incomplete: the real
// schema (lib/db/src/schema/edc_v2_intel.ts ~L216) requires NOT NULL
// `decidedAt` (timestamp, no default) and `commanderId` (varchar, no
// default) in addition to dealId/decisionText/owner/status/dueDate.
function getHandler(method: "get" | "post", path: string) {
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

interface ActionItem {
  id: string;
  dealId: string;
  dealName: string;
  accountName: string;
  action: string;
  owner: string;
  dueDate: string;
}
interface NextActionsData {
  overdue: ActionItem[];
  dueThisWeek: ActionItem[];
  playbookSteps: unknown[];
  upcomingCloses: unknown[];
  pendingCount: number;
}

async function callNextActions(): Promise<NextActionsData> {
  const handler = getHandler("get", "/analytics/next-actions");
  let captured: { data: NextActionsData } | undefined;
  const fakeRes = {
    json: (body: { data: NextActionsData }) => {
      captured = body;
    },
  } as unknown as Response;
  await handler({} as Request, fakeRes);
  if (!captured) throw new Error("Handler did not call res.json");
  return captured.data;
}

const createdDealIds: string[] = [];

afterAll(async () => {
  if (createdDealIds.length > 0) {
    await db.delete(enterpriseDeals).where(inArray(enterpriseDeals.id, createdDealIds));
  }
  await pool.end();
});

describe("GET /analytics/next-actions — closed deals never surface", () => {
  it("does not list a pending decision on a Closed-Lost deal", async () => {
    const [pricing] = await db.select().from(pricingModels).limit(1);
    const [tier] = await db.select().from(servicesTiers).limit(1);
    const stages = await db.select().from(pipelineStages);
    const stage = stages.find((s) => s.stageName === "Closed-Lost");
    if (!stage) throw new Error('Seed data missing pipeline stage "Closed-Lost"');

    const [deal] = await db
      .insert(enterpriseDeals)
      .values({
        dealName: `Next Actions Closed Test ${Date.now()}`,
        accountName: `Next Actions Closed Acct ${Date.now()}`,
        accountManager: "AM",
        technicalLead: "TL",
        salesStageId: stage.id,
        pricingModelId: pricing.id,
        servicesTierId: tier.id,
        productRevenue: "1000.00",
        servicesRevenue: "0",
      })
      .returning({ id: enterpriseDeals.id });
    createdDealIds.push(deal.id);

    // Due tomorrow so it deterministically lands in `dueThisWeek` (not
    // `overdue`) prior to this task's fix, regardless of time-of-day skew.
    const tomorrow = new Date(Date.now() + 86_400_000).toISOString().slice(0, 10);

    await db.insert(dealDecisions).values({
      dealId: deal.id,
      decisionText: "Follow up on renewal terms",
      owner: "AM",
      status: "Pending",
      dueDate: tomorrow,
      decidedAt: new Date(),
      commanderId: "test-commander",
    });

    const { overdue, dueThisWeek } = await callNextActions();
    const allActions = [...overdue, ...dueThisWeek];
    expect(allActions.some((d) => d.dealId === deal.id)).toBe(false);
  });
});
