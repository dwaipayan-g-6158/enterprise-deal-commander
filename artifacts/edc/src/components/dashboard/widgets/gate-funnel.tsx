import { useGetGateFunnel } from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Layers3, AlertTriangle } from "lucide-react";

interface Gate {
  gateCode: string;
  label: string;
  gateGroup: number;
  completedCount: number;
  totalCount: number;
  pct: number;
}
interface GateFunnelData {
  gates: Gate[];
  bottleneck: Gate | null;
}

function barColor(pct: number): string {
  if (pct >= 67) return "bg-emerald-500";
  if (pct >= 34) return "bg-amber-500";
  return "bg-red-500";
}

// Widget 15 — Gate Completion Funnel. Completion % per gate across all deals,
// exposing systemic technical bottlenecks rather than per-deal issues.
export function GateFunnel() {
  const { data, isLoading } = useGetGateFunnel();
  const d = data?.data as GateFunnelData | undefined;
  const gates = (d?.gates ?? []).filter((g) => g.totalCount > 0);

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <Layers3 className="h-4 w-4 text-primary" /> Gate Completion
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {isLoading ? (
          <Skeleton className="h-48 w-full" />
        ) : gates.length === 0 ? (
          <p className="text-sm text-muted-foreground">Gates light up as deals progress. None to show yet.</p>
        ) : (
          <>
            <div className="space-y-2">
              {gates.map((g) => (
                <div key={g.gateCode}>
                  <div className="flex items-center justify-between text-xs">
                    <span className="truncate text-muted-foreground" title={g.label}>
                      <span className="font-mono text-[10px] text-muted-foreground/70">G{g.gateGroup}</span> {g.label}
                    </span>
                    <span className="font-mono tabular-nums">{g.pct}%</span>
                  </div>
                  <div className="mt-1 h-2 w-full overflow-hidden rounded-full bg-muted">
                    <div className={`h-full rounded-full ${barColor(g.pct)}`} style={{ width: `${g.pct}%` }} />
                  </div>
                </div>
              ))}
            </div>
            {d?.bottleneck && d.bottleneck.pct < 50 && (
              <div className="flex items-start gap-2 rounded-md border border-amber-500/30 bg-amber-500/5 p-2 text-xs">
                <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber-500" />
                <span className="text-muted-foreground">
                  Bottleneck: <span className="font-medium text-foreground">{d.bottleneck.label}</span> — only{" "}
                  {d.bottleneck.pct}% of deals have cleared this gate.
                </span>
              </div>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}
