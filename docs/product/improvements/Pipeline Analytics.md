# Pipeline Analytics Module — Design & Technical Specification

## Enterprise Deal Commander

---

## 1. Module Overview and Strategic Intent

The Pipeline Analytics module transforms the Enterprise Deal Commander from a deal-tracking cockpit into a **pipeline intelligence engine**. While the existing platform manages individual deals and governs risk, this module answers the questions that determine whether a sales organization will meet, miss, or exceed its targets: *Where is pipeline coming from? Where is it stuck? Where is it leaking? What will close, and with what confidence?*

This specification draws on the structural principles established in the Portfolio Risk Analysis PRD — multi-modal data architecture, multi-methodology exploration, network topology, AI-assisted workflows, and real-time continuous monitoring — and applies them specifically to pipeline dynamics.

---

## 2. Problem Statement

### 2.1 The Pipeline Visibility Gap

Enterprise sales organizations invest enormous effort in pipeline management yet suffer from persistent analytical blind spots:

**Structural opacity**: CRM systems report pipeline totals by stage and period, but do not reveal the underlying flow dynamics — the rates at which deals enter, advance, stall, exit, and recycle between stages. A pipeline report showing "$50M in Stage 3" provides no insight into whether that $50M arrived yesterday or has been sitting there for 90 days, whether deals in that stage typically advance or decay, or whether the composition of that stage is structurally healthy or deceptively fragile.

**Forecast unreliability**: Traditional forecasting relies on stage-weighted pipeline values or rep-level commit categories. Both methods fail because they ignore the velocity, age, and behavioral signatures of individual deals. The result is the endemic enterprise sales problem: forecasts that look good until the final two weeks of the quarter, then collapse.

**Segmentation blindness**: Aggregate pipeline metrics mask critical differences across segments. A team may show adequate total pipeline coverage while a specific product line or territory is dangerously uncovered. Without multi-dimensional segmentation, these pockets of weakness remain invisible until they manifest as revenue shortfalls.

**Temporal pattern ignorance**: Pipeline generation and conversion follow temporal patterns — seasonal rhythms, quarter-end acceleration, competitive cycle effects — that, if understood, enable dramatically better planning. Most organizations treat each quarter as independent rather than recognizing and exploiting these patterns.

**Bottleneck accumulation**: Deals do not simply "get stuck" randomly. They accumulate at specific stages due to systemic process issues — insufficient staffing for technical evaluations, slow legal review, misaligned approval thresholds. Without bottleneck analytics that distinguish between healthy stage residence times and pathological stalling, process improvement efforts target symptoms rather than causes.

### 2.2 Business Impact

| Impact Area | Current State | Cost |
|-------------|--------------|------|
| Forecast accuracy | Typical enterprise forecast MAPE: 25-40% | Missed revenue targets, inaccurate guidance, eroded trust |
| Pipeline generation | Reactive — discovered too late when coverage is insufficient | Compressed selling time, desperation discounting |
| Win rate optimization | No visibility into which pipeline characteristics predict wins | Wasted effort on unwinnable deals, under-investment in winnable ones |
| Process improvement | Anecdotal — based on individual manager observations | Recurring bottlenecks, inconsistent process adoption |
| Sales cycle management | Rep-level intuition only | Excess cycle time costing 10-15% annual revenue velocity |

---

## 3. Goals and Objectives

### 3.1 Primary Goals

| ID | Goal | Success Metric |
|----|------|----------------|
| G1 | **Quantify pipeline flow dynamics** — conversion rates, velocities, and exit rates by stage, segment, and time period | Forecast MAPE reduction from ~30% baseline to ≤15% within 6 months |
| G2 | **Detect and diagnose bottlenecks** — distinguish healthy stage residence from pathological stalling, identify root causes | Bottleneck identification accuracy ≥80% validated against manager assessments |
| G3 | **Enable predictive pipeline intelligence** — forecast pipeline outcomes using deal-level behavioral signals rather than stage-weighted heuristics | Predictive win probability AUC ≥0.80 on held-out test data |
| G4 | **Surface pipeline generation patterns** — identify leading indicators of pipeline health before coverage gaps become critical | Pipeline generation risk detected ≥30 days before shortfall, with ≥70% accuracy |
| G5 | **Integrate with Portfolio Risk Analysis** — enable cross-referencing between pipeline dynamics and correlation risk findings | Seamless drill-through from pipeline analytics to risk cluster detail |

### 3.2 Secondary Goals

- Enable scenario modeling for pipeline and forecast what-if analysis.
- Provide self-service analytics that reduce dependence on RevOps for ad hoc reports.
- Establish a pipeline health scoring framework aligned with organizational risk appetite.

---

## 4. Target Users and Personas

### 4.1 Primary Users

**P1: VP of Sales / CRO**
- Uses pipeline analytics for weekly forecast calls, board preparation, and strategic planning.
- Key questions: *Will we hit the number? Where are the gaps? What needs to change?*
- Interaction: Daily glance at health dashboard, weekly deep dive, monthly strategic review.

**P2: Sales Manager / Regional Director**
- Uses pipeline analytics for team coaching, territory planning, and deal prioritization.
- Key questions: *Which deals need attention? Where is my team strong/weak? How do I allocate my time?*
- Interaction: Daily deal-level analysis, weekly team performance review.

**P3: Revenue Operations Analyst**
- Uses pipeline analytics for process optimization, reporting, and forecast model management.
- Key questions: *Where are the process bottlenecks? Is our forecasting model calibrated? What segments are underperforming?*
- Interaction: Daily data exploration, weekly reporting cycle, monthly model recalibration.

### 4.2 Secondary Users

**P4: Individual Contributor (Account Executive)**
- Uses a filtered view of their own pipeline for self-coaching and prioritization.
- Interaction: Weekly self-review.

**P5: Finance / FP&A**
- Uses pipeline analytics to inform revenue recognition forecasts and planning scenarios.
- Interaction: Monthly forecast cycle, quarterly planning.

---

## 5. Information Architecture

### 5.1 Navigation Structure

```
Enterprise Deal Commander
├── Dashboard (existing)
├── Deal Pipeline (existing)
├── Pipeline Analytics              ← NEW MODULE
│   ├── Health Dashboard
│   │   ├── Pipeline Pulse (real-time health indicator)
│   │   ├── Coverage Ratio Tracker
│   │   ├── Flow Metrics Summary
│   │   └── Forecast Confidence Panel
│   ├── Flow Analytics
│   │   ├── Funnel Visualization
│   │   ├── Stage Velocity Analysis
│   │   ├── Conversion Rate Matrix
│   │   ├── Stage Transition Sankey
│   │   └── Recycle & Exit Analysis
│   ├── Forecast Intelligence
│   │   ├── Predictive Forecast Model
│   │   ├── Forecast Accuracy Tracker
│   │   ├── Scenario Simulator
│   │   └── Commit vs. Outcome Analysis
│   ├── Generation & Sourcing
│   │   ├── Pipeline Generation Tracker
│   │   ├── Source Effectiveness Analysis
│   │   ├── Pipeline Aging Cohorts
│   │   └── Leading Indicator Dashboard
│   ├── Segmentation Deep Dive
│   │   ├── Multi-Dimensional Segment Builder
│   │   ├── Cohort Comparison Matrix
│   │   ├── Segment Health Heatmap
│   │   └── Segment Trend Analysis
│   ├── Win/Loss Intelligence
│   │   ├── Win Rate Decomposition
│   │   ├── Loss Reason Taxonomy
│   │   ├── Competitive Intelligence
│   │   └── Deal Post-Mortem Feed
│   └── Pipeline Diagnostics
│       ├── Bottleneck Detector
│       ├── Velocity Anomaly Feed
│       ├── Process Compliance Monitor
│       └── Pipeline Health Scorecard
├── Portfolio Risk Analysis (from earlier PRD)
├── Governance (existing)
└── Administration (existing)
```

---

## 6. Functional Requirements

### 6.1 Health Dashboard

#### 6.1.1 Pipeline Pulse

**FR-6.1.1.1**: The system shall compute and display a **Pipeline Health Score** (0-100) that synthesizes multiple flow metrics into a single indicator. The score shall be computed as a weighted composite:

```
Health Score = w₁·Coverage + w₂·Velocity + w₃·Conversion + w₄·Generation + w₅·Age - w₆·Attrition
```

Where weights are configurable but default to equal weighting.

**FR-6.1.1.2**: The Pipeline Pulse shall render as the module's primary visual element — a **radial gauge** using the semantic color system:
- 80-100: Emerald (healthy)
- 60-79: Amber (watch)
- 40-59: Orange (concern)
- 0-39: Red (critical)

**FR-6.1.1.3**: The gauge shall include a **trend indicator** showing the 30-day trajectory (arrow direction and magnitude) and a **peer comparison** indicator showing how this period's score compares to the trailing 4-quarter average.

**FR-6.1.1.4**: The Pipeline Pulse shall be **drillable** — clicking the gauge navigates to the Pipeline Health Scorecard (Section 6.7.4) showing the component breakdown.

**FR-6.1.1.5**: The system shall compute and display **sub-scores** for each component (Coverage, Velocity, Conversion, Generation, Age, Attrition) as a horizontal bar row beneath the gauge, each independently colored using the same semantic scale.

#### 6.1.2 Coverage Ratio Tracker

**FR-6.1.2.1**: The system shall calculate pipeline coverage ratios at multiple levels:

| Metric | Formula | Display |
|--------|---------|---------|
| **Total Coverage** | Total Pipeline / Target | Ratio + trend sparkline |
| **Qualified Coverage** | Qualified Pipeline / Target | Ratio + trend sparkline |
| **Weighted Coverage** | Stage-Weighted Pipeline / Target | Ratio + trend sparkline |
| **AI-Adjusted Coverage** | AI-Predicted Pipeline / Target | Ratio + trend sparkline |
| **Net New Coverage** | Pipeline Generated This Period / Remaining Gap | Ratio + trend sparkline |

**FR-6.1.2.2**: Each coverage ratio shall display as a **card** (consistent with the application's card styling — `bg-card border border-border rounded-lg p-4 shadow-sm`) containing:
- The metric name in `text-muted-foreground text-xs uppercase tracking-wider`
- The ratio value in `text-3xl font-bold font-mono` with semantic color
- A 90-day sparkline in `text-muted-foreground` with the trend line
- A delta indicator comparing to the prior period

**FR-6.1.2.3**: Coverage ratios shall support filtering by:
- Segment (region, team, product, industry)
- Deal type (new business, expansion, renewal)
- Time period (current quarter, next quarter, rolling 12 months)
- Custom filters defined in the Segment Builder (Section 6.5.1)

**FR-6.1.2.4**: Coverage ratios shall support a **"coverage gap analysis"** mode that decomposes the shortfall (if any) into: pipeline needed from new generation, pipeline needed from stage acceleration, and pipeline needed from win rate improvement.

#### 6.1.3 Flow Metrics Summary

**FR-6.1.3.1**: The system shall display a row of flow metric cards presenting:

| Metric | Definition | Visualization |
|--------|-----------|---------------|
| **Pipeline Created** | Total value of deals entering the pipeline this period | Bar + delta |
| **Pipeline Consumed** | Total value of deals that exited the pipeline (won + lost + disqualified) | Bar + delta |
| **Net Pipeline Change** | Created - Consumed | Signed bar + delta |
| **Win Rate** | Won / (Won + Lost) | Percentage + sparkline |
| **Average Deal Size** | Mean ACV of won deals | Currency + sparkline |
| **Average Sales Cycle** | Median days from opportunity creation to close | Duration + sparkline |
| **Stage 0→1 Conversion** | Rate at which raw leads convert to qualified opportunities | Percentage + sparkline |
| **Pipeline Velocity** | Weighted pipeline value / average days in pipeline | Currency/day + sparkline |

**FR-6.1.3.2**: Each card shall support click-through to the detailed analysis view for that metric.

**FR-6.1.3.3**: All metrics shall support period-over-period comparison with the prior equivalent period (e.g., Q2 this year vs. Q2 last year).

#### 6.1.4 Forecast Confidence Panel

**FR-6.1.4.1**: The system shall display a **forecast confidence panel** showing:
- Management forecast (user-entered commit number)
- AI-generated forecast (model prediction)
- Statistical forecast (regression-based projection)
- Scenario range (optimistic / base / pessimistic)

**FR-6.1.4.2**: The panel shall render as a **bullet chart** with:
- The target as a vertical reference line
- Each forecast as a horizontal bar with position indicating value and length indicating confidence interval
- Color encoding: emerald if above target, amber if within 10% of target, red if below target

**FR-6.1.4.3**: The system shall display a **"Forecast Divergence"** metric — the difference between management forecast and AI forecast — with color-coded severity:
- <5% divergence: emerald (alignment)
- 5-15% divergence: amber (review recommended)
- >15% divergence: red (significant misalignment)

**FR-6.1.4.4**: Clicking the panel shall navigate to the Forecast Intelligence section (Section 6.3).

---

### 6.2 Flow Analytics

#### 6.2.1 Funnel Visualization

**FR-6.2.1.1**: The system shall render an **interactive pipeline funnel** showing deal count and aggregate value at each pipeline stage.

**FR-6.2.1.2**: The funnel shall be implemented as a **stacked horizontal bar chart** (not a tapered funnel, which distorts proportions) where:
- Each row represents a pipeline stage
- Bar length represents deal count or value (toggle)
- Bar color uses the stage's semantic color from the existing pipeline configuration
- Conversion rates between adjacent stages are displayed as connecting annotations

**FR-6.2.1.3**: The funnel shall support **split mode** that divides each stage bar into segments by configurable dimensions (team member, product, segment, deal type) using a color palette distinct from the stage colors.

**FR-6.2.1.4**: The funnel shall support **comparison mode** that overlays the current period's funnel against a prior period or benchmark, using opacity to distinguish current from historical.

**FR-6.2.1.5**: Hovering over any stage shall display a tooltip with:
- Deal count and total value
- Conversion rate to next stage
- Average time in this stage
- Percentage of total pipeline
- Delta vs. prior period

#### 6.2.2 Stage Velocity Analysis

**FR-6.2.2.1**: The system shall compute and visualize **stage velocity** — the time deals spend in each pipeline stage — with the following statistical summaries per stage:

| Metric | Description |
|--------|------------|
| **Median velocity** | 50th percentile of stage residence time |
| **P25 / P75** | Interquartile range showing spread |
| **P90** | Tail indicator — how long the slowest 10% take |
| **Velocity trend** | 6-month moving average of median velocity |
| **Velocity by segment** | Cross-tabulation of velocity against segment dimensions |

**FR-6.2.2.2**: Stage velocity shall be visualized as a **box-and-whisker plot** per stage, where:
- The box spans P25-P75 (interquartile range)
- The median line is inside the box
- Whiskers extend to P10 and P90
- Outlier deals beyond P90 are plotted as individual points
- Box color encodes velocity health: emerald if within target, amber if elevated, red if significantly above target

**FR-6.2.2.3**: The visualization shall support a **"velocity target overlay"** that shows the organization's defined target velocity for each stage as a vertical reference line.

**FR-6.2.2.4**: Clicking on an outlier point shall navigate to that individual deal's detail view in the Deal Pipeline module.

**FR-6.2.2.5**: The system shall compute and display **velocity percentile ranking** for each team member — how their average stage velocities compare to team benchmarks — presented as a sortable table.

#### 6.2.3 Conversion Rate Matrix

**FR-6.2.3.1**: The system shall render a **stage-to-stage conversion matrix** where:
- Rows represent "from" stages
- Columns represent "to" stages
- Cell values represent conversion rate (percentage of deals that move from stage X to stage Y within a configurable time window)
- The diagonal represents deals that remain in the same stage (stagnation rate)
- Below-diagonal cells represent backward movement (stage regression)

**FR-6.2.3.2**: Cell color encoding shall use a diverging scale:
- Forward progression cells: emerald scale (higher = more green)
- Stagnation cells (diagonal): amber scale
- Regression cells (below diagonal): red scale

**FR-6.2.3.3**: The matrix shall support **segmented view** — the ability to filter or pivot the conversion matrix by any segment dimension, enabling comparison of conversion patterns across teams, products, regions, or deal types.

**FR-6.2.3.4**: The matrix shall include **statistical significance indicators** — cells where the conversion rate deviates significantly from the portfolio baseline shall be highlighted with a subtle ring effect (`ring-1 ring-primary/30`).

#### 6.2.4 Stage Transition Sankey

**FR-6.2.4.1**: The system shall render a **Sankey diagram** showing the flow of deals between stages over the selected time period, including:
- Forward transitions (stage advancement)
- Backward transitions (stage regression)
- Exit transitions (won, lost, disqualified, abandoned)
- Lateral transitions (stage skip)

**FR-6.2.4.2**: Flow width shall be proportional to deal count or aggregate value (toggle).

**FR-6.2.4.3**: Flow color shall be determined by the destination stage's semantic color, with opacity encoding volume.

**FR-6.2.4.4**: The Sankey shall support **time animation** — a slider that allows the user to watch deal flow evolve over time (weekly increments), with smooth transitions between frames.

**FR-6.2.4.5**: Hovering over any flow path shall display the number of deals, aggregate value, and percentage of total transitions.

#### 6.2.5 Recycle and Exit Analysis

**FR-6.2.5.1**: The system shall provide dedicated analysis of **deal recycling** — deals that move backward through the pipeline — including:
- Recycle rate by stage (percentage of deals entering a stage that move backward before exiting)
- Recycle count distribution (how many times each deal has recycled)
- Recycle-to-outcome correlation (do recycled deals have different win rates than non-recycled deals?)

**FR-6.2.5.2**: The system shall provide dedicated analysis of **deal exits** — deals that leave the pipeline without being won — including:
- Exit rate by stage
- Exit reason taxonomy with frequency distribution
- Time-to-exit analysis (how long deals survive before exiting)
- Value-at-exit analysis (are higher-value deals more or less likely to exit early?)

**FR-6.2.5.3**: Recycle and exit data shall be presented as a **waterfall chart** showing cumulative pipeline value as deals are added, advance, recycle, and exit through the period.

---

### 6.3 Forecast Intelligence

#### 6.3.1 Predictive Forecast Model

**FR-6.3.1.1**: The system shall implement a **multi-model forecasting engine** that produces pipeline outcome predictions using the following model ensemble:

| Model | Method | Role |
|-------|--------|------|
| **Stage-Weighted Model** | Traditional stage × weight | Baseline reference |
| **Regression Model** | Gradient-boosted trees on deal features | Feature-based prediction |
| **Velocity Model** | Time-series projection based on historical stage transition rates | Flow-based prediction |
| **Behavioral Model** | Neural network trained on seller activity patterns | Signal-based prediction |
| **Ensemble Model** | Stacked generalization combining the above | Final prediction |

**FR-6.3.1.2**: The system shall produce a **per-deal win probability** score (0-100) for every active deal, computed by the ensemble model.

**FR-6.3.1.3**: The per-deal win probability shall incorporate the following feature categories:

**Deal Characteristics**:
- Current stage and time in stage
- Total deal age
- Deal value (ACV and TCV)
- Number of products/solutions included
- Discount depth from list price

**Engagement Signals**:
- Stakeholder engagement depth (number of contacts, seniority distribution)
- Communication frequency and recency (emails, meetings, calls)
- Document engagement (proposal views, contract redline activity)
- Multi-threading score (engagement across multiple buying roles)

**Velocity Signals**:
- Stage progression rate vs. historical median for similar deals
- Stage regression history
- Deal acceleration or deceleration pattern

**Contextual Signals**:
- Competitive presence (known competitors in deal)
- Industry/segment win rate baseline
- Season/quarter timing
- Account history (prior relationship, prior deals, prior churn)

**FR-6.3.1.4**: The model shall be **retrained** on a configurable schedule (default: weekly) using the most recent deal outcomes.

**FR-6.3.1.5**: The system shall provide a **model accuracy dashboard** showing:
- AUC-ROC curve on held-out data
- Calibration plot (predicted probability vs. observed win rate)
- Brier score
- Feature importance rankings
- Model drift indicators (accuracy trend over time)

**FR-6.3.1.6**: The model shall support **explainability** — for each deal, the system shall show the top 5 features driving the win probability score, with directional contribution (positive or negative).

#### 6.3.2 Forecast Accuracy Tracker

**FR-6.3.2.1**: The system shall track **forecast accuracy over time** by comparing:
- Management forecast vs. actual outcome
- AI forecast vs. actual outcome
- Statistical forecast vs. actual outcome

**FR-6.3.2.2**: Accuracy metrics to track:
- Mean Absolute Percentage Error (MAPE)
- Weighted Absolute Percentage Error (WAPE)
- Forecast bias (systematic over- or under-forecasting)
- Forecast precision (variance of errors)

**FR-6.3.2.3**: Accuracy shall be visualized as a **time-series chart** showing each forecast type's prediction alongside the actual outcome, with the error band shaded between prediction and actual.

**FR-6.3.2.4**: The system shall decompose forecast error into:
- **Pipeline generation error**: Was enough pipeline created?
- **Conversion error**: Did pipeline convert at expected rates?
- **Timing error**: Did deals close when expected, even if they eventually closed?
- **Deal selection error**: Were the right deals forecasted?

**FR-6.3.2.5**: The system shall display a **forecast accuracy leaderboard** showing forecast accuracy by team member, enabling identification of systematic over- or under-forecasters.

#### 6.3.3 Scenario Simulator

**FR-6.3.3.1**: The system shall provide a **what-if scenario simulator** that allows users to model the impact of hypothetical changes on pipeline outcomes:

| Scenario Type | Input | Output |
|--------------|-------|--------|
| **Win rate change** | Adjust win rate by N percentage points | Impact on forecast, revenue, pipeline consumption |
| **Velocity change** | Adjust stage velocities by N days | Impact on timing of revenue recognition |
| **Deal acceleration** | Select specific deals to advance by N stages | Impact on current period forecast |
| **Deal addition** | Add hypothetical deals at specific stages and values | Impact on coverage and forecast |
| **Deal removal** | Remove specific deals (e.g., at-risk deals) | Impact on coverage and forecast |
| **Mix shift** | Change proportion of deals across segments | Impact on blended win rate and cycle time |

**FR-6.3.3.2**: The simulator shall present results as a **side-by-side comparison** of the baseline forecast and the scenario forecast, with delta indicators for each key metric.

**FR-6.3.3.3**: Users shall be able to **save scenarios** with descriptive names and share them via link or PDF export.

**FR-6.3.3.4**: The simulator shall support **multi-variable scenarios** — adjusting multiple parameters simultaneously and observing the compound effect.

**FR-6.3.3.5**: The simulator shall display a **sensitivity analysis** showing which input variable has the greatest marginal impact on the forecast, helping users understand which levers matter most.

#### 6.3.4 Commit vs. Outcome Analysis

**FR-6.3.4.1**: The system shall track the historical accuracy of **individual deal-level commit categories**:
- **Commit**: Deals the rep has committed to closing this period
- **Best case**: Deals the rep believes have a strong chance
- **Pipeline**: Deals that are active but not yet committed

**FR-6.3.4.2**: For each category, the system shall compute:
- Historical win rate (what percentage of "commit" deals actually closed?)
- Historical timing accuracy (what percentage closed in the committed period vs. slipping?)
- Historical value accuracy (did the actual close value match the committed value?)

**FR-6.3.4.3**: Results shall be displayed as a **calibration matrix** showing the reliability of each commit category over time, enabling adjustment of forecast weights based on demonstrated accuracy.

**FR-6.3.4.4**: The system shall support **rep-level calibration** — each team member's commit accuracy tracked individually, enabling managers to apply personalized discount factors.

---

### 6.4 Generation and Sourcing

#### 6.4.1 Pipeline Generation Tracker

**FR-6.4.1.1**: The system shall track **pipeline generation** (new opportunities entering the pipeline) with the following dimensions:

| Dimension | Metrics |
|-----------|---------|
| **By time** | Weekly, monthly, quarterly generation rates with trend |
| **By source** | Inbound, outbound, partner, events, referrals, expansion |
| **By team member** | Individual generation rates with team benchmarks |
| **By product** | Pipeline generated per product line |
| **By segment** | Pipeline generated per market segment / industry / territory |
| **By deal size tier** | Pipeline generated per deal value bucket |

**FR-6.4.1.2**: The system shall display a **pipeline generation waterfall** showing:
- Starting pipeline (from prior period)
- + New pipeline created
|   - by source
|   - by segment
- + Pipeline pulled forward (deals accelerated into this period)
- - Pipeline pushed (deals moved to future periods)
- - Pipeline consumed (won + lost + disqualified)
- = Ending pipeline

**FR-6.4.1.3**: The system shall compute **generation velocity** — the rate of new pipeline creation per unit time — and compare it to the rate required to achieve coverage targets, identifying generation gaps before they become critical.

**FR-6.4.1.4**: The system shall display a **"pipeline generation forecast"** — projecting forward the pipeline that will be available in future periods based on historical generation rates and seasonality patterns.

#### 6.4.2 Source Effectiveness Analysis

**FR-6.4.2.1**: The system shall analyze the **effectiveness of each pipeline source** across the full lifecycle, not just initial creation:

| Source Metric | Definition |
|--------------|------------|
| **Volume** | Number and value of opportunities generated |
| **Quality** | Win rate of opportunities from this source |
| **Velocity** | Average sales cycle of opportunities from this source |
| **Yield** | Revenue generated per dollar of source investment (where investment data is available) |
| **Retention** | Renewal/expansion rate of customers originally acquired from this source |
| **Deal size** | Average ACV of opportunities from this source |

**FR-6.4.2.2**: Source effectiveness shall be visualized as a **multi-axis radar chart** where each axis represents one effectiveness metric and each source is a distinct polygon.

**FR-6.4.2.3**: The system shall support **source attribution modeling** using first-touch, last-touch, and multi-touch attribution models, with the ability to compare outcomes under each model.

#### 6.4.3 Pipeline Aging Cohorts

**FR-6.4.3.1**: The system shall organize pipeline into **aging cohorts** — groups of deals created in the same time period — and track each cohort's lifecycle trajectory.

**FR-6.4.3.2**: Cohorts shall be visualized as a **stacked area chart** where:
- X-axis is time
- Y-axis is pipeline value
- Each cohort is a distinct layer
- Layer color shifts from emerald (young, healthy) through amber to red (old, at-risk) based on age

**FR-6.4.3.3**: The system shall compute **cohort survival curves** — the percentage of a cohort's original value that remains active at each subsequent time period — enabling comparison of cohort health over time.

**FR-6.4.3.4**: The system shall detect **aging anomalies** — cohorts that are decaying faster or slower than historical norms — and flag them in the anomaly feed.

#### 6.4.4 Leading Indicator Dashboard

**FR-6.4.4.1**: The system shall identify and track **leading indicators** of future pipeline health — metrics that predict pipeline generation and conversion outcomes 30-90 days in advance.

**FR-6.4.4.2**: Leading indicators to track include:

| Indicator | Predictive Horizon | Leading Relationship |
|-----------|-------------------|---------------------|
| **Prospect meeting volume** | 30-60 days | Predicts pipeline generation |
| **Proposal submission rate** | 30-45 days | Predicts pipeline advancement |
| **Stakeholder meeting frequency** | 15-30 days | Predicts win rate |
| **Technical evaluation starts** | 30-60 days | Predicts enterprise deal progression |
| **Legal/procurement engagement** | 15-30 days | Predicts near-term close rate |
| **Competitive displacement activity** | 30-60 days | Predicts loss rate |
| **Expansion signal detection** | 30-90 days | Predicts expansion pipeline |

**FR-6.4.4.3**: Each indicator shall be displayed as a **lead card** showing:
- Current value and trend (90-day sparkline)
- Predictive correlation strength (R² with the predicted outcome)
- Predicted impact (what the current indicator value suggests about future outcomes)
- Historical accuracy (how well this indicator has predicted in the past)

**FR-6.4.4.4**: The system shall use **Granger causality testing** to validate that identified indicators genuinely lead outcomes rather than merely correlating with them.

**FR-6.4.4.5**: The system shall support **indicator configuration** — allowing RevOps users to define custom leading indicators based on their organization's specific data and processes.

---

### 6.5 Segmentation Deep Dive

#### 6.5.1 Multi-Dimensional Segment Builder

**FR-6.5.1.1**: The system shall provide a **segment builder** that allows users to define custom pipeline segments by combining any combination of dimensions:

| Dimension | Example Values |
|-----------|---------------|
| **Region / Territory** | Americas, EMEA, APAC, specific states/countries |
| **Team / Team Member** | Specific sales teams or individuals |
| **Product Line** | Individual products or product bundles |
| **Industry / Vertical** | Financial services, healthcare, technology, etc. |
| **Deal Type** | New business, expansion, renewal, migration |
| **Deal Size Tier** | SMB, mid-market, enterprise, strategic |
| **Deal Stage** | Current pipeline stage |
| **Deal Age** | Age buckets (0-30 days, 31-60, etc.) |
| **Source** | Inbound, outbound, partner, etc. |
| **Competitive Situation** | No competition, head-to-head, incumbent |
| **Engagement Level** | High, medium, low (based on activity signals) |
| **Custom Fields** | Any custom fields configured in the deal schema |

**FR-6.5.1.2**: The segment builder shall use a **visual query builder** with:
- Dimension selector (dropdown with search)
- Value multi-select within each dimension
- AND/OR logic between dimensions
- Segment name and description
- Save and share capability

**FR-6.5.1.3**: Saved segments shall persist and be available as filter options throughout all Pipeline Analytics views.

**FR-6.5.1.4**: The system shall support **smart segments** — segments defined by algorithmic criteria (e.g., "deals with velocity >1.5x median AND win probability <40%") rather than just categorical values.

#### 6.5.2 Cohort Comparison Matrix

**FR-6.5.2.1**: The system shall enable **side-by-side comparison** of up to 4 segments across all key metrics simultaneously, displayed as a matrix:
- Columns: segments being compared
- Rows: metrics (coverage, velocity, conversion, win rate, deal size, cycle time, etc.)
- Cell values: metric value with delta from portfolio average

**FR-6.5.2.2**: Cells where a segment significantly over- or under-performs the portfolio average shall be highlighted:
- Over-performance: emerald background at 10% opacity with `border-l-2 border-l-emerald-500`
- Under-performance: red background at 10% opacity with `border-l-2 border-l-red-500`

**FR-6.5.2.3**: The matrix shall support **statistical testing** — differences between segments shall be tested for significance, with non-significant differences displayed in muted text.

#### 6.5.3 Segment Health Heatmap

**FR-6.5.3.1**: The system shall render a **heatmap** where:
- One axis represents segments (defined in the Segment Builder)
- The other axis represents key pipeline health metrics
- Cell color encodes the metric value using the semantic color system (emerald → amber → orange → red)

**FR-6.5.3.2**: The heatmap shall support **hierarchical clustering** of both axes — reordering rows and columns to group similar segments and correlated metrics together, revealing structural patterns in the data.

**FR-6.5.3.3**: The heatmap shall support drill-down — clicking any cell navigates to the detailed analysis view for that segment-metric combination.

#### 6.5.4 Segment Trend Analysis

**FR-6.5.4.1**: The system shall display **time-series trend charts** for any selected segment, showing:
- Pipeline value over time
- Win rate trend
- Velocity trend
- Coverage ratio trend
- Generation rate trend

**FR-6.5.4.2**: Trend charts shall support overlay of multiple segments for comparison.

**FR-6.5.4.3**: The system shall detect and annotate **trend breakpoints** — statistically significant changes in trend direction (using change-point detection algorithms) — with the ability to correlate breakpoints to known events (product launches, organizational changes, competitive moves).

---

### 6.6 Win/Loss Intelligence

#### 6.6.1 Win Rate Decomposition

**FR-6.6.1.1**: The system shall decompose win rate into contributing factors using **Shapley value decomposition** — a game-theory approach that fairly distributes credit for the win rate across multiple dimensions.

**FR-6.6.1.2**: The decomposition shall identify the **marginal contribution** of each dimension to win rate:

| Dimension | Example Insight |
|-----------|----------------|
| Product | "DataSync Pro deals win at 45% vs. portfolio average of 32%, contributing +8pp to overall win rate" |
| Team member | "J. Chen's win rate contribution is +5pp above average" |
| Deal size | "Enterprise deals ($100K+) win at 22%, dragging overall win rate down by -4pp" |
| Source | "Referral-sourced deals win at 52%, contributing +6pp" |
| Competitive | "Deals with no competitor identified win at 58%, contributing +12pp" |

**FR-6.6.1.3**: The decomposition shall be displayed as a **waterfall chart** starting from the portfolio win rate baseline and showing each dimension's positive or negative contribution.

**FR-6.6.1.4**: The decomposition shall be **interactive** — users can select which dimensions to include in the analysis and observe how the decomposition changes.

#### 6.6.2 Loss Reason Taxonomy

**FR-6.6.2.1**: The system shall provide a **hierarchical taxonomy** for loss reasons:

```
Loss Reasons
├── Price / Commercial
│   ├── Budget constraints
│   ├── Price too high vs. competitor
│   ├── Discount insufficient
│   └── ROI not demonstrated
├── Product / Technical
│   ├── Missing feature
│   ├── Performance concerns
│   ├── Integration limitations
│   └── Security/compliance gaps
├── Competitive
│   ├── Lost to specific competitor
│   ├── Incumbent retained
│   └── Build vs. buy decision
├── Timing
│   ├── Project postponed
│   ├── Budget cycle misalignment
│   └── Organizational change at prospect
├── Relationship
│   ├── Insufficient stakeholder engagement
│   ├── Champion left
│   └── Executive sponsor change
└── Process
    ├── Procurement roadblock
    ├── Legal/contractual impasse
    └── Internal decision delay
```

**FR-6.6.2.2**: The taxonomy shall be configurable by administrators to match the organization's specific loss categorization.

**FR-6.6.2.3**: Loss reason analysis shall be displayed as a **treemap** where:
- Rectangle size represents the dollar value of losses attributed to that reason
- Rectangle color represents the trend (improving in emerald, stable in amber, worsening in red)

**FR-6.6.2.4**: The system shall cross-reference loss reasons with deal characteristics to identify **loss patterns** — e.g., "65% of losses to Competitor X involve deals in the healthcare segment" or "price-related losses have increased 40% since Competitor Y's price reduction in March."

#### 6.6.3 Competitive Intelligence

**FR-6.6.3.1**: The system shall track **competitive encounter rates** — how often each competitor appears in deals — and compute:
- Win rate when competing against each competitor
- Average deal size impact when competing against each competitor
- Average cycle time impact when competing against each competitor
- Competitive encounter trend (is the competitor appearing more or less frequently?)

**FR-6.6.3.2**: Competitive analysis shall be displayed as a **competitive landscape dashboard** with:
- A ranked list of competitors by encounter frequency
- A head-to-head win rate matrix
- A timeline showing competitive encounter trends

**FR-6.6.3.3**: The system shall identify **competitive displacement opportunities** — segments or deal types where the organization's win rate against a specific competitor is significantly higher than average, suggesting targeted sales plays.

#### 6.6.4 Deal Post-Mortem Feed

**FR-6.6.4.1**: The system shall maintain a **feed of deal post-mortems** — structured reviews of significant won and lost deals.

**FR-6.6.4.2**: Post-mortems shall be automatically initiated for:
- Deals above a configurable value threshold
- Deals that were in "commit" status and were lost
- Deals with competitive displacement
- Deals with unusually long or short cycle times

**FR-6.6.4.3**: Each post-mortem entry shall include:
- Deal summary (value, segment, product, team member)
- Outcome (won/lost) with reason
- Key moments timeline (critical events in the deal's lifecycle)
- Lessons learned (structured text input)
- Recommended action items
- Link to the deal detail in the Deal Pipeline module

---

### 6.7 Pipeline Diagnostics

#### 6.7.1 Bottleneck Detector

**FR-6.7.1.1**: The system shall automatically detect **pipeline bottlenecks** — stages where deals accumulate beyond healthy levels — using the following detection logic:

```
For each stage S:
  1. Compute current residence time distribution for deals in S
  2. Compare to historical baseline distribution (rolling 12-month)
  3. Compute accumulation ratio: current deals in S / historical average deals in S
  4. If accumulation ratio > 1.5 AND median residence time > P75 historical:
     → Flag as bottleneck
  5. Compute bottleneck severity:
     - Moderate: accumulation ratio 1.5-2.0
     - Elevated: accumulation ratio 2.0-3.0
     - Critical: accumulation ratio > 3.0
```

**FR-6.7.1.2**: Each detected bottleneck shall be presented as a **diagnostic card** with:
- Stage name and severity indicator (amber/orange/red left border)
- Accumulation ratio and trend
- Number and value of affected deals
- Root cause hypotheses (derived from cross-referencing bottleneck stage with deal characteristics):
  - If the bottleneck correlates with a specific product: "Potential product-related evaluation delay"
  - If the bottleneck correlates with a specific team: "Potential team capacity or skill issue"
  - If the bottleneck correlates with deal size: "Potential approval or procurement complexity"
  - If the bottleneck correlates with time of quarter: "Potential seasonal or process timing issue"
- Recommended actions

**FR-6.7.1.3**: The bottleneck detector shall distinguish between **healthy accumulation** (high volume in a stage due to strong generation, with normal velocity) and **pathological accumulation** (deals stalling beyond normal velocity thresholds).

**FR-6.7.1.4**: Bottleneck detection shall run on a **continuous basis** with results updating at the configured data refresh interval.

#### 6.7.2 Velocity Anomaly Feed

**FR-6.7.2.1**: The system shall continuously monitor for **velocity anomalies** — deals or groups of deals whose progression rate deviates significantly from expectations.

**FR-6.7.2.2**: Anomaly types to detect:

| Anomaly Type | Detection Logic |
|-------------|----------------|
| **Sudden stall** | Deal that was progressing normally suddenly stops moving for >1.5x its expected stage time |
| **Unusual acceleration** | Deal advancing through stages faster than P10 historical velocity |
| **Mass deceleration** | Multiple deals from the same team/source/segment simultaneously slowing |
| **Velocity regime shift** | Team-wide or product-wide velocity pattern change (detected via change-point analysis) |
| **Late-stage regression** | Deals moving backward from Stage 4+ (unusual and high-impact) |
| **Zombie deal detection** | Deals with no activity signals for >30 days but still in active stages |

**FR-6.7.2.3**: Each anomaly shall be displayed as a feed item using the application's existing notification/alert styling:
- Severity indicator using amber/orange/red left border
- Natural-language description of the anomaly
- Affected entity (deal, team member, segment)
- Statistical context (expected vs. observed values, sigma deviation)
- Recommended action
- Click-through to the affected entity's detail view

**FR-6.7.2.4**: The feed shall support filtering by anomaly type, severity, and affected entity.

**FR-6.7.2.5**: Anomalies shall be **grouped** when multiple anomalies share a common root cause (e.g., 5 deals stalling in the same stage due to the same product issue) to reduce alert noise.

#### 6.7.3 Process Compliance Monitor

**FR-6.7.3.1**: The system shall track **adherence to the defined sales process** — the organization's standard stage progression methodology — by monitoring:
- Stage skip rate (deals advancing past stages without completing required activities)
- Activity completion rate (are required activities at each stage being completed?)
- Stage entry criteria compliance (are deals entering stages meeting defined qualification criteria?)
- Documentation completeness (are required fields populated at each stage transition?)

**FR-6.7.3.2**: Process compliance shall be scored per deal (0-100) and aggregated by team member and segment.

**FR-6.7.3.3**: The system shall correlate process compliance with outcomes — does higher compliance correlate with higher win rates and shorter cycle times? — and display the correlation analysis.

**FR-6.7.3.4**: Non-compliance shall be surfaced as actionable items in the anomaly feed, with specific guidance on which activities are missing.

#### 6.7.4 Pipeline Health Scorecard

**FR-6.7.4.1**: The system shall provide a comprehensive **Pipeline Health Scorecard** that consolidates all diagnostic metrics into a single view.

**FR-6.7.4.2**: The scorecard shall be structured as:

```
Pipeline Health Scorecard
├── Overall Health Score: [0-100] with trend
├── Coverage Health
│   ├── Total Coverage Ratio: [x.xx] with trend
│   ├── Qualified Coverage Ratio: [x.xx] with trend
│   └── Coverage Gap Analysis: [breakdown]
├── Velocity Health
│   ├── Average Velocity Index: [0-100] with trend
│   ├── Stage Velocity Anomalies: [count]
│   └── Bottleneck Stage(s): [list]
├── Conversion Health
│   ├── Portfolio Win Rate: [xx%] with trend
│   ├── Stage Conversion Consistency: [0-100]
│   └── Recycle Rate: [xx%] with trend
├── Generation Health
│   ├── Generation Rate vs. Target: [xx%]
│   ├── Source Diversification Index: [0-1]
│   └── Pipeline Aging Score: [0-100]
├── Forecast Health
│   ├── Forecast Divergence: [xx%]
│   ├── Forecast Bias: [over/under by xx%]
│   └── Commit Accuracy: [xx%]
└── Process Health
    ├── Process Compliance Score: [0-100]
    ├── Activity Completion Rate: [xx%]
    └── Data Quality Score: [0-100]
```

**FR-6.7.4.3**: Each section of the scorecard shall include:
- The metric value with semantic color coding
- A trend sparkline (90-day)
- A delta indicator (vs. prior period)
- A benchmark comparison (vs. organization target or peer average)
- A drill-through link to the detailed analysis view

**FR-6.7.4.4**: The scorecard shall be **exportable** as a formatted PDF for board meetings and review sessions.

---

## 7. Non-Functional Requirements

### 7.1 Performance

| Requirement | Specification |
|-------------|---------------|
| **NFR-7.1.1**: Health Dashboard load time | ≤ 2 seconds for portfolios up to 2,000 active deals |
| **NFR-7.1.2**: Funnel visualization render | ≤ 1 second for up to 10 stages × 5 segments |
| **NFR-7.1.3**: Conversion matrix computation | ≤ 500ms for full stage-to-stage matrix |
| **NFR-7.1.4**: Predictive model inference | ≤ 100ms per deal for win probability score |
| **NFR-7.1.5**: Ensemble model batch scoring | ≤ 30 seconds for full portfolio re-score (2,000 deals) |
| **NFR-7.1.6**: Scenario simulation | ≤ 2 seconds for single-variable scenarios; ≤ 5 seconds for multi-variable |
| **NFR-7.1.7**: Segment builder query | ≤ 3 seconds for arbitrary multi-dimensional segment queries |
| **NFR-7.1.8**: Bottleneck detection | ≤ 1 second for full portfolio analysis |
| **NFR-7.1.9**: Anomaly feed refresh | ≤ 60-second detection latency |

### 7.2 Data Requirements

**NFR-7.2.1**: The system requires a minimum of **12 months of historical deal data** including stage transitions, activity timestamps, and outcomes for reliable predictive modeling.

**NFR-7.2.2**: Predictive model training requires a minimum of **500 completed deals** (won + lost) with sufficient feature density.

**NFR-7.2.3**: Leading indicator analysis requires a minimum of **6 consecutive periods** (quarters or months) of data.

**NFR-7.2.4**: Statistical significance thresholds for all displayed correlations: p < 0.05 with minimum effect size appropriate to the test.

### 7.3 Scalability

**NFR-7.3.1**: The module shall support portfolios of up to **10,000 active deals**, **500 team members**, and **100 product lines**.

**NFR-7.3.2**: The predictive model shall support incremental learning — incorporating new training data without full retraining.

### 7.4 Security and Access Control

**NFR-7.4.1**: Forecast intelligence data (especially predictive win probabilities) shall be accessible only to users with appropriate roles. Individual deal scores shall not be visible to other team members unless they have management access.

**NFR-7.4.2**: The Scenario Simulator's results shall be shareable only within the authorized user group.

**NFR-7.4.3**: All data access shall be audit-logged consistent with the Enterprise Deal Commander's existing audit framework.

---

## 8. Data Model

### 8.1 Core Entities

```
PipelineSnapshot
├── snapshot_id: UUID
├── period_type: ENUM [daily, weekly, monthly, quarterly]
├── period_start: DATE
├── period_end: DATE
├── computed_at: TIMESTAMP
├── health_score: INTEGER [0, 100]
├── coverage_ratio_total: FLOAT
├── coverage_ratio_qualified: FLOAT
├── coverage_ratio_weighted: FLOAT
├── coverage_ratio_ai_adjusted: FLOAT
├── total_pipeline_value: DECIMAL
├── weighted_pipeline_value: DECIMAL
├── ai_predicted_value: DECIMAL
├── win_rate: FLOAT
├── average_deal_size: DECIMAL
├── average_cycle_days: INTEGER
├── velocity_index: FLOAT
├── generation_rate: DECIMAL
├── consumption_rate: DECIMAL
├── net_change: DECIMAL
├── forecast_management: DECIMAL
├── forecast_ai: DECIMAL
├── forecast_statistical: DECIMAL
├── forecast_divergence: FLOAT
└── segments: JSON (segment_id → segment metrics)

StageSnapshot
├── stage_snapshot_id: UUID
├── snapshot_id: UUID (FK)
├── stage_id: UUID
├── deal_count: INTEGER
├── total_value: DECIMAL
├── median_residence_days: INTEGER
├── p25_residence_days: INTEGER
├── p75_residence_days: INTEGER
├── p90_residence_days: INTEGER
├── conversion_rate_to_next: FLOAT
├── exit_rate: FLOAT
├── recycle_rate: FLOAT
├── accumulation_ratio: FLOAT
├── velocity_health: ENUM [healthy, elevated, critical]
└── is_bottleneck: BOOLEAN

TransitionEvent
├── transition_id: UUID
├── deal_id: UUID (FK)
├── from_stage_id: UUID (nullable — null for initial creation)
├── to_stage_id: UUID (nullable — null for exit)
├── transition_type: ENUM [forward, backward, skip, exit_won, exit_lost, exit_disqualified, exit_abandoned]
├── transitioned_at: TIMESTAMP
├── transitioned_by: UUID (team_member_id)
├── days_in_from_stage: INTEGER
└── metadata: JSON

DealScore
├── score_id: UUID
├── deal_id: UUID (FK)
├── model_version: STRING
├── scored_at: TIMESTAMP
├── win_probability: FLOAT [0, 1]
├── predicted_close_date: DATE
├── predicted_close_value: DECIMAL
├── confidence_interval_lower: DECIMAL
├── confidence_interval_upper: DECIMAL
├── top_features: JSON (feature → contribution)
├── commit_category: ENUM [commit, best_case, pipeline, upside]
└── ai_adjusted_category: ENUM [strong_commit, weak_commit, likely_slip, unlikely]

GenerationEvent
├── generation_id: UUID
├── deal_id: UUID (FK)
├── source: STRING
├── source_detail: STRING (campaign, SDR, event name, etc.)
├── generated_at: TIMESTAMP
├── attributed_to: UUID (team_member_id)
├── initial_value: DECIMAL
└── attribution_model: ENUM [first_touch, last_touch, multi_touch]

ForecastRecord
├── forecast_id: UUID
├── period: DATE
├── recorded_at: TIMESTAMP
├── forecast_type: ENUM [management, ai, statistical]
├── forecasted_by: UUID (team_member_id, nullable for AI)
├── forecast_value: DECIMAL
├── actual_value: DECIMAL (nullable — filled when period closes)
├── error_pct: FLOAT (nullable)
├── error_type: ENUM [generation, conversion, timing, selection] (nullable)
└── segments: JSON (segment_id → segment forecast)

AnomalyEvent
├── anomaly_id: UUID
├── detected_at: TIMESTAMP
├── anomaly_type: ENUM [velocity_anomaly, bottleneck, generation_drop, conversion_drop, forecast_divergence, process_non_compliance, zombie_deal, late_stage_regression, mass_deceleration, velocity_regime_shift]
├── severity: ENUM [moderate, elevated, critical]
├── entity_type: ENUM [deal, team_member, stage, segment, product]
├── entity_id: UUID
├── description: TEXT
├── metric_name: STRING
├── observed_value: FLOAT
├── expected_value: FLOAT
├── deviation_sigma: FLOAT
├── root_cause_hypotheses: JSON
├── recommended_actions: JSON
├── status: ENUM [active, acknowledged, resolved, false_positive]
└── group_id: UUID (nullable — links related anomalies)

PostMortem
├── postmortem_id: UUID
├── deal_id: UUID (FK)
├── outcome: ENUM [won, lost]
├── loss_reason_category: STRING
├── loss_reason_detail: STRING
├── competitive_competitor: STRING (nullable)
├── key_moments: JSON (array of {timestamp, event_type, description})
├── lessons_learned: TEXT
├── action_items: JSON (array of {description, assigned_to, due_date, status})
├── created_at: TIMESTAMP
└── created_by: UUID (team_member_id)

SavedScenario
├── scenario_id: UUID
├── name: STRING
├── description: TEXT
├── created_by: UUID (team_member_id)
├── created_at: TIMESTAMP
├── baseline_snapshot_id: UUID (FK)
├── adjustments: JSON (array of {type, parameter, value})
├── results: JSON (computed outcome metrics)
└── shared_with: JSON (array of team_member_ids)

SavedSegment
├── segment_id: UUID
├── name: STRING
├── description: TEXT
├── created_by: UUID (team_member_id)
├── created_at: TIMESTAMP
├── dimension_filters: JSON (array of {dimension, operator, values})
├── smart_criteria: JSON (nullable — for algorithmically defined segments)
└── is_global: BOOLEAN (visible to all users)
```

### 8.2 Data Pipeline Architecture

```
┌──────────────────┐     ┌──────────────────┐     ┌──────────────────┐
│  CRM / Deal      │     │  Activity        │     │  External        │
│  Pipeline System  │     │  System          │     │  Data Sources    │
│  (Events)        │     │  (Email/Calendar) │     │  (Competitor intel│
└────────┬─────────┘     └────────┬─────────┘     │  Market data)    │
         │                        │                └────────┬─────────┘
         ▼                        ▼                         ▼
┌──────────────────────────────────────────────────────────────────────┐
│                    Event Ingestion Layer (Kafka / Event Stream)      │
│                    - Deal stage transitions                          │
│                    - Activity events (meetings, emails, calls)       │
│                    - Value changes                                   │
│                    - Stakeholder changes                              │
│                    - Custom field updates                             │
└────────────────────────────────┬─────────────────────────────────────┘
                                 │
                    ┌────────────┼────────────┐
                    ▼            ▼             ▼
          ┌──────────────┐ ┌──────────┐ ┌──────────────┐
          │ Snapshot      │ │ Feature  │ │ Anomaly      │
          │ Generator     │ │ Store    │ │ Detector     │
          │ (Scheduled)   │ │ (Feature │ │ (Continuous) │
          │               │ │  pipeline)│ │              │
          └──────┬───────┘ └────┬─────┘ └──────┬───────┘
                 │              │               │
                 ▼              ▼               ▼
          ┌──────────────┐ ┌──────────┐ ┌──────────────┐
          │ Snapshot      │ │ ML Model │ │ Alert        │
          │ Store         │ │ Training │ │ Store        │
          │ (TimescaleDB) │ │ (Weekly) │ │              │
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

**Technology Stack** (aligned with existing Enterprise Deal Commander):

| Layer | Technology | Purpose |
|-------|-----------|---------|
| Framework | React 18+ | Component architecture |
| Styling | Tailwind CSS v4.3.0 | Utility-first styling with existing design tokens |
| UI Primitives | Radix UI | Tooltips, popovers, dialogs, selects, tabs, navigation |
| State Management | Zustand + React Query | Local state + server state with caching |
| Visualization | D3.js (data manipulation) + custom React renderers | Heatmaps, Sankey, network graphs, box plots |
| Charting | Visx (Airbnb) | Composable chart primitives for bar, line, area charts |
| Computation | Web Workers + wasm (statistics library) | Off-main-thread statistical computation |
| Animation | Framer Motion | Page transitions, staggered reveals, interactive animations |

### 9.2 Backend Architecture

| Layer | Technology | Purpose |
|-------|-----------|---------|
| API | Node.js / Fastify or Python / FastAPI | REST API + WebSocket server |
| Time-series DB | TimescaleDB (PostgreSQL extension) | Snapshot storage with efficient time-series queries |
| Feature Store | Redis + PostgreSQL | Real-time feature serving for ML inference |
| ML Training | Python / scikit-learn / XGBoost / PyTorch | Model training pipeline |
| ML Serving | ONNX Runtime or TensorFlow Serving | Low-latency model inference |
| Event Streaming | Apache Kafka or Redis Streams | Real-time event ingestion and processing |
| Task Queue | Celery or Bull | Background computation (snapshot generation, anomaly detection, model retraining) |
| Cache | Redis | API response caching, session data |

### 9.3 Component Architecture

```
<PipelineAnalyticsModule>
├── <HealthDashboardPage>
│   ├── <PipelinePulseGauge>            ← Radial gauge with trend
│   ├── <CoverageRatioTracker>          ← Card row with sparklines
│   ├── <FlowMetricsSummary>            ← Card grid
│   └── <ForecastConfidencePanel>       ← Bullet chart
├── <FlowAnalyticsPage>
│   ├── <PipelineFunnel>                ← Stacked horizontal bars
│   ├── <StageVelocityAnalysis>         ← Box-and-whisker per stage
│   ├── <ConversionRateMatrix>          ← Color-coded matrix grid
│   ├── <StageTransitionSankey>         ← D3 Sankey with animation
│   └── <RecycleExitAnalysis>           ← Waterfall chart
├── <ForecastIntelligencePage>
│   ├── <PredictiveForecastChart>       ← Multi-line time series
│   ├── <ForecastAccuracyTracker>       ← Error decomposition chart
│   ├── <ScenarioSimulator>             ← Interactive parameter controls
│   └── <CommitOutcomeAnalysis>         ← Calibration matrix
├── <GenerationSourcingPage>
│   ├── <PipelineGenerationTracker>     ← Waterfall chart
│   ├── <SourceEffectivenessRadar>      ← Radar chart
│   ├── <PipelineAgingCohorts>          ← Stacked area chart
│   └── <LeadingIndicatorDashboard>     ← Lead card grid
├── <SegmentationDeepDivePage>
│   ├── <SegmentBuilder>                ← Visual query builder
│   ├── <CohortComparisonMatrix>        ← Comparison table
│   ├── <SegmentHealthHeatmap>          ← D3 clustered heatmap
│   └── <SegmentTrendAnalysis>          ← Multi-line time series
├── <WinLossIntelligencePage>
│   ├── <WinRateDecomposition>          ← Waterfall chart
│   ├── <LossReasonTreemap>             ← Treemap visualization
│   ├── <CompetitiveLandscape>          ← Competitive dashboard
│   └── <DealPostMortemFeed>            ← Structured feed cards
└── <PipelineDiagnosticsPage>
    ├── <BottleneckDetector>            ← Diagnostic card feed
    ├── <VelocityAnomalyFeed>           ← Anomaly notification feed
    ├── <ProcessComplianceMonitor>      ← Compliance score table
    └── <PipelineHealthScorecard>       ← Comprehensive scorecard view
```

### 9.4 API Design

#### REST Endpoints

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/pipeline-analytics/health-score` | GET | Current pipeline health score with component breakdown |
| `/api/pipeline-analytics/snapshot` | GET | Latest pipeline snapshot |
| `/api/pipeline-analytics/snapshot/{id}` | GET | Specific historical snapshot |
| `/api/pipeline-analytics/snapshots` | GET | Time-series of snapshots (for trend charts) |
| `/api/pipeline-analytics/coverage` | GET | Coverage ratios with filter parameters |
| `/api/pipeline-analytics/flow/funnel` | GET | Funnel data for specified period and filters |
| `/api/pipeline-analytics/flow/velocity` | GET | Stage velocity distributions |
| `/api/pipeline-analytics/flow/conversion-matrix` | GET | Stage-to-stage conversion rates |
| `/api/pipeline-analytics/flow/sankey` | GET | Sankey transition data |
| `/api/pipeline-analytics/flow/recycle` | GET | Recycle and exit analytics |
| `/api/pipeline-analytics/forecast/predictive` | GET | Predictive forecast with model decomposition |
| `/api/pipeline-analytics/forecast/accuracy` | GET | Forecast accuracy metrics over time |
| `/api/pipeline-analytics/forecast/commit-analysis` | GET | Commit category calibration data |
| `/api/pipeline-analytics/scenarios` | GET | List saved scenarios |
| `/api/pipeline-analytics/scenarios` | POST | Create and save a scenario |
| `/api/pipeline-analytics/scenarios/{id}` | GET | Retrieve specific scenario |
| `/api/pipeline-analytics/scenarios/simulate` | POST | Run scenario simulation |
| `/api/pipeline-analytics/generation/tracker` | GET | Pipeline generation metrics |
| `/api/pipeline-analytics/generation/waterfall` | GET | Generation waterfall data |
| `/api/pipeline-analytics/generation/sources` | GET | Source effectiveness data |
| `/api/pipeline-analytics/generation/leading-indicators` | GET | Leading indicator values and predictions |
| `/api/pipeline-analytics/segments` | GET | List saved segments |
| `/api/pipeline-analytics/segments` | POST | Create new segment |
| `/api/pipeline-analytics/segments/{id}/metrics` | GET | Metrics for specific segment |
| `/api/pipeline-analytics/segments/compare` | POST | Compare multiple segments |
| `/api/pipeline-analytics/segments/heatmap` | GET | Segment health heatmap data |
| `/api/pipeline-analytics/winloss/decomposition` | GET | Win rate Shapley decomposition |
| `/api/pipeline-analytics/winloss/loss-reasons` | GET | Loss reason taxonomy with values |
| `/api/pipeline-analytics/winloss/competitive` | GET | Competitive encounter and win rate data |
| `/api/pipeline-analytics/winloss/postmortems` | GET | Post-mortem feed |
| `/api/pipeline-analytics/winloss/postmortems` | POST | Create post-mortem |
| `/api/pipeline-analytics/diagnostics/bottlenecks` | GET | Current bottleneck detections |
| `/api/pipeline-analytics/diagnostics/anomalies` | GET | Velocity anomaly feed |
| `/api/pipeline-analytics/diagnostics/compliance` | GET | Process compliance metrics |
| `/api/pipeline-analytics/diagnostics/scorecard` | GET | Full health scorecard |
| `/api/pipeline-analytics/models/performance` | GET | ML model accuracy metrics |
| `/api/pipeline-analytics/models/features` | GET | Feature importance rankings |
| `/api/pipeline-analytics/export/pdf` | POST | Export current view as PDF |
| `/api/pipeline-analytics/export/csv` | POST | Export data as CSV |

#### WebSocket Events

| Event | Direction | Description |
|-------|-----------|-------------|
| `pipeline.snapshot.updated` | Server → Client | New snapshot computed |
| `pipeline.anomaly.detected` | Server → Client | New anomaly identified |
| `pipeline.deal.scored` | Server → Client | Deal win probability updated |
| `pipeline.bottleneck.detected` | Server → Client | New bottleneck identified |
| `pipeline.bottleneck.resolved` | Server → Client | Bottleneck no longer active |
| `pipeline.forecast.updated` | Server → Client | Forecast model produced new prediction |
| `pipeline.generation.alert` | Server → Client | Pipeline generation below threshold |

---

## 10. Algorithmic Specifications

### 10.1 Pipeline Health Score

```python
def compute_health_score(snapshot, weights=DEFAULT_WEIGHTS):
    """
    Composite health score combining multiple pipeline dimensions.
    
    Each component is normalized to [0, 100] using historical percentile rank.
    """
    components = {
        'coverage': normalize_to_percentile(
            snapshot.coverage_ratio_qualified,
            historical_coverage_ratios
        ),
        'velocity': normalize_to_percentile(
            snapshot.velocity_index,
            historical_velocity_indices,
            invert=True  # Lower velocity (faster) is better
        ),
        'conversion': normalize_to_percentile(
            snapshot.win_rate,
            historical_win_rates
        ),
        'generation': normalize_to_percentile(
            snapshot.generation_rate / snapshot.target_generation_rate,
            historical_generation_ratios
        ),
        'age': normalize_to_percentile(
            snapshot.pipeline_aging_score,
            historical_aging_scores,
            invert=True  # Younger pipeline is better
        ),
        'attrition': normalize_to_percentile(
            1 - snapshot.exit_rate,
            historical_retention_rates
        )
    }
    
    score = sum(weights[k] * components[k] for k in components)
    return round(clamp(score, 0, 100))
```

### 10.2 Predictive Win Probability Model

```
Model: Stacked Ensemble

Layer 1 (Base Models):
  - M1: XGBoost Classifier (deal features + velocity features)
  - M2: Logistic Regression (interpretable baseline)
  - M3: Random Forest (robust to feature interactions)
  - M4: LSTM/Temporal CNN (activity sequence features)

Layer 2 (Meta-Learner):
  - Ridge Regression combining M1-M4 outputs
  - Trained on held-out fold predictions

Feature Engineering:
  - Numerical features: StandardScaler normalization
  - Categorical features: Target encoding with smoothing
  - Temporal features: Cyclical encoding for month/quarter
  - Activity features: Exponential decay aggregation (λ=0.93)
  - Missing values: Median imputation for numerical, "unknown" for categorical

Training Protocol:
  - Time-series split: Train on data before period T, validate on period T
  - Rolling window: 12-month training window, 1-month validation
  - Retraining frequency: Weekly (incremental) and monthly (full)
  - Minimum training samples: 500 completed deals

Calibration:
  - Platt scaling applied to ensemble output
  - Calibration validated with Brier score and reliability diagram
  - Recalibration triggered when Brier score degrades >10% from baseline
```

### 10.3 Bottleneck Detection Algorithm

```python
def detect_bottlenecks(stages, current_snapshot, historical_baseline, config):
    """
    Detect pipeline bottlenecks by comparing current stage distributions
    to historical baselines.
    """
    bottlenecks = []
    
    for stage in stages:
        current = current_snapshot.stage_metrics[stage.id]
        historical = historical_baseline.stage_metrics[stage.id]
        
        # Accumulation ratio
        acc_ratio = current.deal_count / historical.median_deal_count
        
        # Velocity deviation
        velocity_ratio = current.median_residence_days / historical.median_residence_days
        
        # Accumulation must be significant AND velocity must be elevated
        if acc_ratio > config.min_accumulation_ratio:  # default: 1.5
            if velocity_ratio > config.min_velocity_ratio:  # default: 1.3
                severity = classify_severity(acc_ratio, velocity_ratio, config)
                
                # Root cause analysis
                root_causes = analyze_root_causes(
                    stage, current, historical,
                    deal_characteristics, team_data, product_data
                )
                
                bottlenecks.append(Bottleneck(
                    stage=stage,
                    severity=severity,
                    accumulation_ratio=acc_ratio,
                    velocity_ratio=velocity_ratio,
                    affected_deals=current.deal_ids,
                    affected_value=current.total_value,
                    root_cause_hypotheses=root_causes,
                    recommended_actions=generate_recommendations(root_causes)
                ))
    
    return bottlenecks

def analyze_root_causes(stage, current, historical, deals, teams, products):
    """
    Cross-reference bottleneck with deal dimensions to identify root causes.
    """
    causes = []
    
    # Check product concentration
    product_dist = compute_distribution(deals, dimension='product')
    if max(product_dist.values()) > 0.5:
        dominant_product = max(product_dist, key=product_dist.get)
        causes.append({
            'hypothesis': f'Product concentration: {dominant_product} represents '
                         f'{product_dist[dominant_product]:.0%} of stalled deals',
            'confidence': 'medium',
            'evidence': product_dist
        })
    
    # Check team concentration
    team_dist = compute_distribution(deals, dimension='team_member')
    if max(team_dist.values()) > 0.4:
        dominant_team = max(team_dist, key=team_dist.get)
        causes.append({
            'hypothesis': f'Team concentration: {dominant_team} has disproportionate '
                         f'stalled deals ({team_dist[dominant_team]:.0%})',
            'confidence': 'medium',
            'evidence': team_dist
        })
    
    # Check temporal pattern
    if is_quarter_end(stage, current):
        causes.append({
            'hypothesis': 'Quarter-end pattern: stage accumulation '
                         'aligns with historical quarter-end bottleneck',
            'confidence': 'high',
            'evidence': quarter_end_correlation
        })
    
    # Check deal size correlation
    size_effect = correlate_with_deal_size(deals, residence_days)
    if abs(size_effect['r']) > 0.3:
        causes.append({
            'hypothesis': f'Deal size effect: larger deals (r={size_effect["r"]:.2f}) '
                         f'spend significantly more time in this stage',
            'confidence': 'medium',
            'evidence': size_effect
        })
    
    return causes
```

### 10.4 Win Rate Shapley Decomposition

```python
def compute_shapley_win_rate(deals, dimensions, outcome='won'):
    """
    Decompose win rate into marginal contributions of each dimension
    using Shapley values from cooperative game theory.
    """
    n = len(dimensions)
    shapley_values = {dim: 0.0 for dim in dimensions}
    
    for dim in dimensions:
        # For each dimension, compute marginal contribution
        # averaged over all possible coalitions
        other_dims = [d for d in dimensions if d != dim]
        
        for subset_size in range(n):
            for subset in combinations(other_dims, subset_size):
                # Win rate without this dimension
                wr_without = compute_conditional_win_rate(deals, subset)
                # Win rate with this dimension
                wr_with = compute_conditional_win_rate(deals, subset + [dim])
                
                # Marginal contribution
                marginal = wr_with - wr_without
                
                # Shapley weight
                weight = (factorial(subset_size) * factorial(n - subset_size - 1)) / factorial(n)
                
                shapley_values[dim] += weight * marginal
    
    return shapley_values
```

### 10.5 Leading Indicator Validation

```python
def validate_leading_indicator(indicator_series, outcome_series, max_lag=90):
    """
    Validate that a candidate metric genuinely leads an outcome metric
    using Granger causality testing.
    """
    best_lag = None
    best_f_stat = 0
    best_p_value = 1.0
    
    for lag in range(1, max_lag + 1):
        # Shift indicator forward by lag days
        shifted = indicator_series.shift(lag)
        
        # Fit restricted model (outcome predicted by own lags only)
        restricted = fit_autoregressive(outcome_series, max_order=5)
        
        # Fit unrestricted model (outcome predicted by own lags + shifted indicator)
        unrestricted = fit_autoregressive_with_exogenous(
            outcome_series, shifted, max_order=5
        )
        
        # F-test for Granger causality
        f_stat, p_value = f_test(restricted, unrestricted)
        
        if p_value < 0.05 and f_stat > best_f_stat:
            best_lag = lag
            best_f_stat = f_stat
            best_p_value = p_value
    
    if best_lag is not None:
        # Compute predictive correlation at optimal lag
        correlation = compute_correlation(
            indicator_series.shift(best_lag), outcome_series
        )
        
        return {
            'is_leading': True,
            'optimal_lag_days': best_lag,
            'f_statistic': best_f_stat,
            'p_value': best_p_value,
            'correlation': correlation,
            'r_squared': correlation ** 2
        }
    else:
        return {'is_leading': False}
```

---

## 11. User Flows

### 11.1 Primary Flow: Weekly Pipeline Review

```
1. VP Sales navigates to Pipeline Analytics → Health Dashboard
2. Pipeline Pulse gauge shows score: 68 (Amber/Watch), trending down from 74
3. VP clicks gauge → Health Scorecard reveals:
   - Coverage: 3.2x (healthy)
   - Velocity: 58 (elevated — slowing)
   - Conversion: 28% (declining)
   - Generation: 110% of target (healthy)
   - Age: 42 (moderate)
   - Attrition: 12% (elevating)
4. VP drills into Conversion → Conversion Rate Matrix
5. Matrix reveals: Stage 3→4 conversion has dropped from 65% to 48%
6. VP clicks the anomalous cell → System shows 23 deals stalled in Stage 3
7. VP navigates to Pipeline Diagnostics → Bottleneck Detector
8. Bottleneck card: "Stage 3 (Technical Evaluation) — accumulation ratio 2.3x, severity: Elevated"
9. Root cause hypothesis: "Product concentration — 65% of stalled deals involve DataSync Pro's new API module, which received negative feedback in 3 recent evaluations"
10. VP creates mitigation action: "Schedule product team deep-dive on API module gaps"
11. VP navigates to Forecast Intelligence → Scenario Simulator
12. Models: "If Stage 3→4 conversion returns to 60% within 2 weeks" → Forecast improves by $1.8M
13. VP saves scenario for weekly forecast call
```

### 11.2 Secondary Flow: Deal Prioritization via Win Probability

```
1. Sales Manager navigates to Health Dashboard → Coverage Ratio card
2. Sees Qualified Coverage at 2.1x — below 2.5x target
3. Drills into Coverage Gap Analysis: "Need $3.2M more pipeline OR 15% win rate improvement"
4. Navigates to Win/Loss Intelligence → Win Rate Decomposition
5. Sees that "competitive deals" have 18% win rate vs. 42% for non-competitive
6. Navigates to Segmentation → creates smart segment: "Competitive deals in Stage 3+ with win probability > 40%"
7. System identifies 8 deals matching criteria
8. Manager reviews deals — AI explains each score: "High stakeholder engagement (+), but long stage residence (-), single-threaded (-)"
9. Manager prioritizes top 3 deals for executive sponsor engagement
10. Creates mitigation actions in Action Tracker (linked to Portfolio Risk module)
```

### 11.3 Tertiary Flow: Quarter-End Forecast Call

```
1. CRO opens Forecast Intelligence → Forecast Confidence Panel
2. Management forecast: $12.4M | AI forecast: $10.8M | Divergence: 13% (amber)
3. CRO clicks divergence indicator → System decomposes the gap:
   - Management sees 15 "commit" deals worth $4.2M
   - AI model flags 4 of those deals (worth $1.6M) with win probability < 50%
   - Reasons: 2 deals have stale activity (zombie detection), 1 has competitor displacement signals, 1 has stakeholder regression
4. CRO navigates to Commit vs. Outcome Analysis
5. Historical calibration shows: Sales team's "commit" deals historically close at 78% rate
6. Adjusted forecast: $4.2M × 78% + remaining pipeline AI score = $11.1M
7. CRO creates scenario: "Remove flagged deals from commit" → Adjusted forecast: $9.5M
8. CRO presents both scenarios at board meeting with full transparency
```

---

## 12. Visualization Specifications

### 12.1 Pipeline Pulse Gauge

**Visual Design**:
- Outer ring: 270° arc using `bg-muted/20` as track
- Inner fill: Arc from 0° to score-based angle, colored using semantic scale
- Center: Score value in `text-4xl font-bold font-mono` with semantic color
- Below center: Trend arrow and delta in `text-sm`
- Below gauge: Sub-score bar row, each bar `h-1.5 rounded-full` with semantic fill

**Animation**: On mount, the gauge arc animates from 0 to the score value over 800ms with `ease-out`. Sub-score bars stagger-animate with 100ms delay.

### 12.2 Pipeline Funnel

**Visual Design**:
- Not a tapered funnel — use **horizontal stacked bars** for accurate proportional representation
- Each bar: `h-10 rounded-md` with stage color
- Bar width proportional to deal count or value (toggle)
- Between bars: Conversion rate annotation in `text-xs text-muted-foreground font-mono`
- Right-aligned: Stage label + deal count + value
- Background: `bg-card border border-border rounded-lg p-6`

**Interaction**: Hover → tooltip with detailed metrics. Click → drill into stage detail. Legend toggle → show/hide segments.

### 12.3 Stage Velocity Box Plot

**Visual Design**:
- One box per stage, arranged vertically
- Box: `rounded-md` with interquartile range fill using semantic color
- Median line: `h-[2px]` in `text-foreground`
- Whiskers: `w-px` lines extending to P10/P90
- Outlier points: `size-3 rounded-full` with semantic color
- Target overlay: Dashed vertical line in `text-muted-foreground`

**Animation**: Boxes draw from left to right with 150ms stagger. Outlier points fade in after boxes complete.

### 12.4 Stage Transition Sankey

**Visual Design**:
- D3 Sankey layout with custom node rendering
- Nodes: `rounded-lg` rectangles with stage label and value
- Links: Curved paths with gradient fills using source/destination colors
- Exit nodes (Won, Lost, Disqualified): Rendered below the main funnel
- Background: `bg-card border border-border rounded-lg p-4`

**Interaction**: Hover link → tooltip with transition details. Click node → filter to that stage's deals. Time slider → animate transitions over time.

### 12.5 Conversion Rate Matrix

**Visual Design**:
- Grid layout: `grid` with cells sized to content
- Cell fill: Diverging color scale from `emerald-500/10` (high forward conversion) through `amber-500/10` (stagnation) to `red-500/10` (regression)
- Cell text: `text-sm font-mono` with the conversion percentage
- Significant cells: `ring-1 ring-primary/30`
- Row/column headers: `text-xs text-muted-foreground uppercase tracking-wider`

### 12.6 Forecast Confidence Bullet Chart

**Visual Design**:
- Horizontal bar per forecast type
- Target marker: Vertical line in `text-foreground` at the target value
- Bar fill: `rounded-md h-8` in semantic color based on relationship to target
- Confidence interval: Thinner bar extending from lower to upper bound with `opacity-40`
- Labels: Forecast type on left, value on right, both in `text-sm font-mono`

### 12.7 Win Rate Decomposition Waterfall

**Visual Design**:
- Starting bar (portfolio win rate) in `bg-primary`
- Intermediate bars floating at their contribution level
- Positive contributions: `bg-emerald-500`
- Negative contributions: `bg-red-500`
- Connector lines: `border-t border-dashed border-border` between bars
- End bar (adjusted win rate) in `bg-primary`
- Labels: `text-xs font-mono` above each bar

### 12.8 Loss Reason Treemap

**Visual Design**:
- D3 treemap layout with `squarify` tiling algorithm
- Rectangle fill: Gradient from `bg-card` to semantic color based on trend
- Rectangle border: `border border-border`
- Text: Loss reason name in `text-xs`, dollar value in `text-sm font-bold font-mono`
- Trend indicator: Small arrow icon in top-right corner of each rectangle

---

## 13. Integration with Portfolio Risk Analysis Module

### 13.1 Cross-Module Data Flow

The Pipeline Analytics module and the Portfolio Risk Analysis module share a common data foundation and enable bidirectional drill-through:

| Pipeline Analytics → Risk Analysis | Risk Analysis → Pipeline Analytics |
|-------------------------------------|-------------------------------------|
| Click a deal in any pipeline view → See its risk cluster membership | Click a correlation cluster → See its pipeline impact (coverage, velocity, conversion) |
| Pipeline coverage gaps → Check if correlated risk explains the gap | Bottleneck detection → Check if risk correlation patterns contribute |
| Forecast divergence → Investigate if risk concentration explains the divergence | Risk anomaly → See affected deals' pipeline stage and velocity |
| Win/loss analysis → Cross-reference with risk cluster assignment | Propagation model → Feed into pipeline scenario simulator |

### 13.2 Shared Entities

```
Deal (shared)
├── Pipeline fields: stage, velocity, win_probability, commit_category
├── Risk fields: risk_score, cluster_assignment, anomaly_flags
├── Shared fields: deal_id, value, team_member, product, segment, dates
```

### 13.3 Unified Navigation

Both modules share the same sidebar navigation pattern. Context-sensitive "Related Insights" panels appear in both modules:
- In Pipeline Analytics: "This deal's pipeline velocity is below median. Its risk profile shows elevated competitive risk."
- In Portfolio Risk Analysis: "This risk cluster contains 12 deals. 8 are in Stage 3-4 with below-median velocity."

---

## 14. Design System Compliance

### 14.1 Color Token Usage

| Element | Token | Application |
|---------|-------|-------------|
| Healthy metrics | `emerald-500` at 10-40% opacity | Gauge fills, card accents, trend indicators |
| Watch metrics | `amber-500` at 10-40% opacity | Gauge fills, card accents, warning badges |
| Concern metrics | `orange-500` at 10-40% opacity | Gauge fills, card accents, alert badges |
| Critical metrics | `red-500` / `rose-500` at 10-40% opacity | Gauge fills, card accents, critical badges |
| Informational | `cyan-500` / `indigo-500` | Reference lines, informational badges |
| Neutral/Background | `--muted` / `--muted-foreground` | Secondary text, inactive elements, grid lines |
| Primary accent | `--primary` | Active selections, primary buttons, links |

### 14.2 Typography

| Element | Style |
|---------|-------|
| Metric values | `font-mono text-3xl font-bold tabular-nums` |
| Metric labels | `text-xs text-muted-foreground uppercase tracking-wider` |
| Chart axis labels | `text-xs text-muted-foreground font-mono` |
| Card titles | `text-sm font-semibold text-foreground` |
| Card descriptions | `text-sm text-muted-foreground` |
| Table headers | `text-xs font-medium text-muted-foreground uppercase` |
| Table cells | `text-sm text-foreground tabular-nums` |
| Anomaly descriptions | `text-sm text-foreground leading-relaxed` |
| Tooltips | `text-xs text-popover-foreground` |

### 14.3 Spacing and Layout

| Element | Specification |
|---------|---------------|
| Page container | `max-w-[1600px] mx-auto px-6 py-6` |
| Section spacing | `space-y-8` between major sections |
| Card grid | `grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4` |
| Card internal padding | `p-4` for compact cards, `p-6` for detail cards |
| Chart container padding | `p-4` within `bg-card border border-border rounded-lg` |
| Table row height | `h-11 min-h-[44px]` |
| Badge size | `px-2 py-0.5 rounded-full text-xs` |

### 14.4 Animation Specifications

| Element | Animation | Duration | Easing |
|---------|-----------|----------|--------|
| Page transition | fade-in + slide-in-from-bottom-4 | 300ms | ease-in-out |
| Health score gauge | Arc animation from 0 to score | 800ms | ease-out |
| Metric cards | Staggered fade-in | 200ms each, 100ms stagger | ease-out |
| Funnel bars | Width animation from 0 | 400ms, 50ms stagger | ease-out |
| Box plot boxes | Draw left to right | 300ms, 150ms stagger | ease-out |
| Sankey links | Flow animation (dash offset) | 1000ms | linear |
| Matrix cells | Fade in with scale from 0.95 | 150ms, 30ms stagger | ease-out |
| Anomaly feed items | slide-in-from-right | 250ms | ease-in-out |
| Tooltips | fade-in + zoom-in-95 | 100ms | ease-out |
| Detail panels | fade-in + scale-95-to-100 | 200ms | ease-out |
| Gauge trend arrow | Rotate to direction + fade | 300ms | ease-out |

---

## 15. Edge Cases and Error Handling

### 15.1 Insufficient Data

| Condition | Handling |
|-----------|----------|
| Fewer than 10 deals in a segment | Display "Insufficient data" badge with `text-muted-foreground`; suppress statistical metrics; show raw counts only |
| Fewer than 500 completed deals for ML model | Use stage-weighted model only; display "Predictive model requires more historical data" notice |
| New stage with no historical baseline | Use portfolio-wide baseline with "New stage — baseline will establish after 90 days of data" notice |
| Zero deals in a stage | Display empty state with `text-muted-foreground` message; exclude from ratio calculations |

### 15.2 Data Quality

| Condition | Handling |
|-----------|----------|
| Missing stage transition timestamps | Estimate using interpolation; flag as "estimated" with reduced confidence |
| Duplicate deal entries | Deduplicate using deal_id; log discrepancy for data quality review |
| Retroactive stage changes | Record both original and corrected timestamps; use corrected for analysis |
| Missing loss reason | Categorize as "Unclassified" in loss reason taxonomy; prompt for classification on next deal review |

### 15.3 Model Degradation

| Condition | Handling |
|-----------|----------|
| Brier score degradation >10% | Trigger model recalibration alert; fall back to stage-weighted model until recalibration completes |
| Feature drift detected | Alert RevOps; reduce model confidence intervals by 20%; flag affected scores |
| Concept drift (win rate structural change) | Automatic detection via change-point analysis; trigger full model retrain; apply regime-adjusted predictions |

---

## 16. Release Plan

### Phase 1: Foundation (Weeks 1-8)

**Health Dashboard**:
- Pipeline Pulse gauge with Health Score computation
- Coverage Ratio Tracker with all five coverage metrics
- Flow Metrics Summary cards
- Forecast Confidence Panel

**Core Infrastructure**:
- Snapshot data model and TimescaleDB schema
- Event ingestion pipeline for stage transitions
- Basic REST API for snapshot and metrics
- React component library for chart primitives

### Phase 2: Flow Intelligence (Weeks 9-16)

**Flow Analytics**:
- Pipeline Funnel with segment split and comparison modes
- Stage Velocity Analysis with box plots and targets
- Conversion Rate Matrix with significance indicators
- Stage Transition Sankey with time animation
- Recycle and Exit Analysis with waterfall chart

**Diagnostics (MVP)**:
- Bottleneck Detector with root cause hypotheses
- Velocity Anomaly Feed with basic anomaly types

### Phase 3: Forecast Intelligence (Weeks 17-24)

**Predictive Models**:
- Feature engineering pipeline
- XGBoost + Logistic Regression base models
- Ensemble model with calibration
- Per-deal win probability scoring
- Model performance dashboard

**Forecast Tools**:
- Predictive Forecast Chart
- Forecast Accuracy Tracker with error decomposition
- Commit vs. Outcome Analysis with calibration matrix

### Phase 4: Segmentation & Generation (Weeks 25-32)

**Segmentation**:
- Multi-Dimensional Segment Builder
- Cohort Comparison Matrix
- Segment Health Heatmap with hierarchical clustering
- Segment Trend Analysis

**Generation**:
- Pipeline Generation Tracker with waterfall
- Source Effectiveness Analysis with radar chart
- Pipeline Aging Cohorts with survival curves
- Leading Indicator Dashboard with Granger validation

### Phase 5: Intelligence & Integration (Weeks 33-40)

**Win/Loss Intelligence**:
- Win Rate Decomposition with Shapley values
- Loss Reason Taxonomy with treemap
- Competitive Intelligence dashboard
- Deal Post-Mortem Feed

**Diagnostics (Complete)**:
- Process Compliance Monitor
- Pipeline Health Scorecard (comprehensive)
- Full anomaly detection suite

**Integration**:
- Cross-module drill-through with Portfolio Risk Analysis
- Scenario Simulator
- PDF/CSV export
- WebSocket real-time updates

### Phase 6: Optimization & Launch (Weeks 41-44)

- Performance optimization and load testing
- Accessibility audit (WCAG 2.1 AA)
- User acceptance testing with P1-P3 personas
- Documentation and training materials
- Gradual rollout: 10% users → 50% → 100%

---

## 17. Risks and Mitigations

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| **R1**: Predictive model accuracy insufficient with available training data | High | High | Start with interpretable models (logistic regression); upgrade to ensemble as data accumulates; always provide transparent accuracy metrics |
| **R2**: Users distrust AI-generated win probabilities | Medium | High | Provide full explainability (top features per deal); allow calibration adjustment; show historical accuracy prominently |
| **R3**: Data quality issues (missing fields, inconsistent stage usage) | High | Medium | Implement data quality scoring in the scorecard; provide data hygiene recommendations; design models robust to missing features |
| **R4**: Performance degradation with large portfolios | Medium | Medium | Implement progressive rendering; use Web Workers for computation; cache snapshot data aggressively |
| **R5**: Alert fatigue from anomaly detection | Medium | Medium | Implement anomaly grouping; allow per-user alert configuration; provide severity-based filtering; use adaptive thresholds |
| **R6**: Resistance to process compliance monitoring | Medium | Medium | Frame compliance as coaching tool, not surveillance; show correlation between compliance and rep success; allow team-level configuration |
| **R7**: Correlation mistaken for causation in win rate decomposition | Medium | Medium | Include statistical significance indicators; provide causal analysis framework; use language carefully ("associated with" not "caused by") |
| **R8**: Privacy concerns around individual rep scoring | Medium | High | Enforce strict RBAC; individual scores visible only to direct management; aggregate anonymized views for broader audiences |

---

## 18. Success Metrics

| Metric | Baseline | Target (6 months post-launch) | Measurement |
|--------|----------|------------------------------|-------------|
| Forecast MAPE | ~30% | ≤15% | Compare forecast vs. actual at quarter close |
| Pipeline coverage gap detection lead time | Discovered at quarter-end | ≥30 days advance notice | Track when coverage risks are first flagged vs. when shortfalls materialize |
| Bottleneck resolution time | ~3 weeks (manual identification) | ≤5 days (automated detection to resolution) | Track anomaly detection to bottleneck resolution timestamp |
| User adoption (weekly active) | N/A | ≥75% of P1-P3 personas | Application analytics |
| Forecast call preparation time | ~4 hours | ≤30 minutes | User research / time tracking |
| Win rate improvement (coached deals) | Baseline at launch | ≥5% improvement for deals with AI-flagged coaching opportunities | A/B comparison of AI-guided vs. non-guided deals |
| Pipeline generation gap early detection | 0% (reactive) | ≥60% of gaps detected ≥30 days early | Track generation alerts vs. actual generation shortfalls |

---

## 19. Open Questions

| # | Question | Owner | Status |
|---|----------|-------|--------|
| OQ-1 | What activity data is available for the behavioral model? (Email, calendar, call logs, CRM activity?) | Engineering + Data | Open |
| OQ-2 | How should we handle deals that recycle multiple times — reset velocity or track cumulative? | Product + RevOps | Open |
| OQ-3 | Should the predictive model's win probability be visible to individual reps, or only to managers? | HR + Sales Leadership | Open |
| OQ-4 | What is the organization's defined sales process with mandatory activities per stage? (Required for process compliance monitoring) | RevOps | Open |
| OQ-5 | Should leading indicators be auto-discovered from data or manually configured? | Product + Data Science | Open |
| OQ-6 | How should the system handle mid-quarter territory or team changes that break historical comparisons? | RevOps + Product | Open |
| OQ-7 | What competitor intelligence data sources are available for integration? | Product + Sales Ops | Open |
| OQ-8 | Should the scenario simulator support export to the organization's planning tool? | Engineering + Finance | Open |

---

*Document Version: 1.0*
*Module: Pipeline Analytics*
*Application: Enterprise Deal Commander*
*PRD Classification: Feature Module — Major*