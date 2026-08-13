// How a roster row is painted: the left stripe, plus the emphasis a decided
// deal gets. Pure strings so it stays node-testable — the three surfaces that
// render a row (table, card list, board card) all call this instead of
// repeating the precedence inline.
//
// Relative imports, not "@/" — same reason as roster-types.ts and board.ts:
// this model layer is node-tested and must not depend on alias resolution.
import { HEALTH_CLASS, OUTCOME_CLASS, RISK_LEVEL_CLASS } from "../../../lib/semantic-colors";
import type { Health, RiskLevel } from "../../../lib/semantic-colors";
import { terminalOutcome } from "./board";

/** The row fields the treatment depends on. A full `RosterRow` satisfies it. */
export interface AccentInput {
  salesStage: string | null | undefined;
  healthStatus: Health;
  riskLevel: RiskLevel | null;
}

// GREEN/LOW are deliberately "" (no border) — not derived from HEALTH_CLASS/
// RISK_LEVEL_CLASS, whose LOW row now carries a real (sky) borderL. Preserve
// the existing "no border for the healthy case" behavior explicitly.
export const HEALTH_BORDER: Record<Health, string> = {
  RED: `border-l-2 ${HEALTH_CLASS.RED.borderL}`,
  YELLOW: `border-l-2 ${HEALTH_CLASS.YELLOW.borderL}`,
  GREEN: "",
};

export const RISK_BORDER: Record<RiskLevel, string> = {
  HIGH: `border-l-2 ${RISK_LEVEL_CLASS.HIGH.borderL}`,
  ELEVATED: `border-l-2 ${RISK_LEVEL_CLASS.ELEVATED.borderL}`,
  MODERATE: `border-l-2 ${RISK_LEVEL_CLASS.MODERATE.borderL}`,
  LOW: "",
};

/** Won stays at full strength — a win is a result, not a footnote. Only Lost recedes. */
export const OUTCOME_BORDER: Record<"won" | "lost", string> = {
  won: `border-l-2 ${OUTCOME_CLASS.won.borderL}`,
  lost: `border-l-2 ${OUTCOME_CLASS.lost.borderL} opacity-75`,
};

/**
 * Health and riskLevel both measure risk of *not closing*, which a decided deal
 * no longer carries — so a terminal stage takes the outcome vocabulary and
 * outranks both. Below that, the 4-state riskLevel wins when enrichment has
 * landed, and the 3-state health is the fallback until it does.
 */
export function rowAccent(row: AccentInput): string {
  const outcome = terminalOutcome(row.salesStage);
  if (outcome) return OUTCOME_BORDER[outcome];
  return row.riskLevel ? RISK_BORDER[row.riskLevel] : HEALTH_BORDER[row.healthStatus];
}
