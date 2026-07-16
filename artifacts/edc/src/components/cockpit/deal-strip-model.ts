// Pure grouping model for the cockpit deal-switcher strip. No React/JSX so it
// stays node-testable, mirroring cockpit-tabs.ts and the roster board model.
//
// The strip splits the deal list into two stacks — Open (still being worked)
// and Closed (decided). Closed further splits into Won / Lost so the fanned-out
// view can cluster them. A deal's lifecycle "state" (active/archived/deleted)
// is orthogonal to this: a closed-stage deal is usually still lifecycle-active,
// so the split is derived from the sales stage name via terminalOutcome().
import { terminalOutcome } from "../roster/model/board";

export type StripGroupId = "open" | "closed";

/** The minimal deal shape the strip model reasons about. */
export interface StripDeal {
  id: string;
  salesStage?: string | null;
  calculatedTCV?: number | null;
}

export interface StripGroups<T extends StripDeal> {
  open: T[];
  won: T[];
  lost: T[];
}

const byTcvDesc = (a: StripDeal, b: StripDeal) =>
  (b.calculatedTCV ?? 0) - (a.calculatedTCV ?? 0);

/**
 * Bucket deals into open / won / lost, each sorted by TCV descending (the same
 * order the flat strip used before grouping). Non-terminal stages — including a
 * missing/null stage — fall into `open`.
 */
export function groupDeals<T extends StripDeal>(deals: T[]): StripGroups<T> {
  const open: T[] = [];
  const won: T[] = [];
  const lost: T[] = [];
  for (const deal of deals) {
    const outcome = terminalOutcome(deal.salesStage);
    if (outcome === "won") won.push(deal);
    else if (outcome === "lost") lost.push(deal);
    else open.push(deal);
  }
  open.sort(byTcvDesc);
  won.sort(byTcvDesc);
  lost.sort(byTcvDesc);
  return { open, won, lost };
}

/**
 * The left-to-right order of cards for the fanned-out group. This is the single
 * source of truth shared by the strip render and the cockpit's ArrowLeft/Right
 * navigation, so the two never disagree. Closed fans Won first, then Lost.
 */
export function visualOrder<T extends StripDeal>(
  groups: StripGroups<T>,
  expanded: StripGroupId,
): T[] {
  return expanded === "open" ? groups.open : [...groups.won, ...groups.lost];
}

/** Which group a deal id belongs to, or null if it isn't in the list. */
export function groupForDeal<T extends StripDeal>(
  groups: StripGroups<T>,
  id: string,
): StripGroupId | null {
  if (groups.open.some((d) => d.id === id)) return "open";
  if (groups.won.some((d) => d.id === id) || groups.lost.some((d) => d.id === id))
    return "closed";
  return null;
}
