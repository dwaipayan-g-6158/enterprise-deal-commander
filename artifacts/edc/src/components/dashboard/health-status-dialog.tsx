import { useCallback, useEffect, useRef, useState } from "react";
import { useLocation } from "wouter";
import { motion, AnimatePresence, useReducedMotion } from "framer-motion";
import { keepPreviousData, useQueryClient } from "@tanstack/react-query";
import { useListDeals, getListDealsQueryKey, getListDealsQueryOptions } from "@workspace/api-client-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";
import { rowMotion } from "./widgets/_shared";

type Health = "GREEN" | "YELLOW" | "RED";

const HEALTH_META: Record<
  Health,
  { label: string; dot: string; activeBtn: string }
> = {
  GREEN: {
    label: "Green",
    dot: "bg-emerald-500",
    activeBtn: "border-emerald-500 bg-emerald-500/10 text-emerald-600",
  },
  YELLOW: {
    label: "Yellow",
    dot: "bg-amber-500",
    activeBtn: "border-amber-500 bg-amber-500/10 text-amber-600",
  },
  RED: {
    label: "Red",
    dot: "bg-red-500",
    activeBtn: "border-red-500 bg-red-500/10 text-red-600",
  },
};

const ORDER: Health[] = ["RED", "YELLOW", "GREEN"];

// Dialog-box height is computed from `deals.length`, not measured off the
// swapping content — see comment above `targetHeight` for why. These are
// tuned to this row's actual rendered markup (py-2.5 + two truncated text
// lines); ROW_PX_DEFAULT is only a seed for the very first row height read
// via `measureRowRef`, which self-corrects to the true value immediately.
const ROW_PX_DEFAULT = 58;
const EMPTY_PX = 84;
const SKELETON_PX = 168;
const MIN_PX = 100;
const MAX_PX_CAP = 420;

interface HealthStatusDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  counts: { GREEN: number; YELLOW: number; RED: number };
  initialHealth?: Health;
}

export function HealthStatusDialog({
  open,
  onOpenChange,
  counts,
  initialHealth = "RED",
}: HealthStatusDialogProps) {
  const [, navigate] = useLocation();
  const [selected, setSelected] = useState<Health>(initialHealth);
  const reduce = !!useReducedMotion();
  const queryClient = useQueryClient();

  // Row height is a true constant here (both text lines are `truncate`d, so
  // no wrap variability) — measured once off a real mounted row rather than
  // hardcoded, so it can't silently drift from the actual CSS.
  const rowHeightRef = useRef(ROW_PX_DEFAULT);
  const measureRowRef = useCallback((node: HTMLLIElement | null) => {
    if (node && rowHeightRef.current === ROW_PX_DEFAULT) {
      rowHeightRef.current = Math.ceil(node.getBoundingClientRect().height) || ROW_PX_DEFAULT;
    }
  }, []);

  // DialogContent has no max-height of its own — it's centered and grows
  // from the middle, so the resize cap must stay viewport-relative or a big
  // band could push the dialog off-screen on a short viewport.
  const vhRef = useRef(0);
  useEffect(() => {
    if (open) vhRef.current = window.innerHeight;
  }, [open]);

  // Re-sync the active bucket whenever the dialog is (re)opened from a
  // different segment.
  useEffect(() => {
    if (open) setSelected(initialHealth);
  }, [open, initialHealth]);

  // Warm all three bands as soon as the dialog opens, so switching between
  // them is an instant cache read instead of a fresh fetch — the biggest
  // single contributor to the "flash to skeleton on every click" feel.
  useEffect(() => {
    if (!open) return;
    for (const h of ORDER) {
      queryClient.prefetchQuery(
        getListDealsQueryOptions({ health: h, state: "active", limit: 100 }),
      );
    }
  }, [open, queryClient]);

  const listParams = {
    health: selected,
    state: "active" as const,
    limit: 100,
  };
  const { data, isLoading, isFetching, isPlaceholderData } = useListDeals(listParams, {
    query: {
      enabled: open,
      queryKey: getListDealsQueryKey(listParams),
      // Keep showing the previously-selected band's deals while the newly
      // selected one fetches, instead of collapsing to skeletons — the
      // prefetch above means this mostly just covers the brief pre-warm gap.
      placeholderData: keepPreviousData,
    },
  });
  const deals = data?.data ?? [];

  // Computed from state, never from measuring the swapping content: the
  // inner AnimatePresence keeps old-band rows mounted mid-exit, so a
  // DOM-measurement approach would read stale content for ~120ms after
  // `selected`/`deals` have already flipped to the new band.
  const maxPx = Math.min(MAX_PX_CAP, Math.round((vhRef.current || window.innerHeight) * 0.5));
  const rawHeight =
    isLoading && !isPlaceholderData
      ? SKELETON_PX
      : deals.length === 0
        ? EMPTY_PX
        : deals.length * rowHeightRef.current;
  const targetHeight = Math.max(MIN_PX, Math.min(maxPx, rawHeight));

  const goToDeal = (id: string) => {
    onOpenChange(false);
    navigate(`/deals/${id}`);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle>Health Status</DialogTitle>
          <DialogDescription>
            Deals grouped by governance health. Select a band to inspect the
            deals it contains.
          </DialogDescription>
        </DialogHeader>

        <div className="flex gap-2">
          {ORDER.map((h) => {
            const meta = HEALTH_META[h];
            const isActive = selected === h;
            return (
              <button
                key={h}
                type="button"
                onClick={() => setSelected(h)}
                aria-pressed={isActive}
                className={`flex flex-1 items-center justify-center gap-2 rounded-md border px-3 py-2 text-sm font-medium cursor-pointer transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
                  isActive
                    ? meta.activeBtn
                    : "border-border text-muted-foreground hover:border-primary/50"
                }`}
              >
                <span className={`h-2.5 w-2.5 rounded-full ${meta.dot}`} />
                {meta.label}
                <span className="font-mono">{counts[h] ?? 0}</span>
              </button>
            );
          })}
        </div>

        {/* Outer: the only element animating height — a real height tween,
            not a `layout`/transform trick, so it can't distort row text.
            Box height tracks the selected band's deal count (small for
            RED's 0, tall for YELLOW's 13, small again for GREEN's 1),
            clamped to [MIN_PX, viewport-relative max]. `initial={false}` so
            opening the dialog doesn't grow from 0 and fight Radix's own
            zoom-in entrance animation. */}
        <motion.div
          initial={false}
          animate={{ height: targetHeight }}
          transition={{ duration: reduce ? 0 : 0.2, ease: [0.22, 1, 0.36, 1] }}
          style={{ overflow: "hidden" }}
        >
          {/* Inner: owns the scroll region + the opacity dim while
              re-fetching. `relative` is required by AnimatePresence
              mode="popLayout" below. */}
          <div
            className={cn(
              "relative h-full overflow-y-auto pr-1 transition-opacity duration-150",
              isFetching && isPlaceholderData && "opacity-60",
            )}
          >
            {isLoading && !isPlaceholderData ? (
              <div className="space-y-2">
                <Skeleton className="h-12 w-full rounded-md" />
                <Skeleton className="h-12 w-full rounded-md" />
                <Skeleton className="h-12 w-full rounded-md" />
              </div>
            ) : (
              // popLayout (not "wait"): pulls the exiting band's content out
              // of flow immediately instead of holding it in place for its
              // full exit duration, so the box height above tracks the
              // *incoming* band's content from the start of the transition
              // rather than leading it (growing into empty space) or
              // trailing it (guillotining the outgoing list on shrink).
              <AnimatePresence mode="popLayout" initial={false}>
                <motion.div
                  key={selected}
                  initial={false}
                  exit={{ opacity: 0 }}
                  transition={{ duration: reduce ? 0 : 0.12, ease: "easeOut" }}
                >
                  {deals.length === 0 ? (
                    <p className="py-8 text-center text-sm text-muted-foreground">
                      Nothing in the {HEALTH_META[selected].label.toLowerCase()} bucket right now.
                    </p>
                  ) : (
                    <ul className="divide-y">
                      {deals.map((deal, index) => (
                        <motion.li
                          key={deal.id}
                          ref={index === 0 ? measureRowRef : undefined}
                          {...rowMotion(reduce, index)}
                        >
                          <button
                            type="button"
                            onClick={() => goToDeal(deal.id)}
                            aria-label={`Open deal ${deal.dealName}`}
                            className="flex w-full items-center gap-3 px-2 -mx-2 py-2.5 text-left rounded-md transition-colors hover:bg-muted/40 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                          >
                            <span
                              className={`h-2.5 w-2.5 shrink-0 rounded-full ${HEALTH_META[selected].dot}`}
                            />
                            <div className="min-w-0 flex-1">
                              <p className="truncate text-sm font-medium">
                                {deal.dealName}
                              </p>
                              <p className="truncate text-xs text-muted-foreground">
                                {deal.accountName} · {deal.salesStage}
                              </p>
                            </div>
                            <span className="hidden whitespace-nowrap font-mono text-sm text-muted-foreground sm:block">
                              {new Intl.NumberFormat("en-US", {
                                style: "currency",
                                currency: deal.dealCurrency || "USD",
                                notation: "compact",
                                maximumFractionDigits: 1,
                              }).format(deal.calculatedTCV ?? 0)}
                            </span>
                            <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
                          </button>
                        </motion.li>
                      ))}
                    </ul>
                  )}
                </motion.div>
              </AnimatePresence>
            )}
          </div>
        </motion.div>
      </DialogContent>
    </Dialog>
  );
}
