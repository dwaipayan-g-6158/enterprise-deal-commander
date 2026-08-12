import { useMemo, useState } from "react";
import {
  Activity,
  ArrowRight,
  BadgeCheck,
  CircleCheck,
  FileEdit,
  HeartPulse,
  ListChecks,
  OctagonAlert,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { dayKey, dayLabel, formatDate, formatTime, relativeTime } from "@/lib/format";
import {
  useGetDeal,
  useGetDealIntelligence,
  useListAudit,
  useListDealActivity,
  useListDecisions,
  useListPipelineStages,
} from "@workspace/api-client-react";
import {
  activityToRows,
  auditToRows,
  type AuditLookups,
  type TimelineKind,
  type TimelineRow,
} from "@/components/cockpit/history/adapters";
import { describeKindCount, digestHistory } from "@/components/cockpit/history/digest";
import { isDecisionCompleted } from "@/lib/decision-status";
import { HEALTH_CLASS, type Health } from "@/lib/semantic-colors";
import { MobileCard, CardHeader } from "@/mobile/components/mobile-card";
import { MSegmented } from "@/mobile/ui/m-segmented";
import { PanelBody, type PanelBodyProps } from "@/mobile/screens/deal/panel-screen";

const ACTIVITY_LIMIT = 40;
const AUDIT_LIMIT = 40;

/** Kinds named in the digest line before it stops being a summary. */
const KINDS_SUMMARISED = 4;

/** Detail lines shown per entry before they are counted instead of listed. */
const DETAILS_SHOWN = 3;

const KIND_ICON: Record<TimelineKind, typeof Activity> = {
  field: FileEdit,
  stage: ArrowRight,
  health: HeartPulse,
  gate: CircleCheck,
  blocker: OctagonAlert,
  playbook: ListChecks,
  meddpicc: BadgeCheck,
  system: Activity,
};

/**
 * Everything that happened to the deal — what it adds up to, then the entries.
 *
 * ## Timeline and Field changes, not five lists
 *
 * The Record tab used to be five separate reverse-chronological lists of
 * changes, none complete on its own. The desktop redesign collapsed them into
 * these two views and this mirrors that, deliberately — a reader who learns the
 * shape on one shell should find it on the other.
 *
 * ## It now shares desktop's adapters instead of rendering raw rows
 *
 * This panel used to read the two endpoints directly, and paid for it twice
 * over. `deal_audit_log` stores every value as text and stores raw foreign keys,
 * so a stage change rendered as literally "2 → 3" and a batch gate save rendered
 * as N rows all labelled "Is Completed" — the exact failures `adapters.ts`
 * documents fixing on desktop, reappearing here because the fix lived in the
 * component that consumed it rather than in a module. The adapters also collapse
 * a multi-field save into one row, which is most of the noise gone on its own.
 *
 * ## Digest first
 *
 * Forty rows newest-first answer "what happened at 14:32 on Tuesday". The
 * question on a phone is "has this deal moved, and where", so that is stated
 * above the list and the list is the evidence for it.
 */
export function HistoryPanel({ dealId }: PanelBodyProps) {
  const [view, setView] = useState<"timeline" | "fields">("timeline");
  const activityQuery = useListDealActivity(dealId, { limit: ACTIVITY_LIMIT });
  const auditQuery = useListAudit(dealId, { limit: AUDIT_LIMIT });

  // Lookups exist to turn raw foreign keys into names. Stages are the one that
  // matters most (sales_stage_id is the most-edited FK on a deal); gate labels
  // come off the intelligence payload the deal screens have already fetched.
  const { data: stagesRes } = useListPipelineStages();
  const { data: intelRes } = useGetDealIntelligence(dealId);
  const { data: dealRes } = useGetDeal(dealId);

  const lookups = useMemo<AuditLookups>(
    () => ({
      stages: stagesRes?.data,
      currency: dealRes?.data?.dealCurrency ?? "USD",
      gateLabels: Object.fromEntries(
        (intelRes?.data?.technicalTrack.gates ?? []).map((g) => [g.gateCode, g.label]),
      ),
    }),
    [stagesRes, dealRes, intelRes],
  );

  const timelineRows = useMemo(
    () => activityToRows(activityQuery.data?.data ?? []),
    [activityQuery.data],
  );
  const changeRows = useMemo(
    () => auditToRows(auditQuery.data?.data ?? [], lookups),
    [auditQuery.data, lookups],
  );

  const timeline = view === "timeline";
  const query = timeline ? activityQuery : auditQuery;
  const rows = timeline ? timelineRows : changeRows;
  const digest = useMemo(() => digestHistory(rows), [rows]);

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
        <>
          <MobileCard>
            <p className="m-headline text-pretty">
              {digest.total} {digest.total === 1 ? "entry" : "entries"}
              {digest.spanDays != null
                ? ` over ${digest.spanDays} ${digest.spanDays === 1 ? "day" : "days"}`
                : ""}
            </p>
            {digest.byKind.length > 0 ? (
              <p className="m-body m-muted mt-1 text-pretty">
                {digest.byKind.slice(0, KINDS_SUMMARISED).map(describeKindCount).join(" · ")}
              </p>
            ) : null}
            <p className="m-caption m-muted mt-1.5">
              {digest.actors.length > 0
                ? `${digest.actors[0].name} made most of them`
                : "No named author"}
              {digest.latestAt ? ` · last ${relativeTime(digest.latestAt)}` : ""}
            </p>
          </MobileCard>

          {/* Grouped by day, like desktop. A date heading carries the "when"
              for a whole run of rows, so each row stops having to. */}
          {groupByDay(rows).map(([day, dayRows]) => (
            <MobileCard key={day}>
              <CardHeader label={dayLabel(dayRows[0].at)} />
              <ul className="-mx-4 -mb-4">
                {dayRows.map((row) => (
                  <li key={row.id} className="border-t border-border first:border-t-0">
                    <HistoryRow row={row} />
                  </li>
                ))}
              </ul>
            </MobileCard>
          ))}
        </>
      </PanelBody>
    </>
  );
}

/** Contiguous runs of one calendar day, preserving the newest-first order. */
function groupByDay(rows: TimelineRow[]): [string, TimelineRow[]][] {
  const groups: [string, TimelineRow[]][] = [];
  for (const row of rows) {
    const key = dayKey(row.at);
    const last = groups[groups.length - 1];
    if (last && last[0] === key) last[1].push(row);
    else groups.push([key, [row]]);
  }
  return groups;
}

/**
 * One entry: what changed, and the detail only where it adds something.
 *
 * The title already names the change (the adapters put the count in it — "Updated
 * 3 technical gates"), so the per-field detail lines are the *evidence* and are
 * capped. A save that touched eleven fields does not need eleven lines on a
 * phone to establish that it happened.
 */
function HistoryRow({ row }: { row: TimelineRow }) {
  const Icon = KIND_ICON[row.kind];
  const shown = row.details.slice(0, DETAILS_SHOWN);
  const hidden = row.details.length - shown.length;

  return (
    <div className="flex items-start gap-3 px-4 py-3">
      <span
        className="m-muted mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-muted"
        aria-hidden="true"
      >
        <Icon className="h-3.5 w-3.5" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="m-body block text-pretty">{row.title}</span>
        {row.health ? (
          <span className="m-caption block">
            <span className={HEALTH_CLASS[row.health.to as Health]?.text ?? ""}>
              {row.health.from ? `${row.health.from} → ` : ""}
              {row.health.to}
            </span>
          </span>
        ) : null}
        {shown.length > 0 ? (
          <ul className="mt-0.5">
            {shown.map((detail, i) => (
              <li key={`${detail.label}-${i}`} className="m-caption m-muted text-pretty">
                {detail.label}
                {detail.text
                  ? ` ${detail.text}`
                  : detail.from != null || detail.to != null
                    ? ` ${detail.from ?? "—"} → ${detail.to ?? "—"}`
                    : ""}
              </li>
            ))}
            {hidden > 0 ? (
              <li className="m-caption m-muted">and {hidden} more</li>
            ) : null}
          </ul>
        ) : null}
        <span className="m-caption m-muted mt-0.5 block">
          {formatTime(row.at)}
          {row.actor ? ` · ${row.actor}` : ""}
        </span>
      </span>
    </div>
  );
}

/** Decisions that are past due read as urgent; the rest read as scheduled. */
function decisionTone(status: string, dueDate: string | null | undefined): string {
  if (isDecisionCompleted(status)) return "m-muted";
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
  const open = decisions.filter((d) => !isDecisionCompleted(d.status));
  const closed = decisions.filter((d) => isDecisionCompleted(d.status));

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
