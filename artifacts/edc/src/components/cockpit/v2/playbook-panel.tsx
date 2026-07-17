import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  useGetDealPlaybook,
  useSetPlaybookStepState,
  useReopenPlaybookStep,
} from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { CheckCircle2, Circle, SkipForward, Ban, Clock, RotateCcw } from "lucide-react";

type StepStatus = "completed" | "skipped" | "blocked";

interface Step {
  id: string;
  stepOrder: number;
  stepName: string;
  recommendedAction: string;
  expectedDurationDays: number | null;
  isCritical: boolean;
}

interface StepStateView {
  status: StepStatus;
  note: string | null;
  actionedAt: string;
}

interface PlaybookPayload {
  assignmentId: string;
  status: string;
  currentStepId: string | null;
  playbook: { playbookName: string; steps: Step[] } | null;
  stepStates: Record<string, StepStateView>;
  overdueStepIds: string[];
  progressPct: number;
  adherencePct: number | null;
}

export function PlaybookPanel({ dealId }: { dealId: string }) {
  const qc = useQueryClient();
  const q = useGetDealPlaybook(dealId);
  const setState = useSetPlaybookStepState();
  const reopen = useReopenPlaybookStep();
  const [notes, setNotes] = useState<Record<string, string>>({});
  const busy = setState.isPending || reopen.isPending;

  if (q.isLoading) return <Skeleton className="h-48 w-full" />;

  const payload = q.data?.data as PlaybookPayload | null | undefined;

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

  const { assignmentId, playbook, currentStepId, stepStates, overdueStepIds } = payload;
  const overdue = new Set(overdueStepIds);
  // A step action is a live signal: it re-scores the deal and shifts risk/health
  // (server-side, via the playbook.step_changed event). Refresh every query scoped
  // to this deal so the Score, Alerts, and Trajectory tabs update without a reload.
  const invalidate = () =>
    qc.invalidateQueries({
      predicate: (query) =>
        Array.isArray(query.queryKey) && JSON.stringify(query.queryKey).includes(dealId),
    });

  const act = async (stepId: string, status: StepStatus) => {
    const note = notes[stepId]?.trim();
    await setState.mutateAsync({
      assignmentId,
      stepId,
      data: { status, note: note ? note : null } as never,
    });
    await invalidate();
  };
  const doReopen = async (stepId: string) => {
    await reopen.mutateAsync({ assignmentId, stepId });
    await invalidate();
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg flex items-center justify-between gap-2">
          <span>{playbook.playbookName}</span>
          <span className="flex items-center gap-2">
            {overdue.size > 0 && (
              <Badge variant="destructive" className="text-xs gap-1">
                <Clock className="h-3 w-3" />
                {overdue.size} overdue
              </Badge>
            )}
            <Badge variant="secondary">{payload.progressPct}% complete</Badge>
            <Badge variant="secondary">{payload.status}</Badge>
          </span>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {[...playbook.steps]
          .sort((a, b) => a.stepOrder - b.stepOrder)
          .map((s) => {
            const state = stepStates[s.id];
            const status = state?.status ?? null;
            const isCurrent = s.id === currentStepId;
            const isOverdue = overdue.has(s.id) && status !== "completed" && status !== "skipped";
            const terminal = status === "completed" || status === "skipped";

            return (
              <div
                key={s.id}
                className={`flex items-start gap-3 rounded-md border p-3 ${
                  isCurrent ? "ring-1 ring-primary/40 bg-muted/40" : ""
                } ${status === "blocked" ? "border-amber-500/40" : ""}`}
              >
                {status === "completed" ? (
                  <CheckCircle2 className="h-5 w-5 text-emerald-500 shrink-0 mt-0.5" />
                ) : status === "skipped" ? (
                  <SkipForward className="h-5 w-5 text-muted-foreground shrink-0 mt-0.5" />
                ) : status === "blocked" ? (
                  <Ban className="h-5 w-5 text-amber-500 shrink-0 mt-0.5" />
                ) : (
                  <Circle className="h-5 w-5 text-muted-foreground shrink-0 mt-0.5" />
                )}

                <div className="flex-1 space-y-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span
                      className={`font-medium text-sm ${
                        status === "skipped" ? "line-through text-muted-foreground" : ""
                      }`}
                    >
                      {s.stepName}
                    </span>
                    {s.isCritical && (
                      <Badge variant="destructive" className="text-xs">Critical</Badge>
                    )}
                    {status === "skipped" && (
                      <Badge variant="outline" className="text-xs">Skipped</Badge>
                    )}
                    {status === "blocked" && (
                      <Badge className="text-xs bg-amber-500 hover:bg-amber-500">Blocked</Badge>
                    )}
                    {isOverdue && (
                      <Badge variant="destructive" className="text-xs gap-1">
                        <Clock className="h-3 w-3" />
                        Overdue
                      </Badge>
                    )}
                  </div>
                  <p className="text-xs text-muted-foreground">{s.recommendedAction}</p>
                  {state?.note && (
                    <p className="text-xs italic text-muted-foreground">Note: {state.note}</p>
                  )}

                  {!terminal && (
                    <Input
                      value={notes[s.id] ?? ""}
                      onChange={(e) => setNotes((n) => ({ ...n, [s.id]: e.target.value }))}
                      placeholder="Add a note (optional)…"
                      className="h-7 text-xs mt-1"
                    />
                  )}

                  <div className="flex gap-2 mt-2 flex-wrap">
                    {!terminal && (
                      <>
                        <Button size="sm" disabled={busy} onClick={() => act(s.id, "completed")}>
                          Complete
                        </Button>
                        <Button size="sm" variant="outline" disabled={busy} onClick={() => act(s.id, "skipped")}>
                          Skip
                        </Button>
                        {status !== "blocked" && (
                          <Button
                            size="sm"
                            variant="outline"
                            disabled={busy}
                            className="text-amber-600 border-amber-500/40"
                            onClick={() => act(s.id, "blocked")}
                          >
                            Block
                          </Button>
                        )}
                      </>
                    )}
                    {status && (
                      <Button
                        size="sm"
                        variant="ghost"
                        disabled={busy}
                        className="gap-1 text-muted-foreground"
                        onClick={() => doReopen(s.id)}
                      >
                        <RotateCcw className="h-3 w-3" />
                        Reopen
                      </Button>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
      </CardContent>
    </Card>
  );
}
