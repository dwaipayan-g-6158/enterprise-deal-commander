import { Link } from "wouter";
import { useGetLossRisk } from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Empty, EmptyHeader, EmptyMedia, EmptyTitle, EmptyDescription } from "@/components/ui/empty";
import { ShieldAlert, ArrowUpRight } from "lucide-react";

interface MatchedPattern {
  code: string;
  lethality: number;
}

interface LossRiskDeal {
  dealId: string;
  dealName: string;
  accountName: string;
  score: number;
  matchedPatterns: MatchedPattern[];
}

function scoreColor(score: number): string {
  if (score >= 70) return "text-destructive";
  if (score >= 40) return "text-amber-500";
  return "text-muted-foreground";
}

export function LossRiskPanel() {
  const { data: response, isLoading } = useGetLossRisk();
  const data = response?.data as { deals?: LossRiskDeal[]; lostDealCount?: number } | undefined;
  const deals = data?.deals ?? [];
  const lostDealCount = data?.lostDealCount ?? 0;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg flex items-center gap-2">
          <ShieldAlert className="h-5 w-5" />
          Early Warning
        </CardTitle>
        <p className="text-sm text-muted-foreground">
          Active deals currently exhibiting the patterns that killed past deals.
          {lostDealCount > 0 && lostDealCount < 10 && (
            <span> Based on only {lostDealCount} historical losses — treat scores as directional, not statistically rigorous.</span>
          )}
        </p>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="p-8 text-center text-muted-foreground">Scanning active pipeline...</div>
        ) : deals.length === 0 ? (
          <Empty>
            <EmptyHeader>
              <EmptyMedia variant="icon"><ShieldAlert className="h-5 w-5" /></EmptyMedia>
              <EmptyTitle>No elevated loss risk detected</EmptyTitle>
              <EmptyDescription>No active deal currently matches a pattern that has fired on a past loss.</EmptyDescription>
            </EmptyHeader>
          </Empty>
        ) : (
          <div className="rounded-md border divide-y divide-border">
            {deals.map((d) => (
              <Link
                key={d.dealId}
                href={`/deals/${d.dealId}`}
                className="group flex items-center gap-3 px-4 py-3 hover:bg-muted/50 transition-colors"
              >
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium group-hover:underline">{d.dealName}</p>
                  <p className="truncate text-xs text-muted-foreground">{d.accountName}</p>
                  <div className="flex gap-1.5 flex-wrap mt-1.5">
                    {d.matchedPatterns.slice(0, 3).map((p) => (
                      <Badge key={p.code} variant="outline" className="text-xs font-mono">
                        {p.code}
                      </Badge>
                    ))}
                  </div>
                </div>
                <span className={`font-mono text-lg font-bold tabular-nums ${scoreColor(d.score)}`}>
                  {d.score}
                </span>
                <ArrowUpRight className="h-3.5 w-3.5 shrink-0 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100" />
              </Link>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
