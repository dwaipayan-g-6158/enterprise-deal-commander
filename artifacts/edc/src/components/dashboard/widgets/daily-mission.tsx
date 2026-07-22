import { useMemo, useState } from "react";
import { useLocation } from "wouter";
import { motion, AnimatePresence, useReducedMotion } from "framer-motion";
import { useGetNextActions, useListDeals } from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Checkbox } from "@/components/ui/checkbox";
import { Progress } from "@/components/ui/progress";
import { Target } from "lucide-react";
import { cn } from "@/lib/utils";
import { buildMission, type NextActionsData } from "@/lib/mission/priority-scorer";
import { readAcked, toggleAck } from "@/lib/mission/daily-ack";
import { defaultStore } from "@/lib/storage";
import { rowMotion } from "@/components/dashboard/widgets/_shared";

// Widget — Daily Mission (PRD 4.3 Daily Mission + 4.23 Intelligent
// Recommendations). A ranked, checkable top-5 summary layer above the
// existing Next Actions widget: same source data, no duplicate fetch (the
// active-deals query below reuses the exact query key `dashboard-hero.tsx`
// already calls, so react-query dedupes it), no duplicate categorized detail
// view — that stays `NextActions`' job.
export function DailyMission() {
  const [, navigate] = useLocation();
  const reduce = !!useReducedMotion();

  const { data: nextActionsWrapper, isLoading: isLoadingNextActions } = useGetNextActions();
  const { data: dealsWrapper, isLoading: isLoadingDeals } = useListDeals({ state: "active", limit: 500 });

  const nextActionsData = nextActionsWrapper?.data as NextActionsData | undefined;
  const activeDeals = dealsWrapper?.data ?? [];

  const valueByDealId = useMemo(
    () => Object.fromEntries(activeDeals.map((d) => [d.id, d.normalizedTCV ?? d.calculatedTCV ?? 0])),
    [activeDeals],
  );

  const items = useMemo(
    () => buildMission(nextActionsData, valueByDealId, new Date()),
    [nextActionsData, valueByDealId],
  );

  const [ackedIds, setAckedIds] = useState<string[]>(() => readAcked(defaultStore, new Date()));
  const ackedSet = new Set(ackedIds);

  function handleToggle(id: string) {
    const now = new Date();
    toggleAck(defaultStore, id, now);
    setAckedIds(readAcked(defaultStore, now));
  }

  const total = items.length;
  const done = items.filter((item) => ackedSet.has(item.id)).length;
  const progress = total > 0 ? (done / total) * 100 : 0;
  const isLoading = isLoadingNextActions || isLoadingDeals;

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <Target className="h-4 w-4 text-primary" />
          Today&apos;s Mission
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {isLoading ? (
          <Skeleton className="h-48 w-full" />
        ) : total === 0 ? (
          <p className="text-sm text-muted-foreground">
            Nothing on today&apos;s mission. Enjoy the calm.
          </p>
        ) : (
          <>
            <ul className="space-y-1">
              <AnimatePresence initial={false}>
                {items.map((item, i) => {
                  const acked = ackedSet.has(item.id);
                  return (
                    <motion.li
                      key={item.id}
                      {...rowMotion(reduce, i)}
                      className="flex items-center gap-3 rounded-md px-2 py-1 -mx-2"
                    >
                      <Checkbox
                        checked={acked}
                        onCheckedChange={() => handleToggle(item.id)}
                        aria-label={`Mark "${item.label}" done for today`}
                        className="shrink-0"
                      />
                      <button
                        type="button"
                        onClick={() => navigate(item.navigateTo)}
                        className="min-w-0 flex-1 text-left transition-colors hover:text-primary cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded-sm"
                      >
                        <p
                          className={cn(
                            "truncate text-sm leading-tight",
                            acked && "text-muted-foreground line-through",
                          )}
                        >
                          {item.label}
                        </p>
                        <p className="truncate text-xs leading-tight text-muted-foreground">
                          {item.meta}
                        </p>
                      </button>
                    </motion.li>
                  );
                })}
              </AnimatePresence>
            </ul>
            <div className="space-y-1">
              <Progress value={progress} />
              <p className="text-xs text-muted-foreground">
                {done === total
                  ? "All clear for today. Nice work."
                  : `${done} of ${total} done`}
              </p>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}
