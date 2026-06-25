# V1 Missing Features Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement all 8 V1 PRD features currently missing or partial: rate limiting, account lockout, AccountNavigationArray, gate debouncing, keyboard shortcuts, skip-GREEN briefing filter, auto-save with undo toast, and deal-switch guard.

**Architecture:** Backend tasks (Tasks 1–2) add middleware and route logic to `artifacts/api-server` and require an esbuild rebuild. Frontend tasks (Tasks 3–8) are isolated component additions/modifications with no API contract changes; no codegen needed. All changes are additive — no existing behavior is removed.

**Tech Stack:** Express 5, express-rate-limit ^7, Drizzle ORM, PostgreSQL 16, React 19, react-hook-form, @tanstack/react-query, wouter, shadcn/ui/Radix, TypeScript strict, pnpm workspace monorepo.

## Global Constraints

- pnpm only — `preinstall` guard rejects npm/yarn; use `pnpm add --filter @workspace/api-server`
- Node 24, PostgreSQL 16
- esbuild bundles `artifacts/api-server` — **must rebuild** after any api-server source change: `pnpm --filter @workspace/api-server run dev`
- Do NOT hand-edit `src/generated/**` in `lib/api-zod` or `lib/api-client-react` — none of these tasks touch the API contract, so no codegen needed
- Supply-chain policy: `minimumReleaseAge: 1440` in `pnpm-workspace.yaml`; express-rate-limit is a well-known, stable package — add to `minimumReleaseAgeExclude` if pnpm rejects it due to age
- Tailwind v4 in use — write utility classes, not arbitrary `style=` props, for health colors
- Run `pnpm run typecheck` before calling any task done
- Database changes (Task 2) go via direct SQL — do not use `drizzle-kit push` (hits TTY prompt on Windows)

---

## File Map

| File | Tasks | Action |
|------|-------|--------|
| `artifacts/api-server/package.json` | 1 | Add `express-rate-limit` dep |
| `artifacts/api-server/src/app.ts` | 1 | Add two rate-limit middlewares |
| `lib/db/src/schema/auth.ts` | 2 | Add `loginAttempts` + `lockedUntil` columns |
| `artifacts/api-server/src/routes/auth.ts` | 2 | Lockout check, failure increment, success reset |
| `artifacts/edc/src/components/cockpit/account-navigation-array.tsx` | 3 | **NEW** horizontal deal-switcher strip |
| `artifacts/edc/src/pages/deal-cockpit.tsx` | 3, 5, 8 | Add AccountNavigationArray; keyboard shortcuts; deal-switch guard |
| `artifacts/edc/src/components/cockpit/technical-gates.tsx` | 4 | Replace explicit save with 500ms debounce |
| `artifacts/edc/src/components/cockpit/briefing-mode.tsx` | 6 | Add filterGreen state + toggle + skip logic |
| `artifacts/edc/src/components/cockpit/edit-deal-sheet.tsx` | 7, 8 | Auto-save on change debounce + undo toast + expose dirty ref |

---

### Task 1: Rate Limiting

**Files:**
- Modify: `artifacts/api-server/package.json`
- Modify: `artifacts/api-server/src/app.ts`

**Interfaces:**
- Produces: `POST /api/v1/auth/login` returns `429 Too Many Requests` after 10 requests/15 min; all `/api/` routes return `429` after 100 requests/15 min

- [ ] **Step 1: Install express-rate-limit**

```bash
pnpm add --filter @workspace/api-server express-rate-limit
```

Expected: `pnpm-lock.yaml` updated, `express-rate-limit` appears in `artifacts/api-server/package.json` dependencies.

- [ ] **Step 2: Add rate-limit middleware to `artifacts/api-server/src/app.ts`**

Current imports section (top of file):
```typescript
import express from "express";
import cors from "cors";
import cookieParser from "cookie-parser";
import pinoHttp from "pino-http";
import { router } from "./routes/index.js";
import { pino } from "pino";
```

Add after existing imports:
```typescript
import rateLimit from "express-rate-limit";
```

After the existing middleware chain (cors, cookieParser, express.json), add both limiters before `app.use("/api", router)`:

```typescript
const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: { code: "RATE_LIMITED", message: "Too many requests. Try again later." } },
});

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: { code: "RATE_LIMITED", message: "Too many login attempts. Try again in 15 minutes." } },
});

app.use("/api/", apiLimiter);
app.use("/api/v1/auth/login", authLimiter);
```

- [ ] **Step 3: Rebuild API server and verify**

```bash
pnpm --filter @workspace/api-server run dev
```

Expected: Server starts on port 5000 with no TypeScript errors.

- [ ] **Step 4: Commit**

```bash
git add artifacts/api-server/package.json artifacts/api-server/src/app.ts pnpm-lock.yaml
git commit -m "feat: add express-rate-limit (100/15min API, 10/15min auth)"
```

---

### Task 2: Account Lockout

**Files:**
- Modify: `lib/db/src/schema/auth.ts`
- Modify: `artifacts/api-server/src/routes/auth.ts`

**Interfaces:**
- Consumes: `commanders` table (Task 2 adds `login_attempts int`, `locked_until timestamptz`)
- Produces: Login returns `429 ACCOUNT_LOCKED` when `locked_until > NOW()`; increments `login_attempts` on failure; resets on success

- [ ] **Step 1: Add columns to the database via direct SQL**

Connect to the running Postgres cluster and execute:

```sql
ALTER TABLE commanders ADD COLUMN IF NOT EXISTS login_attempts integer NOT NULL DEFAULT 0;
ALTER TABLE commanders ADD COLUMN IF NOT EXISTS locked_until timestamp with time zone;
```

On Windows with the portable cluster:
```powershell
$pgbin = "C:\Users\dGiri\AppData\Local\Temp\claude\C--Users-dGiri-Desktop-LABS-EDC-Framework-CLAUDE\116f9c99-92c8-4709-a60d-ce27257164f3\scratchpad\pg\pgsql\bin"
& "$pgbin\psql.exe" -U postgres -d edc -c "ALTER TABLE commanders ADD COLUMN IF NOT EXISTS login_attempts integer NOT NULL DEFAULT 0; ALTER TABLE commanders ADD COLUMN IF NOT EXISTS locked_until timestamp with time zone;"
```

Expected: `ALTER TABLE` printed twice (or `NOTICE: column already exists` if re-run).

- [ ] **Step 2: Update the Drizzle schema to match**

Replace the contents of `lib/db/src/schema/auth.ts` with:

```typescript
import { pgTable, uuid, varchar, timestamp, integer } from "drizzle-orm/pg-core";

export const commanders = pgTable("commanders", {
  id: uuid("id").primaryKey().defaultRandom(),
  username: varchar("username", { length: 255 }).notNull().unique(),
  displayName: varchar("display_name", { length: 255 }).notNull(),
  passwordHash: varchar("password_hash", { length: 255 }).notNull(),
  loginAttempts: integer("login_attempts").notNull().default(0),
  lockedUntil: timestamp("locked_until", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});
```

- [ ] **Step 3: Update auth route to enforce lockout**

Replace the login route body in `artifacts/api-server/src/routes/auth.ts`. The current implementation:

```typescript
router.post("/auth/login", async (req, res) => {
  const parsed = LoginRequest.safeParse(req.body);
  if (!parsed.success) throw badRequest("Invalid request body", parsed.error.flatten());
  const { email, password } = parsed.data;
  const rows = await db.select().from(commanders).where(eq(commanders.username, email)).limit(1);
  const commander = rows[0];
  if (!commander) throw unauthorized("Invalid email or password");
  const ok = await bcrypt.compare(password, commander.passwordHash);
  if (!ok) throw unauthorized("Invalid email or password");
  issueSession(res, { id: commander.id, username: commander.username, displayName: commander.displayName });
  res.json(LoginResponse.parse({ message: "Signed in" }));
});
```

Replace with:

```typescript
router.post("/auth/login", async (req, res) => {
  const parsed = LoginRequest.safeParse(req.body);
  if (!parsed.success) throw badRequest("Invalid request body", parsed.error.flatten());
  const { email, password } = parsed.data;

  const rows = await db.select().from(commanders).where(eq(commanders.username, email)).limit(1);
  const commander = rows[0];
  if (!commander) throw unauthorized("Invalid email or password");

  // Lockout check
  if (commander.lockedUntil && commander.lockedUntil > new Date()) {
    const retryAfterMs = commander.lockedUntil.getTime() - Date.now();
    const retryAfterSec = Math.ceil(retryAfterMs / 1000);
    res.setHeader("Retry-After", String(retryAfterSec));
    throw new HttpError(429, "ACCOUNT_LOCKED", "Account locked due to too many failed attempts. Try again in 15 minutes.");
  }

  const ok = await bcrypt.compare(password, commander.passwordHash);
  if (!ok) {
    const newAttempts = commander.loginAttempts + 1;
    const lockedUntil = newAttempts >= 5 ? new Date(Date.now() + 15 * 60 * 1000) : null;
    await db
      .update(commanders)
      .set({ loginAttempts: newAttempts, lockedUntil })
      .where(eq(commanders.id, commander.id));
    throw unauthorized("Invalid email or password");
  }

  // Reset on success
  await db.update(commanders).set({ loginAttempts: 0, lockedUntil: null }).where(eq(commanders.id, commander.id));

  issueSession(res, { id: commander.id, username: commander.username, displayName: commander.displayName });
  res.json(LoginResponse.parse({ message: "Signed in" }));
});
```

Also add the `HttpError` import to `artifacts/api-server/src/routes/auth.ts` if not already present:
```typescript
import { badRequest, unauthorized, HttpError } from "../lib/http.js";
```

- [ ] **Step 4: Typecheck and rebuild**

```bash
pnpm run typecheck
pnpm --filter @workspace/api-server run dev
```

Expected: No TypeScript errors. Server restarts cleanly.

- [ ] **Step 5: Commit**

```bash
git add lib/db/src/schema/auth.ts artifacts/api-server/src/routes/auth.ts
git commit -m "feat: account lockout after 5 failed login attempts (15-min lock)"
```

---

### Task 3: AccountNavigationArray

**Files:**
- Create: `artifacts/edc/src/components/cockpit/account-navigation-array.tsx`
- Modify: `artifacts/edc/src/pages/deal-cockpit.tsx`

**Interfaces:**
- Consumes: `useListDeals({ state: "active" })` from `@workspace/api-client-react`; `formatCurrency` from `./use-invalidate`; `useLocation` from `wouter`
- Produces: Horizontal scrollable strip rendered above cockpit content; clicking a deal tab navigates to `/deals/:id`

- [ ] **Step 1: Create the AccountNavigationArray component**

Create `artifacts/edc/src/components/cockpit/account-navigation-array.tsx`:

```typescript
import { useListDeals } from "@workspace/api-client-react";
import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Plus } from "lucide-react";
import { formatCurrency } from "./use-invalidate";
import { cn } from "@/lib/utils";

const healthBorder: Record<string, string> = {
  RED: "border-l-destructive",
  YELLOW: "border-l-amber-500",
  GREEN: "border-l-emerald-500",
};

const healthText: Record<string, string> = {
  RED: "text-destructive",
  YELLOW: "text-amber-600 dark:text-amber-400",
  GREEN: "text-emerald-600 dark:text-emerald-400",
};

export function AccountNavigationArray({ activeDealId }: { activeDealId: string }) {
  const [_, navigate] = useLocation();
  const { data } = useListDeals({ state: "active" });

  const deals = [...(data?.data ?? [])]
    .sort((a, b) => (b.calculatedTCV ?? 0) - (a.calculatedTCV ?? 0));

  return (
    <div className="flex items-center gap-1 overflow-x-auto pb-1 scrollbar-none border-b bg-muted/30">
      {deals.map((deal) => (
        <button
          key={deal.id}
          onClick={() => navigate(`/deals/${deal.id}`)}
          className={cn(
            "flex-shrink-0 flex flex-col items-start px-3 py-2 text-left border-l-4 rounded-sm",
            "hover:bg-muted transition-colors min-w-[160px] max-w-[220px]",
            healthBorder[deal.healthStatus] ?? "border-l-border",
            deal.id === activeDealId
              ? "bg-muted ring-1 ring-primary/40"
              : "bg-background",
          )}
        >
          <span className="text-xs text-muted-foreground truncate w-full">{deal.accountName}</span>
          <span className="text-sm font-medium truncate w-full">{deal.dealName}</span>
          <span className={cn("text-xs font-mono", healthText[deal.healthStatus] ?? "text-muted-foreground")}>
            {formatCurrency(deal.calculatedTCV ?? 0, deal.dealCurrency)}
          </span>
        </button>
      ))}
      <Button
        variant="ghost"
        size="sm"
        className="flex-shrink-0 ml-1"
        onClick={() => navigate("/deals")}
      >
        <Plus className="h-4 w-4 mr-1" />
        New Deal
      </Button>
    </div>
  );
}
```

- [ ] **Step 2: Add AccountNavigationArray to deal-cockpit.tsx**

At the top of `deal-cockpit.tsx`, add the import:
```typescript
import { AccountNavigationArray } from "@/components/cockpit/account-navigation-array";
```

In the return JSX, change the outermost `<div className="p-8 max-w-[1600px] mx-auto space-y-6">` wrapper. Add the navigation array BEFORE the padding wrapper so it spans full width:

Replace:
```typescript
  return (
    <div className="p-8 max-w-[1600px] mx-auto space-y-6">
      {/* Header */}
```

With:
```typescript
  return (
    <div className="flex flex-col h-full">
      <AccountNavigationArray activeDealId={id} />
      <div className="p-8 max-w-[1600px] mx-auto space-y-6 w-full">
      {/* Header */}
```

And close the extra `<div>` at the end of the component (before the modals):
```typescript
      </div>  {/* closes inner p-8 div */}
      <EditDealSheet ...
```

- [ ] **Step 3: Typecheck**

```bash
pnpm run typecheck
```

Expected: No errors.

- [ ] **Step 4: Commit**

```bash
git add artifacts/edc/src/components/cockpit/account-navigation-array.tsx artifacts/edc/src/pages/deal-cockpit.tsx
git commit -m "feat: add AccountNavigationArray horizontal deal-switcher strip"
```

---

### Task 4: Gate Batch Debouncing

**Files:**
- Modify: `artifacts/edc/src/components/cockpit/technical-gates.tsx`

**Interfaces:**
- Consumes: `onSaveRef?: React.MutableRefObject<(() => Promise<void>) | null>` prop (for Ctrl+S in Task 5)
- Produces: Checkbox toggles trigger auto-save after 500ms; explicit save button remains as manual flush; errors reset draft to server state

- [ ] **Step 1: Add debounce to TechnicalGates**

Replace the full contents of `artifacts/edc/src/components/cockpit/technical-gates.tsx` with:

```typescript
import { useEffect, useRef, useState } from "react";
import {
  useListGates,
  useListGateDefinitions,
  useUpdateGatesBatch,
  type IntegrityWarning,
} from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { useCockpitInvalidate } from "./use-invalidate";
import { AlertTriangle } from "lucide-react";

export function TechnicalGates({
  dealId,
  progressPercentage,
  integrityWarnings,
  onSaveRef,
}: {
  dealId: string;
  progressPercentage: number;
  integrityWarnings: IntegrityWarning[];
  onSaveRef?: React.MutableRefObject<(() => Promise<void>) | null>;
}) {
  const { toast } = useToast();
  const invalidate = useCockpitInvalidate(dealId);
  const { data: gates } = useListGates(dealId);
  const { data: definitions } = useListGateDefinitions();
  const updateBatch = useUpdateGatesBatch();

  const [draft, setDraft] = useState<Record<string, boolean>>({});
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (gates?.data) {
      const next: Record<string, boolean> = {};
      for (const g of gates.data) next[g.gateCode] = g.isCompleted;
      setDraft(next);
    }
  }, [gates?.data]);

  useEffect(() => {
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, []);

  const defByCode = new Map((definitions?.data ?? []).map((d) => [d.gateCode, d]));
  const list = gates?.data ?? [];
  const dirty = list.some((g) => draft[g.gateCode] !== g.isCompleted);

  const saveWithDraft = async (currentDraft: Record<string, boolean>) => {
    const updates = list
      .filter((g) => currentDraft[g.gateCode] !== g.isCompleted)
      .map((g) => ({ gate_code: g.gateCode, is_completed: currentDraft[g.gateCode] }));
    if (updates.length === 0) return;
    try {
      const res = await updateBatch.mutateAsync({ dealId, data: { updates } });
      await invalidate();
      const warnings = res.integrityWarnings ?? [];
      if (warnings.length > 0) {
        toast({
          title: "Gates saved with warnings",
          description: warnings.map((w) => w.message).join(" "),
          variant: "destructive",
        });
      }
    } catch (err: unknown) {
      const msg = (err as { data?: { error?: { message?: string } } })?.data?.error?.message;
      toast({ title: "Save failed", description: msg ?? "Could not update gates.", variant: "destructive" });
      if (gates?.data) {
        const reset: Record<string, boolean> = {};
        for (const g of gates.data) reset[g.gateCode] = g.isCompleted;
        setDraft(reset);
      }
    }
  };

  const handleToggle = (gateCode: string, value: boolean) => {
    const newDraft = { ...draft, [gateCode]: value };
    setDraft(newDraft);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => saveWithDraft(newDraft), 500);
  };

  const manualSave = async () => {
    if (debounceRef.current) {
      clearTimeout(debounceRef.current);
      debounceRef.current = null;
    }
    await saveWithDraft(draft);
    toast({ title: "Gates updated", description: "Technical track progress saved." });
  };

  // Expose save trigger for Ctrl+S
  useEffect(() => {
    if (onSaveRef) onSaveRef.current = manualSave;
  });

  const groups = [...new Set(list.map((g) => g.gateGroup))].sort((a, b) => a - b);
```

Then keep the JSX portion from the original file (starting at the `return (` line). The only JSX change: in the save button handler, use `manualSave` instead of `save`:

Find in the return JSX (near the bottom of the component):
```typescript
onClick={save}
```
Change to:
```typescript
onClick={manualSave}
```

- [ ] **Step 2: Typecheck**

```bash
pnpm run typecheck
```

- [ ] **Step 3: Commit**

```bash
git add artifacts/edc/src/components/cockpit/technical-gates.tsx
git commit -m "feat: replace explicit gate save with 500ms debounce auto-save"
```

---

### Task 5: Keyboard Shortcuts

**Files:**
- Modify: `artifacts/edc/src/pages/deal-cockpit.tsx`

**Interfaces:**
- Consumes: `gatesSaveRef` passed to `TechnicalGates.onSaveRef`; `useListDeals` for ← → deal navigation; `useLocation` from wouter
- Produces: Ctrl+B toggles briefing; Ctrl+S flushes gate save; Escape closes briefing; ← → navigates sorted deals

- [ ] **Step 1: Add keyboard shortcut handler to deal-cockpit.tsx**

Add these imports at the top of `deal-cockpit.tsx`:
```typescript
import { useState, useRef, useEffect } from "react";
import { useListDeals } from "@workspace/api-client-react";
import { useLocation } from "wouter";
```

(If `useState` is already imported, just add `useRef` and `useEffect` to the existing import. Add `useListDeals` to the `@workspace/api-client-react` import.)

In the `DealCockpit` function body, after the existing `useState` declarations, add:

```typescript
  const [_, navigate] = useLocation();
  const { data: allDeals } = useListDeals({ state: "active" });
  const gatesSaveRef = useRef<(() => Promise<void>) | null>(null);

  const sortedDeals = [...(allDeals?.data ?? [])].sort(
    (a, b) => (b.calculatedTCV ?? 0) - (a.calculatedTCV ?? 0),
  );

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      const isTyping =
        target.tagName === "INPUT" ||
        target.tagName === "TEXTAREA" ||
        target.isContentEditable;

      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "b") {
        e.preventDefault();
        setBriefingOpen((v) => !v);
        return;
      }

      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "s") {
        e.preventDefault();
        gatesSaveRef.current?.();
        return;
      }

      if (e.key === "Escape" && briefingOpen) {
        setBriefingOpen(false);
        return;
      }

      if (isTyping) return;

      if (e.key === "ArrowLeft" || e.key === "ArrowRight") {
        e.preventDefault();
        const idx = sortedDeals.findIndex((d) => d.id === id);
        if (idx === -1) return;
        const nextIdx = e.key === "ArrowLeft" ? idx - 1 : idx + 1;
        if (nextIdx < 0 || nextIdx >= sortedDeals.length) return;
        navigate(`/deals/${sortedDeals[nextIdx].id}`);
      }
    };

    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [briefingOpen, id, navigate, sortedDeals]);
```

Then wire up `gatesSaveRef` on the `TechnicalGates` component:

Find in the JSX:
```typescript
              <TechnicalGates
                dealId={id}
                progressPercentage={intel.technicalTrack.progressPercentage}
                integrityWarnings={intel.technicalTrack.integrityWarnings}
              />
```

Replace with:
```typescript
              <TechnicalGates
                dealId={id}
                progressPercentage={intel.technicalTrack.progressPercentage}
                integrityWarnings={intel.technicalTrack.integrityWarnings}
                onSaveRef={gatesSaveRef}
              />
```

- [ ] **Step 2: Typecheck**

```bash
pnpm run typecheck
```

- [ ] **Step 3: Commit**

```bash
git add artifacts/edc/src/pages/deal-cockpit.tsx
git commit -m "feat: keyboard shortcuts (Ctrl+B briefing, Ctrl+S gates, Escape, arrows)"
```

---

### Task 6: Skip GREEN Filter in Briefing

**Files:**
- Modify: `artifacts/edc/src/components/cockpit/briefing-mode.tsx`

**Interfaces:**
- Produces: Toggle button in briefing header bar; when active, `goNext()`/`goPrev()` skip deals with `healthStatus === "GREEN"`; `QueueItem` extended with optional `healthStatus`

- [ ] **Step 1: Extend QueueItem and add filterGreen state**

In `briefing-mode.tsx`, find:
```typescript
type QueueItem = { id: string; dealName: string; accountName: string };
```

Replace with:
```typescript
type QueueItem = { id: string; dealName: string; accountName: string; healthStatus?: string };
```

Find the initial queue state:
```typescript
  const [queue, setQueue] = useState<QueueItem[]>([
    { id: deal.id, dealName: deal.dealName, accountName: deal.accountName },
  ]);
```

Replace with:
```typescript
  const [queue, setQueue] = useState<QueueItem[]>([
    { id: deal.id, dealName: deal.dealName, accountName: deal.accountName, healthStatus: deal.healthStatus },
  ]);
  const [filterGreen, setFilterGreen] = useState(false);
```

- [ ] **Step 2: Update goPrev / goNext to skip GREEN when filter is active**

Find:
```typescript
  const goPrev = () => {
    if (activeIndex > 0) setActiveId(queue[activeIndex - 1].id);
  };
```

Replace with:
```typescript
  const goPrev = () => {
    if (!filterGreen) {
      if (activeIndex > 0) setActiveId(queue[activeIndex - 1].id);
      return;
    }
    for (let i = activeIndex - 1; i >= 0; i--) {
      if (queue[i].healthStatus !== "GREEN") {
        setActiveId(queue[i].id);
        return;
      }
    }
  };
```

Find (the goNext function — look for `activeIndex < queue.length - 1`):
```typescript
  const goNext = () => {
    if (activeIndex < queue.length - 1) setActiveId(queue[activeIndex + 1].id);
  };
```

Replace with:
```typescript
  const goNext = () => {
    if (!filterGreen) {
      if (activeIndex < queue.length - 1) setActiveId(queue[activeIndex + 1].id);
      return;
    }
    for (let i = activeIndex + 1; i < queue.length; i++) {
      if (queue[i].healthStatus !== "GREEN") {
        setActiveId(queue[i].id);
        return;
      }
    }
  };
```

- [ ] **Step 3: Add filterGreen toggle button to the header control bar**

In the briefing header bar (the `div` that contains the timer and X close button), find the existing filter/agenda button cluster. Add a toggle button for filterGreen next to the existing buttons.

Find the Agenda button (`<ListOrdered ...`) in the JSX and add the filter toggle after it:

```typescript
          <Button
            variant={filterGreen ? "default" : "ghost"}
            size="sm"
            onClick={() => setFilterGreen((v) => !v)}
            title="Skip GREEN deals in queue"
          >
            <EyeOff className="h-4 w-4 mr-1" />
            Skip GREEN
          </Button>
```

`EyeOff` is already imported in `briefing-mode.tsx`.

- [ ] **Step 4: Pass healthStatus when adding deals to queue from AgendaManager**

In the `AgendaManager` component, find where `onAdd` is called with a new item. In the candidates list rendering, find:

```typescript
              onClick={() =>
                onAdd({ id: d.id, dealName: d.dealName, accountName: d.accountName })
              }
```

Replace with:
```typescript
              onClick={() =>
                onAdd({ id: d.id, dealName: d.dealName, accountName: d.accountName, healthStatus: d.healthStatus })
              }
```

- [ ] **Step 5: Typecheck**

```bash
pnpm run typecheck
```

- [ ] **Step 6: Commit**

```bash
git add artifacts/edc/src/components/cockpit/briefing-mode.tsx
git commit -m "feat: skip-GREEN filter toggle in briefing mode queue"
```

---

### Task 7: Auto-Save with Undo Toast

**Files:**
- Modify: `artifacts/edc/src/components/cockpit/edit-deal-sheet.tsx`

**Interfaces:**
- Consumes: `watch` callback subscription from react-hook-form; `ToastAction` from `@/components/ui/toast`
- Produces: 1s debounce auto-save on field change when sheet is open; undo toast action reverts to pre-save state; `dirtyRef` prop exposes isDirty to parent (for Task 8)

- [ ] **Step 1: Add auto-save scaffolding to edit-deal-sheet.tsx**

Add `useRef` to the React import:
```typescript
import { useState, useRef, useEffect } from "react";
```

Add `ToastAction` to the toast import:
```typescript
import { useToast } from "@/hooks/use-toast";
import { ToastAction } from "@/components/ui/toast";
```

Add `dirtyRef` prop to the component interface:
```typescript
export function EditDealSheet({
  deal,
  open,
  onOpenChange,
  dirtyRef,
}: {
  deal: Deal;
  open: boolean;
  onOpenChange: (v: boolean) => void;
  dirtyRef?: React.MutableRefObject<boolean>;
}) {
```

- [ ] **Step 2: Add auto-save logic**

In the component body, after the existing `useForm` declaration, add:

```typescript
  const autosaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const undoDataRef = useRef<FormState | null>(null);
  const onAutoSaveRef = useRef<((values: FormState) => Promise<void>) | null>(null);

  // Keep dirty ref in sync for deal-switch guard
  const { isDirty } = formState;
  useEffect(() => {
    if (dirtyRef) dirtyRef.current = isDirty;
  }, [isDirty, dirtyRef]);

  // Auto-save: watch all field changes, debounce 1s
  useEffect(() => {
    if (!open) return;
    const { unsubscribe } = watch(() => {
      if (autosaveTimerRef.current) clearTimeout(autosaveTimerRef.current);
      autosaveTimerRef.current = setTimeout(() => {
        if (onAutoSaveRef.current) handleSubmit(onAutoSaveRef.current)();
      }, 1000);
    });
    return () => {
      unsubscribe();
      if (autosaveTimerRef.current) clearTimeout(autosaveTimerRef.current);
    };
  }, [open, watch, handleSubmit]);
```

Note: `formState` must be destructured from `useForm` — update the existing `useForm` destructure to include `formState`:
```typescript
  const { register, handleSubmit, setValue, watch, reset, formState } = useForm<FormState>({
```

- [ ] **Step 3: Add the auto-save handler (no close on success)**

Add `onAutoSaveRef.current` updater in the component body (keep it fresh on each render):

```typescript
  onAutoSaveRef.current = async (values: FormState) => {
    const data: Record<string, unknown> = {
      deal_name: values.deal_name,
      account_name: values.account_name,
      account_manager: values.account_manager,
      technical_lead: values.technical_lead,
      sales_stage_id: Number(values.sales_stage_id),
      pricing_model_id: Number(values.pricing_model_id),
      services_tier_id: Number(values.services_tier_id),
      product_revenue: Number(values.product_revenue),
      services_revenue: Number(values.services_revenue),
      contract_term_years: Number(values.contract_term_years),
      deal_currency: values.deal_currency.toUpperCase(),
      expected_close_date: values.expected_close_date || null,
      win_probability_pct:
        values.win_probability_pct === "" ? null : Number(values.win_probability_pct),
      manager_strategic_blueprint: values.manager_strategic_blueprint || null,
      speaker_notes: values.speaker_notes || null,
      competitor_id: values.competitor_id === "" ? null : Number(values.competitor_id),
      compliance_driver_id:
        values.compliance_driver_id === "" ? null : Number(values.compliance_driver_id),
      compliance_deadline: values.compliance_deadline || null,
      estimated_log_sources:
        values.estimated_log_sources === "" ? null : Number(values.estimated_log_sources),
      product_interest_ids: interestIds,
      compliance_driver_ids: extraDriverIds,
    };
    if (overrideReason.trim().length >= 10) {
      data.override_reason = overrideReason.trim();
    }
    try {
      const prevUndo = undoDataRef.current;
      undoDataRef.current = values;
      await updateDeal.mutateAsync({ id: deal.id, data: data as never });
      await invalidate();
      toast({
        title: "Auto-saved",
        description: "Changes saved automatically.",
        action: prevUndo ? (
          <ToastAction
            altText="Undo"
            onClick={async () => {
              reset(prevUndo);
              undoDataRef.current = null;
              handleSubmit(onAutoSaveRef.current!)();
            }}
          >
            Undo
          </ToastAction>
        ) : undefined,
      });
      setGuardrail(null);
    } catch (err: unknown) {
      const body = (err as { data?: { error?: { code?: string; message?: string; patternCodes?: string[] } } })?.data;
      const apiErr = body?.error;
      if (apiErr?.code === "STAGE_GUARDRAIL" || (apiErr?.patternCodes && apiErr.patternCodes.length > 0)) {
        setGuardrail({
          message: apiErr.message ?? "Stage advancement is blocked by active risk patterns.",
          patternCodes: apiErr.patternCodes ?? [],
        });
        return;
      }
      // Silent failure for auto-save (don't interrupt user)
    }
  };
```

- [ ] **Step 4: Typecheck**

```bash
pnpm run typecheck
```

- [ ] **Step 5: Commit**

```bash
git add artifacts/edc/src/components/cockpit/edit-deal-sheet.tsx
git commit -m "feat: auto-save with undo toast on edit deal sheet (1s debounce)"
```

---

### Task 8: Deal-Switch Guard

**Files:**
- Modify: `artifacts/edc/src/pages/deal-cockpit.tsx`

**Interfaces:**
- Consumes: `dirtyRef` from `EditDealSheet` (wired in Task 7)
- Produces: `window.beforeunload` warning when form is dirty; confirmation dialog before keyboard ← → navigation when dirty

- [ ] **Step 1: Add formDirtyRef and wire it to EditDealSheet**

In `deal-cockpit.tsx`, in the function body, add:
```typescript
  const formDirtyRef = useRef(false);
```

And add a `beforeunload` guard effect:
```typescript
  useEffect(() => {
    const handler = (e: BeforeUnloadEvent) => {
      if (formDirtyRef.current) {
        e.preventDefault();
        e.returnValue = "";
      }
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, []);
```

- [ ] **Step 2: Guard arrow-key navigation**

In the keydown handler added in Task 5, find the ArrowLeft/ArrowRight block:
```typescript
      if (e.key === "ArrowLeft" || e.key === "ArrowRight") {
        e.preventDefault();
        const idx = sortedDeals.findIndex((d) => d.id === id);
        if (idx === -1) return;
        const nextIdx = e.key === "ArrowLeft" ? idx - 1 : idx + 1;
        if (nextIdx < 0 || nextIdx >= sortedDeals.length) return;
        navigate(`/deals/${sortedDeals[nextIdx].id}`);
      }
```

Replace the `navigate` call with a guard:
```typescript
      if (e.key === "ArrowLeft" || e.key === "ArrowRight") {
        e.preventDefault();
        const idx = sortedDeals.findIndex((d) => d.id === id);
        if (idx === -1) return;
        const nextIdx = e.key === "ArrowLeft" ? idx - 1 : idx + 1;
        if (nextIdx < 0 || nextIdx >= sortedDeals.length) return;
        if (formDirtyRef.current && !window.confirm("You have unsaved changes. Leave anyway?")) return;
        navigate(`/deals/${sortedDeals[nextIdx].id}`);
      }
```

- [ ] **Step 3: Pass dirtyRef to EditDealSheet**

Find in the JSX:
```typescript
      <EditDealSheet deal={deal} open={editOpen} onOpenChange={setEditOpen} />
```

Replace with:
```typescript
      <EditDealSheet deal={deal} open={editOpen} onOpenChange={setEditOpen} dirtyRef={formDirtyRef} />
```

- [ ] **Step 4: Typecheck**

```bash
pnpm run typecheck
```

- [ ] **Step 5: Commit**

```bash
git add artifacts/edc/src/pages/deal-cockpit.tsx
git commit -m "feat: deal-switch guard (beforeunload + arrow-key nav confirms dirty form)"
```

---

## Verification Checklist

After all tasks are complete:

- [ ] `pnpm run typecheck` — zero errors across all packages
- [ ] API server running: rate limit headers (`X-RateLimit-*`) visible in browser network tab on any `/api/` request
- [ ] Login with wrong password 5× → subsequent attempt returns 429 ACCOUNT_LOCKED
- [ ] Deal cockpit shows horizontal AccountNavigationArray strip sorted by TCV
- [ ] Toggling a gate checkbox auto-saves after 500ms with no manual button press
- [ ] Ctrl+B opens briefing; Escape closes briefing; Ctrl+S triggers gate save
- [ ] ← → arrows navigate between deals (sorted by TCV)
- [ ] Briefing mode "Skip GREEN" toggle skips GREEN deals on navigation
- [ ] Changing a field in Edit Deal Sheet auto-saves after 1s; undo toast appears
- [ ] Refreshing page while form is dirty triggers browser's native "Leave site?" prompt
