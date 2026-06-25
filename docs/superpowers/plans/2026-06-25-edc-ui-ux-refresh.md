# EDC UI/UX Refresh Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Refresh the `artifacts/edc` frontend — grouped cockpit tabs, an indigo accent system, real analytics charts, dashboard drill-through, a responsive shell, accessibility polish, and an installable offline-capable PWA — without touching the API contract, DB schema, or engine.

**Architecture:** Pure client-side work in `artifacts/edc`. Pure logic (tab grouping, chart transforms) lives in small `.test.ts`-covered modules; presentational changes are verified by typecheck + build + Playwright screenshots. PWA via `vite-plugin-pwa` (Workbox) emitting a static manifest + service worker.

**Tech Stack:** React 19, Vite, Tailwind v4, shadcn/ui, wouter, @tanstack/react-query, Recharts (vendored `chart.tsx`), Vitest, `vite-plugin-pwa`.

**Spec:** `docs/superpowers/specs/2026-06-25-edc-ui-ux-refresh-design.md`

## Global Constraints

- Frontend only — no changes to `lib/api-spec`, `lib/api-zod`, `lib/api-client-react` (generated), `lib/db`, `lib/engine`, or `artifacts/api-server`. No Orval codegen.
- **The repo is NOT a git repo.** There are no commit steps. Each task ends with a **Checkpoint** that runs verification commands; report results, do not `git commit`.
- Unit tests are pure TypeScript in `src/**/*.test.ts` (Vitest config is `environment: "node"`, `include: ["src/**/*.test.ts"]`, **no `@` alias** — use relative imports in tests; do not write `.test.tsx`).
- Health/severity colors (`red`/`amber`/`emerald`) are reserved for status and must never be reused as the indigo accent. Engine `Severity = "RED" | "YELLOW" | "GREEN"`.
- Accent indigo: `#5b8cff` → HSL `222 90% 67%`.
- Reuse vendored primitives in `src/components/ui/*` (`tabs`, `sidebar`, `sheet`, `chart`, `empty`, `dropdown-menu`, `badge`, `card`). Do not hand-edit generated code.
- `vite.config.ts` throws unless `PORT` and `BASE_PATH` are set, so **build/serve commands must prefix them**: `PORT=5173 BASE_PATH=/`. Vitest uses the standalone `vitest.config.ts` and needs no env.
- Geist / Geist Mono / Inter are loaded via Google Fonts in `index.html` — the accent and type already render as designed; do not add font files.

## Commands (reference)

- Typecheck: `pnpm --filter @workspace/edc run typecheck`
- Unit tests (all): `pnpm --filter @workspace/edc run test`
- Unit test (one file): `pnpm --filter @workspace/edc exec vitest run src/path/to/file.test.ts`
- Build: `PORT=5173 BASE_PATH=/ pnpm --filter @workspace/edc run build`
- Preview built app (for PWA/offline checks): `PORT=5173 BASE_PATH=/ pnpm --filter @workspace/edc run serve`
- Dev (for visual checks): API server on :5000 + `PORT=5173 BASE_PATH=/ pnpm --filter @workspace/edc run dev`

## File Map

| File | Responsibility | Tasks |
|------|----------------|-------|
| `src/index.css` | Indigo accent tokens, chart vars, reduced-motion | 1, 11 |
| `src/components/cockpit/cockpit-tabs.ts` (new) | Tab grouping config + `groupForSub` + `alertCount` | 2 |
| `src/components/cockpit/cockpit-tabs.test.ts` (new) | Unit tests for above | 2 |
| `src/pages/deal-cockpit.tsx` | Grouped two-level tabs; header cleanup | 3, 4 |
| `src/components/cockpit/charts/transforms.ts` (new) | `toFanSeries`, `classifyVelocity` | 5 |
| `src/components/cockpit/charts/transforms.test.ts` (new) | Unit tests for transforms | 5 |
| `src/components/cockpit/charts/forecast-fan.tsx` (new) | Forecast area/fan chart | 6 |
| `src/components/cockpit/charts/velocity-bars.tsx` (new) | Velocity bar chart w/ benchmark | 6 |
| `src/components/cockpit/charts/winloss-donut.tsx` (new) | Win/loss donut | 6 |
| `src/pages/analytics.tsx` | Wire charts + empty states | 7, 10 |
| `src/pages/dashboard.tsx` | Drill-through + health distribution | 8 |
| `src/components/layout.tsx` | Responsive shell (Sheet + hamburger); logout cache clear | 9, 14 |
| `src/components/cockpit/v2/competitive-panel.tsx`, `stakeholders-panel.tsx` | Empty states | 10 |
| `src/pages/deals.tsx` | Mobile card list + a11y rows | 12, 15 |
| `vite.config.ts`, `index.html`, `public/*`, `package.json` | PWA install | 11 |
| `src/components/pwa-update-prompt.tsx`, `offline-banner.tsx` (new), `src/pwa.d.ts` (new), `App.tsx` | PWA update/offline UX; retire `/m` | 13, 14 |

---

## Task 1: Indigo accent + chart color tokens

**Files:**
- Modify: `artifacts/edc/src/index.css` (`:root` block lines ~68–112, `.dark` block lines ~114–154)

**Interfaces:**
- Produces: CSS custom properties `--primary`, `--ring` (repointed to indigo) and `--chart-1..5` (newly defined) consumed by every `bg-primary`/`text-primary`/`ring`/chart in later tasks.

No unit test (CSS-only). Verified by build + visual check.

- [ ] **Step 1: Repoint `--primary` and `--ring` in `:root`**

In `index.css`, inside `:root { ... }`, replace these three lines:

```css
  --primary: 220 20% 25%;
  --primary-foreground: 0 0% 100%;
```
…and the `--ring` line `--ring: 220 20% 25%;` so the block reads:

```css
  --primary: 222 90% 67%;
  --primary-foreground: 0 0% 100%;
```
```css
  --ring: 222 90% 67%;
```

- [ ] **Step 2: Repoint `--primary` and `--ring` in `.dark`**

Inside `.dark { ... }`, replace:

```css
  --primary: 210 20% 98%;
  --primary-foreground: 220 10% 10%;
```
with:

```css
  --primary: 222 90% 67%;
  --primary-foreground: 220 10% 10%;
```
and replace `--ring: 210 20% 98%;` with:

```css
  --ring: 222 90% 67%;
```

Leave `--sidebar-primary` / `--sidebar-ring` as-is (sidebar active state will pick up via Task 9), but for consistency also set `--sidebar-primary: 222 90% 67%;` and `--sidebar-ring: 222 90% 67%;` in both `:root` and `.dark`.

- [ ] **Step 3: Add chart color variables (currently undefined)**

The `@theme` block references `hsl(var(--chart-1..5))` but `:root`/`.dark` never define them. Add this block inside **both** `:root` and `.dark` (same values are fine for both themes), just before the closing `}` of each:

```css
  --chart-1: 222 90% 67%;   /* indigo accent — primary series */
  --chart-2: 158 64% 52%;   /* emerald */
  --chart-3: 38 92% 50%;    /* amber */
  --chart-4: 280 65% 65%;   /* violet */
  --chart-5: 199 89% 55%;   /* sky */
```

- [ ] **Step 4: Build to verify CSS compiles**

Run: `PORT=5173 BASE_PATH=/ pnpm --filter @workspace/edc run build`
Expected: build completes with no Tailwind/PostCSS error; `dist/public` emitted.

- [ ] **Step 5: Visual checkpoint**

Start dev (API on :5000 + `PORT=5173 BASE_PATH=/ pnpm --filter @workspace/edc run dev`), open `http://localhost:5173`, log in. Confirm: the active sidebar item, the default `New Deal` button, and focus rings are indigo (not grey) in both light and dark mode. Health badges (RED/YELLOW/GREEN) are unchanged. Screenshot dashboard + deals for the record.

---

## Task 2: Cockpit tab grouping config + tests

**Files:**
- Create: `artifacts/edc/src/components/cockpit/cockpit-tabs.ts`
- Create (test): `artifacts/edc/src/components/cockpit/cockpit-tabs.test.ts`

**Interfaces:**
- Produces:
  - `interface SubTab { id: string; label: string }`
  - `interface TabGroup { id: string; label: string; icon: LucideIcon; subs: SubTab[] }`
  - `const COCKPIT_GROUPS: TabGroup[]`
  - `function groupForSub(subId: string): string | undefined`
  - `function alertCount(alerts: { severity?: string }[] | undefined): number`
- Consumed by Task 3 (`deal-cockpit.tsx`).

- [ ] **Step 1: Write the failing test**

Create `cockpit-tabs.test.ts` (relative import — no `@` alias in tests):

```ts
import { describe, it, expect } from "vitest";
import { COCKPIT_GROUPS, groupForSub, alertCount } from "./cockpit-tabs";

describe("cockpit-tabs", () => {
  it("defines exactly 5 primary groups", () => {
    expect(COCKPIT_GROUPS.map((g) => g.id)).toEqual([
      "risk", "validation", "intel", "commercial", "record",
    ]);
  });

  it("covers all 13 panel sub-tabs exactly once", () => {
    const subs = COCKPIT_GROUPS.flatMap((g) => g.subs.map((s) => s.id)).sort();
    expect(subs).toEqual([
      "activity", "blockers", "coaching", "competitive", "crosssell",
      "decisions", "history", "pricing", "playbook", "risk", "score",
      "stakeholders", "technical",
    ].sort());
  });

  it("maps a sub id back to its group", () => {
    expect(groupForSub("score")).toBe("intel");
    expect(groupForSub("risk")).toBe("risk");
    expect(groupForSub("nope")).toBeUndefined();
  });

  it("counts only RED alerts", () => {
    expect(alertCount([{ severity: "RED" }, { severity: "YELLOW" }, { severity: "RED" }])).toBe(2);
    expect(alertCount([])).toBe(0);
    expect(alertCount(undefined)).toBe(0);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm --filter @workspace/edc exec vitest run src/components/cockpit/cockpit-tabs.test.ts`
Expected: FAIL — cannot resolve `./cockpit-tabs`.

- [ ] **Step 3: Implement the config module**

Create `cockpit-tabs.ts`:

```ts
import type { LucideIcon } from "lucide-react";
import { ShieldAlert, Activity, Gauge, DollarSign, ScrollText } from "lucide-react";

export interface SubTab { id: string; label: string }
export interface TabGroup { id: string; label: string; icon: LucideIcon; subs: SubTab[] }

export const COCKPIT_GROUPS: TabGroup[] = [
  { id: "risk", label: "Risk", icon: ShieldAlert, subs: [
      { id: "risk", label: "Alerts" },
      { id: "coaching", label: "Coaching" },
      { id: "blockers", label: "Blockers" },
  ] },
  { id: "validation", label: "Validation", icon: Activity, subs: [
      { id: "technical", label: "Technical Gates" },
      { id: "playbook", label: "Playbook" },
  ] },
  { id: "intel", label: "Intelligence", icon: Gauge, subs: [
      { id: "score", label: "Score" },
      { id: "competitive", label: "Competitive" },
      { id: "stakeholders", label: "Stakeholders" },
  ] },
  { id: "commercial", label: "Commercial", icon: DollarSign, subs: [
      { id: "pricing", label: "Pricing" },
      { id: "crosssell", label: "Cross-Sell" },
  ] },
  { id: "record", label: "Record", icon: ScrollText, subs: [
      { id: "activity", label: "Activity" },
      { id: "decisions", label: "Decisions" },
      { id: "history", label: "History" },
  ] },
];

/** Map a sub-tab id back to its group id (for default selection / deep-linking). */
export function groupForSub(subId: string): string | undefined {
  return COCKPIT_GROUPS.find((g) => g.subs.some((s) => s.id === subId))?.id;
}

/** Count active RED alerts for the Risk tab badge. */
export function alertCount(alerts: { severity?: string }[] | undefined): number {
  return (alerts ?? []).filter((a) => a.severity === "RED").length;
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm --filter @workspace/edc exec vitest run src/components/cockpit/cockpit-tabs.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Checkpoint**

Run: `pnpm --filter @workspace/edc run typecheck`
Expected: no errors. Report test + typecheck output.

---

## Task 3: Grouped two-level cockpit tabs

**Files:**
- Modify: `artifacts/edc/src/pages/deal-cockpit.tsx` (imports near lines 1–52; the center/right column `Tabs` block at lines ~297–445; state near lines ~89–94)

**Interfaces:**
- Consumes: `COCKPIT_GROUPS`, `alertCount` from `@/components/cockpit/cockpit-tabs`.
- Produces: nested-tab cockpit; all 13 panels reachable. No new exports.

No unit test (presentational); verified by Playwright.

- [ ] **Step 1: Add imports and remove now-unused tab icons**

At the top of `deal-cockpit.tsx`, add:

```tsx
import { COCKPIT_GROUPS, alertCount } from "@/components/cockpit/cockpit-tabs";
```

The per-tab icons (`Activity`, `ShieldAlert`, `ShieldX`, `Layers`, `ClipboardList`, `History`, `Gauge`, `Swords`, `Users`, `ScrollText`, `Route`, `DollarSign`, `Sparkles`) are now mostly supplied by the config. Keep only icons still used outside the tab list (`Pencil`, `Radio`, `Presentation`, `Sparkles` for the header actions, `AlertCircle` for the error state). Remove unused imports as flagged by typecheck in Step 5.

- [ ] **Step 2: Add tab state and helpers**

Near the other `useState` declarations (around line 89), add:

```tsx
const [group, setGroup] = useState("risk");
const [sub, setSub] = useState("risk");

const activeGroup = COCKPIT_GROUPS.find((g) => g.id === group) ?? COCKPIT_GROUPS[0];
const selectGroup = (id: string) => {
  const g = COCKPIT_GROUPS.find((x) => x.id === id);
  if (!g) return;
  setGroup(id);
  setSub(g.subs[0].id);
};
```

After `intel` is defined (around line 163), add the badge count and the panel renderer (the renderer references `id`, `intel`, `deal`, `gatesSaveRef` already in scope):

```tsx
const redAlerts = alertCount(intel.governance.alerts);

const renderPanel = (subId: string) => {
  switch (subId) {
    case "risk": return <RiskGovernance dealId={id} alerts={intel.governance.alerts} />;
    case "coaching": return <NextBestAction dealId={id} />;
    case "technical": return (
      <TechnicalGates
        dealId={id}
        progressPercentage={intel.technicalTrack.progressPercentage}
        integrityWarnings={intel.technicalTrack.integrityWarnings}
        onSaveRef={gatesSaveRef}
      />
    );
    case "blockers": return <BlockersPanel dealId={id} />;
    case "playbook": return <PlaybookPanel dealId={id} />;
    case "score": return <ScorePanel dealId={id} />;
    case "competitive": return <CompetitivePanel dealId={id} />;
    case "stakeholders": return <StakeholdersPanel dealId={id} />;
    case "pricing": return <PricingPanel dealId={id} currency={deal.dealCurrency} />;
    case "crosssell": return <CrossSellPanel dealId={id} />;
    case "activity": return <ActivityFeed dealId={id} />;
    case "decisions": return <DecisionsPanel dealId={id} />;
    case "history": return <HistoryPanel dealId={id} />;
    default: return null;
  }
};
```

- [ ] **Step 3: Replace the flat `Tabs` block with nested tabs**

Replace the entire `<Tabs defaultValue="risk" ...>…</Tabs>` block (lines ~298–444) with:

```tsx
<div className="w-full">
  {/* Primary group tabs */}
  <Tabs value={group} onValueChange={selectGroup} className="w-full">
    <TabsList className="w-full justify-start border-b rounded-none h-12 bg-transparent p-0">
      {COCKPIT_GROUPS.map((g) => (
        <TabsTrigger
          key={g.id}
          value={g.id}
          className="rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent px-6"
        >
          <g.icon className="w-4 h-4 mr-2" />
          {g.label}
          {g.id === "risk" && redAlerts > 0 && (
            <span className="ml-2 inline-flex items-center justify-center rounded-full bg-destructive/15 text-destructive text-[10px] font-bold min-w-[18px] h-[18px] px-1.5 tabular-nums">
              {redAlerts}
            </span>
          )}
        </TabsTrigger>
      ))}
    </TabsList>
  </Tabs>

  {/* Sub-tabs (segmented) for the active group */}
  <Tabs value={sub} onValueChange={setSub} className="w-full">
    <TabsList className="mt-4 inline-flex h-auto w-fit flex-wrap gap-1 rounded-md bg-muted/40 p-1">
      {activeGroup.subs.map((s) => (
        <TabsTrigger
          key={s.id}
          value={s.id}
          className="rounded px-4 py-1.5 text-sm data-[state=active]:bg-background data-[state=active]:shadow-sm"
        >
          {s.label}
        </TabsTrigger>
      ))}
    </TabsList>
  </Tabs>

  <div className="pt-6">{renderPanel(sub)}</div>
</div>
```

- [ ] **Step 4: Typecheck and fix unused imports**

Run: `pnpm --filter @workspace/edc run typecheck`
Expected: PASS after removing any now-unused icon imports it flags (TS6133).

- [ ] **Step 5: Visual checkpoint (Playwright)**

With dev running, navigate to a deal cockpit (`/deals/:id` — e.g. Project Atlas). Confirm: exactly 5 primary tabs that do **not** wrap at 1440px; Risk is active with a red count badge; clicking each group shows its segmented sub-tabs and defaults to the first; spot-check Score (gauge), Technical (gate progress), Stakeholders, Pricing render. Screenshot the cockpit. Confirm zero console errors.

---

## Task 4: Cockpit header cleanup

**Files:**
- Modify: `artifacts/edc/src/pages/deal-cockpit.tsx` (header actions block lines ~212–233; imports)

**Interfaces:**
- Consumes: existing handlers `setEditOpen`, `setSimOpen`, `setBatOpen`, `setBriefingOpen`.
- Produces: nothing new.

No unit test; verified by Playwright.

- [ ] **Step 1: Add imports**

Add to `deal-cockpit.tsx`:

```tsx
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { MoreHorizontal } from "lucide-react";
```

- [ ] **Step 2: Replace the 2×2 button grid**

Replace the `<div className="grid grid-cols-2 gap-2">…</div>` (lines ~219–232) with:

```tsx
<div className="flex items-center gap-2">
  <Button size="sm" onClick={() => setEditOpen(true)}>
    <Pencil className="h-4 w-4 mr-2" /> Edit
  </Button>
  <Button size="sm" variant="secondary" onClick={() => setBriefingOpen(true)}>
    <Presentation className="h-4 w-4 mr-2" /> Briefing
  </Button>
  <DropdownMenu>
    <DropdownMenuTrigger asChild>
      <Button size="sm" variant="outline" aria-label="More actions">
        <MoreHorizontal className="h-4 w-4" />
      </Button>
    </DropdownMenuTrigger>
    <DropdownMenuContent align="end">
      <DropdownMenuItem onClick={() => setSimOpen(true)}>
        <Sparkles className="h-4 w-4 mr-2" /> Simulate risk
      </DropdownMenuItem>
      <DropdownMenuItem onClick={() => setBatOpen(true)}>
        <Radio className="h-4 w-4 mr-2" /> Bat-Signal
      </DropdownMenuItem>
    </DropdownMenuContent>
  </DropdownMenu>
</div>
```

- [ ] **Step 3: Typecheck**

Run: `pnpm --filter @workspace/edc run typecheck`
Expected: PASS.

- [ ] **Step 4: Visual checkpoint**

With dev running, on a cockpit confirm: one solid Edit button, a secondary Briefing button, and a `⋯` menu opening Simulate + Bat-Signal that still launch their dialogs. Ctrl+B (briefing) and Ctrl+S (save gates) still work. Screenshot.

---

## Task 5: Chart data transforms + tests

**Files:**
- Create: `artifacts/edc/src/components/cockpit/charts/transforms.ts`
- Create (test): `artifacts/edc/src/components/cockpit/charts/transforms.test.ts`

**Interfaces:**
- Produces:
  - `interface Forecast { p10: number; p25: number; p50: number; p75: number; p90: number }`
  - `function toFanSeries(f: Forecast): { k: string; lo: number; mid: number; hi: number }[]`
  - `function classifyVelocity(deltaDays: number): "ahead" | "on" | "behind"`
- Consumed by Task 6 chart components.

- [ ] **Step 1: Write the failing test**

Create `transforms.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { toFanSeries, classifyVelocity } from "./transforms";

describe("toFanSeries", () => {
  it("builds an ordered band series from percentiles", () => {
    const out = toFanSeries({ p10: 1, p25: 2, p50: 3, p75: 4, p90: 5 });
    expect(out.map((d) => d.k)).toEqual(["P10", "P25", "P50", "P75", "P90"]);
    expect(out.map((d) => d.mid)).toEqual([1, 2, 3, 4, 5]);
    // lo is the p10 floor, hi is the p90 ceiling for the shaded band
    expect(out[0].lo).toBe(1);
    expect(out[4].hi).toBe(5);
  });
});

describe("classifyVelocity", () => {
  it("classifies by delta sign", () => {
    expect(classifyVelocity(5)).toBe("behind");
    expect(classifyVelocity(0)).toBe("on");
    expect(classifyVelocity(-3)).toBe("ahead");
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm --filter @workspace/edc exec vitest run src/components/cockpit/charts/transforms.test.ts`
Expected: FAIL — cannot resolve `./transforms`.

- [ ] **Step 3: Implement**

Create `transforms.ts`:

```ts
export interface Forecast { p10: number; p25: number; p50: number; p75: number; p90: number }

/**
 * Shape percentiles for a fan/area chart. `mid` is the per-point value;
 * `lo`/`hi` carry the p10 floor and p90 ceiling so a shaded band can span them.
 */
export function toFanSeries(f: Forecast): { k: string; lo: number; mid: number; hi: number }[] {
  const order: (keyof Forecast)[] = ["p10", "p25", "p50", "p75", "p90"];
  return order.map((key) => ({
    k: key.toUpperCase(),
    lo: f.p10,
    mid: f[key],
    hi: f.p90,
  }));
}

export function classifyVelocity(deltaDays: number): "ahead" | "on" | "behind" {
  if (deltaDays > 0) return "behind";
  if (deltaDays < 0) return "ahead";
  return "on";
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `pnpm --filter @workspace/edc exec vitest run src/components/cockpit/charts/transforms.test.ts`
Expected: PASS (2 suites).

- [ ] **Step 5: Checkpoint**

Run: `pnpm --filter @workspace/edc run typecheck`
Expected: PASS.

---

## Task 6: Chart components

**Files:**
- Create: `artifacts/edc/src/components/cockpit/charts/forecast-fan.tsx`
- Create: `artifacts/edc/src/components/cockpit/charts/velocity-bars.tsx`
- Create: `artifacts/edc/src/components/cockpit/charts/winloss-donut.tsx`

**Interfaces:**
- Consumes: `toFanSeries`, `classifyVelocity`, `Forecast` from `./transforms`; `ChartContainer`, `ChartTooltip`, `ChartTooltipContent` from `@/components/ui/chart`; Recharts primitives.
- Produces:
  - `ForecastFan({ forecast }: { forecast: Forecast })`
  - `VelocityBars({ deals }: { deals: { dealName: string; daysInStage: number; benchmarkDays: number; deltaDays: number }[] })`
  - `WinLossDonut({ won, lost }: { won: number; lost: number })`

No unit test (presentational); verified by typecheck + Playwright.

- [ ] **Step 1: Forecast fan chart**

Create `forecast-fan.tsx`:

```tsx
import { Area, AreaChart, CartesianGrid, XAxis, YAxis } from "recharts";
import { ChartContainer, ChartTooltip, ChartTooltipContent, type ChartConfig } from "@/components/ui/chart";
import { toFanSeries, type Forecast } from "./transforms";

const config: ChartConfig = {
  mid: { label: "Forecast", color: "hsl(var(--chart-1))" },
};

const fmt = (n: number) => "$" + Math.round(n / 1000) + "k";

export function ForecastFan({ forecast }: { forecast: Forecast }) {
  const data = toFanSeries(forecast);
  return (
    <ChartContainer config={config} className="aspect-[16/7] w-full">
      <AreaChart data={data} margin={{ left: 4, right: 8, top: 8, bottom: 0 }}>
        <CartesianGrid vertical={false} />
        <XAxis dataKey="k" tickLine={false} axisLine={false} />
        <YAxis tickFormatter={fmt} width={48} tickLine={false} axisLine={false} />
        <ChartTooltip content={<ChartTooltipContent />} />
        <Area
          dataKey="mid"
          type="monotone"
          stroke="hsl(var(--chart-1))"
          fill="hsl(var(--chart-1))"
          fillOpacity={0.18}
          strokeWidth={2}
        />
      </AreaChart>
    </ChartContainer>
  );
}
```

- [ ] **Step 2: Velocity bars**

Create `velocity-bars.tsx`:

```tsx
import { Bar, BarChart, CartesianGrid, Cell, XAxis, YAxis } from "recharts";
import { ChartContainer, ChartTooltip, ChartTooltipContent, type ChartConfig } from "@/components/ui/chart";
import { classifyVelocity } from "./transforms";

const config: ChartConfig = { days: { label: "Days in stage" } };

const colorFor = (delta: number) => {
  const k = classifyVelocity(delta);
  if (k === "behind") return "hsl(var(--destructive))";
  if (k === "ahead") return "hsl(var(--chart-2))";
  return "hsl(var(--chart-1))";
};

export function VelocityBars({
  deals,
}: {
  deals: { dealName: string; daysInStage: number; benchmarkDays: number; deltaDays: number }[];
}) {
  const data = deals.map((d) => ({ name: d.dealName, days: d.daysInStage, delta: d.deltaDays }));
  return (
    <ChartContainer config={config} className="aspect-[16/7] w-full">
      <BarChart data={data} layout="vertical" margin={{ left: 8, right: 12 }}>
        <CartesianGrid horizontal={false} />
        <XAxis type="number" tickLine={false} axisLine={false} />
        <YAxis type="category" dataKey="name" width={120} tickLine={false} axisLine={false} />
        <ChartTooltip content={<ChartTooltipContent />} />
        <Bar dataKey="days" radius={4}>
          {data.map((d, i) => (
            <Cell key={i} fill={colorFor(d.delta)} />
          ))}
        </Bar>
      </BarChart>
    </ChartContainer>
  );
}
```

- [ ] **Step 3: Win/loss donut**

Create `winloss-donut.tsx`:

```tsx
import { Pie, PieChart, Cell } from "recharts";
import { ChartContainer, ChartTooltip, ChartTooltipContent, type ChartConfig } from "@/components/ui/chart";

const config: ChartConfig = {
  won: { label: "Won", color: "hsl(var(--chart-2))" },
  lost: { label: "Lost", color: "hsl(var(--destructive))" },
};

export function WinLossDonut({ won, lost }: { won: number; lost: number }) {
  const data = [
    { key: "won", value: won, fill: "hsl(var(--chart-2))" },
    { key: "lost", value: lost, fill: "hsl(var(--destructive))" },
  ];
  return (
    <ChartContainer config={config} className="mx-auto aspect-square max-h-[200px]">
      <PieChart>
        <ChartTooltip content={<ChartTooltipContent hideLabel />} />
        <Pie data={data} dataKey="value" nameKey="key" innerRadius={55} strokeWidth={2}>
          {data.map((d) => (
            <Cell key={d.key} fill={d.fill} />
          ))}
        </Pie>
      </PieChart>
    </ChartContainer>
  );
}
```

- [ ] **Step 4: Checkpoint**

Run: `pnpm --filter @workspace/edc run typecheck`
Expected: PASS (imports/types resolve; Recharts is already a dependency).

---

## Task 7: Wire charts into the analytics page

**Files:**
- Modify: `artifacts/edc/src/pages/analytics.tsx`

**Interfaces:**
- Consumes: `ForecastFan`, `VelocityBars`, `WinLossDonut`; existing data shapes `simData.percentiles` (`Record<string, number>`), `vDeals` (`VelocityDeal[]`), `wl` (`{ won; lost; winRatePct }`).

No unit test; verified by Playwright.

- [ ] **Step 1: Import the chart components**

Add to `analytics.tsx`:

```tsx
import { ForecastFan } from "@/components/cockpit/charts/forecast-fan";
import { VelocityBars } from "@/components/cockpit/charts/velocity-bars";
import { WinLossDonut } from "@/components/cockpit/charts/winloss-donut";
```

- [ ] **Step 2: Add the fan chart above the percentile boxes**

In the Probabilistic Forecast card, inside the `{simData ? ( <div className="space-y-3"> …` block, insert the chart before the existing `<div className="grid grid-cols-5 …">` number row:

```tsx
<ForecastFan
  forecast={{
    p10: simData.percentiles.p10,
    p25: simData.percentiles.p25,
    p50: simData.percentiles.p50,
    p75: simData.percentiles.p75,
    p90: simData.percentiles.p90,
  }}
/>
```

(The existing number row stays as the caption beneath.)

- [ ] **Step 3: Add the velocity bar chart above the velocity table**

In the "Velocity — Most Overdue First" card, insert before the `<table …>`:

```tsx
{vDeals.length > 0 && (
  <div className="mb-6">
    <VelocityBars
      deals={vDeals.map((d) => ({
        dealName: d.dealName,
        daysInStage: d.daysInStage,
        benchmarkDays: d.benchmarkDays,
        deltaDays: d.deltaDays,
      }))}
    />
  </div>
)}
```

(The table remains as the accessible data alternative.)

- [ ] **Step 4: Add the donut to the Win/Loss card**

In the Win/Loss card, inside the `{wl && wl.won + wl.lost > 0 ? ( <div className="space-y-3">` block, insert the donut before the `<div className="flex items-baseline gap-3">` summary:

```tsx
<WinLossDonut won={wl.won} lost={wl.lost} />
```

- [ ] **Step 5: Typecheck + visual checkpoint**

Run: `pnpm --filter @workspace/edc run typecheck` → PASS.
With dev running, open `/analytics`. Confirm the forecast area chart, the velocity bar chart (bars colored by delta), and — if closed deals exist — the donut render; the tables remain below. Screenshot. Zero console errors.

---

## Task 8: Dashboard drill-through + health distribution

**Files:**
- Modify: `artifacts/edc/src/pages/dashboard.tsx`

**Interfaces:**
- Consumes: `useLocation` from `wouter`; existing `summary` shape (`totalTCV`, `criticalAlerts[]` with `dealId`+`dealName`+`alert.message`, `staleDeals[]`, `dealsByHealth`).

No unit test; verified by Playwright.

- [ ] **Step 1: Add navigation import + helper**

At the top of `dashboard.tsx`:

```tsx
import { useLocation } from "wouter";
```
Inside the component, after `const summary = ...`:

```tsx
const [, navigate] = useLocation();
```

- [ ] **Step 2: Make each KPI card clickable**

Wrap each of the four `<Card>`s in a focusable button-like wrapper. For the Total TCV card, replace its opening `<Card className="bg-card border-border shadow-sm">` with:

```tsx
<Card
  role="button"
  tabIndex={0}
  onClick={() => navigate("/portfolio")}
  onKeyDown={(e) => { if (e.key === "Enter") navigate("/portfolio"); }}
  className="bg-card border-border shadow-sm cursor-pointer transition-colors hover:border-primary/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
>
```
Apply the same pattern to the other three cards with these destinations: Critical Alerts → `navigate("/deals")`; Stale Deals → `navigate("/deals")`; Health Status → `navigate("/portfolio")`. Close each with the existing `</Card>`.

- [ ] **Step 3: Make Action Required rows navigate to the deal**

Replace the alert row `<div key={i} className="flex justify-between items-start p-3 bg-card border border-border rounded-md">` with a button:

```tsx
<button
  key={i}
  type="button"
  onClick={() => alert.dealId && navigate(`/deals/${alert.dealId}`)}
  className="w-full text-left flex justify-between items-start p-3 bg-card border border-border rounded-md cursor-pointer transition-colors hover:border-primary/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
>
```
Close with `</button>` instead of the old `</div>`. (`alert.dealId` exists on the summary's criticalAlerts items; if typecheck reports it missing, use the existing `alert` object's id field it flags.)

- [ ] **Step 4: Add a health-distribution bar to fill the lower area**

Below the existing `<div className="grid grid-cols-1 lg:grid-cols-2 gap-6">…</div>` (the Action Required / Recent Activity row), add a new card:

```tsx
<Card>
  <CardHeader><CardTitle>Portfolio Health</CardTitle></CardHeader>
  <CardContent>
    {(() => {
      const g = summary?.dealsByHealth?.GREEN ?? 0;
      const y = summary?.dealsByHealth?.YELLOW ?? 0;
      const r = summary?.dealsByHealth?.RED ?? 0;
      const total = g + y + r || 1;
      return (
        <div className="space-y-2">
          <div className="flex h-3 w-full overflow-hidden rounded-full" role="img"
               aria-label={`${g} green, ${y} yellow, ${r} red deals`}>
            <div className="bg-emerald-500" style={{ width: `${(g / total) * 100}%` }} />
            <div className="bg-amber-500" style={{ width: `${(y / total) * 100}%` }} />
            <div className="bg-red-500" style={{ width: `${(r / total) * 100}%` }} />
          </div>
          <div className="flex gap-4 text-xs text-muted-foreground">
            <span>{g} Green</span><span>{y} Yellow</span><span>{r} Red</span>
          </div>
        </div>
      );
    })()}
  </CardContent>
</Card>
```

- [ ] **Step 5: Typecheck + visual checkpoint**

Run: `pnpm --filter @workspace/edc run typecheck` → PASS.
With dev running, on `/` confirm: KPI cards and alert rows navigate on click and on Enter, show hover/focus affordance; the health bar fills the lower area; no large empty band at 1440px. Screenshot.

---

## Task 9: Responsive app shell

**Files:**
- Modify: `artifacts/edc/src/components/layout.tsx`

**Interfaces:**
- Consumes: `Sheet`, `SheetContent`, `SheetTrigger` from `@/components/ui/sheet`; `useIsMobile` from `@/hooks/use-mobile`; `Menu` from `lucide-react`.

No unit test; verified by Playwright.

- [ ] **Step 1: Extract the nav into a shared fragment**

In `layout.tsx`, refactor the sidebar inner content (brand + nav list + footer user/theme/logout) into a local component `SidebarBody` so it can render both in the persistent aside and inside the sheet:

```tsx
function SidebarBody({ location, user, onNavigate, onLogout }: {
  location: string; user: { email?: string; role?: string } | undefined;
  onNavigate?: () => void; onLogout: () => void;
}) {
  return (
    <>
      <div className="p-6 border-b border-border">
        <h1 className="text-xl font-bold tracking-tight text-primary">EDC</h1>
        <p className="text-xs text-muted-foreground mt-1 uppercase tracking-widest font-mono">Commander Console</p>
      </div>
      <nav className="flex-1 p-4 space-y-1">
        {navItems.map((item) => {
          const isActive = location === item.href;
          return (
            <Link key={item.href} href={item.href} onClick={onNavigate}>
              <span className={`flex items-center gap-3 px-3 py-2 rounded-md transition-colors ${isActive ? "bg-primary/10 text-primary font-medium" : "text-muted-foreground hover:bg-muted hover:text-foreground"}`}>
                <item.icon className="h-4 w-4" />
                {item.label}
              </span>
            </Link>
          );
        })}
      </nav>
      <div className="p-4 border-t border-border space-y-2">
        <div className="mb-2">
          <p className="text-sm font-medium">{user?.email}</p>
          <p className="text-xs text-muted-foreground capitalize">{user?.role}</p>
        </div>
        <ThemeToggle />
        <Button variant="outline" className="w-full justify-start text-muted-foreground" onClick={onLogout}>
          <LogOut className="mr-2 h-4 w-4" /> Logout
        </Button>
      </div>
    </>
  );
}
```
Move `navItems` to module scope (above `Layout`) so both `SidebarBody` and any sheet can read it.

- [ ] **Step 2: Add imports and mobile state**

```tsx
import { useState } from "react";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";
import { useIsMobile } from "@/hooks/use-mobile";
import { Menu } from "lucide-react";
```
Inside `Layout`: `const isMobile = useIsMobile(); const [navOpen, setNavOpen] = useState(false);`

(`useIsMobile` is the confirmed export; its breakpoint is 768px — below 768 is "mobile".)

- [ ] **Step 3: Render persistent sidebar on desktop, sheet on mobile**

Replace the `return (...)` body with:

```tsx
return (
  <div className="flex h-screen overflow-hidden bg-background">
    {!isMobile && (
      <aside className="w-64 border-r border-border bg-card flex flex-col">
        <SidebarBody location={location} user={user} onLogout={handleLogout} />
      </aside>
    )}
    <div className="flex-1 flex flex-col min-w-0">
      {isMobile && (
        <header className="flex items-center gap-3 border-b border-border bg-card px-4 h-14">
          <Sheet open={navOpen} onOpenChange={setNavOpen}>
            <SheetTrigger asChild>
              <Button variant="outline" size="icon" aria-label="Open navigation">
                <Menu className="h-5 w-5" />
              </Button>
            </SheetTrigger>
            <SheetContent side="left" className="w-64 p-0 flex flex-col">
              <SidebarBody location={location} user={user} onNavigate={() => setNavOpen(false)} onLogout={handleLogout} />
            </SheetContent>
          </Sheet>
          <span className="font-bold tracking-tight text-primary">EDC</span>
        </header>
      )}
      <main className="flex-1 overflow-auto bg-background">
        <div className="h-full">{children}</div>
      </main>
    </div>
  </div>
);
```

- [ ] **Step 4: Typecheck**

Run: `pnpm --filter @workspace/edc run typecheck` → PASS.

- [ ] **Step 5: Visual checkpoint at all widths (Playwright)**

With dev running, resize to 375, 768, 1024, 1440. Confirm: below 768 shows a top bar + hamburger that opens the nav sheet (tapping an item navigates and closes the sheet); at 768 and above shows the persistent sidebar; no horizontal body scroll at any width. Screenshot 375 and 1440.

---

## Task 10: Empty states + typography polish

**Files:**
- Modify: `artifacts/edc/src/pages/analytics.tsx`
- Modify: `artifacts/edc/src/components/cockpit/v2/competitive-panel.tsx`
- Modify: `artifacts/edc/src/components/cockpit/v2/stakeholders-panel.tsx`

**Interfaces:**
- Consumes: `Empty`, `EmptyHeader`, `EmptyMedia` (use `variant="icon"`), `EmptyTitle`, `EmptyDescription` from `@/components/ui/empty` (confirmed exports).

No unit test; verified by Playwright.

- [ ] **Step 1: Replace the analytics competitive empty string**

In `analytics.tsx`, replace `<p className="text-muted-foreground text-sm">No competitor encounters logged.</p>` with an Empty block:

```tsx
<Empty>
  <EmptyHeader>
    <EmptyMedia variant="icon"><Swords className="h-5 w-5" /></EmptyMedia>
    <EmptyTitle>No competitor encounters yet</EmptyTitle>
    <EmptyDescription>Log competitors on a deal's Competitive tab to see win rates here.</EmptyDescription>
  </EmptyHeader>
</Empty>
```
Add imports: `import { Empty, EmptyHeader, EmptyMedia, EmptyTitle, EmptyDescription } from "@/components/ui/empty";` and `import { Swords } from "lucide-react";` (merge into the existing lucide import).

- [ ] **Step 2: Replace the win/loss empty string**

Replace `<p className="text-muted-foreground text-sm">No closed deals yet — win/loss populates as deals close.</p>` with an Empty block titled "No closed deals yet" and description "Win/loss populates automatically as deals reach Closed-Won or Closed-Lost." (icon: `TrendingUp`, already imported).

- [ ] **Step 3: Replace bare empty strings in competitive-panel and stakeholders-panel**

Open each panel; where it renders a bare "No …" paragraph for the empty case, swap in the same `Empty` pattern with a fitting icon (`Swords` for competitive, `Users` for stakeholders) and a one-line CTA. (If a panel has no empty branch, skip it — do not invent one.)

- [ ] **Step 4: Typography pass in analytics + dashboard**

Ensure uppercase `tracking-wider` is used only on section/KPI labels (already the case on dashboard KPI titles). No change needed if already conformant; otherwise convert inline field labels to normal-case `text-muted-foreground`. This step is a review — make edits only where a label is uppercased that is not a section/KPI header.

- [ ] **Step 5: Typecheck + visual checkpoint**

Run: `pnpm --filter @workspace/edc run typecheck` → PASS.
With dev running, view `/analytics` with no competitor/closed data and confirm the Empty components render with icon + title + description + (where applicable) CTA. Screenshot.

---

## Task 11: PWA install — manifest, plugin, icons, viewport

**Files:**
- Modify: `artifacts/edc/package.json` (add `vite-plugin-pwa` dev dep)
- Modify: `artifacts/edc/vite.config.ts`
- Modify: `artifacts/edc/index.html`
- Create: `artifacts/edc/public/icon-192.png`, `icon-512.png`, `icon-512-maskable.png`, `apple-touch-icon.png`
- Create: `artifacts/edc/src/pwa.d.ts`

**Interfaces:**
- Produces: a build that emits `manifest.webmanifest` + `sw.js`; ambient types for the PWA virtual modules (consumed by Task 13).

No unit test; verified by build artifacts + Playwright.

- [ ] **Step 1: Add the dependency**

From the repo root, run (uses Git Bash so the pnpm preinstall `sh` hook works):

```bash
pnpm --filter @workspace/edc add -D vite-plugin-pwa
```
Expected: resolves and installs (honors `minimumReleaseAge: 1440`).

- [ ] **Step 2: Generate the four PNG icons**

Create `icon-192.png` (192×192), `icon-512.png` (512×512), `icon-512-maskable.png` (512×512 with ~12% safe padding), and `apple-touch-icon.png` (180×180) in `artifacts/edc/public/`. Design: solid indigo `#5b8cff` background, centered white "EDC" wordmark. Produce them by rasterizing a canvas with the available Playwright browser:

1. Write a temp HTML file to the scratchpad that draws the icon on a `<canvas id="c">` for a size given via `?s=` and a boolean `?pad=` for the maskable, then exposes the data URL on `window.__png = c.toDataURL("image/png")`.
2. Serve the scratchpad over HTTP (e.g. `python -m http.server`) and, for each of `s=192`, `s=512`, `s=512&pad=1`, `s=180`, open the page in Playwright, read `window.__png` via `browser_evaluate`, strip the `data:image/png;base64,` prefix, base64-decode, and write the bytes to the matching file with the Write/Bash tooling.

Verify each file: `file artifacts/edc/public/icon-192.png` → `PNG image data, 192 x 192` (and 512/512/180 for the others), all non-empty.

- [ ] **Step 3: Add `VitePWA` to the Vite config**

In `vite.config.ts`, import and register the plugin (after `tailwindcss()`):

```ts
import { VitePWA } from "vite-plugin-pwa";
```
```ts
    tailwindcss(),
    VitePWA({
      registerType: "prompt",
      includeAssets: ["favicon.svg", "apple-touch-icon.png"],
      manifest: {
        name: "Enterprise Deal Commander",
        short_name: "EDC",
        description: "Deal Commander cockpit — economics, validation gates, and risk intelligence.",
        theme_color: "#15171a",
        background_color: "#15171a",
        display: "standalone",
        start_url: ".",
        scope: ".",
        icons: [
          { src: "icon-192.png", sizes: "192x192", type: "image/png" },
          { src: "icon-512.png", sizes: "512x512", type: "image/png" },
          { src: "icon-512-maskable.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
        ],
      },
      workbox: {
        navigateFallback: "index.html",
        navigateFallbackDenylist: [/^\/api\//],
      },
    }),
```
(`start_url`/`scope`/`src` are relative so they respect the configurable Vite `base`. Runtime caching is added in Task 12.)

- [ ] **Step 4: Fix the viewport meta and add theme-color + apple-touch-icon**

In `index.html`, replace line 5:

```html
    <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1" />
```
with:

```html
    <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
    <meta name="theme-color" content="#15171a" />
    <link rel="apple-touch-icon" href="/apple-touch-icon.png" />
```
(Removing `maximum-scale=1` restores pinch-zoom — an accessibility fix.)

- [ ] **Step 5: Add ambient PWA types**

Create `src/pwa.d.ts`:

```ts
/// <reference types="vite-plugin-pwa/client" />
/// <reference types="vite-plugin-pwa/react" />
```

- [ ] **Step 6: Build and verify artifacts**

Run: `PORT=5173 BASE_PATH=/ pnpm --filter @workspace/edc run build`
Expected: `dist/public/manifest.webmanifest` and `dist/public/sw.js` exist. Confirm with `ls dist/public | grep -E "manifest|sw"`.

- [ ] **Step 7: Checkpoint**

Run: `pnpm --filter @workspace/edc run typecheck` → PASS. Report that manifest + sw.js are emitted and all four icons are valid PNGs.

---

## Task 12: PWA offline — runtime caching for reads

**Files:**
- Modify: `artifacts/edc/vite.config.ts` (extend the `workbox` block from Task 11)

**Interfaces:**
- Consumes: the `VitePWA` registration from Task 11.

No unit test; verified by a Playwright offline run against the preview build.

- [ ] **Step 1: Add runtime caching rules**

Extend the `workbox` object in `vite.config.ts` to:

```ts
      workbox: {
        navigateFallback: "index.html",
        navigateFallbackDenylist: [/^\/api\//],
        runtimeCaching: [
          {
            urlPattern: ({ url, request }) =>
              request.method === "GET" &&
              /\/api\/v[12]\//.test(url.pathname) &&
              !/\/api\/v1\/auth\//.test(url.pathname),
            handler: "StaleWhileRevalidate",
            options: {
              cacheName: "edc-api-reads",
              expiration: { maxEntries: 60, maxAgeSeconds: 86400 },
              cacheableResponse: { statuses: [0, 200] },
            },
          },
        ],
      },
```
Auth (`/api/v1/auth/*`) and all non-GET requests fall through to network (never cached).

- [ ] **Step 2: Build the app**

Run: `PORT=5173 BASE_PATH=/ pnpm --filter @workspace/edc run build`
Expected: build succeeds; `sw.js` includes the `edc-api-reads` runtime route (it will reference the cache name).

- [ ] **Step 3: Offline verification (Playwright against preview)**

Ensure the API server is running on :5000. Start the preview build: `PORT=5173 BASE_PATH=/ pnpm --filter @workspace/edc run serve`. In Playwright: navigate to `http://localhost:5173`, log in, open the dashboard (populates `edc-api-reads`). Then set the browser context offline and reload. Confirm: the app shell loads and last-seen deal/summary data still renders. Attempt an edit (a mutation) while offline and confirm it fails with an error toast (no false success). Screenshot the offline dashboard.

- [ ] **Step 4: Checkpoint**

Report: offline reload renders cached data; offline mutation fails gracefully.

---

## Task 13: PWA update prompt + offline banner

**Files:**
- Create: `artifacts/edc/src/components/pwa-update-prompt.tsx`
- Create: `artifacts/edc/src/components/offline-banner.tsx`
- Modify: `artifacts/edc/src/App.tsx` (mount both)

**Interfaces:**
- Consumes: `useRegisterSW` from `virtual:pwa-register/react` (types from `src/pwa.d.ts`); `useToast` from `@/hooks/use-toast`.

No unit test; verified by Playwright.

- [ ] **Step 1: Update prompt component**

Create `pwa-update-prompt.tsx`:

```tsx
import { useEffect } from "react";
import { useRegisterSW } from "virtual:pwa-register/react";
import { useToast } from "@/hooks/use-toast";
import { ToastAction } from "@/components/ui/toast";

export function PwaUpdatePrompt() {
  const { toast } = useToast();
  const { needRefresh: [needRefresh], updateServiceWorker } = useRegisterSW();

  useEffect(() => {
    if (needRefresh) {
      toast({
        title: "New version available",
        description: "Reload to get the latest Deal Commander.",
        action: (
          <ToastAction altText="Reload" onClick={() => updateServiceWorker(true)}>
            Reload
          </ToastAction>
        ),
      });
    }
  }, [needRefresh, toast, updateServiceWorker]);

  return null;
}
```

- [ ] **Step 2: Offline banner component**

Create `offline-banner.tsx`:

```tsx
import { useEffect, useState } from "react";
import { WifiOff } from "lucide-react";

export function OfflineBanner() {
  const [offline, setOffline] = useState(!navigator.onLine);
  useEffect(() => {
    const on = () => setOffline(false);
    const off = () => setOffline(true);
    window.addEventListener("online", on);
    window.addEventListener("offline", off);
    return () => {
      window.removeEventListener("online", on);
      window.removeEventListener("offline", off);
    };
  }, []);

  if (!offline) return null;
  return (
    <div className="fixed bottom-0 inset-x-0 z-50 flex items-center justify-center gap-2 bg-amber-500/95 text-amber-950 text-sm py-1.5 px-3">
      <WifiOff className="h-4 w-4" />
      Offline — showing last-synced data
    </div>
  );
}
```

- [ ] **Step 3: Mount both in `App.tsx`**

Add imports and render them inside the providers (e.g. just before `<Toaster />`):

```tsx
import { PwaUpdatePrompt } from "@/components/pwa-update-prompt";
import { OfflineBanner } from "@/components/offline-banner";
```
```tsx
          <Toaster />
          <PwaUpdatePrompt />
          <OfflineBanner />
```

- [ ] **Step 4: Typecheck**

Run: `pnpm --filter @workspace/edc run typecheck`
Expected: PASS (the `virtual:pwa-register/react` import resolves via `src/pwa.d.ts`).

- [ ] **Step 5: Visual checkpoint**

With the preview build running, toggle the Playwright context offline and confirm the amber "Offline — showing last-synced data" banner appears, and disappears when back online. Screenshot.

---

## Task 14: Retire `/m`; clear caches on logout

**Files:**
- Modify: `artifacts/edc/src/App.tsx` (remove `MobileHome` route, add `/m` → `/` redirect)
- Modify: `artifacts/edc/src/components/layout.tsx` (`handleLogout` clears caches + query cache)

**Interfaces:**
- Consumes: `useQueryClient` (if not already in layout) for cache clear.

No unit test; verified by Playwright.

- [ ] **Step 1: Redirect `/m` to `/`**

In `App.tsx`, remove `import MobileHome from "@/pages/mobile";` and replace the `<Route path="/m" .../>` line with a redirect using wouter's `Redirect`:

```tsx
import { Redirect } from "wouter";
```
```tsx
<Route path="/m"><Redirect to="/" /></Route>
```

- [ ] **Step 2: Clear caches on logout**

In `layout.tsx`, import the query client and clear both the Cache Storage and React Query cache in `handleLogout`:

```tsx
import { useQueryClient } from "@tanstack/react-query";
```
Inside `Layout`: `const queryClient = useQueryClient();`
Update `handleLogout`:

```tsx
const handleLogout = async () => {
  try {
    await logout.mutateAsync();
    queryClient.clear();
    if ("caches" in window) {
      const keys = await caches.keys();
      await Promise.all(keys.filter((k) => k.includes("edc-api-reads")).map((k) => caches.delete(k)));
    }
    setLocation("/login");
  } catch (e) {
    console.error(e);
  }
};
```

- [ ] **Step 3: Typecheck**

Run: `pnpm --filter @workspace/edc run typecheck` → PASS.

- [ ] **Step 4: Verification (Playwright, preview build)**

Confirm `/m` redirects to `/`. Log in, load dashboard (populate cache), log out, then go offline and reload `/` → confirm no cached deal data is shown (only the login/loading path). Screenshot.

---

## Task 15: Mobile deal roster cards + touch targets + safe areas

**Files:**
- Modify: `artifacts/edc/src/pages/deals.tsx` (card list below `sm`; keyboard-activatable rows)
- Modify: `artifacts/edc/src/index.css` (reduced-motion gate; safe-area utilities)

**Interfaces:**
- Consumes: existing `deals`, `formatCurrency`.

No unit test; verified by Playwright.

- [ ] **Step 1: Render a card list on phones, table on `sm`+**

In `deals.tsx`, wrap the existing `<Card><Table>…</Table></Card>` so the table only shows at `sm` and up, and add a card list for below `sm`. Add the table wrapper class `hidden sm:block` on the existing `<Card>`, and after it insert:

```tsx
<div className="sm:hidden space-y-3">
  {deals.map((deal) => (
    <Link key={deal.id} href={`/deals/${deal.id}`}
      className="block rounded-lg border p-4 transition-colors hover:border-primary/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
      <div className="flex items-center justify-between">
        <span className="font-semibold">{deal.accountName}</span>
        <Badge className={
          deal.healthStatus === "RED" ? "bg-destructive text-white"
          : deal.healthStatus === "YELLOW" ? "bg-amber-500 text-white"
          : "bg-emerald-500 text-white"
        }>{deal.healthStatus}</Badge>
      </div>
      <p className="text-sm text-muted-foreground">{deal.dealName}</p>
      <p className="text-xl font-bold font-mono mt-1">{formatCurrency(deal.calculatedTCV, deal.dealCurrency)}</p>
    </Link>
  ))}
</div>
```
(The card list reuses the retired `/m` view's shape. Bulk-select checkboxes stay desktop-only — acceptable for v1.)

- [ ] **Step 2: Ensure touch targets and tap behavior**

In `index.css`, add a base utility so interactive controls have no tap delay; append to the `@layer base` block:

```css
  button, a, [role="button"] { touch-action: manipulation; }
```

- [ ] **Step 3: Add safe-area padding to the mobile top bar**

In `layout.tsx`, on the mobile `<header>` element (from Task 9), add safe-area padding:

```tsx
<header className="flex items-center gap-3 border-b border-border bg-card px-4 h-14"
  style={{ paddingTop: "env(safe-area-inset-top)", paddingLeft: "max(1rem, env(safe-area-inset-left))" }}>
```

- [ ] **Step 4: Gate page-transition animations behind reduced-motion**

The dashboard/settings pages use `animate-in fade-in slide-in-from-bottom-4`. Add a global guard in `index.css` (append after `@layer base`):

```css
@media (prefers-reduced-motion: reduce) {
  *, *::before, *::after {
    animation-duration: 0.01ms !important;
    animation-iteration-count: 1 !important;
    transition-duration: 0.01ms !important;
    scroll-behavior: auto !important;
  }
}
```

- [ ] **Step 5: Typecheck + final visual checkpoint**

Run: `pnpm --filter @workspace/edc run typecheck` → PASS.
At 375px: the deals roster is a card list with no horizontal scroll; tapping a card opens the cockpit; primary touch targets are comfortably ≥44px. With OS reduced-motion on, page transitions don't slide. Screenshot 375px roster.

---

## Final verification

- [ ] **Full typecheck:** `pnpm run typecheck` (root) → all packages PASS.
- [ ] **Full build:** `PORT=5173 BASE_PATH=/ pnpm --filter @workspace/edc run build` → PASS, manifest + sw.js emitted.
- [ ] **Unit tests:** `pnpm --filter @workspace/edc run test` → cockpit-tabs + transforms suites PASS (existing `engine-recompute.test.ts` still passes).
- [ ] **Playwright sweep:** cockpit (5 grouped tabs, no wrap, header menu), analytics (3 charts), dashboard (drill-through + health bar), shell at 375/768/1024/1440, PWA install (manifest+SW) and offline reload, `/m` redirect. Zero console errors.
