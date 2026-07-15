import { useState } from "react";
import { ChevronDown, ChevronRight, PackageX } from "lucide-react";
import { useGetProductGaps } from "@workspace/api-client-react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { fullCurrency } from "@/components/dashboard/widgets/_shared";

// "What to build/fix" register: product gaps clustered from loss autopsies +
// unresolved technical blockers, ranked by TCV-at-risk. Computed on read.
export function ProductGapsPanel() {
  const { data, isLoading, isError } = useGetProductGaps();
  const clusters = data?.data?.clusters ?? [];
  const [open, setOpen] = useState<string | null>(null);

  if (isLoading) {
    return (
      <div className="space-y-3">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-14 w-full" />
        ))}
      </div>
    );
  }
  if (isError) {
    return <p className="text-sm text-muted-foreground">Could not load product gaps.</p>;
  }
  if (clusters.length === 0) {
    return (
      <Card className="flex flex-col items-center gap-2 py-12 text-center text-muted-foreground">
        <PackageX className="h-8 w-8" />
        <p className="text-sm">No product gaps recorded yet.</p>
        <p className="text-xs">Gaps captured in loss autopsies and unresolved technical blockers cluster here.</p>
      </Card>
    );
  }

  return (
    <div className="space-y-2">
      <p className="text-sm text-muted-foreground">
        {clusters.length} gap cluster{clusters.length === 1 ? "" : "s"}, ranked by lost TCV at risk.
      </p>
      {clusters.map((c) => {
        const expanded = open === c.label;
        return (
          <Card key={c.label} className="overflow-hidden">
            <button
              type="button"
              onClick={() => setOpen(expanded ? null : c.label)}
              className="flex w-full items-center gap-3 px-4 py-3 text-left hover:bg-muted/40"
            >
              {expanded ? <ChevronDown className="h-4 w-4 shrink-0" /> : <ChevronRight className="h-4 w-4 shrink-0" />}
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className="font-medium">{c.label}</span>
                  {c.productName && <Badge variant="secondary">{c.productName}</Badge>}
                </div>
                <p className="text-xs text-muted-foreground">
                  {c.dealCount} deal{c.dealCount === 1 ? "" : "s"}
                  {c.openBlockerCount > 0 && ` · ${c.openBlockerCount} open blocker${c.openBlockerCount === 1 ? "" : "s"}`}
                </p>
              </div>
              <span className="shrink-0 font-mono text-sm font-semibold tabular-nums text-red-600 dark:text-red-400">
                {fullCurrency(c.lostTcv)}
              </span>
            </button>
            {expanded && (
              <ul className="border-t bg-muted/20 px-4 py-2">
                {c.deals.map((d, i) => (
                  <li key={`${d.dealId}-${d.source}-${i}`} className="flex items-center justify-between py-1 text-sm">
                    <span className="inline-flex items-center gap-2">
                      <span
                        className={cn(
                          "rounded-sm px-1 py-0.5 text-[10px] uppercase tracking-wide",
                          d.source === "autopsy"
                            ? "bg-rose-500/15 text-rose-700 dark:text-rose-400"
                            : "bg-amber-500/15 text-amber-700 dark:text-amber-400",
                        )}
                      >
                        {d.source}
                      </span>
                      {d.dealName}
                    </span>
                    {d.tcv != null && <span className="font-mono text-xs tabular-nums text-muted-foreground">{fullCurrency(d.tcv)}</span>}
                  </li>
                ))}
              </ul>
            )}
          </Card>
        );
      })}
    </div>
  );
}
