import { useListDeals, useGetRosterEnrichment } from "@workspace/api-client-react";
import { useLocation } from "wouter";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { ArrowRight } from "lucide-react";
import { compactCurrency, shortDate, daysUntil, HEALTH_DOT, type Health } from "./_shared";

interface Enrichment {
  id: string;
  score: number | null;
  gatesPct: number;
  deltaDays: number;
  velocityStatus: string;
}

const LIMIT = 8;

function VelocityCell({ status, delta }: { status: string; delta: number }) {
  if (status === "NORMAL") return <span className="text-muted-foreground">On Pace</span>;
  const behind = delta > 0;
  return (
    <span className={behind ? "text-red-500" : "text-emerald-500"}>
      {behind ? `+${delta}d` : `${delta}d`}
    </span>
  );
}

// Widget 5 — Deal Roster. Compact top-by-TCV table enriched with score, gate
// progress and velocity; deep-links to the full roster at /deals.
export function DealRoster({ reportingCurrency }: { reportingCurrency: string }) {
  const [, navigate] = useLocation();
  const { data: dealsWrapper, isLoading } = useListDeals({
    state: "active",
    sort: "-calculatedTCV",
    limit: LIMIT,
  });
  const { data: enrichWrapper } = useGetRosterEnrichment();

  const deals = dealsWrapper?.data ?? [];
  const enrichRows = (enrichWrapper?.data as { deals?: Enrichment[] } | undefined)?.deals ?? [];
  const enrichById = new Map(enrichRows.map((e) => [e.id, e]));

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-3">
        <CardTitle className="text-base">Active Deals</CardTitle>
        <button
          type="button"
          onClick={() => navigate("/deals")}
          className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded-sm"
        >
          View all deals
          <ArrowRight className="h-3.5 w-3.5" />
        </button>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <Skeleton className="h-56 w-full" />
        ) : deals.length === 0 ? (
          <p className="text-sm text-muted-foreground">Your roster's empty — add a deal to start tracking.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-xs uppercase tracking-wider text-muted-foreground">
                  <th className="py-2 pr-2 text-left font-medium">Account</th>
                  <th className="py-2 px-2 text-right font-medium">TCV</th>
                  <th className="py-2 px-2 text-left font-medium">Stage</th>
                  <th className="py-2 px-2 text-center font-medium">Health</th>
                  <th className="py-2 px-2 text-right font-medium">Score</th>
                  <th className="py-2 px-2 text-left font-medium">Gates</th>
                  <th className="py-2 px-2 text-right font-medium">Velocity</th>
                  <th className="py-2 pl-2 text-right font-medium">Close</th>
                </tr>
              </thead>
              <tbody>
                {deals.map((d) => {
                  const e = enrichById.get(d.id);
                  const health = d.healthStatus as Health;
                  const tcv = d.normalizedTCV ?? d.calculatedTCV ?? 0;
                  const close = shortDate(d.expectedCloseDate);
                  const overdue = (daysUntil(d.expectedCloseDate) ?? 1) < 0;
                  return (
                    <tr
                      key={d.id}
                      tabIndex={0}
                      onClick={() => navigate(`/deals/${d.id}`)}
                      onKeyDown={(ev) => {
                        if (ev.key === "Enter") navigate(`/deals/${d.id}`);
                      }}
                      className={`group cursor-pointer border-b transition-colors hover:bg-muted/40 focus-visible:outline-none focus-visible:bg-muted/40 ${
                        health === "RED" ? "border-l-2 border-l-red-500" : ""
                      }`}
                    >
                      <td className="py-2 pr-2">
                        <span className="font-medium">{d.accountName}</span>
                      </td>
                      <td className="py-2 px-2 text-right font-mono">
                        {compactCurrency(tcv, reportingCurrency)}
                      </td>
                      <td className="py-2 px-2 text-muted-foreground">{d.salesStage}</td>
                      <td className="py-2 px-2">
                        <span
                          className={`mx-auto block h-2.5 w-2.5 rounded-full ${HEALTH_DOT[health] ?? "bg-muted"}`}
                          role="img"
                          aria-label={health}
                        />
                      </td>
                      <td className="py-2 px-2 text-right font-mono">{e?.score ?? "—"}</td>
                      <td className="py-2 px-2">
                        <div className="flex items-center gap-1.5">
                          <div className="h-1.5 w-12 overflow-hidden rounded-full bg-muted">
                            <div className="h-full rounded-full bg-primary" style={{ width: `${e?.gatesPct ?? 0}%` }} />
                          </div>
                          <span className="font-mono text-xs text-muted-foreground">{e?.gatesPct ?? 0}%</span>
                        </div>
                      </td>
                      <td className="py-2 px-2 text-right font-mono text-xs">
                        {e ? <VelocityCell status={e.velocityStatus} delta={e.deltaDays} /> : "—"}
                      </td>
                      <td className={`py-2 pl-2 text-right font-mono text-xs ${overdue ? "text-red-500" : "text-muted-foreground"}`}>
                        {close ?? "—"}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
