import { useMemo, useState } from "react";
import { Link } from "wouter";
import { X } from "lucide-react";
import type { ActivityEvent } from "@workspace/api-client-react";
import { defaultStore } from "@/lib/storage";
import { currentWeekWindow, isFriday, isMonday, weekKey } from "@/lib/weekly/week-boundaries";
import { dismiss, isDismissed } from "@/lib/weekly/review-dismiss";
import { MobileCard, CardHeader } from "@/mobile/components/mobile-card";
import { DEALS_LINKS } from "@/mobile/screens/deals/deals-href";

/**
 * The week, on the two days of it that mean anything.
 *
 * ## Monday and Friday only, and nothing in between
 *
 * A "weekly review" card that renders every day is a card that gets scrolled
 * past every day. Monday is when a plan is worth reading and Friday is when a
 * summary is; on Tuesday the same content is neither, so this returns null.
 * `week-boundaries.ts` supplies the local-time, Monday-start calendar the rest
 * of the app already uses, so this cannot invent a second definition of "week".
 *
 * ## Dismissal is per week, not per session
 *
 * Keyed by the ISO week id, so dismissing Friday's review keeps it dismissed
 * through the weekend and brings the next one back on its own. A session-scoped
 * dismissal would re-offer it on every cold start, which on an installed app is
 * several times a day.
 */
export function WeekBlock({
  activity,
  closingThisWeek,
  redAlerts,
  overdueActions,
}: {
  activity: ActivityEvent[];
  /** Deals due inside the next seven local calendar days. */
  closingThisWeek: number;
  redAlerts: number;
  overdueActions: number;
}) {
  // Read once per mount: the date does not change under the reader, and
  // re-deriving it every render would make the dismissal state flicker.
  const [now] = useState(() => new Date());
  const key = weekKey(now);
  const [dismissed, setDismissed] = useState(() => isDismissed(defaultStore, key));

  const monday = isMonday(now);
  const friday = isFriday(now);

  const done = useMemo(() => {
    if (!friday) return null;
    const { since, until } = currentWeekWindow(now);
    const from = since.getTime();
    const to = until.getTime();
    const inWeek = activity.filter((e) => {
      const at = new Date(e.occurredAt).getTime();
      return Number.isFinite(at) && at >= from && at <= to;
    });
    return {
      moves: inWeek.filter((e) => e.eventType === "deal.stage_changed").length,
      touched: new Set(inWeek.map((e) => e.dealId)).size,
      total: inWeek.length,
    };
  }, [friday, activity, now]);

  if (dismissed || (!monday && !friday)) return null;

  return (
    <MobileCard>
      <CardHeader
        label={monday ? "The week ahead" : "This week"}
        action={
          <button
            type="button"
            onClick={() => {
              dismiss(defaultStore, key);
              setDismissed(true);
            }}
            aria-label="Dismiss this week's summary"
            className="m-press m-tap -m-2 flex h-9 w-9 items-center justify-center rounded-full"
          >
            <X className="m-muted h-4 w-4" aria-hidden="true" />
          </button>
        }
      />

      {monday ? (
        <ul className="space-y-1.5">
          <WeekLine
            value={closingThisWeek}
            label={`deal${closingThisWeek === 1 ? "" : "s"} due to close this week`}
            href={DEALS_LINKS.closingSoon()}
          />
          <WeekLine
            value={redAlerts}
            label={`red alert${redAlerts === 1 ? "" : "s"} to clear`}
            href={DEALS_LINKS.red()}
          />
          <WeekLine
            value={overdueActions}
            label={`overdue action${overdueActions === 1 ? "" : "s"}`}
          />
        </ul>
      ) : done ? (
        <>
          <p className="m-body text-pretty">
            {done.total === 0
              ? "Nothing moved in the pipeline this week."
              : `${done.moves} stage ${done.moves === 1 ? "move" : "moves"} across ${done.touched} ${done.touched === 1 ? "deal" : "deals"}.`}
          </p>
          {redAlerts > 0 ? (
            <p className="m-caption m-muted mt-1.5">
              {redAlerts} red alert{redAlerts === 1 ? "" : "s"} carries into next week.
            </p>
          ) : null}
        </>
      ) : null}
    </MobileCard>
  );
}

function WeekLine({ value, label, href }: { value: number; label: string; href?: string }) {
  const body = (
    <>
      <span className="m-headline m-num">{value}</span>{" "}
      <span className="m-body m-muted">{label}</span>
    </>
  );
  // Zero is worth stating — "0 overdue actions" is the good news — but it is not
  // worth a tap into an empty list.
  if (!href || value === 0) return <li>{body}</li>;
  return (
    <li>
      <Link href={href} className="m-press m-tap block">
        {body}
      </Link>
    </li>
  );
}
