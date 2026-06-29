import { useGetPipelineSimulation } from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Activity } from "lucide-react";
import { compactCurrency } from "./_shared";

interface SimData {
  percentiles: { p10: number; p25: number; p50: number; p75: number; p90: number };
  mean: number;
  worstCase: number;
  bestCase: number;
}

// Widget 12 — Pipeline Simulation Band. The probability cone: the P25–P75 likely
// range is shaded, the P50 line marked, against the full worst→best span.
export function SimulationBand({ reportingCurrency }: { reportingCurrency: string }) {
  const { data, isLoading } = useGetPipelineSimulation();
  const sim = data?.data as SimData | undefined;
  const cur = (n: number) => compactCurrency(n, reportingCurrency);

  const span = sim ? sim.bestCase - sim.worstCase || 1 : 1;
  const at = (v: number) => (sim ? ((v - sim.worstCase) / span) * 100 : 0);

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <Activity className="h-4 w-4 text-primary" /> Simulation Outcome
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {isLoading || !sim ? (
          <Skeleton className="h-28 w-full" />
        ) : (
          <>
            <div className="pt-4">
              <div className="relative h-3 w-full rounded-full bg-muted">
                {/* Likely range P25–P75 */}
                <div
                  className="absolute top-0 h-3 rounded-full bg-primary/30"
                  style={{ left: `${at(sim.percentiles.p25)}%`, width: `${at(sim.percentiles.p75) - at(sim.percentiles.p25)}%` }}
                />
                {/* Median marker */}
                <div
                  className="absolute -top-1 h-5 w-1 -translate-x-1/2 rounded-full bg-primary"
                  style={{ left: `${at(sim.percentiles.p50)}%` }}
                  aria-label="Median (P50)"
                />
              </div>
              <div className="mt-1 flex justify-between font-mono text-[11px] text-muted-foreground">
                <span>{cur(sim.worstCase)}</span>
                <span>{cur(sim.bestCase)}</span>
              </div>
            </div>
            <div className="grid grid-cols-3 gap-2 text-center text-sm">
              <div>
                <p className="text-[10px] uppercase tracking-wider text-muted-foreground">P25</p>
                <p className="font-mono">{cur(sim.percentiles.p25)}</p>
              </div>
              <div>
                <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Median</p>
                <p className="font-mono font-bold">{cur(sim.percentiles.p50)}</p>
              </div>
              <div>
                <p className="text-[10px] uppercase tracking-wider text-muted-foreground">P75</p>
                <p className="font-mono">{cur(sim.percentiles.p75)}</p>
              </div>
            </div>
            <p className="text-xs text-muted-foreground">
              50% of simulated outcomes land between{" "}
              <span className="font-mono">{cur(sim.percentiles.p25)}</span> and{" "}
              <span className="font-mono">{cur(sim.percentiles.p75)}</span>.
            </p>
          </>
        )}
      </CardContent>
    </Card>
  );
}
