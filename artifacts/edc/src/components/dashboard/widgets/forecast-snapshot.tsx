import { useGetPipelineSimulation } from "@workspace/api-client-react";
import { useLocation } from "wouter";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { TrendingUp, ArrowRight, RefreshCw } from "lucide-react";
import { compactCurrency } from "./_shared";

interface SimData {
  percentiles: { p10: number; p25: number; p50: number; p75: number; p90: number };
  weightedPipeline: number;
  totalDeals: number;
}

// Widget 6 — Predictive Forecast Snapshot. Compact bear / median / bull range
// from the Monte Carlo run; deep-links to the full distribution on Analytics.
export function ForecastSnapshot({ reportingCurrency }: { reportingCurrency: string }) {
  const { data, isLoading, isFetching, refetch } = useGetPipelineSimulation();
  const [, navigate] = useLocation();
  const sim = data?.data as SimData | undefined;
  const cur = (n: number) => compactCurrency(n, reportingCurrency);

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <TrendingUp className="h-4 w-4 text-primary" />
          Forecast
        </CardTitle>
        <button
          type="button"
          onClick={() => refetch()}
          disabled={isFetching}
          aria-label="Re-run simulation"
          className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground cursor-pointer disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded-sm"
        >
          <RefreshCw className={`h-3.5 w-3.5 ${isFetching ? "animate-spin" : ""}`} />
          Re-run
        </button>
      </CardHeader>
      <CardContent className="space-y-4">
        {isLoading || !sim ? (
          <Skeleton className="h-28 w-full" />
        ) : (
          <>
            <div className="grid grid-cols-3 gap-2 text-center">
              {[
                { label: "Bear", value: sim.percentiles.p10 },
                { label: "Median", value: sim.percentiles.p50, emphasis: true },
                { label: "Bull", value: sim.percentiles.p90 },
              ].map((c) => (
                <div key={c.label} className="rounded-md border p-2">
                  <p className="text-[10px] uppercase tracking-wider text-muted-foreground">{c.label}</p>
                  <p className={`font-mono ${c.emphasis ? "text-lg font-bold text-foreground" : "text-sm font-semibold"}`}>
                    {cur(c.value)}
                  </p>
                </div>
              ))}
            </div>
            {/* P10 → P90 range bar with the median marker */}
            <div className="relative h-1.5 w-full rounded-full bg-gradient-to-r from-amber-500/40 via-primary/40 to-emerald-500/40">
              <div
                className="absolute top-1/2 h-3 w-3 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-background bg-primary"
                style={{
                  left: `${Math.min(100, Math.max(0, ((sim.percentiles.p50 - sim.percentiles.p10) / (sim.percentiles.p90 - sim.percentiles.p10 || 1)) * 100))}%`,
                }}
              />
            </div>
            <p className="text-xs text-muted-foreground">
              Traditional weighted: <span className="font-mono">{cur(sim.weightedPipeline)}</span> · {sim.totalDeals} active deals
            </p>
            <button
              type="button"
              onClick={() => navigate("/analytics")}
              className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded-sm"
            >
              View full distribution
              <ArrowRight className="h-3.5 w-3.5" />
            </button>
          </>
        )}
      </CardContent>
    </Card>
  );
}
