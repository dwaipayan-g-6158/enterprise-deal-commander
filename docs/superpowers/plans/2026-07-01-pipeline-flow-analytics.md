# Pipeline Flow Analytics Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a Flow Analytics module (Pipeline Pulse, Coverage, Funnel, Conversion Matrix, Transition Sankey, Recycle/Exit) to EDC as a new "Flow" tab on `/analytics`, without altering existing features.

**Architecture:** A materialized `pipeline_transitions` table (fed by the existing `deal.stage_changed` event + a one-time snapshot backfill) and a `pipeline_targets` table provide the data. A pure isomorphic engine module `lib/engine/src/flow.ts` computes all metrics. Thin Drizzle aggregations in `routes/v2/analytics.ts` assemble engine input and return via the loose `GenericDataResponse` contract; targets get a typed OpenAPI write path. The frontend converts `analytics.tsx` into a tabbed shell (existing content preserved as "Overview").

**Tech Stack:** Node 24, Express 5, Drizzle, PostgreSQL 16, TypeScript (pure engine), React 19 + Vite + Tailwind v4 + shadcn/ui + recharts, Vitest, pnpm workspace, Orval codegen.

## Global Constraints

- pnpm only (`preinstall` rejects npm/yarn). Run commands from repo root unless noted.
- Engine module purity: `lib/engine/src/flow.ts` performs **no DB/network I/O**; all inputs passed as arguments. (Matches `scoring.ts`/`risk-v2.ts`.)
- Schema changes are **additive only**, applied via **direct SQL** — never `drizzle-kit push`/`push-force` (TTY truncate risk per CLAUDE.md).
- New `edc_v2` tables use the `edcV2.table(...)` helper and are exported from `lib/db/src/schema/index.ts`.
- Currency is USD-only; do not reintroduce a currency field. TCV values use `normalized_tcv`.
- API data endpoints reuse the loose `GenericDataResponse` contract (like dashboard aggregations); only the targets write path is OpenAPI-specced + Orval-generated.
- Express route ordering: literal paths before param paths.
- `pnpm run typecheck` and the existing engine suite (121 tests) must stay green. Run `pnpm --filter @workspace/engine run test` before claiming engine work compiles.
- Commit after each task with a Conventional Commit message.
- Stages (seeded): `Discovery`(1) `Validation`(2) `Commercial`(3) `Procurement`(4) `Closed-Won`(5) `Closed-Lost`(6). Terminal = sortOrder 5/6. Stage→transition-type mapping is derived from `sortOrder`/terminal flags, never hardcoded to IDs.

---

### Task 1: Schema — `pipeline_transitions` + `pipeline_targets`

**Files:**
- Modify: `lib/db/src/schema/edc_v2.ts` (append two tables)
- Modify: `lib/db/src/schema/index.ts` (ensure re-export — it re-exports `edc_v2`, confirm)
- Create: `scripts/sql/2026-07-01-pipeline-flow.sql` (direct-SQL DDL)

**Interfaces:**
- Produces: Drizzle tables `pipelineTransitions`, `pipelineTargets` exported from `@workspace/db`. Columns per the SQL below.

- [ ] **Step 1: Add table definitions to `edc_v2.ts`**

Append (uses already-imported `edcV2`, `uuid`, `integer`, `varchar`, `numeric`, `boolean`, `timestamp`, `date`, `index`, `unique`, `enterpriseDeals`):

```ts
export const pipelineTransitions = edcV2.table(
  "pipeline_transitions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    dealId: uuid("deal_id")
      .notNull()
      .references(() => enterpriseDeals.id, { onDelete: "cascade" }),
    fromStageId: integer("from_stage_id"),
    toStageId: integer("to_stage_id"),
    transitionType: varchar("transition_type", { length: 20 }).notNull(),
    tcvAtTransition: numeric("tcv_at_transition", { precision: 18, scale: 2 }),
    daysInFromStage: integer("days_in_from_stage"),
    overridden: boolean("overridden").notNull().default(false),
    transitionedAt: timestamp("transitioned_at", { withTimezone: true }).notNull(),
    createdBy: varchar("created_by", { length: 255 }).notNull(),
  },
  (t) => [
    index("transitions_deal_time_idx").on(t.dealId, t.transitionedAt.desc()),
    index("transitions_time_idx").on(t.transitionedAt.desc()),
    unique("transitions_natural_key").on(t.dealId, t.transitionedAt),
  ],
);

export const pipelineTargets = edcV2.table(
  "pipeline_targets",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    periodType: varchar("period_type", { length: 10 }).notNull().default("quarter"),
    periodStart: date("period_start", { mode: "string" }).notNull(),
    targetValue: numeric("target_value", { precision: 18, scale: 2 }).notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [unique("targets_period_unique").on(t.periodType, t.periodStart)],
);
```

- [ ] **Step 2: Confirm `index.ts` re-exports `edc_v2`**

Run: `grep -n "edc_v2" lib/db/src/schema/index.ts`
Expected: a `export * from "./edc_v2";` line. If absent, add it.

- [ ] **Step 3: Write the direct-SQL DDL**

Create `scripts/sql/2026-07-01-pipeline-flow.sql`:

```sql
CREATE TABLE IF NOT EXISTS edc_v2.pipeline_transitions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  deal_id uuid NOT NULL REFERENCES enterprise_deals(id) ON DELETE CASCADE,
  from_stage_id integer,
  to_stage_id integer,
  transition_type varchar(20) NOT NULL,
  tcv_at_transition numeric(18,2),
  days_in_from_stage integer,
  overridden boolean NOT NULL DEFAULT false,
  transitioned_at timestamptz NOT NULL,
  created_by varchar(255) NOT NULL,
  CONSTRAINT transitions_natural_key UNIQUE (deal_id, transitioned_at)
);
CREATE INDEX IF NOT EXISTS transitions_deal_time_idx ON edc_v2.pipeline_transitions (deal_id, transitioned_at DESC);
CREATE INDEX IF NOT EXISTS transitions_time_idx ON edc_v2.pipeline_transitions (transitioned_at DESC);

CREATE TABLE IF NOT EXISTS edc_v2.pipeline_targets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  period_type varchar(10) NOT NULL DEFAULT 'quarter',
  period_start date NOT NULL,
  target_value numeric(18,2) NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT targets_period_unique UNIQUE (period_type, period_start)
);
```

- [ ] **Step 4: Apply the SQL to the local DB**

Run (PowerShell, uses `$env:DATABASE_URL`): `psql "$env:DATABASE_URL" -f scripts/sql/2026-07-01-pipeline-flow.sql`
Expected: `CREATE TABLE` / `CREATE INDEX` notices, no errors. (If `psql` unavailable, apply via the project's existing SQL-runner per `edc-local-windows-run` memory.)

- [ ] **Step 5: Typecheck**

Run: `pnpm run typecheck`
Expected: PASS (new tables compile, exported).

- [ ] **Step 6: Commit**

```bash
git add lib/db/src/schema/edc_v2.ts lib/db/src/schema/index.ts scripts/sql/2026-07-01-pipeline-flow.sql
git commit -m "feat(db): add pipeline_transitions and pipeline_targets tables"
```

---

### Task 2: Engine — types + `computeTransitionType` helper + `computeFunnel`

**Files:**
- Create: `lib/engine/src/flow.ts`
- Create: `lib/engine/src/flow.test.ts`

**Interfaces:**
- Produces:
  - `interface StageDef { id: number; name: string; sortOrder: number; terminal?: "won" | "lost" }`
  - `interface TransitionRec { dealId: string; fromStageId: number | null; toStageId: number | null; transitionType: TransitionType; tcv: number; daysInFromStage: number | null; transitionedAt: string }`
  - `type TransitionType = "create" | "forward" | "backward" | "exit_won" | "exit_lost"`
  - `interface OpenDeal { id: string; stageId: number; tcv: number; winProbabilityPct: number | null; aiWinProbability: number | null; createdAt: string }`
  - `computeTransitionType(fromSortOrder: number | null, toStage: StageDef): TransitionType`
  - `interface FunnelRow { stageId: number; stageName: string; dealCount: number; totalValue: number; convToNextPct: number | null; avgDaysInStage: number | null; pctOfPipeline: number }`
  - `computeFunnel(deals: OpenDeal[], transitions: TransitionRec[], stages: StageDef[]): FunnelRow[]`

- [ ] **Step 1: Write failing tests** in `lib/engine/src/flow.test.ts`

```ts
import { describe, it, expect } from "vitest";
import { computeTransitionType, computeFunnel, type StageDef, type OpenDeal, type TransitionRec } from "./flow";

const STAGES: StageDef[] = [
  { id: 1, name: "Discovery", sortOrder: 1 },
  { id: 2, name: "Validation", sortOrder: 2 },
  { id: 3, name: "Commercial", sortOrder: 3 },
  { id: 4, name: "Procurement", sortOrder: 4 },
  { id: 5, name: "Closed-Won", sortOrder: 5, terminal: "won" },
  { id: 6, name: "Closed-Lost", sortOrder: 6, terminal: "lost" },
];

describe("computeTransitionType", () => {
  it("classifies create when fromSortOrder is null", () => {
    expect(computeTransitionType(null, STAGES[0])).toBe("create");
  });
  it("classifies forward and backward by sort order", () => {
    expect(computeTransitionType(1, STAGES[1])).toBe("forward");
    expect(computeTransitionType(3, STAGES[0])).toBe("backward");
  });
  it("classifies terminal stages as exit_won / exit_lost", () => {
    expect(computeTransitionType(4, STAGES[4])).toBe("exit_won");
    expect(computeTransitionType(2, STAGES[5])).toBe("exit_lost");
  });
});

describe("computeFunnel", () => {
  it("counts deals and value per active stage with conversion to next", () => {
    const deals: OpenDeal[] = [
      { id: "a", stageId: 1, tcv: 100, winProbabilityPct: null, aiWinProbability: null, createdAt: "2026-01-01" },
      { id: "b", stageId: 2, tcv: 200, winProbabilityPct: null, aiWinProbability: null, createdAt: "2026-01-01" },
      { id: "c", stageId: 2, tcv: 300, winProbabilityPct: null, aiWinProbability: null, createdAt: "2026-01-01" },
    ];
    const rows = computeFunnel(deals, [], STAGES);
    const validation = rows.find((r) => r.stageId === 2)!;
    expect(validation.dealCount).toBe(2);
    expect(validation.totalValue).toBe(500);
    // Discovery → Validation conversion = deals that reached Validation+ / deals that entered Discovery
    expect(rows.find((r) => r.stageId === 1)!.dealCount).toBe(1);
  });
  it("excludes terminal stages from the active funnel", () => {
    const rows = computeFunnel([], [], STAGES);
    expect(rows.every((r) => r.stageId < 5)).toBe(true);
  });
});
```

- [ ] **Step 2: Run tests, verify they fail**

Run: `pnpm --filter @workspace/engine exec vitest run src/flow.test.ts`
Expected: FAIL — `computeTransitionType`/`computeFunnel` not defined.

- [ ] **Step 3: Implement `flow.ts` (types + the two functions)**

```ts
// Enterprise Deal Commander — Flow Analytics engine (pure, isomorphic).
// No DB/network I/O. All inputs passed as arguments (see scoring.ts / risk-v2.ts).

export type TransitionType = "create" | "forward" | "backward" | "exit_won" | "exit_lost";

export interface StageDef {
  id: number;
  name: string;
  sortOrder: number;
  terminal?: "won" | "lost";
}

export interface TransitionRec {
  dealId: string;
  fromStageId: number | null;
  toStageId: number | null;
  transitionType: TransitionType;
  tcv: number;
  daysInFromStage: number | null;
  transitionedAt: string;
}

export interface OpenDeal {
  id: string;
  stageId: number;
  tcv: number;
  winProbabilityPct: number | null;
  aiWinProbability: number | null; // 0..1
  createdAt: string;
}

export interface FunnelRow {
  stageId: number;
  stageName: string;
  dealCount: number;
  totalValue: number;
  convToNextPct: number | null;
  avgDaysInStage: number | null;
  pctOfPipeline: number;
}

export function computeTransitionType(
  fromSortOrder: number | null,
  toStage: StageDef,
): TransitionType {
  if (fromSortOrder === null) return "create";
  if (toStage.terminal === "won") return "exit_won";
  if (toStage.terminal === "lost") return "exit_lost";
  return toStage.sortOrder > fromSortOrder ? "forward" : "backward";
}

export function computeFunnel(
  deals: OpenDeal[],
  transitions: TransitionRec[],
  stages: StageDef[],
): FunnelRow[] {
  const active = [...stages].filter((s) => !s.terminal).sort((a, b) => a.sortOrder - b.sortOrder);
  const totalValue = deals.reduce((sum, d) => sum + d.tcv, 0) || 1;

  // Count of deals that ever entered each active stage (for conversion).
  const enteredCount = new Map<number, number>();
  for (const t of transitions) {
    if (t.toStageId != null) enteredCount.set(t.toStageId, (enteredCount.get(t.toStageId) ?? 0) + 1);
  }
  // Average residence time per stage, from transitions leaving that stage.
  const residSum = new Map<number, number>();
  const residN = new Map<number, number>();
  for (const t of transitions) {
    if (t.fromStageId != null && t.daysInFromStage != null) {
      residSum.set(t.fromStageId, (residSum.get(t.fromStageId) ?? 0) + t.daysInFromStage);
      residN.set(t.fromStageId, (residN.get(t.fromStageId) ?? 0) + 1);
    }
  }

  return active.map((stage, i) => {
    const inStage = deals.filter((d) => d.stageId === stage.id);
    const next = active[i + 1];
    const enteredThis = enteredCount.get(stage.id) ?? inStage.length;
    const enteredNext = next ? (enteredCount.get(next.id) ?? 0) : null;
    const n = residN.get(stage.id) ?? 0;
    return {
      stageId: stage.id,
      stageName: stage.name,
      dealCount: inStage.length,
      totalValue: inStage.reduce((s, d) => s + d.tcv, 0),
      convToNextPct:
        enteredNext != null && enteredThis > 0 ? round1((enteredNext / enteredThis) * 100) : null,
      avgDaysInStage: n > 0 ? Math.round((residSum.get(stage.id) ?? 0) / n) : null,
      pctOfPipeline: round1((inStage.reduce((s, d) => s + d.tcv, 0) / totalValue) * 100),
    };
  });
}

function round1(n: number): number {
  return Math.round(n * 10) / 10;
}
```

- [ ] **Step 4: Run tests, verify PASS**

Run: `pnpm --filter @workspace/engine exec vitest run src/flow.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/engine/src/flow.ts lib/engine/src/flow.test.ts
git commit -m "feat(engine): flow types, transition-type helper, funnel"
```

---

### Task 3: Engine — `computeConversionMatrix`

**Files:**
- Modify: `lib/engine/src/flow.ts`
- Modify: `lib/engine/src/flow.test.ts`

**Interfaces:**
- Consumes: `TransitionRec`, `StageDef`.
- Produces:
  - `interface MatrixCell { fromId: number; toId: number; rate: number; n: number; kind: "forward" | "stagnation" | "regression"; significant: boolean }`
  - `computeConversionMatrix(transitions: TransitionRec[], stages: StageDef[], windowDays: number, nowISO: string): MatrixCell[][]`

- [ ] **Step 1: Write failing test** (append to `flow.test.ts`)

```ts
import { computeConversionMatrix } from "./flow";

describe("computeConversionMatrix", () => {
  it("computes from→to rates with forward/regression/stagnation kinds", () => {
    const now = "2026-02-01T00:00:00Z";
    const transitions: TransitionRec[] = [
      { dealId: "a", fromStageId: 1, toStageId: 2, transitionType: "forward", tcv: 0, daysInFromStage: 5, transitionedAt: "2026-01-10T00:00:00Z" },
      { dealId: "b", fromStageId: 1, toStageId: 2, transitionType: "forward", tcv: 0, daysInFromStage: 5, transitionedAt: "2026-01-11T00:00:00Z" },
      { dealId: "c", fromStageId: 1, toStageId: 1, transitionType: "backward", tcv: 0, daysInFromStage: 5, transitionedAt: "2026-01-12T00:00:00Z" },
    ];
    const m = computeConversionMatrix(transitions, STAGES, 90, now);
    const cell12 = m[0].find((c) => c.toId === 2)!; // from stage 1 → stage 2
    expect(cell12.kind).toBe("forward");
    expect(cell12.n).toBe(2);
    // 3 transitions out of stage 1, 2 went to stage 2 → 66.7%
    expect(cell12.rate).toBeCloseTo(66.7, 1);
  });
  it("excludes transitions older than the window", () => {
    const now = "2026-06-01T00:00:00Z";
    const transitions: TransitionRec[] = [
      { dealId: "a", fromStageId: 1, toStageId: 2, transitionType: "forward", tcv: 0, daysInFromStage: 5, transitionedAt: "2026-01-01T00:00:00Z" },
    ];
    const m = computeConversionMatrix(transitions, STAGES, 30, now);
    expect(m[0].every((c) => c.n === 0)).toBe(true);
  });
});
```

- [ ] **Step 2: Run, verify fail**

Run: `pnpm --filter @workspace/engine exec vitest run src/flow.test.ts -t "computeConversionMatrix"`
Expected: FAIL — not defined.

- [ ] **Step 3: Implement** (append to `flow.ts`)

```ts
export interface MatrixCell {
  fromId: number;
  toId: number;
  rate: number;
  n: number;
  kind: "forward" | "stagnation" | "regression";
  significant: boolean;
}

export function computeConversionMatrix(
  transitions: TransitionRec[],
  stages: StageDef[],
  windowDays: number,
  nowISO: string,
): MatrixCell[][] {
  const ordered = [...stages].sort((a, b) => a.sortOrder - b.sortOrder);
  const cutoff = new Date(nowISO).getTime() - windowDays * 86_400_000;
  const inWindow = transitions.filter(
    (t) => t.fromStageId != null && t.toStageId != null && new Date(t.transitionedAt).getTime() >= cutoff,
  );
  const orderById = new Map(ordered.map((s) => [s.id, s.sortOrder]));

  // Outgoing totals per from-stage (denominator).
  const outTotal = new Map<number, number>();
  for (const t of inWindow) outTotal.set(t.fromStageId!, (outTotal.get(t.fromStageId!) ?? 0) + 1);

  // Portfolio-wide forward rate baseline for significance.
  const fwdN = inWindow.filter((t) => (orderById.get(t.toStageId!) ?? 0) > (orderById.get(t.fromStageId!) ?? 0)).length;
  const baseline = inWindow.length > 0 ? fwdN / inWindow.length : 0;

  return ordered.map((from) =>
    ordered.map((to) => {
      const n = inWindow.filter((t) => t.fromStageId === from.id && t.toStageId === to.id).length;
      const denom = outTotal.get(from.id) ?? 0;
      const rate = denom > 0 ? round1((n / denom) * 100) : 0;
      const kind: MatrixCell["kind"] =
        to.sortOrder === from.sortOrder ? "stagnation" : to.sortOrder > from.sortOrder ? "forward" : "regression";
      return { fromId: from.id, toId: to.id, rate, n, kind, significant: zTestSignificant(n, denom, baseline) };
    }),
  );
}

// Two-proportion z-test vs portfolio baseline; |z| > 1.96 ≈ p < 0.05.
function zTestSignificant(successes: number, n: number, baseline: number): boolean {
  if (n < 10 || baseline <= 0 || baseline >= 1) return false;
  const p = successes / n;
  const se = Math.sqrt((baseline * (1 - baseline)) / n);
  if (se === 0) return false;
  return Math.abs((p - baseline) / se) > 1.96;
}
```

- [ ] **Step 4: Run, verify PASS**

Run: `pnpm --filter @workspace/engine exec vitest run src/flow.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/engine/src/flow.ts lib/engine/src/flow.test.ts
git commit -m "feat(engine): stage-to-stage conversion matrix with significance"
```

---

### Task 4: Engine — `computeSankeyFlows`

**Files:**
- Modify: `lib/engine/src/flow.ts`
- Modify: `lib/engine/src/flow.test.ts`

**Interfaces:**
- Consumes: `TransitionRec`, `StageDef`.
- Produces:
  - `interface SankeyNode { id: string; label: string }`
  - `interface SankeyLink { source: string; target: string; value: number }`
  - `computeSankeyFlows(transitions: TransitionRec[], stages: StageDef[], mode: "count" | "value"): { nodes: SankeyNode[]; links: SankeyLink[] }`

- [ ] **Step 1: Write failing test** (append)

```ts
import { computeSankeyFlows } from "./flow";

describe("computeSankeyFlows", () => {
  it("builds weighted links incl. exit nodes (count mode)", () => {
    const transitions: TransitionRec[] = [
      { dealId: "a", fromStageId: 1, toStageId: 2, transitionType: "forward", tcv: 100, daysInFromStage: 1, transitionedAt: "2026-01-01T00:00:00Z" },
      { dealId: "b", fromStageId: 2, toStageId: 5, transitionType: "exit_won", tcv: 200, daysInFromStage: 1, transitionedAt: "2026-01-02T00:00:00Z" },
    ];
    const { nodes, links } = computeSankeyFlows(transitions, STAGES, "count");
    expect(links.find((l) => l.source === "1" && l.target === "2")!.value).toBe(1);
    expect(nodes.some((n) => n.id === "5")).toBe(true);
  });
  it("weights links by value in value mode", () => {
    const transitions: TransitionRec[] = [
      { dealId: "a", fromStageId: 1, toStageId: 2, transitionType: "forward", tcv: 100, daysInFromStage: 1, transitionedAt: "2026-01-01T00:00:00Z" },
    ];
    const { links } = computeSankeyFlows(transitions, STAGES, "value");
    expect(links[0].value).toBe(100);
  });
});
```

- [ ] **Step 2: Run, verify fail**

Run: `pnpm --filter @workspace/engine exec vitest run src/flow.test.ts -t "computeSankeyFlows"`
Expected: FAIL.

- [ ] **Step 3: Implement** (append)

```ts
export interface SankeyNode { id: string; label: string }
export interface SankeyLink { source: string; target: string; value: number }

export function computeSankeyFlows(
  transitions: TransitionRec[],
  stages: StageDef[],
  mode: "count" | "value",
): { nodes: SankeyNode[]; links: SankeyLink[] } {
  const nameById = new Map(stages.map((s) => [s.id, s.name]));
  const linkMap = new Map<string, number>();
  const usedNodes = new Set<number>();

  for (const t of transitions) {
    if (t.fromStageId == null || t.toStageId == null) continue;
    const key = `${t.fromStageId}→${t.toStageId}`;
    linkMap.set(key, (linkMap.get(key) ?? 0) + (mode === "value" ? t.tcv : 1));
    usedNodes.add(t.fromStageId);
    usedNodes.add(t.toStageId);
  }

  const nodes: SankeyNode[] = [...usedNodes]
    .sort((a, b) => a - b)
    .map((id) => ({ id: String(id), label: nameById.get(id) ?? `Stage ${id}` }));
  const links: SankeyLink[] = [...linkMap.entries()].map(([key, value]) => {
    const [source, target] = key.split("→");
    return { source, target, value: Math.round(value) };
  });
  return { nodes, links };
}
```

- [ ] **Step 4: Run, verify PASS**

Run: `pnpm --filter @workspace/engine exec vitest run src/flow.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/engine/src/flow.ts lib/engine/src/flow.test.ts
git commit -m "feat(engine): sankey transition flows"
```

---

### Task 5: Engine — `computeRecycleExit`

**Files:**
- Modify: `lib/engine/src/flow.ts`
- Modify: `lib/engine/src/flow.test.ts`

**Interfaces:**
- Consumes: `TransitionRec`, `StageDef`.
- Produces:
  - `interface WaterfallStep { label: string; delta: number; kind: "created" | "won" | "lost" | "recycled" }`
  - `interface RecycleExit { overallRecycleRate: number; recycleRateByStage: Record<number, number>; exitRateByStage: Record<number, number>; recycleCountDistribution: Record<number, number>; waterfall: WaterfallStep[] }`
  - `computeRecycleExit(transitions: TransitionRec[], stages: StageDef[]): RecycleExit`

- [ ] **Step 1: Write failing test** (append)

```ts
import { computeRecycleExit } from "./flow";

describe("computeRecycleExit", () => {
  it("computes recycle rate and recycle-count distribution", () => {
    const transitions: TransitionRec[] = [
      { dealId: "a", fromStageId: null, toStageId: 1, transitionType: "create", tcv: 100, daysInFromStage: null, transitionedAt: "2026-01-01T00:00:00Z" },
      { dealId: "a", fromStageId: 1, toStageId: 2, transitionType: "forward", tcv: 100, daysInFromStage: 3, transitionedAt: "2026-01-04T00:00:00Z" },
      { dealId: "a", fromStageId: 2, toStageId: 1, transitionType: "backward", tcv: 100, daysInFromStage: 2, transitionedAt: "2026-01-06T00:00:00Z" },
    ];
    const r = computeRecycleExit(transitions, STAGES);
    expect(r.recycleCountDistribution[1]).toBe(1); // one deal recycled once
    expect(r.overallRecycleRate).toBeGreaterThan(0);
  });
  it("counts exits by terminal stage in the waterfall", () => {
    const transitions: TransitionRec[] = [
      { dealId: "b", fromStageId: null, toStageId: 1, transitionType: "create", tcv: 500, daysInFromStage: null, transitionedAt: "2026-01-01T00:00:00Z" },
      { dealId: "b", fromStageId: 1, toStageId: 5, transitionType: "exit_won", tcv: 500, daysInFromStage: 4, transitionedAt: "2026-01-05T00:00:00Z" },
    ];
    const r = computeRecycleExit(transitions, STAGES);
    expect(r.waterfall.find((w) => w.kind === "won")!.delta).toBe(-500);
    expect(r.waterfall.find((w) => w.kind === "created")!.delta).toBe(500);
  });
});
```

- [ ] **Step 2: Run, verify fail**

Run: `pnpm --filter @workspace/engine exec vitest run src/flow.test.ts -t "computeRecycleExit"`
Expected: FAIL.

- [ ] **Step 3: Implement** (append)

```ts
export interface WaterfallStep { label: string; delta: number; kind: "created" | "won" | "lost" | "recycled" }
export interface RecycleExit {
  overallRecycleRate: number;
  recycleRateByStage: Record<number, number>;
  exitRateByStage: Record<number, number>;
  recycleCountDistribution: Record<number, number>;
  waterfall: WaterfallStep[];
}

export function computeRecycleExit(transitions: TransitionRec[], stages: StageDef[]): RecycleExit {
  const dealIds = new Set(transitions.map((t) => t.dealId));
  const totalDeals = dealIds.size || 1;

  // Per-deal backward count.
  const backByDeal = new Map<string, number>();
  for (const t of transitions) {
    if (t.transitionType === "backward") backByDeal.set(t.dealId, (backByDeal.get(t.dealId) ?? 0) + 1);
  }
  const recycledDeals = [...backByDeal.values()].filter((c) => c > 0).length;
  const recycleCountDistribution: Record<number, number> = {};
  for (const c of backByDeal.values()) recycleCountDistribution[c] = (recycleCountDistribution[c] ?? 0) + 1;

  // Recycle/exit rate by stage = (backward|exit from stage) / (entered stage).
  const enteredByStage = new Map<number, number>();
  const backFromStage = new Map<number, number>();
  const exitFromStage = new Map<number, number>();
  for (const t of transitions) {
    if (t.toStageId != null) enteredByStage.set(t.toStageId, (enteredByStage.get(t.toStageId) ?? 0) + 1);
    if (t.fromStageId != null && t.transitionType === "backward")
      backFromStage.set(t.fromStageId, (backFromStage.get(t.fromStageId) ?? 0) + 1);
    if (t.fromStageId != null && (t.transitionType === "exit_won" || t.transitionType === "exit_lost"))
      exitFromStage.set(t.fromStageId, (exitFromStage.get(t.fromStageId) ?? 0) + 1);
  }
  const recycleRateByStage: Record<number, number> = {};
  const exitRateByStage: Record<number, number> = {};
  for (const s of stages) {
    const entered = enteredByStage.get(s.id) ?? 0;
    recycleRateByStage[s.id] = entered > 0 ? round1(((backFromStage.get(s.id) ?? 0) / entered) * 100) : 0;
    exitRateByStage[s.id] = entered > 0 ? round1(((exitFromStage.get(s.id) ?? 0) / entered) * 100) : 0;
  }

  // Waterfall: created (+), recycled marker, won (−), lost (−).
  const created = transitions.filter((t) => t.transitionType === "create").reduce((s, t) => s + t.tcv, 0);
  const won = transitions.filter((t) => t.transitionType === "exit_won").reduce((s, t) => s + t.tcv, 0);
  const lost = transitions.filter((t) => t.transitionType === "exit_lost").reduce((s, t) => s + t.tcv, 0);
  const waterfall: WaterfallStep[] = [
    { label: "Created", delta: Math.round(created), kind: "created" },
    { label: "Recycled", delta: 0, kind: "recycled" },
    { label: "Won", delta: -Math.round(won), kind: "won" },
    { label: "Lost", delta: -Math.round(lost), kind: "lost" },
  ];

  return {
    overallRecycleRate: round1((recycledDeals / totalDeals) * 100),
    recycleRateByStage,
    exitRateByStage,
    recycleCountDistribution,
    waterfall,
  };
}
```

- [ ] **Step 4: Run, verify PASS**

Run: `pnpm --filter @workspace/engine exec vitest run src/flow.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/engine/src/flow.ts lib/engine/src/flow.test.ts
git commit -m "feat(engine): recycle and exit analysis"
```

---

### Task 6: Engine — `computeCoverage`

**Files:**
- Modify: `lib/engine/src/flow.ts`
- Modify: `lib/engine/src/flow.test.ts`

**Interfaces:**
- Consumes: `OpenDeal`, `StageDef`.
- Produces:
  - `interface CoverageRatios { total: number | null; qualified: number | null; weighted: number | null; aiAdjusted: number | null; netNew: number | null; caveats: string[] }`
  - `computeCoverage(deals: OpenDeal[], stages: StageDef[], target: number | null, periodStartISO: string): CoverageRatios`

- [ ] **Step 1: Write failing test** (append)

```ts
import { computeCoverage } from "./flow";

describe("computeCoverage", () => {
  it("returns null ratios when no target set", () => {
    const c = computeCoverage([], STAGES, null, "2026-01-01");
    expect(c.total).toBeNull();
  });
  it("computes total and qualified (qualified = past Discovery)", () => {
    const deals: OpenDeal[] = [
      { id: "a", stageId: 1, tcv: 100, winProbabilityPct: 50, aiWinProbability: 0.5, createdAt: "2026-01-15" },
      { id: "b", stageId: 3, tcv: 300, winProbabilityPct: 80, aiWinProbability: 0.8, createdAt: "2026-01-15" },
    ];
    const c = computeCoverage(deals, STAGES, 1000, "2026-01-01");
    expect(c.total).toBeCloseTo(0.4, 2); // 400/1000
    expect(c.qualified).toBeCloseTo(0.3, 2); // 300/1000 (stage 3 only)
    expect(c.weighted).toBeCloseTo(0.29, 2); // (100*.5 + 300*.8)/1000 = 290/1000
  });
});
```

- [ ] **Step 2: Run, verify fail**

Run: `pnpm --filter @workspace/engine exec vitest run src/flow.test.ts -t "computeCoverage"`
Expected: FAIL.

- [ ] **Step 3: Implement** (append)

```ts
export interface CoverageRatios {
  total: number | null;
  qualified: number | null;
  weighted: number | null;
  aiAdjusted: number | null;
  netNew: number | null;
  caveats: string[];
}

export function computeCoverage(
  deals: OpenDeal[],
  stages: StageDef[],
  target: number | null,
  periodStartISO: string,
): CoverageRatios {
  if (!target || target <= 0) {
    return { total: null, qualified: null, weighted: null, aiAdjusted: null, netNew: null, caveats: ["No target set for the active period."] };
  }
  const terminalIds = new Set(stages.filter((s) => s.terminal).map((s) => s.id));
  const open = deals.filter((d) => !terminalIds.has(d.stageId));
  const discoveryOrder = Math.min(...stages.map((s) => s.sortOrder));
  const orderById = new Map(stages.map((s) => [s.id, s.sortOrder]));

  const total = open.reduce((s, d) => s + d.tcv, 0);
  const qualified = open
    .filter((d) => (orderById.get(d.stageId) ?? 0) > discoveryOrder)
    .reduce((s, d) => s + d.tcv, 0);

  const caveats: string[] = [];
  const withProb = open.filter((d) => d.winProbabilityPct != null);
  if (withProb.length < open.length) caveats.push(`${open.length - withProb.length} deal(s) excluded from weighted coverage (no win probability).`);
  const weighted = withProb.reduce((s, d) => s + d.tcv * (d.winProbabilityPct! / 100), 0);

  const withAi = open.filter((d) => d.aiWinProbability != null);
  if (withAi.length < open.length) caveats.push(`${open.length - withAi.length} deal(s) excluded from AI-adjusted coverage (not scored).`);
  const aiAdjusted = withAi.reduce((s, d) => s + d.tcv * d.aiWinProbability!, 0);

  const periodStart = new Date(periodStartISO).getTime();
  const netNewValue = open.filter((d) => new Date(d.createdAt).getTime() >= periodStart).reduce((s, d) => s + d.tcv, 0);
  const gap = Math.max(0, target - weighted);

  return {
    total: round2(total / target),
    qualified: round2(qualified / target),
    weighted: round2(weighted / target),
    aiAdjusted: round2(aiAdjusted / target),
    netNew: gap > 0 ? round2(netNewValue / gap) : null,
    caveats,
  };
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
```

- [ ] **Step 4: Run, verify PASS**

Run: `pnpm --filter @workspace/engine exec vitest run src/flow.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/engine/src/flow.ts lib/engine/src/flow.test.ts
git commit -m "feat(engine): coverage ratios"
```

---

### Task 7: Engine — `computeHealthScore` + index export

**Files:**
- Modify: `lib/engine/src/flow.ts`
- Modify: `lib/engine/src/flow.test.ts`
- Modify: `lib/engine/src/index.ts` (re-export flow API)

**Interfaces:**
- Produces:
  - `interface HealthInputs { coverageQualified: number | null; velocityIndex: number; winRate: number; generationRatio: number | null; agingScore: number; retentionRate: number }`
  - `interface HealthHistory { coverage: number[]; velocity: number[]; conversion: number[]; generation: number[]; age: number[]; attrition: number[] }`
  - `interface HealthWeights { coverage: number; velocity: number; conversion: number; generation: number; age: number; attrition: number }`
  - `const DEFAULT_HEALTH_WEIGHTS: HealthWeights`
  - `interface HealthScore { score: number; subScores: Record<keyof HealthWeights, number | null> }`
  - `computeHealthScore(inputs: HealthInputs, history: HealthHistory, weights?: HealthWeights): HealthScore`

- [ ] **Step 1: Write failing test** (append)

```ts
import { computeHealthScore, DEFAULT_HEALTH_WEIGHTS } from "./flow";

describe("computeHealthScore", () => {
  it("normalizes components to percentile rank and weights them", () => {
    const inputs = { coverageQualified: 3, velocityIndex: 40, winRate: 0.5, generationRatio: 1.1, agingScore: 30, retentionRate: 0.9 };
    const history = {
      coverage: [1, 2, 3, 4], velocity: [30, 40, 50, 60], conversion: [0.2, 0.3, 0.4, 0.5],
      generation: [0.8, 0.9, 1.0, 1.1], age: [20, 30, 40, 50], attrition: [0.7, 0.8, 0.9, 0.95],
    };
    const r = computeHealthScore(inputs, history, DEFAULT_HEALTH_WEIGHTS);
    expect(r.score).toBeGreaterThanOrEqual(0);
    expect(r.score).toBeLessThanOrEqual(100);
    expect(r.subScores.velocity).not.toBeNull();
  });
  it("returns null coverage sub-score when coverage input is null", () => {
    const inputs = { coverageQualified: null, velocityIndex: 40, winRate: 0.5, generationRatio: null, agingScore: 30, retentionRate: 0.9 };
    const history = { coverage: [], velocity: [40], conversion: [0.5], generation: [], age: [30], attrition: [0.9] };
    const r = computeHealthScore(inputs, history);
    expect(r.subScores.coverage).toBeNull();
    expect(r.subScores.generation).toBeNull();
  });
});
```

- [ ] **Step 2: Run, verify fail**

Run: `pnpm --filter @workspace/engine exec vitest run src/flow.test.ts -t "computeHealthScore"`
Expected: FAIL.

- [ ] **Step 3: Implement** (append to `flow.ts`)

```ts
export interface HealthInputs {
  coverageQualified: number | null;
  velocityIndex: number; // lower is better
  winRate: number;
  generationRatio: number | null;
  agingScore: number; // lower is better
  retentionRate: number;
}
export interface HealthHistory {
  coverage: number[]; velocity: number[]; conversion: number[];
  generation: number[]; age: number[]; attrition: number[];
}
export interface HealthWeights {
  coverage: number; velocity: number; conversion: number;
  generation: number; age: number; attrition: number;
}
export const DEFAULT_HEALTH_WEIGHTS: HealthWeights = {
  coverage: 1 / 6, velocity: 1 / 6, conversion: 1 / 6, generation: 1 / 6, age: 1 / 6, attrition: 1 / 6,
};
export interface HealthScore {
  score: number;
  subScores: Record<keyof HealthWeights, number | null>;
}

// Percentile rank of value within history → 0..100. invert: lower raw is better.
function percentileRank(value: number | null, history: number[], invert = false): number | null {
  if (value == null) return null;
  if (history.length === 0) return 50; // neutral when no baseline
  const below = history.filter((h) => h <= value).length;
  let pct = (below / history.length) * 100;
  if (invert) pct = 100 - pct;
  return Math.round(Math.max(0, Math.min(100, pct)));
}

export function computeHealthScore(
  inputs: HealthInputs,
  history: HealthHistory,
  weights: HealthWeights = DEFAULT_HEALTH_WEIGHTS,
): HealthScore {
  const subScores: Record<keyof HealthWeights, number | null> = {
    coverage: percentileRank(inputs.coverageQualified, history.coverage),
    velocity: percentileRank(inputs.velocityIndex, history.velocity, true),
    conversion: percentileRank(inputs.winRate, history.conversion),
    generation: percentileRank(inputs.generationRatio, history.generation),
    age: percentileRank(inputs.agingScore, history.age, true),
    attrition: percentileRank(inputs.retentionRate, history.attrition),
  };
  // Weighted mean over available (non-null) sub-scores; re-normalize weights.
  let wSum = 0;
  let acc = 0;
  for (const k of Object.keys(weights) as (keyof HealthWeights)[]) {
    const s = subScores[k];
    if (s != null) {
      acc += weights[k] * s;
      wSum += weights[k];
    }
  }
  const score = wSum > 0 ? Math.round(acc / wSum) : 0;
  return { score, subScores };
}
```

- [ ] **Step 4: Re-export from engine index** — append to `lib/engine/src/index.ts`:

```ts
export * from "./flow";
```

- [ ] **Step 5: Run full engine suite**

Run: `pnpm --filter @workspace/engine run test`
Expected: PASS — all prior 121 tests + new flow tests.

- [ ] **Step 6: Typecheck + commit**

Run: `pnpm run typecheck` → PASS

```bash
git add lib/engine/src/flow.ts lib/engine/src/flow.test.ts lib/engine/src/index.ts
git commit -m "feat(engine): pipeline health score composite + export flow API"
```

---

### Task 8: Subscriber — `pipeline-transitions`

**Files:**
- Create: `artifacts/api-server/src/lib/subscribers/pipeline-transitions.ts`
- Create: `artifacts/api-server/src/lib/subscribers/pipeline-transitions.test.ts`
- Modify: `artifacts/api-server/src/lib/subscribers/index.ts` (register)

**Interfaces:**
- Consumes: `dealEvents` from `../events`; `pipelineTransitions`, `pipelineStages`, `enterpriseDeals` from `@workspace/db`; `computeTransitionType` from `@workspace/engine`.
- Produces: `registerPipelineTransitions(): () => void`; helper `recordTransition(args)`.

- [ ] **Step 1: Write failing test**

```ts
import { describe, it, expect, beforeEach } from "vitest";
import { db, pipelineTransitions, enterpriseDeals } from "@workspace/db";
import { eq } from "drizzle-orm";
import { recordTransition } from "./pipeline-transitions";

describe("recordTransition", () => {
  it("writes a forward transition row with residence days", async () => {
    // assumes a seeded deal; pick the first active deal
    const [deal] = await db.select({ id: enterpriseDeals.id }).from(enterpriseDeals).limit(1);
    await recordTransition({
      dealId: deal.id, fromStageId: 1, toStageId: 2, overridden: false,
      actor: "test", at: new Date("2026-03-01T00:00:00Z"),
    });
    const rows = await db.select().from(pipelineTransitions).where(eq(pipelineTransitions.dealId, deal.id));
    const row = rows.find((r) => r.transitionedAt.toISOString().startsWith("2026-03-01"));
    expect(row?.transitionType).toBe("forward");
  });
});
```

- [ ] **Step 2: Run, verify fail**

Run: `pnpm --filter @workspace/api-server exec vitest run src/lib/subscribers/pipeline-transitions.test.ts`
Expected: FAIL — `recordTransition` not defined.

- [ ] **Step 3: Implement the subscriber**

```ts
import { and, desc, eq, isNull } from "drizzle-orm";
import {
  db, pipelineTransitions, pipelineStages, enterpriseDeals, dealSnapshots,
} from "@workspace/db";
import { computeTransitionType, type StageDef } from "@workspace/engine";
import { dealEvents } from "../events";
import { logger } from "../logger";

async function loadStages(): Promise<StageDef[]> {
  const rows = await db.select().from(pipelineStages);
  return rows.map((s) => ({
    id: s.id,
    name: s.stageName,
    sortOrder: s.sortOrder,
    terminal: s.stageName === "Closed-Won" ? "won" : s.stageName === "Closed-Lost" ? "lost" : undefined,
  }));
}

export async function recordTransition(args: {
  dealId: string;
  fromStageId: number | null;
  toStageId: number;
  overridden: boolean;
  actor: string;
  at?: Date;
}): Promise<void> {
  const stages = await loadStages();
  const fromStage = args.fromStageId != null ? stages.find((s) => s.id === args.fromStageId) : null;
  const toStage = stages.find((s) => s.id === args.toStageId);
  if (!toStage) return;
  const type = computeTransitionType(fromStage?.sortOrder ?? null, toStage);
  const at = args.at ?? new Date();

  // Residence in the stage being left = now − last transition INTO that stage (or deal creation).
  let daysInFromStage: number | null = null;
  if (args.fromStageId != null) {
    const [prev] = await db
      .select({ at: pipelineTransitions.transitionedAt })
      .from(pipelineTransitions)
      .where(eq(pipelineTransitions.dealId, args.dealId))
      .orderBy(desc(pipelineTransitions.transitionedAt))
      .limit(1);
    const since = prev?.at ?? null;
    if (since) daysInFromStage = Math.max(0, Math.round((at.getTime() - new Date(since).getTime()) / 86_400_000));
  }

  const [deal] = await db
    .select({ tcv: enterpriseDeals.normalizedTcv })
    .from(enterpriseDeals)
    .where(eq(enterpriseDeals.id, args.dealId));

  await db
    .insert(pipelineTransitions)
    .values({
      dealId: args.dealId,
      fromStageId: args.fromStageId,
      toStageId: args.toStageId,
      transitionType: type,
      tcvAtTransition: deal?.tcv ?? null,
      daysInFromStage,
      overridden: args.overridden,
      transitionedAt: at,
      createdBy: args.actor,
    })
    .onConflictDoNothing({ target: [pipelineTransitions.dealId, pipelineTransitions.transitionedAt] });
}

export function registerPipelineTransitions(): () => void {
  return dealEvents.on(async (event) => {
    try {
      if (event.type === "deal.stage_changed") {
        await recordTransition({
          dealId: event.dealId,
          fromStageId: event.fromStageId,
          toStageId: event.toStageId,
          overridden: event.overridden,
          actor: event.actor,
          at: event.occurredAt,
        });
      }
    } catch (err) {
      logger.error({ err, event: event.type }, "pipeline-transitions subscriber failed");
    }
  });
}
```

> Note: `enterpriseDeals.normalizedTcv` — confirm the exact column name with `grep -n "normalized" lib/db/src/schema/deals.ts`; if it is computed rather than stored, substitute the stored TCV column or compute via the existing intelligence helper. Adjust the select accordingly.

- [ ] **Step 4: Register in `subscribers/index.ts`**

Add import + call alongside the others:

```ts
import { registerPipelineTransitions } from "./pipeline-transitions";
// ... inside the start function where other register*() are pushed to disposers:
disposers.push(registerPipelineTransitions());
```

- [ ] **Step 5: Run test, verify PASS**

Run: `pnpm --filter @workspace/api-server exec vitest run src/lib/subscribers/pipeline-transitions.test.ts`
Expected: PASS.

- [ ] **Step 6: Typecheck + commit**

Run: `pnpm run typecheck` → PASS

```bash
git add artifacts/api-server/src/lib/subscribers/pipeline-transitions.ts artifacts/api-server/src/lib/subscribers/pipeline-transitions.test.ts artifacts/api-server/src/lib/subscribers/index.ts
git commit -m "feat(api): pipeline-transitions event subscriber"
```

---

### Task 9: Backfill script

**Files:**
- Create: `scripts/backfill-pipeline-transitions.ts`
- Modify: `scripts/package.json` (add a `backfill:transitions` script if scripts pkg uses one) — otherwise document the `tsx` invocation.

**Interfaces:**
- Consumes: `dealSnapshots`, `pipelineTransitions`, `pipelineStages`, `enterpriseDeals` from `@workspace/db`; `computeTransitionType`.
- Produces: rows in `pipeline_transitions` reconstructed from snapshot history. Idempotent.

- [ ] **Step 1: Implement the script**

```ts
import { and, asc, isNull } from "drizzle-orm";
import {
  db, dealSnapshots, pipelineTransitions, pipelineStages, enterpriseDeals,
} from "@workspace/db";
import { computeTransitionType, type StageDef } from "@workspace/engine";

async function main() {
  const stageRows = await db.select().from(pipelineStages);
  const stages: StageDef[] = stageRows.map((s) => ({
    id: s.id, name: s.stageName, sortOrder: s.sortOrder,
    terminal: s.stageName === "Closed-Won" ? "won" : s.stageName === "Closed-Lost" ? "lost" : undefined,
  }));
  const orderById = new Map(stages.map((s) => [s.id, s.sortOrder]));

  const deals = await db.select({ id: enterpriseDeals.id, createdAt: enterpriseDeals.createdAt }).from(enterpriseDeals);
  let inserted = 0;

  for (const deal of deals) {
    const snaps = await db
      .select({
        stageId: dealSnapshots.salesStageId,
        tcv: dealSnapshots.normalizedTcv,
        at: dealSnapshots.createdAt,
        by: dealSnapshots.createdBy,
      })
      .from(dealSnapshots)
      .where(and(/* deal filter */))
      .orderBy(asc(dealSnapshots.createdAt));

    // NOTE: add `eq(dealSnapshots.dealId, deal.id)` to the where above.
    let prevStageId: number | null = null;
    let prevAt: Date | null = deal.createdAt ? new Date(deal.createdAt) : null;

    for (const snap of snaps) {
      if (snap.stageId == null) continue;
      if (snap.stageId === prevStageId) continue; // de-dup consecutive equal stages
      const toStage = stages.find((s) => s.id === snap.stageId);
      if (!toStage) continue;
      const type = computeTransitionType(prevStageId != null ? orderById.get(prevStageId)! : null, toStage);
      const at = new Date(snap.at);
      const days = prevAt ? Math.max(0, Math.round((at.getTime() - prevAt.getTime()) / 86_400_000)) : null;

      await db
        .insert(pipelineTransitions)
        .values({
          dealId: deal.id, fromStageId: prevStageId, toStageId: snap.stageId,
          transitionType: type, tcvAtTransition: snap.tcv ?? null,
          daysInFromStage: prevStageId != null ? days : null,
          overridden: false, transitionedAt: at, createdBy: snap.by ?? "backfill",
        })
        .onConflictDoNothing({ target: [pipelineTransitions.dealId, pipelineTransitions.transitionedAt] });
      inserted++;
      prevStageId = snap.stageId;
      prevAt = at;
    }
  }
  console.log(`Backfill complete: ${inserted} transition rows processed.`);
  process.exit(0);
}

main().catch((e) => { console.error(e); process.exit(1); });
```

> Fix the `.where(and(/* deal filter */))` to `eq(dealSnapshots.dealId, deal.id)` (import `eq`). Confirm `dealSnapshots.createdBy` exists (it does per schema). Confirm `enterpriseDeals.createdAt` column name via grep.

- [ ] **Step 2: Run the backfill against local DB**

Run: `pnpm --filter @workspace/scripts exec tsx ../../scripts/backfill-pipeline-transitions.ts` (or the repo's standard `tsx` runner; see `scripts/package.json`).
Expected: `Backfill complete: N transition rows processed.` Re-run → same row count (idempotent, `ON CONFLICT DO NOTHING`).

- [ ] **Step 3: Verify rows exist**

Run: `psql "$env:DATABASE_URL" -c "SELECT transition_type, count(*) FROM edc_v2.pipeline_transitions GROUP BY 1;"`
Expected: a small table of counts.

- [ ] **Step 4: Commit**

```bash
git add scripts/backfill-pipeline-transitions.ts scripts/package.json
git commit -m "feat(scripts): backfill pipeline_transitions from snapshots"
```

---

### Task 10: API — `/v2/analytics/flow/*` endpoints

**Files:**
- Modify: `artifacts/api-server/src/routes/v2/analytics.ts` (append 6 GET routes + helpers)

**Interfaces:**
- Consumes: engine flow functions; `pipelineTransitions`, `pipelineStages`, `enterpriseDeals`, `dealScores`, `pipelineTargets` from `@workspace/db`.
- Produces: JSON `{ data: ... }` (loose `GenericDataResponse`) for funnel, conversion-matrix, sankey, recycle, health-score, coverage.

- [ ] **Step 1: Add a shared loader + the funnel route**

At the top helpers section of `analytics.ts`, add:

```ts
import {
  computeFunnel, computeConversionMatrix, computeSankeyFlows, computeRecycleExit,
  computeCoverage, computeHealthScore, type StageDef, type TransitionRec, type OpenDeal,
} from "@workspace/engine";
import { pipelineTransitions, pipelineTargets, pipelineStages as stagesTable } from "@workspace/db";

async function loadFlowStages(): Promise<StageDef[]> {
  const rows = await db.select().from(stagesTable);
  return rows.map((s) => ({
    id: s.id, name: s.stageName, sortOrder: s.sortOrder,
    terminal: s.stageName === "Closed-Won" ? "won" : s.stageName === "Closed-Lost" ? "lost" : undefined,
  }));
}

async function loadTransitions(): Promise<TransitionRec[]> {
  const rows = await db.select().from(pipelineTransitions).orderBy(asc(pipelineTransitions.transitionedAt));
  return rows.map((r) => ({
    dealId: r.dealId, fromStageId: r.fromStageId, toStageId: r.toStageId,
    transitionType: r.transitionType as TransitionRec["transitionType"],
    tcv: Number(r.tcvAtTransition ?? 0),
    daysInFromStage: r.daysInFromStage, transitionedAt: new Date(r.transitionedAt).toISOString(),
  }));
}

async function loadOpenDeals(): Promise<OpenDeal[]> {
  const rows = await db
    .select({
      id: enterpriseDeals.id, stageId: enterpriseDeals.salesStageId,
      tcv: enterpriseDeals.normalizedTcv, wp: enterpriseDeals.winProbabilityPct,
      createdAt: enterpriseDeals.createdAt,
    })
    .from(enterpriseDeals)
    .where(activeFilter);
  // AI win-prob from latest deal_scores per deal (optional join; null if unscored).
  const scores = await db.select({ dealId: dealScores.dealId, p: dealScores.winProbability }).from(dealScores);
  const aiByDeal = new Map(scores.map((s) => [s.dealId, s.p == null ? null : Number(s.p)]));
  return rows.map((r) => ({
    id: r.id, stageId: r.stageId ?? 0, tcv: Number(r.tcv ?? 0),
    winProbabilityPct: r.wp == null ? null : Number(r.wp),
    aiWinProbability: aiByDeal.get(r.id) ?? null,
    createdAt: r.createdAt ? new Date(r.createdAt).toISOString() : new Date().toISOString(),
  }));
}

router.get("/analytics/flow/funnel", async (_req: Request, res: Response) => {
  const [stages, deals, transitions] = await Promise.all([loadFlowStages(), loadOpenDeals(), loadTransitions()]);
  res.json({ data: computeFunnel(deals, transitions, stages) });
});
```

> Confirm column names by grep: `salesStageId`, `normalizedTcv`, `winProbabilityPct`, `createdAt` on `enterpriseDeals`; `winProbability` on `dealScores`. Adjust if a column is named differently.

- [ ] **Step 2: Add the remaining five routes**

```ts
router.get("/analytics/flow/conversion-matrix", async (req: Request, res: Response) => {
  const windowDays = Math.max(1, Math.min(365, Number(req.query.windowDays ?? 90)));
  const [stages, transitions] = await Promise.all([loadFlowStages(), loadTransitions()]);
  res.json({ data: computeConversionMatrix(transitions, stages, windowDays, new Date().toISOString()) });
});

router.get("/analytics/flow/sankey", async (req: Request, res: Response) => {
  const mode = req.query.mode === "value" ? "value" : "count";
  const [stages, transitions] = await Promise.all([loadFlowStages(), loadTransitions()]);
  res.json({ data: computeSankeyFlows(transitions, stages, mode) });
});

router.get("/analytics/flow/recycle", async (_req: Request, res: Response) => {
  const [stages, transitions] = await Promise.all([loadFlowStages(), loadTransitions()]);
  res.json({ data: computeRecycleExit(transitions, stages) });
});

function activeQuarterStart(now = new Date()): string {
  const q = Math.floor(now.getUTCMonth() / 3);
  return new Date(Date.UTC(now.getUTCFullYear(), q * 3, 1)).toISOString().slice(0, 10);
}

router.get("/analytics/flow/coverage", async (_req: Request, res: Response) => {
  const [stages, deals] = await Promise.all([loadFlowStages(), loadOpenDeals()]);
  const periodStart = activeQuarterStart();
  const [tgt] = await db.select().from(pipelineTargets).where(eq(pipelineTargets.periodStart, periodStart));
  const target = tgt ? Number(tgt.targetValue) : null;
  res.json({ data: computeCoverage(deals, stages, target, periodStart) });
});

router.get("/analytics/flow/health-score", async (_req: Request, res: Response) => {
  const [stages, deals, transitions] = await Promise.all([loadFlowStages(), loadOpenDeals(), loadTransitions()]);
  const periodStart = activeQuarterStart();
  const [tgt] = await db.select().from(pipelineTargets).where(eq(pipelineTargets.periodStart, periodStart));
  const target = tgt ? Number(tgt.targetValue) : null;
  const coverage = computeCoverage(deals, stages, target, periodStart);
  const recycle = computeRecycleExit(transitions, stages);
  // Lightweight current-period inputs; history left empty → neutral 50 baseline until snapshots accrue.
  const winExits = transitions.filter((t) => t.transitionType === "exit_won").length;
  const lossExits = transitions.filter((t) => t.transitionType === "exit_lost").length;
  const winRate = winExits + lossExits > 0 ? winExits / (winExits + lossExits) : 0;
  const avgResidence =
    transitions.filter((t) => t.daysInFromStage != null).reduce((s, t) => s + (t.daysInFromStage ?? 0), 0) /
      Math.max(1, transitions.filter((t) => t.daysInFromStage != null).length);
  const inputs = {
    coverageQualified: coverage.qualified,
    velocityIndex: Math.round(avgResidence),
    winRate,
    generationRatio: coverage.netNew,
    agingScore: Math.round(avgResidence),
    retentionRate: 1 - recycle.overallRecycleRate / 100,
  };
  const history = { coverage: [], velocity: [], conversion: [], generation: [], age: [], attrition: [] };
  res.json({ data: { ...computeHealthScore(inputs, history), coverage } });
});
```

- [ ] **Step 3: Build + smoke-test the server**

Run: `pnpm --filter @workspace/api-server run dev` (starts on :5000; rebuilds via esbuild)
Then in another shell (after login cookie, or via the existing smoke harness):
Run: `curl -s http://localhost:5000/api/v2/analytics/flow/funnel -H "Cookie: <session>" | head`
Expected: `{"data":[{"stageId":1,...}]}` shape.

- [ ] **Step 4: Typecheck + commit**

Run: `pnpm run typecheck` → PASS

```bash
git add artifacts/api-server/src/routes/v2/analytics.ts
git commit -m "feat(api): pipeline flow analytics endpoints"
```

---

### Task 11: API — targets GET/PUT (typed, OpenAPI + codegen)

**Files:**
- Modify: `lib/api-spec/openapi.yaml` (add 2 paths + schemas)
- Modify: `artifacts/api-server/src/routes/v2/config.ts` (implement)
- Regenerate: `lib/api-zod`, `lib/api-client-react` (Orval)

**Interfaces:**
- Produces: `GET /api/v2/config/targets` → `{ data: PipelineTarget[] }`; `PUT /api/v2/config/targets` body `{ periodStart, targetValue, periodType? }` → `{ data: PipelineTarget }`. Generated hooks `useListPipelineTargets`, `useUpsertPipelineTarget`.

- [ ] **Step 1: Add OpenAPI paths + schemas** to `openapi.yaml` (follow existing path/schema style; do not change `info.title`):

```yaml
  /v2/config/targets:
    get:
      operationId: listPipelineTargets
      tags: [config]
      responses:
        "200":
          description: List of period targets
          content:
            application/json:
              schema:
                type: object
                properties:
                  data:
                    type: array
                    items: { $ref: "#/components/schemas/PipelineTarget" }
    put:
      operationId: upsertPipelineTarget
      tags: [config]
      requestBody:
        required: true
        content:
          application/json:
            schema: { $ref: "#/components/schemas/PipelineTargetInput" }
      responses:
        "200":
          description: Upserted target
          content:
            application/json:
              schema:
                type: object
                properties:
                  data: { $ref: "#/components/schemas/PipelineTarget" }
```

Add to `components.schemas`:

```yaml
    PipelineTarget:
      type: object
      required: [id, periodType, periodStart, targetValue]
      properties:
        id: { type: string, format: uuid }
        periodType: { type: string }
        periodStart: { type: string, format: date }
        targetValue: { type: number }
    PipelineTargetInput:
      type: object
      required: [periodStart, targetValue]
      properties:
        periodType: { type: string, default: quarter }
        periodStart: { type: string, format: date }
        targetValue: { type: number }
```

- [ ] **Step 2: Regenerate the client/zod**

Run: `pnpm --filter @workspace/api-spec run codegen`
Expected: new `ListPipelineTargets*` / `UpsertPipelineTarget*` symbols in `lib/api-zod` and `lib/api-client-react`.

- [ ] **Step 3: Implement routes in `config.ts`**

```ts
import { pipelineTargets } from "@workspace/db";
import { UpsertPipelineTargetBody } from "@workspace/api-zod";
import { desc, eq } from "drizzle-orm";

router.get("/config/targets", async (_req, res) => {
  const rows = await db.select().from(pipelineTargets).orderBy(desc(pipelineTargets.periodStart));
  res.json({ data: rows.map((r) => ({ id: r.id, periodType: r.periodType, periodStart: r.periodStart, targetValue: Number(r.targetValue) })) });
});

router.put("/config/targets", async (req, res) => {
  const body = UpsertPipelineTargetBody.parse(req.body);
  const [row] = await db
    .insert(pipelineTargets)
    .values({ periodType: body.periodType ?? "quarter", periodStart: body.periodStart, targetValue: String(body.targetValue), updatedAt: new Date() })
    .onConflictDoUpdate({
      target: [pipelineTargets.periodType, pipelineTargets.periodStart],
      set: { targetValue: String(body.targetValue), updatedAt: new Date() },
    })
    .returning();
  res.json({ data: { id: row.id, periodType: row.periodType, periodStart: row.periodStart, targetValue: Number(row.targetValue) } });
});
```

> Confirm the generated body symbol name (`UpsertPipelineTargetBody` vs `UpsertPipelineTargetBodyItem`) after codegen and import the actual name.

- [ ] **Step 4: Smoke test**

Run server; `curl -X PUT .../api/v2/config/targets -d '{"periodStart":"2026-07-01","targetValue":5000000}' -H 'Content-Type: application/json' -H 'Cookie: <session>'`
Expected: `{"data":{"id":...,"targetValue":5000000}}`.

- [ ] **Step 5: Typecheck + commit**

Run: `pnpm run typecheck` → PASS

```bash
git add lib/api-spec/openapi.yaml lib/api-zod lib/api-client-react artifacts/api-server/src/routes/v2/config.ts
git commit -m "feat(api): period targets CRUD"
```

---

### Task 12: Frontend — Settings "Targets" tab

**Files:**
- Create: `artifacts/edc/src/components/settings/targets-settings.tsx`
- Modify: `artifacts/edc/src/pages/settings.tsx` (add tab trigger + content)

**Interfaces:**
- Consumes: `useListPipelineTargets`, `useUpsertPipelineTarget` (generated).
- Produces: `<TargetsSettings />`.

- [ ] **Step 1: Implement the component**

```tsx
import { useState } from "react";
import { useListPipelineTargets, useUpsertPipelineTarget } from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

function quarterStart(d = new Date()): string {
  const q = Math.floor(d.getMonth() / 3);
  return new Date(d.getFullYear(), q * 3, 1).toISOString().slice(0, 10);
}

export function TargetsSettings() {
  const { data, refetch } = useListPipelineTargets();
  const upsert = useUpsertPipelineTarget();
  const [period, setPeriod] = useState(quarterStart());
  const [value, setValue] = useState("");
  const targets = (data?.data ?? []) as { id: string; periodStart: string; targetValue: number }[];

  return (
    <Card>
      <CardHeader><CardTitle>Quarterly Pipeline Targets</CardTitle></CardHeader>
      <CardContent className="space-y-4">
        <div className="flex items-end gap-3">
          <div>
            <label className="text-xs text-muted-foreground uppercase tracking-wider">Quarter start</label>
            <Input type="date" value={period} onChange={(e) => setPeriod(e.target.value)} />
          </div>
          <div>
            <label className="text-xs text-muted-foreground uppercase tracking-wider">Target (USD)</label>
            <Input type="number" value={value} onChange={(e) => setValue(e.target.value)} placeholder="5000000" />
          </div>
          <Button
            disabled={!value}
            onClick={async () => {
              await upsert.mutateAsync({ data: { periodStart: period, targetValue: Number(value) } });
              setValue("");
              refetch();
            }}
          >Save</Button>
        </div>
        <div className="space-y-1">
          {targets.map((t) => (
            <div key={t.id} className="flex justify-between text-sm tabular-nums border-b border-border py-1">
              <span>{t.periodStart}</span>
              <span className="font-mono">${t.targetValue.toLocaleString("en-US")}</span>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
```

> Confirm the mutation call shape (`mutateAsync({ data: {...} })`) against a sibling generated mutation in the codebase (e.g. `useCreateCompetitor`) and match it.

- [ ] **Step 2: Wire into `settings.tsx`** — add `<TabsTrigger value="targets">Targets</TabsTrigger>` and:

```tsx
<TabsContent value="targets" className="pt-4">
  <TargetsSettings />
</TabsContent>
```

- [ ] **Step 3: Typecheck + commit**

Run: `pnpm run typecheck` → PASS

```bash
git add artifacts/edc/src/components/settings/targets-settings.tsx artifacts/edc/src/pages/settings.tsx
git commit -m "feat(ui): pipeline targets settings tab"
```

---

### Task 13: Frontend — flow data hooks + Pulse + Coverage

**Files:**
- Create: `artifacts/edc/src/components/cockpit/flow/use-flow.ts`
- Create: `artifacts/edc/src/components/cockpit/flow/pipeline-pulse.tsx`
- Create: `artifacts/edc/src/components/cockpit/flow/coverage-tracker.tsx`

**Interfaces:**
- Produces: hooks `useFlowFunnel`, `useFlowConversionMatrix`, `useFlowSankey`, `useFlowRecycle`, `useFlowHealthScore`, `useFlowCoverage`; components `<PipelinePulse />`, `<CoverageTracker />`.

- [ ] **Step 1: Implement the hooks** (mirror dashboard aggregation hooks — hand-written `useQuery` against the loose contract)

```ts
import { useQuery } from "@tanstack/react-query";

const API = "/api/v2/analytics/flow";
async function getJson<T>(path: string): Promise<T> {
  const res = await fetch(`${API}${path}`, { credentials: "include" });
  if (!res.ok) throw new Error(`flow ${path} ${res.status}`);
  return (await res.json()).data as T;
}

export const useFlowFunnel = () => useQuery({ queryKey: ["flow", "funnel"], queryFn: () => getJson("/funnel") });
export const useFlowConversionMatrix = (windowDays = 90) =>
  useQuery({ queryKey: ["flow", "matrix", windowDays], queryFn: () => getJson(`/conversion-matrix?windowDays=${windowDays}`) });
export const useFlowSankey = (mode: "count" | "value" = "count") =>
  useQuery({ queryKey: ["flow", "sankey", mode], queryFn: () => getJson(`/sankey?mode=${mode}`) });
export const useFlowRecycle = () => useQuery({ queryKey: ["flow", "recycle"], queryFn: () => getJson("/recycle") });
export const useFlowHealthScore = () => useQuery({ queryKey: ["flow", "health"], queryFn: () => getJson("/health-score") });
export const useFlowCoverage = () => useQuery({ queryKey: ["flow", "coverage"], queryFn: () => getJson("/coverage") });
```

> Confirm the app's base path/proxy — if the dashboard hooks call a shared `apiFetch` helper, use that instead of bare `fetch` to inherit auth + base URL handling.

- [ ] **Step 2: Implement `pipeline-pulse.tsx`** (SVG radial gauge + sub-score bars; semantic colors)

```tsx
import { useFlowHealthScore } from "./use-flow";

const COLORS = (n: number) => (n >= 80 ? "text-emerald-500" : n >= 60 ? "text-amber-500" : n >= 40 ? "text-orange-500" : "text-red-500");
const FILL = (n: number) => (n >= 80 ? "stroke-emerald-500" : n >= 60 ? "stroke-amber-500" : n >= 40 ? "stroke-orange-500" : "stroke-red-500");

export function PipelinePulse() {
  const { data, isLoading } = useFlowHealthScore() as { data?: { score: number; subScores: Record<string, number | null> }; isLoading: boolean };
  if (isLoading || !data) return <div className="bg-card border border-border rounded-lg p-6 h-64 animate-pulse" />;
  const { score, subScores } = data;
  const r = 70, c = 2 * Math.PI * r, arc = (270 / 360) * c, filled = (score / 100) * arc;
  return (
    <div className="bg-card border border-border rounded-lg p-6 flex flex-col items-center">
      <svg viewBox="0 0 180 180" className="w-48 h-48">
        <circle cx="90" cy="90" r={r} fill="none" className="stroke-muted/20" strokeWidth="12"
          strokeDasharray={`${arc} ${c}`} strokeLinecap="round" transform="rotate(135 90 90)" />
        <circle cx="90" cy="90" r={r} fill="none" className={FILL(score)} strokeWidth="12"
          strokeDasharray={`${filled} ${c}`} strokeLinecap="round" transform="rotate(135 90 90)"
          style={{ transition: "stroke-dasharray 800ms ease-out" }} />
        <text x="90" y="98" textAnchor="middle" className={`fill-current ${COLORS(score)} font-mono text-4xl font-bold`}>{score}</text>
      </svg>
      <div className="text-xs text-muted-foreground uppercase tracking-wider mt-2">Pipeline Pulse</div>
      <div className="w-full mt-4 space-y-1.5">
        {Object.entries(subScores).map(([k, v]) => (
          <div key={k} className="flex items-center gap-2">
            <span className="text-xs text-muted-foreground w-20 capitalize">{k}</span>
            <div className="flex-1 h-1.5 rounded-full bg-muted/30">
              {v != null && <div className={`h-1.5 rounded-full ${FILL(v).replace("stroke", "bg")}`} style={{ width: `${v}%` }} />}
            </div>
            <span className="text-xs font-mono w-8 text-right">{v ?? "—"}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Implement `coverage-tracker.tsx`** (card row)

```tsx
import { useFlowCoverage } from "./use-flow";

const RATIOS: { key: string; label: string }[] = [
  { key: "total", label: "Total" }, { key: "qualified", label: "Qualified" },
  { key: "weighted", label: "Weighted" }, { key: "aiAdjusted", label: "AI-Adjusted" },
  { key: "netNew", label: "Net-New" },
];
const tone = (r: number | null) => (r == null ? "text-muted-foreground" : r >= 3 ? "text-emerald-500" : r >= 2 ? "text-amber-500" : "text-red-500");

export function CoverageTracker() {
  const { data } = useFlowCoverage() as { data?: Record<string, number | null> & { caveats?: string[] } };
  return (
    <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-5 gap-4">
      {RATIOS.map((m) => {
        const v = data?.[m.key] as number | null | undefined;
        return (
          <div key={m.key} className="bg-card border border-border rounded-lg p-4 shadow-sm">
            <div className="text-xs text-muted-foreground uppercase tracking-wider">{m.label}</div>
            <div className={`text-3xl font-bold font-mono mt-1 ${tone(v ?? null)}`}>{v == null ? "—" : `${v.toFixed(2)}x`}</div>
          </div>
        );
      })}
    </div>
  );
}
```

- [ ] **Step 4: Typecheck + commit**

Run: `pnpm run typecheck` → PASS

```bash
git add artifacts/edc/src/components/cockpit/flow/
git commit -m "feat(ui): flow hooks, pipeline pulse, coverage tracker"
```

---

### Task 14: Frontend — Funnel + Conversion Matrix

**Files:**
- Create: `artifacts/edc/src/components/cockpit/flow/pipeline-funnel.tsx`
- Create: `artifacts/edc/src/components/cockpit/flow/conversion-matrix.tsx`

- [ ] **Step 1: Implement `pipeline-funnel.tsx`** (stacked horizontal bars, count/value toggle)

```tsx
import { useState } from "react";
import { useFlowFunnel } from "./use-flow";

type Row = { stageId: number; stageName: string; dealCount: number; totalValue: number; convToNextPct: number | null; pctOfPipeline: number; avgDaysInStage: number | null };

export function PipelineFunnel() {
  const { data } = useFlowFunnel() as { data?: Row[] };
  const [mode, setMode] = useState<"count" | "value">("value");
  const rows = data ?? [];
  const max = Math.max(1, ...rows.map((r) => (mode === "value" ? r.totalValue : r.dealCount)));
  return (
    <div className="bg-card border border-border rounded-lg p-6">
      <div className="flex justify-between items-center mb-4">
        <h3 className="text-sm font-semibold">Pipeline Funnel</h3>
        <button className="text-xs text-muted-foreground underline" onClick={() => setMode(mode === "value" ? "count" : "value")}>
          {mode === "value" ? "Show count" : "Show value"}
        </button>
      </div>
      <div className="space-y-3">
        {rows.map((r) => {
          const v = mode === "value" ? r.totalValue : r.dealCount;
          return (
            <div key={r.stageId}>
              <div className="flex justify-between text-xs text-muted-foreground mb-1">
                <span>{r.stageName}</span>
                <span className="font-mono">{mode === "value" ? `$${r.totalValue.toLocaleString("en-US")}` : `${r.dealCount} deals`}{r.convToNextPct != null && ` · ${r.convToNextPct}%→`}</span>
              </div>
              <div className="h-10 rounded-md bg-primary/80" style={{ width: `${(v / max) * 100}%`, minWidth: "2rem", transition: "width 400ms ease-out" }} />
            </div>
          );
        })}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Implement `conversion-matrix.tsx`** (color-coded grid)

```tsx
import { useFlowConversionMatrix } from "./use-flow";

type Cell = { fromId: number; toId: number; rate: number; n: number; kind: "forward" | "stagnation" | "regression"; significant: boolean };

const bg = (c: Cell) => {
  if (c.n === 0) return "bg-transparent";
  const a = Math.min(40, 10 + c.rate / 3);
  if (c.kind === "forward") return `bg-emerald-500/[0.${Math.round(a)}]`;
  if (c.kind === "stagnation") return `bg-amber-500/[0.${Math.round(a)}]`;
  return `bg-red-500/[0.${Math.round(a)}]`;
};

export function ConversionMatrix() {
  const { data } = useFlowConversionMatrix() as { data?: Cell[][] };
  const matrix = data ?? [];
  if (matrix.length === 0) return <div className="bg-card border border-border rounded-lg p-6 text-sm text-muted-foreground">No transition data yet.</div>;
  const ids = matrix.map((row) => row[0]?.fromId);
  return (
    <div className="bg-card border border-border rounded-lg p-6 overflow-x-auto">
      <h3 className="text-sm font-semibold mb-4">Conversion Matrix</h3>
      <table className="text-sm">
        <tbody>
          {matrix.map((row, i) => (
            <tr key={i}>
              {row.map((cell) => (
                <td key={cell.toId} className={`h-11 min-w-[64px] text-center font-mono tabular-nums border border-border/40 ${bg(cell)} ${cell.significant ? "ring-1 ring-primary/30" : ""}`}>
                  {cell.n > 0 ? `${cell.rate}%` : "—"}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
```

> Tailwind can't compute dynamic opacity classes at runtime via string interpolation (`bg-emerald-500/[0.${a}]` won't be in the JIT safelist). Replace the `bg()` helper with inline `style={{ backgroundColor }}` using rgba, OR a fixed set of bucket classes added to a safelist. Implementer: use the inline-style approach (compute `rgba(16,185,129,${a/100})` etc.) to avoid JIT issues.

- [ ] **Step 3: Typecheck + commit**

Run: `pnpm run typecheck` → PASS

```bash
git add artifacts/edc/src/components/cockpit/flow/pipeline-funnel.tsx artifacts/edc/src/components/cockpit/flow/conversion-matrix.tsx
git commit -m "feat(ui): pipeline funnel and conversion matrix"
```

---

### Task 15: Frontend — Sankey + Recycle/Exit

**Files:**
- Create: `artifacts/edc/src/components/cockpit/flow/transition-sankey.tsx`
- Create: `artifacts/edc/src/components/cockpit/flow/recycle-exit.tsx`

- [ ] **Step 1: Implement `transition-sankey.tsx`** using recharts `Sankey`

```tsx
import { Sankey, Tooltip } from "recharts";
import { useFlowSankey } from "./use-flow";

type Data = { nodes: { id: string; label: string }[]; links: { source: string; target: string; value: number }[] };

export function TransitionSankey() {
  const { data } = useFlowSankey("count") as { data?: Data };
  if (!data || data.nodes.length === 0) return <div className="bg-card border border-border rounded-lg p-6 text-sm text-muted-foreground">No transitions yet.</div>;
  // recharts Sankey expects node objects + links with numeric source/target indexes.
  const idx = new Map(data.nodes.map((n, i) => [n.id, i]));
  const nodes = data.nodes.map((n) => ({ name: n.label }));
  const links = data.links
    .map((l) => ({ source: idx.get(l.source)!, target: idx.get(l.target)!, value: l.value }))
    .filter((l) => l.source != null && l.target != null && l.source !== l.target);
  return (
    <div className="bg-card border border-border rounded-lg p-4">
      <h3 className="text-sm font-semibold mb-4">Stage Transitions</h3>
      <Sankey width={760} height={360} data={{ nodes, links }} nodePadding={24} link={{ stroke: "var(--muted-foreground)" }}>
        <Tooltip />
      </Sankey>
    </div>
  );
}
```

> recharts Sankey rejects self-links and cycles; the `.filter(l.source !== l.target)` drops stagnation self-loops. If recharts can't render the backward/exit topology cleanly, fall back to a custom D3 sankey (d3-sankey is acceptable per the PRD stack). Keep the width responsive via a `ResponsiveContainer` if the sibling charts use one.

- [ ] **Step 2: Implement `recycle-exit.tsx`** (waterfall + exit-by-stage table)

```tsx
import { useFlowRecycle } from "./use-flow";

type Data = {
  overallRecycleRate: number;
  exitRateByStage: Record<number, number>;
  recycleRateByStage: Record<number, number>;
  waterfall: { label: string; delta: number; kind: string }[];
};

export function RecycleExit() {
  const { data } = useFlowRecycle() as { data?: Data };
  if (!data) return <div className="bg-card border border-border rounded-lg p-6 h-48 animate-pulse" />;
  return (
    <div className="bg-card border border-border rounded-lg p-6 space-y-4">
      <h3 className="text-sm font-semibold">Recycle &amp; Exit</h3>
      <div className="text-xs text-muted-foreground uppercase tracking-wider">Overall recycle rate</div>
      <div className="text-3xl font-bold font-mono">{data.overallRecycleRate}%</div>
      <div className="space-y-1">
        {data.waterfall.map((w) => (
          <div key={w.label} className="flex justify-between text-sm tabular-nums">
            <span>{w.label}</span>
            <span className={`font-mono ${w.delta < 0 ? "text-red-500" : "text-emerald-500"}`}>
              {w.delta < 0 ? "-" : "+"}${Math.abs(w.delta).toLocaleString("en-US")}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Typecheck + commit**

Run: `pnpm run typecheck` → PASS

```bash
git add artifacts/edc/src/components/cockpit/flow/transition-sankey.tsx artifacts/edc/src/components/cockpit/flow/recycle-exit.tsx
git commit -m "feat(ui): transition sankey and recycle/exit"
```

---

### Task 16: Frontend — assemble Flow module + convert `/analytics` to tabs

**Files:**
- Create: `artifacts/edc/src/components/cockpit/flow/flow-analytics.tsx`
- Create: `artifacts/edc/src/pages/analytics-overview.tsx` (existing analytics body moved here verbatim)
- Modify: `artifacts/edc/src/pages/analytics.tsx` (tabbed shell)

**Interfaces:**
- Produces: `<FlowAnalytics />`, `<AnalyticsOverview />`, tabbed `Analytics` page.

- [ ] **Step 1: Move existing analytics body into `analytics-overview.tsx`**

Cut the current default-export body of `analytics.tsx` into a new `AnalyticsOverview` component in `analytics-overview.tsx` (keep all imports/logic identical — this is a pure move, zero behavior change). Export `export function AnalyticsOverview() { ... }`.

- [ ] **Step 2: Implement `flow-analytics.tsx`**

```tsx
import { PipelinePulse } from "./pipeline-pulse";
import { CoverageTracker } from "./coverage-tracker";
import { PipelineFunnel } from "./pipeline-funnel";
import { ConversionMatrix } from "./conversion-matrix";
import { TransitionSankey } from "./transition-sankey";
import { RecycleExit } from "./recycle-exit";

export function FlowAnalytics() {
  return (
    <div className="space-y-8">
      <div className="grid grid-cols-1 lg:grid-cols-[320px_1fr] gap-4">
        <PipelinePulse />
        <div className="space-y-4">
          <CoverageTracker />
          <PipelineFunnel />
        </div>
      </div>
      <ConversionMatrix />
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <TransitionSankey />
        <RecycleExit />
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Rewrite `analytics.tsx` as a tabbed shell**

```tsx
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { AnalyticsOverview } from "./analytics-overview";
import { FlowAnalytics } from "@/components/cockpit/flow/flow-analytics";

export default function Analytics() {
  return (
    <div className="max-w-[1600px] mx-auto px-6 py-6">
      <Tabs defaultValue="overview">
        <TabsList>
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="flow">Flow</TabsTrigger>
        </TabsList>
        <TabsContent value="overview" className="pt-4">
          <AnalyticsOverview />
        </TabsContent>
        <TabsContent value="flow" className="pt-4">
          <FlowAnalytics />
        </TabsContent>
      </Tabs>
    </div>
  );
}
```

> If `AnalyticsOverview` previously rendered its own outer `max-w/px/py` wrapper, remove that inner wrapper so it isn't doubled (the shell now owns page padding).

- [ ] **Step 4: Typecheck + commit**

Run: `pnpm run typecheck` → PASS

```bash
git add artifacts/edc/src/components/cockpit/flow/flow-analytics.tsx artifacts/edc/src/pages/analytics-overview.tsx artifacts/edc/src/pages/analytics.tsx
git commit -m "feat(ui): flow analytics module + tabbed analytics page"
```

---

### Task 17: Final verification

**Files:** none (verification only).

- [ ] **Step 1: Full typecheck**

Run: `pnpm run typecheck`
Expected: PASS across all packages.

- [ ] **Step 2: Full engine + api test suites**

Run: `pnpm --filter @workspace/engine run test` → PASS (121 prior + new flow tests).
Run: `pnpm --filter @workspace/api-server run test` → PASS (incl. new subscriber test).

- [ ] **Step 3: Runtime smoke**

Start API (`pnpm --filter @workspace/api-server run dev`) and frontend (`pnpm --filter @workspace/edc run dev`). In the browser:
- `/analytics` → **Overview** tab renders identically to before (velocity, win/loss, competitive, forecast). **This is the no-regression gate.**
- **Flow** tab renders Pulse gauge, Coverage cards, Funnel, Conversion Matrix, Sankey, Recycle/Exit without console errors.
- `/settings` → **Targets** tab: save a target, reload, value persists; Coverage cards on Flow now show ratios.

- [ ] **Step 4: Final commit (if any verification fixes were needed)**

```bash
git add -A
git commit -m "chore: pipeline flow analytics verification fixes"
```

---

## Self-Review Notes (author)

- **Spec coverage:** §6.2.1 Funnel (Task 2/14), §6.2.3 Conversion Matrix (Task 3/14), §6.2.4 Sankey (Task 4/15), §6.2.5 Recycle/Exit (Task 5/15), §6.1.1 Pulse (Task 7/13), §6.1.2 Coverage (Task 6/13) + targets config (Task 1/11/12), data layer (Task 1/8/9), tabbed IA (Task 16). Deferred items explicitly excluded per spec §1.2.
- **Velocity box-plot (§6.2.2)** is intentionally NOT in this slice — existing `/v2/analytics/velocity` + `velocity-bars` already cover velocity; deferred to avoid duplication. Noted here so it isn't mistaken for a gap.
- **Column-name verifications** are flagged inline (normalizedTcv, salesStageId, winProbabilityPct, createdAt, dealScores.winProbability) — implementer must grep-confirm before relying on them; this is the one area where the plan defers to live schema.
- **Tailwind dynamic-class caveat** called out in Task 14 (use inline rgba styles).
- **recharts Sankey** cycle/self-link limitation called out in Task 15 with the d3-sankey fallback.
