import type { Outcome } from "@/lib/semantic-colors";

/**
 * The memory API returns a display-cased outcome ("Won" / "Lost"), while
 * semantic-colors is keyed by the lowercase enum. Compare case-insensitively:
 * a strict `=== "won"` falls through to lost for every record, which renders
 * a portfolio of wins as a portfolio of losses.
 */
export function normalizeOutcome(raw: string | null | undefined): Outcome {
  return raw?.trim().toLowerCase() === "won" ? "won" : "lost";
}

export const OUTCOME_LABEL: Record<Outcome, string> = {
  won: "Won",
  lost: "Lost",
};
