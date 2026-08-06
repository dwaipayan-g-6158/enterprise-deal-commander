import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import {
  initCatalystApp,
  createEnterpriseDealsRepo,
  createDealPlaybookAssignmentsRepo,
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
import { emitDealEvent } from "../events";
import { registerPlaybookEngine } from "./playbook-engine";

// Regression test for the "playbook never updates on stage change" bug: the
// auto-assign guard used to check "does this deal have ANY active assignment",
// so once a deal picked up its first stage playbook, every later stage change
// was silently ignored. It now guards per (deal, playbook) — a deal keeps
// every earlier assignment as it advances through its journey.
//
// Runs against the in-memory Data Store (test-support/catalyst-test-app.ts).
// The event must carry `catalystApp`: the subscriber no-ops without it (see
// lib/events.ts), which is asserted explicitly at the bottom so the tests above
// cannot pass vacuously.

const ACTOR = "vitest";

const VALIDATION_PLAYBOOK_ID = "11111111-1111-4111-8111-111111111111";
const COMMERCIAL_PLAYBOOK_ID = "22222222-2222-4222-8222-222222222222";

let store: CatalystTestStore;
let seq = 0;
let dispose: () => void;

const app = () => initCatalystApp({ headers: {} });

async function poll<T>(fn: () => Promise<T>, predicate: (v: T) => boolean, timeoutMs = 5_000): Promise<T> {
  const start = Date.now();
  let last = await fn();
  while (!predicate(last)) {
    if (Date.now() - start > timeoutMs) return last;
    await new Promise((r) => setTimeout(r, 10));
    last = await fn();
  }
  return last;
}

const assignments = (dealId: string) => createDealPlaybookAssignmentsRepo(app()).list(dealId);

async function createDeal(stageId: number): Promise<string> {
  const deal = await createEnterpriseDealsRepo(app()).create({
    dealName: `Playbook Engine ${seq}`,
    accountName: `Acct ${seq++}`,
    accountManager: "AM",
    technicalLead: "TL",
    salesStageId: stageId,
    pricingModelId: PRICING_MODEL_ID,
    servicesTierId: SERVICES_TIER_ID,
    productRevenue: "500000",
    servicesRevenue: "100000",
    contractTermYears: 1,
    dealCurrency: "USD",
  });
  return deal.id;
}

function seedPlaybooks(): void {
  // Deliberately NOT one per stage: Discovery has none, so the "supersede even
  // when the new stage has no playbook of its own" path is reachable.
  store.seedRaw("v2_playbooks", [
    {
      id: VALIDATION_PLAYBOOK_ID,
      playbook_name: "Validation Playbook",
      applicable_stage: "Validation",
      is_active: "true",
      created_by: "seed",
      created_at: formatCatalystDateTime(new Date()),
    },
    {
      id: COMMERCIAL_PLAYBOOK_ID,
      playbook_name: "Commercial Playbook",
      applicable_stage: "Commercial",
      is_active: "true",
      created_by: "seed",
      created_at: formatCatalystDateTime(new Date()),
    },
  ]);
}

function stageChanged(dealId: string, fromStageId: number, toStageId: number, withApp = true): void {
  emitDealEvent("deal.stage_changed", {
    dealId,
    actor: ACTOR,
    fromStageId,
    toStageId,
    overridden: false,
    ...(withApp ? { catalystApp: app() } : {}),
  });
}

beforeAll(() => {
  ({ store } = installCatalystFake());
  // Registered alone rather than through registerSubscribers(), which also
  // starts the Drizzle-backed portfolio-rollup warm and two wall-clock timers.
  dispose = registerPlaybookEngine();
});

afterAll(() => {
  dispose();
});

beforeEach(() => {
  store.reset();
  seq = 0;
  seedStandardLookups(store);
  seedPlaybooks();
});

describe("playbook auto-assign on stage change", () => {
  it("assigns each new stage's playbook without removing earlier assignments", async () => {
    const dealId = await createDeal(STAGES.Discovery);

    // Discovery -> Validation
    stageChanged(dealId, STAGES.Discovery, STAGES.Validation);
    const afterFirst = await poll(() => assignments(dealId), (rows) => rows.length >= 1);
    expect(afterFirst.length).toBe(1);
    expect(afterFirst[0].playbookId).toBe(VALIDATION_PLAYBOOK_ID);
    const validationAssignmentId = afterFirst[0].id;

    // Validation -> Commercial
    stageChanged(dealId, STAGES.Validation, STAGES.Commercial);
    const afterSecond = await poll(() => assignments(dealId), (rows) => rows.length >= 2);

    expect(afterSecond.length).toBe(2);
    const byPlaybookId = new Map(afterSecond.map((a) => [a.playbookId, a]));
    // The Validation assignment survives (same row, not recreated) — superseded
    // rather than deleted, so its step history stays on the journey.
    expect(byPlaybookId.get(VALIDATION_PLAYBOOK_ID)?.id).toBe(validationAssignmentId);
    expect(byPlaybookId.get(VALIDATION_PLAYBOOK_ID)?.status).toBe("Superseded");
    // The Commercial assignment was newly created — this is exactly what the
    // old per-deal guard used to block.
    expect(byPlaybookId.has(COMMERCIAL_PLAYBOOK_ID)).toBe(true);
    expect(byPlaybookId.get(COMMERCIAL_PLAYBOOK_ID)?.status).toBe("Active");
  });

  it("does not create a duplicate assignment when the deal re-enters a stage it already has", async () => {
    const dealId = await createDeal(STAGES.Discovery);

    stageChanged(dealId, STAGES.Discovery, STAGES.Validation);
    const afterFirst = await poll(() => assignments(dealId), (rows) => rows.length >= 1);
    expect(afterFirst.length).toBe(1);

    stageChanged(dealId, STAGES.Validation, STAGES.Commercial);
    await poll(() => assignments(dealId), (rows) => rows.length >= 2);

    // Bounce back to Validation, which the deal already has an assignment
    // for — this must NOT create a second Validation row.
    stageChanged(dealId, STAGES.Commercial, STAGES.Validation);
    // Give the (idempotent, no-op) re-assign attempt time to run.
    await new Promise((r) => setTimeout(r, 300));

    const rows = await assignments(dealId);
    expect(rows.length).toBe(2);
    expect(rows.find((r) => r.playbookId === VALIDATION_PLAYBOOK_ID)?.id).toBe(afterFirst[0].id);
  });

  it("supersedes a stale assignment even when the new stage has no playbook of its own", async () => {
    const dealId = await createDeal(STAGES.Discovery);

    stageChanged(dealId, STAGES.Discovery, STAGES.Validation);
    await poll(() => assignments(dealId), (rows) => rows.length >= 1);

    // Procurement has no playbook configured. The deal has still moved past
    // Validation, so its open steps must stop accruing overdue/adherence
    // penalties against a playbook it has left behind.
    stageChanged(dealId, STAGES.Validation, STAGES.Procurement);
    const superseded = await poll(
      () => assignments(dealId),
      (rows) => rows.every((r) => r.status === "Superseded"),
    );

    expect(superseded).toHaveLength(1);
    expect(superseded[0].status).toBe("Superseded");
  });

  it("writes nothing when the event carries no catalystApp", async () => {
    const dealId = await createDeal(STAGES.Discovery);
    stageChanged(dealId, STAGES.Discovery, STAGES.Validation, false);
    await new Promise((r) => setTimeout(r, 300));
    expect(await assignments(dealId)).toHaveLength(0);
  });

  it("ignores an event for a stage id that does not exist", async () => {
    const dealId = await createDeal(STAGES.Discovery);
    emitDealEvent("deal.stage_changed", {
      dealId,
      actor: ACTOR,
      fromStageId: STAGES.Discovery,
      toStageId: 9999,
      overridden: false,
      catalystApp: app(),
    });
    await new Promise((r) => setTimeout(r, 200));
    expect(await assignments(dealId)).toHaveLength(0);
    // Sanity: the fixture id above really is absent, so this isn't passing for
    // the wrong reason.
    expect(store.rows("pipeline_stages").some((s) => s["id"] === "9999")).toBe(false);
  });
});
