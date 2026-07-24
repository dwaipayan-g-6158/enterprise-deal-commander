import { useListDeals } from "@workspace/api-client-react";
import { useLocation } from "wouter";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { CalendarClock } from "lucide-react";
import { compactCurrency, HEALTH_DOT } from "./_shared";
import { buildTimeline } from "./close-timeline-model";

// Widget 10 — Close Date Timeline. Deals positioned by month of expected close,
// surfacing revenue concentration and at-risk dates. Closed (Won/Lost) deals
// are excluded — a done deal has no "expected close" left to track — and an
// Overdue bucket surfaces deals whose close date has slipped into the past.
// All bucketing/sorting lives in close-timeline-model.ts; this component is
// presentation only.
export function CloseTimeline({ reportingCurrency }: { reportingCurrency: string }) {
  const [, navigate] = useLocation();
  const { data, isLoading } = useListDeals({ state: "active", limit: 200 });
  const deals = data?.data ?? [];

  if (isLoading) {
    return (
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <CalendarClock className="h-4 w-4 text-primary" /> Close Timeline
          </CardTitle>
        </CardHeader>
        <CardContent>
          <Skeleton className="h-40 w-full" />
        </CardContent>
      </Card>
    );
  }

  // `new Date()` with no args is fine here — this component is the one place
  // allowed to use the real clock; the model itself always takes `now` as a
  // parameter so it stays testable with a fixed clock.
  const { overdue, months, noDateCount, redTcv } = buildTimeline(deals, new Date());

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <CalendarClock className="h-4 w-4 text-primary" /> Close Timeline
        </CardTitle>
      </CardHeader>
      <CardContent>
        {!overdue && months.length === 0 ? (
          <p className="text-sm text-muted-foreground">Nothing on the calendar yet.</p>
        ) : (
          <>
            <div className="overflow-x-auto pb-1">
              <div className="flex gap-3" style={{ minWidth: "min-content" }}>
                {overdue && (
                  <div key={overdue.key} className="min-w-[140px] flex-1 space-y-2">
                    <div className="border-b border-red-500/40 pb-1">
                      <p
                        className="text-xs font-semibold uppercase tracking-wider text-red-500"
                        aria-label="Overdue — deals past their expected close date"
                      >
                        {overdue.label}
                      </p>
                      <p className="font-mono text-[11px] text-red-500/80">
                        {compactCurrency(overdue.tcv, reportingCurrency)}
                      </p>
                    </div>
                    {overdue.deals.map((d) => (
                      <button
                        key={d.id}
                        type="button"
                        onClick={() => navigate(`/deals/${d.id}`)}
                        className="block w-full rounded-md border bg-card px-2 py-1.5 text-left transition-colors hover:border-primary/50 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                      >
                        <span className="flex items-center gap-1.5">
                          <span className={`h-2 w-2 shrink-0 rounded-full ${HEALTH_DOT[d.health] ?? "bg-muted"}`} />
                          <span className="truncate text-xs font-medium">{d.accountName}</span>
                        </span>
                        <span className="ml-3.5 block font-mono text-[11px] text-muted-foreground">
                          {compactCurrency(d.tcv, reportingCurrency)}
                        </span>
                      </button>
                    ))}
                  </div>
                )}
                {months.map((m) => (
                  <div key={m.key} className="min-w-[140px] flex-1 space-y-2">
                    <div className="border-b pb-1">
                      <p className="text-xs font-semibold uppercase tracking-wider">{m.label}</p>
                      <p className="font-mono text-[11px] text-muted-foreground">
                        {compactCurrency(m.tcv, reportingCurrency)}
                      </p>
                    </div>
                    {m.deals.map((d) => (
                      <button
                        key={d.id}
                        type="button"
                        onClick={() => navigate(`/deals/${d.id}`)}
                        className="block w-full rounded-md border bg-card px-2 py-1.5 text-left transition-colors hover:border-primary/50 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                      >
                        <span className="flex items-center gap-1.5">
                          <span className={`h-2 w-2 shrink-0 rounded-full ${HEALTH_DOT[d.health] ?? "bg-muted"}`} />
                          <span className="truncate text-xs font-medium">{d.accountName}</span>
                        </span>
                        <span className="ml-3.5 block font-mono text-[11px] text-muted-foreground">
                          {compactCurrency(d.tcv, reportingCurrency)}
                        </span>
                      </button>
                    ))}
                  </div>
                ))}
              </div>
            </div>
            <div className="mt-3 flex flex-wrap items-center gap-x-4 border-t pt-3 text-xs text-muted-foreground">
              {redTcv > 0 && (
                <span>
                  At risk:{" "}
                  <span className="font-mono font-medium text-red-500">
                    {compactCurrency(redTcv, reportingCurrency)}
                  </span>{" "}
                  (RED deals)
                </span>
              )}
              {noDateCount > 0 && <span>{noDateCount} with no close date set</span>}
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}
