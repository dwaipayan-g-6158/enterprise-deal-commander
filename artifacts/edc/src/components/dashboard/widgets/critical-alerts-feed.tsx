import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ShieldAlert, ArrowRight } from "lucide-react";
import { compactCurrency, humanizeCode } from "./_shared";

interface AlertEntry {
  dealId: string;
  dealName: string;
  accountName: string;
  alert: { code: string; severity: string; message: string; weight?: number };
}

interface Props {
  alerts: AlertEntry[];
  tcvByDealId: Record<string, number>;
  reportingCurrency: string;
  onViewAll: () => void;
  onSelect: (dealId: string) => void;
}

// Widget 3 — Critical Alerts Feed. The war-room triage queue: top alerts sorted
// by severity then weight, each card colour-keyed to severity with the money,
// the name and a readable pattern title.
export function CriticalAlertsFeed({
  alerts,
  tcvByDealId,
  reportingCurrency,
  onViewAll,
  onSelect,
}: Props) {
  const sorted = [...alerts].sort((a, b) => {
    if (a.alert.severity !== b.alert.severity) return a.alert.severity === "RED" ? -1 : 1;
    return (b.alert.weight ?? 0) - (a.alert.weight ?? 0);
  });
  const top = sorted.slice(0, 3);

  return (
    <Card className="border-destructive/20 bg-destructive/5">
      <CardHeader className="flex flex-row items-center justify-between space-y-0">
        <CardTitle className="flex items-center gap-2 text-destructive">
          <ShieldAlert className="h-5 w-5" />
          Critical Alerts ({alerts.length})
        </CardTitle>
        {alerts.length > 0 && (
          <button
            type="button"
            onClick={onViewAll}
            className="text-xs text-destructive font-medium hover:underline cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded-sm"
          >
            View all →
          </button>
        )}
      </CardHeader>
      <CardContent>
        {top.length > 0 ? (
          <div className="space-y-3">
            {top.map((a, i) => {
              const isRed = a.alert.severity === "RED";
              const tcv = tcvByDealId[a.dealId];
              return (
                <button
                  key={`${a.dealId}-${a.alert.code}-${i}`}
                  type="button"
                  onClick={() => onSelect(a.dealId)}
                  aria-label={`View ${a.dealName}: ${humanizeCode(a.alert.code)}`}
                  className={`group block w-full rounded-md border border-l-4 bg-card p-3 text-left transition-colors hover:border-primary/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
                    isRed ? "border-l-red-500" : "border-l-amber-500"
                  }`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="flex items-center gap-2 text-sm font-semibold">
                        <span className={`h-2 w-2 shrink-0 rounded-full ${isRed ? "bg-red-500" : "bg-amber-500"}`} />
                        <span className="truncate">{a.dealName}</span>
                        {tcv != null && (
                          <span className="shrink-0 font-mono text-xs text-muted-foreground">
                            {compactCurrency(tcv, reportingCurrency)}
                          </span>
                        )}
                      </p>
                      <p className="mt-1 text-xs font-medium uppercase tracking-wider text-muted-foreground">
                        {humanizeCode(a.alert.code)}
                      </p>
                      <p className="mt-0.5 text-xs text-muted-foreground line-clamp-2">{a.alert.message}</p>
                    </div>
                    <ArrowRight className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5" />
                  </div>
                </button>
              );
            })}
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">No critical alerts currently active.</p>
        )}
      </CardContent>
    </Card>
  );
}
