# Human Touch Layer — Phase 3 (Engagement) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a Productivity Streak, an Achievement System, Celebration Moments (toasts), Motivational Progress copy, and an End-of-Day Reflection card to Enterprise Deal Commander — the five PRD "Phase 3: Engagement" features — per the approved design at `docs/superpowers/specs/2026-07-23-human-touch-phase3-engagement-design.md`.

**Architecture:** One new table (`edc_v2.commander_achievements`) and one new endpoint (`GET /v2/analytics/engagement`) are the only backend additions — everything is evaluated live at request time (no event subscriber), matching how `next-actions`/`memory-insights` already work. The streak is computed entirely client-side from the existing activity-log endpoint (no backend involvement at all). `useDashboardVisit()` moves from `DashboardHero` up into `pages/dashboard.tsx` so the new `CelebrationWatcher` and the streak calculation can share the same "since last visit" boundary without a second mutation call.

**Tech Stack:** Express 5 + Drizzle (Postgres) API, contract-first via `lib/api-spec/openapi.yaml` → Orval codegen, React 19 + Vite + Tailwind v4 + shadcn/ui frontend, `wouter` routing, `@tanstack/react-query`, Vitest for pure logic.

## Global Constraints

- Spec: `docs/superpowers/specs/2026-07-23-human-touch-phase3-engagement-design.md` — read it if anything below is ambiguous.
- Single-user app — no multi-tenant/privacy logic; no FK from the new table to `commanders`.
- Tone: warm, professional, concise; no sarcasm.
- Schema changes: additive only, applied via direct SQL under `lib/db/sql/*.sql` (idempotent `CREATE TABLE IF NOT EXISTS`) — never `drizzle-kit push` (hits an interactive TTY truncate prompt in this repo).
- API changes are contract-first: edit `lib/api-spec/openapi.yaml`, then `pnpm --filter @workspace/api-spec run codegen` regenerates Zod + React Query hooks — never hand-edit `src/generated/**`.
- Pure modules follow the established `src/lib/{greetings,mission,weekly}/*` convention exactly: dependencies injected (`now: Date`, `store: KeyValueStore` from `@/lib/storage` where relevant), never throw, defensive `JSON.parse`/`Array.isArray`/type-guards, key names `edc.<feature>.<thing>`. TDD — failing test first.
- No automated component/route tests (this repo's only automated tests are Vitest pure-function unit tests, no DB/route-mocking infra) — DB-touching routes and components are verified live against the running dev stack.
- Local dev stack is Windows/**PowerShell** (Git Bash mangles `BASE_PATH`/`export`).
- Touch targets ≥44px; `prefers-reduced-motion` respected for any new motion; WCAG AA contrast.
- Commits: Conventional-Commits with scope (`feat(db):`, `feat(api):`, `feat(edc):`), imperative, lowercase, no trailing period, one per task.

## Dependency Graph & Parallelization

```
Task 1 (schema) ─► Task 2 (contract+codegen) ─► Task 3 (route) ──────────┐
                                                                          │
Task 4  (compute-streak.ts, pure)            ──────────────────────┐    │
Task 5  (achievements-settings.tsx)         [needs Task 2's hook] ──┤    │
Task 6  (build-queue.ts, pure)               ──────────────────────┤    │
Task 7  (celebration-watcher.tsx)  [needs Tasks 2, 4, 6] ───────────┤    │
Task 8  (playbook-panel.tsx progress copy, independent)    ─────────┤    │
Task 9  (reflection/dismiss.ts, pure)        ──────────────────────┐│    │
Task 10 (end-of-day-reflection.tsx) [needs Task 9]     ────────────┴┴────┤
                                                                          │
Task 11 (combined wiring: dashboard-hero.tsx + dashboard.tsx) [needs 3,4,7,10] ─► Task 12 (verification)
```

Tasks 4, 5, 6+7, 8, 9+10 touch five **disjoint** sets of new/existing files (none of them edit `dashboard.tsx` or `dashboard-hero.tsx`) — safe to parallelize across subagents once Tasks 1-3 (backend) land. Task 11 is the only task touching the two shared dashboard files, done last, after every component it mounts already exists — same pattern used for Phase 2's combined wiring task.

---

## Task 1: `commander_achievements` table

**Files:**
- Modify: `lib/db/src/schema/edc_v2_intel.ts` (append a new section at the end of the file)
- Create: `lib/db/sql/2026-07-23-commander-achievements.sql`

**Interfaces:**
- Produces: `commanderAchievements` (Drizzle table, `{achievementCode: string; earnedAt: Date}`), imported from `@workspace/db` by Task 3.

- [ ] **Step 1: Append the Drizzle table definition**

At the end of `lib/db/src/schema/edc_v2_intel.ts`, add:

```ts
/* ------------------------------------------- Phase 3 Engagement — Achievements */

/**
 * Permanent ledger of earned achievements. Achievement criteria are
 * evaluated live on every GET /v2/analytics/engagement call; a row is
 * inserted here the first time a criterion is found true and stays forever
 * afterward, even if the underlying metric later dips back below threshold
 * (e.g. a reopened playbook step reduces the "completed" count). No FK to
 * `commanders` — single-commander app, same reasoning as every other
 * `edc_v2` durable table not needing one.
 */
export const commanderAchievements = edcV2.table("commander_achievements", {
  achievementCode: varchar("achievement_code", { length: 60 }).primaryKey(),
  earnedAt: timestamp("earned_at", { withTimezone: true }).notNull().defaultNow(),
});
```

- [ ] **Step 2: Write the direct-SQL migration**

Create `lib/db/sql/2026-07-23-commander-achievements.sql`:

```sql
-- Human Touch Phase 3 (Engagement): achievement-earned ledger (2026-07)
--
-- Records which achievements have been permanently earned and when.
-- Mirrors the Drizzle schema in lib/db/src/schema/edc_v2_intel.ts
-- (commanderAchievements). Achievement criteria are evaluated live on each
-- GET /v2/analytics/engagement call; a row is inserted here the first time
-- a criterion is found true and stays forever afterward.
--
-- Safe to re-run (idempotent): CREATE TABLE uses IF NOT EXISTS.
--
--   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f lib/db/sql/2026-07-23-commander-achievements.sql

BEGIN;

CREATE TABLE IF NOT EXISTS edc_v2.commander_achievements (
  achievement_code varchar(60) PRIMARY KEY,
  earned_at timestamptz NOT NULL DEFAULT now()
);

COMMIT;
```

- [ ] **Step 3: Apply the migration to the local dev database and verify**

Run (PowerShell):

```powershell
& "C:\Program Files\PostgreSQL\17\bin\psql.exe" "postgres://postgres:postgres@localhost:5432/edc" -v ON_ERROR_STOP=1 -f lib/db/sql/2026-07-23-commander-achievements.sql
& "C:\Program Files\PostgreSQL\17\bin\psql.exe" "postgres://postgres:postgres@localhost:5432/edc" -c "\d edc_v2.commander_achievements"
```

Expected: the `\d` output lists `achievement_code | character varying(60) | not null` (primary key) and `earned_at | timestamp with time zone | not null`.

- [ ] **Step 4: Typecheck**

Run: `pnpm run typecheck`
Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add lib/db/src/schema/edc_v2_intel.ts lib/db/sql/2026-07-23-commander-achievements.sql
git commit -m "feat(db): add commander_achievements table"
```

---

## Task 2: API contract — `GET /v2/analytics/engagement`

**Files:**
- Modify: `lib/api-spec/openapi.yaml`

**Interfaces:**
- Produces (after codegen): `useGetEngagement(params?: {since?: string}, options?)` and `getGetEngagementQueryKey(params?)` from `@workspace/api-client-react`. Consumed by Tasks 5 and 7.

- [ ] **Step 1: Add the path**

In `lib/api-spec/openapi.yaml`, find the `/v2/analytics/memory-insights` block (around line 1169) and insert immediately after it:

```yaml
  /v2/analytics/engagement:
    get:
      operationId: getEngagement
      tags: [v2intel]
      parameters:
        - { name: since, in: query, required: false, schema: { type: string } }
      responses:
        "200": { description: Achievement state and since-last-visit celebration triggers, content: { application/json: { schema: { $ref: "#/components/schemas/GenericDataResponse" } } } }
```

- [ ] **Step 2: Regenerate the Zod schemas and React Query hooks**

Run: `pnpm --filter @workspace/api-spec run codegen`
Expected: exits 0.

- [ ] **Step 3: Verify the generated output**

Run (PowerShell):

```powershell
Select-String -Path "lib/api-client-react/src/generated/api.ts" -Pattern "useGetEngagement"
Select-String -Path "lib/api-client-react/src/generated/api.ts" -Pattern "getGetEngagementQueryKey"
```

Expected: both patterns are found.

- [ ] **Step 4: Typecheck**

Run: `pnpm run typecheck`
Expected: no errors (generated code only; nothing consumes it yet).

- [ ] **Step 5: Commit**

```bash
git add lib/api-spec/openapi.yaml lib/api-zod/src/generated lib/api-client-react/src/generated
git commit -m "feat(api): add GET /v2/analytics/engagement contract"
```

---

## Task 3: Backend route — achievement evaluation

**Files:**
- Modify: `artifacts/api-server/src/routes/v2/analytics.ts`

**Interfaces:**
- Consumes: `commanderAchievements` (Task 1), `enterpriseDeals`, `pipelineStages`, `dealPlaybookAssignments`, `dealCompetitors` (all already imported in this file, from `@workspace/db`), `computeSummary()` (from `../../lib/portfolio`).
- Produces: `GET /analytics/engagement` → `{ data: { achievements: {code,name,description,earnedAt,locked}[], newlyEarnedCodes: string[], dealsClosedWonSince: {dealId,dealName}[] } }`. Consumed by Tasks 5 and 7.

- [ ] **Step 1: Add `commanderAchievements` to the existing `@workspace/db` import**

In `artifacts/api-server/src/routes/v2/analytics.ts`, the import block starting at line 3 already lists `dealPlaybookAssignments`, `dealCompetitors`, `enterpriseDeals`, `pipelineStages`. Add `commanderAchievements` to that same list.

- [ ] **Step 2: Add `gte` to the drizzle-orm import**

Line 2 currently reads:

```ts
import { and, asc, desc, eq, inArray, isNull, lte, max, ne, notInArray, sql } from "drizzle-orm";
```

Change to:

```ts
import { and, asc, desc, eq, gte, inArray, isNull, lte, max, ne, notInArray, sql } from "drizzle-orm";
```

- [ ] **Step 3: Add the `computeSummary` import**

Near the other local-lib imports at the top of the file, add:

```ts
import { computeSummary } from "../../lib/portfolio";
```

- [ ] **Step 4: Add the route**

Insert this block immediately after the `/analytics/memory-health` route (around line 827, before the `/* ------------------------------------- Competitive & Pricing Intelligence */` comment):

```ts
/* ------------------------------------------ Dashboard: Engagement (Achievements) */

interface AchievementDef {
  code: string;
  name: string;
  description: string;
}

// Rescaled to this app's actual data volume (~12-14 deals) rather than the
// PRD's literal examples (100 closes, 25-deal veteran) — see the design spec
// for why. Permanence comes from the commander_achievements table, not from
// these live metrics being monotonic: dealPlaybookAssignments.status CAN
// revert on a reopened step, but once earned, an achievement stays earned.
const ACHIEVEMENT_DEFS: AchievementDef[] = [
  { code: "first_close", name: "First Deal Closed", description: "Every journey starts with a single close." },
  { code: "playbooks_3", name: "3 Playbooks Completed", description: "Process is what separates good from great." },
  { code: "giant_slayer", name: "Giant Slayer", description: "You don't just close deals — you win them." },
  { code: "clean_pipeline", name: "Clean Pipeline", description: "Zero stalled deals, zero red alerts. Enjoy the calm." },
];

async function evaluateAchievements(): Promise<Record<string, boolean>> {
  // Deliberately NOT the file's `activeFilter` (deletedAt IS NULL AND
  // archivedAt IS NULL) — a Closed-Won deal is typically archived shortly
  // after closing (post-mortem subscriber), so excluding archived deals
  // would undercount "ever closed." Only true deletions should be excluded.
  const [closedWonRow] = await db
    .select({ count: sql<number>`count(*)` })
    .from(enterpriseDeals)
    .innerJoin(pipelineStages, eq(enterpriseDeals.salesStageId, pipelineStages.id))
    .where(and(eq(pipelineStages.stageName, "Closed-Won"), isNull(enterpriseDeals.deletedAt)));

  const [playbooksRow] = await db
    .select({ count: sql<number>`count(*)` })
    .from(dealPlaybookAssignments)
    .where(eq(dealPlaybookAssignments.status, "Completed"));

  const wonAgainst = await db
    .select({ competitorId: dealCompetitors.competitorId })
    .from(dealCompetitors)
    .where(eq(dealCompetitors.status, "Won Against"));
  const distinctCompetitorsBeaten = new Set(wonAgainst.map((r) => r.competitorId)).size;

  const summary = await computeSummary();

  return {
    first_close: Number(closedWonRow.count) >= 1,
    playbooks_3: Number(playbooksRow.count) >= 3,
    giant_slayer: distinctCompetitorsBeaten >= 2,
    clean_pipeline: summary.staleDeals.length === 0 && summary.dealsByHealth.RED === 0,
  };
}

router.get("/analytics/engagement", async (req: Request, res: Response) => {
  const since = typeof req.query.since === "string" ? req.query.since : undefined;

  const trueNow = await evaluateAchievements();
  const existingRows = await db.select().from(commanderAchievements);
  const existingCodes = new Set(existingRows.map((r) => r.achievementCode));
  // First-ever evaluation (empty table): silently backfill whatever's
  // already true rather than reporting it as "newly earned" — the live dev
  // DB already has real history predating this feature, and toasting 2-3
  // "achievement unlocked" celebrations on the first load after deploy
  // would misrepresent things that actually happened weeks ago.
  const isFirstEverEvaluation = existingRows.length === 0;

  const newlyEarnedCodes: string[] = [];
  for (const def of ACHIEVEMENT_DEFS) {
    if (trueNow[def.code] && !existingCodes.has(def.code)) {
      await db.insert(commanderAchievements).values({ achievementCode: def.code }).onConflictDoNothing();
      if (!isFirstEverEvaluation) newlyEarnedCodes.push(def.code);
    }
  }

  const finalRows = await db.select().from(commanderAchievements);
  const earnedMap = new Map(finalRows.map((r) => [r.achievementCode, r.earnedAt]));
  const achievements = ACHIEVEMENT_DEFS.map((def) => ({
    code: def.code,
    name: def.name,
    description: def.description,
    earnedAt: earnedMap.get(def.code)?.toISOString() ?? null,
    locked: !earnedMap.has(def.code),
  }));

  let dealsClosedWonSince: { dealId: string; dealName: string }[] = [];
  if (since) {
    const rows = await db
      .select({ id: enterpriseDeals.id, dealName: enterpriseDeals.dealName })
      .from(enterpriseDeals)
      .innerJoin(pipelineStages, eq(enterpriseDeals.salesStageId, pipelineStages.id))
      .where(
        and(
          eq(pipelineStages.stageName, "Closed-Won"),
          isNull(enterpriseDeals.deletedAt),
          gte(enterpriseDeals.stageEnteredAt, new Date(since)),
        ),
      );
    dealsClosedWonSince = rows.map((d) => ({ dealId: d.id, dealName: d.dealName }));
  }

  res.json({ data: { achievements, newlyEarnedCodes, dealsClosedWonSince } });
});
```

- [ ] **Step 5: Typecheck**

Run: `pnpm --filter @workspace/api-server run typecheck`
Expected: no errors.

- [ ] **Step 6: Build and verify live against the local dev DB**

```powershell
pnpm --filter @workspace/api-server run build
```

If the API server (port 5000) is already running, stop it and restart per the repo's local-run convention:

```powershell
$env:DATABASE_URL='postgres://postgres:postgres@localhost:5432/edc'; $env:SESSION_SECRET='local-dev-secret-edc-2026'; $env:PORT='5000'; $env:NODE_ENV='development'; node --enable-source-maps artifacts/api-server/dist/index.mjs
```

In a second terminal, log in and hit the new endpoint:

```powershell
$session = Invoke-WebRequest -Uri "http://localhost:5000/api/v1/auth/login" -Method POST -ContentType "application/json" -Body '{"email":"commander","password":"DealCommander!2026"}' -SessionVariable sess
Invoke-RestMethod -Uri "http://localhost:5000/api/v2/analytics/engagement" -Method GET -WebSession $sess
Invoke-RestMethod -Uri "http://localhost:5000/api/v2/analytics/engagement?since=2020-01-01T00:00:00.000Z" -Method GET -WebSession $sess
```

Expected: first call returns `{"achievements":[...4 items...],"newlyEarnedCodes":[],"dealsClosedWonSince":[]}` (empty on the very first call per the backfill rule — locked/earned states depend on this dev DB's actual current data, but no codes should appear in `newlyEarnedCodes`). Second call (with an old `since`) returns a non-empty `dealsClosedWonSince` if any deal in this dev DB is currently Closed-Won (confirmed earlier this session that at least one is — "Northgate Financial").

- [ ] **Step 7: Commit**

```bash
git add artifacts/api-server/src/routes/v2/analytics.ts
git commit -m "feat(api): add achievement evaluation to the engagement route"
```

### ✔ Checkpoint: Backend foundation
- [ ] `pnpm run typecheck` → clean.
- [ ] Live `GET /v2/analytics/engagement` verified per Step 6 above.

---

## Task 4: `compute-streak.ts` (pure)

**Files:**
- Create: `artifacts/edc/src/lib/streak/compute-streak.ts`
- Test: `artifacts/edc/src/lib/streak/compute-streak.test.ts`

**Interfaces:**
- Produces: `computeStreak(occurredAtISOStrings: string[], now: Date): number`. Consumed by Task 7 (celebration-watcher) and Task 11 (DashboardHero's inline streak display).

- [ ] **Step 1: Write the failing test**

Create `artifacts/edc/src/lib/streak/compute-streak.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { computeStreak } from "./compute-streak";

function at(year: number, month: number, day: number, hour = 12): Date {
  return new Date(year, month - 1, day, hour, 0, 0, 0);
}

function iso(year: number, month: number, day: number, hour = 12): string {
  return at(year, month, day, hour).toISOString();
}

describe("computeStreak", () => {
  it("returns 0 for no activity", () => {
    expect(computeStreak([], at(2026, 7, 23))).toBe(0);
  });

  it("counts a single active day (today) as a streak of 1", () => {
    expect(computeStreak([iso(2026, 7, 23, 9)], at(2026, 7, 23, 15))).toBe(1);
  });

  it("counts consecutive active days ending today", () => {
    const activity = [iso(2026, 7, 21, 9), iso(2026, 7, 22, 9), iso(2026, 7, 23, 9)];
    expect(computeStreak(activity, at(2026, 7, 23, 15))).toBe(3);
  });

  it("stops at the first gap", () => {
    const activity = [iso(2026, 7, 19, 9), iso(2026, 7, 22, 9), iso(2026, 7, 23, 9)];
    expect(computeStreak(activity, at(2026, 7, 23, 15))).toBe(2);
  });

  it("doesn't zero out when today has no activity yet, if yesterday was active", () => {
    const activity = [iso(2026, 7, 21, 9), iso(2026, 7, 22, 9)];
    expect(computeStreak(activity, at(2026, 7, 23, 8))).toBe(2);
  });

  it("returns 0 if neither today nor yesterday has activity", () => {
    expect(computeStreak([iso(2026, 7, 20, 9)], at(2026, 7, 23, 15))).toBe(0);
  });

  it("dedupes multiple events on the same local day", () => {
    const activity = [iso(2026, 7, 23, 8), iso(2026, 7, 23, 9), iso(2026, 7, 23, 20)];
    expect(computeStreak(activity, at(2026, 7, 23, 15))).toBe(1);
  });

  it("ignores unparseable timestamps defensively", () => {
    expect(computeStreak(["not-a-date", iso(2026, 7, 23, 9)], at(2026, 7, 23, 15))).toBe(1);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm --filter @workspace/edc exec vitest run src/lib/streak/compute-streak.test.ts`
Expected: FAIL — cannot find module `./compute-streak`.

- [ ] **Step 3: Implement compute-streak.ts**

Create `artifacts/edc/src/lib/streak/compute-streak.ts`:

```ts
/**
 * Pure streak calculator: counts consecutive local calendar days with at
 * least one activity-log event, walking backward from today (or yesterday,
 * if today has no activity yet — an in-progress day shouldn't zero out the
 * display). Mirrors `src/lib/weekly/week-boundaries.ts`'s local-time
 * convention: the backend has no timezone awareness anywhere in this app,
 * so this stays entirely client-side, operating on ISO timestamps already
 * fetched via the existing `/v2/activity?since=` endpoint. No new backend
 * endpoint exists for this — see the design spec.
 */

const ONE_DAY_MS = 24 * 60 * 60 * 1000;

function localDateKey(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export function computeStreak(occurredAtISOStrings: string[], now: Date): number {
  const activeDays = new Set<string>();
  for (const iso of occurredAtISOStrings) {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) continue;
    activeDays.add(localDateKey(d));
  }

  const todayKey = localDateKey(now);
  const yesterday = new Date(now.getTime() - ONE_DAY_MS);
  const yesterdayKey = localDateKey(yesterday);

  let cursor: Date;
  if (activeDays.has(todayKey)) {
    cursor = now;
  } else if (activeDays.has(yesterdayKey)) {
    cursor = yesterday;
  } else {
    return 0;
  }

  let streak = 0;
  while (activeDays.has(localDateKey(cursor))) {
    streak++;
    cursor = new Date(cursor.getTime() - ONE_DAY_MS);
  }
  return streak;
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm --filter @workspace/edc exec vitest run src/lib/streak/compute-streak.test.ts`
Expected: PASS (8 tests).

- [ ] **Step 5: Commit**

```bash
git add artifacts/edc/src/lib/streak/compute-streak.ts artifacts/edc/src/lib/streak/compute-streak.test.ts
git commit -m "feat(edc): add local-day streak calculator"
```

---

## Task 5: Achievements Settings tab

**Files:**
- Create: `artifacts/edc/src/components/settings/achievements-settings.tsx`
- Modify: `artifacts/edc/src/pages/settings.tsx`

**Interfaces:**
- Consumes: `useGetEngagement` (Task 2's generated hook).
- Produces: `AchievementsSettings` component, mounted in the new `"achievements"` Settings tab.

- [ ] **Step 1: Implement the component**

Create `artifacts/edc/src/components/settings/achievements-settings.tsx`:

```tsx
import { useGetEngagement } from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Trophy } from "lucide-react";

interface Achievement {
  code: string;
  name: string;
  description: string;
  earnedAt: string | null;
  locked: boolean;
}
interface EngagementData {
  achievements: Achievement[];
}

// Elegant, not childish, per the PRD: a clean list, no badges, no
// animation, no leaderboard (free in a single-user app). Locked
// achievements show name only — the description is withheld client-side
// (not a security boundary, purely presentation) so discovery stays part
// of the experience.
export function AchievementsSettings() {
  const { data, isLoading } = useGetEngagement();
  const achievements = (data?.data as EngagementData | undefined)?.achievements ?? [];

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Trophy className="h-4 w-4 text-primary" />
          Achievements
        </CardTitle>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <Skeleton className="h-48 w-full" />
        ) : achievements.length === 0 ? (
          <p className="text-sm text-muted-foreground">Nothing earned yet. Keep going.</p>
        ) : (
          <ul className="space-y-4">
            {achievements.map((a) => (
              <li key={a.code} className="space-y-0.5">
                <p className={a.locked ? "text-sm font-medium text-muted-foreground" : "text-sm font-medium"}>
                  {a.locked ? "○" : "✓"} {a.name}
                </p>
                {!a.locked && <p className="text-xs text-muted-foreground">{a.description}</p>}
                {!a.locked && a.earnedAt && (
                  <p className="text-xs text-muted-foreground">
                    Earned {new Date(a.earnedAt).toLocaleDateString()}
                  </p>
                )}
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
```

- [ ] **Step 2: Wire the new tab into Settings**

In `artifacts/edc/src/pages/settings.tsx`, add the import (line 18, after `ScoringWeightsSettings`):

```tsx
import { AchievementsSettings } from "@/components/settings/achievements-settings";
```

Add a new tab trigger — replace line 77 (`<TabsTrigger value="team">Team</TabsTrigger>`) with:

```tsx
          <TabsTrigger value="team">Team</TabsTrigger>
          <TabsTrigger value="achievements">Achievements</TabsTrigger>
```

Add the matching content block — replace lines 135-137:

```tsx
        <TabsContent value="team" className="pt-4">
          <TeamSettings />
        </TabsContent>
```

with:

```tsx
        <TabsContent value="team" className="pt-4">
          <TeamSettings />
        </TabsContent>
        <TabsContent value="achievements" className="pt-4">
          <AchievementsSettings />
        </TabsContent>
```

- [ ] **Step 3: Typecheck**

Run: `pnpm --filter @workspace/edc run typecheck`
Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add artifacts/edc/src/components/settings/achievements-settings.tsx artifacts/edc/src/pages/settings.tsx
git commit -m "feat(edc): add Achievements tab to Settings"
```

---

## Task 6: `build-queue.ts` (pure, celebration queue)

**Files:**
- Create: `artifacts/edc/src/lib/celebrations/build-queue.ts`
- Test: `artifacts/edc/src/lib/celebrations/build-queue.test.ts`

**Interfaces:**
- Produces: `CelebrationPayload {id; title; description?}`, `BuildQueueInputs {dealsClosedWonSince; newlyEarnedAchievements; streakMilestoneCrossed}`, `buildCelebrationQueue(inputs): CelebrationPayload[]`, `streakMilestoneCrossed(previousStreak, currentStreak): number | null`. Consumed by Task 7.

- [ ] **Step 1: Write the failing test**

Create `artifacts/edc/src/lib/celebrations/build-queue.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { buildCelebrationQueue, streakMilestoneCrossed } from "./build-queue";

describe("buildCelebrationQueue", () => {
  it("returns an empty queue when nothing changed", () => {
    expect(
      buildCelebrationQueue({ dealsClosedWonSince: [], newlyEarnedAchievements: [], streakMilestoneCrossed: null }),
    ).toEqual([]);
  });

  it("queues one entry per newly closed-won deal", () => {
    const q = buildCelebrationQueue({
      dealsClosedWonSince: [
        { dealId: "d1", dealName: "Acme" },
        { dealId: "d2", dealName: "Globex" },
      ],
      newlyEarnedAchievements: [],
      streakMilestoneCrossed: null,
    });
    expect(q).toHaveLength(2);
    expect(q[0].title).toBe("Deal closed");
    expect(q[0].description).toContain("Acme");
  });

  it("queues one entry per newly earned achievement", () => {
    const q = buildCelebrationQueue({
      dealsClosedWonSince: [],
      newlyEarnedAchievements: [{ code: "first_close", name: "First Deal Closed", description: "..." }],
      streakMilestoneCrossed: null,
    });
    expect(q).toHaveLength(1);
    expect(q[0].title).toBe("Achievement unlocked: First Deal Closed");
  });

  it("queues a streak milestone entry when one was crossed", () => {
    const q = buildCelebrationQueue({
      dealsClosedWonSince: [],
      newlyEarnedAchievements: [],
      streakMilestoneCrossed: 7,
    });
    expect(q).toHaveLength(1);
    expect(q[0].title).toBe("7-day streak");
  });

  it("orders deals-closed before achievements before streak, combining all three", () => {
    const q = buildCelebrationQueue({
      dealsClosedWonSince: [{ dealId: "d1", dealName: "Acme" }],
      newlyEarnedAchievements: [{ code: "first_close", name: "First Deal Closed", description: "..." }],
      streakMilestoneCrossed: 7,
    });
    expect(q.map((c) => c.id)).toEqual(["deal-closed-d1", "achievement-first_close", "streak-7"]);
  });
});

describe("streakMilestoneCrossed", () => {
  it("returns null when no milestone boundary was crossed", () => {
    expect(streakMilestoneCrossed(3, 5)).toBeNull();
  });
  it("returns the milestone value when crossed", () => {
    expect(streakMilestoneCrossed(6, 7)).toBe(7);
  });
  it("returns the smallest milestone crossed if multiple were skipped over", () => {
    expect(streakMilestoneCrossed(5, 15)).toBe(7);
  });
  it("returns null if already past the milestone (no re-crossing)", () => {
    expect(streakMilestoneCrossed(10, 12)).toBeNull();
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm --filter @workspace/edc exec vitest run src/lib/celebrations/build-queue.test.ts`
Expected: FAIL — cannot find module `./build-queue`.

- [ ] **Step 3: Implement build-queue.ts**

Create `artifacts/edc/src/lib/celebrations/build-queue.ts`:

```ts
/**
 * Pure celebration-queue builder. The existing toast store
 * (`hooks/use-toast.ts`) has TOAST_LIMIT=1 — a second `toast()` call
 * silently evicts the first rather than queuing it — so `CelebrationWatcher`
 * (the consumer of this module) drains this list one at a time on a timer
 * instead of firing every celebration at once.
 */

export interface CelebrationPayload {
  id: string;
  title: string;
  description?: string;
}

export interface BuildQueueInputs {
  dealsClosedWonSince: { dealId: string; dealName: string }[];
  newlyEarnedAchievements: { code: string; name: string; description: string }[];
  streakMilestoneCrossed: number | null;
}

const STREAK_MILESTONES = [7, 14, 30, 60, 90];

export function buildCelebrationQueue(inputs: BuildQueueInputs): CelebrationPayload[] {
  const queue: CelebrationPayload[] = [];
  for (const deal of inputs.dealsClosedWonSince) {
    queue.push({
      id: `deal-closed-${deal.dealId}`,
      title: "Deal closed",
      description: `${deal.dealName} — congratulations.`,
    });
  }
  for (const a of inputs.newlyEarnedAchievements) {
    queue.push({
      id: `achievement-${a.code}`,
      title: `Achievement unlocked: ${a.name}`,
      description: a.description,
    });
  }
  if (inputs.streakMilestoneCrossed !== null) {
    queue.push({
      id: `streak-${inputs.streakMilestoneCrossed}`,
      title: `${inputs.streakMilestoneCrossed}-day streak`,
      description: "Consistency compounds.",
    });
  }
  return queue;
}

/** Returns the smallest named milestone whose boundary was crossed between the two streak values, or null. */
export function streakMilestoneCrossed(previousStreak: number, currentStreak: number): number | null {
  for (const m of STREAK_MILESTONES) {
    if (previousStreak < m && currentStreak >= m) return m;
  }
  return null;
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm --filter @workspace/edc exec vitest run src/lib/celebrations/build-queue.test.ts`
Expected: PASS (9 tests).

- [ ] **Step 5: Commit**

```bash
git add artifacts/edc/src/lib/celebrations/build-queue.ts artifacts/edc/src/lib/celebrations/build-queue.test.ts
git commit -m "feat(edc): add pure celebration-queue builder"
```

---

## Task 7: `<CelebrationWatcher />`

**Files:**
- Create: `artifacts/edc/src/components/dashboard/celebration-watcher.tsx`

**Interfaces:**
- Consumes: `useGetEngagement` (Task 2), `useListPortfolioActivity` (existing), `computeStreak` (Task 4), `buildCelebrationQueue`/`streakMilestoneCrossed` (Task 6), `useToast` (`@/hooks/use-toast`).
- Produces: `CelebrationWatcher({previousVisitAt}: {previousVisitAt: string | null | undefined})` — non-visual (`return null`), consumed by Task 11.

- [ ] **Step 1: Implement the component**

Create `artifacts/edc/src/components/dashboard/celebration-watcher.tsx`:

```tsx
import { useEffect, useRef, useState } from "react";
import { useGetEngagement, useListPortfolioActivity } from "@workspace/api-client-react";
import { useToast } from "@/hooks/use-toast";
import {
  buildCelebrationQueue,
  streakMilestoneCrossed,
  type CelebrationPayload,
} from "@/lib/celebrations/build-queue";
import { computeStreak } from "@/lib/streak/compute-streak";

const NINETY_DAYS_MS = 90 * 24 * 60 * 60 * 1000;
const TOAST_ADVANCE_MS = 4500;

interface EngagementAchievement {
  code: string;
  name: string;
  description: string;
}
interface EngagementData {
  achievements: EngagementAchievement[];
  newlyEarnedCodes: string[];
  dealsClosedWonSince: { dealId: string; dealName: string }[];
}

// Non-visual. Builds the list of celebration-worthy events since the
// commander's last visit (deals closed-won, achievements newly earned,
// a streak milestone crossed) and drains it through the existing toast
// store one at a time. `previousVisitAt` is passed down from
// `pages/dashboard.tsx` (see Task 11) rather than fetched here, so this
// shares the exact same "since last visit" boundary DashboardHero's
// welcome-back memory already uses — no second mutation call.
export function CelebrationWatcher({
  previousVisitAt,
}: {
  previousVisitAt: string | null | undefined;
}) {
  const { toast } = useToast();
  const enabled = previousVisitAt !== undefined && previousVisitAt !== null;

  const engagementParams = { since: previousVisitAt ?? undefined };
  const { data: engagementWrapper, isLoading: isLoadingEngagement } = useGetEngagement(engagementParams, {
    query: { enabled },
  });

  // Locked once per mount — otherwise every render would mint a new `since`
  // (millisecond-precision) for the activity query, triggering a continuous
  // refetch loop (same hazard `dashboard-hero.tsx`'s `since24h` guards against).
  const [ninetyDaysAgo] = useState(() => new Date(Date.now() - NINETY_DAYS_MS).toISOString());
  const { data: activityWrapper, isLoading: isLoadingActivity } = useListPortfolioActivity({
    since: ninetyDaysAgo,
    limit: 500,
  });

  const dataReady = enabled && !isLoadingEngagement && !isLoadingActivity;
  const queueRef = useRef<CelebrationPayload[] | null>(null);

  if (dataReady && queueRef.current === null) {
    const engagement = engagementWrapper?.data as EngagementData | undefined;
    const activity = activityWrapper?.data ?? [];
    const occurredAt = activity.map((e) => e.occurredAt);

    const now = new Date();
    const previous = new Date(previousVisitAt as string);
    const priorOccurredAt = occurredAt.filter((iso) => new Date(iso).getTime() <= previous.getTime());

    const streakNow = computeStreak(occurredAt, now);
    const streakBefore = computeStreak(priorOccurredAt, previous);
    const crossed = streakMilestoneCrossed(streakBefore, streakNow);

    const newlyEarnedAchievements = (engagement?.achievements ?? []).filter((a) =>
      (engagement?.newlyEarnedCodes ?? []).includes(a.code),
    );

    queueRef.current = buildCelebrationQueue({
      dealsClosedWonSince: engagement?.dealsClosedWonSince ?? [],
      newlyEarnedAchievements,
      streakMilestoneCrossed: crossed,
    });
  }
  const queue = queueRef.current;

  const drainedRef = useRef(false);
  useEffect(() => {
    if (!queue || queue.length === 0 || drainedRef.current) return;
    drainedRef.current = true;

    let index = 0;
    function showNext() {
      const item = queue![index];
      toast({ title: item.title, description: item.description });
      index++;
      if (index < queue!.length) setTimeout(showNext, TOAST_ADVANCE_MS);
    }
    showNext();
    // Drains exactly once, the moment a non-empty queue is first computed.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [queue]);

  return null;
}
```

- [ ] **Step 2: Typecheck**

Run: `pnpm --filter @workspace/edc run typecheck`
Expected: no errors. (If `useGetEngagement`'s generated param signature doesn't match `(params, options)` exactly, adjust to whatever Orval actually generated — check `lib/api-client-react/src/generated/api.ts`'s `useGetEngagement` signature, which is the source of truth.)

- [ ] **Step 3: Commit**

```bash
git add artifacts/edc/src/components/dashboard/celebration-watcher.tsx
git commit -m "feat(edc): add CelebrationWatcher (deal-closed, achievement, streak toasts)"
```

---

## Task 8: Motivational progress copy on the Playbook Journey bar

**Files:**
- Modify: `artifacts/edc/src/components/cockpit/v2/playbook-panel.tsx`

**Interfaces:** None (self-contained presentational change).

- [ ] **Step 1: Add the threshold-message helper**

Near the top of `artifacts/edc/src/components/cockpit/v2/playbook-panel.tsx` (outside the component function, alongside any other top-level helpers already in the file), add:

```ts
function progressMessage(pct: number): string | null {
  if (pct >= 100) return "All playbooks complete. Nice work.";
  if (pct >= 90) return "Almost there.";
  if (pct >= 75) return "Well past the halfway point.";
  if (pct >= 50) return "Halfway there.";
  if (pct >= 25) return "Off to a solid start.";
  return null;
}
```

- [ ] **Step 2: Render the message**

Replace lines 393-398:

```tsx
        <div className="space-y-1.5 pt-1">
          <Progress value={overallPct} />
          <p className="text-xs text-muted-foreground">
            {completedSteps}/{totalSteps} steps · {playbooksComplete}/{journey.length} playbooks complete
          </p>
        </div>
```

with:

```tsx
        <div className="space-y-1.5 pt-1">
          <Progress value={overallPct} />
          <p className="text-xs text-muted-foreground">
            {completedSteps}/{totalSteps} steps · {playbooksComplete}/{journey.length} playbooks complete
          </p>
          {progressMessage(overallPct) && (
            <p className="text-xs text-muted-foreground">{progressMessage(overallPct)}</p>
          )}
        </div>
```

- [ ] **Step 3: Typecheck**

Run: `pnpm --filter @workspace/edc run typecheck`
Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add artifacts/edc/src/components/cockpit/v2/playbook-panel.tsx
git commit -m "content(edc): add threshold-based progress copy to the playbook journey bar"
```

---

## Task 9: `reflection/dismiss.ts` (pure)

**Files:**
- Create: `artifacts/edc/src/lib/reflection/dismiss.ts`
- Test: `artifacts/edc/src/lib/reflection/dismiss.test.ts`

**Interfaces:**
- Produces: `isDismissedToday(store, now): boolean`, `dismissToday(store, now): void`. Consumed by Task 10.

- [ ] **Step 1: Write the failing test**

Create `artifacts/edc/src/lib/reflection/dismiss.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { isDismissedToday, dismissToday } from "./dismiss";
import type { KeyValueStore } from "@/lib/storage";

function fakeStore(initial: Record<string, string> = {}): KeyValueStore {
  const data = { ...initial };
  return {
    getItem: (key) => data[key] ?? null,
    setItem: (key, value) => {
      data[key] = value;
    },
  };
}

describe("isDismissedToday / dismissToday", () => {
  it("is not dismissed when nothing is stored", () => {
    expect(isDismissedToday(fakeStore(), new Date(2026, 6, 23, 17))).toBe(false);
  });

  it("is dismissed after calling dismissToday for the same local date", () => {
    const store = fakeStore();
    const now = new Date(2026, 6, 23, 17);
    dismissToday(store, now);
    expect(isDismissedToday(store, now)).toBe(true);
  });

  it("is not dismissed on a different local date than the one stored", () => {
    const store = fakeStore();
    dismissToday(store, new Date(2026, 6, 23, 17));
    expect(isDismissedToday(store, new Date(2026, 6, 24, 9))).toBe(false);
  });

  it("never throws when the store throws", () => {
    const throwing: KeyValueStore = {
      getItem: () => {
        throw new Error("boom");
      },
      setItem: () => {
        throw new Error("boom");
      },
    };
    expect(() => isDismissedToday(throwing, new Date())).not.toThrow();
    expect(() => dismissToday(throwing, new Date())).not.toThrow();
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm --filter @workspace/edc exec vitest run src/lib/reflection/dismiss.test.ts`
Expected: FAIL — cannot find module `./dismiss`.

- [ ] **Step 3: Implement dismiss.ts**

Create `artifacts/edc/src/lib/reflection/dismiss.ts`:

```ts
// Per-day dismissal for End-of-Day Reflection — mirrors
// `src/lib/mission/daily-ack.ts`'s local-date-key convention (reset at
// local midnight), NOT `src/lib/weekly/review-dismiss.ts`'s week-keyed one.

import type { KeyValueStore } from "@/lib/storage";

const DISMISSED_KEY = "edc.reflection.dismissed";

function localDateKey(now: Date): string {
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, "0");
  const d = String(now.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

/** Whether today's End-of-Day Reflection has already been dismissed. Never throws. */
export function isDismissedToday(store: KeyValueStore, now: Date): boolean {
  let raw: string | null;
  try {
    raw = store.getItem(DISMISSED_KEY);
  } catch {
    return false;
  }
  return raw === localDateKey(now);
}

/** Marks today's reflection as dismissed (overwrites any prior stored date). Never throws. */
export function dismissToday(store: KeyValueStore, now: Date): void {
  try {
    store.setItem(DISMISSED_KEY, localDateKey(now));
  } catch {
    // localStorage full/unavailable — the dismissal just won't persist this round.
  }
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm --filter @workspace/edc exec vitest run src/lib/reflection/dismiss.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add artifacts/edc/src/lib/reflection/dismiss.ts artifacts/edc/src/lib/reflection/dismiss.test.ts
git commit -m "feat(edc): add per-day End-of-Day Reflection dismissal store"
```

---

## Task 10: `<EndOfDayReflection />`

**Files:**
- Create: `artifacts/edc/src/components/dashboard/widgets/end-of-day-reflection.tsx`

**Interfaces:**
- Consumes: `useListPortfolioActivity`, `getListPortfolioActivityQueryKey` (existing), `isDismissedToday`/`dismissToday` (Task 9), `defaultStore` (`@/lib/storage`).
- Produces: `EndOfDayReflection` (no props) — consumed by Task 11.

- [ ] **Step 1: Implement the component**

Create `artifacts/edc/src/components/dashboard/widgets/end-of-day-reflection.tsx`:

```tsx
import { useState } from "react";
import { X, Moon } from "lucide-react";
import { useListPortfolioActivity, getListPortfolioActivityQueryKey } from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { defaultStore } from "@/lib/storage";
import { isDismissedToday, dismissToday } from "@/lib/reflection/dismiss";

const EOD_HOUR = 16;

function plural(n: number, word: string): string {
  return `${n} ${word}${n === 1 ? "" : "s"}`;
}

function localMidnight(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate(), 0, 0, 0, 0);
}

// Widget — End-of-Day Reflection (PRD 4.20). Renders only from 16:00 local
// onward, summarizing today's activity (stage advances + playbook
// completions since local midnight). Structurally a sibling of Phase 2's
// WeeklyReview Friday branch, just windowed to "today" instead of "this
// week", and dismissed per-day rather than per-week.
export function EndOfDayReflection() {
  // Locked once per mount — see dashboard-hero.tsx's `since24h` comment for
  // why (otherwise every render mints a new query key and refetch-loops).
  const [now] = useState(() => new Date());
  const active = now.getHours() >= EOD_HOUR;
  const [locallyDismissed, setLocallyDismissed] = useState(false);

  const todayWindow = {
    since: localMidnight(now).toISOString(),
    until: now.toISOString(),
    limit: 200,
  };
  const { data: activityWrapper, isLoading } = useListPortfolioActivity(todayWindow, {
    query: { enabled: active, queryKey: getListPortfolioActivityQueryKey(todayWindow) },
  });

  function handleDismiss() {
    dismissToday(defaultStore, now);
    setLocallyDismissed(true);
  }

  if (!active || locallyDismissed || isDismissedToday(defaultStore, now)) {
    return null;
  }

  const activity = activityWrapper?.data ?? [];
  const stageAdvances = activity.filter((e) => e.eventType === "deal.stage_changed").length;
  const playbookCompletions = activity.filter(
    (e) => e.eventType === "playbook.step_changed" && e.metadata?.action === "completed",
  ).length;
  const totalToday = stageAdvances + playbookCompletions;

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <Moon className="h-4 w-4 text-primary" />
          Today
        </CardTitle>
        <button
          type="button"
          onClick={handleDismiss}
          aria-label="Dismiss today's reflection"
          className="inline-flex min-h-[44px] min-w-[44px] -mr-2 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted/50 hover:text-foreground cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <X className="h-4 w-4" aria-hidden />
        </button>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <Skeleton className="h-16 w-full" />
        ) : totalToday === 0 ? (
          <p className="text-sm text-muted-foreground">A quiet day. Tomorrow's a fresh start.</p>
        ) : (
          <ul className="space-y-1.5 text-sm">
            <li>{plural(stageAdvances, "stage advance")} today</li>
            <li>{plural(playbookCompletions, "playbook step")} completed</li>
            <li className="text-muted-foreground pt-1">Excellent work today.</li>
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
```

- [ ] **Step 2: Typecheck**

Run: `pnpm --filter @workspace/edc run typecheck`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add artifacts/edc/src/components/dashboard/widgets/end-of-day-reflection.tsx
git commit -m "feat(edc): add End-of-Day Reflection widget"
```

### ✔ Checkpoint: Feature slices
- [ ] `pnpm --filter @workspace/edc exec vitest run src/lib/streak src/lib/celebrations src/lib/reflection` → all PASS.
- [ ] `pnpm --filter @workspace/edc run typecheck` → clean.

---

## Task 11: Combined wiring — `previousVisitAt` refactor + mount everything

**Files:**
- Modify: `artifacts/edc/src/components/dashboard/dashboard-hero.tsx`
- Modify: `artifacts/edc/src/pages/dashboard.tsx`

Done as one combined task (not split) since both files are shared by multiple prior tasks' outputs — mirrors how Phase 2's final wiring task was handled.

**Interfaces:**
- Consumes: `computeStreak` (Task 4), `CelebrationWatcher` (Task 7), `EndOfDayReflection` (Task 10).

- [ ] **Step 1: Remove the internal visit-mutation from `DashboardHero`, accept a prop instead**

In `artifacts/edc/src/components/dashboard/dashboard-hero.tsx`:

Remove `useDashboardVisit` from the import block (line 5).

Change the component signature (line 22) from:

```tsx
export function DashboardHero() {
```

to:

```tsx
export function DashboardHero({
  previousVisitAt,
}: {
  previousVisitAt: string | null | undefined;
}) {
```

Delete lines 25-38 (the `dashboardVisit`/`touched`/`setPreviousVisitAt` mutation block):

```tsx
  const dashboardVisit = useDashboardVisit();
  const touched = useRef(false);
  const [previousVisitAt, setPreviousVisitAt] = useState<string | null | undefined>(undefined);

  useEffect(() => {
    if (touched.current) return;
    touched.current = true;
    dashboardVisit.mutateAsync().then(
      (res) => setPreviousVisitAt(res.previousVisitAt),
      () => setPreviousVisitAt(null),
    );
    // Intentionally fires exactly once per mount, not on every dep identity churn.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

```

(The rest of the file — `welcomeBackEnabled`, the `useListPortfolioActivity` welcome-back query, the greeting logic — is unchanged; it already reads `previousVisitAt`, which is now the prop instead of local state.)

- [ ] **Step 2: Add the streak fetch + inline display to `DashboardHero`**

Add the import (alongside the other `@/lib/greetings/*` imports):

```tsx
import { computeStreak } from "@/lib/streak/compute-streak";
```

Add a new module-level constant alongside the file's existing `const SEVEN_DAYS_MS = 7 * ONE_DAY_MS;` (same style — a day-multiple constant, not recomputed per-render):

```tsx
const NINETY_DAYS_MS = 90 * ONE_DAY_MS;
```

After the existing `since24h` state (the line reading `const [since24h] = useState(...)`), add:

```tsx
  const [streakWindowStart] = useState(() => new Date(Date.now() - NINETY_DAYS_MS).toISOString());
  const streakParams = { since: streakWindowStart, limit: 500 };
  const { data: streakActivityWrapper } = useListPortfolioActivity(streakParams, {
    query: { queryKey: getListPortfolioActivityQueryKey(streakParams) },
  });
  const streak = computeStreak((streakActivityWrapper?.data ?? []).map((e) => e.occurredAt), new Date());
```

(`getListPortfolioActivityQueryKey` is already imported in this file.)

In the JSX, add the streak line directly below the greeting block (after the `{subline && ...}` line, still inside the `lockedGreeting ? (...)` branch):

```tsx
          {streak > 0 && (
            <p className="text-xs text-muted-foreground mt-1">
              🔥 {streak} day{streak === 1 ? "" : "s"} active
            </p>
          )}
```

- [ ] **Step 3: Typecheck `dashboard-hero.tsx` in isolation**

Run: `pnpm --filter @workspace/edc run typecheck`
Expected: errors at this point are expected only in `dashboard.tsx` (Step 4 fixes them) — `dashboard-hero.tsx` itself should be clean.

- [ ] **Step 4: Move the visit-mutation into `pages/dashboard.tsx`, mount the new components**

In `artifacts/edc/src/pages/dashboard.tsx`:

Change the React import (line 1) from:

```tsx
import { useState } from "react";
```

to:

```tsx
import { useEffect, useRef, useState } from "react";
```

Add `useDashboardVisit` to the existing `@workspace/api-client-react` import block (alongside `useGetIntelligenceSummary`, etc.).

Add the new component imports (alongside the existing `DailyMission`/`InsightBanner`/`WeeklyReview` imports):

```tsx
import { CelebrationWatcher } from "@/components/dashboard/celebration-watcher";
import { EndOfDayReflection } from "@/components/dashboard/widgets/end-of-day-reflection";
```

Inside the `Dashboard` component, add the mutation block (near the top, alongside the other hook calls, before the `if (isLoading)` early return):

```tsx
  const dashboardVisit = useDashboardVisit();
  const dashboardVisitTouched = useRef(false);
  const [previousVisitAt, setPreviousVisitAt] = useState<string | null | undefined>(undefined);

  useEffect(() => {
    if (dashboardVisitTouched.current) return;
    dashboardVisitTouched.current = true;
    dashboardVisit.mutateAsync().then(
      (res) => setPreviousVisitAt(res.previousVisitAt),
      () => setPreviousVisitAt(null),
    );
    // Intentionally fires exactly once per mount, not on every dep identity churn.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
```

Replace the existing render block:

```tsx
      <DashboardHero />
      <InsightBanner />
      <WeeklyReview />
      <DailyMission />
```

with:

```tsx
      <DashboardHero previousVisitAt={previousVisitAt} />
      <CelebrationWatcher previousVisitAt={previousVisitAt} />
      <InsightBanner />
      <WeeklyReview />
      <EndOfDayReflection />
      <DailyMission />
```

- [ ] **Step 5: Typecheck**

Run: `pnpm --filter @workspace/edc run typecheck`
Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add artifacts/edc/src/components/dashboard/dashboard-hero.tsx artifacts/edc/src/pages/dashboard.tsx
git commit -m "feat(edc): lift previousVisitAt to dashboard.tsx, wire streak + celebrations + end-of-day reflection"
```

---

## Task 12: Live verification + full suite (no commit — verification only)

- [ ] **Step 1: Ensure the dev stack is up (PowerShell)**

```powershell
Get-NetTCPConnection -LocalPort 5000,5173 -State Listen -ErrorAction SilentlyContinue |
  Select-Object LocalPort, OwningProcess
```

Since Task 1/3 changed the DB schema and backend code, rebuild and restart the API process regardless of whether it's already running (`pnpm --filter @workspace/api-server run build`, stop the existing `node.exe` on :5000, relaunch per Task 3 Step 6's command). Start the frontend if not already running:

```powershell
$env:PORT='5173'; $env:BASE_PATH='/'; pnpm --filter @workspace/edc run dev
```

- [ ] **Step 2: Drive an achievement + celebration through the live app**

Using Playwright/chrome-devtools MCP: log in, navigate to a deal in Procurement, advance it to Closed-Won (via the close-deal UI). Reload the dashboard.

Expected: a "Deal closed" toast appears; shortly after (once its display window elapses) an "Achievement unlocked: First Deal Closed" toast follows if this is genuinely the first Closed-Won deal in this dev DB's `commander_achievements` history — otherwise no achievement toast (already earned in the first-run backfill), confirm via the Settings → Achievements tab that "First Deal Closed" shows unlocked with an earned date either way.

- [ ] **Step 3: Verify the Streak**

Confirm `DashboardHero` shows "🔥 N days active" (N ≥ 1, since today's action above counts). Confirm it's a small inline line, not a separate card.

- [ ] **Step 4: Verify Achievements Settings tab**

Navigate to Settings → Achievements. Confirm unlocked achievements show name + description + earned date; any locked ones show name only (no description).

- [ ] **Step 5: Verify Motivational Progress copy**

Open a deal's cockpit with an in-progress playbook. Confirm the Playbook Journey progress bar shows the new threshold line beneath the existing "X/Y steps" caption (e.g. "Halfway there." at ~50%).

- [ ] **Step 6: Verify End-of-Day Reflection gating**

If the local system clock is currently ≥16:00, confirm the "Today" card renders with today's activity counts and the X dismiss button removes it (persisting across reload same-day). If it's earlier than 16:00, confirm the card is absent, and note this as clock-gated (spot-check via a temporary date stub if you need to exercise the Friday-equivalent branch without waiting).

- [ ] **Step 7: Mobile + reduced motion**

Resize to ~390×844: confirm no horizontal scroll, all touch targets (dismiss buttons) remain ≥44px. Emulate `prefers-reduced-motion`: confirm no new animation appears (none of Task 4-11's additions introduce motion beyond what already exists).

- [ ] **Step 8: Full checks**

```powershell
pnpm run typecheck
pnpm --filter @workspace/edc exec vitest run
```

Expected: both exit 0.

- [ ] **Step 9: Report results**

Summarize what was confirmed live; flag anything not exercisable (e.g. the End-of-Day Reflection's active branch if run before 16:00 local, or achievements that were already backfilled from pre-existing dev-DB data rather than freshly earned during this verification pass).

### ✔ Final Checkpoint
- [ ] Every task's acceptance criteria met; full typecheck + test suite green; all 5 features verified live; ready to commit/push.
