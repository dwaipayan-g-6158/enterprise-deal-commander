import { useLocation } from "wouter";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Clock, ChevronRight } from "lucide-react";

interface StaleDeal {
  dealId: string;
  dealName: string;
  daysInStage: number;
}

interface StaleDealsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  staleDeals: StaleDeal[];
}

export function StaleDealsDialog({
  open,
  onOpenChange,
  staleDeals,
}: StaleDealsDialogProps) {
  const [, navigate] = useLocation();

  const goToDeal = (id: string) => {
    onOpenChange(false);
    navigate(`/deals/${id}`);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Clock className="h-5 w-5 text-amber-500" />
            Stale Deals
          </DialogTitle>
          <DialogDescription>
            Deals sitting in their current stage beyond the velocity threshold,
            longest-stalled first.
          </DialogDescription>
        </DialogHeader>

        <div className="max-h-[55vh] overflow-y-auto pr-1">
          {staleDeals.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">
              No stale deals. Pipeline velocity is healthy.
            </p>
          ) : (
            <ul className="divide-y">
              {staleDeals.map((deal) => (
                <li key={deal.dealId}>
                  <button
                    type="button"
                    onClick={() => goToDeal(deal.dealId)}
                    aria-label={`Open deal ${deal.dealName}`}
                    className="flex w-full items-center gap-3 px-2 -mx-2 py-3 text-left rounded-md transition-colors hover:bg-muted/40 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  >
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium">
                        {deal.dealName}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {deal.daysInStage} days in current stage
                      </p>
                    </div>
                    <Badge
                      variant="secondary"
                      className="shrink-0 bg-amber-500/15 text-amber-600 hover:bg-amber-500/20"
                    >
                      {deal.daysInStage}d
                    </Badge>
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
