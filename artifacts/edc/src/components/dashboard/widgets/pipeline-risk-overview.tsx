import { useLocation } from "wouter";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { ShieldAlert, Lightbulb } from "lucide-react";
import { compactCurrency } from "./_shared";
import { usePipelineRisk } from "./use-pipeline-risk";
import {
  classifyRisk,
  RISK_LEVEL_CLASS,
  RISK_LEVEL_LABEL,
} from "@/components/cockpit/risk/risk-model";
import type { RiskLevel } from "./pipeline-risk";

interface Props {
  reportingCurrency: string;
}

const LEVEL_ORDER: RiskLevel[] = ["HIGH", "ELEVATED", "MODERATE", "LOW"];

/**
 * Pipeline Risk Overview — dashboard widget (F7).
 * Aggregates per-deal riskScore / riskLevel (from roster enrichment) across
 * the active pipeline. Shows average risk, the highest-risk deal (with a
 * navigate link), a distribution bar for each level, and a deterministic
 * insight line.
 *
 * Per-dimension averages are intentionally omitted — that data is only
 * available on the individual deal cockpit.
 */
export function PipelineRiskOverview({ reportingCurrency }: Props) {
  const [, navigate] = useLocation();
  const { rows, buckets, avgScore, highest, insight, isLoading, isError } =
    usePipelineRisk();

  const cur = (n: number) => compactCurrency(n, reportingCurrency);

  // ---- Loading ----
  if (isLoading) {
    return (
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <ShieldAlert className="h-4 w-4 text-primary" />
            Pipeline Risk Overview
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <Skeleton className="h-10 w-40" />
          <Skeleton className="h-6 w-64" />
          <Skeleton className="h-20 w-full" />
          <Skeleton className="h-5 w-full" />
        </CardContent>
      </Card>
    );
  }

  // ---- Error ----
  if (isError) {
    return (
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <ShieldAlert className="h-4 w-4 text-primary" />
            Pipeline Risk Overview
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">Unable to load risk data.</p>
        </CardContent>
      </Card>
    );
  }

  // ---- Empty ----
  if (rows.length === 0) {
    return (
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <ShieldAlert className="h-4 w-4 text-primary" />
            Pipeline Risk Overview
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">No active deals to assess.</p>
        </CardContent>
      </Card>
    );
  }

  // ---- Derived display values ----
  const avgLevel = avgScore != null ? classifyRisk(avgScore) : null;
  const avgText = avgScore != null ? Math.round(avgScore).toString() : "—";
  const avgColor = avgLevel ? RISK_LEVEL_CLASS[avgLevel].text : "text-muted-foreground";
  const avgLabel = avgLevel ? RISK_LEVEL_LABEL[avgLevel] : "No data";

  const maxCount = Math.max(1, ...LEVEL_ORDER.map((l) => buckets[l].count));

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <ShieldAlert className="h-4 w-4 text-primary" />
          Pipeline Risk Overview
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Top stats — Average Risk + Highest-Risk Deal */}
        <div className="grid grid-cols-1 @md:grid-cols-2 gap-3">
          {/* Average Risk */}
          <div className="space-y-0.5">
            <p className="text-[11px] uppercase tracking-wide text-muted-foreground">
              Avg Risk Score
            </p>
            <p className={`font-mono text-2xl font-bold tabular-nums leading-none ${avgColor}`}>
              {avgText}
            </p>
            <p className={`text-xs font-medium ${avgColor}`}>{avgLabel}</p>
          </div>

          {/* Highest-Risk Deal */}
          {highest ? (
            <div className="space-y-0.5">
              <p className="text-[11px] uppercase tracking-wide text-muted-foreground">
                Highest-Risk Deal
              </p>
              <button
                type="button"
                onClick={() => navigate(`/deals/${highest.id}`)}
                className="block max-w-full truncate text-left text-sm font-medium hover:underline cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded-sm"
                title={highest.name}
                aria-label={`Open ${highest.name} cockpit`}
              >
                {highest.name}
              </button>
              {highest.riskScore != null && highest.riskLevel != null && (
                <div className="flex items-center gap-1.5">
                  <span
                    className={`font-mono text-xs font-semibold tabular-nums ${RISK_LEVEL_CLASS[highest.riskLevel].text}`}
                  >
                    {Math.round(highest.riskScore)}
                  </span>
                  <span
                    className={`rounded px-1.5 py-0.5 text-[10px] font-medium leading-none ${RISK_LEVEL_CLASS[highest.riskLevel].bg} ${RISK_LEVEL_CLASS[highest.riskLevel].text} ${RISK_LEVEL_CLASS[highest.riskLevel].border} border`}
                  >
                    {RISK_LEVEL_LABEL[highest.riskLevel]}
                  </span>
                </div>
              )}
            </div>
          ) : (
            <div className="space-y-0.5">
              <p className="text-[11px] uppercase tracking-wide text-muted-foreground">
                Highest-Risk Deal
              </p>
              <p className="text-sm text-muted-foreground">—</p>
            </div>
          )}
        </div>

        {/* Distribution bars — HIGH → ELEVATED → MODERATE → LOW */}
        <div className="space-y-1.5">
          <p className="text-[11px] uppercase tracking-wide text-muted-foreground">Distribution</p>
          {LEVEL_ORDER.map((level) => {
            const { count, tcv } = buckets[level];
            const cls = RISK_LEVEL_CLASS[level];
            const widthPct = (count / maxCount) * 100;
            return (
              <div key={level} className="grid grid-cols-[10px_80px_1fr_auto] items-center gap-2">
                {/* Dot */}
                <span className={`h-2 w-2 rounded-full ${cls.dot}`} />
                {/* Level label */}
                <span className="text-xs text-muted-foreground">{RISK_LEVEL_LABEL[level]}</span>
                {/* Bar */}
                <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
                  <div
                    className={`h-full rounded-full ${cls.fill} transition-all duration-300`}
                    style={{ width: count === 0 ? "0%" : `${widthPct}%` }}
                  />
                </div>
                {/* Count + TCV */}
                <span className="whitespace-nowrap font-mono text-[11px] tabular-nums text-muted-foreground">
                  {count} · {cur(tcv)}
                </span>
              </div>
            );
          })}
        </div>

        {/* Insight */}
        <div className="flex items-start gap-2 rounded-md bg-muted/40 px-3 py-2 text-xs text-muted-foreground">
          <Lightbulb className="mt-px h-3.5 w-3.5 shrink-0 text-amber-600 dark:text-amber-400" aria-hidden />
          <span>{insight}</span>
        </div>

        {/* Per-dimension averages note (optional) */}
        <p className="text-[11px] text-muted-foreground/70">
          Per-dimension averages available on the deal cockpit.
        </p>
      </CardContent>
    </Card>
  );
}
