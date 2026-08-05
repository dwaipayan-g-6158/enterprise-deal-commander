import { useState } from "react";
import { Link } from "wouter";
import {
  useGetDealMemory,
  useGetSimilarDeals,
  getGetSimilarDealsQueryKey,
  type DealMemory,
} from "@workspace/api-client-react";
import { compactCurrency, formatDate, humanizeCode } from "@/lib/format";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { OUTCOME_CLASS } from "@/lib/semantic-colors";
import { normalizeOutcome, OUTCOME_LABEL } from "@/mobile/lib/outcome";
import { sharedCardSeed, useSharedCardStyle } from "@/mobile/lib/shared-card";
import { MobileHeader } from "@/mobile/shell/mobile-header";
import { MobileCard, CardHeader } from "@/mobile/components/mobile-card";
import { MetaChip, OutcomePill } from "@/mobile/components/badges";
import { ListRow } from "@/mobile/components/list-row";
import { Shimmer } from "@/mobile/components/shimmer";
import { ErrorState } from "@/mobile/components/states";

/** Similar-deals is an open payload; read only what the list renders. */
interface SimilarDeal {
  id: string;
  dealName: string;
  accountName: string;
  outcome: string;
  similarity?: number | null;
}

/**
 * One archived deal: the outcome, the numbers behind it, and what was learned.
 * The narrative is the point of the screen — everything else is context for
 * reading it.
 */
export function MemoryDetailScreen({ id }: { id: string }) {
  const memoryQuery = useGetDealMemory(id);
  const memory = memoryQuery.data?.data;
  // Only set when this screen was opened by tapping its card in the archive.
  const shared = useSharedCardStyle(id);
  const [seed] = useState(() => sharedCardSeed(id));
  // Held until the memory resolves, since the similar-deals lookup is keyed by
  // the underlying deal id rather than the memory id.
  const similarQuery = useGetSimilarDeals(memory?.dealId ?? "", {
    query: {
      enabled: Boolean(memory?.dealId),
      queryKey: getGetSimilarDealsQueryKey(memory?.dealId ?? ""),
    },
  });

  if (memoryQuery.isError) {
    return (
      <>
        <MobileHeader title="Memory" backHref="/memory" backLabel="Back to memory" />
        <ErrorState
          title="Couldn't load this record"
          body="It may have been removed. Go back and search again."
        />
      </>
    );
  }

  if (!memory) {
    return (
      <>
        <MobileHeader
          title={seed?.title ?? "Memory"}
          subtitle={seed?.eyebrow}
          backHref="/memory"
          backLabel="Back to memory"
        />
        {/* Drawn from what the archive card knew, so the card has something
            to morph into and the record's own name is on screen immediately
            rather than after the fetch. */}
        {seed ? (
          <header className="px-4 pb-2 pt-4" style={shared("card")}>
            <OutcomePill style={shared("value")} className={seed.valueClassName}>
              {seed.value}
            </OutcomePill>
            <Shimmer className="mt-2 h-10 w-40" />
            <Shimmer className="mt-2 h-3.5 w-32" />
          </header>
        ) : null}
        <div className="space-y-3 p-4">
          <Shimmer className="h-28 rounded-xl" />
          <Shimmer className="h-40 rounded-xl" />
        </div>
      </>
    );
  }

  const outcome = normalizeOutcome(memory.outcome);
  const similar =
    (similarQuery.data?.data as { deals?: SimilarDeal[] } | undefined)?.deals ?? [];

  return (
    <>
      <MobileHeader
        title={memory.dealName}
        subtitle={memory.accountName}
        backHref="/memory"
        backLabel="Back to memory"
      />

      <header className="px-4 pb-2 pt-4" style={shared("card")}>
        <OutcomePill
          style={shared("value")}
          className={cn(OUTCOME_CLASS[outcome].bg, OUTCOME_CLASS[outcome].text)}
        >
          {outcome === "won" ? "Closed-Won" : "Closed-Lost"}
        </OutcomePill>
        <p className="m-display mt-2">
          {memory.finalTcv != null && Number.isFinite(Number(memory.finalTcv))
            ? compactCurrency(Number(memory.finalTcv))
            : "—"}
        </p>
        <p className="m-caption m-muted mt-1">Archived {formatDate(memory.archivedAt, "—")}</p>
      </header>

      <div className="space-y-3 p-4">
        <div className="grid grid-cols-2 gap-3">
          <Tile label="Days active" value={memory.totalDaysActive} />
          <Tile label="Gates cleared" value={memory.totalGatesCompleted} />
          <Tile label="Blockers hit" value={memory.totalBlockersEncountered} />
          <Tile
            label="Pricing"
            value={memory.pricingModel ? humanizeCode(memory.pricingModel) : null}
          />
        </div>

        {memory.winLossNarrative ? (
          <MobileCard>
            <CardHeader label={outcome === "won" ? "Why it was won" : "Why it was lost"} />
            <p className="m-body">{memory.winLossNarrative}</p>
          </MobileCard>
        ) : null}

        {memory.keyLessons && memory.keyLessons.length > 0 ? (
          <MobileCard>
            <CardHeader label="Lessons" />
            <ul className="space-y-2">
              {memory.keyLessons.map((lesson, i) => (
                <li key={i} className="m-body flex gap-2">
                  <span className="m-muted shrink-0 tabular-nums">{i + 1}</span>
                  <span>{lesson}</span>
                </li>
              ))}
            </ul>
          </MobileCard>
        ) : null}

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

        {similar.length > 0 ? (
          <MobileCard>
            <CardHeader label="Similar deals" />
            <ul>
              {similar.slice(0, 5).map((deal) => (
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

        <TagList memory={memory} />
      </div>
    </>
  );
}

function Tile({ label, value }: { label: string; value: number | string | null | undefined }) {
  return (
    <div className="m-card m-reveal p-4">
      <p className="m-label m-muted">{label}</p>
      <p className="m-title mt-1.5">{value ?? "—"}</p>
    </div>
  );
}

function TagList({ memory }: { memory: DealMemory }) {
  if (!memory.tags || memory.tags.length === 0) return null;
  return (
    <div className="flex flex-wrap gap-2">
      {memory.tags.map((tag) => (
        <Badge key={tag} variant="secondary" className="m-caption font-normal">
          {tag}
        </Badge>
      ))}
    </div>
  );
}
