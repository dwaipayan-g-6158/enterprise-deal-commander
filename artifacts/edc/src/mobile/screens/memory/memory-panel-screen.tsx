import { Redirect } from "wouter";
import {
  getGetPlaybookJourneyQueryKey,
  getGetSimilarDealsQueryKey,
  useGetDealMemory,
  useGetPlaybookJourney,
  useGetSimilarDeals,
  useListDealHealthHistory,
  type DealMemory,
} from "@workspace/api-client-react";
import { cn } from "@/lib/utils";
import { formatDate, humanizeCode } from "@/lib/format";
import { HEALTH_CLASS, OUTCOME_CLASS, type Health } from "@/lib/semantic-colors";
import { normalizeOutcome, OUTCOME_LABEL } from "@/mobile/lib/outcome";
import { MNavBar } from "@/mobile/shell/m-nav-bar";
import { MobileCard, CardHeader } from "@/mobile/components/mobile-card";
import { ListRow } from "@/mobile/components/list-row";
import { MetaChip } from "@/mobile/components/badges";
import { Shimmer } from "@/mobile/components/shimmer";
import { EmptyState, ErrorState } from "@/mobile/components/states";
import { memoryPanelById } from "@/mobile/nav/routes";

/**
 * The three pushed screens of one archived record.
 *
 * Read-only throughout. Editing a narrative, its lessons and its tags is three
 * long text fields and a save — desktop work, and the one thing nobody does on a
 * phone while standing up.
 */
export function MemoryPanelScreen({ id, panelId }: { id: string; panelId: string }) {
  const panel = memoryPanelById(panelId);
  const query = useGetDealMemory(id);
  const memory = query.data?.data;

  // `transition={false}` because <Redirect> navigates from a layout effect,
  // where aroundNav's flushSync is not safe to call.
  if (!panel) return <Redirect to={`/memory/${id}`} transition={false} />;

  return (
    <>
      <MNavBar
        title={panel.title}
        subtitle={memory?.dealName}
        backHref={`/memory/${id}`}
        backLabel="Back to the record"
      />

      <div className="space-y-3 px-4 pb-6 pt-3">
        {query.isError ? (
          <ErrorState
            title="Couldn't load this record"
            body="It may have been removed. Go back and search again."
          />
        ) : !memory ? (
          <Shimmer className="h-40 rounded-xl" />
        ) : panel.id === "narrative" ? (
          <Narrative memory={memory} />
        ) : panel.id === "timeline" ? (
          <Timeline memory={memory} />
        ) : (
          <Connections memory={memory} />
        )}
      </div>
    </>
  );
}

/**
 * What happened, in prose, plus what was learned from it.
 *
 * The whole reason the archive exists. It gets a screen to itself so the text
 * can run at a readable measure without a figure grid arguing with it.
 */
function Narrative({ memory }: { memory: DealMemory }) {
  const outcome = normalizeOutcome(memory.outcome);
  const hasAnything =
    memory.winLossNarrative || memory.lossNarrative || (memory.keyLessons?.length ?? 0) > 0;

  if (!hasAnything) {
    return (
      <EmptyState
        title="No narrative written"
        body="A record without a narrative is a row in a table. Writing one is a desktop action."
      />
    );
  }

  return (
    <>
      {memory.winLossNarrative ? (
        <MobileCard>
          <CardHeader label={outcome === "won" ? "Why it was won" : "Why it was lost"} />
          <p className="m-body whitespace-pre-wrap text-pretty">{memory.winLossNarrative}</p>
        </MobileCard>
      ) : null}

      {memory.lossNarrative && memory.lossNarrative !== memory.winLossNarrative ? (
        <MobileCard>
          <CardHeader label="Loss detail" />
          <p className="m-body whitespace-pre-wrap text-pretty">{memory.lossNarrative}</p>
        </MobileCard>
      ) : null}

      {memory.keyLessons && memory.keyLessons.length > 0 ? (
        <MobileCard>
          <CardHeader label="Lessons" />
          <ul className="space-y-2.5">
            {memory.keyLessons.map((lesson, i) => (
              <li key={i} className="m-body flex gap-2.5 text-pretty">
                <span className="m-num m-muted shrink-0">{i + 1}</span>
                <span>{lesson}</span>
              </li>
            ))}
          </ul>
        </MobileCard>
      ) : null}

      {memory.causalChain && memory.causalChain.length > 0 ? (
        <MobileCard>
          <CardHeader label="How it unfolded" />
          <ol className="space-y-2.5">
            {memory.causalChain.map((step, i) => (
              <li key={i} className="m-body flex gap-2.5 text-pretty">
                <span className="m-num m-muted shrink-0">{i + 1}</span>
                <span>{step}</span>
              </li>
            ))}
          </ol>
        </MobileCard>
      ) : null}
    </>
  );
}

/**
 * How the deal's health moved while it was live.
 *
 * The health history is what the record can still show about the shape of the
 * deal — an archived deal has no trajectory endpoint of its own, and the health
 * log is the one series that survives the close.
 */
function Timeline({ memory }: { memory: DealMemory }) {
  const query = useListDealHealthHistory(memory.dealId);
  const history = query.data?.data ?? [];

  return (
    <>
      <MobileCard>
        <CardHeader label="Lifespan" />
        <p className="m-headline">
          {memory.totalDaysActive != null ? `${memory.totalDaysActive} days active` : "—"}
        </p>
        <p className="m-caption m-muted mt-1">
          Closed {OUTCOME_LABEL[normalizeOutcome(memory.outcome)].toLowerCase()} ·{" "}
          {formatDate(memory.archivedAt, "—")}
        </p>
      </MobileCard>

      {query.isLoading ? (
        <Shimmer className="h-40 rounded-xl" />
      ) : history.length === 0 ? (
        <EmptyState
          title="No health history"
          body="Health was not being tracked while this deal was live."
        />
      ) : (
        <MobileCard>
          <CardHeader label="Health over time" />
          <ul className="space-y-2.5">
            {[...history].reverse().map((entry) => (
              <li key={entry.id} className="flex items-baseline gap-2.5">
                {/* The dot takes its colour from the audited health map rather
                    than a chart stroke — this is a status mark, not a shape on
                    a chart, and HEALTH_CLASS is what the rest of the app reads. */}
                <span
                  aria-hidden="true"
                  className={cn(
                    "h-2 w-2 shrink-0 translate-y-1 rounded-full",
                    HEALTH_CLASS[coerceHealth(entry.toStatus)].dot,
                  )}
                />
                <span className="m-body min-w-0 flex-1 text-pretty">
                  {/* The transition, not just the destination: "YELLOW → RED"
                      is the event, and a list of destinations alone makes a deal
                      that oscillated look identical to one that fell once. */}
                  {entry.fromStatus ? (
                    <>
                      <span className="m-muted">{entry.fromStatus} → </span>
                      {entry.toStatus}
                    </>
                  ) : (
                    entry.toStatus
                  )}
                  {entry.reason ? <span className="m-muted"> · {entry.reason}</span> : null}
                </span>
                <span className="m-caption m-muted shrink-0">
                  {formatDate(entry.changedAt, "—")}
                </span>
              </li>
            ))}
          </ul>
        </MobileCard>
      )}
    </>
  );
}

/**
 * The health log stores its statuses as bare strings. Only three are real, and
 * an unrecognised one reads as YELLOW rather than GREEN — an unknown status is
 * not a reassurance.
 */
function coerceHealth(status: string): Health {
  return status === "GREEN" || status === "RED" || status === "YELLOW" ? status : "YELLOW";
}

/** The loose similar-deals payload; only what the list renders is read. */
interface SimilarDeal {
  id: string;
  dealName: string;
  accountName: string;
  outcome: string;
  similarity?: number | null;
}

interface JourneyEntry {
  playbookId: string;
  playbookName: string;
  applicableStage: string | null;
  assignmentId: string | null;
  status: string;
}

/**
 * What this record connects to: deals like it, the plays that were run, and who
 * was across the table.
 *
 * The similar list is the part that earns the screen — an archived deal is only
 * useful when it is reachable from the live one it resembles, and this is the
 * link in the other direction.
 */
function Connections({ memory }: { memory: DealMemory }) {
  const similarQuery = useGetSimilarDeals(memory.dealId, {
    query: { queryKey: getGetSimilarDealsQueryKey(memory.dealId) },
  });
  const journeyQuery = useGetPlaybookJourney(memory.dealId, {
    query: { queryKey: getGetPlaybookJourneyQueryKey(memory.dealId) },
  });

  const similar = (
    (similarQuery.data?.data as { deals?: SimilarDeal[] } | SimilarDeal[] | undefined) ?? []
  ) as SimilarDeal[] | { deals?: SimilarDeal[] };
  const similarDeals = (Array.isArray(similar) ? similar : (similar.deals ?? [])).filter(
    (deal) => deal.id !== memory.id,
  );

  const journey =
    (journeyQuery.data?.data as { journey?: JourneyEntry[] } | undefined)?.journey ?? [];
  const played = journey.filter((entry) => entry.assignmentId);

  return (
    <>
      {similarDeals.length > 0 ? (
        <MobileCard>
          <CardHeader label="Similar deals" />
          <ul>
            {similarDeals.slice(0, 6).map((deal) => (
              <li key={deal.id}>
                <ListRow
                  href={`/deals/${deal.id}`}
                  title={deal.dealName}
                  sub={deal.accountName}
                  trailing={
                    <span className={OUTCOME_CLASS[normalizeOutcome(deal.outcome)].text}>
                      {OUTCOME_LABEL[normalizeOutcome(deal.outcome)]}
                    </span>
                  }
                />
              </li>
            ))}
          </ul>
        </MobileCard>
      ) : null}

      <MobileCard>
        <CardHeader label="Playbooks run" />
        {journeyQuery.isLoading ? (
          <Shimmer className="h-16" />
        ) : played.length === 0 ? (
          <p className="m-body m-muted">
            No playbook was started on this deal — which is itself worth noticing on a loss.
          </p>
        ) : (
          <ul className="space-y-1.5">
            {played.map((entry) => (
              <li key={entry.playbookId} className="flex items-baseline justify-between gap-3">
                <span className="m-body min-w-0 flex-1 truncate">{entry.playbookName}</span>
                <span className="m-caption m-muted shrink-0">{humanizeCode(entry.status)}</span>
              </li>
            ))}
          </ul>
        )}
      </MobileCard>

      {memory.competitorsFaced && memory.competitorsFaced.length > 0 ? (
        <MobileCard>
          <CardHeader label="Competitors faced" />
          <div className="flex flex-wrap gap-2">
            {memory.competitorsFaced.map((name) => (
              <MetaChip key={name} className="rounded-full px-3 py-1">
                {name}
              </MetaChip>
            ))}
          </div>
        </MobileCard>
      ) : null}

      {memory.productGaps && memory.productGaps.length > 0 ? (
        <MobileCard>
          <CardHeader label="Capability gaps cited" />
          <div className="flex flex-wrap gap-2">
            {memory.productGaps.map((gap) => (
              <MetaChip key={gap} className="rounded-full px-3 py-1">
                {gap}
              </MetaChip>
            ))}
          </div>
        </MobileCard>
      ) : null}
    </>
  );
}
