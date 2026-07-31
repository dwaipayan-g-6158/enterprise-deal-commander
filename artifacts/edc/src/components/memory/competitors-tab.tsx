import { useGetCompetitorIntel } from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Empty, EmptyHeader, EmptyMedia, EmptyTitle, EmptyDescription } from "@/components/ui/empty";
import { Swords, TriangleAlert } from "lucide-react";
import { money } from "@/lib/format";

interface CompetitorIntel {
  name: string;
  encounterCount: number;
  winRatePct: number;
  topLossCategory: string | null;
  avgTcv: number;
  lowConfidence: boolean;
}

export function CompetitorsTab() {
  const { data, isLoading, isError } = useGetCompetitorIntel();
  const competitors = (data?.data ?? []) as CompetitorIntel[];

  if (isLoading) return <Skeleton className="h-48 w-full" />;

  if (isError) {
    return (
      <Empty>
        <EmptyHeader>
          <EmptyMedia variant="icon"><TriangleAlert className="h-5 w-5" /></EmptyMedia>
          <EmptyTitle>Couldn't load competitor intelligence</EmptyTitle>
          <EmptyDescription>Something went wrong reaching Deal Memory. Try refreshing the page.</EmptyDescription>
        </EmptyHeader>
      </Empty>
    );
  }

  if (competitors.length === 0) {
    return (
      <Empty>
        <EmptyHeader>
          <EmptyMedia variant="icon"><Swords className="h-5 w-5" /></EmptyMedia>
          <EmptyTitle>Not enough data yet</EmptyTitle>
          <EmptyDescription>Competitor intelligence appears once an archived deal records a competitor.</EmptyDescription>
        </EmptyHeader>
      </Empty>
    );
  }

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
      {competitors.map((c) => (
        <Card key={c.name}>
          <CardHeader>
            <CardTitle className="text-lg flex items-center justify-between gap-2">
              <span>{c.name}</span>
              <span className="flex items-center gap-2">
                <span className="text-sm font-mono text-muted-foreground">{c.encounterCount} encounters</span>
                {c.lowConfidence && (
                  <Badge variant="outline" className="text-xs text-muted-foreground">low confidence</Badge>
                )}
              </span>
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div>
              <div className="flex justify-between text-sm mb-1">
                <span className="text-muted-foreground">Win rate against</span>
                <span className="font-mono">{c.winRatePct}%</span>
              </div>
              <Progress value={c.winRatePct} className={c.lowConfidence ? "opacity-50" : undefined} />
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">Avg. deal size when faced</span>
              <span className="font-mono">{money(c.avgTcv)}</span>
            </div>
            {c.topLossCategory && (
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Top loss reason</span>
                <span className="capitalize">{c.topLossCategory}</span>
              </div>
            )}
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
