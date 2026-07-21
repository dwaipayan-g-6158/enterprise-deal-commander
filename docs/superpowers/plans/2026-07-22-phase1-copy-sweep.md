# Phase 1 Completion: App-Wide Copy Sweep

**Goal:** Complete PRD 4.9 (Human Messages Throughout App) and 4.15 (Smart Empty States) for
Phase 1: Foundation by rewriting every remaining genuinely generic/clinical empty-state,
error-state, loading-text, and 404 string in the app to match the warm, human voice already
established by the Dynamic Greeting Engine and the first-pass empty-state rewrite.

**Scope:** 83 strings identified by survey, grouped into 10 file-disjoint tasks. Strings that
already have decent, specific copy (e.g. "No stakeholders mapped yet — Add a stakeholder below
to track buying committee dynamics.") are explicitly OUT of scope — left untouched.

**Nature of change:** Pure string-literal edits in JSX/toast text. No new components, no new
logic, no schema/API changes. Each task is independently testable via `pnpm typecheck` +
existing test suite (no new tests needed — this is content, not behavior).

## Voice Guidelines (apply to every string)

Established precedent already shipped in this app:
- "All clear" (board column, no deals)
- "Nothing matched those filters. Try adjusting them." (deals list, filtered empty)
- "Your active pipeline is empty. Time to find the next opportunity." (deals list, active empty)
- "No closed deals yet. Your first win will show up here." (deals list, closed empty)
- "It's quiet in here. Let's change that." (recent activity empty)
- "Nothing critical right now. Enjoy the calm." (critical alerts empty)
- "Nothing needs you in the next 48 hours." (next actions empty)
- "No stale deals. Pipeline velocity is healthy." (stale deals empty)

**Rules:**
1. **Empty states**: reframe absence positively where honest (calm/clear/healthy), never just
   negate ("No X available/found/logged/recorded"). Short — one line, occasionally two.
2. **Error states**: acknowledge the failure plainly, no jargon, no false cheerfulness (an
   error is not good news). Keep it short and human: say what didn't load, imply it's
   retriable if a retry affordance exists. Do NOT invent a retry button if one doesn't exist.
3. **Loading text**: replace bare "Loading..." with a one-line phrase naming what's loading,
   matching the pattern already used elsewhere ("Analyzing losses…", "Computing loss
   intelligence…", "Searching…").
4. **404 page**: needs actual personality — this is currently dev debug text
   ("Did you forget to add the page to the router?") shipped to end users. Replace with a
   short, human message plus a clear way back (check what link/button already exists first).
5. **No count interpolation** in this sweep — these are all static strings, not templates. If
   a string does contain a `${...}` interpolation (e.g. `` `No ${label} deals.` ``), keep the
   interpolation but warm up the surrounding words — don't remove the dynamic part.
6. Do not change component structure, props, or logic — only the string literals/JSX text
   content. Do not touch already-decent strings even if adjacent in the same file.
7. Match existing capitalization/punctuation conventions in the surrounding file (sentence
   case, ending periods on statements).

## Task Breakdown (file-disjoint — safe to execute in parallel)

### Task 1: Dashboard Widgets
Files: `components/dashboard/widgets/close-timeline.tsx:71`,
`components/dashboard/widgets/deal-roster.tsx:60`,
`components/dashboard/widgets/stage-funnel.tsx:50`,
`components/dashboard/widgets/velocity-summary.tsx:53`,
`components/dashboard/widgets/gate-funnel.tsx:43`,
`components/dashboard/widgets/pipeline-risk-overview.tsx:68,85,95`,
`components/dashboard/widgets/pipeline-risk.ts:89`,
`components/dashboard/critical-alerts-dialog.tsx:103`,
`components/dashboard/stage-deals-dialog.tsx:75`,
`components/dashboard/health-status-dialog.tsx:120`.

### Task 2: Deal Cockpit Core Panels
Files: `components/cockpit/blockers-panel.tsx:144`,
`components/cockpit/activity-feed.tsx:19,41`,
`components/cockpit/history-panel.tsx:65,113,147`,
`components/cockpit/product-mix-section.tsx:45,86,113`,
`components/cockpit/portfolio-risk-heatmap.tsx:41`,
`components/cockpit/portfolio-summary-cards.tsx:91`,
`components/cockpit/account-navigation-array.tsx:160,190`.

### Task 3: Deal Cockpit Risk/Briefing/Snapshot
Files: `components/cockpit/snapshot-viewer.tsx:142,224,260`,
`components/cockpit/risk-simulator.tsx:341`,
`components/cockpit/risk-governance.tsx:274,283`,
`components/cockpit/briefing-mode.tsx:382,587`,
`components/cockpit/deal-trajectory.tsx:831`,
`pages/deal-cockpit.tsx:241`.

### Task 4: Cockpit v2 Panels
Files: `components/cockpit/v2/playbook-panel.tsx:320-323`,
`components/cockpit/v2/decisions-panel.tsx:60`,
`components/cockpit/v2/score-panel.tsx:31,95`,
`components/cockpit/v2/pricing-panel.tsx:351` (toast title "Save failed"),
`components/cockpit/v2/stakeholders-panel.tsx:79` (toast title "Failed to add").

### Task 5: Autopsy
Files: `components/autopsy/loss-dashboard-panel.tsx:117`,
`components/autopsy/archetype-breakdown.tsx:48`,
`components/autopsy/product-gaps-panel.tsx:27`.

### Task 6: Memory Hub
Files: `pages/memory-detail.tsx:37`,
`components/memory/pricing-tab.tsx:76`,
`components/memory/advisor-tab.tsx:23`,
`components/memory/detail/connections-tab.tsx:52,60`,
`components/memory/revival-tab.tsx:27`,
`components/memory/detail/narrative-tab.tsx:56` (toast title "Could not save").

### Task 7: Roster/Board
Files: `components/roster/manage-views-dialog.tsx:34`,
`components/roster/more-filters-panel.tsx:75`,
`components/roster/multi-select-filter.tsx:71`,
`components/roster/timeline/roster-timeline.tsx:28`,
`components/roster/preview-content.tsx:96`,
`pages/deals.tsx:276,376`.

### Task 8: Shared Picker/Combobox
Files: `components/command-palette.tsx:93`,
`components/ui/combobox.tsx:50,154` (default `emptyText` props),
`components/cockpit/create-deal-sheet.tsx:273,283,406,420`,
`components/cockpit/edit-deal-sheet.tsx:348,358,481,495`,
`components/memory/autopsy-form.tsx:228`,
`components/cockpit/v2/competitive-panel.tsx:127`.

Note: several of these are the *same* clinical phrase repeated as prop overrides
(`emptyText="No team members found."` etc.) — rewrite consistently at every call site, not
just the default.

### Task 9: Flow Components (Analytics tab)
Files: `components/cockpit/flow/conversion-matrix.tsx:28`,
`components/cockpit/flow/coverage-tracker.tsx:27`,
`components/cockpit/flow/pipeline-funnel.tsx:13`,
`components/cockpit/flow/pipeline-pulse.tsx:19`,
`components/cockpit/flow/recycle-exit.tsx:72`,
`components/cockpit/flow/transition-sankey.tsx:43`.

### Task 10: Settings, Portfolio, Analytics header, App loading, 404
Files: `components/settings/scoring-weights-settings.tsx:100`,
`pages/portfolio.tsx:14,15,18`,
`pages/analytics-overview.tsx:60`,
`App.tsx:57`,
`pages/not-found.tsx` (full rewrite — read the current file first, keep the same "go back"
affordance if one exists, just replace the copy and tone).

## Execution

Each task is dispatched to a separate implementer subagent in parallel (file-disjoint, no
merge conflicts possible). Each subagent:
1. Reads its exact files/lines.
2. Rewrites only the identified strings per the Voice Guidelines above.
3. Runs `pnpm --filter @workspace/edc exec tsc -p tsconfig.json --noEmit` scoped check is
   covered by the final combined typecheck — subagents do not need to run it individually,
   but must not introduce syntax errors.
4. Commits its own changes with a task-scoped message (`content: warm up empty/error copy in
   <area>`).

After all 10 tasks complete: run `pnpm run typecheck` and
`pnpm --filter @workspace/edc exec vitest run` once centrally, then one final review pass
across the combined diff for tone consistency and any missed clinical phrasing.
