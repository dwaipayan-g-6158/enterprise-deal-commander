import { useGetVelocityAnalytics } from "@workspace/api-client-react";
import { useLocation } from "wouter";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Gauge, ArrowRight } from "lucide-react";

interface VelocityDeal {
  id: string;
  dealName: string;
  accountName: string;
  stage: string;
  daysInStage: number;
  benchmarkDays: number;
  deltaDays: number;
  velocity: string;
}

const STATUS: Record<string, { label: string; cls: string }> = {
  SLOW: { label: "Stalled", cls: "bg-destructive text-white" },
  FAST: { label: "Fast", cls: "bg-emerald-500 text-white" },
  NORMAL: { label: "On Pace", cls: "bg-muted text-muted-foreground" },
};

// Widget 8 — Velocity Map (compact). The most-overdue deals relative to their
// stage benchmark; deep-links to the full velocity heatmap.
export function VelocitySummary() {
  const { data, isLoading } = useGetVelocityAnalytics();
  const [, navigate] = useLocation();
  const deals = ((data?.data as { deals?: VelocityDeal[] })?.deals ?? [])
    .slice()
    .sort((a, b) => b.deltaDays - a.deltaDays)
    .slice(0, 6);

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <Gauge className="h-4 w-4 text-primary" /> Velocity Map
        </CardTitle>
        <button
          type="button"
          onClick={() => navigate("/analytics")}
          className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded-sm"
        >
          Details <ArrowRight className="h-3.5 w-3.5" />
        </button>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <Skeleton className="h-40 w-full" />
        ) : deals.length === 0 ? (
          <p className="text-sm text-muted-foreground">Nothing to measure yet.</p>
        ) : (
          <table className="w-full text-sm">
            <tbody>
              {deals.map((d) => {
                const s = STATUS[d.velocity] ?? STATUS.NORMAL;
                return (
                  <tr
                    key={d.id}
                    tabIndex={0}
                    onClick={() => navigate(`/deals/${d.id}`)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") navigate(`/deals/${d.id}`);
                    }}
                    className="cursor-pointer border-b last:border-0 transition-colors hover:bg-muted/40 focus-visible:outline-none focus-visible:bg-muted/40"
                  >
                    <td className="py-1.5 pr-2">
                      <span className="font-medium">{d.accountName}</span>
                      <span className="text-muted-foreground"> · {d.stage}</span>
                    </td>
                    <td className="py-1.5 px-2 text-right font-mono text-xs">
                      <span className={d.deltaDays > 0 ? "text-red-500" : "text-emerald-500"}>
                        {d.deltaDays > 0 ? `+${d.deltaDays}d` : `${d.deltaDays}d`}
                      </span>
                    </td>
                    <td className="py-1.5 pl-2 text-right">
                      <Badge className={s.cls}>{s.label}</Badge>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </CardContent>
    </Card>
  );
}
