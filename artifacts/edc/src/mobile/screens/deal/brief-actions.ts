/**
 * The deal's own "what needs you now", from the engine's recommended actions.
 *
 * ## No new judgment, just a destination
 *
 * `DealRisk.recommendedActions` is already the engine's ranked answer to "what
 * should someone do about this deal", carrying a source and a priority. The
 * desktop panel renders the list; this adds the one thing a phone needs and a
 * laptop does not — where to go to do it — and cuts the list to what fits above
 * the fold.
 *
 * Pure and React-free, so the source-to-panel mapping is tested as data rather
 * than inspected in a browser.
 */

/** Structural mirror of the generated `RecommendedAction`. */
export interface BriefActionInput {
  source: string;
  priority: string;
  action: string;
  patternCode?: string | null;
  dimension?: string | null;
}

export interface BriefAction {
  id: string;
  action: string;
  priority: string;
  /** The panel that carries the work. */
  panel: string;
  /** True for the one priority that stops a stage advance server-side. */
  blocking: boolean;
}

/**
 * Where each kind of recommendation is acted on.
 *
 * A guardrail action is about advancing, so it belongs on Stage — which is also
 * the screen that will refuse the advance and explain why. A pattern action is
 * about an alert, so it belongs on Risk alerts, where the disposition controls
 * are. A dimension action has no single row behind it; it comes from the risk
 * model's weighting, so it belongs on the score breakdown.
 */
const PANEL_FOR_SOURCE: Record<string, string> = {
  STAGE_GUARDRAIL: "stage",
  PATTERN: "alerts",
  DIMENSION: "score",
};

/** Fallback for a source the server adds later — the alert list is the safest home. */
const DEFAULT_PANEL = "alerts";

const PRIORITY_RANK: Record<string, number> = {
  BLOCKER: 0,
  CRITICAL: 1,
  HIGH: 2,
  MEDIUM: 3,
  LOW: 4,
};

export function panelForActionSource(source: string): string {
  return PANEL_FOR_SOURCE[source] ?? DEFAULT_PANEL;
}

/**
 * Rank, cap, and give each action a destination.
 *
 * Three rows. The engine can return a dozen, and a Brief that opens with a
 * dozen instructions is a Brief nobody reads past — the full list is one tap
 * away on Coaching, which is exactly what that panel is for.
 */
export function buildBriefActions(
  actions: BriefActionInput[] | undefined,
  limit = 3,
): BriefAction[] {
  if (!Array.isArray(actions)) return [];

  return [...actions]
    .map((a, index) => ({ a, index }))
    .sort((x, y) => {
      const byPriority =
        (PRIORITY_RANK[x.a.priority] ?? 99) - (PRIORITY_RANK[y.a.priority] ?? 99);
      // Ties keep the engine's own order rather than being re-shuffled by a
      // sort that is not stable across every engine.
      return byPriority !== 0 ? byPriority : x.index - y.index;
    })
    .slice(0, limit)
    .map(({ a, index }) => ({
      // The action text is not unique — two dimensions can recommend the same
      // sentence — so the position carries the identity.
      id: `${a.source}:${a.patternCode ?? a.dimension ?? index}`,
      action: a.action,
      priority: a.priority,
      panel: panelForActionSource(a.source),
      blocking: a.priority === "BLOCKER",
    }));
}
