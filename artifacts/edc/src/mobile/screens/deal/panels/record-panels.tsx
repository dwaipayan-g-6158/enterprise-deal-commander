import { useState } from "react";
import { cn } from "@/lib/utils";
import { formatDate, formatDateTime, humanizeField, relativeTime } from "@/lib/format";
import { useListAudit, useListDealActivity, useListDecisions } from "@workspace/api-client-react";
import { activityTitle } from "@/lib/activity-title";
import { HEALTH_CLASS } from "@/lib/semantic-colors";
import { MobileCard, CardHeader } from "@/mobile/components/mobile-card";
import { ListRow } from "@/mobile/components/list-row";
import { MSegmented } from "@/mobile/ui/m-segmented";
import { PanelBody, type PanelBodyProps } from "@/mobile/screens/deal/panel-screen";

const ACTIVITY_LIMIT = 40;
const AUDIT_LIMIT = 40;

/**
 * Everything that happened to the deal, in two readings.
 *
 * ## Timeline and Field changes, not five lists
 *
 * The Record tab used to be five separate reverse-chronological lists of
 * changes, none complete on its own. The desktop redesign collapsed them into
 * these two views and this mirrors that, deliberately — a reader who learns the
 * shape on one shell should find it on the other.
 *
 * The segmented control here filters a list in place; it does not switch routes.
 * That is the one thing a sub-screen's segmented control is allowed to do, and
 * it is why this is `radiogroup` semantics rather than a tablist.
 */
export function HistoryPanel({ dealId }: PanelBodyProps) {
  const [view, setView] = useState<"timeline" | "fields">("timeline");
  const activityQuery = useListDealActivity(dealId, { limit: ACTIVITY_LIMIT });
  const auditQuery = useListAudit(dealId, { limit: AUDIT_LIMIT });

  const activity = activityQuery.data?.data ?? [];
  const audit = auditQuery.data?.data ?? [];
  const timeline = view === "timeline";
  const query = timeline ? activityQuery : auditQuery;
  const rows = timeline ? activity : audit;

  return (
    <>
      <MSegmented
        segments={[
          { id: "timeline", label: "Timeline" },
          { id: "fields", label: "Field changes" },
        ]}
        activeId={view}
        onSelect={(id) => setView(id as "timeline" | "fields")}
        label="History view"
      />

      <PanelBody
        loading={query.isLoading}
        error={query.isError}
        empty={!query.isLoading && rows.length === 0}
        emptyTitle={timeline ? "Nothing has happened yet" : "No field changes recorded"}
        emptyBody={
          timeline
            ? "Events land here as the deal is worked."
            : "Every edit to a tracked field is recorded with who made it."
        }
      >
        <MobileCard>
          {timeline ? (
            <ul>
              {activity.map((event) => (
                <li key={event.id}>
                  <ListRow
                    title={activityTitle(event)}
                    sub={event.actor}
                    trailing={relativeTime(event.occurredAt)}
                  />
                </li>
              ))}
            </ul>
          ) : (
            <ul className="space-y-3">
              {audit.map((entry) => (
                <li key={entry.id}>
                  <div className="flex items-baseline justify-between gap-3">
                    <p className="m-label m-muted min-w-0 flex-1 truncate">
                      {humanizeField(entry.fieldChanged)}
                    </p>
                    <span className="m-caption m-muted shrink-0">
                      {formatDateTime(entry.changedAt, "—")}
                    </span>
                  </div>
                  <p className="m-body mt-0.5 text-pretty">
                    <span className="m-muted line-through">{entry.oldValue ?? "—"}</span>
                    {"  →  "}
                    <span>{entry.newValue ?? "—"}</span>
                  </p>
                  <p className="m-caption m-muted mt-0.5">{entry.changedBy}</p>
                </li>
              ))}
            </ul>
          )}
        </MobileCard>
      </PanelBody>
    </>
  );
}

/** Decisions that are past due read as urgent; the rest read as scheduled. */
function decisionTone(status: string, dueDate: string | null | undefined): string {
  if (status === "completed") return "m-muted";
  if (!dueDate) return "";
  const due = new Date(dueDate).getTime();
  if (!Number.isFinite(due)) return "";
  return due < Date.now() ? HEALTH_CLASS.RED.text : "";
}

/**
 * Decisions taken and decisions owed.
 *
 * Open first, and overdue ones marked — a decisions list sorted purely by date
 * buries the one that is late underneath the three that are not.
 *
 * Read-only: recording a decision collects text, a rationale, an owner and a due
 * date, which is a form.
 */
export function DecisionsPanel({ dealId }: PanelBodyProps) {
  const query = useListDecisions(dealId);
  const decisions = query.data?.data ?? [];
  const open = decisions.filter((d) => d.status !== "completed");
  const closed = decisions.filter((d) => d.status === "completed");

  return (
    <PanelBody
      loading={query.isLoading}
      error={query.isError}
      empty={!query.isLoading && decisions.length === 0}
      emptyTitle="No decisions recorded"
      emptyBody="Decisions are what a meeting produced, and what somebody owes by when."
    >
      <>
        {open.length > 0 ? (
          <MobileCard>
            <CardHeader label={`Open (${open.length})`} />
            <ul className="space-y-4">
              {open.map((decision) => (
                <li key={decision.id}>
                  <p className={cn("m-headline text-pretty", decisionTone(decision.status, decision.dueDate))}>
                    {decision.decisionText}
                  </p>
                  {decision.rationale ? (
                    <p className="m-body m-muted mt-0.5 text-pretty">{decision.rationale}</p>
                  ) : null}
                  <p className="m-caption m-muted mt-1">
                    {decision.owner}
                    {decision.dueDate ? ` · due ${formatDate(decision.dueDate, "—")}` : ""}
                    {` · decided ${formatDate(decision.decidedAt, "—")}`}
                  </p>
                </li>
              ))}
            </ul>
          </MobileCard>
        ) : null}

        {closed.length > 0 ? (
          <MobileCard>
            <CardHeader label={`Completed (${closed.length})`} />
            <ul className="space-y-3">
              {closed.map((decision) => (
                <li key={decision.id} className="opacity-80">
                  <p className="m-body text-pretty">{decision.decisionText}</p>
                  <p className="m-caption m-muted mt-0.5">
                    {decision.owner}
                    {decision.completedAt
                      ? ` · completed ${formatDate(decision.completedAt, "—")}`
                      : ""}
                  </p>
                </li>
              ))}
            </ul>
          </MobileCard>
        ) : null}
      </>
    </PanelBody>
  );
}
