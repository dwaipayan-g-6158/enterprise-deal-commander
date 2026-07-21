import { Link } from "wouter";
import { RefreshCw, ArrowRight } from "lucide-react";
import { useListRevivalCandidates } from "@workspace/api-client-react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { fullCurrency } from "@/components/dashboard/widgets/_shared";

// Closed-Lost deals worth re-engaging (Vivun Deal Revival). Deterministic,
// computed on read from deal_memory win-back signals + cool-off thresholds.
export function RevivalTab() {
  const { data, isLoading, isError } = useListRevivalCandidates();
  const candidates = data?.data ?? [];

  if (isLoading) {
    return (
      <div className="space-y-3">
        {Array.from({ length: 3 }).map((_, i) => (
          <Skeleton key={i} className="h-24 w-full" />
        ))}
      </div>
    );
  }

  if (isError) {
    return <p className="text-sm text-muted-foreground">Something went wrong loading revival candidates. Try refreshing the page.</p>;
  }

  if (candidates.length === 0) {
    return (
      <Card className="flex flex-col items-center gap-2 py-12 text-center text-muted-foreground">
        <RefreshCw className="h-8 w-8" />
        <p className="text-sm">No revival candidates right now.</p>
        <p className="text-xs">Lost deals surface here once they pass the cool-off with enough win-back potential.</p>
      </Card>
    );
  }

  return (
    <div className="space-y-3">
      <p className="text-sm text-muted-foreground">
        {candidates.length} Closed-Lost deal{candidates.length === 1 ? "" : "s"} worth re-engaging.
      </p>
      {candidates.map((c) => (
        <Card key={c.memoryId} className="p-4">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <span className="font-semibold">{c.accountName}</span>
                {c.winBackPotential != null && (
                  <Badge className="bg-emerald-500/15 text-emerald-700 dark:text-emerald-400 hover:bg-emerald-500/25">
                    Win-back {c.winBackPotential}/5
                  </Badge>
                )}
              </div>
              <p className="text-sm text-muted-foreground">{c.dealName}</p>
              <div className="mt-2 flex flex-wrap gap-1.5">
                {c.reasons.map((r, i) => (
                  <span key={i} className="rounded-sm bg-muted px-1.5 py-0.5 text-[11px] text-muted-foreground">
                    {r}
                  </span>
                ))}
              </div>
            </div>
            <div className="shrink-0 text-right">
              {c.finalTcv != null && <p className="font-mono font-semibold tabular-nums">{fullCurrency(c.finalTcv)}</p>}
              <Button asChild size="sm" variant="outline" className="mt-2 gap-1.5">
                <Link href={`/memory/${c.memoryId}`}>
                  Open <ArrowRight className="h-3.5 w-3.5" />
                </Link>
              </Button>
            </div>
          </div>
        </Card>
      ))}
    </div>
  );
}
