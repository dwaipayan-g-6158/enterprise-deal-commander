# Velocity — "Most Overdue First" Card Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the Velocity card's raw bar-chart + plain table with a single compact, scannable triage table where each row carries an inline variance meter (actual vs benchmark), ranked most-overdue-first and click-through to the deal cockpit.

**Architecture:** Pure client-side change in `artifacts/edc`. The width math is extracted into a pure `meterGeometry` helper (unit-tested) in the existing `transforms.ts`; a new presentational `velocity-triage.tsx` renders the meter + table; `analytics-overview.tsx` swaps the old card body for it and wires navigation + an empty state. The orphaned `velocity-bars.tsx` chart is deleted. No Recharts in this card.

**Tech Stack:** React 19, Vite, Tailwind v4, shadcn/ui, wouter, @tanstack/react-query, Vitest, lucide-react.

## Global Constraints

- Frontend only — no changes to `lib/api-spec`, `lib/api-zod`, `lib/api-client-react` (generated), `lib/db`, `lib/engine`, or `artifacts/api-server`. No Orval codegen.
- **The repo is NOT a git repo.** There are no commit steps. Each task ends with a **Checkpoint** that runs verification commands; report results, do not `git commit`.
- Unit tests are pure TypeScript in `src/**/*.test.ts` (Vitest config: `environment: "node"`, `globals: true`, `include: ["src/**/*.test.ts"]`, **no `@` alias** — use relative imports in tests; do not write `.test.tsx`).
- Health/severity colors (`red`/`amber`/`emerald`) are reserved for status. **Do not** reuse the indigo accent (`--primary`, `222 90% 67%`) for overdue/status signalling. The on-time baseline portion of the meter uses neutral `bg-muted-foreground/40`, not the accent.
- Color must never be the only signal: overdue-ness is always carried by the signed `±Nd` label and the velocity badge text + icon.
- `vite.config.ts` throws unless `PORT` and `BASE_PATH` are set, so **build/serve/dev commands must prefix them**: `PORT=5173 BASE_PATH=/`. Vitest uses the standalone `vitest.config.ts` and needs no env.
- Reuse vendored primitives in `src/components/ui/*` (`badge`, `card`, `empty`). Do not hand-edit generated code.

## Commands (reference)

- Typecheck: `pnpm --filter @workspace/edc run typecheck`
- Unit tests (all): `pnpm --filter @workspace/edc run test`
- Unit test (one file): `pnpm --filter @workspace/edc exec vitest run src/components/cockpit/charts/transforms.test.ts`
- Build: `PORT=5173 BASE_PATH=/ pnpm --filter @workspace/edc run build`
- Dev (visual checks): API server on :5000 + `PORT=5173 BASE_PATH=/ pnpm --filter @workspace/edc run dev`

## File Map

| File | Responsibility | Tasks |
|------|----------------|-------|
| `src/components/cockpit/charts/transforms.ts` | Add pure `meterGeometry` helper + `MeterGeometry`/`VelocityTone` types (keeps existing `classifyVelocity`/`toFanSeries`) | 1 |
| `src/components/cockpit/charts/transforms.test.ts` | Unit tests for `meterGeometry` (appended to existing suite) | 1 |
| `src/components/cockpit/velocity-triage.tsx` (new) | Presentational `VarianceMeter` + `VelocityTriageTable` | 2 |
| `src/pages/analytics-overview.tsx` | Swap Velocity card body for `VelocityTriageTable`; wire navigation + empty state; drop `VelocityBars` import | 3 |
| `src/components/cockpit/charts/velocity-bars.tsx` | **Delete** (orphaned) | 3 |

---

## Task 1: `meterGeometry` pure helper + tests

**Files:**
- Modify: `artifacts/edc/src/components/cockpit/charts/transforms.ts`
- Test: `artifacts/edc/src/components/cockpit/charts/transforms.test.ts` (append a `describe` block)

**Interfaces:**
- Consumes: existing `classifyVelocity(deltaDays: number): "ahead" | "on" | "behind"` from the same file.
- Produces:
  - `type VelocityTone = "ahead" | "on" | "behind"`
  - `interface MeterGeometry { fillPct: number; benchmarkPct: number; overflowPct: number; tone: VelocityTone }`
  - `function meterGeometry(deal: { daysInStage: number; benchmarkDays: number; deltaDays: number }, scaleMax: number): MeterGeometry`
- Consumed by Task 2 (`velocity-triage.tsx`).

- [ ] **Step 1: Write the failing test**

Append to `transforms.test.ts` (the file already imports `{ describe, it, expect } from "vitest"`; add `meterGeometry` to the existing `./transforms` import or add a new import line):

```ts
import { meterGeometry } from "./transforms";

describe("meterGeometry", () => {
  it("splits an overdue deal into on-time base + red overflow", () => {
    const g = meterGeometry({ daysInStage: 45, benchmarkDays: 27, deltaDays: 18 }, 45);
    expect(g.tone).toBe("behind");
    expect(g.fillPct).toBe(100);
    expect(g.benchmarkPct).toBeCloseTo(60);
    expect(g.overflowPct).toBeCloseTo(40);
  });

  it("renders an ahead deal as a short fill with no overflow", () => {
    const g = meterGeometry({ daysInStage: 8, benchmarkDays: 10, deltaDays: -2 }, 45);
    expect(g.tone).toBe("ahead");
    expect(g.fillPct).toBeCloseTo(17.78, 1);
    expect(g.benchmarkPct).toBeCloseTo(22.22, 1);
    expect(g.overflowPct).toBe(0);
  });

  it("treats an on-benchmark deal as on with no overflow", () => {
    const g = meterGeometry({ daysInStage: 10, benchmarkDays: 10, deltaDays: 0 }, 20);
    expect(g.tone).toBe("on");
    expect(g.fillPct).toBe(50);
    expect(g.benchmarkPct).toBe(50);
    expect(g.overflowPct).toBe(0);
  });

  it("guards against a zero scaleMax and clamps to 0-100", () => {
    const g = meterGeometry({ daysInStage: 0, benchmarkDays: 0, deltaDays: 0 }, 0);
    expect(g.fillPct).toBe(0);
    expect(g.benchmarkPct).toBe(0);
    expect(g.overflowPct).toBe(0);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm --filter @workspace/edc exec vitest run src/components/cockpit/charts/transforms.test.ts`
Expected: FAIL — `meterGeometry` is not exported from `./transforms`.

- [ ] **Step 3: Implement `meterGeometry`**

Append to `transforms.ts` (below `classifyVelocity`):

```ts
export type VelocityTone = "ahead" | "on" | "behind";

export interface MeterGeometry {
  /** Total fill width as a 0–100 percentage of the shared track scale. */
  fillPct: number;
  /** Benchmark tick position as a 0–100 percentage of the shared track scale. */
  benchmarkPct: number;
  /** Overdue portion (beyond benchmark) as a 0–100 percentage; 0 unless behind. */
  overflowPct: number;
  tone: VelocityTone;
}

const clampPct = (n: number): number => Math.max(0, Math.min(100, n));

/**
 * Geometry for one deal's inline variance meter. All percentages are relative
 * to a shared `scaleMax` (the largest daysInStage across the visible deals) so
 * bars are comparable row-to-row. `scaleMax <= 0` is guarded to 1.
 */
export function meterGeometry(
  deal: { daysInStage: number; benchmarkDays: number; deltaDays: number },
  scaleMax: number,
): MeterGeometry {
  const max = scaleMax > 0 ? scaleMax : 1;
  const tone = classifyVelocity(deal.deltaDays);
  return {
    fillPct: clampPct((deal.daysInStage / max) * 100),
    benchmarkPct: clampPct((deal.benchmarkDays / max) * 100),
    overflowPct: tone === "behind" ? clampPct(((deal.daysInStage - deal.benchmarkDays) / max) * 100) : 0,
    tone,
  };
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm --filter @workspace/edc exec vitest run src/components/cockpit/charts/transforms.test.ts`
Expected: PASS (existing `toFanSeries` + `classifyVelocity` suites still pass; new `meterGeometry` suite passes — 4 tests).

- [ ] **Step 5: Checkpoint**

Run: `pnpm --filter @workspace/edc run typecheck`
Expected: no errors. Report test + typecheck output.

---

## Task 2: `VarianceMeter` + `VelocityTriageTable` component

**Files:**
- Create: `artifacts/edc/src/components/cockpit/velocity-triage.tsx`

**Interfaces:**
- Consumes: `meterGeometry` from `./charts/transforms`; `Badge` from `@/components/ui/badge`; `ArrowDown`, `ArrowUp`, `Minus`, `type LucideIcon` from `lucide-react`.
- Produces:
  - `interface TriageDeal { id: string; dealName: string; accountName: string; stage: string; daysInStage: number; benchmarkDays: number; deltaDays: number; velocity: string }`
  - `function VelocityTriageTable({ deals, onSelect }: { deals: TriageDeal[]; onSelect: (id: string) => void }): JSX.Element`
- Consumed by Task 3 (`analytics-overview.tsx`).

No unit test (presentational); verified by typecheck + Task 3 visual checkpoint.

- [ ] **Step 1: Create the component file**

Create `artifacts/edc/src/components/cockpit/velocity-triage.tsx`:

```tsx
import { Badge } from "@/components/ui/badge";
import { ArrowDown, ArrowUp, Minus, type LucideIcon } from "lucide-react";
import { meterGeometry } from "./charts/transforms";

export interface TriageDeal {
  id: string;
  dealName: string;
  accountName: string;
  stage: string;
  daysInStage: number;
  benchmarkDays: number;
  deltaDays: number;
  velocity: string;
}

const VEL: Record<string, { label: string; cls: string; Icon: LucideIcon }> = {
  SLOW: { label: "SLOW", cls: "bg-destructive text-white", Icon: ArrowUp },
  FAST: { label: "FAST", cls: "bg-emerald-500 text-white", Icon: ArrowDown },
  NORMAL: { label: "ON", cls: "bg-muted text-muted-foreground", Icon: Minus },
};

function meterAria(deal: TriageDeal): string {
  if (deal.deltaDays > 0)
    return `${deal.daysInStage} days in stage, benchmark ${deal.benchmarkDays}, ${deal.deltaDays} days overdue`;
  if (deal.deltaDays < 0)
    return `${deal.daysInStage} days in stage, benchmark ${deal.benchmarkDays}, ${Math.abs(deal.deltaDays)} days ahead of benchmark`;
  return `${deal.daysInStage} days in stage, exactly at benchmark ${deal.benchmarkDays}`;
}

function VarianceMeter({ deal, scaleMax }: { deal: TriageDeal; scaleMax: number }) {
  const g = meterGeometry(deal, scaleMax);
  return (
    <div
      className="relative h-2 w-full min-w-[80px] rounded-full bg-muted/40"
      role="img"
      aria-label={meterAria(deal)}
    >
      {g.tone === "behind" ? (
        <>
          <div
            className="absolute inset-y-0 left-0 rounded-l-full bg-muted-foreground/40"
            style={{ width: `${g.benchmarkPct}%` }}
          />
          <div
            className="absolute inset-y-0 rounded-r-full bg-destructive"
            style={{ left: `${g.benchmarkPct}%`, width: `${g.overflowPct}%` }}
          />
        </>
      ) : (
        <div
          className={`absolute inset-y-0 left-0 rounded-full ${g.tone === "ahead" ? "bg-emerald-500" : "bg-muted-foreground/50"}`}
          style={{ width: `${g.fillPct}%` }}
        />
      )}
      <div
        className="absolute inset-y-[-2px] w-0.5 bg-foreground/60"
        style={{ left: `${g.benchmarkPct}%` }}
        aria-hidden="true"
      />
    </div>
  );
}

export function VelocityTriageTable({
  deals,
  onSelect,
}: {
  deals: TriageDeal[];
  onSelect: (id: string) => void;
}) {
  const scaleMax = Math.max(...deals.map((d) => d.daysInStage), 1);
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="text-xs uppercase text-muted-foreground border-b">
            <th className="text-left py-2 font-medium">Deal</th>
            <th className="text-left py-2 font-medium hidden sm:table-cell">Stage</th>
            <th className="text-left py-2 font-medium w-[40%]">Variance</th>
            <th className="text-right py-2 font-medium">Delta</th>
            <th className="text-right py-2 font-medium hidden sm:table-cell">Velocity</th>
          </tr>
        </thead>
        <tbody>
          {deals.map((d) => {
            const v = VEL[d.velocity] ?? VEL.NORMAL;
            return (
              <tr
                key={d.id}
                role="button"
                tabIndex={0}
                onClick={() => onSelect(d.id)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    onSelect(d.id);
                  }
                }}
                className="border-b cursor-pointer transition-colors hover:bg-muted/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <td className="py-2 pr-3">
                  <span className="font-medium">{d.dealName}</span>
                  <span className="text-muted-foreground"> · {d.accountName}</span>
                </td>
                <td className="py-2 pr-3 hidden sm:table-cell text-muted-foreground">{d.stage}</td>
                <td className="py-2 pr-3">
                  <VarianceMeter deal={d} scaleMax={scaleMax} />
                </td>
                <td
                  className={`py-2 pl-3 text-right font-mono whitespace-nowrap ${
                    d.deltaDays > 0 ? "text-destructive" : d.deltaDays < 0 ? "text-emerald-600" : "text-muted-foreground"
                  }`}
                >
                  {d.deltaDays > 0 ? `+${d.deltaDays}d` : `${d.deltaDays}d`}
                </td>
                <td className="py-2 pl-3 text-right hidden sm:table-cell">
                  <Badge className={v.cls}>
                    <v.Icon className="h-3 w-3 mr-1" />
                    {v.label}
                  </Badge>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
```

- [ ] **Step 2: Checkpoint**

Run: `pnpm --filter @workspace/edc run typecheck`
Expected: PASS (imports/types resolve; `Badge`, `Empty` primitives and lucide icons already exist in the project).

---

## Task 3: Wire the triage table into the analytics page + delete the orphaned chart

**Files:**
- Modify: `artifacts/edc/src/pages/analytics-overview.tsx` (imports lines 1–15; component body lines 39–46; Velocity card lines 162–209)
- Delete: `artifacts/edc/src/components/cockpit/charts/velocity-bars.tsx`

**Interfaces:**
- Consumes: `VelocityTriageTable` from `@/components/cockpit/velocity-triage` (Task 2); `useLocation` from `wouter`; existing `vDeals: VelocityDeal[]`; existing `Empty`/`EmptyHeader`/`EmptyMedia`/`EmptyTitle`/`EmptyDescription` imports.
- Produces: nothing new.

No unit test (presentational); verified by typecheck + build + visual checkpoint.

- [ ] **Step 1: Update imports**

In `analytics-overview.tsx`:

1. Remove this line (line 14):

```tsx
import { VelocityBars } from "@/components/cockpit/charts/velocity-bars";
```

2. Add the new component import and the router import near the other imports:

```tsx
import { useLocation } from "wouter";
import { VelocityTriageTable } from "@/components/cockpit/velocity-triage";
```

3. Add `Gauge` to the existing lucide-react import (line 11), so it reads:

```tsx
import { FileText, Download, TrendingUp, Swords, Gauge } from "lucide-react";
```

- [ ] **Step 2: Add the navigation hook**

Inside `AnalyticsOverview`, alongside the other hook calls (after line 44, `const pipeline = useGetPipelineAnalytics();`), add:

```tsx
const [, navigate] = useLocation();
```

The unused `velocityColor` map (lines 56–60) is now dead — remove it (the velocity badge styling lives in `velocity-triage.tsx`). Typecheck in Step 5 will flag it if missed (TS6133 via lint) — delete the `const velocityColor: Record<string, string> = { ... };` block.

- [ ] **Step 3: Replace the Velocity card body**

Replace the entire Velocity card block (lines ~162–209, from the `{/* Velocity heatmap */}` comment through its closing `</Card>`) with:

```tsx
      {/* Velocity triage */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Velocity — Most Overdue First</CardTitle>
        </CardHeader>
        <CardContent>
          {vDeals.length > 0 ? (
            <VelocityTriageTable
              deals={vDeals}
              onSelect={(dealId) => navigate(`/deals/${dealId}`)}
            />
          ) : (
            <Empty>
              <EmptyHeader>
                <EmptyMedia variant="icon"><Gauge className="h-5 w-5" /></EmptyMedia>
                <EmptyTitle>No active deals to track</EmptyTitle>
                <EmptyDescription>
                  Velocity ranks open deals by how far past their stage benchmark they've run.
                </EmptyDescription>
              </EmptyHeader>
            </Empty>
          )}
        </CardContent>
      </Card>
```

(`vDeals` is `VelocityDeal[]`, which structurally satisfies `TriageDeal[]` — it carries every field `TriageDeal` requires with matching types.)

- [ ] **Step 4: Delete the orphaned chart component**

Delete `artifacts/edc/src/components/cockpit/charts/velocity-bars.tsx`.

Then confirm nothing else references it:

```bash
grep -rn "velocity-bars\|VelocityBars" artifacts/edc/src
```
Expected: no matches (after this task's import removal). If any remain, they must be removed before the build.

- [ ] **Step 5: Typecheck**

Run: `pnpm --filter @workspace/edc run typecheck`
Expected: PASS. Fix any TS6133 unused-import/var flags it reports (e.g. a leftover `velocityColor`, or `Badge` if it is no longer used elsewhere in the file — check before removing, the Win/Loss and Competitive sections may still use it).

- [ ] **Step 6: Build**

Run: `PORT=5173 BASE_PATH=/ pnpm --filter @workspace/edc run build`
Expected: build completes; `dist/public` emitted; no Tailwind/PostCSS or missing-module error.

- [ ] **Step 7: Visual checkpoint**

Start dev (API on :5000 + `PORT=5173 BASE_PATH=/ pnpm --filter @workspace/edc run dev`), log in, open `/analytics`. In both light and dark mode confirm:
- The Velocity card shows one dense table (no separate bar chart), most-overdue deal first.
- Each row's variance meter is comparable to its neighbours (shared scale), with red overflow beyond the benchmark tick on overdue deals, emerald fill on ahead deals, and a visible benchmark tick.
- Overdue-ness reads without color: signed `+18d` / `−2d` labels and SLOW/ON/FAST badges with arrow icons are present.
- Clicking a row navigates to `/deals/:id`; tabbing to a row shows a focus ring and Enter/Space navigates.
- With no velocity deals, the `Empty` block renders (icon + title + description).
- No horizontal body scroll at 375 / 768 / 1024 / 1440 (Stage + Velocity columns drop below `sm`; Deal + Variance + Delta remain). Zero console errors.

Screenshot the redesigned card in light and dark mode for the record.

---

## Final verification

- [ ] **Unit tests:** `pnpm --filter @workspace/edc run test` → `transforms` suite (incl. new `meterGeometry` tests) PASS; existing suites still pass.
- [ ] **Typecheck:** `pnpm --filter @workspace/edc run typecheck` → PASS.
- [ ] **Build:** `PORT=5173 BASE_PATH=/ pnpm --filter @workspace/edc run build` → PASS.
- [ ] **No orphan references:** `grep -rn "velocity-bars\|VelocityBars" artifacts/edc/src` → no matches.
- [ ] **Visual:** `/analytics` Velocity card matches the spec (compact triage table, comparable meters, color-independent labels, clickable rows, empty state) in light + dark at 375/1440. Zero console errors.
