import { useGetMemoryHealth } from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";

interface MemoryHealth {
  totalArchived: number;
  archiveCompletenessPct: number;
  knowledgeDensity: number;
  freshnessPct: number;
  coverage: { dimension: string; value: string; count: number }[];
  decayCount: number;
}

function MetricCard({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <Card>
      <CardContent className="p-4">
        <p className="text-xs text-muted-foreground uppercase tracking-wider mb-1">{label}</p>
        <p className="text-2xl font-bold font-mono tabular-nums">{value}</p>
        {sub && <p className="text-xs text-muted-foreground mt-1">{sub}</p>}
      </CardContent>
    </Card>
  );
}

export function HealthDashboard() {
  const { data, isLoading } = useGetMemoryHealth();
  const health = data?.data as MemoryHealth | undefined;

  if (isLoading) return <Skeleton className="h-48 w-full" />;
  if (!health || health.totalArchived === 0) {
    return <p className="text-sm text-muted-foreground">No archived deals yet — health metrics populate once deals close.</p>;
  }

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <MetricCard label="Total Archived" value={String(health.totalArchived)} />
        <MetricCard label="Archive Completeness" value={`${health.archiveCompletenessPct}%`} sub="Deals with a narrative" />
        <MetricCard label="Knowledge Density" value={String(health.knowledgeDensity)} sub="Avg. lessons per deal" />
        <MetricCard label="Freshness" value={`${health.freshnessPct}%`} sub="Updated in last 90 days" />
      </div>

      <Card>
        <CardHeader><CardTitle className="text-lg">Coverage</CardTitle></CardHeader>
        <CardContent className="space-y-2">
          {health.coverage.map((c) => (
            <div key={`${c.dimension}-${c.value}`} className="flex items-center gap-3">
              <span className="text-sm w-40 shrink-0">{c.dimension} · {c.value}</span>
              <Progress value={(c.count / health.totalArchived) * 100} className="flex-1" />
              <span className="text-xs font-mono text-muted-foreground w-10 text-right">{c.count}</span>
            </div>
          ))}
        </CardContent>
      </Card>

      {health.decayCount > 0 && (
        <div className="rounded-lg border border-amber-500/30 bg-amber-500/5 p-3 text-sm">
          <span className="font-medium">{health.decayCount}</span> archived Lost deal{health.decayCount === 1 ? "" : "s"} {health.decayCount === 1 ? "has" : "have"} no narrative or autopsy after 180+ days — consider revisiting via the Autopsy page.
        </div>
      )}
    </div>
  );
}
