import { describe, it, expect, beforeAll, beforeEach } from "vitest";
import type { Request, Response } from "express";
import {
  initCatalystApp,
  createEnterpriseDealsRepo,
  createDealAuditLogRepo,
  formatCatalystDateTime,
} from "@workspace/db/catalyst";
import {
  installCatalystFake,
  seedStandardLookups,
  STAGES,
  PRICING_MODEL_ID,
  SERVICES_TIER_ID,
  type CatalystTestStore,
} from "../test-support/catalyst-test-app";
import router from "./deals";

// The archive/restore/delete lifecycle: restore undoes exactly one level, a
// delete leaves archivedAt intact, and an archived deal cannot leave its closed
// stage. Runs against the in-memory Data Store
// (test-support/catalyst-test-app.ts).
//
// Generalized over HTTP method since deals.ts registers GET/PUT/PATCH/DELETE/
// POST all on overlapping paths.
function getHandler(method: "get" | "post" | "put" | "delete", path: string) {
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

const actor = { id: "test-actor", username: "test", displayName: "Test Actor" };

let store: CatalystTestStore;
let seq = 0;

const app = () => initCatalystApp({ headers: {} });

/** Created through the real repository, then patched into the archived/deleted state. */
async function createDeal(
  tag: string,
  stageName: "Discovery" | "Closed-Won" | "Closed-Lost",
  overrides: { archivedAt?: Date; deletedAt?: Date } = {},
): Promise<string> {
  const deal = await createEnterpriseDealsRepo(app()).create({
    dealName: `Lifecycle Test ${tag} ${seq}`,
    accountName: `Lifecycle Acct ${tag} ${seq++}`,
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
  const patch: Record<string, unknown> = {};
  if (overrides.archivedAt) patch["archived_at"] = formatCatalystDateTime(overrides.archivedAt);
  if (overrides.deletedAt) patch["deleted_at"] = formatCatalystDateTime(overrides.deletedAt);
  if (Object.keys(patch).length > 0) {
    const touched = store.patchRaw("enterprise_deals", (r) => r["id"] === deal.id, patch);
    if (touched !== 1) throw new Error(`fixture patch touched ${touched} rows, expected 1`);
  }
  return deal.id;
}

async function readFlags(id: string) {
  const deal = await createEnterpriseDealsRepo(app()).getById(id);
  if (!deal) throw new Error(`deal ${id} not found`);
  return { archivedAt: deal.archivedAt, deletedAt: deal.deletedAt };
}

async function latestAudit(id: string) {
  // The repo returns newest-first; this file's assertions want the newest entry.
  const rows = await createDealAuditLogRepo(app()).list(id);
  return rows[0];
}

function snapshotCount(dealId: string): number {
  return store.rows("v2_deal_snapshots").filter((r) => r["deal_id"] === dealId).length;
}

async function callRestore(id: string) {
  const handler = getHandler("post", "/deals/:id/restore");
  let captured: unknown;
  let thrown: (Error & { status?: number; code?: string }) | undefined;
  const fakeReq = { params: { id }, body: {}, query: {}, headers: {}, actor } as unknown as Request;
  const fakeRes = { json: (body: unknown) => { captured = body; } } as unknown as Response;
  try {
    await handler(fakeReq, fakeRes);
  } catch (err) {
    thrown = err as Error & { status?: number; code?: string };
  }
  return { captured, thrown };
}

beforeAll(() => {
  ({ store } = installCatalystFake());
});

beforeEach(() => {
  store.reset();
  seq = 0;
  seedStandardLookups(store);
});

describe("POST /deals/:id/restore — undoes one level", () => {
  it("clears only archivedAt for a plain archived deal, and audits archived_at", async () => {
    const id = await createDeal("plain-archived", "Closed-Lost", { archivedAt: new Date() });

    const { thrown } = await callRestore(id);
    expect(thrown).toBeUndefined();

    const flags = await readFlags(id);
    expect(flags.archivedAt).toBeNull();
    expect(flags.deletedAt).toBeNull();

    const audit = await latestAudit(id);
    expect(audit.fieldChanged).toBe("archived_at");
    expect(audit.newValue).toBe("unarchived");
  });

  it("returns an archived-then-deleted deal to Archived, not Active, and audits deleted_at", async () => {
    const id = await createDeal("archived-then-deleted", "Closed-Lost", {
      archivedAt: new Date(),
      deletedAt: new Date(),
    });

    const { thrown } = await callRestore(id);
    expect(thrown).toBeUndefined();

    const flags = await readFlags(id);
    expect(flags.deletedAt).toBeNull();
    expect(flags.archivedAt).not.toBeNull(); // still archived — this is the bug fix

    const audit = await latestAudit(id);
    expect(audit.fieldChanged).toBe("deleted_at");
    expect(audit.newValue).toBe("restored");
  });

  it("409s when the deal is already active", async () => {
    const id = await createDeal("already-active", "Discovery");

    const { thrown } = await callRestore(id);
    expect(thrown?.status).toBe(409);
  });

  it("404s for a nonexistent deal", async () => {
    const { thrown } = await callRestore("00000000-0000-0000-0000-000000000000");
    expect(thrown?.status).toBe(404);
  });

  it("does not create a snapshot when a deleted-and-archived deal restores back to still-archived", async () => {
    const id = await createDeal("still-archived-restore", "Closed-Lost", {
      archivedAt: new Date(),
      deletedAt: new Date(),
    });

    const countBefore = snapshotCount(id);

    const { thrown } = await callRestore(id);
    expect(thrown).toBeUndefined();

    const flags = await readFlags(id);
    expect(flags.deletedAt).toBeNull();
    expect(flags.archivedAt).not.toBeNull(); // still archived — the no-op case

    const countAfter = snapshotCount(id);
    expect(countAfter).toBe(countBefore);
  });
});

describe("DELETE /deals/:id — archived → deleted transition", () => {
  it("deletes an archived deal without clearing archivedAt", async () => {
    const id = await createDeal("archived-then-delete", "Closed-Lost", { archivedAt: new Date() });

    const handler = getHandler("delete", "/deals/:id");
    let statusCode: number | undefined;
    const fakeReq = { params: { id }, body: {}, query: {}, headers: {}, actor } as unknown as Request;
    const fakeRes = {
      status: (code: number) => { statusCode = code; return { end: () => {} }; },
    } as unknown as Response;
    await handler(fakeReq, fakeRes);

    expect(statusCode).toBe(204);
    const flags = await readFlags(id);
    expect(flags.deletedAt).not.toBeNull();
    expect(flags.archivedAt).not.toBeNull(); // untouched by DELETE — confirms the transition matrix

    const audit = await latestAudit(id);
    expect(audit.fieldChanged).toBe("deleted_at");
    expect(audit.newValue).toBe("deleted");
  });
});

async function callArchive(id: string) {
  const handler = getHandler("post", "/deals/:id/archive");
  let captured: unknown;
  let thrown: (Error & { status?: number; code?: string }) | undefined;
  const fakeReq = { params: { id }, body: {}, query: {}, headers: {}, actor } as unknown as Request;
  const fakeRes = { json: (body: unknown) => { captured = body; } } as unknown as Response;
  try {
    await handler(fakeReq, fakeRes);
  } catch (err) {
    thrown = err as Error & { status?: number; code?: string };
  }
  return { captured, thrown };
}

describe("POST /deals/:id/archive — idempotency", () => {
  it("archives a closed deal and audits archived_at", async () => {
    const id = await createDeal("archive-once", "Closed-Lost");

    const { thrown } = await callArchive(id);
    expect(thrown).toBeUndefined();

    const flags = await readFlags(id);
    expect(flags.archivedAt).not.toBeNull();

    const audit = await latestAudit(id);
    expect(audit.fieldChanged).toBe("archived_at");
    expect(audit.newValue).toBe("archived");
  });

  it("409s when the deal is already archived", async () => {
    const id = await createDeal("archive-twice", "Closed-Lost", { archivedAt: new Date() });

    const { thrown } = await callArchive(id);
    expect(thrown?.status).toBe(409);
  });

  it("404s for a nonexistent deal", async () => {
    const { thrown } = await callArchive("00000000-0000-0000-0000-000000000000");
    expect(thrown?.status).toBe(404);
  });

  it("404s for an already-deleted deal", async () => {
    const id = await createDeal("archive-deleted", "Closed-Lost", { deletedAt: new Date() });
    const { thrown } = await callArchive(id);
    expect(thrown?.status).toBe(404);
  });
});

async function callUpdate(id: string, body: Record<string, unknown>) {
  const handler = getHandler("put", "/deals/:id");
  let captured: unknown;
  let thrown: (Error & { status?: number; code?: string }) | undefined;
  const fakeReq = { params: { id }, body, query: {}, headers: {}, actor } as unknown as Request;
  const fakeRes = { json: (b: unknown) => { captured = b; } } as unknown as Response;
  try {
    await handler(fakeReq, fakeRes);
  } catch (err) {
    thrown = err as Error & { status?: number; code?: string };
  }
  return { captured, thrown };
}

describe("PUT/PATCH /deals/:id — archived deal can't leave its closed stage", () => {
  it("409s when moving an archived deal's sales_stage_id to an open stage", async () => {
    const id = await createDeal("archived-stage-move", "Closed-Lost", { archivedAt: new Date() });
    const stageOf = async () => (await createEnterpriseDealsRepo(app()).getById(id))?.salesStageId;
    const before = await stageOf();

    const { thrown } = await callUpdate(id, { sales_stage_id: STAGES.Discovery });
    expect(thrown?.status).toBe(409);
    expect(thrown?.code).toBe("ARCHIVE_GUARDRAIL");

    expect(await stageOf()).toBe(before);
  });
});

describe("POST /deals/:id/archive — stage eligibility", () => {
  it("409s when the deal is not in a closed stage", async () => {
    const id = await createDeal("archive-open", "Discovery");

    const { thrown } = await callArchive(id);
    expect(thrown?.status).toBe(409);
    expect(thrown?.code).toBe("ARCHIVE_GUARDRAIL");

    const flags = await readFlags(id);
    expect(flags.archivedAt).toBeNull(); // untouched
  });

  it("still archives a Closed-Won deal", async () => {
    const id = await createDeal("archive-won", "Closed-Won");

    const { thrown } = await callArchive(id);
    expect(thrown).toBeUndefined();

    const flags = await readFlags(id);
    expect(flags.archivedAt).not.toBeNull();
  });
});
