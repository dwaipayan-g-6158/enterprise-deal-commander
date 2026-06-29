import { useGetVitalSigns } from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { HealthDonut } from "@/components/cockpit/charts/health-donut";
import { compactCurrency, type Health } from "./_shared";

interface VitalSignsData {
  baseline: { redAlerts: number } | null;
}

interface Props {
  counts: { GREEN: number; YELLOW: number; RED: number };
  tcvAtRisk: number;
  reportingCurrency: string;
  onSelect: (band: Health) => void;
}

const LEGEND: { band: Health; label: string; dot: string }[] = [
  { band: "GREEN", label: "Green", dot: "bg-emerald-500" },
  { band: "YELLOW", label: "Yellow", dot: "bg-amber-500" },
  { band: "RED", label: "Red", dot: "bg-red-500" },
];

// Widget 2 — Health Distribution. Donut (hole carries the total) plus the ratio
// legend, % healthy, $ at risk and a week-over-week RED trend.
export function HealthDistribution({ counts, tcvAtRisk, reportingCurrency, onSelect }: Props) {
  const { data } = useGetVitalSigns();
  const redBaseline = (data?.data as VitalSignsData | undefined)?.baseline?.redAlerts ?? null;

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
            {LEGEND.map(({ band, label, dot }) => {
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
                  <span className={`h-2.5 w-2.5 rounded-full ${dot}`} />
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
            <span className="font-mono font-medium text-emerald-500">{pctHealthy}%</span> healthy ·{" "}
            <span className="font-mono font-medium text-red-500">
              {compactCurrency(tcvAtRisk, reportingCurrency)}
            </span>{" "}
            at risk
          </span>
          {redDelta != null && redDelta !== 0 && (
            <span className={`font-medium ${redDelta > 0 ? "text-red-500" : "text-emerald-500"}`}>
              {redDelta > 0 ? "+" : ""}
              {redDelta} RED this week
            </span>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
