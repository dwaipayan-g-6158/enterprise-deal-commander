// Relative imports: node-tested through a vitest config with no alias resolution.
import { calendarDaysUntil } from "../../../lib/format";
import { terminalOutcome } from "../../../components/roster/model/board";
import type { GreetingContext } from "../../../lib/greetings/select-greeting";

/** "Closing this week", in local calendar days, inclusive of today. */
const CLOSE_WINDOW_DAYS = 7;

/** How far back a stage change still counts as "recent" for the greeting. */
export const RECENT_ACTIVITY_MS = 24 * 60 * 60 * 1000;

/** The slice of a deal the greeting reads. Structural, so this stays React-free. */
export interface GreetingDealInput {
  dealName: string;
  salesStage: string;
  normalizedTCV?: number | null;
  calculatedTCV?: number | null;
  expectedCloseDate?: string | null;
}

export interface GreetingContextInput {
  deals: GreetingDealInput[];
  /** Stage-change events inside the last 24 hours. */
  recentStageChanges: number;
  overdueActionCount: number;
  displayName: string | undefined;
}

/**
 * Assembles the greeting's hook values from data the Command Center already has.
 *
 * ## Why this is a module and not thirty lines in the component
 *
 * The desktop hero builds the same object inline, and the comments there record
 * two bugs it took to get right: `state: "active"` still returns deals sitting in
 * a Closed-Won/Closed-Lost stage, so the "closing this week" count double-counted
 * decided deals; and `new Date("2026-08-30")` parses a date-only column as UTC
 * midnight, so a deal closing TODAY read as already past in any zone east of UTC.
 *
 * Copying that inline a second time is how the phone and the laptop end up
 * greeting the same commander with two different numbers. Copying it wrong is
 * how the phone re-earns both bugs on its own. So it is pure, injected with
 * `now`, and tested.
 */
export function buildGreetingContext(
  input: GreetingContextInput,
  money: (n: number) => string,
  now: number,
): GreetingContext {
  const tcv = (d: GreetingDealInput) => d.normalizedTCV ?? d.calculatedTCV ?? 0;

  const procurement = input.deals.filter((d) => d.salesStage === "Procurement");
  const validation = input.deals.filter((d) => d.salesStage === "Validation");

  const closingThisWeek = input.deals.filter((d) => {
    if (terminalOutcome(d.salesStage) != null) return false;
    const days = calendarDaysUntil(d.expectedCloseDate, now);
    return days != null && days >= 0 && days <= CLOSE_WINDOW_DAYS;
  });

  const closeThisWeekValueRaw = closingThisWeek.reduce((sum, d) => sum + tcv(d), 0);
  const activeValidationValueRaw = validation.reduce((sum, d) => sum + tcv(d), 0);

  // "One step from close" is a proxy, not a gate count: the highest-value deal
  // currently in Procurement, the last stage before a deal is decided. A deal
  // there can still have redlines open, which is why the greeting pool phrases
  // this as proximity rather than certainty.
  const oneStep = [...procurement].sort((a, b) => tcv(b) - tcv(a))[0];

  return {
    namePart: input.displayName ? `, ${input.displayName}` : "",
    procurementCount: procurement.length,
    closeThisWeekValueRaw,
    closeThisWeekValue: money(closeThisWeekValueRaw),
    closeThisWeekCount: closingThisWeek.length,
    recentPhaseAdvanceCount: input.recentStageChanges,
    activeValidationValueRaw,
    activeValidationValue: money(activeValidationValueRaw),
    overdueActionCount: input.overdueActionCount,
    oneStepFromCloseDealName: oneStep?.dealName,
  };
}

/** Stage-change events inside the trailing 24 hours of `events`. */
export function countRecentStageChanges(
  events: { eventType: string; occurredAt: string }[],
  now: number,
): number {
  const floor = now - RECENT_ACTIVITY_MS;
  return events.filter((e) => {
    if (e.eventType !== "deal.stage_changed") return false;
    const at = new Date(e.occurredAt).getTime();
    return Number.isFinite(at) && at >= floor;
  }).length;
}
