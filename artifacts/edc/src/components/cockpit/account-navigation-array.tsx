import { useEffect, useRef, useState } from "react";
import { useListDeals } from "@workspace/api-client-react";
import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Plus } from "lucide-react";
import { formatCurrency } from "./use-invalidate";
import { cn } from "@/lib/utils";
import { CreateDealSheet } from "./create-deal-sheet";

const healthBorder: Record<string, string> = {
  RED: "border-l-destructive",
  YELLOW: "border-l-amber-500",
  GREEN: "border-l-emerald-500",
};

const healthText: Record<string, string> = {
  RED: "text-destructive",
  YELLOW: "text-amber-600 dark:text-amber-400",
  GREEN: "text-emerald-600 dark:text-emerald-400",
};

export function AccountNavigationArray({ activeDealId }: { activeDealId: string }) {
  const [, navigate] = useLocation();
  const [createOpen, setCreateOpen] = useState(false);
  const { data } = useListDeals({ state: "active", limit: 500 });

  const deals = [...(data?.data ?? [])].sort(
    (a, b) => (b.calculatedTCV ?? 0) - (a.calculatedTCV ?? 0),
  );

  // Center the active deal's card in the strip when it changes, so the open
  // deal is always visible even with many deals (it never re-scrolls otherwise).
  const activeRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    activeRef.current?.scrollIntoView({ inline: "center", block: "nearest" });
  }, [activeDealId, deals.length]);

  return (
    <div className="flex shrink-0 items-center gap-1 overflow-x-auto pb-1 border-b bg-muted/30 px-4">
      {deals.map((deal) => (
        <button
          key={deal.id}
          ref={deal.id === activeDealId ? activeRef : undefined}
          aria-current={deal.id === activeDealId ? "true" : undefined}
          onClick={() => navigate(`/deals/${deal.id}`)}
          className={cn(
            "flex-shrink-0 flex flex-col items-start px-3 py-2 text-left border-l-4 rounded-sm",
            "hover:bg-muted transition-colors min-w-[160px] max-w-[220px]",
            healthBorder[deal.healthStatus] ?? "border-l-border",
            deal.id === activeDealId
              ? "bg-muted ring-1 ring-primary/40"
              : "bg-background",
          )}
        >
          <span className="text-xs text-muted-foreground truncate w-full">
            {deal.accountName}
          </span>
          <span className="text-sm font-medium truncate w-full">{deal.dealName}</span>
          <span
            className={cn(
              "text-xs font-mono",
              healthText[deal.healthStatus] ?? "text-muted-foreground",
            )}
          >
            {formatCurrency(deal.calculatedTCV ?? 0, deal.dealCurrency)}
          </span>
        </button>
      ))}
      <Button
        variant="ghost"
        size="sm"
        className="flex-shrink-0 ml-1"
        onClick={() => setCreateOpen(true)}
      >
        <Plus className="h-4 w-4 mr-1" />
        New Deal
      </Button>
      <CreateDealSheet open={createOpen} onOpenChange={setCreateOpen} />
    </div>
  );
}
