// Contextual risk patterns (V2 F2 competitive, F8 stakeholder) — pure.
//
// These evaluate relationship/competitive data that lives outside the core
// RawDeal shape, so they're standalone evaluators merged into a deal's alert
// list by the intelligence route rather than threaded through riskPatterns.

export interface ContextualAlert {
  code: string;
  severity: "RED" | "YELLOW";
  weight: number;
  message: string;
}

export interface CompetitorProfile {
  competitorName: string;
  status: string; // 'Active' | 'Displaced' | 'Lost To' | 'Won Against'
  historicalWinRate: number; // 0–1, our win rate against them
}

export interface CompetitiveContext {
  activeCompetitors: number;
  technicalProgressPct: number;
  competitorProfiles: CompetitorProfile[];
}

export function evaluateCompetitivePatterns(ctx: CompetitiveContext): ContextualAlert[] {
  const alerts: ContextualAlert[] = [];

  if (ctx.activeCompetitors >= 2 && ctx.technicalProgressPct < 50) {
    alerts.push({
      code: "BAKE_OFF_RISK",
      severity: "YELLOW",
      weight: 45,
      message:
        `BAKE-OFF RISK: ${ctx.activeCompetitors} active competitors in this evaluation with only ` +
        `${ctx.technicalProgressPct}% gate completion. Accelerate differentiation or risk losing to a ` +
        `faster-moving vendor.`,
    });
  }

  const threat = ctx.competitorProfiles.find(
    (cp) => cp.status === "Active" && cp.historicalWinRate > 0.6,
  );
  if (threat) {
    alerts.push({
      code: "LOST_TO_PATTERN",
      severity: "YELLOW",
      weight: 50,
      message:
        `COMPETITIVE DISADVANTAGE: ${threat.competitorName} has won ` +
        `${Math.round(threat.historicalWinRate * 100)}% of head-to-head encounters. Review competitive ` +
        `playbook and escalate differentiation strategy.`,
    });
  }

  return alerts;
}

export interface StakeholderLite {
  name: string;
  title: string | null;
  sentiment: string; // 'Champion' | 'Supportive' | 'Neutral' | 'Skeptical' | 'Hostile'
  isDecisionMaker: boolean;
}

export function evaluateStakeholderPatterns(stakeholders: StakeholderLite[]): ContextualAlert[] {
  const alerts: ContextualAlert[] = [];
  if (stakeholders.length === 0) return alerts;

  const champions = stakeholders.filter((s) => s.sentiment === "Champion");
  const championPct = champions.length / stakeholders.length;
  if (championPct < 0.2) {
    alerts.push({
      code: "CHAMPION_GAP",
      severity: "YELLOW",
      weight: 55,
      message:
        `CHAMPION GAP: Only ${champions.length} of ${stakeholders.length} stakeholders ` +
        `(${Math.round(championPct * 100)}%) are champions. Recommended minimum: 40%. Risk of internal ` +
        `consensus collapse during procurement.`,
    });
  }

  const hostile = stakeholders.find((s) => s.sentiment === "Hostile" && s.isDecisionMaker);
  if (hostile) {
    alerts.push({
      code: "HOSTILE_STAKEHOLDER",
      severity: "RED",
      weight: 80,
      message:
        `HOSTILE DECISION MAKER: ${hostile.name}${hostile.title ? ` (${hostile.title})` : ""} is a ` +
        `decision maker with hostile sentiment. This stakeholder has veto power. Immediate ` +
        `executive-to-executive engagement required.`,
    });
  }

  return alerts;
}
