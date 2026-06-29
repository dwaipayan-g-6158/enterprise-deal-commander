import { useGetCompetitiveAnalytics } from "@workspace/api-client-react";
import { useLocation } from "wouter";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Empty, EmptyHeader, EmptyMedia, EmptyTitle, EmptyDescription } from "@/components/ui/empty";
import { Swords, ArrowRight } from "lucide-react";

interface CompetitorRow {
  name: string;
  encounters: number;
  wins: number;
  losses: number;
  winRatePct: number | null;
}

// Widget 11 — Competitive Landscape (compact). Top competitors by encounters
// with historical win rates; deep-links to full competitive intelligence.
export function CompetitiveSummary() {
  const { data, isLoading } = useGetCompetitiveAnalytics();
  const [, navigate] = useLocation();
  const comps = ((data?.data as { competitors?: CompetitorRow[] })?.competitors ?? []).slice(0, 4);
  const maxEnc = comps.reduce((m, c) => Math.max(m, c.encounters), 0) || 1;

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <Swords className="h-4 w-4 text-primary" /> Competitive
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
          <Skeleton className="h-32 w-full" />
        ) : comps.length === 0 ? (
          <Empty>
            <EmptyHeader>
              <EmptyMedia variant="icon">
                <Swords className="h-5 w-5" />
              </EmptyMedia>
              <EmptyTitle>No competitor encounters yet</EmptyTitle>
              <EmptyDescription>Log competitors on a deal to see win rates.</EmptyDescription>
            </EmptyHeader>
          </Empty>
        ) : (
          <div className="space-y-2.5">
            {comps.map((c) => (
              <div key={c.name}>
                <div className="flex items-center justify-between text-sm">
                  <span className="font-medium">{c.name}</span>
                  <span className="font-mono text-xs text-muted-foreground">
                    {c.encounters} deal{c.encounters === 1 ? "" : "s"}
                    {c.winRatePct != null && ` · ${c.winRatePct}% win`}
                  </span>
                </div>
                <div className="mt-1 h-2 w-full overflow-hidden rounded-full bg-muted">
                  <div
                    className="h-full rounded-full bg-primary"
                    style={{ width: `${Math.max(6, (c.encounters / maxEnc) * 100)}%` }}
                  />
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
