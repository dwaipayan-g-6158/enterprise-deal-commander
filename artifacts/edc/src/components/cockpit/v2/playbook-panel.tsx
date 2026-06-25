import { useQueryClient } from "@tanstack/react-query";
import {
  useGetDealPlaybook,
  useCompletePlaybookStep,
  useSkipPlaybookStep,
} from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { CheckCircle2, Circle, ArrowRight } from "lucide-react";

interface Step {
  id: string;
  stepOrder: number;
  stepName: string;
  recommendedAction: string;
  expectedDurationDays: number | null;
  isCritical: boolean;
}

export function PlaybookPanel({ dealId }: { dealId: string }) {
  const qc = useQueryClient();
  const q = useGetDealPlaybook(dealId);
  const complete = useCompletePlaybookStep();
  const skip = useSkipPlaybookStep();

  if (q.isLoading) return <Skeleton className="h-48 w-full" />;

  const payload = q.data?.data as
    | {
        assignmentId: string;
        status: string;
        currentStepId: string | null;
        playbook: { playbookName: string; steps: Step[] } | null;
        completedStepIds: string[];
      }
    | null
    | undefined;

  if (!payload || !payload.playbook) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Active Playbook</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">
            No playbook assigned. A playbook auto-assigns when the deal enters a stage that has one configured.
          </p>
        </CardContent>
      </Card>
    );
  }

  const { assignmentId, playbook, currentStepId, completedStepIds } = payload;
  const done = new Set(completedStepIds);
  const invalidate = () => qc.invalidateQueries({ queryKey: q.queryKey });

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg flex items-center justify-between">
          <span>{playbook.playbookName}</span>
          <Badge variant="secondary">{payload.status}</Badge>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {[...playbook.steps]
          .sort((a, b) => a.stepOrder - b.stepOrder)
          .map((s) => {
            const isDone = done.has(s.id);
            const isCurrent = s.id === currentStepId;
            return (
              <div
                key={s.id}
                className={`flex items-start gap-3 rounded-md border p-3 ${isCurrent ? "ring-1 ring-primary/40 bg-muted/40" : ""}`}
              >
                {isDone ? (
                  <CheckCircle2 className="h-5 w-5 text-emerald-500 shrink-0 mt-0.5" />
                ) : (
                  <Circle className="h-5 w-5 text-muted-foreground shrink-0 mt-0.5" />
                )}
                <div className="flex-1">
                  <div className="flex items-center gap-2">
                    <span className="font-medium text-sm">{s.stepName}</span>
                    {s.isCritical && <Badge variant="destructive" className="text-xs">Critical</Badge>}
                    {isCurrent && <ArrowRight className="h-4 w-4 text-primary" />}
                  </div>
                  <p className="text-xs text-muted-foreground">{s.recommendedAction}</p>
                  {isCurrent && (
                    <div className="flex gap-2 mt-2">
                      <Button
                        size="sm"
                        onClick={async () => {
                          await complete.mutateAsync({ assignmentId, stepId: s.id, data: {} as never });
                          await invalidate();
                        }}
                      >
                        Complete
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={async () => {
                          await skip.mutateAsync({ assignmentId, stepId: s.id, data: { skip_reason: "Skipped" } as never });
                          await invalidate();
                        }}
                      >
                        Skip
                      </Button>
                    </div>
                  )}
                </div>
              </div>
            );
          })}
      </CardContent>
    </Card>
  );
}
