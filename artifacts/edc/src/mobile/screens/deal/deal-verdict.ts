// Relative imports: node-tested through a vitest config with no alias resolution.
import type { RiskLevel } from "../../../components/cockpit/risk/risk-model";

/**
 * The deal's verdict: one sentence saying what is true of it right now.
 *
 * ## Why a sentence sits at the top of a Brief
 *
 * A deal screen can show a risk level, a score, a gate percentage, an alert
 * count and a days-in-stage figure, all correct, and still leave the reader to
 * work out whether the deal is in trouble. On a laptop that synthesis is cheap
 * because everything is visible at once. On a phone it is five scrolls, and the
 * Brief exists precisely so the reader does not have to do it.
 *
 * So this states the conclusion, and the panels below carry the evidence.
 *
 * ## The first rung is about the server, not about mood
 *
 * A RED alert is the only thing here with a mechanical consequence:
 * `isBlockingRedAlert` refuses a stage advance while one is open and
 * undispositioned. The sentence says that rather than saying "high risk",
 * because the reader's next action — go and disposition it — follows from the
 * mechanism, not from the adjective.
 */

export type DealVerdictTone = "critical" | "caution" | "steady";

export interface DealVerdictInput {
  riskLevel: RiskLevel;
  /** Alerts with no disposition on them. */
  openRedAlerts: number;
  openYellowAlerts: number;
  /** Alerts someone has acknowledged, snoozed or accepted. */
  managedAlerts: number;
  /** Technical validation, 0–100. */
  gatesPct: number;
  stage: string;
  daysInStage: number;
  /** Negative when the close date is already past. Null when there is none. */
  daysToClose: number | null;
  /** How many days a deal typically sits in this stage. Null when unknown. */
  benchmarkDays: number | null;
}

export interface DealVerdict {
  tone: DealVerdictTone;
  sentence: string;
  /** The panel that answers the sentence, if there is one. */
  panel: string | null;
}

function plural(n: number, one: string, many = `${one}s`): string {
  return n === 1 ? one : many;
}

/** First match wins, mechanism before adjective. */
export function buildDealVerdict(input: DealVerdictInput): DealVerdict {
  if (input.openRedAlerts > 0) {
    return {
      tone: "critical",
      sentence: `${input.openRedAlerts} red ${plural(input.openRedAlerts, "alert")} ${plural(input.openRedAlerts, "is", "are")} open — the stage guardrail holds until ${plural(input.openRedAlerts, "it is", "they are")} dispositioned.`,
      panel: "alerts",
    };
  }

  if (input.daysToClose != null && input.daysToClose < 0) {
    const late = Math.abs(input.daysToClose);
    return {
      tone: "critical",
      sentence: `${late} ${plural(late, "day")} past its close date and still in ${input.stage}.`,
      panel: "stage",
    };
  }

  // Twice the benchmark is the same line `deriveVelocityBucket` escalates to
  // STALLED on, so the Brief and the roster card agree about which deals have
  // stopped rather than each drawing their own line.
  if (input.benchmarkDays != null && input.benchmarkDays > 0 && input.daysInStage > input.benchmarkDays * 2) {
    return {
      tone: "critical",
      sentence: `Stalled in ${input.stage} — ${input.daysInStage} days against a ${input.benchmarkDays}-day benchmark.`,
      panel: "stage",
    };
  }

  if (input.openYellowAlerts > 0) {
    return {
      tone: "caution",
      sentence: `${input.openYellowAlerts} ${plural(input.openYellowAlerts, "alert")} open, none of them blocking.`,
      panel: "alerts",
    };
  }

  if (input.gatesPct < 50) {
    return {
      tone: "caution",
      sentence:
        input.gatesPct === 0
          ? `No technical gates cleared yet, ${input.daysInStage} ${plural(input.daysInStage, "day")} into ${input.stage}.`
          : `Technical validation is ${Math.round(input.gatesPct)}% through — behind where ${input.stage} expects it.`,
      panel: "gates",
    };
  }

  if (input.riskLevel === "HIGH" || input.riskLevel === "ELEVATED") {
    return {
      tone: "caution",
      sentence: `No open alerts, but the risk model still reads ${input.riskLevel.toLowerCase()}.`,
      panel: "score",
    };
  }

  return {
    tone: "steady",
    sentence:
      input.managedAlerts > 0
        ? `Nothing open — ${input.managedAlerts} ${plural(input.managedAlerts, "alert")} already managed.`
        : "Nothing is blocking this deal.",
    panel: null,
  };
}
