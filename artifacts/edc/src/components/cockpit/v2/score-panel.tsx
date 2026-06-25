import { useGetDealScore } from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";

interface Factor {
  featureId: string;
  description: string;
  rawScore: number;
  weight: number;
  contribution: number;
}

const confidenceColor: Record<string, string> = {
  HIGH: "bg-emerald-500 text-white",
  MEDIUM: "bg-amber-500 text-white",
  LOW: "bg-muted text-muted-foreground",
};

export function ScorePanel({ dealId }: { dealId: string }) {
  const { data, isLoading } = useGetDealScore(dealId);
  const score = data?.data;

  if (isLoading) return <Skeleton className="h-64 w-full" />;
  if (!score) return <p className="text-muted-foreground">No score available.</p>;

  const breakdown = (score.breakdown ?? []) as unknown as Factor[];
  const sorted = [...breakdown].sort((a, b) => b.contribution - a.contribution);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg flex items-center justify-between">
          <span>Predictive Close Score</span>
          <Badge className={confidenceColor[score.confidence] ?? ""}>{score.confidence}</Badge>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="flex items-center gap-4">
          <div className="text-5xl font-bold font-mono">{score.score}</div>
          <div className="flex-1">
            <div className="h-3 w-full rounded-full bg-muted overflow-hidden">
              <div
                className="h-full bg-primary"
                style={{ width: `${score.score}%` }}
              />
            </div>
            <p className="text-xs text-muted-foreground mt-1">/ 100 probability of close</p>
          </div>
        </div>

        <div className="space-y-2">
          <p className="text-xs uppercase tracking-wider text-muted-foreground font-medium">
            Factor Breakdown
          </p>
          {sorted.map((f) => (
            <div key={f.featureId} className="flex items-center gap-3 text-sm">
              <span className="w-44 truncate" title={f.description}>
                {f.description}
              </span>
              <div className="flex-1 h-2 rounded-full bg-muted overflow-hidden">
                <div className="h-full bg-primary/70" style={{ width: `${f.rawScore}%` }} />
              </div>
              <span className="font-mono text-xs w-10 text-right">{f.rawScore}%</span>
              <span className="font-mono text-xs w-14 text-right text-muted-foreground">
                +{f.contribution}
              </span>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
