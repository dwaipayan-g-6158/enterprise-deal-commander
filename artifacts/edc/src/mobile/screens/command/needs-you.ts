// Relative imports: node-tested through a vitest config with no alias
// resolution, same as the roster model layer.
import { humanizeCode } from "../../../lib/format";
import { alertBody } from "../../lib/alert-text";
import type { MissionCategory, MissionItem } from "../../../lib/mission/priority-scorer";

/**
 * "What needs you now" — at most three rows, each one a tap from the screen that
 * fixes it.
 *
 * ## The deep link is the whole point
 *
 * The desktop dashboard's equivalents (critical-alerts-feed, next-actions, the
 * mission segment) all navigate to `/deals/:id` — the deal, not the problem. On
 * a wide screen that costs one more click on a tab strip that is already
 * visible. On a phone it costs a scroll, a hunt through a drill-in list, and a
 * push, which is enough friction that the row stops being worth tapping.
 *
 * So each row resolves to the panel that resolves it: an alert opens Risk
 * alerts, an overdue decision opens Decisions, a playbook step opens Playbook, a
 * near close opens Stage. That mapping is the reason this module exists and is
 * the thing worth testing.
 */

export type NeedKind = "alert" | "decision" | "playbook" | "close";

export interface NeedRow {
  id: string;
  dealId: string;
  dealName: string;
  /** What to do about it. */
  title: string;
  /** One line of why, or when. */
  meta: string;
  kind: NeedKind;
  /** The panel that fixes it. */
  href: string;
  tone: "critical" | "caution";
}

/** Structural mirror of the generated `CriticalAlert`, so this stays React-free. */
export interface NeedAlertInput {
  dealId: string;
  dealName: string;
  tcv: number;
  alert: { code: string; message: string };
}

/** Which panel answers which kind of work. The mapping this module is for. */
export const PANEL_FOR_KIND: Record<NeedKind, string> = {
  alert: "alerts",
  decision: "decisions",
  playbook: "playbook",
  close: "stage",
};

const KIND_FOR_MISSION_CATEGORY: Record<MissionCategory, NeedKind> = {
  overdue: "decision",
  due: "decision",
  playbook: "playbook",
  close: "close",
};

export interface NeedsYouOptions {
  /** Rows shown. Three is the design; the parameter exists for the test. */
  limit?: number;
  /**
   * Rows any one deal may occupy.
   *
   * Two, not three. A deal in genuine trouble will supply an alert, an overdue
   * decision AND a slipping close date, and letting it take the whole list
   * hides the rest of the portfolio behind the loudest deal — which is exactly
   * the failure mode the list is meant to prevent. Two rows still says "this one
   * is bad" without the list becoming about one account.
   */
  maxPerDeal?: number;
}

/**
 * Merge critical alerts and the ranked mission into one short list.
 *
 * Alerts lead unconditionally. A RED alert is the only item here that can block
 * a stage advance server-side (`isBlockingRedAlert`), so it outranks work that
 * is merely due — and the mission's own ranking, which this preserves for
 * everything below the alerts, has no visibility into alerts at all.
 */
export function buildNeedsYou(
  alerts: NeedAlertInput[],
  mission: MissionItem[],
  options: NeedsYouOptions = {},
): NeedRow[] {
  const limit = options.limit ?? 3;
  const maxPerDeal = options.maxPerDeal ?? 2;

  const candidates: NeedRow[] = [];

  for (const entry of alerts) {
    candidates.push({
      id: `alert:${entry.dealId}:${entry.alert.code}`,
      dealId: entry.dealId,
      dealName: entry.dealName,
      title: `${entry.dealName}: ${humanizeCode(entry.alert.code)}`,
      // alertBody strips the engine's shouted pattern-name prefix, which the
      // title above already says in sentence case.
      meta: alertBody(entry.alert),
      kind: "alert",
      href: hrefFor(entry.dealId, "alert"),
      tone: "critical",
    });
  }

  for (const item of mission) {
    const kind = KIND_FOR_MISSION_CATEGORY[item.category];
    candidates.push({
      id: item.id,
      dealId: item.dealId,
      dealName: item.dealName,
      title: item.label,
      meta: item.meta,
      kind,
      href: hrefFor(item.dealId, kind),
      tone: item.category === "overdue" ? "critical" : "caution",
    });
  }

  const seenTargets = new Set<string>();
  const perDeal = new Map<string, number>();
  const rows: NeedRow[] = [];

  for (const row of candidates) {
    if (rows.length >= limit) break;
    // One row per destination. Two mission items on the same deal's playbook
    // both resolve to the same screen, and offering the same tap twice is how a
    // three-row list stops being worth reading.
    if (seenTargets.has(row.href)) continue;
    const used = perDeal.get(row.dealId) ?? 0;
    if (used >= maxPerDeal) continue;

    seenTargets.add(row.href);
    perDeal.set(row.dealId, used + 1);
    rows.push(row);
  }

  return rows;
}

function hrefFor(dealId: string, kind: NeedKind): string {
  return `/deals/${dealId}/${PANEL_FOR_KIND[kind]}`;
}
