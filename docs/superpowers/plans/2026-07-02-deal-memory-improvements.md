# Deal Memory Improvements Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Upgrade the existing single-user Deal Memory module (`/memory`) from a flat search-and-list page into a fuller institutional-knowledge hub: faceted/highlighted search with a Knowledge Health dashboard, a rich tabbed Deal Detail view with side-by-side comparison, Competitive Intelligence + Pricing Benchmark tools, and a deterministic (no-LLM) "Ask Deal Memory" advisor.

**Architecture:** This plan is a deliberately scoped-down realization of `Improvements/Deal Memory Module.md` — that PRD assumes Python/FastAPI, Elasticsearch, a vector DB, Celery, and an LLM/RAG pipeline, none of which exist in this app. Everything here is built on the app's real stack: Postgres full-text search (`tsvector`/`ts_headline`, already in use), plain SQL aggregation for "intelligence," and a keyword/rule-based intent router for the "AI Advisor" instead of an LLM. All four parts extend the existing `deal_memory` table and reuse already-populated `edc_v2` tables (`dealActivityLog`, `dealSnapshots`, `dealCompetitors`, `dealPlaybookAssignments`) rather than inventing new ones.

**Tech Stack:** Express 5 + Drizzle/Postgres (`edc_v2` schema) on the backend; React 19 + Vite + Tailwind v4 + shadcn/ui + wouter + TanStack Query on the frontend. `lib/api-spec/openapi.yaml` is the API contract; Orval generates `@workspace/api-zod` (server-side Zod validators) and `@workspace/api-client-react` (client hooks) from it.

## Global Constraints

- **No LLM calls, no vector DB, no Elasticsearch, no Celery.** Every "intelligence" feature in this plan is deterministic SQL aggregation or keyword/regex rule-matching. This was an explicit user decision — do not introduce an LLM API call anywhere in this plan.
- **EDC is single-user.** Do not build multi-user RBAC, contribution leaderboards, review queues, or an onboarding tutor — those PRD sections (6.7, most of 6.8, 6.6.5) are out of scope and should not be added "for completeness."
- **API contract first.** Any new or changed endpoint: edit `lib/api-spec/openapi.yaml` under the `v2intel` tag, then run `pnpm --filter @workspace/api-spec run codegen` from the repo root before writing frontend code against the new hook. Skipping this means the hook doesn't exist yet and the frontend won't compile.
- **Route placement.** New v2 route handlers go in `artifacts/api-server/src/routes/v2/crud.ts` (CRUD-shaped, e.g. compare-by-ids) or `artifacts/api-server/src/routes/v2/analytics.ts` (read-only aggregation, e.g. facets/health/competitor-intel/pricing/advisor). Mirror the existing handler style exactly: Zod-parsed params, `db.select()` or raw `sql` for aggregates, `res.json({ data: ... })`. Express matches routes in registration order — any new literal path under `/memory/*` (e.g. `/memory/compare`) MUST be registered **before** the existing `router.get("/memory/:id", ...)` handler or Express will treat "compare" as an `:id` value.
- **Restart, don't expect hot reload.** The API server bundles with esbuild to a single file; `pnpm --filter @workspace/api-server run dev` always rebuilds before starting. After any backend change, stop the running dev process and restart it:
  `$env:DATABASE_URL='postgres://postgres:postgres@localhost:5432/edc'; $env:SESSION_SECRET='local-dev-secret-edc-2026'; $env:PORT='5000'; $env:NODE_ENV='development'; pnpm --filter @workspace/api-server run dev`
- **Frontend dev server** (PowerShell, not Git Bash): `$env:PORT='5173'; $env:BASE_PATH='/'; pnpm --filter @workspace/edc run dev`
- **Design tokens:** `emerald-500` = Won/positive, `destructive`/red = Lost/negative, `amber-500` = decay/attention, `text-muted-foreground` = secondary text. Reuse `Card`/`Badge`/`Tabs`/`Empty`/`Skeleton`/`Progress` from `@/components/ui/*` — do not add new UI or charting libraries.
- **Generic aggregate responses:** for read-only aggregation endpoints (facets, health, competitor-intel, pricing-benchmarks, playbook-effectiveness, ask), reuse the existing `GenericDataResponse` OpenAPI schema (`{ data: object }`) exactly as `getMemoryInsights`/`getRosterEnrichment` already do — do not invent a new strict schema per endpoint. On the frontend, cast `query.data?.data as <LocalInterface>` the same way `PlaybookPanel` (`artifacts/edc/src/components/cockpit/v2/playbook-panel.tsx:30`) already does.
- **`dealMemory.dealId` stays resolvable after close.** `enterprise_deals` rows are soft-deleted (`deletedAt`), never hard-deleted on stage close, so `dealActivityLog`/`dealSnapshots`/`dealPlaybookAssignments` queries by `dealId` continue to resolve for archived deals. This is why the Timeline and Connections tabs in Part 2 can reuse existing per-deal hooks unchanged.
- **Test convention:** this repo has no existing route-level integration tests (only `lib/engine` has pure-logic tests). Follow that precedent: extract genuinely new computation into a pure, DB-free function and give it a colocated Vitest `*.test.ts` (TDD: write the test, watch it fail, implement, watch it pass). Thin route handlers that just glue Zod validation + a Drizzle query together are verified manually via `curl` — do not invent integration-test scaffolding that doesn't exist elsewhere in this codebase.

---

## Part 1: Search & Knowledge Hub

### Task 1: Extend deal-memory search with facet filters and highlighted snippets

**Files:**
- Modify: `lib/api-spec/openapi.yaml` (`/v2/memory/search` parameters, `DealMemory` schema)
- Modify: `artifacts/api-server/src/routes/v2/crud.ts:690-734` (search handler + `normalizeMemoryRow`)

**Interfaces:**
- Produces: `snippet: string | null` field on every object returned by `GET /v2/memory/search`, plus 7 new optional query params consumed by the same endpoint.

- [ ] **Step 1: Add the new query params and `snippet` field to the OpenAPI spec**

In `lib/api-spec/openapi.yaml`, find the `/v2/memory/search` path (around line 1187) and replace it:

```yaml
  /v2/memory/search:
    get:
      operationId: searchDealMemory
      tags: [v2intel]
      parameters:
        - { name: q, in: query, required: false, schema: { type: string } }
        - { name: outcome, in: query, required: false, schema: { type: string } }
        - { name: competitor, in: query, required: false, schema: { type: string } }
        - { name: pricingModel, in: query, required: false, schema: { type: string } }
        - { name: servicesTier, in: query, required: false, schema: { type: string } }
        - { name: minTcv, in: query, required: false, schema: { type: number } }
        - { name: maxTcv, in: query, required: false, schema: { type: number } }
        - { name: archivedFrom, in: query, required: false, schema: { type: string, format: date-time } }
        - { name: archivedTo, in: query, required: false, schema: { type: string, format: date-time } }
        - { name: hasNarrative, in: query, required: false, schema: { type: boolean } }
      responses:
        "200": { description: Search results, content: { application/json: { schema: { $ref: "#/components/schemas/DealMemoryListResponse" } } } }
```

In the `DealMemory` schema (around line 3066), add a `snippet` property (not required, so non-search endpoints that don't compute it are unaffected):

```yaml
        archivedAt: { type: string }
        snippet: { type: ["string", "null"] }
```

(Insert the `snippet` line directly after the existing `archivedAt` line inside the `DealMemory` schema's `properties`.)

- [ ] **Step 2: Regenerate the API contract types**

Run: `pnpm --filter @workspace/api-spec run codegen`
Expected: regenerates `lib/api-zod/src/generated/api.ts` and `lib/api-client-react/src/generated/api.ts` with the new `SearchDealMemoryQueryParams` fields and `DealMemory.snippet`. No manual edits to generated files.

- [ ] **Step 3: Rewrite the search handler to apply facet filters and compute a highlighted snippet**

In `artifacts/api-server/src/routes/v2/crud.ts`, add `gte` and `lte` are not needed (raw SQL is used throughout for this handler) — no import changes needed. Replace the existing `/memory/search` handler (lines 690-708) with:

```ts
router.get("/memory/search", async (req: Request, res: Response) => {
  const q = SearchDealMemoryQueryParams.parse(req.query);
  const term = (q.q ?? "").trim();

  const extraFilters = [];
  if (q.outcome) extraFilters.push(sql`AND outcome = ${q.outcome}`);
  if (q.competitor) extraFilters.push(sql`AND competitors_faced @> ARRAY[${q.competitor}]::text[]`);
  if (q.pricingModel) extraFilters.push(sql`AND pricing_model = ${q.pricingModel}`);
  if (q.servicesTier) extraFilters.push(sql`AND services_tier = ${q.servicesTier}`);
  if (q.minTcv != null) extraFilters.push(sql`AND final_tcv::numeric >= ${q.minTcv}`);
  if (q.maxTcv != null) extraFilters.push(sql`AND final_tcv::numeric <= ${q.maxTcv}`);
  if (q.archivedFrom) extraFilters.push(sql`AND archived_at >= ${new Date(q.archivedFrom)}`);
  if (q.archivedTo) extraFilters.push(sql`AND archived_at <= ${new Date(q.archivedTo)}`);
  if (q.hasNarrative === true) extraFilters.push(sql`AND win_loss_narrative IS NOT NULL AND win_loss_narrative <> ''`);
  const extra = sql.join(extraFilters, sql` `);

  const rows = term
    ? await db.execute(sql`
        SELECT *,
          ts_headline('english',
            coalesce(win_loss_narrative,'') || ' ' || coalesce(array_to_string(key_lessons, ' '), ''),
            plainto_tsquery('english', ${term}),
            'StartSel=<mark>,StopSel=</mark>,MaxWords=40,MinWords=15,MaxFragments=2'
          ) AS snippet
        FROM edc_v2.deal_memory
        WHERE searchable_vector @@ plainto_tsquery('english', ${term})
        ${extra}
        ORDER BY ts_rank(searchable_vector, plainto_tsquery('english', ${term})) DESC
        LIMIT 50`)
    : await db.execute(sql`
        SELECT *, NULL AS snippet
        FROM edc_v2.deal_memory
        WHERE true
        ${extra}
        ORDER BY archived_at DESC
        LIMIT 50`);
  const list = Array.isArray(rows) ? rows : (rows as { rows: unknown[] }).rows ?? [];
  res.json({ data: (list as Record<string, unknown>[]).map(normalizeMemoryRow) });
});
```

This removes the old two-branch (Drizzle query builder vs. raw SQL) split — both branches now share the same `extra` filter fragments and both go through raw SQL, which is simpler than maintaining two parallel filter implementations.

Update `normalizeMemoryRow` (lines 711-734) to surface the new field — add this line right after the `archivedAt:` entry:

```ts
    snippet: (r.snippet as string | null) ?? null,
```

- [ ] **Step 4: Typecheck and restart the API server**

Run: `pnpm run typecheck`
Expected: no errors in `artifacts/api-server`.

Restart the API server (see Global Constraints), then verify with curl:
```bash
curl -s "http://localhost:5000/api/v1/auth/login" -X POST -H "Content-Type: application/json" -d '{"email":"commander","password":"DealCommander!2026"}' -c /tmp/edc-cookie.txt
curl -s -b /tmp/edc-cookie.txt "http://localhost:5000/api/v2/memory/search?q=pricing&minTcv=100000"
```
Expected: `200 OK`, JSON array where matching rows include a `snippet` string containing `<mark>` around matched terms, and results respect `minTcv`.

- [ ] **Step 5: Commit**

```bash
git add lib/api-spec/openapi.yaml lib/api-zod lib/api-client-react artifacts/api-server/src/routes/v2/crud.ts
git commit -m "feat(memory): add facet filters and highlighted snippets to deal memory search"
```

---

### Task 2: Add facets and Knowledge Health endpoints

**Files:**
- Create: `artifacts/api-server/src/lib/memory-health.ts`
- Create: `artifacts/api-server/src/lib/memory-health.test.ts`
- Modify: `lib/api-spec/openapi.yaml` (two new paths under `v2intel`, both reusing `GenericDataResponse`)
- Modify: `artifacts/api-server/src/routes/v2/crud.ts` (add `/memory/facets`)
- Modify: `artifacts/api-server/src/routes/v2/analytics.ts` (add `/analytics/memory-health`)

**Interfaces:**
- Produces: `computeMemoryHealth(rows: MemoryRow[], now?: Date): MemoryHealth` — pure function, consumed only by the new route handler.
- Produces: `GET /v2/memory/facets` → `{ data: { outcomes, pricingModels, servicesTiers, competitors: {value,count}[], total } }`
- Produces: `GET /v2/analytics/memory-health` → `{ data: MemoryHealth }`

- [ ] **Step 1: Write the failing test for the health-metrics pure function**

Create `artifacts/api-server/src/lib/memory-health.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { computeMemoryHealth, type MemoryRow } from "./memory-health";

function row(overrides: Partial<MemoryRow> = {}): MemoryRow {
  return {
    id: "r1",
    outcome: "Won",
    finalTcv: "100000",
    competitorsFaced: [],
    winLossNarrative: null,
    keyLessons: null,
    archivedAt: new Date(),
    autopsyCompletedAt: null,
    ...overrides,
  } as MemoryRow;
}

describe("computeMemoryHealth", () => {
  it("returns zeroed metrics for an empty archive", () => {
    const health = computeMemoryHealth([]);
    expect(health.totalArchived).toBe(0);
    expect(health.archiveCompletenessPct).toBe(0);
    expect(health.decayCount).toBe(0);
  });

  it("computes completeness from narrative presence", () => {
    const rows = [row({ winLossNarrative: "Won on price" }), row({ winLossNarrative: null })];
    expect(computeMemoryHealth(rows).archiveCompletenessPct).toBe(50);
  });

  it("averages key lessons per deal for knowledge density", () => {
    const rows = [row({ keyLessons: ["a", "b"] }), row({ keyLessons: ["c"] })];
    expect(computeMemoryHealth(rows).knowledgeDensity).toBe(1.5);
  });

  it("flags decayed Lost deals with no narrative and no autopsy older than 180 days", () => {
    const old = new Date(Date.now() - 200 * 86_400_000);
    const rows = [row({ outcome: "Lost", archivedAt: old, winLossNarrative: null, autopsyCompletedAt: null })];
    expect(computeMemoryHealth(rows).decayCount).toBe(1);
  });

  it("does not flag a Lost deal as decayed once autopsy is completed", () => {
    const old = new Date(Date.now() - 200 * 86_400_000);
    const rows = [row({ outcome: "Lost", archivedAt: old, autopsyCompletedAt: new Date() })];
    expect(computeMemoryHealth(rows).decayCount).toBe(0);
  });

  it("buckets coverage by outcome and competitor presence", () => {
    const rows = [row({ outcome: "Won", competitorsFaced: ["CloudBridge"] }), row({ outcome: "Won", competitorsFaced: [] })];
    const coverage = computeMemoryHealth(rows).coverage;
    expect(coverage.find((c) => c.value === "with competitor")?.count).toBe(1);
    expect(coverage.find((c) => c.value === "no competitor")?.count).toBe(1);
  });
});
```

- [ ] **Step 2: Run the test and confirm it fails**

Run: `pnpm --filter @workspace/api-server exec vitest run src/lib/memory-health.test.ts`
Expected: FAIL — `Cannot find module './memory-health'`.

- [ ] **Step 3: Implement `computeMemoryHealth`**

Create `artifacts/api-server/src/lib/memory-health.ts`:

```ts
const DAY_MS = 86_400_000;

export interface MemoryRow {
  id: string;
  outcome: string;
  finalTcv: string | null;
  competitorsFaced: string[] | null;
  winLossNarrative: string | null;
  keyLessons: string[] | null;
  archivedAt: Date;
  autopsyCompletedAt: Date | null;
}

export interface MemoryHealth {
  totalArchived: number;
  archiveCompletenessPct: number;
  knowledgeDensity: number;
  freshnessPct: number;
  coverage: { dimension: string; value: string; count: number }[];
  decayCount: number;
}

const hasNarrative = (r: MemoryRow) => !!r.winLossNarrative && r.winLossNarrative.trim().length > 0;

export function computeMemoryHealth(rows: MemoryRow[], now: Date = new Date()): MemoryHealth {
  const total = rows.length;
  const withNarrative = rows.filter(hasNarrative).length;
  const totalLessons = rows.reduce((sum, r) => sum + (r.keyLessons?.length ?? 0), 0);

  const ninetyDaysAgo = new Date(now.getTime() - 90 * DAY_MS);
  const fresh = rows.filter((r) => {
    const latest = r.autopsyCompletedAt ?? r.archivedAt;
    return latest && new Date(latest) >= ninetyDaysAgo;
  }).length;

  const coverageMap = new Map<string, number>();
  for (const r of rows) {
    const value = r.competitorsFaced?.length ? "with competitor" : "no competitor";
    const key = `${r.outcome}::${value}`;
    coverageMap.set(key, (coverageMap.get(key) ?? 0) + 1);
  }
  const coverage = [...coverageMap.entries()].map(([key, count]) => {
    const [dimension, value] = key.split("::");
    return { dimension, value, count };
  });

  const oneEightyDaysAgo = new Date(now.getTime() - 180 * DAY_MS);
  const decayCount = rows.filter(
    (r) =>
      r.outcome === "Lost" &&
      new Date(r.archivedAt) < oneEightyDaysAgo &&
      !hasNarrative(r) &&
      !r.autopsyCompletedAt,
  ).length;

  return {
    totalArchived: total,
    archiveCompletenessPct: total ? Math.round((withNarrative / total) * 100) : 0,
    knowledgeDensity: total ? Math.round((totalLessons / total) * 10) / 10 : 0,
    freshnessPct: total ? Math.round((fresh / total) * 100) : 0,
    coverage,
    decayCount,
  };
}
```

- [ ] **Step 4: Run the test and confirm it passes**

Run: `pnpm --filter @workspace/api-server exec vitest run src/lib/memory-health.test.ts`
Expected: PASS (7/7).

- [ ] **Step 5: Add the two new OpenAPI paths**

In `lib/api-spec/openapi.yaml`, add after the existing `/v2/memory/{id}` block (around line 1219):

```yaml
  /v2/memory/facets:
    get:
      operationId: getMemoryFacets
      tags: [v2intel]
      responses:
        "200": { description: Distinct facet values and counts for deal memory search filters, content: { application/json: { schema: { $ref: "#/components/schemas/GenericDataResponse" } } } }
```

And after the existing `/v2/analytics/memory-insights` block (around line 1072):

```yaml
  /v2/analytics/memory-health:
    get:
      operationId: getMemoryHealth
      tags: [v2intel]
      responses:
        "200": { description: Knowledge base health metrics for the deal memory archive, content: { application/json: { schema: { $ref: "#/components/schemas/GenericDataResponse" } } } }
```

Run: `pnpm --filter @workspace/api-spec run codegen`
Expected: generates `useGetMemoryFacets()` and `useGetMemoryHealth()` hooks.

- [ ] **Step 6: Implement the facets handler**

In `artifacts/api-server/src/routes/v2/crud.ts`, add directly after the `/memory/search` handler:

```ts
router.get("/memory/facets", async (_req: Request, res: Response) => {
  const rows = await db
    .select({
      outcome: dealMemory.outcome,
      pricingModel: dealMemory.pricingModel,
      servicesTier: dealMemory.servicesTier,
      competitorsFaced: dealMemory.competitorsFaced,
    })
    .from(dealMemory);

  const bump = (m: Map<string, number>, k: string | null | undefined) => {
    if (!k) return;
    m.set(k, (m.get(k) ?? 0) + 1);
  };
  const outcomes = new Map<string, number>();
  const pricingModels = new Map<string, number>();
  const servicesTiers = new Map<string, number>();
  const competitorCounts = new Map<string, number>();
  for (const r of rows) {
    bump(outcomes, r.outcome);
    bump(pricingModels, r.pricingModel);
    bump(servicesTiers, r.servicesTier);
    for (const c of r.competitorsFaced ?? []) bump(competitorCounts, c);
  }
  const toList = (m: Map<string, number>) =>
    [...m.entries()].map(([value, count]) => ({ value, count })).sort((a, b) => b.count - a.count);

  res.json({
    data: {
      outcomes: toList(outcomes),
      pricingModels: toList(pricingModels),
      servicesTiers: toList(servicesTiers),
      competitors: toList(competitorCounts),
      total: rows.length,
    },
  });
});
```

- [ ] **Step 7: Implement the health handler**

In `artifacts/api-server/src/routes/v2/analytics.ts`, add `computeMemoryHealth` to the imports and add a handler directly after the existing `/analytics/memory-insights` route:

```ts
import { computeMemoryHealth } from "../../lib/memory-health";
```

```ts
router.get("/analytics/memory-health", async (_req: Request, res: Response) => {
  const rows = await db.select().from(dealMemory);
  res.json({ data: computeMemoryHealth(rows) });
});
```

- [ ] **Step 8: Typecheck, restart, and verify**

Run: `pnpm run typecheck`, then restart the API server, then:
```bash
curl -s -b /tmp/edc-cookie.txt "http://localhost:5000/api/v2/memory/facets"
curl -s -b /tmp/edc-cookie.txt "http://localhost:5000/api/v2/analytics/memory-health"
```
Expected: both return `200` with the shapes above.

- [ ] **Step 9: Commit**

```bash
git add lib/api-spec/openapi.yaml lib/api-zod lib/api-client-react artifacts/api-server/src/lib/memory-health.ts artifacts/api-server/src/lib/memory-health.test.ts artifacts/api-server/src/routes/v2/crud.ts artifacts/api-server/src/routes/v2/analytics.ts
git commit -m "feat(memory): add facets and knowledge-health aggregation endpoints"
```

---

### Task 3: Rebuild the Knowledge Hub page shell and Search tab

**Files:**
- Modify: `artifacts/edc/src/pages/memory.tsx` (becomes the tabbed shell)
- Create: `artifacts/edc/src/components/memory/search-tab.tsx`
- Create: `artifacts/edc/src/components/memory/memory-result-card.tsx`
- Create: `artifacts/edc/src/hooks/use-saved-memory-searches.ts`

**Interfaces:**
- Consumes: `useSearchDealMemory`, `useGetMemoryFacets` (from `@workspace/api-client-react`); `useLocalStorageState<T>(key, initial, opts?)` from `@/hooks/use-local-storage-state`.
- Produces: `<SearchTab selected: string[]; onToggleSelect: (id: string) => void; onCompare: () => void />` — `selected` and the compare trigger are threaded up so Task 5's comparison sheet (added on top of this file later) can read the current multi-select. Exported `MemoryResultCard` takes a `memory` (from `useSearchDealMemory().data.data[number]`), `selected: boolean`, `onToggleSelect: () => void`.

- [ ] **Step 1: Add a saved-searches hook**

Create `artifacts/edc/src/hooks/use-saved-memory-searches.ts`:

```ts
import { useLocalStorageState } from "./use-local-storage-state";

export interface SavedMemorySearch {
  id: string;
  label: string;
  q: string;
  outcome: string;
  competitor: string;
  pricingModel: string;
  servicesTier: string;
}

const MAX_HISTORY = 10;

export function useSavedMemorySearches() {
  const [saved, setSaved] = useLocalStorageState<SavedMemorySearch[]>("edc.memory.savedSearches", []);
  const [history, setHistory] = useLocalStorageState<string[]>("edc.memory.searchHistory", []);

  const save = (search: Omit<SavedMemorySearch, "id">) => {
    setSaved((prev) => [{ ...search, id: crypto.randomUUID() }, ...prev].slice(0, 20));
  };
  const remove = (id: string) => setSaved((prev) => prev.filter((s) => s.id !== id));
  const recordQuery = (q: string) => {
    const trimmed = q.trim();
    if (!trimmed) return;
    setHistory((prev) => [trimmed, ...prev.filter((h) => h !== trimmed)].slice(0, MAX_HISTORY));
  };

  return { saved, save, remove, history, recordQuery };
}
```

- [ ] **Step 2: Extract the result card**

Create `artifacts/edc/src/components/memory/memory-result-card.tsx`:

```tsx
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Link } from "wouter";

type MemoryResult = {
  id: string;
  dealId: string;
  dealName: string;
  accountName: string;
  outcome: string;
  finalTcv: unknown;
  totalDaysActive: number | null;
  totalGatesCompleted: number | null;
  competitorsFaced: string[] | null;
  winLossNarrative: string | null;
  keyLessons: string[] | null;
  tags: string[] | null;
  snippet?: string | null;
};

function money(n: unknown): string {
  return "$" + Math.round(Number(n) || 0).toLocaleString("en-US");
}

export function MemoryResultCard({
  memory: m,
  selected,
  onToggleSelect,
}: {
  memory: MemoryResult;
  selected: boolean;
  onToggleSelect: () => void;
}) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-base flex items-center justify-between gap-2">
          <span className="flex items-center gap-2 min-w-0">
            <Checkbox checked={selected} onCheckedChange={onToggleSelect} aria-label="Select for comparison" />
            <Link href={`/memory/${m.id}`} className="hover:underline truncate">
              {m.dealName}
            </Link>
            <span className="text-muted-foreground font-normal">· {m.accountName}</span>
          </span>
          <Badge className={m.outcome === "Won" ? "bg-emerald-500 text-white" : "bg-destructive text-white"}>
            {m.outcome}
          </Badge>
        </CardTitle>
      </CardHeader>
      <CardContent className="text-sm space-y-2">
        <p className="text-muted-foreground">
          {money(m.finalTcv)} · {m.totalDaysActive ?? "—"} days active · {m.totalGatesCompleted ?? 0} gates
          {m.competitorsFaced?.length ? ` · vs ${m.competitorsFaced.join(", ")}` : ""}
        </p>
        {m.snippet ? (
          <p
            className="text-muted-foreground [&_mark]:bg-amber-500/20 [&_mark]:text-amber-600 [&_mark]:rounded-sm [&_mark]:px-0.5"
            dangerouslySetInnerHTML={{ __html: m.snippet }}
          />
        ) : (
          m.winLossNarrative && <p>{m.winLossNarrative}</p>
        )}
        {m.keyLessons && m.keyLessons.length > 0 && (
          <ul className="list-disc pl-5 text-muted-foreground">
            {m.keyLessons.map((l, i) => <li key={i}>{l}</li>)}
          </ul>
        )}
        {m.tags && m.tags.length > 0 && (
          <div className="flex gap-1 flex-wrap">
            {m.tags.map((t) => <Badge key={t} variant="outline" className="text-xs">{t}</Badge>)}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
```

`snippet` comes from Postgres `ts_headline` (Task 1), which only ever emits the literal `<mark>`/`</mark>` tags this component itself requested server-side — it is not arbitrary user input rendered unescaped, so `dangerouslySetInnerHTML` here is safe in the same way the rest of the codebase trusts server-computed HTML fragments.

- [ ] **Step 3: Build the Search tab**

Create `artifacts/edc/src/components/memory/search-tab.tsx`:

```tsx
import { useState } from "react";
import { useSearchDealMemory, useGetMemoryFacets } from "@workspace/api-client-react";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Search, X } from "lucide-react";
import { MemoryResultCard } from "./memory-result-card";
import { useSavedMemorySearches } from "@/hooks/use-saved-memory-searches";

interface FacetBucket { value: string; count: number }
interface FacetsPayload {
  outcomes: FacetBucket[];
  pricingModels: FacetBucket[];
  servicesTiers: FacetBucket[];
  competitors: FacetBucket[];
  total: number;
}

export function SearchTab({
  selected,
  onToggleSelect,
  onCompare,
}: {
  selected: string[];
  onToggleSelect: (id: string) => void;
  onCompare: () => void;
}) {
  const [q, setQ] = useState("");
  const [outcome, setOutcome] = useState("all");
  const [competitor, setCompetitor] = useState("all");
  const [pricingModel, setPricingModel] = useState("all");

  const { saved, save, remove, history, recordQuery } = useSavedMemorySearches();
  const facetsQuery = useGetMemoryFacets();
  const facets = facetsQuery.data?.data as FacetsPayload | undefined;

  const params: Record<string, string> = {};
  if (q.trim()) params.q = q.trim();
  if (outcome !== "all") params.outcome = outcome;
  if (competitor !== "all") params.competitor = competitor;
  if (pricingModel !== "all") params.pricingModel = pricingModel;
  const { data, isLoading } = useSearchDealMemory(params as never);
  const results = data?.data ?? [];

  const runSearch = () => recordQuery(q);

  return (
    <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
      <div className="lg:col-span-1 space-y-4">
        <div className="rounded-lg border bg-card p-4 space-y-3">
          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Filters</p>
          <div className="space-y-1">
            <label className="text-xs text-muted-foreground">Outcome</label>
            <Select value={outcome} onValueChange={setOutcome}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All outcomes</SelectItem>
                <SelectItem value="Won">Won</SelectItem>
                <SelectItem value="Lost">Lost</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <label className="text-xs text-muted-foreground">Competitor</label>
            <Select value={competitor} onValueChange={setCompetitor}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Any competitor</SelectItem>
                {(facets?.competitors ?? []).map((c) => (
                  <SelectItem key={c.value} value={c.value}>{c.value} ({c.count})</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <label className="text-xs text-muted-foreground">Pricing model</label>
            <Select value={pricingModel} onValueChange={setPricingModel}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Any model</SelectItem>
                {(facets?.pricingModels ?? []).map((p) => (
                  <SelectItem key={p.value} value={p.value}>{p.value} ({p.count})</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          {(competitor !== "all" || pricingModel !== "all" || outcome !== "all") && (
            <Button variant="ghost" size="sm" className="w-full" onClick={() => { setOutcome("all"); setCompetitor("all"); setPricingModel("all"); }}>
              <X className="h-3.5 w-3.5 mr-1" /> Clear filters
            </Button>
          )}
        </div>

        <div className="rounded-lg border bg-card p-4 space-y-2">
          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Saved searches</p>
          {saved.length === 0 && <p className="text-xs text-muted-foreground">None yet — save your current filters below.</p>}
          {saved.map((s) => (
            <div key={s.id} className="flex items-center justify-between gap-2 text-sm">
              <button
                type="button"
                className="hover:underline truncate text-left"
                onClick={() => { setQ(s.q); setOutcome(s.outcome); setCompetitor(s.competitor); setPricingModel(s.pricingModel); }}
              >
                {s.label}
              </button>
              <button type="button" onClick={() => remove(s.id)} aria-label="Remove saved search">
                <X className="h-3.5 w-3.5 text-muted-foreground" />
              </button>
            </div>
          ))}
          <Button
            variant="outline"
            size="sm"
            className="w-full"
            onClick={() => {
              const label = q.trim() || `${outcome}/${competitor}/${pricingModel}`;
              save({ label, q, outcome, competitor, pricingModel });
            }}
          >
            Save current search
          </Button>
          {history.length > 0 && (
            <>
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider pt-2">Recent</p>
              <div className="flex flex-wrap gap-1">
                {history.map((h) => (
                  <Badge key={h} variant="outline" className="cursor-pointer" onClick={() => setQ(h)}>{h}</Badge>
                ))}
              </div>
            </>
          )}
        </div>
      </div>

      <div className="lg:col-span-3 space-y-4">
        <div className="flex gap-2">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              className="pl-9"
              placeholder="Search account, deal, lessons, narrative…"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              onBlur={runSearch}
              onKeyDown={(e) => e.key === "Enter" && runSearch()}
            />
          </div>
          {selected.length > 0 && (
            <Button onClick={onCompare} disabled={selected.length < 2}>
              Compare ({selected.length})
            </Button>
          )}
        </div>

        <p className="text-xs text-muted-foreground">
          {isLoading ? "Searching…" : `${results.length} result${results.length === 1 ? "" : "s"}${facets ? ` of ${facets.total} archived deals` : ""}`}
        </p>

        {!isLoading && results.length === 0 && (
          <p className="text-muted-foreground text-sm">
            No archived deals yet. Deals are archived here automatically when they reach Closed-Won or Closed-Lost.
          </p>
        )}

        <div className="space-y-3">
          {results.map((m) => (
            <MemoryResultCard
              key={m.id}
              memory={m}
              selected={selected.includes(m.id)}
              onToggleSelect={() => onToggleSelect(m.id)}
            />
          ))}
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Rewrite the page shell**

Replace `artifacts/edc/src/pages/memory.tsx` entirely:

```tsx
import { useState } from "react";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { SearchTab } from "@/components/memory/search-tab";

const TABS = [
  { id: "search", label: "Search" },
  { id: "health", label: "Health" },
];

export default function Memory() {
  const [tab, setTab] = useState("search");
  const [selected, setSelected] = useState<string[]>([]);

  const toggleSelect = (id: string) =>
    setSelected((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : prev.length >= 4 ? prev : [...prev, id]));

  return (
    <div className="p-8 max-w-[1600px] mx-auto space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div>
        <h1 className="text-3xl font-bold">Deal Memory</h1>
        <p className="text-muted-foreground">Institutional knowledge base — searchable archive of closed deals.</p>
      </div>

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList>
          {TABS.map((t) => <TabsTrigger key={t.id} value={t.id}>{t.label}</TabsTrigger>)}
        </TabsList>
      </Tabs>

      {tab === "search" && (
        <SearchTab selected={selected} onToggleSelect={toggleSelect} onCompare={() => { /* wired in Part 2 Task 9 */ }} />
      )}
      {tab === "health" && <div className="text-sm text-muted-foreground">Built in Task 4.</div>}
    </div>
  );
}
```

Note: `onCompare` is a no-op placeholder here deliberately — Part 2 Task 9 replaces it with the real comparison sheet trigger once that sheet exists. This is not a "TODO" left in shippable code; the page compiles and works fully (search, filters, saved searches) without it, and the plan tracks the follow-up explicitly.

- [ ] **Step 5: Typecheck and manually verify in the browser**

Run: `pnpm run typecheck`

Start both dev servers (see Global Constraints), open `http://localhost:5173/memory`, and confirm: search box works, outcome/competitor/pricing-model filters narrow results, matched terms show a highlighted `<mark>` snippet, "Save current search" persists across a page reload (localStorage), and checkbox selection shows a "Compare (n)" button once 2+ rows are selected.

- [ ] **Step 6: Commit**

```bash
git add artifacts/edc/src/pages/memory.tsx artifacts/edc/src/components/memory/search-tab.tsx artifacts/edc/src/components/memory/memory-result-card.tsx artifacts/edc/src/hooks/use-saved-memory-searches.ts
git commit -m "feat(memory): rebuild Deal Memory as a tabbed Knowledge Hub with faceted, highlighted search"
```

---

### Task 4: Knowledge Health dashboard tab

**Files:**
- Create: `artifacts/edc/src/components/memory/health-dashboard.tsx`
- Modify: `artifacts/edc/src/pages/memory.tsx` (wire the tab)

**Interfaces:**
- Consumes: `useGetMemoryHealth()` → `{ data: MemoryHealth }` (shape from Task 2's `computeMemoryHealth`).

- [ ] **Step 1: Build the dashboard**

Create `artifacts/edc/src/components/memory/health-dashboard.tsx`:

```tsx
import { useGetMemoryHealth } from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";

interface MemoryHealth {
  totalArchived: number;
  archiveCompletenessPct: number;
  knowledgeDensity: number;
  freshnessPct: number;
  coverage: { dimension: string; value: string; count: number }[];
  decayCount: number;
}

function MetricCard({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <Card>
      <CardContent className="p-4">
        <p className="text-xs text-muted-foreground uppercase tracking-wider mb-1">{label}</p>
        <p className="text-2xl font-bold font-mono tabular-nums">{value}</p>
        {sub && <p className="text-xs text-muted-foreground mt-1">{sub}</p>}
      </CardContent>
    </Card>
  );
}

export function HealthDashboard() {
  const { data, isLoading } = useGetMemoryHealth();
  const health = data?.data as MemoryHealth | undefined;

  if (isLoading) return <Skeleton className="h-48 w-full" />;
  if (!health || health.totalArchived === 0) {
    return <p className="text-sm text-muted-foreground">No archived deals yet — health metrics populate once deals close.</p>;
  }

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <MetricCard label="Total Archived" value={String(health.totalArchived)} />
        <MetricCard label="Archive Completeness" value={`${health.archiveCompletenessPct}%`} sub="Deals with a narrative" />
        <MetricCard label="Knowledge Density" value={String(health.knowledgeDensity)} sub="Avg. lessons per deal" />
        <MetricCard label="Freshness" value={`${health.freshnessPct}%`} sub="Updated in last 90 days" />
      </div>

      <Card>
        <CardHeader><CardTitle className="text-lg">Coverage</CardTitle></CardHeader>
        <CardContent className="space-y-2">
          {health.coverage.map((c) => (
            <div key={`${c.dimension}-${c.value}`} className="flex items-center gap-3">
              <span className="text-sm w-40 shrink-0">{c.dimension} · {c.value}</span>
              <Progress value={(c.count / health.totalArchived) * 100} className="flex-1" />
              <span className="text-xs font-mono text-muted-foreground w-10 text-right">{c.count}</span>
            </div>
          ))}
        </CardContent>
      </Card>

      {health.decayCount > 0 && (
        <div className="rounded-lg border border-amber-500/30 bg-amber-500/5 p-3 text-sm">
          <span className="font-medium">{health.decayCount}</span> archived Lost deal{health.decayCount === 1 ? "" : "s"} {health.decayCount === 1 ? "has" : "have"} no narrative or autopsy after 180+ days — consider revisiting via the Autopsy page.
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Wire the tab into the page shell**

In `artifacts/edc/src/pages/memory.tsx`, add the import and replace the placeholder:

```tsx
import { HealthDashboard } from "@/components/memory/health-dashboard";
```

```tsx
      {tab === "health" && <HealthDashboard />}
```

- [ ] **Step 3: Typecheck and verify in the browser**

Run: `pnpm run typecheck`. Open `http://localhost:5173/memory`, click the "Health" tab, confirm metric cards render real numbers matching the `curl` output from Task 2 Step 8.

- [ ] **Step 4: Commit**

```bash
git add artifacts/edc/src/components/memory/health-dashboard.tsx artifacts/edc/src/pages/memory.tsx
git commit -m "feat(memory): add Knowledge Health dashboard tab"
```

---

## Part 2: Rich Deal Detail & Comparison

### Task 5: Backend compare-by-ids endpoint

**Files:**
- Modify: `lib/api-spec/openapi.yaml` (`/v2/memory/compare` path)
- Modify: `artifacts/api-server/src/routes/v2/crud.ts` (add handler + `inArray` import)

**Interfaces:**
- Produces: `GET /v2/memory/compare?ids=a,b,c,d` → `DealMemoryListResponse` (reuses existing schema).

- [ ] **Step 1: Add the OpenAPI path**

In `lib/api-spec/openapi.yaml`, add directly after the `/v2/memory/similar/{dealId}` block (around line 1203), before `/v2/memory/{id}`:

```yaml
  /v2/memory/compare:
    get:
      operationId: compareDealMemory
      tags: [v2intel]
      parameters:
        - { name: ids, in: query, required: true, schema: { type: string } }
      responses:
        "200": { description: Up to 4 memory records by id for side-by-side comparison, content: { application/json: { schema: { $ref: "#/components/schemas/DealMemoryListResponse" } } } }
```

Run: `pnpm --filter @workspace/api-spec run codegen`

- [ ] **Step 2: Add the handler — before the `:id` route**

In `artifacts/api-server/src/routes/v2/crud.ts`, add `inArray` to the existing `drizzle-orm` import (`import { and, asc, desc, eq, inArray, sql } from "drizzle-orm";`), and add `CompareDealMemoryQueryParams` to the `@workspace/api-zod` import list.

Insert the handler directly after the `/memory/similar/:dealId` route and directly before `router.get("/memory/:id", ...)` — this ordering is required (see Global Constraints):

```ts
router.get("/memory/compare", async (req: Request, res: Response) => {
  const { ids } = CompareDealMemoryQueryParams.parse(req.query);
  const idList = ids.split(",").map((s) => s.trim()).filter(Boolean).slice(0, 4);
  if (idList.length === 0) return res.json({ data: [] });
  const rows = await db.select().from(dealMemory).where(inArray(dealMemory.id, idList));
  res.json({ data: rows.map(memoryOut) });
});
```

- [ ] **Step 3: Typecheck, restart, verify**

Run: `pnpm run typecheck`, restart the API server, then:
```bash
curl -s -b /tmp/edc-cookie.txt "http://localhost:5000/api/v2/memory/compare?ids=<id1>,<id2>"
```
(substitute two real ids from `GET /v2/memory` output). Expected: `200` with exactly those two records.

- [ ] **Step 4: Commit**

```bash
git add lib/api-spec/openapi.yaml lib/api-zod lib/api-client-react artifacts/api-server/src/routes/v2/crud.ts
git commit -m "feat(memory): add compare-by-ids endpoint for deal memory comparison"
```

---

### Task 6: Extract the shared autopsy form

**Files:**
- Create: `artifacts/edc/src/components/memory/autopsy-form.tsx`
- Modify: `artifacts/edc/src/components/autopsy/loss-autopsy-sheet.tsx` (becomes a thin wrapper)

**Interfaces:**
- Produces: `<AutopsyForm dealId dealName memoryRow onSaved? />` — pure form component with no `Sheet` chrome, usable both inside a `Sheet` (existing Autopsy page flow) and inline in a tab (Task 8).

This is a pure refactor — no behavior change. It exists because Task 8 needs the exact same autopsy form inline in the Deal Detail page, and duplicating ~200 lines of form/state logic would violate DRY for a concrete, immediate second use site.

- [ ] **Step 1: Create `AutopsyForm` with the extracted body**

Create `artifacts/edc/src/components/memory/autopsy-form.tsx` by moving everything from `loss-autopsy-sheet.tsx` except the `Sheet` wrapper: the `LOSS_CATEGORIES`/`WIN_BACK_TIMELINES` constants, the `ListEditor` helper, the `FormState` interface, and the entire `useForm`/`onSubmit` logic, restructured as:

```tsx
import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { useQueryClient } from "@tanstack/react-query";
import {
  useUpdateDealMemory,
  useUpdateDeal,
  useListCompetitors,
  useListLossArchetypes,
  getSearchDealMemoryQueryKey,
} from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Slider } from "@/components/ui/slider";
import { Checkbox } from "@/components/ui/checkbox";
import { Combobox } from "@/components/ui/combobox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { Plus, Trash2 } from "lucide-react";

const LOSS_CATEGORIES = [
  { value: "price", label: "Price / Commercial" },
  { value: "product", label: "Product / Technical" },
  { value: "competitive", label: "Competitive" },
  { value: "timing", label: "Timing" },
  { value: "relationship", label: "Relationship" },
  { value: "process", label: "Process / Execution" },
];

const WIN_BACK_TIMELINES = [
  { value: "immediate", label: "Immediate (<30 days)" },
  { value: "short_term", label: "Short-term (30-90 days)" },
  { value: "long_term", label: "Long-term (90+ days)" },
  { value: "none", label: "None" },
];

interface FormState {
  primary_loss_category: string;
  loss_subcategory: string;
  loss_narrative: string;
  winning_competitor_id: number | "";
  win_back_potential: number;
  win_back_timeline: string;
  decision_maker_engaged: boolean;
  champion_identified: boolean;
  loss_archetype_id: number | "";
}

function ListEditor({
  label,
  values,
  onChange,
  placeholder,
}: {
  label: string;
  values: string[];
  onChange: (v: string[]) => void;
  placeholder: string;
}) {
  return (
    <div className="grid gap-2">
      <Label>{label}</Label>
      {values.map((v, i) => (
        <div key={i} className="flex gap-2">
          <Input
            value={v}
            placeholder={placeholder}
            onChange={(e) => onChange(values.map((x, j) => (j === i ? e.target.value : x)))}
          />
          <Button type="button" variant="ghost" size="icon" onClick={() => onChange(values.filter((_, j) => j !== i))}>
            <Trash2 className="h-4 w-4" />
          </Button>
        </div>
      ))}
      {values.length < 5 && (
        <Button type="button" variant="outline" size="sm" onClick={() => onChange([...values, ""])}>
          <Plus className="h-4 w-4 mr-1" /> Add
        </Button>
      )}
    </div>
  );
}

interface MemoryRow {
  id: string;
  primaryLossCategory: string | null;
  lossSubcategory: string | null;
  lossNarrative: string | null;
  winningCompetitorId: number | null;
  winBackPotential: number | null;
  winBackTimeline: string | null;
  decisionMakerEngaged: boolean | null;
  championIdentified: boolean | null;
  causalChain: string[] | null;
  productGaps: string[] | null;
}

export function AutopsyForm({
  dealId,
  dealName,
  memoryRow,
  onSaved,
}: {
  dealId: string;
  dealName: string;
  memoryRow: MemoryRow | undefined;
  onSaved?: () => void;
}) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const updateMemory = useUpdateDealMemory();
  const updateDeal = useUpdateDeal();
  const { data: competitorsData } = useListCompetitors();
  const { data: archetypesData } = useListLossArchetypes();

  const competitorOptions = (competitorsData?.data ?? []).map((c) => ({ value: String(c.id), label: c.name }));

  const [causalChain, setCausalChain] = useState<string[]>([]);
  const [productGaps, setProductGaps] = useState<string[]>([]);

  const { register, handleSubmit, setValue, watch, reset, formState } = useForm<FormState>({
    defaultValues: {
      primary_loss_category: "",
      loss_subcategory: "",
      loss_narrative: "",
      winning_competitor_id: "",
      win_back_potential: 0,
      win_back_timeline: "none",
      decision_maker_engaged: false,
      champion_identified: false,
      loss_archetype_id: "",
    },
  });

  useEffect(() => {
    if (!memoryRow) return;
    reset({
      primary_loss_category: memoryRow.primaryLossCategory ?? "",
      loss_subcategory: memoryRow.lossSubcategory ?? "",
      loss_narrative: memoryRow.lossNarrative ?? "",
      winning_competitor_id: memoryRow.winningCompetitorId ?? "",
      win_back_potential: memoryRow.winBackPotential ?? 0,
      win_back_timeline: memoryRow.winBackTimeline ?? "none",
      decision_maker_engaged: memoryRow.decisionMakerEngaged ?? false,
      champion_identified: memoryRow.championIdentified ?? false,
      loss_archetype_id: "",
    });
    setCausalChain(memoryRow.causalChain ?? []);
    setProductGaps(memoryRow.productGaps ?? []);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [memoryRow?.id]);

  const onSubmit = async (values: FormState) => {
    if (!memoryRow) return;
    try {
      await updateMemory.mutateAsync({
        id: memoryRow.id,
        data: {
          primary_loss_category: values.primary_loss_category || undefined,
          loss_subcategory: values.loss_subcategory || undefined,
          loss_narrative: values.loss_narrative || undefined,
          winning_competitor_id: values.winning_competitor_id ? Number(values.winning_competitor_id) : undefined,
          win_back_potential: values.win_back_potential,
          win_back_timeline: values.win_back_timeline || undefined,
          causal_chain: causalChain.filter((c) => c.trim().length > 0),
          decision_maker_engaged: values.decision_maker_engaged,
          champion_identified: values.champion_identified,
          product_gaps: productGaps.filter((p) => p.trim().length > 0),
        } as never,
      });
      if (values.loss_archetype_id) {
        await updateDeal.mutateAsync({ id: dealId, data: { loss_archetype_id: Number(values.loss_archetype_id) } as never });
      }
      await queryClient.invalidateQueries({ queryKey: getSearchDealMemoryQueryKey({ outcome: "Lost" }) });
      toast({ title: "Autopsy saved", description: `Loss capture recorded for ${dealName}.` });
      onSaved?.();
    } catch {
      toast({ title: "Could not save autopsy", variant: "destructive" });
    }
  };

  if (!memoryRow) {
    return <p className="text-sm text-muted-foreground py-6">No post-mortem record found for this deal yet.</p>;
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
      <div className="grid grid-cols-2 gap-4">
        <div className="grid gap-2">
          <Label>Primary Loss Category</Label>
          <Select value={watch("primary_loss_category")} onValueChange={(v) => setValue("primary_loss_category", v, { shouldDirty: true })}>
            <SelectTrigger><SelectValue placeholder="Select category" /></SelectTrigger>
            <SelectContent>
              {LOSS_CATEGORIES.map((c) => <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div className="grid gap-2">
          <Label>Loss Archetype</Label>
          <Select value={String(watch("loss_archetype_id"))} onValueChange={(v) => setValue("loss_archetype_id", Number(v), { shouldDirty: true })}>
            <SelectTrigger><SelectValue placeholder="Select archetype" /></SelectTrigger>
            <SelectContent>
              {(archetypesData?.data ?? []).map((a) => <SelectItem key={a.id} value={String(a.id)}>{a.archetypeName}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="grid gap-2">
        <Label>Sub-category</Label>
        <Input placeholder="e.g. Price too high vs. competitor" {...register("loss_subcategory")} />
      </div>

      <div className="grid gap-2">
        <Label>Loss Narrative</Label>
        <Textarea rows={4} placeholder="Why was this deal lost?" {...register("loss_narrative")} />
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="grid gap-2">
          <Label>Winning Competitor</Label>
          <Combobox
            options={competitorOptions}
            value={watch("winning_competitor_id") ? String(watch("winning_competitor_id")) : ""}
            onChange={(v) => setValue("winning_competitor_id", v ? Number(v) : "", { shouldDirty: true })}
            placeholder="None"
            emptyText="No competitors found."
          />
        </div>
        <div className="grid gap-2">
          <Label>Win-Back Timeline</Label>
          <Select value={watch("win_back_timeline")} onValueChange={(v) => setValue("win_back_timeline", v, { shouldDirty: true })}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              {WIN_BACK_TIMELINES.map((t) => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="grid gap-2">
        <div className="flex items-center justify-between">
          <Label>Win-Back Potential</Label>
          <span className="font-mono text-sm text-muted-foreground">{watch("win_back_potential")}%</span>
        </div>
        <Slider value={[watch("win_back_potential")]} onValueChange={([v]) => setValue("win_back_potential", v, { shouldDirty: true })} max={100} step={5} />
      </div>

      <div className="flex items-center gap-2">
        <Checkbox checked={watch("decision_maker_engaged")} onCheckedChange={(v) => setValue("decision_maker_engaged", !!v, { shouldDirty: true })} />
        <Label className="font-normal">Economic buyer was directly engaged</Label>
      </div>
      <div className="flex items-center gap-2">
        <Checkbox checked={watch("champion_identified")} onCheckedChange={(v) => setValue("champion_identified", !!v, { shouldDirty: true })} />
        <Label className="font-normal">An internal champion was identified</Label>
      </div>

      <ListEditor label="5 Whys — Causal Chain" values={causalChain} onChange={setCausalChain} placeholder="Why did this happen?" />
      <ListEditor label="Product Gaps Cited" values={productGaps} onChange={setProductGaps} placeholder="e.g. Missing real-time sync API" />

      <Button type="submit" disabled={updateMemory.isPending || formState.isSubmitting}>
        {updateMemory.isPending ? "Saving..." : "Save Autopsy"}
      </Button>
    </form>
  );
}
```

- [ ] **Step 2: Reduce `LossAutopsySheet` to a thin wrapper**

Replace `artifacts/edc/src/components/autopsy/loss-autopsy-sheet.tsx` entirely:

```tsx
import { useSearchDealMemory } from "@workspace/api-client-react";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { AutopsyForm } from "@/components/memory/autopsy-form";

export function LossAutopsySheet({
  dealId,
  dealName,
  open,
  onOpenChange,
}: {
  dealId: string;
  dealName: string;
  open: boolean;
  onOpenChange: (v: boolean) => void;
}) {
  const { data: memorySearch } = useSearchDealMemory({ outcome: "Lost" });
  const memoryRow = memorySearch?.data?.find((m) => m.dealId === dealId);

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-full sm:max-w-xl overflow-y-auto">
        <SheetHeader>
          <SheetTitle>Complete Autopsy — {dealName}</SheetTitle>
          <SheetDescription>Structured loss capture beyond the reason dropdown.</SheetDescription>
        </SheetHeader>
        <div className="py-6">
          <AutopsyForm dealId={dealId} dealName={dealName} memoryRow={memoryRow} onSaved={() => onOpenChange(false)} />
        </div>
      </SheetContent>
    </Sheet>
  );
}
```

- [ ] **Step 3: Typecheck and verify the existing Autopsy page still works**

Run: `pnpm run typecheck`. Open `http://localhost:5173/autopsy`, open the autopsy sheet for a Closed-Lost deal, confirm the form renders and saves exactly as before (no behavior change — this step is a regression check on a refactor, not a new feature).

- [ ] **Step 4: Commit**

```bash
git add artifacts/edc/src/components/memory/autopsy-form.tsx artifacts/edc/src/components/autopsy/loss-autopsy-sheet.tsx
git commit -m "refactor(memory): extract AutopsyForm from LossAutopsySheet for reuse in the Deal Detail view"
```

---

### Task 7: Memory Detail page — Overview and Timeline tabs

**Files:**
- Create: `artifacts/edc/src/pages/memory-detail.tsx`
- Modify: `artifacts/edc/src/App.tsx` (route)

**Interfaces:**
- Consumes: `useGetDealMemory(id)` from `@workspace/api-client-react`; `HistoryPanel` from `@/components/cockpit/history-panel` (reused unchanged — it already takes a bare `dealId` with no active-deal assumption).
- Produces: route `/memory/:id`.

- [ ] **Step 1: Create the page with Overview inline and Timeline via `HistoryPanel` reuse**

Create `artifacts/edc/src/pages/memory-detail.tsx`:

```tsx
import { useState } from "react";
import { useParams, useLocation } from "wouter";
import { useGetDealMemory } from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ArrowLeft } from "lucide-react";
import { HistoryPanel } from "@/components/cockpit/history-panel";
import { NarrativeTab } from "@/components/memory/detail/narrative-tab";
import { ConnectionsTab } from "@/components/memory/detail/connections-tab";

function money(n: unknown): string {
  return "$" + Math.round(Number(n) || 0).toLocaleString("en-US");
}

const TABS = [
  { id: "overview", label: "Overview" },
  { id: "timeline", label: "Timeline" },
  { id: "narrative", label: "Narrative & Autopsy" },
  { id: "connections", label: "Connections" },
];

export default function MemoryDetail() {
  const { id } = useParams();
  const [, navigate] = useLocation();
  const [tab, setTab] = useState("overview");
  const { data, isLoading } = useGetDealMemory(id as string);
  const m = data?.data;

  if (isLoading) {
    return (
      <div className="p-8 max-w-[1200px] mx-auto space-y-4">
        <Skeleton className="h-9 w-72" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }
  if (!m) return <div className="p-8 text-destructive">Memory record not found</div>;

  return (
    <div className="p-8 max-w-[1200px] mx-auto space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <Button variant="ghost" size="sm" onClick={() => navigate("/memory")}>
        <ArrowLeft className="h-4 w-4 mr-2" /> Back to Deal Memory
      </Button>

      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold">{m.dealName}</h1>
          <p className="text-muted-foreground text-lg">{m.accountName}</p>
        </div>
        <div className="flex items-center gap-3">
          <Badge className={m.outcome === "Won" ? "bg-emerald-500 text-white" : "bg-destructive text-white"}>{m.outcome}</Badge>
          <span className="text-2xl font-bold font-mono tabular-nums">{money(m.finalTcv)}</span>
        </div>
      </div>

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList>
          {TABS.map((t) => <TabsTrigger key={t.id} value={t.id}>{t.label}</TabsTrigger>)}
        </TabsList>
      </Tabs>

      <div className="pt-2">
        {tab === "overview" && (
          <Card>
            <CardHeader><CardTitle className="text-lg">Deal Metrics</CardTitle></CardHeader>
            <CardContent className="space-y-3">
              <div className="flex justify-between py-2 border-b">
                <span className="text-muted-foreground text-sm">Days Active</span>
                <span className="font-mono">{m.totalDaysActive ?? "—"}</span>
              </div>
              <div className="flex justify-between py-2 border-b">
                <span className="text-muted-foreground text-sm">Gates Completed</span>
                <span className="font-mono">{m.totalGatesCompleted ?? 0}</span>
              </div>
              <div className="flex justify-between py-2 border-b">
                <span className="text-muted-foreground text-sm">Blockers Encountered</span>
                <span className="font-mono">{m.totalBlockersEncountered ?? 0}</span>
              </div>
              <div className="flex justify-between py-2 border-b">
                <span className="text-muted-foreground text-sm">Pricing Model</span>
                <span>{m.pricingModel ?? "—"}</span>
              </div>
              <div className="flex justify-between py-2 border-b">
                <span className="text-muted-foreground text-sm">Services Tier</span>
                <span>{m.servicesTier ?? "—"}</span>
              </div>
              <div className="flex justify-between py-2">
                <span className="text-muted-foreground text-sm">Archived</span>
                <span className="font-mono">{new Date(m.archivedAt).toLocaleDateString()}</span>
              </div>
              {m.tags && m.tags.length > 0 && (
                <div className="flex flex-wrap gap-1 pt-2">
                  {m.tags.map((t) => <Badge key={t} variant="outline">{t}</Badge>)}
                </div>
              )}
            </CardContent>
          </Card>
        )}
        {tab === "timeline" && <HistoryPanel dealId={m.dealId} />}
        {tab === "narrative" && <NarrativeTab memory={m} />}
        {tab === "connections" && <ConnectionsTab memory={m} />}
      </div>
    </div>
  );
}
```

`NarrativeTab` and `ConnectionsTab` are built in Tasks 8-9 respectively; this task's own verification only exercises Overview and Timeline, so create minimal stub files first so the app compiles:

Create `artifacts/edc/src/components/memory/detail/narrative-tab.tsx` (temporary stub, replaced in Task 8):
```tsx
export function NarrativeTab(_props: { memory: unknown }) {
  return <div className="text-sm text-muted-foreground">Built in Task 8.</div>;
}
```

Create `artifacts/edc/src/components/memory/detail/connections-tab.tsx` (temporary stub, replaced in Task 9):
```tsx
export function ConnectionsTab(_props: { memory: unknown }) {
  return <div className="text-sm text-muted-foreground">Built in Task 9.</div>;
}
```

- [ ] **Step 2: Wire the route**

In `artifacts/edc/src/App.tsx`, add the import next to `Memory`:

```tsx
import MemoryDetail from "@/pages/memory-detail";
```

And add the route directly after `/memory` (mirroring the existing `/deals` → `/deals/:id` pattern):

```tsx
      <Route path="/memory" component={() => <ProtectedRoute component={Memory} />} />
      <Route path="/memory/:id" component={() => <ProtectedRoute component={MemoryDetail} />} />
```

- [ ] **Step 3: Typecheck and verify**

Run: `pnpm run typecheck`. In the browser, go to `/memory`, click a deal name link (added in Task 3's `MemoryResultCard`), confirm it navigates to `/memory/<id>` and the Overview tab shows correct metrics, and the Timeline tab shows the same activity/health/snapshot data the deal's cockpit History tab would have shown while it was still active.

- [ ] **Step 4: Commit**

```bash
git add artifacts/edc/src/pages/memory-detail.tsx artifacts/edc/src/App.tsx artifacts/edc/src/components/memory/detail/narrative-tab.tsx artifacts/edc/src/components/memory/detail/connections-tab.tsx
git commit -m "feat(memory): add Deal Memory detail page with Overview and Timeline tabs"
```

---

### Task 8: Memory Detail — Narrative & Autopsy tab

**Files:**
- Modify: `artifacts/edc/src/components/memory/detail/narrative-tab.tsx` (replace stub)

**Interfaces:**
- Consumes: `useUpdateDealMemory()` from `@workspace/api-client-react`; `AutopsyForm` from Task 6.

- [ ] **Step 1: Implement the tab**

Replace `artifacts/edc/src/components/memory/detail/narrative-tab.tsx`:

```tsx
import { useEffect, useState } from "react";
import { useUpdateDealMemory } from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { AutopsyForm } from "@/components/memory/autopsy-form";

interface MemoryDetail {
  id: string;
  dealId: string;
  dealName: string;
  outcome: string;
  winLossNarrative: string | null;
  keyLessons: string[] | null;
  tags: string[] | null;
  primaryLossCategory: string | null;
  lossSubcategory: string | null;
  lossNarrative: string | null;
  winningCompetitorId: number | null;
  winBackPotential: number | null;
  winBackTimeline: string | null;
  decisionMakerEngaged: boolean | null;
  championIdentified: boolean | null;
  causalChain: string[] | null;
  productGaps: string[] | null;
}

export function NarrativeTab({ memory: m }: { memory: MemoryDetail }) {
  const { toast } = useToast();
  const updateMemory = useUpdateDealMemory();
  const [narrative, setNarrative] = useState(m.winLossNarrative ?? "");
  const [lessons, setLessons] = useState((m.keyLessons ?? []).join("\n"));
  const [tags, setTags] = useState((m.tags ?? []).join(", "));

  useEffect(() => {
    setNarrative(m.winLossNarrative ?? "");
    setLessons((m.keyLessons ?? []).join("\n"));
    setTags((m.tags ?? []).join(", "));
  }, [m.id]);

  const save = async () => {
    try {
      await updateMemory.mutateAsync({
        id: m.id,
        data: {
          win_loss_narrative: narrative || undefined,
          key_lessons: lessons.split("\n").map((l) => l.trim()).filter(Boolean),
          tags: tags.split(",").map((t) => t.trim()).filter(Boolean),
        } as never,
      });
      toast({ title: "Saved" });
    } catch {
      toast({ title: "Could not save", variant: "destructive" });
    }
  };

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader><CardTitle className="text-lg">Narrative & Lessons</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-2">
            <Label>Win/Loss Narrative</Label>
            <Textarea rows={4} value={narrative} onChange={(e) => setNarrative(e.target.value)} />
          </div>
          <div className="grid gap-2">
            <Label>Key Lessons (one per line)</Label>
            <Textarea rows={3} value={lessons} onChange={(e) => setLessons(e.target.value)} />
          </div>
          <div className="grid gap-2">
            <Label>Tags (comma-separated)</Label>
            <Input value={tags} onChange={(e) => setTags(e.target.value)} />
          </div>
          <Button onClick={save} disabled={updateMemory.isPending}>
            {updateMemory.isPending ? "Saving..." : "Save"}
          </Button>
        </CardContent>
      </Card>

      {m.outcome === "Lost" && (
        <Card>
          <CardHeader><CardTitle className="text-lg">Closed-Lost Autopsy</CardTitle></CardHeader>
          <CardContent>
            <AutopsyForm dealId={m.dealId} dealName={m.dealName} memoryRow={m} />
          </CardContent>
        </Card>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Typecheck and verify**

Run: `pnpm run typecheck`. Open a Won deal's `/memory/:id` — confirm only the Narrative card shows, editing and saving works, and reload shows the saved values. Open a Lost deal's `/memory/:id` — confirm the Autopsy card also renders below it and saves independently.

- [ ] **Step 3: Commit**

```bash
git add artifacts/edc/src/components/memory/detail/narrative-tab.tsx
git commit -m "feat(memory): add Narrative & Autopsy tab to Deal Memory detail page"
```

---

### Task 9: Memory Detail — Connections tab, and wire the comparison sheet

**Files:**
- Modify: `artifacts/edc/src/components/memory/detail/connections-tab.tsx` (replace stub)
- Create: `artifacts/edc/src/components/memory/comparison-sheet.tsx`
- Modify: `artifacts/edc/src/pages/memory.tsx` (wire the sheet to the Search tab's compare button)

**Interfaces:**
- Consumes: `useGetSimilarDeals(dealId)`, `useGetDealPlaybook(dealId)`, `useCompareDealMemory({ids})` (from `@workspace/api-client-react`).

- [ ] **Step 1: Implement the Connections tab**

Replace `artifacts/edc/src/components/memory/detail/connections-tab.tsx`:

```tsx
import { useGetSimilarDeals, useGetDealPlaybook } from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Link } from "wouter";

interface MemoryDetail {
  id: string;
  dealId: string;
  competitorsFaced: string[] | null;
}

function money(n: unknown): string {
  return "$" + Math.round(Number(n) || 0).toLocaleString("en-US");
}

export function ConnectionsTab({ memory: m }: { memory: MemoryDetail }) {
  const { data: similarData } = useGetSimilarDeals(m.dealId);
  const { data: playbookData } = useGetDealPlaybook(m.dealId);
  const similar = (similarData?.data ?? []).filter((s) => s.id !== m.id);
  const playbook = playbookData?.data as { playbook: { playbookName: string } | null; status: string } | null | undefined;

  return (
    <div className="space-y-4">
      {m.competitorsFaced && m.competitorsFaced.length > 0 && (
        <Card>
          <CardHeader><CardTitle className="text-lg">Competitors Faced</CardTitle></CardHeader>
          <CardContent className="flex flex-wrap gap-2">
            {m.competitorsFaced.map((c) => <Badge key={c} variant="outline">{c}</Badge>)}
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader><CardTitle className="text-lg">Playbook Used</CardTitle></CardHeader>
        <CardContent>
          {playbook?.playbook ? (
            <p className="text-sm">{playbook.playbook.playbookName} — <span className="text-muted-foreground">{playbook.status}</span></p>
          ) : (
            <p className="text-sm text-muted-foreground">No playbook was assigned to this deal.</p>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="text-lg">Similar Archived Deals</CardTitle></CardHeader>
        <CardContent className="space-y-2">
          {similar.length === 0 && <p className="text-sm text-muted-foreground">No similar deals found.</p>}
          {similar.map((s) => (
            <div key={s.id} className="flex items-center justify-between text-sm">
              <Link href={`/memory/${s.id}`} className="hover:underline">{s.dealName} · {s.accountName}</Link>
              <span className="flex items-center gap-2">
                <Badge className={s.outcome === "Won" ? "bg-emerald-500 text-white" : "bg-destructive text-white"}>{s.outcome}</Badge>
                <span className="font-mono text-muted-foreground">{money(s.finalTcv)}</span>
              </span>
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}
```

- [ ] **Step 2: Build the comparison sheet**

Create `artifacts/edc/src/components/memory/comparison-sheet.tsx`:

```tsx
import { useCompareDealMemory } from "@workspace/api-client-react";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Badge } from "@/components/ui/badge";

function money(n: unknown): string {
  return "$" + Math.round(Number(n) || 0).toLocaleString("en-US");
}

const ROWS: { label: string; key: string; format?: (v: unknown) => string; best?: "max" | "min" }[] = [
  { label: "Outcome", key: "outcome" },
  { label: "Final TCV", key: "finalTcv", format: money, best: "max" },
  { label: "Days Active", key: "totalDaysActive", best: "min" },
  { label: "Gates Completed", key: "totalGatesCompleted", best: "max" },
  { label: "Blockers", key: "totalBlockersEncountered", best: "min" },
  { label: "Pricing Model", key: "pricingModel" },
  { label: "Services Tier", key: "servicesTier" },
];

export function ComparisonSheet({
  ids,
  open,
  onOpenChange,
}: {
  ids: string[];
  open: boolean;
  onOpenChange: (v: boolean) => void;
}) {
  const { data } = useCompareDealMemory({ ids: ids.join(",") } as never);
  const rows = data?.data ?? [];

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-full sm:max-w-3xl overflow-y-auto" side="right">
        <SheetHeader>
          <SheetTitle>Compare {rows.length} Deals</SheetTitle>
        </SheetHeader>
        <div className="overflow-x-auto py-6">
          <table className="w-full text-sm border-collapse">
            <thead>
              <tr>
                <th className="text-left p-2 border-b text-muted-foreground">Attribute</th>
                {rows.map((r) => (
                  <th key={r.id} className="text-left p-2 border-b font-medium">{r.dealName}<br /><span className="text-xs text-muted-foreground font-normal">{r.accountName}</span></th>
                ))}
              </tr>
            </thead>
            <tbody>
              {ROWS.map((row) => {
                const values = rows.map((r) => (r as Record<string, unknown>)[row.key]);
                const numeric = values.map((v) => Number(v));
                const best = row.best === "max" ? Math.max(...numeric) : row.best === "min" ? Math.min(...numeric) : null;
                return (
                  <tr key={row.key}>
                    <td className="p-2 border-b text-muted-foreground">{row.label}</td>
                    {rows.map((r, i) => {
                      const raw = (r as Record<string, unknown>)[row.key];
                      const isBest = best != null && numeric[i] === best;
                      const isWorst = best != null && row.best === "max" ? numeric[i] === Math.min(...numeric) : row.best === "min" ? numeric[i] === Math.max(...numeric) : false;
                      return (
                        <td key={r.id} className={`p-2 border-b ${isBest ? "text-emerald-600 font-medium" : isWorst ? "text-destructive" : ""}`}>
                          {row.key === "outcome" ? (
                            <Badge className={raw === "Won" ? "bg-emerald-500 text-white" : "bg-destructive text-white"}>{String(raw)}</Badge>
                          ) : row.format ? (
                            row.format(raw)
                          ) : (
                            String(raw ?? "—")
                          )}
                        </td>
                      );
                    })}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </SheetContent>
    </Sheet>
  );
}
```

- [ ] **Step 3: Wire it into the page shell, replacing the Part 1 placeholder**

In `artifacts/edc/src/pages/memory.tsx`, add the import and a local `compareOpen` state, then replace the `onCompare` no-op:

```tsx
import { ComparisonSheet } from "@/components/memory/comparison-sheet";
```

```tsx
  const [compareOpen, setCompareOpen] = useState(false);
```

```tsx
      {tab === "search" && (
        <SearchTab selected={selected} onToggleSelect={toggleSelect} onCompare={() => setCompareOpen(true)} />
      )}
      {tab === "health" && <HealthDashboard />}
      <ComparisonSheet ids={selected} open={compareOpen} onOpenChange={setCompareOpen} />
```

- [ ] **Step 4: Typecheck and verify**

Run: `pnpm run typecheck`. On `/memory`, select 2-4 deals via checkbox, click "Compare (n)", confirm the sheet opens with a matrix table, best-value cells highlighted emerald and worst-value cells highlighted red for TCV/days/gates/blockers. On a deal's `/memory/:id`, confirm the Connections tab shows competitors, playbook status, and similar deals with working links.

- [ ] **Step 5: Commit**

```bash
git add artifacts/edc/src/components/memory/detail/connections-tab.tsx artifacts/edc/src/components/memory/comparison-sheet.tsx artifacts/edc/src/pages/memory.tsx
git commit -m "feat(memory): add Connections tab and side-by-side deal comparison"
```

---

## Part 3: Competitive & Pricing Intelligence

### Task 10: Backend — competitor intelligence and pricing benchmark endpoints

**Files:**
- Create: `artifacts/api-server/src/lib/memory-intel.ts`
- Create: `artifacts/api-server/src/lib/memory-intel.test.ts`
- Modify: `lib/api-spec/openapi.yaml` (two paths)
- Modify: `artifacts/api-server/src/routes/v2/analytics.ts` (two handlers)

**Interfaces:**
- Produces: `computeCompetitorIntel(rows: MemoryRow[]): CompetitorIntel[]` and `percentiles(xs: number[]): {p25,median,p75,p90}` — both pure, unit-tested.
- Produces: `GET /v2/analytics/competitor-intel` → `{ data: CompetitorIntel[] }`
- Produces: `GET /v2/analytics/pricing-benchmarks?pricingModel=&servicesTier=&outcome=` → `{ data: { sampleSize, tcv: {p25,median,p75,p90}, cycleDays: {p25,median,p75,p90} } }`

- [ ] **Step 1: Write the failing tests**

Create `artifacts/api-server/src/lib/memory-intel.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { computeCompetitorIntel, percentiles, type MemoryRow } from "./memory-intel";

function row(overrides: Partial<MemoryRow> = {}): MemoryRow {
  return {
    id: "r1",
    outcome: "Won",
    finalTcv: "100000",
    totalDaysActive: 90,
    competitorsFaced: [],
    pricingModel: "Subscription",
    servicesTier: "Standard",
    primaryLossCategory: null,
    ...overrides,
  } as MemoryRow;
}

describe("percentiles", () => {
  it("returns zeros for an empty array", () => {
    expect(percentiles([])).toEqual({ p25: 0, median: 0, p75: 0, p90: 0 });
  });

  it("computes percentiles over a sorted sample", () => {
    const xs = [10, 20, 30, 40, 50, 60, 70, 80, 90, 100];
    const p = percentiles(xs);
    expect(p.median).toBe(60);
    expect(p.p25).toBeLessThan(p.median);
    expect(p.p90).toBeGreaterThan(p.median);
  });
});

describe("computeCompetitorIntel", () => {
  it("returns no entries below the minimum encounter threshold", () => {
    const rows = [row({ competitorsFaced: ["CloudBridge"] }), row({ competitorsFaced: ["CloudBridge"] })];
    expect(computeCompetitorIntel(rows)).toEqual([]);
  });

  it("aggregates win rate and top loss category once the threshold is met", () => {
    const rows = [
      row({ competitorsFaced: ["CloudBridge"], outcome: "Won" }),
      row({ competitorsFaced: ["CloudBridge"], outcome: "Lost", primaryLossCategory: "price" }),
      row({ competitorsFaced: ["CloudBridge"], outcome: "Lost", primaryLossCategory: "price" }),
    ];
    const intel = computeCompetitorIntel(rows);
    expect(intel).toHaveLength(1);
    expect(intel[0].name).toBe("CloudBridge");
    expect(intel[0].encounterCount).toBe(3);
    expect(intel[0].winRatePct).toBe(33);
    expect(intel[0].topLossCategory).toBe("price");
  });

  it("sorts competitors by encounter count descending", () => {
    const rows = [
      ...Array.from({ length: 3 }, () => row({ competitorsFaced: ["Rival"] })),
      ...Array.from({ length: 5 }, () => row({ competitorsFaced: ["BigCo"] })),
    ];
    expect(computeCompetitorIntel(rows).map((c) => c.name)).toEqual(["BigCo", "Rival"]);
  });
});
```

- [ ] **Step 2: Run and confirm failure**

Run: `pnpm --filter @workspace/api-server exec vitest run src/lib/memory-intel.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

Create `artifacts/api-server/src/lib/memory-intel.ts`:

```ts
const MIN_ENCOUNTERS = 3;

export interface MemoryRow {
  id: string;
  outcome: string;
  finalTcv: string | null;
  totalDaysActive: number | null;
  competitorsFaced: string[] | null;
  pricingModel: string | null;
  servicesTier: string | null;
  primaryLossCategory: string | null;
}

export interface CompetitorIntel {
  name: string;
  encounterCount: number;
  winRatePct: number;
  topLossCategory: string | null;
  avgTcv: number;
}

export function percentiles(xs: number[]): { p25: number; median: number; p75: number; p90: number } {
  if (xs.length === 0) return { p25: 0, median: 0, p75: 0, p90: 0 };
  const s = [...xs].sort((a, b) => a - b);
  const at = (p: number) => s[Math.min(s.length - 1, Math.floor(s.length * p))];
  return { p25: at(0.25), median: at(0.5), p75: at(0.75), p90: at(0.9) };
}

export function computeCompetitorIntel(rows: MemoryRow[]): CompetitorIntel[] {
  const byCompetitor = new Map<string, MemoryRow[]>();
  for (const r of rows) {
    for (const c of r.competitorsFaced ?? []) {
      const arr = byCompetitor.get(c) ?? [];
      arr.push(r);
      byCompetitor.set(c, arr);
    }
  }

  const result: CompetitorIntel[] = [];
  for (const [name, encounters] of byCompetitor.entries()) {
    if (encounters.length < MIN_ENCOUNTERS) continue;
    const decided = encounters.filter((r) => r.outcome === "Won" || r.outcome === "Lost");
    const wins = decided.filter((r) => r.outcome === "Won").length;
    const winRatePct = decided.length ? Math.round((wins / decided.length) * 100) : 0;

    const lossCategoryCounts = new Map<string, number>();
    for (const r of encounters) {
      if (r.outcome === "Lost" && r.primaryLossCategory) {
        lossCategoryCounts.set(r.primaryLossCategory, (lossCategoryCounts.get(r.primaryLossCategory) ?? 0) + 1);
      }
    }
    let topLossCategory: string | null = null;
    let topCount = 0;
    for (const [cat, count] of lossCategoryCounts.entries()) {
      if (count > topCount) { topLossCategory = cat; topCount = count; }
    }

    const tcvs = encounters.map((r) => Number(r.finalTcv) || 0);
    const avgTcv = tcvs.length ? Math.round(tcvs.reduce((a, b) => a + b, 0) / tcvs.length) : 0;

    result.push({ name, encounterCount: encounters.length, winRatePct, topLossCategory, avgTcv });
  }

  return result.sort((a, b) => b.encounterCount - a.encounterCount);
}
```

- [ ] **Step 4: Run and confirm pass**

Run: `pnpm --filter @workspace/api-server exec vitest run src/lib/memory-intel.test.ts`
Expected: PASS (5/5).

- [ ] **Step 5: Add OpenAPI paths**

In `lib/api-spec/openapi.yaml`, add after `/v2/analytics/memory-health`:

```yaml
  /v2/analytics/competitor-intel:
    get:
      operationId: getCompetitorIntel
      tags: [v2intel]
      responses:
        "200": { description: Per-competitor win/loss aggregation from the deal memory archive, content: { application/json: { schema: { $ref: "#/components/schemas/GenericDataResponse" } } } }
  /v2/analytics/pricing-benchmarks:
    get:
      operationId: getPricingBenchmarks
      tags: [v2intel]
      parameters:
        - { name: pricingModel, in: query, required: false, schema: { type: string } }
        - { name: servicesTier, in: query, required: false, schema: { type: string } }
        - { name: outcome, in: query, required: false, schema: { type: string } }
      responses:
        "200": { description: TCV and cycle-time percentile benchmarks over matching archived deals, content: { application/json: { schema: { $ref: "#/components/schemas/GenericDataResponse" } } } }
```

Run: `pnpm --filter @workspace/api-spec run codegen`

- [ ] **Step 6: Implement the handlers**

In `artifacts/api-server/src/routes/v2/analytics.ts`, add to the imports:

```ts
import { computeCompetitorIntel, percentiles } from "../../lib/memory-intel";
import { GetPricingBenchmarksQueryParams } from "@workspace/api-zod";
```

(merge `GetPricingBenchmarksQueryParams` into the existing `@workspace/api-zod` import list rather than a second import statement).

Add handlers after `/analytics/memory-health`:

```ts
router.get("/analytics/competitor-intel", async (_req: Request, res: Response) => {
  const rows = await db.select().from(dealMemory);
  res.json({ data: computeCompetitorIntel(rows) });
});

router.get("/analytics/pricing-benchmarks", async (req: Request, res: Response) => {
  const q = GetPricingBenchmarksQueryParams.parse(req.query);
  const conditions = [];
  if (q.pricingModel) conditions.push(eq(dealMemory.pricingModel, q.pricingModel));
  if (q.servicesTier) conditions.push(eq(dealMemory.servicesTier, q.servicesTier));
  if (q.outcome) conditions.push(eq(dealMemory.outcome, q.outcome));
  const rows = conditions.length
    ? await db.select().from(dealMemory).where(and(...conditions))
    : await db.select().from(dealMemory);

  const tcvs = rows.map((r) => Number(r.finalTcv) || 0).filter((n) => n > 0);
  const cycles = rows.map((r) => r.totalDaysActive ?? 0).filter((n) => n > 0);

  res.json({
    data: {
      sampleSize: rows.length,
      tcv: percentiles(tcvs),
      cycleDays: percentiles(cycles),
    },
  });
});
```

- [ ] **Step 7: Typecheck, restart, verify**

Run: `pnpm run typecheck`, restart the API server, then:
```bash
curl -s -b /tmp/edc-cookie.txt "http://localhost:5000/api/v2/analytics/competitor-intel"
curl -s -b /tmp/edc-cookie.txt "http://localhost:5000/api/v2/analytics/pricing-benchmarks?outcome=Won"
```
Expected: both `200` with the shapes above.

- [ ] **Step 8: Commit**

```bash
git add lib/api-spec/openapi.yaml lib/api-zod lib/api-client-react artifacts/api-server/src/lib/memory-intel.ts artifacts/api-server/src/lib/memory-intel.test.ts artifacts/api-server/src/routes/v2/analytics.ts
git commit -m "feat(memory): add competitor intelligence and pricing benchmark endpoints"
```

---

### Task 11: Backend — playbook effectiveness endpoint

**Files:**
- Modify: `artifacts/api-server/src/lib/memory-intel.ts` (add pure function)
- Modify: `artifacts/api-server/src/lib/memory-intel.test.ts` (add tests)
- Modify: `lib/api-spec/openapi.yaml` (one path)
- Modify: `artifacts/api-server/src/routes/v2/analytics.ts` (one handler)

**Interfaces:**
- Produces: `computePlaybookEffectiveness(memoryRows: {dealId,outcome}[], assignedDealIds: Set<string>): {withPlaybookWinRatePct, withoutPlaybookWinRatePct, withPlaybookCount, withoutPlaybookCount}` — pure.
- Produces: `GET /v2/analytics/playbook-effectiveness` → `{ data: PlaybookEffectiveness }`

- [ ] **Step 1: Write the failing test**

Append to `artifacts/api-server/src/lib/memory-intel.test.ts`:

```ts
import { computePlaybookEffectiveness } from "./memory-intel";

describe("computePlaybookEffectiveness", () => {
  it("compares win rate between deals that used a playbook and those that didn't", () => {
    const memory = [
      { dealId: "a", outcome: "Won" },
      { dealId: "b", outcome: "Won" },
      { dealId: "c", outcome: "Lost" },
      { dealId: "d", outcome: "Lost" },
    ];
    const assigned = new Set(["a", "b", "c"]); // 3 with playbook: 2 won, 1 lost; 1 without: lost
    const eff = computePlaybookEffectiveness(memory, assigned);
    expect(eff.withPlaybookCount).toBe(3);
    expect(eff.withoutPlaybookCount).toBe(1);
    expect(eff.withPlaybookWinRatePct).toBe(67);
    expect(eff.withoutPlaybookWinRatePct).toBe(0);
  });

  it("returns null win rates for a group with no decided deals", () => {
    const eff = computePlaybookEffectiveness([], new Set());
    expect(eff.withPlaybookWinRatePct).toBeNull();
    expect(eff.withoutPlaybookWinRatePct).toBeNull();
  });
});
```

- [ ] **Step 2: Run and confirm failure**

Run: `pnpm --filter @workspace/api-server exec vitest run src/lib/memory-intel.test.ts`
Expected: FAIL — `computePlaybookEffectiveness` not exported.

- [ ] **Step 3: Implement**

Append to `artifacts/api-server/src/lib/memory-intel.ts`:

```ts
export interface PlaybookEffectiveness {
  withPlaybookCount: number;
  withoutPlaybookCount: number;
  withPlaybookWinRatePct: number | null;
  withoutPlaybookWinRatePct: number | null;
}

export function computePlaybookEffectiveness(
  memoryRows: { dealId: string; outcome: string }[],
  assignedDealIds: Set<string>,
): PlaybookEffectiveness {
  const winRate = (rows: { outcome: string }[]) => {
    const decided = rows.filter((r) => r.outcome === "Won" || r.outcome === "Lost");
    if (decided.length === 0) return null;
    return Math.round((decided.filter((r) => r.outcome === "Won").length / decided.length) * 100);
  };
  const withPlaybook = memoryRows.filter((r) => assignedDealIds.has(r.dealId));
  const withoutPlaybook = memoryRows.filter((r) => !assignedDealIds.has(r.dealId));
  return {
    withPlaybookCount: withPlaybook.length,
    withoutPlaybookCount: withoutPlaybook.length,
    withPlaybookWinRatePct: winRate(withPlaybook),
    withoutPlaybookWinRatePct: winRate(withoutPlaybook),
  };
}
```

- [ ] **Step 4: Run and confirm pass**

Run: `pnpm --filter @workspace/api-server exec vitest run src/lib/memory-intel.test.ts`
Expected: PASS (7/7).

- [ ] **Step 5: Add the OpenAPI path**

In `lib/api-spec/openapi.yaml`, add after `/v2/analytics/pricing-benchmarks`:

```yaml
  /v2/analytics/playbook-effectiveness:
    get:
      operationId: getPlaybookEffectiveness
      tags: [v2intel]
      responses:
        "200": { description: Win-rate comparison between archived deals that had an assigned playbook and those that didn't, content: { application/json: { schema: { $ref: "#/components/schemas/GenericDataResponse" } } } }
```

Run: `pnpm --filter @workspace/api-spec run codegen`

- [ ] **Step 6: Implement the handler**

In `artifacts/api-server/src/routes/v2/analytics.ts`, add `computePlaybookEffectiveness` to the `../../lib/memory-intel` import, and add a handler after `/analytics/pricing-benchmarks`:

```ts
router.get("/analytics/playbook-effectiveness", async (_req: Request, res: Response) => {
  const memory = await db.select({ dealId: dealMemory.dealId, outcome: dealMemory.outcome }).from(dealMemory);
  const assignments = await db.select({ dealId: dealPlaybookAssignments.dealId }).from(dealPlaybookAssignments);
  const assignedIds = new Set(assignments.map((a) => a.dealId));
  res.json({ data: computePlaybookEffectiveness(memory, assignedIds) });
});
```

(`dealPlaybookAssignments` is already imported in this file per the existing import list.)

- [ ] **Step 7: Typecheck, restart, verify**

Run: `pnpm run typecheck`, restart the API server, then:
```bash
curl -s -b /tmp/edc-cookie.txt "http://localhost:5000/api/v2/analytics/playbook-effectiveness"
```
Expected: `200` with the shape above.

- [ ] **Step 8: Commit**

```bash
git add lib/api-spec/openapi.yaml lib/api-zod lib/api-client-react artifacts/api-server/src/lib/memory-intel.ts artifacts/api-server/src/lib/memory-intel.test.ts artifacts/api-server/src/routes/v2/analytics.ts
git commit -m "feat(memory): add playbook-effectiveness win-rate comparison endpoint"
```

---

### Task 12: Competitors tab

**Files:**
- Create: `artifacts/edc/src/components/memory/competitors-tab.tsx`
- Modify: `artifacts/edc/src/pages/memory.tsx` (add tab)

**Interfaces:**
- Consumes: `useGetCompetitorIntel()` from `@workspace/api-client-react`.

- [ ] **Step 1: Build the tab**

Create `artifacts/edc/src/components/memory/competitors-tab.tsx`:

```tsx
import { useGetCompetitorIntel } from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import { Empty, EmptyHeader, EmptyMedia, EmptyTitle, EmptyDescription } from "@/components/ui/empty";
import { Swords } from "lucide-react";

interface CompetitorIntel {
  name: string;
  encounterCount: number;
  winRatePct: number;
  topLossCategory: string | null;
  avgTcv: number;
}

function money(n: number): string {
  return "$" + Math.round(n).toLocaleString("en-US");
}

export function CompetitorsTab() {
  const { data, isLoading } = useGetCompetitorIntel();
  const competitors = (data?.data ?? []) as CompetitorIntel[];

  if (isLoading) return <Skeleton className="h-48 w-full" />;
  if (competitors.length === 0) {
    return (
      <Empty>
        <EmptyHeader>
          <EmptyMedia variant="icon"><Swords className="h-5 w-5" /></EmptyMedia>
          <EmptyTitle>Not enough data yet</EmptyTitle>
          <EmptyDescription>Competitor intelligence appears once at least 3 archived deals share a competitor.</EmptyDescription>
        </EmptyHeader>
      </Empty>
    );
  }

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
      {competitors.map((c) => (
        <Card key={c.name}>
          <CardHeader>
            <CardTitle className="text-lg flex items-center justify-between">
              <span>{c.name}</span>
              <span className="text-sm font-mono text-muted-foreground">{c.encounterCount} encounters</span>
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div>
              <div className="flex justify-between text-sm mb-1">
                <span className="text-muted-foreground">Win rate against</span>
                <span className="font-mono">{c.winRatePct}%</span>
              </div>
              <Progress value={c.winRatePct} />
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">Avg. deal size when faced</span>
              <span className="font-mono">{money(c.avgTcv)}</span>
            </div>
            {c.topLossCategory && (
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Top loss reason</span>
                <span className="capitalize">{c.topLossCategory}</span>
              </div>
            )}
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
```

- [ ] **Step 2: Wire the tab**

In `artifacts/edc/src/pages/memory.tsx`, add `{ id: "competitors", label: "Competitors" }` to the `TABS` array, import `CompetitorsTab`, and render `{tab === "competitors" && <CompetitorsTab />}`.

- [ ] **Step 3: Typecheck and verify**

Run: `pnpm run typecheck`. Open `/memory`, click "Competitors", confirm cards render with correct win rates matching the `curl` output from Task 10.

- [ ] **Step 4: Commit**

```bash
git add artifacts/edc/src/components/memory/competitors-tab.tsx artifacts/edc/src/pages/memory.tsx
git commit -m "feat(memory): add Competitive Intelligence tab"
```

---

### Task 13: Pricing Intelligence tab

**Files:**
- Create: `artifacts/edc/src/components/memory/pricing-tab.tsx`
- Modify: `artifacts/edc/src/pages/memory.tsx` (add tab)

**Interfaces:**
- Consumes: `useGetPricingBenchmarks(params)`, `useGetMemoryFacets()`, `useGetPlaybookEffectiveness()`.

- [ ] **Step 1: Build the tab**

Create `artifacts/edc/src/components/memory/pricing-tab.tsx`:

```tsx
import { useState } from "react";
import { useGetPricingBenchmarks, useGetMemoryFacets, useGetPlaybookEffectiveness } from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

interface Percentiles { p25: number; median: number; p75: number; p90: number }
interface PricingBenchmarks { sampleSize: number; tcv: Percentiles; cycleDays: Percentiles }
interface FacetsPayload { pricingModels: { value: string; count: number }[]; servicesTiers: { value: string; count: number }[] }
interface PlaybookEffectiveness {
  withPlaybookCount: number;
  withoutPlaybookCount: number;
  withPlaybookWinRatePct: number | null;
  withoutPlaybookWinRatePct: number | null;
}

function money(n: number): string {
  return "$" + Math.round(n).toLocaleString("en-US");
}

function PercentileRow({ label, p, format }: { label: string; p: Percentiles; format: (n: number) => string }) {
  return (
    <div className="grid grid-cols-5 gap-2 text-sm py-2 border-b last:border-b-0">
      <span className="text-muted-foreground">{label}</span>
      <span className="font-mono text-right">{format(p.p25)}</span>
      <span className="font-mono text-right font-medium">{format(p.median)}</span>
      <span className="font-mono text-right">{format(p.p75)}</span>
      <span className="font-mono text-right">{format(p.p90)}</span>
    </div>
  );
}

export function PricingTab() {
  const [pricingModel, setPricingModel] = useState("all");
  const [servicesTier, setServicesTier] = useState("all");
  const [outcome, setOutcome] = useState("Won");

  const facetsQuery = useGetMemoryFacets();
  const facets = facetsQuery.data?.data as FacetsPayload | undefined;

  const params: Record<string, string> = { outcome };
  if (pricingModel !== "all") params.pricingModel = pricingModel;
  if (servicesTier !== "all") params.servicesTier = servicesTier;
  const { data } = useGetPricingBenchmarks(params as never);
  const bench = data?.data as PricingBenchmarks | undefined;

  const { data: effData } = useGetPlaybookEffectiveness();
  const eff = effData?.data as PlaybookEffectiveness | undefined;

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader><CardTitle className="text-lg">Pricing Benchmark</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-wrap gap-3">
            <Select value={outcome} onValueChange={setOutcome}>
              <SelectTrigger className="w-32"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="Won">Won</SelectItem>
                <SelectItem value="Lost">Lost</SelectItem>
              </SelectContent>
            </Select>
            <Select value={pricingModel} onValueChange={setPricingModel}>
              <SelectTrigger className="w-48"><SelectValue placeholder="Any pricing model" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Any pricing model</SelectItem>
                {(facets?.pricingModels ?? []).map((p) => <SelectItem key={p.value} value={p.value}>{p.value}</SelectItem>)}
              </SelectContent>
            </Select>
            <Select value={servicesTier} onValueChange={setServicesTier}>
              <SelectTrigger className="w-48"><SelectValue placeholder="Any services tier" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Any services tier</SelectItem>
                {(facets?.servicesTiers ?? []).map((s) => <SelectItem key={s.value} value={s.value}>{s.value}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>

          {!bench || bench.sampleSize === 0 ? (
            <p className="text-sm text-muted-foreground">No archived deals match these filters.</p>
          ) : (
            <>
              <p className="text-xs text-muted-foreground">Sample size: {bench.sampleSize} archived deal{bench.sampleSize === 1 ? "" : "s"}</p>
              <div className="grid grid-cols-5 gap-2 text-xs font-medium text-muted-foreground uppercase tracking-wider pb-1 border-b">
                <span></span><span className="text-right">P25</span><span className="text-right">Median</span><span className="text-right">P75</span><span className="text-right">P90</span>
              </div>
              <PercentileRow label="Total Contract Value" p={bench.tcv} format={money} />
              <PercentileRow label="Cycle Time (days)" p={bench.cycleDays} format={(n) => String(n)} />
            </>
          )}
        </CardContent>
      </Card>

      {eff && (eff.withPlaybookCount > 0 || eff.withoutPlaybookCount > 0) && (
        <Card>
          <CardHeader><CardTitle className="text-lg">Playbook Effectiveness</CardTitle></CardHeader>
          <CardContent className="grid grid-cols-2 gap-4 text-sm">
            <div>
              <p className="text-muted-foreground">With a playbook ({eff.withPlaybookCount} deals)</p>
              <p className="text-2xl font-bold font-mono">{eff.withPlaybookWinRatePct ?? "—"}%</p>
            </div>
            <div>
              <p className="text-muted-foreground">Without a playbook ({eff.withoutPlaybookCount} deals)</p>
              <p className="text-2xl font-bold font-mono">{eff.withoutPlaybookWinRatePct ?? "—"}%</p>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Wire the tab**

In `artifacts/edc/src/pages/memory.tsx`, add `{ id: "pricing", label: "Pricing" }` to `TABS`, import `PricingTab`, render `{tab === "pricing" && <PricingTab />}`.

- [ ] **Step 3: Typecheck and verify**

Run: `pnpm run typecheck`. Open `/memory` → "Pricing", change filters, confirm percentile numbers update and match `curl` output from Task 10; confirm the Playbook Effectiveness card shows real win-rate percentages matching Task 11's `curl` output.

- [ ] **Step 4: Commit**

```bash
git add artifacts/edc/src/components/memory/pricing-tab.tsx artifacts/edc/src/pages/memory.tsx
git commit -m "feat(memory): add Pricing Intelligence tab with playbook effectiveness"
```

---

## Part 4: AI Advisor (deterministic, no LLM)

### Task 14: Backend deterministic advisor endpoint

**Files:**
- Create: `artifacts/api-server/src/lib/advisor.ts`
- Create: `artifacts/api-server/src/lib/advisor.test.ts`
- Modify: `lib/api-spec/openapi.yaml` (one path)
- Modify: `artifacts/api-server/src/routes/v2/analytics.ts` (one handler)

**Interfaces:**
- Produces: `classifyAdvisorIntent(query: string, knownCompetitors: string[]): AdvisorIntent` — pure, unit-tested. Mirrors PRD FR-6.6.1.3's question categories, narrowed to the subset answerable without an LLM: competitive, pricing, biggest/precedent, and a full-text fallback.
- Produces: `GET /v2/memory/ask?q=<text>` → `{ data: { answer: string, confidence: "high"|"medium"|"low"|"none", citations: {id,dealName,accountName}[] } }`

- [ ] **Step 1: Write the failing test for intent classification**

Create `artifacts/api-server/src/lib/advisor.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { classifyAdvisorIntent } from "./advisor";

const COMPETITORS = ["CloudBridge", "DataVault"];

describe("classifyAdvisorIntent", () => {
  it("detects a competitive question naming a known competitor", () => {
    const intent = classifyAdvisorIntent("How have we done against CloudBridge?", COMPETITORS);
    expect(intent.type).toBe("competitive");
    expect(intent.competitor).toBe("CloudBridge");
  });

  it("detects a pricing question", () => {
    const intent = classifyAdvisorIntent("What discount is typical for enterprise deals?", COMPETITORS);
    expect(intent.type).toBe("pricing");
  });

  it("detects a biggest-deal precedent question", () => {
    const intent = classifyAdvisorIntent("What's the biggest deal we've closed?", COMPETITORS);
    expect(intent.type).toBe("biggest");
  });

  it("falls back to full-text search for anything unmatched", () => {
    const intent = classifyAdvisorIntent("healthcare data migration concerns", COMPETITORS);
    expect(intent.type).toBe("fulltext");
  });

  it("does not classify as competitive when no known competitor is named", () => {
    const intent = classifyAdvisorIntent("How have we done against unnamed rivals?", COMPETITORS);
    expect(intent.type).not.toBe("competitive");
  });
});
```

- [ ] **Step 2: Run and confirm failure**

Run: `pnpm --filter @workspace/api-server exec vitest run src/lib/advisor.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement the classifier and answer composer**

Create `artifacts/api-server/src/lib/advisor.ts`:

```ts
export type AdvisorIntent =
  | { type: "competitive"; competitor: string }
  | { type: "pricing" }
  | { type: "biggest" }
  | { type: "fulltext" };

const COMPETITIVE_PATTERN = /\b(vs\.?|against|beat|lose to|losing to|lost to|win rate)\b/i;
const PRICING_PATTERN = /\b(price|pricing|discount|typical cost|how much)\b/i;
const BIGGEST_PATTERN = /\b(biggest|largest)\b/i;

export function classifyAdvisorIntent(query: string, knownCompetitors: string[]): AdvisorIntent {
  const lower = query.toLowerCase();

  if (COMPETITIVE_PATTERN.test(lower)) {
    const matched = knownCompetitors.find((c) => lower.includes(c.toLowerCase()));
    if (matched) return { type: "competitive", competitor: matched };
  }
  if (PRICING_PATTERN.test(lower)) return { type: "pricing" };
  if (BIGGEST_PATTERN.test(lower)) return { type: "biggest" };
  return { type: "fulltext" };
}

export interface AdvisorCitation { id: string; dealName: string; accountName: string }
export interface AdvisorAnswer {
  answer: string;
  confidence: "high" | "medium" | "low" | "none";
  citations: AdvisorCitation[];
}

export function confidenceFor(citationCount: number): AdvisorAnswer["confidence"] {
  if (citationCount === 0) return "none";
  if (citationCount >= 3) return "high";
  if (citationCount >= 1) return "medium";
  return "low";
}

// This deliberately never fabricates a synthesized narrative — it composes an
// answer from real aggregate numbers and cites every source deal, per the "decline
// to answer rather than speculate" requirement (source PRD FR-6.6.1.6). There is no
// LLM in this app; this is the honest deterministic substitute.
export function composeNoDataAnswer(): AdvisorAnswer {
  return { answer: "I don't have enough archived deal data to answer that yet.", confidence: "none", citations: [] };
}
```

- [ ] **Step 4: Run and confirm pass**

Run: `pnpm --filter @workspace/api-server exec vitest run src/lib/advisor.test.ts`
Expected: PASS (5/5).

- [ ] **Step 5: Add the OpenAPI path**

In `lib/api-spec/openapi.yaml`, add after `/v2/analytics/playbook-effectiveness`:

```yaml
  /v2/memory/ask:
    get:
      operationId: askDealMemory
      tags: [v2intel]
      parameters:
        - { name: q, in: query, required: true, schema: { type: string } }
      responses:
        "200": { description: Deterministic, cited answer to a natural-language question over the deal memory archive, content: { application/json: { schema: { $ref: "#/components/schemas/GenericDataResponse" } } } }
```

Run: `pnpm --filter @workspace/api-spec run codegen`

- [ ] **Step 6: Implement the route handler (DB-backed composer, not unit-tested — thin glue over already-tested pieces)**

In `artifacts/api-server/src/routes/v2/crud.ts` (grouped with the other `/memory/*` routes since it reads `dealMemory` directly, matching where `/memory/search` and `/memory/similar` already live), add to imports:

```ts
import { classifyAdvisorIntent, confidenceFor, composeNoDataAnswer, type AdvisorCitation } from "../../lib/advisor";
import { computeCompetitorIntel } from "../../lib/memory-intel";
import { AskDealMemoryQueryParams } from "@workspace/api-zod"; // merge into existing import list
```

Add the handler directly after `/memory/facets`. This is required, not just tidy grouping: `/memory/ask` is a literal path that Express would otherwise match against `router.get("/memory/:id", ...)` (with `id="ask"`) if it were registered later in the file — the same ordering constraint from Global Constraints applies to every new literal path under `/memory/*`, and `/memory/facets` is already positioned before `/memory/:id`, so inserting here keeps `/memory/ask` safely ahead of it too:

```ts
router.get("/memory/ask", async (req: Request, res: Response) => {
  const { q } = AskDealMemoryQueryParams.parse(req.query);
  const memory = await db.select().from(dealMemory);
  if (memory.length === 0) return res.json({ data: composeNoDataAnswer() });

  const knownCompetitors = [...new Set(memory.flatMap((m) => m.competitorsFaced ?? []))];
  const intent = classifyAdvisorIntent(q, knownCompetitors);
  const cite = (rows: typeof memory): AdvisorCitation[] =>
    rows.slice(0, 5).map((r) => ({ id: r.id, dealName: r.dealName, accountName: r.accountName }));

  if (intent.type === "competitive") {
    const intel = computeCompetitorIntel(memory).find((c) => c.name === intent.competitor);
    const encounters = memory.filter((m) => m.competitorsFaced?.includes(intent.competitor));
    if (!intel) return res.json({ data: composeNoDataAnswer() });
    const citations = cite(encounters);
    return res.json({
      data: {
        answer: `Against ${intel.name}, the historical win rate is ${intel.winRatePct}% across ${intel.encounterCount} archived encounters.${intel.topLossCategory ? ` The most common loss reason is "${intel.topLossCategory}".` : ""}`,
        confidence: confidenceFor(citations.length),
        citations,
      },
    });
  }

  if (intent.type === "pricing") {
    const won = memory.filter((m) => m.outcome === "Won" && Number(m.finalTcv) > 0);
    if (won.length < 3) return res.json({ data: composeNoDataAnswer() });
    const tcvs = won.map((m) => Number(m.finalTcv)).sort((a, b) => a - b);
    const median = tcvs[Math.floor(tcvs.length / 2)];
    const citations = cite(won);
    return res.json({
      data: {
        answer: `Across ${won.length} won archived deals, the median total contract value is $${Math.round(median).toLocaleString("en-US")}. Check the Pricing tab for percentile breakdowns filtered by pricing model or services tier.`,
        confidence: confidenceFor(citations.length),
        citations,
      },
    });
  }

  if (intent.type === "biggest") {
    const sorted = [...memory].sort((a, b) => Number(b.finalTcv) - Number(a.finalTcv)).slice(0, 3);
    const citations = cite(sorted);
    if (citations.length === 0) return res.json({ data: composeNoDataAnswer() });
    const top = sorted[0];
    return res.json({
      data: {
        answer: `The largest archived deal is ${top.dealName} (${top.accountName}) at $${Math.round(Number(top.finalTcv)).toLocaleString("en-US")}, outcome: ${top.outcome}.`,
        confidence: confidenceFor(citations.length),
        citations,
      },
    });
  }

  // fulltext fallback — reuse the same tsvector search as /memory/search.
  const termRows = await db.execute(sql`
    SELECT id, deal_name AS "dealName", account_name AS "accountName", key_lessons AS "keyLessons"
    FROM edc_v2.deal_memory
    WHERE searchable_vector @@ plainto_tsquery('english', ${q})
    ORDER BY ts_rank(searchable_vector, plainto_tsquery('english', ${q})) DESC
    LIMIT 3`);
  const list = (Array.isArray(termRows) ? termRows : (termRows as { rows: unknown[] }).rows ?? []) as {
    id: string; dealName: string; accountName: string; keyLessons: string[] | null;
  }[];
  if (list.length === 0) return res.json({ data: composeNoDataAnswer() });
  const lessons = list.flatMap((r) => r.keyLessons ?? []).slice(0, 5);
  return res.json({
    data: {
      answer: lessons.length > 0
        ? `The closest archived matches surfaced these lessons: ${lessons.join("; ")}.`
        : `The closest archived matches are cited below — no structured lessons were captured for them yet.`,
      confidence: confidenceFor(list.length),
      citations: list.map((r) => ({ id: r.id, dealName: r.dealName, accountName: r.accountName })),
    },
  });
});
```

- [ ] **Step 7: Typecheck, restart, verify**

Run: `pnpm run typecheck`, restart the API server, then:
```bash
curl -s -b /tmp/edc-cookie.txt "http://localhost:5000/api/v2/memory/ask?q=How%20have%20we%20done%20against%20CloudBridge"
curl -s -b /tmp/edc-cookie.txt "http://localhost:5000/api/v2/memory/ask?q=biggest%20deal"
```
Expected: `200` with a templated `answer`, a `confidence` level, and non-empty `citations` when the archive has matching data — and the honest "don't have enough data" answer when it doesn't.

- [ ] **Step 8: Commit**

```bash
git add lib/api-spec/openapi.yaml lib/api-zod lib/api-client-react artifacts/api-server/src/lib/advisor.ts artifacts/api-server/src/lib/advisor.test.ts artifacts/api-server/src/routes/v2/crud.ts
git commit -m "feat(memory): add deterministic Ask Deal Memory advisor endpoint"
```

---

### Task 15: Ask Advisor tab (chat-style UI)

**Files:**
- Create: `artifacts/edc/src/components/memory/advisor-tab.tsx`
- Modify: `artifacts/edc/src/pages/memory.tsx` (add tab)

**Interfaces:**
- Consumes: `useAskDealMemory({ q }, { query: { enabled } })` — a submit-only query. Rather than manually calling `.refetch()` (which is sensitive to React's render/closure timing when the params also just changed), this drives the hook off a `submittedQuery` state value that only updates on submit: the query key changes exactly once per submit and `enabled: submittedQuery.length > 0` lets TanStack Query fetch automatically, which is the standard, unambiguous way to do a "fetch on demand with fresh params" query.

- [ ] **Step 1: Build the tab**

Create `artifacts/edc/src/components/memory/advisor-tab.tsx`:

```tsx
import { useEffect, useState } from "react";
import { useAskDealMemory } from "@workspace/api-client-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Link } from "wouter";
import { Send } from "lucide-react";

interface Citation { id: string; dealName: string; accountName: string }
interface AdvisorAnswer { answer: string; confidence: "high" | "medium" | "low" | "none"; citations: Citation[] }

interface Message {
  role: "user" | "advisor";
  text: string;
  confidence?: AdvisorAnswer["confidence"];
  citations?: Citation[];
}

const CONFIDENCE_LABEL: Record<AdvisorAnswer["confidence"], string> = {
  high: "High confidence",
  medium: "Medium confidence",
  low: "Low confidence",
  none: "No data",
};

const CONFIDENCE_CLASS: Record<AdvisorAnswer["confidence"], string> = {
  high: "text-emerald-600",
  medium: "text-amber-600",
  low: "text-muted-foreground",
  none: "text-destructive",
};

export function AdvisorTab() {
  const [input, setInput] = useState("");
  const [submittedQuery, setSubmittedQuery] = useState("");
  const [messages, setMessages] = useState<Message[]>([]);
  const { data, isFetching } = useAskDealMemory(
    { q: submittedQuery } as never,
    { query: { enabled: submittedQuery.length > 0 } } as never,
  );

  // Fires once per distinct submitted query: `data` only gets a new object
  // reference when the query key changes and actually refetches, so asking the
  // exact same question twice in a row intentionally does not append a second
  // (identical, cached) answer bubble.
  useEffect(() => {
    if (!data) return;
    const payload = data.data as AdvisorAnswer;
    setMessages((prev) => [
      ...prev,
      { role: "advisor", text: payload.answer, confidence: payload.confidence, citations: payload.citations },
    ]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data]);

  const ask = () => {
    const question = input.trim();
    if (!question) return;
    setMessages((prev) => [...prev, { role: "user", text: question }]);
    setInput("");
    setSubmittedQuery(question);
  };

  return (
    <div className="flex flex-col h-[600px] rounded-lg border bg-card">
      <div className="flex-1 overflow-y-auto p-4 space-y-3">
        {messages.length === 0 && (
          <p className="text-sm text-muted-foreground">
            Ask about competitors ("How have we done against CloudBridge?"), pricing ("What's typical pricing for enterprise deals?"),
            or precedents ("What's the biggest deal we've closed?"). Answers are computed deterministically from your archived deals — no AI model is used, so answers are only as good as your archive's coverage.
          </p>
        )}
        {messages.map((m, i) => (
          <div key={i} className={m.role === "user" ? "flex justify-end" : "flex justify-start"}>
            <div
              className={
                m.role === "user"
                  ? "bg-primary/10 rounded-lg px-4 py-2 text-sm max-w-[80%]"
                  : "bg-card border border-border rounded-lg px-4 py-3 text-sm max-w-[90%] space-y-2"
              }
            >
              <p>{m.text}</p>
              {m.confidence && (
                <p className={`text-xs font-medium ${CONFIDENCE_CLASS[m.confidence]}`}>{CONFIDENCE_LABEL[m.confidence]}</p>
              )}
              {m.citations && m.citations.length > 0 && (
                <div className="flex flex-wrap gap-1 pt-1">
                  {m.citations.map((c) => (
                    <Link key={c.id} href={`/memory/${c.id}`}>
                      <Badge variant="outline" className="cursor-pointer text-xs">{c.dealName}</Badge>
                    </Link>
                  ))}
                </div>
              )}
            </div>
          </div>
        ))}
      </div>
      <div className="border-t p-3 flex gap-2">
        <Input
          placeholder="Ask Deal Memory a question…"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter" && !isFetching) ask(); }}
        />
        <Button onClick={ask} disabled={isFetching || !input.trim()}>
          <Send className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Wire the tab**

In `artifacts/edc/src/pages/memory.tsx`, add `{ id: "ask", label: "Ask Advisor" }` to `TABS`, import `AdvisorTab`, render `{tab === "ask" && <AdvisorTab />}`.

- [ ] **Step 3: Typecheck and verify end-to-end in the browser**

Run: `pnpm run typecheck`. Open `/memory` → "Ask Advisor". Ask each of: a competitor question naming a real competitor from your archive, a pricing question, a "biggest deal" question, and an unrelated free-text query. Confirm: each gets a distinct templated answer, a confidence label, and clickable citation badges that navigate to `/memory/:id`; asking about a competitor/topic with zero archived matches returns the honest "don't have enough data" message rather than a fabricated answer.

- [ ] **Step 4: Commit**

```bash
git add artifacts/edc/src/components/memory/advisor-tab.tsx artifacts/edc/src/pages/memory.tsx
git commit -m "feat(memory): add deterministic Ask Advisor chat tab"
```

---

## Summary of new surface area

| Endpoint | Method | Purpose |
|---|---|---|
| `/v2/memory/search` | GET | extended with facets + `ts_headline` snippet |
| `/v2/memory/facets` | GET | distinct filter values + counts |
| `/v2/analytics/memory-health` | GET | archive completeness/density/freshness/coverage/decay |
| `/v2/memory/compare` | GET | up to 4 records by id, for the comparison sheet |
| `/v2/analytics/competitor-intel` | GET | per-competitor win rate, avg deal size, top loss reason |
| `/v2/analytics/pricing-benchmarks` | GET | TCV/cycle-time percentiles, filterable |
| `/v2/analytics/playbook-effectiveness` | GET | win rate with vs. without an assigned playbook |
| `/v2/memory/ask` | GET | deterministic, cited natural-language Q&A |

| Page/Route | Purpose |
|---|---|
| `/memory` | Knowledge Hub — Search, Health, Competitors, Pricing, Ask Advisor tabs |
| `/memory/:id` | Deal Detail — Overview, Timeline, Narrative & Autopsy, Connections tabs |

Not built, and deliberately out of scope per the user's explicit choices: any LLM call, any vector DB/embeddings, Elasticsearch, contribution leaderboards/review queues/RBAC, onboarding tutor, and playbook auto-recommendation via the unused `recommendedPlaybookId`/`applicableDealProfile` fields (those fields have no populated data or admin UI today — wiring a feature on top of them would be scope creep beyond what this plan's Part 3 needs; Part 3 instead surfaces playbook value via the already-populated `dealPlaybookAssignments` table).
