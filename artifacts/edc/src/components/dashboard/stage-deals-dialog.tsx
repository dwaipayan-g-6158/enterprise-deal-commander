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
import { ChevronRight, Layers } from "lucide-react";

type Health = "GREEN" | "YELLOW" | "RED";

const HEALTH_DOT: Record<Health, string> = {
  GREEN: "bg-emerald-500",
  YELLOW: "bg-amber-500",
  RED: "bg-red-500",
};

interface StageDealsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  stage: string | null;
}

export function StageDealsDialog({
  open,
  onOpenChange,
  stage,
}: StageDealsDialogProps) {
  const [, navigate] = useLocation();

  const listParams = {
    stage: stage ?? undefined,
    state: "active" as const,
    limit: 100,
  };
  const { data, isLoading } = useListDeals(listParams, {
    query: {
      enabled: open && !!stage,
      queryKey: getListDealsQueryKey(listParams),
    },
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
          <DialogTitle className="flex items-center gap-2">
            <Layers className="h-5 w-5 text-muted-foreground" />
            {stage ?? "Stage"} stage
          </DialogTitle>
          <DialogDescription>
            Active deals currently in the {stage ?? "selected"} stage. Select one
            to open its cockpit.
          </DialogDescription>
        </DialogHeader>

        <div className="max-h-[55vh] overflow-y-auto pr-1">
          {isLoading ? (
            <div className="space-y-2">
              <Skeleton className="h-12 w-full rounded-md" />
              <Skeleton className="h-12 w-full rounded-md" />
              <Skeleton className="h-12 w-full rounded-md" />
            </div>
          ) : deals.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">
              No active deals in this stage.
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
                      className={`h-2.5 w-2.5 shrink-0 rounded-full ${
                        HEALTH_DOT[(deal.healthStatus as Health) ?? "GREEN"] ??
                        "bg-muted-foreground"
                      }`}
                      title={deal.healthStatus}
                    />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium">
                        {deal.dealName}
                      </p>
                      <p className="truncate text-xs text-muted-foreground">
                        {deal.accountName}
                        {deal.technicalLead ? ` · ${deal.technicalLead}` : ""}
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
