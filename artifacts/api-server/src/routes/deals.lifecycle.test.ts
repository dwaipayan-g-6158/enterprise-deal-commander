import { describe, it, expect, afterAll } from "vitest";
import type { Request, Response } from "express";
import { eq, inArray } from "drizzle-orm";
import {
  db,
  pool,
  enterpriseDeals,
  pricingModels,
  servicesTiers,
  pipelineStages,
  dealAuditLog,
} from "@workspace/db";
import router from "./deals";

// Same technique as routes/v2/analytics.vital-signs.test.ts and
// routes/v2/config.test.ts — no supertest harness exists in this repo.
// Generalized over HTTP method since deals.ts registers GET/PUT/PATCH/
// DELETE/POST all on overlapping paths.
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
const createdDealIds: string[] = [];

async function createDeal(
  tag: string,
  stageName: "Discovery" | "Closed-Won" | "Closed-Lost",
  overrides: { archivedAt?: Date; deletedAt?: Date } = {},
): Promise<string> {
  const [pricing] = await db.select().from(pricingModels).limit(1);
  const [tier] = await db.select().from(servicesTiers).limit(1);
  const stages = await db.select().from(pipelineStages);
  const stage = stages.find((s) => s.stageName === stageName);
  if (!stage) throw new Error(`Seed data missing pipeline stage "${stageName}"`);

  const [deal] = await db
    .insert(enterpriseDeals)
    .values({
      dealName: `Lifecycle Test ${tag} ${Date.now()}`,
      accountName: `Lifecycle Acct ${tag} ${Date.now()}`,
      accountManager: "AM",
      technicalLead: "TL",
      salesStageId: stage.id,
      pricingModelId: pricing.id,
      servicesTierId: tier.id,
      productRevenue: "1000.00",
      servicesRevenue: "0",
      archivedAt: overrides.archivedAt ?? null,
      deletedAt: overrides.deletedAt ?? null,
    })
    .returning({ id: enterpriseDeals.id });
  createdDealIds.push(deal.id);
  return deal.id;
}

async function readFlags(id: string) {
  const [row] = await db
    .select({ archivedAt: enterpriseDeals.archivedAt, deletedAt: enterpriseDeals.deletedAt })
    .from(enterpriseDeals)
    .where(eq(enterpriseDeals.id, id));
  return row;
}

async function latestAudit(id: string) {
  const rows = await db
    .select({ fieldChanged: dealAuditLog.fieldChanged, newValue: dealAuditLog.newValue })
    .from(dealAuditLog)
    .where(eq(dealAuditLog.dealId, id))
    .orderBy(dealAuditLog.changedAt);
  return rows[rows.length - 1];
}

async function callRestore(id: string) {
  const handler = getHandler("post", "/deals/:id/restore");
  let captured: unknown;
  let thrown: (Error & { status?: number; code?: string }) | undefined;
  const fakeReq = { params: { id }, actor } as unknown as Request;
  const fakeRes = { json: (body: unknown) => { captured = body; } } as unknown as Response;
  try {
    await handler(fakeReq, fakeRes);
  } catch (err) {
    thrown = err as Error & { status?: number; code?: string };
  }
  return { captured, thrown };
}

afterAll(async () => {
  if (createdDealIds.length > 0) {
    await db.delete(enterpriseDeals).where(inArray(enterpriseDeals.id, createdDealIds));
  }
  await pool.end();
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
});

describe("DELETE /deals/:id — archived → deleted transition", () => {
  it("deletes an archived deal without clearing archivedAt", async () => {
    const id = await createDeal("archived-then-delete", "Closed-Lost", { archivedAt: new Date() });

    const handler = getHandler("delete", "/deals/:id");
    let statusCode: number | undefined;
    const fakeReq = { params: { id }, actor } as unknown as Request;
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
  const fakeReq = { params: { id }, actor } as unknown as Request;
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
