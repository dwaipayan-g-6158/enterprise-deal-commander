import type { PortfolioSummary } from "@workspace/api-client-react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { Layers, Link2, DollarSign, AlertOctagon } from "lucide-react";
import { compactCurrency, formatNum } from "@/lib/format";
import { diversificationBand, liftPresentation } from "@/components/cockpit/portfolio-presentation";
import { InfoTooltip } from "@/components/ui/info-tooltip";

interface MetricCardProps {
  icon: React.ReactNode;
  label: string;
  value: React.ReactNode;
  subtitle: React.ReactNode;
  valueClassName?: string;
  delayMs: number;
  tooltip?: React.ReactNode;
}

/**
 * Distinguishes the two "nothing to measure" cases the diversification card
 * has to special-case, which are NOT the same thing: a genuinely EMPTY
 * portfolio (zero manager x product cells — no active deals at all) vs. the
 * mathematically-degenerate single-cell case Decision 3 (plan) was built for
 * (exactly one cell — nothing to be concentrated AGAINST). Returns null when
 * neither applies, so the caller renders the real number.
 */
function diversificationCaveat(
  cellCount: number,
): { tooltip: string; subtitle: string } | null {
  if (cellCount === 0) {
    return {
      tooltip: "No manager × product pairs to diversify across.",
      subtitle: "Nothing to measure yet",
    };
  }
  if (cellCount === 1) {
    return {
      tooltip: "Only one manager × product cell — nothing to measure",
      subtitle: "Only one manager × product cell — nothing to measure",
    };
  }
  return null;
}

function MetricCard({ icon, label, value, subtitle, valueClassName, delayMs, tooltip }: MetricCardProps) {
  return (
    <Card
      className="animate-in fade-in fill-mode-both duration-300 transition-shadow hover:shadow-md"
      style={{ animationDelay: `${delayMs}ms` }}
    >
      <CardContent className="p-4 space-y-1">
        <div className="flex items-center gap-1.5 text-xs font-medium uppercase tracking-wide text-muted-foreground">
          {icon}
          {label}
          {tooltip && <InfoTooltip>{tooltip}</InfoTooltip>}
        </div>
        <div className={cn("text-2xl font-bold tabular-nums leading-tight", valueClassName)}>
          {value}
        </div>
        <p className="text-xs text-muted-foreground">{subtitle}</p>
      </CardContent>
    </Card>
  );
}

export function PortfolioSummaryCards({
  summary,
  diversificationCellCount,
}: {
  summary: PortfolioSummary;
  // Heatmap cell count (riskMatrix.byAccountManager.length) — lives outside
  // `summary` but is needed here to detect the single-cell degenerate case
  // below. A plain number (not the whole RiskMatrix) because this component
  // only ever needs the count, not any other matrix-derived value; passing
  // the count keeps this component decoupled from RiskMatrix's shape.
  diversificationCellCount: number;
}) {
  const cluster = summary.highestCorrelationCluster;
  const scopeLabel =
    cluster?.scope === "manager"
      ? "Account Manager"
      : cluster?.scope === "lead"
        ? "Technical Lead"
        : "Product";
  const lift = cluster ? liftPresentation(cluster.lift) : null;
  const diversificationCaveatInfo = diversificationCaveat(diversificationCellCount);

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 @4xl:grid-cols-4 gap-4">
      {/* Per Decision 3 (plan): a single manager x product heatmap cell makes
          diversificationIndex mathematically degenerate — there's nothing to
          be concentrated AGAINST. The server (Task 2) returns 1 for this case
          rather than 0, but a bare "1.00" would misleadingly read as
          "perfectly diversified". Dash + caveat instead of the raw number;
          no colour accent (valueClassName undefined) since nothing is really
          being measured — a green OR rose tint would both be a false signal.
          Zero cells (a genuinely empty portfolio) hits the same dash-render
          path via diversificationCaveat() but gets its own copy — see that
          helper — so an empty portfolio is never described as "one cell". */}
      <MetricCard
        delayMs={0}
        icon={<Layers className="h-3.5 w-3.5" />}
        label="Diversification Index"
        tooltip="How evenly risk is spread across manager × product combinations. 0 means concentrated in a few pairings, 1 means evenly spread. Normalized so the score is comparable across portfolios of any size — a small portfolio with well-spread risk scores just as high as a large one."
        value={
          diversificationCaveatInfo ? (
            <span title={diversificationCaveatInfo.tooltip}>—</span>
          ) : (
            formatNum(summary.diversificationIndex)
          )
        }
        valueClassName={diversificationCaveatInfo ? undefined : diversificationBand(summary.diversificationIndex)}
        subtitle={
          diversificationCaveatInfo
            ? diversificationCaveatInfo.subtitle
            : "0 = concentrated · 1 = diversified"
        }
      />

      {/* This card's cluster is computed server-side on an ACTIVE-ONLY alert
          basis (portfolio.ts's activeGlobalShares), deliberately different from
          the active+managed basis behind the By-Account-Manager/By-Technical-
          Lead/By-Product correlation TABLES rendered in portfolio.tsx's
          renderCorrelations. The two surfaces can legitimately name a
          different dominant code for the same group — that's intentional, see
          .agents/memory/edc-phase2-backbone.md, not a bug to reconcile. */}
      <MetricCard
        delayMs={40}
        icon={<Link2 className="h-3.5 w-3.5" />}
        label="Top Correlation Cluster"
        tooltip="The manager, technical lead, or product group where one risk-alert code shows up disproportionately more than its portfolio-wide baseline rate (the 'lift'). 'None significant' means no group clears the bar for group size, share of deals affected, and lift above baseline."
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
          cluster && lift ? (
            <span className="font-mono" title={lift.label}>
              {cluster.code} · {lift.text} lift · {formatNum(cluster.share * 100)}% of deals
            </span>
          ) : (
            "No dominant cluster — risk is well spread"
          )
        }
      />

      <MetricCard
        delayMs={80}
        icon={<DollarSign className="h-3.5 w-3.5" />}
        label="Correlated Exposure"
        tooltip="Total contract value sitting in deals carrying an alert code that recurs across a significant cluster. Counts only active, undispositioned alerts — so this can read lower than the correlation patterns shown in the tables below, which also include alerts a manager has already acknowledged or accepted."
        value={compactCurrency(summary.correlatedExposureTcv, summary.reportingCurrency)}
        subtitle="TCV in significant risk clusters"
      />

      <MetricCard
        delayMs={120}
        icon={<AlertOctagon className="h-3.5 w-3.5" />}
        label="Critical Deals"
        tooltip="Deals currently carrying at least one active RED-severity alert that hasn't been dispositioned. 'of N monitored' is the total count of active deals in the portfolio right now."
        value={summary.redDealCount}
        valueClassName={summary.redDealCount > 0 ? "text-red-600 dark:text-red-400" : undefined}
        subtitle={`of ${summary.totalDealCount} monitored with a critical (RED) alert`}
      />
    </div>
  );
}
