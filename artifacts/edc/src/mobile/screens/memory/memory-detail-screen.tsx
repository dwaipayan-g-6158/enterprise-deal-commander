import { useState } from "react";
import { Link } from "wouter";
import { ChevronRight } from "lucide-react";
import { useGetDealMemory, type DealMemory } from "@workspace/api-client-react";
import { compactCurrency, formatDate, humanizeCode } from "@/lib/format";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { OUTCOME_CLASS } from "@/lib/semantic-colors";
import { normalizeOutcome } from "@/mobile/lib/outcome";
import { sharedCardSeed, useSharedCardStyle } from "@/mobile/lib/shared-card";
import { MNavBar } from "@/mobile/shell/m-nav-bar";
import { MobileCard, CardHeader } from "@/mobile/components/mobile-card";
import { MetaChip, OutcomePill } from "@/mobile/components/badges";
import { Shimmer } from "@/mobile/components/shimmer";
import { ErrorState } from "@/mobile/components/states";
import { PullToRefresh } from "@/mobile/components/pull-to-refresh";
import { MEMORY_PANELS } from "@/mobile/nav/routes";

/**
 * One archived deal.
 *
 * Mirrors the deal Brief's shape deliberately: a hero, the figures, and a drill
 * list into pushed screens. A reader who has learned how a live deal reads
 * should not have to learn a second layout for a dead one.
 *
 * The narrative moves to its own screen rather than sitting here. It is the
 * point of the record and it is prose — often several paragraphs — and prose
 * competing with a figure grid for the same scroll is prose nobody finishes.
 */
export function MemoryDetailScreen({ id }: { id: string }) {
  const query = useGetDealMemory(id);
  const memory = query.data?.data;
  // Only set when this screen was opened by tapping its card in the archive.
  const shared = useSharedCardStyle(id);
  const [seed] = useState(() => sharedCardSeed(id));

  if (query.isError) {
    return (
      <>
        <MNavBar title="Memory" backHref="/memory" backLabel="Back to memory" />
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
        <MNavBar
          title={seed?.title ?? "Memory"}
          subtitle={seed?.eyebrow}
          backHref="/memory"
          backLabel="Back to memory"
        />
        {/* Drawn from what the archive card knew, so the card has something to
            morph into and the record's own name is on screen immediately rather
            than after the fetch. */}
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

  return (
    <>
      <MNavBar
        title={memory.dealName}
        subtitle={memory.accountName}
        backHref="/memory"
        backLabel="Back to memory"
      />

      <PullToRefresh onRefresh={query.refetch}>
        <header className="px-4 pb-2 pt-4" style={shared("card")}>
          <OutcomePill
            style={shared("value")}
            className={cn(OUTCOME_CLASS[outcome].bg, OUTCOME_CLASS[outcome].text)}
          >
            {outcome === "won" ? "Closed-Won" : "Closed-Lost"}
          </OutcomePill>
          <p className="m-display m-num mt-2">
            {memory.finalTcv != null && Number.isFinite(Number(memory.finalTcv))
              ? compactCurrency(Number(memory.finalTcv))
              : "—"}
          </p>
          <p className="m-caption m-muted mt-1">Archived {formatDate(memory.archivedAt, "—")}</p>
        </header>

        <div className="space-y-3 px-4 pb-6 pt-2">
          <div className="grid grid-cols-2 gap-3">
            <Tile label="Days active" value={memory.totalDaysActive} />
            <Tile label="Gates cleared" value={memory.totalGatesCompleted} />
            <Tile label="Blockers hit" value={memory.totalBlockersEncountered} />
            <Tile
              label="Pricing"
              value={memory.pricingModel ? humanizeCode(memory.pricingModel) : null}
            />
          </div>

          {outcome === "lost" && memory.primaryLossCategory ? (
            <MobileCard>
              <CardHeader label="Why it was lost" />
              <p className="m-headline">{humanizeCode(memory.primaryLossCategory)}</p>
              {memory.lossSubcategory ? (
                <p className="m-caption m-muted mt-0.5">{humanizeCode(memory.lossSubcategory)}</p>
              ) : null}
              {memory.winBackPotential != null ? (
                <p className="m-caption m-muted mt-2">
                  Win-back potential{" "}
                  <span className="m-num text-foreground">
                    {Math.round(memory.winBackPotential)}
                  </span>
                  {memory.winBackTimeline ? ` · ${memory.winBackTimeline}` : ""}
                </p>
              ) : null}
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

          <nav aria-label="Record detail">
            <ul className="m-card overflow-hidden">
              {MEMORY_PANELS.map((panel, i) => (
                <li key={panel.id} className={i > 0 ? "border-t border-border" : undefined}>
                  <Link
                    href={`/memory/${id}/${panel.id}`}
                    className="m-tap m-press flex items-center gap-3 px-4 py-3.5"
                  >
                    <span className="m-headline min-w-0 flex-1 truncate">{panel.title}</span>
                    <ChevronRight className="m-muted h-4 w-4 shrink-0" aria-hidden="true" />
                  </Link>
                </li>
              ))}
            </ul>
          </nav>

          <TagList memory={memory} />
        </div>
      </PullToRefresh>
    </>
  );
}

function Tile({ label, value }: { label: string; value: number | string | null | undefined }) {
  return (
    <div className="m-card m-reveal p-4">
      <p className="m-label m-muted">{label}</p>
      <p className="m-title m-num mt-1.5">{value ?? "—"}</p>
    </div>
  );
}

function TagList({ memory }: { memory: DealMemory }) {
  if (!memory.tags || memory.tags.length === 0) return null;
  return (
    <div className="flex flex-wrap gap-2">
      {memory.tags.map((tag) => (
        <Badge key={tag} variant="secondary" className="m-caption">
          {tag}
        </Badge>
      ))}
    </div>
  );
}
