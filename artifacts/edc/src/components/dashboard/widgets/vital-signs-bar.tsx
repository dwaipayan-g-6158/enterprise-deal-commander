import { useGetVitalSigns } from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { TrendingUp, Scale, Layers, ShieldAlert, Gauge } from "lucide-react";
import { compactCurrency, DeltaBadge } from "./_shared";

interface VitalSignsData {
  totalTCV: number;
  weightedPipeline: number;
  activeDeals: number;
  avgScore: number | null;
  baseline: { totalTCV: number; activeDeals: number; redAlerts: number } | null;
}

interface Props {
  totalTCV: number;
  activeDeals: number;
  redAlerts: number;
  staleCount: number;
  reportingCurrency: string;
  onOpenTcv: () => void;
  onOpenRed: () => void;
  onOpenStale: () => void;
  onOpenWeightedPipeline: () => void;
  onOpenAvgScore: () => void;
}

// Widget 1 — Pipeline Vital Signs. The Commander's heartbeat check: money at
// stake, weighted forecast, deal count, red alerts and average score, each with
// a week-over-week delta when snapshot history is available.
export function VitalSignsBar({
  totalTCV,
  activeDeals,
  redAlerts,
  staleCount,
  reportingCurrency,
  onOpenTcv,
  onOpenRed,
  onOpenStale,
  onOpenWeightedPipeline,
  onOpenAvgScore,
}: Props) {
  const { data, isLoading } = useGetVitalSigns();
  const vs = data?.data as VitalSignsData | undefined;
  const cur = (n: number) => compactCurrency(n, reportingCurrency);
  const baseline = vs?.baseline ?? null;

  const cardCls =
    "bg-card border-border shadow-sm cursor-pointer transition-colors hover:border-primary/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";
  const headCls = "flex flex-row items-center justify-between pb-2 space-y-0";
  const titleCls = "text-sm font-medium text-muted-foreground uppercase tracking-wider";

  const clickable = (onClick: () => void) => ({
    role: "button" as const,
    tabIndex: 0,
    onClick,
    onKeyDown: (e: React.KeyboardEvent) => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        onClick();
      }
    },
  });

  return (
    <div className="grid grid-cols-2 @md:grid-cols-3 @4xl:grid-cols-5 gap-6">
      {/* Total Monitored TCV */}
      <Card className={cardCls} {...clickable(onOpenTcv)} aria-haspopup="dialog">
        <CardHeader className={headCls}>
          <CardTitle className={titleCls}>Total TCV</CardTitle>
          <TrendingUp className="h-4 w-4 text-primary" />
        </CardHeader>
        <CardContent>
          <div className="text-3xl font-bold font-mono">{cur(totalTCV)}</div>
          <div className="mt-1">
            <DeltaBadge current={totalTCV} baseline={baseline?.totalTCV} format={cur} />
          </div>
        </CardContent>
      </Card>

      {/* Weighted Pipeline */}
      <Card className={cardCls} {...clickable(onOpenWeightedPipeline)} aria-haspopup="dialog">
        <CardHeader className={headCls}>
          <CardTitle className={titleCls}>Weighted Pipeline</CardTitle>
          <Scale className="h-4 w-4 text-primary" />
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <Skeleton className="h-9 w-28" />
          ) : (
            <>
              <div className="text-3xl font-bold font-mono">{cur(vs?.weightedPipeline ?? 0)}</div>
              <p className="text-xs text-muted-foreground mt-1">Score-weighted forecast</p>
            </>
          )}
        </CardContent>
      </Card>

      {/* Active Deals */}
      <Card className="bg-card border-border shadow-sm">
        <CardHeader className={headCls}>
          <CardTitle className={titleCls}>Active Deals</CardTitle>
          <Layers className="h-4 w-4 text-muted-foreground" />
        </CardHeader>
        <CardContent>
          <div className="text-3xl font-bold font-mono">{activeDeals}</div>
          {staleCount > 0 ? (
            <button
              type="button"
              onClick={onOpenStale}
              aria-haspopup="dialog"
              className="text-xs text-amber-500 mt-1 hover:underline cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded-sm"
            >
              {staleCount} stale →
            </button>
          ) : (
            <DeltaBadge
              current={activeDeals}
              baseline={baseline?.activeDeals}
              format={(n) => String(n)}
            />
          )}
        </CardContent>
      </Card>

      {/* Red Alerts */}
      <Card className={cardCls} {...clickable(onOpenRed)} aria-haspopup="dialog">
        <CardHeader className={headCls}>
          <CardTitle className={titleCls}>Red Alerts</CardTitle>
          <ShieldAlert className="h-4 w-4 text-destructive" />
        </CardHeader>
        <CardContent>
          <div className="text-3xl font-bold font-mono text-destructive">{redAlerts}</div>
          <div className="mt-1">
            <DeltaBadge
              current={redAlerts}
              baseline={baseline?.redAlerts}
              positiveIsGood={false}
              format={(n) => String(n)}
            />
          </div>
        </CardContent>
      </Card>

      {/* Average Score */}
      <Card className={cardCls} {...clickable(onOpenAvgScore)} aria-haspopup="dialog">
        <CardHeader className={headCls}>
          <CardTitle className={titleCls}>Avg Score</CardTitle>
          <Gauge className="h-4 w-4 text-primary" />
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <Skeleton className="h-9 w-16" />
          ) : (
            <>
              <div className="text-3xl font-bold font-mono">{vs?.avgScore ?? "—"}</div>
              <p className="text-xs text-muted-foreground mt-1">Predicted close probability</p>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
