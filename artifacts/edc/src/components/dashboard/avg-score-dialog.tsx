import { useLocation } from "wouter";
import { motion, AnimatePresence, useReducedMotion } from "framer-motion";
import { keepPreviousData } from "@tanstack/react-query";
import {
  useListDeals,
  useGetRosterEnrichment,
  getListDealsQueryKey,
  getGetRosterEnrichmentQueryKey,
} from "@workspace/api-client-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { Gauge, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";
import { HEALTH_DOT, rowMotion, type Health } from "./widgets/_shared";

interface Enrichment {
  id: string;
  score: number | null;
}

interface AvgScoreDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  avgScore: number | null;
}

const BANDS = [
  { key: "strong", label: "Strong (70+)", min: 70, max: 100, dot: "bg-emerald-500" },
  { key: "moderate", label: "Moderate (40–69)", min: 40, max: 69, dot: "bg-amber-500" },
  { key: "weak", label: "Weak (0–39)", min: 0, max: 39, dot: "bg-red-500" },
] as const;

// Matches the score-color convention already used in components/roster/cells.tsx.
function scoreTextColor(score: number): string {
  if (score >= 70) return "text-emerald-600 dark:text-emerald-400";
  if (score >= 40) return "text-amber-600 dark:text-amber-400";
  return "text-red-600 dark:text-red-400";
}

export function AvgScoreDialog({ open, onOpenChange, avgScore }: AvgScoreDialogProps) {
  const [, navigate] = useLocation();
  const reduce = !!useReducedMotion();

  const listParams = { state: "active" as const, limit: 200 };
  const {
    data: dealsWrapper,
    isLoading: dealsLoading,
    isFetching: dealsFetching,
    isPlaceholderData: dealsPlaceholder,
  } = useListDeals(listParams, {
    query: {
      enabled: open,
      queryKey: getListDealsQueryKey(listParams),
      placeholderData: keepPreviousData,
    },
  });
  const {
    data: enrichWrapper,
    isLoading: enrichLoading,
    isFetching: enrichFetching,
    isPlaceholderData: enrichPlaceholder,
  } = useGetRosterEnrichment({
    query: {
      enabled: open,
      queryKey: getGetRosterEnrichmentQueryKey(),
      placeholderData: keepPreviousData,
    },
  });
  const deals = dealsWrapper?.data ?? [];
  const enrichRows = (enrichWrapper?.data as { deals?: Enrichment[] } | undefined)?.deals ?? [];
  const scoreById = new Map(enrichRows.map((e) => [e.id, e.score]));
  const isPlaceholderData = dealsPlaceholder || enrichPlaceholder;
  const isLoading = (dealsLoading || enrichLoading) && !isPlaceholderData;
  const isFetching = (dealsFetching || enrichFetching) && isPlaceholderData;

  const scored: { deal: (typeof deals)[number]; score: number }[] = [];
  for (const d of deals) {
    const s = scoreById.get(d.id);
    if (s != null) scored.push({ deal: d, score: s });
  }
  const unscoredCount = deals.length - scored.length;

  const bandCounts: Record<string, number> = { strong: 0, moderate: 0, weak: 0 };
  for (const r of scored) {
    const band = BANDS.find((b) => r.score >= b.min && r.score <= b.max);
    if (band) bandCounts[band.key]++;
  }

  const lowest = [...scored].sort((a, b) => a.score - b.score).slice(0, 6);

  const goToDeal = (id: string) => {
    onOpenChange(false);
    navigate(`/deals/${id}`);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Gauge className="h-5 w-5 text-primary" />
            Avg Score
          </DialogTitle>
          <DialogDescription>Predicted close probability across active deals.</DialogDescription>
        </DialogHeader>

        <div className="grid grid-cols-3 gap-4">
          <div>
            <p className="text-2xl font-bold font-mono">{avgScore ?? "—"}</p>
            <p className="text-xs text-muted-foreground">Avg score</p>
          </div>
          <div>
            <p className="text-2xl font-bold font-mono">{scored.length}</p>
            <p className="text-xs text-muted-foreground">Scored deals</p>
          </div>
          <div>
            <p className="text-2xl font-bold font-mono">{unscoredCount}</p>
            <p className="text-xs text-muted-foreground">Not yet scored</p>
          </div>
        </div>

        <div className="space-y-2">
          <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
            Score distribution
          </p>
          {isLoading ? (
            <Skeleton className="h-16 w-full rounded-md" />
          ) : (
            BANDS.map((b) => {
              const count = bandCounts[b.key];
              const pct = scored.length ? Math.round((count / scored.length) * 100) : 0;
              return (
                <div key={b.key} className="space-y-1">
                  <div className="flex items-center justify-between text-sm">
                    <span className="flex items-center gap-2">
                      <span className={`h-2.5 w-2.5 rounded-full ${b.dot}`} />
                      {b.label}
                    </span>
                    <span className="font-mono text-muted-foreground">
                      {count} deal{count === 1 ? "" : "s"} · {pct}%
                    </span>
                  </div>
                  <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
                    <div className={b.dot} style={{ width: `${pct}%`, height: "100%" }} />
                  </div>
                </div>
              );
            })
          )}
        </div>

        <div className="space-y-2">
          <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
            Deals to watch (lowest scoring)
          </p>
          {isLoading ? (
            <div className="space-y-2">
              <Skeleton className="h-10 w-full rounded-md" />
              <Skeleton className="h-10 w-full rounded-md" />
            </div>
          ) : lowest.length === 0 ? (
            <p className="text-sm text-muted-foreground">No scored deals yet.</p>
          ) : (
            <ul
              className={cn(
                "h-[280px] divide-y overflow-y-auto pr-1 transition-opacity duration-150",
                isFetching && "opacity-60",
              )}
            >
              <AnimatePresence initial={false}>
                {lowest.map(({ deal, score }, index) => (
                  <motion.li key={deal.id} {...rowMotion(reduce, index)}>
                    <button
                      type="button"
                      onClick={() => goToDeal(deal.id)}
                      aria-label={`Open deal ${deal.dealName}`}
                      className="flex w-full items-center gap-3 px-2 -mx-2 py-2 text-left rounded-md transition-colors hover:bg-muted/40 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    >
                      <span
                        className={`h-2.5 w-2.5 shrink-0 rounded-full ${
                          HEALTH_DOT[(deal.healthStatus as Health) ?? "GREEN"] ?? "bg-muted-foreground"
                        }`}
                      />
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium">{deal.dealName}</p>
                        <p className="truncate text-xs text-muted-foreground">
                          {deal.accountName} · {deal.salesStage}
                        </p>
                      </div>
                      <span
                        className={`whitespace-nowrap font-mono text-sm font-bold ${scoreTextColor(score)}`}
                      >
                        {score}
                      </span>
                      <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
                    </button>
                  </motion.li>
                ))}
              </AnimatePresence>
            </ul>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
