# Deal Memory Module — Design & Technical Specification

## Enterprise Deal Commander

---

## 1. Module Purpose and Strategic Thesis

Organizations close thousands of enterprise deals over the years. Each deal generates a rich trail of decisions, strategies, tactics, negotiations, objections, resolutions, relationships, and outcomes. This accumulated experience constitutes one of the most valuable strategic assets a sales organization possesses — yet in most enterprises, it evaporates. Deal knowledge lives in individual memories, scattered CRM notes, disconnected Slack threads, and the fading recollections of post-meeting debriefs. When a key seller leaves, decades of contextual knowledge leave with them. When a new seller encounters a familiar situation, they start from zero because the organization has no mechanism to transfer what it already knows.

The Deal Memory module exists to solve this. It is not a document repository or a CRM data dump. It is a **living institutional knowledge system** that captures, structures, indexes, and surfaces deal intelligence so that every person in the organization can access the collective wisdom of every deal the organization has ever done.

The module draws on the analytical foundations established across the preceding EDC specifications — correlation-aware pattern recognition from Portfolio Risk Analysis, temporal event chain modeling from Pipeline Analytics, causal chain reconstruction from Closed-Lost Autopsy — and unifies them into a single knowledge layer that serves all other modules while also functioning as a standalone intelligence resource.

The core thesis: **a sales organization's competitive advantage compounds with every deal it closes, but only if the knowledge from those deals is captured, structured, retrievable, and actionable. Deal Memory transforms ephemeral individual experience into persistent institutional intelligence.**

---

## 2. Problem Statement

### 2.1 The Institutional Amnesia Problem

Enterprise deal cycles are complex, multi-month endeavors involving dozens of interactions, multiple stakeholders, iterative negotiations, technical evaluations, competitive encounters, and organizational politics. Each deal generates enormous quantities of both structured data (CRM fields, stage timestamps, activity logs) and unstructured data (meeting notes, email threads, proposal documents, negotiation transcripts, internal Slack discussions). The structured data sits in databases; the unstructured data is scattered, unsearchable, and contextually disconnected.

**Knowledge fragmentation**: When a seller needs to understand how the organization previously handled a specific situation — a particular competitor's pricing strategy, a technical objection raised by a specific industry vertical, the optimal negotiation approach for deals above a certain size — they must rely on word of mouth, ad hoc Slack queries ("Has anyone sold to a company like this before?"), or the hope that their manager remembers a relevant precedent. The knowledge exists somewhere in the organization, but there is no mechanism to find it.

**Contextual loss**: Even when deal data is retained in CRM systems, the critical contextual knowledge is lost. The CRM records that a deal was won at a 15% discount after a 120-day cycle. It does not record why that discount was offered, what negotiation tactics were employed, what competitive threats shaped the pricing decision, what internal advocacy was required to approve the discount, or what the customer's decision-making process looked like from the inside. This contextual knowledge is what makes a past deal instructive for a future one, and it is precisely what is lost.

**Repeated mistakes**: Without a knowledge base that surfaces relevant past experiences, organizations repeat the same mistakes with depressing regularity. The same competitor's pricing trap catches new sellers who were never told about it. The same technical objection surfaces in the same industry vertical because the objection response that worked three years ago was never documented. The same negotiation mistake is made by successive sellers because the lesson from the prior failure was shared in a hallway conversation that reached two people.

**Onboarding inefficiency**: New sellers take 9-12 months to reach full productivity in enterprise sales. A significant portion of this ramp time is spent acquiring knowledge that the organization already possesses — knowledge about customer segments, competitive dynamics, product positioning, internal processes, and successful deal strategies. A robust Deal Memory system could compress this ramp by providing structured access to institutional knowledge from day one.

**Forecasting and planning blindness**: Strategic planning — territory design, product positioning, competitive response, pricing strategy — benefits enormously from historical pattern analysis. Without a searchable deal archive, strategic planners cannot answer basic questions: "How have deals in this segment trended over the last three years? What pricing approaches have worked with this customer profile? How did the competitive landscape shift after Competitor X's last product launch?"

### 2.2 Business Impact

| Impact Dimension | Current State | Quantified Cost |
|-----------------|---------------|-----------------|
| **Ramp time for new sellers** | 9-12 months to full productivity | $150K-300K per new hire in lost productivity during ramp |
| **Repeated mistakes** | Same loss patterns recur across quarters | 10-15% of losses potentially preventable with accessible prior knowledge |
| **Knowledge loss on turnover** | Each departing seller takes 2-5 years of contextual deal knowledge | Incalculable — manifests as institutional capability degradation |
| **Inconsistent deal strategy** | Each seller reinvents approaches to common situations | Variable customer experience, suboptimal outcomes |
| **Strategic planning without data** | Decisions based on recent memory and anecdote rather than systematic history | Suboptimal territory, pricing, and competitive strategy decisions |
| **Competitive intelligence decay** | Competitive knowledge rebuilt from scratch each time a new competitor emerges or an existing one shifts strategy | 60-90 day lag in competitive response capability |
| **Proposal and playbook reinvention** | Sellers create custom proposals rather than building on proven templates | 15-25 hours per proposal reinventing what already exists |

---

## 3. Goals and Objectives

### 3.1 Primary Goals

| ID | Goal | Success Metric |
|----|------|----------------|
| G1 | **Create a comprehensive, searchable deal archive** — every closed deal (won and lost) indexed and retrievable through multiple query modalities | ≥95% of closed deals with complete searchable records within 6 months of launch |
| G2 | **Extract and structure institutional knowledge** — automatically identify and surface reusable insights, strategies, precedents, and lessons from deal histories | ≥500 structured knowledge artifacts (insights, precedents, strategies) extracted per quarter |
| G3 | **Enable contextual deal retrieval** — given any current deal situation, find the most relevant historical precedents with full context | Mean relevance score ≥4.0/5.0 in user evaluations of retrieved precedents |
| G4 | **Accelerate seller productivity** — reduce time spent searching for information, building proposals, and developing deal strategies by providing instant access to institutional knowledge | 30% reduction in information search time measured via user research |
| G5 | **Preserve knowledge through transitions** — ensure that deal knowledge persists regardless of personnel changes | Zero knowledge loss attributable to personnel transitions as measured by knowledge base completeness metrics |
| G6 | **Feed all EDC modules** — serve as the unified knowledge layer that enriches Pipeline Analytics, Portfolio Risk Analysis, and Closed-Lost Autopsy with historical context | All three modules consume Deal Memory data; cross-module query success rate ≥90% |

### 3.2 Secondary Goals

- Build an AI-powered deal advisor that can answer natural-language questions about historical deals.
- Generate automated deal retrospectives and case studies from deal histories.
- Support knowledge contribution workflows that reward and recognize knowledge sharing.
- Enable organizational learning analytics that measure the health of institutional knowledge.
- Provide a foundation for deal similarity matching and precedent-based strategy recommendation.

---

## 4. Target Users and Personas

### 4.1 Primary Users

**P1: Account Executive / Seller**
- Needs to quickly find relevant past deals when preparing for customer meetings, building proposals, handling objections, or navigating competitive situations.
- Key questions: *Has anyone sold to a company like this before? What worked in similar deals? How did we handle this objection previously? What pricing did we use for this type of deal? What did the customer care about most?*
- Interaction: Daily, often in the heat of deal preparation.

**P2: Sales Manager / Team Lead**
- Needs to coach sellers using real examples from the organization's history, identify successful patterns to replicate, and understand the competitive landscape through historical lens.
- Key questions: *What does a winning deal look like in this segment? Which sellers have the best track record with this type of customer? What strategies have worked against this competitor?*
- Interaction: Weekly deal reviews, coaching sessions, strategy discussions.

**P3: New Seller (Onboarding)**
- Needs structured access to the organization's deal knowledge to accelerate ramp.
- Key questions: *What should I know about selling to this industry? What does a typical deal cycle look like here? What are the most common objections and how do I handle them? What tools and templates are available?*
- Interaction: Intensive during first 6 months, then decreasing.

### 4.2 Secondary Users

**P4: Revenue Operations / Deal Desk**
- Uses deal history for pricing benchmarking, process optimization, and policy development.
- Key questions: *What discount levels have we offered in similar situations? What contract terms are standard vs. exceptional? What approval precedents exist for this type of deal?*

**P5: Product Management**
- Uses deal intelligence to understand customer use cases, feature adoption patterns, and product-market fit.
- Key questions: *How are customers using our product? What features drive wins? What use cases are emerging?*

**P6: Sales Enablement / Training**
- Uses deal case studies and pattern libraries for training content development.
- Key questions: *What are the best examples of successful deals I can use in training? What common mistakes should new sellers be warned about?*

**P7: Executive Leadership**
- Uses strategic deal intelligence for planning and decision-making.
- Key questions: *How has our competitive position evolved? What segments are we strongest in? What deal strategies have driven the most revenue?*

**P8: Legal / Compliance**
- Uses contract and negotiation history for precedent review.
- Key questions: *What terms have we agreed to in similar deals? What negotiation positions have we held successfully? What compliance issues have arisen?*

---

## 5. Information Architecture

```
Enterprise Deal Commander
├── Dashboard (existing)
├── Deal Pipeline (existing)
├── Pipeline Analytics
├── Portfolio Risk Analysis
├── Closed-Lost Autopsy
├── Deal Memory                          ← NEW MODULE
│   ├── Knowledge Hub
│   │   ├── Search Interface (unified search)
│   │   ├── Knowledge Feed (newest insights)
│   │   ├── Featured Precedents
│   │   └── Knowledge Health Dashboard
│   ├── Deal Archive
│   │   ├── Deal Explorer (browse & filter)
│   │   ├── Deal Timeline View
│   │   ├── Deal Detail View
│   │   ├── Deal Comparison View
│   │   └── Deal Family View (related deals)
│   ├── Intelligence Layers
│   │   ├── Deal Insights Extractor
│   │   ├── Precedent Library
│   │   ├── Negotiation Intelligence
│   │   ├── Competitive Intelligence Archive
│   │   ├── Customer Intelligence Profiles
│   │   └── Segment Intelligence Reports
│   ├── Knowledge Artifacts
│   │   ├── Playbook Repository
│   │   ├── Case Study Library
│   │   ├── Objection Handling Database
│   │   ├── Pricing Intelligence Library
│   │   ├── Proposal Template Library
│   │   └── Lessons Learned Repository
│   ├── Pattern Library
│   │   ├── Win Pattern Gallery
│   │   ├── Loss Pattern Gallery
│   │   ├── Behavioral Pattern Library
│   │   ├── Market Pattern Library
│   │   └── Pattern Lifecycle Tracker
│   ├── AI Advisor
│   │   ├── Natural Language Query Interface
│   │   ├── Deal Strategy Advisor
│   │   ├── Competitive Briefing Generator
│   │   ├── Proposal Draft Generator
│   │   └── Onboarding Tutor
│   ├── Knowledge Contribution
│   │   ├── Contribution Dashboard
│   │   ├── Knowledge Review Queue
│   │   ├── Contribution Leaderboard
│   │   └── Knowledge Quality Metrics
│   └── Analytics & Governance
│       ├── Knowledge Base Health Metrics
│       ├── Usage Analytics
│       ├── Gap Analysis (missing knowledge)
│       ├── Knowledge Decay Detection
│       └── Access Audit Log
├── Governance (existing)
└── Administration (existing)
```

---

## 6. Functional Requirements

### 6.1 Knowledge Hub

#### 6.1.1 Unified Search Interface

**FR-6.1.1.1**: The system shall provide a **unified search interface** as the primary entry point to Deal Memory, supporting multiple query modalities:

| Query Mode | Description | Example |
|-----------|-------------|---------|
| **Full-text search** | Traditional keyword search across all deal data and knowledge artifacts | "CloudBridge pricing negotiation healthcare" |
| **Natural language query** | Conversational questions answered by AI with citations to source deals | "How have we won enterprise deals in financial services against CloudBridge in the last year?" |
| **Faceted search** | Structured filter-based exploration using deal dimensions | Product: DataSync Pro AND Segment: Enterprise AND Outcome: Won AND Year: 2025 |
| **Similarity search** | Given a current deal (or deal description), find the most similar historical deals | "Find deals similar to the current Acme Corp opportunity" |
| **Semantic search** | Meaning-based search that finds conceptually related content even without keyword matches | "deals where the customer was concerned about data migration complexity" (matches "data portability challenges," "legacy system transition worries") |
| **Timeline search** | Search by temporal criteria — deals from a specific time period, deals with specific timing characteristics | "enterprise deals that closed in the last two weeks of the quarter" |
| **Graph search** | Relationship-based queries following connections between entities | "deals involving the same champion who moved from Company A to Company B" |

**FR-6.1.1.2**: The search interface shall render as a **prominent search bar** at the top of the Knowledge Hub page, styled with:
- Full-width container: `max-w-3xl mx-auto`
- Input: `bg-card border border-border rounded-lg px-4 py-3 text-base` with `placeholder:text-muted-foreground`
- Search icon: Leading icon in `text-muted-foreground`
- Mode selector: A dropdown toggle (pills) for switching between query modes

**FR-6.1.1.3**: As the user types, the system shall display **real-time search suggestions** in a dropdown below the search bar:
- Suggested queries based on popular searches
- Suggested entities (deals, customers, competitors, products) matching the typed text
- Suggested knowledge artifacts (playbooks, case studies, lessons) matching the typed text

**FR-6.1.1.4**: Search results shall be displayed in a **structured results page** with:
- **Result count and query summary** at the top
- **Faceted filters** in a left sidebar for narrowing results by:
  - Deal outcome (won, lost, disqualified, no-decision)
  - Product line
  - Customer segment / industry
  - Deal size range
  - Date range
  - Team member / seller
  - Competitor involved
  - Deal stage at close
  - Customer size (employee count, revenue tier)
  - Geography / region
  - Deal type (new, expansion, renewal, migration)
  - Knowledge artifact type (precedent, case study, playbook, lesson)
- **Results list** in the main content area with:
  - Relevance-ranked results
  - Each result as a card showing: deal name (or artifact title), relevant snippet with search terms highlighted, key metadata (value, date, product, outcome, seller), relevance score indicator
  - Infinite scroll or pagination
- **Preview panel** on the right (expandable) showing the selected result's full detail without navigating away

**FR-6.1.1.5**: The search shall support **query refinement** — after viewing initial results, the user can add filters, modify the query, or use "More like this" on any result to find similar items.

**FR-6.1.1.6**: The search shall support **saved searches** — users can save frequently used queries and receive notifications when new results match.

**FR-6.1.1.7**: The search shall maintain a **search history** (per-user, privacy-respecting) enabling users to revisit previous queries.

**FR-6.1.1.8**: Search results shall support **export** — selected results can be exported as a structured document (PDF or CSV) with all relevant deal data and knowledge artifacts.

#### 6.1.2 Knowledge Feed

**FR-6.1.2.1**: The Knowledge Hub shall display a **feed of recently added or updated knowledge artifacts**, providing a passive discovery mechanism alongside active search.

**FR-6.2.1.2**: Feed items shall include:
- Newly extracted deal insights (from the Intelligence Layers)
- New case studies generated from closed deals
- Updated playbooks based on new pattern discoveries
- New lessons learned from Closed-Lost Autopsy
- Competitive intelligence updates derived from recent deal outcomes
- Knowledge contributions from team members
- Pattern library updates (new patterns, resolved patterns)

**FR-6.1.2.3**: The feed shall be **personalized** based on the user's role, team, product focus, and recent search activity — prioritizing content relevant to the user's current work context.

**FR-6.1.2.4**: Each feed item shall display:
- Content type icon and label
- Title and summary
- Source deal(s) or analysis
- Timestamp (relative: "2 hours ago," "yesterday")
- Relevance indicator
- Click-through to full detail

**FR-6.1.2.5**: The feed shall support filtering by content type, recency, and relevance.

#### 6.1.3 Featured Precedents

**FR-6.1.3.1**: The Knowledge Hub shall display a curated set of **featured precedents** — high-value historical deals that serve as exemplary references for common selling situations.

**FR-6.1.3.2**: Featured precedents shall be selected by a combination of:
- Algorithmic scoring (deals with the most reusable knowledge, highest engagement, strongest outcomes)
- Manual curation (sales leadership can feature specific deals)
- Community voting (team members can recommend deals as useful references)

**FR-6.1.3.3**: Featured precedents shall be displayed as **card rows** organized by category:
- "Best Enterprise Wins"
- "Competitive Displacement Victories"
- "Complex Negotiation Outcomes"
- "New Market Entries"
- "Expansion Deal Models"

**FR-6.1.3.4**: Each featured precedent card shall show:
- Deal name and customer
- Deal value and outcome
- One-sentence summary of the key lesson or strategy
- Number of team members who have referenced this deal
- Tags (segment, product, strategy type)

#### 6.1.4 Knowledge Health Dashboard

**FR-6.1.4.1**: The Knowledge Hub shall include a **Knowledge Health Dashboard** providing at-a-glance metrics on the state of the institutional knowledge base.

**FR-6.1.4.2**: Health metrics to display:

| Metric | Definition | Visualization |
|--------|-----------|---------------|
| **Archive Completeness** | Percentage of closed deals with complete searchable records | Radial gauge |
| **Knowledge Density** | Average number of structured knowledge artifacts per deal | Number + trend |
| **Knowledge Freshness** | Percentage of knowledge artifacts updated within the last 90 days | Progress bar |
| **Coverage Score** | Percentage of deal dimensions (product, segment, competitor, deal type) with adequate knowledge representation | Heatmap |
| **Search Satisfaction** | Average user rating of search result relevance (1-5 scale) | Number + trend |
| **Contribution Rate** | Number of knowledge contributions per team member per month | Bar chart |
| **Knowledge Gap Count** | Number of identified gaps where historical precedent is missing or insufficient | Number + list |
| **Knowledge Decay Alerts** | Number of knowledge artifacts that may be outdated based on market/product changes | Alert count |

**FR-6.1.4.3**: The dashboard shall render as a card grid consistent with the application's design system, with each metric card following the standard `bg-card border border-border rounded-lg p-4 shadow-sm` pattern.

---

### 6.2 Deal Archive

#### 6.2.1 Deal Explorer

**FR-6.2.1.1**: The Deal Archive shall provide a **Deal Explorer** — a rich browsing interface for navigating the complete deal history.

**FR-6.2.1.2**: The Explorer shall support multiple **view modes**:

| View Mode | Description |
|-----------|-------------|
| **Table View** | Sortable, filterable data table with configurable columns |
| **Card Grid View** | Visual card grid with deal summaries |
| **Timeline View** | Chronological deal timeline (see 6.2.2) |
| **Map View** | Geographic distribution of deals (if location data available) |
| **Network View** | Relationship graph showing connections between deals (same customer, same champion, same competitor) |

**FR-6.2.1.3**: The Table View shall support:
- Configurable column selection (choose which deal attributes to display)
- Multi-column sorting
- Column-level filtering (text, numeric range, date range, multi-select)
- Row expansion for inline detail preview
- Bulk selection for export or comparison
- Column pinning and resizing

**FR-6.2.1.4**: The Card Grid View shall display each deal as a card showing:
- Deal name and customer in `text-sm font-semibold`
- Deal value in `text-lg font-bold font-mono`
- Outcome badge (Won in emerald, Lost in red, Disqualified in muted)
- Product line(s)
- Seller name
- Date range (creation to close)
- One-line deal summary (AI-generated)
- Key tags (segment, competitor, deal type)

**FR-6.2.1.5**: The Explorer shall support **preset filter sets** — commonly used filter combinations saved as named presets:
- "All Enterprise Wins This Year"
- "Competitive Losses to CloudBridge"
- "Expansion Deals Above $100K"
- "Deals with Long Cycles (>120 days)"
- Custom presets created and saved by users

#### 6.2.2 Deal Timeline View

**FR-6.2.2.1**: The Deal Timeline View shall display deals on a **horizontal timeline** enabling temporal pattern recognition.

**FR-6.2.2.2**: The timeline shall:
- Show deals as horizontal bars spanning their creation-to-close date range
- Color-code by outcome (emerald for won, red for lost, muted for other)
- Stack vertically to avoid overlap, organized by segment, product, or team
- Support zoom from decade-level to day-level granularity
- Annotate significant events (product launches, competitive moves, organizational changes) as vertical markers

**FR-6.2.2.3**: Users shall be able to click any deal bar to see its detail view.

#### 6.2.3 Deal Detail View

**FR-6.2.3.1**: The Deal Detail View shall present the **complete institutional knowledge** associated with a single deal, organized into tabbed sections:

**Tab 1: Overview**
- Deal summary (AI-generated narrative from structured and unstructured data)
- Key metrics: value, outcome, cycle time, discount, team size
- Customer profile summary
- Product(s) involved
- Key participants (seller, team, customer contacts)
- Deal tags and categories

**Tab 2: Timeline**
- Complete chronological event sequence from opportunity creation to close
- Each event: timestamp, event type, description, participants, stage
- Activity breakdown: meetings, calls, emails, documents, demos
- Stage transitions with duration at each stage
- Key moments highlighted (competitive entry, executive engagement, discount offered, contract redline)
- Interactive — click any event for detail

**Tab 3: Stakeholder Map**
- Visual map of all customer contacts and their roles
- Engagement level per contact (high/medium/low based on activity data)
- Relationship lines between contacts (if inferable)
- Our team members mapped to their customer counterparts
- Champion identification and effectiveness assessment

**Tab 4: Strategy & Execution**
- Deal strategy notes (seller-documented or AI-inferred)
- Competitive positioning approach
- Pricing strategy and negotiation history
- Proposal iterations with change summaries
- Key decisions made during the deal and their rationale
- Objections encountered and how they were handled

**Tab 5: Outcome Analysis**
- Outcome summary (why won or lost)
- If won: key winning factors, customer's stated decision criteria
- If lost: loss reason, competitor analysis, lessons learned
- Autopsy data (linked from Closed-Lost Autopsy module)
- Retrospective assessment

**Tab 6: Documents**
- All deal-related documents (proposals, SOWs, contracts, presentations, RFP responses)
- Document version history
- Full-text searchable within the deal's document collection
- Document comparison (diff view for proposal iterations)

**Tab 7: Knowledge Artifacts**
- Insights extracted from this deal
- Precedent tags (situations where this deal is relevant)
- Playbook contributions
- Lessons learned
- Similar deals (linked)
- How this deal has been referenced by other team members

**Tab 8: Connections**
- Related deals (same customer, same champion, same competitor, same product, same segment)
- Deal family tree (parent account, prior deals, expansion history)
- Pattern memberships (which recognized patterns this deal exemplifies)
- Cross-module connections (risk analysis data, pipeline analytics data, autopsy data)

**FR-6.2.3.2**: The Deal Detail View shall be accessible from any search result, deal explorer entry, or cross-module reference.

**FR-6.2.3.3**: The Deal Detail View shall support **annotations** — team members can add notes, commentary, or additional context to any section of the deal record, creating a collaborative knowledge layer over the raw deal data.

#### 6.2.4 Deal Comparison View

**FR-6.2.4.1**: The system shall support **side-by-side comparison** of up to 4 deals, enabling pattern recognition across similar deals.

**FR-6.2.4.2**: The comparison view shall display a matrix:
- Columns: Selected deals
- Rows: Deal attributes grouped by category (metrics, timeline, stakeholders, strategy, outcome)
- Cells: Attribute values with differences highlighted

**FR-6.2.4.3**: Differences between compared deals shall be visually emphasized:
- Attributes that differ significantly: highlighted background
- Attributes that are similar: normal display
- Metrics: color-coded by relative performance (emerald for the "best" value, red for the "worst")

**FR-6.2.4.4**: The comparison view shall include an **AI-generated comparison summary** that identifies the key similarities and differences between the compared deals and suggests what can be learned from the comparison.

#### 6.2.5 Deal Family View

**FR-6.2.5.1**: The system shall organize deals into **deal families** — groups of related deals connected by customer relationship.

**FR-6.2.5.2**: A deal family shall include:
- All deals with the same parent account
- Deals with contacts who appear across multiple accounts (champion moved companies)
- Deals connected by referral relationships

**FR-6.2.5.3**: The Deal Family View shall render as a **tree diagram** showing:
- Root node: Parent account
- Branch nodes: Individual deals
- Node size: Deal value
- Node color: Outcome (emerald/red/muted)
- Edge labels: Time gap between deals, relationship type
- Timeline axis showing when each deal occurred

**FR-6.2.5.4**: The Deal Family View shall display **family-level analytics**:
- Total lifetime revenue from this account
- Win rate across all deals
- Average deal growth trend (are deals getting larger?)
- Relationship depth evolution (are we engaging more stakeholders over time?)
- Competitive history across all deals

---

### 6.3 Intelligence Layers

The Intelligence Layers are the analytical engines that transform raw deal data into structured, reusable knowledge.

#### 6.3.1 Deal Insights Extractor

**FR-6.3.1.1**: The system shall automatically extract **structured insights** from closed deals using a combination of rule-based extraction, NLP analysis, and ML inference.

**FR-6.3.1.2**: Insight types to extract:

| Insight Type | Source Data | Extraction Method |
|-------------|-------------|-------------------|
| **Win factor** | Deal outcome data, seller notes, activity patterns | NLP extraction from notes; pattern analysis across won deals |
| **Loss factor** | Loss narratives, autopsy data, activity gaps | NLP extraction; pattern matching against loss signatures |
| **Competitive insight** | Competitor fields, loss narratives, stakeholder communications | NLP entity extraction + relationship mapping |
| **Pricing insight** | Discount data, negotiation history, competitive pricing | Statistical analysis of pricing patterns |
| **Stakeholder insight** | Contact engagement data, outcome correlation | Engagement-outcome correlation analysis |
| **Process insight** | Stage velocity data, activity sequences, compliance scores | Process-outcome correlation analysis |
| **Product insight** | Product fields, feature requests, technical objections | NLP extraction from technical discussions |
| **Market insight** | Industry fields, segment trends, deal timing | Trend analysis across market dimensions |
| **Negotiation insight** | Discount trajectories, concession patterns, contract terms | Negotiation sequence analysis |
| **Relationship insight** | Contact histories, champion data, account expansion patterns | Network analysis of relationship graphs |

**FR-6.3.1.3**: Each extracted insight shall be stored as a **structured knowledge record**:

```
Insight
├── insight_type: Enum (from above)
├── title: String (human-readable summary)
├── description: Text (detailed explanation)
├── source_deals: Array[UUID] (deals that generated this insight)
├── confidence: Float (0-1, based on source data quality and quantity)
├── applicability: JSON (conditions under which this insight applies — segment, product, competitor, deal type)
├── supporting_evidence: Array[{deal_id, specific_data_point}]
├── extracted_at: Timestamp
├── last_validated: Timestamp
├── validation_status: Enum [auto_extracted, human_validated, outdated]
├── relevance_score: Float (computed based on usage and applicability)
└── related_insights: Array[UUID] (other insights that are contextually related)
```

**FR-6.3.1.4**: Extracted insights shall be **presented to sellers as suggestions** that can be validated, refined, or dismissed. Validated insights receive higher confidence scores and are surfaced more prominently in future searches.

**FR-6.3.1.5**: The extraction engine shall run on a **continuous basis** as new deals close, with insights available within 24 hours of deal closure.

#### 6.3.2 Precedent Library

**FR-6.3.2.1**: The system shall maintain a **Precedent Library** — a curated collection of historical deals that serve as instructive references for specific selling situations.

**FR-6.3.2.2**: Precedents shall be organized by **situation type**:

| Situation Category | Examples |
|-------------------|----------|
| **Competitive scenario** | "Deals won against CloudBridge in healthcare" |
| **Industry vertical** | "Financial services enterprise deals with regulatory requirements" |
| **Deal complexity** | "Multi-product deals with >$500K ACV and >6 month cycles" |
| **Negotiation scenario** | "Deals with significant discount negotiations" |
| **Expansion scenario** | "Successful land-and-expand from SMB to enterprise" |
| **Recovery scenario** | "Deals recovered after initial loss signals" |
| **New market** | "First deals in new geographic markets" |
| **Technical evaluation** | "Deals with successful POC/pilot outcomes" |
| **Executive engagement** | "Deals requiring C-suite alignment" |
| **Procurement process** | "Deals navigating complex procurement/legal processes" |

**FR-6.3.2.3**: Each precedent shall include:
- **Situation description**: The specific selling situation this deal illustrates
- **Deal summary**: Key facts about the deal
- **Strategy employed**: How the deal was approached
- **Critical moments**: The key decision points and turning points
- **Outcome and why**: What happened and why
- **Reusable lessons**: What can be applied to future similar situations
- **Relevance tags**: When is this precedent applicable?
- **Quality score**: How instructive and well-documented is this precedent?

**FR-6.3.2.4**: Precedents shall be **automatically generated** from high-value closed deals using the Deal Insights Extractor, then reviewed and refined by sales leadership.

**FR-6.3.2.5**: Precedents shall also be **manually created** by team members who want to document a particularly instructive deal experience.

**FR-6.3.2.6**: The Precedent Library shall support **predecessor matching** — given a current deal's characteristics (segment, product, competitor, deal size, etc.), automatically surface the most relevant precedents.

#### 6.3.3 Negotiation Intelligence

**FR-6.3.3.1**: The system shall extract and organize **negotiation intelligence** from deal histories — the accumulated knowledge of how the organization negotiates in various situations.

**FR-6.3.3.2**: Negotiation intelligence shall be organized by:

| Dimension | Intelligence Captured |
|----------|----------------------|
| **Pricing patterns** | Discount ranges by segment, deal size, product, competitive situation |
| **Concession strategies** | What concessions have been offered, in what order, under what conditions |
| **Hold positions** | Where the organization has successfully held firm (and what happened) |
| **Value justification approaches** | ROI arguments, business case frameworks, and reference strategies that worked |
| **Term negotiation** | Contract terms that were successfully negotiated and the approaches used |
| **Escalation patterns** | When and how executive escalation was used to advance negotiations |
| **Competitive response pricing** | How pricing was adjusted in response to specific competitive threats |
| **Multi-year structures** | Discount structures and terms for multi-year commitments |

**FR-6.3.3.3**: Negotiation intelligence shall be displayed as an **interactive intelligence dashboard** with:
- A pricing benchmark tool: input deal characteristics, see historical pricing ranges for similar deals
- A concession strategy viewer: see the sequence of concessions that worked in similar negotiations
- A term comparison tool: see what contract terms have been agreed to in similar deals
- A negotiation timeline viewer: see the typical negotiation arc for deals with similar characteristics

**FR-6.3.3.4**: The system shall detect **negotiation patterns** — recurring negotiation sequences across deals — and surface them as reusable strategies.

**FR-6.3.3.5**: All negotiation intelligence shall be **anonymized and aggregated** to protect individual deal confidentiality while preserving strategic value.

#### 6.3.4 Competitive Intelligence Archive

**FR-6.3.4.1**: The system shall maintain a **competitive intelligence archive** — a structured repository of knowledge about each competitor, accumulated from every deal where that competitor was involved.

**FR-6.3.4.2**: For each competitor, the archive shall contain:

**Profile Section**:
- Company overview (market position, size, key products)
- Key differentiators as perceived by customers
- Pricing model and typical pricing ranges
- Sales approach and typical tactics
- Known strengths and weaknesses
- Recent strategic moves (product launches, pricing changes, market exits/entries)

**Battle Record**:
- Total encounters, win/loss record, win rate trend
- Win rate by segment, product, deal size
- Deal cycle time impact when this competitor is present
- Average deal size impact when this competitor is present

**Intelligence Log**:
- Chronological feed of competitive intelligence extracted from deals
- Each entry: date, source deal, intelligence type, detail, confidence
- Types: pricing intelligence, product intelligence, sales tactic intelligence, customer perception intelligence, strategic intelligence

**Counter-Strategies**:
- Documented strategies that have been effective against this competitor
- Each strategy: description, when to use, evidence of effectiveness, required resources
- Strategy effectiveness ratings based on actual outcomes

**Weakness Map**:
- Identified competitive weaknesses extracted from win data
- Customer-facing arguments that have successfully differentiated against this competitor
- Product capabilities where this competitor is known to be weak

**FR-6.3.4.3**: The competitive intelligence archive shall be **continuously updated** as new deals close and new intelligence is extracted.

**FR-6.3.4.4**: The archive shall support **competitive briefing generation** — automated creation of a structured competitive briefing document for any competitor, drawing on all accumulated intelligence.

#### 6.3.5 Customer Intelligence Profiles

**FR-6.3.5.1**: The system shall build and maintain **customer intelligence profiles** — aggregated knowledge about each customer account accumulated across all deals and interactions.

**FR-6.3.5.2**: Each customer profile shall contain:

| Section | Content |
|---------|---------|
| **Account overview** | Industry, size, geography, key business drivers |
| **Deal history** | All deals with this account (or related contacts at different companies), with outcomes and key details |
| **Relationship map** | Network of contacts, their roles, their engagement history, their sentiment trajectory |
| **Buying patterns** | How this customer buys — decision process, timeline, evaluation criteria, procurement requirements |
| **Product usage** | What products they use, how they use them, adoption depth |
| **Competitive exposure** | Which competitors have been evaluated, what the customer thinks of them |
| **Negotiation history** | How negotiations have gone, what terms were agreed, what hold positions were effective |
| **Key events** | Significant events: organizational changes, leadership transitions, strategy shifts, support escalations |
| **Intelligence notes** | Accumulated insights and observations from team members |
| **Risk indicators** | Churn risk signals, expansion signals, competitive threat signals |

**FR-6.3.5.3**: Customer profiles shall be **automatically populated** from deal data, activity data, and extracted insights, with the ability for team members to add manual notes and observations.

**FR-6.3.5.4**: Customer profiles shall be accessible from any deal detail view, search result, or through direct account search.

#### 6.3.6 Segment Intelligence Reports

**FR-6.3.6.1**: The system shall generate and maintain **segment intelligence reports** — aggregated knowledge about each customer segment (industry, geography, size tier) accumulated across all deals in that segment.

**FR-6.3.6.2**: Each segment report shall contain:

| Section | Content |
|---------|---------|
| **Segment overview** | Segment size, revenue contribution, growth trend |
| **Deal patterns** | Typical deal characteristics: size, cycle time, product mix, decision process |
| **Win profile** | What winning deals look like in this segment — strategy, stakeholders, timing, pricing |
| **Loss profile** | What losing deals look like — common failure modes, competitive dynamics |
| **Competitive landscape** | Which competitors are strongest in this segment, with win rate data |
| **Product fit** | How well current products serve this segment, based on deal outcome data |
| **Key objections** | Common objections in this segment and effective responses |
| **Pricing benchmarks** | Typical pricing ranges, discount patterns, deal structures |
| **Buying process** | Typical procurement process, timeline, decision criteria |
| **Emerging trends** | Trends detected from recent deal data — changing requirements, new competitors, shifting priorities |

**FR-6.3.6.3**: Segment reports shall be **auto-generated** from deal data with quarterly refresh, and shall include data from the most recent 8 quarters.

**FR-6.3.6.4**: Segment reports shall be **exportable** as formatted documents suitable for strategic planning and onboarding.

---

### 6.4 Knowledge Artifacts

#### 6.4.1 Playbook Repository

**FR-6.4.1.1**: The system shall maintain a **Playbook Repository** — a collection of structured sales playbooks that codify the organization's accumulated selling strategies.

**FR-6.4.1.2**: Playbooks shall be organized by type:

| Playbook Type | Description |
|--------------|-------------|
| **Competitive playbooks** | Strategies for competing against specific competitors |
| **Segment playbooks** | Strategies for selling into specific industries or segments |
| **Product playbooks** | Strategies for positioning specific products or solutions |
| **Deal stage playbooks** | Best practices for navigating specific pipeline stages |
| **Negotiation playbooks** | Strategies for various negotiation scenarios |
| **Objection handling playbooks** | Responses to common objections by category |
| **Expansion playbooks** | Strategies for growing existing customer relationships |
| **Recovery playbooks** | Strategies for recovering deals that are trending toward loss |

**FR-6.4.1.3**: Each playbook shall be structured as:

```
Playbook
├── title: String
├── type: Enum (from above)
├── description: Text
├── applicable_conditions: JSON (when to use this playbook)
├── target_persona: String (buyer persona this playbook addresses)
├── strategy_overview: Rich Text
├── recommended_actions: Ordered List of Actions
│   ├── action_description: Text
│   ├── timing: String (when in the deal to execute)
│   ├── resources_required: List[String]
│   ├── success_criteria: String
│   └── supporting_evidence: List[{deal_id, outcome}]
├── supporting_materials: List[Document Links]
├── evidence_base: JSON
│   ├── deals_used: List[deal_id]
│   ├── win_rate_when_used: Float
│   ├── win_rate_baseline: Float
│   ├── sample_size: Integer
│   └── confidence: Float
├── effectiveness_score: Float [0-100]
├── usage_count: Integer
├── user_rating: Float [1-5]
├── created_by: UUID
├── created_at: Timestamp
├── last_updated: Timestamp
├── version: Integer
└── status: Enum [draft, active, deprecated]
```

**FR-6.4.1.4**: Playbooks shall be **linked to Deal Memory's evidence base** — every recommendation in a playbook shall cite the specific deals that support it, with win rate data.

**FR-6.4.1.5**: Playbooks shall have **effectiveness tracking** — the system shall monitor whether deals that reference a playbook have better outcomes than comparable deals that do not.

**FR-6.4.1.6**: Playbooks shall be **version-controlled** with change history and the ability to see how strategies have evolved over time.

**FR-6.4.1.7**: The Playbook Repository shall include an **auto-suggestion engine** that identifies when a playbook should be created or updated based on new pattern discoveries from the Pattern Library (Section 6.5) or the Closed-Lost Autopsy module.

#### 6.4.2 Case Study Library

**FR-6.4.2.1**: The system shall maintain a **Case Study Library** — detailed, narrative accounts of significant deals that serve as teaching examples and reference material.

**FR-6.4.2.2**: Case studies shall be **auto-generated** from deal data using an AI narrative engine, then reviewed and refined by the deal team.

**FR-6.4.2.3**: Each auto-generated case study shall follow a consistent structure:

```
Case Study: [Deal Name]

Situation
  - Customer background and context
  - Business challenge or opportunity
  - Competitive landscape

Approach
  - Strategy and positioning
  - Key actions and milestones
  - Stakeholder engagement plan
  - Technical evaluation approach

Critical Moments
  - Key turning points in the deal
  - Objections encountered and responses
  - Competitive threats and counter-strategies
  - Negotiation dynamics

Outcome
  - Final result (won/lost, value, terms)
  - Key factors that drove the outcome
  - Customer's stated decision rationale

Lessons
  - What worked well
  - What could have been done differently
  - Reusable insights for future deals
  - Applicable playbooks and strategies

Data Appendix
  - Timeline summary
  - Stakeholder map
  - Pricing summary
  - Competitive comparison
```

**FR-6.4.2.4**: Case studies shall be tagged with relevance metadata (segment, product, competitor, deal size, strategy type) for searchable retrieval.

**FR-6.4.2.5**: Team members shall be able to **rate case studies** for quality and relevance, creating a community-curated quality signal.

**FR-6.4.2.6**: Case studies shall be **linkable from training materials**, enabling sales enablement to build training content around real deal examples.

#### 6.4.3 Objection Handling Database

**FR-6.4.3.1**: The system shall maintain a **structured database of objections and effective responses**, accumulated from deal histories.

**FR-6.4.3.2**: The database shall be organized hierarchically:

```
Objection Categories
├── Product / Technical
│   ├── "Your product doesn't have [feature]"
│   ├── "How does this scale to [requirement]?"
│   ├── "We're concerned about security/compliance"
│   └── "Integration with our existing stack will be difficult"
├── Pricing / Commercial
│   ├── "Your price is too high"
│   ├── "Competitor X is cheaper"
│   ├── "We don't have budget for this"
│   └── "We need a bigger discount"
├── Competitive
│   ├── "We're already working with [competitor]"
│   ├── "[Competitor] has a better [feature]"
│   └── "Why should we switch?"
├── Timing / Priority
│   ├── "This isn't a priority right now"
│   ├── "We're not ready to make a decision"
│   └── "Let's revisit next quarter"
├── Organizational
│   ├── "We need buy-in from [department/person]"
│   ├── "Our procurement process will take months"
│   └── "We're going through a reorganization"
└── Trust / Risk
    ├── "We've never heard of your company"
    ├── "Do you have references in our industry?"
    └── "What if this doesn't work?"
```

**FR-6.4.3.3**: Each objection entry shall contain:
- Objection text (canonical form and common variations)
- Category and sub-category
- **Recommended responses** (multiple approaches ranked by effectiveness)
- Each response: the response text/script, when to use this approach, supporting evidence or proof points
- **Deals where this objection was encountered** (linked)
- **Win rate when this objection was raised** (and handled vs. unhandled)
- **Effectiveness rating** of each response (based on outcome data)
- Tags for applicability (segment, product, deal stage)

**FR-6.4.3.4**: The database shall support **real-time objection lookup** — during a customer conversation, a seller can quickly search for an objection and see the recommended response.

**FR-6.4.3.5**: Objections shall be **automatically detected** in deal communications (emails, meeting notes) using NLP, and new objection patterns shall be identified through clustering of detected objection instances.

#### 6.4.4 Pricing Intelligence Library

**FR-6.4.4.1**: The system shall maintain a **Pricing Intelligence Library** — a structured repository of pricing knowledge accumulated from deal histories.

**FR-6.4.4.2**: The library shall provide:

| Tool | Description |
|------|-------------|
| **Pricing benchmark calculator** | Input: deal characteristics (product, segment, size, competitive situation). Output: historical pricing ranges (P10, P25, median, P75, P90) for similar deals |
| **Discount intelligence viewer** | View discount distributions by segment, product, deal size, and competitive situation |
| **Deal structure patterns** | Common deal structures (payment terms, multi-year commitments, phased rollouts) with frequency and outcome data |
| **Competitive pricing intelligence** | Observed competitor pricing from deal data (anonymized and aggregated) |
| **Pricing strategy effectiveness** | Which pricing strategies correlate with higher win rates and deal values |

**FR-6.4.4.3**: All pricing intelligence shall be **anonymized and aggregated** to prevent individual deal pricing from being exposed.

**FR-6.4.4.4**: The library shall support **scenario analysis**: "If we offer a 20% discount on a 3-year deal in the healthcare segment, what is the historical win rate and average deal value?"

#### 6.4.5 Proposal Template Library

**FR-6.4.5.1**: The system shall maintain a **Proposal Template Library** — a collection of proven proposal components drawn from successful deals.

**FR-6.4.5.2**: The library shall be organized by:
- Template type: Executive summary, Technical approach, Pricing section, Case study / reference, Implementation plan, ROI / business case, Terms and conditions
- Segment / industry applicability
- Product applicability
- Deal size tier

**FR-6.4.5.3**: Each template component shall include:
- The template text with placeholder fields
- Source deals where this component was used
- Win rate when this component was included in the proposal
- User ratings and feedback
- Version history

**FR-6.4.5.4**: The system shall support **AI-assisted proposal assembly** — given a current deal's characteristics, automatically suggest the most relevant template components from the library and assemble a proposal draft.

#### 6.4.6 Lessons Learned Repository

**FR-6.4.6.1**: The system shall maintain a **Lessons Learned Repository** — a structured collection of organizational lessons drawn from deal experiences.

**FR-6.4.6.2**: Lessons shall be sourced from:
- Closed-Lost Autopsy retrospectives (integrated from the Autopsy module)
- Won deal post-mortems (manual contributions)
- Pattern discoveries (from the Pattern Library)
- Knowledge contributions from team members
- AI-extracted insights from deal narratives

**FR-6.4.6.3**: Each lesson shall include:
- Lesson statement (concise, actionable)
- Source context (what situation generated this lesson)
- Supporting evidence (deal references, data points)
- Applicability scope (when is this lesson relevant?)
- Status: New → Reviewed → Incorporated into Playbook → Verified Effective
- Contributor and date

**FR-6.4.6.4**: Lessons shall be **peer-reviewable** — team members can validate, challenge, or add context to lessons.

**FR-6.4.6.5**: Lessons shall be **linked to playbooks** — when a lesson is incorporated into a playbook, the link is recorded so the system can track whether the lesson actually changed behavior and outcomes.

---

### 6.5 Pattern Library

The Pattern Library is the central repository for all detected patterns across the EDC platform, drawing from Portfolio Risk Analysis, Pipeline Analytics, and Closed-Lost Autopsy.

#### 6.5.1 Win Pattern Gallery

**FR-6.5.1.1**: The system shall maintain a gallery of **win patterns** — recurring characteristics and behaviors associated with won deals.

**FR-6.5.1.2**: Win pattern types:

| Pattern Type | Example |
|-------------|---------|
| **Engagement pattern** | "Won deals have 3+ stakeholders engaged by Stage 2" |
| **Velocity pattern** | "Won enterprise deals spend <15 days in Technical Evaluation" |
| **Competitive pattern** | "Won deals against CloudBridge involve executive sponsor engagement by Stage 3" |
| **Pricing pattern** | "Won deals in healthcare close at 10-15% discount with 2-year commitment" |
| **Process pattern** | "Won deals that complete all discovery activities have 2.3x the win rate" |
| **Timing pattern** | "Deals created in the first month of the quarter have 40% higher win rates" |
| **Source pattern** | "Referral-sourced deals have 55% win rate vs. 28% for outbound" |
| **Product pattern** | "Multi-product deals win at 38% vs. 22% single-product" |

**FR-6.5.1.3**: Each win pattern shall display:
- Pattern name and description
- Confidence level and statistical metrics (lift, p-value)
- Win rate differential (with pattern vs. without)
- Number of deals exhibiting the pattern
- Revenue impact (total won revenue attributed to the pattern)
- Trend (is this pattern strengthening, stable, or weakening?)
- Evidence deals (sample deals exemplifying the pattern)
- Recommended actions (how to leverage this pattern)

#### 6.5.2 Loss Pattern Gallery

**FR-6.5.2.1**: The system shall maintain a gallery of **loss patterns** — integrated from the Closed-Lost Autopsy module's Pattern Recognition Engine.

**FR-6.5.2.2**: Loss patterns shall be displayed in the same format as win patterns, enabling direct comparison between what drives wins and what drives losses for the same dimensions.

**FR-6.5.2.3**: The gallery shall support **paired pattern view** — for any dimension (e.g., stakeholder engagement), show both the win pattern (what good looks like) and the loss pattern (what failure looks like) side by side.

#### 6.5.3 Behavioral Pattern Library

**FR-6.5.3.1**: The system shall maintain a library of **behavioral patterns** — seller behaviors and organizational behaviors that correlate with deal outcomes.

**FR-6.5.3.2**: Behavioral patterns shall be integrated from the Closed-Lost Autopsy module's behavioral analysis and enriched with won-deal behavioral data.

**FR-6.5.3.3**: Each behavioral pattern shall be classified as:
- **Positive behavior**: Correlates with higher win rates (encourage this)
- **Negative behavior**: Correlates with higher loss rates (coach away from this)
- **Contextual behavior**: Effective in some situations but not others (understand when to use)

#### 6.5.4 Market Pattern Library

**FR-6.5.4.1**: The system shall maintain a library of **market patterns** — trends and recurring dynamics observed in the market through deal data.

**FR-6.5.4.2**: Market patterns include:
- **Seasonal patterns**: Recurring deal timing patterns (e.g., "Healthcare deals close 30% more frequently in Q4 due to budget cycles")
- **Competitive dynamics**: Shifts in competitive landscape (e.g., "CloudBridge encounter rate increased 45% in the last two quarters")
- **Segment evolution**: Changes in segment characteristics (e.g., "Mid-market deals are growing in average size, approaching enterprise territory")
- **Product adoption trends**: Shifts in product demand (e.g., "DataSync Pro deal share increased from 20% to 35% of pipeline over 4 quarters")

**FR-6.5.4.3**: Market patterns shall be detected using **time-series analysis** on deal data dimensions, with change-point detection for identifying inflection points.

#### 6.5.5 Pattern Lifecycle Tracker

**FR-6.5.5.1**: All patterns across the Pattern Library shall have a **lifecycle**:

```
Emerging → Confirmed → Active → Monitored → Resolved/Archived
```

**FR-6.5.5.2**: The Pattern Lifecycle Tracker shall provide a **dashboard view** showing:
- All active patterns across all galleries, organized by lifecycle stage
- Pattern count by stage (how many emerging, confirmed, active, etc.)
- Pattern health indicators (are patterns strengthening or weakening?)
- Intervention effectiveness (for patterns where interventions have been applied)

**FR-6.5.5.3**: The tracker shall support **pattern genealogy** — when a pattern evolves or splits into more specific patterns, the genealogy is tracked showing how organizational understanding has deepened over time.

---

### 6.6 AI Advisor

#### 6.6.1 Natural Language Query Interface

**FR-6.6.1.1**: The AI Advisor shall provide a **conversational interface** where users can ask natural language questions about the organization's deal history and receive synthesized, cited answers.

**FR-6.6.1.2**: The interface shall render as a **chat-style panel** with:
- User message bubbles: `bg-primary/10 rounded-lg px-4 py-2 text-sm`
- AI response bubbles: `bg-card border border-border rounded-lg px-4 py-2 text-sm`
- Source citations inline with responses (clickable links to source deals and knowledge artifacts)
- A persistent input field at the bottom

**FR-6.6.1.3**: The AI shall be capable of answering questions across the following categories:

| Question Category | Example |
|------------------|---------|
| **Precedent lookup** | "What's the biggest deal we've closed in the insurance vertical?" |
| **Strategy inquiry** | "How should I approach a competitive deal against CloudBridge in healthcare?" |
| **Pricing question** | "What discount range is typical for DataSync Pro deals over $200K?" |
| **Objection handling** | "How do we usually respond when customers say our API is not real-time?" |
| **Pattern question** | "What characteristics do our most successful enterprise deals share?" |
| **Trend question** | "How has our win rate in EMEA changed over the last year?" |
| **Person question** | "Who on the team has the most experience selling to financial services?" |
| **Customer question** | "What's our history with Acme Corp? Have we worked with them before?" |
| **Competitive question** | "What are CloudBridge's main weaknesses based on our win data?" |
| **Process question** | "What does a typical deal cycle look like for a $300K enterprise deal?" |
| **Product question** | "Which features are most frequently cited in won deals?" |
| **Hypothetical** | "If I'm facing a price objection on a $150K deal in mid-market, what's worked?" |

**FR-6.6.1.4**: Every AI response shall include **source citations** — references to the specific deals, knowledge artifacts, or pattern data that informed the response. Citations shall be clickable, navigating to the source detail.

**FR-6.6.1.5**: The AI shall include **confidence indicators** with its responses:
- High confidence: Based on strong data (many source deals, high statistical significance)
- Medium confidence: Based on moderate data (some source deals, reasonable pattern)
- Low confidence: Based on limited data (few source deals, emerging pattern)
- No data: The system does not have sufficient information to answer

**FR-6.6.1.6**: The AI shall **decline to answer** rather than speculate when confidence is insufficient, and shall suggest what additional data or context would be needed.

**FR-6.6.1.7**: Conversation history shall be **saveable** and **shareable** — users can save useful Q&A sessions and share them with team members.

#### 6.6.2 Deal Strategy Advisor

**FR-6.6.2.1**: Given a current deal's characteristics, the AI Advisor shall generate a **deal strategy recommendation** drawing on the knowledge base.

**FR-6.6.2.2**: The strategy recommendation shall include:
- **Situation assessment**: Summary of the deal's characteristics and where it fits in the historical landscape
- **Relevant precedents**: The 3-5 most similar historical deals with outcomes and key lessons
- **Recommended strategy**: A suggested approach based on what worked in similar deals
- **Risk factors**: Known risk factors based on patterns that match this deal's characteristics
- **Competitive intelligence**: If a known competitor is involved, a summary of competitive intelligence
- **Pricing guidance**: Historical pricing ranges for similar deals
- **Stakeholder recommendations**: Which customer roles to engage based on similar deal patterns
- **Timeline expectations**: Expected deal cycle based on historical data

**FR-6.6.2.3**: The strategy recommendation shall be presented as a **structured card layout** with each section as a distinct card that can be expanded, collapsed, or navigated independently.

**FR-6.6.2.4**: The user shall be able to **refine the recommendation** by providing additional context or constraints (e.g., "The customer specifically asked about real-time capabilities" or "We have limited SE resources for the next two weeks").

#### 6.6.3 Competitive Briefing Generator

**FR-6.6.3.1**: The AI Advisor shall generate **competitive briefing documents** on demand for any identified competitor.

**FR-6.6.3.2**: The briefing shall draw from:
- All deals involving the competitor (wins and losses)
- Competitive intelligence extracted from loss narratives
- Pricing intelligence from competitive deals
- Customer perception data from deal communications
- Counter-strategy effectiveness data

**FR-6.6.3.3**: Briefing structure:

```
Competitive Briefing: [Competitor Name]

Executive Summary
  - One-paragraph overview of competitive position

Market Position
  - Encounter rate and trend
  - Win rate against and trend
  - Segments where they are strongest/weakest

Their Strengths (from our loss data)
  - What customers say they do well
  - Their most effective selling arguments
  - Where they beat us

Their Weaknesses (from our win data)
  - Where customers find them lacking
  - Our successful differentiation arguments
  - Where we beat them

Pricing Intelligence
  - Observed pricing model and ranges
  - Their typical discount approach
  - How to position against their pricing

Recommended Counter-Strategies
  - Strategy 1: [Description, when to use, supporting evidence]
  - Strategy 2: [Description, when to use, supporting evidence]
  - Strategy 3: [Description, when to use, supporting evidence]

Key Objections They Raise and Responses
  - Objection 1 → Recommended response
  - Objection 2 → Recommended response

Recent Intelligence Updates
  - Latest competitive intelligence from recent deals

Source Deals
  - List of deals that informed this briefing
```

**FR-6.6.3.4**: Briefings shall be **auto-refreshed** as new deals involving the competitor close, with change notifications sent to subscribed users.

#### 6.6.4 Proposal Draft Generator

**FR-6.6.4.1**: The AI Advisor shall generate **proposal draft content** for a current deal based on the knowledge base.

**FR-6.6.4.2**: Given the deal's characteristics (product, segment, customer, competitive situation, value), the generator shall:
- Select the most relevant proposal templates from the Proposal Template Library
- Insert relevant case studies and references from the Case Study Library
- Include pricing guidance from the Pricing Intelligence Library
- Add competitive differentiation points from the Competitive Intelligence Archive
- Incorporate relevant objection responses from the Objection Handling Database
- Tailor the language to the customer's industry and role

**FR-6.6.4.3**: The generated draft shall be clearly marked as AI-generated and presented in an **editable format** with tracked suggestions rather than final text.

**FR-6.6.4.4**: The generator shall include a **confidence indicator** for each section, flagging sections where the knowledge base has strong precedent (high confidence) vs. sections where the seller should provide additional input (low confidence).

#### 6.6.5 Onboarding Tutor

**FR-6.6.5.1**: The AI Advisor shall include an **Onboarding Tutor** mode specifically designed for new sellers during their ramp period.

**FR-6.6.5.2**: The Onboarding Tutor shall provide:
- **Guided tours** of the Deal Memory system, explaining how to use each feature
- **Suggested learning paths** based on the new seller's assigned territory, products, and segments
- **Recommended reading** — the most important precedents, case studies, and playbooks for their focus area
- **Quiz mode** — the tutor can test the new seller's knowledge of competitive positioning, product capabilities, and selling strategies using deal-based scenarios
- **"Ask me anything" mode** — the tutor encourages questions and provides detailed, educational answers drawn from the knowledge base

**FR-6.6.5.3**: The Onboarding Tutor shall track **learning progress** — which artifacts the new seller has reviewed, which topics they've engaged with, and which areas they haven't yet explored.

**FR-6.6.5.4**: The tutor shall provide **progress reports** to the new seller's manager showing onboarding engagement and knowledge acquisition.

---

### 6.7 Knowledge Contribution

#### 6.7.1 Contribution Dashboard

**FR-6.7.1.1**: The system shall provide a **Contribution Dashboard** that encourages and tracks knowledge contributions from team members.

**FR-6.7.1.2**: The dashboard shall show for each team member:
- Total contributions (insights, notes, annotations, playbook updates, case study reviews)
- Contribution quality score (based on peer ratings and usage)
- Contribution streak (consecutive periods with at least one contribution)
- Impact score (how often their contributions have been accessed or cited)
- Badges earned (gamification element)

**FR-6.7.1.3**: The dashboard shall display a **team-wide contribution leaderboard** showing top contributors by volume, quality, and impact.

**FR-6.7.1.4**: Contribution types to track:

| Contribution Type | Description | Quality Signal |
|------------------|-------------|---------------|
| **Deal annotations** | Notes added to deal detail views | Peer helpfulness rating |
| **Insight validation** | Confirming or correcting AI-extracted insights | Accuracy against eventual outcomes |
| **Playbook updates** | Adding or refining playbook content | Usage and effectiveness of updated playbook |
| **Case study refinement** | Editing auto-generated case studies | Peer quality rating |
| **Objection response** | Adding new objection responses | Effectiveness when used in future deals |
| **Lesson contribution** | Submitting lessons learned | Peer validation and incorporation rate |
| **Competitive intelligence** | Adding competitive observations | Verification from deal data |
| **Template contribution** | Adding proposal template components | Win rate when used |

#### 6.7.2 Knowledge Review Queue

**FR-6.7.2.1**: The system shall maintain a **Knowledge Review Queue** — a workflow for quality-controlling contributed knowledge before it is published to the broader knowledge base.

**FR-6.7.2.2**: The review queue shall support:
- Submission → Review → Approved / Needs Revision / Rejected workflow
- Reviewer assignment (automatic or manual)
- Review criteria checklist (accuracy, completeness, actionability, clarity)
- Feedback loop to contributor
- Bulk review for high-volume periods

**FR-6.7.2.3**: The review process shall be **lightweight** — designed to take under 2 minutes per contribution for reviewers, to avoid creating a bottleneck.

#### 6.7.3 Contribution Leaderboard

**FR-6.7.3.1**: A gamified **leaderboard** shall rank team members by contribution activity and quality.

**FR-6.7.3.2**: Leaderboard categories:
- **Most active contributor** (volume)
- **Highest quality contributor** (average quality score)
- **Most impactful contributor** (contributions most accessed by others)
- **Best annotator** (most helpful deal annotations)
- **Best coach** (contributions that most improved others' outcomes)
- **Streak champion** (longest consecutive contribution streak)

**FR-6.7.3.3**: Leaderboard standings shall be visible on the module home page and shall reset monthly with all-time totals tracked separately.

#### 6.7.4 Knowledge Quality Metrics

**FR-6.7.4.1**: The system shall compute and display **quality metrics** for the knowledge base:

| Metric | Definition |
|--------|-----------|
| **Completeness** | Percentage of deals with structured knowledge artifacts |
| **Freshness** | Average age of knowledge artifacts; percentage updated in last 90 days |
| **Accuracy** | Percentage of AI-extracted insights validated by humans |
| **Actionability** | Percentage of knowledge artifacts rated as "actionable" by users |
| **Coverage** | Percentage of deal dimensions (product, segment, competitor, size) with adequate knowledge representation |
| **Usage** | Number of knowledge artifacts accessed per week |
| **Effectiveness** | Correlation between knowledge artifact usage and deal outcomes |

---

### 6.8 Analytics and Governance

#### 6.8.1 Knowledge Base Health Metrics

**FR-6.8.1.1**: The system shall provide a comprehensive **health metrics dashboard** for the knowledge base, organized by dimension:

```
Knowledge Base Health
├── Archive Health
│   ├── Total deals archived: [count]
│   ├── Archive completeness: [% with complete records]
│   ├── Data quality score: [0-100]
│   └── Gap analysis: [missing categories]
├── Knowledge Extraction Health
│   ├── Total insights extracted: [count]
│   ├── Validation rate: [% validated by humans]
│   ├── Extraction accuracy: [% validated as correct]
│   └── Extraction freshness: [time since last extraction run]
├── Knowledge Usage Health
│   ├── Weekly active knowledge users: [count]
│   ├── Most accessed artifacts: [top 10]
│   ├── Least accessed artifacts: [bottom 10 — candidates for refresh]
│   ├── Search success rate: [% of searches resulting in engagement]
│   └── AI advisor query volume: [count per week]
├── Contribution Health
│   ├── Total contributors: [count]
│   ├── Contribution rate: [contributions per user per month]
│   ├── Review queue depth: [pending items]
│   └── Average review turnaround: [hours]
├── Knowledge Effectiveness Health
│   ├── Knowledge-referenced deal outcomes vs. non-referenced: [comparison]
│   ├── Playbook effectiveness trend: [are playbooks improving outcomes?]
│   └── Onboarding acceleration: [ramp time trend]
└── Decay Detection
    ├── Outdated artifacts flagged: [count]
    ├── Artifacts referencing deprecated products: [count]
    ├── Artifacts with stale competitive intelligence: [count]
    └── Artifacts with outcome data contradicting recommendations: [count]
```

#### 6.8.2 Usage Analytics

**FR-6.8.2.1**: The system shall track and display **detailed usage analytics**:
- Search queries (most common, zero-result queries, trending queries)
- Feature usage (which module features are most/least used)
- User engagement (active users, session duration, pages per session)
- Knowledge artifact engagement (views, ratings, shares, citations)
- AI advisor usage (queries, satisfaction, most common question types)

**FR-6.8.2.2**: Usage analytics shall inform **knowledge gap identification** — if users frequently search for content that doesn't exist, the system shall flag this as a knowledge gap.

#### 6.8.3 Gap Analysis

**FR-6.8.3.1**: The system shall automatically identify **knowledge gaps** — areas where the knowledge base is insufficient to answer user needs.

**FR-6.8.3.2**: Gap detection methods:
- **Zero-result search analysis**: Queries that returned no results indicate missing knowledge
- **Low-confidence AI responses**: AI answers with low confidence scores indicate areas of insufficient data
- **Dimension coverage analysis**: Segments, products, or competitors with few deals and sparse knowledge
- **User feedback analysis**: Explicit feedback indicating missing or insufficient information
- **Outcome correlation gaps**: Areas where knowledge cannot be correlated with outcomes due to insufficient data

**FR-6.8.3.3**: Identified gaps shall be presented as a **gap report** with:
- Gap description
- Estimated impact (how many users affected, how frequently)
- Recommended action (what knowledge needs to be created or captured)
- Priority ranking

#### 6.8.4 Knowledge Decay Detection

**FR-6.8.4.1**: The system shall automatically detect **knowledge decay** — knowledge artifacts that may be outdated or no longer accurate.

**FR-6.8.4.2**: Decay detection triggers:
- **Product changes**: Artifacts referencing product capabilities that have changed (detected via product release notes integration)
- **Competitive changes**: Artifacts with competitive intelligence that may be stale (detected via competitive encounter rate changes)
- **Outcome contradictions**: Artifacts recommending strategies that are no longer associated with positive outcomes (detected via recent deal data)
- **Age thresholds**: Artifacts not updated within configurable time windows (default: 12 months for playbooks, 6 months for competitive intelligence)
- **Low engagement**: Artifacts that have not been accessed in 6+ months may be irrelevant

**FR-6.8.4.3**: Decayed artifacts shall be flagged with a `border-l-4 border-l-amber-500` indicator and a "Potentially outdated" badge, with a recommendation for review.

**FR-6.8.4.4**: The system shall route decayed artifacts to the appropriate knowledge owner for review through the Knowledge Review Queue.

#### 6.8.5 Access Audit Log

**FR-6.8.5.1**: All access to Deal Memory content shall be **audit-logged** for compliance and governance purposes.

**FR-6.8.5.2**: Audit events to log:
- Search queries (query text, user, timestamp, results viewed)
- Knowledge artifact views (artifact ID, user, timestamp)
- AI advisor queries (query text, user, timestamp, response)
- Knowledge contributions (content, user, timestamp, review status)
- Export actions (content exported, user, timestamp)
- Access to sensitive content (pricing intelligence, individual deal details)

**FR-6.8.5.3**: Audit logs shall be **searchable** by user, date range, content type, and action type.

**FR-6.8.5.4**: The audit log shall support **anomaly detection** — unusual access patterns (e.g., bulk export of pricing intelligence, access to deals outside of assigned territory) shall be flagged for review.

---

## 7. Non-Functional Requirements

### 7.1 Performance

| Requirement | Specification |
|-------------|---------------|
| **NFR-7.1.1**: Search response time | ≤ 500ms for keyword/faceted search; ≤ 2 seconds for semantic/NL search |
| **NFR-7.1.2**: Deal Detail View load | ≤ 1.5 seconds for deals with up to 500 events and 50 documents |
| **NFR-7.1.3**: AI Advisor response time | ≤ 5 seconds for standard queries; ≤ 15 seconds for complex analysis |
| **NFR-7.1.4**: Similarity search | ≤ 1 second for nearest-neighbor queries against full archive |
| **NFR-7.1.5**: Proposal generation | ≤ 30 seconds for full proposal draft |
| **NFR-7.1.6**: Competitive briefing generation | ≤ 15 seconds for full briefing |
| **NFR-7.1.7**: Knowledge extraction pipeline | Process newly closed deals within 24 hours |
| **NFR-7.1.8**: Pattern detection batch | ≤ 10 minutes for full pattern analysis run |

### 7.2 Data Scale

**NFR-7.2.1**: The system shall support an archive of up to **100,000 closed deals** with associated knowledge artifacts.

**NFR-7.2.2**: Full-text search index shall support up to **10 million documents** (deals, artifacts, communications, notes).

**NFR-7.2.3**: The AI Advisor shall support context windows of up to **50,000 tokens** for complex queries requiring multiple source deals.

### 7.3 Data Quality

**NFR-7.3.1**: The system shall compute and maintain a **data quality score** for each deal record, based on:
- Field completeness (percentage of fields populated)
- Data consistency (no contradictory values)
- Data recency (when was the record last updated)
- Verification status (has the data been reviewed by a human)

**NFR-7.3.2**: Deals with data quality scores below 50% shall be flagged for remediation.

### 7.4 Security and Access Control

**NFR-7.4.1**: Access to Deal Memory shall follow the existing EDC role-based access control model with the following additional rules:

| Content Type | Access Level |
|-------------|-------------|
| Aggregated knowledge (patterns, benchmarks, segment reports) | All authenticated users |
| Individual deal details | Users with access to that deal in the Deal Pipeline module |
| Pricing intelligence | Deal desk and management roles only |
| Competitive intelligence | Sales roles and above |
| Individual seller behavioral data | Direct management chain only |
| Customer contact information | Users with access to that account |
| AI advisor conversation history | The user who created the conversation (shared conversations: as specified) |
| Audit logs | Administration roles only |

**NFR-7.4.2**: Sensitive pricing data shall be **anonymized and aggregated** in all knowledge artifacts — individual deal pricing shall never be exposed through search, AI responses, or intelligence reports.

**NFR-7.4.3**: Customer PII shall be handled in compliance with applicable data protection regulations (GDPR, CCPA). The system shall support data subject access requests and right to deletion.

---

## 8. Data Model

### 8.1 Core Entities

```
DealArchive
├── deal_id: UUID (FK → Deal in Pipeline)
├── archived_at: TIMESTAMP
├── archive_version: INTEGER
├── data_quality_score: INTEGER [0, 100]
├── search_vector: TSVECTOR (full-text search index)
├── embedding_vector: VECTOR(768) (semantic search embedding)
├── deal_summary: TEXT (AI-generated narrative summary)
├── key_insights: JSON (array of insight_ids)
├── precedent_tags: JSON (array of situation tags)
├── knowledge_artifact_ids: JSON (array of artifact_ids)
├── family_id: UUID (FK → DealFamily)
├── annotations: JSON (array of {user_id, text, timestamp})
└── connections: JSON (array of {related_deal_id, relationship_type, strength})

DealFamily
├── family_id: UUID
├── parent_account: STRING
├── account_industry: STRING
├── account_size_tier: STRING
├── deal_ids: JSON (ordered array of deal_ids)
├── total_lifetime_value: DECIMAL
├── relationship_depth_score: INTEGER [0, 100]
└── family_summary: TEXT

KnowledgeInsight
├── insight_id: UUID
├── insight_type: ENUM [win_factor, loss_factor, competitive, pricing, stakeholder, process, product, market, negotiation, relationship]
├── title: STRING
├── description: TEXT
├── source_deals: JSON (array of deal_ids with specific evidence)
├── confidence: FLOAT [0, 1]
├── applicability: JSON (conditions: segment, product, competitor, deal_type, deal_size)
├── validation_status: ENUM [auto_extracted, human_validated, outdated, rejected]
├── validated_by: UUID (nullable)
├── validated_at: TIMESTAMP (nullable)
├── relevance_score: FLOAT
├── usage_count: INTEGER
├── extracted_at: TIMESTAMP
├── last_updated: TIMESTAMP
└── related_insights: JSON (array of insight_ids)

Precedent
├── precedent_id: UUID
├── deal_id: UUID (FK)
├── situation_type: STRING
├── situation_description: TEXT
├── strategy_summary: TEXT
├── critical_moments: JSON (array of {timestamp, description, lesson})
├── outcome_summary: TEXT
├── reusable_lessons: JSON (array of lesson strings)
├── relevance_tags: JSON
├── quality_score: INTEGER [0, 100]
├── access_count: INTEGER
├── user_rating: FLOAT [1, 5]
├── created_by: UUID
├── created_at: TIMESTAMP
└── last_reviewed: TIMESTAMP

CompetitorArchive
├── competitor_id: UUID
├── name: STRING
├── profile: JSON (overview, positioning, pricing model)
├── encounter_count: INTEGER
├── win_rate_against: FLOAT
├── win_rate_trend: ENUM [improving, stable, declining]
├── strengths: JSON (array of {strength, frequency, source_deals})
├── weaknesses: JSON (array of {weakness, frequency, source_deals})
├── pricing_intelligence: JSON
├── counter_strategies: JSON (array of strategy_ids)
├── intelligence_log: JSON (array of {date, deal_id, type, detail, confidence})
├── briefing_template: TEXT
└── last_updated: TIMESTAMP

CustomerProfile
├── profile_id: UUID
├── account_name: STRING
├── account_id: STRING (CRM ID)
├── industry: STRING
├── size_tier: STRING
├── geography: STRING
├── deal_history: JSON (array of deal_ids)
├── contact_network: JSON (array of {contact_id, name, role, engagement_level, history})
├── buying_patterns: JSON
├── product_usage: JSON
├── competitive_exposure: JSON
├── negotiation_history: JSON
├── key_events: JSON (array of {timestamp, event_type, description})
├── risk_indicators: JSON
├── intelligence_notes: JSON (array of {user_id, note, timestamp})
└── last_updated: TIMESTAMP

SegmentReport
├── report_id: UUID
├── segment_type: STRING (industry, geography, size_tier)
├── segment_value: STRING
├── period: DATE (quarter)
├── deal_count: INTEGER
├── total_value: DECIMAL
├── win_rate: FLOAT
├── avg_deal_size: DECIMAL
├── avg_cycle_days: INTEGER
├── deal_patterns: JSON
├── win_profile: JSON
├── loss_profile: JSON
├── competitive_landscape: JSON
├── product_fit: JSON
├── key_objections: JSON
├── pricing_benchmarks: JSON
├── buying_process: JSON
├── emerging_trends: JSON
└── generated_at: TIMESTAMP

Playbook
├── playbook_id: UUID
├── type: ENUM [competitive, segment, product, stage, negotiation, objection_handling, expansion, recovery]
├── title: STRING
├── description: TEXT
├── applicable_conditions: JSON
├── strategy_overview: TEXT
├── recommended_actions: JSON (ordered array of action objects)
├── supporting_materials: JSON (array of document links)
├── evidence_base: JSON ({deals, win_rate, baseline_win_rate, sample_size, confidence})
├── effectiveness_score: FLOAT [0, 100]
├── usage_count: INTEGER
├── user_rating: FLOAT [1, 5]
├── version: INTEGER
├── status: ENUM [draft, active, deprecated]
├── created_by: UUID
├── created_at: TIMESTAMP
├── last_updated: TIMESTAMP
└── change_history: JSON (array of {version, changes, author, timestamp})

CaseStudy
├── case_study_id: UUID
├── deal_id: UUID (FK)
├── title: STRING
├── auto_generated: BOOLEAN
├── content: JSON (structured sections: situation, approach, critical_moments, outcome, lessons)
├── relevance_tags: JSON
├── quality_score: INTEGER [0, 100]
├── user_rating: FLOAT [1, 5]
├── access_count: INTEGER
├── status: ENUM [auto_generated, reviewed, published, archived]
├── created_at: TIMESTAMP
├── reviewed_by: UUID (nullable)
└── reviewed_at: TIMESTAMP (nullable)

ObjectionEntry
├── objection_id: UUID
├── canonical_text: STRING
├── variations: JSON (array of alternative phrasings)
├── category: STRING
├── sub_category: STRING
├── recommended_responses: JSON (array of {response_text, approach, when_to_use, evidence, effectiveness_rating})
├── source_deals: JSON (array of deal_ids)
├── win_rate_when_raised: FLOAT
├── win_rate_when_handled: FLOAT
├── usage_count: INTEGER
└── last_updated: TIMESTAMP

KnowledgeArtifact
├── artifact_id: UUID
├── artifact_type: ENUM [playbook, case_study, objection, pricing_intel, template, lesson, precedent, insight, pattern]
├── title: STRING
├── content: JSON (type-specific structured content)
├── source_deals: JSON (array of deal_ids)
├── applicable_conditions: JSON
├── quality_score: INTEGER [0, 100]
├── access_count: INTEGER
├── user_rating: FLOAT [1, 5]
├── created_by: UUID
├── created_at: TIMESTAMP
├── last_updated: TIMESTAMP
├── decay_flags: JSON (array of {type, detected_at, severity})
└── review_status: ENUM [auto_generated, pending_review, approved, needs_update, deprecated]

ContributionRecord
├── contribution_id: UUID
├── contributor_id: UUID (team_member_id)
├── contribution_type: ENUM [annotation, validation, playbook_update, case_study_refinement, objection_response, lesson, competitive_intel, template]
├── artifact_id: UUID (FK → KnowledgeArtifact, nullable)
├── deal_id: UUID (FK, nullable)
├── content: TEXT
├── quality_score: INTEGER [0, 100]
├── review_status: ENUM [pending, approved, needs_revision, rejected]
├── reviewed_by: UUID (nullable)
├── impact_score: FLOAT (how often this contribution was accessed)
├── submitted_at: TIMESTAMP
└── reviewed_at: TIMESTAMP (nullable)

SearchLog
├── search_id: UUID
├── user_id: UUID
├── query_text: STRING
├── query_mode: ENUM [full_text, natural_language, faceted, similarity, semantic, timeline, graph]
├── filters_applied: JSON
├── results_count: INTEGER
├── results_engaged: JSON (array of result_ids that were clicked)
├── session_id: UUID
├── timestamp: TIMESTAMP
└── satisfaction_rating: INTEGER [1, 5] (nullable — optional post-search rating)

AIAdvisorSession
├── session_id: UUID
├── user_id: UUID
├── started_at: TIMESTAMP
├── ended_at: TIMESTAMP (nullable)
├── messages: JSON (array of {role, content, citations, confidence, timestamp})
├── context: JSON (active deal context if applicable)
├── satisfaction_rating: INTEGER [1, 5] (nullable)
├── shared_with: JSON (array of user_ids)
└── saved: BOOLEAN
```

### 8.2 Data Pipeline Architecture

```
┌───────────────────────┐  ┌───────────────────────┐  ┌───────────────────────┐
│  CRM / Deal Pipeline  │  │  Activity Systems     │  │  Document Store       │
│  (Closed deal data,   │  │  (Emails, meetings,   │  │  (Proposals, SOWs,    │
│   outcomes, stages)   │  │   calls, tasks)       │  │   contracts, notes)   │
└───────────┬───────────┘  └───────────┬───────────┘  └───────────┬───────────┘
            │                          │                          │
            ▼                          ▼                          ▼
┌───────────────────────────────────────────────────────────────────────────────┐
│                         Ingestion & Indexing Layer                            │
│  - Structured data normalization                                              │
│  - Document parsing and OCR                                                   │
│  - Full-text indexing (Elasticsearch)                                         │
│  - Vector embedding generation (transformer model)                            │
│  - Entity resolution (customer, contact, competitor deduplication)             │
└───────────────────────────────────┬───────────────────────────────────────────┘
                                    │
                ┌───────────────────┼───────────────────┐
                ▼                   ▼                    ▼
      ┌──────────────┐   ┌──────────────────┐   ┌──────────────┐
      │ Archive       │   │ Knowledge        │   │ Intelligence │
      │ Store         │   │ Extraction       │   │ Layers       │
      │               │   │ Pipeline         │   │              │
      │ - Deal records│   │ - NLP extraction │   │ - Pattern    │
      │ - Documents   │   │ - Insight        │   │   detection  │
      │ - Timelines   │   │   generation     │   │ - Customer   │
      │ - Embeddings  │   │ - Auto-summary   │   │   profiling  │
      │               │   │ - Entity linking │   │ - Segment    │
      │               │   │ - Case study     │   │   analysis   │
      │               │   │   generation     │   │ - Decay      │
      │               │   │                  │   │   detection  │
      └──────┬───────┘   └────────┬─────────┘   └──────┬───────┘
             │                    │                     │
             ▼                    ▼                     ▼
      ┌──────────────┐   ┌──────────────────┐   ┌──────────────┐
      │ Search        │   │ Knowledge        │   │ Pattern      │
      │ Engine        │   │ Artifact Store   │   │ Library      │
      │               │   │                  │   │              │
      │ - Elasticsearch│  │ - Playbooks      │   │ - Win/Loss   │
      │ - Vector DB   │   │ - Case studies   │   │   patterns   │
      │ - Query       │   │ - Objections     │   │ - Behavioral │
      │   planner     │   │ - Templates      │   │ - Market     │
      │ - Ranking     │   │ - Lessons        │   │              │
      │   model       │   │ - Competitor     │   │              │
      └──────┬───────┘   │   archives       │   └──────┬───────┘
             │           └────────┬─────────┘          │
             │                    │                     │
             ▼                    ▼                     ▼
      ┌──────────────────────────────────────────────────────────┐
      │                    AI Advisor Layer                       │
      │  - Retrieval-Augmented Generation (RAG)                  │
      │  - Context assembly from multiple sources                │
      │  - Response generation with citations                    │
      │  - Confidence calibration                                │
      │  - Conversation management                               │
      └──────────────────────────┬───────────────────────────────┘
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
| Styling | Tailwind CSS v4.3.0 | Design system compliance |
| UI Primitives | Radix UI | Search, dialogs, tabs, tooltips, select, navigation |
| Form Management | React Hook Form + Zod | Contribution forms, annotation inputs |
| State Management | Zustand + React Query | Local state + server state with caching |
| Visualization | D3.js + Visx | Timelines, network graphs, treemaps, comparison views |
| Search UI | Custom components + Radix Command | Search bar, filters, results |
| Rich Text Editor | TipTap or Plate | Annotation editing, playbook editing, knowledge contribution |
| Animation | Framer Motion | Page transitions, feed items, search results |

### 9.2 Backend Architecture

| Layer | Technology | Purpose |
|-------|-----------|---------|
| API | Python / FastAPI | REST API + WebSocket server |
| Primary DB | PostgreSQL | Structured data (deals, artifacts, profiles, playbooks) |
| Search Engine | Elasticsearch 8+ | Full-text search, faceted search, aggregations |
| Vector Database | Pinecone / pgvector / Weaviate | Semantic search, similarity search, embedding storage |
| NLP Pipeline | spaCy + Hugging Face Transformers | Entity extraction, topic classification, sentiment, summarization |
| Embedding Model | sentence-transformers (all-MiniLM-L6-v2 or domain-specific) | Generating 768-dim embeddings for semantic search |
| AI Advisor | RAG pipeline: retrieval + LLM (GPT-4 class / Claude / open-source) | Natural language query answering with citations |
| Document Processing | Apache Tika + custom parsers | Document parsing, OCR, metadata extraction |
| Task Queue | Celery + Redis | Background extraction, indexing, report generation |
| Cache | Redis | API response caching, session management, search suggestions |
| Object Storage | S3-compatible | Document storage (proposals, contracts, presentations) |

### 9.3 Component Architecture

```
<DealMemoryModule>
├── <KnowledgeHubPage>
│   ├── <UnifiedSearchBar>              ← Multi-modal search with suggestions
│   ├── <SearchResults>                 ← Faceted results with preview panel
│   ├── <KnowledgeFeed>                 ← Personalized feed of new artifacts
│   ├── <FeaturedPrecedents>            ← Curated precedent card rows
│   └── <KnowledgeHealthDashboard>      ← Health metric card grid
├── <DealArchivePage>
│   ├── <DealExplorer>                  ← Multi-view browsing (table/card/timeline/map/network)
│   │   ├── <TableView>                 ← Sortable, filterable data table
│   │   ├── <CardGridView>              ← Visual card grid
│   │   ├── <TimelineView>              ← Horizontal timeline
│   │   ├── <MapView>                   ← Geographic distribution
│   │   └── <NetworkView>               ← Relationship graph
│   ├── <DealDetailView>                ← Tabbed comprehensive view
│   │   ├── <OverviewTab>               ← Summary, metrics, tags
│   │   ├── <TimelineTab>               ← Chronological event sequence
│   │   ├── <StakeholderMapTab>         ← Contact network visualization
│   │   ├── <StrategyTab>               ← Strategy notes and decisions
│   │   ├── <OutcomeTab>                ← Win/loss analysis
│   │   ├── <DocumentsTab>              ← Document viewer with version history
│   │   ├── <KnowledgeTab>              ← Extracted insights and artifacts
│   │   └── <ConnectionsTab>            ← Related deals and patterns
│   ├── <DealComparisonView>            ← Side-by-side comparison matrix
│   └── <DealFamilyView>                ← Account-level deal tree
├── <IntelligenceLayersPage>
│   ├── <InsightsExtractor>             ← Auto-extracted insight cards
│   ├── <PrecedentLibrary>              ← Situation-organized precedent cards
│   ├── <NegotiationDashboard>          ← Pricing/concession analysis tools
│   ├── <CompetitiveArchive>            ← Per-competitor intelligence profiles
│   ├── <CustomerProfiles>              ← Account-level intelligence profiles
│   └── <SegmentReports>               ← Segment intelligence report viewer
├── <KnowledgeArtifactsPage>
│   ├── <PlaybookRepository>            ← Playbook cards with effectiveness data
│   ├── <CaseStudyLibrary>             ← Narrative case study viewer
│   ├── <ObjectionDatabase>            ← Hierarchical objection tree
│   ├── <PricingLibrary>               ← Pricing benchmark tools
│   ├── <ProposalTemplates>            ← Template gallery with AI assembly
│   └── <LessonsLearned>               ← Peer-reviewed lesson cards
├── <PatternLibraryPage>
│   ├── <WinPatternGallery>             ← Win pattern cards
│   ├── <LossPatternGallery>            ← Loss pattern cards (from Autopsy)
│   ├── <BehavioralPatterns>            ← Behavioral pattern radar charts
│   ├── <MarketPatterns>               ← Market trend charts
│   └── <PatternLifecycleTracker>       ← Lifecycle dashboard
├── <AIAdvisorPage>
│   ├── <ChatInterface>                 ← Conversational AI panel
│   ├── <StrategyAdvisor>               ← Deal strategy recommendation cards
│   ├── <CompetitiveBriefingGen>        ← Auto-generated briefing viewer
│   ├── <ProposalDraftGen>             ← Draft proposal editor
│   └── <OnboardingTutor>             ← Guided learning interface
├── <KnowledgeContributionPage>
│   ├── <ContributionDashboard>         ← Personal contribution stats
│   ├── <ReviewQueue>                   ← Reviewer queue with approval workflow
│   ├── <Leaderboard>                   ← Gamified contribution rankings
│   └── <QualityMetrics>               ← Quality tracking charts
└── <AnalyticsGovernancePage>
    ├── <HealthMetrics>                 ← Comprehensive health dashboard
    ├── <UsageAnalytics>               ← Usage trend charts
    ├── <GapAnalysis>                   ← Knowledge gap identification
    ├── <DecayDetection>               ← Outdated artifact alerts
    └── <AuditLog>                      ← Searchable access log
```

---

## 10. Algorithmic Specifications

### 10.1 Semantic Search Embedding Pipeline

```python
from sentence_transformers import SentenceTransformer
import numpy as np

class DealMemoryEmbedder:
    def __init__(self):
        # Domain-adapted sentence transformer
        self.model = SentenceTransformer('all-MiniLM-L6-v2')
        # For production: fine-tune on deal corpus for better domain performance
    
    def embed_deal(self, deal):
        """
        Generate a composite embedding for a deal by embedding multiple
        facets and combining them with learned weights.
        """
        facets = {
            'summary': deal.deal_summary or self.generate_summary(deal),
            'strategy': deal.strategy_notes or '',
            'outcome': deal.outcome_analysis or '',
            'narrative': deal.loss_narrative or deal.win_narrative or '',
            'customer_context': self.build_customer_context(deal),
            'competitive_context': self.build_competitive_context(deal)
        }
        
        embeddings = {}
        for facet_name, text in facets.items():
            if text.strip():
                embeddings[facet_name] = self.model.encode(text)
        
        # Weighted combination
        weights = {
            'summary': 0.25,
            'strategy': 0.20,
            'outcome': 0.20,
            'narrative': 0.15,
            'customer_context': 0.10,
            'competitive_context': 0.10
        }
        
        composite = np.zeros(768)
        total_weight = 0
        for facet_name, embedding in embeddings.items():
            w = weights.get(facet_name, 0.1)
            composite += w * embedding
            total_weight += w
        
        if total_weight > 0:
            composite /= total_weight
        
        return composite
    
    def embed_query(self, query_text, query_mode='semantic'):
        """
        Generate embedding for a search query.
        For natural language queries, add instruction prefix for better retrieval.
        """
        if query_mode == 'natural_language':
            # Instruction-tuned embedding for NL queries
            query_text = f"Find enterprise deals where: {query_text}"
        
        return self.model.encode(query_text)
    
    def find_similar_deals(self, query_embedding, top_k=20, filters=None):
        """
        Retrieve most similar deals using approximate nearest neighbor search.
        """
        # Vector database query with optional metadata filters
        results = self.vector_db.query(
            vector=query_embedding.tolist(),
            top_k=top_k,
            filter=filters,  # e.g., {"outcome": "won", "segment": "enterprise"}
            include_metadata=True
        )
        
        return results

    def hybrid_search(self, query_text, query_embedding, filters=None, top_k=20):
        """
        Combine full-text search (Elasticsearch) with semantic search (vector DB)
        using Reciprocal Rank Fusion for optimal relevance.
        """
        # Full-text results
        text_results = self.elasticsearch.search(
            index='deals',
            body=self.build_es_query(query_text, filters, size=top_k * 2)
        )
        text_ranked = {hit['_id']: rank for rank, hit in enumerate(text_results['hits']['hits'])}
        
        # Semantic results
        vector_results = self.find_similar_deals(query_embedding, top_k=top_k * 2, filters=filters)
        vector_ranked = {result['id']: rank for rank, result in enumerate(vector_results)}
        
        # Reciprocal Rank Fusion
        k = 60  # RRF constant
        combined_scores = {}
        all_ids = set(text_ranked.keys()) | set(vector_ranked.keys())
        
        for doc_id in all_ids:
            score = 0
            if doc_id in text_ranked:
                score += 1 / (k + text_ranked[doc_id])
            if doc_id in vector_ranked:
                score += 1 / (k + vector_ranked[doc_id])
            combined_scores[doc_id] = score
        
        # Sort by combined score
        ranked_ids = sorted(combined_scores.keys(), key=lambda x: combined_scores[x], reverse=True)
        
        return ranked_ids[:top_k]
```

### 10.2 RAG Pipeline for AI Advisor

```python
class DealMemoryRAG:
    def __init__(self, embedder, search_engine, llm_client, knowledge_base):
        self.embedder = embedder
        self.search = search_engine
        self.llm = llm_client
        self.kb = knowledge_base
    
    def answer_query(self, query, user_context, conversation_history=None):
        """
        Answer a natural language query about deal history using RAG.
        """
        # 1. Query understanding — classify the query intent
        intent = self.classify_intent(query)
        
        # 2. Retrieve relevant context from multiple sources
        contexts = []
        
        # 2a. Semantic search across deal archive
        query_embedding = self.embedder.embed_query(query, 'natural_language')
        similar_deals = self.embedder.find_similar_deals(
            query_embedding, 
            top_k=10,
            filters=self.build_access_filters(user_context)
        )
        contexts.append(('deals', similar_deals))
        
        # 2b. Search knowledge artifacts
        relevant_artifacts = self.kb.search_artifacts(query, top_k=5)
        contexts.append(('artifacts', relevant_artifacts))
        
        # 2c. Search patterns
        relevant_patterns = self.kb.search_patterns(query, top_k=3)
        contexts.append(('patterns', relevant_patterns))
        
        # 2d. Search competitive intelligence
        if intent['involves_competitor']:
            competitor_data = self.kb.get_competitor_intelligence(intent['competitors'])
            contexts.append(('competitive', competitor_data))
        
        # 2e. Search negotiation intelligence
        if intent['involves_pricing_or_negotiation']:
            pricing_data = self.kb.get_pricing_intelligence(intent['deal_characteristics'])
            contexts.append(('pricing', pricing_data))
        
        # 3. Assemble context window
        context_text = self.assemble_context(contexts, max_tokens=40000)
        
        # 4. Generate response with citations
        system_prompt = self.build_system_prompt(user_context)
        user_prompt = self.build_user_prompt(query, context_text, conversation_history)
        
        response = self.llm.generate(
            system=system_prompt,
            user=user_prompt,
            temperature=0.3,  # Low temperature for factual responses
            max_tokens=2000
        )
        
        # 5. Extract and verify citations
        citations = self.extract_citations(response, contexts)
        confidence = self.compute_confidence(response, contexts, similar_deals)
        
        # 6. Log for quality tracking
        self.log_query(query, response, citations, confidence, user_context)
        
        return {
            'response': response,
            'citations': citations,
            'confidence': confidence,
            'sources_used': [c[0] for c in contexts],
            'related_queries': self.suggest_related_queries(query, intent)
        }
    
    def classify_intent(self, query):
        """
        Classify query intent to determine which knowledge sources to consult.
        """
        # Use LLM for intent classification
        intent_response = self.llm.generate(
            system="Classify the following query about enterprise sales deals.",
            user=f"""Query: {query}
            
            Return JSON with:
            - category: precedent|strategy|pricing|competitive|pattern|customer|trend|process|product
            - involves_competitor: boolean
            - competitors: list of competitor names
            - deal_characteristics: inferred deal features
            - specificity: specific_deal|general_inquiry|hypothetical
            """,
            response_format="json"
        )
        
        return json.loads(intent_response)
    
    def compute_confidence(self, response, contexts, source_deals):
        """
        Compute confidence score for the AI response based on source data quality.
        """
        factors = {
            'source_count': min(len(source_deals) / 5, 1.0),  # More sources = higher confidence
            'source_recency': self.compute_avg_recency(source_deals),
            'source_outcome_consistency': self.compute_outcome_consistency(source_deals),
            'statistical_significance': self.compute_statistical_significance(source_deals),
            'knowledge_artifact_count': min(len(contexts[1][1]) / 3, 1.0) if len(contexts) > 1 else 0
        }
        
        weights = {'source_count': 0.25, 'source_recency': 0.20, 
                   'source_outcome_consistency': 0.25, 'statistical_significance': 0.20,
                   'knowledge_artifact_count': 0.10}
        
        confidence = sum(factors[k] * weights[k] for k in factors)
        
        if confidence > 0.7:
            return 'high'
        elif confidence > 0.4:
            return 'medium'
        else:
            return 'low'
```

### 10.3 Knowledge Extraction Pipeline

```python
class KnowledgeExtractor:
    def __init__(self, nlp, llm, deal_db, insight_db):
        self.nlp = nlp
        self.llm = llm
        self.deal_db = deal_db
        self.insight_db = insight_db
    
    def extract_from_closed_deal(self, deal):
        """
        Extract structured knowledge from a newly closed deal.
        Runs as a background task after deal closure.
        """
        # 1. Generate deal summary
        summary = self.generate_deal_summary(deal)
        
        # 2. Extract insights by type
        insights = []
        
        # Win/loss factors
        if deal.outcome == 'won':
            insights.extend(self.extract_win_factors(deal))
        else:
            insights.extend(self.extract_loss_factors(deal))
        
        # Competitive insights
        if deal.competitors:
            insights.extend(self.extract_competitive_insights(deal))
        
        # Pricing insights
        insights.extend(self.extract_pricing_insights(deal))
        
        # Stakeholder insights
        insights.extend(self.extract_stakeholder_insights(deal))
        
        # Process insights
        insights.extend(self.extract_process_insights(deal))
        
        # 3. Check if this deal qualifies as a precedent
        if self.qualifies_as_precedent(deal):
            precedent = self.generate_precedent(deal)
            insights.append(precedent)
        
        # 4. Update customer profile
        self.update_customer_profile(deal)
        
        # 5. Update competitor archives
        for competitor in deal.competitors:
            self.update_competitor_archive(competitor, deal)
        
        # 6. Generate case study draft if high-value
        if deal.value > self.case_study_threshold:
            case_study = self.generate_case_study_draft(deal)
        
        # 7. Check for new objection patterns
        self.detect_new_objections(deal)
        
        # 8. Store all extracted knowledge
        for insight in insights:
            self.insight_db.store(insight)
        
        # 9. Update embeddings
        self.update_deal_embedding(deal)
        
        # 10. Trigger pattern detection refresh
        self.trigger_pattern_refresh(deal)
        
        return {
            'summary': summary,
            'insights_extracted': len(insights),
            'precedent_generated': self.qualifies_as_precedent(deal),
            'case_study_generated': deal.value > self.case_study_threshold
        }
    
    def extract_win_factors(self, deal):
        """
        Extract factors that contributed to winning a deal.
        """
        prompt = f"""Analyze this won deal and identify the key factors that contributed to winning.
        
        Deal Details:
        - Value: ${deal.value:,.0f}
        - Product: {deal.products}
        - Segment: {deal.segment}
        - Cycle time: {deal.cycle_days} days
        - Discount: {deal.discount_pct}%
        - Competitors: {deal.competitors}
        - Stakeholders engaged: {deal.stakeholder_count}
        - Activities: {deal.activity_summary}
        - Seller notes: {deal.notes}
        
        For each factor, provide:
        1. Factor name
        2. Description of how it contributed
        3. Confidence level (high/medium/low)
        4. Applicability (when would this factor be relevant again)
        
        Identify at most 5 factors, ordered by importance.
        """
        
        response = self.llm.generate(system="You are a sales intelligence analyst.", user=prompt)
        
        return self.parse_insights(response, deal, insight_type='win_factor')
    
    def generate_case_study_draft(self, deal):
        """
        Generate a draft case study from deal data using AI.
        """
        # Gather all available context
        context = {
            'deal': deal.to_dict(),
            'timeline': self.deal_db.get_timeline(deal.id),
            'stakeholders': self.deal_db.get_stakeholders(deal.id),
            'documents': self.deal_db.get_documents(deal.id),
            'similar_deals': self.find_similar_deals(deal, top_k=3),
            'insights': self.insight_db.get_for_deal(deal.id)
        }
        
        prompt = f"""Write a detailed case study for this enterprise deal. Use the following structure and data.
        
        Deal Context:
        {json.dumps(context, indent=2, default=str)}
        
        Generate a case study with these sections:
        1. Situation: Customer background, business challenge, competitive landscape
        2. Approach: Strategy, key actions, stakeholder plan, technical evaluation
        3. Critical Moments: Turning points, objections, competitive threats, negotiations
        4. Outcome: Result, key factors, customer's rationale
        5. Lessons: What worked, what could improve, reusable insights
        
        Write in a professional, instructive tone. Focus on actionable insights that would help a seller in a similar situation.
        """
        
        case_study_content = self.llm.generate(
            system="You are a sales case study writer creating instructive content from deal data.",
            user=prompt,
            max_tokens=3000
        )
        
        return self.parse_case_study(case_study_content, deal)
```

### 10.4 Knowledge Decay Detection

```python
class KnowledgeDecayDetector:
    def __init__(self, artifact_db, deal_db, product_db, config):
        self.artifacts = artifact_db
        self.deals = deal_db
        self.products = product_db
        self.config = config
    
    def detect_decay(self):
        """
        Run periodic decay detection across all knowledge artifacts.
        Returns list of artifacts flagged for review.
        """
        flagged = []
        
        for artifact in self.artifacts.get_all_active():
            decay_signals = []
            
            # 1. Age-based decay
            age_days = (datetime.now() - artifact.last_updated).days
            if age_days > self.config.max_age_days.get(artifact.artifact_type, 365):
                decay_signals.append({
                    'type': 'age',
                    'severity': 'moderate',
                    'detail': f'Not updated in {age_days} days'
                })
            
            # 2. Product change decay
            if artifact.references_products:
                for product_id in artifact.references_products:
                    recent_changes = self.products.get_changes_since(
                        product_id, artifact.last_updated
                    )
                    if recent_changes:
                        decay_signals.append({
                            'type': 'product_change',
                            'severity': 'elevated',
                            'detail': f'Product {product_id} has had {len(recent_changes)} changes since artifact was last updated'
                        })
            
            # 3. Competitive landscape decay
            if artifact.references_competitors:
                for competitor_id in artifact.references_competitors:
                    encounter_trend = self.deals.get_competitor_encounter_trend(
                        competitor_id, months=6
                    )
                    if encounter_trend['significant_change']:
                        decay_signals.append({
                            'type': 'competitive_shift',
                            'severity': 'moderate',
                            'detail': f'Competitor {competitor_id} encounter rate has {encounter_trend["direction"]} significantly'
                        })
            
            # 4. Outcome contradiction decay
            if artifact.recommends_strategy:
                recent_outcomes = self.deals.get_outcomes_for_strategy(
                    artifact.recommends_strategy, months=6
                )
                if recent_outcomes and recent_outcomes['win_rate'] < artifact.evidence_base['win_rate'] * 0.7:
                    decay_signals.append({
                        'type': 'outcome_contradiction',
                        'severity': 'critical',
                        'detail': f'Strategy win rate has dropped from {artifact.evidence_base["win_rate"]:.0%} to {recent_outcomes["win_rate"]:.0%}'
                    })
            
            # 5. Low engagement decay
            if artifact.access_count_last_90_days == 0 and artifact.total_access_count > 10:
                decay_signals.append({
                    'type': 'low_engagement',
                    'severity': 'low',
                    'detail': 'Previously popular artifact has not been accessed in 90 days'
                })
            
            if decay_signals:
                max_severity = max(s['severity'] for s in decay_signals, 
                                   key=lambda x: {'low': 0, 'moderate': 1, 'elevated': 2, 'critical': 3}[x])
                flagged.append({
                    'artifact': artifact,
                    'signals': decay_signals,
                    'max_severity': max_severity,
                    'recommended_action': self.recommend_action(artifact, decay_signals)
                })
        
        return sorted(flagged, key=lambda x: 
            {'low': 0, 'moderate': 1, 'elevated': 2, 'critical': 3}[x['max_severity']], 
            reverse=True)
```

### 10.5 Deal Similarity Engine

```python
class DealSimilarityEngine:
    def __init__(self, embedder, deal_db):
        self.embedder = embedder
        self.deals = deal_db
    
    def find_similar(self, reference_deal, top_k=10, similarity_threshold=0.5):
        """
        Find deals most similar to a reference deal using multi-signal similarity.
        """
        # 1. Embedding-based similarity (semantic)
        ref_embedding = self.embedder.embed_deal(reference_deal)
        embedding_neighbors = self.embedder.find_similar_deals(ref_embedding, top_k=top_k * 3)
        
        # 2. Structured feature similarity
        ref_features = self.extract_features(reference_deal)
        
        scored_deals = []
        for neighbor in embedding_neighbors:
            deal = self.deals.get(neighbor['id'])
            features = self.extract_features(deal)
            
            # Composite similarity
            similarity = self.compute_composite_similarity(
                ref_features, features,
                embedding_similarity=neighbor['score']
            )
            
            if similarity >= similarity_threshold:
                scored_deals.append({
                    'deal': deal,
                    'similarity': similarity,
                    'similarity_breakdown': self.get_similarity_breakdown(ref_features, features)
                })
        
        # Sort by similarity and return top_k
        scored_deals.sort(key=lambda x: x['similarity'], reverse=True)
        return scored_deals[:top_k]
    
    def compute_composite_similarity(self, ref, candidate, embedding_similarity):
        """
        Compute composite similarity using multiple signals.
        """
        weights = {
            'embedding': 0.30,       # Semantic similarity from embeddings
            'segment': 0.15,         # Same industry/vertical
            'product': 0.15,         # Same product(s)
            'size': 0.10,            # Similar deal size
            'competitor': 0.10,      # Same competitor(s)
            'deal_type': 0.05,       # Same deal type (new/expansion/renewal)
            'cycle_profile': 0.05,   # Similar cycle time profile
            'stakeholder_profile': 0.05,  # Similar stakeholder engagement pattern
            'outcome': 0.05          # Same outcome (for pattern analysis)
        }
        
        component_scores = {
            'embedding': embedding_similarity,
            'segment': self.jaccard_similarity(ref['segments'], candidate['segments']),
            'product': self.jaccard_similarity(ref['products'], candidate['products']),
            'size': self.numeric_similarity(ref['value'], candidate['value'], scale='log'),
            'competitor': self.jaccard_similarity(ref['competitors'], candidate['competitors']),
            'deal_type': 1.0 if ref['deal_type'] == candidate['deal_type'] else 0.0,
            'cycle_profile': self.numeric_similarity(ref['cycle_days'], candidate['cycle_days'], scale='linear'),
            'stakeholder_profile': self.numeric_similarity(ref['stakeholder_count'], candidate['stakeholder_count'], scale='linear'),
            'outcome': 1.0 if ref['outcome'] == candidate['outcome'] else 0.0
        }
        
        composite = sum(weights[k] * component_scores[k] for k in weights)
        
        return composite
```

---

## 11. User Flows

### 11.1 Primary Flow: Preparing for a Competitive Deal

```
1. AE Sarah is preparing for a Discovery call with MedFirst Health (healthcare, enterprise, $250K potential)
2. Sarah navigates to Deal Memory → Search Interface
3. Sarah types: "enterprise healthcare deals with competitive pressure"
4. System returns results:
   - 12 relevant deals, ranked by relevance
   - 3 playbooks: "Healthcare Enterprise Playbook," "CloudBridge Competitive Playbook," "DataSync Pro Healthcare Positioning"
   - 5 case studies of similar deals
5. Sarah clicks "Most similar" filter → System identifies "Pinnacle Health — $280K Won Deal" as most similar
6. Sarah opens the Deal Detail View → Reviews:
   - Timeline: 90-day cycle, 6 stakeholders engaged
   - Strategy: Led with compliance capabilities, neutralized CloudBridge on security
   - Critical moment: POC success with real-time monitoring won over technical evaluator
   - Pricing: 12% discount with 2-year commitment
   - Outcome: Won — cited security certifications and POC results as deciding factors
7. Sarah navigates to Competitive Intelligence → CloudBridge profile
   - Reads: "CloudBridge's main weakness in healthcare: lacks HIPAA-compliant data residency options"
   - Reviews counter-strategies: "Lead with compliance certifications before feature discussion"
8. Sarah asks AI Advisor: "What objections should I expect from a healthcare CTO evaluating DataSync Pro?"
   - AI responds with 4 common objections, each with recommended responses, citing source deals
9. Sarah uses Proposal Draft Generator → System selects healthcare-relevant templates and inserts Pinnacle Health as a reference case study
10. Sarah saves this research session for her manager to review before the call
```

### 11.2 Secondary Flow: New Seller Onboarding

```
1. New AE James joins the team, assigned to mid-market financial services
2. James navigates to Deal Memory → AI Advisor → Onboarding Tutor mode
3. Tutor greets: "Welcome! I see you're focused on mid-market financial services. Let me help you get up to speed."
4. Tutor presents a learning path:
   - Week 1: "Understand your market" → Links to Segment Intelligence Report for financial services
   - Week 2: "Know your competitors" → Links to competitive archives for top 3 competitors in segment
   - Week 3: "Learn from wins" → Links to 5 featured case studies in financial services
   - Week 4: "Master the playbook" → Links to Financial Services Playbook and Negotiation Playbook
5. James starts with the Segment Intelligence Report:
   - Reads: Typical deal size $80-150K, average cycle 75 days, key decision criteria
   - Studies: Common objections and effective responses for this segment
   - Reviews: 3 case studies of successful mid-market financial services deals
6. James uses the AI Advisor to ask: "What should I know about selling to community banks?"
   - AI provides detailed response with 6 cited deals, highlighting: compliance is top concern, IT teams are small, decision cycles are long, referral relationships matter
7. Tutor presents a quiz: "A community bank CTO says 'Your product is too complex for our team.' How would you respond?"
   - James submits his answer → Tutor provides feedback and links to the recommended response with source deals
8. Manager receives James's onboarding progress report showing completion rates and knowledge areas covered
```

### 11.3 Tertiary Flow: Knowledge Contribution and Validation

```
1. AE Marcus just closed a complex $400K deal with Vertex Financial
2. Deal Memory system auto-extracts insights and generates a case study draft
3. Marcus receives a contribution prompt: "Your Vertex Financial deal has generated 4 insights and a case study draft. Would you like to review and refine?"
4. Marcus opens the contribution review:
   - Insight 1 (auto-extracted): "Multi-threading with C-suite was critical" → Marcus validates: "Yes, the CFO was the true decision maker, not the CIO as we initially thought"
   - Insight 2 (auto-extracted): "Competitor was DataVault" → Marcus adds: "DataVault's pricing was 20% below ours but they couldn't demonstrate real-time reconciliation"
   - Case study draft: Marcus reviews the AI-generated narrative, corrects the competitive section, adds a key negotiation detail the AI missed
5. Marcus submits his refinements → System routes to his manager for review
6. Manager reviews, approves with minor edits
7. Updated insights and case study are published to the knowledge base
8. Marcus receives contribution credit: +4 insights validated, +1 case study refined
9. His contribution streak extends to 3 months
10. Next quarter, a new AE finds Marcus's Vertex Financial case study in a search and uses it to prepare for a similar deal
```

---

## 12. Integration Points

### 12.1 Cross-Module Integration Matrix

| From Deal Memory | To Module | Integration |
|-----------------|-----------|-------------|
| Historical precedents | Pipeline Analytics | Pipeline Analytics' win probability model references deal similarity scores from Deal Memory |
| Deal summaries and insights | Pipeline Analytics | Auto-enrich pipeline deals with relevant historical context |
| Competitive intelligence | Pipeline Analytics | Feed competitive encounter data into pipeline forecast models |
| Loss patterns | Closed-Lost Autopsy | Pattern Library serves as shared repository; Autopsy module writes patterns, Deal Memory surfaces them |
| Customer profiles | Closed-Lost Autopsy | Pre-populate autopsy stakeholder analysis with historical contact data |
| Objection database | Closed-Lost Autopsy | Cross-reference loss objections with objection handling database |
| Deal archive | Portfolio Risk Analysis | Historical deal data enriches correlation analysis with longer time horizons |
| Segment intelligence | Portfolio Risk Analysis | Segment risk assessments reference historical segment performance |
| All deal data | All modules | Deal Memory serves as the unified data layer |

| From Module | To Deal Memory | Integration |
|------------|---------------|-------------|
| Pipeline Analytics | Deal Memory | Active deal data enriches the archive; pipeline metrics provide context for historical comparison |
| Closed-Lost Autopsy | Deal Memory | Autopsy records, loss patterns, and competitive intelligence feed directly into Deal Memory's knowledge base |
| Portfolio Risk Analysis | Deal Memory | Risk scores and correlation findings enrich deal records and segment intelligence |
| Deal Pipeline | Deal Memory | All closed deal data automatically ingested into the archive |

### 12.2 Shared Data Entities

```
Deal (unified across all modules)
├── Pipeline fields: stage, velocity, win_probability
├── Risk fields: risk_score, cluster_assignment
├── Autopsy fields: loss_risk_score, autopsy_status, loss_patterns
├── Memory fields: archive_record_id, knowledge_artifacts, precedent_tags, embedding_vector
├── Shared fields: deal_id, value, team_member, product, segment, dates, activities
```

---

## 13. Design System Compliance

### 13.1 Color Token Usage

| Element | Token | Application |
|---------|-------|-------------|
| Won deals / positive insights | `emerald-500` at 5-40% opacity | Badges, accents, indicators |
| Lost deals / warning indicators | `red-500` at 5-40% opacity | Badges, accents, indicators |
| Moderate / watch items | `amber-500` at 5-40% opacity | Decay alerts, attention items |
| Informational / neutral | `cyan-500` / `indigo-500` | Tags, reference links |
| Primary accent | `--primary` | Active states, primary actions, links |
| Background surfaces | `--card` / `--background` | Card backgrounds, page background |
| Borders | `--border` | Card borders, dividers |
| Text primary | `--foreground` | Headings, body text |
| Text secondary | `--muted-foreground` | Labels, descriptions, metadata |
| Search highlights | `bg-amber-500/20 text-amber-600` | Search term highlighting in results |

### 13.2 Typography

| Element | Style |
|---------|-------|
| Search bar text | `text-base font-normal` |
| Search results title | `text-sm font-semibold text-foreground` |
| Search results snippet | `text-sm text-muted-foreground leading-relaxed` |
| Deal value | `text-2xl font-bold font-mono tabular-nums` |
| Deal name | `text-lg font-semibold text-foreground` |
| Deal metadata | `text-xs text-muted-foreground` |
| Knowledge artifact title | `text-sm font-semibold text-foreground` |
| Knowledge artifact body | `text-sm text-foreground leading-relaxed` |
| AI response text | `text-sm text-foreground leading-relaxed` |
| Citation text | `text-xs text-primary underline` |
| Confidence labels | `text-xs font-medium` with semantic color |
| Table headers | `text-xs font-medium text-muted-foreground uppercase tracking-wider` |
| Table cells | `text-sm text-foreground tabular-nums` |
| Annotation text | `text-sm text-muted-foreground italic` |
| Tags/badges | `text-xs px-2 py-0.5 rounded-full` |

### 13.3 Component Patterns

| Component | Styling |
|-----------|---------|
| Search bar | `bg-card border border-border rounded-lg px-4 py-3` with `focus:ring-2 focus:ring-ring` |
| Search results card | `bg-card border border-border rounded-lg p-4 hover:bg-muted/30 transition-colors duration-200 cursor-pointer` |
| Knowledge artifact card | `bg-card border border-border rounded-lg p-4 shadow-sm` with type-specific `border-l-4` accent |
| Deal detail tabs | Radix Tabs with `bg-card border border-border rounded-lg` content panels |
| AI chat bubbles (user) | `bg-primary/10 rounded-lg px-4 py-2 max-w-[80%]` |
| AI chat bubbles (AI) | `bg-card border border-border rounded-lg px-4 py-3 max-w-[90%]` |
| Filter sidebar | `bg-card border border-border rounded-lg p-4` |
| Preview panel | `bg-card border border-border rounded-lg p-6` with `shadow-lg` |
| Contribution cards | `bg-card border border-border rounded-lg p-4` with quality score badge |
| Decay alert cards | `bg-amber-500/5 border border-amber-500/30 rounded-lg p-3` |
| Leaderboard entries | `bg-card border border-border rounded-lg p-3` with rank indicator |
| Tooltips | `bg-popover border border-border rounded-lg shadow-lg p-3 text-xs` |

### 13.4 Animation Specifications

| Element | Animation | Duration | Easing |
|---------|-----------|----------|--------|
| Page transition | fade-in + slide-in-from-bottom-4 | 300ms | ease-in-out |
| Search suggestions dropdown | fade-in + slide-in-from-top-2 | 150ms | ease-out |
| Search results | Staggered fade-in | 150ms each, 50ms stagger | ease-out |
| Deal detail tab switch | Cross-fade | 200ms | ease-in-out |
| Knowledge feed items | Staggered fade-in from left | 200ms each, 80ms stagger | ease-out |
| AI response typing effect | Character-by-character reveal | 20ms per character | linear |
| AI citation pop-in | fade-in + scale-95-to-100 | 200ms | ease-out |
| Network graph nodes | Force-directed settle | Physics-based | spring |
| Timeline zoom | Smooth scale transition | 300ms | ease-in-out |
| Comparison view columns | Slide-in from right | 250ms, 100ms stagger | ease-out |
| Contribution badge pop | Scale from 0 to 1 with overshoot | 400ms | spring |
| Leaderboard position change | Smooth position transition | 500ms | ease-in-out |
| Decay alert appearance | slide-in-from-right + fade | 250ms | ease-in-out |
| Annotation highlight | Pulse glow (ring-2 ring-primary/30) | 1000ms, 2 iterations | ease-in-out |

---

## 14. Edge Cases and Error Handling

| Condition | Handling |
|-----------|----------|
| **Deal with no unstructured data** (no notes, no documents, no communications) | Archive structured data only; mark as "limited knowledge"; exclude from case study and narrative extraction; prompt seller for retrospective notes |
| **Duplicate deal records** across CRM systems | Entity resolution during ingestion — match on customer name + value + date; merge records; flag for human review if confidence < 90% |
| **Customer name variations** (e.g., "Acme Corp," "Acme Corporation," "ACME") | Entity resolution pipeline using fuzzy matching + ML-based entity disambiguation; maintain canonical entity with aliases |
| **AI-generated content inaccuracy** | All AI-generated content marked as "AI-generated draft — requires human review"; review workflow before publication; user feedback mechanism for corrections |
| **Search returning too many results** | Faceted filters prominently displayed; relevance ranking; "Refine your search" suggestions; option to sort by date, value, or relevance |
| **Search returning zero results** | Display "No exact matches found" with: suggested query refinements, related searches, link to ask the AI Advisor, option to submit a knowledge gap request |
| **Knowledge artifact with conflicting recommendations** | Display both recommendations with their evidence bases and source deal data; allow users to evaluate which is more applicable to their situation |
| **Customer requests data deletion** (GDPR/CCPA) | Remove PII from deal records; anonymize customer references in knowledge artifacts; preserve anonymized analytical value; maintain audit trail of deletion |
| **Seller competing for knowledge contribution credit** | Clear attribution model — primary credit to the contributor who created the content; secondary credit to contributors who refined or validated; transparent attribution display |
| **Knowledge base overwhelm** (too many artifacts for effective retrieval) | Smart curation: surface most-relevant, highest-rated, most-recently-validated artifacts first; suppress outdated or low-quality artifacts; personalized ranking based on user context |

---

## 15. Release Plan

### Phase 1: Foundation (Weeks 1-10)

**Deal Archive**:
- Deal ingestion pipeline from CRM
- Full-text search index (Elasticsearch)
- Deal Explorer with Table View and Card Grid View
- Deal Detail View (Overview, Timeline, Documents tabs)
- Basic faceted filtering

**Knowledge Infrastructure**:
- Vector embedding pipeline for semantic search
- Entity resolution for customer/contact deduplication
- Document parsing and indexing
- PostgreSQL schema and API layer

### Phase 2: Intelligence Layers (Weeks 11-20)

**Knowledge Extraction**:
- NLP pipeline for insight extraction
- Auto-generated deal summaries
- Customer Intelligence Profiles (auto-populated)
- Competitive Intelligence Archive (auto-populated from deal data)
- Segment Intelligence Reports (auto-generated)

**Enhanced Search**:
- Semantic search (vector similarity)
- Hybrid search (RRF fusion of full-text + semantic)
- Similarity search ("find deals like this one")
- Natural language query mode (basic)

### Phase 3: AI Advisor & Artifacts (Weeks 21-30)

**AI Advisor**:
- RAG pipeline implementation
- Natural language query interface with chat UI
- Citation extraction and verification
- Confidence scoring
- Conversation history and saving

**Knowledge Artifacts (Auto-generated)**:
- Case Study Library (auto-generated drafts)
- Precedent Library (auto-generated from high-value deals)
- Objection Handling Database (auto-extracted from deal communications)
- Pricing Intelligence Library (computed from deal data)

**Deal Archive Enhancement**:
- Deal Comparison View
- Deal Family View
- Timeline View
- Network View

### Phase 4: Advanced Intelligence (Weeks 31-40)

**Advanced AI Advisor**:
- Deal Strategy Advisor
- Competitive Briefing Generator
- Proposal Draft Generator
- Onboarding Tutor

**Knowledge Artifacts (Human-curated)**:
- Playbook Repository (with effectiveness tracking)
- Negotiation Intelligence Dashboard
- Lessons Learned Repository
- Proposal Template Library

**Pattern Library**:
- Win Pattern Gallery (integrated from Pipeline Analytics)
- Loss Pattern Gallery (integrated from Closed-Lost Autopsy)
- Behavioral Pattern Library
- Market Pattern Library
- Pattern Lifecycle Tracker

### Phase 5: Contribution & Governance (Weeks 41-48)

**Knowledge Contribution**:
- Contribution Dashboard with gamification
- Knowledge Review Queue
- Contribution Leaderboard
- Quality Metrics

**Analytics & Governance**:
- Knowledge Health Dashboard
- Usage Analytics
- Gap Analysis
- Knowledge Decay Detection
- Access Audit Log

**Integration**:
- Cross-module drill-through with all EDC modules
- Shared data entity synchronization
- WebSocket real-time updates
- Export capabilities (PDF, CSV)

### Phase 6: Optimization & Launch (Weeks 49-52)

- Search relevance tuning (embedding fine-tuning, ranking model optimization)
- AI Advisor accuracy validation and prompt refinement
- Performance optimization and load testing
- Accessibility audit (WCAG 2.1 AA)
- User acceptance testing
- Documentation and training
- Gradual rollout: 10% → 50% → 100%

---

## 16. Risks and Mitigations

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| **R1**: Insufficient unstructured deal data to extract meaningful knowledge | High | Critical | Implement minimum data quality thresholds; prompt sellers for retrospective annotations; design extraction to work with whatever data is available; progressively improve as data accumulates |
| **R2**: AI Advisor generates inaccurate or hallucinated responses | High | Critical | Mandatory citation requirement — every claim must be traceable to source data; confidence scoring with aggressive "low confidence" labeling; human-in-the-loop review for high-stakes queries; continuous accuracy monitoring with user feedback |
| **R3**: Low user adoption — sellers don't contribute knowledge or use the system | High | High | Make the system immediately valuable through auto-generated content before requiring contributions; integrate into existing workflows (deal reviews, onboarding); gamification; manager encouragement; demonstrate value through success stories |
| **R4**: Knowledge base becomes a graveyard — artifacts accumulate but are never updated | Medium | High | Automated decay detection; regular review cycles; tie knowledge quality to team metrics; make update workflows lightweight |
| **R5**: Privacy and confidentiality breaches — sensitive deal information exposed inappropriately | Medium | Critical | Strict RBAC; anonymization of pricing data; access audit logging; territory-based access controls; customer PII handling compliance |
| **R6**: Search relevance is poor, undermining user trust | Medium | High | Iterative relevance tuning with user feedback; hybrid search (combining multiple retrieval methods); personalized ranking; zero-result analysis and remediation |
| **R7**: Knowledge contribution creates cultural friction (surveillance feeling) | Medium | Medium | Frame contributions as team benefit, not individual monitoring; focus on positive gamification (recognition, not punishment); ensure individual performance data is access-controlled |
| **R8**: Technical complexity of RAG pipeline leads to latency or reliability issues | Medium | Medium | Implement fallback mechanisms (if AI Advisor is slow, provide search-only mode); aggressive caching of common queries; circuit breaker for LLM timeouts; progressive response loading |

---

## 17. Success Metrics

| Metric | Baseline | Target (6 months) | Measurement |
|--------|----------|-------------------|-------------|
| Search utilization | N/A (no unified search) | ≥500 searches per week across organization | Search log analytics |
| Search satisfaction | N/A | ≥4.0/5.0 average rating | Post-search rating prompt |
| Zero-result rate | N/A | ≤10% of searches | Search log analytics |
| AI Advisor usage | N/A | ≥200 queries per week | Session analytics |
| AI Advisor accuracy | N/A | ≥85% of responses rated "helpful" | User feedback on responses |
| Deal archive completeness | Scattered, inconsistent | ≥90% of closed deals with complete records | Archive quality metrics |
| Knowledge extraction volume | Manual, sporadic | ≥500 structured insights extracted per month | Extraction pipeline metrics |
| Knowledge contribution rate | N/A | ≥30% of team members contributing monthly | Contribution dashboard |
| New seller ramp time | 9-12 months | ≤7 months (30% reduction) | Time-to-first-deal and time-to-quota metrics |
| Proposal creation time | 15-25 hours per proposal | ≤8 hours (50% reduction with template library and AI assembly) | User research / time tracking |
| Knowledge-referenced deal win rate | Not tracked | ≥5% higher win rate for deals that reference Deal Memory content | A/B analysis of knowledge-referenced vs. non-referenced deals |
| Competitive preparation time | Not tracked | ≥50% reduction in time to prepare for competitive deals | User research |

---

## 18. Open Questions

| # | Question | Owner | Status |
|---|----------|-------|--------|
| OQ-1 | What is the minimum deal data quality required for the system to produce useful knowledge artifacts? | Data Science + Product | Open |
| OQ-2 | How should the system handle deals involving confidential customer information that the customer has requested not be shared internally? | Legal + Sales Ops | Open |
| OQ-3 | Should the AI Advisor be available to all users or restricted to certain roles during initial launch? | Sales Leadership + Product | Open |
| OQ-4 | What is the organization's preferred LLM provider / hosting approach for the AI Advisor (cloud API, self-hosted, hybrid)? | Engineering + Security | Open |
| OQ-5 | How should the system handle retrospective knowledge contribution for deals that closed before the system was implemented? | Product + RevOps | Open |
| OQ-6 | Should the contribution leaderboard and gamification elements be visible to management as a performance indicator, or kept as a peer-recognition tool only? | HR + Sales Leadership | Open |
| OQ-7 | What level of proposal auto-generation is acceptable to the legal team? (Full draft vs. template suggestions vs. content snippets only) | Legal + Sales Enablement | Open |
| OQ-8 | How should the system handle knowledge about deals with the same customer where different sellers have different perspectives or experiences? | Product + Sales Ops | Open |

---

*Document Version: 1.0*
*Module: Deal Memory — Institutional Knowledge Base*
*Application: Enterprise Deal Commander*
*PRD Classification: Feature Module — Major*