# Enterprise Deal Commander — Risk Engine v2.0

## Complete Redesign Specification

---

## 1. Why the Old Approach Fails

Before building the new engine, it's worth stating clearly what's wrong with pattern-based risk detection:

**Problem 1: Binary thinking on a continuous spectrum.**
A deal either triggers `PREMATURE_COMMERCIAL` or it doesn't. There's no concept of "this deal is 70% of the way toward a premature commercial problem." Real risk accumulates gradually.

**Problem 2: Patterns are isolated.**
A deal can have three simultaneous yellow alerts. The system treats this the same as one yellow alert. But three concurrent warning signals in different areas are far more dangerous than one.

**Problem 3: Alerts create fatigue.**
After two weeks, the Commander stops reading alert messages. They become noise. The system needs to rank and prioritize, not just list.

**Problem 4: No concept of "normal."**
A $200K deal with no services is normal. A $3M deal with no services is a red flag. Hardcoded thresholds can't distinguish these.

**Problem 5: Time is an afterthought.**
Time-based checks are additional bolt-on patterns. But time is fundamental to risk — a deal stuck for 40 days is fundamentally different from one stuck for 4 days, even if both trigger the same "stalled" pattern.

**Problem 6: Not actionable.**
"PREMATURE COMMERCIAL DISCONNECT" tells the Commander what's wrong but not what to do about it, how bad it is relative to other deals, or whether it's getting worse.

---

## 2. Design Principles of the New Engine

| Principle | Implementation |
|---|---|
| **Risk is a spectrum** | Every deal has a risk score from 0 to 100. No binary thresholds. |
| **Risk is multi-dimensional** | Seven independent dimensions. A deal can be healthy in four and critical in three. |
| **Risk is contextual** | The same condition means different things for different deal profiles. |
| **Risk trends matter** | The engine tracks direction — is risk increasing, stable, or decreasing? |
| **Signal, not noise** | The engine ranks deals by risk. The Commander always knows which deal needs attention first. |
| **Actionable by design** | Every dimension maps to a category of action. Every high-scoring driver has a recommended response. |
| **Graceful degradation** | Missing data (no stakeholders, no competitors) doesn't crash the engine. It scores what it can and notes what it can't. |
| **Explainable** | The Commander can trace any score back to specific, quantified factors in under 30 seconds. |

---

## 3. The Seven Risk Dimensions

Every deal is scored independently along seven dimensions. Each dimension produces a score from **0** (no risk) to **100** (maximum risk).

```
┌─────────────────────────────────────────────────────────────────────┐
│                                                                     │
│  DIMENSION 1: Technical Readiness        (weight: 20%)             │
│  "How validated is the solution?"                                   │
│                                                                     │
│  DIMENSION 2: Commercial Alignment       (weight: 15%)             │
│  "Is the commercial motion aligned with technical reality?"         │
│                                                                     │
│  DIMENSION 3: Stakeholder Coverage       (weight: 15%)             │
│  "Do we have the right people, with the right sentiment?"           │
│                                                                     │
│  DIMENSION 4: Temporal Pressure          (weight: 15%)             │
│  "Is the timeline realistic given current progress?"                │
│                                                                     │
│  DIMENSION 5: Financial Structure        (weight: 10%)             │
│  "Is the deal structured for long-term success?"                    │
│                                                                     │
│  DIMENSION 6: Competitive Exposure       (weight: 10%)             │
│  "Are we at a disadvantage relative to competitors?"                │
│                                                                     │
│  DIMENSION 7: Engagement Vitality        (weight: 15%)             │
│  "Is anyone actually working this deal?"                            │
│                                                                     │
└─────────────────────────────────────────────────────────────────────┘
```

---

### Dimension 1: Technical Readiness

**Question it answers:** "How far along is the technical validation, and is it progressing?"

**Signals:**

| Signal | Raw Input | Normalization | Risk Contribution |
|---|---|---|---|
| Gate completion % | `stepsCompleted / totalSteps` | Invert: `(1 - pct) × 100` | Higher when fewer gates are done |
| Gate velocity | Days between gate completions | Compare to historical average for this stage | Higher when gates are stalling |
| Time since last gate | Days since most recent `completed_at` | Scale: 0-7d = 0, 7-14d = 30, 14-30d = 60, 30d+ = 90 | Higher when no recent progress |
| Gate sequence integrity | Are gates being completed in order? | Penalize if later gates are complete but earlier ones aren't | Higher when sequence is violated |
| Critical gate status | Are the "make-or-break" gates (G3 Performance, G5 CTO) complete? | Binary per gate: 0 if complete, 50 if not | Fixed penalty for each missing critical gate |

**Scoring algorithm:**

```javascript
function scoreTechnicalReadiness(deal, gates, benchmarks) {
    const signals = [];
    let totalWeight = 0;

    // Signal 1.1: Gate Completion Percentage (weight: 0.30)
    const completionPct = deal.technicalTrack.progressPercentage;
    const completionRisk = (1 - completionPct / 100) * 100;
    signals.push({
        factor: `${completionPct}% gates complete (${deal.technicalTrack.stepsCompleted}/${deal.technicalTrack.totalSteps})`,
        rawScore: completionRisk,
        weight: 0.30
    });
    totalWeight += 0.30;

    // Signal 1.2: Time Since Last Gate Completion (weight: 0.30)
    const lastGateDate = gates
        .filter(g => g.is_completed && g.completed_at)
        .map(g => new Date(g.completed_at))
        .sort((a, b) => b - a)[0];

    let daysSinceLastGate = null;
    let staleRisk = 0;
    if (lastGateDate) {
        daysSinceLastGate = daysBetween(lastGateDate, new Date());
        if (daysSinceLastGate <= 7) staleRisk = 0;
        else if (daysSinceLastGate <= 14) staleRisk = 25;
        else if (daysSinceLastGate <= 21) staleRisk = 50;
        else if (daysSinceLastGate <= 30) staleRisk = 75;
        else staleRisk = 95;
    } else if (completionPct === 0) {
        // No gates completed and deal is past Discovery
        staleRisk = deal.salesStage !== 'Discovery' ? 60 : 10;
    }
    signals.push({
        factor: lastGateDate
            ? `Last gate completed ${daysSinceLastGate} days ago`
            : 'No gates completed yet',
        rawScore: staleRisk,
        weight: 0.30
    });
    totalWeight += 0.30;

    // Signal 1.3: Gate Sequence Integrity (weight: 0.15)
    const gateGroups = groupGatesByGroup(gates);
    let sequencePenalty = 0;
    for (let g = 5; g >= 1; g--) {
        const group = gateGroups[g];
        if (!group) continue;
        const groupComplete = group.every(gate => gate.is_completed);
        if (groupComplete) {
            // Check if all previous groups are also complete
            for (let prev = g - 1; prev >= 1; prev--) {
                const prevGroup = gateGroups[prev];
                if (prevGroup && !prevGroup.every(gate => gate.is_completed)) {
                    sequencePenalty = 40; // Later gate done, earlier not
                    break;
                }
            }
        }
    }
    signals.push({
        factor: sequencePenalty > 0
            ? 'Gate sequence violation detected — later gates completed before earlier ones'
            : 'Gate sequence is clean',
        rawScore: sequencePenalty,
        weight: 0.15
    });
    totalWeight += 0.15;

    // Signal 1.4: Critical Gate Status (weight: 0.25)
    const criticalGates = ['G3_PERFORMANCE_PASSED', 'G5_CTO_SIGNED_OFF'];
    let criticalPenalty = 0;
    const missingCritical = [];
    for (const code of criticalGates) {
        const gate = gates.find(g => g.gate_code === code);
        if (!gate || !gate.is_completed) {
            criticalPenalty += 35;
            missingCritical.push(gate?.label || code);
        }
    }
    criticalPenalty = Math.min(criticalPenalty, 80);
    signals.push({
        factor: missingCritical.length > 0
            ? `Critical gates incomplete: ${missingCritical.join(', ')}`
            : 'All critical gates complete',
        rawScore: criticalPenalty,
        weight: 0.25
    });
    totalWeight += 0.25;

    // Compute weighted dimension score
    const dimensionScore = signals.reduce((sum, s) => sum + (s.rawScore * s.weight), 0) / totalWeight;

    return {
        name: 'Technical Readiness',
        score: Math.round(dimensionScore),
        signals: signals.sort((a, b) => (b.rawScore * b.weight) - (a.rawScore * a.weight)),
        assessable: true  // This dimension always has data
    };
}
```

**Why this matters:**
A deal at 33% gate completion with no progress in 20 days scores very differently from a deal at 33% completion that completed a gate yesterday. The old engine would treat both as "33% complete." This engine captures momentum.

---

### Dimension 2: Commercial Alignment

**Question it answers:** "Is the business side moving faster than the technical side justifies?"

This is the dimension that catches the most expensive mistakes — deals where sales pushes to close before the technical team has validated the solution.

**Signals:**

| Signal | Raw Input | Scoring Logic | Risk Contribution |
|---|---|---|---|
| Stage-vs-gates gap | Current stage compared to gate progress | If stage is Commercial/Procurement but < 50% gates done → high risk | The biggest single signal in the engine |
| Services revenue | `servicesRevenue` as % of `productRevenue` | 0% services on deals > $500K → risk | Signals implementation risk |
| Pricing discount indicator | `servicesTier === 'None'` on large deals | Absence of services on large deals suggests aggressive discounting | Financial structure risk |
| Close probability vs. gate gap | `winProbability` vs. `progressPercentage` | If AM reports 80% probability but gates are at 30% → disconnect | Sales optimism bias detector |

```javascript
function scoreCommercialAlignment(deal, gates) {
    const signals = [];
    let totalWeight = 0;

    // Signal 2.1: Stage-vs-Gates Gap (weight: 0.45)
    const stageOrder = { 'Discovery': 1, 'Validation': 2, 'Commercial': 3, 'Procurement': 4, 'Closed-Won': 5 };
    const currentStageNum = stageOrder[deal.salesStage] || 1;
    const expectedGatePct = ((currentStageNum - 1) / 4) * 100; // Rough expected %
    const actualGatePct = deal.technicalTrack.progressPercentage;
    const gap = expectedGatePct - actualGatePct;

    let stageGapRisk = 0;
    if (gap <= 0) stageGapRisk = 0;           // Technical ahead of commercial
    else if (gap <= 20) stageGapRisk = 20;     // Slightly ahead
    else if (gap <= 40) stageGapRisk = 50;     // Noticeably ahead
    else if (gap <= 60) stageGapRisk = 75;     // Dangerously ahead
    else stageGapRisk = 95;                     // Commercial is running blind

    signals.push({
        factor: `Stage: ${deal.salesStage} (expected ~${Math.round(expectedGatePct)}% gates), actual: ${actualGatePct}%`,
        rawScore: stageGapRisk,
        weight: 0.45
    });
    totalWeight += 0.45;

    // Signal 2.2: Services Attachment on Large Deals (weight: 0.30)
    const tcv = deal.financials.calculatedTCV;
    const hasServices = deal.financials.servicesRevenue > 0;
    const servicesRatio = deal.financials.productRevenue > 0
        ? deal.financials.servicesRevenue / deal.financials.productRevenue
        : 0;

    let servicesRisk = 0;
    if (tcv < 300000) {
        servicesRisk = 0; // Small deals don't need services
    } else if (tcv >= 300000 && !hasServices) {
        servicesRisk = tcv >= 1000000 ? 85 : tcv >= 500000 ? 65 : 40;
    } else if (hasServices && servicesRatio < 0.15) {
        servicesRisk = 25; // Has services but thin
    } else {
        servicesRisk = 0; // Adequate services
    }

    signals.push({
        factor: hasServices
            ? `Services: $${deal.financials.servicesRevenue.toLocaleString()} (${Math.round(servicesRatio * 100)}% of product revenue)`
            : `No services attached on $${(tcv/1000000).toFixed(1)}M deal`,
        rawScore: servicesRisk,
        weight: 0.30
    });
    totalWeight += 0.30;

    // Signal 2.3: Probability-Reality Gap (weight: 0.25)
    let optimismRisk = 0;
    if (deal.financials.winProbability !== null) {
        const reportedProb = deal.financials.winProbability;
        const justifiedProb = deal.technicalTrack.progressPercentage; // Gates as proxy
        const optimismGap = reportedProb - justifiedProb;

        if (optimismGap <= 0) optimismRisk = 0;          // Realistic or pessimistic
        else if (optimismGap <= 15) optimismRisk = 10;    // Slightly optimistic
        else if (optimismGap <= 30) optimismRisk = 35;    // Notably optimistic
        else if (optimismGap <= 50) optimismRisk = 60;    // Very optimistic
        else optimismRisk = 85;                            // Delusional
    }
    signals.push({
        factor: deal.financials.winProbability !== null
            ? `Reported probability: ${deal.financials.winProbability}% vs. gate progress: ${actualGatePct}%`
            : 'No win probability set',
        rawScore: optimismRisk,
        weight: 0.25
    });
    totalWeight += 0.25;

    const dimensionScore = signals.reduce((sum, s) => sum + (s.rawScore * s.weight), 0) / totalWeight;

    return {
        name: 'Commercial Alignment',
        score: Math.round(dimensionScore),
        signals: signals.sort((a, b) => (b.rawScore * b.weight) - (a.rawScore * a.weight)),
        assessable: true
    };
}
```

---

### Dimension 3: Stakeholder Coverage

**Question it answers:** "Do we have the right people supporting us on the customer side?"

**Signals:**

| Signal | Scoring Logic |
|---|---|
| Champion ratio | `champions / total_stakeholders` — below 20% is risky |
| Decision-maker engagement | Is the economic buyer tracked? Is their sentiment known? |
| Hostile stakeholders | Any decision-maker with "Hostile" sentiment → immediate high risk |
| Stakeholder count vs. deal size | $1M+ deals with fewer than 3 tracked stakeholders → risk (incomplete picture) |

```javascript
function scoreStakeholderCoverage(deal, stakeholders) {
    const signals = [];
    let totalWeight = 0;

    // If no stakeholders tracked at all, we can't assess — but that itself is a risk
    // for deals past Discovery
    if (!stakeholders || stakeholders.length === 0) {
        if (deal.salesStage === 'Discovery') {
            return { name: 'Stakeholder Coverage', score: 10, signals: [
                { factor: 'No stakeholders tracked (acceptable in Discovery)', rawScore: 10, weight: 1.0 }
            ], assessable: false };
        }
        return { name: 'Stakeholder Coverage', score: 60, signals: [
            { factor: 'No stakeholders tracked past Discovery stage — cannot assess coverage', rawScore: 60, weight: 1.0 }
        ], assessable: false };
    }

    const total = stakeholders.length;
    const champions = stakeholders.filter(s => s.sentiment === 'Champion').length;
    const hostile = stakeholders.filter(s => s.sentiment === 'Hostile');
    const hostileDecisionMakers = hostile.filter(s => s.is_decision_maker);
    const decisionMakers = stakeholders.filter(s => s.is_decision_maker);
    const unknownSentiment = stakeholders.filter(s => s.sentiment === 'Neutral');

    // Signal 3.1: Champion Ratio (weight: 0.30)
    const championRatio = champions / total;
    let championRisk;
    if (championRatio >= 0.4) championRisk = 0;
    else if (championRatio >= 0.2) championRisk = 30;
    else if (championRatio >= 0.1) championRisk = 55;
    else championRisk = 80;

    signals.push({
        factor: `${champions} of ${total} stakeholders are champions (${Math.round(championRatio * 100)}%)`,
        rawScore: championRisk,
        weight: 0.30
    });
    totalWeight += 0.30;

    // Signal 3.2: Hostile Decision Makers (weight: 0.35)
    let hostileRisk = 0;
    if (hostileDecisionMakers.length > 0) {
        hostileRisk = 90; // This is a deal-threatening condition
    } else if (hostile.length > 0) {
        hostileRisk = 45; // Hostile non-decision-makers are still concerning
    }
    signals.push({
        factor: hostileDecisionMakers.length > 0
            ? `${hostileDecisionMakers.map(s => s.name).join(', ')} — hostile decision maker(s)`
            : hostile.length > 0
                ? `${hostile.length} hostile non-decision-maker(s)`
                : 'No hostile stakeholders',
        rawScore: hostileRisk,
        weight: 0.35
    });
    totalWeight += 0.35;

    // Signal 3.3: Decision-Maker Coverage (weight: 0.35)
    let dmRisk = 0;
    if (decisionMakers.length === 0) {
        dmRisk = 55; // No identified decision makers
    } else {
        const dmWithUnknownSentiment = decisionMakers.filter(
            s => s.sentiment === 'Neutral' || !s.sentiment
        );
        if (dmWithUnknownSentiment.length === decisionMakers.length) {
            dmRisk = 45; // Decision makers identified but all neutral/unknown
        } else if (dmWithUnknownSentiment.length > 0) {
            dmRisk = 20; // Some decision makers have known sentiment
        } else {
            dmRisk = 0; // All decision makers have known sentiment (positive or negative)
        }
    }
    signals.push({
        factor: decisionMakers.length === 0
            ? 'No decision makers identified'
            : `${decisionMakers.length} decision maker(s) identified, ${decisionMakers.filter(s => s.sentiment !== 'Neutral').length} with known sentiment`,
        rawScore: dmRisk,
        weight: 0.35
    });
    totalWeight += 0.35;

    const dimensionScore = signals.reduce((sum, s) => sum + (s.rawScore * s.weight), 0) / totalWeight;

    return {
        name: 'Stakeholder Coverage',
        score: Math.round(dimensionScore),
        signals: signals.sort((a, b) => (b.rawScore * b.weight) - (a.rawScore * a.weight)),
        assessable: true
    };
}
```

---

### Dimension 4: Temporal Pressure

**Question it answers:** "Is the clock working for us or against us?"

**Signals:**

| Signal | Scoring Logic |
|---|---|
| Days in current stage vs. benchmark | Compare to median days for this stage from historical data |
| Close date proximity vs. progress | How many days to close vs. how much work remains |
| Close date existence | No close date set past Discovery → risk (can't forecast what you can't date) |

```javascript
function scoreTemporalPressure(deal, benchmarks) {
    const signals = [];
    let totalWeight = 0;

    // Signal 4.1: Stage Duration vs. Benchmark (weight: 0.35)
    const benchmarkDays = benchmarks?.[deal.salesStage]?.median_days;
    let stageDurationRisk = 0;
    if (benchmarkDays && deal.daysInStage > 0) {
        const ratio = deal.daysInStage / benchmarkDays;
        if (ratio <= 0.75) stageDurationRisk = 0;       // Fast
        else if (ratio <= 1.0) stageDurationRisk = 10;   // On pace
        else if (ratio <= 1.25) stageDurationRisk = 30;  // Slightly slow
        else if (ratio <= 1.5) stageDurationRisk = 55;   // Slow
        else if (ratio <= 2.0) stageDurationRisk = 75;   // Stalling
        else stageDurationRisk = 95;                      // Frozen
    } else {
        // No benchmark: use absolute thresholds as fallback
        if (deal.daysInStage <= 14) stageDurationRisk = 5;
        else if (deal.daysInStage <= 30) stageDurationRisk = 25;
        else if (deal.daysInStage <= 60) stageDurationRisk = 55;
        else stageDurationRisk = 80;
    }
    signals.push({
        factor: benchmarkDays
            ? `${deal.daysInStage} days in ${deal.salesStage} (benchmark: ${Math.round(benchmarkDays)} days)`
            : `${deal.daysInStage} days in ${deal.salesStage} (no benchmark available)`,
        rawScore: stageDurationRisk,
        weight: 0.35
    });
    totalWeight += 0.35;

    // Signal 4.2: Close Date Proximity vs. Progress (weight: 0.45)
    let closeDateRisk = 0;
    if (deal.financials.daysToClose !== null && deal.financials.daysToClose >= 0) {
        const daysLeft = deal.financials.daysToClose;
        const progressRemaining = 100 - deal.technicalTrack.progressPercentage;

        // How many days per percentage point of progress are needed?
        const daysPerPoint = progressRemaining > 0 ? daysLeft / progressRemaining : 0;

        if (daysPerPoint >= 3) closeDateRisk = 5;       // Comfortable
        else if (daysPerPoint >= 2) closeDateRisk = 20;  // Tight but doable
        else if (daysPerPoint >= 1) closeDateRisk = 50;  // Very tight
        else if (daysPerPoint >= 0.5) closeDateRisk = 75;// Extremely tight
        else closeDateRisk = 95;                          // Mathematically impossible

        // If already past close date
        if (daysLeft <= 0 && deal.technicalTrack.progressPercentage < 100) {
            closeDateRisk = 100;
        }
    } else if (deal.salesStage !== 'Discovery' && deal.salesStage !== 'Closed-Won' && deal.salesStage !== 'Closed-Lost') {
        closeDateRisk = 35; // No close date set on an active deal
    }
    signals.push({
        factor: deal.financials.daysToClose !== null
            ? `${deal.financials.daysToClose} days to close, ${100 - deal.technicalTrack.progressPercentage}% progress remaining`
            : 'No close date set',
        rawScore: closeDateRisk,
        weight: 0.45
    });
    totalWeight += 0.45;

    // Signal 4.3: Close Date Existence (weight: 0.20)
    let dateExistenceRisk = 0;
    if (!deal.financials.expectedCloseDate && deal.salesStage !== 'Discovery'
        && deal.salesStage !== 'Closed-Won' && deal.salesStage !== 'Closed-Lost') {
        dateExistenceRisk = 50;
    }
    signals.push({
        factor: deal.financials.expectedCloseDate
            ? `Close date: ${deal.financials.expectedCloseDate}`
            : 'No expected close date',
        rawScore: dateExistenceRisk,
        weight: 0.20
    });
    totalWeight += 0.20;

    const dimensionScore = signals.reduce((sum, s) => sum + (s.rawScore * s.weight), 0) / totalWeight;

    return {
        name: 'Temporal Pressure',
        score: Math.round(dimensionScore),
        signals: signals.sort((a, b) => (b.rawScore * b.weight) - (a.rawScore * a.weight)),
        assessable: true
    };
}
```

---

### Dimension 5: Financial Structure

**Question it answers:** "Is this deal structured so that both sides succeed after signing?"

**Signals:**

| Signal | Scoring Logic |
|---|---|
| Services-to-product ratio | Thin services on large deals → implementation risk |
| Contract term vs. commitment | Short-term contracts for platform deals → renewal risk |
| Cross-sell overextension | Many cross-sells pitched before core is validated → scope creep |
| Ramp pricing backloading | Revenue heavily weighted toward later years → recognition risk |

```javascript
function scoreFinancialStructure(deal, crossSells) {
    const signals = [];
    let totalWeight = 0;

    // Signal 5.1: Services Protection (weight: 0.35)
    const tcv = deal.financials.calculatedTCV;
    const servicesRatio = deal.financials.productRevenue > 0
        ? deal.financials.servicesRevenue / deal.financials.productRevenue : 0;
    let servicesStructuralRisk = 0;

    if (tcv < 200000) {
        servicesStructuralRisk = 0; // Small deals don't need services
    } else if (deal.financials.servicesTier === 'None' && tcv >= 1000000) {
        servicesStructuralRisk = 75;
    } else if (deal.financials.servicesTier === 'None' && tcv >= 500000) {
        servicesStructuralRisk = 50;
    } else if (servicesRatio < 0.10 && tcv >= 300000) {
        servicesStructuralRisk = 30;
    } else {
        servicesStructuralRisk = 0;
    }

    signals.push({
        factor: deal.financials.servicesTier === 'None'
            ? `No services tier on $${(tcv/1000000).toFixed(1)}M deal`
            : `Services: ${deal.financials.servicesTier} ($${deal.financials.servicesRevenue.toLocaleString()})`,
        rawScore: servicesStructuralRisk,
        weight: 0.35
    });
    totalWeight += 0.35;

    // Signal 5.2: Cross-Sell Overextension (weight: 0.30)
    const crossSellCount = crossSells ? crossSells.length : 0;
    const gatesComplete = deal.technicalTrack.progressPercentage;
    let crossSellRisk = 0;

    // Pitching many products before validating the core platform
    if (crossSellCount >= 3 && gatesComplete < 50) {
        crossSellRisk = 60;
    } else if (crossSellCount >= 2 && gatesComplete < 30) {
        crossSellRisk = 45;
    } else if (crossSellCount >= 1 && gatesComplete < 20) {
        crossSellRisk = 25;
    }

    signals.push({
        factor: crossSellCount > 0
            ? `${crossSellCount} cross-sell(s) pitched at ${gatesComplete}% gate completion`
            : 'No cross-sells pitched',
        rawScore: crossSellRisk,
        weight: 0.30
    });
    totalWeight += 0.30;

    // Signal 5.3: Contract Term Appropriateness (weight: 0.35)
    let termRisk = 0;
    const term = deal.financials.termYears;
    const model = deal.financials.pricingModel;

    if (model === 'Perpetual License') {
        termRisk = 20; // Perpetual has its own risks but is structurally different
    } else if (model === 'Annual Subscription' && tcv >= 1000000) {
        termRisk = 30; // Big deal on annual — high renewal risk
    } else if (model === 'Multi-Year Committed' && term < 2 && tcv >= 500000) {
        termRisk = 25; // Large deal with short commitment
    }

    signals.push({
        factor: `${model}, ${term}-year term, $${(tcv/1000000).toFixed(1)}M TCV`,
        rawScore: termRisk,
        weight: 0.35
    });
    totalWeight += 0.35;

    const dimensionScore = signals.reduce((sum, s) => sum + (s.rawScore * s.weight), 0) / totalWeight;

    return {
        name: 'Financial Structure',
        score: Math.round(dimensionScore),
        signals: signals.sort((a, b) => (b.rawScore * b.weight) - (a.rawScore * a.weight)),
        assessable: true
    };
}
```

---

### Dimension 6: Competitive Exposure

**Question it answers:** "Are we at a disadvantage because of who else is in the deal?"

**Signals:**

| Signal | Scoring Logic |
|---|---|
| Number of active competitors | More competitors = more risk |
| Historical win rate vs. active competitors | Low historical win rate against specific competitors |
| Competitor count vs. deal progress | Many competitors early = expected. Many competitors late = problem. |

```javascript
function scoreCompetitiveExposure(deal, competitors, competitiveHistory) {
    const signals = [];
    let totalWeight = 0;

    // If no competitors tracked, this dimension has low default risk
    if (!competitors || competitors.length === 0) {
        return {
            name: 'Competitive Exposure',
            score: 5,
            signals: [{ factor: 'No competitors tracked', rawScore: 5, weight: 1.0 }],
            assessable: false
        };
    }

    const activeCompetitors = competitors.filter(c => c.status === 'Active');

    // Signal 6.1: Active Competitor Count (weight: 0.35)
    let countRisk = 0;
    if (activeCompetitors.length === 0) countRisk = 0;
    else if (activeCompetitors.length === 1) countRisk = 20;
    else if (activeCompetitors.length === 2) countRisk = 45;
    else countRisk = 70;

    signals.push({
        factor: activeCompetitors.length > 0
            ? `${activeCompetitors.length} active competitor(s): ${activeCompetitors.map(c => c.competitor_name).join(', ')}`
            : 'No active competitors',
        rawScore: countRisk,
        weight: 0.35
    });
    totalWeight += 0.35;

    // Signal 6.2: Historical Win Rate Against Active Competitors (weight: 0.45)
    let winRateRisk = 0;
    if (competitiveHistory && activeCompetitors.length > 0) {
        const worstWinRate = activeCompetitors
            .map(comp => {
                const history = competitiveHistory.find(h => h.competitor_id === comp.competitor_id);
                return history ? history.win_rate_pct : null;
            })
            .filter(r => r !== null);

        if (worstWinRate.length > 0) {
            const minWinRate = Math.min(...worstWinRate);
            if (minWinRate >= 60) winRateRisk = 10;
            else if (minWinRate >= 40) winRateRisk = 35;
            else if (minWinRate >= 20) winRateRisk = 60;
            else winRateRisk = 85;
        }
    }
    signals.push({
        factor: winRateRisk > 0
            ? `Lowest historical win rate against active competitors: ${Math.min(...(competitiveHistory?.map(h => h.win_rate_pct) || [100]))}%`
            : 'No historical competitive data for active competitors',
        rawScore: winRateRisk,
        weight: 0.45
    });
    totalWeight += 0.45;

    // Signal 6.3: Competition Late in Cycle (weight: 0.20)
    let lateCompetitionRisk = 0;
    if (activeCompetitors.length >= 2 && deal.technicalTrack.progressPercentage >= 50) {
        lateCompetitionRisk = 50; // Multiple competitors still active at 50%+ gates
    } else if (activeCompetitors.length >= 1 && deal.technicalTrack.progressPercentage >= 75) {
        lateCompetitionRisk = 40; // Still competing at 75%+ gates
    }
    signals.push({
        factor: lateCompetitionRisk > 0
            ? `${activeCompetitors.length} competitors still active at ${deal.technicalTrack.progressPercentage}% gate completion`
            : 'Competition is appropriate for deal stage',
        rawScore: lateCompetitionRisk,
        weight: 0.20
    });
    totalWeight += 0.20;

    const dimensionScore = signals.reduce((sum, s) => sum + (s.rawScore * s.weight), 0) / totalWeight;

    return {
        name: 'Competitive Exposure',
        score: Math.round(dimensionScore),
        signals: signals.sort((a, b) => (b.rawScore * b.weight) - (a.rawScore * a.weight)),
        assessable: true
    };
}
```

---

### Dimension 7: Engagement Vitality

**Question it answers:** "Is anyone actually paying attention to this deal?"

This is the dimension that catches deals that are silently dying. No one is updating them, no one is logging blockers, no decisions are being made. They're just... there.

**Signals:**

| Signal | Scoring Logic |
|---|---|
| Time since last update | No updates in 14+ days on an active deal → risk |
| Strategic notes presence | No notes after Discovery → risk (no one is thinking about this deal) |
| Blocker activity | Blockers exist but aren't being resolved → stagnation |
| Decision log activity | No decisions logged on an active deal → lack of intentional management |

```javascript
function scoreEngagementVitality(deal, blockers, decisions) {
    const signals = [];
    let totalWeight = 0;

    // Signal 7.1: Time Since Last Update (weight: 0.35)
    let stalenessRisk = 0;
    const daysSinceUpdate = deal.daysSinceLastUpdate;
    if (daysSinceUpdate <= 2) stalenessRisk = 0;
    else if (daysSinceUpdate <= 5) stalenessRisk = 10;
    else if (daysSinceUpdate <= 10) stalenessRisk = 30;
    else if (daysSinceUpdate <= 14) stalenessRisk = 50;
    else if (daysSinceUpdate <= 21) stalenessRisk = 70;
    else stalenessRisk = 90;

    signals.push({
        factor: `Last updated ${daysSinceUpdate} day${daysSinceUpdate !== 1 ? 's' : ''} ago`,
        rawScore: stalenessRisk,
        weight: 0.35
    });
    totalWeight += 0.35;

    // Signal 7.2: Strategic Notes (weight: 0.20)
    let notesRisk = 0;
    const hasNotes = deal.blueprintNotes && deal.blueprintNotes.trim().length >= 20;
    if (!hasNotes && deal.salesStage !== 'Discovery') {
        notesRisk = 40;
    }
    signals.push({
        factor: hasNotes
            ? 'Strategic notes present'
            : 'No strategic notes (expected after Discovery)',
        rawScore: notesRisk,
        weight: 0.20
    });
    totalWeight += 0.20;

    // Signal 7.3: Blocker Resolution Rate (weight: 0.25)
    let blockerRisk = 0;
    if (blockers && blockers.length > 0) {
        const unresolved = blockers.filter(b => !b.is_resolved);
        const staleBlockers = unresolved.filter(b => {
            const days = daysBetween(new Date(b.logged_at), new Date());
            return days > 14;
        });

        if (staleBlockers.length >= 2) blockerRisk = 70;
        else if (staleBlockers.length >= 1) blockerRisk = 45;
        else if (unresolved.length >= 3) blockerRisk = 35;
        else blockerRisk = 15;
    }
    signals.push({
        factor: blockers && blockers.length > 0
            ? `${blockers.filter(b => !b.is_resolved).length} unresolved blocker(s), ${blockers.filter(b => !b.is_resolved && daysBetween(new Date(b.logged_at), new Date()) > 14).length} older than 14 days`
            : 'No blockers logged',
        rawScore: blockerRisk,
        weight: 0.25
    });
    totalWeight += 0.25;

    // Signal 7.4: Decision Activity (weight: 0.20)
    let decisionRisk = 0;
    if (deal.salesStage !== 'Discovery') {
        if (!decisions || decisions.length === 0) {
            decisionRisk = 35; // Past Discovery but no decisions logged
        } else {
            const overdue = decisions.filter(d =>
                d.status === 'Pending' && d.due_date && new Date(d.due_date) < new Date()
            );
            if (overdue.length >= 2) decisionRisk = 50;
            else if (overdue.length >= 1) decisionRisk = 30;
        }
    }
    signals.push({
        factor: decisions && decisions.length > 0
            ? `${decisions.length} decision(s) logged, ${decisions.filter(d => d.status === 'Pending' && d.due_date && new Date(d.due_date) < new Date()).length} overdue`
            : deal.salesStage !== 'Discovery'
                ? 'No decisions logged (expected after Discovery)'
                : 'No decisions needed yet (Discovery)',
        rawScore: decisionRisk,
        weight: 0.20
    });
    totalWeight += 0.20;

    const dimensionScore = signals.reduce((sum, s) => sum + (s.rawScore * s.weight), 0) / totalWeight;

    return {
        name: 'Engagement Vitality',
        score: Math.round(dimensionScore),
        signals: signals.sort((a, b) => (b.rawScore * b.weight) - (a.rawScore * a.weight)),
        assessable: true
    };
}
```

---

## 4. Composite Risk Score

### 4.1 Weighted Combination

```javascript
const DIMENSION_WEIGHTS = {
    'Technical Readiness':    0.20,
    'Commercial Alignment':   0.15,
    'Stakeholder Coverage':   0.15,
    'Temporal Pressure':      0.15,
    'Financial Structure':    0.10,
    'Competitive Exposure':   0.10,
    'Engagement Vitality':    0.15
};

function computeCompositeRisk(dimensionScores) {
    let weightedSum = 0;
    let totalWeight = 0;

    for (const dim of dimensionScores) {
        const weight = DIMENSION_WEIGHTS[dim.name] || 0;
        weightedSum += dim.score * weight;
        if (dim.assessable) {
            totalWeight += weight;
        }
    }

    // Normalize: if some dimensions aren't assessable, scale up the remaining ones
    const normalizedScore = totalWeight > 0
        ? Math.round(weightedSum / totalWeight)
        : 0;

    return Math.min(100, Math.max(0, normalizedScore));
}
```

### 4.2 Risk Level Classification

```javascript
function classifyRiskLevel(score) {
    if (score <= 25) return { level: 'LOW', label: 'LOW RISK', color: '#22C55E' };
    if (score <= 50) return { level: 'MODERATE', label: 'MODERATE RISK', color: '#F59E0B' };
    if (score <= 75) return { level: 'ELEVATED', label: 'ELEVATED RISK', color: '#F97316' };
    return { level: 'HIGH', label: 'HIGH RISK', color: '#EF4444' };
}
```

Notice: four levels, not three. The old RED/YELLOW/GREEN was too coarse. `ELEVATED` (orange) catches the critical middle ground — deals that aren't RED yet but are heading there.

### 4.3 Complete Engine Orchestration

```javascript
// services/riskEngine.js

async function computeDealRisk(dealId, pool) {
    // Fetch all required data in parallel
    const [
        dealResult,
        gatesResult,
        blockersResult,
        competitorsResult,
        competitiveHistoryResult,
        stakeholdersResult,
        decisionsResult,
        crossSellsResult,
        benchmarksResult,
        previousScoreResult
    ] = await Promise.all([
        fetchDealWithIntelligence(dealId, pool),
        fetchGates(dealId, pool),
        fetchAllBlockers(dealId, pool),
        fetchCompetitors(dealId, pool),
        fetchCompetitiveHistory(pool),
        fetchStakeholders(dealId, pool),
        fetchDecisions(dealId, pool),
        fetchCrossSells(dealId, pool),
        fetchVelocityBenchmarks(pool),
        fetchPreviousScore(dealId, pool)
    ]);

    const deal = dealResult;
    const gates = gatesResult;
    const blockers = blockersResult;
    const competitors = competitorsResult;
    const stakeholders = stakeholdersResult;
    const decisions = decisionsResult;
    const crossSells = crossSellsResult;
    const benchmarks = benchmarksResult;

    // Compute all seven dimensions
    const dimensions = [
        scoreTechnicalReadiness(deal, gates, benchmarks),
        scoreCommercialAlignment(deal, gates),
        scoreStakeholderCoverage(deal, stakeholders),
        scoreTemporalPressure(deal, benchmarks),
        scoreFinancialStructure(deal, crossSells),
        scoreCompetitiveExposure(deal, competitors, competitiveHistoryResult),
        scoreEngagementVitality(deal, blockers, decisions)
    ];

    // Composite score
    const compositeScore = computeCompositeRisk(dimensions);
    const riskLevel = classifyRiskLevel(compositeScore);

    // Trend computation
    const previousScore = previousScoreResult?.score;
    let trend = 'STABLE';
    let trendDelta = 0;
    if (previousScore !== null && previousScore !== undefined) {
        trendDelta = compositeScore - previousScore;
        if (trendDelta >= 8) trend = 'INCREASING';
        else if (trendDelta <= -8) trend = 'DECREASING';
    }

    // Top risk drivers (top 3 signals across all dimensions, ranked by impact)
    const allDrivers = dimensions.flatMap(dim =>
        dim.signals.map(s => ({
            dimension: dim.name,
            factor: s.factor,
            impact: Math.round(s.rawScore * s.weight * (DIMENSION_WEIGHTS[dim.name] || 0) * 100) / 100
        }))
    );
    const topDrivers = allDrivers
        .sort((a, b) => b.impact - a.impact)
        .slice(0, 5);

    // Recommended actions
    const actions = generateRecommendedActions(dimensions, deal);

    return {
        dealId: deal.id,
        compositeScore,
        riskLevel: riskLevel.level,
        riskLabel: riskLevel.label,
        riskColor: riskLevel.color,
        trend,
        trendDelta,
        dimensions,
        topDrivers,
        recommendedActions: actions,
        computedAt: new Date().toISOString()
    };
}
```

---

## 5. Trend Analysis

The engine stores each risk computation as a snapshot. This enables trend analysis.

### 5.1 Risk History Table

```sql
CREATE TABLE edc_v2.risk_snapshots (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    deal_id UUID NOT NULL REFERENCES edc.enterprise_deals(id) ON DELETE CASCADE,
    composite_score INT NOT NULL CHECK (composite_score BETWEEN 0 AND 100),
    risk_level VARCHAR(20) NOT NULL,
    dimension_scores JSONB NOT NULL,  -- [{"name": "Technical Readiness", "score": 25, ...}, ...]
    top_drivers JSONB,
    computed_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_risk_snapshots_deal ON edc_v2.risk_snapshots(deal_id, computed_at DESC);
```

### 5.2 Trend Computation

```javascript
function computeTrend(currentScore, historicalScores) {
    // historicalScores: array of { score, computed_at } from last 14 days
    if (!historicalScores || historicalScores.length < 2) {
        return { trend: 'INSUFFICIENT_DATA', delta: 0, sparkline: [] };
    }

    const scores = [...historicalScores, { score: currentScore, computed_at: new Date() }];
    const sparkline = scores.map(s => s.score);

    // 7-day trend
    const sevenDaysAgo = new Date(Date.now() - 7 * 86400000);
    const recentScores = scores.filter(s => new Date(s.computed_at) >= sevenDaysAgo);
    const oldestRecent = recentScores[0]?.score ?? currentScore;
    const delta = currentScore - oldestRecent;

    let trend;
    if (delta >= 8) trend = 'INCREASING';
    else if (delta <= -8) trend = 'DECREASING';
    else trend = 'STABLE';

    return { trend, delta, sparkline };
}
```

---

## 6. Recommended Actions Engine

The engine generates specific, actionable recommendations based on which dimensions are scoring highest.

```javascript
function generateRecommendedActions(dimensions, deal) {
    const actions = [];
    const sorted = [...dimensions].sort((a, b) => b.score - a.score);

    for (const dim of sorted) {
        if (dim.score < 30) continue; // Only generate actions for meaningful risk

        switch (dim.name) {
            case 'Technical Readiness':
                if (dim.score >= 50) {
                    const topSignal = dim.signals[0];
                    if (topSignal.factor.includes('stalled') || topSignal.factor.includes('days ago')) {
                        actions.push({
                            dimension: dim.name,
                            priority: dim.score >= 70 ? 'CRITICAL' : 'HIGH',
                            action: 'Schedule a technical deep-dive to unblock gate progression. Identify the specific blocker preventing progress.',
                            rationale: topSignal.factor
                        });
                    }
                    if (dim.signals.some(s => s.factor.includes('Critical gates incomplete'))) {
                        actions.push({
                            dimension: dim.name,
                            priority: 'CRITICAL',
                            action: 'Prioritize the missing critical gate. Performance validation or CTO sign-off is a prerequisite for a credible close.',
                            rationale: 'Critical technical gates are incomplete'
                        });
                    }
                }
                break;

            case 'Commercial Alignment':
                if (dim.score >= 50) {
                    actions.push({
                        dimension: dim.name,
                        priority: dim.score >= 75 ? 'CRITICAL' : 'HIGH',
                        action: 'Request a pause on commercial negotiations until technical validation catches up. Present the gate completion status to the Account Manager as evidence.',
                        rationale: `Commercial stage is ${Math.round(dim.signals[0]?.rawScore || 0)}% ahead of technical readiness`
                    });
                }
                break;

            case 'Stakeholder Coverage':
                if (dim.score >= 40) {
                    const hasHostile = dim.signals.some(s => s.factor.includes('hostile'));
                    if (hasHostile) {
                        actions.push({
                            dimension: dim.name,
                            priority: 'CRITICAL',
                            action: 'Initiate executive-to-executive engagement to address hostile stakeholder. Understand their objections and develop a mitigation strategy.',
                            rationale: 'A decision maker has hostile sentiment — this is a veto risk'
                        });
                    } else {
                        actions.push({
                            dimension: dim.name,
                            priority: 'HIGH',
                            action: 'Map the full stakeholder landscape. Identify the economic buyer and champion. Schedule a multi-threaded engagement.',
                            rationale: 'Insufficient stakeholder coverage for this deal stage'
                        });
                    }
                }
                break;

            case 'Temporal Pressure':
                if (dim.score >= 50) {
                    actions.push({
                        dimension: dim.name,
                        priority: dim.score >= 75 ? 'CRITICAL' : 'HIGH',
                        action: deal.financials.expectedCloseDate
                            ? `Negotiate a close date extension. Current pace requires ${Math.round(deal.financials.daysToClose / Math.max(100 - deal.technicalTrack.progressPercentage, 1))} days per gate point — unsustainable.`
                            : 'Set an expected close date. Without a target date, there is no accountability for pace.',
                        rationale: dim.signals[0]?.factor
                    });
                }
                break;

            case 'Financial Structure':
                if (dim.score >= 40) {
                    actions.push({
                        dimension: dim.name,
                        priority: 'MEDIUM',
                        action: 'Attach a Professional Services SOW or Premium Support tier. Without implementation support, the customer will underdeploy and churn.',
                        rationale: `Services gap on $${(deal.financials.calculatedTCV / 1000000).toFixed(1)}M deal`
                    });
                }
                break;

            case 'Competitive Exposure':
                if (dim.score >= 40) {
                    actions.push({
                        dimension: dim.name,
                        priority: 'HIGH',
                        action: 'Review competitive playbook for active competitors. Identify differentiation levers and accelerate proof points that competitors cannot match.',
                        rationale: dim.signals[0]?.factor
                    });
                }
                break;

            case 'Engagement Vitality':
                if (dim.score >= 40) {
                    actions.push({
                        dimension: dim.name,
                        priority: dim.score >= 60 ? 'CRITICAL' : 'HIGH',
                        action: 'This deal may be running on autopilot. Schedule a 1:1 deep-dive with the Account Manager and Technical Lead to reassess commitment and next steps.',
                        rationale: dim.signals[0]?.factor
                    });
                }
                break;
        }
    }

    // Sort: CRITICAL first, then HIGH, then MEDIUM
    const priorityOrder = { 'CRITICAL': 0, 'HIGH': 1, 'MEDIUM': 2, 'LOW': 3 };
    return actions.sort((a, b) => priorityOrder[a.priority] - priorityOrder[b.priority]);
}
```

---

## 7. Risk Engine Output — Complete Structure

```json
{
    "dealId": "uuid",
    "accountName": "ACME CORP",
    "dealName": "Platform Modernization",
    "compositeScore": 62,
    "riskLevel": "ELEVATED",
    "riskLabel": "ELEVATED RISK",
    "riskColor": "#F97316",
    "trend": "INCREASING",
    "trendDelta": 12,
    "sparkline": [38, 40, 42, 45, 48, 52, 55, 62],

    "dimensions": [
        {
            "name": "Commercial Alignment",
            "score": 82,
            "weight": 0.15,
            "trend": "INCREASING",
            "assessable": true,
            "signals": [
                {
                    "factor": "Stage: Commercial (expected ~50% gates), actual: 33%",
                    "rawScore": 75,
                    "weight": 0.45
                },
                {
                    "factor": "No services attached on $1.5M deal",
                    "rawScore": 85,
                    "weight": 0.30
                },
                {
                    "factor": "Reported probability: 65% vs. gate progress: 33%",
                    "rawScore": 50,
                    "weight": 0.25
                }
            ]
        },
        {
            "name": "Temporal Pressure",
            "score": 68,
            "weight": 0.15,
            "trend": "INCREASING",
            "assessable": true,
            "signals": [
                {
                    "factor": "32 days in Commercial (benchmark: 21 days)",
                    "rawScore": 55,
                    "weight": 0.35
                },
                {
                    "factor": "86 days to close, 67% progress remaining",
                    "rawScore": 45,
                    "weight": 0.45
                }
            ]
        },
        {
            "name": "Technical Readiness",
            "score": 45,
            "weight": 0.20,
            "trend": "STABLE",
            "assessable": true,
            "signals": [
                {
                    "factor": "33% gates complete (3/9)",
                    "rawScore": 67,
                    "weight": 0.30
                },
                {
                    "factor": "Last gate completed 8 days ago",
                    "rawScore": 25,
                    "weight": 0.30
                }
            ]
        },
        {
            "name": "Stakeholder Coverage",
            "score": 40,
            "weight": 0.15,
            "trend": "STABLE",
            "assessable": true,
            "signals": [
                {
                    "factor": "1 of 5 stakeholders are champions (20%)",
                    "rawScore": 30,
                    "weight": 0.30
                },
                {
                    "factor": "1 decision maker identified, with known sentiment",
                    "rawScore": 0,
                    "weight": 0.35
                }
            ]
        },
        {
            "name": "Engagement Vitality",
            "score": 35,
            "weight": 0.15,
            "trend": "STABLE",
            "assessable": true,
            "signals": [
                {
                    "factor": "Last updated 3 days ago",
                    "rawScore": 10,
                    "weight": 0.35
                },
                {
                    "factor": "Strategic notes present",
                    "rawScore": 0,
                    "weight": 0.20
                },
                {
                    "factor": "1 decision logged, 0 overdue",
                    "rawScore": 0,
                    "weight": 0.20
                }
            ]
        },
        {
            "name": "Financial Structure",
            "score": 30,
            "weight": 0.10,
            "trend": "STABLE",
            "assessable": true,
            "signals": [
                {
                    "factor": "No services tier on $1.5M deal",
                    "rawScore": 75,
                    "weight": 0.35
                }
            ]
        },
        {
            "name": "Competitive Exposure",
            "score": 25,
            "weight": 0.10,
            "trend": "STABLE",
            "assessable": true,
            "signals": [
                {
                    "factor": "1 active competitor: AWS",
                    "rawScore": 20,
                    "weight": 0.35
                },
                {
                    "factor": "Historical win rate against AWS: 64%",
                    "rawScore": 10,
                    "weight": 0.45
                }
            ]
        }
    ],

    "topDrivers": [
        { "dimension": "Commercial Alignment", "factor": "No services attached on $1.5M deal", "impact": 3.83 },
        { "dimension": "Commercial Alignment", "factor": "Stage is Commercial but only 33% gates complete", "impact": 5.06 },
        { "dimension": "Temporal Pressure", "factor": "32 days in Commercial (benchmark: 21)", "impact": 2.89 },
        { "dimension": "Technical Readiness", "factor": "33% gates complete (3/9)", "impact": 4.02 },
        { "dimension": "Financial Structure", "factor": "No services tier on $1.5M deal", "impact": 2.63 }
    ],

    "recommendedActions": [
        {
            "dimension": "Commercial Alignment",
            "priority": "CRITICAL",
            "action": "Request a pause on commercial negotiations until technical validation catches up.",
            "rationale": "Commercial stage is significantly ahead of technical readiness"
        },
        {
            "dimension": "Financial Structure",
            "priority": "HIGH",
            "action": "Attach a Professional Services SOW or Premium Support tier.",
            "rationale": "Services gap on $1.5M deal"
        },
        {
            "dimension": "Temporal Pressure",
            "priority": "HIGH",
            "action": "Negotiate a close date extension. Current pace is unsustainable.",
            "rationale": "32 days in Commercial, benchmark is 21"
        }
    ],

    "computedAt": "2025-06-21T10:30:00Z"
}
```

---

## 8. UI/UX — Risk Visualization

### 8.1 Deal Risk Card (in Roster and Cockpit)

```
┌──────────────────────────────────────────────────────────────────┐
│                                                                   │
│  RISK SCORE                                                       │
│                                                                   │
│        62                                                         │
│   ELEVATED RISK         ▲ +12 (7 days)                           │
│                                                                   │
│   ╭──────────────────────────────────────────────────────────╮   │
│   │  38 ▁▂▃▃▄▅▅▆ 62                                          │   │
│   │  ◄── 14 days ──►                                         │   │
│   ╰──────────────────────────────────────────────────────────╯   │
│                                                                   │
│   Commercial Alignment    ████████████████████████████░░░░  82   │
│   Temporal Pressure       ██████████████████████░░░░░░░░░░  68   │
│   Technical Readiness     ██████████████░░░░░░░░░░░░░░░░░░  45   │
│   Stakeholder Coverage    ████████████░░░░░░░░░░░░░░░░░░░░  40   │
│   Engagement Vitality     ██████████░░░░░░░░░░░░░░░░░░░░░░  35   │
│   Financial Structure     ████████░░░░░░░░░░░░░░░░░░░░░░░░  30   │
│   Competitive Exposure    ███████░░░░░░░░░░░░░░░░░░░░░░░░░  25   │
│                                                                   │
│   ────────────────────────────────────────────────────────────   │
│                                                                   │
│   TOP RISK DRIVERS:                                               │
│   1. Commercial stage ahead of technical validation (impact: 5.1) │
│   2. No services on $1.5M deal (impact: 3.8)                     │
│   3. 32 days in Commercial — 11 days over benchmark (impact: 2.9) │
│                                                                   │
│   ────────────────────────────────────────────────────────────   │
│                                                                   │
│   RECOMMENDED ACTIONS:                                            │
│   🔴 Pause commercial negotiations until Gate 3 is complete      │
│   🟠 Attach Professional Services SOW                            │
│   🟠 Negotiate close date extension                              │
│                                                                   │
└──────────────────────────────────────────────────────────────────┘
```

### 8.2 Compact Risk Indicator (in Deal Roster table)

```
┌────────────────┐
│      62        │
│  ▁▂▃▃▄▅▅▆     │
│  ELEVATED  ▲12 │
└────────────────┘
```

- Number: large, colored by risk level
- Sparkline: 14-day mini trend chart (inline SVG, 60px × 16px)
- Label: risk level text
- Trend: arrow + delta number (green if decreasing, red if increasing)

### 8.3 Risk Radar Chart (in Cockpit detail view)

```
                    Technical Readiness
                           45
                          ╱│╲
                        ╱  │  ╲
               25      ╱   │   ╲      82
        Competitive ─╱────┼────╲─ Commercial
              Exposure     │      Alignment
                    ╲      │     ╱
                      ╲    │   ╱
                        ╲  │ ╱
                          ╲│╱
                           40
                   Stakeholder Coverage

        Financial    ╱ 35 ╲    Temporal
        Structure  ╱   │   ╲  Pressure
                 ╱     │     ╲
                       │
                  Engagement
                   Vitality
                      35
```

A seven-axis radar chart showing all dimension scores simultaneously. The shape immediately reveals where the deal is healthy (low values, close to center) and where it's risky (high values, far from center).

### 8.4 Risk Dashboard Widget (Pipeline-Level)

```
┌──────────────────────────────────────────────────────────────────────┐
│  PIPELINE RISK OVERVIEW                                              │
│                                                                      │
│  Average Risk Score:  42  (MODERATE)                                │
│  Highest Risk Deal:   Atlas Health (87 — HIGH)                      │
│  Risk Trend:          ▲ +4 vs. last week                            │
│                                                                      │
│  ┌──────────────────────────────────────────────────────────────┐   │
│  │                                                               │   │
│  │  HIGH (75-100)  ██████████████████████████  2 deals  ($3.38M)│   │
│  │  ELEVATED (50+) ████████████████████        3 deals  ($2.1M) │   │
│  │  MODERATE (25+) ██████████████              4 deals  ($1.8M) │   │
│  │  LOW (0-25)     ██████████                  3 deals  ($1.17M)│   │
│  │                                                               │   │
│  └──────────────────────────────────────────────────────────────┘   │
│                                                                      │
│  RISK BY DIMENSION (pipeline average):                              │
│  Commercial Alignment     ████████████████████░░░░░  52             │
│  Temporal Pressure        ███████████████░░░░░░░░░░  45             │
│  Technical Readiness      █████████████░░░░░░░░░░░░  38             │
│  Stakeholder Coverage     ████████████░░░░░░░░░░░░░  35             │
│  Engagement Vitality      ██████████░░░░░░░░░░░░░░░  30             │
│  Financial Structure      █████████░░░░░░░░░░░░░░░░  28             │
│  Competitive Exposure     ████████░░░░░░░░░░░░░░░░░  22             │
│                                                                      │
│  INSIGHT: Commercial Alignment is the #1 risk dimension across      │
│  the pipeline. 4 deals have commercial stages ahead of technical     │
│  readiness. Consider a team-wide policy gate.                        │
│                                                                      │
└──────────────────────────────────────────────────────────────────────┘
```

---

## 9. Risk Engine Computation Schedule

| Computation | Trigger | Scope |
|---|---|---|
| **Per-deal risk score** | On any deal mutation (gate toggle, stage change, field update, blocker add) | Single deal |
| **Per-deal risk score** | Nightly at 02:00 UTC | All active deals (catches time-based signals changing) |
| **Pipeline risk summary** | After nightly per-deal run | All active deals aggregated |
| **Risk trend snapshots** | After each per-deal computation | Single deal (appended to `risk_snapshots`) |
| **Velocity benchmarks** | Weekly, Sunday 03:00 UTC | Materialized view refresh |
| **Competitive win rates** | After each deal closes | Materialized view refresh |

---

## 10. Database Schema for Risk Engine

```sql
-- Risk snapshots (historical scores for trend analysis)
CREATE TABLE edc_v2.risk_snapshots (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    deal_id UUID NOT NULL REFERENCES edc.enterprise_deals(id) ON DELETE CASCADE,
    composite_score INT NOT NULL CHECK (composite_score BETWEEN 0 AND 100),
    risk_level VARCHAR(20) NOT NULL,
    trend VARCHAR(20),
    trend_delta INT,
    dimension_scores JSONB NOT NULL,
    top_drivers JSONB,
    recommended_actions JSONB,
    computed_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_risk_snapshots_deal ON edc_v2.risk_snapshots(deal_id, computed_at DESC);
CREATE INDEX idx_risk_snapshots_level ON edc_v2.risk_snapshots(risk_level, composite_score DESC);

-- Pipeline risk summary (materialized for dashboard performance)
CREATE TABLE edc_v2.pipeline_risk_summary (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    snapshot_date DATE NOT NULL,
    total_deals INT NOT NULL,
    average_risk_score NUMERIC(5, 2),
    deals_high_risk INT,
    deals_elevated_risk INT,
    deals_moderate_risk INT,
    deals_low_risk INT,
    tcv_high_risk NUMERIC(15, 2),
    tcv_elevated_risk NUMERIC(15, 2),
    tcv_moderate_risk NUMERIC(15, 2),
    tcv_low_risk NUMERIC(15, 2),
    dimension_averages JSONB,
    riskiest_deals JSONB,       -- Top 5 riskiest deal IDs with scores
    insights JSONB,             -- Auto-generated pipeline-level insights
    computed_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(snapshot_date)
);

CREATE INDEX idx_pipeline_risk_date ON edc_v2.pipeline_risk_summary(snapshot_date DESC);
```

---

## 11. API Contract

```
GET  /api/v2/risk/:dealId
  Response: Full risk assessment for a single deal (output structure from section 7)

GET  /api/v2/risk/:dealId/history
  Query: ?days=30
  Response: { data: [RiskSnapshot, ...], sparkline: [score, score, ...] }

GET  /api/v2/risk/pipeline
  Response: Pipeline-wide risk summary (all deals aggregated)

GET  /api/v2/risk/pipeline/history
  Query: ?days=30
  Response: Historical pipeline risk trends

GET  /api/v2/risk/ranking
  Query: ?sort=composite_score&order=desc&limit=10
  Response: Deals ranked by risk score (the "risk leaderboard")

POST /api/v2/risk/recalculate
  Response: Triggers async recalculation of all active deal risk scores
  Notes: Used after changing dimension weights or scoring logic
```

---

## 12. Configuration (Tunable Without Code Changes)

The dimension weights and scoring thresholds are stored in the `engine_thresholds` table (inherited from V1), extended with risk engine parameters:

```sql
INSERT INTO edc.engine_thresholds (parameter_key, parameter_value, data_type, description) VALUES
    -- Dimension weights (must sum to 1.0)
    ('risk_weight_technical',       '0.20', 'number', 'Weight for Technical Readiness dimension'),
    ('risk_weight_commercial',      '0.15', 'number', 'Weight for Commercial Alignment dimension'),
    ('risk_weight_stakeholder',     '0.15', 'number', 'Weight for Stakeholder Coverage dimension'),
    ('risk_weight_temporal',        '0.15', 'number', 'Weight for Temporal Pressure dimension'),
    ('risk_weight_financial',       '0.10', 'number', 'Weight for Financial Structure dimension'),
    ('risk_weight_competitive',     '0.10', 'number', 'Weight for Competitive Exposure dimension'),
    ('risk_weight_engagement',      '0.15', 'number', 'Weight for Engagement Vitality dimension'),

    -- Risk level boundaries
    ('risk_level_low_max',          '25',   'number', 'Scores at or below this are LOW risk'),
    ('risk_level_moderate_max',     '50',   'number', 'Scores at or below this are MODERATE risk'),
    ('risk_level_elevated_max',     '75',   'number', 'Scores at or below this are ELEVATED risk'),
    -- Above 75 = HIGH

    -- Trend thresholds
    ('risk_trend_threshold',        '8',    'number', 'Score change of this much or more triggers trend change'),

    -- Stale gate thresholds
    ('risk_stale_gate_7day',        '25',   'number', 'Risk contribution when last gate was 7-14 days ago'),
    ('risk_stale_gate_14day',       '50',   'number', 'Risk contribution when last gate was 14-21 days ago'),
    ('risk_stale_gate_21day',       '75',   'number', 'Risk contribution when last gate was 21-30 days ago'),
    ('risk_stale_gate_30day',       '95',   'number', 'Risk contribution when last gate was 30+ days ago'),

    -- Engagement thresholds
    ('risk_engagement_update_2d',   '10',   'number', 'Risk when last update was 2-5 days ago'),
    ('risk_engagement_update_5d',   '30',   'number', 'Risk when last update was 5-10 days ago'),
    ('risk_engagement_update_10d',  '50',   'number', 'Risk when last update was 10-14 days ago'),
    ('risk_engagement_update_14d',  '70',   'number', 'Risk when last update was 14-21 days ago'),
    ('risk_engagement_update_21d',  '90',   'number', 'Risk when last update was 21+ days ago');
```

The Commander can tune these via the Settings UI. If they believe commercial alignment is more important, they increase its weight. If they think the stale gate threshold should be 10 days instead of 7, they change it. No code deployment required.

---

This engine is deterministic, explainable, multi-dimensional, trend-aware, and actionable. It doesn't fire alerts — it produces a continuous risk assessment that the Commander can always see, always understand, and always act on.