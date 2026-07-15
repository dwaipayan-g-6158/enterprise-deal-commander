# Product Requirements Document (PRD)

## Portfolio Risk Analysis: Correlation of Risk Patterns Across Team Members and Products

**Enterprise Deal Commander — Feature Module**

---

## 1. Executive Summary

This PRD defines a **Portfolio Risk Analysis** module for the Enterprise Deal Commander platform. The module enables enterprise sales and deal governance teams to identify, visualize, and act upon **correlated risk patterns** that span across individual team members and product lines within a deal portfolio. By surfacing hidden dependencies, clustering effects, and systemic vulnerabilities, this feature transforms the Deal Commander from a deal-level management cockpit into a portfolio-level strategic intelligence system.

The module addresses a critical gap: while individual deal risk is often assessed in isolation, real-world enterprise portfolios exhibit **correlated failure modes** — a single product deficiency, a team-wide behavioral pattern, or a market segment shift can simultaneously affect dozens of deals. This feature makes those correlations visible and actionable.

---

## 2. Problem Statement

### 2.1 The Correlated Risk Blind Spot

Enterprise software deal portfolios face risks that do not distribute independently. Current deal management practices — including those supported by the Enterprise Deal Commander's existing governance cockpit — tend to evaluate risk at the individual deal level. This produces several systemic blind spots:

- **Team-level behavioral clustering**: A single account executive's negotiation pattern (e.g., over-discounting, late-stage concessions) may replicate across their entire pipeline, creating a portfolio-level exposure that is invisible when deals are reviewed individually.
- **Product-line dependency concentration**: Multiple deals may depend on the same product module, integration capability, or upcoming feature. A delay or quality issue in that product propagates across the portfolio as a correlated risk event.
- **Cross-dimensional compounding**: When a team member's deals are simultaneously concentrated on a single product line and a single market segment, the compounding effect creates outsized risk that neither dimension alone would reveal.
- **Temporal correlation**: Risk events within a portfolio are not uniformly distributed in time. Quarter-end pressure, product release cycles, and competitive windows create temporal clusters of risk that amplify each other.

### 2.2 Business Impact

Without correlation-aware risk analysis, organizations face:

1. **Undetected portfolio concentration**: Risk reports showing "green" at the deal level while the portfolio is structurally fragile.
2. **Reactive governance**: Risk committees discover correlated failures only after they cascade, rather than identifying the structural preconditions.
3. **Misallocated mitigation resources**: Resources are spread evenly across deals rather than concentrated where correlation effects would yield the greatest portfolio-level risk reduction.
4. **Inaccurate forecasting**: Pipeline and revenue forecasts that assume independent deal outcomes, producing overly optimistic confidence intervals.

---

## 3. Goals and Objectives

### 3.1 Primary Goals

| Goal | Description | Success Metric |
|------|-------------|----------------|
| **G1: Surface Hidden Correlations** | Identify and quantify risk pattern correlations across team members and product lines that are not visible at the individual deal level | Number of previously undetected correlation clusters identified per quarter |
| **G2: Enable Portfolio-Level Risk Scoring** | Produce a composite portfolio risk score that accounts for correlation effects, not just additive deal-level risk | Reduction in forecast variance attributable to correlated risk events |
| **G3: Drive Proactive Mitigation** | Provide actionable recommendations that address systemic risk patterns rather than individual symptoms | Percentage of correlation-driven mitigations adopted by risk committees |
| **G4: Maintain Deal-Commander Design Cohesion** | Integrate seamlessly into the existing Enterprise Deal Commander cockpit with consistent interaction patterns, dark theme, and sidebar navigation | Zero new design tokens required; full compatibility with existing component library |

### 3.2 Secondary Goals

- Enable historical trend analysis of correlation patterns over fiscal periods.
- Support "what-if" scenario modeling for portfolio restructuring.
- Provide drill-down from portfolio-level correlation heatmaps to individual deal context.

---

## 4. Target Users and Personas

### 4.1 Primary Users

**P1: VP of Sales / Revenue Operations Leader**
- Needs a single-glance view of portfolio health that accounts for structural risk, not just deal-by-deal status.
- Makes quarterly resource allocation and territory decisions.
- Interaction frequency: Weekly review, daily during quarter-end.

**P2: Deal Desk / Deal Governance Analyst**
- Conducts deep-dive risk assessments on flagged correlation clusters.
- Prepares risk committee briefing materials.
- Interaction frequency: Daily.

**P3: Sales Manager / Team Lead**
- Monitors risk patterns within their team's portfolio.
- Identifies coaching opportunities and intervention points.
- Interaction frequency: Daily to weekly.

### 4.2 Secondary Users

**P4: Product Management Liaison**
- Monitors product-line risk contribution to deal portfolio health.
- Uses correlation data to prioritize feature delivery and bug fixes.

**P5: Finance / FP&A Analyst**
- Incorporates correlation-adjusted risk into revenue forecasting models.

---

## 5. Information Architecture

The Portfolio Risk Analysis module is structured as a **new top-level section** in the Enterprise Deal Commander sidebar, positioned between the existing deal pipeline views and the governance/administration section. The architecture follows a layered drill-down pattern:

### 5.1 Navigation Structure

```
Enterprise Deal Commander
├── Dashboard (existing)
├── Deal Pipeline (existing)
├── Portfolio Risk Analysis    ← NEW MODULE
│   ├── Overview
│   │   ├── Portfolio Risk Heatmap
│   │   ├── Correlation Summary Cards
│   │   └── Risk Trend Timeline
│   ├── Team Correlation View
│   │   ├── Member Risk Profile Matrix
│   │   ├── Behavioral Pattern Clusters
│   │   └── Team Overlap Analysis
│   ├── Product Correlation View
│   │   ├── Product Risk Dependency Map
│   │   ├── Feature-Delay Propagation Model
│   │   └── Product-Team Cross-Analysis
│   ├── Correlation Explorer
│   │   ├── Multi-Dimensional Scatter Plot
│   │   ├── Correlation Matrix (deal-level)
│   │   └── Anomaly Detection Feed
│   └── Mitigation Planner
│       ├── Risk Scenario Simulator
│       ├── Resource Allocation Optimizer
│       └── Action Tracker
├── Governance (existing)
└── Administration (existing)
```

---

## 6. Functional Requirements

### 6.1 Portfolio Risk Heatmap (Overview)

**FR-6.1.1**: The system shall render a two-dimensional heatmap where one axis represents **team members** and the other represents **product lines**. Each cell encodes a **composite risk score** derived from the intersection of that team member's deals involving that product.

**FR-6.1.2**: The heatmap color encoding shall follow the application's existing semantic color system:
- **Emerald** (`emerald-500` range): Low correlation risk (score 0–25)
- **Amber** (`amber-500` range): Moderate correlation risk (score 26–60)
- **Orange** (`orange-500` range): Elevated correlation risk (score 61–80)
- **Red/Rose** (`red-500` / `rose-500` range): Critical correlation risk (score 81–100)

**FR-6.1.3**: Each heatmap cell shall support hover to reveal a tooltip containing:
- Number of deals at the intersection
- Aggregate deal value
- Primary risk factors contributing to the score
- Trend direction (improving / stable / deteriorating)

**FR-6.1.4**: Clicking a heatmap cell shall navigate to a detail view showing all deals at that team-member / product-line intersection, with individual risk factors itemized.

**FR-6.1.5**: The heatmap shall support filtering by:
- Deal stage (e.g., Discovery, Proposal, Negotiation, Closed-Won)
- Deal value range
- Time period (fiscal quarter, rolling 30/60/90 days)
- Risk category (technical, commercial, competitive, legal)

**FR-6.1.6**: The heatmap shall support a **"correlation coefficient overlay"** toggle that replaces raw risk scores with Pearson correlation coefficients between team-member risk patterns, revealing which members' risk profiles are most similar.

### 6.2 Correlation Summary Cards (Overview)

**FR-6.2.1**: The Overview page shall display a row of summary cards (consistent with the application's existing card component styling — `rounded-lg`, `bg-card`, `border-border`) presenting:

- **Highest Correlation Cluster**: The team-product combination with the strongest cross-deal risk correlation, with a one-sentence explanation.
- **Diversification Index**: A Herfindahl-Hirschman-style index measuring concentration of risk across the portfolio (0 = perfectly diversified, 1 = fully concentrated).
- **Correlated Risk Exposure**: Total dollar value of deals participating in at least one statistically significant correlation cluster.
- **Anomaly Count**: Number of deals whose risk behavior deviates more than 2 standard deviations from their cluster norm.
- **Trend Delta**: Change in overall portfolio correlation risk compared to the prior period.

**FR-6.2.2**: Each card shall include a micro-sparkline showing the 90-day trend of that metric.

**FR-6.2.3**: Cards shall animate in with a staggered fade-up entrance (consistent with the application's `animate-in` and `fade-in` patterns), with 100ms delay between each card.

### 6.3 Risk Trend Timeline (Overview)

**FR-6.3.1**: The system shall render a time-series chart showing the evolution of portfolio correlation risk over time, with the following overlaid series:
- Overall portfolio risk score
- Team-member-driven correlation risk
- Product-line-driven correlation risk
- Market-segment-driven correlation risk

**FR-6.3.2**: The chart shall support interactive zoom (click-drag to select time range) and pan.

**FR-6.3.3**: Significant events (product launches, organizational changes, competitive moves) shall be rendered as annotated markers on the timeline. Clicking a marker shows a detail popover.

**FR-6.3.4**: The chart shall use the application's existing color tokens for each series, ensuring visual consistency with the dark theme.

### 6.4 Member Risk Profile Matrix (Team Correlation View)

**FR-6.4.1**: The system shall display a matrix view where each row represents a team member and each column represents a **risk dimension**:

| Risk Dimension | Definition |
|----------------|------------|
| Discount Aggressiveness | Tendency to offer discounts beyond deal-desk guidelines |
| Cycle Time Variance | Deviation of deal cycle time from team median |
| Stage Regression Rate | Frequency of deals moving backward in pipeline stages |
| Stakeholder Depth | Average number of validated stakeholders per deal |
| Competitive Loss Rate | Percentage of deals lost to identified competitors |
| Escalation Frequency | Rate of deal-level escalations to management |
| Value Realization Score | Alignment between proposed solution and stated customer needs |
| Technical Risk Propensity | Tendency to sell into technically complex or immature product areas |

**FR-6.4.2**: Each cell shall be encoded using a standardized z-score color scale: values beyond +2σ in the risk-increasing direction use `red-500` at 40% opacity; values beyond -2σ in the risk-reducing direction use `emerald-500` at 40% opacity; neutral values use the application's `muted` background.

**FR-6.4.3**: The matrix shall support **clustering mode**, which automatically groups team members with statistically similar risk profiles using hierarchical clustering (Ward's method). Clusters shall be visually indicated with colored left-border accents (`border-l-4` pattern consistent with the application's existing left-border accent convention for cards).

**FR-6.4.4**: Each team member row shall be expandable to reveal the underlying deal list contributing to each risk dimension score.

### 6.5 Behavioral Pattern Clusters (Team Correlation View)

**FR-6.5.1**: The system shall identify and visualize **behavioral patterns** — recurring sequences of actions or states across a team member's deals that correlate with risk outcomes.

**FR-6.5.2**: Pattern types to detect include:

- **Concession Cascade Pattern**: Deals where discount increases correlate with stage progression, indicating negotiation weakness.
- **Stakeholder Bypass Pattern**: Deals advancing without validated economic buyer engagement.
- **Compressed Diligence Pattern**: Deals where technical evaluation duration is significantly below portfolio average.
- **Repeat Playbook Pattern**: Deals using identical objection-handling or pricing strategies regardless of customer context.

**FR-6.5.3**: Each detected pattern shall be displayed as an **alert card** containing:
- Pattern name and icon
- Affected team members (with avatar/group indicator)
- Number of deals exhibiting the pattern
- Historical correlation between this pattern and deal loss / scope reduction / delayed close
- Recommended intervention

**FR-6.5.4**: Pattern cards shall use the application's existing border-left accent convention: amber for moderate patterns, orange for elevated, red for critical.

### 6.6 Team Overlap Analysis (Team Correlation View)

**FR-6.6.1**: The system shall compute and visualize **risk overlap** between team members — the degree to which two members' deal portfolios share correlated risk factors.

**FR-6.6.2**: Overlap shall be displayed as a **network graph** where:
- Nodes represent team members (sized by portfolio value)
- Edges represent correlation strength (thicker = stronger correlation)
- Node color encodes that member's individual risk score
- Edge color encodes the primary risk dimension driving the correlation

**FR-6.6.3**: The network graph shall support force-directed layout with physics simulation, draggable nodes, and zoom/pan.

**FR-6.6.4**: Clicking an edge shall display a detail popover showing:
- The specific risk factors shared between the two members
- The statistical significance (p-value) of the correlation
- The deals contributing to the overlap
- Historical trend of the correlation

**FR-6.6.5**: The system shall flag "concerning clusters" — groups of 3+ team members with high mutual correlation — with an alert indicator.

### 6.7 Product Risk Dependency Map (Product Correlation View)

**FR-6.7.1**: The system shall visualize the **dependency structure** between product lines as it relates to deal risk. Each product line is a node; edges represent the degree to which deals involving both products exhibit correlated risk.

**FR-6.7.2**: Node size shall encode the number of active deals involving that product. Node color shall encode the product-level risk contribution score.

**FR-6.7.3**: The visualization shall support a **layered view** toggle that rearranges the dependency map into a Sankey-style flow diagram showing how risk flows from product-level issues (e.g., feature gaps, performance issues) through to affected deals.

**FR-6.7.4**: Each product node shall be expandable to reveal:
- Top 3 risk factors associated with that product
- Number of deals at each pipeline stage
- Competitive win/loss ratio for deals involving that product
- Customer satisfaction or NPS data (if available)

### 6.8 Feature-Delay Propagation Model (Product Correlation View)

**FR-6.8.1**: The system shall model the **cascade effect** of product feature delays on the deal portfolio. Given a configurable delay scenario (e.g., "Feature X is delayed by N weeks"), the system shall compute:

- Number of affected deals
- Aggregate revenue at risk
- Probability-weighted revenue impact
- Recommended communication or mitigation actions

**FR-6.8.2**: The propagation model shall be visualized as a **directed graph** where:
- Source nodes are product features or milestones
- Intermediate nodes are product lines or solution bundles
- Sink nodes are individual deals (grouped by team member)
- Edge weights represent the strength of dependency

**FR-6.8.3**: The system shall support a **scenario slider** that allows users to adjust the delay duration and observe real-time changes to the propagation graph and aggregate impact metrics.

### 6.9 Product-Team Cross-Analysis (Product Correlation View)

**FR-6.9.1**: The system shall provide a **cross-tabulation view** showing the intersection of product-line risk and team-member risk, enabling identification of cases where a specific team member is disproportionately exposed to a specific product's risk.

**FR-6.9.2**: The cross-tabulation shall highlight cells where the observed risk significantly exceeds what would be expected given the marginal distributions (i.e., cells with high chi-squared contribution), indicating non-random risk concentration.

**FR-6.9.3**: Highlighted cells shall be actionable — clicking them shall navigate to a filtered deal list for that team-member / product intersection with pre-populated risk factor analysis.

### 6.10 Multi-Dimensional Scatter Plot (Correlation Explorer)

**FR-6.10.1**: The Correlation Explorer shall provide an interactive scatter plot that allows users to plot deals along any two risk dimensions simultaneously, with optional encoding of additional dimensions through:
- Point size (third dimension)
- Point color (fourth dimension)
- Animation over time (fifth dimension)

**FR-6.10.2**: The scatter plot shall support **lasso selection** for defining custom deal cohorts for further analysis.

**FR-6.10.3**: The system shall overlay **cluster boundaries** (convex hulls) around automatically detected deal clusters, using the same color system as the behavioral pattern clusters.

**FR-6.10.4**: A **regression line** toggle shall be available, showing the linear relationship between the two selected dimensions with R² value displayed.

### 6.11 Correlation Matrix (Correlation Explorer)

**FR-6.11.1**: The system shall render a full **pairwise correlation matrix** across all risk dimensions for the selected portfolio subset.

**FR-6.11.2**: The matrix shall use a diverging color scale (emerald for negative correlation, amber-to-red for positive correlation) with cell values displaying the correlation coefficient.

**FR-6.11.3**: The matrix shall support **hierarchical clustering reordering** — rows and columns shall be reordered to group highly correlated dimensions together, revealing block structure.

**FR-6.11.4**: Clicking a matrix cell shall open a detail panel showing the scatter plot of the two dimensions with all contributing deals plotted.

### 6.12 Anomaly Detection Feed (Correlation Explorer)

**FR-6.12.1**: The system shall continuously monitor the deal portfolio for **anomalous risk behavior** — deals or team members whose risk patterns deviate significantly from their historical baseline or from their cluster peers.

**FR-6.12.2**: Anomalies shall be categorized as:
- **Sudden Shift**: A team member's risk profile changes abruptly (e.g., discount behavior spikes by >2σ in one week).
- **Drift Anomaly**: Gradual but sustained deviation from baseline over multiple periods.
- **Cluster Outlier**: A deal or team member whose behavior is inconsistent with their assigned cluster.
- **Cross-Dimensional Anomaly**: A deal where one risk dimension is normal but the combination of two or more dimensions creates an unusual profile.

**FR-6.12.3**: Each anomaly shall be presented as a feed item with:
- Timestamp and severity (using the amber/orange/red convention)
- Description of the anomaly in natural language
- Affected entity (deal, team member, product)
- Context (what is normal vs. what was observed)
- Suggested action

**FR-6.12.4**: The anomaly feed shall support real-time updates with new items appearing via slide-in animation.

### 6.13 Risk Scenario Simulator (Mitigation Planner)

**FR-6.13.1**: The Mitigation Planner shall include a **scenario simulator** that allows users to model the portfolio-level impact of hypothetical actions:

- **Reassignment**: Moving N deals from team member A to team member B. The system recomputes correlation scores and diversification index.
- **Product focus shift**: Shifting pipeline emphasis from product X to product Y. The system recomputes product-line correlation scores.
- **Deal acceleration/deceleration**: Changing expected close dates. The system recomputes temporal correlation risk.
- **Deal removal**: Removing specific deals from the portfolio (e.g., anticipated losses). The system recomputes all downstream metrics.

**FR-6.13.2**: The simulator shall present results as a **before/after comparison** with the heatmap, summary cards, and trend timeline reflecting the simulated state.

**FR-6.13.3**: Simulated states shall be saveable and shareable with other team members via a shareable link or export.

### 6.14 Resource Allocation Optimizer (Mitigation Planner)

**FR-6.14.1**: Given a fixed pool of mitigation resources (e.g., executive sponsor time, solution engineer hours, legal review capacity), the system shall recommend **optimal allocation** to minimize portfolio correlation risk.

**FR-6.14.2**: The optimizer shall use a constrained optimization approach that accounts for:
- Current correlation structure
- Marginal risk reduction per unit of resource applied to each deal
- Minimum acceptable resource levels per deal
- Team member capacity constraints

**FR-6.14.3**: Results shall be presented as a ranked list of recommended resource allocations with:
- Deal identifier and team member
- Recommended resource type and amount
- Expected portfolio risk score reduction
- Confidence interval

**FR-6.14.4**: The optimizer shall support **sensitivity analysis** — showing how the optimal allocation changes under different constraint assumptions.

### 6.15 Action Tracker (Mitigation Planner)

**FR-6.15.1**: The system shall track all mitigation actions initiated in response to correlation risk findings, with status tracking through: Proposed → Approved → In Progress → Completed → Verified.

**FR-6.15.2**: Each action shall be linked to the specific correlation finding that prompted it, enabling **outcome tracking** — did the mitigation action actually reduce the correlation risk it was targeting?

**FR-6.15.3**: The Action Tracker shall support filtering by team member, product line, risk dimension, and status.

**FR-6.15.4**: Aggregate statistics shall be displayed at the top of the tracker: actions by status, average time-to-completion, and estimated vs. actual risk reduction.

---

## 7. Non-Functional Requirements

### 7.1 Performance

| Requirement | Specification |
|-------------|---------------|
| **NFR-7.1.1**: Heatmap initial render | ≤ 1.5 seconds for portfolios up to 500 deals and 30 team members |
| **NFR-7.1.2**: Correlation computation | ≤ 3 seconds for full pairwise correlation matrix across all risk dimensions |
| **NFR-7.1.3**: Scenario simulation | ≤ 2 seconds for reassignment scenarios involving up to 50 deals |
| **NFR-7.1.4**: Anomaly detection refresh | Background computation with ≤ 60-second detection latency |
| **NFR-7.1.5**: Network graph interaction | Maintain ≥ 30fps during force-directed layout simulation for graphs up to 100 nodes |

### 7.2 Data Requirements

**NFR-7.2.1**: The system shall operate on deal data with a minimum history of **6 months** to establish reliable baselines and enable meaningful temporal analysis.

**NFR-7.2.2**: Correlation computations shall use a minimum sample size of **10 deals** per team-member/product intersection to produce statistically valid results. Cells below this threshold shall be displayed with reduced opacity and a "low confidence" indicator.

**NFR-7.2.3**: The system shall support **data refresh** from the deal pipeline at configurable intervals (minimum: hourly; recommended: near-real-time via event-driven updates).

### 7.3 Scalability

**NFR-7.3.1**: The module shall support portfolios of up to **5,000 active deals**, **200 team members**, and **50 product lines** without degradation below the performance thresholds in Section 7.1.

### 7.4 Security and Access Control

**NFR-7.4.1**: Portfolio-level correlation data shall be accessible only to users with the appropriate role (P1-P3 personas). Access shall respect the existing Enterprise Deal Commander role-based access control model.

**NFR-7.4.2**: Individual team member risk profile data (Section 6.4) shall be visible only to users with management-level access or above for that team member's reporting hierarchy.

**NFR-7.4.3**: All data access shall be audit-logged.

### 7.5 Accessibility

**NFR-7.5.1**: All visualizations shall provide **non-color encodings** for critical information (e.g., pattern fills, numeric labels, shape variations) to ensure accessibility for color-blind users.

**NFR-7.5.2**: The module shall meet **WCAG 2.1 AA** compliance for keyboard navigation, screen reader compatibility, and focus management.

**NFR-7.5.3**: All interactive chart elements shall support keyboard navigation and provide accessible descriptions.

---

## 8. Data Model

### 8.1 Core Entities

```
PortfolioRiskSnapshot
├── snapshot_id: UUID
├── portfolio_id: UUID
├── computed_at: TIMESTAMP
├── diversification_index: FLOAT [0, 1]
├── total_correlated_exposure: DECIMAL
├── anomaly_count: INTEGER
└── trend_delta: FLOAT

CorrelationCluster
├── cluster_id: UUID
├── snapshot_id: UUID (FK)
├── cluster_type: ENUM [team, product, cross]
├── members: JSON (list of team_member_ids or product_ids)
├── mean_correlation: FLOAT [-1, 1]
├── risk_score: INTEGER [0, 100]
├── primary_risk_dimension: STRING
└── statistical_significance: FLOAT (p-value)

RiskDimension
├── dimension_id: UUID
├── name: STRING
├── description: TEXT
├── computation_method: STRING
├── data_source: STRING
└── weight: FLOAT

TeamMemberRiskProfile
├── profile_id: UUID
├── team_member_id: UUID
├── snapshot_id: UUID (FK)
├── dimension_scores: JSON (dimension_id → z-score)
├── cluster_assignment: UUID (FK → CorrelationCluster)
├── behavioral_patterns: JSON (list of pattern_ids)
└── anomaly_flags: JSON (list of anomaly_ids)

ProductRiskProfile
├── profile_id: UUID
├── product_id: UUID
├── snapshot_id: UUID (FK)
├── risk_contribution_score: FLOAT
├── deal_count: INTEGER
├── feature_dependency_graph: JSON
└── correlation_with_products: JSON (product_id → correlation)

AnomalyEvent
├── anomaly_id: UUID
├── snapshot_id: UUID (FK)
├── anomaly_type: ENUM [sudden_shift, drift, cluster_outlier, cross_dimensional]
├── severity: ENUM [moderate, elevated, critical]
├── entity_type: ENUM [deal, team_member, product]
├── entity_id: UUID
├── description: TEXT
├── observed_value: FLOAT
├── expected_value: FLOAT
├── deviation_sigma: FLOAT
└── detected_at: TIMESTAMP

MitigationAction
├── action_id: UUID
├── correlation_cluster_id: UUID (FK)
├── anomaly_id: UUID (FK, nullable)
├── action_type: STRING
├── status: ENUM [proposed, approved, in_progress, completed, verified]
├── assigned_to: UUID (team_member_id)
├── expected_risk_reduction: FLOAT
├── actual_risk_reduction: FLOAT (nullable)
├── created_at: TIMESTAMP
└── completed_at: TIMESTAMP (nullable)
```

### 8.2 Data Refresh Pipeline

```
Deal Pipeline Events → Event Stream → Correlation Engine → Snapshot Store → Visualization Layer
                                      ↑                                        ↓
                               Historical Store ←←←←←←←←←←←←←←←←←←←←←←←←←← User Interactions
```

---

## 9. Technical Architecture

### 9.1 Technology Stack Alignment

The module shall be built using the existing Enterprise Deal Commander technology stack:

| Layer | Technology | Notes |
|-------|-----------|-------|
| **Frontend Framework** | React (existing) | Component-based architecture with hooks |
| **Styling** | Tailwind CSS v4.3.0 (existing) | All visual tokens consistent with existing theme |
| **UI Primitives** | Radix UI (existing) | Tooltips, popovers, dropdowns, dialogs, navigation |
| **Design Tokens** | HSL-based custom properties | `--background`, `--card`, `--border`, `--primary`, `--muted`, etc. |
| **Visualization** | D3.js + React wrapper | For heatmaps, network graphs, scatter plots, Sankey diagrams |
| **Charting** | Recharts or Visx | For time-series and bar charts |
| **State Management** | Zustand or React Context | Scoped per module |
| **Computation** | Web Workers | Off-main-thread correlation calculations |
| **Caching** | React Query / TanStack Query | Snapshot caching with stale-while-revalidate |

### 9.2 Component Architecture

```
<PortfolioRiskModule>
├── <RiskOverviewPage>
│   ├── <PortfolioHeatmap>           ← D3-backed heatmap
│   ├── <CorrelationSummaryCards>    ← Staggered-animated cards
│   └── <RiskTrendTimeline>          ← Time-series chart
├── <TeamCorrelationPage>
│   ├── <MemberRiskMatrix>           ← Data grid with z-score encoding
│   ├── <BehavioralPatternFeed>      ← Alert card feed
│   └── <TeamOverlapNetwork>         ← Force-directed graph
├── <ProductCorrelationPage>
│   ├── <ProductDependencyMap>       ← Dependency graph + Sankey toggle
│   ├── <FeaturePropagationModel>    ← Directed graph with scenario slider
│   └── <ProductTeamCrossTab>        ← Chi-squared highlighted table
├── <CorrelationExplorerPage>
│   ├── <MultiDimScatter>            ← D3 scatter with lasso
│   ├── <CorrelationMatrix>          ← Clustered heatmap matrix
│   └── <AnomalyFeed>                ← Real-time anomaly stream
└── <MitigationPlannerPage>
    ├── <ScenarioSimulator>          ← Interactive simulation UI
    ├── <ResourceOptimizer>          ← Ranked allocation table
    └── <ActionTracker>              ← Status-tracked action list
```

### 9.3 Design System Compliance

All components shall strictly adhere to the existing Enterprise Deal Commander design system:

- **Border radius**: `rounded-lg` (var(--radius)) for cards, `rounded-md` for smaller elements
- **Spacing**: Tailwind spacing scale with `--spacing: 0.25rem`
- **Typography**: `--app-font-sans` for UI text, `--app-font-mono` for numerical data
- **Dark theme**: Primary dark with `--background` as base, `--card` for elevated surfaces
- **Color semantics**: Amber for warnings, emerald for positive, red/rose for critical, as defined in the existing theme
- **Border convention**: `border-border` for standard borders, `border-l-4` with semantic color for accent cards
- **Animation**: `animate-in`, `fade-in`, `duration-200`, `ease-in-out` for transitions
- **Shadows**: `shadow-sm` for cards, `shadow-lg` for overlays and popovers

---

## 10. Algorithmic Specifications

### 10.1 Correlation Computation

**Method**: Pearson correlation coefficient for continuous risk dimensions; Cramér's V for categorical dimensions; point-biserial for mixed continuous-binary pairs.

**Computation cadence**: Full recomputation every 4 hours; incremental updates on deal event ingestion.

**Significance threshold**: Correlations with p-value > 0.05 or |r| < 0.3 shall be suppressed from visual display (replaced with "not significant" indicator).

### 10.2 Clustering Algorithm

**Method**: Agglomerative hierarchical clustering with Ward's linkage method.

**Distance metric**: 1 - |correlation| (i.e., highly correlated members are "close").

**Optimal cluster count**: Determined by maximizing the silhouette coefficient over the range [2, sqrt(N)] where N is the number of team members.

### 10.3 Anomaly Detection

**Method**: Isolation Forest for multivariate anomaly detection; Z-score thresholding (|z| > 2.5) for univariate anomaly detection.

**Baseline window**: Rolling 90-day window with exponential decay weighting (λ = 0.95).

**Alert threshold**: Anomaly score > 0.7 (Isolation Forest) or |z| > 2.5 (univariate).

### 10.4 Portfolio Diversification Index

**Formula**: Modified Herfindahl-Hirschman Index applied to risk contribution weights:

```
D = 1 - Σ(wᵢ²)
```

Where `wᵢ` is the proportion of total portfolio correlated risk attributed to cluster `i`. D approaches 1 for perfectly diversified portfolios (risk evenly distributed across many uncorrelated clusters) and approaches 0 for fully concentrated portfolios.

### 10.5 Propagation Model

**Method**: Bayesian network with conditional probability tables derived from historical feature-delay/deal-outcome correlations.

**Computation**: Variable elimination for exact inference on portfolios < 200 deals; loopy belief propagation for larger portfolios.

---

## 11. User Flows

### 11.1 Primary Flow: Weekly Portfolio Risk Review

```
1. User navigates to Portfolio Risk Analysis → Overview
2. Summary cards load with staggered animation → User scans for anomalies
3. User notices Diversification Index has dropped from 0.72 to 0.58
4. User examines the Heatmap → Identifies a red cell at [Member: J. Chen] × [Product: DataSync Pro]
5. User clicks the red cell → Drills into deal list for that intersection
6. System reveals 8 deals, all in negotiation stage, all dependent on an upcoming DataSync Pro feature
7. User navigates to Product Correlation → Feature Propagation Model
8. User adjusts delay slider to "6 weeks" → Sees projected revenue impact of $2.4M
9. User navigates to Mitigation Planner → Scenario Simulator
10. User models reassignment of 3 deals to another member with lower DataSync dependency
11. System shows Diversification Index improves from 0.58 to 0.67
12. User creates mitigation action → Assigned to sales ops for reassignment
13. Action appears in Action Tracker with "Proposed" status
```

### 11.2 Secondary Flow: Anomaly-Driven Investigation

```
1. Real-time anomaly notification appears (slide-in animation)
2. User clicks notification → Navigates to Anomaly Feed
3. Anomaly: "M. Rodriguez shows sudden shift in discount aggressiveness: +2.8σ"
4. User clicks anomaly → Detail panel shows 5 deals with discounts >30%
5. User navigates to Member Risk Matrix → Confirms M. Rodriguez is an outlier on discount dimension
6. User examines Behavioral Pattern Clusters → M. Rodriguez exhibits "Concession Cascade Pattern"
7. User clicks pattern card → Recommended intervention: "Schedule deal review with manager before next customer meeting"
8. User creates mitigation action with type "coaching intervention"
```

---

## 12. Visual Design Specifications

### 12.1 Layout

- **Max width**: `max-w-[1600px]` (consistent with existing layout constraint)
- **Main content area**: Full width with standard `p-6` padding
- **Sidebar integration**: Module appears as a new section in the existing sidebar navigation with standard `SidebarGroup` and `SidebarMenuItem` components

### 12.2 Card Standards

All summary and analysis cards shall follow:
- Background: `bg-card` with `border border-border rounded-lg`
- Padding: `p-4` to `p-6`
- Shadow: `shadow-sm`
- Hover state: `hover:shadow-md transition-shadow duration-200`
- Left accent for risk alerts: `border-l-4` with semantic color

### 12.3 Chart Standards

- Background: `bg-card` with standard card styling
- Axis text: `text-muted-foreground text-xs font-mono`
- Grid lines: `stroke-border opacity-30`
- Data points: Use the semantic color system (emerald/amber/orange/red)
- Tooltips: `bg-popover border border-border rounded-lg shadow-lg p-3`

### 12.4 Animation Specifications

| Element | Animation | Duration | Easing |
|---------|-----------|----------|--------|
| Page enter | fade-in + slide-in-from-bottom-4 | 300ms | ease-in-out |
| Summary cards | Staggered fade-in, 100ms between cards | 200ms each | ease-out |
| Heatmap cells | Scale from 0.95 to 1.0 on first render | 150ms | ease-out |
| Network graph nodes | Force-directed settle | Physics-based | spring |
| Anomaly feed items | slide-in-from-right | 250ms | ease-in-out |
| Detail panels | fade-in + scale-95-to-100 | 200ms | ease-out |
| Tooltip | fade-in-0 + zoom-in-95 | 100ms | ease-out |

---

## 13. API Specifications

### 13.1 Endpoints

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/portfolio-risk/snapshot` | GET | Retrieve latest portfolio risk snapshot |
| `/api/portfolio-risk/snapshot/{id}` | GET | Retrieve specific historical snapshot |
| `/api/portfolio-risk/heatmap` | GET | Heatmap data with filter parameters |
| `/api/portfolio-risk/correlations` | GET | Full correlation matrix |
| `/api/portfolio-risk/correlations/team` | GET | Team-member-level correlation data |
| `/api/portfolio-risk/correlations/product` | GET | Product-line-level correlation data |
| `/api/portfolio-risk/clusters` | GET | Detected correlation clusters |
| `/api/portfolio-risk/anomalies` | GET | Anomaly feed with pagination |
| `/api/portfolio-risk/member/{id}/profile` | GET | Individual member risk profile |
| `/api/portfolio-risk/product/{id}/profile` | GET | Individual product risk profile |
| `/api/portfolio-risk/propagation/simulate` | POST | Run feature delay propagation simulation |
| `/api/portfolio-risk/scenarios` | GET | List saved scenarios |
| `/api/portfolio-risk/scenarios` | POST | Create and save a scenario |
| `/api/portfolio-risk/scenarios/{id}` | GET | Retrieve specific scenario |
| `/api/portfolio-risk/actions` | GET | Mitigation actions list |
| `/api/portfolio-risk/actions` | POST | Create new mitigation action |
| `/api/portfolio-risk/actions/{id}` | PATCH | Update action status |
| `/api/portfolio-risk/optimizer/recommend` | POST | Run resource allocation optimizer |
| `/api/portfolio-risk/export` | POST | Export current view as PDF/CSV |

### 13.2 WebSocket Events

| Event | Direction | Description |
|-------|-----------|-------------|
| `risk.snapshot.updated` | Server → Client | New snapshot computed |
| `risk.anomaly.detected` | Server → Client | New anomaly identified |
| `risk.cluster.changed` | Server → Client | Cluster membership changed |
| `risk.action.updated` | Server → Client | Mitigation action status changed |

---

## 14. Dependencies and Integrations

| Dependency | Type | Purpose |
|------------|------|---------|
| Enterprise Deal Commander core | Internal | Deal data, user authentication, navigation shell |
| Deal Pipeline service | Internal | Real-time deal stage and attribute data |
| Product catalog service | Internal | Product line taxonomy and feature roadmaps |
| User/Team directory service | Internal | Team hierarchy and member profiles |
| D3.js | External (npm) | Data visualization library |
| Simple Statistics | External (npm) | Statistical computation (correlation, regression) |
| ml-isolation-forest | External (npm) | Anomaly detection |
| Web Workers API | Browser | Background computation |

---

## 15. Risks and Mitigations

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| **R1**: Insufficient historical data for reliable correlation computation | High (initial deployment) | High | Implement graceful degradation: show "insufficient data" indicators with minimum threshold explanations; begin with simpler univariate analysis and layer in multivariate as data accumulates |
| **R2**: False positive correlations misdirecting mitigation resources | Medium | High | Require minimum statistical significance (p < 0.05) and effect size (|r| > 0.3) for all displayed correlations; include confidence intervals on all displays |
| **R3**: Performance degradation for large portfolios (>2000 deals) | Medium | Medium | Implement progressive computation (quick approximate results first, then refined); use Web Workers for off-main-thread processing; cache intermediate results |
| **R4**: User resistance to algorithmically-driven risk assessments | Medium | Medium | Provide full transparency into computation methods; allow users to adjust weights and thresholds; show raw data alongside computed scores |
| **R5**: Privacy concerns around individual team member risk profiles | Medium | High | Enforce strict RBAC; limit individual profile visibility to direct management hierarchy; aggregate anonymized data for lower-access roles |
| **R6**: Correlation mistaken for causation in user decision-making | Medium | Medium | Include explicit disclaimers on correlation displays; provide causal analysis framework as a separate guided workflow; use language like "co-occurs with" rather than "caused by" |

---

## 16. Success Metrics and KPIs

| Metric | Baseline | Target (6 months) | Measurement Method |
|--------|----------|-------------------|-------------------|
| **Forecast variance reduction** | Current forecast MAE: 18% | ≤ 12% MAE | Compare forecast vs. actual at quarter close |
| **Correlated risk events detected pre-occurrence** | 0% (reactive) | ≥ 60% detected before cascade | Track risk events and whether correlation analysis surfaced them in advance |
| **Mitigation action effectiveness** | No tracking | ≥ 40% of actions achieve measurable risk reduction | Action Tracker outcome data |
| **User adoption (weekly active users)** | N/A | ≥ 70% of P1-P3 personas | Application analytics |
| **Time to insight** | ~2 hours (manual correlation analysis) | ≤ 10 minutes | User research sessions |
| **Diversification Index improvement** | Baseline at launch | ≥ 15% improvement in portfolio diversification over 2 quarters | Computed D index from snapshots |

---

## 17. Release Plan

### Phase 1: Foundation (Weeks 1–6)
- Portfolio Risk Heatmap (FR-6.1)
- Correlation Summary Cards (FR-6.2)
- Risk Trend Timeline (FR-6.3)
- Core correlation computation engine
- Snapshot data model and storage

### Phase 2: Team Intelligence (Weeks 7–12)
- Member Risk Profile Matrix (FR-6.4)
- Behavioral Pattern Clusters (FR-6.5)
- Team Overlap Analysis (FR-6.6)
- Clustering algorithm integration
- Anomaly Detection Feed (FR-6.12)

### Phase 3: Product Intelligence (Weeks 13–18)
- Product Risk Dependency Map (FR-6.7)
- Feature-Delay Propagation Model (FR-6.8)
- Product-Team Cross-Analysis (FR-6.9)
- Bayesian network propagation engine

### Phase 4: Explorer & Mitigation (Weeks 19–24)
- Multi-Dimensional Scatter Plot (FR-6.10)
- Correlation Matrix (FR-6.11)
- Risk Scenario Simulator (FR-6.13)
- Resource Allocation Optimizer (FR-6.14)
- Action Tracker (FR-6.15)
- API and WebSocket integration
- Performance optimization and load testing

### Phase 5: Polish & Launch (Weeks 25–28)
- Accessibility audit and remediation
- User acceptance testing
- Documentation and training materials
- Gradual rollout (10% → 50% → 100%)

---

## 18. Open Questions

| # | Question | Owner | Status |
|---|----------|-------|--------|
| OQ-1 | What is the minimum viable dataset size before correlation analysis produces actionable results? | Data Science | Open |
| OQ-2 | Should individual team member risk profiles be visible to the members themselves (self-awareness), or only to management? | HR + Legal | Open |
| OQ-3 | How should the system handle team member transitions (departures, role changes) in historical correlation analysis? | Product | Open |
| OQ-4 | What is the preferred method for handling deals with incomplete risk dimension data? Imputation vs. exclusion? | Data Science | Open |
| OQ-5 | Should the propagation model integrate with the product team's actual feature roadmap API for real-time delay data? | Engineering + Product | Open |
| OQ-6 | What level of explainability is required for the resource allocation optimizer recommendations? | Compliance + Product | Open |

---

## 19. Appendices

### Appendix A: Risk Dimension Definitions (Detailed)

Each risk dimension defined in FR-6.4.1 requires a formal computation specification. These will be documented in a companion technical specification document with the following structure per dimension:

- Raw data inputs and source systems
- Normalization method
- Z-score computation parameters
- Historical baseline window
- Update frequency
- Edge cases and handling

### Appendix B: Color Token Reference

| Semantic Meaning | Token | Application |
|-----------------|-------|-------------|
| Low risk | `emerald-500` at 5-40% opacity | Heatmap cells, badges, border accents |
| Moderate risk | `amber-500` at 5-40% opacity | Heatmap cells, badges, border accents |
| Elevated risk | `orange-500` at 10-40% opacity | Heatmap cells, badges, border accents |
| Critical risk | `red-500` / `rose-500` at 10-40% opacity | Heatmap cells, badges, border accents |
| Informational | `cyan-500` / `indigo-500` | Trend lines, informational badges |
| Neutral/Muted | `--muted` / `--muted-foreground` | Non-highlighted data points, secondary text |

### Appendix C: Glossary

| Term | Definition |
|------|-----------|
| **Correlation Cluster** | A group of deals, team members, or products whose risk patterns exhibit statistically significant positive correlation |
| **Diversification Index** | A modified HHI metric measuring how evenly risk is distributed across uncorrelated clusters in the portfolio |
| **Behavioral Pattern** | A recurring sequence of actions or states across deals that historically correlates with adverse outcomes |
| **Propagated Risk** | Risk that originates at the product/feature level and cascades through dependent deals |
| **Anomaly Score** | A normalized metric (0-1) indicating how far a data point deviates from its expected distribution |
| **Correlation Coefficient** | A standardized measure (-1 to +1) of the linear relationship between two risk dimensions |

---

*Document Version: 1.0*
*Module: Portfolio Risk Analysis*
*Application: Enterprise Deal Commander*
*PRD Classification: Feature Module — Major*