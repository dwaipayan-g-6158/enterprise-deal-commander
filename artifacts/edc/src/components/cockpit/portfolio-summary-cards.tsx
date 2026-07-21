import type { PortfolioSummary } from "@workspace/api-client-react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { Layers, Link2, DollarSign, AlertOctagon } from "lucide-react";

function compactValue(n: number, currency: string): string {
  const sym = currency === "USD" ? "$" : `${currency} `;
  if (n >= 1_000_000) return `${sym}${(n / 1_000_000).toFixed(2)}M`;
  if (n >= 1_000) return `${sym}${Math.round(n / 1_000)}K`;
  return `${sym}${Math.round(n)}`;
}

// Diversification reads "good when high": green when risk is well spread,
// rose when it is concentrated in a few cells.
function diversificationAccent(d: number): string {
  if (d >= 0.66) return "text-emerald-600 dark:text-emerald-400";
  if (d >= 0.4) return "text-amber-600 dark:text-amber-400";
  return "text-rose-600 dark:text-rose-400";
}

interface MetricCardProps {
  icon: React.ReactNode;
  label: string;
  value: React.ReactNode;
  subtitle: React.ReactNode;
  valueClassName?: string;
  delayMs: number;
}

function MetricCard({ icon, label, value, subtitle, valueClassName, delayMs }: MetricCardProps) {
  return (
    <Card
      className="animate-in fade-in slide-in-from-bottom-2 fill-mode-both duration-300 transition-shadow hover:shadow-md"
      style={{ animationDelay: `${delayMs}ms` }}
    >
      <CardContent className="p-4 space-y-1">
        <div className="flex items-center gap-1.5 text-xs font-medium uppercase tracking-wide text-muted-foreground">
          {icon}
          {label}
        </div>
        <div className={cn("text-2xl font-bold tabular-nums leading-tight", valueClassName)}>
          {value}
        </div>
        <p className="text-xs text-muted-foreground">{subtitle}</p>
      </CardContent>
    </Card>
  );
}

export function PortfolioSummaryCards({ summary }: { summary: PortfolioSummary }) {
  const cluster = summary.highestCorrelationCluster;
  const scopeLabel =
    cluster?.scope === "manager"
      ? "Account Manager"
      : cluster?.scope === "lead"
        ? "Technical Lead"
        : "Product";

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 @4xl:grid-cols-4 gap-4">
      <MetricCard
        delayMs={0}
        icon={<Layers className="h-3.5 w-3.5" />}
        label="Diversification Index"
        value={summary.diversificationIndex.toFixed(2)}
        valueClassName={diversificationAccent(summary.diversificationIndex)}
        subtitle="0 = concentrated · 1 = diversified"
      />

      <MetricCard
        delayMs={100}
        icon={<Link2 className="h-3.5 w-3.5" />}
        label="Top Correlation Cluster"
        value={
          cluster ? (
            <span className="flex items-center gap-2">
              <span className="truncate" title={cluster.name}>{cluster.name}</span>
              <Badge variant="secondary" className="shrink-0 text-[10px]">{scopeLabel}</Badge>
            </span>
          ) : (
            <span className="text-muted-foreground text-base font-medium">None significant</span>
          )
        }
        subtitle={
          cluster ? (
            <span className="font-mono">
              {cluster.code} · ×{cluster.lift.toFixed(1)} lift · {(cluster.share * 100).toFixed(0)}% of deals
            </span>
          ) : (
            "No dominant cluster — risk is well spread"
          )
        }
      />

      <MetricCard
        delayMs={200}
        icon={<DollarSign className="h-3.5 w-3.5" />}
        label="Correlated Exposure"
        value={compactValue(summary.correlatedExposureTcv, summary.reportingCurrency)}
        subtitle="TCV in significant risk clusters"
      />

      <MetricCard
        delayMs={300}
        icon={<AlertOctagon className="h-3.5 w-3.5" />}
        label="Critical Deals"
        value={summary.redDealCount}
        valueClassName={summary.redDealCount > 0 ? "text-rose-600 dark:text-rose-400" : undefined}
        subtitle={`of ${summary.totalDealCount} monitored at RED health`}
      />
    </div>
  );
}
