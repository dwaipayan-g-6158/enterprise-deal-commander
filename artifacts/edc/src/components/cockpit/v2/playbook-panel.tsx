import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  useGetPlaybookJourney,
  useStartDealPlaybook,
  useSetPlaybookStepState,
  useReopenPlaybookStep,
} from "@workspace/api-client-react";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Progress } from "@/components/ui/progress";
import { Spinner } from "@/components/ui/spinner";
import { InfoTooltip } from "@/components/ui/info-tooltip";
import {
  Empty,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
  EmptyDescription,
} from "@/components/ui/empty";
import {
  Item,
  ItemGroup,
  ItemMedia,
  ItemContent,
  ItemTitle,
  ItemDescription,
  ItemActions,
  ItemSeparator,
} from "@/components/ui/item";
import { Collapsible, CollapsibleContent } from "@/components/ui/collapsible";
import {
  CheckCircle2,
  Circle,
  PlayCircle,
  AlertTriangle,
  SkipForward,
  Ban,
  Clock,
  RotateCcw,
  ChevronDown,
  ChevronsDownUp,
  ChevronsUpDown,
  BookOpen,
} from "lucide-react";

type StepStatus = "completed" | "skipped" | "blocked";
type JourneyStatus = "not_started" | "active" | "completed";

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

interface JourneyEntry {
  playbookId: string;
  playbookName: string;
  applicableStage: string | null;
  isCurrentStage: boolean;
  assignmentId: string | null;
  currentStepId: string | null;
  status: JourneyStatus;
  totalSteps: number;
  completedCount: number;
  progressPct: number;
  adherencePct: number | null;
  criticalGaps: number;
  overdueCount: number;
  steps: Step[];
  stepStates: Record<string, StepStateView>;
  overdueStepIds: string[];
}

// Reused by every started stage's expanded row — parameterized by assignment
// instead of a single fixed one, since a deal can now hold several concurrent
// assignments (one per stage it has touched).
function StepList({
  assignmentId,
  currentStepId,
  steps,
  stepStates,
  overdueStepIds,
  onChanged,
}: {
  assignmentId: string;
  currentStepId: string | null;
  steps: Step[];
  stepStates: Record<string, StepStateView>;
  overdueStepIds: string[];
  onChanged: () => Promise<void>;
}) {
  const { toast } = useToast();
  const setState = useSetPlaybookStepState();
  const reopen = useReopenPlaybookStep();
  const [notes, setNotes] = useState<Record<string, string>>({});
  // Which single button is actually in flight (`${stepId}:${status|"reopen"}`) —
  // used to show a Spinner only on the clicked button, while `busy` still
  // disables every button in this step list (both mutation hooks are shared
  // instances, so a second concurrent call from the same instance isn't safe).
  const [pendingKey, setPendingKey] = useState<string | null>(null);
  const busy = setState.isPending || reopen.isPending;
  const overdue = new Set(overdueStepIds);

  // Success is silent — the row updates instantly, so a confirmation toast is
  // redundant noise. Only failures surface a toast.
  const act = async (stepId: string, status: StepStatus) => {
    const note = notes[stepId]?.trim();
    setPendingKey(`${stepId}:${status}`);
    try {
      await setState.mutateAsync({
        assignmentId,
        stepId,
        data: { status, note: note ? note : null } as never,
      });
      await onChanged();
    } catch {
      toast({ title: "Failed to update step", variant: "destructive" });
    } finally {
      setPendingKey(null);
    }
  };
  const doReopen = async (stepId: string) => {
    setPendingKey(`${stepId}:reopen`);
    try {
      await reopen.mutateAsync({ assignmentId, stepId });
      await onChanged();
    } catch {
      toast({ title: "Failed to reopen step", variant: "destructive" });
    } finally {
      setPendingKey(null);
    }
  };

  return (
    <div className="space-y-3">
      {[...steps]
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
                        {pendingKey === `${s.id}:completed` && <Spinner className="mr-1" />}
                        Complete
                      </Button>
                      <Button size="sm" variant="outline" disabled={busy} onClick={() => act(s.id, "skipped")}>
                        {pendingKey === `${s.id}:skipped` && <Spinner className="mr-1" />}
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
                          {pendingKey === `${s.id}:blocked` && <Spinner className="mr-1" />}
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
                      {pendingKey === `${s.id}:reopen` ? (
                        <Spinner className="h-3 w-3" />
                      ) : (
                        <RotateCcw className="h-3 w-3" />
                      )}
                      Reopen
                    </Button>
                  )}
                </div>
              </div>
            </div>
          );
        })}
    </div>
  );
}

function statusBadge(entry: JourneyEntry) {
  if (entry.status === "completed") {
    return <Badge className="text-xs bg-emerald-500 hover:bg-emerald-500">Completed</Badge>;
  }
  if (entry.status === "active") {
    return (
      <Badge variant="secondary" className="text-xs">
        {entry.isCurrentStage ? "In progress" : "In progress (not current)"}
      </Badge>
    );
  }
  return <Badge variant="outline" className="text-xs">Not started</Badge>;
}

function stageIcon(entry: JourneyEntry) {
  if (entry.status === "completed") return <CheckCircle2 className="h-5 w-5 text-emerald-500" />;
  if (entry.status === "active" && entry.isCurrentStage) return <PlayCircle className="h-5 w-5 text-primary" />;
  if (entry.status === "active") return <AlertTriangle className="h-5 w-5 text-amber-500" />;
  return <Circle className="h-5 w-5 text-muted-foreground" />;
}

export function PlaybookPanel({ dealId }: { dealId: string }) {
  const { toast } = useToast();
  const qc = useQueryClient();
  const q = useGetPlaybookJourney(dealId);
  const start = useStartDealPlaybook();
  const [manualOpen, setManualOpen] = useState<Record<string, boolean>>({});
  const [startingId, setStartingId] = useState<string | null>(null);

  // A step action or a manual start is a live signal: it re-scores the deal
  // and shifts risk/health (server-side). Refresh every query scoped to this
  // deal so the Score, Alerts, and Trajectory tabs update without a reload.
  const invalidate = () =>
    qc.invalidateQueries({
      predicate: (query) =>
        Array.isArray(query.queryKey) && JSON.stringify(query.queryKey).includes(dealId),
    });

  if (q.isLoading) return <Skeleton className="h-48 w-full" />;

  const journey = ((q.data?.data as { journey: JourneyEntry[] } | undefined)?.journey ?? []) as JourneyEntry[];

  if (journey.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Playbook Journey</CardTitle>
        </CardHeader>
        <CardContent>
          <Empty>
            <EmptyHeader>
              <EmptyMedia variant="icon">
                <BookOpen />
              </EmptyMedia>
              <EmptyTitle>No Playbooks Configured</EmptyTitle>
              <EmptyDescription>
                No playbooks are configured for this deal's stages yet.
              </EmptyDescription>
            </EmptyHeader>
          </Empty>
        </CardContent>
      </Card>
    );
  }

  const totalSteps = journey.reduce((sum, e) => sum + e.totalSteps, 0);
  const completedSteps = journey.reduce((sum, e) => sum + e.completedCount, 0);
  const playbooksComplete = journey.filter((e) => e.status === "completed").length;
  const overallPct = totalSteps > 0 ? Math.round((completedSteps / totalSteps) * 100) : 0;

  const isOpen = (entry: JourneyEntry) => manualOpen[entry.playbookId] ?? entry.isCurrentStage;
  const toggle = (entry: JourneyEntry) =>
    setManualOpen((m) => ({ ...m, [entry.playbookId]: !isOpen(entry) }));

  // Only started rows have steps to reveal — they drive the Expand/Collapse-all control.
  const startedEntries = journey.filter((e) => e.assignmentId);
  const allOpen = startedEntries.length > 0 && startedEntries.every(isOpen);
  const toggleAll = () => {
    const next = !allOpen;
    setManualOpen((m) => {
      const copy = { ...m };
      for (const e of startedEntries) copy[e.playbookId] = next;
      return copy;
    });
  };

  const handleStart = async (playbookId: string) => {
    setStartingId(playbookId);
    try {
      await start.mutateAsync({ dealId, playbookId });
      setManualOpen((m) => ({ ...m, [playbookId]: true }));
      await invalidate();
    } catch {
      toast({ title: "Failed to start playbook", variant: "destructive" });
    } finally {
      setStartingId(null);
    }
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between gap-2">
          <CardTitle className="text-lg flex items-center gap-1.5">
            Playbook Journey
            <InfoTooltip>
              A playbook stays &ldquo;in progress&rdquo; even after the deal moves past its stage —
              a deal keeps every stage playbook it has touched. &ldquo;Overdue&rdquo; means a step
              is past its expected duration plus the grace window.
            </InfoTooltip>
          </CardTitle>
          {startedEntries.length > 0 && (
            <Button
              variant="ghost"
              size="sm"
              className="text-muted-foreground shrink-0"
              onClick={toggleAll}
            >
              {allOpen ? (
                <ChevronsDownUp className="h-4 w-4 mr-1" />
              ) : (
                <ChevronsUpDown className="h-4 w-4 mr-1" />
              )}
              {allOpen ? "Collapse all" : "Expand all"}
            </Button>
          )}
        </div>
        <div className="space-y-1.5 pt-1">
          <Progress value={overallPct} />
          <p className="text-xs text-muted-foreground">
            {completedSteps}/{totalSteps} steps · {playbooksComplete}/{journey.length} playbooks complete
          </p>
        </div>
      </CardHeader>
      <CardContent>
        <ItemGroup>
          {journey.map((entry, idx) => {
            const open = isOpen(entry);
            // Only started rows have steps to reveal, so only they toggle. The
            // whole header row is the target (not just a tiny chevron), so
            // expanding/collapsing is easy to initiate — click anywhere or
            // focus + Enter/Space.
            const canToggle = entry.assignmentId != null;
            const contentId = `playbook-steps-${entry.playbookId}`;
            return (
              <div key={entry.playbookId}>
                <Collapsible open={open} onOpenChange={() => toggle(entry)}>
                  <Item
                    variant={entry.isCurrentStage ? "outline" : "default"}
                    {...(canToggle
                      ? {
                          role: "button",
                          tabIndex: 0,
                          "aria-expanded": open,
                          "aria-controls": contentId,
                          "aria-label": open ? "Collapse steps" : "Expand steps",
                          onClick: () => toggle(entry),
                          onKeyDown: (e: React.KeyboardEvent) => {
                            if (e.key === "Enter" || e.key === " ") {
                              e.preventDefault();
                              toggle(entry);
                            }
                          },
                          className:
                            "cursor-pointer transition-colors hover:bg-muted/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                        }
                      : {})}
                  >
                    <ItemMedia variant="icon">{stageIcon(entry)}</ItemMedia>
                    <ItemContent>
                      <ItemTitle className="flex-wrap">
                        <span>{entry.applicableStage} · {entry.playbookName}</span>
                        {statusBadge(entry)}
                        {entry.isCurrentStage && (
                          <Badge variant="outline" className="text-xs">Current stage</Badge>
                        )}
                        {entry.overdueCount > 0 && (
                          <Badge variant="destructive" className="text-xs gap-1">
                            <Clock className="h-3 w-3" />
                            {entry.overdueCount} overdue
                          </Badge>
                        )}
                      </ItemTitle>
                      <ItemDescription>
                        {entry.status === "not_started"
                          ? `Not started yet · ${entry.totalSteps} steps`
                          : `${entry.completedCount}/${entry.totalSteps} steps complete`}
                      </ItemDescription>
                    </ItemContent>
                    <ItemActions>
                      {entry.status === "not_started" ? (
                        <Button
                          size="sm"
                          variant="outline"
                          disabled={start.isPending}
                          onClick={() => handleStart(entry.playbookId)}
                        >
                          {startingId === entry.playbookId && <Spinner className="mr-1" />}
                          Start playbook
                        </Button>
                      ) : (
                        // Decorative indicator — the whole row above is the toggle.
                        <ChevronDown
                          aria-hidden
                          className={cn(
                            "h-4 w-4 shrink-0 text-muted-foreground transition-transform duration-200",
                            open && "rotate-180",
                          )}
                        />
                      )}
                    </ItemActions>
                  </Item>
                  {entry.assignmentId && (
                    <CollapsibleContent
                      id={contentId}
                      className="overflow-hidden data-[state=closed]:animate-collapsible-up data-[state=open]:animate-collapsible-down"
                    >
                      <div className="motion-safe:animate-in motion-safe:fade-in motion-safe:duration-300 pl-11 pr-1 pb-4 pt-1">
                        <StepList
                          assignmentId={entry.assignmentId}
                          currentStepId={entry.currentStepId}
                          steps={entry.steps}
                          stepStates={entry.stepStates}
                          overdueStepIds={entry.overdueStepIds}
                          onChanged={invalidate}
                        />
                      </div>
                    </CollapsibleContent>
                  )}
                </Collapsible>
                {idx < journey.length - 1 && <ItemSeparator />}
              </div>
            );
          })}
        </ItemGroup>
      </CardContent>
    </Card>
  );
}
