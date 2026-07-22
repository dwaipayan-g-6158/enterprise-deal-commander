// Pure cross-category ranking for the Daily Mission widget (PRD 4.3 Daily
// Mission + 4.23 Intelligent Recommendations — this ranking *is* the
// recommendation logic, there's no separate implementation).
//
// `/api/v2/analytics/next-actions` returns a `GenericDataResponse` (no
// generated schema for its `data` payload), so there is no shared type to
// import — this module declares its own minimal structural type for the
// four buckets it reads, mirroring the real shape used by
// `components/dashboard/widgets/next-actions.tsx`. Notably `upcomingCloses`
// items carry the deal id in their `id` field (no separate `dealId`), which
// this module has to account for explicitly.

interface MissionDecision {
  id: string;
  dealId: string;
  dealName: string;
  action: string;
  dueDate: string;
}

interface MissionPlaybookStep {
  dealId: string;
  dealName: string;
  playbookName: string;
  action: string;
  stepOrder: number;
  totalSteps: number;
}

interface MissionUpcomingClose {
  /** The deal id — `next-actions.tsx` deep-links via `x.id`, not a `dealId` field. */
  id: string;
  dealName: string;
  daysToClose: number;
}

export interface NextActionsData {
  overdue: MissionDecision[];
  dueThisWeek: MissionDecision[];
  playbookSteps: MissionPlaybookStep[];
  upcomingCloses: MissionUpcomingClose[];
}

export type MissionCategory = "overdue" | "due" | "playbook" | "close";

export interface MissionItem {
  id: string;
  dealId: string;
  dealName: string;
  label: string;
  meta: string;
  category: MissionCategory;
  navigateTo: string;
}

const CATEGORY_RANK: Record<MissionCategory, number> = {
  overdue: 0,
  due: 1,
  playbook: 2,
  close: 3,
};

interface RankedItem extends MissionItem {
  tcv: number;
  recency: number;
}

/** Days between `iso` and `now` (can be negative). Invalid dates fall back to 0. */
function daysBetween(iso: string, now: Date): number {
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return 0;
  return Math.round((t - now.getTime()) / 86_400_000);
}

function fmtDueMeta(iso: string, now: Date): string {
  const days = daysBetween(iso, now);
  if (days < 0) return `${Math.abs(days)}d overdue`;
  if (days === 0) return "due today";
  return `due in ${days}d`;
}

/** Ascending recency key: an earlier due date / sooner close sorts first. Invalid dates fall back to `now` (neutral). */
function dueDateRecency(iso: string, now: Date): number {
  const t = new Date(iso).getTime();
  return Number.isNaN(t) ? now.getTime() : t;
}

function tcvOf(dealId: string, valueByDealId: Record<string, number>): number {
  return valueByDealId[dealId] ?? 0;
}

/**
 * Flattens the four Next-Actions buckets into one ranked list: category
 * urgency (overdue < due < playbook < close) primary, deal TCV secondary
 * (higher first), due-date/days-to-close recency tertiary (sooner first),
 * capped at `limit`. Pure — never throws, never reads the clock itself.
 */
export function buildMission(
  data: NextActionsData | null | undefined,
  valueByDealId: Record<string, number>,
  now: Date,
  limit = 5,
): MissionItem[] {
  if (!data) return [];

  const ranked: RankedItem[] = [];

  for (const d of Array.isArray(data.overdue) ? data.overdue : []) {
    ranked.push({
      id: `overdue-${d.id}`,
      dealId: d.dealId,
      dealName: d.dealName,
      label: `${d.dealName}: ${d.action}`,
      meta: fmtDueMeta(d.dueDate, now),
      category: "overdue",
      navigateTo: `/deals/${d.dealId}`,
      tcv: tcvOf(d.dealId, valueByDealId),
      recency: dueDateRecency(d.dueDate, now),
    });
  }

  for (const d of Array.isArray(data.dueThisWeek) ? data.dueThisWeek : []) {
    ranked.push({
      id: `due-${d.id}`,
      dealId: d.dealId,
      dealName: d.dealName,
      label: `${d.dealName}: ${d.action}`,
      meta: fmtDueMeta(d.dueDate, now),
      category: "due",
      navigateTo: `/deals/${d.dealId}`,
      tcv: tcvOf(d.dealId, valueByDealId),
      recency: dueDateRecency(d.dueDate, now),
    });
  }

  for (const p of Array.isArray(data.playbookSteps) ? data.playbookSteps : []) {
    ranked.push({
      id: `playbook-${p.dealId}-${p.playbookName}-${p.stepOrder}`,
      dealId: p.dealId,
      dealName: p.dealName,
      label: `${p.dealName}: ${p.action}`,
      meta: `${p.playbookName} · Step ${p.stepOrder} of ${p.totalSteps}`,
      category: "playbook",
      navigateTo: `/deals/${p.dealId}`,
      tcv: tcvOf(p.dealId, valueByDealId),
      // No due-date on a playbook step; earlier steps are the closer-term
      // work, so step order stands in for recency within this category.
      recency: p.stepOrder,
    });
  }

  for (const c of Array.isArray(data.upcomingCloses) ? data.upcomingCloses : []) {
    ranked.push({
      id: `close-${c.id}`,
      dealId: c.id,
      dealName: c.dealName,
      label: c.dealName,
      meta: `Closes in ${c.daysToClose}d`,
      category: "close",
      navigateTo: `/deals/${c.id}`,
      tcv: tcvOf(c.id, valueByDealId),
      recency: c.daysToClose,
    });
  }

  ranked.sort((a, b) => {
    const catDiff = CATEGORY_RANK[a.category] - CATEGORY_RANK[b.category];
    if (catDiff !== 0) return catDiff;
    const tcvDiff = b.tcv - a.tcv;
    if (tcvDiff !== 0) return tcvDiff;
    return a.recency - b.recency;
  });

  return ranked.slice(0, limit).map(({ tcv: _tcv, recency: _recency, ...item }) => item);
}
