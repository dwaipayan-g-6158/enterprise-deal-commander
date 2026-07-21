import { useGetDealScore } from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";

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
  if (!score) return <p className="text-muted-foreground">No score yet — check back once there's more deal data to work with.</p>;

  const breakdown = (score.breakdown ?? []) as unknown as Factor[];
  const sorted = [...breakdown].sort((a, b) => b.contribution - a.contribution);
  const maxContribution = sorted.reduce(
    (max, f) => Math.max(max, f.contribution),
    0,
  );
  const totalContribution = sorted.reduce((sum, f) => sum + f.contribution, 0);

  return (
    <TooltipProvider delayDuration={150}>
      <Card>
        <CardHeader>
          <CardTitle className="text-lg flex items-center justify-between">
            <span>Predictive Close Score</span>
            <Badge className={confidenceColor[score.confidence] ?? ""}>
              {score.confidence} CONFIDENCE
            </Badge>
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Headline score */}
          <div className="flex items-end gap-4">
            <div className="flex items-baseline gap-1">
              <span className="text-5xl font-bold font-mono tabular-nums leading-none">
                {score.score}
              </span>
              <span className="text-lg font-medium text-muted-foreground">
                / 100
              </span>
            </div>
            <div className="flex-1 pb-1">
              <div
                className="h-2.5 w-full rounded-full bg-muted overflow-hidden"
                role="progressbar"
                aria-valuenow={score.score}
                aria-valuemin={0}
                aria-valuemax={100}
              >
                <div
                  className="h-full rounded-full bg-primary transition-all"
                  style={{ width: `${score.score}%` }}
                />
              </div>
              <p className="text-xs text-muted-foreground mt-1.5">
                Probability of close
              </p>
            </div>
          </div>

          {/* Factor breakdown */}
          <div className="space-y-3">
            <div className="flex items-baseline justify-between">
              <p className="text-xs uppercase tracking-wider text-muted-foreground font-medium">
                Factor Breakdown
              </p>
              <p className="text-[11px] text-muted-foreground">
                Ranked by contribution
              </p>
            </div>

            {sorted.length === 0 ? (
              <p className="text-sm text-muted-foreground py-2">
                No contributing factors yet.
              </p>
            ) : (
              <>
                {/* Column header */}
                <div className="grid grid-cols-[1fr_auto] items-center gap-x-4 px-0.5 text-[10px] uppercase tracking-wider text-muted-foreground/70">
                  <span>Factor</span>
                  <span className="text-right tabular-nums w-24">
                    Contribution
                  </span>
                </div>

                <ul className="space-y-3">
                  {sorted.map((f) => {
                    const barWidth =
                      maxContribution > 0
                        ? Math.max((f.contribution / maxContribution) * 100, 2)
                        : 0;
                    const share =
                      totalContribution > 0
                        ? Math.round((f.contribution / totalContribution) * 100)
                        : 0;
                    return (
                      <li key={f.featureId} className="space-y-1.5">
                        <div className="grid grid-cols-[1fr_auto] items-center gap-x-4">
                          {/* Description + weight chip */}
                          <div className="flex items-center gap-2 min-w-0">
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <span className="text-sm font-medium leading-snug truncate cursor-default">
                                  {f.description}
                                </span>
                              </TooltipTrigger>
                              <TooltipContent className="max-w-xs">
                                <p className="font-medium">{f.description}</p>
                                <p className="mt-1 text-primary-foreground/80">
                                  Raw score {f.rawScore}% · weight ×{f.weight} ·{" "}
                                  {share}% of total
                                </p>
                              </TooltipContent>
                            </Tooltip>
                            <span className="shrink-0 rounded-sm bg-muted px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground tabular-nums">
                              ×{f.weight}
                            </span>
                          </div>
                          {/* Contribution value */}
                          <span className="w-24 text-right font-mono text-sm font-semibold tabular-nums text-primary">
                            +{f.contribution}
                          </span>
                        </div>

                        {/* Contribution bar with embedded raw-score marker */}
                        <div className="flex items-center gap-2">
                          <div className="relative flex-1 h-2 rounded-full bg-muted overflow-hidden">
                            <div
                              className="h-full rounded-full bg-primary transition-all"
                              style={{ width: `${barWidth}%` }}
                            />
                          </div>
                          <span className="w-10 text-right font-mono text-[11px] tabular-nums text-muted-foreground">
                            {f.rawScore}%
                          </span>
                        </div>
                      </li>
                    );
                  })}
                </ul>
              </>
            )}
          </div>
        </CardContent>
      </Card>
    </TooltipProvider>
  );
}
