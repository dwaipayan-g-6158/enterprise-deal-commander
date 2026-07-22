import { useLocation } from "wouter";
import { motion, AnimatePresence, useReducedMotion } from "framer-motion";
import { keepPreviousData } from "@tanstack/react-query";
import { useListDeals, getListDealsQueryKey } from "@workspace/api-client-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { TrendingUp, ChevronRight, ArrowRight } from "lucide-react";
import { cn } from "@/lib/utils";
import { rowMotion } from "./widgets/_shared";

type Health = "GREEN" | "YELLOW" | "RED";

const HEALTH_META: Record<Health, { label: string; bar: string; dot: string }> =
  {
    GREEN: { label: "Green", bar: "bg-emerald-500", dot: "bg-emerald-500" },
    YELLOW: { label: "Yellow", bar: "bg-amber-500", dot: "bg-amber-500" },
    RED: { label: "Red", bar: "bg-red-500", dot: "bg-red-500" },
  };

interface TotalTcvDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  totalTCV: number;
  totalDeals: number;
  reportingCurrency: string;
}

export function TotalTcvDialog({
  open,
  onOpenChange,
  totalTCV,
  totalDeals,
  reportingCurrency,
}: TotalTcvDialogProps) {
  const [, navigate] = useLocation();
  const reduce = !!useReducedMotion();

  const listParams = { state: "active" as const, limit: 200 };
  const { data, isLoading, isFetching, isPlaceholderData } = useListDeals(listParams, {
    query: {
      enabled: open,
      queryKey: getListDealsQueryKey(listParams),
      placeholderData: keepPreviousData,
    },
  });
  const deals = data?.data ?? [];

  const full = (n: number) =>
    new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: reportingCurrency || "USD",
      maximumFractionDigits: 0,
    }).format(n);

  const compact = (n: number) =>
    new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: reportingCurrency || "USD",
      notation: "compact",
      maximumFractionDigits: 1,
    }).format(n);

  // Aggregate normalized (reporting-currency) TCV so values are comparable across
  // deal currencies.
  const byHealth: Record<Health, number> = { GREEN: 0, YELLOW: 0, RED: 0 };
  for (const d of deals) {
    const h = (d.healthStatus as Health) ?? "GREEN";
    if (h in byHealth) byHealth[h] += d.normalizedTCV ?? d.calculatedTCV ?? 0;
  }
  const aggregateTotal =
    byHealth.GREEN + byHealth.YELLOW + byHealth.RED || totalTCV || 1;
  const avgDeal = totalDeals > 0 ? totalTCV / totalDeals : 0;

  const topDeals = [...deals]
    .sort(
      (a, b) =>
        (b.normalizedTCV ?? b.calculatedTCV ?? 0) -
        (a.normalizedTCV ?? a.calculatedTCV ?? 0),
    )
    .slice(0, 6);

  const goToDeal = (id: string) => {
    onOpenChange(false);
    navigate(`/deals/${id}`);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <TrendingUp className="h-5 w-5 text-primary" />
            Total Contract Value
          </DialogTitle>
          <DialogDescription>
            Portfolio value in {reportingCurrency || "USD"}, broken down by
            governance health and top deals.
          </DialogDescription>
        </DialogHeader>

        <div className="grid grid-cols-3 gap-4">
          <div>
            <p className="text-2xl font-bold font-mono">{compact(totalTCV)}</p>
            <p className="text-xs text-muted-foreground">Total TCV</p>
          </div>
          <div>
            <p className="text-2xl font-bold font-mono">{totalDeals}</p>
            <p className="text-xs text-muted-foreground">Active deals</p>
          </div>
          <div>
            <p className="text-2xl font-bold font-mono">{compact(avgDeal)}</p>
            <p className="text-xs text-muted-foreground">Avg deal size</p>
          </div>
        </div>

        <div className="space-y-2">
          <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
            TCV by health
          </p>
          {isLoading && !isPlaceholderData ? (
            <Skeleton className="h-16 w-full rounded-md" />
          ) : (
            (["RED", "YELLOW", "GREEN"] as Health[]).map((h) => {
              const value = byHealth[h];
              const pct = Math.round((value / aggregateTotal) * 100);
              return (
                <div key={h} className="space-y-1">
                  <div className="flex items-center justify-between text-sm">
                    <span className="flex items-center gap-2">
                      <span
                        className={`h-2.5 w-2.5 rounded-full ${HEALTH_META[h].dot}`}
                      />
                      {HEALTH_META[h].label}
                    </span>
                    <span className="font-mono text-muted-foreground">
                      {full(value)} · {pct}%
                    </span>
                  </div>
                  <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
                    <div
                      className={HEALTH_META[h].bar}
                      style={{ width: `${pct}%`, height: "100%" }}
                    />
                  </div>
                </div>
              );
            })
          )}
        </div>

        <div className="space-y-2">
          <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
            Top deals by value
          </p>
          {isLoading && !isPlaceholderData ? (
            <div className="space-y-2">
              <Skeleton className="h-10 w-full rounded-md" />
              <Skeleton className="h-10 w-full rounded-md" />
            </div>
          ) : (
            // Fixed height (not max-height): the box stays the same size
            // whether the top-6 list is short or full, and while a
            // keep-previous refetch is settling.
            <ul
              className={cn(
                "h-[280px] divide-y overflow-y-auto pr-1 transition-opacity duration-150",
                isFetching && isPlaceholderData && "opacity-60",
              )}
            >
              <AnimatePresence initial={false}>
                {topDeals.map((deal, index) => (
                  <motion.li key={deal.id} {...rowMotion(reduce, index)}>
                    <button
                      type="button"
                      onClick={() => goToDeal(deal.id)}
                      aria-label={`Open deal ${deal.dealName}`}
                      className="flex w-full items-center gap-3 px-2 -mx-2 py-2 text-left rounded-md transition-colors hover:bg-muted/40 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    >
                      <span
                        className={`h-2.5 w-2.5 shrink-0 rounded-full ${
                          HEALTH_META[(deal.healthStatus as Health) ?? "GREEN"]
                            ?.dot ?? "bg-muted-foreground"
                        }`}
                      />
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium">
                          {deal.dealName}
                        </p>
                        <p className="truncate text-xs text-muted-foreground">
                          {deal.accountName} · {deal.salesStage}
                        </p>
                      </div>
                      <span className="whitespace-nowrap font-mono text-sm">
                        {compact(deal.normalizedTCV ?? deal.calculatedTCV ?? 0)}
                      </span>
                      <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
                    </button>
                  </motion.li>
                ))}
              </AnimatePresence>
            </ul>
          )}
        </div>

        <button
          type="button"
          onClick={() => {
            onOpenChange(false);
            navigate("/portfolio");
          }}
          className="flex items-center justify-center gap-1 text-sm text-muted-foreground hover:text-foreground cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded-sm"
        >
          View full portfolio analysis
          <ArrowRight className="h-3.5 w-3.5" />
        </button>
      </DialogContent>
    </Dialog>
  );
}
