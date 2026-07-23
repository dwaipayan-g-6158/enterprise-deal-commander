import { useMemo, useState } from "react";
import { useLocation } from "wouter";
import { motion, AnimatePresence, useReducedMotion } from "framer-motion";
import { useGetNextActions, useListDeals } from "@workspace/api-client-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Checkbox } from "@/components/ui/checkbox";
import { Progress } from "@/components/ui/progress";
import { Target } from "lucide-react";
import { cn } from "@/lib/utils";
import { buildMission, type NextActionsData } from "@/lib/mission/priority-scorer";
import { readAcked, toggleAck } from "@/lib/mission/daily-ack";
import { defaultStore } from "@/lib/storage";
import { rowMotion } from "@/components/dashboard/widgets/_shared";

// Daily Bar segment — Today's Mission (PRD 4.3 + 4.23). Same data/ranking/ack
// logic as the former standalone `DailyMission` card; only the presentation
// moved into a compact bar trigger + popover. `present` always true — an
// empty mission still shows ("Enjoy the calm.") rather than disappearing, so
// the segment stays a stable anchor in the bar.
export function MissionSegment() {
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
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          className="inline-flex items-center gap-2 rounded-md px-2.5 py-2 min-h-[44px] text-sm hover:bg-muted/60 transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          aria-label={`Today's Mission: ${done} of ${total} done`}
        >
          <Target className="h-4 w-4 text-primary shrink-0" />
          <span className="font-medium">Mission</span>
          {!isLoading && total > 0 && (
            <>
              <span className="font-mono text-xs text-muted-foreground tabular-nums">
                {done}/{total}
              </span>
              <Progress value={progress} className="h-1.5 w-9" />
            </>
          )}
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-80">
        <p className="text-sm font-medium mb-3">Today&apos;s Mission</p>
        {isLoading ? (
          <p className="text-sm text-muted-foreground">Loading…</p>
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
                      className="flex items-start gap-3 rounded-md px-2 py-1.5 -mx-2"
                    >
                      <Checkbox
                        checked={acked}
                        onCheckedChange={() => handleToggle(item.id)}
                        aria-label={`Mark "${item.label}" done for today`}
                        className="mt-0.5 shrink-0"
                      />
                      <button
                        type="button"
                        onClick={() => navigate(item.navigateTo)}
                        className="min-w-0 flex-1 space-y-0.5 text-left transition-colors hover:text-primary cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded-sm"
                      >
                        <p
                          className={cn(
                            "text-sm leading-snug break-words",
                            acked && "text-muted-foreground line-through",
                          )}
                        >
                          {item.label}
                        </p>
                        <p className="text-xs leading-snug break-words text-muted-foreground">
                          {item.meta}
                        </p>
                      </button>
                    </motion.li>
                  );
                })}
              </AnimatePresence>
            </ul>
            <div className="space-y-1 mt-3">
              <Progress value={progress} />
              <p className="text-xs text-muted-foreground">
                {done === total
                  ? "All clear for today. Nice work."
                  : `${done} of ${total} done`}
              </p>
            </div>
          </>
        )}
      </PopoverContent>
    </Popover>
  );
}
