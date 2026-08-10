/**
 * The portfolio verdict: one sentence, and the figure it is about.
 *
 * ## Why a sentence and not another tile
 *
 * The desktop dashboard opens with fourteen widgets and lets the reader work out
 * which number matters today. That is a reasonable trade when there is a screen
 * wide enough to scan; on a phone it is a reading comprehension exercise
 * performed one-handed, and the whole diagnosis behind this rebuild is that the
 * mobile app was a smaller version of that instead of a different answer to it.
 *
 * So this states the conclusion. The tiles are still below — Pulse carries the
 * weighted pipeline, the health split and the coverage ratio — but the top of
 * the screen says what the portfolio's condition IS, in the order a commander
 * asks: what is on fire, then what has stopped, then what is fine.
 *
 * Pure and clock-free: `money` is injected so the sentence is denominated in the
 * portfolio's own reporting currency rather than a hard-coded dollar sign, which
 * is a bug this codebase has already shipped twice (dashboard-hero.tsx and
 * insight-builder.ts both carry the scar).
 */

export type VerdictTone = "critical" | "caution" | "steady" | "quiet";

export interface VerdictInput {
  /** Active RED alerts across the portfolio. */
  redAlerts: number;
  /** TCV sitting on deals with a RED alert, in the reporting currency. */
  tcvAtRisk: number;
  dealsByHealth: { GREEN: number; YELLOW: number; RED: number } | null;
  /** Deals that have stopped moving in their stage. */
  staleDeals: number;
}

export interface Verdict {
  tone: VerdictTone;
  /** One sentence. Never two — a verdict that needs a second sentence isn't one. */
  sentence: string;
  /**
   * The figure the sentence is about, or null when the sentence already carries
   * its own number.
   *
   * Null in the steady and quiet cases on purpose. The obvious filler there is
   * the weighted pipeline, which the Pulse block below already leads with, and
   * repeating a number two hundred pixels apart makes the reader check whether
   * they are the same number. A block with no figure is better than a block with
   * a borrowed one.
   */
  figure: { label: string; value: number; kind: "money" | "count" } | null;
}

function plural(n: number, one: string, many = `${one}s`): string {
  return n === 1 ? one : many;
}

/**
 * First match wins, hardest news first.
 *
 * The ladder is deliberately not a score. A portfolio with two red alerts and
 * nine stalled deals has a red-alert problem, and averaging the two into a
 * "health index" would produce a number that is true of nothing and actionable
 * for no one.
 */
export function buildVerdict(input: VerdictInput, money: (n: number) => string): Verdict {
  const health = input.dealsByHealth;
  const totalDeals = health ? health.GREEN + health.YELLOW + health.RED : 0;

  if (totalDeals === 0) {
    return {
      tone: "quiet",
      sentence: "No active deals in the pipeline yet.",
      figure: null,
    };
  }

  if (input.redAlerts > 0 && input.tcvAtRisk > 0) {
    return {
      tone: "critical",
      sentence: `${money(input.tcvAtRisk)} is sitting behind ${input.redAlerts} red ${plural(input.redAlerts, "alert")}.`,
      figure: { label: "TCV at risk", value: input.tcvAtRisk, kind: "money" },
    };
  }

  // Red alerts with no value behind them is a real state, not a rounding error:
  // an alert can land on a deal whose TCV has not been entered yet. Reporting
  // "$0 is at risk" would read as reassurance.
  if (input.redAlerts > 0) {
    return {
      tone: "critical",
      sentence: `${input.redAlerts} red ${plural(input.redAlerts, "alert")} ${plural(input.redAlerts, "needs", "need")} a decision.`,
      figure: { label: "Red alerts", value: input.redAlerts, kind: "count" },
    };
  }

  if (input.staleDeals > 0) {
    return {
      tone: "caution",
      sentence: `Nothing is red, but ${input.staleDeals} ${plural(input.staleDeals, "deal")} ${plural(input.staleDeals, "has", "have")} stopped moving.`,
      figure: { label: "Stalled", value: input.staleDeals, kind: "count" },
    };
  }

  // Health is RED without an alert firing when the deal's own status was set
  // that way rather than derived by the engine. Worth saying, below alerts.
  if (health && health.RED > 0) {
    return {
      tone: "caution",
      sentence: `${health.RED} ${plural(health.RED, "deal")} ${plural(health.RED, "is", "are")} marked red with no alert firing.`,
      figure: { label: "Red deals", value: health.RED, kind: "count" },
    };
  }

  return {
    tone: "steady",
    sentence: `All ${totalDeals} active ${plural(totalDeals, "deal")} ${plural(totalDeals, "is", "are")} clear — nothing red, nothing stalled.`,
    figure: null,
  };
}
