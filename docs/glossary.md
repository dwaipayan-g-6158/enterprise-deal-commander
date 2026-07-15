# Glossary

The canonical vocabulary used across EDC's code, UI, and documentation. Consistency is
intentional — use these exact terms.

| Term | Definition |
|---|---|
| **Deal Commander** | The sole authenticated CRUD user — a Presales Enterprise Manager who owns technical-validation health. The primary persona. |
| **Enterprise Deal** | A single tracked opportunity with both a commercial and a technical dimension. Natural key: `(account_name, deal_name)`. |
| **Account Manager (AM)** | Sales-line owner of commercial progression. Referenced on a deal; does **not** log in. |
| **Technical Lead (TL)** | Presales-line owner of architecture validation. Referenced on a deal; does **not** log in. |
| **Pipeline / Pipeline Stage** | The commercial track: Discovery → Validation → Commercial → Procurement → Closed-Won / Closed-Lost. Stored as lookup rows. |
| **Technical Gate** | A verifiable validation milestone on the parallel technical track. |
| **Gate Group / Milestone** | Gates cluster into groups; all gates in a group must complete to advance. The highest completed group is the deal's milestone label (e.g. "Gate 3: Scalability Confirmed"). Also called the **9-point / 9-gate matrix**. |
| **Risk Engine / Intelligence Engine** | The pure, isomorphic module that evaluates a deal and emits pattern alerts and dimensional risk. |
| **Pattern Alert** | A deterministic named risk condition (e.g. `PREMATURE_COMMERCIAL`). Multiple can fire per deal. |
| **Risk Engine v2** | The 7-dimension composite risk model (0–100 per dimension) whose composite level drives health. |
| **Dimension** | One of the seven independent risk axes: Technical Readiness, Commercial Alignment, Stakeholder Coverage, Temporal Pressure, Financial Structure, Competitive Exposure, Engagement Vitality. |
| **Health Status** | The aggregate color `GREEN` / `YELLOW` / `RED`, derived from the Risk Engine v2 composite level. |
| **Composite Score / Risk Level** | The 0–100 composite and its band (`LOW` / `MODERATE` / `ELEVATED` / `HIGH`). |
| **Glass-Box Explanation** | A pattern's machine-readable `explain()` output: inputs, thresholds-with-provenance, and `clearsWhen`. |
| **Provenance (`default` / `tuned`)** | Whether a threshold value used in an explanation is the seeded default or a Commander-tuned value. |
| **Risk Disposition / Managed Risk** | A Commander judgment on an alert — acknowledge / accept / snooze (with rationale). A disposed alert becomes "Managed Risk" and leaves the critical count. |
| **Stage Guardrail** | The server rule that returns `409 STAGE_GUARDRAIL` when advancing past an active RED pattern without a typed override. |
| **TCV (Total Contract Value)** | `product_revenue × term_years + services_revenue` for multi-year committed deals, else `product_revenue + services_revenue`. |
| **Normalized TCV** | TCV converted into the single reporting currency via `fx_rates`. All thresholds compare against this. |
| **Reporting Currency** | The one currency the Commander normalizes all deals into. |
| **War Room / Executive Briefing Mode** | The executive-optimized presentation overlay (a.k.a. "Huddle Mode"). Phase 1's product name is the "Executive War Room Edition". |
| **Cockpit** | The full day-to-day operational workspace for a single deal. |
| **Risk Simulator** | A client-side, non-persisted what-if that previews health + alerts using the same pure engine. |
| **Bat-Signal** | A 48-hour signed, read-only public share link to one deal's risk card. |
| **Loss Archetype** | The structured categorical reason a deal was Closed-Lost (mandatory on close). |
| **Cross-Sell Whitespace / Attach Rate** | Catalog products not yet pitched; attach rate = pitched ÷ catalog size. |
| **Own Momentum** | A deal's recent vs earlier gate-completion rate, computed only from its own audit rows (no cohort data). |
| **Recommendation (Opportunity)** | An upsell suggestion (`NEXT_BEST_PRODUCT` / `SUITE_BUNDLE` / `RECOVERY_GAP`) — separate from risk; never affects health. |
| **Audit Log** | The immutable per-deal change record; carries `entity_id` for point-in-time reconstruction. |
| **Snapshot** | A stored point-in-time view (Phase 2). Reconstructs **gates only**; economics/stage reflect current values. |
| **Event Bus** | The in-process (Phase 2) `EventEmitter` that fans domain events out to subscribers building durable history. |
| **Deal Memory** | (Phase 2) The institutional knowledge base of closed deals. |
| **Playbook / Playbook Step** | (Phase 2) A prescribed sequence of actions assignable to a deal. |
| **Escalation Chain** | (Phase 2) An ordered notification/escalation path for smart alerts. |
| **Delegate / Regional / Global Commander** | (Phase 2) Expanded actor roles for multi-commander access and delegation. |
| **Suite (AD360 / Log360)** | The two ManageEngine product suites the domain constants and recommendations are keyed to. |
