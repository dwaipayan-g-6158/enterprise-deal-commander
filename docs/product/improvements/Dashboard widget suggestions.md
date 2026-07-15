# EDC Dashboard — Mandatory Widget Specification

I've thought through this from the perspective of a Commander who opens the app at 7:45 AM before a full day of meetings. Every widget must answer a question they need answered *before their first conversation*. I've organized this into three tiers: the ones you absolutely cannot ship without, the ones that transform it from good to exceptional, and the ones that make it unmatched.

---

## Dashboard Design Philosophy

Before the widgets: the dashboard is not a data dump. It is a **decision surface**. Every pixel must answer one of six questions:

```
┌─────────────────────────────────────────────────────────────┐
│  1. "How much money is at stake?"          → Big Numbers    │
│  2. "What's broken right now?"             → Alerts         │
│  3. "Where are deals stuck?"               → Pipeline       │
│  4. "What should I do next?"               → Actions        │
│  5. "Is my forecast real?"                 → Predictions    │
│  6. "What just changed?"                   → Activity       │
└─────────────────────────────────────────────────────────────┘
```

---

## TIER 1 — Non-Negotiable (Ship Blockers)

These seven widgets are the minimum viable dashboard. If any is missing, the Commander will tab back to their spreadsheet.

---

### Widget 1: Pipeline Vital Signs (The Big Numbers Bar)

**Position:** Top of dashboard, full width, always visible
**Question answered:** "How much money is at stake and is the pipeline healthy?"

```
┌─────────────────────────────────────────────────────────────────────────────────┐
│                                                                                 │
│   $8.45M              $5.23M              12               2                    │
│   TOTAL MONITORED     WEIGHTED PIPELINE   ACTIVE DEALS    RED ALERTS           │
│   TCV                 (predicted)                                                │
│                                                                                 │
│   ▲ +$1.2M            ▼ -$340K            ─ vs last wk    ▲ +1 vs last wk     │
│   vs last week        vs last week                                               │
│                                                                                 │
└─────────────────────────────────────────────────────────────────────────────────┘
```

**Data source:**
- `Total Monitored TCV` — SUM of `calculatedTCV` across all deals not in Closed-Won/Closed-Lost
- `Weighted Pipeline` — SUM of `(calculatedTCV × predictiveScore / 100)` across active deals
- `Active Deals` — COUNT of non-closed deals
- `Red Alerts` — COUNT of deals where `healthStatus = 'RED'`

**Delta indicators:** Each number shows a trend arrow and delta vs. previous week (computed from last week's snapshot). Colors: green for positive movement, red for negative.

**Interaction:**
- Click any number to filter the full dashboard to that subset
- Click "RED ALERTS: 2" → dashboard filters to show only RED deals
- Click again to clear filter

**Why it's non-negotiable:** This is the Commander's heartbeat check. Without it, every meeting starts with "Let me look that up..."

---

### Widget 2: Health Distribution (The Pulse)

**Position:** Left column, second row
**Question answered:** "At a glance, how sick is my pipeline?"

```
┌──────────────────────────────┐
│  PIPELINE HEALTH             │
│                              │
│        ┌───────┐             │
│       /  6     \             │
│      │ GREEN   │             │
│      │         │  12 total   │
│       \ 4     /   deals      │
│        └──┬──┘               │
│       2   │                  │
│      RED  │ YELLOW           │
│           │                  │
│  ████████ 6 GREEN  (50%)     │
│  ██████   4 YELLOW (33%)     │
│  ████     2 RED    (17%)     │
│                              │
│  Trend: ▼ +1 RED this week   │
│  (was 1 RED last Monday)     │
└──────────────────────────────┘
```

**Design:** Donut/ring chart (not a pie chart — the hole lets you show the total in the center). Colors: `#22C55E` green, `#F59E0B` amber, `#EF4444` red. Clean, no 3D effects, no gradients.

**Data source:**
- `COUNT(*) GROUP BY health_status` from the intelligence engine output
- Trend: compare with `deal_health_history` from 7 days ago

**Interaction:**
- Click a segment → dashboard filters to that health status
- Hover → shows deals in that segment as a tooltip list

**Why it's non-negotiable:** A single RED deal out of 12 means 8% of the pipeline needs immediate intervention. A single RED deal out of 2 means 50%. The Commander needs the ratio, not just the count.

---

### Widget 3: Critical Alerts Feed (The War Room Ticker)

**Position:** Right column, prominent (top-right — the eye naturally lands here)
**Question answered:** "What's broken right now that I need to fix today?"

```
┌──────────────────────────────────────────┐
│  ⚠ CRITICAL ALERTS (2)         [View All]│
│                                          │
│  ┌────────────────────────────────────┐  │
│  │ 🔴 ACME CORP — $1.45M             │  │
│  │ PREMATURE COMMERCIAL DISCONNECT    │  │
│  │ Sales moved to contract before     │  │
│  │ Gate 3 completion.                 │  │
│  │ 3 hours ago │ [View Deal →]        │  │
│  └────────────────────────────────────┘  │
│                                          │
│  ┌────────────────────────────────────┐  │
│  │ 🔴 ATLAS HEALTH — $1.93M          │  │
│  │ CLOSE DATE PRESSURE                │  │
│  │ 18 days to close, 44% gates done.  │  │
│  │ Expected: ≥50%.                    │  │
│  │ 1 day ago │ [View Deal →]          │  │
│  └────────────────────────────────────┘  │
│                                          │
│  ┌────────────────────────────────────┐  │
│  │ 🟡 GLOBAL OMNI — $3.1M            │  │
│  │ UNPROTECTED ELEPHANT               │  │
│  │ $3.1M TCV with no services SOW.    │  │
│  │ 2 days ago │ [View Deal →]         │  │
│  └────────────────────────────────────┘  │
│                                          │
└──────────────────────────────────────────┘
```

**Data source:**
- Intelligence engine `alerts` array for all active deals
- Sorted by: severity (RED first), then `weight` (highest first), then recency
- Shows top 3 on dashboard; "View All" opens full alert list

**Design rules:**
- Each alert card has a colored left border matching severity
- Deal name and TCV are bold and prominent (the *money* and the *name*)
- Alert code is displayed as readable title (not `PREMATURE_COMMERCIAL`)
- Timestamp shows relative time ("3 hours ago", "yesterday")
- Click anywhere on the card → navigates to that deal in the Cockpit

**Why it's non-negotiable:** This is the Commander's triage queue. Without it, they must click through every deal to find the problems.

---

### Widget 4: Stage Pipeline Funnel (The Flow)

**Position:** Left column or center, below Vital Signs
**Question answered:** "Where are deals accumulating and where is the flow blocked?"

```
┌──────────────────────────────────────────┐
│  PIPELINE BY STAGE                       │
│                                          │
│  Discovery    ████████████        $1.2M  │
│               2 deals                     │
│                                          │
│  Validation   ████████████████████ $2.4M │
│               3 deals                     │
│                                          │
│  Commercial   ██████████████████████$3.1M│
│               4 deals                     │
│                                          │
│  Procurement  ██████████████       $1.75M│
│               3 deals                     │
│                                          │
│  ─────────────────────────────────────── │
│  Total Active: 12 deals │ $8.45M         │
│                                          │
│  Stage with most deals: Commercial (4)   │
│  Largest single-stage TCV: Commercial    │
└──────────────────────────────────────────┘
```

**Design:** Horizontal stacked bars, one per stage, sorted by pipeline stage order (Discovery → Procurement). Bar width proportional to TCV. Color-coded by health (if most deals in a stage are RED, the bar has a red tint). Labels show both deal count and TCV.

**Data source:**
- `SELECT stage_name, COUNT(*), SUM(calculated_tcv) FROM active_deals GROUP BY stage_name ORDER BY sort_order`

**Interaction:**
- Click a stage bar → filters dashboard to deals in that stage
- Hover → shows deal names within that stage

**Why it's non-negotiable:** Reveals pipeline bottlenecks instantly. "4 deals stuck in Commercial with $3.1M — that's the problem this quarter" is a conclusion you can draw in 2 seconds.

---

### Widget 5: Deal Roster (The Hit List)

**Position:** Center, full width (the largest widget on the dashboard)
**Question answered:** "Show me every deal with its key metrics so I can decide where to spend my time."

```
┌─────────────────────────────────────────────────────────────────────────────────────────┐
│  ACTIVE DEALS                                            Sort: [TCV ▾]  Filter: [All] │
│                                                                                         │
│  Account          TCV        Stage        Health  Score  Gates  Velocity  Close Date    │
│  ─────────────────────────────────────────────────────────────────────────────────────  │
│  Global Omni      $3.1M      Commercial   🟡      81     56%    On Pace   2025-08-30   │
│  Atlas Health     $1.93M     Validation   🔴      31     44%    ▼ 18d    2025-07-15   │
│  Acme Corp        $1.45M     Commercial   🔴      72     33%    ▼ 5d     2025-09-15   │
│  Meridian Log.    $1.2M      Discovery    🟢      45     11%    On Pace   2025-12-01   │
│  Horizon Fintech  $970K      Procurement  🟢      88     89%    ▲ -3d    2025-07-30   │
│  Pinnacle Media   $450K      Validation   🟡      52     22%    On Pace   2025-10-15   │
│  ...              ...        ...          ...     ...    ...    ...       ...          │
│                                                                                         │
│  Showing 6 of 12 deals │ [← Prev]  [Next →]                                           │
└─────────────────────────────────────────────────────────────────────────────────────────┘
```

**Columns explained:**

| Column | Data | Why |
|---|---|---|
| **Account** | `account_name` | Identity |
| **TCV** | `calculatedTCV` (formatted with currency) | The money |
| **Stage** | `sales_stage` | Where in the pipeline |
| **Health** | Colored dot (🟢🟡🔴) | Instant risk read |
| **Score** | `predictiveScore` (0-100) | Data-driven close probability |
| **Gates** | `progressPercentage` with mini progress bar | Technical validation progress |
| **Velocity** | Delta vs. benchmark ("On Pace", "▼ 5d", "▲ -3d") | Is it moving? |
| **Close Date** | `expected_close_date` | Time pressure |

**Design rules:**
- Default sort: by TCV descending (biggest deals first)
- Alternating row colors for readability
- Row hover shows subtle highlight
- Click any row → navigates to that deal's Cockpit
- Rows with RED health have a subtle red left border (not full red background — too aggressive)
- "Overdue" close dates shown in red text
- Progress bar in "Gates" column is a tiny inline bar (60px wide, 6px tall)

**Interaction:**
- Sort by any column (click header)
- Filter by stage, health, or velocity via dropdown
- Search by account name (inline filter)
- Keyboard: Up/Down arrows to select row, Enter to open deal

**Why it's non-negotiable:** This is the Commander's daily operating table. It replaces the spreadsheet. Every other dashboard widget is context for prioritizing which deals in this list to act on.

---

### Widget 6: Predictive Forecast Snapshot (The Oracle)

**Position:** Right column, below alerts
**Question answered:** "What's the realistic range of revenue I'll close this quarter?"

```
┌──────────────────────────────────────────┐
│  FORECAST (This Quarter)                 │
│                                          │
│  Expected Range:                         │
│                                          │
│  Bear ──────── Median ──────── Bull      │
│  $2.1M         $4.2M          $7.2M     │
│     ◄─────────────●─────────────►       │
│                                          │
│  Traditional Weighted: $5.23M            │
│  (typically overestimates by ~20%)       │
│                                          │
│  Based on: 10,000 simulations            │
│  12 active deals                         │
│  Last run: 2 hours ago                   │
│                                          │
│  [Re-Run Simulation]  [View Details →]  │
└──────────────────────────────────────────┘
```

**Design:** A horizontal range bar showing P10 (bear), P50 (median), and P90 (bull). The traditional weighted pipeline number is shown for comparison — this educates the Commander over time that the simulation is more accurate.

**Data source:**
- Cached simulation result from `financial_scenarios` or dedicated cache table
- Updated nightly + on-demand

**Interaction:**
- Click "View Details" → full simulation page with distribution chart
- Click "Re-Run Simulation" → triggers fresh Monte Carlo run (takes 2-5 seconds, shows spinner)

**Why it's non-negotiable:** The Commander's VP asks "What are we going to close?" every week. This widget gives a data-driven answer with a confidence range, not a gut-feel number.

---

### Widget 7: Next Actions / What Needs Me (The Task Queue)

**Position:** Right column, below forecast
**Question answered:** "What should I do in the next 48 hours?"

```
┌──────────────────────────────────────────┐
│  NEXT ACTIONS (5 pending)                │
│                                          │
│  🔴 OVERDUE                              │
│  • Atlas Health: Submit InfoSec BAA      │
│    Owner: Sarah │ Due: 3 days ago        │
│                                          │
│  • Acme Corp: Architecture Deep-Dive     │
│    Owner: John │ Due: yesterday           │
│                                          │
│  🟡 DUE THIS WEEK                        │
│  • Horizon Fintech: CTO sign-off meeting │
│    Owner: Sarah │ Due: Thursday           │
│                                          │
│  📋 PLAYBOOK STEPS                       │
│  • Pinnacle Media: Schedule exec intro   │
│    Playbook: Validation Phase │ Step 3/7 │
│                                          │
│  📅 UPCOMING CLOSE DATES                 │
│  • Horizon Fintech: closes in 9 days     │
│    Status: 89% gates, Score: 88 ✓       │
│                                          │
│  [View All Actions →]                    │
└──────────────────────────────────────────┘
```

**Data sources:**
- `deal_decisions` WHERE `status = 'Pending'` AND `due_date <= NOW() + 7 days`
- `playbook_step_completions` for active playbook assignments
- `enterprise_deals` WHERE `expected_close_date` within 30 days
- Intelligence engine alerts that recommend specific actions

**Design rules:**
- Grouped by urgency: OVERDUE (red header) → DUE THIS WEEK (amber) → PLAYBOOK STEPS (blue) → UPCOMING CLOSES (neutral)
- Each item shows: the deal name, the action, the owner, and the due date
- Overdue items are visually distinct (red text, bold)
- Maximum 5 items shown; "View All" opens full action list

**Why it's non-negotiable:** This is the Commander's morning priority list. It bridges the gap between "I know there are problems" and "Here's exactly what to do about them."

---

## TIER 2 — High Value (Transform Good to Exceptional)

These widgets make the dashboard genuinely powerful. A Commander using these will outperform one without them.

---

### Widget 8: Deal Velocity Heatmap (The Speedometer)

**Position:** Below Stage Pipeline, full width
**Question answered:** "Which deals are moving too slowly relative to how fast they should be?"

```
┌──────────────────────────────────────────────────────────────────────────────────┐
│  VELOCITY MAP                                                                    │
│                                                                                  │
│  Deal              Stage        Days In   Benchmark   Delta     Status           │
│  ──────────────────────────────────────────────────────────────────────────────  │
│  Atlas Health      Validation    45d       28d        +17d      ██ STALLED       │
│  Acme Corp         Commercial    32d       21d        +11d      █▓ SLOW          │
│  Pinnacle Media    Validation    14d       28d        -14d      ░░ FAST          │
│  Horizon Fintech   Procurement   10d       14d        -4d       ▓░ ON PACE       │
│  Global Omni       Commercial    18d       21d        -3d       ▓░ ON PACE       │
│  Meridian Log.     Discovery      8d       14d        -6d       ░░ FAST          │
│                                                                                  │
│  Legend: ██ Stalled (>1.5x)  █▓ Slow (>1.2x)  ▓░ On Pace  ░░ Fast (<0.8x)     │
└──────────────────────────────────────────────────────────────────────────────────┘
```

**Data source:**
- `daysInStage` from deal intelligence
- `median_days` from `velocity_benchmarks` materialized view
- Delta = daysInStage - benchmark

**Design:** Sortable table with a visual bar in the "Status" column. Red gradient for stalled, amber for slow, green for fast. Compact enough to scan 12 deals in 5 seconds.

**Why it's high value:** Transforms "I think Acme is stalling" into "Acme is 11 days past the median for Commercial-stage deals." Data replaces gut feel.

---

### Widget 9: Recent Activity Feed (The Timeline)

**Position:** Bottom right or as a collapsible panel
**Question answered:** "What just changed while I was in meetings?"

```
┌──────────────────────────────────────────┐
│  RECENT ACTIVITY                   [24h ▾]│
│                                          │
│  2 hours ago                             │
│  ACME CORP: Gate "Core Workflow" toggled │
│  OFF by Sarah Jenkins                    │
│  → Health changed YELLOW → RED           │
│                                          │
│  5 hours ago                             │
│  ATLAS HEALTH: New blocker added         │
│  [HIGH] InfoSec review panel has not     │
│  received SOC2 Type II report            │
│                                          │
│  Yesterday                               │
│  HORIZON FINTECH: Decision completed     │
│  "CTO sign-off meeting scheduled" ✓      │
│                                          │
│  Yesterday                               │
│  GLOBAL OMNI: Stage changed              │
│  Validation → Commercial                 │
│  → Playbook auto-assigned                │
│                                          │
│  [View Full Activity Log →]              │
└──────────────────────────────────────────┘
```

**Data source:**
- `deal_activity_log` ordered by `occurred_at DESC`
- Filtered to last 24 hours by default (configurable: 24h, 7d, 30d)

**Design rules:**
- Each entry shows: timestamp, deal name, what changed, and the consequence
- Health changes are highlighted (the "→ Health changed" line is bold)
- Maximum 5 items; "View Full Activity Log" for the rest
- Entries are grouped by day ("2 hours ago", "Yesterday", "Monday")

**Why it's high value:** The Commander steps away for 3 hours of meetings and returns to the dashboard. This widget tells them exactly what happened in their absence without clicking through deals.

---

### Widget 10: Close Date Timeline (The Calendar)

**Position:** Below Vital Signs or as a horizontal strip
**Question answered:** "What's closing when, and which dates are at risk?"

```
┌──────────────────────────────────────────────────────────────────────────────────┐
│  CLOSE DATE TIMELINE                                                             │
│                                                                                  │
│  JUL 2025              AUG 2025              SEP 2025              OCT 2025      │
│  ├──────────────┤├──────────────┤├──────────────┤├──────────────┤               │
│                                                                                  │
│  ▼ Horizon      ▼ Global Omni   ▼ Acme Corp                                       │
│    $970K          $3.1M           $1.45M         ▼ Meridian    ▼ Pinnacle        │
│    🟢 89%         🟡 56%          🔴 33%           $1.2M         $450K            │
│    On Pace        On Pace         At Risk          🟢 11%        🟡 22%           │
│                                                   On Pace       On Pace           │
│                                                                                  │
│  ◄─── This Quarter ───►│◄─── Next Quarter ───►                                   │
│                                                                                  │
│  $4.52M closing this quarter │ $1.65M closing next quarter                      │
│  At risk this quarter: $1.45M (Acme — RED, 33% gates)                           │
└──────────────────────────────────────────────────────────────────────────────────┘
```

**Design:** Horizontal timeline with deal markers positioned at their `expected_close_date`. Each marker shows: deal name, TCV, health dot, gate progress, and velocity status. Color-coded: deals on pace are neutral, at-risk deals have red markers.

**Data source:**
- `expected_close_date` from `enterprise_deals`
- Health and gate progress from intelligence engine
- Grouped by month

**Interaction:**
- Click a deal marker → navigates to Cockpit
- Hover → shows expanded deal summary tooltip
- Deals without a close date are shown in a "No Date Set" bucket at the end

**Why it's high value:** Reveals revenue concentration risk. "We have $4.52M targeting this quarter but $1.45M of it is RED" is a board-level insight visible in 5 seconds.

---

### Widget 11: Competitive Landscape Summary (The Battlefield)

**Position:** Bottom left or second page/tab of dashboard
**Question answered:** "Who are we fighting and how are we doing?"

```
┌──────────────────────────────────────────┐
│  COMPETITIVE LANDSCAPE                   │
│                                          │
│  Active Competitors in Pipeline:         │
│                                          │
│  AWS           ████████████  4 deals     │
│                Historical win rate: 64%  │
│                                          │
│  Snowflake     ██████        2 deals     │
│                Historical win rate: 75%  │
│                                          │
│  Databricks    ████          1 deal      │
│                Historical win rate: 40%  │
│                                          │
│  No competitor ██████████████ 5 deals    │
│                (sole-source)             │
│                                          │
│  TCV at competitive risk: $4.6M          │
│  TCV sole-source: $3.85M                 │
│                                          │
│  [View Competitive Intelligence →]       │
└──────────────────────────────────────────┘
```

**Data source:**
- `deal_competitors` joined with `enterprise_deals` for active deals
- Historical win rates from `competitive_win_rates` view

**Why it's high value:** "We're head-to-head with AWS on 4 deals worth $4.6M, and historically we only win 64% of those. That means ~$1.66M of this pipeline is statistically at risk to AWS alone." This reframes pipeline health from an internal metric to a competitive one.

---

## TIER 3 — Unmatched (The Edge That No Other Tool Has)

These widgets separate EDC from every CRM, spreadsheet, and BI tool on the market.

---

### Widget 12: Pipeline Simulation Band (The Probability Cone)

**Position:** Embedded within the Forecast widget or as a standalone mini-chart
**Question answered:** "What's the probability distribution of my pipeline outcome?"

```
┌──────────────────────────────────────────┐
│  SIMULATION OUTCOME                      │
│                                          │
│  Probability                             │
│  25% │         ╱╲                        │
│      │        ╱  ╲                       │
│  20% │       ╱    ╲                      │
│      │      ╱      ╲                     │
│  15% │     ╱        ╲                    │
│      │    ╱          ╲                   │
│  10% │   ╱            ╲                  │
│      │  ╱              ╲                 │
│   5% │ ╱                ╲                │
│      │╱                  ╲               │
│   0% └──────────────────────────         │
│      $0    $2M   $4M   $6M   $8M         │
│           ▲              ▲               │
│         P25: $3.4M     P75: $5.8M        │
│              ▲                            │
│            P50: $4.2M                     │
│                                          │
│  Probability of hitting $5M+ target: 38% │
└──────────────────────────────────────────┘
```

**Design:** Mini bell curve / distribution chart. The area between P25 and P75 is shaded (the "likely range"). The P50 line is prominent. The target number (if set) is shown as a vertical line with the probability of hitting it.

**Why it's unmatched:** No CRM, no spreadsheet, and no BI tool gives a Commander a probabilistic pipeline forecast with a visual distribution. This is the single most powerful number for an executive conversation.

---

### Widget 13: Deal Memory Insights (The Wisdom)

**Position:** Bottom of dashboard, collapsible
**Question answered:** "What have I learned from past deals that applies to today?"

```
┌─────────────────────────────────────────────────────────────────────────────┐
│  📚 DEAL MEMORY INSIGHTS                                          [Expand] │
│                                                                             │
│  Based on 23 archived deals, here's what's relevant to your current        │
│  pipeline:                                                                  │
│                                                                             │
│  • Deals with >$1M TCV in Financial Services close 40% more often when     │
│    a CTO architecture review is completed before Gate 3.                   │
│    → 2 current deals match this profile (Acme Corp, Atlas Health)          │
│                                                                             │
│  • Historical loss rate against Snowflake is 25%, but 100% of losses       │
│    occurred when compliance documentation was delayed beyond Week 8.       │
│    → 1 current deal faces Snowflake (Atlas Health — currently Week 6)     │
│                                                                             │
│  • Deals without services attachment above $500K have a 35% close rate.   │
│    Deals with services: 72%.                                               │
│    → 1 current deal matches the risk profile (Global Omni — $3.1M, no SOW)│
│                                                                             │
│  [Browse Full Deal Memory →]                                               │
└─────────────────────────────────────────────────────────────────────────────┘
```

**Data source:**
- `deal_memory` table with full-text search and pattern matching
- Cross-referenced against current active deals by: TCV range, industry, competitor, pricing model

**Why it's unmatched:** This is institutional AI — not a chatbot, not an LLM, but structured pattern matching against the Commander's own historical data. Every insight is traceable to specific past deals.

---

### Widget 14: Commander Workload Distribution (The Capacity Check)

**Position:** Visible only for Global Commanders; hidden for Regional
**Question answered:** "Is any Commander overloaded? Are deals evenly distributed?"

```
┌──────────────────────────────────────────┐
│  COMMANDER WORKLOAD                      │
│                                          │
│  Sarah Jenkins (Americas)                │
│  6 deals │ $3.8M TCV │ 2 RED            │
│  ██████████████████████░░░░  75% load    │
│                                          │
│  Raj Patel (EMEA)                        │
│  4 deals │ $2.9M TCV │ 0 RED            │
│  ████████████████░░░░░░░░░░  50% load    │
│                                          │
│  Yuki Tanaka (APAC)                      │
│  2 deals │ $1.75M TCV │ 0 RED           │
│  ████████░░░░░░░░░░░░░░░░░  25% load     │
│                                          │
│  ⚠ Sarah has 2 RED alerts and 75% load.  │
│    Consider delegating Pinnacle Media     │
│    ($450K, YELLOW) to Raj.               │
│                                          │
│  [Manage Delegations →]                  │
└──────────────────────────────────────────┘
```

**Data source:**
- `deal_commander_assignments` joined with intelligence results
- Load = `commander_deal_count / max_comfortable_deals` (configurable, default 8)

---

### Widget 15: Gate Completion Funnel (The Technical Truth)

**Position:** Below Stage Pipeline
**Question answered:** "Across all deals, which gates are the biggest blockers?"

```
┌──────────────────────────────────────────┐
│  GATE COMPLETION ACROSS ALL DEALS        │
│                                          │
│  G1: Reqs Locked        █████████████ 92%│
│  G1: Exec Agreed        ████████████  83%│
│  G2: Workflow Verified   ██████████   75%│
│  G2: Champion Defensible █████████    67%│
│  G3: Performance Passed  ██████       50%│
│  G3: Integrations Mapped ██████       50%│
│  G4: InfoSec Cleared     ████         33%│
│  G4: Compliance Valid.   ████         33%│
│  G5: CTO Signed Off      ██           17%│
│                                          │
│  ⚠ Bottleneck detected: Gate 3           │
│  (Performance/Integrations) — only 50%   │
│  of deals have cleared this gate.        │
│  Consider running a shared perf lab.     │
└──────────────────────────────────────────┘
```

**Data source:**
- `SELECT gate_code, COUNT(*) FILTER (WHERE is_completed) * 100.0 / COUNT(*) FROM deal_technical_gates GROUP BY gate_code`

**Why it's unmatched:** This reveals *systemic* technical bottlenecks, not per-deal issues. If 50% of deals stall at Gate 3, the Commander knows to invest in a shared performance testing environment — an organizational insight, not a deal-level one.

---

## Full Dashboard Layout

```
┌─────────────────────────────────────────────────────────────────────────────────────┐
│ [EDC DASHBOARD]  Commander: Sarah Jenkins    Territory: Americas   [Cockpit →] [🔔]│
├─────────────────────────────────────────────────────────────────────────────────────┤
│                                                                                     │
│  ┌─────────────────────────────────────────────────────────────────────────────┐   │
│  │                    WIDGET 1: PIPELINE VITAL SIGNS                           │   │
│  │  $8.45M        $5.23M        12 Deals       2 RED        72 avg score     │   │
│  │  Total TCV     Weighted      Active         Alerts       Predicted        │   │
│  └─────────────────────────────────────────────────────────────────────────────┘   │
│                                                                                     │
│  ┌───────────────────────────────┐  ┌──────────────────────────────────────────┐   │
│  │  WIDGET 2: HEALTH             │  │  WIDGET 3: CRITICAL ALERTS (2)           │   │
│  │                               │  │                                          │   │
│  │    Donut chart:               │  │  🔴 ACME: Premature Commercial...       │   │
│  │    6 GREEN / 4 YELLOW / 2 RED │  │  🔴 ATLAS: Close Date Pressure...       │   │
│  │                               │  │  🟡 OMNI: Unprotected Elephant...       │   │
│  └───────────────────────────────┘  └──────────────────────────────────────────┘   │
│                                                                                     │
│  ┌───────────────────────────────┐  ┌──────────────────────────────────────────┐   │
│  │  WIDGET 4: STAGE PIPELINE     │  │  WIDGET 6: FORECAST SNAPSHOT             │   │
│  │                               │  │                                          │   │
│  │  Discovery  ████████  $1.2M   │  │  Bear ──── Median ──── Bull              │   │
│  │  Validation ████████████$2.4M │  │  $2.1M     $4.2M       $7.2M            │   │
│  │  Commercial █████████████$3.1M│  │                                          │   │
│  │  Procure.   ██████████  $1.75M│  │  Probability of $5M+: 38%               │   │
│  │                               │  │                                          │   │
│  │  ┌───────────────────────────┐│  ├──────────────────────────────────────────┤   │
│  │  │ WIDGET 15: GATE FUNNEL    ││  │  WIDGET 7: NEXT ACTIONS (5)              │   │
│  │  │                           ││  │                                          │   │
│  │  │ G1 ████████████ 92%       ││  │  🔴 OVERDUE: Atlas InfoSec BAA (3d)    │   │
│  │  │ G2 ██████████   71%       ││  │  🔴 OVERDUE: Acme Arch Review (1d)     │   │
│  │  │ G3 ██████       50%       ││  │  🟡 THIS WEEK: Horizon CTO meeting     │   │
│  │  │ G4 ████         33%       ││  │  📋 PLAYBOOK: Pinnacle exec intro      │   │
│  │  │ G5 ██           17%       ││  │  📅 CLOSE: Horizon in 9 days           │   │
│  │  └───────────────────────────┘│  └──────────────────────────────────────────┘   │
│  └───────────────────────────────┘                                                 │
│                                                                                     │
│  ┌─────────────────────────────────────────────────────────────────────────────┐   │
│  │  WIDGET 5: DEAL ROSTER                                Sort: [TCV ▾] [🔍]  │   │
│  │                                                                             │   │
│  │  Account         TCV      Stage       Health Score Gates Velocity Close    │   │
│  │  ─────────────────────────────────────────────────────────────────────────  │   │
│  │  Global Omni     $3.1M   Commercial  🟡     81   56%   On Pace  Aug 30    │   │
│  │  Atlas Health    $1.93M  Validation  🔴     31   44%   ▼18d    Jul 15    │   │
│  │  Acme Corp       $1.45M  Commercial  🔴     72   33%   ▼5d     Sep 15    │   │
│  │  Meridian Log.   $1.2M   Discovery   🟢     45   11%   On Pace  Dec 01   │   │
│  │  Horizon Fintech $970K   Procurement 🟢     88   89%   ▲-3d    Jul 30    │   │
│  │  Pinnacle Media  $450K   Validation  🟡     52   22%   On Pace  Oct 15   │   │
│  │                                                                             │   │
│  └─────────────────────────────────────────────────────────────────────────────┘   │
│                                                                                     │
│  ┌───────────────────────────────┐  ┌──────────────────────────────────────────┐   │
│  │  WIDGET 10: CLOSE TIMELINE    │  │  WIDGET 9: RECENT ACTIVITY               │   │
│  │                               │  │                                          │   │
│  │  JUL       AUG       SEP     │  │  2h ago: Acme Gate toggled OFF → RED    │   │
│  │  ▼Horizon  ▼Omni     ▼Acme   │  │  5h ago: Atlas blocker added [HIGH]     │   │
│  │  $970K🟢  $3.1M🟡   $1.45M🔴│  │  Ystrdy: Horizon decision completed ✓   │   │
│  │                               │  │  Ystrdy: Omni stage → Commercial        │   │
│  └───────────────────────────────┘  └──────────────────────────────────────────┘   │
│                                                                                     │
│  ┌───────────────────────────────┐  ┌──────────────────────────────────────────┐   │
│  │  WIDGET 11: COMPETITIVE       │  │  WIDGET 8: VELOCITY MAP                  │   │
│  │                               │  │                                          │   │
│  │  AWS: 4 deals (64% win rate)  │  │  Atlas    ██ STALLED  +17d              │   │
│  │  Snowflake: 2 deals (75%)    │  │  Acme     █▓ SLOW     +11d              │   │
│  │  Databricks: 1 deal (40%)    │  │  Omni     ▓░ ON PACE  -3d               │   │
│  │                               │  │  Horizon  ░░ FAST     -4d               │   │
│  │  At competitive risk: $4.6M   │  │                                          │   │
│  └───────────────────────────────┘  └──────────────────────────────────────────┘   │
│                                                                                     │
│  ┌─────────────────────────────────────────────────────────────────────────────┐   │
│  │  WIDGET 13: DEAL MEMORY INSIGHTS                                    [→]    │   │
│  │  3 patterns from 23 archived deals match your current pipeline...          │   │
│  └─────────────────────────────────────────────────────────────────────────────┘   │
│                                                                                     │
└─────────────────────────────────────────────────────────────────────────────────────┘
```

---

## Widget Priority Matrix (Build Order)

| Priority | Widget | Build In | Effort | Impact |
|---|---|---|---|---|
| **P0** | 1. Vital Signs | Phase 2, Week 3 | Low | Critical |
| **P0** | 3. Critical Alerts | Phase 3, Week 5 | Low | Critical |
| **P0** | 5. Deal Roster | Phase 2, Week 3 | Medium | Critical |
| **P0** | 7. Next Actions | Phase 3, Week 5 | Medium | Critical |
| **P1** | 2. Health Distribution | Phase 2, Week 4 | Low | High |
| **P1** | 4. Stage Pipeline | Phase 2, Week 4 | Low | High |
| **P1** | 6. Forecast Snapshot | Phase 4, Week 10 | Medium | High |
| **P1** | 10. Close Timeline | Phase 2, Week 4 | Medium | High |
| **P2** | 8. Velocity Heatmap | Phase 4, Week 10 | Medium | High |
| **P2** | 9. Activity Feed | Phase 3, Week 7 | Low | High |
| **P2** | 15. Gate Funnel | Phase 3, Week 5 | Low | Medium |
| **P3** | 11. Competitive Summary | Phase 4, Week 11 | Medium | Medium |
| **P3** | 12. Simulation Band | Phase 4, Week 10 | Medium | Medium |
| **P3** | 13. Deal Memory Insights | Phase 4, Week 12 | High | Medium |
| **P4** | 14. Commander Workload | Phase 5, Week 13 | Low | Low (multi-CMDR only) |

The seven P0 and P1 widgets are the dashboard. Everything else is enhancement. Build the dashboard first, then layer on the intelligence.