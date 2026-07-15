# Closed-Lost Autopsy Module — Design & Technical Specification

## Enterprise Deal Commander

---

## 1. Module Purpose and Strategic Thesis

Every lost deal carries information. Not merely "why did we lose this one deal," but what structural conditions, behavioral patterns, process failures, competitive dynamics, and temporal rhythms made loss probable before the customer ever said no. The Closed-Lost Autopsy module exists to extract that information systematically, recognize patterns across losses that no individual post-mortem would reveal, and feed those insights back into the organization's pipeline, forecasting, and competitive positioning — closing the loop between outcome and action.

This module draws on the analytical frameworks established in the Portfolio Risk Analysis PRD (correlation-aware risk scoring, multi-methodology clustering, network topology, anomaly detection) and the Pipeline Analytics specification (Shapley decomposition, Granger causality validation, behavioral signal modeling, ensemble prediction) and applies them specifically to the negative outcome space: losses, disqualifications, and deal decay.

The core thesis: **losses are not independent events. They cluster by cause, correlate across dimensions, propagate through organizational structures, and follow detectable temporal patterns. A system that recognizes these structures transforms loss from a cost of doing business into a strategic intelligence asset.**

---

## 2. Problem Statement

### 2.1 The Loss Intelligence Gap

Enterprise sales organizations routinely lose 60-80% of qualified pipeline. The revenue impact is enormous, yet the organizational learning from those losses is typically shallow, inconsistent, and siloed.

**Superficial loss capture**: The most common loss tracking mechanism is a mandatory "loss reason" dropdown at deal close. Research across B2B sales organizations shows this captures actionable insight in fewer than 30% of cases. Reasons are selected hastily to satisfy CRM requirements, often defaulting to vague categories ("timing," "chose competitor") that carry no diagnostic value. The dropdown tells you what happened; it never tells you why, or what could have been different.

**No temporal structure**: Losses are analyzed as point events — the moment the deal closed as lost. But loss is a process. The seeds of loss are often planted weeks or months before the formal outcome: a missed stakeholder meeting, an unresolved technical objection, a competitive entry that was not addressed, a discount negotiation that signaled misaligned value perception. Without reconstructing the temporal sequence of events that led to loss, the organization cannot identify the intervention points where the outcome could have changed.

**Absence of pattern recognition**: Individual managers conduct sporadic deal post-mortems, typically for large or high-profile losses. These are discussed in team meetings, partially documented if at all, and then forgotten. The organizational memory of loss patterns lives in the heads of experienced managers and evaporates when they leave. No systematic mechanism exists to detect that, for example, losses to Competitor X in the healthcare segment have increased 40% in the last quarter, or that deals where the economic buyer was not engaged by Stage 2 have a 90% loss rate.

**Disconnected from action**: Even when loss insights are captured, they rarely connect back to the systems where action occurs. A product gap identified through loss analysis may appear in a quarterly business review slide but does not automatically feed into the product team's prioritization framework. A behavioral pattern identified by a perceptive manager does not translate into coaching guidance for the affected team member. A competitive positioning weakness does not trigger an update to the sales playbook. The loop remains open.

### 2.2 Business Impact of the Learning Gap

| Impact Dimension | Current State | Quantified Cost |
|-----------------|---------------|-----------------|
| **Repeated loss patterns** | Same loss reasons recur quarter after quarter with no improvement | Estimated 10-15% of losses are preventable with pattern-aware intervention |
| **Competitive blindness** | Competitive loss analysis limited to anecdotal reports | Loss of market share to competitors whose playbooks are not understood |
| **Product feedback latency** | Product gaps identified through losses take 2-4 quarters to appear in product roadmap | Revenue lost to addressable product gaps during feedback delay |
| **Coaching deficiency** | Manager coaching based on won deals (survivorship bias) rather than loss patterns | Team behavioral patterns that cause losses persist uncorrected |
| **Forecast contamination** | Deals with loss-indicative patterns are forecasted as normal pipeline | 15-25% of forecast error attributable to not recognizing loss-prone deals |
| **Organizational amnesia** | Loss insights reside in individual memories, not institutional systems | Loss of institutional knowledge with personnel turnover |

---

## 3. Goals and Objectives

### 3.1 Primary Goals

| ID | Goal | Success Metric |
|----|------|----------------|
| G1 | **Systematize loss capture** — move beyond dropdown menus to structured, multi-dimensional loss documentation that captures causal chains, not just terminal reasons | ≥80% of closed-lost deals above $50K ACV have complete autopsy records within 5 business days of close |
| G2 | **Detect loss patterns** — identify recurring loss signatures across deals, teams, products, competitors, and time periods that are invisible at the individual deal level | ≥20 actionable loss patterns identified per quarter with statistical validation |
| G3 | **Reconstruct loss timelines** — build temporal event sequences for lost deals that identify the specific moments where intervention could have changed the outcome | ≥70% of autopsied deals have identified "intervention points" with specific preceding events |
| G4 | **Feed insights into action** — create closed-loop connections between loss analysis findings and the systems where corrective action occurs (product roadmap, sales coaching, competitive positioning, process design) | ≥50% of identified patterns result in documented corrective actions within 30 days |
| G5 | **Predict loss risk proactively** — use historical loss patterns to score active deals for loss risk and identify at-risk deals before loss materializes | Loss risk model AUC ≥0.78; ≥60% of eventual losses flagged ≥30 days before close |
| G6 | **Integrate with Pipeline Analytics and Portfolio Risk modules** — enable loss intelligence to flow bidirectionally with pipeline forecasting and risk correlation analysis | Seamless drill-through between all three modules; loss pattern data feeds into pipeline win probability model |

### 3.2 Secondary Goals

- Build an institutional knowledge base of loss patterns that persists beyond individual tenure.
- Enable competitive intelligence teams to derive strategic positioning insights from loss data.
- Support A/B testing of sales process changes by measuring impact on loss pattern frequency.
- Provide product management with quantified, evidence-ranked product gap lists derived from loss data.

---

## 4. Target Users and Personas

### 4.1 Primary Users

**P1: Sales Manager / Team Lead**
- Conducts deal reviews and needs to understand why their team's deals are being lost.
- Key questions: *Which of my reps have loss patterns I should coach on? Are we losing for the same reasons we lost last quarter? What should I prioritize in this week's team meeting?*
- Interaction: Weekly loss review during deal review meetings; ad hoc investigation of specific losses.

**P2: Deal Desk / Revenue Operations Analyst**
- Monitors loss trends across the organization and prepares loss analysis for leadership.
- Key questions: *What are the top loss patterns this quarter? Are losses increasing in any segment? How do our loss patterns compare to benchmarks?*
- Interaction: Weekly trend monitoring, monthly deep-dive reports, quarterly strategic analysis.

**P3: VP of Sales / CRO**
- Uses loss intelligence to inform strategic decisions about product investment, competitive positioning, and sales process design.
- Key questions: *Why are we losing? Is it getting better or worse? What would have the biggest impact on our win rate?*
- Interaction: Monthly loss intelligence briefing, quarterly strategic planning.

### 4.2 Secondary Users

**P4: Product Manager**
- Uses loss data to identify and prioritize product gaps.
- Key questions: *Which feature gaps are costing us the most revenue? How do our product-related losses compare to competitors?*
- Interaction: Monthly product-loss correlation review, quarterly roadmap input.

**P5: Sales Enablement / Training Lead**
- Uses behavioral loss patterns to design coaching programs and sales training.
- Key questions: *Which selling behaviors correlate with higher loss rates? What skills gaps are showing up in our loss data?*
- Interaction: Quarterly training needs analysis, ongoing content development.

**P6: Competitive Intelligence Analyst**
- Uses competitive loss data to understand competitor positioning and develop counter-strategies.
- Key questions: *How are we positioned against each competitor? What are their winning arguments? Where are we most vulnerable?*
- Interaction: Weekly competitive loss monitoring, quarterly competitive strategy input.

---

## 5. Information Architecture

```
Enterprise Deal Commander
├── Dashboard (existing)
├── Deal Pipeline (existing)
├── Pipeline Analytics
├── Portfolio Risk Analysis
├── Closed-Lost Autopsy                    ← NEW MODULE
│   ├── Loss Intelligence Dashboard
│   │   ├── Loss Pulse (real-time indicator)
│   │   ├── Loss Volume & Value Tracker
│   │   ├── Loss Rate Decomposition
│   │   ├── Top Loss Patterns (ranked)
│   │   └── Loss Forecast (projected losses)
│   ├── Autopsy Workbench
│   │   ├── Deal Autopsy Form (structured capture)
│   │   ├── Autopsy Queue (deals pending review)
│   │   ├── Autopsy Library (completed autopsies)
│   │   └── Bulk Autopsy (pattern-based review)
│   ├── Pattern Recognition Engine
│   │   ├── Loss Signature Detector
│   │   ├── Temporal Loss Chain Analyzer
│   │   ├── Loss Cluster Visualization
│   │   ├── Emerging Pattern Alerts
│   │   └── Pattern Confidence Tracker
│   ├── Competitive Loss Intelligence
│   │   ├── Competitor Loss Dashboard
│   │   ├── Competitive Win/Loss Matrix
│   │   ├── Competitor Playbook Analyzer
│   │   ├── Displacement Timeline
│   │   └── Counter-Strategy Generator
│   ├── Loss Decomposition Analysis
│   │   ├── Multi-Dimensional Loss Breakdown
│   │   ├── Shapley Attribution Analysis
│   │   ├── Loss Reason Taxonomy Explorer
│   │   ├── "What-If" Loss Prevention Modeler
│   │   └── Revenue Impact Calculator
│   ├── Behavioral & Process Analysis
│   │   ├── Seller Behavioral Loss Patterns
│   │   ├── Process Failure Analysis
│   │   ├── Stakeholder Engagement Gap Analysis
│   │   ├── Stage-Specific Loss Profiling
│   │   └── Behavioral Coaching Recommendations
│   ├── Product Gap Intelligence
│   │   ├── Product Loss Correlation Matrix
│   │   ├── Feature Gap Revenue Impact
│   │   ├── Product Loss Trend Analysis
│   │   ├── Gap-Prioritization Scorecard
│   │   └── Product Team Feedback Loop
│   ├── Loss Prevention Engine
│   │   ├── Active Deal Loss Risk Scoring
│   │   ├── Early Warning System
│   │   ├── Intervention Recommendation Engine
│   │   ├── Playbook Suggestion Generator
│   │   └── Prevention Effectiveness Tracker
│   └── Organizational Learning
│       ├── Loss Knowledge Base
│       ├── Lessons Learned Repository
│       ├── Sales Playbook Gap Analysis
│       ├── Training Need Identification
│       └── Quarterly Loss Intelligence Report
├── Governance (existing)
└── Administration (existing)
```

---

## 6. Functional Requirements

### 6.1 Loss Intelligence Dashboard

#### 6.1.1 Loss Pulse

**FR-6.1.1.1**: The system shall compute and display a **Loss Health Score** (0-100, where 100 = minimal preventable losses) as the module's primary indicator. The score shall be computed as a weighted composite:

```
Loss Health Score = w₁·LossRate + w₂·LossTrend + w₃·PatternRecurrence + w₄·PreventionEffectiveness + w₅·AutopsyCompleteness
```

Where:
- **LossRate**: Inverse of loss rate relative to historical baseline (normalized to 0-100)
- **LossTrend**: Improvement trajectory of loss rate over trailing 90 days
- **PatternRecurrence**: Degree to which previously identified loss patterns have decreased
- **PreventionEffectiveness**: Success rate of interventions triggered by the module
- **AutopsyCompleteness**: Percentage of eligible deals with completed autopsies

**FR-6.1.1.2**: The Loss Pulse shall render as a **radial gauge** consistent with the Pipeline Analytics Pipeline Pulse design:
- 80-100: Emerald (losses well-managed)
- 60-79: Amber (attention needed)
- 40-59: Orange (significant loss concerns)
- 0-39: Critical (loss patterns escalating)

**FR-6.1.1.3**: The gauge shall include:
- A 90-day trend arrow with delta
- A quarter-over-quarter comparison indicator
- A peer comparison (if benchmark data available)
- Sub-score breakdown bars for each component

**FR-6.1.1.4**: The sub-score bars shall be independently clickable, navigating to the corresponding detailed analysis view.

#### 6.1.2 Loss Volume and Value Tracker

**FR-6.1.2.1**: The system shall display loss volume and value metrics across multiple time dimensions:

| Metric | Display |
|--------|---------|
| **Loss Count** | Number of deals lost this period with delta |
| **Loss Value** | Total ACV of deals lost this period with delta |
| **Loss Rate** | Lost / (Won + Lost) as percentage with trend sparkline |
| **Weighted Loss Value** | Loss value × deal-stage-weight at time of loss |
| **Preventable Loss Estimate** | AI-estimated portion of loss value attributable to preventable causes |
| **Average Loss Deal Size** | Mean ACV of lost deals with trend |

**FR-6.1.2.2**: Each metric shall render as a **card** following the application's existing card standard (`bg-card border border-border rounded-lg p-4 shadow-sm`) with:
- Metric label in `text-muted-foreground text-xs uppercase tracking-wider`
- Value in `text-3xl font-bold font-mono` with semantic color
- 90-day sparkline
- Period-over-period delta with directional indicator

**FR-6.1.2.3**: The tracker shall include a **loss composition bar chart** showing the breakdown of losses by primary loss category (Price, Product, Competitive, Timing, Relationship, Process) as a stacked horizontal bar, updated each period.

**FR-6.1.2.4**: A **loss heatmap calendar** shall display daily loss counts and values for the current quarter, with color intensity encoding volume, enabling recognition of temporal clustering patterns.

#### 6.1.3 Loss Rate Decomposition

**FR-6.1.3.1**: The system shall decompose the overall loss rate into contributing dimensions using **Shapley value attribution** (consistent with the Pipeline Analytics win rate decomposition approach):

| Dimension | Decomposition Example |
|-----------|----------------------|
| **Product Line** | "DataSync Pro losses contribute +6pp above baseline to overall loss rate" |
| **Competitor** | "Losses to CloudBridge account for +4pp of loss rate increase this quarter" |
| **Team / Region** | "EMEA losses are +8pp above the portfolio average" |
| **Deal Size** | "Enterprise deals ($100K+) lose at 72% vs. 45% mid-market" |
| **Deal Stage at Loss** | "42% of losses occur in Stage 3 (Technical Evaluation)" |
| **Loss Timing** | "Last-two-week-of-quarter losses are 2.3x the quarterly average rate" |
| **Source** | "Outbound-sourced deals lose at 61% vs. 38% for referrals" |
| **Stakeholder Depth** | "Single-threaded deals lose at 78% vs. 34% for 3+ stakeholder deals" |

**FR-6.1.3.2**: The decomposition shall render as a **waterfall chart** starting from the baseline loss rate and showing each dimension's positive (loss-increasing) or negative (loss-decreasing) contribution.

**FR-6.1.3.3**: The decomposition shall be **interactive** — users can select which dimensions to include and observe how attributions shift.

**FR-6.1.3.4**: Each dimension contribution shall be clickable, navigating to the detailed analysis for that dimension.

#### 6.1.4 Top Loss Patterns (Ranked)

**FR-6.1.4.1**: The system shall display a **ranked list of the top 10 active loss patterns**, ordered by estimated revenue impact.

**FR-6.1.4.2**: Each pattern entry shall be a **pattern card** containing:
- Pattern name and one-sentence description
- Revenue impact estimate (total ACV of deals matching this pattern in the period)
- Frequency (number of deals matching this pattern)
- Trend indicator (increasing / stable / decreasing)
- Confidence level (high / medium / low — based on statistical validation)
- Primary affected segment
- Click-through to the full pattern analysis

**FR-6.1.4.3**: Pattern cards shall use the application's left-border accent convention:
- Amber border: Pattern recurring at moderate frequency
- Orange border: Pattern accelerating or high-impact
- Red border: Pattern critical — significant revenue impact with increasing trend

**FR-6.1.4.4**: New patterns (detected within the last 30 days) shall display a **"New" badge** using `bg-primary/10 text-primary text-xs px-2 py-0.5 rounded-full`.

#### 6.1.5 Loss Forecast

**FR-6.1.5.1**: The system shall project **expected losses for the current and next quarter** based on:
- Historical loss rates by segment and stage
- Current pipeline composition (deals with loss-indicative characteristics)
- Seasonal loss patterns
- Trend adjustments

**FR-6.1.5.2**: The forecast shall be displayed as a **fan chart** showing:
- Central estimate line
- 50% confidence band
- 90% confidence band
- Actual losses plotted against the forecast (for current quarter)

**FR-6.1.5.3**: The forecast shall decompose projected losses by category (product, competitive, timing, etc.) so that stakeholders can anticipate which loss drivers are most likely to materialize.

---

### 6.2 Autopsy Workbench

#### 6.2.1 Deal Autopsy Form (Structured Capture)

**FR-6.2.1.1**: The system shall provide a **structured autopsy form** that captures loss information across multiple dimensions, moving far beyond a simple loss reason dropdown. The form shall be organized into the following sections:

**Section 1: Outcome Classification**

| Field | Type | Description |
|-------|------|-------------|
| Final outcome | Select | Won (competitor), Lost (no decision), Disqualified, Abandoned, No-decision |
| Loss date | Date picker | Date the loss was confirmed |
| Confirmed by | User select | Who confirmed the loss |
| Win-back potential | Slider (0-100) | Likelihood of re-engaging this opportunity |
| Win-back timeline | Select | Immediate (<30 days), Short-term (30-90 days), Long-term (90+ days), None |

**Section 2: Primary Loss Driver**

| Field | Type | Description |
|-------|------|-------------|
| Primary loss category | Select | Price, Product, Competitive, Timing, Relationship, Process |
| Sub-category | Dynamic select (based on primary) | See loss reason taxonomy (Section 6.5.3) |
| Loss narrative | Rich text | Free-form description of why the deal was lost (minimum 100 characters enforced) |
| Root cause depth | Guided prompts | System presents a "5 Whys" guided drill-down to surface root causes |

**Section 3: Competitive Intelligence**

| Field | Type | Description |
|-------|------|-------------|
| Competitor(s) involved | Multi-select | Which competitors were evaluated |
| Winning competitor | Select | Which competitor won (if applicable) |
| Competitor strengths observed | Tag selector | What the competitor did well |
| Competitor weaknesses observed | Tag selector | Where the competitor was vulnerable |
| Competitive differentiation gaps | Rich text | Where our offering fell short |
| Competitor pricing intelligence | Structured fields | Competitor's pricing model, discount level, commercial terms |
| Customer's evaluation criteria | Tag selector | What factors the customer weighted most heavily |

**Section 4: Timeline Reconstruction**

| Field | Type | Description |
|-------|------|-------------|
| Key events timeline | Ordered event list | Chronological reconstruction of critical moments |
| First sign of trouble | Event select | When and how the first risk signal appeared |
| Missed intervention points | Multi-select with timeline | Moments where a different action might have changed the outcome |
| Final decision trigger | Rich text | What specifically precipitated the loss decision |

**Section 5: Stakeholder Analysis**

| Field | Type | Description |
|-------|------|-------------|
| Decision maker engaged | Boolean | Was the economic buyer directly engaged? |
| Champion identified | Boolean | Was there an internal champion? |
| Champion effectiveness | Slider (0-100) | How effective was the champion? |
| Stakeholder map completeness | Percentage | How many buying roles were identified and engaged? |
| Key stakeholder changes | Boolean + detail | Did stakeholders change during the deal? |
| Stakeholder sentiment trajectory | Timeline select | Did stakeholder sentiment improve, remain stable, or deteriorate? |

**Section 6: Product and Solution Assessment**

| Field | Type | Description |
|-------|------|-------------|
| Product(s) involved | Multi-select | Which products were in the proposed solution |
| Product gaps identified | Multi-select from taxonomy + free text | Specific product deficiencies cited |
| Product gaps severity | Per gap: Slider (0-100) | How critical was each gap to the customer |
| Proof of concept / evaluation outcome | Select | Successful, Partial, Failed, Not conducted |
| Technical objections unresolved | Rich text | Technical concerns that were not addressed |

**Section 7: Process Assessment**

| Field | Type | Description |
|-------|------|-------------|
| Sales process adherence | Auto-computed + manual override | Score based on activity tracking |
| Stage at which deal quality deteriorated | Stage select | When did the deal trajectory change |
| Activities not completed | Auto-populated from CRM | What required activities were skipped |
| Time spent in each stage | Auto-populated from CRM | Stage velocity data |
| Discount offered | Percentage / dollar | Discount level at final proposal |
| Discount impact assessment | Select | Did the discount affect perception of value? |

**Section 8: Retrospective Assessment**

| Field | Type | Description |
|-------|------|-------------|
| Deal should not have been pursued | Boolean + reason | Was this deal winnable given our capabilities? |
| What would you do differently? | Rich text | Seller's self-reflection |
| What support would have helped? | Multi-select | Additional resources that might have changed the outcome |
| Manager assessment | Rich text (manager only) | Manager's independent assessment of the loss |
| Confidence in assessment | Slider (0-100) | How confident is the assessor in this analysis? |

**FR-6.2.1.2**: The form shall implement **progressive disclosure** — initial fields are simple (outcome classification), with deeper sections revealed as the user progresses. Each section shall show a completion indicator.

**FR-6.2.1.3**: The form shall support **AI-assisted completion**:
- The system shall **pre-populate** fields where data is available from CRM (deal value, stage history, timeline, stakeholders, products)
- The system shall **suggest** loss reasons based on deal characteristics and pattern matching against historical losses
- The system shall **generate draft narratives** from the timeline and activity data, which the reviewer can edit
- The system shall **identify potential intervention points** from the timeline data and present them for confirmation

**FR-6.2.1.4**: The "5 Whys" guided drill-down shall work as follows:
1. System asks: "Why was this deal lost?" → User selects primary category
2. System asks: "Why did [primary category] occur?" → User selects or describes sub-causal factor
3. System continues to depth 5, with each question informed by the previous answer
4. The full chain is captured and stored as a **causal chain** data structure
5. Causal chains are aggregated across autopsies to identify recurring root-cause patterns

**FR-6.2.1.5**: The form shall validate minimum required fields before submission: Primary loss category, loss narrative (minimum 100 characters), and at least one timeline event.

**FR-6.2.1.6**: Partially completed autopsies shall be **auto-saved** every 60 seconds and can be resumed from the Autopsy Queue.

#### 6.2.2 Autopsy Queue

**FR-6.2.2.1**: The system shall maintain an **Autopsy Queue** — a prioritized list of deals awaiting autopsy review.

**FR-6.2.2.2**: Queue prioritization shall be based on:

| Priority Factor | Weight | Logic |
|----------------|--------|-------|
| Deal value | High | Higher-value deals prioritized |
| Recency | High | More recent losses prioritized (within 5 business days target) |
| Pattern match | Medium | Deals matching known high-impact loss patterns prioritized |
| Strategic importance | Medium | Deals tagged as strategic prioritized |
| Competitive | Medium | Competitive losses prioritized for intelligence value |
| Manager assignment | Override | Managers can manually boost priority |

**FR-6.2.2.3**: The queue shall display for each entry:
- Deal name, value, team member, product, segment
- Auto-estimated loss probability (from the Pipeline Analytics win probability model — the inverse of win probability at time of close)
- AI-suggested primary loss category (preliminary, pending review)
- Days since loss (with amber/red indicators if exceeding SLA)
- Assignee (the person responsible for completing the autopsy)

**FR-6.2.2.4**: The queue shall support filtering by team member, product, segment, assignee, priority level, and status (pending, in-progress, completed).

**FR-6.2.2.5**: The queue shall include **SLA tracking** — autopsies should be completed within 5 business days of loss confirmation. Breaches shall be flagged with `border-l-4 border-l-red-500` styling on the queue entry.

#### 6.2.3 Autopsy Library

**FR-6.2.3.1**: The system shall maintain a searchable, filterable **library of all completed autopsies**.

**FR-6.2.3.2**: The library shall support full-text search across loss narratives, root cause analyses, and retrospective assessments.

**FR-6.2.3.3**: The library shall support filtering by:
- All dimensions captured in the autopsy form
- Loss pattern membership
- Time period
- Confidence level
- Win-back potential

**FR-6.2.3.4**: Each library entry shall show a **summary card** with the deal name, value, primary loss reason, key insight, and pattern tags. Clicking the card opens the full autopsy.

**FR-6.2.3.5**: The library shall support **similarity search** — given a deal, find the most similar historical losses based on deal characteristics, loss reasons, and timeline patterns. Similarity shall be computed using cosine similarity on the deal feature vector.

#### 6.2.4 Bulk Autopsy (Pattern-Based Review)

**FR-6.2.4.1**: The system shall support **bulk autopsy workflows** for cases where multiple deals share a common loss pattern and can be reviewed together.

**FR-6.2.4.2**: When the Pattern Recognition Engine (Section 6.3) identifies a cluster of losses with similar characteristics, the system shall offer to create a **bulk autopsy session** that:
- Groups the related losses together
- Presents the common characteristics across the group
- Allows the reviewer to apply a shared loss assessment to all deals in the group while noting individual variations
- Generates a **pattern-level autopsy report** summarizing the shared root cause, affected deals, total revenue impact, and recommended actions

**FR-6.2.4.3**: Bulk autopsies shall still allow individual deal-level annotations for unique factors not captured by the group pattern.

---

### 6.3 Pattern Recognition Engine

This section implements the core analytical intelligence of the module, applying multi-methodology pattern recognition to loss data.

#### 6.3.1 Loss Signature Detector

**FR-6.3.1.1**: The system shall automatically detect **loss signatures** — recurring combinations of deal characteristics, behavioral sequences, and contextual factors that statistically predict loss.

**FR-6.3.1.2**: Loss signatures shall be defined as **conjunction rules** — combinations of conditions that co-occur in losses at rates significantly higher than in the general pipeline:

```
Loss Signature Format:
  IF [condition_1] AND [condition_2] AND ... AND [condition_n]
  THEN loss_rate = X% (vs. baseline Y%)
  WITH confidence = Z (p-value)
  AFFECTING N deals worth $M in the current period
```

**FR-6.3.1.3**: The system shall discover loss signatures using **association rule mining** (Apriori algorithm with lift, confidence, and support thresholds) applied to the feature space of closed deals.

**FR-6.3.1.4**: The feature space for signature detection shall include:

| Feature Category | Features |
|-----------------|----------|
| **Deal characteristics** | Value tier, product, segment, industry, deal type, source |
| **Velocity features** | Total cycle time, stage residence times, stage regression count, acceleration/deceleration flags |
| **Engagement features** | Stakeholder count, engagement depth, multi-threading score, communication frequency, last activity age |
| **Competitive features** | Number of competitors, specific competitor identities, competitive displacement signals |
| **Behavioral features** | Discount depth, proposal iteration count, executive engagement level, evaluation outcome |
| **Temporal features** | Quarter timing, day-of-week, time-in-quarter, seasonal indicators |
| **Process features** | Process compliance score, activities completed/skipped, data completeness |

**FR-6.3.1.5**: Each discovered signature shall be evaluated against:
- **Minimum support**: The signature must apply to ≥2% of closed deals in the training window
- **Minimum confidence**: The loss rate within the signature must be ≥2x the baseline loss rate
- **Minimum lift**: The signature's loss rate must be statistically significantly higher than random (p < 0.01)
- **Stability**: The signature must be consistent across at least 2 consecutive quarters (prevents overfitting to transient patterns)

**FR-6.3.1.6**: Discovered signatures shall be displayed as a **ranked list** with:
- Signature name (auto-generated from the conjunction rule, e.g., "Enterprise deals in Stage 3 with single-threaded stakeholder and Competitor X present")
- Confidence score and statistical metrics
- Revenue impact (total value of matching deals lost in the period)
- Frequency (number of matching deals)
- Trend (increasing / stable / decreasing)
- Affected segments
- Recommended intervention

**FR-6.3.1.7**: The system shall support **user-defined signatures** — analysts can manually define loss signatures using the Segment Builder interface and test them against historical data.

#### 6.3.2 Temporal Loss Chain Analyzer

**FR-6.3.2.1**: The system shall reconstruct and analyze **temporal loss chains** — the sequences of events and state changes that precede loss outcomes.

**FR-6.3.2.2**: For each autopsied loss, the system shall construct a **loss timeline event sequence**:

```
Event Sequence: [E₁, E₂, E₃, ..., Eₙ, LOSS]

Where each Eᵢ is a timestamped event:
  - Stage transition (forward, backward, skip)
  - Activity event (meeting, email, call, demo, proposal)
  - Stakeholder change (added, removed, role change, departure)
  - Value change (increase, decrease, discount applied)
  - Competitive event (competitor entered, competitive displacement signal)
  - Engagement signal (document view, contract redline, procurement inquiry)
  - Inactivity period (gap > N days with no recorded activity)
```

**FR-6.3.2.3**: The system shall identify **loss precursor sequences** — recurring subsequences of events that appear significantly more frequently before losses than before wins.

**FR-6.3.2.4**: Precursor sequence detection shall use **sequential pattern mining** (PrefixSpan or SPADE algorithm) with:
- Minimum support: Sequence appears in ≥5% of losses
- Minimum confidence: Sequence appears in ≤20% of wins (high discriminative power)
- Minimum length: 3 events
- Maximum length: 15 events

**FR-6.3.2.5**: Discovered precursor sequences shall be visualized as **sequence diagrams** showing:
- Event nodes with timestamps and descriptions
- Directed edges showing temporal ordering
- Branching points where different event paths lead to different outcomes
- Annotated intervention points (events where a different action could have altered the sequence)

**FR-6.3.2.6**: The system shall compute a **sequence similarity score** between active deals and known loss precursor sequences, enabling early warning when an active deal's trajectory matches a loss pattern.

#### 6.3.3 Loss Cluster Visualization

**FR-6.3.3.1**: The system shall provide a **multi-dimensional visualization** of loss clusters — groups of losses that share structural similarity.

**FR-6.3.3.2**: The visualization shall implement a **Minimum Spanning Tree (MST)** of loss correlations (consistent with the network topology approach from the Portfolio Risk Analysis research):

1. Compute pairwise similarity between all losses in the selected time period using a composite similarity metric across all autopsy dimensions
2. Convert similarity to distance: `d(i,j) = 1 - similarity(i,j)`
3. Compute MST using Kruskal's or Prim's algorithm
4. Render the MST as a network graph where:
   - Nodes represent individual losses (sized by deal value)
   - Edges represent the strongest structural connections between losses
   - Node color encodes primary loss category
   - Edge thickness encodes similarity strength

**FR-6.3.3.3**: The MST shall support **pruning** — users can set a distance threshold to filter out weak connections, revealing the strongest loss clusters.

**FR-6.3.3.4**: The system shall automatically **identify and label clusters** in the MST using connected components at the selected threshold. Each cluster shall be annotated with:
- Cluster size (number of losses)
- Total revenue impact
- Dominant loss characteristics
- Auto-generated cluster description

**FR-6.3.3.5**: The system shall also support a **t-SNE or UMAP embedding** view that projects the high-dimensional loss feature space into 2D for visual exploration, with cluster boundaries drawn as convex hulls.

**FR-6.3.3.6**: Both MST and embedding views shall support interactive filtering by time period, deal dimensions, and loss category.

#### 6.3.4 Emerging Pattern Alerts

**FR-6.3.4.1**: The system shall continuously monitor for **emerging loss patterns** — new patterns that are forming but have not yet reached statistical significance as confirmed patterns.

**FR-6.3.4.2**: Emerging pattern detection shall use:
- **Change-point detection** (PELT algorithm) on loss rate time series by segment, product, and competitor
- **Anomaly detection** (Isolation Forest) on the feature distribution of recent losses compared to historical baseline
- **Trend detection** on individual loss signature frequencies — signatures whose frequency is increasing at a statistically significant rate

**FR-6.3.4.3**: Each emerging pattern shall be surfaced as an **alert** with:
- Pattern description
- Evidence strength (how many deals, over what time period, what confidence level)
- Projected impact if the pattern continues at current trajectory
- Recommended investigation action
- Confidence level: Low (2-3 deals), Medium (4-6 deals), High (7+ deals)

**FR-6.3.4.4**: Emerging pattern alerts shall use the application's notification system with slide-in animation, consistent with the anomaly feed pattern in Pipeline Analytics.

**FR-6.3.4.5**: Users shall be able to **acknowledge, investigate, or dismiss** alerts, and the system shall track alert-to-outcome accuracy to improve detection sensitivity over time.

#### 6.3.5 Pattern Confidence Tracker

**FR-6.3.5.1**: The system shall track the **confidence and stability** of each detected pattern over time.

**FR-6.3.5.2**: For each pattern, the system shall maintain:
- **Discovery date**: When the pattern was first detected
- **Validation history**: Each quarter, whether the pattern continued to hold at statistically significant levels
- **Confidence trajectory**: Whether the pattern is strengthening, stable, or weakening
- **Intervention history**: What actions were taken in response to the pattern, and whether the pattern frequency changed after intervention

**FR-6.3.5.3**: Patterns shall be classified into lifecycle stages:
- **Emerging**: Newly detected, not yet statistically validated
- **Confirmed**: Validated across ≥2 periods with consistent significance
- **Monitored**: Previously confirmed, currently being tracked for intervention effectiveness
- **Resolved**: Pattern frequency has decreased to non-significant levels (potentially due to successful intervention)
- **Archived**: Historical pattern no longer active but retained for reference

**FR-6.3.5.4**: The confidence tracker shall render as a **timeline view** per pattern showing the lifecycle stages, intervention events, and frequency trend over time.

---

### 6.4 Competitive Loss Intelligence

#### 6.4.1 Competitor Loss Dashboard

**FR-6.4.1.1**: The system shall provide a **per-competitor loss analysis dashboard** showing for each identified competitor:

| Metric | Description |
|--------|------------|
| **Encounter rate** | Percentage of competitive deals where this competitor appears |
| **Win rate against** | Our win rate when competing against this competitor |
| **Win rate trend** | Whether our win rate against this competitor is improving or declining |
| **Loss value** | Total ACV lost to this competitor in the period |
| **Average deal size impact** | How deal sizes change when this competitor is present |
| **Cycle time impact** | How sales cycles change when this competitor is present |
| **Segment concentration** | Which segments this competitor is strongest in |
| **Product line impact** | Which of our products are most affected by this competitor |

**FR-6.4.1.2**: The dashboard shall display a **competitive ranking** — competitors ordered by revenue impact (loss value × encounter frequency).

**FR-6.4.1.3**: Each competitor entry shall be expandable to reveal:
- Detailed loss breakdown by segment, product, and deal size
- Customer evaluation criteria when this competitor won
- Our specific competitive gaps against this competitor (from autopsy data)
- Competitor's observed strengths and weaknesses (aggregated from autopsy intelligence fields)

#### 6.4.2 Competitive Win/Loss Matrix

**FR-6.4.2.1**: The system shall render a **matrix** where:
- Rows represent our product lines
- Columns represent competitors
- Cell values represent our win rate in competitive deals at each intersection
- Cell color uses the semantic scale (emerald for high win rate, red for low win rate)

**FR-6.4.2.2**: The matrix shall support **drill-down** — clicking any cell navigates to the list of competitive deals at that intersection with full autopsy details.

**FR-6.4.2.3**: The matrix shall include **marginal summaries** — row totals (our win rate per product across all competitors) and column totals (our win rate per competitor across all products).

**FR-6.4.2.4**: Cells with insufficient data (<5 competitive deals) shall display a `text-muted-foreground` "insufficient data" indicator rather than a win rate.

#### 6.4.3 Competitor Playbook Analyzer

**FR-6.4.3.1**: The system shall aggregate loss intelligence data to construct **inferred competitor playbooks** — the patterns of how each competitor approaches competitive deals.

**FR-6.4.3.2**: For each major competitor, the system shall analyze and present:
- **Positioning patterns**: The most common value propositions cited by customers choosing this competitor (extracted from loss narratives using NLP)
- **Pricing patterns**: Observed pricing models, discount levels, and commercial terms (from competitive intelligence fields)
- **Technical win patterns**: The technical capabilities most frequently cited as differentiators
- **Sales motion patterns**: The typical timeline and engagement approach observed in competitive losses
- **Vulnerability patterns**: Weaknesses observed by customers who chose us over this competitor (from competitive wins)

**FR-6.4.3.3**: The playbook analyzer shall use **natural language processing** on loss narratives and competitive intelligence fields to extract and categorize competitor-related insights.

**FR-6.4.3.4**: Extracted insights shall be presented as a **structured competitor profile card** per competitor, with:
- Strengths (ranked by frequency of mention in losses)
- Weaknesses (ranked by frequency of mention in wins against them)
- Observed pricing intelligence
- Recommended counter-strategies (generated from the intersection of their strengths and our capabilities)
- Confidence indicator based on data volume

#### 6.4.4 Displacement Timeline

**FR-6.4.4.1**: The system shall visualize the **temporal pattern of competitive displacement** — when and how competitors are gaining or losing ground.

**FR-6.4.4.2**: The timeline shall display:
- Encounter rate trend per competitor over time
- Win rate trend per competitor over time
- Key events annotated on the timeline (competitor product launches, pricing changes, marketing campaigns detected through loss intelligence)

**FR-6.4.4.3**: The system shall detect **displacement acceleration** — instances where a competitor's encounter rate or win rate is increasing at a statistically significant rate — and generate alerts.

#### 6.4.5 Counter-Strategy Generator

**FR-6.4.5.1**: Based on aggregated competitive loss intelligence, the system shall generate **recommended counter-strategies** for each major competitor.

**FR-6.4.5.2**: Counter-strategies shall be generated by analyzing the intersection of:
- The competitor's identified strengths (from loss data)
- The competitor's identified weaknesses (from win data)
- Our product capabilities and differentiators
- The customer evaluation criteria most frequently weighted in competitive deals

**FR-6.4.5.3**: Each counter-strategy shall include:
- **Strategy name** (e.g., "Early Technical Differentiation Play against CloudBridge")
- **Target scenario** (deals where this strategy applies — segment, product, competitor)
- **Recommended actions** (specific steps for the sales team)
- **Supporting evidence** (loss data and autopsy insights supporting this strategy)
- **Expected impact** (estimated win rate improvement based on historical data where similar approaches were used)
- **Required resources** (sales enablement materials, product demos, executive engagement)

**FR-6.4.5.4**: Counter-strategies shall be reviewed and approved by sales leadership before activation. The system shall track the **adoption and effectiveness** of each counter-strategy over time.

---

### 6.5 Loss Decomposition Analysis

#### 6.5.1 Multi-Dimensional Loss Breakdown

**FR-6.5.1.1**: The system shall provide an **interactive multi-dimensional breakdown** tool that allows users to decompose losses by any combination of captured dimensions.

**FR-6.5.1.2**: The breakdown shall be rendered as a **treemap** where:
- The initial view shows the top-level loss category breakdown
- Clicking any category drills into its sub-categories
- Rectangle size represents loss value
- Rectangle color represents the trend (emerald = improving, red = worsening)

**FR-6.5.1.3**: The breakdown shall support **cross-tabulation** — viewing the intersection of two dimensions (e.g., "Losses by Product × Competitor" or "Losses by Stage × Loss Reason").

**FR-6.5.1.4**: Each cell in the cross-tabulation shall display:
- Loss count
- Loss value
- Loss rate for that segment
- Delta from the portfolio average loss rate

#### 6.5.2 Shapley Attribution Analysis

**FR-6.5.2.1**: The system shall compute **Shapley value attributions** for loss causes, fairly distributing credit for the loss outcome across multiple contributing factors.

**FR-6.5.2.2**: The Shapley analysis shall address the fundamental attribution challenge: when a deal is lost to a competitor on price, was the primary cause pricing strategy, product positioning, competitive intelligence failure, or stakeholder engagement deficiency? Each factor contributed, but how much?

**FR-6.5.2.3**: The analysis shall compute Shapley values across the following factor groups:

| Factor Group | Individual Factors |
|-------------|-------------------|
| **Product factors** | Feature gaps, performance issues, integration limitations, security gaps |
| **Commercial factors** | Pricing, discount strategy, contract terms, ROI demonstration |
| **Competitive factors** | Competitor product superiority, competitor pricing, incumbent advantage |
| **Process factors** | Activities skipped, stage velocity, compliance gaps |
| **Engagement factors** | Stakeholder depth, champion effectiveness, executive sponsorship |
| **Timing factors** | Quarter timing, budget cycle alignment, organizational changes |
| **Team factors** | Individual seller behaviors, experience level, product knowledge |

**FR-6.5.2.4**: Shapley attributions shall be visualized as a **stacked bar chart** showing each factor group's contribution to losses, segmented by the primary loss category.

**FR-6.5.2.5**: The analysis shall support **scenario modeling**: "If product factor contribution were reduced by 50% (through product improvements), what would the estimated impact on loss rate be?"

#### 6.5.3 Loss Reason Taxonomy Explorer

**FR-6.5.3.1**: The system shall maintain a **hierarchical loss reason taxonomy** that is:

**Level 1 — Categories**:
```
Price / Commercial
├── Budget constraints
│   ├── Customer budget reduced
│   ├── Budget allocated elsewhere
│   └── Budget cycle misalignment
├── Price too high vs. value perceived
│   ├── No ROI case established
│   ├── Value not differentiated from alternatives
│   └── Price premium not justified
├── Price too high vs. competitor
│   ├── Direct price comparison unfavorable
│   ├── Competitor offered bundled discount
│   └── Competitor used aggressive land-and-expand pricing
└── Commercial terms
    ├── Contract flexibility requirements
    ├── Payment terms mismatch
    └── Procurement process incompatibility

Product / Technical
├── Missing capability
│   ├── Specific feature gap (linked to feature taxonomy)
│   ├── Integration gap
│   └── Platform/technology gap
├── Performance concerns
│   ├── Scalability doubts
│   ├── Reliability concerns
│   └── Benchmark performance
├── Security / compliance gaps
│   ├── Certification missing
│   ├── Data residency requirements
│   └── Audit trail deficiencies
└── User experience
    ├── Ease of use perception
    ├── Migration complexity
    └── Training/learning curve

Competitive
├── Lost to specific competitor (linked to competitor taxonomy)
│   ├── Superior product fit
│   ├── Superior pricing
│   ├── Existing relationship / incumbent
│   └── Superior sales execution
├── Build vs. buy decision
├── No decision / status quo maintained
└── Market consolidation / merger

Timing
├── Project postponed
│   ├── Strategic priority change
│   ├── Organizational restructuring
│   └── Economic uncertainty
├── Budget cycle misalignment
├── Decision-maker change
└── Regulatory / compliance timeline

Relationship
├── Insufficient stakeholder engagement
│   ├── Economic buyer not engaged
│   ├── Technical evaluator not convinced
│   └── End-user resistance
├── Champion departed or lost influence
├── Trust deficit
│   ├── Prior customer experience issue
│   ├── Reference / reputation concerns
│   └── Implementation partner concerns
└── Political dynamics
    ├── Internal organizational politics
    ├── Vendor consolidation pressure
    └── Consultant / advisor influence

Process / Execution
├── Sales process failure
│   ├── Qualification failure (deal should not have been pursued)
│   ├── Discovery incomplete
│   ├── Proposal quality issues
│   └── Negotiation missteps
├── Resource constraint
│   ├── Insufficient SE/AE time allocated
│   ├── Executive sponsor unavailable
│   └── Legal/contracting bottleneck
└── Internal coordination
    ├── Cross-functional misalignment
    ├── Handoff failure (SDR to AE, AE to CSM)
    └── Support response failure
```

**FR-6.5.3.2**: The taxonomy shall be **configurable** — administrators can add, modify, or remove categories to match the organization's specific loss landscape.

**FR-6.5.3.3**: The taxonomy explorer shall render as an **expandable tree** with each node showing:
- Category name
- Loss count and value in the selected period
- Trend indicator
- Percentage of total losses

**FR-6.5.3.4**: Clicking any taxonomy node shall display all deals attributed to that reason with their autopsy details.

**FR-6.5.3.5**: The system shall use the taxonomy to enable **root cause aggregation** — grouping superficially different loss reasons that share common underlying causes.

#### 6.5.4 "What-If" Loss Prevention Modeler

**FR-6.5.4.1**: The system shall provide a **what-if analysis tool** that models the estimated revenue impact of addressing specific loss causes.

**FR-6.5.4.2**: The modeler shall allow users to specify hypothetical improvements:
- "If we reduce product-gap-related losses by 30%"
- "If we improve win rate against Competitor X from 20% to 35%"
- "If we engage economic buyers in 90% of enterprise deals (vs. current 60%)"
- "If we reduce average sales cycle by 15 days"

**FR-6.5.4.3**: For each scenario, the system shall compute:
- Estimated deals saved per period
- Estimated revenue preserved
- Total pipeline impact (saved deals return to pipeline for future conversion)
- Confidence interval based on the strength of the underlying loss pattern data

**FR-6.5.4.4**: The modeler shall present results as a **waterfall chart** showing baseline losses → intervention impact → projected losses, with each intervention as a separate step.

**FR-6.5.4.5**: The modeler shall include a **prioritization matrix** that ranks all possible interventions by:
- Revenue impact (estimated revenue preserved)
- Feasibility (estimated effort and time to implement)
- Confidence (strength of the underlying data supporting this intervention)

The matrix shall render as a **2×2 scatter plot** with revenue impact on the Y-axis and feasibility on the X-axis, enabling quick identification of high-impact, high-feasibility opportunities.

#### 6.5.5 Revenue Impact Calculator

**FR-6.5.5.1**: The system shall compute **cumulative revenue impact** of loss patterns over configurable time periods.

**FR-6.5.5.2**: Impact metrics shall include:

| Metric | Definition |
|--------|-----------|
| **Direct revenue lost** | Total ACV of deals matching the pattern |
| **Estimated lifetime value lost** | Direct loss × expected customer lifetime (if renewal/expansion data available) |
| **Pipeline cost of loss** | The pipeline generation investment required to replace lost deals (generation cost × loss value / win rate) |
| **Opportunity cost** | The estimated revenue if the lost deals had been won, accounting for implementation and expansion potential |
| **Cascading impact** | The estimated downstream impact on referrals, references, and market position |

**FR-6.5.5.3**: Impact shall be calculated per loss pattern, per loss category, per competitor, per product, per team, and per segment.

**FR-6.5.5.4**: The calculator shall render as a **summary dashboard** with a total impact figure prominently displayed and a drillable breakdown by dimension.

---

### 6.6 Behavioral and Process Analysis

#### 6.6.1 Seller Behavioral Loss Patterns

**FR-6.6.1.1**: The system shall analyze the relationship between **seller behaviors** and loss outcomes, identifying behavioral patterns that statistically correlate with higher loss rates.

**FR-6.6.1.2**: Behavioral dimensions to analyze:

| Behavioral Dimension | Data Source | Analysis |
|---------------------|-------------|----------|
| **Discovery depth** | Number and quality of discovery activities before proposal | Correlation with loss rate; optimal discovery activity threshold |
| **Stakeholder breadth** | Number of distinct contacts engaged | Loss rate by stakeholder count tier |
| **Multi-threading depth** | Engagement across buying roles (economic buyer, technical evaluator, user, procurement) | Loss rate by multi-threading completeness |
| **Communication cadence** | Frequency and recency of customer-facing communications | Correlation between communication gaps and losses |
| **Executive engagement** | Involvement of our executives in the deal | Loss rate differential with/without executive engagement |
| **Demo/POC effectiveness** | Number of demos, POC outcome, customer satisfaction with evaluation | Loss rate by evaluation outcome |
| **Proposal iteration count** | Number of proposal revisions | Correlation with loss (too many revisions may signal misalignment) |
| **Negotiation pattern** | Discount trajectory, concession timing, pricing discussion frequency | Correlation between negotiation behaviors and outcomes |
| **Response time** | Speed of responding to customer requests and objections | Correlation between response latency and losses |
| **Internal collaboration** | Engagement with SE, management, product team | Loss rate by level of internal collaboration |

**FR-6.6.1.3**: For each behavioral dimension, the system shall compute:
- The **optimal behavioral range** (the behavior levels associated with the highest win rates)
- The **loss threshold** (the behavior level below which loss rates increase significantly)
- **Individual seller positioning** (where each seller falls relative to the optimal range)
- **Team-wide distribution** (the spread of behaviors across the team)

**FR-6.6.1.4**: Behavioral analysis shall be visualized as a **radar chart per team member** showing their behavioral profile against the optimal profile, with deviations highlighted.

**FR-6.6.1.5**: The system shall detect **behavioral anti-patterns** — specific combinations of behaviors that are strongly associated with loss:

| Anti-Pattern | Description | Detection Logic |
|-------------|-------------|-----------------|
| **The Lone Wolf** | Seller operates in isolation without internal collaboration | SE engagement < threshold AND management engagement = 0 AND loss rate > 2x baseline |
| **The Discount Diver** | Seller defaults to price reduction to advance deals | Average discount > 25% AND proposal iteration > 3 AND loss rate to "price" category > 30% |
| **The Single Thread** | Seller engages only one contact | Stakeholder count = 1 in deals > $50K AND loss rate > 2x baseline |
| **The Late Engager** | Executive sponsor brought in too late | Executive engagement in Stage 4+ only AND late-stage loss rate > 2x baseline |
| **The Quantity Player** | High deal volume but low investment per deal | Deal count > 1.5x team median AND average discovery activities < 3 AND loss rate > 2x baseline |
| **The Proposal Premature** | Proposal sent before qualification is complete | Proposal in Stage 1-2 AND loss rate > 2x baseline for those deals |

**FR-6.6.1.6**: Each detected anti-pattern shall generate a **coaching recommendation** with:
- Anti-pattern name and description
- Affected team members
- Specific deals exhibiting the pattern
- Recommended coaching actions
- Expected impact of correction (based on historical data)

#### 6.6.2 Process Failure Analysis

**FR-6.6.2.1**: The system shall analyze **process failures** — breakdowns in the defined sales process that correlate with loss outcomes.

**FR-6.6.2.2**: Process failure types to detect:

| Failure Type | Detection Method |
|-------------|-----------------|
| **Qualification failure** | Deals that were lost but should never have entered the pipeline (e.g., ICP mismatch, no budget, no authority) |
| **Discovery gap** | Deals where discovery activities were significantly below the defined minimum |
| **Stage skip** | Deals that advanced past required stages without completing mandatory activities |
| **Stakeholder bypass** | Deals that reached late stages without economic buyer engagement |
| **Evaluation failure** | Deals where POC/demo was not conducted or failed |
| **Proposal premature** | Deals where proposal was delivered before customer was properly qualified |
| **Negotiation failure** | Deals where commercial negotiation stalled or was mishandled |
| **Handoff failure** | Deals where internal handoffs (SDR→AE, AE→SE, AE→CSM) introduced delays or dropped context |

**FR-6.6.2.3**: For each failure type, the system shall compute:
- Frequency of occurrence in lost deals vs. won deals
- Revenue impact (total value of lost deals exhibiting this failure)
- Correlation with specific stages, segments, and team members
- Trend over time (is this failure becoming more or less common?)

**FR-6.6.2.4**: Process failures shall be displayed as a **failure Pareto chart** — a bar chart ordered by revenue impact with a cumulative line, enabling identification of the vital few failures that account for the majority of process-related losses.

#### 6.6.3 Stakeholder Engagement Gap Analysis

**FR-6.6.3.1**: The system shall provide dedicated analysis of **stakeholder engagement gaps** — the specific buying roles that were not adequately engaged in lost deals.

**FR-6.6.3.2**: The analysis shall compute for each buying role:
- Engagement rate in lost deals vs. won deals
- Loss rate differential when the role was engaged vs. not engaged
- Optimal engagement timing (at which stage should this role be engaged for maximum impact?)

**FR-6.6.3.3**: Buying roles to track:

| Role | Definition |
|------|-----------|
| **Economic Buyer** | The person with budget authority and final decision power |
| **Technical Evaluator** | The person assessing technical fit and feasibility |
| **End User Champion** | The person who will use the product day-to-day |
| **Procurement / Legal** | The person managing vendor selection process and contracts |
| **Executive Sponsor** | Senior leader championing the initiative internally |
| **Influencer / Advisor** | Consultants, board members, or other advisors involved in the decision |
| **Blocker** | An individual actively opposing the purchase |

**FR-6.6.3.4**: The gap analysis shall be visualized as a **stacked bar chart** showing:
- Won deals: Engagement rates by role (in emerald)
- Lost deals: Engagement rates by role (in red)
- The gap between won and lost for each role

**FR-6.6.3.5**: The system shall identify the **engagement gap with the highest loss attribution** — the specific role whose non-engagement is most strongly associated with loss — and highlight it as the top coaching priority.

#### 6.6.4 Stage-Specific Loss Profiling

**FR-6.6.4.1**: The system shall create **loss profiles for each pipeline stage** — detailed characterizations of what loss looks like when it occurs at each stage.

**FR-6.6.4.2**: For each stage, the profile shall include:
- Loss count and value in the period
- Primary loss reasons at this stage (top 3)
- Average time-in-stage before loss
- Typical preceding events (what happened in the stage before this one)
- Behavioral characteristics of the seller at the time of loss
- Stakeholder engagement level at time of loss
- Competitive presence at time of loss

**FR-6.6.4.3**: Stage profiles shall be displayed as **expandable cards** arranged in pipeline order, with each card showing key metrics and the top loss driver.

**FR-6.6.4.4**: The system shall identify **critical transition points** — stage transitions where the probability of loss changes most dramatically — and highlight them.

#### 6.6.5 Behavioral Coaching Recommendations

**FR-6.6.5.1**: Based on the behavioral and process analysis, the system shall generate **specific, actionable coaching recommendations** for each team member.

**FR-6.6.5.2**: Recommendations shall be structured as:
- **Observation**: "Your deals with single-threaded stakeholder engagement lose at 72%, compared to the team average of 34% for multi-threaded deals."
- **Impact**: "This pattern affected 8 deals worth $1.2M in the last quarter."
- **Recommendation**: "Engage at least 2 additional stakeholders by Stage 2. Focus on the technical evaluator and end-user champion."
- **Evidence**: "Deals where you achieved 3+ stakeholder engagement had a 55% win rate, consistent with the team's top performers."
- **Resources**: Link to relevant sales playbooks, training materials, or peer examples.

**FR-6.6.5.3**: Recommendations shall be **prioritized** by estimated revenue impact and delivered to the team member's view and their manager's view.

**FR-6.6.5.4**: The system shall track **recommendation adoption and outcome** — did the team member follow the recommendation, and did their loss rate for the affected pattern improve?

---

### 6.7 Product Gap Intelligence

#### 6.7.1 Product Loss Correlation Matrix

**FR-6.7.1.1**: The system shall compute and display the correlation between **product capabilities** and loss outcomes.

**FR-6.7.1.2**: The matrix shall show:
- Rows: Product lines or product capabilities
- Columns: Loss categories
- Cell values: The contribution of each product/capability to each loss category (computed via Shapley attribution)
- Cell color: Diverging scale from low contribution (muted) to high contribution (red)

**FR-6.7.1.3**: The matrix shall highlight cells where product-related losses are **increasing** (trend indicator in red) to distinguish between chronic gaps and emerging vulnerabilities.

#### 6.7.2 Feature Gap Revenue Impact

**FR-6.7.2.1**: The system shall compute the **revenue impact of specific feature gaps** by aggregating across all autopsies where the feature gap was cited.

**FR-6.7.2.2**: For each feature gap, the system shall display:

| Metric | Description |
|--------|------------|
| **Direct loss value** | Total ACV of deals lost citing this feature gap as a factor |
| **Frequency** | Number of deals citing this gap |
| **Competitive exposure** | Which competitors exploit this gap |
| **Segment concentration** | Which customer segments are most affected |
| **Trend** | Is this gap becoming more or less impactful? |
| **Severity distribution** | How critical was this gap to the customer's decision (from severity slider in autopsy) |

**FR-6.7.2.3**: Feature gaps shall be ranked by **total revenue impact** and displayed as a **Pareto chart** with cumulative line.

**FR-6.7.2.4**: Each feature gap entry shall be clickable, navigating to the list of deals lost due to that gap with full autopsy details.

#### 6.7.3 Product Loss Trend Analysis

**FR-6.7.3.1**: The system shall track **product-related loss trends** over time, showing:
- Product-related loss rate trend (line chart)
- Feature gap frequency trend (stacked area chart, one layer per feature gap)
- Competitor product advantage trend (which competitors are gaining product-related wins against us)

**FR-6.7.3.2**: The system shall detect **product loss inflection points** — moments where product-related losses changed significantly — and correlate them with known events (product releases, competitor launches, market shifts).

#### 6.7.4 Gap-Prioritization Scorecard

**FR-6.7.4.1**: The system shall generate a **prioritization scorecard** for product teams that ranks feature gaps by a composite score:

```
Priority Score = w₁·RevenueImpact + w₂·Frequency + w₃·Severity + w₄·CompetitiveExposure + w₅·TrendAcceleration
```

**FR-6.7.4.2**: The scorecard shall display for each gap:
- Priority rank
- Composite score
- Component scores with weights
- Revenue impact estimate
- Number of affected deals
- Top competitor exploiting the gap
- Customer quotes from loss narratives (NLP-extracted)

**FR-6.7.4.3**: The scorecard shall be **exportable** as a formatted document suitable for inclusion in product roadmap discussions.

#### 6.7.5 Product Team Feedback Loop

**FR-6.7.5.1**: The system shall implement a **structured feedback loop** between loss analysis and product management.

**FR-6.7.5.2**: The feedback loop shall operate as:

```
Loss Autopsy → Feature Gap Identified → Gap Logged to Product Backlog
→ Product Team Reviews → Status Updated (Accepted / Deferred / Declined)
→ If Accepted: Feature Delivered → Loss Pattern Monitored
→ If Pattern Resolves: Feedback Loop Closed (success documented)
→ If Pattern Persists: Re-evaluation Triggered
```

**FR-6.7.5.3**: Each product gap identified through loss analysis shall have a **status tracking interface** that shows:
- Gap discovery date and source autopsies
- Product team review status and comments
- If accepted: target release version and timeline
- Post-release: loss rate for deals involving this gap (before vs. after fix)

**FR-6.7.5.4**: The system shall compute **feedback loop metrics**:
- Average time from gap identification to product team review
- Average time from gap acceptance to fix delivery
- Percentage of identified gaps accepted by product team
- Loss rate reduction achieved after gap resolution

---

### 6.8 Loss Prevention Engine

#### 6.8.1 Active Deal Loss Risk Scoring

**FR-6.8.1.1**: The system shall compute a **loss risk score** (0-100) for every active deal in the pipeline, based on the degree to which the deal exhibits characteristics of known loss patterns.

**FR-6.8.1.2**: The loss risk score shall be computed by:

```
For each active deal D:
  1. Extract feature vector from D's current state
  2. For each confirmed loss signature S:
     a. Compute match score: proportion of S's conditions met by D
     b. Weight by S's historical confidence and lift
  3. For each temporal precursor sequence P:
     a. Compute sequence similarity between D's event history and P
     b. Weight by P's discriminative power
  4. Combine signature matches and sequence similarities using the ensemble model
  5. Calibrate using Platt scaling on held-out data
  6. Output: Loss Risk Score ∈ [0, 100]
```

**FR-6.8.1.3**: The loss risk score shall be displayed in the Deal Pipeline module alongside the existing win probability score from Pipeline Analytics, creating a complementary pair: Win Probability (what might go right) and Loss Risk (what might go wrong).

**FR-6.8.1.4**: For each deal with an elevated loss risk score (>60), the system shall display the **top 3 loss risk factors** — the specific patterns or precursor sequences that the deal matches — with directional explanation.

**FR-6.8.1.5**: The loss risk score shall be recalculated at each data refresh (minimum daily) as the deal's state evolves.

#### 6.8.2 Early Warning System

**FR-6.8.2.1**: The system shall generate **early warnings** when active deals begin exhibiting loss precursor patterns.

**FR-6.8.2.2**: Warning levels:
- **Watch** (amber): Deal matches 1-2 loss patterns with moderate confidence. Action: Review recommended.
- **Alert** (orange): Deal matches 2-3 loss patterns or a high-confidence precursor sequence. Action: Intervention recommended.
- **Critical** (red): Deal matches 3+ loss patterns or a high-confidence precursor sequence with recent acceleration. Action: Immediate intervention required.

**FR-6.8.2.3**: Warnings shall be delivered through:
- **In-module notification feed** (consistent with anomaly feed pattern)
- **Deal Pipeline module annotation** — the deal's row in pipeline views displays a warning indicator
- **Email digest** (configurable: real-time, daily, weekly) for assigned team member and manager
- **Dashboard widget** on the main EDC dashboard

**FR-6.8.2.4**: Each warning shall include:
- Warning level and timestamp
- Deal name, value, team member, product, stage
- Matched loss patterns with explanations
- Historical outcomes for deals matching these patterns (loss rate, average loss value)
- Recommended intervention actions

#### 6.8.3 Intervention Recommendation Engine

**FR-6.8.3.1**: For each deal flagged with elevated loss risk, the system shall recommend **specific interventions** based on:
- The matched loss patterns and their known remediation strategies
- Historical intervention effectiveness data
- Deal-specific context (stage, stakeholder status, competitive situation)

**FR-6.8.3.2**: Intervention types:

| Intervention Type | Description | Trigger |
|------------------|-------------|---------|
| **Stakeholder expansion** | Engage additional buying roles | Single-threaded detection in deals >$50K |
| **Executive sponsor activation** | Request executive engagement | High-value deal in late stage without executive touch |
| **Technical deep-dive** | Schedule focused technical evaluation session | Product-related objection detected |
| **Competitive counter-strategy** | Activate competitor-specific playbook | Competitor detected with elevated win rate against us |
| **Discovery re-engagement** | Return to discovery to address gaps | Insufficient discovery activities detected |
| **Deal review escalation** | Escalate to management for deal review | Multiple high-risk patterns detected simultaneously |
| **Pricing strategy adjustment** | Re-evaluate pricing approach | Price-related pattern detected with competitive pressure |
| **Champion coaching** | Help champion build internal consensus | Champion effectiveness score declining |
| **Timeline re-evaluation** | Reassess close date and expectations | Deal exhibiting temporal misalignment signals |
| **Disqualification recommendation** | Recommend removing deal from active pipeline | Deal matching "unwinnable" pattern signatures |

**FR-6.8.3.3**: Each recommendation shall include:
- Intervention description and specific steps
- Expected impact (historical win rate improvement for deals receiving this intervention)
- Required resources (time, personnel, materials)
- Urgency level (based on deal stage and risk trajectory)
- Link to relevant playbook or template

**FR-6.8.3.4**: Recommendations shall be **prioritized** by the expected marginal impact on win probability.

#### 6.8.4 Playbook Suggestion Generator

**FR-6.8.4.1**: Based on loss pattern analysis, the system shall identify **gaps in the existing sales playbook library** — loss patterns for which no current playbook exists.

**FR-6.8.4.2**: For each playbook gap, the system shall suggest:
- **Playbook name** and scope
- **Target scenario** (the loss pattern the playbook should address)
- **Key elements** based on what successful deals (that avoided the pattern) did differently
- **Evidence base** from loss and win data supporting the playbook's approach

**FR-6.8.4.3**: Suggested playbooks shall be routed to sales enablement for development, with a feedback loop tracking whether the playbook, once created, reduces the frequency of the targeted loss pattern.

#### 6.8.5 Prevention Effectiveness Tracker

**FR-6.8.5.1**: The system shall track the **effectiveness of all loss prevention interventions** to build an evidence base for what works.

**FR-6.8.5.2**: For each intervention type, the system shall compute:

| Metric | Definition |
|--------|-----------|
| **Adoption rate** | Percentage of recommended interventions that were acted upon |
| **Win rate differential** | Win rate of deals receiving intervention vs. matched control group |
| **Revenue impact** | Estimated revenue preserved by successful interventions |
| **Time-to-effect** | How quickly after intervention does win probability improve? |
| **False positive rate** | Percentage of interventions applied to deals that would have won anyway |

**FR-6.8.5.3**: Intervention effectiveness shall be measured using **quasi-experimental methods** — matching intervention deals with similar non-intervention deals (propensity score matching) to estimate the causal effect.

**FR-6.8.5.4**: The tracker shall render as a **table** with intervention types as rows and effectiveness metrics as columns, sortable by any column. An **effectiveness score** (0-100) shall be computed as a weighted composite and used to prioritize future recommendations.

---

### 6.9 Organizational Learning

#### 6.9.1 Loss Knowledge Base

**FR-6.9.1.1**: The system shall maintain a **searchable loss knowledge base** that aggregates institutional knowledge from all autopsies into accessible, queryable form.

**FR-6.9.1.2**: The knowledge base shall support:
- **Natural language queries**: "What are the main reasons we lose enterprise healthcare deals to CloudBridge?"
- **Faceted search**: Filter by any combination of loss dimensions
- **Similarity search**: "Find losses similar to this deal"
- **Trend queries**: "How have our product-related losses changed over the last 4 quarters?"

**FR-6.9.1.3**: Knowledge base entries shall be automatically **synthesized** from individual autopsies using NLP, grouping related insights and eliminating redundancy.

**FR-6.9.1.4**: The knowledge base shall include a **"lessons learned"** section per loss pattern, aggregating retrospective assessments and manager observations into actionable institutional knowledge.

#### 6.9.2 Lessons Learned Repository

**FR-6.9.2.1**: The system shall maintain a structured repository of **lessons learned** from loss analysis, organized by:
- Loss category
- Product line
- Competitor
- Sales stage
- Team / region

**FR-6.9.2.2**: Each lesson shall include:
- The loss pattern that generated the lesson
- The specific insight or recommendation
- Supporting evidence (data and deal examples)
- Status: New → Reviewed → Incorporated into Playbook → Verified Effective
- Author and review date

**FR-6.9.2.3**: Lessons shall be **peer-reviewable** — team members can validate or challenge lessons based on their experience, creating a collaborative knowledge-building process.

#### 6.9.3 Sales Playbook Gap Analysis

**FR-6.9.3.1**: The system shall analyze the gap between **loss patterns that require playbook coverage** and the **existing playbook library**.

**FR-6.9.3.2**: The gap analysis shall display:
- A list of all confirmed loss patterns
- For each pattern: whether a playbook exists, its last update date, and its measured effectiveness
- Playbook coverage score (percentage of high-impact patterns with active playbooks)
- Priority-ranked list of playbook gaps by revenue impact

#### 6.9.4 Training Need Identification

**FR-6.9.4.1**: The system shall translate loss pattern analysis into **specific training needs** for the sales organization.

**FR-6.9.4.2**: Training needs shall be identified by:
- **Behavioral anti-patterns** → Skills training (discovery, negotiation, stakeholder management)
- **Process failures** → Process training (sales methodology, qualification frameworks)
- **Product gaps** → Product training (feature knowledge, competitive positioning)
- **Competitive losses** → Competitive training (battlecards, objection handling)

**FR-6.9.4.3**: Training needs shall be prioritized by:
- Revenue impact of the associated loss pattern
- Breadth of the skill gap (how many team members affected)
- Trainability (can the gap be addressed through training vs. requiring structural change?)

**FR-6.9.4.4**: The system shall generate a **quarterly training needs report** with:
- Top 5 training priorities ranked by revenue impact
- Specific skill gaps with supporting data
- Recommended training format (workshop, coaching, e-learning, peer learning)
- Expected impact of training (estimated loss rate reduction)

#### 6.9.5 Quarterly Loss Intelligence Report

**FR-6.9.5.1**: The system shall generate a **quarterly loss intelligence report** that synthesizes all module findings into a comprehensive, executive-ready document.

**FR-6.9.5.2**: Report structure:

```
Quarterly Loss Intelligence Report
├── Executive Summary
│   ├── Loss Pulse Score and Trend
│   ├── Total Revenue Lost vs. Prior Quarter
│   ├── Top 3 Loss Patterns by Impact
│   ├── Most Significant Changes from Prior Quarter
│   └── Top 3 Recommended Actions
├── Loss Volume Analysis
│   ├── Loss Count and Value by Category
│   ├── Loss Rate Trend
│   ├── Segment-Level Loss Analysis
│   └── Preventable Loss Estimate
├── Pattern Analysis
│   ├── Active Loss Patterns (Confirmed)
│   ├── Newly Discovered Patterns (Emerging)
│   ├── Resolved Patterns (from prior interventions)
│   └── Pattern Confidence Tracker
├── Competitive Intelligence
│   ├── Competitor Loss Summary
│   ├── Win/Loss Rate Trends by Competitor
│   ├── Counter-Strategy Recommendations
│   └── Competitive Market Shifts
├── Product Gap Analysis
│   ├── Top Feature Gaps by Revenue Impact
│   ├── Product Gap Trend Analysis
│   └── Product Team Feedback Loop Status
├── Behavioral & Process Analysis
│   ├── Team Behavioral Loss Patterns
│   ├── Process Failure Summary
│   └── Coaching Recommendations
├── Prevention Effectiveness
│   ├── Interventions Deployed
│   ├── Measured Outcomes
│   └── ROI of Prevention Efforts
├── Organizational Learning
│   ├── New Lessons Learned
│   ├── Playbook Gaps Identified
│   └── Training Recommendations
└── Outlook
    ├── Projected Losses Next Quarter
    ├── Key Risk Factors
    └── Recommended Strategic Priorities
```

**FR-6.9.5.3**: The report shall be **auto-generated** from module data with executive summary narrative produced by AI and reviewed by the module owner.

**FR-6.9.5.4**: The report shall be exportable as PDF and shall include data visualizations consistent with the application's design system.

---

## 7. Non-Functional Requirements

### 7.1 Performance

| Requirement | Specification |
|-------------|---------------|
| **NFR-7.1.1**: Loss Dashboard load | ≤ 2 seconds for portfolios up to 5,000 closed-lost deals in the analysis window |
| **NFR-7.1.2**: Autopsy form load | ≤ 1 second with pre-populated fields |
| **NFR-7.1.3**: Pattern detection batch run | ≤ 5 minutes for full association rule mining on 5,000 deals × 50 features |
| **NFR-7.1.4**: Loss risk score computation | ≤ 200ms per deal for real-time scoring |
| **NFR-7.1.5**: Temporal sequence mining | ≤ 3 minutes for full PrefixSpan run on 5,000 deal timelines |
| **NFR-7.1.6**: Similarity search | ≤ 500ms for nearest-neighbor query against full loss library |
| **NFR-7.1.7**: NLP processing of loss narratives | ≤ 10 seconds per autopsy for topic extraction and sentiment analysis |
| **NFR-7.1.8**: Quarterly report generation | ≤ 60 seconds for full report compilation |

### 7.2 Data Requirements

**NFR-7.2.1**: The system requires a minimum of **6 months of closed-loss data** with completed autopsies for meaningful pattern detection.

**NFR-7.2.2**: Pattern detection requires a minimum of **200 completed autopsies** with structured data for association rule mining to produce statistically valid results.

**NFR-7.2.3**: Temporal sequence mining requires a minimum of **100 deals** with complete event timelines.

**NFR-7.2.4**: NLP-based analysis requires a minimum of **50 loss narratives** per competitor for meaningful competitive intelligence extraction.

### 7.3 Scalability

**NFR-7.3.1**: The module shall support up to **20,000 closed-loss records**, **500 team members**, and **100 competitors** without performance degradation.

**NFR-7.3.2**: Pattern detection shall support incremental computation — new autopsies incorporated without full recomputation.

### 7.4 Data Quality

**NFR-7.4.1**: The system shall compute and display an **autopsy quality score** for each completed autopsy based on:
- Field completeness (percentage of optional fields completed)
- Narrative quality (length, specificity, actionability)
- Timeline completeness (number of events captured)
- Confidence level (self-reported by the reviewer)

**NFR-7.4.2**: Autopsy quality scores shall be tracked by team member and used as a coaching indicator — low quality scores suggest the reviewer needs guidance on effective post-mortem analysis.

### 7.5 Privacy and Access Control

**NFR-7.5.1**: Individual seller behavioral loss patterns (Section 6.6.1) shall be visible only to the seller's direct management chain.

**NFR-7.5.2**: Manager assessments in the autopsy form (Section 6.2.1, field 8.6) shall be visible only to the assessing manager and above.

**NFR-7.5.3**: Competitive intelligence data shall follow the existing EDC security model with additional controls for sensitive pricing information.

---

## 8. Data Model

### 8.1 Core Entities

```
LossAutopsy
├── autopsy_id: UUID
├── deal_id: UUID (FK → Deal)
├── status: ENUM [draft, in_progress, completed, reviewed, archived]
├── quality_score: INTEGER [0, 100]
├── created_by: UUID (team_member_id)
├── created_at: TIMESTAMP
├── completed_at: TIMESTAMP (nullable)
├── reviewed_by: UUID (nullable — manager review)
├── reviewed_at: TIMESTAMP (nullable)

├── // Outcome Classification
├── final_outcome: ENUM [won_competitor, lost_no_decision, disqualified, abandoned, no_decision]
├── loss_date: DATE
├── confirmed_by: UUID (team_member_id)
├── win_back_potential: INTEGER [0, 100] (nullable)
├── win_back_timeline: ENUM [immediate, short_term, long_term, none] (nullable)

├── // Primary Loss Driver
├── primary_loss_category: ENUM [price, product, competitive, timing, relationship, process]
├── loss_subcategory: STRING
├── loss_narrative: TEXT
├── causal_chain: JSON (array of {level, question, answer})

├── // Competitive Intelligence
├── competitors_involved: JSON (array of competitor_ids)
├── winning_competitor: UUID (FK → Competitor, nullable)
├── competitor_strengths: JSON (array of tags)
├── competitor_weaknesses: JSON (array of tags)
├── competitive_differentiation_gaps: TEXT
├── competitor_pricing_intel: JSON
├── customer_evaluation_criteria: JSON (array of {criterion, weight})

├── // Timeline
├── key_events: JSON (array of {timestamp, event_type, description, stage})
├── first_risk_signal: JSON ({timestamp, event_type, description})
├── missed_intervention_points: JSON (array of {timestamp, suggested_action})
├── final_decision_trigger: TEXT

├── // Stakeholder
├── decision_maker_engaged: BOOLEAN
├── champion_identified: BOOLEAN
├── champion_effectiveness: INTEGER [0, 100] (nullable)
├── stakeholder_map_completeness: FLOAT [0, 1]
├── stakeholder_changes: JSON (nullable)
├── stakeholder_sentiment_trajectory: ENUM [improving, stable, deteriorating]

├── // Product
├── products_involved: JSON (array of product_ids)
├── product_gaps_identified: JSON (array of {gap_id, description, severity})
├── poc_outcome: ENUM [successful, partial, failed, not_conducted] (nullable)
├── technical_objections_unresolved: TEXT

├── // Process
├── process_adherence_score: INTEGER [0, 100]
├── stage_quality_deteriorated: UUID (stage_id, nullable)
├── activities_not_completed: JSON (array of activity_ids)
├── discount_offered_pct: FLOAT (nullable)
├── discount_impact_assessment: ENUM [positive, neutral, negative] (nullable)

├── // Retrospective
├── should_not_have_been_pursued: BOOLEAN
├── should_not_pursued_reason: TEXT (nullable)
├── what_would_do_differently: TEXT
├── support_needed: JSON (array of support types)
├── manager_assessment: TEXT (nullable)
├── confidence_level: INTEGER [0, 100]

└── // AI-Generated
├── ai_suggested_category: STRING (nullable)
├── ai_generated_narrative_draft: TEXT (nullable)
├── ai_detected_intervention_points: JSON (nullable)
├── ai_similarity_deals: JSON (array of deal_ids with similarity scores)

LossPattern
├── pattern_id: UUID
├── pattern_type: ENUM [signature, temporal_sequence, behavioral, process, competitive, product]
├── name: STRING
├── description: TEXT
├── lifecycle_stage: ENUM [emerging, confirmed, monitored, resolved, archived]
├── discovery_date: DATE
├── confidence_level: ENUM [low, medium, high]
├── statistical_metrics: JSON ({support, confidence, lift, p_value})
├── rule_definition: JSON (conjunction rule or sequence definition)
├── revenue_impact_current_period: DECIMAL
├── frequency_current_period: INTEGER
├── trend: ENUM [increasing, stable, decreasing]
├── affected_segments: JSON
├── recommended_interventions: JSON (array of intervention descriptions)
├── validation_history: JSON (array of {period, validated, metrics})
├── intervention_history: JSON (array of {date, intervention, outcome})
└── related_autopsies: JSON (array of autopsy_ids)

CompetitorProfile
├── competitor_id: UUID
├── name: STRING
├── encounter_rate: FLOAT
├── win_rate_against: FLOAT
├── win_rate_trend: ENUM [improving, stable, declining]
├── total_loss_value: DECIMAL
├── observed_strengths: JSON (array of {strength, frequency, evidence})
├── observed_weaknesses: JSON (array of {weakness, frequency, evidence})
├── pricing_intelligence: JSON
├── segment_strengths: JSON (segment_id → encounter_rate)
├── product_impact: JSON (product_id → loss_count)
├── inferred_playbook: JSON
├── counter_strategies: JSON (array of strategy_ids)
└── last_updated: TIMESTAMP

PreventionIntervention
├── intervention_id: UUID
├── deal_id: UUID (FK → Deal)
├── pattern_id: UUID (FK → LossPattern)
├── intervention_type: STRING
├── recommendation: TEXT
├── recommended_at: TIMESTAMP
├── adopted: BOOLEAN
├── adopted_at: TIMESTAMP (nullable)
├── adopted_by: UUID (team_member_id, nullable)
├── deal_outcome: ENUM [won, lost, active] (nullable)
├── win_probability_before: FLOAT
├── win_probability_after: FLOAT (nullable)
├── estimated_impact: DECIMAL
└── actual_impact: DECIMAL (nullable)

FeedbackLoopEntry
├── feedback_id: UUID
├── source_autopsy_ids: JSON (array of autopsy_ids)
├── gap_type: ENUM [product_feature, process, training, playbook, competitive]
├── gap_description: TEXT
├── revenue_impact: DECIMAL
├── target_team: STRING (product, sales_enablement, competitive_intel, process)
├── status: ENUM [submitted, reviewed, accepted, in_progress, completed, declined]
├── submitted_at: TIMESTAMP
├── reviewed_at: TIMESTAMP (nullable)
├── reviewed_by: UUID (nullable)
├── completed_at: TIMESTAMP (nullable)
├── resolution_notes: TEXT (nullable)
├── effectiveness_verified: BOOLEAN (nullable)
└── post_resolution_metrics: JSON (nullable)

TrainingNeed
├── need_id: UUID
├── source_patterns: JSON (array of pattern_ids)
├── skill_area: STRING
├── description: TEXT
├── revenue_impact: DECIMAL
├── team_members_affected: JSON (array of team_member_ids)
├── priority_rank: INTEGER
├── recommended_format: ENUM [workshop, coaching, e_learning, peer_learning, playbook]
├── status: ENUM [identified, planned, delivered, verified]
└── estimated_impact: FLOAT (loss rate reduction estimate)
```

### 8.2 Data Pipeline Architecture

```
┌──────────────────────┐     ┌──────────────────────┐     ┌──────────────────────┐
│  CRM / Deal Pipeline │     │  Activity System     │     │  Communication       │
│  (Deal outcomes,     │     │  (Meetings, calls,   │     │  System              │
│   stage transitions) │     │   emails, tasks)     │     │  (Emails, chat)      │
└──────────┬───────────┘     └──────────┬───────────┘     └──────────┬───────────┘
           │                            │                            │
           ▼                            ▼                            ▼
┌─────────────────────────────────────────────────────────────────────────────────┐
│                      Event Ingestion Layer                                      │
│  - Deal closed-lost events                                                     │
│  - Stage transition history                                                    │
│  - Activity timeline                                                           │
│  - Stakeholder changes                                                         │
│  - Value/discount changes                                                      │
└───────────────────────────────────┬─────────────────────────────────────────────┘
                                    │
                    ┌───────────────┼───────────────┐
                    ▼               ▼                ▼
          ┌──────────────┐ ┌──────────────┐ ┌──────────────┐
          │ Autopsy       │ │ Pattern       │ │ Prevention    │
          │ Queue Manager │ │ Recognition   │ │ Engine        │
          │               │ │ Engine        │ │               │
          │ - Queue       │ │ - Association │ │ - Risk        │
          │   generation  │ │   rules       │ │   scoring     │
          │ - SLA         │ │ - Sequence    │ │ - Warning     │
          │   tracking    │ │   mining      │ │   generation  │
          │ - AI pre-fill │ │ - Clustering  │ │ - Recommend-  │
          │               │ │ - NLP         │ │   ation       │
          └──────┬───────┘ └──────┬───────┘ └──────┬───────┘
                 │                │                 │
                 ▼                ▼                 ▼
          ┌──────────────┐ ┌──────────────┐ ┌──────────────┐
          │ Autopsy       │ │ Pattern       │ │ Prevention    │
          │ Store         │ │ Store         │ │ Tracker       │
          │ (PostgreSQL)  │ │ (PostgreSQL)  │ │ (PostgreSQL)  │
          └──────┬───────┘ └──────┬───────┘ └──────┬───────┘
                 │                │                 │
                 └────────────────┼─────────────────┘
                                  │
                    ┌─────────────┼─────────────┐
                    ▼             ▼              ▼
          ┌──────────────┐ ┌──────────┐ ┌──────────────┐
          │ Knowledge     │ │ Feedback │ │ Report       │
          │ Base          │ │ Loop     │ │ Generator    │
          │ (Search +     │ │ Manager  │ │              │
          │  NLP index)   │ │          │ │              │
          └──────┬───────┘ └────┬─────┘ └──────┬───────┘
                 │              │               │
                 └──────────────┼───────────────┘
                                │
                                ▼
                    ┌──────────────────────┐
                    │  API Layer           │
                    │  (REST + WebSocket)  │
                    └──────────┬───────────┘
                               │
                               ▼
                    ┌──────────────────────┐
                    │  Visualization Layer │
                    │  (React + D3)        │
                    └──────────────────────┘
```

---

## 9. Technical Architecture

### 9.1 Frontend Architecture

| Layer | Technology | Purpose |
|-------|-----------|---------|
| Framework | React 18+ | Component architecture |
| Styling | Tailwind CSS v4.3.0 | Utility-first styling with existing design tokens |
| UI Primitives | Radix UI | Forms, dialogs, selects, tabs, tooltips, navigation |
| Form Management | React Hook Form + Zod | Autopsy form state management and validation |
| State Management | Zustand + React Query | Local state + server state with caching |
| Visualization | D3.js + Visx | Heatmaps, treemaps, Sankey, network graphs, box plots |
| NLP Integration | API calls to backend NLP service | Topic extraction, sentiment analysis, similarity search |
| Animation | Framer Motion | Page transitions, staggered reveals, notification animations |

### 9.2 Backend Architecture

| Layer | Technology | Purpose |
|-------|-----------|---------|
| API | Python / FastAPI | REST API + WebSocket server |
| Primary DB | PostgreSQL | Autopsy records, patterns, competitor profiles |
| Search Engine | Elasticsearch | Full-text search across loss narratives and knowledge base |
| NLP Pipeline | spaCy + Hugging Face Transformers | Topic extraction, entity recognition, narrative analysis |
| Pattern Mining | Python / mlxtend (Apriori) + custom PrefixSpan | Association rule mining, sequential pattern mining |
| Clustering | scikit-learn + NetworkX | MST computation, hierarchical clustering, t-SNE/UMAP |
| ML Inference | ONNX Runtime | Loss risk scoring |
| Task Queue | Celery + Redis | Background pattern detection, NLP processing, report generation |
| Cache | Redis | API response caching, real-time score serving |

### 9.3 Component Architecture

```
<ClosedLostAutopsyModule>
├── <LossDashboardPage>
│   ├── <LossPulseGauge>                ← Radial gauge (shared design with Pipeline Analytics)
│   ├── <LossVolumeTracker>             ← Card grid with sparklines
│   ├── <LossRateDecomposition>         ← Shapley waterfall chart
│   ├── <TopLossPatterns>               ← Ranked pattern card list
│   └── <LossForecast>                  ← Fan chart
├── <AutopsyWorkbenchPage>
│   ├── <AutopsyForm>                   ← Multi-section progressive form
│   │   ├── <OutcomeClassification>
│   │   ├── <PrimaryLossDriver>
│   │   │   └── <FiveWhysGuidedDrill>
│   │   ├── <CompetitiveIntelligence>
│   │   ├── <TimelineReconstruction>
│   │   │   └── <TimelineEventBuilder>
│   │   ├── <StakeholderAnalysis>
│   │   ├── <ProductAssessment>
│   │   ├── <ProcessAssessment>
│   │   └── <RetrospectiveAssessment>
│   ├── <AutopsyQueue>                  ← Prioritized queue table
│   ├── <AutopsyLibrary>                ← Searchable card grid
│   └── <BulkAutopsySession>            ← Grouped review interface
├── <PatternRecognitionPage>
│   ├── <SignatureDetector>             ← Ranked signature list
│   ├── <TemporalChainAnalyzer>         ← Sequence diagram visualization
│   ├── <LossClusterViz>               ← MST + t-SNE network graphs
│   ├── <EmergingPatternAlerts>         ← Notification feed
│   └── <PatternConfidenceTracker>      ← Timeline lifecycle view
├── <CompetitiveIntelligencePage>
│   ├── <CompetitorLossDashboard>       ← Per-competitor analysis cards
│   ├── <WinLossMatrix>                 ← Color-coded matrix
│   ├── <CompetitorPlaybookAnalyzer>    ← Structured competitor profiles
│   ├── <DisplacementTimeline>          ← Time-series with annotations
│   └── <CounterStrategyGenerator>      ← Strategy recommendation cards
├── <LossDecompositionPage>
│   ├── <MultiDimBreakdown>             ← Interactive treemap
│   ├── <ShapleyAttribution>            ← Stacked bar chart
│   ├── <LossReasonTaxonomy>            ← Expandable tree
│   ├── <WhatIfModeler>                 ← Scenario controls + waterfall
│   └── <RevenueImpactCalculator>       ← Impact summary dashboard
├── <BehavioralProcessPage>
│   ├── <SellerBehavioralPatterns>      ← Radar charts per team member
│   ├── <ProcessFailureAnalysis>        ← Pareto chart
│   ├── <StakeholderGapAnalysis>        ← Stacked bar comparison
│   ├── <StageSpecificProfiling>        ← Expandable stage cards
│   └── <CoachingRecommendations>       ← Prioritized recommendation cards
├── <ProductGapIntelligencePage>
│   ├── <ProductLossMatrix>             ← Correlation matrix
│   ├── <FeatureGapImpact>              ← Pareto chart
│   ├── <ProductLossTrends>             ← Time-series charts
│   ├── <GapPrioritizationScorecard>    ← Ranked scorecard table
│   └── <ProductFeedbackLoop>           ← Status tracking interface
├── <LossPreventionPage>
│   ├── <ActiveDealRiskScores>          ← Deal list with risk indicators
│   ├── <EarlyWarningFeed>              ← Warning notification feed
│   ├── <InterventionRecommendations>   ← Prioritized recommendation cards
│   ├── <PlaybookGapAnalysis>           ← Gap identification table
│   └── <PreventionEffectiveness>       ← Effectiveness tracking table
└── <OrganizationalLearningPage>
    ├── <LossKnowledgeBase>             ← Search interface with results
    ├── <LessonsLearnedRepo>            ← Structured lesson cards
    ├── <PlaybookGapAnalysis>           ← Coverage matrix
    ├── <TrainingNeeds>                 ← Priority-ranked training list
    └── <QuarterlyReport>               ← Auto-generated report viewer
```

---

## 10. Algorithmic Specifications

### 10.1 Association Rule Mining for Loss Signatures

```python
from mlxtend.frequent_patterns import apriori, association_rules

def discover_loss_signatures(deals, min_support=0.02, min_confidence=0.5, min_lift=2.0):
    """
    Discover loss signatures using association rule mining.
    
    Input: Binary feature matrix where each column is a deal characteristic
    and the target column is "lost" (True/False).
    """
    # Encode deal features as binary transactions
    # Each feature is discretized into categorical bins
    binary_matrix = encode_deals_as_binary(deals)
    
    # Filter to lost deals for pattern discovery
    lost_deals = binary_matrix[binary_matrix['lost'] == True]
    
    # Find frequent itemsets
    frequent_itemsets = apriori(
        lost_deals.drop(columns=['lost']),
        min_support=min_support,
        use_colnames=True
    )
    
    # Generate association rules
    rules = association_rules(
        frequent_itemsets,
        metric="confidence",
        min_threshold=min_confidence
    )
    
    # Filter by lift
    rules = rules[rules['lift'] >= min_lift]
    
    # Validate: Compute the loss rate within the rule's antecedent
    # across ALL deals (not just lost deals) to confirm discriminatory power
    validated_rules = []
    for _, rule in rules.iterrows():
        antecedent_mask = apply_antecedent(binary_matrix, rule['antecedents'])
        loss_rate_in_rule = binary_matrix[antecedent_mask]['lost'].mean()
        baseline_loss_rate = binary_matrix['lost'].mean()
        
        # Statistical test: Is loss rate in rule significantly > baseline?
        z_stat, p_value = proportions_ztest(
            count=loss_rate_in_rule * antecedent_mask.sum(),
            nobs=antecedent_mask.sum(),
            value=baseline_loss_rate,
            alternative='larger'
        )
        
        if p_value < 0.01:  # Significant
            validated_rules.append({
                'conditions': rule['antecedents'],
                'support': rule['support'],
                'confidence': loss_rate_in_rule,
                'lift': loss_rate_in_rule / baseline_loss_rate,
                'p_value': p_value,
                'affected_deals': antecedent_mask.sum(),
                'revenue_impact': deals[antecedent_mask]['value'].sum()
            })
    
    # Check stability: Rule must hold in at least 2 consecutive quarters
    stable_rules = check_temporal_stability(validated_rules, deals, min_periods=2)
    
    return sorted(stable_rules, key=lambda r: r['revenue_impact'], reverse=True)
```

### 10.2 Sequential Pattern Mining for Loss Timelines

```python
from prefixspan import PrefixSpan

def discover_loss_precursor_sequences(loss_timelines, min_support=0.05):
    """
    Discover recurring event sequences that precede loss outcomes.
    
    Input: List of event sequences, where each sequence is a list of
    (event_type, timestamp, context) tuples for a lost deal.
    """
    # Abstract events into symbolic representation
    symbolic_sequences = []
    for timeline in loss_timelines:
        symbols = []
        for event in timeline:
            symbol = abstract_event(event)  # e.g., "STAGE_REGRESSION", 
                                             # "NO_ACTIVITY_14D",
                                             # "COMPETITOR_ENTERED",
                                             # "DISCOUNT_OFFERED"
            symbols.append(symbol)
        symbolic_sequences.append(symbols)
    
    # Run PrefixSpan
    ps = PrefixSpan(symbolic_sequences)
    frequent_sequences = ps.frequent(
        min_support * len(symbolic_sequences)  # PrefixSpan uses absolute count
    )
    
    # Filter for minimum length
    frequent_sequences = [(support, seq) for support, seq in frequent_sequences 
                          if len(seq) >= 3]
    
    # Validate discriminative power:
    # These sequences should appear significantly more in losses than wins
    validated = []
    for support, sequence in frequent_sequences:
        loss_count = count_containing(symbolic_sequences, sequence)
        win_count = count_containing(win_timelines_abstracted, sequence)
        
        loss_rate_in_seq = loss_count / (loss_count + win_count)
        baseline_loss_rate = len(loss_timelines) / total_deals
        
        # Fisher's exact test
        odds_ratio, p_value = fisher_exact([
            [loss_count, win_count],
            [len(loss_timelines) - loss_count, len(win_timelines) - win_count]
        ])
        
        if p_value < 0.05 and loss_rate_in_seq > 2 * baseline_loss_rate:
            validated.append({
                'sequence': sequence,
                'support': support / len(symbolic_sequences),
                'loss_rate': loss_rate_in_seq,
                'discriminative_power': loss_rate_in_seq / baseline_loss_rate,
                'p_value': p_value,
                'intervention_points': identify_intervention_points(sequence)
            })
    
    return sorted(validated, key=lambda v: v['discriminative_power'], reverse=True)
```

### 10.3 MST-Based Loss Clustering

```python
import networkx as nx
import numpy as np
from scipy.spatial.distance import pdist, squareform

def compute_loss_mst(autopsies, feature_weights=None):
    """
    Compute Minimum Spanning Tree of losses based on multi-dimensional similarity.
    """
    # Extract feature vectors from autopsies
    feature_matrix = extract_features(autopsies)
    
    # Compute pairwise distance matrix
    # Using weighted combination of:
    # - Categorical similarity (Jaccard)
    # - Numerical distance (normalized Euclidean)
    # - Sequence similarity (edit distance)
    # - Text similarity (cosine on TF-IDF of loss narratives)
    
    n = len(autopsies)
    distance_matrix = np.zeros((n, n))
    
    for i in range(n):
        for j in range(i+1, n):
            d = composite_distance(
                autopsies[i], autopsies[j],
                weights=feature_weights or DEFAULT_WEIGHTS
            )
            distance_matrix[i][j] = d
            distance_matrix[j][i] = d
    
    # Compute MST using NetworkX
    G = nx.Graph()
    for i in range(n):
        for j in range(i+1, n):
            G.add_edge(i, j, weight=distance_matrix[i][j])
    
    mst = nx.minimum_spanning_tree(G, weight='weight')
    
    # Identify clusters by pruning edges above threshold
    def identify_clusters(threshold):
        pruned = mst.copy()
        edges_to_remove = [(u, v) for u, v, d in pruned.edges(data=True) 
                           if d['weight'] > threshold]
        pruned.remove_edges_from(edges_to_remove)
        
        clusters = list(nx.connected_components(pruned))
        return clusters
    
    # Find optimal threshold using modularity optimization
    best_threshold = optimize_modularity(mst, distance_matrix)
    clusters = identify_clusters(best_threshold)
    
    return {
        'mst': mst,
        'clusters': clusters,
        'optimal_threshold': best_threshold,
        'cluster_profiles': [profile_cluster(c, autopsies) for c in clusters]
    }
```

### 10.4 Loss Risk Scoring for Active Deals

```python
def compute_loss_risk_score(deal, loss_signatures, temporal_precursors, behavioral_anti_patterns):
    """
    Compute loss risk score for an active deal based on pattern matching.
    """
    scores = []
    matched_patterns = []
    
    # 1. Signature matching
    for signature in loss_signatures:
        match_score = compute_conjunction_match(deal, signature['conditions'])
        if match_score > 0.5:  # At least half the conditions match
            weighted_score = match_score * signature['lift'] * signature['confidence']
            scores.append(('signature', weighted_score, signature))
            matched_patterns.append({
                'type': 'signature',
                'pattern': signature,
                'match_score': match_score,
                'explanation': generate_match_explanation(deal, signature)
            })
    
    # 2. Temporal sequence matching
    deal_events = get_deal_event_timeline(deal)
    for precursor in temporal_precursors:
        similarity = compute_sequence_similarity(deal_events, precursor['sequence'])
        if similarity > 0.6:  # Significant sequence match
            weighted_score = similarity * precursor['discriminative_power']
            scores.append(('sequence', weighted_score, precursor))
            matched_patterns.append({
                'type': 'temporal',
                'pattern': precursor,
                'match_score': similarity,
                'explanation': generate_sequence_explanation(deal_events, precursor)
            })
    
    # 3. Behavioral anti-pattern matching
    for anti_pattern in behavioral_anti_patterns:
        behavioral_match = compute_behavioral_match(deal, anti_pattern)
        if behavioral_match > 0.7:
            weighted_score = behavioral_match * anti_pattern['loss_rate_ratio']
            scores.append(('behavioral', weighted_score, anti_pattern))
            matched_patterns.append({
                'type': 'behavioral',
                'pattern': anti_pattern,
                'match_score': behavioral_match,
                'explanation': generate_behavioral_explanation(deal, anti_pattern)
            })
    
    # 4. Combine scores using calibrated ensemble
    if not scores:
        return {'risk_score': 20, 'matched_patterns': [], 'confidence': 'low'}
    
    # Weighted combination with diminishing returns for multiple matches
    combined = 1 - np.prod([1 - min(s[1] / 5, 0.9) for s in scores])
    
    # Apply stage-based calibration (loss risk baseline varies by stage)
    stage_baseline = get_stage_loss_baseline(deal.current_stage)
    calibrated = calibrate_score(combined, stage_baseline)
    
    # Scale to 0-100
    risk_score = int(clamp(calibrated * 100, 0, 100))
    
    # Sort matched patterns by contribution
    matched_patterns.sort(key=lambda p: p['match_score'], reverse=True)
    
    return {
        'risk_score': risk_score,
        'matched_patterns': matched_patterns[:5],  # Top 5
        'confidence': classify_confidence(len(scores), max(s[1] for s in scores)),
        'risk_level': classify_risk_level(risk_score)
    }
```

### 10.5 NLP Pipeline for Loss Narrative Analysis

```python
import spacy
from transformers import pipeline

class LossNarrativeAnalyzer:
    def __init__(self):
        self.nlp = spacy.load("en_core_web_lg")
        self.classifier = pipeline("zero-shot-classification", 
                                    model="facebook/bart-large-mnli")
        self.summarizer = pipeline("summarization")
    
    def analyze_narrative(self, narrative, deal_context):
        """
        Extract structured insights from loss narrative text.
        """
        doc = self.nlp(narrative)
        
        # 1. Entity extraction
        entities = {
            'competitors': [ent.text for ent in doc.ents if ent.label_ == 'ORG'],
            'products': extract_product_mentions(doc, deal_context),
            'people': [ent.text for ent in doc.ents if ent.label_ == 'PERSON'],
            'features': extract_feature_mentions(doc),
            'objections': extract_objection_phrases(doc)
        }
        
        # 2. Topic classification
        topics = self.classifier(
            narrative,
            candidate_labels=[
                "pricing", "product capability", "competitive pressure",
                "timing and budget", "stakeholder engagement", 
                "technical evaluation", "process failure", "relationship"
            ]
        )
        
        # 3. Sentiment trajectory (sentence-level)
        sentences = list(doc.sents)
        sentiments = [compute_sentiment(sent.text) for sent in sentences]
        
        # 4. Causal indicator extraction
        causal_indicators = extract_causal_language(doc)  
        # "because", "due to", "caused by", "resulted in", etc.
        
        # 5. Competitive intelligence extraction
        competitive_intel = extract_competitive_intelligence(
            doc, entities['competitors']
        )
        
        # 6. Generate structured summary
        summary = self.summarizer(narrative, max_length=100, min_length=30)
        
        return {
            'entities': entities,
            'topics': topics,
            'sentiment_trajectory': sentiments,
            'causal_indicators': causal_indicators,
            'competitive_intelligence': competitive_intel,
            'summary': summary[0]['summary_text']
        }
    
    def compute_similarity(self, narrative_a, narrative_b):
        """
        Compute semantic similarity between two loss narratives.
        """
        doc_a = self.nlp(narrative_a)
        doc_b = self.nlp(narrative_b)
        return doc_a.similarity(doc_b)
```

### 10.6 Quasi-Experimental Intervention Effectiveness

```python
from sklearn.linear_model import LogisticRegression

def estimate_intervention_effect(intervention_deals, all_deals):
    """
    Estimate the causal effect of interventions using propensity score matching.
    """
    # 1. Compute propensity scores (probability of receiving intervention)
    features = extract_propensity_features(all_deals)
    treatment = all_deals['deal_id'].isin(intervention_deals['deal_id'])
    
    propensity_model = LogisticRegression(max_iter=1000)
    propensity_model.fit(features, treatment)
    propensity_scores = propensity_model.predict_proba(features)[:, 1]
    
    # 2. Match intervention deals with non-intervention deals
    matched_controls = []
    for _, treated_deal in intervention_deals.iterrows():
        treated_score = propensity_scores[all_deals['deal_id'] == treated_deal['deal_id']].values[0]
        
        # Find nearest neighbor in control group
        control_mask = ~treatment
        control_scores = propensity_scores[control_mask]
        distances = np.abs(control_scores - treated_score)
        nearest_idx = distances.argmin()
        
        if distances[nearest_idx] < 0.1:  # Caliper: max 0.1 propensity distance
            matched_controls.append(all_deals[control_mask].iloc[nearest_idx])
    
    # 3. Compare outcomes
    intervention_win_rate = intervention_deals['won'].mean()
    control_win_rate = pd.DataFrame(matched_controls)['won'].mean()
    
    effect = intervention_win_rate - control_win_rate
    
    # 4. Statistical test
    z_stat, p_value = proportions_ztest(
        [intervention_deals['won'].sum(), pd.DataFrame(matched_controls)['won'].sum()],
        [len(intervention_deals), len(matched_controls)]
    )
    
    return {
        'intervention_win_rate': intervention_win_rate,
        'control_win_rate': control_win_rate,
        'estimated_effect': effect,
        'effect_size': effect / control_win_rate if control_win_rate > 0 else None,
        'p_value': p_value,
        'confidence_interval': compute_confidence_interval(effect, len(intervention_deals)),
        'n_treated': len(intervention_deals),
        'n_matched': len(matched_controls)
    }
```

---

## 11. User Flows

### 11.1 Primary Flow: Quarterly Loss Review

```
1. VP Sales navigates to Closed-Lost Autopsy → Loss Intelligence Dashboard
2. Loss Pulse shows score: 54 (Orange/Concern), down from 62 last quarter
3. VP examines Loss Rate Decomposition waterfall:
   - Baseline loss rate: 45%
   - Product factors: +8pp (largest contributor)
   - Competitive factors: +5pp
   - Process factors: +3pp
   - Engagement factors: -2pp (improving — coaching program working)
4. VP clicks Product factors → Product Gap Intelligence
5. Feature Gap Revenue Impact Pareto shows:
   - #1: "Real-time data sync API" — $4.2M lost across 18 deals
   - #2: "SOC 2 Type II certification" — $2.8M lost across 12 deals
   - #3: "Custom workflow engine" — $1.9M lost across 8 deals
6. VP clicks #1 → Sees all 18 deals, primary competitor exploiting this gap is CloudBridge
7. VP navigates to Competitive Intelligence → Competitor Playbook Analyzer
8. CloudBridge profile shows: Their real-time API is their #1 cited strength in 65% of our losses against them
9. VP creates Feedback Loop Entry for product team: "Real-time data sync API — $4.2M quarterly revenue impact"
10. VP navigates to Loss Prevention → Prevention Effectiveness Tracker
11. Sees that "Executive Sponsor Activation" interventions had 35% win rate improvement last quarter
12. VP approves expanding executive engagement program to all deals >$200K
```

### 11.2 Secondary Flow: Seller Coaching Based on Behavioral Patterns

```
1. Sales Manager navigates to Behavioral & Process Analysis → Seller Behavioral Patterns
2. Manager selects their team → Radar chart shows each seller's behavioral profile
3. System highlights: A. Thompson exhibits "Single Thread" anti-pattern
   - Stakeholder count in deals >$50K: average 1.3 (team benchmark: 3.1)
   - Loss rate for single-threaded deals: 78% (team average for multi-threaded: 34%)
   - Affected deals in last quarter: 6 deals worth $890K
4. Manager clicks the anti-pattern → Coaching Recommendation appears:
   - Observation, Impact, Recommendation, Evidence, Resources (all structured)
5. Manager clicks "Resources" → Links to "Multi-Threading Playbook" and "Stakeholder Mapping Template"
6. Manager creates a coaching action in the system linked to A. Thompson
7. Manager navigates to Prevention → Active Deal Risk Scores
8. Filters to A. Thompson's active deals → 3 deals flagged with "Single Thread" risk pattern
9. Manager reviews each deal and assigns stakeholder expansion actions
10. System tracks: In 60 days, did A. Thompson's stakeholder engagement improve? Did loss rate decrease?
```

### 11.3 Tertiary Flow: Autopsy Completion

```
1. Deal "Acme Corp — DataSync Pro" is marked Closed-Lost in CRM
2. System generates Autopsy Queue entry with AI pre-populated fields:
   - Deal value: $180K, Stage 4, 67 days in pipeline
   - AI-suggested primary category: Competitive (based on activity signals)
   - Auto-populated timeline: 12 stage transitions, 8 meetings, 23 emails
   - Stakeholder map: 3 contacts identified, economic buyer never engaged directly
3. Assigned AE clicks queue entry → Autopsy Form opens with pre-populated data
4. AE reviews and fills remaining fields:
   - Confirms competitive category → Selects "Lost to CloudBridge"
   - Fills loss narrative: "Customer required real-time API for their data warehouse integration. Our batch processing model did not meet their latency requirements. CloudBridge demonstrated a sub-second sync capability that we could not match."
   - Rates product gap severity: 90/100 for "Real-time data sync"
   - Marks intervention point: "Should have involved product team earlier to explore custom solution"
   - Completes 5 Whys drill-down to root cause: Product capability gap → Not flagged early → No product team engagement → No alternative solution proposed
5. System runs NLP on narrative → Extracts entities (CloudBridge, real-time API, data warehouse)
6. System matches this loss to 2 confirmed signatures and 1 temporal precursor sequence
7. System updates pattern statistics: "Product gap: real-time sync" pattern now at 19 deals, $4.4M
8. If this pattern crosses the threshold for product team notification, system generates alert
```

---

## 12. Integration Points

### 12.1 Pipeline Analytics Integration

| From Closed-Lost Autopsy | To Pipeline Analytics |
|--------------------------|----------------------|
| Loss risk scores | Feed into Pipeline Analytics' win probability ensemble model as an additional feature |
| Loss patterns | Inform the Behavioral Model in Pipeline Analytics' predictive forecast |
| Temporal precursor sequences | Enable the Pipeline Analytics anomaly detector to flag deals matching loss timelines |
| Process compliance data | Enhance Pipeline Analytics' Process Compliance Monitor with loss-outcome correlation |

| From Pipeline Analytics | To Closed-Lost Autopsy |
|------------------------|----------------------|
| Deal velocity data | Pre-populate autopsy form with stage velocity information |
| Activity signals | Pre-populate timeline reconstruction |
| Win probability at time of loss | Inform "should not have been pursued" assessment |
| Forecast accuracy data | Enable analysis of whether loss patterns explain forecast misses |

### 12.2 Portfolio Risk Analysis Integration

| From Closed-Lost Autopsy | To Portfolio Risk Analysis |
|--------------------------|---------------------------|
| Loss patterns by product | Feed into product risk correlation analysis |
| Competitive loss patterns | Enrich competitive risk dimensions |
| Behavioral loss patterns | Enhance team member risk profiles |
| Loss trend data | Inform risk trend timelines |

| From Portfolio Risk Analysis | To Closed-Lost Autopsy |
|-----------------------------|------------------------|
| Correlation clusters | Enable cluster-level loss analysis |
| Risk anomalies | Pre-identify deals for autopsy prioritization |
| Product risk scores | Enrich product gap intelligence |

### 12.3 Shared Data Entities

```
Deal (shared across all modules)
├── Pipeline Analytics fields: stage, velocity, win_probability, forecast_category
├── Portfolio Risk fields: risk_score, cluster_assignment, anomaly_flags
├── Closed-Lost Autopsy fields: loss_risk_score, autopsy_status, loss_pattern_matches
├── Shared fields: deal_id, value, team_member, product, segment, dates, activities
```

---

## 13. Design System Compliance

### 13.1 Color Token Usage

| Semantic Meaning | Token | Application in This Module |
|-----------------|-------|---------------------------|
| Healthy / Improving | `emerald-500` at 5-40% opacity | Low loss risk, improving trends, resolved patterns |
| Moderate / Watch | `amber-500` at 5-40% opacity | Moderate loss risk, stable patterns, watch alerts |
| Elevated / Concern | `orange-500` at 10-40% opacity | Elevated loss risk, accelerating patterns, alert notifications |
| Critical / High | `red-500` / `rose-500` at 10-40% opacity | High loss risk, critical patterns, SLA breaches |
| Informational | `cyan-500` / `indigo-500` | Reference lines, informational badges, help text |
| Primary accent | `--primary` | Active selections, primary actions, links |
| Neutral | `--muted` / `--muted-foreground` | Secondary text, inactive elements, baseline indicators |

### 13.2 Typography

| Element | Style |
|---------|-------|
| Metric values | `font-mono text-3xl font-bold tabular-nums` |
| Metric labels | `text-xs text-muted-foreground uppercase tracking-wider` |
| Pattern names | `text-sm font-semibold text-foreground` |
| Pattern descriptions | `text-sm text-muted-foreground leading-relaxed` |
| Autopsy form labels | `text-sm font-medium text-foreground` |
| Autopsy form help text | `text-xs text-muted-foreground` |
| Loss narratives | `text-sm text-foreground leading-relaxed` |
| Stat annotations | `text-xs font-mono text-muted-foreground` |
| Table headers | `text-xs font-medium text-muted-foreground uppercase` |
| Table cells | `text-sm text-foreground tabular-nums` |

### 13.3 Component Patterns

| Component | Styling |
|-----------|---------|
| Pattern cards | `bg-card border border-border rounded-lg p-4 shadow-sm` with `border-l-4` semantic accent |
| Metric cards | Same as pattern cards |
| Autopsy form sections | `bg-card border border-border rounded-lg p-6` with section title in `text-lg font-semibold` |
| Queue entries | `bg-card border border-border rounded-lg p-3` with hover `hover:bg-muted/30 transition-colors duration-200` |
| Warning notifications | `bg-amber-500/5 border border-amber-500/30 rounded-lg p-3` (amber/orange/red variants) |
| Competitive profile cards | `bg-card border border-border rounded-lg p-6` with competitor avatar/icon |
| Chart containers | `bg-card border border-border rounded-lg p-4` |
| Tooltips | `bg-popover border border-border rounded-lg shadow-lg p-3 text-xs` |

### 13.4 Animation Specifications

| Element | Animation | Duration | Easing |
|---------|-----------|----------|--------|
| Page transition | fade-in + slide-in-from-bottom-4 | 300ms | ease-in-out |
| Loss Pulse gauge | Arc from 0 to score | 800ms | ease-out |
| Metric cards | Staggered fade-in | 200ms each, 100ms stagger | ease-out |
| Pattern cards | Staggered fade-in with scale from 0.98 | 250ms each, 80ms stagger | ease-out |
| Queue entries | Fade-in from left | 200ms | ease-out |
| Warning notifications | slide-in-from-right | 250ms | ease-in-out |
| Autopsy form sections | Expand with height animation | 300ms | ease-in-out |
| Cluster graph nodes | Force-directed settle | Physics-based | spring |
| Treemap rectangles | Scale from 0.9 to 1.0 | 200ms, 30ms stagger | ease-out |
| Waterfall bars | Height from 0 | 400ms, 50ms stagger | ease-out |
| Radar chart paths | Draw animation (stroke-dashoffset) | 600ms | ease-out |
| Knowledge base results | Fade-in list items | 150ms, 50ms stagger | ease-out |

---

## 14. Edge Cases and Error Handling

| Condition | Handling |
|-----------|----------|
| **Deal closed-lost without any activities** | Generate minimal autopsy with "Insufficient engagement" as likely contributing factor; mark as low-confidence; still require loss narrative |
| **Seller leaves organization before completing autopsy** | Reassign to manager; manager completes with available data; flag as "secondhand assessment" with reduced confidence |
| **Loss attributed to multiple competitors** | Support multi-competitor attribution; primary winner field required; secondary competitors tracked as "considered" |
| **Pattern detection with fewer than 200 autopsies** | Use simplified detection (univariate analysis, basic correlation); suppress multivariate patterns; display "data accumulating" indicators |
| **Contradictory loss reasons** (e.g., seller says "timing," manager says "product") | Both perspectives captured; system flags discrepancy for resolution; both feed into pattern analysis separately |
| **Win-back deals** (deals initially lost, later won) | Update autopsy record with win-back data; retract from loss pattern statistics; analyze win-back patterns separately |
| **Bulk loss events** (e.g., budget cut eliminates 20 deals at once) | Support group attribution with shared root cause; prevent inflation of pattern statistics by one-time events; flag as "systemic event" |
| **Loss narratives too brief or generic** | Quality score penalty; prompt for additional detail; AI suggests specific questions based on deal characteristics; manager escalation if quality score < threshold |

---

## 15. Release Plan

### Phase 1: Foundation (Weeks 1-8)

**Autopsy Workbench**:
- Deal Autopsy Form with all sections
- AI-assisted pre-population from CRM data
- Autopsy Queue with SLA tracking
- Autopsy Library with search

**Loss Intelligence Dashboard**:
- Loss Pulse gauge
- Loss Volume & Value Tracker
- Basic Loss Rate Decomposition (non-Shapley, dimension-by-dimension)

**Core Infrastructure**:
- Data model and PostgreSQL schema
- Event ingestion pipeline for closed-lost events
- Basic REST API
- Autopsy quality scoring

### Phase 2: Pattern Recognition (Weeks 9-16)

**Pattern Recognition Engine**:
- Association rule mining for loss signatures
- Loss Signature Detector with ranked list
- Pattern Confidence Tracker with lifecycle stages

**Enhanced Decomposition**:
- Shapley Attribution Analysis
- Loss Reason Taxonomy Explorer
- Multi-Dimensional Loss Breakdown (treemap)

**NLP Pipeline**:
- Loss narrative analysis (entity extraction, topic classification)
- Competitive intelligence extraction from narratives
- Similarity search across autopsies

### Phase 3: Temporal & Behavioral Analysis (Weeks 17-24)

**Temporal Analysis**:
- Temporal Loss Chain Analyzer with sequence diagram visualization
- Sequential pattern mining for loss precursor sequences
- Stage-Specific Loss Profiling

**Behavioral Analysis**:
- Seller Behavioral Loss Patterns with radar charts
- Behavioral anti-pattern detection
- Process Failure Analysis with Pareto chart
- Stakeholder Engagement Gap Analysis
- Behavioral Coaching Recommendations

### Phase 4: Competitive & Product Intelligence (Weeks 25-32)

**Competitive Intelligence**:
- Competitor Loss Dashboard
- Competitive Win/Loss Matrix
- Competitor Playbook Analyzer with NLP
- Displacement Timeline
- Counter-Strategy Generator

**Product Gap Intelligence**:
- Product Loss Correlation Matrix
- Feature Gap Revenue Impact (Pareto)
- Gap-Prioritization Scorecard
- Product Team Feedback Loop

### Phase 5: Prevention & Learning (Weeks 33-40)

**Loss Prevention Engine**:
- Active Deal Loss Risk Scoring
- Early Warning System
- Intervention Recommendation Engine
- Prevention Effectiveness Tracker (with propensity score matching)

**Organizational Learning**:
- Loss Knowledge Base (Elasticsearch-powered)
- Lessons Learned Repository
- Sales Playbook Gap Analysis
- Training Need Identification
- Quarterly Loss Intelligence Report (auto-generated)

**Integration**:
- Cross-module drill-through with Pipeline Analytics and Portfolio Risk Analysis
- Loss risk score feeding into Pipeline Analytics' win probability model
- Pipeline Analytics data pre-populating autopsy forms

### Phase 6: Optimization & Launch (Weeks 41-44)

- Pattern detection performance optimization
- NLP pipeline accuracy validation
- Accessibility audit (WCAG 2.1 AA)
- User acceptance testing
- Documentation and training
- Gradual rollout: 10% → 50% → 100%

---

## 16. Risks and Mitigations

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| **R1**: Low autopsy completion rates — sellers resist structured loss documentation | High | Critical | Make form intelligent (pre-populate 60%+ of fields); implement gamification (quality scores, team leaderboards); tie to performance review process; make form progressively disclosed (start simple) |
| **R2**: Autopsy quality too low for pattern detection — generic narratives, unhelpful loss reasons | High | High | Implement quality scoring with minimum thresholds; AI prompts for specific questions; manager review requirement; show sellers how their data helps the team |
| **R3**: Pattern detection produces false patterns — spurious correlations in small datasets | Medium | High | Require minimum support, confidence, lift, and p-value thresholds; temporal stability check (pattern must hold across ≥2 periods); confidence classification with clear visual indicators |
| **R4**: Privacy concerns — behavioral anti-patterns feel like surveillance | Medium | High | Frame as coaching tool; show team-level patterns before individual; allow self-service access to own patterns; ensure manager-only access for individual behavioral data |
| **R5**: NLP extraction accuracy insufficient for competitive intelligence | Medium | Medium | Use NLP as assist, not replace — all extracted insights presented as suggestions for human confirmation; continuously improve models with user feedback |
| **R6**: Prevention engine creates alert fatigue | Medium | Medium | Implement adaptive thresholds; allow per-user alert configuration; group related warnings; track false positive rates and adjust |
| **R7**: Feedback loops to product/sales enablement not acted upon | Medium | Medium | Track response rates; escalate unresponsive feedback loops to leadership; make feedback loop status visible in executive dashboard |
| **R8**: Pattern analysis used punitively against sellers | Low | Critical | Establish clear usage policy; access controls on individual data; frame all analysis as team improvement; executive sponsorship of constructive culture |

---

## 17. Success Metrics

| Metric | Baseline | Target (6 months) | Measurement |
|--------|----------|-------------------|-------------|
| Autopsy completion rate (deals >$50K) | ~15% (informal) | ≥80% | Completed autopsies / eligible closed-lost deals |
| Autopsy quality score | N/A | ≥70 average | System-computed quality scores |
| Actionable patterns identified | 0 (systematic) | ≥20 per quarter | Confirmed patterns with documented interventions |
| Loss rate improvement | Baseline at launch | ≥5pp reduction in loss rate | Compare pre/post loss rates for pattern-matched segments |
| Prevention intervention adoption | 0% | ≥50% of recommendations acted upon | Tracked adoption in Prevention Effectiveness system |
| Prevention intervention effectiveness | N/A | ≥20% win rate differential (intervention vs. control) | Propensity score matched analysis |
| Product feedback loop response time | ~2 quarters (informal) | ≤30 days average | Time from feedback submission to product team review |
| Pattern-to-action conversion | 0% | ≥50% of patterns result in documented action within 30 days | Tracked action items linked to patterns |
| Competitive intelligence completeness | Anecdotal | Structured profiles for top 10 competitors | Competitor profile completion in the system |
| Forecast accuracy improvement | Baseline at launch | ≥3pp MAPE reduction attributable to loss pattern awareness | Controlled comparison of forecast models with/without loss pattern features |

---

## 18. Open Questions

| # | Question | Owner | Status |
|---|----------|-------|--------|
| OQ-1 | What is the organization's willingness to mandate structured autopsy completion as part of the deal close process? | Sales Leadership | Open |
| OQ-2 | How should the system handle confidential loss information (e.g., losses involving legal disputes or customer complaints)? | Legal + Sales Ops | Open |
| OQ-3 | Should the competitive intelligence extracted from loss narratives be shared with the competitor intelligence team, or remain within the sales organization? | Competitive Intel + Sales | Open |
| OQ-4 | What is the minimum viable dataset size before the NLP pipeline produces reliable competitive intelligence? | Data Science | Open |
| OQ-5 | Should the loss risk score be visible to the customer-facing seller, or only to management? | Sales Leadership + HR | Open |
| OQ-6 | How should the system account for deals where the "loss" is actually a strategic disqualification (we chose not to compete)? | Product + Sales Ops | Open |
| OQ-7 | What level of granularity is needed in the product feature taxonomy for the product gap intelligence to be actionable for product management? | Product Management | Open |
| OQ-8 | Should the module integrate with customer success data to track whether won-then-churned customers were actually losses that should have been predicted? | Customer Success + Sales | Open |

---

*Document Version: 1.0*
*Module: Closed-Lost Autopsy*
*Application: Enterprise Deal Commander*
*PRD Classification: Feature Module — Major*