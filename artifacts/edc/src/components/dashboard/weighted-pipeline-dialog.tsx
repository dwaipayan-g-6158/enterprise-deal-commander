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
import { Scale, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";
import { compactCurrency, fullCurrency, HEALTH_DOT, rowMotion, type Health } from "./widgets/_shared";

interface Enrichment {
  id: string;
  score: number | null;
}

interface WeightedPipelineDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  weightedPipeline: number;
  totalTCV: number;
  reportingCurrency: string;
}

const HEALTH_LABEL: Record<Health, string> = { GREEN: "Green", YELLOW: "Yellow", RED: "Red" };

export function WeightedPipelineDialog({
  open,
  onOpenChange,
  weightedPipeline,
  totalTCV,
  reportingCurrency,
}: WeightedPipelineDialogProps) {
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

  const compact = (n: number) => compactCurrency(n, reportingCurrency);
  const full = (n: number) => fullCurrency(n, reportingCurrency);

  // Mirror the backend's exact math (raw productRevenue + servicesRevenue,
  // no FX normalization; score → winProbabilityPct → 30% fallback) so this
  // breakdown reconciles with the /analytics/vital-signs aggregate shown on
  // the tile itself, rather than silently disagreeing with it via a
  // currency-normalized figure the tile doesn't use.
  const rows = deals.map((d) => {
    const tcv = (Number(d.productRevenue) || 0) + (Number(d.servicesRevenue) || 0);
    const pct = scoreById.get(d.id) ?? d.winProbabilityPct ?? 30;
    const clampedPct = Math.max(0, Math.min(100, pct));
    return { deal: d, pct: clampedPct, contribution: tcv * (clampedPct / 100) };
  });

  const byHealth: Record<Health, number> = { GREEN: 0, YELLOW: 0, RED: 0 };
  for (const r of rows) {
    const h = (r.deal.healthStatus as Health) ?? "GREEN";
    if (h in byHealth) byHealth[h] += r.contribution;
  }
  const aggregateWeighted = byHealth.GREEN + byHealth.YELLOW + byHealth.RED || weightedPipeline || 1;
  const winRate = totalTCV > 0 ? Math.round((weightedPipeline / totalTCV) * 100) : 0;

  const topDeals = [...rows].sort((a, b) => b.contribution - a.contribution).slice(0, 6);

  const goToDeal = (id: string) => {
    onOpenChange(false);
    navigate(`/deals/${id}`);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Scale className="h-5 w-5 text-primary" />
            Weighted Pipeline
          </DialogTitle>
          <DialogDescription>
            Score-weighted forecast — each active deal's TCV discounted by its win probability.
          </DialogDescription>
        </DialogHeader>

        <div className="grid grid-cols-3 gap-4">
          <div>
            <p className="text-2xl font-bold font-mono">{compact(weightedPipeline)}</p>
            <p className="text-xs text-muted-foreground">Weighted pipeline</p>
          </div>
          <div>
            <p className="text-2xl font-bold font-mono">{compact(totalTCV)}</p>
            <p className="text-xs text-muted-foreground">Total TCV</p>
          </div>
          <div>
            <p className="text-2xl font-bold font-mono">{winRate}%</p>
            <p className="text-xs text-muted-foreground">Blended win rate</p>
          </div>
        </div>

        <div className="space-y-2">
          <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
            Weighted contribution by health
          </p>
          {isLoading ? (
            <Skeleton className="h-16 w-full rounded-md" />
          ) : (
            (["RED", "YELLOW", "GREEN"] as Health[]).map((h) => {
              const value = byHealth[h];
              const pct = Math.round((value / aggregateWeighted) * 100);
              return (
                <div key={h} className="space-y-1">
                  <div className="flex items-center justify-between text-sm">
                    <span className="flex items-center gap-2">
                      <span className={`h-2.5 w-2.5 rounded-full ${HEALTH_DOT[h]}`} />
                      {HEALTH_LABEL[h]}
                    </span>
                    <span className="font-mono text-muted-foreground">
                      {full(value)} · {pct}%
                    </span>
                  </div>
                  <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
                    <div className={HEALTH_DOT[h]} style={{ width: `${pct}%`, height: "100%" }} />
                  </div>
                </div>
              );
            })
          )}
        </div>

        <div className="space-y-2">
          <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
            Top contributing deals
          </p>
          {isLoading ? (
            <div className="space-y-2">
              <Skeleton className="h-10 w-full rounded-md" />
              <Skeleton className="h-10 w-full rounded-md" />
            </div>
          ) : (
            <ul
              className={cn(
                "h-[280px] divide-y overflow-y-auto pr-1 transition-opacity duration-150",
                isFetching && "opacity-60",
              )}
            >
              <AnimatePresence initial={false}>
                {topDeals.map(({ deal, pct, contribution }, index) => (
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
                          {deal.accountName} · {Math.round(pct)}% win prob
                        </p>
                      </div>
                      <span className="whitespace-nowrap font-mono text-sm">{compact(contribution)}</span>
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
