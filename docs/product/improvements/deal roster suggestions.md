# Deal Roster Page — Complete UI/UX Specification

This is the page the Commander will live on. It replaces their spreadsheet. Every interaction pattern below has been thought through for a single person managing 10-50 deals who needs to find, triage, and act on deals in seconds — not minutes.

---

## 1. Page Layout Architecture

The Deal Roster is not just a table. It is a **multi-layered information surface** with persistent context, flexible views, and inline actions.

```
┌─────────────────────────────────────────────────────────────────────────────────────────┐
│ [EDC]  Deal Roster     Commander: Sarah Jenkins     [Dashboard ←] [Analytics →]   [🔔] │
├─────────────────────────────────────────────────────────────────────────────────────────┤
│                                                                                         │
│  ┌─────────────────────────────────────────────────────────────────────────────────┐   │
│  │  TOOLBAR LAYER (persistent, never scrolls away)                                 │   │
│  │                                                                                 │   │
│  │  [🔍 Search...] [Stage ▾] [Health ▾] [Velocity ▾] [More Filters ▾]            │   │
│  │  [Group: None ▾] [Density: Comfortable ▾] [Columns ▾] [Save View ▾]           │   │
│  │                                                                                 │   │
│  │  Showing 12 of 12 deals │ $8.45M TCV │ 2 selected  [Bulk Actions ▾]           │   │
│  └─────────────────────────────────────────────────────────────────────────────────┘   │
│                                                                                         │
│  ┌─────────────────────────────────────────────────────────────────────────────────┐   │
│  │  SAVED VIEW TABS                                                                │   │
│  │  [All Deals (12)] [My RED Deals (2)] [Closing This Quarter (5)] [+ New View]   │   │
│  └─────────────────────────────────────────────────────────────────────────────────┘   │
│                                                                                         │
│  ┌─────────────────────────────────────────────────────────────────────────────────┐   │
│  │  DATA TABLE (the core roster)                                                   │   │
│  │                                                                                 │   │
│  │  [□] │ Account ▲│ TCV    │ Stage    │ Health │ Score │ Gates │ Velocity │ Close │   │
│  │  ────┼──────────┼────────┼──────────┼────────┼───────┼───────┼──────────┼───────│   │
│  │  [□] │ Global.. │ $3.1M  │ Commerc. │ 🟡     │ 81    │ ████▌ │ On Pace  │ Aug.. │   │
│  │  [□] │ Atlas..  │ $1.93M │ Validat. │ 🔴     │ 31    │ ███▌  │ ▼ 18d    │ Jul.. │   │
│  │  [□] │ Acme..   │ $1.45M │ Commerc. │ 🔴     │ 72    │ ██▌   │ ▼ 5d     │ Sep.. │   │
│  │  ... │          │        │          │        │       │       │          │       │   │
│  └─────────────────────────────────────────────────────────────────────────────────┘   │
│                                                                                         │
│  ┌─────────────────────────────────────────────────────────────────────────────────┐   │
│  │  INLINE PREVIEW PANEL (slides in from right when a row is focused/clicked)     │   │
│  │                                                                                 │   │
│  │  Shows: full deal summary without navigating away                              │   │
│  └─────────────────────────────────────────────────────────────────────────────────┘   │
│                                                                                         │
│  ┌─────────────────────────────────────────────────────────────────────────────────┐   │
│  │  STATUS BAR (bottom, persistent)                                                │   │
│  │  Last synced: 30 seconds ago │ 12 deals │ $8.45M │ [Export ▾] [Print]          │   │
│  └─────────────────────────────────────────────────────────────────────────────────┘   │
│                                                                                         │
└─────────────────────────────────────────────────────────────────────────────────────────┘
```

---

## 2. Toolbar Layer — Every Feature Explained

### 2.1 Global Search

```
┌──────────────────────────────────────────────────────────────────────┐
│  🔍  [ Search deals, accounts, stakeholders, notes...       ]  ⌘K  │
└──────────────────────────────────────────────────────────────────────┘
```

**Behavior:**
- Searches across: `account_name`, `deal_name`, `account_manager`, `technical_lead`, `manager_strategic_blueprint`, stakeholder names, decision text, blocker descriptions
- Minimum 2 characters before search activates
- Results appear in a dropdown overlay as the Commander types
- Each result shows: match location (e.g., "Found in Strategic Notes"), deal name, TCV, health dot
- `Enter` → opens top result in Cockpit
- `Esc` → clears search and closes dropdown
- `⌘K` / `Ctrl+K` → focuses search from anywhere on the page
- Search is debounced at 300ms to avoid excessive API calls
- Supports fuzzy matching: "acme" matches "ACME CORP", "acme corp" matches "ACME CORP"
- Recent searches are cached and shown in the dropdown when the search is empty

**Implementation:**

```
┌──────────────────────────────────────────────────────────────────────┐
│  🔍  acme                                                           │
├──────────────────────────────────────────────────────────────────────┤
│                                                                      │
│  ACCOUNT MATCHES                                                     │
│  ┌──────────────────────────────────────────────────────────────┐   │
│  │  ACME CORP — $1.45M — Commercial — 🔴                        │   │
│  │  Match: account_name                                          │   │
│  └──────────────────────────────────────────────────────────────┘   │
│                                                                      │
│  NOTE MATCHES                                                        │
│  ┌──────────────────────────────────────────────────────────────┐   │
│  │  "...override pricing window for **acme** and force arch..."  │   │
│  │  Found in: Strategic Notes — ACME CORP                        │   │
│  └──────────────────────────────────────────────────────────────┘   │
│                                                                      │
│  STAKEHOLDER MATCHES                                                 │
│  ┌──────────────────────────────────────────────────────────────┐   │
│  │  John Doe — Account Manager — ACME CORP                       │   │
│  └──────────────────────────────────────────────────────────────┘   │
│                                                                      │
└──────────────────────────────────────────────────────────────────────┘
```

---

### 2.2 Quick Filters (Inline, Always Visible)

These are the filters the Commander uses every single session. They are always visible in the toolbar — not hidden behind a "More Filters" panel.

```
┌─────────┐ ┌─────────┐ ┌──────────┐ ┌──────────────────┐
│ Stage ▾ │ │ Health ▾│ │Velocity ▾│ │  More Filters ▾  │
└─────────┘ └─────────┘ └──────────┘ └──────────────────┘
```

**Stage Filter:**

```
┌─────────────────────────┐
│  ☑ Discovery             │
│  ☑ Validation            │
│  ☑ Commercial            │
│  ☑ Procurement           │
│  ☐ Closed-Won            │
│  ☐ Closed-Lost           │
│  ─────────────────────── │
│  [Select All] [Clear]    │
└─────────────────────────┘
```

- Multi-select checkboxes (Commander might want to see Validation + Commercial only)
- Default: all open stages selected, Closed-Won and Closed-Lost excluded
- Selected filters show as colored chips next to the dropdown:
  `Stage: [Discovery ×] [Validation ×] [Commercial ×]`
- Active filter count badge on the button: `Stage ▾ (3)`

**Health Filter:**

```
┌─────────────────────────┐
│  ☑ 🟢 GREEN (6)          │
│  ☑ 🟡 YELLOW (4)         │
│  ☑ 🔴 RED (2)            │
└─────────────────────────┘
```

- Multi-select with live counts that update as other filters change
- Default: all selected

**Velocity Filter:**

```
┌─────────────────────────┐
│  ☑ 🚀 Fast               │
│  ☑ ✅ On Pace             │
│  ☑ ⚠️ Slow               │
│  ☑ 🔴 Stalled            │
│  ─────────────────────── │
│  ☐ No Close Date         │
└─────────────────────────┘
```

**More Filters (Extended Panel):**

```
┌─────────────────────────────────────────────────────────────────┐
│  ADVANCED FILTERS                                                │
│                                                                  │
│  TCV Range:         [ $______ ] to [ $______ ]                  │
│  Predictive Score:  [ ___ ] to [ ___ ]                          │
│  Close Date:        [ This Month ▾ ] or [ From ___ ] to [ ___ ] │
│  Account Manager:   [ All ▾ ]                                    │
│  Technical Lead:    [ All ▾ ]                                    │
│  Pricing Model:     [ All ▾ ]                                    │
│  Services Tier:     [ All ▾ ]                                    │
│  Has Blockers:      [●] Any  ○ Yes  ○ No                        │
│  Has Competitors:   [●] Any  ○ Yes  ○ No                        │
│  Tags:              [ Select tags... ]                           │
│  Commander:         [ All ▾ ] (Global Commanders only)          │
│                                                                  │
│  [Apply Filters]  [Reset All]  [Save as View]                   │
└─────────────────────────────────────────────────────────────────┘
```

**Critical UX rule:** When any filter is active, a persistent banner appears above the table:

```
┌─────────────────────────────────────────────────────────────────────┐
│  📎 Filtering: Stage = Commercial, Health = RED    Showing 2 of 12  │
│                                                   [Clear All Filters]│
└─────────────────────────────────────────────────────────────────────┘
```

This prevents the Commander from forgetting they have a filter on and thinking deals are missing.

---

### 2.3 Grouping

```
┌──────────────────────────┐
│  Group By:                │
│  ○ None                   │
│  ○ Stage                  │
│  ○ Health Status          │
│  ○ Velocity               │
│  ○ Account Manager        │
│  ○ Technical Lead         │
│  ○ Pricing Model          │
│  ○ Commander (Multi-CMDR) │
│  ○ Has Competitors        │
└──────────────────────────┘
```

When grouping is active, the table transforms:

```
┌─────────────────────────────────────────────────────────────────────────────────────┐
│  ▼ COMMERCIAL (4 deals — $5.2M)                                          [Collapse]│
│  ──────────────────────────────────────────────────────────────────────────────────│
│  [□] │ Global Omni     │ $3.1M  │ Commercial │ 🟡 │ 81 │ ████▌ │ On Pace │ Aug 30 │
│  [□] │ Acme Corp       │ $1.45M │ Commercial │ 🔴 │ 72 │ ██▌   │ ▼ 5d    │ Sep 15 │
│  [□] │ TechVision      │ $420K  │ Commercial │ 🟢 │ 65 │ ███▌  │ On Pace │ Oct 01 │
│  [□] │ Quantum Labs    │ $230K  │ Commercial │ 🟡 │ 48 │ ██    │ ▼ 12d   │ Nov 15 │
│                                                                                     │
│  Group subtotal: $5.2M TCV │ Avg score: 66.5 │ 1 RED                               │
│                                                                                     │
│  ▼ VALIDATION (3 deals — $2.4M)                                         [Collapse]│
│  ──────────────────────────────────────────────────────────────────────────────────│
│  [□] │ Atlas Health    │ $1.93M │ Validation │ 🔴 │ 31 │ ███▌  │ ▼ 18d   │ Jul 15 │
│  [□] │ Pinnacle Media  │ $450K  │ Validation │ 🟡 │ 52 │ ██    │ On Pace │ Oct 15 │
│  [□] │ Nova Systems    │ $20K   │ Validation │ 🟢 │ 38 │ █▌    │ Fast    │ Dec 30 │
│                                                                                     │
│  Group subtotal: $2.4M TCV │ Avg score: 40.3 │ 1 RED                               │
│                                                                                     │
│  ▼ DISCOVERY (2 deals — $1.2M)                                          [Collapse]│
│  ...                                                                                │
└─────────────────────────────────────────────────────────────────────────────────────┘
```

**Grouping rules:**
- Each group header shows: group name, deal count, total TCV, and a key metric (RED count or average score)
- Groups are collapsible (click header or the collapse icon)
- Collapsed groups show a single summary row
- Group sort order: by stage pipeline order (Discovery first) when grouping by stage; by severity when grouping by health
- Within each group, deals are sorted by the current column sort

---

### 2.4 Column Customization

```
┌──────────────────────────────────────────────────────────┐
│  COLUMNS                                                   │
│                                                            │
│  Visible (drag to reorder):                               │
│  ☑ ☰ Account Name                                        │
│  ☑ ☰ TCV                                                 │
│  ☑ ☰ Stage                                               │
│  ☑ ☰ Health                                              │
│  ☑ ☰ Predictive Score                                    │
│  ☑ ☰ Gate Progress                                       │
│  ☑ ☰ Velocity                                            │
│  ☑ ☰ Expected Close Date                                 │
│                                                            │
│  Hidden:                                                  │
│  ☐ Account Manager                                       │
│  ☐ Technical Lead                                        │
│  ☐ Pricing Model                                         │
│  ☐ Services Tier                                         │
│  ☐ Services Revenue                                      │
│  ☐ Days in Stage                                         │
│  ☐ Win Probability                                       │
│  ☐ Active Blockers                                       │
│  ☐ Active Competitors                                    │
│  ☐ Tags                                                  │
│  ☐ Commander (Multi-CMDR)                                │
│  ☐ Created Date                                          │
│  ☐ Last Updated                                          │
│  ☐ CRM Link                                              │
│                                                            │
│  [Reset to Default]  [Save Layout]                        │
└──────────────────────────────────────────────────────────┘
```

**Column behavior:**
- Drag-and-drop reorder within "Visible" list
- Click checkbox to show/hide
- Column widths are resizable (drag column border)
- Column widths and order are persisted in the Commander's browser (localStorage) and synced to their profile
- Double-click column border → auto-fit to content width
- Every column is sortable (click header to sort)

---

### 2.5 Density Modes

```
┌──────────────────────────┐
│  Density:                 │
│  ○ Comfortable (default) │
│  ○ Compact               │
│  ○ Detailed              │
└──────────────────────────┘
```

**Comfortable (default):**

```
┌───────────────────────────────────────────────────────────────┐
│ [□] │  ACME CORP                                             │
│     │  $1,450,000  │  Commercial  │  🔴  │  Score: 72        │
│     │  ████████████░░░░░░░░░░░░░░░  33% (3/9)                │
│     │  Velocity: ▼ 5 days slow  │  Close: Sep 15, 2025       │
└───────────────────────────────────────────────────────────────┘
```

Row height: ~72px. Two lines of information. Gate progress bar is prominent.

**Compact:**

```
┌───────────────────────────────────────────────────────────────────────────────────┐
│ [□] │ Acme Corp      │ $1.45M │ Commercial │ 🔴 │ 72 │ 33%  │ ▼5d  │ Sep 15   │
└───────────────────────────────────────────────────────────────────────────────────┘
```

Row height: ~36px. Single line. Maximum information density. For scanning 30+ deals quickly.

**Detailed:**

```
┌───────────────────────────────────────────────────────────────────────────────┐
│ [□] │  ACME CORP — Platform Modernization                                   │
│     │  Account Manager: John Doe  │  Technical Lead: Sarah Jenkins          │
│     │  $1,450,000 TCV  │  Annual Subscription  │  3 Year Term              │
│     │  Commercial (since May 12 — 32 days)  │  🔴 RED                       │
│     │  Predicted Score: 72/100  │  Confidence: MEDIUM                       │
│     │  Gates: ████████████░░░░░░░░░░░░░░░  33% (3/9) — Stalled at Gate 2   │
│     │  Velocity: 11 days over benchmark  │  Close Date: Sep 15 (86 days)   │
│     │  Alerts: Premature Commercial Disconnect                              │
│     │  Blockers: 1 active (0 high)  │  Competitors: AWS (active)            │
│     │  Tags: [Strategic ×] [Net-New ×]                                      │
└───────────────────────────────────────────────────────────────────────────────┘
```

Row height: ~160px. Full context without opening the deal. For deep review sessions.

---

## 3. Table Core — Column Specifications

### 3.1 Complete Column Definitions

| Column | Width | Sortable | Data Type | Display Format | Alignment |
|---|---|---|---|---|---|
| **Checkbox** | 40px | No | boolean | Custom checkbox | Center |
| **Account Name** | 200px (min) | Yes (A-Z) | string | Bold text + deal name subtitle | Left |
| **TCV** | 120px | Yes (numeric) | number | `$1,450,000` or `$1.45M` (adaptive) | Right |
| **Stage** | 130px | Yes (pipeline order) | enum | Colored pill/badge | Center |
| **Health** | 60px | Yes (severity) | enum | Colored dot (🟢🟡🔴) | Center |
| **Score** | 80px | Yes (numeric) | number | `72` with mini color bar | Center |
| **Gates** | 160px | Yes (percentage) | percentage | Mini progress bar + `33% (3/9)` | Left |
| **Velocity** | 120px | Yes (delta) | delta | `On Pace`, `▼ 5d`, `▲ -3d` | Center |
| **Close Date** | 120px | Yes (date) | date | `Sep 15` or `Sep 15 ⚠` (if overdue) | Right |

### 3.2 Column-Specific Behaviors

**Account Name Column:**

```
┌────────────────────────────────────────┐
│  ACME CORP                             │
│  Platform Modernization                │
│  AM: John Doe │ TL: Sarah Jenkins      │
└────────────────────────────────────────┘
```

- Line 1: `account_name` in **bold 14px** (the primary identifier)
- Line 2: `deal_name` in regular 12px muted color (the secondary identifier)
- Line 3 (Compact mode hidden): `account_manager` and `technical_lead` initials or names in 11px muted
- The account name is the clickable link that opens the deal in the Cockpit
- Hover effect: underline appears on account name (signals clickability)
- If the deal has a CRM link, a small external link icon appears after the name: `ACME CORP ↗`

**TCV Column:**

```
┌──────────────────┐
│      $1,450,000  │
│      ▲ +$200K    │
└──────────────────┘
```

- Primary number: locale-formatted currency with deal_currency prefix
- Numbers above $1M shown as `$1.45M` in compact mode; full `$1,450,000` in comfortable/detailed
- Delta indicator (if TCV changed in the last 7 days): small text below showing `▲ +$200K` or `▼ -$50K`
- Right-aligned for easy column scanning
- Color: default text unless deal is mega-deal ($1M+), which gets a subtle gold accent

**Stage Column:**

```
┌──────────────┐
│  ┌──────────┐│
│  │Commercial││
│  └──────────┘│
│  32 days     │
└──────────────┘
```

- Colored pill/badge with stage name
- Stage colors (consistent throughout the application):
  - Discovery: `#6366F1` (indigo)
  - Validation: `#3B82F6` (blue)
  - Commercial: `#F59E0B` (amber)
  - Procurement: `#8B5CF6` (purple)
  - Closed-Won: `#22C55E` (green)
  - Closed-Lost: `#6B7280` (gray)
- Below the pill: `X days` in muted 11px text (days in stage)
- In detailed mode: `(since May 12)` date shown instead

**Health Column:**

```
┌──────────┐
│    🔴    │
│   RED    │
└──────────┘
```

- Colored dot: 12px circle, filled with health color
- Below dot (comfortable/detailed only): text label `RED`, `YELLOW`, `GREEN`
- RED deals have a subtle red left border on the entire row (3px solid `#EF4444`)
- YELLOW deals have a subtle amber left border (3px solid `#F59E0B`)
- GREEN deals: no additional styling (clean default)

**Score Column:**

```
┌──────────────┐
│     72       │
│  ████████▌   │
└──────────────┘
```

- Number displayed prominently in 14px bold
- Mini horizontal bar below (40px wide, 4px tall) showing score visually
- Bar color gradient: 0-30 red, 30-60 amber, 60-80 green, 80-100 bright green
- If confidence is LOW, the number has a dotted underline with tooltip: "Score confidence: LOW — limited historical data"

**Gates Column:**

```
┌──────────────────────────────────────┐
│  ████████████░░░░░░░░░░░░░░░░░ 33%  │
│  3 of 9 │ Gate 2: Core MVP          │
└──────────────────────────────────────┘
```

- Progress bar: 120px wide, 8px tall, rounded ends
- Filled portion: green gradient if < 100%, gold if = 100%
- Empty portion: dark gray
- Percentage label to the right of the bar
- Below the bar (comfortable/detailed): `3 of 9 │ Gate 2: Core MVP` (current milestone)
- Color-coded by progress: 0-25% red tint, 25-50% amber, 50-75% green, 75-100% bright green

**Velocity Column:**

```
┌──────────────────┐
│    ▼ 5 days      │
│    SLOW          │
└──────────────────┘
```

- Delta display: `On Pace`, `▼ 5d` (slow), `▲ -3d` (fast), `▼ 18d STALLED`
- Color coding:
  - Fast (`< 0.8× benchmark`): bright green text
  - On Pace (`0.8× – 1.2×`): default text
  - Slow (`1.2× – 1.5×`): amber text
  - Stalled (`> 1.5×`): red text, bold
- Below (comfortable/detailed): text label "FAST", "ON PACE", "SLOW", "STALLED"
- If no benchmark data exists: `—` with tooltip "Insufficient historical data for velocity benchmark"

**Close Date Column:**

```
┌──────────────────┐
│    Sep 15        │
│    86 days       │
└──────────────────┘
```

- Date format: `Mon DD` for dates within 90 days; `Mon DD, YYYY` for dates beyond
- Below date (comfortable/detailed): `X days` (countdown)
- Color coding:
  - Date within 30 days: amber text
  - Date within 14 days: red text, bold
  - Date already past (overdue): red text, bold, with ⚠ icon
  - No date set: `— No Date` in muted text with tooltip
- If close date is in the past and deal is not closed: red background tint on the cell

---

## 4. Row-Level Interactions

### 4.1 Row States

| State | Visual Treatment | Trigger |
|---|---|---|
| **Default** | No special treatment | — |
| **Hover** | Background shifts to `--surface-hover` (slightly lighter), cursor changes to pointer | Mouse hover |
| **Selected (checkbox)** | Background shifts to `--surface-selected` (subtle blue tint), checkbox checked | Click checkbox |
| **Focused (keyboard)** | 2px focus ring around row, blue outline | Arrow key navigation |
| **Expanded** | Row expands to show inline detail panel below it | Click expand icon or press `→` |
| **Active** | Background `--surface-active`, thick left border in accent color | This is the deal currently open in the Cockpit |

### 4.2 Row Click Behavior

| Click Target | Action |
|---|---|
| **Checkbox** | Selects/deselects row for bulk operations. Does NOT navigate. |
| **Account Name (text)** | Opens deal in Cockpit (navigates to Cockpit page) |
| **Anywhere else on row** | Opens **Inline Preview Panel** (slides in from right) |
| **Double-click anywhere** | Opens deal in Cockpit (same as clicking account name) |

### 4.3 Row Context Menu (Right-Click)

```
┌──────────────────────────────────┐
│  Open in Cockpit          Enter  │
│  Open in Briefing Mode    ⌘B     │
│  ──────────────────────────────  │
│  Edit Deal                       │
│  Add Blocker                     │
│  Add Decision                    │
│  ──────────────────────────────  │
│  Copy Deal Link                  │
│  Copy TCV to Clipboard           │
│  ──────────────────────────────  │
│  View Audit Log                  │
│  View Intelligence               │
│  ──────────────────────────────  │
│  Archive Deal                    │
│  Delete Deal            ⌘⌫       │
└──────────────────────────────────┘
```

### 4.4 Row Expansion (Inline Detail)

When the Commander clicks the expand icon (▸) at the left edge of a row, or presses `→` on a focused row, the row expands to show an inline detail panel *below* the row without navigating away:

```
┌─────────────────────────────────────────────────────────────────────────────────────┐
│ [▸] │ ACME CORP       │ $1.45M │ Commercial │ 🔴 │ 72 │ 33%  │ ▼ 5d  │ Sep 15    │
├─────┴─────────────────┴────────┴────────────┴────┴────┴──────┴───────┴─────────────┤
│                                                                                     │
│  ALERTS                          BLOCKERS           NEXT ACTION                     │
│  🔴 Premature Commercial         0 active           ▶ Schedule arch review          │
│    Disconnect                    0 high             Overdue by 1 day                │
│                                                          Owner: John Doe            │
│  TEAM                            COMPETITORS                                        │
│  AM: John Doe                    AWS (Active)       DECISIONS                       │
│  TL: Sarah Jenkins               Strategy: Emphasize  Cap discount at 15%           │
│                                  data sovereignty    Owner: John │ Due: Jun 25      │
│                                  and TCO model       Status: In Progress            │
│                                                                                     │
│  TAGS                           CUSTOM FIELDS                                       │
│  [Strategic] [Net-New]          Industry: Financial Services                        │
│                                  Deployment: Cloud                                  │
│                                                                                     │
│                                        [Open Full Cockpit →]  [Briefing View →]     │
└─────────────────────────────────────────────────────────────────────────────────────┘
```

**Expansion rules:**
- Only one row can be expanded at a time (expanding a second row collapses the first)
- Expansion animation: 200ms ease-out height transition
- The inline panel has a subtle background color difference (slightly darker/lighter than row)
- "Open Full Cockpit" button navigates to the Cockpit page for this deal
- "Briefing View" opens this deal directly in Executive Briefing Mode

---

## 5. Inline Preview Panel (Side Panel)

When the Commander clicks anywhere on a row (except the checkbox or account name), a side panel slides in from the right edge of the viewport. This provides a **full deal summary without navigating away from the Roster**.

```
┌──────────────────────────────────────────────────┬──────────────────────────────────┐
│                                                  │  ┌────────────────────────────┐  │
│  DEAL ROSTER TABLE                               │  │  ACME CORP                 │  │
│  (dimmed slightly when panel is open)            │  │  Platform Modernization    │  │
│                                                  │  │  [Open in Cockpit →]  [×]  │  │
│                                                  │  ├────────────────────────────┤  │
│                                                  │  │                            │  │
│                                                  │  │  TCV: $1,450,000           │  │
│                                                  │  │  Stage: Commercial (32d)   │  │
│                                                  │  │  Health: 🔴 RED            │  │
│                                                  │  │  Score: 72/100 (MEDIUM)    │  │
│                                                  │  │                            │  │
│                                                  │  │  GATES: 33% (3/9)          │  │
│                                                  │  │  ████████░░░░░░░░░░░░░░░░  │  │
│                                                  │  │  Gate 2: Core MVP          │  │
│                                                  │  │                            │  │
│                                                  │  │  ALERTS (1):               │  │
│                                                  │  │  🔴 Premature Commercial   │  │
│                                                  │  │    Disconnect...           │  │
│                                                  │  │                            │  │
│                                                  │  │  TEAM:                     │  │
│                                                  │  │  AM: John Doe              │  │
│                                                  │  │  TL: Sarah Jenkins         │  │
│                                                  │  │                            │  │
│                                                  │  │  FINANCIALS:               │  │
│                                                  │  │  Product: $400K            │  │
│                                                  │  │  Services: $250K           │  │
│                                                  │  │  Model: Annual Sub         │  │
│                                                  │  │  Term: 3 years             │  │
│                                                  │  │                            │  │
│                                                  │  │  BLOCKERS (0)              │  │
│                                                  │  │  COMPETITORS (1): AWS      │  │
│                                                  │  │  STAKEHOLDERS (5)          │  │
│                                                  │  │  DECISIONS (2)             │  │
│                                                  │  │  TAGS: Strategic, Net-New  │  │
│                                                  │  │                            │  │
│                                                  │  │  STRATEGIC NOTES:          │  │
│                                                  │  │  Override pricing window.. │  │
│                                                  │  │                            │  │
│                                                  │  │  [Edit] [Briefing View]    │  │
│                                                  │  └────────────────────────────┘  │
└──────────────────────────────────────────────────┴──────────────────────────────────┘
```

**Panel behavior:**
- Width: 400px (fixed)
- Slides in from the right with 200ms ease-out transition
- The table area compresses to accommodate the panel (not overlaid — pushed left)
- Clicking a different row updates the panel content without closing/reopening
- `Esc` or clicking the `×` closes the panel
- Panel content is scrollable if it exceeds viewport height
- Keyboard: `Tab` moves focus into the panel; `Esc` returns focus to the table
- The panel fetches full deal data (including intelligence, blockers, competitors, stakeholders) when opened — not pre-loaded for all deals

---

## 6. Bulk Operations

When the Commander selects multiple deals via checkboxes, a **bulk action bar** appears:

```
┌─────────────────────────────────────────────────────────────────────────────────────┐
│  3 deals selected │ $4.58M TCV selected                [Clear Selection]           │
│                                                                                     │
│  [Change Stage ▾] [Add Tag ▾] [Add Blocker] [Export Selected] [Compare] [Delete]   │
└─────────────────────────────────────────────────────────────────────────────────────┘
```

### 6.1 Bulk Actions

| Action | Behavior |
|---|---|
| **Change Stage** | Opens a dropdown to select the new stage. Applies to all selected deals. Confirmation dialog shown. |
| **Add Tag** | Opens tag selector. Adds selected tag(s) to all selected deals (additive, doesn't remove existing tags). |
| **Add Blocker** | Opens blocker form. Creates one blocker and attaches it to all selected deals. |
| **Export Selected** | Exports only the selected deals as CSV/JSON/Excel. |
| **Compare** | Opens the Briefing Mode comparison view for the selected deals (max 4). |
| **Delete** | Confirmation dialog with deal names listed. "Type DELETE to confirm" safety. |

### 6.2 Selection Rules

- Clicking a checkbox selects that row
- `Shift + Click` selects a range (from the last selected row to the clicked row)
- `Ctrl/Cmd + Click` toggles individual selection without affecting others
- `Ctrl/Cmd + A` selects all visible (filtered) rows
- `Escape` clears all selections
- The header checkbox selects/deselects all visible rows
- Selection persists across page changes (if paginated) — a counter shows total selected

---

## 7. Sorting

### 7.1 Sort Indicators

```
┌──────────────────────────────────────────────────────────────────────────────────┐
│ [□] │ Account ▲ │ TCV    │ Stage    │ Health │ Score │ Gates │ Velocity │ Close  │
└──────────────────────────────────────────────────────────────────────────────────┘
```

- Click column header → sort ascending (▲)
- Click again → sort descending (▼)
- Click again → remove sort (return to default)
- Multiple column sort: `Shift + Click` a second column to add secondary sort
- Sort indicator: ▲ (ascending) or ▼ (descending) shown next to column name
- Default sort order: TCV descending (biggest deals first)
- Sort state is preserved in the URL query string (shareable, bookmarkable)

### 7.2 Sort Priority for Special Columns

| Column | Ascending Order | Descending Order |
|---|---|---|
| Health | 🔴 RED → 🟡 YELLOW → 🟢 GREEN | 🟢 GREEN → 🟡 YELLOW → 🔴 RED |
| Velocity | Stalled → Slow → On Pace → Fast | Fast → On Pace → Slow → Stalled |
| Stage | Discovery → Validation → Commercial → Procurement | Procurement → Commercial → Validation → Discovery |
| Score | 0 → 100 | 100 → 0 |
| Close Date | Closest date first (most urgent) | Furthest date first |

---

## 8. Saved Views

### 8.1 What is a Saved View?

A Saved View is a named combination of: filters, sort order, column visibility, column order, column widths, grouping, and density mode. The Commander can save any configuration and recall it instantly.

### 8.2 Default Saved Views (Pre-Built)

| View Name | Filters | Sort | Purpose |
|---|---|---|---|
| **All Deals** | None (all open stages) | TCV desc | Default operating view |
| **RED Alerts** | Health = RED | TCV desc | Triage view — what's broken |
| **Closing This Quarter** | Close date = this quarter | Close date asc | Quarter-end focus |
| **Stalled Deals** | Velocity = Stalled, Slow | Days in stage desc | Pipeline hygiene |
| **Big Deals** | TCV > $500K | TCV desc | High-value focus |
| **My Action Items** | Has overdue decisions OR overdue playbook steps | Overdue days desc | Morning priority view |

### 8.3 Creating a Saved View

```
┌──────────────────────────────────────────────────────────────┐
│  SAVE CURRENT VIEW                                             │
│                                                                │
│  View Name: [ Financial Services Deals Closing H2       ]     │
│                                                                │
│  Current Settings:                                             │
│  • Filters: Stage = Commercial, Procurement                    │
│  •          Custom Field "Industry" = Financial Services       │
│  •          Close Date = H2 2025                               │
│  • Sort: Close Date ascending                                  │
│  • Group: None                                                 │
│  • Columns: Account, TCV, Stage, Health, Score, Close Date,   │
│             Velocity, Tags                                     │
│  • Density: Compact                                            │
│                                                                │
│  [Save]  [Cancel]                                              │
└──────────────────────────────────────────────────────────────┘
```

### 8.4 View Management

```
┌──────────────────────────────────────────┐
│  SAVED VIEWS                              │
│                                           │
│  Default Views:                           │
│  • All Deals (12)                         │
│  • RED Alerts (2)                         │
│  • Closing This Quarter (5)               │
│                                           │
│  My Custom Views:                         │
│  • FS Deals Closing H2 (3)               │
│  • Big Deals with AWS (2)                │
│  • Sarah's Handoff Deals (4)             │
│                                           │
│  [Manage Views]  [Create New]            │
└──────────────────────────────────────────┘
```

---

## 9. Keyboard Navigation (Power User Features)

The Deal Roster must be fully navigable without a mouse.

### 9.1 Keyboard Shortcut Reference

| Shortcut | Action |
|---|---|
| `↑` / `↓` | Move row focus up/down |
| `Enter` | Open focused deal in Cockpit |
| `→` | Expand focused row (inline detail) |
| `←` | Collapse expanded row |
| `Space` | Toggle checkbox on focused row |
| `Shift + Space` | Select range from last selected to focused row |
| `Ctrl/Cmd + A` | Select all visible rows |
| `Ctrl/Cmd + K` | Focus search |
| `Ctrl/Cmd + E` | Export current view |
| `Ctrl/Cmd + B` | Open focused deal in Briefing Mode |
| `/` | Focus search (Vim-style) |
| `Esc` | Clear selection / close panel / close search / close modal |
| `1`–`9` | Quick sort by column number (1 = Account, 2 = TCV, etc.) |
| `g` then `s` | Group by Stage |
| `g` then `h` | Group by Health |
| `g` then `n` | Remove grouping |
| `?` | Open keyboard shortcut reference overlay |

### 9.2 Focus Management

```
┌──────────────────────────────────────────────────────────────────────────────────┐
│ [□] │ Account ▲│ TCV    │ Stage    │ Health │ Score │ Gates │ Velocity │ Close  │
├─────┼──────────┼────────┼──────────┼────────┼───────┼───────┼──────────┼────────┤
│ [□] │▶Global.. │ $3.1M  │ Commerc. │ 🟡     │ 81    │ ████▌ │ On Pace  │ Aug 30 │ ← FOCUSED
│ [□] │ Atlas..  │ $1.93M │ Validat. │ 🔴     │ 31    │ ███▌  │ ▼ 18d    │ Jul 15 │
│ [□] │ Acme..   │ $1.45M │ Commerc. │ 🔴     │ 72    │ ██▌   │ ▼ 5d     │ Sep 15 │
└──────────────────────────────────────────────────────────────────────────────────┘
```

- Focused row has a visible focus ring (2px blue outline, offset 1px)
- `▶` indicator on the Account Name column signals the focused row
- Focus wraps: pressing `↓` on the last row moves to the first row
- Focus state is preserved when the list updates (e.g., after a filter change)

---

## 10. Real-Time Updates

### 10.1 Live Data Behavior

The Deal Roster must feel alive. Data should never feel stale.

| Scenario | Behavior |
|---|---|
| **Another tab/window updates a deal** | The row smoothly updates with a brief highlight animation (200ms flash of the changed cells) |
| **Intelligence engine re-evaluates** | Health dot transitions smoothly (color cross-fade); score number animates to new value |
| **New deal created** | Row animates in (fade-up from 0 opacity, 300ms). If it would appear in the current sort position, it slides into place. |
| **Deal deleted** | Row fades out (300ms), remaining rows slide up to fill the gap |
| **Bulk operation completes** | Affected rows flash briefly, then update |

### 10.2 Stale Data Indicator

```
┌─────────────────────────────────────────────────────────────────────────────────┐
│  ┌──────────────────────────────────────────────────────────────────────────┐   │
│  │  ⚠ Data may be stale. Last synced: 3 minutes ago.  [Refresh Now]       │   │
│  └──────────────────────────────────────────────────────────────────────────┘   │
```

- Appears if the Commander hasn't interacted with the page for 3+ minutes
- "Refresh Now" triggers an immediate data fetch
- Also appears if the WebSocket connection drops (for real-time updates)

---

## 11. Export from List

### 11.1 Quick Export

The status bar at the bottom of the Roster includes a persistent export button:

```
┌─────────────────────────────────────────────────────────────────────────────────┐
│  Last synced: 30 sec ago │ 12 deals │ $8.45M │ [Export ▾] [Print] [⚙ Settings]│
└─────────────────────────────────────────────────────────────────────────────────┘
```

**Export dropdown:**

```
┌──────────────────────────────────────┐
│  Export:                              │
│                                      │
│  Current View (12 deals)             │
│  ├── CSV                             │
│  ├── Excel (.xlsx)                   │
│  ├── JSON                            │
│  └── PDF (formatted table)           │
│                                      │
│  Selected Deals (0)                  │
│  ├── CSV                             │
│  └── Excel                           │
│                                      │
│  [Configure Export Columns...]       │
└──────────────────────────────────────┘
```

- "Current View" exports exactly what's visible (respecting filters, sort, and column visibility)
- "Selected Deals" exports only checked rows (grayed out if none selected)
- PDF export uses a clean, printable layout (not a screenshot of the UI)

### 11.2 Print View

`Ctrl/Cmd + P` triggers a print-optimized layout:
- Removes toolbar, sidebar, navigation
- Clean black-and-white table with borders
- Page header: "EDC Deal Roster — [date] — [active filters]"
- Page footer: page numbers
- Auto-pagination for long lists

---

## 12. Empty & Edge States

### 12.1 Zero Deals (First Use)

```
┌─────────────────────────────────────────────────────────────────────────────────┐
│                                                                                 │
│                                                                                 │
│                           ┌─────────────────────┐                               │
│                           │                     │                               │
│                           │    (illustration)    │                               │
│                           │    Empty cockpit     │                               │
│                           │                     │                               │
│                           └─────────────────────┘                               │
│                                                                                 │
│                        No deals yet. Let's change that.                         │
│                                                                                 │
│                  Create your first strategic account to begin                    │
│                  tracking your enterprise pipeline.                             │
│                                                                                 │
│                         [+ Create First Deal]                                   │
│                                                                                 │
│                    or  [Import from Spreadsheet]                                │
│                                                                                 │
│                                                                                 │
└─────────────────────────────────────────────────────────────────────────────────┘
```

### 12.2 Zero Results (Filters Hide Everything)

```
┌─────────────────────────────────────────────────────────────────────────────────┐
│                                                                                 │
│                   No deals match your current filters.                          │
│                                                                                 │
│                   You have 12 total deals. Current filters are                  │
│                   hiding all of them.                                           │
│                                                                                 │
│                   Active filters: Stage = Closed-Lost, Health = RED             │
│                                                                                 │
│                         [Clear All Filters]                                     │
│                                                                                 │
└─────────────────────────────────────────────────────────────────────────────────┘
```

### 12.3 Loading State

```
┌─────────────────────────────────────────────────────────────────────────────────┐
│                                                                                 │
│  ┌──────────────────────────────────────────────────────────────────────────┐   │
│  │  ████████████████████████████████████████████████░░░░░░░░░░░░  Loading  │   │
│  └──────────────────────────────────────────────────────────────────────────┘   │
│                                                                                 │
│  ┌──────────────────────────────────────────────────────────────────────────┐   │
│  │ ░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░ │   │
│  │ ░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░ │   │
│  │ ░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░ │   │
│  │ ░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░ │   │
│  │ ░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░ │   │
│  └──────────────────────────────────────────────────────────────────────────┘   │
│                                                                                 │
└─────────────────────────────────────────────────────────────────────────────────┘
```

- Skeleton loading: gray pulsing rectangles matching the row shape
- Minimum 3 skeleton rows shown (even if there's only 1 deal)
- Loading state persists for minimum 300ms (prevents flash of loading → content for fast responses)

### 12.4 Error State

```
┌─────────────────────────────────────────────────────────────────────────────────┐
│                                                                                 │
│                        Unable to load deals.                                    │
│                                                                                 │
│                   The server didn't respond in time.                            │
│                   Your data is safe — this is a temporary issue.                │
│                                                                                 │
│                        [Retry]    [Go to Dashboard]                             │
│                                                                                 │
│                   Error: Request timeout (10s)                                  │
│                   Request ID: abc-123-def-456                                   │
│                                                                                 │
└─────────────────────────────────────────────────────────────────────────────────┘
```

---

## 13. Accessibility Requirements

| Requirement | Implementation |
|---|---|
| **Screen reader support** | All rows have `role="row"`, cells have `role="gridcell"`, column headers have `aria-sort` |
| **Focus management** | Roving `tabindex` on rows — only the focused row is in the tab order |
| **Color independence** | Health status is never communicated by color alone — always accompanied by text label or icon |
| **Contrast ratios** | All text meets WCAG AA (4.5:1 for normal text, 3:1 for large text) |
| **Motion preference** | All animations respect `prefers-reduced-motion: reduce` — animations become instant transitions |
| **Keyboard complete** | Every action available via mouse is also available via keyboard (see section 9) |
| **High contrast mode** | When OS high contrast mode is detected, borders become 2px solid, text becomes pure black/white |
| **Data table semantics** | Uses proper `<table>`, `<thead>`, `<th scope="col">`, `<tbody>` — not div-soup |

---

## 14. Performance Requirements

| Metric | Target | Notes |
|---|---|---|
| **Initial load** | < 1.5 seconds (LCP) | First meaningful paint with skeleton, actual data within 1.5s |
| **Sort change** | < 100ms | Client-side sort for < 100 deals; server-side for larger sets |
| **Filter change** | < 500ms | Includes API round-trip |
| **Search results** | < 300ms | Debounced at 300ms, results appear within 300ms of API response |
| **Row expansion** | < 200ms | Animation duration; data already available for basic fields |
| **Side panel open** | < 500ms | Includes fetch of full deal data |
| **Bulk select (50 rows)** | < 50ms | Checkbox state change is client-side |
| **Export (50 rows, CSV)** | < 2 seconds | Server-side generation |

---

## 15. Responsive Behavior

The Deal Roster is primarily a desktop experience, but must degrade gracefully on tablets:

| Breakpoint | Behavior |
|---|---|
| **> 1440px** | Full layout — all columns visible, side panel open alongside table |
| **1024px – 1440px** | Reduced columns — hide lower-priority columns (Services Tier, Pricing Model). Side panel overlays table (not alongside) |
| **768px – 1024px** (tablet) | Card view replaces table — each deal becomes a card (similar to comfortable density). Filters collapse into a modal panel. |
| **< 768px** (phone) | Redirect to Mobile Companion View (not the Roster) |

**Tablet card view:**

```
┌─────────────────────────────────────────────┐
│  ACME CORP                                  │
│  Platform Modernization                     │
│                                             │
│  $1,450,000  │  Commercial  │  🔴 RED       │
│                                             │
│  Score: 72    Gates: 33%    ▼ 5d slow       │
│  ████████░░░░░░░░░░░░░░░░  Close: Sep 15   │
│                                             │
│  ⚠ Premature Commercial Disconnect          │
│                                             │
│  [View →]                                   │
└─────────────────────────────────────────────┘
```

---

## 16. Interaction Summary (Complete Reference)

| Action | Trigger | Result |
|---|---|---|
| Open deal | Click account name / Enter key | Navigate to Cockpit |
| Preview deal | Click anywhere else on row | Side panel slides in |
| Expand deal | Click expand icon / → key | Inline detail below row |
| Select deal | Click checkbox / Space key | Row selected for bulk ops |
| Select range | Shift + Click / Shift + Space | Range selected |
| Select multiple | Ctrl + Click | Individual toggle |
| Select all | Ctrl/Cmd + A / Header checkbox | All visible rows selected |
| Sort ascending | Click column header | Sort ▲ |
| Sort descending | Click column header again | Sort ▼ |
| Remove sort | Click column header third time | Default order |
| Multi-sort | Shift + Click second column | Secondary sort added |
| Right-click | Right-click on row | Context menu |
| Quick search | Ctrl/Cmd + K or / | Focus search bar |
| Filter | Click filter dropdown | Apply filter |
| Group | Select from Group By dropdown | Table grouped |
| Change density | Select from Density dropdown | Row height changes |
| Export | Click Export in status bar | Download file |
| Print | Ctrl/Cmd + P | Print-optimized layout |
| Keyboard help | Press ? | Shortcut overlay |
| Close panel | Esc or click × | Side panel closes |
| Clear selection | Esc | All selections cleared |
| Create deal | Click + button in toolbar | New deal modal |

---

This specification gives the engineering team a complete behavioral blueprint. Every interaction has a defined trigger, a defined result, and a defined edge case. The Commander should never need to think about the interface — they should think about their deals.