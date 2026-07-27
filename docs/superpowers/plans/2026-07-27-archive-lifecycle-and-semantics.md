# Archive Lifecycle & Semantics Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make Archive mean "hidden from the deal switcher, roster default and dashboard, but still counted everywhere else" — replacing today's behavior where Archived and Deleted both mean "excluded from all analytics." No new column, no migration, no background job.

**Architecture:** Two phases. **Phase A** fixes pre-existing bugs in the archive/restore/delete state machine that are cosmetic today (because Archived and Deleted currently mean the same thing) but become consequential the moment they mean different things. **Phase B** makes the actual semantic change: guard Archive to closed deals only, remove the archived-exclusion from analytics/exports, keep it in four places that must stay frozen, fix a latent cockpit-strip bug, and make archived deals findable. Phase A must be fully implemented and tested before Phase B starts — Phase B assumes the state machine underneath it is correct.

**Tech Stack:** Express 5 + Drizzle ORM + PostgreSQL (`artifacts/api-server`), React 19 + Vite + `@tanstack/react-query` (`artifacts/edc`), Vitest for both. No supertest harness exists in this repo — route tests call the Express handler directly off the router's `.stack` (see Task 1).

## Global Constraints

- Never hand-edit `lib/api-zod/src/generated/**` or `lib/api-client-react/src/generated/**` — change `lib/api-spec/openapi.yaml` and run `pnpm --filter @workspace/api-spec run codegen`.
- Run `pnpm run typecheck` from the repo root before considering any task done.
- `artifacts/api-server` is bundled with esbuild; `pnpm --filter @workspace/api-server run dev` always rebuilds before starting, so no manual rebuild step is needed beyond restarting that process.
- Every new/changed SQL predicate on `enterprise_deals` must be commented with *why* it does or doesn't include `archived_at` — this file has ~6 independently-defined "active" filters across different modules, and the whole point of this change is that they now mean different things on purpose.
- `pipelineStages.stageName` literals are exactly `"Closed-Won"` and `"Closed-Lost"` (hyphenated) — copy the existing string, don't retype it.
- **Correction (found during the final whole-branch review, not at planning time):** the dev DB was NOT actually clean when this plan was written — two seed deals ("Project Solace", "Project Sentinel") were already archived from unrelated prior activity that predates this plan. Every task's actual test methodology was unaffected (each test computes a before/after delta within its own run, so pre-existing archived rows cancel out of the comparison), but the "provably a no-op today" framing in Task 5 rested on a premise that wasn't independently verified against the live DB before being stated as fact. Lesson for future plans: state DB preconditions only after running the query that confirms them, not by inference from the seed script's logic.

---

## Phase A — Fix the lifecycle (prerequisite)

### Task 1: Stop risk-pattern preview from evaluating deleted/archived deals

**Files:**
- Modify: `artifacts/api-server/src/routes/v2/config.ts:1-2` (imports), `:583-597` (`normalizedDeals`)
- Test: `artifacts/api-server/src/routes/v2/config.test.ts` (new)

**Interfaces:**
- Consumes: `enterpriseDeals`, `pipelineStages` from `@workspace/db` (already imported in this file); `and`, `isNull` from `drizzle-orm` (`and` already imported, `isNull` is not).
- Produces: nothing new is exported — `normalizedDeals()` stays a private helper, only its query changes. The route it feeds, `POST /custom-patterns/test`, is unchanged.

This is the sharpest bug found while researching this plan: `normalizedDeals()` has **no WHERE clause at all**, despite being commented `// ... per active deal`. It backs the "preview my draft risk pattern against real deals" endpoint in Settings → Custom Patterns, so today it silently previews against soft-deleted deals too. Fix it now, before Phase B makes Delete the sole way to exclude a deal from the numbers.

- [ ] **Step 1: Write the failing test**

```typescript
// artifacts/api-server/src/routes/v2/config.test.ts
import { describe, it, expect, afterAll } from "vitest";
import type { Request, Response } from "express";
import { inArray } from "drizzle-orm";
import { db, pool, enterpriseDeals, pricingModels, servicesTiers, pipelineStages } from "@workspace/db";
import router from "./config";

// Mirrors routes/v2/analytics.vital-signs.test.ts: no supertest harness exists
// in this repo, so pull the real handler off the router's stack and call it
// directly — this exercises production code, not a reimplementation of it.
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

interface TestPatternMatch { dealId: string; dealName: string; accountName: string }
interface TestPatternResponse { data: { matchCount: number; matches: TestPatternMatch[] } }

async function callTestPattern(): Promise<TestPatternResponse["data"]> {
  const handler = getHandler("post", "/custom-patterns/test");
  let captured: TestPatternResponse | undefined;
  const fakeReq = {
    body: {
      pattern_name: "Preview probe",
      severity: "YELLOW",
      weight: 1,
      alert_message_template: "probe",
      // gte 0 matches every deal — revenue is never negative (DB check
      // constraint) — so this condition is purely a vehicle to exercise
      // normalizedDeals()'s WHERE clause, not the pattern-matching logic.
      conditions: [
        { field_path: "financials.calculatedTCV", operator: "gte", comparison_value: "0", sort_order: 0 },
      ],
    },
  } as unknown as Request;
  const fakeRes = { json: (body: TestPatternResponse) => { captured = body; } } as unknown as Response;
  await handler(fakeReq, fakeRes);
  if (!captured) throw new Error("Handler did not call res.json");
  return captured.data;
}

const createdDealIds: string[] = [];

async function createDeal(tag: string, overrides: { archivedAt?: Date; deletedAt?: Date }): Promise<string> {
  const [pricing] = await db.select().from(pricingModels).limit(1);
  const [tier] = await db.select().from(servicesTiers).limit(1);
  const stages = await db.select().from(pipelineStages);
  const stage = stages.find((s) => s.stageName === "Closed-Lost");
  if (!stage) throw new Error('Seed data missing pipeline stage "Closed-Lost"');

  const [deal] = await db
    .insert(enterpriseDeals)
    .values({
      dealName: `Preview Leak Test ${tag} ${Date.now()}`,
      accountName: `Preview Leak Acct ${tag} ${Date.now()}`,
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

afterAll(async () => {
  if (createdDealIds.length > 0) {
    await db.delete(enterpriseDeals).where(inArray(enterpriseDeals.id, createdDealIds));
  }
  await pool.end();
});

describe("POST /custom-patterns/test — excludes non-live deals", () => {
  it("matches a live deal but not an archived or deleted one", async () => {
    const liveId = await createDeal("live", {});
    const archivedId = await createDeal("archived", { archivedAt: new Date() });
    const deletedId = await createDeal("deleted", { deletedAt: new Date() });

    const { matches } = await callTestPattern();
    const matchedIds = new Set(matches.map((m) => m.dealId));

    expect(matchedIds.has(liveId)).toBe(true);
    expect(matchedIds.has(archivedId)).toBe(false);
    expect(matchedIds.has(deletedId)).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @workspace/api-server exec vitest run src/routes/v2/config.test.ts`
Expected: FAIL — `matchedIds.has(archivedId)` and `matchedIds.has(deletedId)` are both `true` (no WHERE clause today), so `expect(...).toBe(false)` fails on both.

- [ ] **Step 3: Fix `normalizedDeals()`**

In `artifacts/api-server/src/routes/v2/config.ts`, change the import at line 2:

```typescript
import { and, asc, desc, eq, isNull, sql } from "drizzle-orm";
```

Then change the query (lines 583-596):

```typescript
// Build a normalized intelligence-shaped object per LIVE deal (excludes
// soft-deleted and archived) for pattern eval. This is a live-preview
// surface — "if I saved this pattern right now, which of my current deals
// would it fire on" — so it deliberately does NOT include archived deals,
// unlike the historical analytics endpoints in routes/v2/analytics.ts.
async function normalizedDeals() {
  const deals = await db
    .select({
      id: enterpriseDeals.id,
      dealName: enterpriseDeals.dealName,
      accountName: enterpriseDeals.accountName,
      productRevenue: enterpriseDeals.productRevenue,
      servicesRevenue: enterpriseDeals.servicesRevenue,
      stageEnteredAt: enterpriseDeals.stageEnteredAt,
      stageName: pipelineStages.stageName,
    })
    .from(enterpriseDeals)
    .leftJoin(pipelineStages, eq(enterpriseDeals.salesStageId, pipelineStages.id))
    .where(and(isNull(enterpriseDeals.deletedAt), isNull(enterpriseDeals.archivedAt)));
```

(The rest of the function — the `out.push(...)` loop — is unchanged.)

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @workspace/api-server exec vitest run src/routes/v2/config.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add artifacts/api-server/src/routes/v2/config.ts artifacts/api-server/src/routes/v2/config.test.ts
git commit -m "fix: exclude archived/deleted deals from custom-pattern preview"
```

---

### Task 2: Restore becomes "undo one level," with idempotency

**Files:**
- Modify: `artifacts/api-server/src/routes/deals.ts:653-672` (`POST /deals/:id/restore`)
- Test: `artifacts/api-server/src/routes/deals.lifecycle.test.ts` (new)

**Interfaces:**
- Consumes: `notFound`, `conflict` from `../lib/http` (both already imported in `deals.ts:36`); `getActor` from `../lib/auth`; `writeAudit` from `../lib/audit`; `emitDealEvent` from `../lib/events`.
- Produces: the same `POST /deals/:id/restore` response shape (`RestoreDealResponse`), now genuinely returning `409` when nothing needs restoring, and returning the deal to **Archived** (not Active) if it was archived-then-deleted.

Today `restore` unconditionally clears both `deleted_at` and `archived_at`, and its audit row always says `field_changed: "deleted_at"` even when only `archived_at` changed — so an archived-then-deleted deal restores straight to Active (skipping Archived), and archive/unarchive history can't be reconstructed from the audit log. Fix: clear whichever flag is actually set, innermost first (deleted before archived), and audit that one.

- [ ] **Step 1: Write the failing tests**

```typescript
// artifacts/api-server/src/routes/deals.lifecycle.test.ts
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
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm --filter @workspace/api-server exec vitest run src/routes/deals.lifecycle.test.ts`
Expected: FAIL on the restore cases — the archived-then-deleted case restores to Active (`flags.archivedAt` is `null`, not "not null"); the already-active case succeeds instead of throwing 409; the audit assertions on the plain-archived case fail (`fieldChanged` is `"deleted_at"`/`newValue: "restored"` today, not `"archived_at"`/`"unarchived"`). The new DELETE test should already PASS since Task 2 doesn't touch the DELETE handler — it's here to lock down the transition matrix, not to drive a code change.

- [ ] **Step 3: Rewrite the restore handler**

Replace `artifacts/api-server/src/routes/deals.ts:653-672`:

```typescript
router.post("/deals/:id/restore", async (req: Request, res: Response) => {
  const { id } = RestoreDealParams.parse(req.params);
  const actor = getActor(req);

  const existingRows = await db
    .select({ deletedAt: enterpriseDeals.deletedAt, archivedAt: enterpriseDeals.archivedAt })
    .from(enterpriseDeals)
    .where(eq(enterpriseDeals.id, id));
  const existing = existingRows[0];
  if (!existing) throw notFound("Deal not found");
  if (!existing.deletedAt && !existing.archivedAt) {
    throw conflict("Deal is already active");
  }

  // Undo exactly one level: a deleted-and-archived deal returns to Archived,
  // not straight to Active. Only a plain archived (or plain deleted) deal
  // returns to Active. This is what makes the round-trip lossless — see
  // docs/superpowers/plans/2026-07-27-archive-lifecycle-and-semantics.md.
  const clearingDeleted = existing.deletedAt !== null;
  await db
    .update(enterpriseDeals)
    .set(clearingDeleted ? { deletedAt: null } : { archivedAt: null })
    .where(eq(enterpriseDeals.id, id));

  await writeAudit({
    dealId: id,
    entityType: "deal",
    fieldChanged: clearingDeleted ? "deleted_at" : "archived_at",
    newValue: clearingDeleted ? "restored" : "unarchived",
    changedBy: actor.displayName,
  });
  emitDealEvent("deal.restored", { dealId: id, actor: actor.displayName });
  const data = await serializeDeal(id);
  res.json(RestoreDealResponse.parse({ data }));
});
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm --filter @workspace/api-server exec vitest run src/routes/deals.lifecycle.test.ts`
Expected: PASS (all 4 cases)

- [ ] **Step 5: Commit**

```bash
git add artifacts/api-server/src/routes/deals.ts artifacts/api-server/src/routes/deals.lifecycle.test.ts
git commit -m "fix: restore undoes exactly one lifecycle level, with idempotency"
```

---

### Task 3: Archive idempotency guard

**Files:**
- Modify: `artifacts/api-server/src/routes/deals.ts:674-693` (`POST /deals/:id/archive`)
- Test: `artifacts/api-server/src/routes/deals.lifecycle.test.ts` (extend from Task 2)

**Interfaces:**
- Consumes: `conflict`, `notFound` from `../lib/http` (already imported).
- Produces: same response shape; now 409s on an already-archived deal instead of silently re-stamping `archived_at` and re-emitting `deal.archived`.

This adds only the *idempotency* guard (already archived → 409). The *stage-eligibility* guard (must be closed to archive) is Task 6, in Phase B — it extends this same query rather than redoing it, so this task's select only needs the two flag columns, not a `pipelineStages` join yet.

- [ ] **Step 1: Write the failing tests**

Append to `artifacts/api-server/src/routes/deals.lifecycle.test.ts`, after the `restore` `describe` block. Reuse `createDeal`, `readFlags`, `getHandler` already defined in the file.

```typescript
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
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm --filter @workspace/api-server exec vitest run src/routes/deals.lifecycle.test.ts`
Expected: FAIL on "409s when the deal is already archived" (today it succeeds and re-stamps).

- [ ] **Step 3: Add the guard**

Replace `artifacts/api-server/src/routes/deals.ts:674-693`:

```typescript
router.post("/deals/:id/archive", async (req: Request, res: Response) => {
  const { id } = ArchiveDealParams.parse(req.params);
  const actor = getActor(req);

  const existingRows = await db
    .select({ deletedAt: enterpriseDeals.deletedAt, archivedAt: enterpriseDeals.archivedAt })
    .from(enterpriseDeals)
    .where(eq(enterpriseDeals.id, id));
  const existing = existingRows[0];
  if (!existing || existing.deletedAt) throw notFound("Deal not found");
  if (existing.archivedAt) throw conflict("Deal is already archived");

  await db
    .update(enterpriseDeals)
    .set({ archivedAt: new Date() })
    .where(eq(enterpriseDeals.id, id));
  await writeAudit({
    dealId: id,
    entityType: "deal",
    fieldChanged: "archived_at",
    newValue: "archived",
    changedBy: actor.displayName,
  });
  emitDealEvent("deal.archived", { dealId: id, actor: actor.displayName });
  const data = await serializeDeal(id);
  res.json(ArchiveDealResponse.parse({ data }));
});
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm --filter @workspace/api-server exec vitest run src/routes/deals.lifecycle.test.ts`
Expected: PASS (all 8 cases across both `describe` blocks)

- [ ] **Step 5: Commit**

```bash
git add artifacts/api-server/src/routes/deals.ts artifacts/api-server/src/routes/deals.lifecycle.test.ts
git commit -m "fix: archive is idempotent (409 if already archived)"
```

---

### ✋ Phase A gate

Before starting Phase B:

```bash
pnpm --filter @workspace/api-server run test
pnpm run typecheck
```

Both must be clean. Specifically confirm the restore round-trip test from Task 2 passes: archive → delete → restore lands back in **Archived**, not Active. Phase B assumes this is true and does not re-verify it.

---

## Phase B — The semantic change

### Task 4: Guard Archive to closed deals only

**Files:**
- Modify: `artifacts/api-server/src/lib/http.ts` (new helper), `artifacts/api-server/src/routes/deals.ts:674+` (extend Task 3's query)
- Test: `artifacts/api-server/src/routes/deals.lifecycle.test.ts` (extend)

**Interfaces:**
- Produces: `archiveGuardrail(message: string): HttpError` in `http.ts`, mirroring the existing `stageGuardrail` helper — a 409 with a distinct code (`ARCHIVE_GUARDRAIL`) for the business rule, separate from the generic idempotency `conflict()` from Task 3.

This is the invariant the rest of Phase B leans on: `archived ⇒ closed`. Once true, every endpoint that already excludes `Closed-Won`/`Closed-Lost` by stage excludes archived deals for free, without needing its own archived-check.

- [ ] **Step 1: Write the failing test**

Append to `artifacts/api-server/src/routes/deals.lifecycle.test.ts`:

```typescript
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @workspace/api-server exec vitest run src/routes/deals.lifecycle.test.ts`
Expected: FAIL on "409s when the deal is not in a closed stage" — today archiving an open deal succeeds.

- [ ] **Step 3: Add `archiveGuardrail` to `http.ts`**

In `artifacts/api-server/src/lib/http.ts`, after `stageGuardrail` (line 30):

```typescript
export const archiveGuardrail = (message: string) =>
  new HttpError(409, "ARCHIVE_GUARDRAIL", message);
```

- [ ] **Step 4: Extend the archive handler's query with a stage join**

In `artifacts/api-server/src/routes/deals.ts`, update the import at line 36:

```typescript
import { badRequest, notFound, conflict, stageGuardrail, archiveGuardrail } from "../lib/http";
```

Replace the archive handler's select (the part added in Task 3) — the rest of the handler is unchanged:

```typescript
router.post("/deals/:id/archive", async (req: Request, res: Response) => {
  const { id } = ArchiveDealParams.parse(req.params);
  const actor = getActor(req);

  const existingRows = await db
    .select({
      deletedAt: enterpriseDeals.deletedAt,
      archivedAt: enterpriseDeals.archivedAt,
      stageName: pipelineStages.stageName,
    })
    .from(enterpriseDeals)
    .innerJoin(pipelineStages, eq(enterpriseDeals.salesStageId, pipelineStages.id))
    .where(eq(enterpriseDeals.id, id));
  const existing = existingRows[0];
  if (!existing || existing.deletedAt) throw notFound("Deal not found");
  if (existing.archivedAt) throw conflict("Deal is already archived");
  if (existing.stageName !== "Closed-Won" && existing.stageName !== "Closed-Lost") {
    throw archiveGuardrail(
      "Only Closed-Won or Closed-Lost deals can be archived. Move the deal to a closed stage first.",
    );
  }

  await db
    .update(enterpriseDeals)
    .set({ archivedAt: new Date() })
    .where(eq(enterpriseDeals.id, id));
  await writeAudit({
    dealId: id,
    entityType: "deal",
    fieldChanged: "archived_at",
    newValue: "archived",
    changedBy: actor.displayName,
  });
  emitDealEvent("deal.archived", { dealId: id, actor: actor.displayName });
  const data = await serializeDeal(id);
  res.json(ArchiveDealResponse.parse({ data }));
});
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `pnpm --filter @workspace/api-server exec vitest run src/routes/deals.lifecycle.test.ts`
Expected: PASS (all 10 cases)

Note for verification later: the roster's bulk-archive bar (`pages/deals.tsx:221-235`, `runBulk`) already uses `Promise.allSettled` and reports `"${succeeded} archived, ${failed} failed"` on partial failure — a 409 from this guard surfaces correctly with **no frontend change needed**. Confirmed by reading the existing code; not re-verified here.

- [ ] **Step 6: Commit**

```bash
git add artifacts/api-server/src/lib/http.ts artifacts/api-server/src/routes/deals.ts artifacts/api-server/src/routes/deals.lifecycle.test.ts
git commit -m "feat: archiving requires a Closed-Won or Closed-Lost deal"
```

---

### Task 5: Remove the archived-exclusion from analytics and exports

**Files:**
- Modify: `artifacts/api-server/src/routes/v2/analytics.ts:59`, `artifacts/api-server/src/routes/v2/exports.ts:19`
- Test: `artifacts/api-server/src/routes/v2/analytics.archive-parity.test.ts` (new)

**Interfaces:**
- Consumes: nothing new.
- Produces: `activeFilter` in both files now means "not soft-deleted" (archived deals pass it). Every one of the ~24 endpoints built on `analytics.ts`'s `activeFilter`, plus the CSV/JSON export, now counts archived deals. `lib/scoring.ts` and `lib/subscribers/index.ts` each define their **own separate** `activeFilter`/`activeDealIds` — untouched by this task, on purpose (Task 7).

This is the change the whole plan exists to make. It is provably a no-op today: zero deals are archived on the dev DB (confirmed in Global Constraints), so removing `isNull(archivedAt)` cannot change any current response. The verification step proves that, then proves the new behavior by archiving one deal.

- [ ] **Step 1: Write the failing test**

```typescript
// artifacts/api-server/src/routes/v2/analytics.archive-parity.test.ts
import { describe, it, expect, afterAll } from "vitest";
import type { Request, Response } from "express";
import { eq, inArray } from "drizzle-orm";
import { db, pool, enterpriseDeals, pricingModels, servicesTiers, pipelineStages } from "@workspace/db";
import router from "./analytics";

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

interface WinLoss { totalWon: number; totalLost: number; winRate: number }

async function callWinLoss(): Promise<WinLoss> {
  const handler = getHandler("get", "/analytics/win-loss");
  let captured: { data: WinLoss } | undefined;
  const fakeRes = { json: (body: { data: WinLoss }) => { captured = body; } } as unknown as Response;
  await handler({ query: {} } as unknown as Request, fakeRes);
  if (!captured) throw new Error("Handler did not call res.json");
  return captured.data;
}

const createdDealIds: string[] = [];

async function createClosedLostDeal(): Promise<string> {
  const [pricing] = await db.select().from(pricingModels).limit(1);
  const [tier] = await db.select().from(servicesTiers).limit(1);
  const stages = await db.select().from(pipelineStages);
  const stage = stages.find((s) => s.stageName === "Closed-Lost");
  if (!stage) throw new Error('Seed data missing pipeline stage "Closed-Lost"');

  const [deal] = await db
    .insert(enterpriseDeals)
    .values({
      dealName: `Archive Parity Test ${Date.now()}`,
      accountName: `Archive Parity Acct ${Date.now()}`,
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
  return deal.id;
}

afterAll(async () => {
  if (createdDealIds.length > 0) {
    await db.delete(enterpriseDeals).where(inArray(enterpriseDeals.id, createdDealIds));
  }
  await pool.end();
});

describe("GET /analytics/win-loss — archived deals still count", () => {
  it("keeps a Closed-Lost deal in the loss count after it's archived", async () => {
    const id = await createClosedLostDeal();

    const before = await callWinLoss();
    expect(before.totalLost).toBeGreaterThan(0); // sanity: the new deal is already counted

    await db.update(enterpriseDeals).set({ archivedAt: new Date() }).where(eq(enterpriseDeals.id, id));

    const after = await callWinLoss();
    // This is the bug this task fixes: archiving a loss must NOT remove it
    // from the denominator, or win rate silently inflates.
    expect(after.totalLost).toBe(before.totalLost);
    expect(after.winRate).toBe(before.winRate);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @workspace/api-server exec vitest run src/routes/v2/analytics.archive-parity.test.ts`
Expected: FAIL — `after.totalLost` is one less than `before.totalLost` today, because `activeFilter` still excludes archived deals.

*(If `/analytics/win-loss` field names differ from `totalWon`/`totalLost`/`winRate`, read the actual handler at `routes/v2/analytics.ts:253` first and adjust the interface/assertions to match its real response shape before proceeding — don't guess.)*

- [ ] **Step 3: Remove the exclusion**

In `artifacts/api-server/src/routes/v2/analytics.ts`, replace line 59:

```typescript
// "Active" here means "not soft-deleted." Archived deals are real, historical
// deals that still count in every analytics number below — that's the whole
// point of archiving vs. deleting. See
// docs/superpowers/plans/2026-07-27-archive-lifecycle-and-semantics.md.
// Contrast with lib/scoring.ts and lib/subscribers/index.ts, which each
// define their OWN separate activeFilter/activeDealIds that DO exclude
// archived deals on purpose (a closed deal's score/snapshot is frozen).
const activeFilter = isNull(enterpriseDeals.deletedAt);
```

In `artifacts/api-server/src/routes/v2/exports.ts`, replace line 19:

```typescript
// See the comment on the identically-named const in routes/v2/analytics.ts —
// archived deals still count in the export.
const activeFilter = isNull(enterpriseDeals.deletedAt);
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @workspace/api-server exec vitest run src/routes/v2/analytics.archive-parity.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add artifacts/api-server/src/routes/v2/analytics.ts artifacts/api-server/src/routes/v2/exports.ts artifacts/api-server/src/routes/v2/analytics.archive-parity.test.ts
git commit -m "feat: archived deals still count in analytics and exports"
```

---

### Task 6: Stop archived deals from nagging you in Next Actions

**Files:**
- Modify: `artifacts/api-server/src/routes/v2/analytics.ts` (three queries inside `/analytics/next-actions`, around lines 354-456)
- Test: `artifacts/api-server/src/routes/v2/analytics.next-actions.test.ts` (new)

**Interfaces:**
- Consumes: `notInArray`, `pipelineStages` — both already imported in `analytics.ts`.
- Produces: no response-shape change.

**This is a deliberate, separate fix, not a mechanical consequence of Task 5** — flagging that plainly because it changes behavior for deals that are neither new nor archived. `/analytics/next-actions` surfaces pending decisions, active playbook assignments, and upcoming close dates as things to act on today. Unlike the aggregate/historical endpoints Task 5 touches, this one is a reminder list — a decided deal has no next action that makes sense to nag about, whether or not it's archived. Today it already leaks *active* Closed-Won/Closed-Lost deals (no stage filter at all); after Task 5 it would leak archived ones too, which would quietly defeat the point of archiving — the whole feature is "get old business off my daily list." `/analytics/gates` and `/analytics/simulation` have the same missing stage filter but are aggregate metrics, not a reminder surface, so they're deliberately left alone — see the note under "Explicitly out of scope" at the end of this plan.

Because this changes behavior for the 9 seeded Closed-Lost deals (not just future archived ones), it gets its own test and its own before/after check — it is **not** covered by Task 5's no-op verification.

- [ ] **Step 1: Write the failing test**

```typescript
// artifacts/api-server/src/routes/v2/analytics.next-actions.test.ts
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

interface NextAction { dealId: string }
interface NextActionsResponse { data: { decisions: NextAction[] } }

async function callNextActions(): Promise<NextActionsResponse["data"]> {
  const handler = getHandler("get", "/analytics/next-actions");
  let captured: NextActionsResponse | undefined;
  const fakeRes = { json: (body: NextActionsResponse) => { captured = body; } } as unknown as Response;
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

    await db.insert(dealDecisions).values({
      dealId: deal.id,
      decisionText: "Follow up on renewal terms",
      owner: "AM",
      status: "Pending",
      dueDate: new Date().toISOString().slice(0, 10),
    });

    const { decisions } = await callNextActions();
    expect(decisions.some((d) => d.dealId === deal.id)).toBe(false);
  });
});
```

*(If `dealDecisions` requires additional NOT NULL columns beyond what's shown, or `/analytics/next-actions`'s response key isn't `decisions`, read `routes/v2/analytics.ts:349-467` and the `dealDecisions` schema in `lib/db/src/schema/deals.ts` first and adjust — don't guess at columns you haven't seen.)*

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @workspace/api-server exec vitest run src/routes/v2/analytics.next-actions.test.ts`
Expected: FAIL — the pending decision on the Closed-Lost deal is currently included.

- [ ] **Step 3: Add the stage exclusion to all three queries**

In `artifacts/api-server/src/routes/v2/analytics.ts`, inside `/analytics/next-actions` (around line 349), each of the three queries needs a `pipelineStages` join plus `notInArray(pipelineStages.stageName, ["Closed-Won", "Closed-Lost"])`.

The `decisions` query (was lines 354-366):

```typescript
  const decisions = await db
    .select({
      id: dealDecisions.id,
      dealId: dealDecisions.dealId,
      dealName: enterpriseDeals.dealName,
      accountName: enterpriseDeals.accountName,
      action: dealDecisions.decisionText,
      owner: dealDecisions.owner,
      dueDate: dealDecisions.dueDate,
    })
    .from(dealDecisions)
    .innerJoin(enterpriseDeals, eq(dealDecisions.dealId, enterpriseDeals.id))
    .innerJoin(pipelineStages, eq(enterpriseDeals.salesStageId, pipelineStages.id))
    .where(
      and(
        activeFilter,
        eq(dealDecisions.status, "Pending"),
        notInArray(pipelineStages.stageName, ["Closed-Won", "Closed-Lost"]),
      ),
    );
```

The `assignments` query (was lines 393-404):

```typescript
  const assignments = await db
    .select({
      assignmentId: dealPlaybookAssignments.id,
      dealId: dealPlaybookAssignments.dealId,
      dealName: enterpriseDeals.dealName,
      playbookId: dealPlaybookAssignments.playbookId,
      playbookName: playbooks.playbookName,
    })
    .from(dealPlaybookAssignments)
    .innerJoin(enterpriseDeals, eq(dealPlaybookAssignments.dealId, enterpriseDeals.id))
    .innerJoin(playbooks, eq(dealPlaybookAssignments.playbookId, playbooks.id))
    .innerJoin(pipelineStages, eq(enterpriseDeals.salesStageId, pipelineStages.id))
    .where(
      and(
        activeFilter,
        eq(dealPlaybookAssignments.status, "Active"),
        notInArray(pipelineStages.stageName, ["Closed-Won", "Closed-Lost"]),
      ),
    );
```

The `closeRows` query (was lines 448-456):

```typescript
  const closeRows = await db
    .select({
      id: enterpriseDeals.id,
      dealName: enterpriseDeals.dealName,
      accountName: enterpriseDeals.accountName,
      expectedCloseDate: enterpriseDeals.expectedCloseDate,
    })
    .from(enterpriseDeals)
    .innerJoin(pipelineStages, eq(enterpriseDeals.salesStageId, pipelineStages.id))
    .where(and(activeFilter, notInArray(pipelineStages.stageName, ["Closed-Won", "Closed-Lost"])));
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @workspace/api-server exec vitest run src/routes/v2/analytics.next-actions.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add artifacts/api-server/src/routes/v2/analytics.ts artifacts/api-server/src/routes/v2/analytics.next-actions.test.ts
git commit -m "fix: next-actions never surfaces closed deals (open or archived)"
```

---

### Task 7: Stop the archive event from triggering a snapshot and health reconcile

**Files:**
- Modify: `artifacts/api-server/src/lib/subscribers/snapshot-service.ts:1-2,91-102`, `artifacts/api-server/src/lib/subscribers/health-tracker.ts:1-3,82-90`
- Test: `artifacts/api-server/src/lib/subscribers/snapshot-service.test.ts` (new), `artifacts/api-server/src/lib/subscribers/health-tracker.test.ts` (new)

**Interfaces:**
- Produces: `shouldSkipSnapshot(eventType: DealEventType): boolean` exported from `snapshot-service.ts`; `shouldSkipHealthReconcile(eventType: DealEventType): boolean` exported from `health-tracker.ts`. Both are pure, DB-free, event-bus-free — extracted specifically so this is unit-testable without timing-dependent integration tests (`emitDealEvent` is fire-and-forget with no way to await listener completion — see the comment on `DealEventBus.emit` in `events.ts:98-114`).

A closed deal's score and health are frozen — archiving it teaches the snapshot/health-history tables nothing new. Today both subscribers skip only `deal.deleted`; this adds `deal.archived` to each skip list, and a bulk archive of N deals stops producing N snapshot rows + N health-history rows (the snapshot debounce is only 3s and per-deal, so it wouldn't have coalesced a bulk operation anyway).

- [ ] **Step 1: Write the failing tests**

```typescript
// artifacts/api-server/src/lib/subscribers/snapshot-service.test.ts
import { describe, it, expect } from "vitest";
import { shouldSkipSnapshot } from "./snapshot-service";

describe("shouldSkipSnapshot", () => {
  it("skips deal.deleted and deal.archived", () => {
    expect(shouldSkipSnapshot("deal.deleted")).toBe(true);
    expect(shouldSkipSnapshot("deal.archived")).toBe(true);
  });

  it("does not skip other event types", () => {
    expect(shouldSkipSnapshot("deal.updated")).toBe(false);
    expect(shouldSkipSnapshot("deal.restored")).toBe(false);
    expect(shouldSkipSnapshot("deal.created")).toBe(false);
    expect(shouldSkipSnapshot("health.changed")).toBe(false);
  });
});
```

```typescript
// artifacts/api-server/src/lib/subscribers/health-tracker.test.ts
import { describe, it, expect } from "vitest";
import { shouldSkipHealthReconcile } from "./health-tracker";

describe("shouldSkipHealthReconcile", () => {
  it("skips health.changed (recursion guard), deal.deleted, and deal.archived", () => {
    expect(shouldSkipHealthReconcile("health.changed")).toBe(true);
    expect(shouldSkipHealthReconcile("deal.deleted")).toBe(true);
    expect(shouldSkipHealthReconcile("deal.archived")).toBe(true);
  });

  it("does not skip other event types", () => {
    expect(shouldSkipHealthReconcile("deal.updated")).toBe(false);
    expect(shouldSkipHealthReconcile("deal.restored")).toBe(false);
    expect(shouldSkipHealthReconcile("gate.toggled")).toBe(false);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm --filter @workspace/api-server exec vitest run src/lib/subscribers/snapshot-service.test.ts src/lib/subscribers/health-tracker.test.ts`
Expected: FAIL with "shouldSkipSnapshot is not a function" / "shouldSkipHealthReconcile is not a function" — neither is exported yet.

- [ ] **Step 3: Extract and export the predicates**

In `artifacts/api-server/src/lib/subscribers/snapshot-service.ts`, change the import at line 2:

```typescript
import { dealEvents, type DealEventType } from "../events";
```

Replace `registerSnapshotService` (lines 91-102):

```typescript
/** Events that never warrant a new snapshot: the deal was removed, or shelved
 *  — a closed deal's state is frozen, so archiving it teaches us nothing new. */
export function shouldSkipSnapshot(eventType: DealEventType): boolean {
  return eventType === "deal.deleted" || eventType === "deal.archived";
}

export function registerSnapshotService(): () => void {
  return dealEvents.on(async (event) => {
    if (shouldSkipSnapshot(event.type)) return;
    await captureSnapshot({
      dealId: event.dealId,
      reason: `event:${event.type}`,
      triggerEvent: event.type,
      actor: event.actor,
    });
  });
}
```

In `artifacts/api-server/src/lib/subscribers/health-tracker.ts`, change the import at line 3:

```typescript
import { dealEvents, emitDealEvent, type DealEventType } from "../events";
```

Replace `registerHealthTracker` (lines 82-90):

```typescript
/** health.changed is a self-recursion guard; deal.deleted/deal.archived are
 *  deals whose health will never be checked again. */
export function shouldSkipHealthReconcile(eventType: DealEventType): boolean {
  return (
    eventType === "health.changed" ||
    eventType === "deal.deleted" ||
    eventType === "deal.archived"
  );
}

export function registerHealthTracker(): () => void {
  return dealEvents.on(async (event) => {
    if (shouldSkipHealthReconcile(event.type)) return;
    await runSerialPerDeal(event.dealId, () =>
      reconcileHealth(event.dealId, event.actor),
    );
  });
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm --filter @workspace/api-server exec vitest run src/lib/subscribers/snapshot-service.test.ts src/lib/subscribers/health-tracker.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add artifacts/api-server/src/lib/subscribers/snapshot-service.ts artifacts/api-server/src/lib/subscribers/snapshot-service.test.ts artifacts/api-server/src/lib/subscribers/health-tracker.ts artifacts/api-server/src/lib/subscribers/health-tracker.test.ts
git commit -m "fix: archiving a deal no longer snapshots or health-reconciles it"
```

---

### Task 8: Fix the strip losing the active deal, and label archived/deleted cockpits

**Files:**
- Modify: `artifacts/edc/src/components/cockpit/deal-strip-model.ts` (new export), `artifacts/edc/src/pages/deal-cockpit.tsx:43-48,119-136,282-298`
- Test: `artifacts/edc/src/components/cockpit/deal-strip-model.test.ts` (extend)

**Interfaces:**
- Consumes: `terminalOutcome` from `../roster/model/board` (already imported at `deal-strip-model.ts:9`); `groupForDeal` (unchanged — its `null` contract stays exactly as tested today at `deal-strip-model.test.ts:74-79`).
- Produces: `expandedGroupFor<T extends StripDeal>(groups: StripGroups<T>, activeDealId: string, activeSalesStage?: string | null): StripGroupId`. `StripDeal`, `StripGroups`, `groupDeals`, `visualOrder` are all **unchanged** — this plan does not touch the grouping model itself, only adds one new helper.

`groupForDeal` correctly returns `null` for a deal absent from the strip's `state: "active"` list. The bug is at the call site: `deal-cockpit.tsx:130` does `groupForDeal(groups, id) ?? "open"`, which fans **Open** with nothing highlighted whenever the viewed deal isn't in the list — including every archived deal, now that archiving is the actual mechanism for leaving the strip. `expandedGroupFor` fixes the fallback to use the deal's own sales stage instead of defaulting to Open. The deal still won't have a *card* in the strip — correct, that's the point of archiving — but the fan that opens matches what kind of deal it is. No change is needed to `account-navigation-array.tsx`: it only renders whatever `expandedGroup` it's told and whatever deals are in its own list; it has no bug to fix.

- [ ] **Step 1: Write the failing test**

Append to `artifacts/edc/src/components/cockpit/deal-strip-model.test.ts`:

```typescript
import { groupDeals, visualOrder, groupForDeal, expandedGroupFor, type StripDeal } from "./deal-strip-model";
```

(Add `expandedGroupFor` to the existing import line at the top of the file — line 2.)

```typescript
describe("expandedGroupFor", () => {
  const groups = groupDeals([
    deal({ id: "o", salesStage: "Discovery" }),
    deal({ id: "w", salesStage: "Closed-Won" }),
    deal({ id: "l", salesStage: "Closed-Lost" }),
  ]);

  it("returns the deal's actual group when it's present in the list", () => {
    expect(expandedGroupFor(groups, "o", "Discovery")).toBe("open");
    expect(expandedGroupFor(groups, "w", "Closed-Won")).toBe("closed");
    expect(expandedGroupFor(groups, "l", "Closed-Lost")).toBe("closed");
  });

  it("falls back to the viewed deal's own stage when it's absent from the list (e.g. archived)", () => {
    expect(expandedGroupFor(groups, "missing", "Closed-Lost")).toBe("closed");
    expect(expandedGroupFor(groups, "missing", "Closed-Won")).toBe("closed");
  });

  it("falls back to open when the absent deal's stage is non-terminal, missing, or unknown", () => {
    expect(expandedGroupFor(groups, "missing", "Discovery")).toBe("open");
    expect(expandedGroupFor(groups, "missing", undefined)).toBe("open");
    expect(expandedGroupFor(groups, "missing", null)).toBe("open");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @workspace/edc exec vitest run src/components/cockpit/deal-strip-model.test.ts`
Expected: FAIL — `expandedGroupFor` is not exported yet.

- [ ] **Step 3: Add `expandedGroupFor`**

In `artifacts/edc/src/components/cockpit/deal-strip-model.ts`, after `groupForDeal` (currently ends at line 71):

```typescript
/**
 * Which group the strip should fan for the deal currently being viewed.
 *
 * groupForDeal()'s null is correct as a plain membership query — it stays
 * exactly as-is. The bug this fixes lives at the OLD call site, which did
 * `groupForDeal(...) ?? "open"`: that fanned Open with nothing highlighted
 * whenever the viewed deal wasn't in the strip's list — which, now that
 * archiving is the actual mechanism for leaving the strip, is a normal case
 * (any archived deal), not an edge case. Falling back to the deal's own
 * sales stage opens the fan that actually matches it.
 */
export function expandedGroupFor<T extends StripDeal>(
  groups: StripGroups<T>,
  activeDealId: string,
  activeSalesStage?: string | null,
): StripGroupId {
  return (
    groupForDeal(groups, activeDealId) ??
    (terminalOutcome(activeSalesStage) !== null ? "closed" : "open")
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @workspace/edc exec vitest run src/components/cockpit/deal-strip-model.test.ts`
Expected: PASS

- [ ] **Step 5: Wire it into the cockpit page**

In `artifacts/edc/src/pages/deal-cockpit.tsx`, update the import block (lines 43-48):

```typescript
import {
  groupDeals,
  visualOrder,
  expandedGroupFor,
  type StripGroupId,
} from "@/components/cockpit/deal-strip-model";
```

Replace line 130 (`dealResponse` is already destructured at line 90, so no reordering is needed):

```typescript
  const expandedGroup: StripGroupId =
    manualExpanded ?? expandedGroupFor(groups, id, dealResponse?.data?.salesStage);
```

- [ ] **Step 6: Add an Archived/Deleted badge to the cockpit header**

In `artifacts/edc/src/pages/deal-cockpit.tsx`, inside the header `<div className="flex items-center gap-3 mb-2">` (lines 284-298), add a badge after the existing risk `Badge`:

```tsx
          <div className="flex items-center gap-3 mb-2">
            <h1 className="text-3xl font-bold">{deal.dealName}</h1>
            <Badge
              variant="outline"
              className={cn(
                RISK_LEVEL_CLASS[level].bg,
                RISK_LEVEL_CLASS[level].text,
                RISK_LEVEL_CLASS[level].border,
                "font-medium",
              )}
            >
              {risk ? <span className="font-mono tabular-nums mr-1.5">{risk.compositeScore}</span> : null}
              {RISK_LEVEL_LABEL[level]}
            </Badge>
            {(deal.archivedAt || deal.deletedAt) && (
              <Badge
                variant="outline"
                className="border-amber-500/40 bg-amber-500/10 text-amber-700 dark:text-amber-400 font-medium"
              >
                {deal.deletedAt ? "Deleted" : "Archived"}
              </Badge>
            )}
          </div>
```

Both `Badge` and `cn` are already imported in this file (lines 10, 65). `deal.archivedAt`/`deal.deletedAt` are already on the `Deal` schema (`lib/api-spec/openapi.yaml:1977-1978`) and require no API change.

This is a small, deliberate addition beyond the archived-only case named in this plan's design: it closes the same gap for deleted deals too (a bookmarked link to either opens fully editable today, with no indication the deal isn't live), using the identical UI element, so it costs nothing extra to cover both.

- [ ] **Step 7: Commit**

```bash
git add artifacts/edc/src/components/cockpit/deal-strip-model.ts artifacts/edc/src/components/cockpit/deal-strip-model.test.ts artifacts/edc/src/pages/deal-cockpit.tsx
git commit -m "fix: cockpit strip opens the right fan for archived/deleted deals, and labels them"
```

---

### Task 9: Make archived deals findable

**Files:**
- Modify: `lib/api-spec/openapi.yaml` (state enum + restore 409 description), `artifacts/api-server/src/routes/deals.ts:45-58`, `artifacts/edc/src/components/command-palette.tsx:35`
- Test: `artifacts/api-server/src/routes/deals.state-all.test.ts` (new)

**Interfaces:**
- Produces: a new `state=all` value on `GET /deals`, meaning "not soft-deleted" (both active and archived deals; excludes only `deleted`). This is a genuine fourth option, not a default/omission — omitting `state` still means `active` only, per the existing default at `deals.ts:47`.

`command-palette.tsx:35` fetches `state: "active"`, so an archived deal — which still counts in every number per Task 5 — becomes literally impossible to jump to by name. There is no existing way to ask the API for "active + archived" in one call: `state` is a 3-value enum (`active`/`archived`/`deleted`), not a set. Add the fourth value server-side (small contract change, needs codegen) rather than making the command palette issue two requests and merge them client-side.

- [ ] **Step 1: Write the failing test**

```typescript
// artifacts/api-server/src/routes/deals.state-all.test.ts
import { describe, it, expect, afterAll } from "vitest";
import type { Request, Response } from "express";
import { inArray } from "drizzle-orm";
import { db, pool, enterpriseDeals, pricingModels, servicesTiers, pipelineStages } from "@workspace/db";
import router from "./deals";

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

interface DealSummary { id: string }
interface ListDealsResponseShape { data: DealSummary[] }

async function callList(query: Record<string, string>): Promise<DealSummary[]> {
  const handler = getHandler("get", "/deals");
  let captured: ListDealsResponseShape | undefined;
  const fakeReq = { query } as unknown as Request;
  const fakeRes = { json: (body: ListDealsResponseShape) => { captured = body; } } as unknown as Response;
  await handler(fakeReq, fakeRes);
  if (!captured) throw new Error("Handler did not call res.json");
  return captured.data;
}

const createdDealIds: string[] = [];

async function createDeal(tag: string, overrides: { archivedAt?: Date; deletedAt?: Date }): Promise<string> {
  const [pricing] = await db.select().from(pricingModels).limit(1);
  const [tier] = await db.select().from(servicesTiers).limit(1);
  const stages = await db.select().from(pipelineStages);
  const stage = stages.find((s) => s.stageName === "Closed-Lost");
  if (!stage) throw new Error('Seed data missing pipeline stage "Closed-Lost"');

  const [deal] = await db
    .insert(enterpriseDeals)
    .values({
      dealName: `State All Test ${tag} ${Date.now()}`,
      accountName: `State All Acct ${tag} ${Date.now()}`,
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

afterAll(async () => {
  if (createdDealIds.length > 0) {
    await db.delete(enterpriseDeals).where(inArray(enterpriseDeals.id, createdDealIds));
  }
  await pool.end();
});

describe("GET /deals?state=... — all four predicates", () => {
  it("includes active and archived deals, excludes deleted, for state=all", async () => {
    const activeId = await createDeal("active", {});
    const archivedId = await createDeal("archived", { archivedAt: new Date() });
    const deletedId = await createDeal("deleted", { deletedAt: new Date() });

    const rows = await callList({ state: "all", limit: "500" });
    const ids = new Set(rows.map((r) => r.id));

    expect(ids.has(activeId)).toBe(true);
    expect(ids.has(archivedId)).toBe(true);
    expect(ids.has(deletedId)).toBe(false);
  });

  // The remaining three predicates are pre-existing and unchanged by this
  // plan — asserted here anyway because, per the audit that motivated this
  // whole plan, zero tests touched them before now.
  it("state=active excludes both archived and deleted", async () => {
    const activeId = await createDeal("active2", {});
    const archivedId = await createDeal("archived2", { archivedAt: new Date() });
    const deletedId = await createDeal("deleted2", { deletedAt: new Date() });

    const ids = new Set((await callList({ state: "active", limit: "500" })).map((r) => r.id));
    expect(ids.has(activeId)).toBe(true);
    expect(ids.has(archivedId)).toBe(false);
    expect(ids.has(deletedId)).toBe(false);
  });

  it("state=archived returns only archived, non-deleted deals", async () => {
    const archivedId = await createDeal("archived3", { archivedAt: new Date() });
    const activeId = await createDeal("active3", {});

    const ids = new Set((await callList({ state: "archived", limit: "500" })).map((r) => r.id));
    expect(ids.has(archivedId)).toBe(true);
    expect(ids.has(activeId)).toBe(false);
  });

  it("state=deleted returns deleted deals regardless of archived flag", async () => {
    const deletedId = await createDeal("deleted3", { deletedAt: new Date() });
    const bothId = await createDeal("both3", { archivedAt: new Date(), deletedAt: new Date() });

    const ids = new Set((await callList({ state: "deleted", limit: "500" })).map((r) => r.id));
    expect(ids.has(deletedId)).toBe(true);
    expect(ids.has(bothId)).toBe(true);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @workspace/api-server exec vitest run src/routes/deals.state-all.test.ts`
Expected: FAIL on the `state=all` case only — `state=all` isn't a recognized value yet, so `ListDealsQueryParams.parse` either rejects it or (per the current if/else-if chain falling through) applies no state condition; check which happens by running the test before assuming, either way the enum needs adding. The `active`/`archived`/`deleted` cases test pre-existing, unchanged behavior and should already PASS — they're here for baseline coverage, not to drive a code change.

- [ ] **Step 3: Add `all` to the OpenAPI enum**

In `lib/api-spec/openapi.yaml`, line 135:

```yaml
        - { name: state, in: query, required: false, schema: { type: string, enum: [active, archived, deleted, all] } }
```

Also fix the stale description on the existing `restoreDeal` 409 (lines 262-267), now that Task 2 actually implements it:

```yaml
        "409":
          description: Deal is already active
          content:
            application/json:
              schema:
                $ref: "#/components/schemas/ErrorResponse"
```

Run codegen:

```bash
pnpm --filter @workspace/api-spec run codegen
```

- [ ] **Step 4: Add the `all` branch server-side**

In `artifacts/api-server/src/routes/deals.ts`, extend the if/else-if chain at lines 50-58:

```typescript
  const conditions = [];
  if (state === "active") {
    conditions.push(isNull(enterpriseDeals.deletedAt));
    conditions.push(isNull(enterpriseDeals.archivedAt));
  } else if (state === "archived") {
    conditions.push(isNotNull(enterpriseDeals.archivedAt));
    conditions.push(isNull(enterpriseDeals.deletedAt));
  } else if (state === "deleted") {
    conditions.push(isNotNull(enterpriseDeals.deletedAt));
  } else if (state === "all") {
    // Active + Archived, i.e. every real deal — excludes only the trash.
    conditions.push(isNull(enterpriseDeals.deletedAt));
  }
```

- [ ] **Step 5: Run test to verify it passes**

Run: `pnpm --filter @workspace/api-server exec vitest run src/routes/deals.state-all.test.ts`
Expected: PASS

- [ ] **Step 6: Point the command palette at it**

In `artifacts/edc/src/components/command-palette.tsx:35`:

```typescript
  const { data: deals } = useListDeals({ state: "all", limit: 50 });
```

- [ ] **Step 7: Typecheck and commit**

```bash
pnpm run typecheck
git add lib/api-spec/openapi.yaml lib/api-zod lib/api-client-react artifacts/api-server/src/routes/deals.ts artifacts/api-server/src/routes/deals.state-all.test.ts artifacts/edc/src/components/command-palette.tsx
git commit -m "feat: add state=all so archived deals stay findable in the command palette"
```

---

### Task 10 (optional): Add the partial index the Phase 1 PRD specified but never shipped

**Files:**
- Create: `lib/db/sql/2026-07-27-deals-active-index.sql`

**Interfaces:** none — this is a database index, invisible to application code.

`GET /deals?state=active` (and now `state=all`) is the hot path shared by the strip, the roster default view, and the dashboard, and it has never had an index on its own predicate. This is purely a performance nicety, independent of the semantic change — skip this task entirely if you'd rather not touch the DB before launch.

- [ ] **Step 1: Write the migration**

Follow the house style in `lib/db/sql/2026-07-24-meddpicc-scoring.sql`:

```sql
-- Partial index for the active-deal predicate (2026-07-27)
--
-- GET /deals?state=active|all is the hot path shared by the deal-switcher
-- strip, the roster default view, and every dashboard tile — all filtering
-- on deleted_at IS NULL (and, for state=active, archived_at IS NULL too).
-- The Phase 1 PRD specified this index but it was never created. Mirrors no
-- Drizzle schema change — this is a pure index, not a column.
--
-- Safe to re-run (idempotent): CREATE INDEX IF NOT EXISTS.
--
--   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f lib/db/sql/2026-07-27-deals-active-index.sql

BEGIN;
CREATE INDEX IF NOT EXISTS idx_deals_active
  ON public.enterprise_deals (deleted_at, archived_at);
COMMIT;
```

- [ ] **Step 2: Apply it to the dev DB**

```bash
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f lib/db/sql/2026-07-27-deals-active-index.sql
```

- [ ] **Step 3: Verify it exists**

```bash
psql "$DATABASE_URL" -c "\d enterprise_deals" | grep idx_deals_active
```

Expected: the index appears in the table's index list.

- [ ] **Step 4: Commit**

```bash
git add lib/db/sql/2026-07-27-deals-active-index.sql
git commit -m "perf: add the partial index on enterprise_deals(deleted_at, archived_at)"
```

---

## Final verification (end-to-end, on the running app)

Server routes and frontend both changed, so restart the API server (`pnpm --filter @workspace/api-server run dev` rebuilds automatically). Use the `Deal-Commander:verify` skill; check ports 5000/5173 first.

1. `pnpm --filter @workspace/api-server run test` — all lifecycle, config, analytics, and subscriber tests green.
2. `pnpm --filter @workspace/edc run test` — deal-strip-model tests green.
3. `pnpm run typecheck` from the repo root.
4. In the browser: pick a seeded Closed-Lost deal, archive it from the roster (single-row context menu → Archive).
   - Its card leaves the strip's Closed fan on the cockpit page.
   - `/analytics/win-loss` denominator is unchanged (the headline bug fix — check the actual number, don't eyeball it).
   - `/analytics/next-actions` shows nothing for it.
   - `/api/v2/export/deals` still contains its row.
   - It's findable in the command palette (⌘K / Ctrl+K).
   - Navigate directly to its `/deals/:id` URL: the Closed fan is open (not Open) and the "Archived" badge shows in the header.
5. Attempt to archive an open deal (e.g. a Commercial-stage seeded deal) via the roster bulk bar → toast reports 1 failed, deal unchanged.
6. Restore the archived deal — it reappears in the strip, and (per Task 2) if you first delete-then-restore an archived deal, confirm it lands back in Archived, not Active.
7. Leave the DB with nothing archived when done, or note explicitly what was left archived.

---

## Explicitly out of scope (carried over from the design)

- No dormant/auto-aging concept — archiving is manual only, by design.
- No blocking of edits on archived or deleted deals — an archived deal is still real and correcting its loss reason is legitimate. `updateDealHandler` is untouched.
- No purge job — neither archived nor deleted deals are ever hard-deleted.
- No change to `edc_v2.deal_memory` or the Memory hub — unrelated table, unrelated `archived_at` meaning ("closed at", not "hidden").
- No change to `/analytics/gates` or `/analytics/simulation` — both lack a closed-stage filter today (same gap as `/analytics/next-actions`), but both are aggregate/historical metrics, not action/reminder surfaces, so including archived deals in them is the intended behavior of this change, not a bug to fix. Only `/analytics/next-actions` gets the Task 6 treatment, because it's structurally different — a to-do list, not a metric.
- No dashboard refactor — every dashboard tile and its drill-in dialog already share the identical `useListDeals({ state: "active", limit: N })` cache key (verified: `dashboard-hero.tsx:46`, `total-tcv-dialog.tsx:45`, `stage-deals-dialog.tsx:41`, `weighted-pipeline-dialog.tsx:48`, `health-status-dialog.tsx:111`, `avg-score-dialog.tsx:51`), so they stay mutually consistent as "your live book" with zero changes.
- `deals_account_deal_unique(account_name, deal_name)` still blocks reusing a name while an archived deal holds it — not addressed; work around it by naming (e.g. "Acme — Renewal FY26").
