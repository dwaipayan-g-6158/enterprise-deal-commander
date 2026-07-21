# Human Touch Homepage Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the dashboard's static "Portfolio Command Center" header with a time-aware, contextual greeting, add a "welcome back" summary and a "continue working" quick-link list, and rewrite four empty-state messages — all fitting inside the app's existing responsive layout and PWA shell.

**Architecture:** One additive nullable DB column (`commanders.last_dashboard_visit_at`) + one new contract-first API endpoint (`POST /v1/auth/dashboard-visit`) + a `displayName` field added to the existing `GetMe` response. All greeting/insight logic runs client-side, reusing data the dashboard already fetches (`useGetIntelligenceSummary`, `useListPortfolioActivity`, `useGetNextActions`) plus one broader `useListDeals({state:"active"})` call. Greeting selection, dedup, and recent-deals tracking are pure, localStorage-backed modules with dependency-injected storage for testability.

**Tech Stack:** Express 5 + Drizzle (Postgres) API, contract-first via `lib/api-spec/openapi.yaml` → Orval codegen, React 19 + Vite + Tailwind v4 + shadcn/ui frontend, `wouter` routing, `@tanstack/react-query` data layer, Vitest for pure-logic unit tests.

## Global Constraints

- Spec: `docs/superpowers/specs/2026-07-21-human-touch-homepage-design.md` — read it if anything below is ambiguous.
- Single-user app (one `commanders` row) — no multi-tenant/privacy logic needed anywhere in this feature.
- Tone: warm, professional, collegial; never sarcastic or condescending; concise; the commander's name appears at most once per screen.
- Greeting pool: exactly 40 entries per time band (4 bands = 160 total), each with a unique id; every band has at least one hook-free (generic) entry so a candidate is always available; 48-hour no-repeat dedup, relaxed (repeats allowed) only when every eligible entry has already been shown.
- No new PWA infrastructure — the app already has a full manifest + Workbox service worker (`artifacts/edc/vite.config.ts`). The new `POST /v1/auth/dashboard-visit` is a mutation, so it's untouched by the existing GET-only caching rule; it must fail soft (never block page render) when offline.
- Touch targets in new UI ≥44px; no motion beyond what respects `prefers-reduced-motion` (existing app-wide convention).
- Schema changes are additive only, applied via direct SQL (`lib/db/sql/*.sql`, idempotent `ADD COLUMN IF NOT EXISTS`) — never `drizzle-kit push` for this change (repo convention, avoids an interactive TTY truncate prompt).
- This repo's only existing automated tests are pure-function unit tests (Vitest, no DB/route mocking infrastructure exists) — new tests in this plan follow that same convention; the one DB-touching route added here (Task 3) is verified live instead of with an automated test, matching how every other DB-touching route change in this codebase has been verified (chrome-devtools/Playwright MCP against the running dev stack).
- Local dev stack commands (PowerShell only — Git Bash mangles `BASE_PATH`/`export`): see Task 12.

---

### Task 1: `commanders.last_dashboard_visit_at` column

**Files:**
- Modify: `lib/db/src/schema/auth.ts`
- Create: `lib/db/sql/2026-07-21-commander-last-visit.sql`

**Interfaces:**
- Produces: `commanders.lastDashboardVisitAt: Date | null` (Drizzle column), consumed by Task 3's route handler.

- [ ] **Step 1: Add the nullable column to the Drizzle schema**

Modify `lib/db/src/schema/auth.ts` (full file, currently 11 lines):

```ts
import { pgTable, uuid, varchar, timestamp } from "drizzle-orm/pg-core";

export const commanders = pgTable("commanders", {
  id: uuid("id").primaryKey().defaultRandom(),
  username: varchar("username", { length: 255 }).notNull().unique(),
  displayName: varchar("display_name", { length: 255 }).notNull(),
  passwordHash: varchar("password_hash", { length: 255 }).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  lastDashboardVisitAt: timestamp("last_dashboard_visit_at", {
    withTimezone: true,
  }),
});
```

- [ ] **Step 2: Write the direct-SQL migration**

Create `lib/db/sql/2026-07-21-commander-last-visit.sql`:

```sql
-- Human Touch Homepage: last-dashboard-visit cursor (2026-07)
--
-- Adds one nullable column to commanders so the dashboard can compute
-- "Welcome Back Memory" (what happened since your last visit) without a
-- separate session table. NULL means "never visited" (first-ever load).
-- Mirrors the Drizzle schema in lib/db/src/schema/auth.ts (commanders).
--
-- Safe to re-run (idempotent): ADD COLUMN uses IF NOT EXISTS.
--
--   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f lib/db/sql/2026-07-21-commander-last-visit.sql

BEGIN;

ALTER TABLE public.commanders
  ADD COLUMN IF NOT EXISTS last_dashboard_visit_at timestamptz;

COMMIT;
```

- [ ] **Step 3: Apply the migration to the local dev database and verify**

Run (PowerShell):

```powershell
& "C:\Program Files\PostgreSQL\17\bin\psql.exe" "postgres://postgres:postgres@localhost:5432/edc" -v ON_ERROR_STOP=1 -f lib/db/sql/2026-07-21-commander-last-visit.sql
& "C:\Program Files\PostgreSQL\17\bin\psql.exe" "postgres://postgres:postgres@localhost:5432/edc" -c "\d commanders"
```

Expected: the `\d commanders` output lists `last_dashboard_visit_at | timestamp with time zone |` among the columns.

- [ ] **Step 4: Typecheck**

`lib/db` has no dedicated `typecheck` script, so run the root-level check (covers it via `tsc --build`):

Run: `pnpm run typecheck`
Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add lib/db/src/schema/auth.ts lib/db/sql/2026-07-21-commander-last-visit.sql
git commit -m "feat(db): add commanders.last_dashboard_visit_at column"
```

---

### Task 2: API contract — `displayName` + `POST /v1/auth/dashboard-visit`

**Files:**
- Modify: `lib/api-spec/openapi.yaml` (lines ~87-104 for the new path, lines ~1869-1875 for `AuthUser`)

**Interfaces:**
- Produces (after codegen): `GetMeResponse` (Zod, `@workspace/api-zod`) gains `displayName: string`; new `DashboardVisitResponse` Zod schema `{ previousVisitAt: string | null }`; new generated hook `useDashboardVisit()` (`@workspace/api-client-react`) with `mutateAsync(): Promise<{ previousVisitAt: string | null }>` (no request body, matching the existing `useLogout()` shape). Consumed by Task 3 (server) and Task 9 (client).

- [ ] **Step 1: Add `displayName` to the `AuthUser` schema**

In `lib/api-spec/openapi.yaml`, find (around line 1869):

```yaml
    AuthUser:
      type: object
      properties:
        id: { type: string }
        email: { type: string }
        role: { type: string }
      required: [id, email, role]
```

Replace with:

```yaml
    AuthUser:
      type: object
      properties:
        id: { type: string }
        email: { type: string }
        role: { type: string }
        displayName: { type: string }
      required: [id, email, role, displayName]
```

- [ ] **Step 2: Add the `DashboardVisitResponse` schema**

Immediately after the `AuthUser` block from Step 1, insert:

```yaml
    DashboardVisitResponse:
      type: object
      properties:
        previousVisitAt: { type: ["string", "null"] }
      required: [previousVisitAt]
```

- [ ] **Step 3: Add the new path**

In `lib/api-spec/openapi.yaml`, find the `/v1/auth/me` block (around line 87-104):

```yaml
  /v1/auth/me:
    get:
      operationId: getMe
      tags: [auth]
      summary: Current commander
      responses:
        "200":
          description: Current user
          content:
            application/json:
              schema:
                $ref: "#/components/schemas/AuthUser"
        "401":
          description: Unauthorized
          content:
            application/json:
              schema:
                $ref: "#/components/schemas/ErrorResponse"
```

Immediately after it (before the `# ============ DEALS ============` comment), insert:

```yaml
  /v1/auth/dashboard-visit:
    post:
      operationId: dashboardVisit
      tags: [auth]
      summary: Record a dashboard visit, returning the previous visit timestamp
      responses:
        "200":
          description: Previous visit timestamp (null on first-ever visit)
          content:
            application/json:
              schema:
                $ref: "#/components/schemas/DashboardVisitResponse"
        "401":
          description: Unauthorized
          content:
            application/json:
              schema:
                $ref: "#/components/schemas/ErrorResponse"
```

- [ ] **Step 4: Regenerate the Zod schemas and React Query hooks**

Run: `pnpm --filter @workspace/api-spec run codegen`
Expected: exits 0; `lib/api-zod/src/generated/api.ts` and `lib/api-client-react/src/generated/api.ts` are rewritten.

- [ ] **Step 5: Verify the generated output**

Run:

```powershell
Select-String -Path "lib/api-zod/src/generated/api.ts" -Pattern "GetMeResponse = zod.object" -Context 0,6
Select-String -Path "lib/api-client-react/src/generated/api.ts" -Pattern "useDashboardVisit"
```

Expected: the first shows `displayName: zod.string()` inside `GetMeResponse`; the second lists a generated `useDashboardVisit` function.

- [ ] **Step 6: Typecheck the generated packages**

Run: `pnpm run typecheck`
Expected: no errors (generated code only; nothing consumes the new fields yet).

- [ ] **Step 7: Commit**

```bash
git add lib/api-spec/openapi.yaml lib/api-zod/src/generated lib/api-client-react/src/generated
git commit -m "feat(api): add displayName to GetMe and a dashboard-visit endpoint"
```

---

### Task 3: Backend route — `displayName` in GetMe + `dashboard-visit` handler

**Files:**
- Modify: `artifacts/api-server/src/routes/auth.ts`

**Interfaces:**
- Consumes: `commanders` (Drizzle table, Task 1), `sql` (`drizzle-orm`), `DashboardVisitResponse` (Task 2), `getActor(req)` → `{id, username, displayName}` (already exists in `lib/auth.ts`).
- Produces: `GET /auth/me` response includes `displayName`; `POST /auth/dashboard-visit` returns `{ previousVisitAt: string | null }`. Consumed by Task 9's frontend hook calls.

- [ ] **Step 1: Update imports and the GetMe handler**

Modify `artifacts/api-server/src/routes/auth.ts` — replace the full file:

```ts
import { Router, type IRouter, type Request, type Response } from "express";
import bcrypt from "bcryptjs";
import { eq, sql } from "drizzle-orm";
import { db, commanders } from "@workspace/db";
import {
  LoginBody,
  LoginResponse,
  LogoutResponse,
  GetMeResponse,
  DashboardVisitResponse,
} from "@workspace/api-zod";
import {
  issueSession,
  clearSession,
  requireAuth,
  getActor,
} from "../lib/auth";
import { badRequest, unauthorized } from "../lib/http";

const router: IRouter = Router();

router.post("/auth/login", async (req: Request, res: Response) => {
  const parsed = LoginBody.safeParse(req.body);
  if (!parsed.success) {
    throw badRequest("Invalid credentials payload", parsed.error.issues);
  }
  const { email, password } = parsed.data;
  const rows = await db
    .select()
    .from(commanders)
    .where(eq(commanders.username, email))
    .limit(1);
  const commander = rows[0];
  if (!commander) {
    throw unauthorized("Invalid email or password");
  }

  const ok = await bcrypt.compare(password, commander.passwordHash);
  if (!ok) {
    throw unauthorized("Invalid email or password");
  }

  issueSession(res, {
    id: commander.id,
    username: commander.username,
    displayName: commander.displayName,
  });
  res.json(LoginResponse.parse({ message: "Signed in" }));
});

router.post("/auth/logout", (_req: Request, res: Response) => {
  clearSession(res);
  res.json(LogoutResponse.parse({ message: "Signed out" }));
});

router.get("/auth/me", requireAuth, (req: Request, res: Response) => {
  const actor = getActor(req);
  res.json(
    GetMeResponse.parse({
      id: actor.id,
      email: actor.username,
      role: "commander",
      displayName: actor.displayName,
    }),
  );
});

router.post(
  "/auth/dashboard-visit",
  requireAuth,
  async (req: Request, res: Response) => {
    const actor = getActor(req);
    const result = await db.execute(sql`
      WITH prev AS (
        SELECT last_dashboard_visit_at FROM commanders WHERE id = ${actor.id}
      )
      UPDATE commanders
      SET last_dashboard_visit_at = now()
      WHERE id = ${actor.id}
      RETURNING (SELECT last_dashboard_visit_at FROM prev) AS previous_visit_at
    `);
    const list = Array.isArray(result)
      ? result
      : ((result as { rows: unknown[] }).rows ?? []);
    const row = list[0] as
      | { previous_visit_at: string | Date | null }
      | undefined;
    const previousVisitAt = row?.previous_visit_at
      ? new Date(row.previous_visit_at).toISOString()
      : null;
    res.json(DashboardVisitResponse.parse({ previousVisitAt }));
  },
);

export default router;
```

- [ ] **Step 2: Typecheck**

Run: `pnpm --filter @workspace/api-server run typecheck`
Expected: no errors.

- [ ] **Step 3: Build and manually verify against the local dev DB**

Per the "Global Constraints" note, this DB-touching route has no automated test in this repo's convention — verify live:

```powershell
pnpm --filter @workspace/api-server run build
$env:DATABASE_URL='postgres://postgres:postgres@localhost:5432/edc'; $env:SESSION_SECRET='local-dev-secret-edc-2026'; $env:PORT='5000'; $env:NODE_ENV='development'; node --enable-source-maps artifacts/api-server/dist/index.mjs
```

In a second terminal, log in and hit the new endpoint twice:

```powershell
$session = Invoke-WebRequest -Uri "http://localhost:5000/api/v1/auth/login" -Method POST -ContentType "application/json" -Body '{"email":"commander","password":"DealCommander!2026"}' -SessionVariable sess
Invoke-RestMethod -Uri "http://localhost:5000/api/v1/auth/dashboard-visit" -Method POST -WebSession $sess
Invoke-RestMethod -Uri "http://localhost:5000/api/v1/auth/dashboard-visit" -Method POST -WebSession $sess
Invoke-RestMethod -Uri "http://localhost:5000/api/v1/auth/me" -Method GET -WebSession $sess
```

Expected: first call returns `{"previousVisitAt":null}`; second call returns `{"previousVisitAt":"<ISO timestamp from just before the second call>"}`; the `/auth/me` call includes `"displayName":"Deal Commander"` (or the seeded display name).

- [ ] **Step 4: Commit**

```bash
git add artifacts/api-server/src/routes/auth.ts
git commit -m "feat(api): expose displayName on GetMe and add dashboard-visit endpoint"
```

---

### Task 4: Frontend — storage.ts + shown-history.ts (greeting dedup)

**Files:**
- Create: `artifacts/edc/src/lib/storage.ts`
- Create: `artifacts/edc/src/lib/greetings/shown-history.ts`
- Test: `artifacts/edc/src/lib/greetings/shown-history.test.ts`

**Interfaces:**
- Produces: `KeyValueStore` interface + `defaultStore` (`src/lib/storage.ts`); `ShownEntry`, `readShownHistory(store, now)`, `recordShown(store, id, now)` (`src/lib/greetings/shown-history.ts`). Consumed by Task 6 (recent-deals.ts imports `KeyValueStore`) and Task 9 (DashboardHero imports both).

- [ ] **Step 1: Write the failing test for shown-history**

Create `artifacts/edc/src/lib/greetings/shown-history.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { readShownHistory, recordShown } from "./shown-history";
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

describe("readShownHistory", () => {
  it("returns an empty array when nothing is stored", () => {
    expect(readShownHistory(fakeStore(), new Date())).toEqual([]);
  });

  it("returns an empty array for corrupted JSON", () => {
    const store = fakeStore({ "edc.greetings.shown": "{not json" });
    expect(readShownHistory(store, new Date())).toEqual([]);
  });

  it("prunes entries older than 48 hours", () => {
    const now = new Date("2026-07-21T12:00:00Z");
    const old = new Date("2026-07-19T00:00:00Z").toISOString(); // 60h ago
    const recent = new Date("2026-07-21T00:00:00Z").toISOString(); // 12h ago
    const store = fakeStore({
      "edc.greetings.shown": JSON.stringify([
        { id: "old-1", shownAt: old },
        { id: "recent-1", shownAt: recent },
      ]),
    });
    expect(readShownHistory(store, now)).toEqual([
      { id: "recent-1", shownAt: recent },
    ]);
  });
});

describe("recordShown", () => {
  it("appends a new entry and prunes stale ones on write", () => {
    const now = new Date("2026-07-21T12:00:00Z");
    const old = new Date("2026-07-19T00:00:00Z").toISOString();
    const store = fakeStore({
      "edc.greetings.shown": JSON.stringify([{ id: "old-1", shownAt: old }]),
    });
    recordShown(store, "new-1", now);
    expect(readShownHistory(store, now)).toEqual([
      { id: "new-1", shownAt: now.toISOString() },
    ]);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm --filter @workspace/edc exec vitest run src/lib/greetings/shown-history.test.ts`
Expected: FAIL — cannot find module `./shown-history` (and `@/lib/storage`).

- [ ] **Step 3: Create the shared storage interface**

Create `artifacts/edc/src/lib/storage.ts`:

```ts
export interface KeyValueStore {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

export const defaultStore: KeyValueStore = {
  getItem: (key) => window.localStorage.getItem(key),
  setItem: (key, value) => window.localStorage.setItem(key, value),
};
```

- [ ] **Step 4: Implement shown-history.ts**

Create `artifacts/edc/src/lib/greetings/shown-history.ts`:

```ts
import type { KeyValueStore } from "@/lib/storage";

const SHOWN_HISTORY_KEY = "edc.greetings.shown";
const DEDUP_WINDOW_MS = 48 * 60 * 60 * 1000;

export interface ShownEntry {
  id: string;
  shownAt: string;
}

function isShownEntry(value: unknown): value is ShownEntry {
  const v = value as ShownEntry;
  return (
    typeof value === "object" &&
    value !== null &&
    typeof v.id === "string" &&
    typeof v.shownAt === "string"
  );
}

/** Reads the dedup log, pruning entries older than 48h. Never throws. */
export function readShownHistory(store: KeyValueStore, now: Date): ShownEntry[] {
  let raw: string | null;
  try {
    raw = store.getItem(SHOWN_HISTORY_KEY);
  } catch {
    return [];
  }
  if (!raw) return [];
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return [];
  }
  if (!Array.isArray(parsed)) return [];
  const cutoff = now.getTime() - DEDUP_WINDOW_MS;
  return parsed.filter(
    (e) => isShownEntry(e) && new Date(e.shownAt).getTime() >= cutoff,
  );
}

/** Appends a shown greeting id, pruning stale entries first. Never throws. */
export function recordShown(store: KeyValueStore, id: string, now: Date): void {
  const pruned = readShownHistory(store, now);
  const next = [...pruned, { id, shownAt: now.toISOString() }];
  try {
    store.setItem(SHOWN_HISTORY_KEY, JSON.stringify(next));
  } catch {
    // localStorage full/unavailable — dedup just won't persist this round.
  }
}
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `pnpm --filter @workspace/edc exec vitest run src/lib/greetings/shown-history.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 6: Commit**

```bash
git add artifacts/edc/src/lib/storage.ts artifacts/edc/src/lib/greetings/shown-history.ts artifacts/edc/src/lib/greetings/shown-history.test.ts
git commit -m "feat(edc): add localStorage-backed greeting dedup history"
```

---

### Task 5: Frontend — time-bands.ts

**Files:**
- Create: `artifacts/edc/src/lib/greetings/time-bands.ts`
- Test: `artifacts/edc/src/lib/greetings/time-bands.test.ts`

**Interfaces:**
- Produces: `TimeBand` type (`"morning"|"afternoon"|"evening"|"night"`), `getTimeBand(date: Date): TimeBand`. Consumed by Task 7 (`select-greeting.ts`) and Task 9 (`DashboardHero`).

- [ ] **Step 1: Write the failing test**

Create `artifacts/edc/src/lib/greetings/time-bands.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { getTimeBand } from "./time-bands";

function at(hour: number, minute = 0): Date {
  return new Date(2026, 0, 1, hour, minute, 0);
}

describe("getTimeBand", () => {
  it("classifies 6:00 as morning (lower bound)", () => {
    expect(getTimeBand(at(6, 0))).toBe("morning");
  });
  it("classifies 11:59 as morning (upper bound)", () => {
    expect(getTimeBand(at(11, 59))).toBe("morning");
  });
  it("classifies 12:00 as afternoon (lower bound)", () => {
    expect(getTimeBand(at(12, 0))).toBe("afternoon");
  });
  it("classifies 16:59 as afternoon (upper bound)", () => {
    expect(getTimeBand(at(16, 59))).toBe("afternoon");
  });
  it("classifies 17:00 as evening (lower bound)", () => {
    expect(getTimeBand(at(17, 0))).toBe("evening");
  });
  it("classifies 20:59 as evening (upper bound)", () => {
    expect(getTimeBand(at(20, 59))).toBe("evening");
  });
  it("classifies 21:00 as night", () => {
    expect(getTimeBand(at(21, 0))).toBe("night");
  });
  it("classifies 0:00 (midnight) as night", () => {
    expect(getTimeBand(at(0, 0))).toBe("night");
  });
  it("classifies 5:59 as night (upper bound before the morning wrap)", () => {
    expect(getTimeBand(at(5, 59))).toBe("night");
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm --filter @workspace/edc exec vitest run src/lib/greetings/time-bands.test.ts`
Expected: FAIL — cannot find module `./time-bands`.

- [ ] **Step 3: Implement time-bands.ts**

Create `artifacts/edc/src/lib/greetings/time-bands.ts`:

```ts
export type TimeBand = "morning" | "afternoon" | "evening" | "night";

/**
 * Morning 6-12, Afternoon 12-17, Evening 17-21, Night 21-6 (wraps midnight).
 * Uses the browser's local time — no timezone acknowledgement (single-user app).
 */
export function getTimeBand(date: Date): TimeBand {
  const hour = date.getHours();
  if (hour >= 6 && hour < 12) return "morning";
  if (hour >= 12 && hour < 17) return "afternoon";
  if (hour >= 17 && hour < 21) return "evening";
  return "night";
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm --filter @workspace/edc exec vitest run src/lib/greetings/time-bands.test.ts`
Expected: PASS (9 tests).

- [ ] **Step 5: Commit**

```bash
git add artifacts/edc/src/lib/greetings/time-bands.ts artifacts/edc/src/lib/greetings/time-bands.test.ts
git commit -m "feat(edc): add time-of-day band classifier"
```

---

### Task 6: Frontend — recent-deals.ts (Continue Working)

**Files:**
- Create: `artifacts/edc/src/lib/recent-deals.ts`
- Test: `artifacts/edc/src/lib/recent-deals.test.ts`

**Interfaces:**
- Consumes: `KeyValueStore` (Task 4, `@/lib/storage`).
- Produces: `RecentDealEntry` type, `readRecentDeals(store)`, `recordDealVisit(store, entry, now)`. Consumed by Task 9 (`DashboardHero`) and Task 10 (`deal-cockpit.tsx`).

- [ ] **Step 1: Write the failing test**

Create `artifacts/edc/src/lib/recent-deals.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { readRecentDeals, recordDealVisit } from "./recent-deals";
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

describe("recordDealVisit", () => {
  it("adds a new deal to the front", () => {
    const store = fakeStore();
    recordDealVisit(
      store,
      { dealId: "d1", dealName: "Acme", stageName: "Validation" },
      new Date("2026-07-21T10:00:00Z"),
    );
    expect(readRecentDeals(store)).toEqual([
      {
        dealId: "d1",
        dealName: "Acme",
        stageName: "Validation",
        visitedAt: "2026-07-21T10:00:00.000Z",
      },
    ]);
  });

  it("moves a re-visited deal to the front instead of duplicating it", () => {
    const store = fakeStore();
    recordDealVisit(
      store,
      { dealId: "d1", dealName: "Acme", stageName: "Validation" },
      new Date("2026-07-21T10:00:00Z"),
    );
    recordDealVisit(
      store,
      { dealId: "d2", dealName: "NovaTech", stageName: "Commercial" },
      new Date("2026-07-21T11:00:00Z"),
    );
    recordDealVisit(
      store,
      { dealId: "d1", dealName: "Acme", stageName: "Procurement" },
      new Date("2026-07-21T12:00:00Z"),
    );
    const result = readRecentDeals(store);
    expect(result).toHaveLength(2);
    expect(result[0].dealId).toBe("d1");
    expect(result[0].stageName).toBe("Procurement");
    expect(result[1].dealId).toBe("d2");
  });

  it("caps the list at 5 entries, most recent first", () => {
    const store = fakeStore();
    for (let i = 0; i < 7; i++) {
      recordDealVisit(
        store,
        { dealId: `d${i}`, dealName: `Deal ${i}`, stageName: "Discovery" },
        new Date(2026, 6, 21, i),
      );
    }
    const result = readRecentDeals(store);
    expect(result).toHaveLength(5);
    expect(result[0].dealId).toBe("d6");
  });

  it("returns an empty array for corrupted JSON", () => {
    const store = fakeStore({ "edc.recentDeals": "{not json" });
    expect(readRecentDeals(store)).toEqual([]);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm --filter @workspace/edc exec vitest run src/lib/recent-deals.test.ts`
Expected: FAIL — cannot find module `./recent-deals`.

- [ ] **Step 3: Implement recent-deals.ts**

Create `artifacts/edc/src/lib/recent-deals.ts`:

```ts
import type { KeyValueStore } from "@/lib/storage";

const RECENT_DEALS_KEY = "edc.recentDeals";
const MAX_RECENT = 5;

export interface RecentDealEntry {
  dealId: string;
  dealName: string;
  stageName: string;
  visitedAt: string;
}

function isRecentDealEntry(value: unknown): value is RecentDealEntry {
  const v = value as RecentDealEntry;
  return (
    typeof value === "object" &&
    value !== null &&
    typeof v.dealId === "string" &&
    typeof v.dealName === "string" &&
    typeof v.stageName === "string" &&
    typeof v.visitedAt === "string"
  );
}

/** Reads the recently-visited-deals list, most recent first. Never throws. */
export function readRecentDeals(store: KeyValueStore): RecentDealEntry[] {
  let raw: string | null;
  try {
    raw = store.getItem(RECENT_DEALS_KEY);
  } catch {
    return [];
  }
  if (!raw) return [];
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return [];
  }
  if (!Array.isArray(parsed)) return [];
  return parsed.filter(isRecentDealEntry);
}

/** Records a deal visit: moves it to the front, dedupes by dealId, caps at 5. Never throws. */
export function recordDealVisit(
  store: KeyValueStore,
  entry: Omit<RecentDealEntry, "visitedAt">,
  now: Date,
): void {
  const existing = readRecentDeals(store).filter(
    (d) => d.dealId !== entry.dealId,
  );
  const next = [{ ...entry, visitedAt: now.toISOString() }, ...existing].slice(
    0,
    MAX_RECENT,
  );
  try {
    store.setItem(RECENT_DEALS_KEY, JSON.stringify(next));
  } catch {
    // localStorage full/unavailable — Continue Working just won't update this round.
  }
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm --filter @workspace/edc exec vitest run src/lib/recent-deals.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add artifacts/edc/src/lib/recent-deals.ts artifacts/edc/src/lib/recent-deals.test.ts
git commit -m "feat(edc): add localStorage-backed recently-visited-deals tracker"
```

---

### Task 7: Frontend — select-greeting.ts

**Files:**
- Create: `artifacts/edc/src/lib/greetings/select-greeting.ts`
- Test: `artifacts/edc/src/lib/greetings/select-greeting.test.ts`

**Interfaces:**
- Consumes: `TimeBand` (Task 5), `ShownEntry` (Task 4).
- Produces: `GreetingEntry`, `GreetingPool`, `GreetingContext`, `KNOWN_HOOKS`, `selectGreeting(pool, band, context, shownHistory, random?)`. Consumed by Task 8 (pool validation test imports `KNOWN_HOOKS`) and Task 9 (`DashboardHero`).

- [ ] **Step 1: Write the failing test**

Create `artifacts/edc/src/lib/greetings/select-greeting.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import {
  selectGreeting,
  type GreetingPool,
  type GreetingContext,
} from "./select-greeting";

function ctx(overrides: Partial<GreetingContext> = {}): GreetingContext {
  return {
    namePart: ", Sarah",
    procurementCount: 0,
    closeThisWeekValueRaw: 0,
    closeThisWeekValue: "$0",
    closeThisWeekCount: 0,
    recentPhaseAdvanceCount: 0,
    activeValidationValueRaw: 0,
    activeValidationValue: "$0",
    overdueActionCount: 0,
    oneStepFromCloseDealName: undefined,
    ...overrides,
  };
}

const POOL: GreetingPool = {
  morning: [
    { id: "m-generic-1", hook: null, text: "Good Morning{{namePart}}." },
    {
      id: "m-procurement-1",
      hook: "procurementCount",
      text: "{{procurementCount}} in procurement.",
    },
  ],
  afternoon: [{ id: "a-generic-1", hook: null, text: "Good Afternoon{{namePart}}." }],
  evening: [{ id: "e-generic-1", hook: null, text: "Good Evening{{namePart}}." }],
  night: [{ id: "n-generic-1", hook: null, text: "Working late{{namePart}}?" }],
};

describe("selectGreeting", () => {
  it("only picks a generic entry when no hook is eligible", () => {
    const result = selectGreeting(POOL, "morning", ctx(), [], () => 0);
    expect(result.id).toBe("m-generic-1");
  });

  it("makes a hook entry eligible once its condition is met", () => {
    const result = selectGreeting(
      POOL,
      "morning",
      ctx({ procurementCount: 3 }),
      [],
      () => 0.99,
    );
    expect(result.id).toBe("m-procurement-1");
    expect(result.text).toBe("3 in procurement.");
  });

  it("excludes ids shown within the last 48h", () => {
    const shown = [{ id: "m-generic-1", shownAt: new Date().toISOString() }];
    const result = selectGreeting(
      POOL,
      "morning",
      ctx({ procurementCount: 3 }),
      shown,
      () => 0,
    );
    expect(result.id).toBe("m-procurement-1");
  });

  it("relaxes the 48h filter when every eligible entry has already been shown", () => {
    const shown = [{ id: "m-generic-1", shownAt: new Date().toISOString() }];
    const result = selectGreeting(POOL, "morning", ctx(), shown, () => 0);
    expect(result.id).toBe("m-generic-1");
  });

  it("interpolates namePart", () => {
    const result = selectGreeting(
      POOL,
      "afternoon",
      ctx({ namePart: ", Priya" }),
      [],
      () => 0,
    );
    expect(result.text).toBe("Good Afternoon, Priya.");
  });

  it("falls back to the safe default when a band has zero eligible entries", () => {
    const emptyPool: GreetingPool = {
      morning: [],
      afternoon: [],
      evening: [],
      night: [],
    };
    const result = selectGreeting(emptyPool, "morning", ctx(), [], () => 0);
    expect(result.id).toBe("fallback");
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm --filter @workspace/edc exec vitest run src/lib/greetings/select-greeting.test.ts`
Expected: FAIL — cannot find module `./select-greeting`.

- [ ] **Step 3: Implement select-greeting.ts**

Create `artifacts/edc/src/lib/greetings/select-greeting.ts`:

```ts
import type { TimeBand } from "./time-bands";
import type { ShownEntry } from "./shown-history";

export interface GreetingEntry {
  id: string;
  hook: string | null;
  text: string;
}

export type GreetingPool = Record<TimeBand, GreetingEntry[]>;

export interface GreetingContext {
  namePart: string;
  procurementCount: number;
  closeThisWeekValueRaw: number;
  closeThisWeekValue: string;
  closeThisWeekCount: number;
  recentPhaseAdvanceCount: number;
  activeValidationValueRaw: number;
  activeValidationValue: string;
  overdueActionCount: number;
  oneStepFromCloseDealName?: string;
}

export const KNOWN_HOOKS = [
  "procurementCount",
  "closeThisWeekValue",
  "closeThisWeekCount",
  "recentPhaseAdvanceCount",
  "activeValidationValue",
  "overdueActionCount",
  "oneStepFromCloseDealName",
] as const;

type KnownHook = (typeof KNOWN_HOOKS)[number];

const HOOK_ELIGIBILITY: Record<KnownHook, (ctx: GreetingContext) => boolean> = {
  procurementCount: (c) => c.procurementCount > 0,
  closeThisWeekValue: (c) => c.closeThisWeekValueRaw > 0,
  closeThisWeekCount: (c) => c.closeThisWeekCount > 0,
  recentPhaseAdvanceCount: (c) => c.recentPhaseAdvanceCount > 0,
  activeValidationValue: (c) => c.activeValidationValueRaw > 0,
  overdueActionCount: (c) => c.overdueActionCount > 0,
  oneStepFromCloseDealName: (c) => !!c.oneStepFromCloseDealName,
};

const FALLBACK_GREETING = {
  id: "fallback",
  text: "Good day{{namePart}}. Let's see what's on deck today.",
};

function isEligible(entry: GreetingEntry, ctx: GreetingContext): boolean {
  if (entry.hook === null) return true;
  const check = HOOK_ELIGIBILITY[entry.hook as KnownHook];
  return check ? check(ctx) : false;
}

function interpolate(text: string, ctx: GreetingContext): string {
  return text.replace(/\{\{(\w+)\}\}/g, (_match, key: string) => {
    const value = (ctx as unknown as Record<string, unknown>)[key];
    return value != null ? String(value) : "";
  });
}

/**
 * Picks one greeting for the given band: filters to hook-eligible entries,
 * excludes ids shown in the last 48h (relaxing that filter only if it would
 * otherwise leave zero candidates), then interpolates the context values.
 */
export function selectGreeting(
  pool: GreetingPool,
  band: TimeBand,
  context: GreetingContext,
  shownHistory: ShownEntry[],
  random: () => number = Math.random,
): { id: string; text: string } {
  const bandEntries = pool[band] ?? [];
  const eligible = bandEntries.filter((e) => isEligible(e, context));
  if (eligible.length === 0) {
    return {
      id: FALLBACK_GREETING.id,
      text: interpolate(FALLBACK_GREETING.text, context),
    };
  }
  const shownIds = new Set(shownHistory.map((s) => s.id));
  const fresh = eligible.filter((e) => !shownIds.has(e.id));
  const candidates = fresh.length > 0 ? fresh : eligible;
  const chosen = candidates[Math.floor(random() * candidates.length)];
  return { id: chosen.id, text: interpolate(chosen.text, context) };
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm --filter @workspace/edc exec vitest run src/lib/greetings/select-greeting.test.ts`
Expected: PASS (6 tests).

- [ ] **Step 5: Commit**

```bash
git add artifacts/edc/src/lib/greetings/select-greeting.ts artifacts/edc/src/lib/greetings/select-greeting.test.ts
git commit -m "feat(edc): add greeting selection engine (hooks, dedup, fallback)"
```

---

### Task 8: Frontend — greeting-pool.json content + validation test

**Files:**
- Create: `artifacts/edc/src/lib/greetings/greeting-pool.json`
- Test: `artifacts/edc/src/lib/greetings/greeting-pool.test.ts`

**Interfaces:**
- Consumes: `KNOWN_HOOKS`, `GreetingPool` (Task 7).
- Produces: the literal greeting content, imported as `GREETING_POOL` by Task 9's `DashboardHero`.

- [ ] **Step 1: Write the failing validation test**

Create `artifacts/edc/src/lib/greetings/greeting-pool.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import pool from "./greeting-pool.json";
import { KNOWN_HOOKS, type GreetingPool } from "./select-greeting";

const typedPool = pool as GreetingPool;
const BANDS = ["morning", "afternoon", "evening", "night"] as const;

describe("greeting-pool", () => {
  it("has all four time bands", () => {
    for (const band of BANDS) {
      expect(typedPool[band]).toBeDefined();
    }
  });

  it("has exactly 40 entries per band", () => {
    for (const band of BANDS) {
      expect(typedPool[band].length).toBe(40);
    }
  });

  it("has at least one hook-free (generic) entry per band", () => {
    for (const band of BANDS) {
      expect(typedPool[band].some((e) => e.hook === null)).toBe(true);
    }
  });

  it("only references known hooks", () => {
    for (const band of BANDS) {
      for (const entry of typedPool[band]) {
        if (entry.hook !== null) {
          expect(KNOWN_HOOKS).toContain(entry.hook);
        }
      }
    }
  });

  it("has globally unique ids", () => {
    const allIds = BANDS.flatMap((band) => typedPool[band].map((e) => e.id));
    expect(new Set(allIds).size).toBe(allIds.length);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm --filter @workspace/edc exec vitest run src/lib/greetings/greeting-pool.test.ts`
Expected: FAIL — cannot find `./greeting-pool.json`.

- [ ] **Step 3: Author the greeting pool content**

Create `artifacts/edc/src/lib/greetings/greeting-pool.json` — 40 entries per band (5 generic + 5 per each of the 7 hooks: `procurementCount`, `closeThisWeekValue`, `closeThisWeekCount`, `recentPhaseAdvanceCount`, `activeValidationValue`, `overdueActionCount`, `oneStepFromCloseDealName`). `{{namePart}}` renders as `", Sarah"` or `""` — every template embeds it directly after the salutation word so there's never a dangling comma when the name is absent.

```json
{
  "morning": [
    { "id": "morning-01", "hook": null, "text": "Good Morning{{namePart}}.\nLet's see what needs attention today." },
    { "id": "morning-02", "hook": null, "text": "Good Morning{{namePart}}.\nReady when you are." },
    { "id": "morning-03", "hook": null, "text": "Morning{{namePart}}.\nA fresh start for the pipeline." },
    { "id": "morning-04", "hook": null, "text": "Good Morning{{namePart}}.\nLet's move a few deals forward today." },
    { "id": "morning-05", "hook": null, "text": "Good Morning{{namePart}}.\nLet's make this a productive one." },
    { "id": "morning-06", "hook": "procurementCount", "text": "Good Morning{{namePart}}.\n{{procurementCount}} deals are in procurement today." },
    { "id": "morning-07", "hook": "procurementCount", "text": "Morning{{namePart}}.\n{{procurementCount}} deals are moving through procurement." },
    { "id": "morning-08", "hook": "procurementCount", "text": "Good Morning{{namePart}}.\nProcurement has {{procurementCount}} deals waiting on you." },
    { "id": "morning-09", "hook": "procurementCount", "text": "Good Morning{{namePart}}.\n{{procurementCount}} deals need a procurement nudge this morning." },
    { "id": "morning-10", "hook": "procurementCount", "text": "Morning{{namePart}}.\n{{procurementCount}} contracts are parked in procurement." },
    { "id": "morning-11", "hook": "closeThisWeekValue", "text": "Good Morning{{namePart}}.\n{{closeThisWeekValue}} is set to close this week." },
    { "id": "morning-12", "hook": "closeThisWeekValue", "text": "Morning{{namePart}}.\n{{closeThisWeekValue}} in deals are on track to close this week." },
    { "id": "morning-13", "hook": "closeThisWeekValue", "text": "Good Morning{{namePart}}.\nThis week could bring in {{closeThisWeekValue}}." },
    { "id": "morning-14", "hook": "closeThisWeekValue", "text": "Good Morning{{namePart}}.\n{{closeThisWeekValue}} is riding on this week's closes." },
    { "id": "morning-15", "hook": "closeThisWeekValue", "text": "Morning{{namePart}}.\n{{closeThisWeekValue}} worth of deals are due to close by Friday." },
    { "id": "morning-16", "hook": "closeThisWeekCount", "text": "Good Morning{{namePart}}.\n{{closeThisWeekCount}} deals have close dates this week." },
    { "id": "morning-17", "hook": "closeThisWeekCount", "text": "Morning{{namePart}}.\n{{closeThisWeekCount}} closes are on the calendar this week." },
    { "id": "morning-18", "hook": "closeThisWeekCount", "text": "Good Morning{{namePart}}.\n{{closeThisWeekCount}} deals are due to close in the next few days." },
    { "id": "morning-19", "hook": "closeThisWeekCount", "text": "Good Morning{{namePart}}.\nKeep an eye on the {{closeThisWeekCount}} deals closing this week." },
    { "id": "morning-20", "hook": "closeThisWeekCount", "text": "Morning{{namePart}}.\n{{closeThisWeekCount}} deals are on the clock this week." },
    { "id": "morning-21", "hook": "recentPhaseAdvanceCount", "text": "Good Morning{{namePart}}.\n{{recentPhaseAdvanceCount}} deals moved forward in the last day." },
    { "id": "morning-22", "hook": "recentPhaseAdvanceCount", "text": "Morning{{namePart}}.\n{{recentPhaseAdvanceCount}} deals advanced a stage since yesterday." },
    { "id": "morning-23", "hook": "recentPhaseAdvanceCount", "text": "Good Morning{{namePart}}.\nNice momentum — {{recentPhaseAdvanceCount}} deals progressed overnight." },
    { "id": "morning-24", "hook": "recentPhaseAdvanceCount", "text": "Good Morning{{namePart}}.\n{{recentPhaseAdvanceCount}} deals picked up a stage yesterday." },
    { "id": "morning-25", "hook": "recentPhaseAdvanceCount", "text": "Morning{{namePart}}.\nThe pipeline moved — {{recentPhaseAdvanceCount}} stage changes since yesterday." },
    { "id": "morning-26", "hook": "activeValidationValue", "text": "Good Morning{{namePart}}.\n{{activeValidationValue}} is in active validation right now." },
    { "id": "morning-27", "hook": "activeValidationValue", "text": "Morning{{namePart}}.\nYour pipeline has {{activeValidationValue}} in active validation." },
    { "id": "morning-28", "hook": "activeValidationValue", "text": "Good Morning{{namePart}}.\n{{activeValidationValue}} is moving through validation today." },
    { "id": "morning-29", "hook": "activeValidationValue", "text": "Good Morning{{namePart}}.\nValidation is carrying {{activeValidationValue}} right now." },
    { "id": "morning-30", "hook": "activeValidationValue", "text": "Morning{{namePart}}.\n{{activeValidationValue}} sits in active validation this morning." },
    { "id": "morning-31", "hook": "overdueActionCount", "text": "Good Morning{{namePart}}.\n{{overdueActionCount}} action items are overdue." },
    { "id": "morning-32", "hook": "overdueActionCount", "text": "Morning{{namePart}}.\n{{overdueActionCount}} items need attention before they slip further." },
    { "id": "morning-33", "hook": "overdueActionCount", "text": "Good Morning{{namePart}}.\n{{overdueActionCount}} overdue items are worth a look today." },
    { "id": "morning-34", "hook": "overdueActionCount", "text": "Good Morning{{namePart}}.\nLet's clear the {{overdueActionCount}} overdue items today." },
    { "id": "morning-35", "hook": "overdueActionCount", "text": "Morning{{namePart}}.\n{{overdueActionCount}} things are past due on the action list." },
    { "id": "morning-36", "hook": "oneStepFromCloseDealName", "text": "Good Morning{{namePart}}.\n{{oneStepFromCloseDealName}} is one step from closing." },
    { "id": "morning-37", "hook": "oneStepFromCloseDealName", "text": "Morning{{namePart}}.\nOne signature stands between you and closing {{oneStepFromCloseDealName}}." },
    { "id": "morning-38", "hook": "oneStepFromCloseDealName", "text": "Good Morning{{namePart}}.\n{{oneStepFromCloseDealName}} just needs one more step to close." },
    { "id": "morning-39", "hook": "oneStepFromCloseDealName", "text": "Good Morning{{namePart}}.\nYou're one step away from closing {{oneStepFromCloseDealName}}." },
    { "id": "morning-40", "hook": "oneStepFromCloseDealName", "text": "Morning{{namePart}}.\n{{oneStepFromCloseDealName}} is nearly across the line." }
  ],
  "afternoon": [
    { "id": "afternoon-01", "hook": null, "text": "Good Afternoon{{namePart}}.\nHow's the pipeline treating you today?" },
    { "id": "afternoon-02", "hook": null, "text": "Afternoon{{namePart}}.\nLet's keep the momentum going." },
    { "id": "afternoon-03", "hook": null, "text": "Good Afternoon{{namePart}}.\nMidday check-in — anything need a push?" },
    { "id": "afternoon-04", "hook": null, "text": "Good Afternoon{{namePart}}.\nStill plenty of daylight to move things forward." },
    { "id": "afternoon-05", "hook": null, "text": "Good Afternoon{{namePart}}.\nHalfway through the day — how's it looking?" },
    { "id": "afternoon-06", "hook": "procurementCount", "text": "Good Afternoon{{namePart}}.\n{{procurementCount}} deals are still moving through procurement." },
    { "id": "afternoon-07", "hook": "procurementCount", "text": "Afternoon{{namePart}}.\n{{procurementCount}} contracts remain in procurement this afternoon." },
    { "id": "afternoon-08", "hook": "procurementCount", "text": "Good Afternoon{{namePart}}.\nProcurement still has {{procurementCount}} deals to clear." },
    { "id": "afternoon-09", "hook": "procurementCount", "text": "Good Afternoon{{namePart}}.\n{{procurementCount}} deals are stuck behind procurement." },
    { "id": "afternoon-10", "hook": "procurementCount", "text": "Afternoon{{namePart}}.\n{{procurementCount}} deals could use a procurement follow-up before day's end." },
    { "id": "afternoon-11", "hook": "closeThisWeekValue", "text": "Good Afternoon{{namePart}}.\n{{closeThisWeekValue}} is still on track to close this week." },
    { "id": "afternoon-12", "hook": "closeThisWeekValue", "text": "Afternoon{{namePart}}.\n{{closeThisWeekValue}} in deals are lined up to close by week's end." },
    { "id": "afternoon-13", "hook": "closeThisWeekValue", "text": "Good Afternoon{{namePart}}.\n{{closeThisWeekValue}} could land before Friday." },
    { "id": "afternoon-14", "hook": "closeThisWeekValue", "text": "Good Afternoon{{namePart}}.\nKeep pushing — {{closeThisWeekValue}} is riding on this week." },
    { "id": "afternoon-15", "hook": "closeThisWeekValue", "text": "Afternoon{{namePart}}.\n{{closeThisWeekValue}} worth of deals are close to the finish line." },
    { "id": "afternoon-16", "hook": "closeThisWeekCount", "text": "Good Afternoon{{namePart}}.\n{{closeThisWeekCount}} deals still need to close this week." },
    { "id": "afternoon-17", "hook": "closeThisWeekCount", "text": "Afternoon{{namePart}}.\n{{closeThisWeekCount}} closes are still on the calendar." },
    { "id": "afternoon-18", "hook": "closeThisWeekCount", "text": "Good Afternoon{{namePart}}.\n{{closeThisWeekCount}} deals are counting on this week." },
    { "id": "afternoon-19", "hook": "closeThisWeekCount", "text": "Good Afternoon{{namePart}}.\nDon't lose track of the {{closeThisWeekCount}} deals closing this week." },
    { "id": "afternoon-20", "hook": "closeThisWeekCount", "text": "Afternoon{{namePart}}.\n{{closeThisWeekCount}} deals are due before the week is out." },
    { "id": "afternoon-21", "hook": "recentPhaseAdvanceCount", "text": "Good Afternoon{{namePart}}.\n{{recentPhaseAdvanceCount}} deals have moved forward today." },
    { "id": "afternoon-22", "hook": "recentPhaseAdvanceCount", "text": "Afternoon{{namePart}}.\n{{recentPhaseAdvanceCount}} deals advanced a stage today." },
    { "id": "afternoon-23", "hook": "recentPhaseAdvanceCount", "text": "Good Afternoon{{namePart}}.\nSolid progress — {{recentPhaseAdvanceCount}} stage moves today." },
    { "id": "afternoon-24", "hook": "recentPhaseAdvanceCount", "text": "Good Afternoon{{namePart}}.\n{{recentPhaseAdvanceCount}} deals picked up momentum today." },
    { "id": "afternoon-25", "hook": "recentPhaseAdvanceCount", "text": "Afternoon{{namePart}}.\n{{recentPhaseAdvanceCount}} deals are further along than they were this morning." },
    { "id": "afternoon-26", "hook": "activeValidationValue", "text": "Good Afternoon{{namePart}}.\n{{activeValidationValue}} is moving through validation today." },
    { "id": "afternoon-27", "hook": "activeValidationValue", "text": "Afternoon{{namePart}}.\nValidation is carrying {{activeValidationValue}} this afternoon." },
    { "id": "afternoon-28", "hook": "activeValidationValue", "text": "Good Afternoon{{namePart}}.\n{{activeValidationValue}} is in active validation right now." },
    { "id": "afternoon-29", "hook": "activeValidationValue", "text": "Good Afternoon{{namePart}}.\nYour pipeline has {{activeValidationValue}} in validation today." },
    { "id": "afternoon-30", "hook": "activeValidationValue", "text": "Afternoon{{namePart}}.\n{{activeValidationValue}} sits in active validation this afternoon." },
    { "id": "afternoon-31", "hook": "overdueActionCount", "text": "Good Afternoon{{namePart}}.\n{{overdueActionCount}} items are still overdue." },
    { "id": "afternoon-32", "hook": "overdueActionCount", "text": "Afternoon{{namePart}}.\n{{overdueActionCount}} action items could use attention before end of day." },
    { "id": "afternoon-33", "hook": "overdueActionCount", "text": "Good Afternoon{{namePart}}.\nStill {{overdueActionCount}} overdue items on the list." },
    { "id": "afternoon-34", "hook": "overdueActionCount", "text": "Good Afternoon{{namePart}}.\nWorth clearing the {{overdueActionCount}} overdue items before you log off." },
    { "id": "afternoon-35", "hook": "overdueActionCount", "text": "Afternoon{{namePart}}.\n{{overdueActionCount}} things are past due this afternoon." },
    { "id": "afternoon-36", "hook": "oneStepFromCloseDealName", "text": "Good Afternoon{{namePart}}.\n{{oneStepFromCloseDealName}} is one step from closing." },
    { "id": "afternoon-37", "hook": "oneStepFromCloseDealName", "text": "Afternoon{{namePart}}.\nOne signature stands between you and closing {{oneStepFromCloseDealName}}." },
    { "id": "afternoon-38", "hook": "oneStepFromCloseDealName", "text": "Good Afternoon{{namePart}}.\n{{oneStepFromCloseDealName}} just needs one more step." },
    { "id": "afternoon-39", "hook": "oneStepFromCloseDealName", "text": "Good Afternoon{{namePart}}.\nYou're one step away from closing {{oneStepFromCloseDealName}}." },
    { "id": "afternoon-40", "hook": "oneStepFromCloseDealName", "text": "Afternoon{{namePart}}.\n{{oneStepFromCloseDealName}} is nearly across the line." }
  ],
  "evening": [
    { "id": "evening-01", "hook": null, "text": "Good Evening{{namePart}}.\nHere's where things stand as the day winds down." },
    { "id": "evening-02", "hook": null, "text": "Evening{{namePart}}.\nHope today treated the pipeline well." },
    { "id": "evening-03", "hook": null, "text": "Good Evening{{namePart}}.\nA good time to wrap up loose ends." },
    { "id": "evening-04", "hook": null, "text": "Good Evening{{namePart}}.\nLet's see what today added up to." },
    { "id": "evening-05", "hook": null, "text": "Good Evening{{namePart}}.\nWinding down — anything left to tidy up?" },
    { "id": "evening-06", "hook": "procurementCount", "text": "Good Evening{{namePart}}.\n{{procurementCount}} deals are still parked in procurement." },
    { "id": "evening-07", "hook": "procurementCount", "text": "Evening{{namePart}}.\n{{procurementCount}} contracts remain in procurement tonight." },
    { "id": "evening-08", "hook": "procurementCount", "text": "Good Evening{{namePart}}.\nProcurement still has {{procurementCount}} deals waiting." },
    { "id": "evening-09", "hook": "procurementCount", "text": "Good Evening{{namePart}}.\n{{procurementCount}} deals could use a nudge tomorrow morning." },
    { "id": "evening-10", "hook": "procurementCount", "text": "Evening{{namePart}}.\n{{procurementCount}} deals are still sitting in procurement." },
    { "id": "evening-11", "hook": "closeThisWeekValue", "text": "Good Evening{{namePart}}.\n{{closeThisWeekValue}} is still riding on this week's closes." },
    { "id": "evening-12", "hook": "closeThisWeekValue", "text": "Evening{{namePart}}.\n{{closeThisWeekValue}} in deals remain on track for this week." },
    { "id": "evening-13", "hook": "closeThisWeekValue", "text": "Good Evening{{namePart}}.\n{{closeThisWeekValue}} could still land before the week is out." },
    { "id": "evening-14", "hook": "closeThisWeekValue", "text": "Good Evening{{namePart}}.\nKeep an eye on the {{closeThisWeekValue}} closing this week." },
    { "id": "evening-15", "hook": "closeThisWeekValue", "text": "Evening{{namePart}}.\n{{closeThisWeekValue}} worth of deals are close to the finish line." },
    { "id": "evening-16", "hook": "closeThisWeekCount", "text": "Good Evening{{namePart}}.\n{{closeThisWeekCount}} deals still need to close this week." },
    { "id": "evening-17", "hook": "closeThisWeekCount", "text": "Evening{{namePart}}.\n{{closeThisWeekCount}} closes remain on the calendar." },
    { "id": "evening-18", "hook": "closeThisWeekCount", "text": "Good Evening{{namePart}}.\n{{closeThisWeekCount}} deals are counting on the days ahead." },
    { "id": "evening-19", "hook": "closeThisWeekCount", "text": "Good Evening{{namePart}}.\nDon't lose track of the {{closeThisWeekCount}} deals closing this week." },
    { "id": "evening-20", "hook": "closeThisWeekCount", "text": "Evening{{namePart}}.\n{{closeThisWeekCount}} deals are due before the week wraps up." },
    { "id": "evening-21", "hook": "recentPhaseAdvanceCount", "text": "Good Evening{{namePart}}.\n{{recentPhaseAdvanceCount}} deals moved forward today. Nice work." },
    { "id": "evening-22", "hook": "recentPhaseAdvanceCount", "text": "Evening{{namePart}}.\n{{recentPhaseAdvanceCount}} deals advanced a stage today." },
    { "id": "evening-23", "hook": "recentPhaseAdvanceCount", "text": "Good Evening{{namePart}}.\nSolid day — {{recentPhaseAdvanceCount}} stage moves today." },
    { "id": "evening-24", "hook": "recentPhaseAdvanceCount", "text": "Good Evening{{namePart}}.\n{{recentPhaseAdvanceCount}} deals are further along than this morning." },
    { "id": "evening-25", "hook": "recentPhaseAdvanceCount", "text": "Evening{{namePart}}.\nToday added up to {{recentPhaseAdvanceCount}} stage changes." },
    { "id": "evening-26", "hook": "activeValidationValue", "text": "Good Evening{{namePart}}.\n{{activeValidationValue}} remains in active validation." },
    { "id": "evening-27", "hook": "activeValidationValue", "text": "Evening{{namePart}}.\nValidation is still carrying {{activeValidationValue}} tonight." },
    { "id": "evening-28", "hook": "activeValidationValue", "text": "Good Evening{{namePart}}.\n{{activeValidationValue}} is still moving through validation." },
    { "id": "evening-29", "hook": "activeValidationValue", "text": "Good Evening{{namePart}}.\nYour pipeline holds {{activeValidationValue}} in validation tonight." },
    { "id": "evening-30", "hook": "activeValidationValue", "text": "Evening{{namePart}}.\n{{activeValidationValue}} sits in active validation as the day ends." },
    { "id": "evening-31", "hook": "overdueActionCount", "text": "Good Evening{{namePart}}.\n{{overdueActionCount}} items are still overdue." },
    { "id": "evening-32", "hook": "overdueActionCount", "text": "Evening{{namePart}}.\n{{overdueActionCount}} action items are worth a look before tomorrow." },
    { "id": "evening-33", "hook": "overdueActionCount", "text": "Good Evening{{namePart}}.\nStill {{overdueActionCount}} overdue items on the list." },
    { "id": "evening-34", "hook": "overdueActionCount", "text": "Good Evening{{namePart}}.\n{{overdueActionCount}} things are past due tonight." },
    { "id": "evening-35", "hook": "overdueActionCount", "text": "Evening{{namePart}}.\n{{overdueActionCount}} items could use attention first thing tomorrow." },
    { "id": "evening-36", "hook": "oneStepFromCloseDealName", "text": "Good Evening{{namePart}}.\n{{oneStepFromCloseDealName}} is one step from closing." },
    { "id": "evening-37", "hook": "oneStepFromCloseDealName", "text": "Evening{{namePart}}.\nOne signature stands between you and closing {{oneStepFromCloseDealName}}." },
    { "id": "evening-38", "hook": "oneStepFromCloseDealName", "text": "Good Evening{{namePart}}.\n{{oneStepFromCloseDealName}} just needs one more step." },
    { "id": "evening-39", "hook": "oneStepFromCloseDealName", "text": "Good Evening{{namePart}}.\nYou're one step away from closing {{oneStepFromCloseDealName}}." },
    { "id": "evening-40", "hook": "oneStepFromCloseDealName", "text": "Evening{{namePart}}.\n{{oneStepFromCloseDealName}} is nearly across the line." }
  ],
  "night": [
    { "id": "night-01", "hook": null, "text": "Working late{{namePart}}?\nWe'll keep the lights on." },
    { "id": "night-02", "hook": null, "text": "Burning the midnight oil{{namePart}}?\nThe pipeline never sleeps either." },
    { "id": "night-03", "hook": null, "text": "Still up{{namePart}}?\nEverything will still be here in the morning too." },
    { "id": "night-04", "hook": null, "text": "Quiet hour{{namePart}}.\nA good time for a clear-headed look at the pipeline." },
    { "id": "night-05", "hook": null, "text": "Working late{{namePart}}?\nA calm pipeline makes for a calmer night." },
    { "id": "night-06", "hook": "procurementCount", "text": "Working late{{namePart}}?\n{{procurementCount}} deals are still sitting in procurement." },
    { "id": "night-07", "hook": "procurementCount", "text": "Late night{{namePart}}.\n{{procurementCount}} contracts remain in procurement." },
    { "id": "night-08", "hook": "procurementCount", "text": "Still up{{namePart}}?\n{{procurementCount}} deals could use a procurement nudge tomorrow." },
    { "id": "night-09", "hook": "procurementCount", "text": "Working late{{namePart}}?\n{{procurementCount}} deals are parked in procurement tonight." },
    { "id": "night-10", "hook": "procurementCount", "text": "Late shift{{namePart}}?\n{{procurementCount}} deals remain in procurement while you're up." },
    { "id": "night-11", "hook": "closeThisWeekValue", "text": "Working late{{namePart}}?\n{{closeThisWeekValue}} is riding on this week's closes." },
    { "id": "night-12", "hook": "closeThisWeekValue", "text": "Late night{{namePart}}.\n{{closeThisWeekValue}} in deals are still on track for this week." },
    { "id": "night-13", "hook": "closeThisWeekValue", "text": "Still up{{namePart}}?\n{{closeThisWeekValue}} could land before the week's out." },
    { "id": "night-14", "hook": "closeThisWeekValue", "text": "Working late{{namePart}}?\n{{closeThisWeekValue}} worth of deals are close to the finish line." },
    { "id": "night-15", "hook": "closeThisWeekValue", "text": "Late shift{{namePart}}?\n{{closeThisWeekValue}} is still within reach this week." },
    { "id": "night-16", "hook": "closeThisWeekCount", "text": "Working late{{namePart}}?\n{{closeThisWeekCount}} deals still need to close this week." },
    { "id": "night-17", "hook": "closeThisWeekCount", "text": "Late night{{namePart}}.\n{{closeThisWeekCount}} closes remain on the calendar." },
    { "id": "night-18", "hook": "closeThisWeekCount", "text": "Still up{{namePart}}?\n{{closeThisWeekCount}} deals are counting on the days ahead." },
    { "id": "night-19", "hook": "closeThisWeekCount", "text": "Working late{{namePart}}?\n{{closeThisWeekCount}} deals are due before the week wraps up." },
    { "id": "night-20", "hook": "closeThisWeekCount", "text": "Late shift{{namePart}}?\n{{closeThisWeekCount}} deals are still open for this week." },
    { "id": "night-21", "hook": "recentPhaseAdvanceCount", "text": "Working late{{namePart}}?\n{{recentPhaseAdvanceCount}} deals moved forward today." },
    { "id": "night-22", "hook": "recentPhaseAdvanceCount", "text": "Late night{{namePart}}.\n{{recentPhaseAdvanceCount}} deals advanced a stage today." },
    { "id": "night-23", "hook": "recentPhaseAdvanceCount", "text": "Still up{{namePart}}?\nToday added up to {{recentPhaseAdvanceCount}} stage changes." },
    { "id": "night-24", "hook": "recentPhaseAdvanceCount", "text": "Working late{{namePart}}?\n{{recentPhaseAdvanceCount}} deals are further along than this morning." },
    { "id": "night-25", "hook": "recentPhaseAdvanceCount", "text": "Late shift{{namePart}}?\n{{recentPhaseAdvanceCount}} deals picked up ground today." },
    { "id": "night-26", "hook": "activeValidationValue", "text": "Working late{{namePart}}?\n{{activeValidationValue}} remains in active validation." },
    { "id": "night-27", "hook": "activeValidationValue", "text": "Late night{{namePart}}.\nValidation is still carrying {{activeValidationValue}}." },
    { "id": "night-28", "hook": "activeValidationValue", "text": "Still up{{namePart}}?\n{{activeValidationValue}} is still moving through validation." },
    { "id": "night-29", "hook": "activeValidationValue", "text": "Working late{{namePart}}?\nYour pipeline holds {{activeValidationValue}} in validation tonight." },
    { "id": "night-30", "hook": "activeValidationValue", "text": "Late shift{{namePart}}?\n{{activeValidationValue}} sits in validation while you work." },
    { "id": "night-31", "hook": "overdueActionCount", "text": "Working late{{namePart}}?\n{{overdueActionCount}} items are still overdue." },
    { "id": "night-32", "hook": "overdueActionCount", "text": "Late night{{namePart}}.\n{{overdueActionCount}} action items are worth a look tomorrow." },
    { "id": "night-33", "hook": "overdueActionCount", "text": "Still up{{namePart}}?\n{{overdueActionCount}} overdue items are on the list." },
    { "id": "night-34", "hook": "overdueActionCount", "text": "Working late{{namePart}}?\n{{overdueActionCount}} things are past due tonight." },
    { "id": "night-35", "hook": "overdueActionCount", "text": "Late shift{{namePart}}?\n{{overdueActionCount}} overdue items will keep till morning." },
    { "id": "night-36", "hook": "oneStepFromCloseDealName", "text": "Working late{{namePart}}?\n{{oneStepFromCloseDealName}} is one step from closing." },
    { "id": "night-37", "hook": "oneStepFromCloseDealName", "text": "Late night{{namePart}}.\nOne signature stands between you and closing {{oneStepFromCloseDealName}}." },
    { "id": "night-38", "hook": "oneStepFromCloseDealName", "text": "Still up{{namePart}}?\n{{oneStepFromCloseDealName}} just needs one more step." },
    { "id": "night-39", "hook": "oneStepFromCloseDealName", "text": "Working late{{namePart}}?\nYou're one step away from closing {{oneStepFromCloseDealName}}." },
    { "id": "night-40", "hook": "oneStepFromCloseDealName", "text": "Late shift{{namePart}}?\n{{oneStepFromCloseDealName}} is nearly across the line." }
  ]
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm --filter @workspace/edc exec vitest run src/lib/greetings/greeting-pool.test.ts`
Expected: PASS (5 tests).

- [ ] **Step 5: Run the full greetings test suite together**

Run: `pnpm --filter @workspace/edc exec vitest run src/lib/greetings`
Expected: PASS (all tests across time-bands, shown-history, select-greeting, greeting-pool).

- [ ] **Step 6: Commit**

```bash
git add artifacts/edc/src/lib/greetings/greeting-pool.json artifacts/edc/src/lib/greetings/greeting-pool.test.ts
git commit -m "feat(edc): author the 160-entry greeting content pool"
```

---

### Task 9: Frontend — `<DashboardHero />` component

**Files:**
- Create: `artifacts/edc/src/components/dashboard/dashboard-hero.tsx`

**Interfaces:**
- Consumes: `useGetMe`, `useDashboardVisit`, `useListDeals`, `useListPortfolioActivity`, `useGetNextActions` (`@workspace/api-client-react`); `compactCurrency`, `relativeTime` (`@/components/dashboard/widgets/_shared`); `getTimeBand` (Task 5); `selectGreeting`, `GreetingContext` (Task 7); `GREETING_POOL` (Task 8, imported as default from the JSON); `readShownHistory`, `recordShown` (Task 4); `defaultStore` (Task 4); `readRecentDeals` (Task 6).
- Produces: `DashboardHero` component (no props), consumed by Task 10's `dashboard.tsx`.

Note: this component has no dedicated unit test — it's a data-assembly + presentation component wired to live API hooks, matching this repo's convention of verifying UI components live (chrome-devtools/Playwright MCP) rather than with component-test infrastructure the repo doesn't have. Its underlying logic (`selectGreeting`, `readShownHistory`, `readRecentDeals`) is already fully unit-tested in Tasks 4-8.

- [ ] **Step 1: Implement dashboard-hero.tsx**

Create `artifacts/edc/src/components/dashboard/dashboard-hero.tsx`:

```tsx
import { useEffect, useRef, useState } from "react";
import { useLocation } from "wouter";
import {
  useGetMe,
  useDashboardVisit,
  useListDeals,
  useListPortfolioActivity,
  useGetNextActions,
} from "@workspace/api-client-react";
import { compactCurrency, relativeTime } from "@/components/dashboard/widgets/_shared";
import { getTimeBand } from "@/lib/greetings/time-bands";
import { selectGreeting, type GreetingContext, type GreetingPool } from "@/lib/greetings/select-greeting";
import GREETING_POOL from "@/lib/greetings/greeting-pool.json";
import { readShownHistory, recordShown } from "@/lib/greetings/shown-history";
import { defaultStore } from "@/lib/storage";
import { readRecentDeals } from "@/lib/recent-deals";

const ONE_DAY_MS = 24 * 60 * 60 * 1000;
const SEVEN_DAYS_MS = 7 * ONE_DAY_MS;

export function DashboardHero() {
  const [, navigate] = useLocation();
  const { data: me } = useGetMe();
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

  const since24h = new Date(Date.now() - ONE_DAY_MS).toISOString();
  const { data: recentActivityWrapper } = useListPortfolioActivity({
    since: since24h,
    limit: 50,
  });
  const recentActivity = recentActivityWrapper?.data ?? [];

  const welcomeBackEnabled = previousVisitAt !== undefined && previousVisitAt !== null;
  const { data: welcomeBackWrapper } = useListPortfolioActivity(
    { since: previousVisitAt ?? undefined, limit: 20 },
    { query: { enabled: welcomeBackEnabled } },
  );
  const welcomeBackActivity = welcomeBackWrapper?.data ?? [];

  const { data: activeDealsWrapper } = useListDeals({ state: "active", limit: 500 });
  const activeDeals = activeDealsWrapper?.data ?? [];

  const { data: nextActionsWrapper } = useGetNextActions();
  const overdueActionCount =
    (nextActionsWrapper?.data as { overdue?: unknown[] } | undefined)?.overdue?.length ?? 0;

  const tcv = (d: (typeof activeDeals)[number]) => d.normalizedTCV ?? d.calculatedTCV ?? 0;
  const procurementDeals = activeDeals.filter((d) => d.salesStage === "Procurement");
  const validationDeals = activeDeals.filter((d) => d.salesStage === "Validation");
  const nowMs = Date.now();
  const weekFromNow = nowMs + SEVEN_DAYS_MS;
  const closingThisWeek = activeDeals.filter((d) => {
    if (!d.expectedCloseDate) return false;
    const t = new Date(d.expectedCloseDate).getTime();
    return !Number.isNaN(t) && t >= nowMs && t <= weekFromNow;
  });
  const closeThisWeekValueRaw = closingThisWeek.reduce((sum, d) => sum + tcv(d), 0);
  const activeValidationValueRaw = validationDeals.reduce((sum, d) => sum + tcv(d), 0);
  const recentPhaseAdvanceCount = recentActivity.filter((e) => e.eventType === "stage_changed").length;
  const oneStepDeal = [...procurementDeals].sort((a, b) => tcv(b) - tcv(a))[0];

  const name = me?.displayName;
  const context: GreetingContext = {
    namePart: name ? `, ${name}` : "",
    procurementCount: procurementDeals.length,
    closeThisWeekValueRaw,
    closeThisWeekValue: compactCurrency(closeThisWeekValueRaw),
    closeThisWeekCount: closingThisWeek.length,
    recentPhaseAdvanceCount,
    activeValidationValueRaw,
    activeValidationValue: compactCurrency(activeValidationValueRaw),
    overdueActionCount,
    oneStepFromCloseDealName: oneStepDeal?.dealName,
  };

  const now = new Date();
  const band = getTimeBand(now);
  const shownHistory = readShownHistory(defaultStore, now);
  const greeting = selectGreeting(GREETING_POOL as GreetingPool, band, context, shownHistory);

  useEffect(() => {
    recordShown(defaultStore, greeting.id, now);
    // Records once per greeting id shown; re-running every render would defeat dedup.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [greeting.id]);

  const [headline, ...rest] = greeting.text.split("\n");
  const subline = rest.join(" ");
  const recentDeals = readRecentDeals(defaultStore);
  const mostRecentDealId = welcomeBackActivity[0]?.dealId;

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-3xl font-bold tracking-tight text-foreground">{headline}</h1>
        {subline && <p className="text-muted-foreground mt-2">{subline}</p>}
      </div>

      {welcomeBackEnabled && welcomeBackActivity.length > 0 && (
        <div className="rounded-lg border bg-muted/20 p-4 space-y-2">
          <p className="text-sm font-semibold">Last session you:</p>
          <ul className="space-y-1">
            {welcomeBackActivity.slice(0, 5).map((e) => (
              <li key={e.id} className="text-sm text-muted-foreground">
                ✓ {e.summary}
              </li>
            ))}
          </ul>
          {mostRecentDealId && (
            <button
              type="button"
              onClick={() => navigate(`/deals/${mostRecentDealId}`)}
              className="text-sm font-medium text-primary hover:underline cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded-sm"
            >
              Continue where you left off →
            </button>
          )}
        </div>
      )}

      {recentDeals.length > 0 && (
        <div className="flex gap-3 overflow-x-auto pb-1">
          {recentDeals.map((d) => (
            <button
              key={d.dealId}
              type="button"
              onClick={() => navigate(`/deals/${d.dealId}`)}
              className="shrink-0 min-w-[220px] rounded-lg border bg-card p-3 text-left transition-colors hover:border-primary/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <p className="text-sm font-medium truncate">{d.dealName}</p>
              <p className="text-xs text-muted-foreground">{d.stageName}</p>
              <p className="text-xs text-muted-foreground">{relativeTime(d.visitedAt)}</p>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Typecheck**

Run: `pnpm --filter @workspace/edc run typecheck`
Expected: no errors. (If `salesStage`/`expectedCloseDate`/`normalizedTCV`/`calculatedTCV`/`dealName` field names on the generated `Deal` type don't match exactly, fix the field references here — the openapi `Deal` schema at `lib/api-spec/openapi.yaml:1877-1928` is the source of truth.)

- [ ] **Step 3: Commit**

```bash
git add artifacts/edc/src/components/dashboard/dashboard-hero.tsx
git commit -m "feat(edc): add DashboardHero (greeting + welcome back + continue working)"
```

---

### Task 10: Wire DashboardHero into the app

**Files:**
- Modify: `artifacts/edc/src/pages/dashboard.tsx:101-104`
- Modify: `artifacts/edc/src/pages/deal-cockpit.tsx`

**Interfaces:**
- Consumes: `DashboardHero` (Task 9), `recordDealVisit` (Task 6), `defaultStore` (Task 4).

- [ ] **Step 1: Replace the static header in dashboard.tsx**

In `artifacts/edc/src/pages/dashboard.tsx`, add the import (near the other widget imports, after line 29):

```tsx
import { DashboardHero } from "@/components/dashboard/dashboard-hero";
```

Replace lines 101-104:

```tsx
      <div>
        <h1 className="text-3xl font-bold tracking-tight text-foreground">Portfolio Command Center</h1>
        <p className="text-muted-foreground mt-2">Continuous intelligence and risk monitoring</p>
      </div>
```

with:

```tsx
      <DashboardHero />
```

- [ ] **Step 2: Add the recent-deal-visit effect to deal-cockpit.tsx**

In `artifacts/edc/src/pages/deal-cockpit.tsx`, add imports (alongside the existing `@/lib/utils` import around line 64):

```tsx
import { recordDealVisit } from "@/lib/recent-deals";
import { defaultStore } from "@/lib/storage";
```

Add this effect after the existing `manualExpanded` effect (after line 126, `useEffect(() => setManualExpanded(null), [id]);`):

```tsx
  // Records this visit for the dashboard's "Continue Working" list. Guarded
  // by ref (not just the dep array) so a background refetch of deal/intel
  // data doesn't keep bumping visitedAt back to "just now" indefinitely.
  const recentDealsTouchedRef = useRef<string | null>(null);
  useEffect(() => {
    if (!dealResponse?.data || !intelligenceResponse?.data) return;
    if (recentDealsTouchedRef.current === id) return;
    recentDealsTouchedRef.current = id;
    recordDealVisit(
      defaultStore,
      {
        dealId: id,
        dealName: dealResponse.data.dealName,
        stageName: intelligenceResponse.data.salesStage,
      },
      new Date(),
    );
  }, [id, dealResponse?.data, intelligenceResponse?.data]);
```

`useRef` is already imported in this file (used for `gatesSaveRef`/`formDirtyRef`), so no new import is needed for it.

- [ ] **Step 3: Typecheck**

Run: `pnpm --filter @workspace/edc run typecheck`
Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add artifacts/edc/src/pages/dashboard.tsx artifacts/edc/src/pages/deal-cockpit.tsx
git commit -m "feat(edc): wire DashboardHero into the dashboard and track deal visits"
```

---

### Task 11: Empty-state copy pass

**Files:**
- Modify: `artifacts/edc/src/pages/deals.tsx:270-276`
- Modify: `artifacts/edc/src/components/roster/board/board-column.tsx:157`
- Modify: `artifacts/edc/src/components/dashboard/widgets/critical-alerts-feed.tsx:92`
- Modify: `artifacts/edc/src/pages/dashboard.tsx:182` (the "Recent Activity" card, separate from the Hero swapped in Task 10)

- [ ] **Step 1: Rewrite the Deal List empty-state copy**

In `artifacts/edc/src/pages/deals.tsx`, replace lines 270-276:

```tsx
  const emptyMessage = hasActiveFilters
    ? "No deals match your filters."
    : (filters.closure ?? "open") === "closed"
      ? "No closed deals yet."
      : filters.state === "active"
        ? "No active deals yet."
        : `No ${filters.state} deals.`;
```

with:

```tsx
  const emptyMessage = hasActiveFilters
    ? "Nothing matched those filters. Try adjusting them."
    : (filters.closure ?? "open") === "closed"
      ? "No closed deals yet. Your first win will show up here."
      : filters.state === "active"
        ? "Your active pipeline is empty. Time to find the next opportunity."
        : `No ${filters.state} deals.`;
```

- [ ] **Step 2: Rewrite the Roster board column empty-state copy**

In `artifacts/edc/src/components/roster/board/board-column.tsx`, on line 157, replace:

```tsx
            {isOver && closable ? "Drop to close" : isOver && droppable ? "Drop to move here" : "No deals"}
```

with:

```tsx
            {isOver && closable ? "Drop to close" : isOver && droppable ? "Drop to move here" : "All clear"}
```

- [ ] **Step 3: Rewrite the Critical Alerts empty-state copy**

In `artifacts/edc/src/components/dashboard/widgets/critical-alerts-feed.tsx`, on line 92, replace:

```tsx
          <p className="text-sm text-muted-foreground">No critical alerts currently active.</p>
```

with:

```tsx
          <p className="text-sm text-muted-foreground">Nothing critical right now. Enjoy the calm.</p>
```

- [ ] **Step 4: Rewrite the dashboard Recent Activity empty-state copy**

In `artifacts/edc/src/pages/dashboard.tsx`, on line 182, replace:

```tsx
              <p className="text-sm text-muted-foreground">No recent activity yet.</p>
```

with:

```tsx
              <p className="text-sm text-muted-foreground">It's quiet in here. Let's change that.</p>
```

- [ ] **Step 5: Typecheck**

Run: `pnpm --filter @workspace/edc run typecheck`
Expected: no errors (copy-only changes).

- [ ] **Step 6: Commit**

```bash
git add artifacts/edc/src/pages/deals.tsx artifacts/edc/src/components/roster/board/board-column.tsx artifacts/edc/src/components/dashboard/widgets/critical-alerts-feed.tsx artifacts/edc/src/pages/dashboard.tsx
git commit -m "feat(edc): rewrite four empty-state messages in the new voice"
```

---

### Task 12: Manual verification (live, mobile viewport, PWA offline)

**Files:** none (verification only).

- [ ] **Step 1: Check whether dev servers are already running**

```powershell
Get-NetTCPConnection -LocalPort 5000,5173 -State Listen -ErrorAction SilentlyContinue |
  Select-Object LocalPort, OwningProcess |
  ForEach-Object { $_; Get-Process -Id $_.OwningProcess | Select-Object Id, ProcessName }
```

If both are already listening: since Task 3 changed backend code, rebuild and restart the API process (`pnpm --filter @workspace/api-server run build`, then stop the existing `node.exe` holding :5000 via `Stop-Process -Id <pid>` and re-run it per Task 3 Step 3's launch command). The frontend has HMR — no restart needed there.

If nothing is listening, cold-start both (API per Task 3 Step 3, frontend per Step 2 below).

- [ ] **Step 2: Start the frontend (PowerShell only)**

```powershell
$env:PORT='5173'; $env:BASE_PATH='/'; pnpm --filter @workspace/edc run dev
```

- [ ] **Step 3: Drive the dashboard and verify the greeting + welcome back + continue working**

Using the Playwright MCP tools: navigate to `http://localhost:5173`, log in as `commander` / `DealCommander!2026`, take a snapshot.

Expected: the header now shows a real greeting (e.g. "Good Afternoon, Deal Commander." or similar, matching whatever time band the clock is currently in) instead of "Portfolio Command Center" — confirm it references real portfolio data if any hook is eligible (e.g. a procurement count, an overdue count) rather than only a generic line.

Reload the page (`browser_navigate` back to the same URL). Expected: a "Last session you:" block now appears (since the first load already stamped `last_dashboard_visit_at`), listing recent activity summaries, with a "Continue where you left off →" link.

- [ ] **Step 4: Verify Continue Working**

Click into any deal from the roster (e.g. "Project Atlas"). Navigate back to the dashboard.

Expected: a horizontally-scrollable card for that deal now appears in the Hero area, showing its name, current stage, and a relative "just now" timestamp. Clicking it navigates back to that deal.

- [ ] **Step 5: Spot-check the four rewritten empty states**

- On the Deal List page, apply a filter combination that matches nothing (e.g. search for a nonsense string) — confirm "Nothing matched those filters. Try adjusting them." renders.
- On the Roster board view, check a stage column with zero deals (if any) — confirm it reads "All clear".
- On the dashboard, if there are currently zero critical alerts, confirm the Critical Alerts card reads "Nothing critical right now. Enjoy the calm." (If alerts exist from seed data, this can't be seen without clearing dispositions — note as skipped rather than forcing state.)
- Confirm the Recent Activity card (below Close Timeline) reads "It's quiet in here. Let's change that." if empty, or shows real activity otherwise.

- [ ] **Step 6: Mobile viewport check**

Use `browser_resize` (or the Playwright MCP equivalent) to set the viewport to a narrow mobile width (e.g. 390×844). Take a screenshot of the dashboard.

Expected: the Hero's greeting/welcome-back stack full-width and remain readable; the Continue Working strip scrolls horizontally rather than wrapping or overflowing the viewport; no horizontal page-level scrollbar appears.

- [ ] **Step 7: PWA offline soft-fail check**

The service worker only registers in the preview/production build, not `dev` (per this repo's local-run notes) — build and serve instead:

```powershell
$env:PORT='5173'; $env:BASE_PATH='/'; pnpm --filter @workspace/edc run build
$env:PORT='5173'; $env:BASE_PATH='/'; pnpm --filter @workspace/edc run serve
```

Load the app once online so the service worker installs and caches. Then use the browser devtools network panel (or the equivalent MCP tool) to go offline, and reload the dashboard.

Expected: the page still renders from cached data; the greeting still shows (falling back to `previousVisitAt: null` behavior since the mutation can't reach the server) rather than crashing or blocking render.

- [ ] **Step 8: Full typecheck and test suite, whole repo**

```powershell
pnpm run typecheck
pnpm --filter @workspace/edc exec vitest run
```

Expected: both exit 0.

- [ ] **Step 9: Report results to the user**

No commit for this task (verification only) — summarize what was confirmed live, and flag anything that couldn't be exercised (e.g. an empty-state that had no matching data on the seeded dataset).
