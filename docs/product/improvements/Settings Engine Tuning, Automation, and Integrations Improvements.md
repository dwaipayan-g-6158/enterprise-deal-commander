# Settings: Engine Tuning, Automation, and Integrations

## Design &amp; Technical Specification

## Enterprise Deal Commander

---

## 1. Module Purpose and Strategic Thesis

The four major modules of the Enterprise Deal Commander — Portfolio Risk Analysis, Pipeline Analytics, Closed-Lost Autopsy, and Deal Memory — each contain analytical engines, detection algorithms, scoring models, and automation rules that produce their intelligence outputs. Every one of those engines has parameters, thresholds, weights, schedules, and behaviors that must be tuned to the specific reality of the organization using them. A win probability model trained on one organization's deal patterns will be miscalibrated for another. A bottleneck detector with generic thresholds will either drown the team in false positives or miss real problems. An anomaly detector set too aggressively will create alert fatigue; set too conservatively, it will be silent when it should be screaming.

The Settings module is the **control panel** for the entire EDC platform. It is where administrators, RevOps leaders, and technical operators configure the behavior of every analytical engine, define automation rules that connect insights to actions, manage the integrations that feed data into and out of the platform, and govern the access controls, data policies, and operational parameters that determine how the system behaves.

This is not a conventional "settings page" with a list of toggles. It is a **configuration management system** for a sophisticated analytical platform, requiring the same level of design intentionality as the modules it governs.

The strategic thesis: **the value of the EDC platform is directly proportional to the quality of its configuration. A well-tuned system that reflects the organization's specific selling reality will produce dramatically better results than a system running on defaults. The Settings module must make sophisticated configuration accessible, safe, and auditable.**

---

## 2. Problem Statement

### 2.1 The Configuration Complexity Challenge

The four EDC modules collectively contain:


| Module                      | Configurable Elements                                                                                                                                                                                                         |
| --------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Portfolio Risk Analysis** | Correlation thresholds, clustering algorithm selection, anomaly detection sensitivity, risk dimension weights, risk appetite limits, propagation model parameters, MST pruning thresholds                                     |
| **Pipeline Analytics**      | Health score weights, coverage ratio definitions, velocity targets, forecast model parameters, feature importance weights, bottleneck detection thresholds, anomaly detection sensitivity, leading indicator definitions      |
| **Closed-Lost Autopsy**     | Loss risk scoring weights, pattern detection support/confidence/lift thresholds, behavioral anti-pattern definitions, autopsy form configuration, SLA timelines, NLP extraction parameters, intervention recommendation rules |
| **Deal Memory**             | Search ranking weights, embedding model selection, knowledge extraction schedules, decay detection thresholds, contribution quality scoring, AI advisor behavior parameters, access control policies                          |


That is over 200 individually configurable parameters across the platform. Without a well-designed configuration system, three failure modes emerge:

**Default drift**: Organizations deploy the system and never adjust defaults. The system works adequately but never reaches its potential because the thresholds, weights, and rules don't reflect the organization's specific deal patterns, risk tolerance, or process maturity.

**Configuration chaos**: A technically sophisticated operator adjusts parameters without governance. Changes are made in isolation, without understanding cross-module dependencies, and without rollback capability. A threshold change in the anomaly detector cascades into the alert system, flooding the team with notifications.

**Governance vacuum**: No audit trail of who changed what, when, and why. When the system's behavior changes unexpectedly, there is no mechanism to diagnose whether it was a data change, a model change, or a configuration change. Compliance requirements for model governance are unmet.

### 2.2 Business Impact


| Impact                           | Current State                                                                                          | Cost                                                          |
| -------------------------------- | ------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------- |
| **Suboptimal model performance** | Default thresholds produce 20-30% false positive rates in anomaly detection                            | Alert fatigue, ignored warnings, missed genuine risks         |
| **Untuned forecasting models**   | Generic win probability model AUC of 0.65 vs. tuned 0.80+                                              | 15-25% forecast accuracy loss                                 |
| **Inconsistent automation**      | Manual processes where automation should exist; no automation rules for connecting insights to actions | Delayed response to risk signals, inconsistent follow-through |
| **Integration fragility**        | Point-to-point integrations with no monitoring, error handling, or recovery                            | Data gaps, stale analytics, broken workflows                  |
| **Compliance risk**              | No audit trail of model configuration changes                                                          | Regulatory exposure in model-governed environments            |
| **Operator bottleneck**          | Configuration changes require engineering intervention                                                 | Slow adaptation, accumulated technical debt                   |


---

## 3. Goals and Objectives


| ID  | Goal                                                                                                                                                                                     | Success Metric                                                                                                                        |
| --- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| G1  | **Make engine tuning accessible to non-technical operators** — RevOps and sales leadership should be able to adjust system behavior without engineering support                          | ≥80% of configuration changes made by non-technical operators within 3 months of launch                                               |
| G2  | **Ensure configuration safety** — prevent configuration changes that degrade system performance, and provide rollback capability for all changes                                         | Zero uncaught configuration errors; 100% of changes reversible within 1 click                                                         |
| G3  | **Provide configuration intelligence** — help operators understand the impact of configuration changes before applying them, and recommend optimal settings based on data                | Configuration recommendations accepted rate ≥60%; system-generated tuning suggestions produce measurable improvement in ≥70% of cases |
| G4  | **Enable automation** — allow operators to define rules that connect system outputs (insights, anomalies, patterns) to actions (notifications, task creation, data updates, escalations) | ≥50% of recurring insight-to-action workflows automated within 6 months                                                               |
| G5  | **Manage integrations reliably** — provide robust integration management with monitoring, error handling, and recovery for all data connections                                          | Integration uptime ≥99.5%; data latency within configured SLA for ≥99% of records                                                     |
| G6  | **Maintain full auditability** — every configuration change, automation execution, and integration event logged with attribution and context                                             | 100% audit coverage; compliance audit pass rate 100%                                                                                  |
| G7  | **Support progressive sophistication** — start simple for new deployments, progressively unlock advanced configuration as the organization matures                                       | ≥90% of operators successfully complete initial setup wizard; advanced features used by ≥40% of operators within 6 months             |


---

## 4. Target Users and Personas

### 4.1 Primary Users

**P1: RevOps Administrator**

- The primary operator of the Settings module. Configures analytical engines, defines automation rules, manages integrations, and governs access controls.
- Technical level: Moderate — comfortable with data concepts, thresholds, and rule logic, but not a data scientist or engineer.
- Key concerns: *Does this change make the system better or worse? What happens if I break something? How do I know what to set this threshold to?*
- Interaction: Weekly configuration review, ad hoc adjustments based on feedback.

**P2: Sales Operations Manager**

- Uses simplified configuration views to adjust settings that affect their team — health score weights, coverage targets, notification preferences, and automation rules for their domain.
- Technical level: Low to moderate — needs clear explanations and guided experiences.
- Key concerns: *Will this change help my team? Can I see what the system is doing and why?*
- Interaction: Monthly tuning sessions, ad hoc during planning cycles.

### 4.2 Secondary Users

**P3: Platform Engineer / Technical Admin**

- Manages integrations, API keys, data pipeline configuration, and advanced technical settings.
- Technical level: High — comfortable with APIs, webhooks, data schemas, and infrastructure.
- Key concerns: *Is the data pipeline healthy? Are integrations running? Is the API responding within SLA?*
- Interaction: Ongoing monitoring, incident response, quarterly capacity planning.

**P4: VP of Sales / CRO**

- Reviews and approves significant configuration changes (risk appetite settings, forecast model weights) and reviews configuration audit logs.
- Technical level: Low — needs executive-level summaries and clear impact descriptions.
- Key concerns: *Is the system configured to reflect our strategy? Can I trust the outputs?*
- Interaction: Monthly governance review, approval workflows.

**P5: Compliance / Audit Officer**

- Reviews configuration audit logs, validates model governance, and ensures regulatory compliance.
- Technical level: Low to moderate — needs structured audit reports and policy compliance indicators.
- Key concerns: *Can we demonstrate that our models are governed? Do we have a complete audit trail?*
- Interaction: Quarterly audit review, ad hoc compliance requests.

---

## 5. Information Architecture

```
Enterprise Deal Commander
├── Dashboard (existing)
├── Deal Pipeline (existing)
├── Pipeline Analytics
├── Portfolio Risk Analysis
├── Closed-Lost Autopsy
├── Deal Memory
├── Settings                               ← ENHANCED MODULE
│   ├── Configuration Home
│   │   ├── System Health Overview
│   │   ├── Configuration Status Dashboard
│   │   ├── Recent Changes Feed
│   │   ├── Tuning Recommendations
│   │   └── Quick Actions
│   ├── Engine Tuning
│   │   ├── Pipeline Analytics Engine
│   │   │   ├── Health Score Configuration
│   │   │   ├── Forecast Model Tuning
│   │   │   ├── Velocity & Conversion Targets
│   │   │   ├── Bottleneck Detection Parameters
│   │   │   ├── Anomaly Detection Sensitivity
│   │   │   └── Leading Indicator Management
│   │   ├── Portfolio Risk Engine
│   │   │   ├── Risk Dimension Weights
│   │   │   ├── Correlation Thresholds
│   │   │   ├── Clustering Configuration
│   │   │   ├── Anomaly Detection Parameters
│   │   │   ├── Risk Appetite Framework
│   │   │   └── Propagation Model Settings
│   │   ├── Closed-Lost Autopsy Engine
│   │   │   ├── Loss Risk Scoring Weights
│   │   │   ├── Pattern Detection Thresholds
│   │   │   ├── Behavioral Anti-Pattern Rules
│   │   │   ├── NLP Extraction Configuration
│   │   │   ├── Autopsy Form Configuration
│   │   │   └── Intervention Rules
│   │   ├── Deal Memory Engine
│   │   │   ├── Search Configuration
│   │   │   ├── Embedding Model Settings
│   │   │   ├── Knowledge Extraction Rules
│   │   │   ├── Decay Detection Parameters
│   │   │   ├── AI Advisor Behavior
│   │   │   └── Contribution Scoring
│   │   └── Cross-Module Tuning
│   │       ├── Shared Parameter Registry
│   │       ├── Model Lifecycle Management
│   │       └── A/B Testing Framework
│   ├── Automation
│   │   ├── Rule Builder
│   │   │   ├── Automation Rule Editor
│   │   │   ├── Trigger Library
│   │   │   ├── Action Library
│   │   │   ├── Condition Builder
│   │   │   └── Rule Templates
│   │   ├── Active Rules Dashboard
│   │   │   ├── Rule List (with status, metrics)
│   │   │   ├── Rule Execution History
│   │   │   ├── Rule Performance Metrics
│   │   │   └── Rule Conflict Detection
│   │   ├── Scheduled Tasks
│   │   │   ├── Task Scheduler
│   │   │   ├── Task Execution History
│   │   │   └── Task Health Monitoring
│   │   └── Workflow Orchestrator
│   │       ├── Multi-Step Workflow Builder
│   │       ├── Workflow Templates
│   │       ├── Workflow Execution Monitor
│   │       └── Workflow Version Control
│   ├── Integrations
│   │   ├── Connected Systems
│   │   │   ├── CRM Integration
│   │   │   ├── Email & Calendar Integration
│   │   │   ├── Communication Platform Integration
│   │   │   ├── Document Management Integration
│   │   │   ├── BI & Analytics Integration
│   │   │   └── Custom Integrations
│   │   ├── Data Pipeline Monitor
│   │   │   ├── Pipeline Health Dashboard
│   │   │   ├── Data Flow Visualization
│   │   │   ├── Error Log & Recovery
│   │   │   └── Data Quality Monitor
│   │   ├── API Management
│   │   │   ├── API Key Management
│   │   │   ├── Rate Limit Configuration
│   │   │   ├── Webhook Management
│   │   │   └── API Usage Analytics
│   │   └── Integration Marketplace
│   │       ├── Available Integrations
│   │       ├── Integration Requests
│   │       └── Custom Integration Builder
│   ├── Access & Security
│   │   ├── Role Management
│   │   │   ├── Role Definitions
│   │   │   ├── Permission Matrix
│   │   │   ├── Role Hierarchy
│   │   │   └── Custom Role Builder
│   │   ├── User Management
│   │   │   ├── User Directory
│   │   │   ├── User-Role Assignment
│   │   │   ├── Team Structure Management
│   │   │   └── User Activity Monitor
│   │   ├── Data Access Policies
│   │   │   ├── Territory-Based Access
│   │   │   ├── Data Classification Rules
│   │   │   ├── PII Handling Policies
│   │   │   └── Export & Download Controls
│   │   └── Security Configuration
│   │       ├── Authentication Settings
│   │       ├── Session Management
│   │       ├── IP Allowlisting
│   │       └── Security Audit Log
│   ├── Data Management
│   │   ├── Data Quality Dashboard
│   │   │   ├── Quality Score Overview
│   │   │   ├── Field Completeness Monitor
│   │   │   ├── Data Freshness Tracker
│   │   │   └── Anomaly Detection (data-level)
│   │   ├── Field Mapping & Enrichment
│   │   │   ├── CRM Field Mapping
│   │   │   ├── Custom Field Configuration
│   │   │   ├── Computed Field Definitions
│   │   │   └── Data Enrichment Rules
│   │   ├── Data Retention & Archival
│   │   │   ├── Retention Policy Configuration
│   │   │   ├── Archival Rules
│   │   │   ├── Data Purge Scheduler
│   │   │   └── Backup Configuration
│   │   └── Entity Management
│   │       ├── Customer Entity Registry
│   │       ├── Product Taxonomy
│   │       ├── Competitor Registry
│   │       ├── Segment Definitions
│   │       └── Stage & Status Definitions
│   └── Governance & Audit
│       ├── Configuration Audit Log
│       │   ├── Change History (all settings)
│       │   ├── Change Attribution
│       │   ├── Rollback Manager
│       │   └── Change Impact Reports
│       ├── Model Governance
│       │   ├── Model Registry
│       │   ├── Model Version History
│       │   ├── Model Performance Tracking
│       │   ├── Model Approval Workflow
│       │   └── Model Bias Monitoring
│       ├── Compliance Reports
│       │   ├── Configuration Compliance Status
│       │   ├── Data Handling Compliance
│       │   ├── Access Control Audit
│       │   └── Automated Compliance Checks
│       └── System Documentation
│           ├── Configuration Guide
│           ├── Parameter Reference
│           ├── Integration Guide
│           └── API Documentation
```

---

## 6. Functional Requirements

### 6.1 Configuration Home

#### 6.1.1 System Health Overview

**FR-6.1.1.1**: The Configuration Home page shall display a **System Health Overview** providing at-a-glance status of all EDC engines and integrations.

**FR-6.1.1.2**: The overview shall render as a **status grid** with one row per engine:


| Engine                     | Status Indicators                                                              |
| -------------------------- | ------------------------------------------------------------------------------ |
| Pipeline Analytics Engine  | Model accuracy (AUC), last retrain, data freshness, computation health         |
| Portfolio Risk Engine      | Correlation computation health, anomaly detection status, clustering stability |
| Closed-Lost Autopsy Engine | Pattern detection health, NLP pipeline status, extraction queue depth          |
| Deal Memory Engine         | Search index health, embedding freshness, AI advisor response time             |
| Automation Engine          | Active rules count, execution success rate, queue depth                        |
| Integration Layer          | Connection status per integration, data latency, error rate                    |


**FR-6.1.1.3**: Each engine row shall display:

- Engine name in `text-sm font-semibold`
- Status indicator: green circle (healthy), amber circle (degraded), red circle (error)
- Last computation timestamp
- Key metric with trend arrow
- Click-through to the engine's detailed configuration

**FR-6.1.1.4**: The overview shall include a **composite system health score** (0-100) displayed as a prominent gauge at the top of the page.

#### 6.1.2 Configuration Status Dashboard

**FR-6.1.2.1**: The dashboard shall display the **maturity level** of the platform's configuration:

```
Configuration Maturity Levels:
├── Level 1: Default Configuration (using factory defaults)
├── Level 2: Basic Tuning (major thresholds adjusted)
├── Level 3: Advanced Tuning (model parameters, weights optimized)
├── Level 4: Custom Automation (automation rules active)
├── Level 5: Fully Optimized (A/B tested, data-driven configuration)
```

**FR-6.1.2.2**: The maturity level shall be computed as a composite of:

- Percentage of configurable parameters that have been adjusted from defaults
- Whether automation rules are active
- Whether models have been retrained with organization-specific data
- Whether A/B tests have been conducted on configuration changes
- Configuration quality score (are the chosen values reasonable given the data?)

**FR-6.1.2.3**: Each maturity level shall display what actions are needed to advance to the next level, presented as a **checklist** with completion indicators.

#### 6.1.3 Recent Changes Feed

**FR-6.1.3.1**: The home page shall display a **feed of recent configuration changes** across all engines and settings.

**FR-6.1.3.2**: Each change entry shall show:

- What was changed (parameter name, engine)
- Previous value → New value
- Who made the change
- When the change was made
- Reason (if provided) or "No reason provided"
- Impact assessment (if computed): "This change is expected to increase anomaly detection sensitivity by \~15%"

**FR-6.1.3.3**: Changes shall be **rollback-able** — each entry shall include a "Revert" button that restores the previous value.

#### 6.1.4 Tuning Recommendations

**FR-6.1.4.1**: The system shall generate **data-driven tuning recommendations** — suggestions for configuration changes that would improve system performance based on analysis of actual outcomes vs. predicted outcomes.

**FR-6.1.4.2**: Recommendation types:


| Type                      | Example                                                                                                                                                                                                    |
| ------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Threshold adjustment**  | "Bottleneck detection threshold is producing 35% false positives. Raising accumulation ratio from 1.5 to 1.8 would reduce false positives to \~10% while retaining 90% of true positives."                 |
| **Weight optimization**   | "Health score velocity component has low correlation with actual quarter outcomes. Reducing its weight from 0.20 to 0.10 and increasing conversion weight would improve score-outcome correlation by 12%." |
| **Model retraining**      | "Forecast model AUC has degraded from 0.82 to 0.74 over the last 30 days. Retraining with recent data is recommended."                                                                                     |
| **New pattern threshold** | "Pattern detection is finding 45% more actionable patterns with support threshold reduced from 3% to 2%. Consider lowering the threshold."                                                                 |
| **Automation suggestion** | "85% of deals flagged by the anomaly detector receive no follow-up action within 7 days. Consider creating an automation rule to assign review tasks."                                                     |
| **Integration health**    | "CRM sync latency has increased from 2 minutes to 15 minutes over the last week. Investigating the integration is recommended."                                                                            |


**FR-6.1.4.3**: Each recommendation shall be displayed as a **recommendation card** with:

- Recommendation title and description
- Expected impact (quantified where possible)
- Confidence level (high / medium / low — based on statistical analysis)
- "Apply" button (for simple parameter changes) or "Investigate" button (for complex changes)
- "Dismiss" button with reason capture
- Supporting evidence (data visualization or summary)

**FR-6.1.4.4**: Recommendations shall be generated by a **background analysis job** that runs weekly and compares system performance metrics against configuration parameters.

#### 6.1.5 Quick Actions

**FR-6.1.5.1**: The home page shall provide **quick action buttons** for the most common configuration tasks:

- "Retrain Forecast Model"
- "Run Pattern Detection Now"
- "Recompute Risk Scores"
- "Sync CRM Data"
- "Export Configuration Backup"
- "View System Alerts"

**FR-6.1.5.2**: Quick actions shall execute with a confirmation dialog showing what the action will do and any expected impact.

---

### 6.2 Engine Tuning

#### 6.2.1 Pipeline Analytics Engine

##### 6.2.1.1 Health Score Configuration

**FR-6.2.1.1.1**: The system shall provide an **interactive Health Score configurator** that allows operators to adjust the weights and components of the Pipeline Health Score.

**FR-6.2.1.1.2**: The configurator shall display:

- Each health score component (Coverage, Velocity, Conversion, Generation, Age, Attrition) as an adjustable weight slider
- Real-time preview of how the current quarter's health score would change with the proposed weights
- Historical correlation between each component and actual quarter outcomes (showing which components are most predictive)
- Recommended weights based on correlation analysis (data-driven suggestions)

**FR-6.2.1.1.3**: Weight sliders shall be constrained to:

- Minimum weight: 0.0 (component excluded)
- Maximum weight: 0.5 (no single component can dominate)
- Weights must sum to 1.0 (auto-normalized)

**FR-6.2.1.1.4**: The configurator shall include a **simulation mode** where operators can adjust weights and immediately see the impact on historical health scores and their correlation with actual outcomes.

**FR-6.2.1.1.5**: The configurator shall include a **component editor** for each health score component, allowing operators to:

- Define what metrics comprise each component
- Set normalization parameters (what constitutes "good" vs. "bad" for each metric)
- Configure the time window for historical comparison

##### 6.2.1.2 Forecast Model Tuning

**FR-6.2.1.2.1**: The system shall provide a **Forecast Model Management** interface showing:

- Current model version, type (ensemble composition), and performance metrics (AUC, Brier score, calibration)
- Training data summary (date range, sample size, feature count)
- Feature importance rankings with interactive visualization
- Model performance trend over time

**FR-6.2.1.2.2**: The interface shall support **model retraining** with configurable parameters:

- Training window (how many months of historical data to use)
- Retraining schedule (weekly, bi-weekly, monthly)
- Feature selection (enable/disable specific feature categories)
- Hyperparameter overrides (for advanced users)

**FR-6.2.1.2.3**: The interface shall provide a **model comparison view** that allows operators to:

- Compare current model performance against previous versions
- Compare against baseline models (stage-weighted, simple regression)
- View calibration plots showing predicted vs. observed win rates
- Identify segments where the model is systematically biased

**FR-6.2.1.2.4**: The interface shall support **A/B testing** of model versions:

- Deploy a new model version alongside the current version
- Split predictions between versions
- Track performance metrics for each version
- Auto-recommend winner after sufficient data accumulation

**FR-6.2.1.2.5**: The interface shall display a **feature management** panel where operators can:

- View all features used by the model with descriptions
- See feature importance rankings
- Enable or disable specific features
- Add custom computed features using a formula editor
- View feature drift indicators (are features changing distribution over time?)

##### 6.2.1.3 Velocity and Conversion Targets

**FR-6.2.1.3.1**: The system shall provide a **target configuration interface** for setting organizational targets that drive health score calculations and alert thresholds:


| Target Category             | Configurable Targets                           |
| --------------------------- | ---------------------------------------------- |
| **Stage velocity targets**  | Target residence time per stage (days)         |
| **Conversion rate targets** | Target stage-to-stage conversion rates         |
| **Coverage ratio targets**  | Target coverage by segment and time period     |
| **Win rate targets**        | Target win rate by segment, product, deal size |
| **Cycle time targets**      | Target total cycle time by deal type           |
| **Generation targets**      | Target pipeline generation rate by period      |


**FR-6.2.1.3.2**: Targets shall support:

- Global defaults
- Segment-specific overrides (e.g., enterprise deals have longer cycle targets than mid-market)
- Time-period-specific overrides (e.g., Q4 targets differ from Q1)
- Historical baseline reference (show the target alongside the historical actual for context)

**FR-6.2.1.3.3**: The interface shall display a **target vs. actual** comparison for each configured target, showing how the organization is currently performing relative to its goals.

##### 6.2.1.4 Bottleneck Detection Parameters

**FR-6.2.1.4.1**: The system shall provide an interface for configuring the bottleneck detection algorithm:


| Parameter                  | Description                                                  | Default     | Range         |
| -------------------------- | ------------------------------------------------------------ | ----------- | ------------- |
| Minimum accumulation ratio | Threshold for flagging a stage as a bottleneck               | 1.5x        | 1.2 – 3.0     |
| Minimum velocity ratio     | Threshold for elevated stage velocity                        | 1.3x        | 1.1 – 2.0     |
| Historical baseline window | How far back to look for baseline comparison                 | 12 months   | 3 – 24 months |
| Minimum deals in stage     | Minimum deal count before bottleneck detection activates     | 5           | 2 – 20        |
| Severity thresholds        | Accumulation ratios for moderate/elevated/critical severity  | 1.5/2.0/3.0 | Configurable  |
| Healthy accumulation check | Whether to distinguish healthy high-volume from pathological | Enabled     | Toggle        |


**FR-6.2.1.4.2**: The interface shall include a **detection simulator** that shows how the current parameters would have performed on the last 90 days of data:

- True positives (bottlenecks correctly identified)
- False positives (non-bottlenecks incorrectly flagged)
- False negatives (bottlenecks missed)
- Precision and recall metrics

**FR-6.2.1.4.3**: Operators shall be able to **adjust parameters and immediately see the impact** on historical precision and recall, enabling data-driven threshold selection.

##### 6.2.1.5 Anomaly Detection Sensitivity

**FR-6.2.1.5.1**: The system shall provide an interface for configuring anomaly detection across Pipeline Analytics:


| Parameter                        | Description                                      | Default  |
| -------------------------------- | ------------------------------------------------ | -------- |
| Detection method                 | Isolation Forest, Z-score, or hybrid             | Hybrid   |
| Z-score threshold                | Sigma deviation for univariate anomaly detection | 2.5      |
| Isolation Forest contamination   | Expected proportion of anomalies                 | 0.05     |
| Baseline window                  | Rolling window for baseline computation          | 90 days  |
| Decay weighting                  | Exponential decay factor for baseline            | 0.95     |
| Minimum alert threshold          | Minimum severity for surfacing alerts            | Moderate |
| Alert grouping window            | Time window for grouping related anomalies       | 24 hours |
| Zombie deal inactivity threshold | Days of inactivity before flagging as zombie     | 30       |


**FR-6.2.1.5.2**: The interface shall include a **sensitivity dial** — a high-level control that adjusts multiple underlying parameters simultaneously:

- **Conservative**: Fewer alerts, higher confidence (lower false positives, may miss some real anomalies)
- **Balanced**: Default settings
- **Aggressive**: More alerts, broader detection (catches more anomalies, higher false positive rate)

**FR-6.2.1.5.3**: The interface shall display the **estimated alert volume** at each sensitivity setting based on historical data, helping operators understand the trade-off between sensitivity and noise.

##### 6.2.1.6 Leading Indicator Management

**FR-6.2.1.6.1**: The system shall provide an interface for managing leading indicators:

**FR-6.2.1.6.2**: The interface shall display all configured leading indicators with:

- Indicator name and description
- Data source
- Predictive horizon (days)
- Correlation strength with predicted outcome
- Last Granger causality test result
- Historical accuracy
- Status (active, monitoring, deprecated)

**FR-6.2.1.6.3**: Operators shall be able to:

- Add new custom leading indicators by defining the data source and metric computation
- Adjust indicator parameters (lag window, threshold values)
- Enable or disable indicators
- View detailed validation reports for each indicator

**FR-6.2.1.6.4**: The system shall support **auto-discovery** of leading indicators — an automated process that scans all available data dimensions for Granger-causal relationships with pipeline outcomes.

#### 6.2.2 Portfolio Risk Engine

##### 6.2.2.1 Risk Dimension Weights

**FR-6.2.2.1.1**: The system shall provide an interface for configuring the weights of each risk dimension in the portfolio risk score:


| Risk Dimension            | Description                             | Default Weight |
| ------------------------- | --------------------------------------- | -------------- |
| Discount Aggressiveness   | Tendency to over-discount               | 0.125          |
| Cycle Time Variance       | Deviation from expected cycle time      | 0.125          |
| Stage Regression Rate     | Frequency of backward stage movement    | 0.125          |
| Stakeholder Depth         | Engagement depth across buying roles    | 0.125          |
| Competitive Loss Rate     | Loss rate in competitive deals          | 0.125          |
| Escalation Frequency      | Rate of management escalations          | 0.125          |
| Value Realization Score   | Alignment of solution to customer needs | 0.125          |
| Technical Risk Propensity | Selling into technically complex areas  | 0.125          |


**FR-6.2.2.1.2**: The interface shall include a **dimension correlation matrix** showing how each risk dimension correlates with actual deal outcomes, helping operators understand which dimensions are most predictive and should receive higher weights.

**FR-6.2.2.1.3**: Operators shall be able to:

- Adjust weights via sliders (constrained to sum to 1.0)
- Add custom risk dimensions with computation formulas
- Remove dimensions (setting weight to 0)
- View a simulation of how weight changes would affect current portfolio risk scores

##### 6.2.2.2 Correlation Thresholds

**FR-6.2.2.2.1**: The system shall provide configuration for correlation analysis thresholds:


| Parameter                      | Description                                                   | Default |
| ------------------------------ | ------------------------------------------------------------- | ------- |
| Minimum correlation (          | r                                                             | )       |
| Maximum p-value                | Above this, correlations are considered insignificant         | 0.05    |
| Minimum sample size            | Minimum deals per intersection for valid correlation          | 10      |
| Temporal stability requirement | Minimum periods a correlation must hold to be confirmed       | 2       |
| Significance correction        | Multiple comparison correction method (Bonferroni, FDR, none) | FDR     |


##### 6.2.2.3 Clustering Configuration

**FR-6.2.2.3.1**: The system shall provide configuration for the clustering algorithm:


| Parameter                    | Description                                      | Default     |
| ---------------------------- | ------------------------------------------------ | ----------- |
| Clustering method            | Ward hierarchical, K-means, K-medoids, DBSCAN    | Ward        |
| Distance metric              | Correlation-based, Euclidean, Manhattan          | Correlation |
| Optimal cluster count method | Silhouette, elbow, gap statistic                 | Silhouette  |
| Maximum clusters             | Upper bound for cluster count                    | sqrt(N)     |
| Cluster stability check      | Require cluster consistency across multiple runs | Enabled     |
| Comparison mode              | Show results from multiple methods side-by-side  | Enabled     |


**FR-6.2.2.3.2**: The interface shall include a **cluster visualization preview** showing how the current configuration produces clusters on the most recent data, with silhouette scores displayed.

**FR-6.2.2.3.3**: Consistent with the Portfolio Risk Analysis research on multi-methodology clustering, the interface shall allow operators to **compare clustering results** from different methods on the same data, highlighting where methods agree and disagree.

##### 6.2.2.4 Risk Appetite Framework

**FR-6.2.2.4.1**: The system shall provide configuration for the organizational **risk appetite framework** — the boundaries within which risk is acceptable.

**FR-6.2.2.4.2**: The framework configuration shall include:


| Appetite Dimension         | Configuration                                                                                                          |
| -------------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| **Overall portfolio risk** | Acceptable range for composite risk score (e.g., 0-60 is green, 61-80 is amber, 81-100 is red)                         |
| **Per-dimension limits**   | Acceptable range for each risk dimension individually                                                                  |
| **Concentration limits**   | Maximum acceptable concentration of risk in any single cluster (e.g., no cluster should contain &gt;30% of total risk) |
| **Diversification floor**  | Minimum acceptable diversification index                                                                               |
| **Correlation ceiling**    | Maximum acceptable correlation between any two team members' risk profiles                                             |
| **Anomaly tolerance**      | Maximum acceptable number of active anomalies before escalation                                                        |


**FR-6.2.2.4.3**: Each appetite limit shall support:

- Green / amber / red thresholds
- Automatic alert generation when thresholds are breached
- Escalation rules (who is notified at each threshold level)
- Override capability for temporary adjustments (e.g., quarter-end relaxation)

**FR-6.2.2.4.4**: The risk appetite configuration shall be **version-controlled** with approval workflow — changes to appetite limits require review by at least one other authorized user.

#### 6.2.3 Closed-Lost Autopsy Engine

##### 6.2.3.1 Loss Risk Scoring Weights

**FR-6.2.3.1.1**: The system shall provide configuration for the loss risk scoring model, including:

- Signature matching weight (how much loss signatures contribute to the overall risk score)
- Temporal sequence matching weight
- Behavioral anti-pattern weight
- Stage-based calibration adjustments (baseline loss risk varies by stage)
- Score-to-risk-level mapping (what score ranges map to watch / alert / critical)

##### 6.2.3.2 Pattern Detection Thresholds

**FR-6.2.3.2.1**: The system shall provide configuration for the association rule mining and sequential pattern mining engines:


| Parameter                           | Description                                                   | Default |
| ----------------------------------- | ------------------------------------------------------------- | ------- |
| Minimum support (signatures)        | Minimum proportion of deals a signature must cover            | 2%      |
| Minimum confidence (signatures)     | Minimum loss rate within the signature                        | 50%     |
| Minimum lift (signatures)           | Minimum lift over baseline loss rate                          | 2.0x    |
| Minimum p-value                     | Statistical significance threshold                            | 0.01    |
| Temporal stability periods          | Quarters a pattern must persist                               | 2       |
| Minimum sequence support (temporal) | Minimum proportion of losses containing the sequence          | 5%      |
| Maximum sequence length             | Maximum events in a precursor sequence                        | 15      |
| Sequence discriminative power       | Maximum win rate for sequences to be considered loss-specific | 20%     |


**FR-6.2.3.2.2**: The interface shall include a **threshold impact analysis** showing how many patterns would be detected at different threshold levels, with a precision-recall trade-off visualization.

##### 6.2.3.3 Behavioral Anti-Pattern Rules

**FR-6.2.3.3.1**: The system shall provide an interface for defining and managing **behavioral anti-pattern rules** — the conjunction conditions that define each anti-pattern.

**FR-6.2.3.3.2**: The interface shall display each defined anti-pattern as an editable rule card:

```
Anti-Pattern: "The Single Thread"
├── Conditions:
│   ├── stakeholder_count < 2
│   ├── deal_value > 50000
│   └── loss_rate_for_pattern > 2 * baseline_loss_rate
├── Severity: High
├── Affected deals (current): 12
├── Coaching recommendation: "Engage at least 2 additional stakeholders by Stage 2"
└── Status: Active
```

**FR-6.2.3.3.3**: Operators shall be able to:

- Edit existing anti-pattern conditions
- Create new anti-patterns using a visual rule builder
- Enable/disable individual anti-patterns
- Adjust severity levels
- Preview how many current deals would match each anti-pattern

##### 6.2.3.4 Autopsy Form Configuration

**FR-6.2.3.4.1**: The system shall provide configuration for the autopsy form structure, allowing operators to:

- Enable or disable form sections
- Add custom fields to any section
- Configure field types (text, select, multi-select, slider, boolean, rich text)
- Define required vs. optional fields
- Configure loss reason taxonomy (add, modify, remove categories)
- Set SLA timelines for autopsy completion
- Configure AI pre-population behavior (which fields to auto-fill, which to leave blank)

#### 6.2.4 Deal Memory Engine

##### 6.2.4.1 Search Configuration

**FR-6.2.4.1.1**: The system shall provide configuration for search behavior:


| Parameter                       | Description                                  | Default |
| ------------------------------- | -------------------------------------------- | ------- |
| Hybrid search weight (text)     | Weight of full-text search in RRF fusion     | 0.4     |
| Hybrid search weight (semantic) | Weight of vector search in RRF fusion        | 0.6     |
| RRF constant (k)                | Reciprocal Rank Fusion constant              | 60      |
| Maximum results per page        | Results per page in search results           | 20      |
| Search suggestion count         | Number of autocomplete suggestions           | 5       |
| Minimum relevance score         | Below this score, results are not shown      | 0.15    |
| Personalization weight          | How much user context influences ranking     | 0.2     |
| Recency bias                    | How much recent deals are boosted in ranking | 0.1     |


##### 6.2.4.2 Embedding Model Settings

**FR-6.2.4.2.1**: The system shall provide configuration for the embedding model:

- Model selection (from available pre-trained or fine-tuned models)
- Embedding dimension
- Re-indexing schedule
- Fine-tuning controls (train on organization's deal corpus)
- Embedding quality metrics (retrieval precision on test queries)

##### 6.2.4.3 AI Advisor Behavior

**FR-6.2.4.3.1**: The system shall provide configuration for the AI Advisor's behavior:


| Parameter                    | Description                                                   | Default                |
| ---------------------------- | ------------------------------------------------------------- | ---------------------- |
| LLM model                    | Which language model to use                                   | Configurable           |
| Temperature                  | Creativity vs. precision (0 = precise, 1 = creative)          | 0.3                    |
| Maximum context tokens       | How much deal context to include in prompts                   | 40,000                 |
| Maximum response tokens      | Maximum response length                                       | 2,000                  |
| Citation requirement         | Whether all claims must have citations                        | Required               |
| Confidence display           | Whether to show confidence scores                             | Enabled                |
| Minimum confidence threshold | Below this, decline to answer                                 | Low (but still answer) |
| Response language            | Language for AI responses                                     | English                |
| Persona                      | Tone and style of responses (professional, casual, technical) | Professional           |
| Topic restrictions           | Topics the AI should not address                              | None (configurable)    |


##### 6.2.4.4 Decay Detection Parameters

**FR-6.2.4.4.1**: The system shall provide configuration for knowledge decay detection:


| Parameter                       | Description                                     | Default |
| ------------------------------- | ----------------------------------------------- | ------- |
| Playbook age threshold          | Days before playbook is flagged for review      | 365     |
| Competitive intel age threshold | Days before competitive intelligence is flagged | 180     |
| Insight age threshold           | Days before insight is flagged for revalidation | 270     |
| Low engagement threshold        | Days without access before flagging             | 180     |
| Product change trigger          | Flag artifacts when referenced products change  | Enabled |
| Outcome contradiction threshold | Win rate drop percentage to trigger flag        | 30%     |


#### 6.2.5 Cross-Module Tuning

##### 6.2.5.1 Shared Parameter Registry

**FR-6.2.5.1.1**: The system shall maintain a **shared parameter registry** — a centralized view of all parameters that are referenced by multiple modules.

**FR-6.2.5.1.2**: The registry shall display:

- Parameter name and description
- Current value
- Modules that reference this parameter
- Impact of changing the parameter on each module
- Change history

**FR-6.2.5.1.3**: Examples of shared parameters:

- Deal value tiers (used by Pipeline Analytics, Closed-Lost Autopsy, Deal Memory)
- Segment definitions (used by all modules)
- Stage definitions (used by Pipeline Analytics, Closed-Lost Autopsy)
- Velocity targets (used by Pipeline Analytics, Portfolio Risk Analysis)
- Risk score definitions (used by Portfolio Risk Analysis, Closed-Lost Autopsy)

**FR-6.2.5.1.4**: Changes to shared parameters shall trigger a **cross-module impact analysis** showing how the change affects each dependent module.

##### 6.2.5.2 Model Lifecycle Management

**FR-6.2.5.2.1**: The system shall provide a **centralized model registry** tracking all ML models across the platform:


| Model                       | Module                            | Current Version | Performance   | Last Retrained |
| --------------------------- | --------------------------------- | --------------- | ------------- | -------------- |
| Win Probability Ensemble    | Pipeline Analytics                | v2.3            | AUC: 0.81     | 2026-07-08     |
| Loss Risk Scorer            | Closed-Lost Autopsy               | v1.5            | AUC: 0.79     | 2026-07-01     |
| Anomaly Detector (Pipeline) | Pipeline Analytics                | v1.2            | F1: 0.74      | 2026-06-15     |
| Anomaly Detector (Risk)     | Portfolio Risk                    | v1.1            | F1: 0.71      | 2026-06-01     |
| Embedding Model             | Deal Memory                       | v1.0            | NDCG@10: 0.83 | 2026-05-15     |
| NLP Extractor               | Closed-Lost Autopsy / Deal Memory | v2.1            | F1: 0.78      | 2026-06-20     |


**FR-6.2.5.2.2**: The registry shall support:

- Version comparison (before/after retraining)
- Performance trend visualization
- Rollback to previous versions
- Approval workflow for production model changes

##### 6.2.5.3 A/B Testing Framework

**FR-6.2.5.3.1**: The system shall provide an **A/B testing framework** for configuration changes that affect model predictions or scoring:

**FR-6.2.5.3.2**: The framework shall support:

- Defining a test: variant A (current configuration) vs. variant B (proposed configuration)
- Traffic split: configurable percentage of deals/users receiving each variant
- Metric selection: which outcomes to measure (accuracy, false positive rate, user satisfaction)
- Duration: configurable test duration or sample size target
- Statistical significance: automatic computation of whether results are significant
- Winner declaration: automatic or manual promotion of the winning variant

**FR-6.2.5.3.3**: The framework shall display:

- Active tests with real-time results
- Historical test archive with outcomes
- Configuration changes that resulted from test results

---

### 6.3 Automation

#### 6.3.1 Rule Builder

##### 6.3.1.1 Automation Rule Editor

**FR-6.3.1.1.1**: The system shall provide a **visual automation rule editor** that allows operators to define rules connecting system events to automated actions.

**FR-6.3.1.1.2**: The rule editor shall use a **trigger → condition → action** paradigm:

```
TRIGGER: When [event] occurs
  ├── Example: "When an anomaly is detected with severity = Critical"
  ├── Example: "When a deal's loss risk score exceeds 70"
  ├── Example: "When pipeline coverage ratio drops below 2.0"
  ├── Example: "When a new loss pattern is confirmed"
  └── Example: "When a knowledge artifact's decay score exceeds threshold"

CONDITION: AND [additional criteria] must be true
  ├── Example: "AND deal value > $100,000"
  ├── Example: "AND deal segment = Enterprise"
  ├── Example: "AND team member's manager = [specific user]"
  └── Example: "AND it is not a weekend/holiday"

ACTION: THEN perform [action(s)]
  ├── Example: "Send Slack notification to #deal-risk channel"
  ├── Example: "Create a task in the deal owner's task list"
  ├── Example: "Send email to the deal owner's manager"
  ├── Example: "Update the deal's risk flag to 'Critical'"
  ├── Example: "Trigger the executive sponsor engagement playbook"
  ├── Example: "Add the deal to the weekly review queue"
  └── Example: "Log the event for compliance audit"
```

**FR-6.3.1.1.3**: The rule editor shall provide:

- A **trigger selector** dropdown listing all available trigger events from all modules
- A **condition builder** with visual clause construction (field → operator → value)
- An **action selector** with categorized action types
- **Logical operators** (AND, OR, NOT) for combining conditions
- **Variable references** — the ability to reference data from the triggering event in action parameters (e.g., "Send notification with deal name {{deal.name}} and value {{deal.value}}")
- **Delay actions** — the ability to schedule actions with a delay (e.g., "Wait 3 days, then check if the condition still holds before acting")
- **Escalation chains** — the ability to define escalation sequences (e.g., "Notify seller → If not acknowledged in 24 hours, notify manager → If not acknowledged in 48 hours, notify VP")

**FR-6.3.1.1.4**: The rule editor shall include **validation** that checks:

- Trigger validity (does the trigger event exist?)
- Condition validity (do the referenced fields and operators make sense?)
- Action validity (are the required integrations and permissions available?)
- Potential conflicts with existing rules

##### 6.3.1.2 Trigger Library

**FR-6.3.1.2.1**: The system shall provide a **Trigger Library** — a categorized catalog of all available trigger events:


| Category                | Trigger Events                                                                                                                                                                            |
| ----------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Pipeline Analytics**  | Health score change, coverage ratio threshold breach, velocity anomaly detected, bottleneck detected, forecast divergence threshold, generation rate below target, win probability change |
| **Portfolio Risk**      | Risk score change, correlation cluster change, anomaly detected, risk appetite breach, diversification index change, propagation alert                                                    |
| **Closed-Lost Autopsy** | Deal closed-lost, autopsy completed, loss pattern confirmed, loss pattern emerging, loss risk score threshold, intervention recommended, SLA breach (autopsy not completed)               |
| **Deal Memory**         | Knowledge artifact created, artifact decay detected, contribution submitted, search zero-result, AI advisor low confidence                                                                |
| **Integration**         | Data sync completed, sync error, data quality issue, integration health change                                                                                                            |
| **Automation**          | Rule execution failure, scheduled task failure, escalation triggered                                                                                                                      |
| **System**              | Configuration change, model retrained, user login/logout, export completed                                                                                                                |


**FR-6.3.1.2.2**: Each trigger shall display:

- Name and description
- Available data fields (for use in conditions and actions)
- Frequency (how often this event occurs on average)
- Existing rules that use this trigger

##### 6.3.1.3 Action Library

**FR-6.3.1.3.1**: The system shall provide an **Action Library** — a categorized catalog of all available automated actions:


| Category              | Actions                                                                                   |
| --------------------- | ----------------------------------------------------------------------------------------- |
| **Notifications**     | Send email, send Slack message, send in-app notification, send SMS, send webhook          |
| **Task Management**   | Create task, assign task, update task status, escalate task                               |
| **Data Updates**      | Update deal field, update risk flag, update deal category, add tag, remove tag            |
| **Pipeline Actions**  | Add deal to review queue, flag deal for manager review, update commit category            |
| **Knowledge Actions** | Create knowledge artifact, submit for review, update artifact status, generate case study |
| **Reporting**         | Generate report, export data, update dashboard widget                                     |
| **Integration**       | Call external API, create CRM task, update CRM record, trigger external webhook           |
| **Governance**        | Log audit event, trigger approval workflow, send compliance notification                  |


##### 6.3.1.4 Rule Templates

**FR-6.3.1.4.1**: The system shall provide **pre-built rule templates** for common automation scenarios:


| Template                           | Trigger                                      | Condition                      | Action                                                  |
| ---------------------------------- | -------------------------------------------- | ------------------------------ | ------------------------------------------------------- |
| **Critical anomaly alert**         | Anomaly detected (Critical severity)         | Deal value &gt; $50K           | Notify deal owner + manager via Slack and email         |
| **Loss risk escalation**           | Loss risk score &gt; 70                      | Deal in Stage 3+               | Add to manager's weekly review queue                    |
| **Coverage warning**               | Coverage ratio &lt; 2.0                      | Current quarter                | Notify VP Sales via email                               |
| **Autopsy SLA reminder**           | 3 business days after deal closed-lost       | Autopsy not completed          | Send reminder to deal owner                             |
| **Pattern alert to product**       | Product-related loss pattern confirmed       | Revenue impact &gt; $500K      | Create product team ticket                              |
| **Stale deal alert**               | Zombie deal detected                         | Deal value &gt; $25K           | Notify deal owner + add to review queue                 |
| **Knowledge decay review**         | Artifact decay detected (Critical)           | Artifact type = Playbook       | Assign review task to content owner                     |
| **New seller onboarding**          | New user account created                     | Role = Account Executive       | Trigger Onboarding Tutor + assign learning path         |
| **Forecast divergence alert**      | AI vs. management forecast &gt; 15%          | Current quarter                | Notify CRO with divergence analysis                     |
| **Competitive displacement alert** | Competitor encounter rate increased &gt; 20% | Last 30 days vs. prior 30 days | Generate competitive briefing + notify sales leadership |


**FR-6.3.1.4.2**: Templates shall be **customizable** — operators can use a template as a starting point and modify conditions, actions, or thresholds.

**FR-6.3.1.4.3**: Templates shall include **estimated impact** — how many times this rule would have triggered in the last 90 days based on historical data.

#### 6.3.2 Active Rules Dashboard

**FR-6.3.2.1**: The system shall provide a **dashboard of all active automation rules** with:


| Column                | Description                                          |
| --------------------- | ---------------------------------------------------- |
| Rule name             | Descriptive name                                     |
| Status                | Active, paused, draft, error                         |
| Trigger               | What event triggers the rule                         |
| Execution count (30d) | How many times the rule fired in the last 30 days    |
| Success rate          | Percentage of executions that completed successfully |
| Last fired            | When the rule last triggered                         |
| Created by            | Who created the rule                                 |
| Actions               | Edit, pause/resume, duplicate, delete, view history  |


**FR-6.3.2.2**: The dashboard shall include **rule performance metrics**:

- Total rules active
- Total executions (30d)
- Overall success rate
- Most-triggered rules
- Least-triggered rules (candidates for review)
- Rules with errors

**FR-6.3.2.3**: The dashboard shall include **rule conflict detection** — identifying rules that may interfere with each other (e.g., two rules that both try to update the same field with different values based on the same trigger).

#### 6.3.3 Scheduled Tasks

**FR-6.3.3.1**: The system shall provide a **task scheduler** for configuring periodic automated tasks:


| Task Category            | Available Tasks                                                                    |
| ------------------------ | ---------------------------------------------------------------------------------- |
| **Data refresh**         | CRM data sync, activity data sync, document re-indexing                            |
| **Computation**          | Snapshot generation, correlation computation, pattern detection, model retraining  |
| **Report generation**    | Weekly pipeline report, monthly loss intelligence report, quarterly segment report |
| **Maintenance**          | Data quality check, decay detection, audit log archival, backup                    |
| **Knowledge extraction** | Insight extraction, case study generation, embedding re-indexing                   |


**FR-6.3.3.2**: Each scheduled task shall be configurable with:

- Schedule (cron expression or simplified presets: daily, weekly, monthly, quarterly)
- Time zone
- Retry policy (max retries, backoff strategy)
- Timeout
- Notification on failure
- Dependencies (task B runs after task A completes)

**FR-6.3.3.3**: The task scheduler shall display a **timeline view** showing all scheduled tasks on a Gantt-style chart, enabling operators to identify scheduling conflicts and resource contention.

#### 6.3.4 Workflow Orchestrator

**FR-6.3.4.1**: The system shall provide a **visual workflow orchestrator** for building multi-step automation workflows that go beyond simple trigger-condition-action rules.

**FR-6.3.4.2**: The workflow orchestrator shall support:


| Node Type             | Description                                      |
| --------------------- | ------------------------------------------------ |
| **Trigger**           | Starting event                                   |
| **Condition**         | Branch based on criteria                         |
| **Action**            | Perform an action                                |
| **Wait**              | Pause for a duration or until a condition is met |
| **Loop**              | Repeat an action for a collection of items       |
| **Parallel**          | Execute multiple branches simultaneously         |
| **Merge**             | Wait for multiple parallel branches to complete  |
| **Sub-workflow**      | Invoke another workflow                          |
| **Human-in-the-loop** | Pause for human approval/input                   |
| **Error handler**     | Catch and handle errors from preceding nodes     |


**FR-6.3.4.3**: The workflow orchestrator shall render as a **node-and-edge visual editor** where:

- Nodes are rendered as rounded rectangles with type-specific icons and colors
- Edges connect nodes with directional arrows
- Nodes can be dragged, connected, and configured inline
- The canvas supports zoom and pan
- Workflows can be saved, versioned, and shared

**FR-6.3.4.4**: Example workflow:

```
[Trigger: Deal closed-lost]
    → [Condition: Deal value > $100K?]
        → Yes:
            → [Action: Create autopsy queue entry]
            → [Wait: 3 business days]
            → [Condition: Autopsy completed?]
                → No:
                    → [Action: Send reminder to deal owner]
                    → [Wait: 2 business days]
                    → [Condition: Autopsy completed?]
                        → No:
                            → [Action: Escalate to manager]
                            → [Action: Log SLA breach]
                        → Yes:
                            → [Action: Mark SLA met]
                → Yes:
                    → [Action: Route to pattern detection]
                    → [Action: Update Deal Memory knowledge base]
                    → [Condition: Pattern match found?]
                        → Yes:
                            → [Action: Create pattern alert]
                            → [Condition: Product gap identified?]
                                → Yes:
                                    → [Action: Create product team feedback]
        → No:
            → [Action: Auto-generate basic autopsy from CRM data]
```

---

### 6.4 Integrations

#### 6.4.1 Connected Systems

##### 6.4.1.1 CRM Integration

**FR-6.4.1.1.1**: The system shall provide a **CRM integration management** interface supporting connection to the organization's CRM system (Salesforce, HubSpot, Microsoft Dynamics, or custom).

**FR-6.4.1.1.2**: The interface shall display:

- Connection status (connected, disconnected, error)
- Last sync timestamp
- Records synced (count by entity type)
- Sync latency (average time from CRM event to EDC update)
- Error rate (percentage of sync operations that failed)
- Data quality score (completeness of synced data)

**FR-6.4.1.1.3**: Configuration options:

- **Authentication**: OAuth 2.0 configuration with token management
- **Sync direction**: Bidirectional (EDC ↔ CRM) or unidirectional (CRM → EDC)
- **Sync frequency**: Real-time (webhook), near-real-time (polling every N minutes), or scheduled (hourly, daily)
- **Entity mapping**: Map CRM objects (Opportunity, Account, Contact, Activity) to EDC entities
- **Field mapping**: Map individual CRM fields to EDC fields with transformation rules
- **Filter rules**: Which records to sync (e.g., only opportunities above $10K, only active accounts)
- **Conflict resolution**: What happens when the same record is modified in both systems
- **Error handling**: Retry policy, dead-letter queue, notification on persistent failures

**FR-6.4.1.1.4**: The interface shall include a **data flow visualization** showing the path of data from CRM through the EDC pipeline, with health indicators at each stage.

##### 6.4.1.2 Email and Calendar Integration

**FR-6.4.1.2.1**: The system shall support integration with email (Gmail, Outlook) and calendar (Google Calendar, Outlook Calendar) systems for:

- Activity tracking (emails sent/received with customer contacts)
- Meeting tracking (meetings with customer contacts)
- Communication frequency computation (used by Pipeline Analytics and Closed-Lost Autopsy)
- Stakeholder engagement scoring

**FR-6.4.1.2.2**: Configuration options:

- OAuth authentication
- Privacy controls (what data is captured and what is excluded)
- Domain filtering (only track communications with customer domains)
- Content capture level (metadata only vs. full content for NLP analysis)
- Team member consent management

##### 6.4.1.3 Communication Platform Integration

**FR-6.4.1.3.1**: The system shall support integration with communication platforms (Slack, Microsoft Teams) for:

- Notification delivery (automation rule outputs)
- Deal room monitoring (optional — capture deal-related discussions)
- Command interface (interact with EDC via chat commands)

**FR-6.4.1.3.2**: Configuration options:

- Bot installation and channel configuration
- Notification routing (which channels receive which types of notifications)
- Command prefix configuration
- Permission management (who can interact with the bot)

##### 6.4.1.4 Document Management Integration

**FR-6.4.1.4.1**: The system shall support integration with document management systems (Google Drive, SharePoint, Dropbox, Box) for:

- Document indexing (proposals, SOWs, contracts)
- Document version tracking
- Document-content search (search within document text)
- Deal Memory document library population

**FR-6.4.1.4.2**: Configuration options:

- Authentication and folder access
- File type filters (which document types to index)
- Indexing schedule
- Content extraction level (metadata, full text, OCR for images)

##### 6.4.1.5 BI and Analytics Integration

**FR-6.4.1.5.1**: The system shall support integration with BI tools (Tableau, Power BI, Looker) and data warehouses for:

- Data export (EDC data available as a data source for BI tools)
- Data import (external data sources enriching EDC analysis)
- Dashboard embedding (EDC visualizations embedded in external dashboards)

**FR-6.4.1.5.2**: Configuration options:

- Data export API endpoints and authentication
- Data schema documentation
- Refresh frequency for exported data
- Import data source configuration

##### 6.4.1.6 Custom Integrations

**FR-6.4.1.6.1**: The system shall support **custom integrations** via:

- REST API with comprehensive endpoints
- Webhook subscriptions (outbound notifications to external systems)
- Webhook receivers (inbound events from external systems)
- Custom connector framework (define new integration endpoints)

#### 6.4.2 Data Pipeline Monitor

##### 6.4.2.1 Pipeline Health Dashboard

**FR-6.4.2.1.1**: The system shall provide a **Data Pipeline Health Dashboard** showing the real-time status of all data flows:

```
Data Pipeline Health
├── CRM → EDC
│   ├── Status: ● Healthy
│   ├── Records in queue: 3
│   ├── Avg latency: 45 seconds
│   ├── Error rate (24h): 0.02%
│   └── Last error: 2 hours ago (resolved)
├── Activity System → EDC
│   ├── Status: ● Healthy
│   ├── Records processed (24h): 12,847
│   ├── Avg latency: 2 minutes
│   └── Error rate (24h): 0.01%
├── Document Store → EDC
│   ├── Status: ● Degraded
│   ├── Documents in queue: 47
│   ├── Avg indexing time: 8 minutes (normally 2 minutes)
│   └── Issue: OCR service responding slowly
├── EDC → Search Index
│   ├── Status: ● Healthy
│   ├── Index freshness: 99.7%
│   └── Last full reindex: 7 days ago
├── EDC → Vector DB
│   ├── Status: ● Healthy
│   ├── Embeddings up to date: 99.2%
│   └── Last embedding batch: 6 hours ago
└── EDC → BI Export
    ├── Status: ● Healthy
    ├── Last export: 1 hour ago
    └── Export size: 2.3GB
```

**FR-6.4.2.1.2**: Each pipeline segment shall display:

- Status indicator (green/amber/red)
- Queue depth (records waiting to be processed)
- Throughput (records per unit time)
- Latency (average processing time)
- Error rate (percentage of failed operations)
- Last error (with link to error details)

**FR-6.4.2.1.3**: The dashboard shall include a **data flow visualization** — a Sankey-style diagram showing how data flows from source systems through processing stages to destination systems, with health indicators on each flow.

##### 6.4.2.2 Error Log and Recovery

**FR-6.4.2.2.1**: The system shall maintain an **error log** for all data pipeline operations with:

- Error timestamp
- Pipeline segment where the error occurred
- Error type and message
- Affected record(s)
- Retry count and status
- Resolution status (auto-resolved, manually resolved, pending)

**FR-6.4.2.2.2**: The error log shall support:

- Filtering by pipeline segment, error type, time range, and resolution status
- Bulk retry of failed operations
- Dead-letter queue management (permanently failed records requiring manual intervention)
- Error pattern detection (recurring errors that indicate systemic issues)

#### 6.4.3 API Management

##### 6.4.3.1 API Key Management

**FR-6.4.3.1.1**: The system shall provide an **API key management** interface for:

- Creating API keys with descriptive names and scopes
- Setting expiration dates
- Revoking keys
- Monitoring key usage
- IP allowlisting per key

##### 6.4.3.2 Rate Limit Configuration

**FR-6.4.3.2.1**: The system shall provide rate limit configuration:

- Global rate limits (requests per second/minute/hour)
- Per-endpoint rate limits
- Per-key rate limits
- Burst allowances
- Rate limit response behavior (429 with retry-after header)

##### 6.4.3.3 Webhook Management

**FR-6.4.3.3.1**: The system shall provide a **webhook management** interface for:

- Registering webhook endpoints (URL, events to subscribe to)
- Webhook secret management (HMAC signing)
- Delivery configuration (timeout, retry policy, headers)
- Delivery log (successful and failed deliveries)
- Test delivery (send a test payload)

---

### 6.5 Access and Security

#### 6.5.1 Role Management

##### 6.5.1.1 Role Definitions

**FR-6.5.1.1.1**: The system shall provide **pre-defined roles** with appropriate permission sets:


| Role                    | Description                  | Key Permissions                                                        |
| ----------------------- | ---------------------------- | ---------------------------------------------------------------------- |
| **Platform Admin**      | Full system administration   | All permissions including settings, integrations, and user management  |
| **RevOps Admin**        | Engine tuning and automation | Engine configuration, automation rules, data management                |
| **Sales Leader**        | View and approve             | View all dashboards, approve configuration changes, manage team access |
| **Sales Manager**       | Team-level management        | View team data, manage team settings, create team-level automations    |
| **Account Executive**   | Individual contributor       | View own data, contribute knowledge, use Deal Memory and AI Advisor    |
| **Deal Desk**           | Deal operations              | Pricing intelligence, deal approval workflows, process compliance      |
| **Product Manager**     | Product intelligence         | View product-related analytics, product gap intelligence               |
| **Competitive Intel**   | Competitive analysis         | View competitive intelligence, manage competitor profiles              |
| **Auditor**             | Read-only audit access       | View audit logs, configuration history, compliance reports             |
| **Integration Manager** | Integration management       | Configure and monitor integrations, manage API keys                    |


**FR-6.5.1.1.2**: Roles shall be **composable** — custom roles can be created by combining permission modules.

##### 6.5.1.2 Permission Matrix

**FR-6.5.1.2.1**: The system shall provide a **visual permission matrix** showing:

- Rows: Permission categories (View pipeline analytics, Edit engine settings, Manage automations, etc.)
- Columns: Roles
- Cells: Granted / Not granted / Conditional

**FR-6.5.1.2.2**: The permission matrix shall be **editable** by Platform Admins, with changes requiring confirmation.

##### 6.5.1.3 Custom Role Builder

**FR-6.5.1.3.1**: The system shall provide a **custom role builder** allowing Platform Admins to create new roles by selecting individual permissions from the permission catalog.

#### 6.5.2 Data Access Policies

##### 6.5.2.1 Territory-Based Access

**FR-6.5.2.1.1**: The system shall support **territory-based data access** — users can only see data for deals, accounts, and contacts within their assigned territory or team.

**FR-6.5.2.1.2**: Territory definitions shall be configurable:

- By geography (region, country, state)
- By industry / vertical
- By account tier (named accounts, territory accounts)
- By team membership
- By deal assignment

**FR-6.5.2.1.3**: Access policies shall support **inheritance** — managers see all data their reports see, plus additional management-level data.

##### 6.5.2.2 Data Classification Rules

**FR-6.5.2.2.1**: The system shall support **data classification** — categorizing data by sensitivity level:


| Classification   | Description                                                  | Access                         |
| ---------------- | ------------------------------------------------------------ | ------------------------------ |
| **Public**       | Non-sensitive aggregated data                                | All authenticated users        |
| **Internal**     | Deal data, analytics, insights                               | Role-based access              |
| **Confidential** | Individual deal pricing, negotiation details                 | Deal participants + management |
| **Restricted**   | Individual behavioral assessments, personal performance data | Direct management chain only   |


**FR-6.5.2.2.2**: Classification rules shall be configurable — administrators can define which data elements fall into each classification.

##### 6.5.2.3 PII Handling Policies

**FR-6.5.2.3.1**: The system shall provide configuration for PII handling:

- Which fields are classified as PII
- Masking rules (full masking, partial masking, anonymization)
- Retention periods per PII category
- Export restrictions
- Deletion request handling workflow

---

### 6.6 Data Management

#### 6.6.1 Data Quality Dashboard

**FR-6.6.1.1**: The system shall provide a **Data Quality Dashboard** with:


| Dimension        | Metrics                                                               |
| ---------------- | --------------------------------------------------------------------- |
| **Completeness** | Percentage of required fields populated, by entity type and by source |
| **Freshness**    | Average age of data records, by entity type                           |
| **Consistency**  | Percentage of records with conflicting values across sources          |
| **Accuracy**     | Percentage of records passing validation rules                        |
| **Uniqueness**   | Duplicate detection rate                                              |
| **Timeliness**   | Average latency from source event to EDC availability                 |


**FR-6.6.1.2**: The dashboard shall display quality scores as **radial gauges** per dimension with trend indicators.

**FR-6.6.1.3**: Quality issues shall be **drillable** — clicking a dimension reveals the specific records and fields contributing to the quality score.

#### 6.6.2 Entity Management

**FR-6.6.2.1**: The system shall provide management interfaces for:


| Entity              | Management Capabilities                                                               |
| ------------------- | ------------------------------------------------------------------------------------- |
| **Products**        | Add, edit, retire products; define product bundles; map to CRM products               |
| **Competitors**     | Add, edit, merge competitors; define competitor categories; configure tracking        |
| **Segments**        | Define segment dimensions and values; create custom segments; configure segment rules |
| **Stages**          | Define pipeline stages; configure stage requirements; map to CRM stages               |
| **Loss Reasons**    | Manage loss reason taxonomy; add, edit, deactivate categories                         |
| **Risk Dimensions** | Define and configure risk dimensions; set computation methods                         |
| **Deal Types**      | Define deal type categories (new, expansion, renewal, migration)                      |


---

### 6.7 Governance and Audit

#### 6.7.1 Configuration Audit Log

**FR-6.7.1.1**: The system shall maintain a **comprehensive audit log** of all configuration changes:


| Field                 | Description                                                 |
| --------------------- | ----------------------------------------------------------- |
| **Timestamp**         | When the change was made                                    |
| **User**              | Who made the change                                         |
| **Module**            | Which module was affected                                   |
| **Setting**           | What specific setting was changed                           |
| **Previous value**    | The value before the change                                 |
| **New value**         | The value after the change                                  |
| **Reason**            | Why the change was made (optional, prompted)                |
| **Impact assessment** | System-generated assessment of the change's expected impact |
| **Approval**          | Whether the change required approval, and who approved      |
| **Rollback status**   | Whether the change has been rolled back                     |


**FR-6.7.1.2**: The audit log shall support:

- Full-text search across all fields
- Filtering by user, module, setting, time range
- Export for compliance reporting
- Anomaly detection (unusual configuration changes)

**FR-6.7.1.3**: The audit log shall support **one-click rollback** — any configuration change can be reverted to its previous value with a single action.

#### 6.7.2 Model Governance

**FR-6.7.2.1**: The system shall implement a **model governance framework** consistent with enterprise AI governance best practices:


| Governance Element         | Description                                                                         |
| -------------------------- | ----------------------------------------------------------------------------------- |
| **Model registry**         | Centralized catalog of all models with metadata, versions, and lineage              |
| **Approval workflow**      | Model changes require review and approval before deployment                         |
| **Performance monitoring** | Continuous tracking of model accuracy, calibration, and drift                       |
| **Bias monitoring**        | Detection of model bias across protected dimensions (segment, geography, team)      |
| **Explainability**         | Each model must provide feature importance and decision explanations                |
| **Documentation**          | Each model must have documented purpose, methodology, limitations, and intended use |
| **Audit trail**            | Complete history of model training data, parameters, and performance                |


**FR-6.7.2.2**: Model governance shall be displayed as a **compliance dashboard** showing:

- Model compliance status (compliant, needs review, non-compliant)
- Overdue model reviews
- Performance degradation alerts
- Bias alerts

---

## 7. Non-Functional Requirements

### 7.1 Performance


| Requirement                                     | Specification                                                                              |
| ----------------------------------------------- | ------------------------------------------------------------------------------------------ |
| **NFR-7.1.1**: Settings page load               | ≤ 1.5 seconds                                                                              |
| **NFR-7.1.2**: Configuration change application | ≤ 2 seconds for simple parameter changes; ≤ 30 seconds for changes requiring recomputation |
| **NFR-7.1.3**: Simulation preview               | ≤ 5 seconds for health score simulation; ≤ 15 seconds for forecast model simulation        |
| **NFR-7.1.4**: Audit log search                 | ≤ 1 second for filtered queries                                                            |
| **NFR-7.1.5**: Automation rule evaluation       | ≤ 100ms per rule per event                                                                 |
| **NFR-7.1.6**: Integration sync monitoring      | Real-time status with ≤ 30-second refresh                                                  |
| **NFR-7.1.7**: A/B test result computation      | ≤ 10 seconds for significance testing                                                      |


### 7.2 Safety and Reliability

**NFR-7.2.1**: All configuration changes shall be **transactional** — either fully applied or fully rolled back, never partially applied.

**NFR-7.2.2**: The system shall maintain a **configuration snapshot** that can be restored in full, enabling disaster recovery of the configuration state.

**NFR-7.2.3**: Configuration changes that could significantly impact system behavior (model parameter changes, threshold changes &gt; 20% from current, role permission changes) shall require **confirmation** with impact assessment.

**NFR-7.2.4**: The system shall implement **configuration validation** — all changes are validated against constraints before application (e.g., weights must sum to 1.0, thresholds must be within valid ranges).

### 7.3 Security

**NFR-7.3.1**: Access to the Settings module shall be restricted to users with appropriate administrative roles.

**NFR-7.3.2**: Sensitive configuration (API keys, authentication tokens, webhook secrets) shall be **encrypted at rest** and displayed with masking in the UI.

**NFR-7.3.3**: Configuration changes to security-related settings (roles, permissions, access policies, authentication) shall require **dual approval** (two authorized administrators).

---

## 8. Data Model

### 8.1 Core Entities

```
ConfigurationSetting
├── setting_id: UUID
├── module: STRING (pipeline_analytics, portfolio_risk, autopsy, deal_memory, system)
├── category: STRING (e.g., "anomaly_detection", "health_score", "clustering")
├── key: STRING (unique identifier for the setting)
├── display_name: STRING
├── description: TEXT
├── value_type: ENUM [string, integer, float, boolean, json, enum, formula]
├── current_value: JSON
├── default_value: JSON
├── valid_range: JSON (min, max, allowed_values)
├── requires_restart: BOOLEAN
├── requires_approval: BOOLEAN
├── cross_module_dependencies: JSON (array of modules affected)
├── last_modified_by: UUID (user_id)
├── last_modified_at: TIMESTAMP
└── documentation: TEXT

ConfigurationChangeLog
├── change_id: UUID
├── setting_id: UUID (FK)
├── previous_value: JSON
├── new_value: JSON
├── changed_by: UUID (user_id)
├── changed_at: TIMESTAMP
├── reason: TEXT (nullable)
├── impact_assessment: TEXT (system-generated)
├── approved_by: UUID (nullable)
├── approved_at: TIMESTAMP (nullable)
├── rollback_id: UUID (nullable — links to the change that reversed this one)
└── status: ENUM [applied, rolled_back, pending_approval]

AutomationRule
├── rule_id: UUID
├── name: STRING
├── description: TEXT
├── status: ENUM [active, paused, draft, error]
├── trigger_config: JSON
│   ├── event_type: STRING
│   └── event_filters: JSON
├── conditions: JSON (array of condition objects with field, operator, value, logic)
├── actions: JSON (array of action objects with type, parameters, delay, escalation)
├── created_by: UUID (user_id)
├── created_at: TIMESTAMP
├── last_modified_at: TIMESTAMP
├── execution_count_30d: INTEGER
├── success_rate_30d: FLOAT
├── last_fired_at: TIMESTAMP
├── error_message: TEXT (nullable)
└── version: INTEGER

AutomationExecution
├── execution_id: UUID
├── rule_id: UUID (FK)
├── triggered_at: TIMESTAMP
├── trigger_event: JSON (the event data that triggered the rule)
├── conditions_evaluated: JSON (results of condition evaluation)
├── actions_executed: JSON (array of {action_type, parameters, result, timestamp})
├── status: ENUM [completed, partial_success, failed, cancelled]
├── error_message: TEXT (nullable)
├── duration_ms: INTEGER
└── context: JSON (additional context data)

ScheduledTask
├── task_id: UUID
├── name: STRING
├── description: TEXT
├── task_type: STRING
├── schedule: STRING (cron expression)
├── timezone: STRING
├── parameters: JSON
├── status: ENUM [active, paused, disabled, error]
├── retry_policy: JSON (max_retries, backoff_strategy)
├── timeout_seconds: INTEGER
├── dependencies: JSON (array of task_ids that must complete first)
├── last_run_at: TIMESTAMP
├── last_run_status: ENUM [success, failure, timeout, skipped]
├── next_run_at: TIMESTAMP
├── created_by: UUID
└── created_at: TIMESTAMP

Workflow
├── workflow_id: UUID
├── name: STRING
├── description: TEXT
├── status: ENUM [active, paused, draft]
├── definition: JSON (node-and-edge graph definition)
├── version: INTEGER
├── created_by: UUID
├── created_at: TIMESTAMP
├── last_modified_at: TIMESTAMP
├── execution_count: INTEGER
├── success_rate: FLOAT
└── avg_duration_ms: INTEGER

IntegrationConfig
├── integration_id: UUID
├── integration_type: ENUM [crm, email, calendar, communication, document, bi, custom]
├── name: STRING
├── provider: STRING (e.g., "salesforce", "hubspot", "gmail", "slack")
├── status: ENUM [connected, disconnected, error, configuring]
├── auth_config: JSON (encrypted — OAuth tokens, API keys)
├── sync_config: JSON (direction, frequency, entity mapping, field mapping, filters)
├── health_metrics: JSON (latency, throughput, error_rate, last_sync)
├── error_log_ref: UUID (nullable)
├── created_by: UUID
├── created_at: TIMESTAMP
└── last_health_check: TIMESTAMP

APIKey
├── key_id: UUID
├── name: STRING
├── key_hash: STRING (hashed — actual key shown only at creation)
├── scopes: JSON (array of allowed API scopes)
├── rate_limit: JSON (per_key overrides)
├── ip_allowlist: JSON (nullable — array of allowed IPs)
├── expires_at: TIMESTAMP (nullable)
├── created_by: UUID
├── created_at: TIMESTAMP
├── last_used_at: TIMESTAMP (nullable)
└── status: ENUM [active, revoked, expired]

WebhookSubscription
├── subscription_id: UUID
├── url: STRING
├── events: JSON (array of subscribed events)
├── secret: STRING (encrypted — HMAC signing secret)
├── delivery_config: JSON (timeout, retry_policy, headers)
├── status: ENUM [active, paused, disabled]
├── delivery_count: INTEGER
├── failure_count: INTEGER
├── last_delivery_at: TIMESTAMP
├── created_by: UUID
└── created_at: TIMESTAMP

Role
├── role_id: UUID
├── name: STRING
├── description: TEXT
├── is_system_role: BOOLEAN (pre-defined roles cannot be deleted)
├── permissions: JSON (array of permission identifiers)
├── parent_role_id: UUID (nullable — for role hierarchy)
├── created_by: UUID
├── created_at: TIMESTAMP
└── last_modified_at: TIMESTAMP

AccessPolicy
├── policy_id: UUID
├── name: STRING
├── policy_type: ENUM [territory, data_classification, pii, export]
├── rules: JSON (policy-specific rule definitions)
├── applies_to: JSON (roles, users, or groups)
├── status: ENUM [active, disabled]
├── created_by: UUID
├── created_at: TIMESTAMP
└── last_modified_at: TIMESTAMP

DataQualityMetric
├── metric_id: UUID
├── dimension: ENUM [completeness, freshness, consistency, accuracy, uniqueness, timeliness]
├── entity_type: STRING (deal, account, contact, activity)
├── score: FLOAT [0, 100]
├── details: JSON (field-level breakdown)
├── measured_at: TIMESTAMP
└── trend: ENUM [improving, stable, deteriorating]

ModelRegistry
├── model_id: UUID
├── name: STRING
├── module: STRING
├── description: TEXT
├── current_version: STRING
├── versions: JSON (array of {version, training_date, training_data_summary, hyperparameters, performance_metrics, status})
├── approval_status: ENUM [draft, pending_review, approved, deployed, deprecated]
├── approved_by: UUID (nullable)
├── approved_at: TIMESTAMP (nullable)
├── performance_history: JSON (array of {date, metrics})
├── bias_report: JSON (latest bias assessment)
├── documentation: TEXT
├── created_at: TIMESTAMP
└── last_retrained_at: TIMESTAMP

ABTest
├── test_id: UUID
├── name: STRING
├── description: TEXT
├── module: STRING
├── parameter: STRING (the configuration parameter being tested)
├── variant_a: JSON (current configuration)
├── variant_b: JSON (proposed configuration)
├── traffic_split: FLOAT (percentage receiving variant B)
├── metrics: JSON (array of metrics being tracked)
├── sample_size_target: INTEGER
├── status: ENUM [draft, running, completed, cancelled]
├── started_at: TIMESTAMP
├── ended_at: TIMESTAMP (nullable)
├── results: JSON (nullable — statistical results and recommendation)
├── winner: ENUM [a, b, inconclusive] (nullable)
├── promoted: BOOLEAN (whether winning variant was applied to production)
├── created_by: UUID
└── created_at: TIMESTAMP

TuningRecommendation
├── recommendation_id: UUID
├── module: STRING
├── recommendation_type: ENUM [threshold, weight, model_retrain, automation, integration]
├── title: STRING
├── description: TEXT
├── expected_impact: TEXT
├── confidence: ENUM [low, medium, high]
├── supporting_evidence: JSON
├── suggested_change: JSON ({setting_id, current_value, recommended_value})
├── status: ENUM [new, acknowledged, applied, dismissed]
├── dismissed_reason: TEXT (nullable)
├── created_at: TIMESTAMP
├── acknowledged_at: TIMESTAMP (nullable)
└── applied_at: TIMESTAMP (nullable)
```

---

## 9. Technical Architecture

### 9.1 Frontend Architecture


| Layer            | Technology               | Purpose                                                    |
| ---------------- | ------------------------ | ---------------------------------------------------------- |
| Framework        | React 18+                | Component architecture                                     |
| Styling          | Tailwind CSS v4.3.0      | Design system compliance                                   |
| UI Primitives    | Radix UI                 | Forms, sliders, selects, switches, tabs, dialogs, tooltips |
| Form Management  | React Hook Form + Zod    | Settings forms with validation                             |
| State Management | Zustand + React Query    | Configuration state + server state                         |
| Visualization    | D3.js + Visx             | Data flow diagrams, permission matrices, audit timelines   |
| Workflow Editor  | React Flow               | Node-and-edge workflow visual editor                       |
| Code Editor      | Monaco Editor (optional) | Cron expression editor, formula editor, API key display    |
| Animation        | Framer Motion            | Page transitions, status indicators                        |


### 9.2 Backend Architecture


| Layer             | Technology                             | Purpose                                                  |
| ----------------- | -------------------------------------- | -------------------------------------------------------- |
| API               | Python / FastAPI                       | REST API for configuration management                    |
| Primary DB        | PostgreSQL                             | Configuration storage, audit logs, automation rules      |
| Cache             | Redis                                  | Configuration caching, rate limiting, session management |
| Message Queue     | RabbitMQ or Kafka                      | Automation event processing, integration event streaming |
| Scheduler         | Celery Beat or APScheduler             | Scheduled task execution                                 |
| Secret Management | HashiCorp Vault or AWS Secrets Manager | API keys, OAuth tokens, webhook secrets                  |
| Monitoring        | Prometheus + Grafana                   | Integration health monitoring, pipeline metrics          |


### 9.3 Component Architecture

```
<SettingsModule>
├── <ConfigurationHomePage>
│   ├── <SystemHealthOverview>           ← Status grid with health gauges
│   ├── <ConfigurationStatusDashboard>   ← Maturity level with checklist
│   ├── <RecentChangesFeed>              ← Change log with rollback buttons
│   ├── <TuningRecommendations>          ← Recommendation card list
│   └── <QuickActions>                   ← Action button grid
├── <EngineTuningPage>
│   ├── <PipelineAnalyticsTuning>
│   │   ├── <HealthScoreConfigurator>    ← Interactive weight sliders + preview
│   │   ├── <ForecastModelManager>       ← Model metrics + retraining controls
│   │   ├── <VelocityTargetsEditor>      ← Target table with overrides
│   │   ├── <BottleneckParamsEditor>     ← Parameter form + simulator
│   │   ├── <AnomalySensitivityDial>     ← Sensitivity control + volume preview
│   │   └── <LeadingIndicatorManager>    ← Indicator table + validation viewer
│   ├── <PortfolioRiskTuning>
│   │   ├── <RiskDimensionWeights>       ← Weight sliders + correlation matrix
│   │   ├── <CorrelationThresholds>      ← Threshold form
│   │   ├── <ClusteringConfigurator>     ← Algorithm selector + preview
│   │   ├── <RiskAppetiteFramework>      ← Appetite limit editor with approval
│   │   └── <PropagationModelSettings>   ← Parameter form
│   ├── <AutopsyTuning>
│   │   ├── <LossRiskWeights>            ← Weight configuration
│   │   ├── <PatternThresholds>          ← Threshold form + impact analysis
│   │   ├── <AntiPatternRules>           ← Rule editor cards
│   │   ├── <NLPConfig>                  ← NLP pipeline settings
│   │   └── <AutopsyFormConfig>          ← Form section editor
│   ├── <DealMemoryTuning>
│   │   ├── <SearchConfig>               ← Search weight configuration
│   │   ├── <EmbeddingSettings>          ← Model selection + fine-tuning
│   │   ├── <AIAdvisorBehavior>          ← Behavior parameter editor
│   │   └── <DecayDetectionConfig>       ← Decay threshold editor
│   └── <CrossModuleTuning>
│       ├── <SharedParameterRegistry>    ← Centralized parameter table
│       ├── <ModelLifecycleManager>      ← Model registry with version history
│       └── <ABTestFramework>            ← Test creation + results viewer
├── <AutomationPage>
│   ├── <RuleBuilder>
│   │   ├── <RuleEditor>                 ← Trigger → Condition → Action builder
│   │   ├── <TriggerLibrary>             ← Categorized trigger catalog
│   │   ├── <ActionLibrary>              ← Categorized action catalog
│   │   └── <RuleTemplates>              ← Template gallery with customization
│   ├── <ActiveRulesDashboard>           ← Rule list with performance metrics
│   ├── <ScheduledTasksPage>             ← Task list + Gantt timeline
│   └── <WorkflowOrchestrator>           ← React Flow visual editor
├── <IntegrationsPage>
│   ├── <ConnectedSystemsPage>           ← Integration cards with health indicators
│   ├── <DataPipelineMonitor>            ← Pipeline health dashboard + flow viz
│   ├── <ErrorLogRecovery>               ← Error log table + recovery actions
│   ├── <APIManagementPage>              ← Key management, rate limits, webhooks
│   └── <IntegrationMarketplace>         ← Available integrations gallery
├── <AccessSecurityPage>
│   ├── <RoleManagement>                 ← Role table + permission matrix
│   ├── <UserManagement>                 ← User directory + role assignment
│   ├── <DataAccessPolicies>             ← Policy editor with territory/classification
│   └── <SecurityConfiguration>          ← Auth settings, session management
├── <DataManagementPage>
│   ├── <DataQualityDashboard>           ← Quality gauges with drill-down
│   ├── <FieldMappingEnrichment>         ← Mapping editor + computed fields
│   ├── <DataRetentionArchival>          ← Retention policy configuration
│   └── <EntityManagement>              ← Entity registry editors (products, competitors, segments, stages)
└── <GovernanceAuditPage>
    ├── <ConfigurationAuditLog>          ← Searchable change history + rollback
    ├── <ModelGovernance>                ← Model registry + approval workflow
    ├── <ComplianceReports>              ← Compliance status dashboard
    └── <SystemDocumentation>            ← Contextual documentation viewer
```

---

## 10. Key Interaction Patterns

### 10.1 Configuration Change Flow

```
1. Operator navigates to the relevant engine tuning section
2. Operator adjusts a parameter (e.g., moves a slider, changes a threshold)
3. System displays:
   a. The parameter's current value → proposed value
   b. An impact assessment: "This change is expected to increase detected anomalies by ~20%"
   c. A simulation preview (if applicable): showing how the change affects current data
   d. Cross-module impact warning (if the parameter is shared): "This will also affect Portfolio Risk Analysis"
4. Operator reviews the impact and confirms the change
5. System checks:
   a. Is approval required? If so, route to approver
   b. Are there validation errors? If so, display and prevent application
   c. Is the change within safe bounds? If not, display warning
6. Change is applied
7. System logs the change in the Configuration Audit Log
8. Previous value is stored for rollback capability
9. Downstream recomputation is triggered if needed
```

### 10.2 Automation Rule Creation Flow

```
1. Operator navigates to Automation → Rule Builder
2. Operator selects "Create New Rule" or chooses a template
3. Rule Editor opens:
   a. Select trigger from Trigger Library
   b. System shows available data fields for the trigger
   c. Build conditions using visual condition builder
   d. Select actions from Action Library
   e. Configure action parameters (with variable references from trigger)
4. Operator clicks "Preview" → System shows:
   a. How many times this rule would have triggered in the last 90 days
   b. Sample execution trace (what would have happened)
   c. Potential conflicts with existing rules
5. Operator reviews and saves the rule
6. Rule enters "Draft" status
7. Operator activates the rule
8. System begins monitoring for the trigger event
```

### 10.3 Tuning Recommendation Review Flow

```
1. System generates a tuning recommendation (weekly background job)
2. Recommendation appears on Configuration Home → Tuning Recommendations
3. Operator clicks the recommendation card
4. System displays:
   a. Full description of the recommended change
   b. Expected impact (quantified)
   c. Supporting evidence (data visualization)
   d. Current value → recommended value
   e. Confidence level
5. Operator chooses:
   a. "Apply" → Change is applied with audit logging
   b. "Customize" → Operator adjusts the recommended value, then applies
   c. "Dismiss" → Operator provides a reason, recommendation is archived
   d. "Defer" → Recommendation is snoozed for 30 days
6. If applied, system tracks whether the expected impact materializes
```

---

## 11. Design System Compliance

### 11.1 Layout Patterns


| Section                 | Layout                                                                                     |
| ----------------------- | ------------------------------------------------------------------------------------------ |
| Configuration Home      | Card grid with health overview, recommendations feed, and quick actions                    |
| Engine Tuning           | Tabbed sections with form-based configuration on the left, preview/simulation on the right |
| Automation Rule Builder | Full-width visual editor with context panels                                               |
| Integration Cards       | Grid of status cards with expandable detail panels                                         |
| Audit Log               | Full-width table with filter sidebar                                                       |
| Permission Matrix       | Scrollable grid with sticky headers                                                        |


### 11.2 Component Standards


| Component              | Styling                                                                                                |
| ---------------------- | ------------------------------------------------------------------------------------------------------ |
| Setting cards          | `bg-card border border-border rounded-lg p-4 shadow-sm`                                                |
| Form sections          | `bg-card border border-border rounded-lg p-6` with section title in `text-lg font-semibold`            |
| Sliders                | Radix Slider with `bg-primary` track fill and `bg-card border border-border rounded-full size-4` thumb |
| Toggles                | Radix Switch with `bg-primary` when on, `bg-muted` when off                                            |
| Status indicators      | `size-2 rounded-full` with semantic color (emerald/amber/red)                                          |
| Parameter labels       | `text-sm font-medium text-foreground`                                                                  |
| Parameter descriptions | `text-xs text-muted-foreground mt-1`                                                                   |
| Current value display  | `font-mono text-sm text-muted-foreground`                                                              |
| New value display      | `font-mono text-sm text-primary font-semibold`                                                         |
| Impact assessment      | `bg-amber-500/5 border border-amber-500/30 rounded-lg p-3 text-sm`                                     |
| Confirmation dialogs   | Radix Dialog with `bg-card border border-border rounded-lg shadow-xl p-6`                              |
| Recommendation cards   | `bg-card border border-border rounded-lg p-4 shadow-sm` with `border-l-4 border-l-primary`             |
| Warning banners        | `bg-amber-500/5 border border-amber-500/30 rounded-lg p-3`                                             |
| Error banners          | `bg-red-500/5 border border-red-500/30 rounded-lg p-3`                                                 |
| Success banners        | `bg-emerald-500/5 border border-emerald-500/30 rounded-lg p-3`                                         |
| Tab navigation         | Radix Tabs with `border-b border-border` and `text-primary` active indicator                           |


### 11.3 Animation Specifications


| Element                | Animation                                      | Duration                 | Easing      |
| ---------------------- | ---------------------------------------------- | ------------------------ | ----------- |
| Page transition        | fade-in + slide-in-from-bottom-4               | 300ms                    | ease-in-out |
| Status indicator pulse | Scale pulse (1.0 → 1.2 → 1.0) on status change | 600ms                    | ease-out    |
| Slider thumb           | Scale from 1.0 to 1.2 on drag start            | 150ms                    | ease-out    |
| Toggle switch          | Translate + color transition                   | 200ms                    | ease-in-out |
| Simulation preview     | Cross-fade from current to simulated state     | 300ms                    | ease-in-out |
| Recommendation cards   | Staggered fade-in                              | 200ms each, 80ms stagger | ease-out    |
| Confirmation dialog    | fade-in + scale-95-to-100                      | 200ms                    | ease-out    |
| Success notification   | slide-in-from-right + fade                     | 250ms                    | ease-in-out |
| Error notification     | slide-in-from-right + fade                     | 250ms                    | ease-in-out |
| Audit log entries      | Fade-in list items                             | 150ms, 30ms stagger      | ease-out    |
| Workflow node hover    | Scale 1.0 → 1.02 + shadow increase             | 150ms                    | ease-out    |
| Health gauge animation | Arc from 0 to value                            | 800ms                    | ease-out    |


---

## 12. Edge Cases and Error Handling


| Condition                                                                                 | Handling                                                                                                                                                    |
| ----------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Conflicting configuration changes** (two admins change the same setting simultaneously) | Last-write-wins with conflict notification; both changes logged; affected admin notified                                                                    |
| **Configuration change causes model degradation**                                         | Automatic performance monitoring detects degradation within 24 hours; alert generated; one-click rollback available                                         |
| **Integration credentials expire**                                                        | Automatic detection via health check; notification to Integration Manager; grace period before data pipeline pause                                          |
| **Automation rule causes action flood** (trigger fires more than expected)                | Rate limiting on automation actions (max N executions per hour per rule); automatic pause with notification if threshold exceeded                           |
| **Invalid configuration value entered**                                                   | Real-time validation prevents submission; error message explains the constraint; suggested valid values provided                                            |
| **Settings module itself becomes unavailable**                                            | All engines continue running with last-known-good configuration; changes queued for when the module recovers                                                |
| **Audit log grows beyond manageable size**                                                | Automatic archival of entries older than configurable retention period; archived entries remain searchable via archive interface                            |
| **A/B test shows no significant winner**                                                  | Test extended automatically up to 2x the original duration; if still inconclusive, default to current configuration with recommendation to gather more data |


---

## 13. Release Plan

### Phase 1: Foundation (Weeks 1-8)

**Configuration Home**:

- System Health Overview with engine status grid
- Recent Changes Feed with basic rollback
- Quick Actions

**Core Settings Infrastructure**:

- Configuration storage and change logging
- Audit trail
- Role-based access to settings
- Validation framework

**Basic Engine Tuning**:

- Health Score weight configuration (Pipeline Analytics)
- Velocity and conversion target editors
- Basic threshold configuration for bottleneck detection and anomaly sensitivity

### Phase 2: Engine Tuning (Weeks 9-16)

**Pipeline Analytics Tuning**:

- Forecast Model Management with retraining controls
- Feature management panel
- Leading indicator management

**Portfolio Risk Tuning**:

- Risk dimension weight configurator
- Correlation threshold configuration
- Clustering configurator with multi-method comparison
- Risk appetite framework

**Cross-Module**:

- Shared parameter registry
- Tuning recommendations (basic)

### Phase 3: Automation (Weeks 17-24)

**Rule Builder**:

- Trigger library
- Action library
- Visual condition builder
- Rule templates (10 templates)
- Active rules dashboard

**Scheduled Tasks**:

- Task scheduler
- Task execution history
- Gantt timeline view

### Phase 4: Integrations (Weeks 25-32)

**Connected Systems**:

- CRM integration management (Salesforce, HubSpot)
- Email/Calendar integration (Gmail, Outlook)
- Communication integration (Slack, Teams)

**Data Pipeline Monitor**:

- Pipeline health dashboard
- Data flow visualization
- Error log and recovery

**API Management**:

- API key management
- Rate limit configuration
- Webhook management

### Phase 5: Advanced Features (Weeks 33-40)

**Advanced Tuning**:

- Autopsy engine tuning (pattern thresholds, anti-pattern rules, form config)
- Deal Memory tuning (search config, embedding settings, AI advisor behavior, decay detection)
- Model lifecycle management
- A/B testing framework
- Advanced tuning recommendations

**Workflow Orchestrator**:

- Visual workflow editor
- Workflow templates
- Workflow execution monitor

**Governance &amp; Security**:

- Model governance framework
- Compliance reports
- Advanced audit features
- Data access policies

### Phase 6: Polish &amp; Launch (Weeks 41-44)

- Contextual documentation and parameter reference
- Onboarding wizard for initial configuration
- Performance optimization
- Accessibility audit
- User acceptance testing
- Gradual rollout

---

## 14. Success Metrics


| Metric                                           | Baseline                        | Target (6 months)                       | Measurement                    |
| ------------------------------------------------ | ------------------------------- | --------------------------------------- | ------------------------------ |
| Configuration changes by non-technical operators | 0%                              | ≥80%                                    | Audit log analysis             |
| Configuration change rollback rate               | N/A                             | ≤5% of changes rolled back              | Audit log analysis             |
| Tuning recommendation acceptance rate            | N/A                             | ≥60%                                    | Recommendation status tracking |
| Model performance improvement from tuning        | Default performance             | ≥10% improvement in AUC/accuracy        | Model performance tracking     |
| Automation rules active                          | 0                               | ≥20 rules per organization              | Automation dashboard           |
| Automation execution success rate                | N/A                             | ≥95%                                    | Execution log analysis         |
| Integration uptime                               | Unknown                         | ≥99.5%                                  | Health monitoring              |
| Mean time to detect integration failure          | Hours/days                      | ≤5 minutes                              | Health monitoring alerts       |
| Audit compliance score                           | N/A                             | 100% of changes logged with attribution | Audit log completeness         |
| Operator time to configure a new setting         | \~30 minutes (with engineering) | ≤5 minutes (self-service)               | User research                  |
| Time from anomaly detection to automated action  | Manual (hours/days)             | ≤5 minutes (automated)                  | Automation execution timing    |


---

## 15. Open Questions


| #    | Question                                                                                                      | Owner                         | Status |
| ---- | ------------------------------------------------------------------------------------------------------------- | ----------------------------- | ------ |
| OQ-1 | Which CRM systems must be supported at launch vs. roadmap?                                                    | Sales Ops + Engineering       | Open   |
| OQ-2 | What is the organization's preferred secret management approach?                                              | Engineering + Security        | Open   |
| OQ-3 | Should configuration changes require dual approval for all settings, or only security-related ones?           | Compliance + Sales Leadership | Open   |
| OQ-4 | What is the minimum viable automation rule set for launch?                                                    | RevOps + Product              | Open   |
| OQ-5 | How should the system handle configuration when the underlying data schema changes (e.g., CRM field renamed)? | Engineering + RevOps          | Open   |
| OQ-6 | Should the A/B testing framework be available at launch or deferred to a later phase?                         | Product + Data Science        | Open   |
| OQ-7 | What level of customization should the workflow orchestrator support — visual only or also code-based?        | Engineering + RevOps          | Open   |
| OQ-8 | How should configuration backups be managed — automatic daily, on-demand only, or both?                       | Engineering + Compliance      | Open   |


---

*Document Version: 1.0*
*Module: Settings — Engine Tuning, Automation, and Integrations*
*Application: Enterprise Deal Commander*
*PRD Classification: Feature Module — Major*