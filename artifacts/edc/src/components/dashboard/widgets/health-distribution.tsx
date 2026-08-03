import { useGetVitalSigns } from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { HealthDonut } from "@/components/cockpit/charts/health-donut";
import { compactCurrency, type Health } from "./_shared";
import { HEALTH_CLASS, HEALTH_SHORT_LABEL } from "@/lib/semantic-colors";

interface VitalSignsData {
  baseline: { redDeals: number } | null;
}

interface Props {
  counts: { GREEN: number; YELLOW: number; RED: number };
  tcvAtRisk: number;
  reportingCurrency: string;
  onSelect: (band: Health) => void;
}

// Order only — wording and colour are read off the shared maps so this legend
// can't drift from the badges it explains.
const LEGEND: Health[] = ["GREEN", "YELLOW", "RED"];

// Widget 2 — Health Distribution. Donut (hole carries the total) plus the ratio
// legend, % healthy, $ at risk and a week-over-week RED trend.
export function HealthDistribution({ counts, tcvAtRisk, reportingCurrency, onSelect }: Props) {
  const { data } = useGetVitalSigns();
  // `redDeals`, not `redAlerts`: `counts.RED` below is a count of RED-HEALTH
  // DEALS, so the baseline it's differenced against has to be the same
  // quantity. These used to share one `redAlerts` field, which silently
  // compared a deal count against an alert count.
  const redBaseline = (data?.data as VitalSignsData | undefined)?.baseline?.redDeals ?? null;

  const total = counts.GREEN + counts.YELLOW + counts.RED || 1;
  const pctHealthy = Math.round((counts.GREEN / total) * 100);
  const redDelta = redBaseline == null ? null : counts.RED - redBaseline;

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base">Pipeline Health</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-1 @md:grid-cols-2 gap-4 items-center">
          <HealthDonut green={counts.GREEN} yellow={counts.YELLOW} red={counts.RED} />

          <div className="space-y-2">
            {LEGEND.map((band) => {
              const label = HEALTH_SHORT_LABEL[band];
              const value = counts[band];
              const pct = Math.round((value / total) * 100);
              return (
                <button
                  key={band}
                  type="button"
                  onClick={() => onSelect(band)}
                  aria-haspopup="dialog"
                  aria-label={`${value} ${label} deals`}
                  className="flex w-full items-center gap-2 rounded-md px-2 py-1 -mx-2 text-sm transition-colors hover:bg-muted/50 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  <span className={`h-2.5 w-2.5 rounded-full ${HEALTH_CLASS[band].dot}`} />
                  <span className="font-mono font-medium tabular-nums">{value}</span>
                  <span className="text-muted-foreground">{label}</span>
                  <span className="ml-auto font-mono text-xs text-muted-foreground">{pct}%</span>
                </button>
              );
            })}
          </div>
        </div>

        <div className="mt-4 flex flex-wrap items-center justify-between gap-2 border-t pt-3 text-xs">
          <span className="text-muted-foreground">
            <span className={`font-mono font-medium ${HEALTH_CLASS.GREEN.text}`}>{pctHealthy}%</span> healthy ·{" "}
            <span className="font-mono font-medium text-red-500">
              {compactCurrency(tcvAtRisk, reportingCurrency)}
            </span>{" "}
            at risk
          </span>
          {redDelta != null && redDelta !== 0 && (
            <span className={`font-medium ${redDelta > 0 ? "text-red-500" : HEALTH_CLASS.GREEN.text}`}>
              {redDelta > 0 ? "+" : ""}
              {redDelta} {HEALTH_SHORT_LABEL.RED} this week
            </span>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
