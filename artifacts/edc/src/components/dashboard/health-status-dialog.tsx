import { useState, useEffect } from "react";
import { useLocation } from "wouter";
import { useListDeals, getListDealsQueryKey } from "@workspace/api-client-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { ChevronRight } from "lucide-react";

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

  // Re-sync the active bucket whenever the dialog is (re)opened from a
  // different segment.
  useEffect(() => {
    if (open) setSelected(initialHealth);
  }, [open, initialHealth]);

  const listParams = {
    health: selected,
    state: "active" as const,
    limit: 100,
  };
  const { data, isLoading } = useListDeals(listParams, {
    query: { enabled: open, queryKey: getListDealsQueryKey(listParams) },
  });
  const deals = data?.data ?? [];

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

        <div className="max-h-[50vh] overflow-y-auto pr-1">
          {isLoading ? (
            <div className="space-y-2">
              <Skeleton className="h-12 w-full rounded-md" />
              <Skeleton className="h-12 w-full rounded-md" />
              <Skeleton className="h-12 w-full rounded-md" />
            </div>
          ) : deals.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">
              No {HEALTH_META[selected].label.toLowerCase()} deals.
            </p>
          ) : (
            <ul className="divide-y">
              {deals.map((deal) => (
                <li key={deal.id}>
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
                </li>
              ))}
            </ul>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
