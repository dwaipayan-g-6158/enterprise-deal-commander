import { describe, it, expect, beforeAll, beforeEach } from "vitest";
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
  PRICING_MODEL_ID,
  SERVICES_TIER_ID,
  type CatalystTestStore,
} from "../../test-support/catalyst-test-app";
import router from "./analytics";

// NOTE: The originating task brief's test assumed a `{ data: { decisions } }`
// response shape with `dealId` items. Neither is true after reading the real
// handler: the response has no top-level `decisions` field — pending decisions
// land in either `overdue` or `dueThisWeek` (both arrays of ActionItem, keyed
// by `dealId`) depending on whether the due date has passed. Adjusted below per
// the brief's own instruction not to guess.
//
// Runs against the in-memory Data Store (test-support/catalyst-test-app.ts).
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
  const fakeReq = { headers: {}, params: {}, query: {} } as unknown as Request;
  const fakeRes = {
    json: (body: { data: NextActionsData }) => {
      captured = body;
    },
  } as unknown as Response;
  await handler(fakeReq, fakeRes);
  if (!captured) throw new Error("Handler did not call res.json");
  return captured.data;
}

let store: CatalystTestStore;
let seq = 0;

const app = () => initCatalystApp({ headers: {} });

async function createDeal(tag: string, stageName: "Discovery" | "Closed-Lost"): Promise<string> {
  const deal = await createEnterpriseDealsRepo(app()).create({
    dealName: `Next Actions ${tag} ${seq}`,
    accountName: `Next Actions Acct ${tag} ${seq++}`,
    accountManager: "AM",
    technicalLead: "TL",
    salesStageId: STAGES[stageName],
    pricingModelId: PRICING_MODEL_ID,
    servicesTierId: SERVICES_TIER_ID,
    productRevenue: "1000.00",
    servicesRevenue: "0",
    contractTermYears: 1,
    dealCurrency: "USD",
  });
  return deal.id;
}

/** A Pending decision due tomorrow, so it deterministically lands in `dueThisWeek` rather than `overdue`. */
function seedPendingDecision(dealId: string): void {
  const tomorrow = new Date(Date.now() + 86_400_000).toISOString().slice(0, 10);
  store.seedRaw("v2_deal_decisions", [
    {
      id: crypto.randomUUID(),
      deal_id: dealId,
      decision_text: "Follow up on renewal terms",
      owner: "AM",
      status: "Pending",
      due_date: tomorrow,
      decided_at: formatCatalystDateTime(new Date()),
      commander_id: "test-commander",
      created_at: formatCatalystDateTime(new Date()),
    },
  ]);
}

beforeAll(() => {
  ({ store } = installCatalystFake());
});

beforeEach(() => {
  store.reset();
  seq = 0;
  seedStandardLookups(store);
});

describe("GET /analytics/next-actions — closed deals never surface", () => {
  it("does not list a pending decision on a Closed-Lost deal", async () => {
    // An identically-shaped decision on an OPEN deal is seeded alongside it, so
    // the assertion distinguishes "the closed deal was filtered out" from "the
    // handler surfaced nothing at all".
    const openId = await createDeal("open", "Discovery");
    seedPendingDecision(openId);

    const closedId = await createDeal("closed", "Closed-Lost");
    seedPendingDecision(closedId);

    const { overdue, dueThisWeek } = await callNextActions();
    const allActions = [...overdue, ...dueThisWeek];

    expect(allActions.map((d) => d.dealId)).toEqual([openId]);
  });
});
