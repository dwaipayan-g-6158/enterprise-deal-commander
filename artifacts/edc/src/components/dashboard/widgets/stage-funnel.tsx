import { useGetPipelineAnalytics } from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { compactCurrency } from "./_shared";

interface PipelineData {
  totalTcv: number;
  activeDeals: number;
  byStage: { stage: string; count: number; tcv: number }[];
}

interface Props {
  reportingCurrency: string;
  onSelectStage: (stage: string) => void;
}

// Widget 4 — Stage Pipeline Funnel. Horizontal bars sized by TCV reveal where
// deals (and dollars) accumulate.
export function StageFunnel({ reportingCurrency, onSelectStage }: Props) {
  const { data, isLoading } = useGetPipelineAnalytics();
  const pipe = data?.data as PipelineData | undefined;

  if (isLoading) {
    return (
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Pipeline by Stage</CardTitle>
        </CardHeader>
        <CardContent>
          <Skeleton className="h-40 w-full" />
        </CardContent>
      </Card>
    );
  }

  const stages = [...(pipe?.byStage ?? [])].sort((a, b) => b.tcv - a.tcv);
  const maxTcv = stages.reduce((m, s) => Math.max(m, s.tcv), 0) || 1;
  const busiest = stages.reduce<{ stage: string; count: number } | null>(
    (top, s) => (!top || s.count > top.count ? { stage: s.stage, count: s.count } : top),
    null,
  );

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base">Pipeline by Stage</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {stages.length === 0 ? (
          <p className="text-sm text-muted-foreground">Nothing in the pipeline right now.</p>
        ) : (
          <>
            <div className="space-y-2.5">
              {stages.map((s) => (
                <button
                  key={s.stage}
                  type="button"
                  onClick={() => onSelectStage(s.stage)}
                  aria-haspopup="dialog"
                  aria-label={`${s.count} deals in ${s.stage}, ${compactCurrency(s.tcv, reportingCurrency)}`}
                  className="group block w-full text-left focus-visible:outline-none"
                >
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-muted-foreground group-hover:text-foreground transition-colors">
                      {s.stage}
                    </span>
                    <span className="font-mono text-xs">
                      <span className="text-muted-foreground">{s.count} · </span>
                      {compactCurrency(s.tcv, reportingCurrency)}
                    </span>
                  </div>
                  <div className="mt-1 h-2.5 w-full overflow-hidden rounded-full bg-muted">
                    <div
                      className="h-full rounded-full bg-primary transition-opacity group-hover:opacity-80"
                      style={{ width: `${Math.max(4, (s.tcv / maxTcv) * 100)}%` }}
                    />
                  </div>
                </button>
              ))}
            </div>
            <div className="flex items-center justify-between border-t pt-3 text-xs text-muted-foreground">
              <span>
                Total: <span className="font-mono">{pipe?.activeDeals ?? 0}</span> deals ·{" "}
                <span className="font-mono">{compactCurrency(pipe?.totalTcv ?? 0, reportingCurrency)}</span>
              </span>
              {busiest && (
                <span>
                  Most deals: <span className="font-medium text-foreground">{busiest.stage}</span> ({busiest.count})
                </span>
              )}
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}
